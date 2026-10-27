import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/screens/EmailOtpScreen.tsx', import.meta.url), 'utf8');
const emailOtpSource = readFileSync(new URL('../src/services/emailOtp.ts', import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const emailOtpModule = { exports: {} };
vm.runInNewContext(compile(emailOtpSource), { module: emailOtpModule, exports: emailOtpModule.exports, RegExp });

// Run the real screen handlers with deterministic hooks, clock and AppState.
// This does not simulate native layout, mail delivery or the authentication service.
function mount(props = {}) {
  const slots = [];
  const effects = [];
  const timers = new Map();
  const listeners = new Set();
  let now = 1_000_000;
  let timerId = 0;
  let cursor = 0;
  let dirty = false;
  let unmounted = false;
  let writesAfterUnmount = 0;
  let nodes = [];
  const changed = (previous, next) => !previous || !next || next.some((value, i) => !Object.is(value, previous[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => {
        if (unmounted) writesAfterUnmount += 1;
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: effect() };
      });
    },
  };
  const host = {
    Keyboard: { dismiss() {} }, Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: value => value },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    AppState: { addEventListener: (_, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    } },
  };
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': host,
    '../theme': { useAppTheme: () => ({ colors: {} }) },
    '../components/AuthEntry': { useAuthEntryPalette: () => ({
      accent: '#0066FF', authFocus: '#0066FF', border: '#E4E7EC', dangerText: '#B52E42',
      input: '#F5F6F8', ink: '#171C24', placeholder: '#717B89', secondary: '#616B79',
    }) },
    '../components/GradientButton': { GradientButton: 'GradientButton' },
    '../services/emailOtp': emailOtpModule.exports,
    './LoginScreen': { AuthPage: 'AuthPage', AuthError: 'AuthError', authStyles: {} },
  };
  const module = { exports: {} };
  const schedule = (callback, repeat) => { const id = ++timerId; timers.set(id, { callback, repeat }); return id; };
  vm.runInNewContext(compile(source), {
    module, exports: module.exports, Error,
    require(name) {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: dependencies['react-native'].Text, TextInput: dependencies['react-native'].TextInput };
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    Date: class extends Date { static now() { return now; } },
    setTimeout: callback => schedule(callback, false), clearTimeout: id => timers.delete(id),
    setInterval: callback => schedule(callback, true), clearInterval: id => timers.delete(id),
  });
  function render(next = {}) {
    Object.assign(props, next);
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'effects must settle');
      cursor = 0; dirty = false; nodes = [];
      function walk(node) {
        if (node == null || typeof node === 'boolean') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
        nodes.push(node); walk(node.props.children);
      }
      walk(module.exports.EmailOtpScreen({ email: 'qa@example.com', onVerify() {}, onResend() {}, onBackToLogin() {}, ...props }));
      while (effects.length) effects.shift()();
    } while (dirty);
  }
  render();
  return {
    render,
    get field() { return nodes.find(node => node.type === 'TextInput').props; },
    get submit() { return nodes.find(node => node.type === 'GradientButton').props; },
    get resend() { return nodes.find(node => node.type === 'Pressable' && node.props.accessibilityValue).props; },
    get header() { return nodes.find(node => node.type === 'AuthPage').props; },
    get back() { return nodes.filter(node => node.type === 'Pressable').at(-1).props; },
    get error() { return nodes.find(node => node.type === 'AuthError').props.message; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get writesAfterUnmount() { return writesAfterUnmount; },
    get resourceCount() { return timers.size + listeners.size; },
    fill(value) { this.field.onChangeText(value); render(); },
    advance(ms, { tick = false, resume = false } = {}) {
      now += ms;
      if (tick) for (const [id, timer] of [...timers]) {
        if (!timer.repeat) timers.delete(id);
        timer.callback();
      }
      if (resume) for (const listener of listeners) listener('active');
      render();
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); unmounted = true; },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('returning from the mail app refreshes the cooldown by elapsed time', () => {
  const screen = mount();
  screen.advance(90_000, { resume: true });
  assert.equal(screen.resend.disabled, false);
  assert.equal(screen.resend.accessibilityValue.text, '重新发送验证码');
});

test('one delayed timer tick accounts for all elapsed seconds', () => {
  const screen = mount();
  screen.advance(10_500, { tick: true });
  assert.match(screen.resend.accessibilityValue.text, /^50 秒/);
});

test('verification locks same-tick duplicates, resend and both back actions', async () => {
  const request = deferred();
  let verify = 0, resend = 0, back = 0;
  const screen = mount({ onVerify: () => { verify += 1; return request.promise; }, onResend: () => { resend += 1; }, onBackToLogin: () => { back += 1; } });
  screen.advance(60_000, { tick: true, resume: true });
  screen.fill('123456');
  const submit = screen.submit.onPress;
  const retry = screen.resend.onPress;
  const leave = screen.back.onPress;
  const headerBack = screen.header.onBack;
  const pending = submit();
  const duplicate = submit(); const concurrent = retry(); leave(); headerBack();
  assert.equal(verify, 1);
  assert.equal(resend, 0);
  assert.equal(back, 0);
  screen.render();
  assert.equal(screen.field.editable, false);
  request.resolve(); await Promise.all([pending, duplicate, concurrent]); screen.render();
  screen.back.onPress();
  assert.equal(back, 1);
});

test('resend is exclusive with verify and restarts the deadline only after success', async () => {
  const request = deferred();
  let sends = 0, verifies = 0;
  const screen = mount({ onResend: () => { sends += 1; return request.promise; }, onVerify: () => { verifies += 1; } });
  screen.advance(60_000, { tick: true, resume: true });
  screen.fill('123456');
  const send = screen.resend.onPress;
  const verify = screen.submit.onPress;
  const pending = send();
  const duplicate = send(); const concurrent = verify();
  assert.equal(sends, 1); assert.equal(verifies, 0);
  screen.advance(20_000);
  request.resolve(); await Promise.all([pending, duplicate, concurrent]);
  await send();
  assert.equal(sends, 1, 'a stale handler must honor the new deadline');
  screen.render();
  assert.equal(screen.field.value, '');
  assert.match(screen.resend.accessibilityValue.text, /^60 秒/);
});

test('parent busy during resend does not mislabel the verify action as loading', async () => {
  const request = deferred();
  const screen = mount({ onResend: () => request.promise });
  screen.advance(60_000, { tick: true });
  const pending = screen.resend.onPress();
  screen.render({ loading: true });
  assert.equal(screen.submit.disabled, true);
  assert.equal(screen.submit.loading, false);
  assert.equal(screen.submit.label, '验证并继续');
  assert.equal(screen.resend.accessibilityState.busy, true);
  assert.match(screen.copy, /正在发送/);
  request.resolve(); await pending; screen.render({ loading: false });
  assert.equal(screen.submit.loading, false);
  assert.equal(screen.resend.accessibilityState.busy, false);
});

test('verification failures retain the code and permit a real retry', async () => {
  let calls = 0;
  const screen = mount({ onVerify: async () => { calls += 1; throw new Error('网络连接失败，请重试'); } });
  screen.fill('123456');
  await screen.submit.onPress(); screen.render();
  assert.match(screen.error, /网络连接失败/);
  assert.equal(screen.field.value, '123456');
  assert.equal(screen.submit.disabled, false);
  await screen.submit.onPress();
  assert.equal(calls, 2);
});

test('expired-code recovery unlocks resend without bypassing the next cooldown', async () => {
  const screen = mount({ error: '验证码已过期' });
  assert.equal(screen.resend.disabled, false);
  await screen.resend.onPress(); screen.render();
  assert.equal(screen.resend.disabled, true);
  screen.advance(1_000, { resume: true });
  assert.match(screen.resend.accessibilityValue.text, /^59 秒/);
});

test('failed resend preserves the code and does not claim delivery or restart cooldown', async () => {
  const screen = mount({ error: '验证码已过期', onResend: async () => { throw new Error('发送失败'); } });
  screen.fill('123456');
  await screen.resend.onPress(); screen.render();
  assert.equal(screen.field.value, '123456');
  assert.equal(screen.resend.disabled, false);
  assert.equal(screen.error, '发送失败');
});

test('unmount removes lifecycle resources and ignores a late resend completion', async () => {
  const request = deferred();
  const screen = mount({ error: '验证码已过期', onResend: () => request.promise });
  const pending = screen.resend.onPress();
  screen.unmount(); request.resolve(); await pending;
  assert.equal(screen.resourceCount, 0);
  assert.equal(screen.writesAfterUnmount, 0);
});

test('an eight-digit recovery email OTP keeps its leading zero and verifies intact', async () => {
  const submitted = [];
  const screen = mount({ purpose: 'password-recovery', onVerify: async code => submitted.push(code) });

  screen.fill('01234567');

  assert.equal(screen.field.value, '01234567');
  assert.equal(screen.submit.disabled, false);
  await screen.submit.onPress();
  assert.deepEqual(submitted, ['01234567']);
});

test('email OTP accepts 6 through 10 digits and keeps an 11-digit value invalid', async () => {
  for (const code of ['012345', '01234567', '0123456789']) {
    let submitted;
    const screen = mount({ onVerify: async value => { submitted = value; } });
    screen.fill(code);
    assert.equal(screen.submit.disabled, false, `${code.length} digits should be complete`);
    await screen.submit.onPress();
    assert.equal(submitted, code);
  }

  const overflow = mount();
  overflow.fill('01234567890');
  assert.equal(overflow.field.value, '01234567890');
  assert.equal(overflow.submit.disabled, true);
  await overflow.submit.onPress(); overflow.render();
  assert.match(overflow.error, /6–10 位数字/);
});

test('a formatted ten-digit paste is normalized only after the full native value arrives', async () => {
  let submitted;
  const screen = mount({ onVerify: async code => { submitted = code; } });

  screen.fill('0123 4567 89');

  assert.equal(screen.field.value, '0123456789');
  assert.equal(screen.submit.disabled, false);
  await screen.submit.onPress();
  assert.equal(submitted, '0123456789');
});

test('non-numeric pasted content stays invalid; external busy locks every action', async () => {
  let calls = 0;
  const screen = mount({ loading: true, onVerify: () => { calls += 1; }, onResend: () => { calls += 1; }, onBackToLogin: () => { calls += 1; } });
  await screen.submit.onPress(); await screen.resend.onPress(); screen.back.onPress();
  assert.equal(calls, 0);
  screen.render({ loading: false }); screen.fill('12-a');
  assert.equal(screen.field.value, '12-a');
  await screen.submit.onPress(); screen.render();
  assert.equal(calls, 0);
  assert.match(screen.error, /6–10 位数字/);
});

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const appAst = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function appHandler(name, context) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(appAst);
  assert.ok(initializer, `Missing actual App handler ${name}`);
  return vm.runInNewContext(compile(`const handler = ${initializer.getText(appAst)}; handler;`), context);
}

for (const purpose of ['signup', 'password-recovery']) {
  test(`App ${purpose}: verification shares the synchronous delivery/navigation lock`, async () => {
    const request = deferred();
    let calls = 0;
    const context = {
      pendingVerification: { purpose, email: 'qa@example.com' }, accountBusy: false,
      otpDeliveryInFlightRef: { current: false },
      authService: { verifySignupOtp: () => { calls += 1; return request.promise; }, verifyPasswordRecoveryOtp: () => { calls += 1; return request.promise; } },
      setAccountBusy() {}, setAuthError() {}, setPendingVerification() {}, setRecoveryLink() {}, setPasswordNonceRequired() {}, setStage() {}, notify() {}, humanizeAuthError: error => error.message,
    };
    const verify = appHandler(purpose === 'signup' ? 'handleVerifySignupOtp' : 'handleVerifyRecoveryOtp', context);
    const pending = verify('123456');
    assert.equal(context.otpDeliveryInFlightRef.current, true, 'hardware-back observes this ref before React re-renders');
    await verify('123456'); assert.equal(calls, 1);
    request.reject(new Error('Verification failed'));
    await assert.rejects(pending, /Verification failed/);
    assert.equal(context.otpDeliveryInFlightRef.current, false);
    context.otpDeliveryInFlightRef.current = true;
    await verify('123456'); assert.equal(calls, 1, 'in-flight resend blocks verification');
  });
}
