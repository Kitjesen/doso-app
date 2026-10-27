import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const USER_A = '11111111-1111-4111-8111-111111111111';
const SESSION_A = '22222222-2222-4222-8222-222222222222';
const USER_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jwt(sessionId = SESSION_A) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ session_id: sessionId })}.fixture`;
}

function loadTypeScriptModule(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    TextDecoder,
    Uint8Array,
    atob,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

function loadFence() {
  const identity = loadTypeScriptModule('../src/services/authSessionIdentity.ts');
  return loadTypeScriptModule('../src/services/sessionIngestionFence.ts', {
    './authSessionIdentity': identity,
  });
}

function loadService({ session, getSession, getSessionError = null, invoke, rpc, signOut, clock } = {}) {
  const identity = loadTypeScriptModule('../src/services/authSessionIdentity.ts');
  const fence = loadTypeScriptModule('../src/services/sessionIngestionFence.ts', {
    './authSessionIdentity': identity,
  });
  const coordinator = loadTypeScriptModule('../src/services/authSessionOperation.ts');
  const events = [];
  const client = {
    auth: {
      async getSession() {
        events.push('getSession');
        if (getSession) return getSession();
        return { data: { session }, error: getSessionError };
      },
      async signOut(options) {
        events.push(`signOut:${options.scope}`);
        return signOut ? signOut(options) : { error: null };
      },
    },
    functions: {
      async invoke(_name, options) {
        events.push(`invoke:${options.body.action}`);
        return invoke ? invoke(options.body, options) : { data: { revoked: 1 }, error: null };
      },
    },
    rpc(name, params) {
      const headers = {};
      let execution;
      const builder = {
        setHeader(header, value) { headers[header] = value; return builder; },
        then(resolve, reject) {
          execution ??= Promise.resolve().then(() => {
            events.push(`rpc:${name}`);
            return rpc ? rpc(name, params, headers) : { data: 1, error: null };
          });
          return execution.then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const source = readFileSync(new URL('../src/services/sessionService.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, TextDecoder, Uint8Array, atob,
    process: { env: {} },
    performance: clock ? { now: () => clock.now } : performance,
    setTimeout: clock?.setTimeout ?? setTimeout,
    clearTimeout: clock?.clearTimeout ?? clearTimeout,
    require(name) {
      if (name === './authSessionIdentity') return identity;
      if (name === './sessionIngestionFence') return fence;
      if (name === './authSessionOperation') return coordinator;
      if (name === './supabaseClient') return { getSupabaseClient: () => client };
      if (name === 'react-native') return { Platform: { OS: 'android', Version: 35 } };
      if (name === 'expo-secure-store') return { getItemAsync: async () => '44444444-4444-4444-8444-444444444444', setItemAsync: async () => {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { service: module.exports, fence, events, coordinator };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    get now() { return now; },
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

async function waitFor(predicate) {
  for (let count = 0; count < 50; count += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('fixture boundary not reached');
}

test('a revocation ticket blocks only its valid session identity while pending', () => {
  const fence = loadFence();
  const session = { user: { id: USER_A }, access_token: jwt() };
  assert.equal(fence.getSessionIngestionBlock(session), null);
  assert.equal(fence.getSessionIngestionBlock({ user: { id: USER_A }, access_token: 'not-a-jwt' }), 'unknown');

  const ticket = fence.beginSessionRevocation({ userId: USER_A, sessionId: SESSION_A });
  assert.equal(fence.getSessionIngestionBlock(session), 'pending');
  fence.releaseSessionRevocation(ticket);
  assert.equal(fence.getSessionIngestionBlock(session), null);
});

test('confirmed all-session revocation captures identity before dispatch and leaves it revoked', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const state = loadService({ session });
  assert.equal(await state.service.revokeAllTerminals('fixture'), 1);
  assert.deepEqual(state.events, ['getSession', 'invoke:revoke_all', 'getSession', 'signOut:local']);
  assert.equal(state.fence.getSessionIngestionBlock(session), 'revoked');
});

test('all six revocation entries fail typed before dispatch when identity is unavailable', async () => {
  const entries = [
    service => service.revokeAccountTerminal('33333333-3333-4333-8333-333333333333'),
    service => service.revokeCurrentTerminal(),
    service => service.revokeOtherTerminals(),
    service => service.revokeAllTerminals(),
    service => service.revokeCurrentTerminalWithoutAudit(),
    service => service.revokeAllTerminalsWithoutAudit(),
  ];
  for (const entry of entries) {
    const state = loadService({ session: { user: { id: USER_A }, access_token: 'invalid' } });
    await assert.rejects(entry(state.service), error => state.service.isAccountSessionOutcomeError(error)
      && error.outcome === 'identity-unavailable');
    assert.deepEqual(state.events, ['getSession']);
  }
});

test('a dispatched timeout becomes sticky unknown and a late acknowledgement cannot clear it', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const request = deferred();
  const clock = fakeClock();
  const state = loadService({ session, clock, invoke: () => request.promise });
  const outcome = state.service.revokeAllTerminals().catch(error => error);
  await waitFor(() => state.events.includes('invoke:revoke_all'));
  assert.equal(state.fence.getSessionIngestionBlock(session), 'pending');
  clock.advance(15_000);
  assert.equal((await outcome).outcome, 'revocation-unconfirmed');
  assert.equal(state.fence.getSessionIngestionBlock(session), 'unknown');
  request.resolve({ data: { revoked: 1 }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.fence.getSessionIngestionBlock(session), 'unknown');
  assert.deepEqual(state.events, ['getSession', 'invoke:revoke_all']);
});

test('current-terminal identity recheck deadline releases its ticket but retains SDK exclusion until the read settles', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const identityRead = deferred();
  const clock = fakeClock();
  let sessionReads = 0;
  const state = loadService({
    clock,
    getSession: () => {
      sessionReads += 1;
      return sessionReads === 1
        ? { data: { session }, error: null }
        : identityRead.promise;
    },
    invoke: body => body.action === 'list'
      ? { data: { terminals: [{ id: 'current', is_current: true }] }, error: null }
      : { data: { revoked: 1 }, error: null },
  });
  const outcome = state.service.revokeCurrentTerminal().catch(error => error);
  await waitFor(() => sessionReads === 2);
  assert.equal(state.fence.getSessionIngestionBlock(session), 'pending');

  clock.advance(15_000);
  const error = await outcome;
  assert.equal(state.service.isAccountSessionOutcomeError(error), true);
  assert.equal(error.outcome, 'identity-unavailable');
  assert.equal(state.fence.getSessionIngestionBlock(session), null);
  assert.deepEqual(state.events, ['getSession', 'invoke:list', 'getSession']);
  await assert.rejects(
    state.coordinator.runAuthSessionOperation(async () => 'must remain excluded'),
    state.coordinator.isAuthSessionOperationBusyError,
  );

  identityRead.resolve({ data: { session }, error: null });
  for (let count = 0; count < 5; count += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await state.coordinator.runAuthSessionOperation(async () => 'idle'), 'idle');
  assert.deepEqual(state.events, ['getSession', 'invoke:list', 'getSession']);
});

test('preflight failure releases pending, while an ordinary dispatched failure is sticky unknown', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const preflight = loadService({
    session,
    invoke: () => ({ data: {}, error: null }),
  });
  await assert.rejects(preflight.service.revokeCurrentTerminal(), /终端列表返回结果无法确认/);
  assert.equal(preflight.fence.getSessionIngestionBlock(session), null);
  assert.deepEqual(preflight.events, ['getSession', 'invoke:list']);

  const dispatched = loadService({
    session,
    invoke: () => ({ data: null, error: new Error('fixture') }),
  });
  await assert.rejects(dispatched.service.revokeAllTerminals(), error => error.outcome === 'revocation-unconfirmed');
  assert.equal(dispatched.fence.getSessionIngestionBlock(session), 'unknown');
});

test('a sticky unknown identity rejects a repeat revocation before another dispatch', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  let attempts = 0;
  const state = loadService({
    session,
    invoke: () => {
      attempts += 1;
      return { data: null, error: new Error('fixture') };
    },
  });
  await assert.rejects(state.service.revokeAllTerminals(), error => error.outcome === 'revocation-unconfirmed');
  await assert.rejects(state.service.revokeAllTerminals(), error => error.outcome === 'revocation-unconfirmed');
  assert.equal(attempts, 1);
  assert.deepEqual(state.events, ['getSession', 'invoke:revoke_all', 'getSession']);
});

test('a revoked identity rejects a repeat revocation before another dispatch', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  let attempts = 0;
  const state = loadService({
    session,
    invoke: () => {
      attempts += 1;
      return { data: { revoked: 1 }, error: null };
    },
  });
  assert.equal(await state.service.revokeAllTerminals(), 1);
  await assert.rejects(state.service.revokeAllTerminals(), error => error.outcome === 'revocation-unconfirmed');
  assert.equal(attempts, 1);
  assert.equal(state.fence.getSessionIngestionBlock(session), 'revoked');
});

test('a different account session can dispatch while the old identity remains unknown', async () => {
  const sessionA = { user: { id: USER_A }, access_token: jwt() };
  const sessionB = { user: { id: USER_B }, access_token: jwt(SESSION_B) };
  let currentSession = sessionA;
  let attempts = 0;
  const state = loadService({
    getSession: () => ({ data: { session: currentSession }, error: null }),
    invoke: () => {
      attempts += 1;
      return attempts === 1
        ? { data: null, error: new Error('fixture') }
        : { data: { revoked: 1 }, error: null };
    },
  });
  await assert.rejects(state.service.revokeAllTerminals(), error => error.outcome === 'revocation-unconfirmed');
  currentSession = sessionB;
  assert.equal(await state.service.revokeOtherTerminals(), 1);
  assert.equal(attempts, 2);
  assert.equal(state.fence.getSessionIngestionBlock(sessionA), 'unknown');
  assert.equal(state.fence.getSessionIngestionBlock(sessionB), null);
});

test('identity-scoped state cannot block or overwrite a different account session', () => {
  const fence = loadFence();
  const sessionA = { user: { id: USER_A }, access_token: jwt() };
  const sessionB = { user: { id: USER_B }, access_token: jwt(SESSION_B) };
  const ticketA = fence.beginSessionRevocation({ userId: USER_A, sessionId: SESSION_A });
  const ticketB = fence.beginSessionRevocation({ userId: USER_B, sessionId: SESSION_B });
  fence.markSessionRevoked(ticketA);
  fence.releaseSessionRevocation(ticketB);
  assert.equal(fence.getSessionIngestionBlock(sessionA), 'revoked');
  assert.equal(fence.getSessionIngestionBlock(sessionB), null);
});

test('confirmed other-session cleanup releases only its pending ticket', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const state = loadService({ session });
  assert.equal(await state.service.revokeOtherTerminals(), 1);
  assert.equal(state.fence.getSessionIngestionBlock(session), null);
  assert.deepEqual(state.events, ['getSession', 'invoke:revoke_others', 'getSession', 'signOut:others']);
});

test('native cleanup failure after confirmed dispatch leaves the old identity unknown', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const state = loadService({ session, signOut: () => ({ error: new Error('fixture') }) });
  await assert.rejects(state.service.revokeAllTerminals(), error => error.outcome === 'session-cleanup-unconfirmed');
  assert.equal(state.fence.getSessionIngestionBlock(session), 'unknown');
});

test('late account A completion never signs out a newly established account B session', async () => {
  const sessionA = { user: { id: USER_A }, access_token: jwt() };
  const sessionB = { user: { id: USER_B }, access_token: jwt(SESSION_B) };
  let reads = 0;
  const state = loadService({
    getSession: () => ({ data: { session: reads++ === 0 ? sessionA : sessionB }, error: null }),
  });
  assert.equal(await state.service.revokeAllTerminals(), 1);
  assert.deepEqual(state.events, ['getSession', 'invoke:revoke_all', 'getSession']);
  assert.equal(state.fence.getSessionIngestionBlock(sessionA), 'revoked');
  assert.equal(state.fence.getSessionIngestionBlock(sessionB), null);
});

test('specific revoke releases only when the target is explicitly proven non-current', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const terminalId = '33333333-3333-4333-8333-333333333333';
  for (const [currentFlag, expected] of [[false, null], [undefined, 'unknown']]) {
    const state = loadService({
      session,
      invoke: body => body.action === 'list'
        ? { data: { terminals: [{ id: terminalId, ...(currentFlag === undefined ? {} : { is_current: currentFlag }) }] }, error: null }
        : { data: { revoked: 1 }, error: null },
    });
    assert.equal(await state.service.revokeAccountTerminal(terminalId), 1);
    assert.equal(state.fence.getSessionIngestionBlock(session), expected);
    assert.deepEqual(state.events, ['getSession', 'invoke:list', 'getSession', 'invoke:revoke_one']);
  }
});

test('specific list, mutation, and emergency RPC pin the captured authorization', async () => {
  const session = { user: { id: USER_A }, access_token: jwt() };
  const terminalId = '33333333-3333-4333-8333-333333333333';
  const edgeAuthorization = [];
  const edge = loadService({
    session,
    invoke: (body, options) => {
      edgeAuthorization.push(options.headers?.Authorization === `Bearer ${session.access_token}`);
      return body.action === 'list'
        ? { data: { terminals: [{ id: terminalId, is_current: false }] }, error: null }
        : { data: { revoked: 1 }, error: null };
    },
  });
  assert.equal(await edge.service.revokeAccountTerminal(terminalId), 1);
  assert.deepEqual(edgeAuthorization, [true, true]);

  let rpcAuthorizationMatches = false;
  const emergency = loadService({
    session,
    rpc: (_name, _params, headers) => {
      rpcAuthorizationMatches = headers.Authorization === `Bearer ${session.access_token}`;
      return { data: 1, error: null };
    },
  });
  assert.equal(await emergency.service.revokeAllTerminalsWithoutAudit(), 1);
  assert.equal(rpcAuthorizationMatches, true);
});

test('registration deadline retains exclusion until the actual SDK request settles', async () => {
  const request = deferred(), clock = fakeClock();
  const state = loadService({ clock, invoke: () => request.promise });
  const outcome = state.service.registerCurrentTerminal().catch(error => error);
  await waitFor(() => state.events.includes('invoke:register'));
  clock.advance(15_000);
  assert.equal((await outcome).outcome, 'registration-unconfirmed');
  await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competitor'),
    state.coordinator.isAuthSessionOperationBusyError);
  request.resolve({ data: { terminal: { id: 'fixture-terminal' } }, error: null });
  await waitFor(() => !state.coordinator.getAuthSessionOperationSnapshot().busy);
  assert.equal(await state.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
  assert.deepEqual(state.events, ['invoke:register']);
});

test('a stale preparation guard rejects registration before SDK dispatch', async () => {
  const state = loadService();
  await assert.rejects(state.service.registerCurrentTerminal(undefined, () => false), error => error.outcome === 'operation-busy');
  assert.deepEqual(state.events, []);
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
});
