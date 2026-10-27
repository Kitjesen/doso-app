import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const flat = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
function appearance(isDark) {
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/appearance.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { if (name === './theme') return { ...loadVisualTokenModules({ dark: isDark }).theme, useAppTheme: () => ({ isDark }) }; return require(name); } });
  return module.exports.useProductAppearance();
}

test('actual paired palette colors clear normal-text contrast in both themes', () => {
  for (const dark of [false, true]) {
    const p = appearance(dark);
    for (const [ink, surface] of [['ink', 'canvas'], ['secondary', 'surface'], ['secondary', 'quiet'], ['blueInk', 'blueSoft'], ['actionInk', 'action'], ['selectionInk', 'selectionSurface']]) {
      assert.ok(contrast(p[ink], p[surface]) >= 4.5, `${dark ? 'dark' : 'light'} ${ink}/${surface}`);
    }
    assert.equal(p.action, '#98D1FF');
    assert.equal(p.selectionSurface, p.action, 'one accent serves both selection and primary action');
    assert.equal(p.selectionInk, p.actionInk);
    assert.equal(p.quiet, p.surface, 'neutral semantic aliases cannot introduce another background grey');
  }
});

test('home uses consistent larger supporting type without 700-weight headings or disabled scaling', () => {
  for (const config of [{}, { dark: true }, { width: 320 }, { width: 390, fontScale: 1.6 }]) {
    const screen = mountAuthScreen({ screen: 'home', robotName: 'THUNDER 01', robotImage: 'robot', connected: false, canRecall: false, safetyLock: false, ...config });
    const texts = screen.nodes.filter(node => node.type === 'Text');
    for (const node of texts) {
      const style = flat(node.props.style);
      if (style.fontSize != null) assert.ok(style.fontSize >= 13);
      assert.notEqual(style.fontWeight, '700');
      assert.notEqual(node.props.allowFontScaling, false);
      assert.equal(node.props.maxFontSizeMultiplier, undefined);
    }
    const name = texts.find(node => node.props.children === 'THUNDER 01');
    assert.equal(flat(name.props.style).fontSize, 22);
    assert.equal(flat(name.props.style).lineHeight, 30);
    assert.doesNotMatch(screen.copy, /查看路线|查看任务|状态与设置/);
    assert.match(screen.copy, /离线/); assert.match(screen.copy, /电量待同步/);
  }
});

test('no new font library, color-only selection or success copy is introduced', () => {
  const source = readFileSync(new URL('../src/screens/TasksScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /name=\{active \? 'radio-button-on' : 'radio-button-off'\}/);
  assert.match(source, /accessibilityState=\{\{ selected: active \}\}/);
  assert.match(source, /任务模板/);
  assert.match(source, /可查看流程，不会发送指令/);
  assert.doesNotMatch(source, /fontWeight: '700'|fontSize: 12|checkmark-circle|已完成/);
  for (const copy of ['查看回充流程', '查看巡检流程', '查看安全流程']) assert.ok(source.includes(copy));
});

test('home hero and status have no nested surface while truthful state stays visible', () => {
  for (const dark of [false, true]) {
    const screen = mountAuthScreen({ screen: 'home', dark, robotName: 'THUNDER 01', robotImage: 'robot', connected: false, canRecall: false, safetyLock: false });
    for (const id of ['home-device-hero', 'home-connection-state']) {
      const node = screen.nodes.find(node => node.props?.testID === id);
      assert.equal(flat(node.props.style).backgroundColor, undefined);
    }
    const card = screen.nodes.find(node => node.props?.testID === 'home-device-card');
    assert.equal(flat(card.props.style).backgroundColor, appearance(dark).surface);
    assert.match(screen.copy, /离线/); assert.match(screen.copy, /电量待同步/);
    assert.equal(screen.nodes.some(node => node.props?.testID === 'home-battery-meter'), false);
    assert.equal(screen.action('home-recall').props.disabled, true);
  }
});
