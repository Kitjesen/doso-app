import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '77777777-7777-4777-8777-777777777777';
const SESSION_ID = '88888888-8888-4888-8888-888888888888';
let fixtureSequence = 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function syntheticSession(label, lifetimeSeconds, assurance = 'aal1') {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mfa-status-sdk@fixture.invalid',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: '2026-10-16T00:00:00.000Z',
  };
  return {
    access_token: `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      aal: assurance,
      amr: [{ method: 'password', timestamp: 1_760_000_000 }],
      aud: 'authenticated',
      exp: expiresAt,
      role: 'authenticated',
      session_id: SESSION_ID,
      sub: USER_ID,
    })}.${base64url({ fixture: label })}`,
    expires_at: expiresAt,
    expires_in: lifetimeSeconds,
    refresh_token: `fixture-refresh-${label}`,
    token_type: 'bearer',
    user,
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function loadProductionModules(client) {
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const url = new URL(relative, ROOT);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      Error,
      Promise,
      Set,
      console,
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: () => client };
        if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected production dependency: ${name}`);
      },
    }, { filename: relative });
    return module.exports;
  };
  return {
    coordinator: load('src/services/authSessionOperation.ts'),
    mfa: load('src/services/mfaService.ts'),
  };
}

function fixture() {
  const initialSession = syntheticSession('initial', 3_600);
  const expiringSession = syntheticSession('expiring', 1);
  const refreshedSession = syntheticSession('refreshed', 3_600);
  const verifiedSession = syntheticSession('verified', 3_600, 'aal2');
  const storageKey = `mfa-status-sdk-${++fixtureSequence}`;
  const values = new Map([[storageKey, JSON.stringify(initialSession)]]);
  const refreshEntered = deferred();
  const releaseRefresh = deferred();
  const userEntered = deferred();
  const releaseUser = deferred();
  const requests = [];
  let unexpectedRequestCount = 0;
  let modules;

  const storage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  const fetchStub = async input => {
    const url = typeof input === 'string' ? input : input.url;
    const snapshot = modules.coordinator.getAuthSessionOperationSnapshot();
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      requests.push({ kind: 'refresh', busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      refreshEntered.resolve();
      await releaseRefresh.promise;
      return jsonResponse(refreshedSession);
    }
    if (url.includes('/auth/v1/user')) {
      requests.push({ kind: 'user', busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      userEntered.resolve();
      await releaseUser.promise;
      return jsonResponse(verifiedSession.user);
    }
    if (url.includes('/factors/') && url.endsWith('/challenge')) {
      requests.push({ kind: 'challenge', busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      return jsonResponse({ id: 'fixture-challenge', type: 'totp', expires_at: 1_760_000_300 });
    }
    if (url.includes('/factors/') && url.endsWith('/verify')) {
      requests.push({ kind: 'verify', busy: snapshot.busy, operationKind: snapshot.kind ?? null });
      return jsonResponse(verifiedSession);
    }
    unexpectedRequestCount += 1;
    throw new Error('Unexpected MFA SDK fixture request');
  };
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
      storageKey,
    },
    global: { fetch: fetchStub },
  });
  modules = loadProductionModules(client);
  return {
    client,
    expiringSession,
    modules,
    refreshEntered,
    releaseRefresh,
    releaseUser,
    requests,
    storageKey,
    unexpectedRequestCount: () => unexpectedRequestCount,
    userEntered,
    values,
  };
}

async function expectCompetingMutationRejected(coordinator) {
  await assert.rejects(
    coordinator.runAuthSessionOperation(async () => 'competing mutation'),
    coordinator.isAuthSessionOperationBusyError,
  );
}

test('standalone MFA status retains one session-read lease through SDK refresh and user lookup', { timeout: 10_000 }, async t => {
  const state = fixture();
  const { client, modules: { coordinator, mfa } } = state;
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  let statusOperation;
  try {
    assert.equal((await client.auth.initialize()).error, null);
    state.values.set(state.storageKey, JSON.stringify(state.expiringSession));

    statusOperation = mfa.getMfaStatus();
    await state.refreshEntered.promise;
    assert.equal(coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    await expectCompetingMutationRejected(coordinator);

    state.releaseRefresh.resolve();
    await state.userEntered.promise;
    assert.equal(coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    await expectCompetingMutationRejected(coordinator);

    state.releaseUser.resolve();
    const status = await statusOperation;
    assert.equal(status.enabled, false);
    assert.equal(status.currentLevel, 'aal1');
    assert.equal(status.nextLevel, 'aal1');
    assert.deepEqual(state.requests.map(request => request.kind).sort(), ['refresh', 'user']);
    assert.equal(state.requests.every(request => request.busy), true);
    assert.equal(state.requests.every(request => request.operationKind === 'session-read'), true);
    assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    assert.equal(state.unexpectedRequestCount(), 0);
  } finally {
    state.releaseRefresh.resolve();
    state.releaseUser.resolve();
    if (statusOperation) await statusOperation.catch(() => {});
    await client.auth.stopAutoRefresh();
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`request_kinds=${state.requests.map(request => request.kind).join(',')}`);
    t.diagnostic(`all_requests_started_busy=${state.requests.every(request => request.busy)}`);
    t.diagnostic(`all_request_kinds_session_read=${state.requests.every(request => request.operationKind === 'session-read')}`);
    t.diagnostic(`unexpected_request_count=${state.unexpectedRequestCount()}`);
    t.diagnostic(`coordinator_busy_after_cleanup=${coordinator.getAuthSessionOperationSnapshot().busy}`);
    t.diagnostic('sdk_cleanup_completed=true');
  }
});

test('MFA verification reuses its write lease through the SDK-backed status read', { timeout: 10_000 }, async t => {
  const state = fixture();
  const { client, modules: { coordinator, mfa } } = state;
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  const transitions = [];
  const unsubscribeCoordinator = coordinator.subscribeAuthSessionOperations(() => {
    const snapshot = coordinator.getAuthSessionOperationSnapshot();
    transitions.push({ busy: snapshot.busy, kind: snapshot.kind ?? null });
  });
  let verification;
  try {
    assert.equal((await client.auth.initialize()).error, null);
    state.releaseRefresh.resolve();

    verification = mfa.verifyTotpFactor('fixture-factor', '123456');
    await state.userEntered.promise;
    const statusReadSnapshot = coordinator.getAuthSessionOperationSnapshot();
    assert.equal(statusReadSnapshot.busy, true);
    assert.equal(statusReadSnapshot.kind, 'session-write');
    await expectCompetingMutationRejected(coordinator);

    state.releaseUser.resolve();
    const status = await verification;
    assert.equal(status.enabled, false);
    assert.equal(status.currentLevel, 'aal2');
    assert.equal(status.nextLevel, 'aal2');
    assert.deepEqual(state.requests.map(request => request.kind), ['challenge', 'verify', 'user']);
    assert.equal(state.requests.every(request => request.busy), true);
    assert.equal(state.requests.every(request => request.operationKind === 'session-write'), true);
    assert.equal(transitions.filter(snapshot => snapshot.busy).length, 1);
    assert.equal(transitions.at(-1)?.busy, false);
    assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    assert.equal(state.unexpectedRequestCount(), 0);
  } finally {
    state.releaseRefresh.resolve();
    state.releaseUser.resolve();
    if (verification) await verification.catch(() => {});
    unsubscribeCoordinator();
    await client.auth.stopAutoRefresh();
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`request_kinds=${state.requests.map(request => request.kind).join(',')}`);
    t.diagnostic(`busy_transition_count=${transitions.filter(snapshot => snapshot.busy).length}`);
    t.diagnostic(`status_read_operation_kind=${state.requests.find(request => request.kind === 'user')?.operationKind ?? 'null'}`);
    t.diagnostic(`unexpected_request_count=${state.unexpectedRequestCount()}`);
    t.diagnostic(`coordinator_busy_after_cleanup=${coordinator.getAuthSessionOperationSnapshot().busy}`);
    t.diagnostic('sdk_cleanup_completed=true');
  }
});
