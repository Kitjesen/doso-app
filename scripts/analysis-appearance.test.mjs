import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

// Executes the real component/style branches. Yoga and native insets require device tests.
function mount({ dark = false, landscape = false, previewMode = false, header = false, width = landscape ? 844 : 390, height = landscape ? 390 : 844, fontScale = 1 } = {}) {
  const cache = new Map();
  const slots = [];
  let cursor = 0;
  const react = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useEffect: fn => { fn(); },
    useMemo: fn => fn(),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  };
  const rn = {
    Image: 'Image', ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable',
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    Platform: { OS: 'android', select: value => value.default },
    useColorScheme: () => dark ? 'dark' : 'light',
    useWindowDimensions: () => ({ width, height, fontScale }),
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: rn.Text, TextInput: 'TextInput' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return rn;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '../assets') return { images: new Proxy({}, { get: (_, key) => key }) };
      if (name === '../theme' || name === './theme') return load('src/theme.ts');
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      if (name === './UserAvatar') return load('src/components/UserAvatar.tsx');
      if (name === '../features/analysis/analysisPreview') return load('src/features/analysis/analysisPreview.ts');
      throw new Error(`Unexpected dependency: ${name}`);
    };
    const code = ts.transpileModule(read(file), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, Date });
    cache.set(file, module.exports);
    return module.exports;
  }
  let nodes = [];
  function walk(node) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
    if (typeof node.type === 'function') return walk(node.type(node.props));
    nodes.push(node); walk(node.props.children);
  }
  const render = () => { cursor = 0; nodes = []; walk(header ? load('src/components/AppHeader.tsx').AppHeader({ flow: true }) : load('src/screens/AnalysisScreen.tsx').AnalysisScreen({ previewMode })); };
  render();
  return { render, get nodes() { return nodes; }, theme: load('src/theme.ts'), get copy() { return nodes.filter(n => n.type === 'copy').map(n => n.value).join(' '); } };
}

test('measured wide analysis separates telemetry state from data availability without fabricating history', () => {
  const screen = mount({ width: 960, height: 600 });
  assert.equal(typeof screen.nodes[0].props.onLayout, 'function');
  screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: 882, height: 512 } } });
  screen.render();
  const body = screen.nodes.find(node => node.props?.testID === 'analysis-state-columns');
  assert.equal(flatten(body.props.style).flexDirection, 'row');
  assert.match(screen.copy, /数据可用性/);
  assert.match(screen.copy, /尚未同步可信遥测/);
  assert.doesNotMatch(screen.copy, /12\.8|32°C|8 \/ 10/);
});

test('analysis uses measured short or narrow space and large fonts as single-column scroll fallbacks', () => {
  for (const config of [{ measuredWidth: 620, measuredHeight: 512 }, { measuredWidth: 1122, measuredHeight: 360 }, { measuredWidth: 1122, measuredHeight: 712, fontScale: 1.5 }]) {
    const screen = mount({ width: 1280, height: 800, fontScale: config.fontScale ?? 1 });
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: config.measuredWidth, height: config.measuredHeight } } });
    screen.render();
    const columns = screen.nodes.find(node => node.props?.testID === 'analysis-state-columns');
    assert.equal(flatten(columns.props.style).flexDirection, 'column');
    assert.equal(screen.nodes[0].type, 'ScrollView');
    assert.match(screen.copy, /距离记录.*待同步.*任务记录.*待同步.*运行记录.*待同步/);
  }
});

test('analysis uses a flow header in production and QA, avoiding a floating header over its title', () => {
  assert.match(read('App.tsx'), /<AppHeader\s+flow(?:\s|>)/);
  assert.match(read('src/design-qa/DesignQaRoot.tsx'), /<AppHeader\s+flow(?:\s|>)/);
  for (const dark of [false, true]) {
    const { nodes } = mount({ dark, landscape: true, header: true });
    assert.equal(flatten(nodes[0].props.style).position, 'relative');
    assert.equal(flatten(nodes[0].props.style).top, 0);
    assert.equal(flatten(nodes[0].props.style).width, '100%');
  }
});

test('trusted empty analysis remains scrollable, uses native text and never invents history', () => {
  for (const dark of [false, true]) for (const landscape of [false, true]) {
    const { nodes, copy } = mount({ dark, landscape });
    assert.equal(nodes[0].type, 'ScrollView');
    assert.equal(nodes[0].props.contentInsetAdjustmentBehavior, 'automatic');
    assert.equal(nodes.filter(n => n.type === 'Image').length, 0);
    assert.match(copy, /尚未同步可信遥测/);
    assert.match(copy, /尚未接入历史数据服务/);
    assert.doesNotMatch(copy, /12\.8|32°C|8 \/ 10/);
    const labels = nodes.filter(n => n.type === 'Text');
    for (const label of labels) assert.ok(flatten(label.props.style).fontSize >= 13);
    const row = nodes.find(n => n.type === 'View' && flatten(n.props.style).flexWrap === 'wrap');
    assert.ok(row, 'source label/value can wrap under larger fonts');
  }
});

test('design-only image previews scroll vertically and wrap instead of clipping below the flow header', () => {
  const { nodes } = mount({ landscape: true, previewMode: true });
  assert.notEqual(nodes[0].props.horizontal, true);
  assert.equal(flatten(nodes[0].props.contentContainerStyle).flexWrap, 'wrap');
  const images = nodes.filter(n => n.type === 'Image');
  assert.equal(images.length, 2);
  assert.ok(images.every(n => flatten(n.props.style).marginTop < 10));
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test('readable muted text meets 4.5:1 against all semantic surfaces in both themes', () => {
  const { theme } = mount();
  for (const colors of [theme.lightColors, theme.darkColors]) {
    for (const key of ['background', 'surface', 'surfaceStrong']) {
      const [a, b] = [luminance(colors.muted), luminance(colors[key])].sort((x, y) => y - x);
      assert.ok((a + 0.05) / (b + 0.05) >= 4.5, `${colors.muted} on ${colors[key]}`);
    }
  }
});

test('analysis preview borrows hero/metrics hierarchy without restoring green decorative surfaces', () => {
  const source = read('src/screens/AnalysisScreen.tsx');
  assert.doesNotMatch(source, /rgba\(88,245,139/);
  assert.doesNotMatch(source, /#173F2D/);
  assert.match(source, /const p = getProductAppearance\(isDark\)/);
  assert.match(source, /performanceCard:[\s\S]*backgroundColor: p\.surface/);
  assert.match(source, /summaryCard:[\s\S]*backgroundColor: p\.surface/);
  assert.match(source, /metricGrid:/);
  assert.match(source, /chartBlock:/);
  assert.match(source, /dateGrid:[\s\S]*borderWidth: 0/);
  assert.match(source, /datePill:[\s\S]*borderWidth: 0/);
  assert.match(source, /previewDisclosure: \{ \.\.\.typography\.supporting/);
});
