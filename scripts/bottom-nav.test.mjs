import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const robotTabs = [
  ['control', '控制'],
  ['status', '状态'],
  ['settings', '设置'],
];

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

function robotNav(props = {}) {
  return mountAuthScreen({ screen: 'robot-nav', active: 'control', onChange: () => {}, ...props });
}

test('offers three named robot destinations with usable touch targets in either orientation', () => {
  for (const orientation of [{ width: 753, height: 471 }, { width: 360, height: 760 }]) {
    const calls = [];
    const screen = robotNav({ ...orientation, active: 'status', onChange: tab => calls.push(tab) });
    const rendered = screen.nodes.filter(node => node.props?.accessibilityRole === 'tab');
    assert.deepEqual(rendered.map(tab => tab.props.testID), robotTabs.map(([key]) => `nav-${key}`));
    assert.deepEqual(rendered.map(tab => tab.props.accessibilityLabel), robotTabs.map(([, title]) => title));
    assert.deepEqual(rendered.filter(tab => tab.props.accessibilityState.selected).map(tab => tab.props.testID), ['nav-status']);
    for (const [key, title] of robotTabs) {
      const tab = screen.action(`nav-${key}`);
      assert.ok(screen.copy.includes(title));
      assert.ok(flatten(tab.props.style({ pressed: false })).minHeight >= 48);
      tab.props.onPress();
    }
    assert.deepEqual(calls, robotTabs.map(([key]) => key));
    const outer = flatten(screen.nodes[0].props.style);
    assert.equal(outer.position, orientation.width > orientation.height ? 'absolute' : undefined);
  }
});

test('underlines the active robot tab across portrait and landscape', () => {
  const screen = robotNav({ active: 'settings', width: 390, height: 844 });
  for (const [key] of robotTabs) {
    const indicator = screen.nodes.find(node => node.props?.testID === `nav-indicator-${key}`);
    const style = flatten(indicator.props.style);
    assert.equal(style.width, 16);
    assert.equal(style.height, 2);
    assert.equal(style.borderRadius, 1);
    assert.equal(style.backgroundColor === 'transparent', key !== 'settings');
  }
});

test('places the landscape robot rail cleanly and clears system insets', () => {
  const screen = robotNav({ width: 753, height: 471, insets: { top: 24, bottom: 48, left: 0, right: 16 } });
  const outer = flatten(screen.nodes[0].props.style);
  assert.equal(outer.top, 78);
  assert.equal(outer.bottom, 68);
  assert.equal(outer.right, 30);
  assert.equal(outer.paddingTop, 0);
  assert.equal(outer.paddingBottom, 0);

  screen.resize({ width: 390, height: 844 });
  const portraitOuter = flatten(screen.nodes[0].props.style);
  assert.equal(portraitOuter.position, undefined);
  assert.equal(portraitOuter.paddingTop, 6);
});
