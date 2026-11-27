import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const motionSource = readFileSync(resolve(rootDir, 'src/components/FsdMotionPrimitives.tsx'), 'utf8');
const settingsSource = readFileSync(resolve(rootDir, 'src/components/ControlReferenceUi.tsx'), 'utf8');
const controlSource = readFileSync(resolve(rootDir, 'src/screens/ControlScreen.tsx'), 'utf8');

function compileTsx(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function renderFsdMotion(componentName, props) {
  let latestPanConfig = null;
  const states = [];
  const refs = [];
  let sIdx = 0;
  let rIdx = 0;

  class MockAnimatedValue {
    constructor(v) { this.value = v; }
    setValue(v) { this.value = v; }
    interpolate() { return this.value; }
  }

  const module = { exports: {} };
  vm.runInNewContext(compileTsx(motionSource), {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') {
        return {
          useState(initial) {
            const i = sIdx++;
            if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
            return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
          },
          useRef(initial) {
            const i = rIdx++;
            if (!(i in refs)) refs[i] = { current: initial };
            return refs[i];
          },
          useMemo(fn) { return fn(); },
          useEffect() {},
        };
      }
      if (name === 'react/jsx-runtime') {
        return {
          jsx: (type, p, key) => ({ type, props: p ?? {}, key }),
          jsxs: (type, p, key) => ({ type, props: p ?? {}, key }),
        };
      }
      if (name === './AppText') return { Text: 'Text' };
      if (name === 'react-native') {
        return {
          AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(true) },
          Animated: {
            Value: MockAnimatedValue,
            View: 'AnimatedView',
            spring: () => ({ start: () => {} }),
            timing: () => ({ start: () => {} }),
            loop: () => ({ start: () => {}, stop: () => {} }),
            sequence: () => ({}),
            delay: () => ({}),
          },
          Easing: { out: fn => fn, quad: x => x },
          LayoutAnimation: { configureNext: () => {}, Types: {}, Properties: {} },
          PanResponder: {
            create(config) {
              latestPanConfig = config;
              return { panHandlers: { __panConfig: config } };
            },
          },
          Platform: { OS: 'android' },
          Pressable: 'Pressable',
          StyleSheet: { create: s => s },
          UIManager: {},
          View: 'View',
        };
      }
      throw new Error(`Unexpected require: ${name}`);
    },
  });

  const render = (nextProps = props) => {
    sIdx = 0;
    rIdx = 0;
    return module.exports[componentName](nextProps);
  };
  const tree = render(props);
  return { tree, render, getPanConfig: () => latestPanConfig };
}

function findAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  if (node.props?.children) findAll(node.props.children, predicate, out);
  return out;
}

test('FsdDetentSlider yields vertical scroll gestures to Android ScrollView without mutating value', () => {
  const changes = [];
  const completes = [];
  const { tree, getPanConfig } = renderFsdMotion('FsdDetentSlider', {
    value: 50,
    min: 0,
    max: 100,
    step: 5,
    onChange: v => changes.push(v),
    onComplete: v => completes.push(v),
    accessibilityLabel: '速度上限',
    testID: 'speed-slider',
  });

  // Measure track width = 200px.
  tree.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
  const pan = getPanConfig();
  assert.ok(pan, 'PanResponder config must exist');
  assert.equal(pan.onShouldBlockNativeResponder(), false, 'must never block native Android ScrollView');
  assert.equal(pan.onStartShouldSetPanResponderCapture(), false);
  assert.equal(pan.onMoveShouldSetPanResponderCapture(), false);

  // Vertical swipe starting on the slider (dx=2, dy=48): must yield and NEVER fire onChange/onComplete.
  assert.equal(pan.onMoveShouldSetPanResponder({}, { dx: 2, dy: 48 }), false);
  pan.onPanResponderGrant();
  pan.onPanResponderMove({ nativeEvent: { locationX: 160 } }, { dx: 2, dy: 48 });
  assert.equal(pan.onPanResponderTerminationRequest({}, { dx: 2, dy: 48 }), true);
  pan.onPanResponderRelease({ nativeEvent: { locationX: 160 } }, { dx: 2, dy: 48 });
  assert.deepEqual(changes, []);
  assert.deepEqual(completes, []);
});

test('FsdDetentSlider locks horizontal drags, quantizes by step, clamps bounds, and supports taps', () => {
  const changes = [];
  const completes = [];
  const { tree, getPanConfig } = renderFsdMotion('FsdDetentSlider', {
    value: 50,
    min: 20,
    max: 100,
    step: 10,
    onChange: v => changes.push(v),
    onComplete: v => completes.push(v),
    accessibilityLabel: '音量',
  });
  tree.props.onLayout({ nativeEvent: { layout: { width: 160 } } });
  const pan = getPanConfig();

  // Horizontal drag dominates -> captures and locks against ScrollView termination.
  assert.equal(pan.onMoveShouldSetPanResponder({}, { dx: 24, dy: 3 }), true);
  pan.onPanResponderGrant();
  pan.onPanResponderMove({ nativeEvent: { locationX: 82 } }, { dx: 24, dy: 3 }); // 20 + (82/160)*80 = 61 -> snaps to 60
  assert.equal(pan.onPanResponderTerminationRequest({}, { dx: 24, dy: 3 }), false);
  pan.onPanResponderMove({ nativeEvent: { locationX: 999 } }, { dx: 90, dy: 3 }); // clamps to max 100
  pan.onPanResponderRelease({ nativeEvent: { locationX: -20 } }, { dx: -50, dy: 2 }); // clamps to min 20
  assert.deepEqual(changes, [60, 100, 20]);
  assert.deepEqual(completes, [20]);

  // Short tap (dx=1, dy=1) snaps & commits cleanly.
  changes.length = 0;
  completes.length = 0;
  pan.onPanResponderGrant();
  pan.onPanResponderRelease({ nativeEvent: { locationX: 80 } }, { dx: 1, dy: 1 }); // midpoint -> 60
  assert.deepEqual(changes, [60]);
  assert.deepEqual(completes, [60]);
});

test('FsdDetentSlider locks page origin on grant so Android locationX re-targeting outside track never jumps to max', () => {
  const changes = [];
  const completes = [];
  const { tree, getPanConfig } = renderFsdMotion('FsdDetentSlider', {
    value: 60,
    min: 20,
    max: 100,
    step: 10,
    onChange: v => changes.push(v),
    onComplete: v => completes.push(v),
    accessibilityLabel: '最大速度限制',
  });
  tree.props.onLayout({ nativeEvent: { layout: { width: 160 } } });
  // Track children must not steal hit target / shift locationX origin.
  const trackBase = tree.props.children[0];
  assert.equal(trackBase.props.pointerEvents, 'none');
  assert.equal(trackBase.props.children.props.pointerEvents, 'none');

  const pan = getPanConfig();
  // Track starts at screen pageX = 240. User presses midpoint: pageX = 320, locationX = 80.
  pan.onPanResponderGrant({ nativeEvent: { pageX: 320, locationX: 80 } }, { x0: 320, moveX: 320, dx: 0, dy: 0 });
  // User drags left past left edge to pageX = 210; Android Fabric jumps locationX to screen-space +210!
  pan.onPanResponderMove({ nativeEvent: { pageX: 210, locationX: 210 } }, { moveX: 210, dx: -110, dy: 4 });
  assert.deepEqual(changes, [20], 'dragging past left edge stays clamped to min (20) despite jumped locationX');
  // User releases while still outside track; must commit min (20), never jump to max (100).
  pan.onPanResponderRelease({ nativeEvent: { pageX: 210, locationX: 210 } }, { moveX: 210, dx: -110, dy: 4 });
  assert.deepEqual(completes, [20]);
});

test('FsdDetentSlider disabled mode declines gesture capture and ignores callbacks', () => {
  const changes = [];
  const { tree, getPanConfig } = renderFsdMotion('FsdDetentSlider', {
    value: 50,
    min: 0,
    max: 100,
    disabled: true,
    onChange: v => changes.push(v),
    accessibilityLabel: '禁用滑条',
  });
  tree.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
  const pan = getPanConfig();
  assert.equal(pan.onStartShouldSetPanResponder(), false);
  assert.equal(pan.onMoveShouldSetPanResponder({}, { dx: 40, dy: 0 }), false);
  pan.onPanResponderRelease({ nativeEvent: { locationX: 120 } }, { dx: 0, dy: 0 });
  assert.deepEqual(changes, []);
});

test('FsdSegmentedControl and FsdSwitch guard disabled and redundant presses', () => {
  const selected = [];
  const seg = renderFsdMotion('FsdSegmentedControl', {
    options: [
      { value: 'a', label: 'A', testID: 'seg-a' },
      { value: 'b', label: 'B', testID: 'seg-b' },
      { value: 'c', label: 'C', disabled: true, testID: 'seg-c' },
    ],
    value: 'a',
    onChange: v => selected.push(v),
  });
  const btns = findAll(seg.tree, n => n.type === 'Pressable');
  assert.equal(btns.length, 3);
  btns[0].props.onPress(); // already selected -> no-op
  btns[2].props.onPress(); // disabled -> no-op
  btns[1].props.onPress(); // switches to 'b'
  assert.deepEqual(selected, ['b']);

  let toggled = 0;
  const sw = renderFsdMotion('FsdSwitch', {
    checked: true,
    onPress: () => { toggled += 1; },
    accessibilityLabel: '低延迟模式',
    testID: 'low-latency-switch',
  });
  assert.equal(sw.tree.props.accessibilityRole, 'switch');
  assert.equal(sw.tree.props.accessibilityState.checked, true);
  sw.tree.props.onPress();
  assert.equal(toggled, 1);
});

test('Android Settings scroll, IME keyboard survival, estop z-order, and pure neutral palette contracts hold', () => {
  // ScrollView Android invariants in ControlReferenceUi.tsx
  assert.match(settingsSource, /nestedScrollEnabled/);
  assert.match(settingsSource, /keyboardShouldPersistTaps="handled"/);
  assert.match(settingsSource, /minHeight:\s*0/);
  assert.match(settingsSource, /stopPropagation\?\.\(\)/);
  assert.match(settingsSource, /includeFontPadding:\s*false/);

  // ControlScreen height-only IME layout guard & Android root onTouchCancel overlay preservation
  assert.match(controlSource, /widthChanged\s*=\s*Math\.abs\(viewportRef\.current\.width - next\.width\)/);
  assert.match(controlSource, /onTouchCancel=\{handleRootTouchCancel\}/);

  // Landscape HUD settingsLayer sits below estop z-order (24) and guards backdrop presses
  const hudSource = readFileSync(resolve(rootDir, 'src/components/controlLandscapeHud.tsx'), 'utf8');
  assert.match(hudSource, /settingsLayer:.*elevation:\s*15.*zIndex:\s*15/);
  assert.match(hudSource, /event\.target\s*===\s*event\.currentTarget/);

  // Pure neutral black-gray palette invariant: zero legacy cool blue-slate surface leaks
  const forbiddenBlueSlate = /#(1C1F24|22252B|252930|2B2F37|3D424D)\b/i;
  for (const rel of [
    'src/components/StatusBentoCard.tsx',
    'src/components/FsdMotionPrimitives.tsx',
    'src/components/ControlReferenceUi.tsx',
    'src/components/ControlVoiceChatPanel.tsx',
    'src/screens/BleDiscoveryScreen.tsx',
  ]) {
    const text = readFileSync(resolve(rootDir, rel), 'utf8');
    assert.doesNotMatch(text, forbiddenBlueSlate, `legacy cool blue-slate hex leaked in ${rel}`);
  }
});
