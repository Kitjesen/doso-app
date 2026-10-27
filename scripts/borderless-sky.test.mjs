import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const styleOf = node => flat(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
const home = (props = {}) => mountAuthScreen({ screen: 'home', robotName: 'THUNDER 01', robotImage: 'selected-robot', connected: false, canRecall: false, safetyLock: false, onRecall() {}, onOpenControl() {}, onOpenRoutes() {}, onOpenTasks() {}, onOpenSafety() {}, ...props });
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('home removes decorative borders and white-backed functional PNGs in both themes', () => {
  for (const dark of [false, true]) {
    const screen = home({ dark });
    assert.equal(screen.nodes.filter(node => node.type === 'Image').length, 1, 'only the real robot photo remains raster');
    for (const node of screen.nodes.filter(node => ['View', 'Pressable'].includes(node.type))) {
      const style = styleOf(node);
      assert.equal(style.borderWidth ?? 0, 0);
      assert.equal(style.borderColor, undefined);
    }
    const icons = screen.nodes.filter(node => node.type === 'Ionicons').map(node => node.props.name);
    for (const name of ['pulse-outline', 'thermometer-outline', 'hardware-chip-outline', 'navigate-outline', 'reader-outline', 'shield-checkmark-outline']) assert.ok(icons.includes(name));
    for (const index of [0, 1, 2]) {
      const quick = styleOf(screen.action(`home-quick-${index}`));
      assert.equal(quick.minHeight, 88);
      assert.equal(quick.backgroundColor, dark ? '#24272D' : '#F4F7FA');
    }
  }
});

test('user sky blue uses readable dark labels, never white text on pale blue', () => {
  for (const dark of [false, true]) {
    const screen = home({ dark });
    const cta = screen.action('home-control');
    const fill = styleOf(cta).backgroundColor;
    const label = screen.nodes.find(node => node.type === 'Text' && node.props.children === '控制中心');
    assert.equal(fill, '#98D1FF');
    assert.equal(styleOf(label).color, '#17354D');
    assert.ok(contrast(fill, styleOf(label).color) >= 4.5);
    assert.ok(contrast(dark ? '#98D1FF' : '#214F71', dark ? '#263C4D' : '#EAF5FF') >= 4.5);
  }
});

test('navigation remains five tabs with a borderless sky-blue selection', () => {
  for (const dark of [false, true]) {
    const nav = mountAuthScreen({ screen: 'nav', dark, active: 'home', onChange() {} });
    assert.equal(nav.nodes.filter(node => node.props.accessibilityRole === 'tab').length, 5);
    const frame = nav.nodes.find(node => node.props.testID === 'main-navigation');
    assert.equal(styleOf(frame).borderWidth, 0);
    const indicator = nav.nodes.find(node => node.props.testID === 'nav-indicator-home');
    assert.equal(styleOf(indicator).backgroundColor, '#98D1FF');
    const icon = nav.nodes.find(node => node.type === 'Ionicons' && node.props.name === 'home-outline');
    assert.equal(icon.props.color, '#17354D');
    assert.ok(contrast(styleOf(indicator).backgroundColor, icon.props.color) >= 3);
  }
});

test('task styles have no card outlines and retain content-first compact geometry', () => {
  const source = readFileSync(new URL('../src/screens/TasksScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /border(?:Top|Bottom|Left|Right)?(?:Width|Color)\s*:/);
  assert.match(source, /summaryCard:[^\n]*minHeight: 76/);
  assert.match(source, /taskCardActive: \{ backgroundColor: appearance.selectionSurface \}/);
  assert.match(source, /taskTitleActive: \{ color: appearance.selectionInk \}/);
  assert.match(source, /taskDescriptionActive: \{ color: appearance.selectionInk \}/);
  assert.ok(contrast('#17354D', '#98D1FF') >= 4.5, 'both themes use the single sky accent with dark paired ink');
  assert.match(source, /只读/);
  assert.match(source, /不会发送指令/);
  assert.doesNotMatch(source, /模板操作|模板进度|完成率/);
});

test('authentication header uses the versioned transparent DOSO lockup with a readable dark-mode tint', () => {
  for (const dark of [false, true]) {
    const screen = mountAuthScreen({ screen: 'login', dark });
    const logo = screen.nodes.find(node => node.type === 'Image' && node.props.accessibilityLabel === 'DOSO 大算机器人');
    assert.equal(logo.props.source, 'doso-auth-lockup-sky-v2');
    assert.equal(logo.props.resizeMode, 'contain');
    assert.equal(styleOf(logo).tintColor, dark ? '#98D1FF' : undefined);
    assert.equal(styleOf(logo).backgroundColor, undefined, 'no white backing plate');
    assert.equal(styleOf(logo).width, 124);
    assert.equal(styleOf(logo).height, 42);
  }
  const png = readFileSync(new URL('../assets/brand/doso-auth-lockup-sky-v2.png', import.meta.url));
  assert.equal(png[25], 6, 'RGBA PNG retains the generated alpha channel');
});
