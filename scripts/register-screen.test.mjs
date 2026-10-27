import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen as mount } from './helpers/auth-screen-harness.mjs';
test('empty submission focuses the first invalid field and sends nothing', async () => {
  let calls = 0;
  const screen = mount({ onRegister: () => { calls += 1; } });
  await screen.action('register-submit').props.onPress();
  screen.render();
  assert.equal(calls, 0);
  assert.ok(screen.focusCount > 0);
  assert.match(screen.copy, /请输入邮箱地址/);
  assert.match(screen.copy, /密码至少 10 位/);
});

test('valid submission normalizes identity, preserves password, and locks same-tick duplicates/back', async () => {
  const payloads = [];
  let back = 0;
  let resolve;
  const screen = mount({ onRegister: values => { payloads.push(values); return new Promise(done => { resolve = done; }); }, onBackToLogin: () => { back += 1; } });
  screen.fill();
  const submit = screen.action('register-submit').props.onPress;
  const leave = screen.action('register-login').props.onPress;
  const pending = submit();
  await submit();
  leave();
  assert.equal(payloads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(payloads[0])), { username: 'explorer_01', email: 'user@example.com', password: 'StrongPass123' });
  assert.equal(back, 0);
  screen.render();
  assert.equal(screen.action('register-submit').props.accessibilityState.busy, true);
  for (const label of ['用户名', '电子邮箱', '密码']) assert.equal(screen.field(label).props.editable, false);
  resolve();
  await pending;
  screen.render();
  screen.action('register-login').props.onPress();
  assert.equal(back, 1);
});

test('request failures remain visible and retryable without losing input', async () => {
  let calls = 0;
  const screen = mount({ onRegister: async () => { calls += 1; throw new Error('网络连接失败，请稍后重试'); } });
  screen.fill();
  await screen.action('register-submit').props.onPress();
  screen.render();
  assert.match(screen.copy, /网络连接失败，请稍后重试/);
  assert.equal(screen.field('密码').props.value, 'StrongPass123');
  assert.equal(screen.action('register-submit').props.disabled, false);
  await screen.action('register-submit').props.onPress();
  assert.equal(calls, 2);
});

test('username reservation, password requirements, keyboard focus and visibility remain functional', async () => {
  let calls = 0;
  const screen = mount({ onRegister: () => { calls += 1; } });
  screen.fill('admin', 'valid@example.com', 'alllowercase1');
  await screen.action('register-submit').props.onPress();
  screen.render();
  assert.equal(calls, 0);
  assert.match(screen.copy, /该用户名不可使用/);
  const previousFocus = screen.focusCount;
  screen.field('用户名').props.onSubmitEditing();
  screen.field('电子邮箱').props.onSubmitEditing();
  assert.equal(screen.focusCount, previousFocus + 2);
  assert.equal(screen.field('密码').props.secureTextEntry, true);
  screen.action('register-password-visibility').props.onPress();
  screen.render();
  assert.equal(screen.field('密码').props.secureTextEntry, false);
});

for (const dark of [false, true]) {
  test(`registration ${dark ? 'dark' : 'light'} keeps email fields and artwork without third-party entry points`, () => {
    const screen = mount({ dark, width: 844 });
    assert.doesNotMatch(screen.copy, /忘记密码|SAFE AREA|模拟成功/);
    assert.equal(screen.nodes.filter(node => node.type === 'TextInput').length, 3);
    assert.equal(screen.nodes.some(node => node.props?.testID === 'auth-social-options'), false);
    assert.equal(screen.nodes.some(node => node.props?.testID?.startsWith('register-social-')), false);
    assert.doesNotMatch(screen.copy, /其他方式|Apple|微信|QQ/);
    assert.doesNotMatch(screen.copy, /暂不可用|暂未开放|下一步/);
    assert.deepEqual(Array.from(screen.nodes.find(node => node.type === 'SafeAreaView').props.edges), ['top', 'left', 'right', 'bottom']);
    const images = screen.nodes.filter(node => node.type === 'Image' && node.props.source !== 'doso-soft-air');
    assert.equal(images.length, 2);
    assert.equal(images[0].props.source, 'doso-auth-lockup-sky-v2');
    assert.equal(images[1].props.source, 'figma-thunder-robot');
    assert.ok(images.every(image => image.props.resizeMode === 'contain'));
  });
}

test('email registration visibly reports the pending request and restores its action after completion', async () => {
  let complete;
  const screen = mount({ onRegister: () => new Promise(resolve => { complete = resolve; }) });
  screen.fill();
  const pending = screen.action('register-submit').props.onPress();
  screen.render();
  assert.equal(screen.action('register-submit').props.disabled, true);
  assert.equal(screen.action('register-submit').props.accessibilityState.busy, true);
  assert.match(screen.copy, /正在创建账户/);
  complete();
  await pending;
  screen.render();
  assert.equal(screen.action('register-submit').props.disabled, false);
  assert.doesNotMatch(screen.copy, /正在创建账户/);
});
