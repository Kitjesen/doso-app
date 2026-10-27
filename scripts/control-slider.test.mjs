import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url), ts = require('typescript');
function runtime(initial = {}) {
  const slots = [], effects = [], pending = [], previews = [], commits = [];
  let cursor = 0, nodes = [], disposed = false, lateUpdates = 0;
  let props = { value: .5, minimumValue: 0, maximumValue: 1, step: .01, label: '水平', accessibilityLabel: '移动摇杆水平',
    testID: 'slider', formatValue: value => `${Math.round(value * 100)}%`,
    onValueChange: value => previews.push(value), onSlidingComplete: value => commits.push(value), ...initial };
  const react = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) {
      const index = cursor++; if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { if (disposed) lateUpdates++; slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useCallback(callback, dependencies) {
      const index = cursor++, old = slots[index];
      if (!old || dependencies.some((value, key) => value !== old.dependencies[key])) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++, old = effects[index];
      if (!old || dependencies.some((value, key) => value !== old.dependencies[key])) pending.push(() => {
        old?.cleanup?.(); effects[index] = { dependencies, cleanup: callback() };
      });
    },
  };
  const module = { exports: {} };
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { View: 'View', Platform: { OS: 'web' }, StyleSheet: { create: value => value } },
    './AppText': { Text: 'Text' }, '../theme': { useAppTheme: () => ({ isDark: false }) },
    '../appearance': { getProductAppearance: () => ({ border: '#ddd', action: '#98d1ff', canvas: '#fff', ink: '#111', secondary: '#555', blueInk: '#258' }) },
  };
  const code = ts.transpileModule(readFileSync(new URL('../src/components/ControlSlider.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (!(name in dependencies)) throw Error(`Unexpected slider dependency: ${name}`);
    return dependencies[name];
  } });
  function render(next) {
    if (next) props = { ...props, ...next };
    cursor = 0; nodes = [];
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      nodes.push(node); walk(node.props?.children);
    }
    walk(module.exports.ControlSlider(props));
    pending.splice(0).forEach(effect => effect());
  }
  render();
  return { render, previews, commits,
    track: () => nodes.find(node => node.props?.testID === 'slider'),
    find: id => nodes.find(node => node.props?.testID === id),
    layout(width = 200, x = 0) { this.track().props.onLayout({ nativeEvent: { layout: { width, height: 44, x, y: 0 } } }); render(); },
    unmount() { disposed = true; effects.forEach(effect => effect?.cleanup?.()); },
    get lateUpdates() { return lateUpdates; },
  };
}
const point = (identifier, pageX, locationX = 100) => ({ identifier, pageX, locationX });
function event({ active = [], changed = active, at = 1000, local = 100 } = {}) {
  return { nativeEvent: { touches: active, changedTouches: changed, timestamp: at, locationX: local } };
}
function begin(ui, id = 1) { ui.track().props.onResponderGrant(event({ active: [point(id, 200)] })); ui.render(); }
function move(ui, x, id = 1, at = 1001) { ui.track().props.onResponderMove(event({ active: [point(id, x, 1)], at, local: 1 })); ui.render(); }

test('drag previews locally with a fixed page origin and commits once only when the owner releases', () => {
  const ui = runtime(); ui.layout(); begin(ui);
  move(ui, 243); // The original track begins at pageX100: this is75%, even if locationX changes.
  assert.deepEqual(ui.previews, [.75]); assert.deepEqual(ui.commits, []);
  assert.equal(ui.find('slider-value').props.children, '75%');
  const release = event({ changed: [point(1, 243)], at: 1002 });
  ui.track().props.onResponderEnd(release); ui.track().props.onResponderRelease(release);
  assert.deepEqual(ui.commits, [.75]);
  move(ui, 286); assert.deepEqual(ui.previews, [.75]);
  ui.unmount();
});

test('many moves are stepped and bounded without one persistence commit per move', () => {
  const ui = runtime(); ui.layout(); begin(ui);
  for (const pageX of [120, 154.592, 243, 9999, -9999]) move(ui, pageX);
  assert.ok(ui.previews.includes(.24));
  assert.ok(ui.previews.every(value => value >= 0 && value <= 1 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8));
  assert.deepEqual(ui.commits, []);
  ui.track().props.onResponderRelease(event({ changed: [point(1, 286)], at: 1002 }));
  assert.deepEqual(ui.commits, [1]); ui.unmount();
});

test('zero width, malformed coordinates, nonowners and stale event timestamps do not retarget a gesture', () => {
  const ui = runtime(); begin(ui); assert.deepEqual(ui.previews, []);
  ui.layout(NaN); begin(ui); assert.deepEqual(ui.commits, []);
  ui.layout(); ui.track().props.onResponderGrant(event({ active: [point(1, NaN)] }));
  begin(ui);
  ui.track().props.onResponderMove(event({ active: [point(2, 286), point(1, 200)] }));
  ui.track().props.onResponderEnd(event({ active: [point(1, 200)], changed: [point(2, 286)] }));
  move(ui, NaN); move(ui, 286, 1, 999);
  assert.deepEqual(ui.previews, []); assert.deepEqual(ui.commits, []);
  move(ui, 243); ui.track().props.onResponderRelease(event({ changed: [point(1, 243)], at: 1002 }));
  assert.deepEqual(ui.commits, [.75]); ui.unmount();
});

test('responder cancellation or track geometry change restores preview without a commit', () => {
  for (const kind of ['cancel', 'width', 'position']) {
    const ui = runtime(); ui.layout(); begin(ui); move(ui, 243);
    const old = ui.track().props;
    if (kind === 'cancel') old.onResponderTerminate(event({ changed: [point(1, 243)] }));
    if (kind === 'width') ui.layout(220);
    if (kind === 'position') ui.layout(200, 20);
    ui.render(); assert.deepEqual(ui.previews, [.75, .5], kind); assert.deepEqual(ui.commits, [], kind);
    old.onResponderMove(event({ active: [point(1, 286)] })); old.onResponderRelease(event({ changed: [point(1, 286)] }));
    assert.deepEqual(ui.commits, [], kind); ui.unmount();
  }
});

test('disable and unmount retire handlers without late previews, commits or state updates', () => {
  for (const kind of ['disable', 'unmount']) {
    const ui = runtime(); ui.layout(); begin(ui); move(ui, 243);
    const old = ui.track().props;
    if (kind === 'disable') ui.render({ disabled: true }); else ui.unmount();
    old.onResponderGrant(event({ active: [point(3, 286)] }));
    old.onResponderMove(event({ active: [point(1, 286)] }));
    old.onResponderRelease(event({ changed: [point(1, 286)] }));
    old.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); old.onKeyDown({ key: 'End' });
    assert.deepEqual(ui.previews, [.75]); assert.deepEqual(ui.commits, []); assert.equal(ui.lateUpdates, 0);
    if (kind === 'disable') ui.unmount();
  }
});

test('accessibility and keyboard adjust a bounded step and commit each deliberate change once', () => {
  const ui = runtime(); ui.layout();
  assert.equal(ui.track().props.accessibilityRole, 'adjustable');
  assert.equal(ui.track().props.accessibilityValue.min, 0);
  ui.track().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); ui.render();
  let prevented = 0;
  for (const key of ['ArrowRight', 'Home', 'End', 'ArrowUp']) { ui.track().props.onKeyDown({ key, preventDefault() { prevented++; } }); ui.render(); }
  assert.deepEqual(ui.commits, [.51, .52, 0, 1]); assert.equal(prevented, 4);
  assert.equal(ui.track().props.accessibilityValue.text, '100%');
  ui.unmount();
});

test('no preview callback still moves the local thumb and invalid contracts stay finite and disabled', () => {
  const ui = runtime({ onValueChange: undefined }); ui.layout(); begin(ui); move(ui, 243);
  assert.equal(ui.track().props.accessibilityValue.now, .75); assert.deepEqual(ui.commits, []);
  ui.track().props.onResponderRelease(event({ changed: [point(1, 243)], at: 1002 }));
  assert.deepEqual(ui.commits, [.75]); ui.unmount();
  for (const invalid of [{ value: NaN }, { step: NaN }, { step: 0 }, { minimumValue: Infinity }, { minimumValue: 2, maximumValue: 1 }]) {
    const bad = runtime(invalid); bad.layout(); begin(bad);
    assert.equal(bad.track().props.accessibilityState.disabled, true);
    assert.ok(Number.isFinite(bad.track().props.accessibilityValue.now));
    assert.deepEqual(bad.previews, []); assert.deepEqual(bad.commits, []); bad.unmount();
  }
});

test('a preview that closes the slider cannot be followed by a stale release commit', () => {
  let ui;
  ui = runtime({ onValueChange() { ui.unmount(); } });
  ui.layout(); begin(ui);
  const old = ui.track().props;
  old.onResponderEnd(event({ changed: [point(1, 243)], at: 1002 }));
  old.onResponderRelease(event({ changed: [point(1, 243)], at: 1002 }));
  assert.deepEqual(ui.commits, []);
  assert.equal(ui.lateUpdates, 0);
});

test('native string pointer identifiers retain exact ownership without numeric coercion', () => {
  const ui = runtime(); ui.layout(); begin(ui, '1');
  move(ui, 286, 1); // A numeric ID is not the owner of this string-ID gesture.
  assert.deepEqual(ui.previews, []);
  move(ui, 243, '1');
  ui.track().props.onResponderRelease(event({ changed: [point('1', 243)], at: 1002 }));
  assert.deepEqual(ui.commits, [.75]); ui.unmount();
});
