import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return typeof style === 'object' ? style : {};
}
const contains = (element, id) => Array.isArray(element)
  ? element.some(child => contains(child, id))
  : !!element && typeof element === 'object' && (element.props?.testID === id || contains(element.props?.children, id));

function mountTasks({
  controlAvailable = false,
  executorAvailable = false,
  fontScale = 1,
  height = 844,
  isDark = false,
  width = 390,
} = {}) {
  const slots = [];
  const cache = new Map();
  let cursor = 0;
  let nodes = [];
  const startCalls = [];
  const baseColors = {
    background: '#FFFFFF', border: '#E1E7EF', card: '#F6F8FC', dangerText: '#B52E42',
    ink: '#050808', inkSoft: '#373737', muted: '#707784', primary: '#1473E6',
    primarySoft: '#E8F1FF', successText: '#2F6AA3', greenStrong: '#4F8BD9',
  };
  const colors = new Proxy(baseColors, { get: (target, key) => target[key] ?? '#77808F' });
  const react = {
    useMemo(factory) { return factory(); },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const host = {
    Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: value => value, flatten: flattenStyle },
    useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
  };
  const images = Object.fromEntries(['taskDock', 'taskInspection', 'taskSafety'].map(name => [name, name]));

  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: host.Text, TextInput: 'TextInput' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === '../assets') return { images };
      if (name === '../theme' || name === './theme') return { ...loadVisualTokenModules({ dark: isDark }).theme, useAppTheme: () => ({ colors, isDark }) };
      if (name === '../features/tasks/taskStartPolicy') return load('src/features/tasks/taskStartPolicy.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      throw new Error(`Unexpected TasksScreen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }

  const TasksScreen = load('src/screens/TasksScreen.tsx').TasksScreen;
  const appearance = load('src/appearance.ts').useProductAppearance();
  function render() {
    cursor = 0;
    nodes = [];
    function walk(node, parent = null) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => walk(child, parent));
      if (typeof node !== 'object') {
        nodes.push({ type: 'copy', value: String(node), parent });
        return;
      }
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      const entry = { ...node, parent };
      nodes.push(entry);
      walk(node.props.children, entry);
    }
    walk(TasksScreen({
      blockedReason: '未取得机器人控制权限',
      controlAvailable,
      executorAvailable,
      onStartTask: trustedTaskId => startCalls.push(trustedTaskId),
      referenceDate: new Date(2026, 7, 29),
      robotName: 'THUNDER 01',
    }));
  }
  render();
  return {
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
    all: type => nodes.filter(node => node.type === type),
    appearance,
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get nodes() { return nodes; },
    measure(containerWidth, containerHeight = Math.max(0, height - 112)) {
      const root = nodes.find(node => typeof node.props?.onLayout === 'function');
      assert.ok(root, 'task page measures its actual available container');
      root.props.onLayout({ nativeEvent: { layout: { width: containerWidth, height: containerHeight } } });
      render();
    },
    render,
    startCalls,
  };
}

test('short controller dates and three described templates use compact content-driven rows with 48dp targets', () => {
  for (const [width, height] of [[675, 342], [753, 390]]) {
    const screen = mountTasks({ width: 844, height: 438, controlAvailable: true, executorAvailable: true });
    screen.measure(width, height);
    const dates = screen.all('Pressable').filter(node => /^周[一二三四五六日]\d+日$/.test(node.props.accessibilityLabel ?? ''));
    assert.equal(dates.length, 7);
    for (const date of dates) {
      const style = flattenStyle(date.props.style({ pressed: false }));
      assert.ok(style.minWidth >= 48 && style.minHeight >= 48);
      assert.ok(style.minHeight <= 56);
      assert.equal(style.height, undefined);
    }
    for (const index of [0, 1, 2]) {
      const style = flattenStyle(screen.action(`task-template-${index}`).props.style({ pressed: false }));
      assert.ok(style.minHeight >= 48 && style.minHeight <= 66);
      assert.equal(style.height, undefined);
    }
    assert.match(screen.copy, /查看回充流程.*查看巡检流程.*查看安全流程/);
    assert.equal(screen.all('ScrollView').filter(node => !node.props.horizontal).length, 2);
    assert.equal(screen.all('ScrollView').filter(node => node.props.horizontal).length, 1);
    assert.ok(screen.all('Text').every(node => node.props.numberOfLines == null));
    screen.action('task-template-2').props.onPress(); screen.render();
    assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
    screen.action('task-start').props.onPress(); assert.deepEqual(screen.startCalls, []);
  }
});

test('controller tasks keep templates beside an independently scrollable expanded flow without granting execution', () => {
  for (const [availableWidth, availableHeight] of [[675, 359], [627, 335], [611, 300]]) {
    const screen = mountTasks({ width: 753, height: 471, controlAvailable: true, executorAvailable: true });
    screen.measure(availableWidth, availableHeight);
    const primary = screen.nodes.find(node => node.props?.testID === 'tasks-controller-primary');
    const details = screen.nodes.find(node => node.props?.testID === 'tasks-controller-secondary');
    assert.equal(primary?.type, 'ScrollView'); assert.equal(details?.type, 'ScrollView');
    assert.equal(screen.all('ScrollView').filter(node => !node.props.horizontal).length, 2);
    assert.ok(contains(primary, 'task-template-list'));
    assert.ok(contains(details, 'task-detail-card'));
    assert.ok(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), 'the selected flow opens beside the list');
    const layout = flattenStyle(screen.nodes.find(node => node.props?.testID === 'tasks-controller-layout').props.style);
    assert.equal(layout.flexDirection, 'row'); assert.equal(layout.flex, 1);
    assert.equal(flattenStyle(primary.props.style).width + flattenStyle(details.props.style).width + layout.gap + 2 * layout.paddingHorizontal, availableWidth);
    for (const id of ['task-start', 'task-preview-toggle']) {
      const style = screen.action(id).props.style;
      assert.ok(flattenStyle(typeof style === 'function' ? style({ pressed: false }) : style).minHeight >= 48);
    }
    assert.equal(screen.action('task-start').props.disabled, true);
    screen.action('task-start').props.onPress(); assert.deepEqual(screen.startCalls, []);
  }
});

test('large text in the same short controller container stacks without clipping descriptions or enabling tasks', () => {
  const screen = mountTasks({ width: 844, height: 438, fontScale: 1.5, controlAvailable: true, executorAvailable: true });
  screen.measure(675, 342);
  assert.equal(screen.all('ScrollView').filter(node => !node.props.horizontal).length, 1);
  assert.equal(screen.nodes.find(node => node.props?.testID === 'tasks-controller-layout'), undefined);
  for (const index of [0, 1, 2]) {
    const style = flattenStyle(screen.action(`task-template-${index}`).props.style({ pressed: false }));
    assert.ok(style.minHeight >= 78); assert.equal(style.height, undefined);
  }
  assert.ok(screen.all('Text').every(node => node.props.numberOfLines == null));
  assert.match(screen.copy, /查看回充流程.*查看巡检流程.*查看安全流程/);
  screen.action('task-start').props.onPress(); assert.deepEqual(screen.startCalls, []);
});

test('controller task selection and manual collapse survive narrow fallback and restored two-pane content', () => {
  const screen = mountTasks({ width: 753, height: 471, isDark: true });
  screen.measure(675, 359);
  screen.action('task-template-2').props.onPress(); screen.render();
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  assert.equal(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), false);
  screen.measure(500, 359);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'tasks-controller-layout'), false);
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), false);
  screen.measure(627, 335);
  assert.ok(screen.nodes.some(node => node.props?.testID === 'tasks-controller-layout'));
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), false);
  screen.action('task-template-0').props.onPress(); screen.render();
  assert.ok(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'));
  assert.equal(screen.action('task-start').props.disabled, true);
  screen.action('task-start').props.onPress(); assert.deepEqual(screen.startCalls, []);
});

test('product task instructions have no development preview copy and retain trusted-task restrictions', () => {
  const screen = mountTasks({ width: 753, height: 471 });
  screen.measure(675, 359);
  assert.doesNotMatch(screen.copy, /预览/);
  assert.match(screen.copy, /流程说明/);
  assert.match(screen.copy, /尚未同步可信任务/);
  assert.match(screen.copy, /仅可查看流程，开始保持锁定/);
  for (const action of screen.all('Pressable')) assert.doesNotMatch(action.props.accessibilityHint ?? '', /预览/);
  screen.action('task-start').props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('compact controller landscape drops the duplicate summary without losing read-only or locked actions', () => {
  const screen = mountTasks({ width: 753, height: 471 });
  screen.measure(675, 359);
  assert.doesNotMatch(screen.copy, /当前可查看通用模板/);
  assert.match(screen.copy, /只读.*3.*个模板/);
  assert.match(screen.copy, /尚未同步可信任务/);
  assert.equal(screen.action('task-start').props.disabled, true);
  assert.ok(screen.nodes.find(node => node.props?.testID === 'task-preview-steps'));
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  assert.equal(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), false);
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  assert.ok(screen.nodes.find(node => node.props?.testID === 'task-preview-steps'));
  assert.match(screen.copy, /只读.*仅可查看流程，开始保持锁定/);
  screen.action('task-start').props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('compact template feedback never removes the missing trusted-task disclosure', () => {
  const screen = mountTasks({ width: 753, height: 471 });
  screen.measure(675, 359);
  screen.action('task-template-2').props.onPress(); screen.render();
  assert.match(screen.copy, /已选择设备安全模板/);
  assert.match(screen.copy, /THUNDER 01.*尚未同步可信任务/);
  assert.match(screen.copy, /只读.*3.*个模板/);
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  screen.action('task-start').props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('restoring content height restores the summary without losing task selection or manual expansion', () => {
  const screen = mountTasks({ width: 1280, height: 800 });
  screen.measure(700, 359);
  assert.doesNotMatch(screen.copy, /当前可查看通用模板/);
  screen.action('task-template-2').props.onPress(); screen.render();
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  assert.equal(screen.nodes.some(node => node.props?.testID === 'task-preview-steps'), false);
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  screen.measure(700, 600);
  assert.match(screen.copy, /当前可查看通用模板/);
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, true);
  assert.equal(screen.action('task-start').props.disabled, true);
  assert.match(mountTasks({ width: 390, height: 844 }).copy, /当前可查看通用模板/);
});

test('phone task templates are full-width vertical selection rows', () => {
  const screen = mountTasks();
  const list = screen.nodes.find(node => node.props?.testID === 'task-template-list');
  assert.equal(flattenStyle(list.props.style).flexDirection, 'column');
  for (const index of [0, 1, 2]) {
    const row = screen.action(`task-template-${index}`);
    const style = flattenStyle(row.props.style({ pressed: false }));
    assert.equal(style.flexDirection, 'row');
    assert.ok(style.minHeight >= 72);
  }
});

test('task details do not repeat the device robot artwork', () => {
  const screen = mountTasks();
  assert.equal(screen.all('Image').length, 0);
});

test('selected weekday and date share one blue selection surface', () => {
  const screen = mountTasks();
  const selected = screen.all('Pressable').find(node => (
    /^周[一二三四五六日]\d+日$/.test(node.props.accessibilityLabel ?? '')
    && node.props.accessibilityState.selected
  ));
  const selectedStyle = flattenStyle(selected.props.style({ pressed: false }));
  assert.equal(selectedStyle.backgroundColor, screen.appearance.action);
  const weekday = screen.nodes.find(node => node.type === 'Text' && node.parent === selected);
  assert.equal(flattenStyle(weekday.props.style).color, screen.appearance.actionInk);
});

test('wide measured content shows template list beside expanded read-only details and narrows safely', () => {
  const screen = mountTasks({ width: 960, height: 600 });
  screen.measure(882);
  const columns = screen.nodes.find(node => node.props?.testID === 'tasks-page-content');
  assert.equal(flattenStyle(columns.props.contentContainerStyle).flexDirection, 'row');
  assert.ok(screen.nodes.find(node => node.props?.testID === 'task-preview-steps'));
  assert.equal(screen.action('task-start').props.disabled, true);
  screen.measure(700);
  const stacked = screen.nodes.find(node => node.props?.testID === 'tasks-page-content');
  assert.equal(flattenStyle(stacked.props.contentContainerStyle).flexDirection, 'column');
  assert.equal(screen.nodes.find(node => node.props?.testID === 'task-preview-steps'), undefined);
  screen.action('task-start').props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('task layout and default preview follow the usable height rather than the outer window', () => {
  const screen = mountTasks({ width: 960, height: 600 });
  screen.measure(882, 424);
  const content = () => flattenStyle(screen.nodes.find(node => node.props?.testID === 'tasks-page-content').props.contentContainerStyle);
  assert.equal(content().flexDirection, 'column');
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false);
  screen.action('task-template-2').props.onPress(); screen.render();
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false);
  screen.measure(882, 500);
  assert.equal(content().flexDirection, 'row');
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, true);
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  screen.measure(882, 424);
  screen.measure(882, 500);
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false, 'manual collapse survives a layout-only resize');
  assert.equal(screen.action('task-template-2').props.accessibilityState.selected, true);
  assert.deepEqual(screen.startCalls, []);
});

for (const viewport of [
  { label: 'portrait', width: 390, height: 844 },
  { label: 'landscape', width: 844, height: 390 },
  { label: 'large text', width: 390, height: 620, fontScale: 1.5 },
]) {
  test(`${viewport.label} renders one native selectable task set without overflow-only artwork`, () => {
    const screen = mountTasks(viewport);
    const selectors = [0, 1, 2].map(index => screen.action(`task-template-${index}`));

    assert.deepEqual(selectors.map(node => node.props.accessibilityLabel), [
      '查看回充电座任务模板', '查看巡检任务模板', '查看设备安全任务模板',
    ]);
    assert.deepEqual(selectors.map(node => node.props.accessibilityState.selected), [false, true, false]);
    assert.equal(screen.all('ScrollView').length >= 1, true);
    assert.equal(screen.all('Image').length <= 1, true);
    if (screen.all('Image')[0]) assert.equal(screen.all('Image')[0].props.resizeMode, 'contain');
    assert.equal(screen.action('task-start') !== undefined, true);
    assert.equal(screen.action('task-preview-toggle') !== undefined, true);
  });
}

test('selecting another native template updates the unique selection and normal-flow feedback without dispatch', () => {
  const screen = mountTasks();
  screen.action('task-template-0').props.onPress();
  screen.render();

  assert.deepEqual([0, 1, 2].map(index => screen.action(`task-template-${index}`).props.accessibilityState.selected), [true, false, false]);
  assert.match(screen.copy, /回充电座/);
  assert.match(screen.copy, /不会发送|仅供查看|模板预览/);
  assert.deepEqual(screen.startCalls, []);

  const liveFeedback = screen.nodes.find(node => (
    node.type === 'Text'
    && node.props.accessibilityLiveRegion === 'polite'
    && node.parent?.props.testID === 'task-feedback'
  ));
  assert.ok(liveFeedback, 'selection feedback must be announced');
  assert.notEqual(flattenStyle(liveFeedback.parent?.props.style).position, 'absolute');
  assert.equal(flattenStyle(liveFeedback.parent?.props.style).bottom, undefined);
  assert.equal(flattenStyle(liveFeedback.props.style).fontSize >= 12, true);
});

test('selecting a date keeps one date selected and shows truthful generic-template feedback without dispatch', () => {
  const screen = mountTasks();
  const dates = screen.all('Pressable').filter(node => /^周[一二三四五六日]\d+日$/.test(node.props.accessibilityLabel ?? ''));
  const target = dates.find(node => node.props.accessibilityState.selected === false);
  assert.ok(target);

  target.props.onPress();
  screen.render();

  const nextDates = screen.all('Pressable').filter(node => /^周[一二三四五六日]\d+日$/.test(node.props.accessibilityLabel ?? ''));
  assert.equal(nextDates.filter(node => node.props.accessibilityState.selected).length, 1);
  assert.equal(nextDates.find(node => node.props.accessibilityState.selected)?.props.accessibilityLabel, target.props.accessibilityLabel);
  assert.match(screen.copy, /尚未同步可信任务。当前展示通用模板/);
  assert.deepEqual(screen.startCalls, []);
});

test('dark selected task icon uses paired accent ink and supporting copy stays at least 13sp', () => {
  const screen = mountTasks({ isDark: true });
  const selectedIcon = screen.all('Ionicons').find(node => node.props.name === 'scan-outline');

  assert.ok(selectedIcon);
  assert.equal(selectedIcon.props.color, screen.appearance.selectionInk);
  assert.notEqual(selectedIcon.props.color, screen.appearance.blueInk);
  const supportingText = screen.all('Text').filter(node => {
    const fontSize = flattenStyle(node.props.style).fontSize;
    return fontSize !== undefined;
  });
  assert.equal(Math.min(...supportingText.map(node => flattenStyle(node.props.style).fontSize)) >= 13, true);
});

test('template tasks remain disabled even when control and executor channels are available', () => {
  const screen = mountTasks({ controlAvailable: true, executorAvailable: true });
  const start = screen.action('task-start');

  assert.equal(start.props.disabled, true);
  assert.equal(start.props.accessibilityState.disabled, true);
  start.props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('read-only template details expand and reset when selection changes', () => {
  const screen = mountTasks();
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false);

  screen.action('task-preview-toggle').props.onPress();
  screen.render();
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, true);

  screen.action('task-template-2').props.onPress();
  screen.render();
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false);
  assert.deepEqual(screen.startCalls, []);
});

test('week selectors retain at least 44-point touch targets', () => {
  const screen = mountTasks();
  const dates = screen.all('Pressable').filter(node => /^周[一二三四五六日]\d+日$/.test(node.props.accessibilityLabel ?? ''));
  assert.equal(dates.length, 7);
  for (const date of dates) {
    const style = flattenStyle(typeof date.props.style === 'function' ? date.props.style({ pressed: false }) : date.props.style);
    assert.equal(style.minWidth >= 44, true);
    assert.equal(style.minHeight >= 44, true);
  }
});

test('template selection and read-only preview use paired accent while disabled execution remains distinct', () => {
  for (const isDark of [false, true]) {
    const screen = mountTasks({ isDark });
    const selected = flattenStyle(screen.action('task-template-1').props.style({ pressed: false }));
    const disabled = flattenStyle(screen.action('task-start').props.style({ pressed: false }));
    const preview = flattenStyle(screen.action('task-preview-toggle').props.style({ pressed: false }));
    assert.equal(selected.backgroundColor, screen.appearance.selectionSurface);
    assert.equal(disabled.backgroundColor, 'transparent');
    assert.equal(preview.backgroundColor, screen.appearance.action);
    const glyphs = screen.all('Ionicons');
    assert.ok(glyphs.some(node => node.props.name === 'chevron-down' && node.props.color === screen.appearance.actionInk));
    assert.ok(glyphs.some(node => node.props.name === 'lock-closed-outline' && node.props.color === screen.appearance.secondary));
    assert.equal(screen.action('task-start').props.disabled, true);
    screen.action('task-start').props.onPress();
    assert.deepEqual(screen.startCalls, []);
  }
});

test('normal task content renders only canvas, one card surface and one accent in either theme', () => {
  for (const isDark of [false, true]) for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const screen = mountTasks({ isDark, ...viewport });
    const fills = new Set(screen.nodes.map(node => flattenStyle(typeof node.props?.style === 'function' ? node.props.style({ pressed: false }) : node.props?.style).backgroundColor).filter(color => color && color !== 'transparent'));
    assert.deepEqual([...fills].sort(), [screen.appearance.canvas, screen.appearance.surface, screen.appearance.action].sort());
    assert.equal(screen.action('task-template-1').props.accessibilityState.selected, true);
    assert.match(screen.copy, /只读.*不会发送指令/);
    assert.equal(screen.action('task-start').props.disabled, true);
  }
});

test('expanded instructions add no nested fill or new execution capability', () => {
  for (const isDark of [false, true]) {
    const screen = mountTasks({ isDark });
    screen.action('task-preview-toggle').props.onPress(); screen.render();
    const steps = screen.nodes.find(node => node.props?.testID === 'task-preview-steps');
    assert.equal(flattenStyle(steps.props.style).backgroundColor, 'transparent');
    const preview = flattenStyle(screen.action('task-preview-toggle').props.style({ pressed: false }));
    assert.ok(preview.minHeight >= 44);
    assert.equal(screen.action('task-start').props.disabled, true);
    screen.action('task-start').props.onPress(); assert.deepEqual(screen.startCalls, []);
  }
});

test('short landscape and large-font wide windows stay stacked with reachable actions', () => {
  for (const viewport of [{ width: 960, height: 390 }, { width: 960, height: 600, fontScale: 1.5 }]) {
    const screen = mountTasks(viewport);
    screen.measure(882);
    const content = screen.nodes.find(node => node.props?.testID === 'tasks-page-content');
    assert.equal(flattenStyle(content.props.contentContainerStyle).flexDirection, 'column');
    assert.equal(screen.nodes.find(node => node.props?.testID === 'task-preview-steps'), undefined);
    assert.ok(screen.all('ScrollView').length >= 1);
    assert.match(screen.copy, /尚未同步可信任务/);
    for (const id of ['task-start', 'task-preview-toggle']) {
      assert.ok(flattenStyle(screen.action(id).props.style({ pressed: false })).minHeight >= 48);
    }
    screen.action('task-start').props.onPress();
    assert.deepEqual(screen.startCalls, []);
  }
});

test('wide details can collapse and selecting another template restores wide default expansion', () => {
  const screen = mountTasks({ width: 960, height: 600 });
  screen.measure(882);
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, true);
  screen.action('task-preview-toggle').props.onPress(); screen.render();
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, false);
  screen.action('task-template-2').props.onPress(); screen.render();
  assert.equal(screen.action('task-preview-toggle').props.accessibilityState.expanded, true);
  assert.match(screen.copy, /确认设备状态与安全检查项/);
  assert.deepEqual(screen.startCalls, []);
});
