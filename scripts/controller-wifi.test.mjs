import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function service(native, app = { currentState: 'active' }) {
  const module = { exports: {} };
  vm.runInNewContext(compile('../src/services/controllerWifi.ts'), { module, exports: module.exports, require(name) {
    if (name === 'expo') return { requireOptionalNativeModule: () => native };
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: app };
    throw Error(name);
  } });
  return module.exports;
}
test('RSSI is bounded Android-scale strength, never connectivity or invalid-sentinel success', () => {
  const { wifiSignalFromRssi: map } = service(null);
  for (const value of [null, undefined, NaN, Infinity, -127, 0, 4, '-65', -65.5]) assert.equal(map(value), null);
  for (const [rssi, expected] of [[-126, 0], [-100, 0], [-77, 51], [-55, 100], [-30, 100]]) {
    assert.equal(map(rssi).qualityPercent, expected); assert.equal(map(rssi).rssiDbm, rssi);
    assert.equal(map(rssi).source, 'controller');
  }
});
test('old APK, native failure and background return unknown without fabricated signal', async () => {
  assert.equal(await service(null).readControllerWifiSignal(), null);
  assert.equal(await service({ readWifiRssi: async () => { throw Error('permission'); } }).readControllerWifiSignal(), null);
  let calls = 0;
  const app = { currentState: 'background' };
  const reader = service({ readWifiRssi: async () => { calls++; return -77; } }, app);
  assert.equal(await reader.readControllerWifiSignal(), null); assert.equal(calls, 0);
  app.currentState = 'active'; assert.equal((await reader.readControllerWifiSignal()).qualityPercent, 51);
});
test('Wi-Fi hook discards background/retired samples, prevents overlap and expires stale measurements', async () => {
  const slots = [], effects = [], timers = new Set(), listeners = new Set();
  let cursor = 0, clock = 0, resolveRead, reads = 0, active = true, value;
  const app = { currentState: 'active', addEventListener(_name, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = next; }]; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) {
      effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('../src/features/control/useControllerWifiSignal.ts'), {
    module, exports: module.exports, performance: { now: () => clock },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { AppState: app };
      if (name === '../../services/controllerWifi') return { readControllerWifiSignal: () => { reads++; return new Promise(resolve => { resolveRead = resolve; }); } };
      throw Error(name);
    },
  });
  const render = () => { cursor = 0; value = module.exports.useControllerWifiSignal(active); while (effects.length) effects.shift()(); };
  const event = state => { app.currentState = state; for (const fn of listeners) fn(state); };
  const settle = async sample => { resolveRead(sample); await new Promise(resolve => setImmediate(resolve)); render(); };
  const sample = { source: 'controller', qualityPercent: 55, rssiDbm: -75 };
  render(); for (const fn of timers) fn(); assert.equal(reads, 1);
  event('background'); await settle(sample); assert.equal(value, undefined);
  event('active'); await settle(sample); assert.equal(value.qualityPercent, 55);
  clock = 5001; render(); assert.equal(value, undefined);
  for (const fn of timers) fn(); active = false; render(); await settle(sample); assert.equal(value, undefined);
  assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
});
