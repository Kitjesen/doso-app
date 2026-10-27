import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const SECURITY_USER_ID = '66666666-6666-4666-8666-666666666666';
const SECURITY_SESSION_ID = '77777777-7777-4777-8777-777777777777';
const encodeJwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const securitySession = {
  user: { id: SECURITY_USER_ID },
  access_token: `${encodeJwtPart({ alg: 'none' })}.${encodeJwtPart({ session_id: SECURITY_SESSION_ID })}.fixture`,
};

// Execute the real screen handlers with React hooks/host views and SDK boundaries
// simulated. This is not an Android BackHandler or native rendering test.
async function mountSecurity({ services = {}, sessionSdk, after = () => {}, busy = false } = {}) {
  const rpc = sessionSdk?.rpc ?? (async () => ({ data: [], error: null }));
  const sdk = sessionSdk ? {
    ...sessionSdk,
    rpc(name, params) {
      const headers = {};
      let execution;
      const builder = {
        setHeader(header, value) { headers[header] = value; return builder; },
        then(resolve, reject) {
          execution ??= Promise.resolve().then(() => rpc(name, params, headers));
          return execution.then(resolve, reject);
        },
      };
      return builder;
    },
    auth: {
      getSession: async () => ({ data: { session: securitySession }, error: null }),
      ...sessionSdk.auth,
    },
  } : undefined;
  const slots = [];
  let cursor = 0, effects = [], nodes = [], backCalls = 0, registeredBack = null;
  let props = { busy };
  const changed = (before, after) => !before || !after || before.length !== after.length || before.some((v, i) => !Object.is(v, after[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const terminals = [
    { id: 'current', is_current: true, revoked_at: null, device_label: '本机', platform: 'android', last_seen_at: '2026-10-15T00:00:00Z' },
    { id: 'other', is_current: false, revoked_at: null, device_label: '测试终端', platform: 'web', last_seen_at: '2026-10-15T00:00:00Z' },
  ];
  const session = {
    isAccountSessionOutcomeError: () => false,
    registerCurrentTerminal: async () => {}, heartbeatCurrentTerminal: async () => {},
    listAccountTerminals: async () => terminals,
    revokeAccountTerminal: async () => 1, revokeOtherTerminals: async () => 1, revokeAllTerminals: async () => 2,
    ...services,
  };
  const host = {
    ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    Platform: { OS: 'android', Version: 35 },
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
  const productionModuleCache = new Map();
  function load(relative) {
    if (productionModuleCache.has(relative)) return productionModuleCache.get(relative).exports;
    const module = { exports: {} };
    productionModuleCache.set(relative, module);
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) };
      if (name.endsWith('/AppText')) return { Text: 'Text' };
      if (name.endsWith('/sessionService')) return sessionSdk ? load('src/services/sessionService.ts') : session;
      if (name === 'expo-secure-store') return { getItemAsync: async () => 'security-test-installation' };
      if (name === './supabaseClient') return { getSupabaseClient: () => sdk };
      if (name === './authSessionIdentity') return load('src/services/authSessionIdentity.ts');
      if (name === './sessionIngestionFence') return load('src/services/sessionIngestionFence.ts');
      if (name === './authSessionOperation') return load('src/services/authSessionOperation.ts');
      if (name.endsWith('/authService')) return sessionSdk ? load('src/services/authService.ts') : { listMyLoginMethods: async () => [] };
      if (['./appleAuthCore', './authRedirect', './authOperationError', './emailOtp', './otpError'].includes(name)) return load(`src/services/${name.slice(2)}.ts`);
      if (name.endsWith('/mfaService')) return { getMfaStatus: async () => ({ enabled: false }) };
      if (name.endsWith('/theme')) return { radii: {}, useAppTheme: () => ({ colors: {}, isDark: false }) };
      if (name.endsWith('/appearance')) return loadVisualTokenModules().appearance;
      if (name.endsWith('/typography')) return loadVisualTokenModules().typography;
      if (name === './securityPageLayout') return load('src/screens/securityPageLayout.ts');
      throw new Error(`Unexpected security screen dependency: ${name}`);
    };
    vm.runInNewContext(code, {
      exports: module.exports, module, require: localRequire, Error, Date, Response,
      TextDecoder, Uint8Array, atob, performance, setTimeout, clearTimeout, process: { env: {} },
    }, { filename: relative });
    return module.exports;
  }
  const Screen = load('src/screens/AccountSecurityScreen.tsx').AccountSecurityScreen;
  const registerBack = handler => { registeredBack = handler; };
  const onBack = () => { backCalls++; };
  function render(next = {}) {
    props = { ...props, ...next };
    cursor = 0; effects = []; nodes = [];
    function walk(node, parent = null) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => walk(child, parent));
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node), parent }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      const entry = { ...node, parent }; nodes.push(entry); walk(node.props.children, entry);
    }
    walk(Screen({ canManageMfa: false, email: 'test@example.invalid', emailVerified: false,
      onBack, onBackRequestChange: registerBack, onChangePassword() {}, onManageMfa() {}, onAllTerminalsRevoked: after, ...props }));
    for (const effect of effects) effect();
  }
  function action(text, occurrence = 0) {
    const copy = nodes.filter(node => node.type === 'copy' && node.value === text)[occurrence];
    assert.ok(copy, `missing action text: ${text}`);
    let parent = copy.parent;
    while (parent && parent.type !== 'Pressable') parent = parent.parent;
    assert.ok(parent, `missing Pressable: ${text}`);
    return parent.props;
  }
  render(); await flush(); render();
  return {
    action, render,
    get registeredBack() { return registeredBack; },
    get backCalls() { return backCalls; },
    get visibleBack() { return nodes.find(node => node.props?.accessibilityLabel === '返回')?.props; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join('\n'); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    confirm(label) { action(label).onPress(); render(); return action('确认').onPress; },
  };
}

test('terminal read errors show safe recovery copy instead of SDK or server details', async () => {
  const sentinel = 'PRIVATE_INTERNAL_EDGE_TRACE_DO_NOT_DISPLAY';
  const screen = await mountSecurity({ sessionSdk: {
    functions: { invoke: async () => ({ data: null, error: new Error(sentinel) }) },
  } });

  assert.doesNotMatch(screen.copy, new RegExp(sentinel));
  assert.match(screen.copy, /登录终端暂时无法读取.*检查网络后刷新/);
  assert.equal(screen.action('刷新', 1).disabled, false);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
});

test('mount and terminal reload only list Provider-prepared terminals without registering again', async () => {
  let registerCalls = 0;
  let listCalls = 0;
  const screen = await mountSecurity({ services: {
    registerCurrentTerminal: async () => { registerCalls += 1; },
    listAccountTerminals: async () => { listCalls += 1; return []; },
  } });
  assert.deepEqual({ registerCalls, listCalls }, { registerCalls: 0, listCalls: 1 });

  screen.action('刷新', 1).onPress();
  await flush();
  screen.render();
  assert.deepEqual({ registerCalls, listCalls }, { registerCalls: 0, listCalls: 2 });
});

test('login-method read errors show safe recovery copy instead of RPC details', async () => {
  const sentinel = 'PRIVATE_LOGIN_METHOD_RPC_DO_NOT_DISPLAY';
  const screen = await mountSecurity({ sessionSdk: {
    functions: { invoke: async () => ({ data: null, error: new Error('private terminal error') }) },
    rpc: async () => ({ data: null, error: new Error(sentinel) }),
  } });
  assert.doesNotMatch(screen.copy, /PRIVATE_LOGIN_METHOD_RPC_DO_NOT_DISPLAY|private terminal error/);
  assert.match(screen.copy, /登录方式暂时无法读取.*检查网络后刷新/);
  assert.equal(screen.action('刷新').disabled, false);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
});

async function assertUnknownRevocationIsLocked(rejection) {
  const sentinel = 'PRIVATE_MUTATION_ERROR_DO_NOT_DISPLAY';
  let mutationCalls = 0, signOutCalls = 0;
  const terminals = [
    { id: 'current', is_current: true, revoked_at: null, device_label: '本机', platform: 'android', last_seen_at: '' },
    { id: 'other', is_current: false, revoked_at: null, device_label: '其他', platform: 'web', last_seen_at: '' },
  ];
  const screen = await mountSecurity({ sessionSdk: {
    functions: { invoke: async (_name, { body }) => {
      if (body.action === 'revoke_others') {
        mutationCalls++;
        if (rejection) throw rejection.value;
        return { data: null, error: new Error(sentinel) };
      }
      return { data: body.action === 'list' ? { terminals } : { terminal: terminals[0] }, error: null };
    } },
    auth: { signOut: async () => { signOutCalls++; return { error: null }; } },
  } });
  const confirm = screen.confirm('退出其他终端');
  confirm(); await flush();
  confirm(); await flush(); // Retained event, before the next render.
  assert.equal(mutationCalls, 1, 'the first response cannot prove whether the server committed');
  assert.equal(signOutCalls, 0);
  screen.render();
  assert.doesNotMatch(screen.copy, new RegExp(sentinel));
  assert.match(screen.copy, /结果无法确认.*不要重复提交撤销/);
  assert.doesNotMatch(screen.copy, /已退出其他登录终端/);
  assert.equal(screen.action('退出其他终端').disabled, true);
  assert.equal(screen.action('退出全部终端').disabled, true);
  assert.equal(screen.action('禁用').disabled, true);
  assert.equal(screen.action('刷新', 1).disabled, false);
  screen.action('刷新', 1).onPress(); await flush(); screen.render();
  assert.equal(screen.action('退出其他终端').disabled, true);
  confirm(); await flush();
  assert.equal(mutationCalls, 1);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
}

test('an untyped revocation error cannot replay through retained confirmation or refresh', async () => {
  await assertUnknownRevocationIsLocked();
});

test('non-Error revocation rejections also keep the unknown-result guard', async (t) => {
  for (const [name, value] of [['string', 'PRIVATE_MUTATION_ERROR_DO_NOT_DISPLAY'], ['object', { message: 'PRIVATE_MUTATION_ERROR_DO_NOT_DISPLAY' }], ['null', null]]) {
    await t.test(name, () => assertUnknownRevocationIsLocked({ value }));
  }
});

test('a typed preflight read timeout remains retryable when no revocation was confirmed', async () => {
  const timeout = new Error('终端信息读取超时，请检查网络后刷新。');
  timeout.outcome = 'read-timeout';
  let calls = 0;
  const screen = await mountSecurity({ services: {
    isAccountSessionOutcomeError: error => error === timeout,
    revokeOtherTerminals: async () => { if (++calls === 1) throw timeout; return 1; },
  } });
  const confirm = screen.confirm('退出其他终端');
  confirm(); await flush(); screen.render();
  assert.match(screen.copy, /终端信息读取超时/);
  assert.doesNotMatch(screen.copy, /不要重复提交撤销/);
  assert.equal(screen.action('退出其他终端').disabled, false);
  assert.equal(screen.action('刷新', 1).disabled, false);
  confirm(); await flush(); screen.render();
  assert.equal(calls, 2);
  assert.match(screen.copy, /已退出其他登录终端/);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
});

test('security registers the same guarded request for header and hardware back', async () => {
  const screen = await mountSecurity();
  assert.equal(typeof screen.registeredBack, 'function');
  assert.equal(screen.visibleBack.onPress, screen.registeredBack);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
  screen.unmount();
  assert.equal(screen.registeredBack, null);
});

test('revocation locks both back routes synchronously, rejects duplicate confirm, and unlocks on success', async () => {
  const request = deferred(); let calls = 0;
  const screen = await mountSecurity({ services: { revokeOtherTerminals: () => { calls++; return request.promise; } } });
  const back = screen.registeredBack;
  assert.equal(typeof back, 'function');
  const visibleBack = screen.visibleBack.onPress;
  const confirm = screen.confirm('退出其他终端');
  confirm(); confirm(); // Deliberately no render between action start and back.
  back(); visibleBack();
  assert.equal(calls, 1);
  assert.equal(screen.backCalls, 0);
  screen.render();
  assert.equal(screen.visibleBack.disabled, true);
  request.resolve(1); await flush(); screen.render();
  assert.match(screen.copy, /已退出其他登录终端/);
  assert.equal(screen.visibleBack.disabled, false);
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
});

test('back remains locked until the post-revocation terminal refresh settles', async () => {
  const refresh = deferred(); let reads = 0;
  const live = await mountSecurity({ services: { listAccountTerminals: () => {
    if (++reads === 1) return Promise.resolve([{ id: 'other', is_current: false, revoked_at: null, device_label: '其他', platform: 'web', last_seen_at: '' }]);
    return refresh.promise;
  } } });
  live.confirm('退出其他终端')(); await flush();
  assert.equal(typeof live.registeredBack, 'function');
  live.registeredBack(); assert.equal(live.backCalls, 0);
  refresh.resolve([]); await flush(); live.render();
  live.registeredBack(); assert.equal(live.backCalls, 1);
});

test('revocation rejection restores navigation without success callback', async () => {
  const request = deferred(); let afterCalls = 0;
  const screen = await mountSecurity({ services: { revokeAllTerminals: () => request.promise }, after: () => { afterCalls++; } });
  assert.equal(typeof screen.registeredBack, 'function');
  screen.confirm('退出全部终端')(); screen.registeredBack();
  assert.equal(screen.backCalls, 0);
  request.reject(new Error('测试请求失败')); await flush(); screen.render();
  assert.doesNotMatch(screen.copy, /测试请求失败/);
  assert.match(screen.copy, /结果无法确认.*不要重复提交撤销/);
  assert.equal(afterCalls, 0);
  screen.registeredBack(); assert.equal(screen.backCalls, 1);
});

test('all-terminal completion runs once and stays locked while its after callback is pending', async () => {
  const request = deferred(), after = deferred(); let calls = 0;
  const screen = await mountSecurity({ services: { revokeAllTerminals: () => request.promise }, after: () => { calls++; return after.promise; } });
  assert.equal(typeof screen.registeredBack, 'function');
  screen.confirm('退出全部终端')(); request.resolve(2); await flush();
  assert.equal(calls, 1);
  screen.registeredBack(); assert.equal(screen.backCalls, 0);
  after.resolve(); await flush(); screen.render();
  screen.registeredBack(); assert.equal(screen.backCalls, 1);
});

test('external busy also blocks registered back, and a retained callback cannot navigate after unmount', async () => {
  const screen = await mountSecurity({ busy: true });
  assert.equal(typeof screen.registeredBack, 'function');
  screen.registeredBack(); screen.visibleBack.onPress();
  assert.equal(screen.backCalls, 0);
  screen.render({ busy: false });
  const retained = screen.registeredBack;
  screen.unmount(); retained();
  assert.equal(screen.registeredBack, null);
  assert.equal(screen.backCalls, 0);
});

test('unmounted revocation ignores late success and does not run its navigation callback', async () => {
  const request = deferred(); let afterCalls = 0;
  const screen = await mountSecurity({ services: { revokeAllTerminals: () => request.promise }, after: () => { afterCalls++; } });
  screen.confirm('退出全部终端')(); screen.unmount();
  request.resolve(2); await flush();
  assert.equal(afterCalls, 0);
  assert.equal(screen.registeredBack, null);
});

test('unknown revocation prevents same-tick replay but keeps refresh and back available', async () => {
  const request = deferred(); let calls = 0, reads = 0;
  const unknown = new Error('终端撤销结果无法确认，请刷新终端列表并核对登录状态，不要重复提交撤销。');
  unknown.outcome = 'revocation-unconfirmed';
  const screen = await mountSecurity({ services: {
    isAccountSessionOutcomeError: error => error === unknown,
    revokeOtherTerminals: () => { calls++; return request.promise; },
    listAccountTerminals: async () => {
      reads++;
      return [{ id: 'other', is_current: false, revoked_at: null, device_label: '其他', platform: 'web', last_seen_at: '' }];
    },
  } });
  const confirm = screen.confirm('退出其他终端');
  confirm(); request.reject(unknown); await flush();
  confirm(); await flush(); // Old event closure must not replay before rerender.
  assert.equal(calls, 1);
  screen.render();
  assert.equal(screen.action('退出其他终端').disabled, true);
  assert.equal(screen.action('退出全部终端').disabled, true);
  assert.equal(screen.action('禁用').disabled, true);
  assert.match(screen.copy, /不要重复提交撤销/);
  assert.equal(screen.action('刷新', 1).disabled, false);
  screen.action('刷新', 1).onPress(); await flush(); screen.render();
  assert.equal(reads, 2);
  assert.match(screen.copy, /不要重复提交撤销/, 'a list read cannot prove an in-flight mutation has settled');
  assert.equal(screen.action('退出其他终端').disabled, true);
  screen.registeredBack(); assert.equal(screen.backCalls, 1);
});

test('confirmed revocation followed by refresh failure cannot be submitted again', async () => {
  for (const timeout of [true, false]) {
    const refresh = deferred(); let calls = 0, reads = 0;
    const failure = new Error(timeout ? '终端信息读取超时' : 'private refresh error');
    failure.outcome = timeout ? 'read-timeout' : undefined;
    const screen = await mountSecurity({ services: {
      isAccountSessionOutcomeError: error => timeout && error === failure,
      revokeOtherTerminals: async () => { calls++; return 1; },
      listAccountTerminals: async () => {
        if (++reads === 2) return refresh.promise;
        return [{ id: 'other', is_current: false, revoked_at: null, device_label: '其他', platform: 'web', last_seen_at: '' }];
      },
    } });
    const confirm = screen.confirm('退出其他终端');
    confirm(); await flush(); refresh.reject(failure); await flush();
    confirm(); await flush();
    assert.equal(calls, 1, 'the mutation succeeded; only reconciliation may be retried');
    screen.render();
    assert.equal(screen.action('退出其他终端').disabled, true);
    assert.match(screen.copy, /撤销已确认.*状态更新/);
    assert.doesNotMatch(screen.copy, /private refresh error/);
    assert.equal(screen.action('刷新', 1).disabled, false);
    screen.action('刷新', 1).onPress(); await flush(); screen.render();
    assert.equal(screen.action('退出其他终端').disabled, true);
    screen.registeredBack(); assert.equal(screen.backCalls, 1);
  }
});

test('a failed post-revocation navigation callback does not reopen an already completed action', async () => {
  const after = deferred(); let calls = 0;
  const screen = await mountSecurity({ services: { revokeAllTerminals: async () => { calls++; return 2; } }, after: () => after.promise });
  const confirm = screen.confirm('退出全部终端');
  confirm(); await flush(); after.reject(new Error('private callback detail')); await flush();
  confirm(); await flush();
  assert.equal(calls, 1);
  screen.render();
  assert.equal(screen.action('退出全部终端').disabled, true);
  assert.match(screen.copy, /撤销已确认.*状态更新/);
  assert.doesNotMatch(screen.copy, /private callback detail/);
  screen.registeredBack(); assert.equal(screen.backCalls, 1);
});

test('the production App Android handler delegates security back and always consumes the event', () => {
  const source = readFileSync(new URL('App.tsx', root), 'utf8');
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'BackHandler.addEventListener'
      && node.arguments[0]?.text === 'hardwareBackPress') handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(handler);
  for (const busy of [false, true]) {
    for (const otp of [false, true]) {
      let delegated = 0, escaped = 0;
      const onBack = vm.runInNewContext(`(${handler.getText(file)})`, {
        __DEV__: false, stage: 'account-security', accountBusy: busy,
        otpDeliveryInFlightRef: { current: otp },
        accountSecurityBackRequestRef: { current: () => { delegated++; } },
        returnToDeviceSettings: () => { escaped++; },
      });
      assert.equal(onBack(), true);
      assert.equal(delegated, busy || otp ? 0 : 1);
      assert.equal(escaped, 0);
    }
  }
  // Wiring guard supplements the executable callback test, not a native claim.
  assert.match(source, /accountSecurityBackRequestRef\.current = request \?\? \(\(\) => undefined\)/);
  assert.match(source, /<AccountSecurityScreen[\s\S]*?onBackRequestChange=\{registerAccountSecurityBackRequest\}/);
});
