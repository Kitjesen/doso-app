import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const mount = props => mountAuthScreen({ screen: 'login', ...props });

test('QA device entry works without email or password and shares the busy navigation lock', async () => {
  let entries = 0; let legacyConnections = 0;
  const screen = mount({ onLogin: () => assert.fail('device test must not log in'),
    onEnterDeviceTest: () => entries++, onOpenRobotConnection: () => legacyConnections++ });
  screen.action('login-device-test').props.onPress();
  assert.equal(entries, 1); assert.equal(legacyConnections, 0);
  assert.equal(screen.action('login-robot-connection'), undefined);
  assert.equal(screen.field('邮箱地址').props.value, '');
  const locked = mount({ loading: true, onLogin: () => {}, onEnterDeviceTest: () => entries++ });
  locked.action('login-device-test').props.onPress();
  assert.equal(entries, 1);
  assert.equal(locked.action('login-device-test').props.disabled, true);
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
  assert.ok(screen.action('login-robot-connection'));
  assert.match(screen.copy, /连接机器狗/);
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

test('guest entry is explicit, works without credentials, and does not submit login', () => {
  let guests = 0, logins = 0;
  const screen = mount({ onLogin: () => { logins++; }, onEnterGuest: () => { guests++; } });
  const entry = screen.action('login-guest');
  assert.ok(entry);
  assert.equal(entry.props.disabled, false);
  entry.props.onPress();
  assert.equal(guests, 1); assert.equal(logins, 0);
  assert.equal(screen.field('邮箱地址').props.value, '');
  assert.equal(screen.field('密码').props.value, '');
  assert.equal(mount({}).action('login-guest'), undefined);
});

test('login in-flight blocks both current and retained guest handlers until it settles', async () => {
  let guests = 0, finish;
  const screen = mount({ onLogin: () => new Promise(resolve => { finish = resolve; }), onEnterGuest: () => { guests++; } });
  fill(screen);
  const retainedGuestPress = screen.action('login-guest').props.onPress;
  const pending = screen.action('login-submit').props.onPress();
  retainedGuestPress(); assert.equal(guests, 0, 'same-tick guest navigation must respect the in-flight ref');
  screen.render();
  assert.equal(screen.action('login-guest').props.disabled, true);
  screen.action('login-guest').props.onPress(); assert.equal(guests, 0);
  finish(); await pending; screen.render();
  screen.action('login-guest').props.onPress(); assert.equal(guests, 1);
});
