import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]));
for (const screen of ['login', 'register']) {
  for (const dark of [false, true]) {
    test(`${screen} ${dark ? 'dark' : 'light'}: solid canvas, one product image, readable CTA`, () => {
      const app = mountAuthScreen({ screen, dark });
      const canvas = app.nodes.find(node => node.type === 'SafeAreaView');
      assert.equal(flatten(canvas.props.style).backgroundColor, dark ? '#17191D' : '#FFFFFF');
      assert.equal(app.nodes.filter(node => node.type === 'Image' && node.props.source === 'figma-thunder-robot').length, 1);
      assert.equal(app.nodes.filter(node => node.type === 'Image').length, 2, 'only product and logo, no decorative full-page raster');
      const button = app.action(`${screen}-submit`);
      const style = flatten(button.props.style({ pressed: false }));
      assert.equal(style.backgroundColor, '#98D1FF');
      assert.ok(style.minHeight >= 44);
      assert.doesNotMatch(app.copy, /暂不可用|下一步.*邮箱验证/);
    });
  }
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
