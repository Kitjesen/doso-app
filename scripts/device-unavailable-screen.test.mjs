import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

// Semantic render test for this side-effect-free screen. Native layout is
// verified separately by Android screenshots; these host stubs do not run Yoga.
function renderScreen(capability, dark, landscape, onBack) {
  const cache = new Map();
  const host = {
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: v => v, hairlineWidth: 1 },
    Platform: { select: v => v.default },
    useColorScheme: () => dark ? 'dark' : 'light',
    useWindowDimensions: () => landscape ? { width: 844, height: 390 } : { width: 390, height: 844 },
  };
  const allowed = {
    react: { useState: () => [landscape ? 796 : 390, () => {}], createContext: value => ({ value }), useContext: context => context.value },
    'react-native': host,
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView',
      useSafeAreaInsets: () => ({ top: 28, bottom: 28, left: landscape ? 48 : 0, right: 0 }),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
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
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '../theme') return load('src/theme.ts');
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === '../components/GradientButton') return load('src/components/GradientButton.tsx');
      if (name === './AuthEntry') return { useAuthEntryPalette: () => ({ button: '#0066FF', buttonInk: '#FFFFFF', quiet: '#F2F5FA', secondary: '#616B79' }) };
      if (name === './devicePageLayout') return load('src/screens/devicePageLayout.ts');
      throw new Error(`Unexpected dependency in non-executable device screen: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: path.basename(relative) });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const { DeviceUnavailableScreen } = load('src/screens/DeviceUnavailableScreen.tsx');
  const result = [];
  function walk(node) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') { result.push({ type: 'copy', value: String(node) }); return; }
    if (typeof node.type === 'function') return walk(node.type(node.props));
    result.push(node);
    walk(node.props.children);
  }
  walk(DeviceUnavailableScreen({ capability, deviceName: 'Test Robot', onBack }));
  return result;
}

for (const capability of ['provisioning', 'firmware']) {
  for (const mode of ['light', 'dark', 'landscape']) {
    test(`${capability} ${mode}: product UI has only return actions and no simulated state`, () => {
      let backCount = 0;
      const nodes = renderScreen(capability, mode === 'dark', mode === 'landscape', () => { backCount += 1; });
      const copy = nodes.filter(n => n.type === 'copy').map(n => n.value).join(' ');
      assert.match(copy, /Test Robot/);
      assert.match(copy, /暂未开放/);
      assert.doesNotMatch(copy, /开发演示|模拟成功|18\.6 MB|v2\.4\.1|重新尝试|开始更新|发送密码/);
      assert.equal(nodes.some(n => n.type === 'TextInput'), false);
      const actions = nodes.filter(n => typeof n.props?.onPress === 'function');
      assert.equal(actions.length, 2, 'header and primary action must both lead back');
      for (const action of actions) action.props.onPress();
      assert.equal(backCount, actions.length, 'no action may start a device operation');
      assert.equal(nodes.some(n => n.props?.accessibilityRole === 'progressbar'), false);
      const safe = nodes.find(n => n.type === 'SafeAreaView');
      assert.deepEqual(Array.from(safe.props.edges), ['top', 'left', 'right', 'bottom']);
      if (mode === 'landscape') {
        const styleOf = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
        const row = nodes.find(n => n.type === 'View' && styleOf(n).flexDirection === 'row' && styleOf(n).maxWidth === 960);
        assert.ok(row, 'the device page must keep its bounded landscape row');
        assert.equal(styleOf(row).width, 748, 'row width must exclude the real 48px cutout and both 24px gutters');
        const [intro, details] = row.props.children;
        assert.equal(styleOf(intro).width, 333);
        assert.equal(styleOf(details).width, 391);
        assert.equal(styleOf(row).gap, 24);
        assert.equal(styleOf(intro).flex, 0);
        assert.equal(styleOf(details).flex, 0);
        assert.equal(styleOf(intro).flexGrow, 0);
        assert.equal(styleOf(details).flexGrow, 0);
      }
    });
  }
}
