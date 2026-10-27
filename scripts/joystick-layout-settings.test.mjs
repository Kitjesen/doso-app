import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createDefaultJoystickLayoutPreferences } from '../src/features/control/joystickLayoutPreferences.ts';
import * as preferences from '../src/features/control/joystickLayoutPreferences.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function render(layout = createDefaultJoystickLayoutPreferences().landscape, error = null, previewEnabled = true) {
  const module = { exports: {} }, changes = [], previews = [], clicks = [];
  const code = ts.transpileModule(readFileSync(new URL('../src/components/JoystickLayoutSettings.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const dependencies = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    './AppText': { Text: 'Text' },
    './ControlSlider': { ControlSlider: 'ControlSlider' },
    '../theme': { useAppTheme: () => ({ colors: { dangerText: '#b00' }, isDark: false }) },
    '../appearance': { getProductAppearance: () => ({ border: '#ddd', surface: '#eee', ink: '#111', canvas: '#fff', secondary: '#555', blueInk: '#258' }) },
    '../features/control/joystickLayoutPreferences': preferences,
  };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (!(name in dependencies)) throw Error(`Unexpected settings dependency: ${name}`);
    return dependencies[name];
  } });
  const root = module.exports.JoystickLayoutSettings({ orientation: 'landscape', layout,
    onChange: (side, patch) => changes.push([side, JSON.parse(JSON.stringify(patch))]),
    onPreview: previewEnabled ? (side, patch) => previews.push([side, JSON.parse(JSON.stringify(patch))]) : undefined,
    onReset: () => clicks.push('reset'), onClose: () => clicks.push('close'), storageError: error });
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node); walk(node.props?.children);
  }
  walk(root);
  return { changes, previews, clicks, find: id => nodes.find(node => node.props?.testID === id), nodes };
}

test('six sliders route preview separately from release commits, reset and close stay explicit', () => {
  const ui = render();
  const size = ui.find('joystick-layout-left-size-slider').props;
  size.onValueChange(1.2); size.onValueChange(1.23);
  ui.find('joystick-layout-right-x-slider').props.onValueChange(.91);
  assert.deepEqual(ui.changes, []);
  assert.deepEqual(ui.previews, [['left', { sizeScale: 1.2 }], ['left', { sizeScale: 1.23 }], ['right', { x: .91 }]]);
  size.onSlidingComplete(1.23);
  ui.find('joystick-layout-right-x-slider').props.onSlidingComplete(.91);
  ui.find('joystick-layout-left-y-slider').props.onSlidingComplete(.55);
  assert.deepEqual(ui.changes, [['left', { sizeScale: 1.23 }], ['right', { x: .91 }], ['left', { y: .55 }]]);
  assert.equal(ui.nodes.filter(node => node.type === 'ControlSlider').length, 6);
  assert.ok(ui.nodes.filter(node => node.type === 'ControlSlider').every(node => node.props.step === .01));
  ui.find('joystick-layout-reset').props.onPress(); ui.find('joystick-layout-close').props.onPress();
  assert.deepEqual(ui.clicks, ['reset', 'close']);
});

test('slider bounds are explicit, optional preview does not commit and storage failure remains visible', () => {
  const ui = render({ left: { sizeScale: .75, x: 0, y: 0 }, right: { sizeScale: 1.75, x: 1, y: 1 } }, '布局暂未保存');
  for (const side of ['left', 'right']) {
    for (const field of ['size', 'x', 'y']) {
      const slider = ui.find(`joystick-layout-${side}-${field}-slider`).props;
      assert.equal(slider.minimumValue, field === 'size' ? .75 : 0);
      assert.equal(slider.maximumValue, field === 'size' ? 1.75 : 1);
    }
  }
  assert.equal(ui.find('joystick-layout-storage-error').props.children, '布局暂未保存');
  assert.deepEqual(ui.changes, []);
  const noPreview = render(undefined, null, false);
  assert.equal(noPreview.find('joystick-layout-left-size-slider').props.onValueChange, undefined);
  noPreview.find('joystick-layout-left-size-slider').props.onSlidingComplete(1.5);
  assert.deepEqual(noPreview.changes, [['left', { sizeScale: 1.5 }]]);
});
