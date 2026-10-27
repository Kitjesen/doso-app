import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/sessionService.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const TEST_USER_ID = '44444444-4444-4444-8444-444444444444';
const TEST_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const encodeJwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const testSession = {
  user: { id: TEST_USER_ID },
  access_token: `${encodeJwtPart({ alg: 'none' })}.${encodeJwtPart({ session_id: TEST_SESSION_ID })}.fixture`,
};

function loadTypeScriptModule(path, dependencies = {}) {
  const module = { exports: {} };
  const moduleCode = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(moduleCode, {
    module, exports: module.exports, TextDecoder, Uint8Array, atob,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

function loadService(response, { signOutError = null, signOut, invoke, rpc, clock, getSession } = {}) {
  const identityModule = loadTypeScriptModule('../src/services/authSessionIdentity.ts');
  const fenceModule = loadTypeScriptModule('../src/services/sessionIngestionFence.ts', {
    './authSessionIdentity': identityModule,
  });
  const coordinatorModule = loadTypeScriptModule('../src/services/authSessionOperation.ts');
  const signOutScopes = [];
  const invokes = [];
  const rpcs = [];
  const client = {
    functions: { async invoke(name, options) {
      invokes.push({ name, ...options.body });
      if (invoke) return invoke(name, options);
      return { data: typeof response === 'function' ? response(options.body) : response, error: null };
    } },
    auth: {
      async getSession() { return getSession ? getSession() : { data: { session: testSession }, error: null }; },
      async signOut(options) {
        signOutScopes.push(options.scope);
        if (signOut) return signOut(options);
        return { error: signOutError };
      },
    },
    rpc(name, params) {
      const headers = {};
      let execution;
      const builder = {
        setHeader(header, value) { headers[header] = value; return builder; },
        then(resolve, reject) {
          execution ??= Promise.resolve().then(() => {
            rpcs.push({
              name,
              params,
              pinnedToExpectedIdentity: headers.Authorization === `Bearer ${testSession.access_token}`,
            });
            if (rpc) return rpc(name, params, headers);
            return { data: typeof response === 'function' ? response({ action: 'rpc', name }) : response, error: null };
          });
          return execution.then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, TextDecoder, Uint8Array, atob,
    process: { env: {} },
    setTimeout: clock?.setTimeout ?? setTimeout, clearTimeout: clock?.clearTimeout ?? clearTimeout,
    performance: { now: clock ? () => clock.now : () => performance.now() },
    require(name) {
      if (name === './supabaseClient') return { getSupabaseClient: () => client };
      if (name === './authSessionIdentity') return identityModule;
      if (name === './sessionIngestionFence') return fenceModule;
      if (name === './authSessionOperation') return coordinatorModule;
      if (name === 'react-native') return { Platform: { OS: 'android', Version: 35 } };
      if (name === 'expo-secure-store') return {
        getItemAsync: async () => '22222222-2222-4222-8222-222222222222', setItemAsync: async () => {},
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { service: module.exports, invokes, rpcs, signOutScopes };
}

// Drain actual async collaborators rather than assuming a fixed promise depth.
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeClock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    get now() { return now; }, get pending() { return timers.size; },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    elapse(ms) { now += ms; },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

test('Edge revocation timeout is unknown and its late success cannot sign out or retry', async () => {
  const clock = fakeClock(), request = deferred();
  const { service, invokes, signOutScopes, rpcs } = loadService(null, { clock, invoke: () => request.promise });
  let error;
  void service.revokeAllTerminals().catch(value => { error = value; });
  await flush(); clock.advance(15_000); await flush();
  assert.ok(error, 'the public service must settle within its deadline');
  assert.equal(error.outcome, 'revocation-unconfirmed');
  assert.match(error.message, /无法确认.*不要重复/);
  assert.deepEqual(signOutScopes, []);
  request.resolve({ data: { revoked: 1 }, error: null }); await flush();
  assert.deepEqual(signOutScopes, []);
  assert.equal(invokes.length, 1);
  assert.equal(rpcs.length, 0);
  assert.equal(clock.pending, 0);
});

test('a busy JS thread cannot turn an after-deadline rejection into a retryable raw error', async () => {
  const clock = fakeClock(), request = deferred();
  const { service } = loadService(null, { clock, invoke: () => request.promise });
  const result = service.revokeAllTerminals().catch(error => error);
  await flush(); clock.elapse(15_001);
  request.reject(new Error('private upstream detail')); await flush();
  const error = await result;
  assert.equal(error.outcome, 'revocation-unconfirmed');
  assert.doesNotMatch(error.message, /private upstream detail/);
  assert.equal(clock.pending, 0);
});

test('a missing terminal list is an error, not a trusted empty list', async () => {
  const { service } = loadService({});
  await assert.rejects(service.listAccountTerminals(), /终端列表.*无法确认/);
});

test('unconfirmed revocation must not proceed to native sign-out', async () => {
  const { service, signOutScopes } = loadService({});
  await assert.rejects(service.revokeAllTerminals(), /撤销结果.*无法确认/);
  assert.equal(signOutScopes.length, 0);
});

test('unconfirmed emergency revocation RPC must not proceed to native sign-out', async () => {
  const { service, signOutScopes } = loadService(null);
  await assert.rejects(service.revokeCurrentTerminalWithoutAudit(), /撤销结果.*无法确认/);
  assert.equal(signOutScopes.length, 0);
});

const TERMINAL_ID = '11111111-1111-4111-8111-111111111111';
const currentTerminal = {
  id: TERMINAL_ID, installation_id: '22222222-2222-4222-8222-222222222222',
  platform: 'android', device_label: 'Android test', app_version: '0.0.1',
  first_seen_at: '2026-10-15T00:00:00Z', last_seen_at: '2026-10-15T01:00:00Z',
  revoked_at: null, revocation_reason: null, isCurrent: true,
};

test('only an explicit terminal array is accepted; explicit empty remains a valid result', async () => {
  for (const payload of [{ terminals: null }, { terminals: {} }, { terminals: 'private invalid list' }, [], 'invalid response', true]) {
    const { service, signOutScopes } = loadService(payload);
    await assert.rejects(service.listAccountTerminals(), error =>
      /无法确认/.test(error.message) && !/private invalid/.test(error.message));
    assert.equal(signOutScopes.length, 0);
  }
  assert.equal((await loadService({ terminals: [] }).service.listAccountTerminals()).length, 0);
  const [terminal] = await loadService({ terminals: [currentTerminal] }).service.listAccountTerminals();
  assert.equal(terminal.id, TERMINAL_ID);
  assert.equal(terminal.is_current, true);
});

test('every Edge revocation entry rejects malformed counts without native sign-out', async () => {
  const badCounts = [undefined, null, 'private invalid count', -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, true, {}, []];
  for (const method of ['revokeAccountTerminal', 'revokeCurrentTerminal', 'revokeOtherTerminals', 'revokeAllTerminals']) {
    for (const revoked of badCounts) {
      const { service, signOutScopes } = loadService(body => body.action === 'list'
        ? { terminals: [currentTerminal] } : { revoked });
      await assert.rejects(service[method](method === 'revokeAccountTerminal' ? TERMINAL_ID : undefined), error =>
        service.isAccountSessionOutcomeError(error)
        && error.outcome === 'revocation-unconfirmed'
        && /撤销结果.*无法确认/.test(error.message)
        && !/private invalid/.test(error.message));
      assert.equal(signOutScopes.length, 0, `${method} must not sign out on ${String(revoked)}`);
    }
  }
});

test('confirmed zero and positive counts preserve the established native sign-out scopes', async () => {
  for (const method of ['revokeAccountTerminal', 'revokeCurrentTerminal', 'revokeOtherTerminals', 'revokeAllTerminals']) {
    for (const revoked of [0, 2]) {
      const { service, signOutScopes } = loadService(body => body.action === 'list'
        ? { terminals: [currentTerminal] } : { revoked });
      const count = await service[method](method === 'revokeAccountTerminal' ? TERMINAL_ID : undefined);
      assert.equal(count, revoked);
      assert.deepEqual(signOutScopes, method === 'revokeAccountTerminal' ? [] : [method === 'revokeOtherTerminals' ? 'others' : 'local']);
    }
  }
});

test('emergency RPC fallbacks reject invalid counts, while confirmed counts keep their explicit scopes', async () => {
  for (const method of ['revokeCurrentTerminalWithoutAudit', 'revokeAllTerminalsWithoutAudit']) {
    for (const count of [null, undefined, '0', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const { service, signOutScopes } = loadService(count);
      await assert.rejects(service[method](), error =>
        service.isAccountSessionOutcomeError(error)
        && error.outcome === 'revocation-unconfirmed'
        && /撤销结果.*无法确认/.test(error.message));
      assert.equal(signOutScopes.length, 0);
    }
    const { service, signOutScopes } = loadService(0);
    assert.equal(await service[method](), 0);
    assert.deepEqual(signOutScopes, [method === 'revokeCurrentTerminalWithoutAudit' ? 'local' : 'global']);
  }
});

test('native sign-out failure after confirmed revocation is not reported as completed', async () => {
  const { service, signOutScopes } = loadService({ revoked: 1 }, { signOutError: new Error('native sign-out failed') });
  await assert.rejects(service.revokeAllTerminals(), error => {
    assert.equal(error.outcome, 'session-cleanup-unconfirmed');
    assert.match(error.message, /终端访问已撤销.*清理结果无法确认/);
    assert.doesNotMatch(error.message, /native sign-out failed/);
    return true;
  });
  assert.deepEqual(signOutScopes, ['local']);
});

function appAction(name, dependencies) {
  const text = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(initializer);
  if (ts.isCallExpression(initializer)) initializer = initializer.arguments[0];
  const js = ts.transpileModule(`module.exports = ${initializer.getText(file)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const coordinator = loadTypeScriptModule('../src/services/authSessionOperation.ts');
  const { createAuthCallbackInbox } = loadTypeScriptModule('../src/services/authCallbackInbox.ts', {
    './authSessionOperation': coordinator,
  });
  vm.runInNewContext(js, {
    module,
    authCallbackInbox: { current: createAuthCallbackInbox(() => true) },
    initialAuthUrl: { current: { promise: null, delivered: false } },
    authCallbackUi: { current: { mounted: true, owner: null } },
    ...dependencies,
  });
  return module.exports;
}

test('App logout does not enter emergency fallback after a typed post-list identity rejection', async () => {
  let reads = 0, fallbacks = 0;
  const changedSession = { ...testSession, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
  const { service, invokes, rpcs, signOutScopes } = loadService({ terminals: [currentTerminal] }, {
    getSession: () => ({ data: { session: reads++ === 0 ? testSession : changedSession }, error: null }),
  });
  const notices = [], stages = [];
  const noop = () => {};
  const run = appAction('handleLogout', {
    accountBusy: false, accountFlowInFlightRef: { current: false }, isSupabaseConfigured: true,
    setAccountBusy: noop, setAuthError: noop, setPendingAppleDisplayNames: noop, setAppleRecoveryProbe: noop,
    setRecoveryLink: noop, setPasswordNonceRequired: noop, setPendingVerification: noop,
    setDevice: noop, setSelectedModel: noop, setActiveTab: noop, clearRecovery: noop,
    setStage: stage => stages.push(stage), notify: (...args) => notices.push(args),
    humanizeAuthError: error => error.message,
    revokeCurrentTerminal: service.revokeCurrentTerminal,
    isAccountSessionOutcomeError: service.isAccountSessionOutcomeError,
    revokeCurrentTerminalWithoutAudit: async () => { fallbacks++; },
    logout: async () => { fallbacks++; },
  });
  await run();
  assert.equal(reads, 2);
  assert.deepEqual(invokes.map(request => request.action), ['list']);
  assert.deepEqual(rpcs, []);
  assert.deepEqual(signOutScopes, []);
  assert.equal(fallbacks, 0);
  assert.deepEqual(stages, []);
  assert.equal(notices.length, 1);
  assert.match(notices[0][1], /无法确认当前登录会话身份.*撤销请求尚未发送/);
});

test('App logout and post-password-update timeout do not replay fallback or repeat the password form', async () => {
  for (const action of ['handleLogout', 'handleResetPassword']) {
    const clock = fakeClock(), request = deferred();
    const { service, signOutScopes } = loadService(null, { clock, invoke: (_name, options) =>
      options.body.action === 'list' ? Promise.resolve({ data: { terminals: [currentTerminal] }, error: null }) : request.promise });
    let fallbacks = 0, passwords = 0;
    const stages = [], notices = [];
    const noop = () => {};
    const run = appAction(action, {
      accountBusy: false, accountFlowInFlightRef: { current: false }, isSupabaseConfigured: true,
      setAccountBusy: noop, setAuthError: noop, setPendingAppleDisplayNames: noop, setAppleRecoveryProbe: noop,
      setRecoveryLink: noop, setPasswordNonceRequired: noop, setPendingVerification: noop,
      setDevice: noop, setSelectedModel: noop, setActiveTab: noop, clearRecovery: noop,
      setStage: stage => stages.push(stage), notify: (...args) => notices.push(args),
      humanizeAuthError: error => error.message,
      revokeCurrentTerminal: service.revokeCurrentTerminal,
      revokeAllTerminals: service.revokeAllTerminals,
      isAccountSessionOutcomeError: service.isAccountSessionOutcomeError,
      revokeCurrentTerminalWithoutAudit: async () => { fallbacks++; },
      revokeAllTerminalsWithoutAudit: async () => { fallbacks++; },
      logout: async () => { fallbacks++; }, resetPassword: async () => { passwords++; },
    });
    const pending = run(); await flush(); clock.advance(15_000); await flush();
    await pending;
    assert.equal(fallbacks, 0, `${action} must not repeat an unknown revocation`);
    assert.equal(notices.length, 1);
    assert.match(notices[0][1], /无法确认/);
    assert.equal(passwords, action === 'handleResetPassword' ? 1 : 0);
    assert.deepEqual(stages, action === 'handleResetPassword' ? ['account-security'] : []);
    request.resolve({ data: { revoked: 1 }, error: null }); await flush();
    assert.deepEqual(signOutScopes, []);
  }
});

test('App logout and post-password-update do not replay fallback after an ordinary dispatched revoke failure', async () => {
  for (const action of ['handleLogout', 'handleResetPassword']) {
    const privateDetail = `private dispatched ${action} detail`;
    const { service, invokes, signOutScopes } = loadService(null, { invoke: (_name, options) => {
      if (options.body.action === 'list') return Promise.resolve({ data: { terminals: [currentTerminal] }, error: null });
      if (action === 'handleLogout') return Promise.resolve({ data: null, error: new Error(privateDetail) });
      throw new Error(privateDetail);
    } });
    let fallbacks = 0, passwords = 0;
    const notices = [];
    const noop = () => {};
    const run = appAction(action, {
      accountBusy: false, accountFlowInFlightRef: { current: false }, isSupabaseConfigured: true,
      setAccountBusy: noop, setAuthError: noop, setPendingAppleDisplayNames: noop, setAppleRecoveryProbe: noop,
      setRecoveryLink: noop, setPasswordNonceRequired: noop, setPendingVerification: noop,
      setDevice: noop, setSelectedModel: noop, setActiveTab: noop, clearRecovery: noop,
      setStage: noop, notify: (...args) => notices.push(args),
      humanizeAuthError: error => error.message,
      revokeCurrentTerminal: service.revokeCurrentTerminal,
      revokeAllTerminals: service.revokeAllTerminals,
      isAccountSessionOutcomeError: service.isAccountSessionOutcomeError,
      revokeCurrentTerminalWithoutAudit: async () => { fallbacks += 1; },
      revokeAllTerminalsWithoutAudit: async () => { fallbacks += 1; },
      logout: async () => { fallbacks += 1; },
      resetPassword: async () => { passwords += 1; },
    });
    await run();
    assert.equal(fallbacks, 0, `${action} must not replay after an unconfirmed dispatched revoke`);
    assert.equal(passwords, action === 'handleResetPassword' ? 1 : 0);
    assert.deepEqual(signOutScopes, []);
    assert.equal(invokes.filter(call => String(call.action).startsWith('revoke_')).length, 1);
    assert.equal(notices.length, 1);
    assert.match(notices[0][1], /无法确认.*不要重复/);
    assert.doesNotMatch(notices[0][1], /private dispatched/);
  }
});

test('App logout and post-password-update do not replay fallback after a malformed revoke acknowledgement', async () => {
  for (const action of ['handleLogout', 'handleResetPassword']) {
    const { service, signOutScopes } = loadService(body => body.action === 'list'
      ? { terminals: [currentTerminal] }
      : {});
    let fallbacks = 0, passwords = 0;
    const notices = [];
    const noop = () => {};
    const run = appAction(action, {
      accountBusy: false, accountFlowInFlightRef: { current: false }, isSupabaseConfigured: true,
      setAccountBusy: noop, setAuthError: noop, setPendingAppleDisplayNames: noop, setAppleRecoveryProbe: noop,
      setRecoveryLink: noop, setPasswordNonceRequired: noop, setPendingVerification: noop,
      setDevice: noop, setSelectedModel: noop, setActiveTab: noop, clearRecovery: noop, setStage: noop,
      notify: (...args) => notices.push(args), humanizeAuthError: error => error.message,
      revokeCurrentTerminal: service.revokeCurrentTerminal, revokeAllTerminals: service.revokeAllTerminals,
      isAccountSessionOutcomeError: service.isAccountSessionOutcomeError,
      revokeCurrentTerminalWithoutAudit: async () => { fallbacks += 1; },
      revokeAllTerminalsWithoutAudit: async () => { fallbacks += 1; },
      logout: async () => { fallbacks += 1; }, resetPassword: async () => { passwords += 1; },
    });
    await run();
    assert.equal(fallbacks, 0, `${action} must not replay after a malformed acknowledgement`);
    assert.equal(passwords, action === 'handleResetPassword' ? 1 : 0);
    assert.deepEqual(signOutScopes, []);
    assert.equal(notices.length, 1);
    assert.match(notices[0][1], /无法确认.*不要重复/);
    assert.doesNotMatch(notices[0][1], /private malformed/);
  }
});

test('App logout does not fall through to SDK logout after an unconfirmed emergency RPC revoke', async () => {
  const { service, rpcs, signOutScopes } = loadService(null, {
    invoke: async () => ({ data: null, error: new Error('private list preflight detail') }),
    rpc: async () => ({ data: null, error: new Error('private emergency rpc detail') }),
  });
  let sdkLogouts = 0;
  const notices = [];
  const noop = () => {};
  const run = appAction('handleLogout', {
    accountBusy: false, accountFlowInFlightRef: { current: false }, isSupabaseConfigured: true,
    setAccountBusy: noop, setAuthError: noop, setPendingAppleDisplayNames: noop, setAppleRecoveryProbe: noop,
    setRecoveryLink: noop, setPasswordNonceRequired: noop, setPendingVerification: noop,
    setDevice: noop, setSelectedModel: noop, setActiveTab: noop, clearRecovery: noop, setStage: noop,
    notify: (...args) => notices.push(args), humanizeAuthError: error => error.message,
    revokeCurrentTerminal: service.revokeCurrentTerminal,
    revokeCurrentTerminalWithoutAudit: service.revokeCurrentTerminalWithoutAudit,
    isAccountSessionOutcomeError: service.isAccountSessionOutcomeError,
    logout: async () => { sdkLogouts += 1; },
  });
  await run();
  assert.equal(rpcs.length, 1);
  assert.equal(sdkLogouts, 0, 'an unconfirmed emergency revoke must not continue to SDK logout');
  assert.deepEqual(signOutScopes, []);
  assert.equal(notices.length, 1);
  assert.match(notices[0][1], /无法确认.*不要重复/);
  assert.doesNotMatch(notices[0][1], /private emergency/);
});

test('all dispatched Edge revoke entries classify SDK, response and read-timeout-shaped failures as revocation-unconfirmed', async () => {
  const methods = ['revokeAccountTerminal', 'revokeCurrentTerminal', 'revokeOtherTerminals', 'revokeAllTerminals'];
  const variants = ['sdk-error', 'response-error', 'read-timeout-shaped'];
  for (const method of methods) {
    for (const variant of variants) {
      const disguised = Object.assign(new Error('private dispatched detail'), { outcome: 'read-timeout' });
      const { service, invokes, signOutScopes } = loadService(null, { invoke: (_name, options) => {
        if (options.body.action === 'list') return Promise.resolve({ data: { terminals: [currentTerminal] }, error: null });
        if (variant === 'sdk-error') return Promise.resolve({ data: null, error: new Error('private SDK detail') });
        if (variant === 'response-error') return Promise.resolve({ data: { error: 'private response detail' }, error: null });
        throw disguised;
      } });
      await assert.rejects(
        service[method](method === 'revokeAccountTerminal' ? TERMINAL_ID : undefined),
        error => service.isAccountSessionOutcomeError(error)
          && error.outcome === 'revocation-unconfirmed'
          && /不要重复提交撤销/.test(error.message)
          && !/private/.test(error.message),
      );
      assert.equal(invokes.filter(call => String(call.action).startsWith('revoke_')).length, 1);
      assert.deepEqual(signOutScopes, []);
    }
  }
});

test('both emergency RPC revoke entries classify returned and thrown failures without native sign-out', async () => {
  for (const method of ['revokeCurrentTerminalWithoutAudit', 'revokeAllTerminalsWithoutAudit']) {
    for (const variant of ['returned', 'thrown']) {
      const { service, rpcs, signOutScopes } = loadService(null, { rpc: () => {
        if (variant === 'thrown') throw new Error('private thrown RPC detail');
        return { data: null, error: new Error('private returned RPC detail') };
      } });
      await assert.rejects(service[method](), error =>
        service.isAccountSessionOutcomeError(error)
        && error.outcome === 'revocation-unconfirmed'
        && /不要重复提交撤销/.test(error.message)
        && !/private/.test(error.message));
      assert.equal(rpcs.length, 1);
      assert.deepEqual(signOutScopes, []);
    }
  }
});

test('terminal list, heartbeat and registration have bounded feedback and no automatic retry', async () => {
  for (const [method, outcome] of [['listAccountTerminals', 'read-timeout'], ['heartbeatCurrentTerminal', 'registration-unconfirmed'], ['registerCurrentTerminal', 'registration-unconfirmed']]) {
    const clock = fakeClock(), request = deferred();
    const { service, invokes, signOutScopes } = loadService(null, { clock, invoke: () => request.promise });
    const result = service[method]().catch(error => error);
    await flush(); clock.advance(15_000); await flush();
    assert.equal((await result).outcome, outcome, method);
    assert.equal(invokes.length, 1);
    request.resolve({ data: { terminal: currentTerminal, terminals: [] }, error: null }); await flush();
    assert.equal(invokes.length, 1);
    assert.equal(signOutScopes.length, 0);
    assert.equal(clock.pending, 0);
  }
});

test('emergency RPC timeout never falls through to sign-out after a late commit', async () => {
  for (const method of ['revokeCurrentTerminalWithoutAudit', 'revokeAllTerminalsWithoutAudit']) {
    const clock = fakeClock(), request = deferred();
    const { service, rpcs, signOutScopes } = loadService(null, { clock, rpc: () => request.promise });
    const result = service[method]().catch(error => error);
    await flush(); clock.advance(15_000); await flush();
    assert.equal((await result).outcome, 'revocation-unconfirmed');
    request.resolve({ data: 1, error: null }); await flush();
    assert.equal(rpcs.length, 1);
    assert.deepEqual(signOutScopes, []);
    assert.equal(clock.pending, 0);
  }
});

test('current-terminal preflight timeout dispatches neither revocation nor sign-out', async () => {
  const clock = fakeClock(), request = deferred();
  const { service, invokes, signOutScopes } = loadService(null, { clock, invoke: () => request.promise });
  const result = service.revokeCurrentTerminal().catch(error => error);
  await flush(); clock.advance(15_000); await flush();
  assert.equal((await result).outcome, 'read-timeout');
  request.resolve({ data: { terminals: [currentTerminal] }, error: null }); await flush();
  assert.deepEqual(invokes.map(call => call.action), ['list']);
  assert.deepEqual(signOutScopes, []);
});

test('the response-body parse is inside the Edge deadline and cannot leak a late private message', async () => {
  const clock = fakeClock(), body = deferred();
  const response = new Response('', { status: 503 });
  response.clone = () => ({ json: () => body.promise });
  const { service, signOutScopes } = loadService(null, {
    clock, invoke: async () => ({ data: null, error: { message: 'private SDK error', context: response } }),
  });
  const result = service.revokeAllTerminals().catch(error => error);
  await flush(); clock.advance(15_000); await flush();
  const error = await result;
  assert.equal(error.outcome, 'revocation-unconfirmed');
  assert.doesNotMatch(error.message, /private/);
  body.resolve({ error: 'private late message' }); await flush();
  assert.deepEqual(signOutScopes, []);
  assert.equal(clock.pending, 0);
});

test('settled normal responses clear deadlines while preserving all sign-out scopes', async () => {
  for (const method of ['revokeAccountTerminal', 'revokeCurrentTerminal', 'revokeOtherTerminals', 'revokeAllTerminals', 'revokeCurrentTerminalWithoutAudit', 'revokeAllTerminalsWithoutAudit']) {
    const clock = fakeClock();
    const { service, signOutScopes } = loadService(body => body.action === 'list' ? { terminals: [currentTerminal] }
      : body.action === 'rpc' ? 1 : { revoked: 1 }, { clock });
    assert.equal(await service[method](), 1);
    assert.equal(clock.pending, 0);
    assert.deepEqual(signOutScopes, method === 'revokeAccountTerminal' ? []
      : [method === 'revokeAllTerminalsWithoutAudit' ? 'global' : method === 'revokeOtherTerminals' ? 'others' : 'local']);
  }
});

test('thrown native cleanup errors after a confirmed revoke use partial-result semantics, not raw secrets', async () => {
  const { service, signOutScopes } = loadService({ revoked: 1 }, { signOut: () => { throw new Error('private token detail'); } });
  await assert.rejects(service.revokeAllTerminals(), error => {
    assert.equal(service.isAccountSessionOutcomeError(error), true);
    assert.equal(error.outcome, 'session-cleanup-unconfirmed');
    assert.doesNotMatch(error.message, /private token detail/);
    return true;
  });
  assert.deepEqual(signOutScopes, ['local']);
});
