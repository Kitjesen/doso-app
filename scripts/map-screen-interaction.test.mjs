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
    useRef(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const host = {
    KeyboardAvoidingView: 'View', Platform: { OS: 'web' }, Modal: 'Modal', TextInput: 'TextInput', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: value => value, flatten: flattenStyle },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)(?:AppText|HomeText)$/.test(name)) return { Text: host.Text, TextInput: 'TextInput' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return host;
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
      if (name === '@expo/vector-icons') return { Feather: 'Feather', Ionicons: 'Ionicons' };
      if (name === '../features/tasks/useTaskDraft') return { useTaskDraft() { const [draft, save] = react.useState(null); return { draft, save, loading: false, error: null, retry() {} }; } };
      if (name === '../components/TrackSheet') return { TrackSheet: ({ map, summary, children }) => [map, summary, children] };
      if (name === '../components/TaskEditor') return { TaskEditor: 'TaskEditor', makeTaskDraft: date => ({ name: '', route: '', checkpointCount: 1, checkpoint: 1, photo: false, pause: true, dwellSeconds: 10, date, time: '14:00', finish: 'wait' }) };
      if (name === '../components/ProductHeader') return { ProductHeader: 'ProductHeader' };
      if (name === '../components/RoutePreviewMap') return { RoutePreviewMap: 'RoutePreviewMap' };
      if (name === '../components/ControlPanelMotion') return { ControlPanelMotion: 'View' };
      if (name === '../features/routes/routePreview') return load('src/features/routes/routePreview.ts');
      if (name === '../fonts/home') return { homeFont: {}, productType: { title: {}, section: {}, body: {}, caption: {}, button: {} } };
      if (name === '../../assets/scene/route-campus.png') return 'route-campus';
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
      if (node.type === 'Modal' && node.props.visible === false) return;
      const entry = { ...node, parent };
      nodes.push(entry);
      walk(node.props.children, entry);
    }
    walk(MapScreen({ ...props, blockedReason: '连接设备后检查控制权限', controlAvailable, executorAvailable, robotName: 'THUNDER 01', onStartRoute: value => startCalls.push(value) }));
  }
  render();
  if (showExamples) { nodes.find(node => node.props?.testID === 'route-library').props.onPress(); render(); }
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


test('production empty state contains no examples or command and keeps connection action', () => {
  const screen=mountMap({showExamples:false,controlAvailable:true,executorAvailable:true});
  assert.match(screen.copy,/添加第一张点云地图/);
  assert.doesNotMatch(screen.copy,/东侧巡检路线|示例路线|执行器|界面示例/);
  assert.equal(screen.action('route-template-a'),undefined);
  assert.equal(screen.action('route-start'),undefined);
  let opened=0;
  screen.render({onOpenNavigation:()=>opened++});
  screen.action('map-open-navigation').props.onPress();
  assert.equal(opened,1);
  assert.deepEqual(screen.startCalls,[]);
});

test('selection, favorite filters and empty favorites never leave a hidden selected route',()=>{
  const screen=mountMap();
  screen.action('route-template-b').props.onPress();screen.render();
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.id,'b');
  screen.action('route-filter-收藏').props.onPress();screen.render();
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.id,'a');
  screen.action('route-favorite').props.onPress();screen.render();
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.id,'c');
  screen.action('route-favorite').props.onPress();screen.render();
  assert.equal(screen.all('RoutePreviewMap').length,0);
  assert.equal(screen.action('route-view'),undefined);
  assert.match(screen.copy,/暂无收藏路线/);
  screen.action('route-filter-全部').props.onPress();screen.render();
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.id,'b');
  assert.deepEqual(screen.startCalls,[]);
});

test('view and edit panels close, validate blank names, and apply only a local draft',()=>{
  const screen=mountMap({controlAvailable:true,executorAvailable:true});
  screen.action('route-view').props.onPress();screen.render();
  assert.ok(screen.all('Modal').length);
  screen.action('route-close').props.onPress();screen.render();
  assert.equal(screen.all('Modal').length,0);
  screen.action('route-sheet-edit').props.onPress();screen.render();
  screen.all('TextInput')[0].props.onChangeText('  ');screen.render();
  screen.action('route-save').props.onPress();screen.render();
  assert.match(screen.copy,/请输入 1–24/);
  screen.all('TextInput')[0].props.onChangeText('午后巡检');screen.render();
  screen.action('route-save').props.onPress();screen.render();
  assert.match(screen.copy,/午后巡检/);
  assert.equal(screen.all('Modal').length,0);
  screen.action('route-library').props.onPress();screen.render();
  screen.action('route-new').props.onPress();screen.render();
  screen.all('TextInput')[0].props.onChangeText('新路线');screen.render();
  screen.action('route-save').props.onPress();screen.render();
  screen.action('route-library').props.onPress();screen.render();
  assert.ok(screen.action('route-template-draft-1'));
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.name,'新路线');
  assert.deepEqual(screen.startCalls,[]);
  screen.render({showExamples:false});
  assert.equal(screen.all('RoutePreviewMap').length,0);
  assert.doesNotMatch(screen.copy,/午后巡检|新路线/);
});

test('recent filter includes newly selected routes and map selection survives resizing',()=>{
  const screen=mountMap({width:1280,height:800});
  screen.action('route-template-c').props.onPress();screen.render();
  screen.action('route-filter-最近').props.onPress();screen.render();
  assert.ok(screen.action('route-template-c'));
  screen.layout(1100,640);
  assert.equal(flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle).flexDirection,'row');
  screen.layout(620,600);
  assert.equal(flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle).flexDirection,'column');
  assert.equal(screen.all('RoutePreviewMap')[0].props.route.id,'c');
});

test('large text and dark mode keep growing cards and text-based selected state',()=>{
  const screen=mountMap({width:1280,height:800,fontScale:1.6,isDark:true});screen.layout(1100,640);
  assert.equal(flattenStyle(screen.all('ScrollView')[0].props.contentContainerStyle).flexDirection,'column');
  for(const id of ['a','b','c']){
    const card=screen.action('route-template-'+id),style=flattenStyle(card.props.style({pressed:false}));
    assert.equal(style.height,undefined);assert.ok(style.minHeight>=44);
    assert.equal(card.props.accessibilityState.selected,id==='a');
  }
  assert.deepEqual(screen.startCalls,[]);
});



test('GPS tab shows its supplied content without starting a route', () => {
  const screen = mountMap({ showExamples: false });
  screen.render({ gpsContent: 'Authorized GPS content' });
  const tab = screen.nodes.find(node => node.props?.accessibilityLabel === 'GPS 轨迹');
  tab.props.onPress(); screen.render();
  assert.match(screen.copy, /Authorized GPS content/);
  assert.equal(screen.all('TaskEditor').length, 0);
  assert.equal(screen.startCalls.length, 0);
});

test('using a preview route opens a local task draft without a publish handler', () => {
  const screen = mountMap();
  screen.action('route-close').props.onPress(); screen.render();
  screen.action('route-sheet-view').props.onPress(); screen.render();
  const editor = screen.all('TaskEditor')[0];
  assert.equal(editor.props.initial.route, '东侧巡检路线');
  assert.equal(editor.props.initial.checkpointCount, 6);
  assert.equal(editor.props.onPublish, undefined);
  editor.props.onSaveDraft({ ...editor.props.initial, name: '保存的草稿' });
  editor.props.onClose(); screen.render();
  screen.action('route-sheet-view').props.onPress(); screen.render();
  assert.equal(screen.all('TaskEditor')[0].props.initial.name, '保存的草稿');
  assert.equal(screen.startCalls.length, 0);
});
