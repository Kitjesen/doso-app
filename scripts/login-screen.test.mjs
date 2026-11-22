import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const mount = props => mountAuthScreen({ screen: 'login', ...props });

for (const [width, height] of [[390, 844], [960, 600]]) test(`login omits auxiliary entries at ${width}x${height}`, () => {
  const unused = () => assert.fail('removed login entry must not run');
  const screen = mount({ width, height, onLogin: unused, onEnterDeviceTest: unused, onOpenRobotConnection: unused,
    onEnterGuest: unused, onOpenDataPrivacy: unused, onOpenConnectionDiagnostics: unused });
  for (const entry of ['device-test', 'robot-connection', 'guest', 'data-privacy', 'connection-diagnostics']) {
    assert.equal(screen.action(`login-${entry}`), undefined);
  }
  assert.doesNotMatch(screen.copy, /进入设备测试|连接机器狗|游客使用|数据与隐私|连接诊断/);
  assert.ok(screen.action('login-submit'));
  assert.ok(screen.action('login-forgot-password'));
});
function fill(screen, email = ' USER@Example.com ', password = 'Original password 1') {
  screen.field('邮箱地址').props.onChangeText(email); screen.render();
  screen.field('密码').props.onChangeText(password); screen.render();
}

test('login validates locally, focuses the invalid field, and normalizes only the email', async () => {
  const calls = [];
  const screen = mount({ onLogin: (...args) => calls.push(args) });
  await screen.action('login-submit').props.onPress(); screen.render();
  assert.equal(calls.length, 0);
  assert.equal(screen.focusCount, 1);
  assert.match(screen.copy, /请输入邮箱地址/);
  fill(screen, 'invalid');
  await screen.action('login-submit').props.onPress(); screen.render();
  assert.equal(calls.length, 0);
  assert.match(screen.copy, /请输入有效的邮箱地址/);
  fill(screen);
  await screen.action('login-submit').props.onPress();
  assert.deepEqual(calls, [['user@example.com', 'Original password 1']]);
});

test('login locks duplicate email, register, and recovery actions in the same tick', async () => {
  let finish; let calls = 0; let other = 0;
  const screen = mount({ onLogin: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, onCreateAccount: () => other++, onForgotPassword: () => other++ });
  fill(screen);
  const submit = screen.action('login-submit').props.onPress;
  const pending = submit();
  await submit();
  screen.action('login-register').props.onPress();
  screen.action('login-forgot-password').props.onPress();
  assert.equal(calls, 1); assert.equal(other, 0);
  screen.render();
  assert.equal(screen.field('密码').props.editable, false);
  assert.equal(screen.action('login-submit').props.accessibilityState.busy, true);
  finish(); await pending; screen.render();
  screen.action('login-register').props.onPress();
  screen.action('login-forgot-password').props.onPress();
  assert.equal(other, 2);
});

test('login service failure is visible and retryable, without clearing credentials', async () => {
  let calls = 0;
  const screen = mount({ onLogin: async () => { calls++; throw new Error('邮箱或密码不正确'); } });
  fill(screen);
  await screen.action('login-submit').props.onPress(); screen.render();
  assert.match(screen.copy, /邮箱或密码不正确/);
  assert.equal(screen.field('密码').props.value, 'Original password 1');
  assert.equal(screen.action('login-submit').props.disabled, false);
  await screen.action('login-submit').props.onPress();
  assert.equal(calls, 2);
});

test('login keyboard progression, password visibility, and corrected field errors work', () => {
  const screen = mount({ fieldErrors: { email: '邮箱格式不正确' } });
  assert.match(screen.copy, /邮箱格式不正确/);
  fill(screen);
  assert.doesNotMatch(screen.copy, /邮箱格式不正确/);
  screen.field('邮箱地址').props.onSubmitEditing();
  assert.equal(screen.focusCount, 1);
  assert.equal(screen.field('密码').props.secureTextEntry, true);
  screen.action('login-password-visibility').props.onPress(); screen.render();
  assert.equal(screen.field('密码').props.secureTextEntry, false);
});

for (const dark of [false, true]) test(`login ${dark ? 'dark' : 'light'} omits alternate sign-in actions`, () => {
  const screen = mount({ dark, onSocialLogin: () => { throw new Error('alternate sign-in should not be mounted'); } });
  assert.equal(screen.nodes.some(node => node.props?.testID === 'auth-social-options'), false);
  assert.equal(screen.nodes.some(node => node.props?.testID?.startsWith('login-social-')), false);
  assert.doesNotMatch(screen.copy, /其他方式|Apple|微信|QQ/);
  assert.equal(screen.nodes.filter(node => node.type === 'TextInput').length, 2);
});

test('compact G20 landscape login keeps only the primary actions on one surface', () => {
  const screen = mount({ width: 960, height: 600, onOpenDataPrivacy: () => {}, onOpenConnectionDiagnostics: () => {}, onOpenRobotConnection: () => {} });
  assert.equal(screen.nodes.some(node => node.props?.testID === 'auth-social-options'), false);
  assert.equal(screen.action('login-data-privacy'), undefined);
  assert.equal(screen.action('login-connection-diagnostics'), undefined);
  assert.equal(screen.action('login-robot-connection'), undefined);
  assert.doesNotMatch(screen.copy, /其他方式|Apple|微信|QQ/);
});

test('late login rejection does not update an unmounted screen', async () => {
  let reject;
  const screen = mount({ onLogin: () => new Promise((_, fail) => { reject = fail; }) });
  fill(screen);
  const pending = screen.action('login-submit').props.onPress();
  screen.unmount(); reject(new Error('late failure')); await pending;
  assert.equal(screen.updatesAfterUnmount, 0);
});

