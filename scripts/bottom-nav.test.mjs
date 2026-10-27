import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const tabs = [
  ['home', 'home-outline'],
  ['map', 'map-outline'],
  ['tasks', 'reader-outline'],
  ['analysis', 'stats-chart-outline'],
  ['profile', 'person-outline'],
];

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('an absolute landscape rail clears real system edges and does not inherit portrait vertical padding', () => {
  const screen = nav({ width: 753, height: 471, insets: { top: 24, bottom: 48, left: 0, right: 16 } });
  const outer = flatten(screen.nodes[0].props.style);
  assert.equal(outer.top, 78);
  assert.equal(outer.bottom, 68);
  assert.equal(outer.right, 30);
  assert.equal(outer.paddingTop, 0);
  assert.equal(outer.paddingBottom, 0);
});

test('keeps every tab callback wired to its own tab key', () => {
  const calls = [];
  const screen = nav({ onChange: key => calls.push(key) });
  for (const [key] of tabs) screen.action(`nav-${key}`).props.onPress();
  assert.deepEqual(calls, tabs.map(([key]) => key));
});

test('exposes five labelled tabs with exactly one selected tab on native and web', () => {
  for (const [active] of tabs) {
    const screen = nav({ active });
    const renderedTabs = tabs.map(([key]) => screen.action(`nav-${key}`));
    assert.deepEqual(renderedTabs.map(tab => tab.props.accessibilityLabel), ['首页', '地图', '任务', '分析', '我的']);
    assert.ok(renderedTabs.every(tab => tab.props.accessibilityRole === 'tab'));
    assert.deepEqual(renderedTabs.filter(tab => tab.props.accessibilityState.selected).map(tab => tab.props.testID), [`nav-${active}`]);
    assert.deepEqual(renderedTabs.filter(tab => tab.props['aria-selected']).map(tab => tab.props.testID), [`nav-${active}`]);
    assert.ok(renderedTabs.every(tab => tab.props['aria-selected'] === tab.props.accessibilityState.selected));
  }
});

test('renders the five tabs as icon-only Ionicons', () => {
  const screen = nav();
  assert.equal(screen.copy, '');
  assert.equal(screen.nodes.filter(node => node.type === 'Text').length, 0);
  assert.deepEqual(
    screen.nodes.filter(node => node.type === 'Ionicons').map(node => [node.props.name, node.props.size]),
    tabs.map(([, icon]) => [icon, 22]),
  );
  assert.equal(screen.nodes.filter(node => node.type === 'Image').length, 0);
});

test('gives each portrait tab an equal flexible 48dp touch target', () => {
  for (const width of [320, 390]) {
    const screen = nav({ width, height: 844 });
    for (const [key] of tabs) {
      const style = flatten(screen.action(`nav-${key}`).props.style({ pressed: false }));
      assert.equal(style.flex, 1);
      assert.ok(style.minWidth >= 48);
      assert.ok(style.minHeight >= 48);
    }
  }
});

test('uses a 36dp rounded highlight around the selected 22dp icon', () => {
  const screen = nav({ active: 'tasks' });
  for (const [key] of tabs) {
    const indicator = screen.nodes.find(node => node.props?.testID === `nav-indicator-${key}`);
    const style = flatten(indicator.props.style);
    assert.equal(style.width, 36);
    assert.equal(style.height, 36);
    assert.equal(style.borderRadius, 12);
    assert.equal(style.backgroundColor === 'transparent', key !== 'tasks');
  }
});

test('renders a 56dp white portrait bar with a tiny light-theme shadow', () => {
  const screen = nav({ dark: false, width: 390, height: 844 });
  const style = flatten(screen.nodes.find(node => node.props?.testID === 'main-navigation').props.style);
  assert.equal(style.height, 56);
  assert.equal(style.backgroundColor, '#FFFFFF');
  assert.match(style.boxShadow, /rgba\([^)]*,\s*0\.0\d+\)/);
});

test('renders the dark portrait bar in graphite without a light shadow', () => {
  const screen = nav({ dark: true, width: 390, height: 844 });
  const style = flatten(screen.nodes.find(node => node.props?.testID === 'main-navigation').props.style);
  assert.equal(style.height, 56);
  assert.equal(style.backgroundColor, '#24272D');
  assert.equal(style.boxShadow, 'none');
});

test('places the landscape rail at the reserved right-side geometry', () => {
  const screen = nav({ width: 844, height: 390, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  const outer = flatten(screen.nodes[0].props.style);
  const rail = flatten(screen.nodes.find(node => node.props?.testID === 'main-navigation').props.style);
  assert.equal(outer.width, 56);
  assert.equal(outer.right, 14);
  assert.equal(outer.top, 54);
  assert.equal(outer.bottom, 20);
  assert.equal(rail.flexDirection, 'column');
  assert.ok(rail.minHeight >= 5 * 48 + 8);
});

test('uses 12dp dynamic insets when a landscape window is only 280dp tall', () => {
  const screen = nav({ width: 600, height: 280, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  const outer = flatten(screen.nodes[0].props.style);
  assert.equal(outer.top, 12);
  assert.equal(outer.bottom, 12);
  assert.ok(280 - outer.top - outer.bottom >= 5 * 48 + 8);
});

test('keeps narrow portrait rails wide enough for five 48dp touch cells', () => {
  const screen = nav({ width: 320, height: 844 });
  const outer = flatten(screen.nodes[0].props.style);
  assert.ok(320 - 2 * outer.paddingHorizontal >= 5 * 48);
  assert.ok(outer.paddingHorizontal <= 16);
});

test('a short landscape rail can scroll without shrinking its five touch cells', () => {
  const screen = nav({ width: 600, height: 240 });
  assert.ok(screen.nodes.some(node => node.type === 'ScrollView'));
  for (const [key] of tabs) {
    const style = flatten(screen.action(`nav-${key}`).props.style({ pressed: false }));
    assert.ok(style.minHeight >= 48);
  }
});

test('inset changes reposition the rail while portrait flow does not apply them twice', () => {
  const screen = nav({ width: 753, height: 471, insets: { top: 24, bottom: 48, left: 0, right: 0 } });
  screen.resize({ insets: { top: 0, bottom: 24, left: 32, right: 16 } });
  let outer = flatten(screen.nodes[0].props.style);
  assert.equal(outer.top, 54);
  assert.equal(outer.bottom, 44);
  assert.equal(outer.right, 30);
  screen.resize({ width: 390, height: 844 });
  outer = flatten(screen.nodes[0].props.style);
  assert.equal(outer.position, undefined);
  assert.equal(outer.top, undefined);
  assert.equal(outer.bottom, undefined);
  assert.equal(outer.paddingTop, 6);
  assert.equal(outer.paddingBottom, 6);
  for (const [key] of tabs) assert.ok(flatten(screen.action(`nav-${key}`).props.style({ pressed: false })).minHeight >= 48);
});

function nav(props = {}) {
  return mountAuthScreen({ screen: 'nav', active: 'home', onChange: () => {}, ...props });
}
