import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]));
const providerAction = (screen, provider) => screen.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel?.replaceAll(' ', '') === `使用${provider === 'apple' ? 'Apple' : provider === 'wechat' ? '微信' : 'QQ'}登录`);

for (const mode of ['login', 'register']) test(`${mode}: third-party actions and help are absent from the email entry page`, async () => {
  let calls = 0;
  const screen = mountAuthScreen({ screen: mode, onSocialLogin: () => calls++ });
  assert.doesNotMatch(screen.copy, /暂不可用|当前版本尚未开放|无需第三方账户/);
  assert.equal(screen.action(`${mode}-social-help`), undefined);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'auth-social-options'), false);
  for (const provider of ['apple', 'wechat', 'qq']) {
    assert.equal(providerAction(screen, provider), undefined);
  }
  assert.equal(calls, 0);
  assert.doesNotMatch(screen.copy, /当前版本尚未开放|无需第三方账户/);
});

test('partial readiness exposes specific reasons and leaves only a ready provider actionable', async () => {
  const calls = [];
  const screen = mountAuthScreen({ screen: 'social-entry', ready: ['wechat'], onPress: provider => calls.push(provider), readiness: {
    apple: { blockerCodes: ['platform-unsupported'] }, qq: { blockerCodes: ['redirect-uri-missing'] },
  } });
  screen.action('login-social-help').props.onPress(); screen.render();
  assert.match(screen.copy, /这台设备不支持此登录方式/);
  assert.match(screen.copy, /授权返回地址尚未配置完成/);
  assert.match(screen.copy, /可以使用，点按上方图标/);
  await providerAction(screen, 'apple').props.onPress();
  await providerAction(screen, 'qq').props.onPress();
  await providerAction(screen, 'wechat').props.onPress();
  assert.deepEqual(calls, ['wechat']);
});

for (const kind of ['social-entry', 'social-legacy']) test(`${kind}: authorization locks duplicate/stale callbacks and visibly selects just one provider`, async () => {
  let finish;
  const calls = [];
  const screen = mountAuthScreen({ screen: kind, ready: ['wechat', 'qq'], onPress: provider => {
    calls.push(provider); return new Promise(resolve => { finish = resolve; });
  } });
  const invokeWechat = providerAction(screen, 'wechat').props.onPress;
  const invokeQQ = providerAction(screen, 'qq').props.onPress;
  const pending = invokeWechat();
  await invokeWechat(); await invokeQQ();
  assert.deepEqual(calls, ['wechat']);
  screen.render();
  assert.equal(providerAction(screen, 'wechat').props.accessibilityState.busy, true);
  assert.equal(providerAction(screen, 'wechat').props.accessibilityState.selected, true);
  assert.equal(providerAction(screen, 'qq').props.accessibilityState.selected, false);
  assert.equal(providerAction(screen, 'qq').props.disabled, true);
  assert.match(screen.copy, /正在打开 微信 授权/);
  assert.equal(screen.nodes.filter(node => node.type === 'ActivityIndicator').length, 1);
  finish(); await pending; screen.render({ busy: true });
  await invokeWechat();
  assert.equal(calls.length, 1, 'retained handler must honor the latest busy prop');
  screen.render({ busy: false });
  assert.doesNotMatch(screen.copy, /正在打开 微信 授权/);
  const next = invokeQQ(); finish(); await next;
  assert.deepEqual(calls, ['wechat', 'qq']);
});

test('retained handler rechecks readiness and callback removal before dispatch', async () => {
  const ready = ['wechat'];
  let calls = 0;
  const screen = mountAuthScreen({ screen: 'social-entry', ready, onPress: () => calls++ });
  const invoke = providerAction(screen, 'wechat').props.onPress;
  ready.pop(); await invoke();
  assert.equal(calls, 0);
  ready.push('wechat'); screen.render({ onPress: undefined }); await invoke();
  assert.equal(calls, 0);
  screen.action('login-social-help').props.onPress(); screen.render();
  assert.match(screen.copy, /当前为界面预览，不会发起账户授权/);
});

test('provider error releases the local guard and late completion does not update an unmounted screen', async () => {
  const screen = mountAuthScreen({ screen: 'social-entry', ready: ['wechat'], onPress: async () => { throw new Error('授权失败'); } });
  await assert.rejects(providerAction(screen, 'wechat').props.onPress, /授权失败/);
  screen.render();
  assert.equal(providerAction(screen, 'wechat').props.disabled, false);
  let complete;
  screen.render({ onPress: () => new Promise(resolve => { complete = resolve; }) });
  const pending = providerAction(screen, 'wechat').props.onPress();
  screen.unmount(); complete(); await pending;
  assert.equal(screen.updatesAfterUnmount, 0);
});

test('compact landscape and large text keep readable, expandable help and 44dp provider targets', () => {
  for (const fontScale of [1, 1.5]) {
    const screen = mountAuthScreen({ screen: 'social-entry', width: 844, height: 390, fontScale });
    const help = screen.action('login-social-help');
    assert.ok(flatten(help.props.style({ pressed: false })).minHeight >= 44);
    help.props.onPress(); screen.render();
    assert.match(screen.copy, /当前为界面预览/);
    for (const provider of ['apple', 'wechat', 'qq']) {
      const style = flatten(providerAction(screen, provider).props.style({ pressed: false }));
      assert.ok(style.minHeight >= 44 && style.minWidth >= 44);
    }
  }
  const legacy = mountAuthScreen({ screen: 'social-legacy', compact: true });
  const compact = flatten(providerAction(legacy, 'wechat').props.style({ pressed: false }));
  assert.ok(compact.height >= 44 && compact.width >= 44);
});
