// Real public Auth SDK + production service/coordinator/fetch. All storage,
// sessions, JWTs and HTTP are synthetic; no native or live account inputs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthClient } from '@supabase/supabase-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const ROOT = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const KEY = 'sb_publishable_fixture';
let sequence = 0;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function session(label, lifetime = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: USER, session_id: SESSION, exp: expiresAt, fixture: label })}.synthetic`,
    refresh_token: `synthetic-refresh-${label}`, expires_at: expiresAt, expires_in: lifetime, token_type: 'bearer',
    user: { id: USER, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function loadProduction(getClient) {
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const code = ts.transpileModule(readFileSync(new URL(relative, ROOT), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, URL, URLSearchParams,
      Promise, Set, Map, RegExp, console, process: { env: {} },
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: getClient };
        if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected reauthentication fixture dependency: ${name}`);
      },
    }, { filename: relative });
    return module.exports;
  };
  return { service: load('src/services/authService.ts'), coordinator: load('src/services/authSessionOperation.ts') };
}

async function fixture({ timeoutMs = 5000 } = {}) {
  const storageKey = `synthetic-reauth-${++sequence}`;
  const initial = session('initial'), expired = session('expired', -60), rotated = session('rotated');
  const values = new Map([[storageKey, JSON.stringify(initial)]]);
  const observations = { getterReads: 0, storageReads: 0, storageWrites: 0, requests: [] };
  let auth, externalOwner = null, handler = null;
  const production = loadProduction(() => { observations.getterReads++; return { auth }; });
  const fetchStub = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const snapshot = production.coordinator.getAuthSessionOperationSnapshot();
    const phase = url.pathname === '/auth/v1/token' ? 'refresh'
      : url.pathname === '/auth/v1/reauthenticate' ? 'nonce' : 'unexpected';
    assert.notEqual(phase, 'unexpected', 'every fixture HTTP path is explicitly intercepted');
    observations.requests.push({ phase, busy: snapshot.busy, kind: snapshot.kind,
      externalOwner: externalOwner !== null && snapshot.owner === externalOwner });
    const headers = new Headers(init?.headers);
    if (phase === 'refresh') {
      assert.equal(init.method, 'POST');
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      assert.equal(JSON.parse(init.body).refresh_token, expired.refresh_token);
    } else {
      assert.equal(init.method, 'GET');
      const current = JSON.parse(values.get(storageKey));
      assert.equal(headers.get('authorization'), `Bearer ${current.access_token}`);
    }
    return handler ? handler({ phase, input, init, rotated }) : jsonResponse(phase === 'refresh' ? rotated : {});
  };
  auth = new AuthClient({ url: 'https://reauth-fixture.supabase.co/auth/v1',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, storageKey,
    autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce',
    storage: { getItem: async key => { observations.storageReads++; return values.get(key) ?? null; },
      setItem: async (key, value) => { observations.storageWrites++; values.set(key, value); },
      removeItem: async key => { values.delete(key); } },
    fetch: createAuthRequestFetch(fetchStub, { timeoutMs }),
  });
  const initialized = await auth.initialize();
  assert.equal(initialized.error, null);
  assert.equal(observations.requests.length, 0, 'healthy initialization must not be the tested refresh path');
  // No onAuthStateChange listener is installed. Only the tested reauthenticate
  // call can read this later expired snapshot and trigger refresh.
  observations.storageReads = 0; observations.storageWrites = 0;
  return { ...production, auth, observations, values, storageKey, expired, rotated,
    expire() { values.set(storageKey, JSON.stringify(expired)); },
    clearSession() { values.delete(storageKey); },
    setExternalOwner(owner) { externalOwner = owner; },
    setHandler(value) { handler = value; },
    async dispose() { await auth.dispose(); } };
}

test('busy reauthentication rejects before getter, stored session reads, refresh and nonce dispatch', { timeout: 5000 }, async t => {
  const f = await fixture();
  const hold = deferred(), owner = {};
  f.expire(); f.setExternalOwner(owner);
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  try {
    const outcome = await f.service.sendReauthenticationNonce().then(
      () => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    const rotated = JSON.parse(f.values.get(f.storageKey)).refresh_token === f.rotated.refresh_token;
    t.diagnostic(JSON.stringify({ scenario: 'reauth-busy', outcome: outcome.status, getterReads: f.observations.getterReads,
      storageReads: f.observations.storageReads, storageWrites: f.observations.storageWrites,
      requests: f.observations.requests, storedSessionRotated: rotated,
      externalOwnerStillBusy: f.coordinator.getAuthSessionOperationSnapshot().owner === owner }));
    assert.equal(outcome.status, 'rejected');
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(f.observations.getterReads + f.observations.storageReads + f.observations.storageWrites, 0);
    assert.deepEqual(f.observations.requests, []);
    assert.equal(rotated, false);
  } finally { hold.resolve(); await existing; await f.dispose(); }
});

test('expired-session reauthentication owns refresh, storage rotation and the nonce request through settlement', { timeout: 5000 }, async t => {
  const f = await fixture();
  const refreshEntered = deferred(), nonceEntered = deferred(), refreshReply = deferred(), nonceReply = deferred();
  f.expire();
  f.setHandler(({ phase }) => {
    if (phase === 'refresh') { refreshEntered.resolve(); return refreshReply.promise; }
    nonceEntered.resolve(); return nonceReply.promise;
  });
  const pending = f.service.sendReauthenticationNonce();
  try {
    await refreshEntered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    assert.equal(f.observations.storageWrites, 0);
    refreshReply.resolve(jsonResponse(f.rotated));
    await nonceEntered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.equal(f.observations.storageWrites, 1);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    assert.deepEqual(f.observations.requests, [
      { phase: 'refresh', busy: true, kind: 'session-write', externalOwner: false },
      { phase: 'nonce', busy: true, kind: 'session-write', externalOwner: false },
    ]);
    nonceReply.resolve(jsonResponse({}));
    assert.equal(await pending, undefined);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    t.diagnostic(JSON.stringify({ scenario: 'reauth-owned-refresh', requests: f.observations.requests,
      storageWrites: f.observations.storageWrites, finalBusy: false }));
  } finally {
    refreshReply.resolve(jsonResponse(f.rotated)); nonceReply.resolve(jsonResponse({}));
    await pending.catch(() => undefined); await f.dispose();
  }
});

test('fresh-session reauthentication sends one owned nonce GET and never refreshes', { timeout: 5000 }, async () => {
  const f = await fixture();
  try {
    await f.service.sendReauthenticationNonce();
    assert.deepEqual(f.observations.requests, [{ phase: 'nonce', busy: true, kind: 'session-write', externalOwner: false }]);
    assert.equal(f.observations.storageWrites, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('nonce timeout settles the actual SDK owner once and ignores a transport that returns after abort', { timeout: 5000 }, async t => {
  const f = await fixture({ timeoutMs: 30 });
  const entered = deferred(), reply = deferred();
  let aborted = false, outcomes = 0;
  f.setHandler(({ phase, init }) => {
    assert.equal(phase, 'nonce');
    init.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    entered.resolve(); return reply.promise;
  });
  const pending = f.service.sendReauthenticationNonce().then(
    () => { outcomes++; return { status: 'fulfilled' }; },
    error => { outcomes++; return { status: 'rejected', error }; });
  try {
    await entered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    const result = await pending;
    assert.equal(result.status, 'rejected');
    assert.equal(result.error.code, 'request_timeout');
    assert.equal(result.error.message, '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。');
    assert.equal(aborted, true);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(await f.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    reply.resolve(jsonResponse({}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(outcomes, 1);
    assert.equal(f.observations.requests.length, 1, 'no automatic second nonce delivery');
    assert.equal(f.observations.storageWrites, 0);
    t.diagnostic(JSON.stringify({ scenario: 'reauth-timeout', aborted, outcomes, nonceRequests: 1,
      noAutomaticRetry: true, ownerReleasedAfterSdkSettlement: true, serverCancellationProved: false }));
  } finally { reply.resolve(jsonResponse({})); await pending; await f.dispose(); }
});

test('nonce response body deadline releases the SDK owner without claiming delivery success', { timeout: 5000 }, async () => {
  const f = await fixture({ timeoutMs: 30 });
  let stream, aborted = false;
  f.setHandler(({ init }) => {
    init.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    return new Response(new ReadableStream({ start(controller) { stream = controller; } }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  try {
    await assert.rejects(f.service.sendReauthenticationNonce(), error => error.code === 'request_timeout');
    assert.equal(aborted, true);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(f.observations.requests.length, 1);
  } finally { stream.enqueue(new TextEncoder().encode('{}')); stream.close(); await f.dispose(); }
});

for (const phase of ['refresh', 'nonce']) {
  test(`${phase} SDK failure rejects without continuing or retrying nonce and releases its owner`, { timeout: 5000 }, async () => {
    const f = await fixture();
    if (phase === 'refresh') f.expire();
    f.setHandler(({ phase: requestPhase }) => {
      assert.equal(requestPhase, phase);
      return jsonResponse({ code: 'fixture_reauthentication_failure', msg: 'Synthetic authentication failure' }, 400);
    });
    try {
      await assert.rejects(f.service.sendReauthenticationNonce(), error => error.name === 'AuthApiError'
        && error.status === 400 && error.code === 'fixture_reauthentication_failure');
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(f.observations.requests.length, 1);
      assert.equal(await f.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    } finally { await f.dispose(); }
  });
}

test('missing session rejects without nonce HTTP and releases the operation', { timeout: 5000 }, async () => {
  const f = await fixture(); f.clearSession();
  try {
    await assert.rejects(f.service.sendReauthenticationNonce(), error => error.name === 'AuthSessionMissingError');
    assert.deepEqual(f.observations.requests, []);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('reauthentication preserves getter/configuration error identity while the getter enters under ownership', async () => {
  for (const name of ['SupabaseConfigurationError', 'Error']) {
    const original = new Error('Synthetic configuration failure'); original.name = name;
    let api, getterBusy = false;
    api = loadProduction(() => { getterBusy = api.coordinator.getAuthSessionOperationSnapshot().busy; throw original; });
    await assert.rejects(api.service.sendReauthenticationNonce(), error => error === original);
    assert.equal(getterBusy, true);
    assert.equal(api.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(await api.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
  }
});

test('reauthentication refresh outage settles the SDK owner without dispatching nonce and shows safe Chinese feedback', { timeout: 5000 }, async t => {
  const originalDateNow = Date.now;
  let fakeNow = originalDateNow(), f, aborted = 0;
  Date.now = () => fakeNow;
  try {
    f = await fixture({ timeoutMs: 20 }); f.expire();
    f.setHandler(({ phase, init }) => {
      assert.equal(phase, 'refresh', 'failed refresh must not proceed to nonce delivery');
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted++;
          fakeNow += aborted === 1 ? 29_200 : 700;
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });
    const result = await f.service.sendReauthenticationNonce().then(
      () => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'reauth-refresh-outage', aborted, requests: f.observations.requests,
      storedSessionPreserved: JSON.parse(f.values.get(f.storageKey)).refresh_token === f.expired.refresh_token,
      finalBusy: f.coordinator.getAuthSessionOperationSnapshot().busy, clockScope: 'synthetic SDK retry-budget compression only' }));
    assert.equal(result.status, 'rejected');
    assert.equal(result.error.message, '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。');
    assert.equal(aborted, 2);
    assert.equal(f.observations.requests.length, 2);
    assert.ok(f.observations.requests.every(request => request.phase === 'refresh' && request.busy && request.kind === 'session-write'));
    assert.equal(f.observations.storageWrites, 0);
    assert.equal(JSON.parse(f.values.get(f.storageKey)).refresh_token, f.expired.refresh_token);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    try { Date.now = originalDateNow; } finally { await f?.dispose(); }
  }
});

test('reauthentication sanitizes only exact retryable transport failure and preserves all other SDK errors', async () => {
  for (const [name, status] of [['AuthRetryableFetchError', 0], ['AuthRetryableFetchError', 500],
    ['AuthRetryableFetchErrorExtra', 0], ['AuthApiError', 400]]) {
    const upstream = { name, status, message: 'synthetic upstream transport details' };
    const api = loadProduction(() => ({ auth: { reauthenticate: async () => ({ data: {}, error: upstream }) } }));
    await assert.rejects(api.service.sendReauthenticationNonce(), error => {
      if (name !== 'AuthRetryableFetchError' || status !== 0) return error === upstream;
      return error instanceof Error && error.message === '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。';
    });
    assert.equal(api.coordinator.getAuthSessionOperationSnapshot().busy, false);
  }
});

test('nonce network rejection after dispatch reports uncertain delivery without an automatic second request', { timeout: 5000 }, async () => {
  const f = await fixture();
  f.setHandler(({ phase }) => {
    assert.equal(phase, 'nonce');
    throw new TypeError('Failed to fetch synthetic nonce request');
  });
  try {
    await assert.rejects(f.service.sendReauthenticationNonce(), error => {
      assert.equal(error.message, '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。');
      return true;
    });
    assert.equal(f.observations.requests.length, 1);
    assert.equal(f.observations.requests[0].phase, 'nonce');
    assert.equal(f.observations.storageWrites, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});
