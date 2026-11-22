import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]));
for (const screen of ['register']) {
  for (const dark of [false, true]) {
    test(`${screen} ${dark ? 'dark' : 'light'}: shared DOSO surface, one wordmark, readable CTA`, () => {
      const app = mountAuthScreen({ screen, dark });
      const canvas = app.nodes.find(node => node.props?.testID === 'auth-surface');
      assert.equal(flatten(canvas.props.style).backgroundColor, dark ? '#1C1C1B' : '#EFF7F8');
      assert.equal(app.nodes.filter(node => node.type === 'Image' && node.props.accessibilityLabel === 'DOSO ROBOTICS').length, 1);
      assert.equal(app.nodes.filter(node => node.type === 'Image').length, 1, 'only the wordmark is rendered by the shared auth surface');
      assert.ok(app.nodes.some(node => node.type === 'LinearGradient'));
      assert.ok(app.nodes.some(node => node.type === 'BlurView'));
      const button = app.action(`${screen}-submit`);
      const style = flatten(button.props.style({ pressed: false }));
      assert.equal(style.backgroundColor, dark ? '#E8E8E6' : '#98D1FF');
      assert.ok(style.minHeight >= 44);
      assert.doesNotMatch(app.copy, /暂不可用|下一步.*邮箱验证/);
    });
  }
}

for (const dark of [false, true]) {
  test(`login ${dark ? 'dark' : 'light'} uses the brand wordmark over a blurred gradient`, () => {
    const app = mountAuthScreen({ screen: 'login', dark });
    assert.ok(app.nodes.some(node => node.type === 'LinearGradient'));
    const brand = app.nodes.find(node => node.type === 'Image' && node.props.accessibilityLabel === 'DOSO ROBOTICS');
    assert.ok(brand);
    assert.equal(brand.props.source, 'doso-robotics-wordmark');
    assert.equal(flatten(brand.props.style).tintColor, '#FFFFFF');
    assert.equal(app.nodes.some(node => node.type === 'Image' && node.props.source === 'figma-thunder-robot'), false);
    assert.equal(app.nodes.filter(node => node.type === 'Image').length, 1);
    assert.ok(app.nodes.some(node => node.type === 'BlurView'));
    const slogan = app.nodes.find(node => node.type === 'Text' && node.props.accessibilityRole === 'header');
    assert.equal(flatten(slogan.props.style).color, '#FFFFFF');
    const header = app.nodes.find(node => node.props?.testID === 'auth-entry-header');
    assert.equal(flatten(header.props.style).alignItems, 'center');
    const button = app.action('login-submit');
    const style = flatten(button.props.style({ pressed: false }));
    assert.ok(style.minHeight >= 44);
    assert.equal(button.props.disabled, false);
    assert.equal(app.nodes.filter(node => node.type === 'TextInput').length, 2);
  });
}

test('focused field keeps a solid fill and uses a blue outline', () => {
  const app = mountAuthScreen();
  app.field('电子邮箱').props.onFocus({});
  app.render();
  const focusFrames = app.nodes.filter(node => node.type === 'View' && flatten(node.props.style).borderColor === '#214F71');
  assert.equal(focusFrames.length, 1);
  assert.equal(flatten(focusFrames[0].props.style).backgroundColor, '#F4F7FA');
  assert.equal(flatten(focusFrames[0].props.style).boxShadow, undefined);
});
