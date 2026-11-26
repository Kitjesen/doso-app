import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const hapticsSource = readFileSync(new URL('../src/utils/haptics.ts', import.meta.url), 'utf8');
const wakeLockSource = readFileSync(new URL('../src/features/control/useKeepScreenAwake.ts', import.meta.url), 'utf8');

function compileCjs(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadHaptics({ os = 'android', vibrate, webVibrate } = {}) {
  const module = { exports: {} };
  const calls = [];
  const webCalls = [];
  const rnVibrate = vibrate ?? (pattern => { calls.push(pattern); });
  const nav = webVibrate === undefined
    ? { vibrate: pattern => { webCalls.push(pattern); return true; } }
    : webVibrate === null
      ? {}
      : { vibrate: webVibrate };
  vm.runInNewContext(compileCjs(hapticsSource), {
    module,
    exports: module.exports,
    globalThis: { navigator: nav },
    require(name) {
      if (name === 'react-native') return { Platform: { OS: os }, Vibration: rnVibrate ? { vibrate: rnVibrate } : undefined };
      throw new Error(`Unexpected require: ${name}`);
    },
  });
  return { triggerControlHaptic: module.exports.triggerControlHaptic, calls, webCalls };
}

test('haptics dispatches exact native vibration patterns for every control feedback kind', () => {
  const { triggerControlHaptic, calls } = loadHaptics({ os: 'android' });
  triggerControlHaptic('step');
  triggerControlHaptic('tap');
  triggerControlHaptic('confirm');
  triggerControlHaptic('alert');
  triggerControlHaptic('estop');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    10,
    14,
    20,
    [0, 35, 55, 45],
    [0, 50, 55, 85],
  ]);
});

test('haptics strips leading zero wait on web and never throws on unsupported or failing hosts', () => {
  const { triggerControlHaptic, webCalls, calls } = loadHaptics({ os: 'web' });
  triggerControlHaptic('confirm');
  triggerControlHaptic('alert');
  triggerControlHaptic('estop');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(webCalls)), [
    20,
    [35, 55, 45],
    [50, 55, 85],
  ]);

  const missingWeb = loadHaptics({ os: 'web', webVibrate: null });
  assert.doesNotThrow(() => missingWeb.triggerControlHaptic('estop'));

  const throwingNative = loadHaptics({
    os: 'android',
    vibrate: () => { throw new Error('blocked'); },
  });
  assert.doesNotThrow(() => throwingNative.triggerControlHaptic('confirm'));
  assert.doesNotThrow(() => throwingNative.triggerControlHaptic('unknown-kind'));
});

function mountKeepScreenAwake({ os = 'android', initialAppState = 'active', visibilityState = 'visible', wakeLockRequest } = {}) {
  const nativeCalls = [];
  const appStateListeners = new Set();
  const visibilityListeners = new Set();
  const appState = {
    currentState: initialAppState,
    addEventListener(event, fn) {
      assert.equal(event, 'change');
      appStateListeners.add(fn);
      return { remove: () => appStateListeners.delete(fn) };
    },
  };
  const doc = {
    visibilityState,
    addEventListener(event, fn) {
      if (event === 'visibilitychange') visibilityListeners.add(fn);
    },
    removeEventListener(event, fn) {
      if (event === 'visibilitychange') visibilityListeners.delete(fn);
    },
  };
  const nav = wakeLockRequest ? { wakeLock: { request: wakeLockRequest } } : {};

  let cleanup = null;
  let lastDeps = null;
  const module = { exports: {} };
  vm.runInNewContext(compileCjs(wakeLockSource), {
    module,
    exports: module.exports,
    Promise,
    globalThis: { navigator: nav, document: doc },
    require(name) {
      if (name === 'react') {
        return {
          useEffect(effect, deps) {
            if (lastDeps && deps.every((d, i) => Object.is(d, lastDeps[i]))) return;
            cleanup?.();
            cleanup = effect() ?? null;
            lastDeps = deps;
          },
        };
      }
      if (name === 'react-native') return { AppState: appState, Platform: { OS: os } };
      if (name === '../../services/brainstemControl') {
        return {
          setKeepScreenOn: async enabled => {
            nativeCalls.push(enabled);
          },
        };
      }
      throw new Error(`Unexpected require: ${name}`);
    },
  });

  return {
    render(active) { module.exports.useKeepScreenAwake(active); },
    unmount() { cleanup?.(); cleanup = null; },
    emitAppState(next) {
      appState.currentState = next;
      for (const fn of [...appStateListeners]) fn(next);
    },
    emitVisibility(next) {
      doc.visibilityState = next;
      for (const fn of [...visibilityListeners]) fn();
    },
    nativeCalls,
    appStateListeners,
    visibilityListeners,
  };
}

test('useKeepScreenAwake toggles native Android FLAG_KEEP_SCREEN_ON across foreground, background, and unmount', () => {
  const host = mountKeepScreenAwake({ os: 'android', initialAppState: 'active' });
  host.render(true);
  assert.deepEqual(host.nativeCalls, [true]);
  assert.equal(host.appStateListeners.size, 1);

  host.emitAppState('background');
  host.emitAppState('inactive');
  host.emitAppState('active');
  assert.deepEqual(host.nativeCalls, [true, false, false, true]);

  host.render(false);
  assert.deepEqual(host.nativeCalls, [true, false, false, true, false, false]);
  assert.equal(host.appStateListeners.size, 0);

  host.render(true);
  host.unmount();
  assert.equal(host.nativeCalls.at(-1), false);
  assert.equal(host.appStateListeners.size, 0);
});

test('useKeepScreenAwake acquires and releases Web WakeLock across visibility changes and async unmount races', async () => {
  const sentinels = [];
  let resolvePending = null;
  let callIndex = 0;
  const host = mountKeepScreenAwake({
    os: 'web',
    visibilityState: 'visible',
    wakeLockRequest: type => {
      assert.equal(type, 'screen');
      callIndex += 1;
      if (callIndex === 2) {
        return new Promise(resolve => { resolvePending = resolve; });
      }
      const s = {
        released: false,
        releaseCount: 0,
        release() {
          this.released = true;
          this.releaseCount += 1;
          return Promise.resolve();
        },
      };
      sentinels.push(s);
      return Promise.resolve(s);
    },
  });

  host.render(true);
  await Promise.resolve();
  assert.equal(sentinels.length, 1);
  assert.equal(sentinels[0].released, false);
  assert.equal(host.visibilityListeners.size, 1);

  host.emitVisibility('hidden');
  assert.equal(sentinels[0].released, true);
  assert.equal(sentinels[0].releaseCount, 1);

  // Trigger a second request, then unmount BEFORE the WakeLock promise resolves.
  host.emitVisibility('visible');
  assert.equal(typeof resolvePending, 'function');
  host.unmount();
  assert.equal(host.visibilityListeners.size, 0);

  const lateSentinel = {
    released: false,
    releaseCount: 0,
    release() {
      this.released = true;
      this.releaseCount += 1;
      return Promise.resolve();
    },
  };
  resolvePending(lateSentinel);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(lateSentinel.released, true, 'late-resolved sentinel after unmount must release immediately');
  assert.equal(lateSentinel.releaseCount, 1);
});

test('useKeepScreenAwake does not call Android native wake-lock on iOS', () => {
  const host = mountKeepScreenAwake({ os: 'ios' });
  host.render(true);
  host.emitAppState('background');
  host.unmount();
  assert.deepEqual(host.nativeCalls, []);
});
