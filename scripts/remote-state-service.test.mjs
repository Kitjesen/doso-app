import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url), USER = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';
const status = { state: { kind: 'CMS_STATE_KIND_STANDING', transition: 'CMS_TRANSITION_KIND_NONE' },
  control: { owner: 'CONTROL_OWNER_NONE', motorOutputEnabled: false, criticalMotorFault: false }, transport: 'mtls' };
const at = '2026-11-03T00:00:00.000Z';
const reading = { observedAt: at, receivedAt: at, status };
const state = (patch = {}) => ({ deviceId: DEVICE, simulated: false, enabled: false, revision: 1, activation: 'off', reachable: null,
  fresh: false, lastSeenAt: null, latest: null, lastSuccess: null, ...patch });
const response = (value = state(), status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function fixture({ userId = USER, fetchImpl, sessionRead, configured = true } = {}) {
  const modules = new Map(), calls = [], timers = new Map();
  let session = userId ? { user: { id: userId }, access_token: 'synthetic-state-token' } : null;
  let sessionReads = 0;
  const client = { auth: { getSession() { sessionReads++; return sessionRead ? sessionRead() : Promise.resolve({ data: { session }, error: null }); } } };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, AbortController, Promise, Set,
      setTimeout(callback, ms) { const id = {}; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id),
      fetch: (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : Promise.resolve(response()); },
      require(name) {
        if (name === './authSessionOperation') return load('src/services/authSessionOperation.ts');
        if (name === './supabaseClient') return { getSupabaseClient: () => client, supabaseConfig: configured ? { url: 'https://state.example.test', publishableKey: 'synthetic-public-key' } : {} };
        throw new Error(`Unexpected dependency ${name}`);
      },
    }, { filename: path });
    return module.exports;
  };
  const service = load('src/services/remoteState.ts'), auth = load('src/services/authSessionOperation.ts');
  return { service, auth, calls, get sessionReads() { return sessionReads; }, get timerCount() { return timers.size; },
    rawSwitch(id) { session = id ? { user: { id }, access_token: 'synthetic-state-token' } : null; },
    switch(id) { return auth.runAuthSessionOperation(async () => { session = id ? { user: { id }, access_token: 'synthetic-state-token' } : null; }); },
    timeout() { assert.equal(timers.size, 1); for (const [id, timer] of timers) { timers.delete(id); timer.callback(); } },
  };
}
const errorCode = (expected, unknown = false) => error => error.code === expected && error.outcomeMayBeUnknown === unknown && !error.message.includes('synthetic-state-token');

test('GET returns canonical off state through authenticated read only and strips internal data', async () => {
  const f = fixture({ fetchImpl: async () => response(state({ authorizationEpoch: 99, reportingSessionId: 'private' })) });
  const value = await f.service.getRemoteState(USER, DEVICE);
  assert.equal(value.enabled, false); assert.equal(value.revision, 1); assert.equal(value.authorizationEpoch, undefined); assert.equal(value.reportingSessionId, undefined);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], `https://state.example.test/functions/v1/remote-state?deviceId=${DEVICE}`);
  const init = f.calls[0][1]; assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, 'Bearer synthetic-state-token'); assert.equal(init.headers.apikey, 'synthetic-public-key');
  assert.equal(f.sessionReads, 2); assert.equal(f.timerCount, 0);
});

test('POST sends only explicit device choice and current revision', async () => {
  const f = fixture({ fetchImpl: async () => response(state({ enabled: true, revision: 2, activation: 'enabling' })) });
  const value = await f.service.setRemoteState(USER, DEVICE, true, 1);
  assert.equal(value.activation, 'enabling'); assert.equal(value.enabled, true);
  assert.equal(f.calls[0][0], 'https://state.example.test/functions/v1/remote-state');
  assert.equal(f.calls[0][1].method, 'POST'); assert.deepEqual(JSON.parse(f.calls[0][1].body), { deviceId: DEVICE, enabled: true, revision: 1 });
});

test('absent account, foreign account, busy Auth and invalid request stop before network', async () => {
  for (const userId of [null, OTHER]) { const f = fixture({ userId }); await assert.rejects(f.service.getRemoteState(USER, DEVICE), errorCode('unauthorized')); assert.equal(f.calls.length, 0); }
  const f = fixture(), hold = deferred(), foreign = f.auth.runAuthSessionOperation(() => hold.promise);
  await assert.rejects(f.service.getRemoteState(USER, DEVICE), f.auth.AuthSessionOperationBusyError); assert.equal(f.sessionReads, 0);
  hold.resolve(); await foreign;
  for (const revision of [-1, 0]) await assert.rejects(f.service.setRemoteState(USER, DEVICE, true, revision), errorCode('invalid_request'));
  assert.equal(f.calls.length, 0);
});

test('account changes cancel old data and final identity check catches out-of-band changes', async () => {
  for (const coordinated of [true, false]) {
    const reply = deferred(), f = fixture({ fetchImpl: () => reply.promise });
    const pending = f.service.getRemoteState(USER, DEVICE); await settle();
    if (coordinated) await f.switch(OTHER); else f.rawSwitch(OTHER);
    reply.resolve(response()); await assert.rejects(pending, errorCode('unauthorized')); assert.equal(f.calls.length, 1);
  }
});

test('timeout retains pending SDK work and cannot dispatch a late request', async () => {
  const session = deferred(), f = fixture({ sessionRead: () => session.promise });
  const pending = f.service.getRemoteState(USER, DEVICE); await settle(); f.timeout();
  await assert.rejects(pending, errorCode('timeout')); assert.equal(f.auth.getAuthSessionOperationSnapshot().busy, true);
  session.resolve({ data: { session: { user: { id: USER }, access_token: 'synthetic-state-token' } }, error: null });
  await settle(); assert.equal(f.auth.getAuthSessionOperationSnapshot().busy, false); assert.equal(f.calls.length, 0);
});

test('CAS errors are definite while interrupted or invalid POST results require reconciliation', async () => {
  for (const [code, expected] of [['remote_state_revision_conflict', 'revision_conflict'], ['remote_state_revision_exhausted', 'revision_exhausted']]) {
    const f = fixture({ fetchImpl: async () => response({ error: { code } }, 409) });
    await assert.rejects(f.service.setRemoteState(USER, DEVICE, true, 1), errorCode(expected)); assert.equal(f.calls.length, 1);
  }
  for (const fetchImpl of [async () => { throw new Error('synthetic-state-token'); }, async () => response({}, 503), async () => response({})]) {
    const f = fixture({ fetchImpl }); await assert.rejects(f.service.setRemoteState(USER, DEVICE, true, 1), error => error.outcomeMayBeUnknown && !error.message.includes('synthetic-state-token'));
    assert.equal(f.calls.length, 1);
  }
  const f = fixture({ fetchImpl: () => new Promise(() => {}) }), controller = new AbortController();
  const pending = f.service.setRemoteState(USER, DEVICE, true, 1, { signal: controller.signal }); await settle(); controller.abort();
  await assert.rejects(pending, errorCode('cancelled', true));
});

test('successful and error readings preserve actual timestamps and unknown enums without inventing state', async () => {
  const latest = { observedAt: '2026-11-03T00:00:04.000Z', receivedAt: '2026-11-03T00:00:04.000Z', error: 'upstream_unavailable' };
  const f = fixture({ fetchImpl: async () => response(state({ enabled: true, activation: 'on', reachable: true, latest, lastSuccess: reading })) });
  const value = await f.service.getRemoteState(USER, DEVICE);
  assert.equal(value.latest.error, 'upstream_unavailable'); assert.equal(value.lastSuccess.observedAt, at);
  assert.equal(value.lastSuccess.status.transport, undefined);
  const futureStatus = { ...status, state: { kind: 'CMS_STATE_KIND_FUTURE', transition: 'CMS_TRANSITION_KIND_FUTURE' } };
  const future = fixture({ fetchImpl: async () => response(state({ latest: { ...reading, status: futureStatus } })) });
  assert.equal((await future.service.getRemoteState(USER, DEVICE)).latest.status.state.kind, 'CMS_STATE_KIND_FUTURE');
});

test('malformed status, device mismatches, ambiguous outcomes and invalid dates are rejected', async () => {
  for (const patch of [{ deviceId: OTHER }, { revision: 0 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { activation: 'yes' },
    { latest: { ...reading, error: 'upstream_unavailable' } }, { lastSuccess: { observedAt: at, receivedAt: at, error: 'upstream_unavailable' } },
    { latest: { ...reading, status: { ...status, control: { ...status.control, motorOutputEnabled: 'false' } } } },
    { latest: { ...reading, observedAt: '2026-02-30T00:00:00.000Z' } }]) {
    const f = fixture({ fetchImpl: async () => response(state(patch)) }); await assert.rejects(f.service.getRemoteState(USER, DEVICE), errorCode('invalid_response'));
  }
  const f = fixture({ fetchImpl: async () => response({}, 403) }); await assert.rejects(f.service.getRemoteState(USER, DEVICE), errorCode('unauthorized'));
});

test('optional WGS84 location preserves the fix timestamp and rejects invalid fixes', async () => {
  const location = { lat: 31.2304, lon: 121.4737, fixType: 4, accuracyM: null, observedAt: at };
  for (const p of [location, { ...location, lat: -90, lon: 180, fixType: 8, accuracyM: 100000 }]) {
    const f = fixture({ fetchImpl: async () => response(state({ latest: { ...reading, status: { ...status, location: p } } })) });
    const value = await f.service.getRemoteState(USER, DEVICE);
    assert.equal(value.latest.status.location.observedAt, at); assert.equal(value.latest.status.location.lat, p.lat);
    assert.equal(value.latest.status.location.accuracyM, p.accuracyM);
  }
  for (const p of [null, {}, { ...location, lat: 91 }, { ...location, lon: -181 }, { ...location, lat: '31' },
    { ...location, fixType: 0 }, { ...location, fixType: 9 }, { ...location, fixType: 1.5 },
    { ...location, accuracyM: -1 }, { ...location, accuracyM: 100001 }, { ...location, accuracyM: '1' },
    { ...location, accuracyM: undefined }, { ...location, observedAt: '2026-02-30T00:00:00.000Z' }]) {
    const f = fixture({ fetchImpl: async () => response(state({ latest: { ...reading, status: { ...status, location: p } } })) });
    await assert.rejects(f.service.getRemoteState(USER, DEVICE), errorCode('invalid_response'));
  }
});

test('simulation identity comes from authenticated backend and cannot be omitted or mistyped', async () => {
  const f = fixture({ fetchImpl: async () => response(state({ simulated: true })) });
  assert.equal((await f.service.getRemoteState(USER, DEVICE)).simulated, true);
  for (const simulated of [undefined, 'true', null]) {
    const invalid = fixture({ fetchImpl: async () => response(state({ simulated })) });
    await assert.rejects(invalid.service.getRemoteState(USER, DEVICE), errorCode('invalid_response'));
  }
});
