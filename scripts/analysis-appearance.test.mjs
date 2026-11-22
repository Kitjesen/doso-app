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
      if (name === 'expo-font') return { useFonts: () => [true, null] };
      if (name.endsWith('.otf')) return name;
      if (name === '../components/TrackPanel') return { TrackPanel: 'TrackPanel' };
      if (name === '../components/HomeText') return { Text: rn.Text };
      if (/(?:^|\/)AppText$/.test(name)) return { Text: rn.Text, TextInput: 'TextInput' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return rn;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons', Feather: 'Feather' };
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

test('production is an honest scrollable empty state with no fabricated charts or zero metrics', () => {
  for (const dark of [false, true]) for (const landscape of [false, true]) {
    const screen = mount({ dark, landscape });
    assert.equal(screen.nodes[0].type, 'ScrollView');
    assert.match(screen.copy, /还没有运行记录/);
    assert.match(screen.copy, /数据来源：设备上报.*待同步/);
    assert.doesNotMatch(screen.copy, /18\.6|92%|24|4\.8 km/);
    assert.equal(screen.nodes.some(node => node.props?.testID === 'analysis-chart'), false);
    assert.equal(screen.nodes.filter(node => node.type === 'Image').length, 0);
  }
});

test('preview renders native chart controls and a computed 18.6 hour weekly total', () => {
  const screen = mount({ dark: true, previewMode: true });
  assert.equal(screen.nodes.filter(node => node.type === 'Image').length, 0);
  assert.equal(screen.nodes.filter(node => /^analysis-bar-\d+$/.test(node.props?.testID ?? '')).length, 7);
  assert.match(screen.copy, /18\.6.*小时/);
  assert.match(screen.copy, /24.*完成任务.*92%.*完成率.*4\.8 km/);
  assert.ok(screen.nodes.some(node => node.props?.testID === 'analysis-chart'));
});

test('choosing a bar changes selected hours and selected accessibility state', () => {
  const screen = mount({ previewMode: true });
  screen.nodes.find(node => node.props?.testID === 'analysis-bar-5').props.onPress();
  screen.render();
  assert.match(screen.copy, /六.*3\.5\s+h/);
  assert.equal(screen.nodes.find(node => node.props?.testID === 'analysis-bar-5').props.accessibilityState.selected, true);
  assert.equal(screen.nodes.find(node => node.props?.testID === 'analysis-bar-2').props.accessibilityState.selected, false);
});

test('time range controls change data and reset the selected bar rather than relabeling the same graph', () => {
  const screen = mount({ previewMode: true });
  screen.nodes.find(node => node.props?.testID === 'analysis-range-今日').props.onPress();
  screen.render();
  assert.match(screen.copy, /3\.2.*小时/);
  assert.equal(screen.nodes.filter(node => /^analysis-bar-\d+$/.test(node.props?.testID ?? '')).length, 6);
  assert.equal(screen.nodes.find(node => node.props?.testID === 'analysis-bar-0').props.accessibilityState.selected, true);
  screen.nodes.find(node => node.props?.testID === 'analysis-range-30天').props.onPress();
  screen.render();
  assert.match(screen.copy, /74\.0.*小时/);
  assert.match(screen.copy, /该区间暂无小时分布/);
});

test('weekly heatmap has 7 rows with 12 two-hour bins rather than an arbitrary decorative matrix', () => {
  const screen = mount({ previewMode: true });
  const cells = screen.nodes.filter(node => node.props?.accessibilityLabel?.includes('活跃度'));
  assert.equal(cells.length, 7 * 12);
  assert.equal(cells.filter(node => node.props.accessibilityLabel.includes('0至2时')).length, 7);
  assert.equal(cells.filter(node => node.props.accessibilityLabel.includes('22至24时')).length, 7);
});

test('large text and narrow windows keep scroll flow and full-size range controls', () => {
  for (const config of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 1100, height: 700, fontScale: 1.6 }]) {
    const screen = mount({ ...config, previewMode: true });
    assert.equal(screen.nodes[0].type, 'ScrollView');
    const range = screen.nodes.find(node => node.props?.testID === 'analysis-range-7天');
    assert.ok(flatten(range.props.style).minHeight >= 44);
    assert.ok(screen.nodes.filter(node => node.type === 'Text').every(node => node.props.allowFontScaling !== false));
  }
});



