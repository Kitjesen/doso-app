import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/components/loginMotion.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ platform = 'ios', appState = 'active' } = {}) {
  let resolve, reject, motionListener, appListener, cleanup;
  const removed = [];
  const animations = [];
  const values = [];
  const request = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  class Value {
    constructor(value) { this.value = value; values.push(this); }
    setValue(value) { this.value = value; }
    interpolate(configuration) { return configuration; }
  }
  const animation = (kind, configuration) => {
    const result = { kind, configuration, starts: 0, stops: 0,
      start() { this.starts++; }, stop() { this.stops++; } };
    animations.push(result);
    return result;
  };
  const dependencies = {
    react: { useRef: value => ({ current: value }), useEffect: callback => { cleanup = callback(); } },
    'react-native': {
      Animated: { Value, timing: (_value, configuration) => animation('timing', configuration),
        sequence: children => animation('sequence', children), loop: child => animation('loop', child) },
      Easing: { cubic: 'cubic', sin: 'sin', out: value => value, inOut: value => value },
      Platform: { OS: platform },
      AccessibilityInfo: { isReduceMotionEnabled: () => request,
        addEventListener: (_event, callback) => { motionListener = callback; return { remove: () => removed.push('motion') }; } },
      AppState: { currentState: appState,
        addEventListener: (_event, callback) => { appListener = callback; return { remove: () => removed.push('app') }; } },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
  const styles = module.exports.useLoginMotion();
  return { styles, animations, values, resolve, reject, removed, motion: value => motionListener(value),
    app: value => appListener(value), unmount: () => cleanup(), settle: () => Promise.resolve(),
    get loops() { return animations.filter(item => item.kind === 'loop'); } };
}

test('login animates one entrance and a 20-second background round trip', async () => {
  const ui = mount();
  ui.resolve(false); await ui.settle();
  const timings = ui.animations.filter(item => item.kind === 'timing');
  assert.equal(timings[0].configuration.duration, 600);
  assert.equal(timings[0].configuration.useNativeDriver, true);
  assert.deepEqual(timings.slice(1).map(item => item.configuration.duration), [10000, 10000]);
  assert.ok(timings.slice(1).every(item => item.configuration.isInteraction === false));
  assert.equal(ui.loops[0].starts, 1);
  assert.deepEqual(Array.from(ui.styles.intro.transform[0].translateY.outputRange), [10, 0]);
  assert.deepEqual(Array.from(ui.styles.glow.transform[0].translateX.outputRange), [-36, 36]);
  assert.deepEqual(Array.from(ui.styles.glow.transform[1].translateY.outputRange), [-12, 24]);
  ui.unmount();
  assert.equal(ui.loops[0].stops, 1);
  assert.deepEqual(ui.removed, ['motion', 'app']);
});

test('reduced motion and an unavailable preference leave login visible and static', async () => {
  for (const failed of [false, true]) {
    const ui = mount();
    if (failed) ui.reject(new Error('unavailable')); else ui.resolve(true);
    await ui.settle();
    assert.equal(ui.styles.intro.opacity.value, 1);
    assert.equal(ui.loops.length, 0);
    ui.unmount();
  }
});

test('a preference change wins over the pending initial query and stops running motion', async () => {
  const ui = mount();
  ui.motion(false);
  assert.equal(ui.loops.length, 1);
  ui.motion(true);
  assert.equal(ui.loops[0].stops, 1);
  assert.equal(ui.styles.intro.opacity.value, 1);
  ui.resolve(false); await ui.settle();
  assert.equal(ui.loops.length, 1);
  ui.app('background'); ui.app('active');
  assert.equal(ui.loops.length, 1);
  ui.unmount();
});

test('background stops the loop and foreground resumes without replaying the entrance', async () => {
  const ui = mount({ platform: 'web' });
  ui.resolve(false); await ui.settle();
  assert.equal(ui.animations[0].configuration.useNativeDriver, false);
  ui.app('background');
  assert.equal(ui.loops[0].stops, 1);
  assert.equal(ui.styles.intro.opacity.value, 1);
  ui.app('active');
  assert.equal(ui.loops.length, 2);
  assert.equal(ui.loops[1].starts, 1);
  assert.equal(ui.animations.filter(item => item.configuration?.duration === 600).length, 1);
  ui.motion(true); ui.motion(false);
  assert.equal(ui.loops.length, 3);
  ui.unmount();
});

test('an initially backgrounded app waits for foreground and late unmount queries do nothing', async () => {
  const background = mount({ appState: 'background' });
  background.resolve(false); await background.settle();
  assert.equal(background.loops.length, 0);
  assert.equal(background.styles.intro.opacity.value, 1);
  background.app('active');
  assert.equal(background.loops.length, 1);
  background.unmount();
  const unmounted = mount();
  unmounted.unmount();
  unmounted.resolve(false); await unmounted.settle();
  assert.equal(unmounted.animations.length, 0);
  assert.deepEqual(unmounted.removed, ['motion', 'app']);
});
