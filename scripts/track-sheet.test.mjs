import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/TrackSheet.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount() {
  const slots = [], effects = [];
  let cursor = 0, windowHeight = 900, nodes = [], pan;
  const changed = (previous, deps) => !previous || deps.some((value, index) => value !== previous.deps[index]);
  const react = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = initial; return [slots[id], value => { slots[id] = value; }]; },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useMemo(create, deps) { const id = cursor++; if (changed(slots[id], deps)) slots[id] = { deps, value: create() }; return slots[id].value; },
    useEffect(effect, deps) { const id = cursor++, previous = slots[id]; if (changed(previous, deps)) effects.push(() => { previous?.cleanup?.(); slots[id] = { deps, cleanup: effect() }; }); },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation(done) { done?.(this.value); }
    interpolate(value) { return value; }
  }
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AccessibilityInfo: { addEventListener() { return { remove() {} }; }, isReduceMotionEnabled: async () => false }, Animated: { Value, View: 'AnimatedView', timing(value, options) { return { start() { value.setValue(options.toValue); } }; } },
      PanResponder: { create(value) { pan = value; return { panHandlers: value }; } }, Platform: { OS: 'web' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value, hairlineWidth: 1 },
      useWindowDimensions: () => ({ height: windowHeight }) },
    '../appearance': { getProductAppearance: () => ({ raised: '#fff', border: '#ddd', secondary: '#456' }) },
    '../theme': { useAppTheme: () => ({ isDark: false }) }, '../typography': { typography: { caption: {} } }, './AppText': { Text: 'Text' },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => {
    cursor = 0; nodes = [];
    const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); nodes.push(node); walk(node.props.children); };
    walk(module.exports.TrackSheet({ map: 'map', summary: 'summary', children: 'details' }));
    while (effects.length) effects.shift()();
  };
  const node = id => nodes.find(value => value.props.testID === id);
  render();
  return {
    get node() { return node; }, get pan() { return pan; }, get height() { return node('track-sheet').props.style.flat(Infinity).find(style => style?.height)?.height.value; }, render,
    press(detail = 1, startsPress = true) {
      if (startsPress) node('track-sheet-handle').props.onPressIn();
      node('track-sheet-handle').props.onPress({ nativeEvent: { detail } }); render();
    },
    drag(dy, vy = 0) { pan.onPanResponderGrant(); pan.onPanResponderMove(null, { dy }); pan.onPanResponderRelease(null, { dy, vy }); render(); },
    resize(value) { windowHeight = value; render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('summary handle toggles accessible details and reserves visible map space', () => {
  const host = mount();
  assert.equal(host.height, 196);
  assert.equal(host.node('track-sheet-handle').props.accessibilityState.expanded, false);
  assert.equal(host.node('track-sheet-handle').props['aria-expanded'], false);
  assert.equal(host.node('track-details').props.accessibilityElementsHidden, true);
  assert.equal(host.node('track-details').props['aria-hidden'], true);
  host.press();
  assert.equal(host.height, 340);
  assert.equal(host.node('track-sheet-handle').props.accessibilityState.expanded, true);
  assert.equal(host.node('track-sheet-handle').props['aria-expanded'], true);
  assert.equal(host.node('track-details').props.accessibilityElementsHidden, false);
  assert.equal(host.node('track-details').props['aria-hidden'], false);
  assert.equal(host.node('track-stage').props.style[1].height - host.height, 260);
  host.press(); assert.equal(host.height, 196); host.unmount();
});

test('vertical drag snaps both ways, bounds movement and restores cancelled gestures', () => {
  const host = mount();
  assert.equal(host.pan.onMoveShouldSetPanResponderCapture(null, { dx: 40, dy: 5 }), false);
  assert.equal(host.pan.onMoveShouldSetPanResponderCapture(null, { dx: 2, dy: 12 }), true);
  host.drag(-110); assert.equal(host.height, 340);
  host.pan.onPanResponderGrant(); host.pan.onPanResponderMove(null, { dy: -1000 }); assert.equal(host.height, 340);
  host.pan.onPanResponderMove(null, { dy: 1000 }); assert.equal(host.height, 196);
  host.pan.onPanResponderTerminate(); assert.equal(host.height, 340);
  host.drag(100, 0.4); assert.equal(host.height, 196);
  host.drag(-8, -0.5); assert.equal(host.height, 340); host.unmount();
});

test('resizing an expanded sheet keeps its state and the map minimum height', () => {
  const host = mount(); host.press(); host.resize(550);
  assert.equal(host.height, 240); assert.equal(host.node('track-stage').props.style[1].height - host.height, 260);
  assert.equal(host.node('track-sheet-handle').props.accessibilityState.expanded, true);
  host.press(); assert.equal(host.height, 196); host.unmount();
});

test('dragging temporarily shields the map iframe and restores it on release or cancellation', () => {
  const host = mount();
  assert.equal(host.node('track-map-viewport').props.pointerEvents, 'auto');
  host.pan.onPanResponderGrant(); host.render();
  assert.equal(host.node('track-map-viewport').props.pointerEvents, 'none');
  host.pan.onPanResponderMove(null, { dy: -110 });
  host.pan.onPanResponderRelease(null, { dy: -110, vy: 0 }); host.render();
  assert.equal(host.node('track-map-viewport').props.pointerEvents, 'auto');
  assert.equal(host.height, 340);
  host.pan.onPanResponderGrant(); host.render();
  assert.equal(host.node('track-map-viewport').props.pointerEvents, 'none');
  host.pan.onPanResponderTerminate(); host.render();
  assert.equal(host.node('track-map-viewport').props.pointerEvents, 'auto');
  assert.equal(host.height, 340); host.unmount();
});

test('drag clicks do not undo the snap and later taps and keyboard activation still work', () => {
  const host = mount();
  host.drag(-110); host.press(1, false);
  assert.equal(host.height, 340);
  host.press(); assert.equal(host.height, 196);
  host.drag(-110); host.press(0, false);
  assert.equal(host.height, 196);
  host.drag(-110); host.press();
  assert.equal(host.height, 196); host.unmount();
});
