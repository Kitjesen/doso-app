import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '77777777-7777-4777-8777-777777777777';
const SESSION_ID = '88888888-8888-4888-8888-888888888888';
const VERIFIED_FACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PENDING_FACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function session(label, lifetimeSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return {
    access_token: `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      aal: 'aal1', amr: [{ method: 'password', timestamp: 1_760_000_000 }],
      aud: 'authenticated', exp: expiresAt, role: 'authenticated',
      session_id: SESSION_ID, sub: USER_ID,
    })}.${base64url({ fixture: label })}`,
    expires_at: expiresAt,
    expires_in: lifetimeSeconds,
    refresh_token: `fixture-refresh-${label}`,
    token_type: 'bearer',
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'mfa-cleanup@fixture.invalid',
      app_metadata: {}, user_metadata: {}, identities: [], factors: [], created_at: '2026-10-16T00:00:00.000Z' },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function loadModules(client) {
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const code = ts.transpileModule(readFileSync(new URL(relative, ROOT), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, Error, Promise, Set, RegExp, console,
      atob, TextDecoder,
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: () => client };
        if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected production dependency: ${name}`);
      },
    }, { filename: relative });
    return module.exports;
  };
  return { coordinator: load('src/services/authSessionOperation.ts'), identity: load('src/services/authSessionIdentity.ts'), mfa: load('src/services/mfaService.ts') };
}

function fixture() {
  const initial = session('initial', 1);
  const refreshed = session('refreshed', 3_600);
  const verifiedFactor = { id: VERIFIED_FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'known' };
  const pendingFactor = { id: PENDING_FACTOR_ID, factor_type: 'totp', status: 'unverified', friendly_name: 'pending' };
  const user = { ...refreshed.user, factors: [verifiedFactor, pendingFactor] };
  const storageKey = `mfa-cleanup-sdk-${Date.now()}`;
  const values = new Map([[storageKey, JSON.stringify(initial)]]);
  const deleteEntered = deferred();
  const releaseDelete = deferred();
  const requests = [];
  let modules;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
  const fetchStub = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method ?? (typeof input === 'string' ? 'GET' : (input.method ?? 'GET'));
    const snapshot = modules.coordinator.getAuthSessionOperationSnapshot();
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      requests.push({ kind: 'refresh', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      return jsonResponse(refreshed);
    }
    if (url.includes('/auth/v1/user')) {
      requests.push({ kind: 'user', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      return jsonResponse(user);
    }
    if (url.includes(`/auth/v1/factors/${PENDING_FACTOR_ID}`) && method === 'DELETE') {
      requests.push({ kind: 'delete-pending', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      deleteEntered.resolve();
      await releaseDelete.promise;
      return jsonResponse({ id: PENDING_FACTOR_ID });
    }
    requests.push({ kind: 'unexpected', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null });
    throw new Error(`Unexpected MFA cleanup request: ${method} ${url}`);
  };
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storage, storageKey },
    global: { fetch: fetchStub },
  });
  modules = loadModules(client);
  return { client, deleteEntered, releaseDelete, modules, requests, storageKey, values, refreshed, pendingFactorId: PENDING_FACTOR_ID, verifiedFactorId: VERIFIED_FACTOR_ID };
}

test('MFA cleanup confirms identity, deletes only pending factor, and retains write lease through DELETE', { timeout: 10_000 }, async t => {
  const state = fixture();
  const { client, modules: { coordinator, identity, mfa } } = state;
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  let cleanup;
  try {
    assert.equal((await client.auth.initialize()).error, null);
    const expected = identity.readAuthSessionIdentity(state.refreshed);
    cleanup = mfa.cancelUnverifiedTotpEnrollment(state.pendingFactorId, expected);
    await state.deleteEntered.promise;
    assert.equal(coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    await assert.rejects(coordinator.runAuthSessionOperation(async () => 'competing mutation'), coordinator.isAuthSessionOperationBusyError);
    state.releaseDelete.resolve();
    await cleanup;
    assert.deepEqual(state.requests.map(request => request.kind), ['refresh', 'user', 'delete-pending']);
    assert.equal(state.requests.every(request => request.busy), true);
    assert.equal(state.requests.every(request => request.operationKind === 'factor-write'), true);
    assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    assert.equal(state.requests.some(request => request.kind === 'unexpected'), false);
  } finally {
    state.releaseDelete.resolve();
    if (cleanup) await cleanup.catch(() => {});
    await client.auth.stopAutoRefresh().catch(() => {});
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`request_kinds=${state.requests.map(request => request.kind).join(',')}`);
    t.diagnostic(`all_requests_started_busy=${state.requests.every(request => request.busy)}`);
    t.diagnostic(`coordinator_busy_after_cleanup=${coordinator.getAuthSessionOperationSnapshot().busy}`);
    t.diagnostic('sdk_cleanup_completed=true');
  }
});

test('MFA cleanup rejects missing identity before any SDK read or factor delete', { timeout: 10_000 }, async t => {
  const state = fixture();
  const { client, modules: { coordinator, mfa } } = state;
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  try {
    state.values.set(state.storageKey, JSON.stringify(state.refreshed));
    assert.equal((await client.auth.initialize()).error, null);
    await assert.rejects(mfa.cancelUnverifiedTotpEnrollment(state.pendingFactorId, null), error => error.name === 'MfaCleanupIdentityError');
    assert.deepEqual(state.requests, []);
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    state.releaseDelete.resolve();
    await client.auth.stopAutoRefresh().catch(() => {});
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`request_count=${state.requests.length}`);
    t.diagnostic('sdk_cleanup_completed=true');
  }
});
