import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('home columns fit measured post-safe-area width without double-reserving navigation', () => {
  for (const available of [882, 946, 1202]) {
    const screen = home({ width: 1280, height: 800 });
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: available, height: 688 } } });
    screen.render();
    const primary = screen.nodes.find(node => node.props?.testID === 'home-primary-column');
    const secondary = screen.nodes.find(node => node.props?.testID === 'home-secondary-column');
    const scroll = screen.nodes.find(node => node.type === 'ScrollView');
    const content = flatten(scroll.props.contentContainerStyle);
    assert.equal(content.flexDirection, 'row');
    assert.equal(flatten(primary.props.style).width + flatten(secondary.props.style).width + content.gap + content.paddingHorizontal * 2, available);
    assert.equal(content.paddingRight, undefined);
  }
  for (const config of [{ width: 960, height: 600, fontScale: 1.6 }, { width: 844, height: 390, fontScale: 1.5 }, { width: 600, height: 390 }]) {
    const screen = home(config);
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: config.width - 78, height: config.height - 112 } } });
    screen.render();
    const scroll = screen.nodes.find(node => node.type === 'ScrollView');
    assert.notEqual(flatten(scroll.props.contentContainerStyle).flexDirection, 'row');
  }
});

function home(props = {}) {
  return mountAuthScreen({ screen: 'home', robotImage: 'selected-robot', robotName: 'THUNDER 01', connected: false, canRecall: false, safetyLock: false, onRecall: () => {}, onOpenControl: () => {}, onOpenRoutes: () => {}, onOpenTasks: () => {}, onOpenSafety: () => {}, ...props });
}
test('home contains one product photo and real native labels in both themes', () => {
  for (const dark of [false, true]) {
    const screen = home({ dark });
    assert.equal(screen.nodes.filter(node => node.type === 'Image' && node.props.source === 'selected-robot').length, 1);
    assert.match(screen.copy, /THUNDER 01/);
    assert.match(screen.copy, /巡航模板.*任务模板.*设备安全/);
    assert.match(screen.copy, /电量待同步 传感器 待同步 温度 待同步 电机 待同步/);
    assert.doesNotMatch(screen.copy, /32°C|12\/12|34%|在线/);
  }
});
test('unknown, zero and invalid battery remain distinct', () => {
  assert.match(home().copy, /电量待同步/);
  assert.match(home({ batteryPercent: 0 }).copy, /0 % 电量/);
  for (const value of [NaN, Infinity, -1, 101]) assert.match(home({ batteryPercent: value }).copy, /电量待同步/);
});

test('control center keeps a stretchable entry with compact borderless shortcut cards', () => {
  const screen = home();
  const cta = flatten(screen.action('home-control').props.style({ pressed: false }));
  assert.equal(cta.alignSelf, 'stretch');
  assert.equal(screen.action('home-control').props.accessibilityLabel, '控制中心');
  assert.ok(cta.minHeight >= 48);
  for (let index = 0; index < 3; index++) {
    const card = screen.action(`home-quick-${index}`);
    const style = flatten(card.props.style({ pressed: false }));
    assert.ok(style.minHeight >= 48);
    assert.equal(style.borderRadius, 16);
    assert.equal(card.props.accessibilityRole, 'button');
  }
  const nav = mountAuthScreen({ screen: 'nav', active: 'home', onChange: () => {} });
  const indicator = key => nav.nodes.find(node => node.props?.testID === `nav-indicator-${key}`);
  assert.equal(flatten(indicator('tasks')?.props.style).backgroundColor, 'transparent');
  assert.notEqual(flatten(indicator('home')?.props.style).backgroundColor, 'transparent');
});
test('recall refuses unavailable programmatic presses and announces the reason', () => {
  let calls = 0;
  const screen = home({ onRecall: () => calls++, recallBlockedReason: '未取得控制权限' });
  const recall = screen.action('home-recall');
  assert.equal(recall.props.disabled, true);
  assert.equal(recall.props.accessibilityHint, '未取得控制权限');
  recall.props.onPress(); assert.equal(calls, 0);
  screen.render({ canRecall: true });
  screen.action('home-recall').props.onPress(); assert.equal(calls, 1);
});
test('control preview and every quick action keep their existing callbacks', () => {
  const calls = [];
  const screen = home({ onOpenControl: () => calls.push('preview'), onOpenRoutes: () => calls.push('routes'), onOpenTasks: () => calls.push('tasks'), onOpenSafety: () => calls.push('safety') });
  for (const id of ['home-control', 'home-quick-0', 'home-quick-1', 'home-quick-2']) screen.action(id).props.onPress();
  assert.deepEqual(calls, ['preview', 'routes', 'tasks', 'safety']);
});
