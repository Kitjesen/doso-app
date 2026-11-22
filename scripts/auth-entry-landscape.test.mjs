import assert from 'node:assert/strict';
import test from 'node:test';

import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]));

for (const screen of ['register']) {
test(`${screen} 844x390 keeps the current glass auth surface without secondary login choices`, () => {
    const app = mountAuthScreen({ screen, width: 844, height: 390 });
    const socialSection = app.nodes.find(node => node.props?.testID === 'auth-social-options');
    const socialRow = app.nodes.find(node => node.props?.testID === 'auth-social-row');
    const header = app.nodes.find(node => node.props?.testID === 'auth-entry-header');
    const form = app.nodes.find(node => node.props?.testID === `${screen}-form`);
    const submit = app.action(`${screen}-submit`);

    assert.equal(socialSection, undefined);
    assert.equal(socialRow, undefined);
    assert.doesNotMatch(app.copy, /其他方式|Apple|微信|QQ/);
    assert.equal(flatten(header.props.style).alignItems, 'center');
    assert.equal(flatten(form.props.style).borderRadius, 28);
    assert.equal(flatten(submit.props.style({ pressed: false })).minHeight, 52);

    const inputs = app.nodes.filter(node => node.type === 'TextInput');
    assert.equal(inputs.length, screen === 'login' ? 2 : 3);
    assert.ok(inputs.every(input => flatten(input.props.style).fontSize === 17));
    const inputFrames = app.nodes.filter(node => node.type === 'View' && flatten(node.props.style).borderRadius === 16 && flatten(node.props.style).minHeight === 48);
    assert.equal(inputFrames.length, inputs.length);
  });
}

for (const [width, height, fontScale] of [[390, 844, 1], [844, 390, 1], [844, 390, 1.5]]) {
  test(`login form remains available at ${width}x${height} with font scale ${fontScale}`, () => {
    const app = mountAuthScreen({ screen: 'login', width, height, fontScale });
    assert.ok(app.nodes.find(node => node.props?.testID === 'login-form'));
    const scroll = app.nodes.find(node => node.type === 'ScrollView');
    assert.equal(flatten(scroll.props.contentContainerStyle).flexGrow, 1);
    const inputs = app.nodes.filter(node => node.type === 'TextInput');
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every(input => input.props.editable !== false));
    assert.ok(inputs.every(input => flatten(input.props.style).fontSize >= 16));
    const submit = app.action('login-submit');
    assert.equal(typeof submit.props.onPress, 'function');
    assert.ok(flatten(submit.props.style({ pressed: false })).minHeight >= 44);
    assert.ok(app.action('login-forgot-password'));
    assert.equal(app.nodes.some(node => node.props?.testID === 'auth-social-options'), false);
    assert.doesNotMatch(app.copy, /其他方式|Apple|微信|QQ|连接机器狗|游客使用/);
  });
}

test('portrait keeps a full-width email form without a provider row', () => {
  const app = mountAuthScreen({ screen: 'register', width: 390, height: 844 });
  const socialSection = app.nodes.find(node => node.props?.testID === 'auth-social-options');
  const form = app.nodes.find(node => node.props?.testID === 'register-form');
  assert.equal(socialSection, undefined);
  assert.equal(flatten(form.props.style).borderRadius, 28);
  assert.doesNotMatch(app.copy, /其他方式|Apple|微信|QQ/);
});

test('large text falls back to the scrollable stacked layout instead of compressing controls', () => {
  const app = mountAuthScreen({ screen: 'register', width: 844, height: 390, fontScale: 1.5 });
  const scroll = app.nodes.find(node => node.type === 'ScrollView');
  const socialSection = app.nodes.find(node => node.props?.testID === 'auth-social-options');
  assert.equal(flatten(scroll.props.contentContainerStyle).flexGrow, 1);
  assert.equal(socialSection, undefined);
  assert.equal(flatten(app.action('register-submit').props.style({ pressed: false })).minHeight, 52);
  assert.doesNotMatch(app.copy, /其他方式|Apple|微信|QQ/);
});
