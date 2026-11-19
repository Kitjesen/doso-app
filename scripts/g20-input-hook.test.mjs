import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const model = { exports: {} };
vm.runInNewContext(compile('../src/features/control/g20InputModel.ts'), { module: model, exports: model.exports });
const source = compile('../src/features/control/useG20Input.ts');

function mount({ startState, stopEmitsState = false, diagnosticThrows = false, latestObservation } = {}) {
  let cursor = 0, active = true, at = 0, generation = 0, fresh = true;
  const slots = [], pending = [], timers = new Set(), lifecycle = new Set(), events = new Map();
  const starts = [], observations = [], stops = [], diagnostics = [];
  const depsChanged = (a, b) => !a || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const react = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useCallback(fn, deps) { const index = cursor++; if (depsChanged(slots[index]?.deps, deps)) slots[index] = { deps, fn }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (depsChanged(slots[index]?.deps, deps)) pending.push(() => {
      slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() };
    }); },
  };
  const appState = { currentState: 'active', addEventListener(_type, callback) { lifecycle.add(callback); return { remove: () => lifecycle.delete(callback) }; } };
  const native = { available: true, observationAvailable: true, start(requestId) { starts.push({ requestId, generation: ++generation });
    return Promise.resolve({ requestId, generation, status: 'starting', ...startState }); },
    observe(requestId) { observations.push(requestId); starts.push({ requestId, generation: ++generation });
      return Promise.resolve({ requestId, generation, status: 'starting', ...startState }); },
    stop() { stops.push(true);
      if (stopEmitsState) for (const callback of events.get('onState') ?? []) callback({ ...starts.at(-1), status: 'stopped', reason: 'stopped' });
      return Promise.resolve(); },
    latestObservationAvailable: typeof latestObservation === 'function', latestObservation,
    isFresh() { return fresh; },
    captureFence() { return at; },
    subscribe(name, callback) { const listeners = events.get(name) ?? new Set(); events.set(name, listeners); listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, performance: { now: () => at }, console: { info: value => { if (diagnosticThrows) throw Error('logging failure'); diagnostics.push(value); } },
    setInterval(callback) { timers.add(callback); return callback; }, clearInterval(callback) { timers.delete(callback); },
    require(name) { if (name === 'react') return react; if (name === 'react-native') return { AppState: appState };
      if (name === '../../services/g20Input') return { g20Input: native }; if (name === './g20InputModel') return model.exports;
      throw Error(name); } });
  let result;
  function render() { cursor = 0; result = module.exports.useG20Input(active); while (pending.length) pending.shift()(); return result; }
  render();
  return {
    get value() { return result; }, starts, observations, stops, diagnostics,
    render, setFresh(value) { fresh = value; },
    setActive(value) { active = value; render(); },
    background() { appState.currentState = 'background'; for (const callback of lifecycle) callback('background'); render(); },
    advance(ms) { at += ms; for (const callback of timers) callback(); render(); },
    emitState(value) {
      for (const callback of events.get('onState') ?? []) callback({ ...starts.at(-1), ...value });
      render();
    },
    emit(changes = {}, extra = {}) {
      const channels = Array(16).fill(1500);
      for (const [channel, value] of Object.entries(changes)) channels[Number(channel)] = value;
      const session = starts.at(-1);
      const sample = { ...session, sequence: (this.sequence = (this.sequence ?? 0) + 1), receivedAtMonotonicMs: at, requestStartedAtMonotonicMs: at,
        channels, channelSettings: channels.map((_, channelIndex) => ({ channelIndex, index: channelIndex + 1, mapping: channelIndex + 1,
          min: 1050, middle: 1500, max: 1950, reverse: false })), controlMode: 'USA', configurationReady: true, ...extra };
      for (const callback of events.get('onSample') ?? []) callback(sample);
      render(); return sample;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('delayed observation notifications read the current native slot once without granting control', async () => {
  let latest = null;
  const h = mount({ latestObservation: () => latest }), seen = [];
  h.value.subscribe(e => seen.push(e)); h.value.observe(); await tick();
  const raw = { channelSettings: null, controlMode: null, configurationReady: false };
  const queued = h.emit({}, raw);
  assert.equal(h.value.state.sample, null);
  h.advance(40);
  latest = { ...queued, sequence: 9, receivedAtMonotonicMs: 40, requestStartedAtMonotonicMs: 40, channels: Array(16).fill(1600) };
  h.setFresh(false); h.emit({}, raw); h.emit({}, raw);
  assert.equal(h.value.state.sample.sequence, 9);
  assert.equal(h.value.state.sample.requestStartedAtMonotonicMs, 40);
  assert.equal(seen.filter(e => e.sample).length, 1);
  assert.equal(seen.at(-1).frame, null);
  latest = null; h.emit({}, raw); h.advance(151);
  assert.equal(h.value.state.reading, false);
  h.unmount();
});

test('observation watchdog checks the fresh native slot before a delayed event, but never renews an unchanged sample', async () => {
  let latest = null;
  const h = mount({ latestObservation: () => latest }); h.value.observe(); await tick();
  const raw = { channelSettings: null, controlMode: null, configurationReady: false };
  const queued = h.emit({}, raw);
  latest = { ...queued, sequence: 1 }; h.emit({}, raw);
  latest = { ...queued, sequence: 8, receivedAtMonotonicMs: 140, requestStartedAtMonotonicMs: 140 };
  h.advance(160);
  assert.equal(h.value.state.reading, true); assert.equal(h.value.state.sample.sequence, 8);
  h.advance(151); assert.equal(h.value.state.reading, false);
  h.unmount();
});
test('observation shows raw channels but cannot calibrate or produce an authorized frame', async () => {
  const h = mount(); const events = []; h.value.subscribe(event => events.push(event));
  h.value.observe(); await tick();
  assert.equal(h.observations.length, 1);
  for (let i = 0; i < 5; i++) {
    h.advance(20); h.emit({ 0: 1500 + 50 * i }, { channelSettings: null, controlMode: null, configurationReady: false });
    h.value.learnAxis('leftX'); h.render();
    assert.equal(h.value.state.reading, true); assert.equal(h.value.state.calibrated, false);
    assert.equal(h.value.state.calibrating, false); assert.equal(h.value.state.vector, null);
    assert.equal(h.value.state.sample.channels[0], 1500 + 50 * i);
    assert.equal(events.at(-1).frame, null);
  }
  h.background(); assert.equal(h.value.state.sample, null); h.unmount();
});
test('explicit calibration retires observation and waits for a new fully verified configuration', async () => {
  const h = mount(); h.value.observe(); await tick();
  h.emit({}, { channelSettings: null, controlMode: null, configurationReady: false });
  const original = h.value.state.sample;
  h.value.beginCalibration(); h.render(); await tick();
  assert.equal(h.starts.length, 2); assert.equal(h.observations.length, 1);
  assert.equal(h.stops.length, 1); assert.equal(h.value.state.sample, null);
  assert.equal(h.value.state.calibrated, false); assert.equal(h.value.state.calibrating, false);
  h.emit({}, { ...original, sequence: original.sequence + 1 });
  assert.equal(h.value.state.sample, null);
  h.emit(); assert.equal(h.value.state.sample.configurationReady, true);
  assert.equal(h.value.state.calibrating, true); assert.equal(h.value.state.calibrated, false);
  h.unmount();
});
test('an observation run rejects configuration authority injected from another input mode', async () => {
  const h = mount(); h.value.observe(); await tick(); h.emit();
  assert.equal(h.value.state.reading, false); assert.equal(h.value.state.calibrated, false);
  assert.equal(h.value.state.message, '通道观察状态无效，请重新读取');
  assert.equal(h.stops.length, 1); h.unmount();
});
test('observation drops superseded bridge events and accepts the next native-fresh sample without changing its timestamp', async () => {
  const h = mount(), received = []; h.value.subscribe(event => { if (event.sample) received.push(event.sample.sequence); });
  h.value.observe(); await tick();
  const raw = { channelSettings: null, controlMode: null, configurationReady: false };
  h.emit({}, raw); h.advance(40); h.setFresh(false); h.emit({}, raw);
  assert.equal(h.value.state.reading, true); assert.equal(h.value.state.sample.sequence, 1);
  assert.equal(h.stops.length, 0); h.advance(60); h.setFresh(true);
  h.emit({ 2: 1700 }, { ...raw, requestStartedAtMonotonicMs: 70 });
  assert.deepEqual(received, [1, 3]); assert.equal(h.value.state.sample.requestStartedAtMonotonicMs, 70);
  assert.equal(h.value.state.sample.channels[2], 1700); assert.equal(h.value.state.calibrated, false); h.unmount();
});
test('dropping observation events never extends startup or accepted-input deadlines', async () => {
  const raw = { channelSettings: null, controlMode: null, configurationReady: false };
  for (const initialFrame of [false, true]) {
    const h = mount(); h.value.observe(); await tick(); if (initialFrame) h.emit({}, raw);
    h.setFresh(false); h.advance(initialFrame ? 150 : 2999); h.emit({}, raw);
    assert.notEqual(h.value.state.status, 'error'); h.advance(initialFrame ? 1 : 2);
    assert.equal(h.value.state.status, 'error'); assert.equal(h.stops.length, 1);
    assert.equal(h.value.state.message, initialFrame ? 'G20 输入更新中断，请重新读取' : '读取 G20 输入超时'); h.unmount();
  }
});
async function reading() { const h = mount(); h.value.start(); await tick(); h.emit(); return h; }

test('native failure reasons have distinct fixed messages for both start results and state events', async () => {
  const reasons = {
    connect_timeout: '连接 G20 输入服务超时，请重新读取',
    read_timeout: '读取 G20 通道超时，请重新读取',
    read_failed: '读取 G20 输入失败，请重新读取',
    sdk_unavailable: 'G20 输入 SDK 不可用，请检查安装包',
    unsupported_device: '当前设备未被识别为 G20',
    unsupported_abi: '当前设备架构不支持 G20 输入 SDK',
    rc_connect_failed: '无法连接 G20 输入服务，请重新读取',
    disconnected: 'G20 输入连接已断开，请重新读取',
    configuration_unavailable: '无法读取 G20 通道配置，请重新读取',
    configuration_changed: 'G20 通道配置已变化，请重新校验',
    invalid_channels: 'G20 通道数据无效，请重新读取',
    background: 'G20 输入已暂停，请在应用前台重新读取',
    destroyed: 'G20 输入模块已停止，请重新进入控制页',
  };
  assert.equal(new Set(Object.values(reasons)).size, Object.keys(reasons).length);
  for (const via of ['start', 'event']) for (const [reason, expected] of Object.entries(reasons)) {
    const h = mount({ startState: via === 'start' ? { status: 'error', reason } : undefined, stopEmitsState: true });
    h.value.start(); await tick();
    if (via === 'event') h.emitState({ status: 'unavailable', reason });
    h.render();
    assert.equal(h.value.state.status, 'error', `${via}/${reason}`);
    assert.equal(h.value.state.message, expected, `${via}/${reason}`);
    assert.equal(h.value.state.reading, false);
    assert.equal(h.value.state.calibrated, false);
    h.emitState({ status: 'stopped', reason: 'stopped' });
    h.value.stop(); h.render();
    assert.equal(h.value.state.message, expected, 'native and explicit stop cleanup must preserve the first failure');
    assert.equal(h.value.state.status, 'error');
    h.unmount();
  }
});

test('unknown native failure values never expose raw details, and an explicit new read clears the old error', async () => {
  for (const reason of ['secret-password-and-private-path', '__proto__', { secret: 'NEVER_DISPLAY' }, null]) {
    const h = mount({ stopEmitsState: true });
    h.value.start(); await tick(); h.emitState({ status: 'error', reason });
    assert.equal(h.value.state.message, '无法读取 G20 输入，请检查安装包与设备');
    assert.doesNotMatch(JSON.stringify(h.value.state), /secret|NEVER_DISPLAY|__proto__/);
    h.value.start(); h.render();
    assert.equal(h.value.state.status, 'starting');
    assert.equal(h.value.state.message, null);
    await tick(); h.emit();
    assert.equal(h.value.state.reading, true);
    assert.equal(h.value.state.message, null);
    h.unmount();
  }
});
function calibrate(h) {
  h.value.beginCalibration(); h.render();
  for (const [axis, channel, value] of [['leftX', 0, 1950], ['leftY', 1, 1050], ['rightX', 2, 1950], ['rightY', 3, 1050]]) {
    h.emit({ [channel]: value }); h.value.learnAxis(axis); h.render();
  }
  h.emit(); h.value.finishCalibration(); h.render();
}

test('real hook reads raw channels without acquiring a robot and calibrates local axes', async () => {
  const h = await reading(); const frames = []; h.value.subscribe(event => frames.push(event));
  assert.equal(h.value.state.reading, true); assert.equal(h.value.state.calibrated, false);
  calibrate(h);
  assert.equal(h.value.state.calibrated, true); assert.equal(h.value.state.calibrating, false);
  h.emit({ 0: 1950 }); assert.equal(frames.at(-1).frame.vector.leftX, 1);
  assert.equal(h.stops.length, 0); h.unmount();
});
test('queued native events failing native age validation retire the read session', async () => {
  const h = await reading(); calibrate(h); h.setFresh(false); h.emit({ 0: 1950 });
  assert.equal(h.value.state.reading, false); assert.equal(h.value.state.calibrated, false);
  assert.equal(h.value.state.message, 'G20 当前采样已失效，请重新读取');
  assert.equal(h.stops.length, 1);
  h.setFresh(true); h.emit(); assert.equal(h.value.state.reading, false, 'late events cannot revive a failed session'); h.unmount();
});

test('stale startup samples cannot bind generation, consume sequence or publish input before a fresh first frame', async () => {
  const h = mount(); const frames = []; h.value.subscribe(event => frames.push(event));
  h.value.start(); h.render();
  const notifications = frames.length;
  h.setFresh(false); h.emit({ 0: 1950 }, { generation: 7, sequence: 42 });
  await tick(); h.render();
  h.emit({ 0: 1950 }, { sequence: 99 });
  assert.equal(h.value.state.status, 'starting');
  assert.equal(h.value.state.reading, false);
  assert.equal(h.value.state.sample, null);
  assert.equal(h.value.state.calibrated, false);
  assert.equal(h.value.state.vector, null);
  assert.equal(h.value.state.message, null);
  assert.equal(frames.length, notifications, 'dropped startup frames must not notify input consumers');
  assert.equal(h.stops.length, 0);
  h.setFresh(true); h.emit({}, { sequence: 1 });
  assert.equal(h.value.state.reading, true);
  assert.equal(h.value.state.sample.generation, 1);
  assert.equal(h.value.state.sample.sequence, 1);
  assert.equal(h.value.state.calibrated, false, 'a first raw frame grants no calibrated controls');
  assert.equal(frames.at(-1).frame, null);
  h.unmount();
});

test('dropping stale startup frames does not extend the original three-second startup deadline', async () => {
  const h = mount(); h.value.start(); await tick();
  h.advance(2999); h.setFresh(false); h.emit({}, { sequence: 50 });
  assert.equal(h.value.state.status, 'starting');
  assert.equal(h.value.state.sample, null);
  h.advance(2);
  assert.equal(h.value.state.status, 'error');
  assert.equal(h.value.state.message, '读取 G20 输入超时');
  assert.equal(h.stops.length, 1);
  h.setFresh(true); h.emit({}, { sequence: 1 });
  assert.equal(h.value.state.reading, false, 'a frame after the deadline cannot revive the session');
  h.unmount();
});

test('after the first accepted frame the watchdog keeps the 150ms limit and reports a distinct interruption', async () => {
  const h = mount(); h.value.start(); await tick();
  h.setFresh(false); h.emit({}, { sequence: 50 });
  h.advance(1000); h.setFresh(true); h.emit({}, { sequence: 1 });
  assert.equal(h.value.state.reading, true);
  h.advance(150);
  assert.equal(h.value.state.reading, true);
  assert.equal(h.diagnostics.length, 0);
  h.advance(1);
  assert.equal(h.value.state.reading, false);
  assert.equal(h.value.state.message, 'G20 输入更新中断，请重新读取');
  assert.notEqual(h.value.state.message, 'G20 当前采样已失效，请重新读取');
  assert.equal(h.stops.length, 1);
  assert.deepEqual(h.diagnostics.filter(value => value.startsWith('DOSO_G20_WATCHDOG')), ['DOSO_G20_WATCHDOG sequence=1 ageMs=151']);
  assert.equal(h.diagnostics.filter(value => value.startsWith('DOSO_G20_JS_TIMING')).length, 1);
  h.advance(100); assert.equal(h.diagnostics.length, 2);
  h.unmount();
});

test('JS arrival timing is aggregated once without changing original source timestamps', async () => {
  const h = await reading();
  const received = []; h.value.subscribe(event => { if (event.sample) received.push(event.sample); });
  for (let i = 0; i < 4; i++) { h.advance(20); h.emit(); }
  const original = received.at(-1).requestStartedAtMonotonicMs;
  assert.equal(h.value.state.sample.requestStartedAtMonotonicMs, 0, 'UI is throttled without throttling subscribers');
  assert.equal(h.diagnostics.length, 0); h.value.stop(); h.render();
  assert.deepEqual(h.diagnostics, ['DOSO_G20_JS_TIMING samples=5 spanMs=80.00 hz=50.00 maxGapMs=20.00']);
  h.value.stop(); h.unmount(); assert.equal(h.diagnostics.length, 1);
  assert.equal(original, 80);
});
test('JS watchdog, background and leaving the control page discard calibration', async () => {
  for (const action of [h => h.advance(151), h => h.background(), h => h.setActive(false)]) {
    const h = await reading(); calibrate(h); action(h); h.render();
    assert.equal(h.value.state.reading, false); assert.equal(h.value.state.calibrated, false); assert.ok(h.stops.length > 0); h.unmount();
  }
});
test('watchdog still stops input when diagnostics fail', async () => {
  const h = mount({ diagnosticThrows: true }); h.value.start(); await tick(); h.emit();
  h.advance(151);
  assert.equal(h.value.state.reading, false);
  assert.equal(h.value.state.message, 'G20 输入更新中断，请重新读取');
  assert.equal(h.stops.length, 1);
  h.unmount();
});
test('unowned and duplicate samples never update input while configuration changes clear calibration', async () => {
  const h = await reading(); calibrate(h);
  const before = h.value.state.sample.sequence;
  h.emit({ 0: 1950 }, { requestId: 'other' }); assert.equal(h.value.state.sample.sequence, before);
  h.emit({ 0: 1950 }, { sequence: before }); assert.equal(h.value.state.sample.sequence, before);
  h.emit({}, { controlMode: 'JAPAN' }); assert.equal(h.value.state.calibrated, false);
  h.unmount();
});
test('finishing while a learned axis remains held keeps calibration mode active', async () => {
  const h = await reading(); calibrate(h);
  h.value.beginCalibration(); h.render();
  for (const [axis, channel] of [['leftX', 0], ['leftY', 1], ['rightX', 2], ['rightY', 3]]) {
    h.emit({ [channel]: 1950 }); h.value.learnAxis(axis); h.render();
  }
  h.value.finishCalibration(); h.render();
  assert.equal(h.value.state.calibrating, true); assert.match(h.value.state.message, /松开/); h.unmount();
});
