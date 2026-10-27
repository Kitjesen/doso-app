import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '77777777-7777-4777-8777-777777777777';
const SESSION_ID = '88888888-8888-4888-8888-888888888888';
const FACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function b64(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function makeSession(label, lifetime) {
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'mfa-enroll@fixture.invalid', app_metadata: {}, user_metadata: {}, identities: [], factors: [], created_at: '2026-10-16T00:00:00.000Z' };
  return { access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ aal: 'aal1', amr: [{ method: 'password', timestamp: 1_760_000_000 }], aud: 'authenticated', exp, role: 'authenticated', session_id: SESSION_ID, sub: USER_ID })}.${b64({ fixture: label })}`, expires_at: exp, expires_in: lifetime, refresh_token: `refresh-${label}`, token_type: 'bearer', user };
}
function response(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }
function loadModules(client) {
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} }; modules.set(relative, module);
    const code = ts.transpileModule(readFileSync(new URL(relative, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, Set, RegExp, console, atob, TextDecoder,
      require(name) { if (name === './supabaseClient') return { getSupabaseClient: () => client }; if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`); throw new Error(`Unexpected dependency ${name}`); } }, { filename: relative });
    return module.exports;
  };
  return { coordinator: load('src/services/authSessionOperation.ts'), identity: load('src/services/authSessionIdentity.ts'), mfa: load('src/services/mfaService.ts') };
}
function fixture() {
  const fresh = makeSession('fresh', 3_600); const expiring = makeSession('expiring', 1); const refreshed = makeSession('refreshed', 3_600);
  const storageKey = `mfa-enroll-${Date.now()}`; const values = new Map([[storageKey, JSON.stringify(fresh)]]);
  const postEntered = deferred(); const releasePost = deferred(); const requests = []; let modules; let afterRefresh = null;
  const storage = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); }, async removeItem(key) { values.delete(key); } };
  const fetchStub = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url; const method = init?.method ?? (typeof input === 'string' ? 'GET' : input.method ?? 'GET'); const snapshot = modules.coordinator.getAuthSessionOperationSnapshot();
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) { requests.push({ kind: 'refresh', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null }); afterRefresh?.(); return response(refreshed); }
    if (url.endsWith('/auth/v1/factors') && method === 'POST') { requests.push({ kind: 'enroll', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null }); postEntered.resolve(); await releasePost.promise; return response({ id: FACTOR_ID, type: 'totp', status: 'unverified', totp: { qr_code: '<svg viewBox="0 0 1 1"></svg>', secret: 'FIXTURESECRET', uri: 'otpauth://totp/DOSO:fixture?secret=FIXTURESECRET' } }); }
    requests.push({ kind: 'unexpected', method, busy: snapshot.busy, operationKind: snapshot.kind ?? null }); throw new Error(`Unexpected enrollment request: ${method} ${url}`);
  };
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storage, storageKey }, global: { fetch: fetchStub } });
  modules = loadModules(client); return { client, expiring, fresh, modules, postEntered, releasePost, requests, refreshed, storageKey, values, setAfterRefresh(callback) { afterRefresh = callback; } };
}
async function assertBusy(coordinator) { await assert.rejects(coordinator.runAuthSessionOperation(async () => 'competing'), coordinator.isAuthSessionOperationBusyError); }

test('MFA enrollment holds factor-write lease through POST and identity recheck', { timeout: 10_000 }, async t => {
  const state = fixture(); const { client, modules: { coordinator, identity, mfa } } = state; const { data: { subscription } } = client.auth.onAuthStateChange(() => {}); let operation;
  try {
    assert.equal((await client.auth.initialize()).error, null); state.values.set(state.storageKey, JSON.stringify(state.expiring));
    const expected = identity.readAuthSessionIdentity(state.refreshed); operation = mfa.enrollTotp(expected, () => true);
    await state.postEntered.promise; assert.equal(coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write'); await assertBusy(coordinator); state.releasePost.resolve();
    const enrollment = await operation; assert.equal(enrollment.factorId, FACTOR_ID); assert.equal(enrollment.qrCode, 'data:image/svg+xml;utf-8,<svg viewBox="0 0 1 1"></svg>'); assert.deepEqual(state.requests.map(x => x.kind), ['refresh', 'enroll']); assert.equal(state.requests.every(x => x.busy && x.operationKind === 'factor-write'), true); assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
  } finally { state.releasePost.resolve(); if (operation) await operation.catch(() => {}); await client.auth.stopAutoRefresh().catch(() => {}); subscription.unsubscribe(); await client.auth.dispose(); t.diagnostic(`request_kinds=${state.requests.map(x => x.kind).join(',')}`); t.diagnostic(`coordinator_busy_after_cleanup=${coordinator.getAuthSessionOperationSnapshot().busy}`); t.diagnostic('sdk_cleanup_completed=true'); }
});

test('MFA enrollment callback cancellation prevents POST after identity read', { timeout: 10_000 }, async t => {
  const state = fixture(); const { client, modules: { coordinator, identity, mfa } } = state; const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  try { assert.equal((await client.auth.initialize()).error, null); state.values.set(state.storageKey, JSON.stringify(state.expiring)); let current = true; state.setAfterRefresh(() => { current = false; }); const expected = identity.readAuthSessionIdentity(state.refreshed); state.releasePost.resolve(); const operation = mfa.enrollTotp(expected, () => current); await assert.rejects(operation, error => error.name === 'MfaEnrollmentInactiveError'); assert.deepEqual(state.requests.map(x => x.kind), ['refresh']); assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false); } finally { state.releasePost.resolve(); await client.auth.stopAutoRefresh().catch(() => {}); subscription.unsubscribe(); await client.auth.dispose(); t.diagnostic(`request_count=${state.requests.length}`); t.diagnostic('sdk_cleanup_completed=true'); }
});
