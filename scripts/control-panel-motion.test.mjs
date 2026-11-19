import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/ControlPanelMotion.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(platform = 'android') {
  let resolve, reject, listener, cleanup, starts = 0, stops = 0, removed = 0, configuration;
  const request = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate(options) { return options; }
  }
  const dependencies = {
    react: { useRef: value => ({ current: value }), useEffect: callback => { cleanup = callback(); } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      Platform: { OS: platform }, Easing: { cubic: 'cubic', out: value => value },
      Animated: { Value, View: 'AnimatedView', timing: (_value, options) => {
        configuration = options; return { start() { starts++; }, stop() { stops++; } };
      } },
      AccessibilityInfo: {
        isReduceMotionEnabled: () => request,
        addEventListener: (_event, callback) => { listener = callback; return { remove() { removed++; } }; },
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
  const node = module.exports.ControlPanelMotion({ testID: 'panel', style: { flex: 1 }, children: 'content' });
  const progress = node.props.style[1].opacity;
  return { node, progress, resolve, reject, listener, unmount: () => cleanup(),
    get starts() { return starts; }, get stops() { return stops; }, get removed() { return removed; },
    get configuration() { return configuration; }, async settle() { await Promise.resolve(); await Promise.resolve(); } };
}

test('panel motion uses a short native transition without gating children or input', async () => {
  const ui = mount(); ui.resolve(false); await ui.settle();
  assert.equal(ui.starts, 1); assert.equal(ui.configuration.duration, 180);
  assert.equal(ui.configuration.useNativeDriver, true);
  assert.equal(ui.node.props.children, 'content'); assert.equal(ui.node.props.pointerEvents, undefined);
  ui.unmount(); assert.equal(ui.stops, 1); assert.equal(ui.removed, 1);
});

test('reduced motion and preference read failure show the final state immediately', async () => {
  for (const failed of [false, true]) {
    const ui = mount(); if (failed) ui.reject(new Error('unavailable')); else ui.resolve(true);
    await ui.settle(); assert.equal(ui.starts, 0); assert.equal(ui.progress.value, 1); ui.unmount();
  }
});

test('a newer accessibility preference wins over a late initial query', async () => {
  const ui = mount(); ui.listener(true); ui.resolve(false); await ui.settle();
  assert.equal(ui.starts, 0); assert.equal(ui.progress.value, 1); ui.unmount();
});

test('unmount prevents a late query from starting an animation', async () => {
  const ui = mount(); ui.unmount(); ui.resolve(false); await ui.settle();
  assert.equal(ui.starts, 0); assert.equal(ui.removed, 1);
});

test('changing the motion preference stops the active transition; web avoids the native-driver fallback', async () => {
  const ui = mount('web'); ui.resolve(false); await ui.settle();
  assert.equal(ui.configuration.useNativeDriver, false);
  ui.listener(true); assert.equal(ui.stops, 1); assert.equal(ui.progress.value, 1); ui.unmount();
});
