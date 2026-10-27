import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/GradientButton.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

// Render real component semantics/handlers. Native size and spinner rendering are checked on the emulator.
function renderButton(props, dark = false) {
  const tokens = loadVisualTokenModules({ dark });
  const { colors } = tokens.theme.useAppTheme();
  const appearance = tokens.appearance.useProductAppearance();
  // The AuthEntry dependency is the button-only seam; its mapped role values
  // come from production tokens, while the workflow test loads AuthEntry itself.
  const palette = { accent: appearance.blueInk, secondary: appearance.secondary,
    quiet: appearance.surface, button: appearance.action, buttonInk: appearance.actionInk };
  const allowed = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    '../theme': { radii: { pill: 999 }, useAppTheme: () => ({ colors }) },
    '../appearance': tokens.appearance,
    '../typography': tokens.typography,
    './AuthEntry': { useAuthEntryPalette: () => palette },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (/(?:^|\/)AppText$/.test(name)) return { Text: allowed['react-native'].Text, TextInput: 'TextInput' };
    assert.ok(name in allowed, `Unexpected dependency: ${name}`); return allowed[name];
  } });
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node); visit(node.props?.children);
  }
  visit(module.exports.GradientButton({ label: '继续', onPress() {}, ...props }));
  return nodes;
}
const styleOf = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

for (const dark of [false, true]) for (const variant of ['auth', 'bright', 'dark']) {
  test(`${dark ? 'dark' : 'light'} ${variant}: loading is announced, blocks dispatch and preserves target size`, () => {
    let calls = 0;
    const normal = renderButton({ variant }, dark);
    const pending = renderButton({ variant, loading: true, label: '正在处理…', onPress: () => calls++ }, dark);
    const button = pending.find(node => node.type === 'Pressable');
    assert.equal(button.props.accessibilityState.busy, true);
    assert.equal(button.props.accessibilityState.disabled, true);
    assert.equal(button.props.accessibilityLabel, '正在处理…');
    assert.equal(button.props.disabled, true);
    button.props.onPress(); assert.equal(calls, 0);
    assert.equal(pending.filter(node => node.type === 'ActivityIndicator').length, 1);
    assert.equal(pending.find(node => node.type === 'ActivityIndicator').props.accessible, false);
    assert.equal(pending.find(node => node.type === 'Text').props.accessibilityLiveRegion, 'polite');
    const surface = nodes => styleOf(nodes.find(node => node.type === 'View').props.style);
    assert.equal(surface(normal).minHeight, surface(pending).minHeight);
    assert.ok(surface(pending).minHeight >= 44);
    assert.equal(button.props.style({ pressed: true }).filter(Boolean).length, 1, 'disabled press must not scale');
  });
}

test('disabled eligibility is not loading; enabled/recovered action dispatches normally', () => {
  let calls = 0;
  const locked = renderButton({ disabled: true, onPress: () => calls++ });
  assert.equal(locked.find(node => node.type === 'Pressable').props.accessibilityState.busy, false);
  assert.equal(locked.filter(node => node.type === 'ActivityIndicator').length, 0);
  locked.find(node => node.type === 'Pressable').props.onPress(); assert.equal(calls, 0);
  const ready = renderButton({ onPress: () => calls++, compact: true });
  ready.find(node => node.type === 'Pressable').props.onPress(); assert.equal(calls, 1);
  assert.ok(styleOf(ready.find(node => node.type === 'View').props.style).minHeight >= 44);
});

for (const screenName of ['login', 'register']) test(`${screenName}: only active social authorization spins; email action stays disabled and recovers`, async () => {
  let finish;
  const screen = mountAuthScreen({ screen: screenName, ready: ['wechat'], onSocialLogin: () => new Promise(resolve => { finish = resolve; }) });
  const pending = screen.action(`${screenName}-social-wechat`).props.onPress(); screen.render();
  const email = screen.action(`${screenName}-submit`);
  assert.equal(email.props.disabled, true);
  assert.equal(email.props.accessibilityState.busy, false);
  assert.equal(screen.action(`${screenName}-social-wechat`).props.accessibilityState.busy, true);
  assert.equal(screen.nodes.filter(node => node.type === 'ActivityIndicator').length, 1);
  finish(); await pending; screen.render();
  assert.equal(screen.action(`${screenName}-submit`).props.disabled, false);
  assert.equal(screen.nodes.filter(node => node.type === 'ActivityIndicator').length, 0);
});
