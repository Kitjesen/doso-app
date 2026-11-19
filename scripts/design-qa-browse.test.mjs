import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function mount(search = '?design-qa=1&qa-browse=1', rootProps = {}) {
  const slots = [];
  let cursor = 0, nodes = [], theme = null, backHandler = null;
  const cleanups = [];
  const react = {
    useCallback: callback => callback,
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  };
  const imports = {
    '../features/routes/routePreview': { previewRoutes: [] },
    './VideoFixture': { VideoFixture: 'VideoFixture' }, './HomeFixture': { HomeMapFixture: 'HomeMapFixture',homeJourney: {},homeEvents: [] }, './ProfileFixture': { ProfileFixture: 'ProfileScreen' },
    './HomeInteractionPrototype': { HomeInteractionPrototype: 'HomeInteractionPrototype' },
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'View'].map(x => [x, x])), BackHandler: { addEventListener(event, handler) { assert.equal(event, 'hardwareBackPress'); backHandler = handler; return { remove() { backHandler = null; } }; } }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    '../theme': { AppearanceControlContext: { Provider: props => props.children }, ThemePreferenceContext: { Provider: props => { theme = props.value; return props.children; } }, useAppTheme: () => ({ colors: {}, isDark: theme === 'dark' }) },
    '../assets': { images: { thunderJointDiagram: 'thunder-v4-top-line' } },
    '../features/robot-lifecycle/robotDiagnosticsGateway': { createRobotDiagnosticsGateway: () => ({}) },
    './ControlReferencePreview': { ControlReferencePreview: 'ControlReferencePreview' },
  };
  function load(file) {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: 'Text', TextInput: 'TextInput' };
      if (name in imports) return imports[name];
      if (name === './request') return load('src/design-qa/request.ts');
      if (name === '../components/notification-notice') return load('src/components/notification-notice.ts');
      if (/^\.\.\/(screens|components)\//.test(name)) { const component = name.split('/').at(-1); return { [component]: component }; }
      throw new Error('Unexpected dependency: ' + name);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire, URLSearchParams, Date });
    return module.exports;
  }
  const Root = load('src/design-qa/DesignQaRoot.tsx').DesignQaRoot;
  function visit(node) {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.type === 'function') { visit(node.type(node.props)); return; }
    nodes.push(node); visit(node.props?.children);
  }
  const api = {
    render() { cleanups.splice(0).forEach(cleanup => cleanup()); cursor = 0; nodes = []; visit(Root({ search, ...rootProps })); },
    back() { const handled = backHandler?.() ?? false; api.render(); return handled; },
    node(type) { const node = nodes.find(x => x.type === type); assert.ok(node, type); return node; },
    click(label) { const node = nodes.find(x => x.props?.accessibilityLabel === label); assert.ok(node, label); node.props.onPress(); api.render(); },
    get theme() { return theme; },
    get nodes() { return nodes; },
  };
  api.render(); return api;
}
test('browse opens home in dark mode and all five tabs navigate', () => {
  const app = mount();
  assert.equal(app.theme, 'dark'); app.node('HomeScreen');
  for (const [tab, screen] of [['map', 'MapScreen'], ['tasks', 'TasksScreen'], ['analysis', 'AnalysisScreen'], ['profile', 'ProfileScreen'], ['home', 'HomeScreen']]) {
    app.node('BottomNav').props.onChange(tab); app.render(); app.node(screen);
  }
  app.click('切换浅色'); assert.equal(app.theme, 'light');
  app.click('切换深色'); assert.equal(app.theme, 'dark');
});

test('each main tab renders its own header and keeps the bottom navigation available', () => {
  const app = mount();
  for (const tab of ['home','tasks','analysis','map','profile']) {
    app.node('BottomNav').props.onChange(tab); app.render();
    assert.equal(app.nodes.some(node => node.type === 'AppHeader'), false);
    assert.equal(app.node('AppToast').props.notice,null);
  }
});

test('capture browsing hides QA chrome but keeps real tab navigation and disabled commands', () => {
  const app = mount('?design-qa=1&qa-browse=1&qa-stage=main-home', { hideDisclosure: true });
  assert.equal(app.theme, 'dark', 'capture uses the default product palette');
  assert.equal(app.nodes.some(node => node.props?.accessibilityLabel === '测试首页'), false);
  const home = app.node('HomeScreen').props;
  assert.equal(home.onRecall, undefined);
  app.node('BottomNav').props.onChange('tasks'); app.render();
  const tasks = app.node('TasksScreen').props;
  assert.equal(tasks.controlAvailable, false);
  assert.equal(tasks.executorAvailable, false);
  assert.equal(app.node('BottomNav').props.active, 'tasks');
});
test('control, return and page picker work while write callbacks remain inert', () => {
  const app = mount();
  const home = app.node('HomeScreen').props;
  assert.equal(home.onRecall, undefined); app.render(); app.node('HomeScreen');
  home.onOpenVideo(); app.render();
  const control = app.node('ControlScreen').props;
  assert.equal(control.allowInteractionPreview, true, 'local input demo does not grant robot capability');
  assert.equal(control.canUseManualControl, false); control.onBack(); app.render(); app.node('HomeScreen');
  app.click('切换测试页面'); app.click('查看注册');
  app.node('RegisterScreen').props.onRegister(); app.render(); app.node('RegisterScreen');
  app.node('RegisterScreen').props.onBackToLogin(); app.render(); app.node('LoginScreen');
  app.click('测试首页'); app.node('HomeScreen');
});
test('static screenshot mode stays system-themed and does not navigate', () => {
  const app = mount('?design-qa=1&qa-stage=main-home&qa-state=default');
  assert.equal(app.theme, 'dark');
  app.node('BottomNav').props.onChange('tasks'); app.render(); app.node('HomeScreen');
});
test('analysis browsing does not invent telemetry', () => {
  const app = mount(); app.node('BottomNav').props.onChange('analysis'); app.render();
  assert.equal(app.node('AnalysisScreen').props.previewMode, false);
});

test('joint fixture requires an explicit local QA option and is labelled as simulated', () => {
  const empty = mount('?design-qa=1&qa-stage=robot-control&qa-extra=joint-status').node('JointStatusScreen').props;
  assert.equal(empty.joints, undefined);
  const app = mount('?design-qa=1&qa-stage=robot-control&qa-extra=joint-status&qa-fixture=joints');
  const fixture = app.node('JointStatusScreen').props;
  assert.match(fixture.deviceName, /模拟数据.*非机器狗/);
  assert.equal(fixture.robotDiagram, 'thunder-v4-top-line');
  assert.equal(fixture.joints.length, 16);
  assert.equal(fixture.joints.filter(joint => joint.online === false).length, 1);
  assert.deepEqual(Array.from(fixture.joints[3].errors), [2]);
  fixture.onBack(); app.render();
  assert.equal(app.node('ControlScreen').props.canUseManualControl, false);
});

test('Android back closes the page picker, returns home, and only then permits exit', () => {
  const app = mount();
  app.node('HomeScreen').props.onOpenVideo(); app.render();
  app.click('切换测试页面');
  assert.equal(app.back(), true); app.node('ControlScreen');
  assert.equal(app.back(), true); app.node('HomeScreen');
  assert.equal(app.back(), false);
  assert.equal(mount('?design-qa=1&qa-stage=auth-login').back(), false);
});

test('profile control returns to its origin and the editor never pretends to persist QA data', async () => {
  const app = mount();
  app.node('BottomNav').props.onChange('profile'); app.render();
  app.node('ProfileScreen').props.onOpenControl(); app.render();
  app.node('ControlScreen').props.onBack(); app.render(); app.node('ProfileScreen');
  app.node('ProfileScreen').props.onEditProfile(); app.render();
  const editor = app.node('EditProfileScreen').props;
  await assert.rejects(editor.onSave({ username: 'new_name', displayName: 'New name' }), /不会写入账户资料/);
  let guarded = 0;
  editor.onBackRequestChange(() => guarded++);
  assert.equal(app.back(), true); assert.equal(guarded, 1);
  app.node('EditProfileScreen').props.onBack(); app.render(); app.node('ProfileScreen');
  app.node('ProfileScreen').props.onEditProfile(); app.render(); app.node('EditProfileScreen');
});
