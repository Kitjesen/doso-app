import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const mount = (options = {}) => mountAuthScreen({
  screen: 'home', robotName: 'THUNDER 01', robotImage: 'selected-robot',
  connected: false, canRecall: false, safetyLock: false,
  onRecall: () => {}, onOpenControl: () => {}, onOpenRoutes: () => {},
  onOpenTasks: () => {}, onOpenSafety: () => {}, ...options,
});
const node = (screen, id) => screen.nodes.find(item => item.props?.testID === id);
const contains = (element, id) => Array.isArray(element)
  ? element.some(child => contains(child, id))
  : !!element && typeof element === 'object' && (element.props?.testID === id || contains(element.props?.children, id));

test('short controller home reports connection once while keeping independent execution prerequisites', () => {
  const screen = mount({ width: 753, height: 390 });
  screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: 675, height: 342 } } }); screen.render();
  assert.equal((screen.copy.match(/离线/g) ?? []).length, 1);
  assert.doesNotMatch(screen.copy, /设备连接/);
  assert.match(screen.copy, /执行条件.*控制权限.*未验证.*任务执行器.*待验证/);
  assert.equal(screen.action('home-recall').props.disabled, true);
});

test('short home device overview uses a smaller hero and one honest telemetry line without reducing its actions', () => {
  for (const [width, height] of [[675, 342], [753, 390]]) {
    const screen = mount({ width: 844, height: 438, onOpenRobotConnection: () => {} });
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width, height } } }); screen.render();
    assert.ok(flat(node(screen, 'home-device-hero').props.style).minHeight <= 72);
    assert.ok(flat(screen.nodes.find(item => item.type === 'Image').props.style).height <= 72);
    assert.equal(flat(node(screen, 'home-device-card').props.style).height, undefined);
    assert.match(screen.copy, /传感器、温度、电机待同步/);
    assert.ok(node(screen, 'home-compact-telemetry'));
    for (const id of ['home-control', 'home-recall']) {
      assert.ok(flat(screen.action(id).props.style({ pressed: false })).minHeight >= 48);
    }
    assert.ok(screen.nodes.filter(item => item.type === 'Text').every(item => item.props.numberOfLines == null));
    assert.doesNotMatch(screen.copy, /32°C|在线传感器|运行中/);
  }
});

test('controller home keeps device and shortcuts left, tasks right, in independently scrollable readable panes', () => {
  for (const available of [675, 627, 611]) {
    let control = 0, recall = 0;
    const screen = mount({ width: 753, height: 471, onOpenControl: () => control++, onRecall: () => recall++ });
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: available, height: 359 } } }); screen.render();
    const primary = node(screen, 'home-controller-primary');
    const secondary = node(screen, 'home-controller-secondary');
    assert.equal(primary?.type, 'ScrollView');
    assert.equal(secondary?.type, 'ScrollView');
    assert.equal(screen.nodes.filter(item => item.type === 'ScrollView').length, 2);
    assert.ok(contains(primary, 'home-device-card') && contains(primary, 'home-quick-list'));
    assert.ok(contains(secondary, 'home-task-summary') && contains(secondary, 'home-execution-conditions'));
    assert.ok(!contains(primary, 'home-task-summary'));
    const layout = flat(node(screen, 'home-controller-layout').props.style);
    assert.equal(layout.flexDirection, 'row');
    assert.equal(layout.flex, 1);
    assert.equal(flat(primary.props.style).width + flat(secondary.props.style).width + layout.gap + layout.paddingHorizontal * 2, available);
    assert.notEqual(flat(node(screen, 'home-quick-list').props.style).flexDirection, 'column');
    assert.ok(screen.copy.indexOf('任务概览') < screen.copy.indexOf('执行条件'));
    assert.ok(flat(screen.action('home-control').props.style({ pressed: false })).minHeight >= 48);
    screen.action('home-control').props.onPress(); screen.action('home-recall').props.onPress();
    assert.equal(control, 1); assert.equal(recall, 0);
  }
});

test('controller home falls back for large text or reduced content space and restores its two panes safely', () => {
  const screen = mount({ width: 753, height: 471, dark: true });
  const measure = (width, height) => { screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width, height } } }); screen.render(); };
  measure(675, 359);
  assert.ok(node(screen, 'home-controller-layout'));
  screen.resize({ fontScale: 1.5 });
  assert.equal(node(screen, 'home-controller-layout'), undefined);
  assert.equal(screen.nodes.filter(item => item.type === 'ScrollView').length, 1);
  assert.ok(flat(screen.action('home-control').props.style({ pressed: false })).minHeight >= 48);
  screen.resize({ fontScale: 1 });
  assert.ok(node(screen, 'home-controller-layout'));
  for (const [width, height] of [[607, 359], [675, 239]]) {
    measure(width, height);
    assert.equal(node(screen, 'home-controller-layout'), undefined);
    assert.ok(screen.action('home-task-summary'));
  }
  measure(611, 300);
  assert.ok(node(screen, 'home-controller-layout'));
  assert.equal(screen.nodes.filter(item => item.type === 'Image').length, 1);
  assert.match(screen.copy, /离线.*电量待同步/);
  assert.equal(screen.action('home-recall').props.disabled, true);
});

test('home shortcuts retain their three destinations without redundant microcopy', () => {
  const screen = mount();
  assert.match(screen.copy, /巡航模板.*任务模板.*设备安全/);
  assert.doesNotMatch(screen.copy, /查看路线|查看任务|状态与设置/);
});

test('home exposes read-only task browsing and unknown execution prerequisites without inventing readiness', () => {
  let opened = 0;
  const screen = mount({ onOpenTasks: () => opened++ });
  assert.match(screen.copy, /执行条件.*控制权限.*未验证.*任务执行器.*待验证/);
  assert.match(screen.copy, /任务概览.*任务状态待同步.*仅可浏览通用模板/);
  assert.doesNotMatch(screen.copy, /权限已通过|执行器已接入|今日完成|完成率/);
  screen.action('home-task-summary').props.onPress();
  assert.equal(opened, 1);
});

test('wide home groups device and shortcuts separately from task overview and prerequisites', () => {
  const screen = mount({ width: 960, height: 600 });
  screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: 882, height: 488 } } });
  screen.render();
  const primary = node(screen, 'home-primary-column');
  const secondary = node(screen, 'home-secondary-column');
  assert.ok(primary);
  assert.ok(secondary);
  assert.equal(flat(screen.nodes.find(item => item.type === 'ScrollView').props.contentContainerStyle).flexDirection, 'row');
  assert.ok(flat(primary.props.style).width > flat(secondary.props.style).width);
  assert.ok(flat(primary.props.style).width + flat(secondary.props.style).width <= 834);
});

test('home stays stacked when shell chrome leaves a short usable container inside a tall window', () => {
  const screen = mount({ width: 960, height: 600 });
  screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: 882, height: 424 } } });
  screen.render();
  assert.equal(flat(screen.nodes.find(item => item.type === 'ScrollView').props.contentContainerStyle).flexDirection, 'column');
  assert.equal(flat(node(screen, 'home-primary-column').props.style).width, flat(node(screen, 'home-secondary-column').props.style).width);
  assert.ok(screen.action('home-control'));
  assert.ok(screen.action('home-task-summary'));
});

test('unmeasured, narrow, short and large-text homes remain scrollable single-column layouts', () => {
  const unmeasured = mount({ width: 1920, height: 1200 });
  assert.equal(flat(unmeasured.nodes.find(item => item.type === 'ScrollView').props.contentContainerStyle).flexDirection, 'column');
  for (const options of [
    { width: 390, height: 844, measured: 390 },
    { width: 960, height: 600, measured: 760 },
    { width: 960, height: 390, measured: 882 },
    { width: 960, height: 600, fontScale: 1.6, measured: 882 },
  ]) {
    const screen = mount(options);
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: options.measured, height: Math.max(0, options.height - 112) } } });
    screen.render();
    const scroll = screen.nodes.find(item => item.type === 'ScrollView');
    const content = flat(scroll.props.contentContainerStyle);
    assert.equal(content.flexDirection, 'column');
    assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'automatic');
    assert.equal(flat(node(screen, 'home-primary-column').props.style).width + content.paddingHorizontal * 2, options.measured);
    assert.ok(screen.action('home-control'));
    assert.ok(screen.action('home-task-summary'));
  }
});

test('layout measurement ignores empty and non-finite transient sizes', () => {
  const screen = mount({ width: 960, height: 600 });
  const measure = (width, height = 488) => {
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width, height } } });
    screen.render();
  };
  measure(882);
  const width = flat(node(screen, 'home-primary-column').props.style).width;
  for (const invalid of [0, -1, NaN, Infinity]) {
    measure(invalid);
    assert.equal(flat(node(screen, 'home-primary-column').props.style).width, width);
    measure(800, invalid);
    assert.equal(flat(node(screen, 'home-primary-column').props.style).width, width);
  }
});

test('task execution conditions distinguish unknown, unavailable and available policy inputs', () => {
  for (const [value, permission, executor] of [
    [undefined, '未验证', '待验证'],
    [false, '不可用', '不可用'],
    [true, '可用', '可用'],
  ]) {
    const screen = mount({ taskControlAvailable: value, taskExecutorAvailable: value });
    assert.match(screen.copy, new RegExp(`控制权限 ${permission} 任务执行器 ${executor}`));
    assert.equal(screen.action('home-recall').props.disabled, true, 'task policy never grants recall authority');
  }
});
