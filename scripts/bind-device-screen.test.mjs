import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function mountBindDeviceScreen(initialProps = {}) {
  const slots = [];
  const cleanups = [];
  const cache = new Map();
  let cursor = 0;
  let focusedLabel = null;
  let nodes = [];
  const props = { onBack: () => {}, onBind: () => {}, ...initialProps };
  const colors = {
    authFocus: '#0066FF', background: '#FFFFFF', dangerSurface: '#FFF1F0', dangerText: '#B42318',
    greenStrong: '#137A5B', ink: '#171C24', inkSoft: '#313844', line: '#E4E7EC', muted: '#616B79',
    surface: '#FFFFFF', surfaceStrong: '#F2F5FA', successText: '#137A5B',
  };
  const react = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(effect) {
      const slot = cursor++;
      if (!(slot in slots)) { slots[slot] = true; cleanups.push(effect()); }
    },
  };
  const allowed = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Text: 'Text', TextInput: 'TextInput', View: 'View',
      Platform: { OS: 'android', select: value => value.default }, StyleSheet: { create: value => value, hairlineWidth: 1 },
      useColorScheme: () => 'light',
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../components/GradientButton': { GradientButton: 'GradientButton' },
    '../theme': { useAppTheme: () => ({ colors, isDark: false }) },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: allowed['react-native'].Text, TextInput: allowed['react-native'].TextInput };
      if (name in allowed) return allowed[name];
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === './devicePageLayout') return load('src/screens/devicePageLayout.ts');
      throw new Error(`Unexpected bind screen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const { BindDeviceScreen } = load('src/screens/BindDeviceScreen.tsx');
  function render(nextProps = {}) {
    Object.assign(props, nextProps);
    cursor = 0;
    nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props));
      if (node.type === 'TextInput' && node.props.ref) {
        node.props.ref.current = { focus: () => { focusedLabel = node.props.accessibilityLabel; } };
      }
      nodes.push(node);
      walk(node.props.children);
    }
    walk(BindDeviceScreen(props));
    return nodes;
  }
  render();
  return {
    render,
    get nodes() { return nodes; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get focusedLabel() { return focusedLabel; },
    field: label => nodes.find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label),
    button: () => nodes.find(node => node.type === 'GradientButton'),
    cleanup: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

const styleOf = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

test('portrait uses one section gap and the readable binding type scale', () => {
  const screen = mountBindDeviceScreen();
  const layout = screen.nodes.find(node => node.type === 'View' && styleOf(node).gap === 24);
  assert.ok(layout, 'intro and form must share one 24px section gap');
  const [, card] = layout.props.children;
  assert.equal(styleOf(card).marginTop, undefined, 'card must not double the section gap');
  const back = screen.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '返回');
  assert.equal(styleOf(back).width, 48);
  assert.equal(styleOf(back).height, 48);
  const title = screen.nodes.find(node => node.type === 'Text' && node.props.children === '绑定机器人');
  assert.equal(styleOf(title).fontSize, 20);
  assert.equal(styleOf(title).lineHeight, 28);
  assert.equal(styleOf(title).fontWeight, '600');
  assert.equal(styleOf(card).borderRadius, 24);
  assert.equal(styleOf(card).padding, 16);
  assert.equal(styleOf(screen.field('设备序列号')).fontSize, 15);
  assert.equal(styleOf(screen.field('设备序列号')).lineHeight, 22);
});

test('validation shows both field errors, focuses the first invalid field, and sends nothing', () => {
  let bindCalls = 0;
  const screen = mountBindDeviceScreen({ onBind: () => { bindCalls += 1; } });
  screen.button().props.onPress();
  screen.render();
  assert.equal(bindCalls, 0);
  assert.equal(screen.focusedLabel, '设备序列号');
  assert.match(screen.copy, /完整序列号/);
  assert.match(screen.copy, /6–32 位字母或数字/);
  assert.match(screen.field('设备序列号').props.accessibilityHint, /完整序列号/);
  assert.match(screen.field('一次性绑定码').props.accessibilityHint, /6–32 位/);
});

test('editing one field clears only its own validation error', () => {
  const screen = mountBindDeviceScreen();
  screen.button().props.onPress();
  screen.render();
  screen.field('设备序列号').props.onChangeText('doso-th-000001');
  screen.render();
  assert.doesNotMatch(screen.copy, /完整序列号/);
  assert.match(screen.copy, /6–32 位字母或数字/);
  screen.field('一次性绑定码').props.onChangeText('claim01');
  screen.render();
  assert.doesNotMatch(screen.copy, /6–32 位字母或数字/);
  assert.equal(screen.field('一次性绑定码').props.value, 'CLAIM01');
});

test('valid submit normalizes values and synchronously blocks duplicate requests', async () => {
  let resolve;
  const payloads = [];
  const screen = mountBindDeviceScreen({ onBind: (serial, code) => {
    payloads.push([serial, code]);
    return new Promise(done => { resolve = done; });
  } });
  screen.field('设备序列号').props.onChangeText(' doso-th-000001 ');
  screen.render();
  screen.field('一次性绑定码').props.onChangeText('claim01');
  screen.render();
  screen.button().props.onPress();
  screen.button().props.onPress();
  screen.render();
  assert.deepEqual(payloads, [['DOSO-TH-000001', 'CLAIM01']]);
  assert.equal(screen.button().props.disabled, true);
  assert.equal(screen.field('设备序列号').props.editable, false);
  assert.equal(screen.field('一次性绑定码').props.editable, false);
  resolve();
  await new Promise(done => setImmediate(done));
  screen.render();
  assert.equal(screen.button().props.disabled, false);
  screen.cleanup();
});

test('parent busy state locks submission and repository errors stay global', () => {
  let bindCalls = 0;
  const screen = mountBindDeviceScreen({ busy: true, error: '网络连接失败，请稍后重试。', onBind: () => { bindCalls += 1; } });
  screen.button().props.onPress();
  assert.equal(bindCalls, 0);
  assert.equal(screen.button().props.disabled, true);
  assert.equal(screen.button().props.variant, 'auth');
  assert.equal(screen.field('设备序列号').props.editable, false);
  assert.equal(screen.field('一次性绑定码').props.editable, false);
  assert.match(screen.copy, /网络连接失败，请稍后重试/);
  assert.doesNotMatch(screen.copy, /完整序列号|6–32 位字母或数字/);
});
