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

// Execute the actual component handlers and the unchanged trusted-route policy.
// This is not a substitute for Yoga/Android layout or touch verification.
function mountMap({ width = 390, height = 844, fontScale = 1, isDark = false, controlAvailable = false, executorAvailable = false, showExamples = true } = {}) {
  const visual = loadVisualTokenModules({ dark: isDark });
  const slots = [];
  const cache = new Map();
  const startCalls = [];
  const props = { showExamples };
  let cursor = 0;
  let nodes = [];
  const colors = new Proxy({
    ink: isDark ? '#F7F9FC' : '#050808', muted: isDark ? '#96A1AD' : '#616B79',
    authPrimary: isDark ? '#88BBFF' : '#0066FF', authPrimaryInk: isDark ? '#17191D' : '#FFFFFF',
  }, { get: (target, key) => target[key] ?? '#A1A9B5' });
  const react = {
    useMemo: factory => factory(),
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
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '../assets') return { images: { routeMapLarge: 'routeMapLarge', routeMapCompact: 'routeMapCompact' } };
      if (name === '../theme') return { useAppTheme: () => ({ colors, isDark }) };
      if (name === '../typography') return load('src/typography.ts');
      if (name === '../appearance') return visual.appearance;
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      if (name === '../features/routes/routeStartPolicy') return load('src/features/routes/routeStartPolicy.ts');
      throw new Error(`Unexpected MapScreen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const MapScreen = load('src/screens/MapScreen.tsx').MapScreen;
  function render(next = {}) {
    Object.assign(props, next);
    cursor = 0;
    nodes = [];
    function walk(node, parent = null) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => walk(child, parent));
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node), parent }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      const entry = { ...node, parent };
      nodes.push(entry);
      walk(node.props.children, entry);
    }
    walk(MapScreen({ ...props, blockedReason: '连接设备后检查控制权限', controlAvailable, executorAvailable, robotName: 'THUNDER 01', onStartRoute: value => startCalls.push(value) }));
  }
  render();
  return {
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
    all: type => nodes.filter(node => node.type === type),
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get nodes() { return nodes; },
    layout(containerWidth, containerHeight) {
      const viewport = nodes.find(node => typeof node.props?.onLayout === 'function');
      assert.ok(viewport, 'the route screen measures its actual available container');
      viewport.props.onLayout({ nativeEvent: { layout: { width: containerWidth, height: containerHeight } } });
      render();
    },
    colors, render, startCalls,
  };
}

test('normal product map hides example galleries and commands without inventing saved routes', () => {
  const screen = mountMap({ width: 753, height: 471, controlAvailable: true, executorAvailable: true, showExamples: false });
  screen.layout(675, 359);
  assert.match(screen.copy, /尚无已保存路线/);
  assert.match(screen.copy, /设备地图与路线编辑器尚在接入中/);
  assert.doesNotMatch(screen.copy, /界面示例|示例不可执行|预览/);
  for (const id of ['route-library-示例路线', 'route-template-a', 'route-start', 'route-details-toggle']) assert.equal(screen.action(id), undefined);
  assert.deepEqual(screen.startCalls, []);

  const example = mountMap({ showExamples: true });
  assert.ok(example.action('route-template-a'));
  example.render({ showExamples: false });
  assert.match(example.copy, /尚无已保存路线/);
  assert.equal(example.action('route-start'), undefined, 'hiding examples must also hide a previously selected example');
});

test('a narrow route container inside a wide window stays readable in one scrolling column', () => {
  const screen = mountMap({ width: 1280, height: 800 });
  screen.layout(620, 620);
  const content = flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle);
  assert.notEqual(content.flexDirection, 'row');
  assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
  screen.action('route-details-toggle').props.onPress();
  screen.render();
  assert.match(screen.copy, /这是界面示例/);
  assert.deepEqual(screen.startCalls, []);
});

test('route columns follow measured width and height while retaining selection after resize', () => {
  const screen = mountMap({ width: 1280, height: 800 });
  screen.layout(1100, 640);
  const contentStyle = () => flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle);
  assert.equal(contentStyle().flexDirection, 'row');
  screen.action('route-template-c').props.onPress();
  screen.render();
  screen.layout(1100, 440);
  assert.notEqual(contentStyle().flexDirection, 'row', 'a short usable area falls back without shrinking text');
  assert.equal(screen.action('route-template-c').props.accessibilityState.selected, true);
  screen.layout(1100, 640);
  assert.equal(contentStyle().flexDirection, 'row');
  const columns = screen.all('View').filter(node => flattenStyle(node.props.style).width >= 320);
  const widths = columns.map(node => flattenStyle(node.props.style).width);
  assert.equal(widths.length, 2);
  assert.equal(widths[0] >= 320 && widths[0] <= 360, true);
  assert.equal(widths[1] >= 440, true);
  assert.equal(widths[0] + widths[1] + contentStyle().gap + contentStyle().paddingHorizontal * 2, 1100);
  assert.deepEqual(screen.startCalls, []);
});

test('large text keeps even a wide route screen in a growing single column', () => {
  for (const fontScale of [1.31, 1.5, 2]) {
    const screen = mountMap({ width: 1280, height: 800, fontScale });
    screen.layout(1100, 640);
    assert.notEqual(flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle).flexDirection, 'row');
    for (const id of ['route-filter-全部路线', 'route-filter-最近', 'route-filter-收藏']) {
      const style = flattenStyle(screen.action(id).props.style);
      assert.equal(style.height, undefined, 'filter targets grow with the real font scale');
      assert.notEqual(style.overflow, 'hidden');
    }
    screen.action('route-library-我的路线').props.onPress();
    screen.render();
    assert.match(screen.copy, /尚无已保存路线/);
    assert.equal(screen.action('route-start'), undefined);
    assert.deepEqual(screen.startCalls, []);
  }
});

for (const viewport of [
  { label: 'portrait', width: 390, height: 844 },
  { label: 'landscape', width: 844, height: 390 },
  { label: 'large text', width: 390, height: 620, fontScale: 1.5 },
]) {
  test(`${viewport.label}: native route selection, help and blocked reason remain accessible`, () => {
    const screen = mountMap(viewport);
    assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
    assert.equal(screen.action('route-details-toggle').props.accessibilityState.expanded, false);
    assert.equal(screen.action('route-start').props.disabled, true);
    assert.equal(screen.all('ScrollView')[0].props.horizontal, undefined, 'expanded help is reachable by vertical scrolling');
    const reason = screen.nodes.find(node => node.props?.testID === 'route-blocked-reason');
    assert.equal(reason.props.numberOfLines, undefined, 'reasons are not truncated');
    for (let parent = reason.parent; parent; parent = parent.parent) assert.notEqual(parent.props.testID, 'route-start');
    assert.equal(flattenStyle(reason.props.style).fontSize >= 13, true);
    assert.equal(screen.all('Pressable').some(node => node.props.accessibilityLabel === '自定义'), false);
  });

  test(`${viewport.label}: every selected route keeps 15/22 text and naturally-sized consistent cards`, () => {
    const screen = mountMap(viewport);
    const styleOf = node => flattenStyle(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
    const titleOf = id => screen.nodes.find(node => node.props?.testID === `route-title-${id}`);
    const titleBeforeSelection = ['a', 'b', 'c'].map(id => styleOf(titleOf(id)));

    for (const selected of ['b', 'c', 'a']) {
      screen.action(`route-template-${selected}`).props.onPress();
      screen.render();
      for (const [index, id] of ['a', 'b', 'c'].entries()) {
        const title = titleOf(id);
        const textStyle = styleOf(title);
        const card = screen.action(`route-template-${id}`);
        const cardStyle = styleOf(card);
        assert.equal(textStyle.fontSize, 15);
        assert.equal(textStyle.lineHeight, 22);
        assert.equal(textStyle.fontWeight, '500');
        const { color: beforeColor, ...beforeMetrics } = titleBeforeSelection[index];
        const { color: selectedColor, ...selectedMetrics } = textStyle;
        assert.deepEqual(selectedMetrics, beforeMetrics, 'selection changes paired ink, never text metrics');
        assert.equal(title.props.numberOfLines, undefined);
        assert.notEqual(title.props.allowFontScaling, false);
        assert.equal(cardStyle.minHeight, 104);
        assert.equal(cardStyle.height, undefined, 'a growing title must be able to grow its card');
        assert.notEqual(cardStyle.overflow, 'hidden');
        assert.equal(card.props.accessibilityState.selected, id === selected);
        if (id === selected) {
          assert.equal(cardStyle.borderWidth ?? 0, 0);
          assert.equal(cardStyle.backgroundColor, '#98D1FF');
          assert.equal(textStyle.color, '#17354D');
        }
      }
    }
    for (const image of screen.all('Image')) {
      const previewStyle = styleOf(image.parent);
      assert.equal(previewStyle.width, 76);
      assert.equal(previewStyle.height, 80);
    }
    assert.deepEqual(screen.startCalls, []);
  });
}

test('one preview notice replaces repeated card disclaimers while detailed truth stays in expandable help', () => {
  const screen = mountMap();
  assert.equal(screen.nodes.filter(node => node.props?.testID === 'route-preview-notice').length, 1);
  assert.match(screen.copy, /不是设备地图或已保存路线/);
  assert.match(screen.copy, /从设备地图开始规划巡航路线/);
  assert.doesNotMatch(screen.copy, /可用路线模板|已选择|路线界面预览|时长、距离与检查点待同步/);
  const heading = screen.all('Text').find(node => node.props.children === '巡航路线');
  const headingStyle = flattenStyle(heading.props.style);
  assert.equal(headingStyle.fontSize, 20);
  assert.equal(headingStyle.lineHeight, 28);
  assert.equal(headingStyle.fontWeight, '600');
  assert.equal(screen.action('route-start').props.disabled, true);
  assert.match(screen.copy, /连接设备后检查控制权限/);

  screen.action('route-details-toggle').props.onPress();
  screen.render();
  assert.match(screen.copy, /同步设备地图及版本信息/);
  assert.match(screen.copy, /编辑航点并保存到“我的路线”/);
  assert.match(screen.copy, /设备地图与路线编辑器尚在接入中/);
  assert.doesNotMatch(screen.copy, /当前版本不支持绘制或保存自定义路线/);
  assert.deepEqual(screen.startCalls, []);
});

test('route help expands real read-only details, collapses, and never changes the route selection or dispatches', () => {
  const screen = mountMap();
  screen.action('route-details-toggle').props.onPress();
  screen.render();
  assert.equal(screen.action('route-details-toggle').props.accessibilityState.expanded, true);
  assert.match(screen.copy, /这是界面示例/);
  assert.match(screen.copy, /地图接入后，可编辑航点并保存/);
  assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
  screen.action('route-details-toggle').props.onPress();
  screen.render();
  assert.equal(screen.nodes.some(node => node.props?.testID === 'route-details'), false);
  assert.deepEqual(screen.startCalls, []);
});

test('route libraries distinguish real saved routes from examples without inventing route data', () => {
  const screen = mountMap();
  assert.equal(screen.action('route-library-示例路线').props.accessibilityState.selected, true);
  assert.equal(screen.action('route-library-我的路线').props.accessibilityState.selected, false);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'route-owned-empty'), false);

  screen.action('route-library-我的路线').props.onPress();
  screen.render();
  assert.equal(screen.action('route-library-我的路线').props.accessibilityState.selected, true);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'route-owned-empty'), true);
  assert.match(screen.copy, /尚无已保存路线/);
  assert.match(screen.copy, /同步设备地图[\s\S]*编辑航点并保存[\s\S]*设备校验后执行/);
  assert.equal(screen.action('route-start'), undefined);
  assert.equal(screen.action('route-template-a'), undefined);

  screen.action('route-library-示例路线').props.onPress();
  screen.render();
  assert.equal(screen.action('route-library-示例路线').props.accessibilityState.selected, true);
  assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
  assert.deepEqual(screen.startCalls, []);
});

test('selecting a template resets help and filters preserve exactly one visible selected template', () => {
  const screen = mountMap();
  screen.action('route-details-toggle').props.onPress();
  screen.render();
  screen.action('route-template-b').props.onPress();
  screen.render();
  assert.equal(screen.action('route-details-toggle').props.accessibilityState.expanded, false);
  assert.equal(screen.action('route-template-b').props.accessibilityState.selected, true);
  screen.action('route-filter-收藏').props.onPress();
  screen.render();
  assert.equal(screen.action('route-template-b'), undefined);
  assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
  assert.equal(screen.action('route-template-c').props.accessibilityState.selected, false);
  screen.action('route-template-c').props.onPress();
  screen.action('route-filter-最近').props.onPress();
  screen.render();
  assert.equal(screen.action('route-template-c'), undefined);
  assert.equal(screen.action('route-template-a').props.accessibilityState.selected, true);
  assert.deepEqual(screen.startCalls, []);
});

test('templates cannot dispatch even if both capability flags are true or a disabled handler is invoked directly', () => {
  const screen = mountMap({ controlAvailable: true, executorAvailable: true });
  assert.equal(screen.action('route-start').props.disabled, true);
  assert.equal(screen.action('route-start').props.accessibilityState.disabled, true);
  assert.match(screen.copy, /路线模板尚未生成可信路线/);
  screen.action('route-start').props.onPress();
  screen.action('route-template-b').props.onPress();
  screen.render();
  screen.action('route-start').props.onPress();
  assert.deepEqual(screen.startCalls, []);
});

test('action touch targets are at least 48 points and all explicit copy stays 12sp or larger', () => {
  const screen = mountMap({ width: 844, height: 390, isDark: true });
  for (const id of ['route-start', 'route-details-toggle', 'route-filter-全部路线', 'route-filter-最近', 'route-filter-收藏', 'route-library-我的路线', 'route-library-示例路线']) {
    const node = screen.action(id);
    const style = flattenStyle(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
    assert.equal(style.minHeight >= 48, true, id);
  }
  for (const node of screen.all('Text')) {
    const style = flattenStyle(node.props.style);
    if (style.fontSize !== undefined) assert.equal(style.fontSize >= 12, true);
  }
  assert.equal(screen.all('Ionicons').find(node => node.props.name === 'checkmark').props.color, '#17354D');
});
