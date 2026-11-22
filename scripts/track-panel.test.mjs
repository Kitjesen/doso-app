import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), START = Date.parse('2026-11-09T04:00:00.000Z');
const transpile = path => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const algorithm = { exports: {} };
vm.runInNewContext(transpile('src/features/location/track.ts'), { module: algorithm, exports: algorithm.exports });
const history = (patch = {}) => ({ deviceId: 'device-a', simulated: false, historyId: 'history-a', startTs: START, endTs: START + 1,
  points: [{ reportTs: START, breakBefore: true, location: { lat: 1, lon: 2, observedAt: new Date(START).toISOString(), fixType: 1, accuracyM: null } }],
  partial: false, enabled: true, availability: 'ready', syncState: 'current', ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount(get = async () => history()) {
  const slots = [], effects = [], listeners = new Set(), timers = new Map(), calls = [];
  let cursor = 0, nodes = [], nextTimer = 0, now = START;
  let props = { expectedUserId: 'user-a', deviceId: 'device-a', authorized: true, enabled: true, fresh: true, simulated: false,
    location: { lat: 3, lon: 4, observedAt: new Date(START + 1000).toISOString() } };
  const changed = (old, deps) => !old || deps.some((value, index) => value !== old.deps[index]);
  const react = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial;
      return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useMemo(create, deps) { const id = cursor++; if (changed(slots[id], deps)) slots[id] = { deps, value: create() }; return slots[id].value; },
    useEffect(effect, deps) { const id = cursor++, previous = slots[id];
      if (changed(previous, deps)) effects.push(() => { previous?.cleanup?.(); slots[id] = { deps, cleanup: effect() }; }); },
  };
  class Clock extends Date { constructor(...args) { if (args.length) super(...args); else super(now); } static now() { return now; } }
  class RemoteStateError extends Error { constructor(code) { super(code); this.code = code; } }
  const app = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: app, Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    '../appearance': { cardLayout: { radius: 24 }, getProductAppearance: () => ({ surface: '#fff', raised: '#fff', border: '#ddd', ink: '#123', secondary: '#456', blueSoft: '#def', blueInk: '#123' }) },
    '../features/location/track': algorithm.exports, '../services/remoteState': { RemoteStateError },
    '../services/remoteHistory': { getRemoteHistory(userId, deviceId, startTs, endTs, options) { const call = { userId, deviceId, startTs, endTs, ...options }; calls.push(call); return get(call, calls.length); } },
    '../theme': { useAppTheme: () => ({ isDark: false }) }, '../typography': { typography: {} },
    './AppText': { Text: 'Text' }, './LocationMap': { LocationMap: 'LocationMap' }, './TrackSheet': { TrackSheet: 'TrackSheet' },
  };
  const module = { exports: {} };
  vm.runInNewContext(transpile('src/components/TrackPanel.tsx'), { module, exports: module.exports, Date: Clock, AbortController,
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; }, clearInterval: id => timers.delete(id),
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const render = () => {
    cursor = 0; nodes = [];
    const walk = node => {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); if (node.type === 'TrackSheet') { walk(node.props.map); walk(node.props.summary); } walk(node.props.children);
    };
    walk(module.exports.TrackPanel(props)); while (effects.length) effects.shift()();
  };
  render(); render();
  return { calls, timers, render, RemoteStateError,
    get map() { return nodes.find(node => node.type === 'LocationMap'); },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    async ready() { await settle(); render(); },
    setProps(patch) { props = { ...props, ...patch }; render(); render(); },
    button(name) { return nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === name); },
    press(name) { const button = this.button(name); assert.ok(button); if (!button.props.disabled) button.props.onPress(); render(); render(); },
    tick() { for (const timer of timers.values()) { assert.equal(timer.delay, 10000); timer.callback(); } render(); },
    setClock(value) { now = value; },
    lifecycle(state) { app.currentState = state; for (const listener of listeners) listener(state); render(); render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('today shows saved trail separately from live location and reports estimate and delivery limits', async () => {
  const host = mount(async () => history({ partial: true, simulated: true, enabled: false, syncState: 'incomplete' }));
  assert.match(host.copy, /正在读取轨迹记录/); await host.ready();
  assert.equal(host.map.props.trail.length, 1); assert.equal(host.map.props.trail[0].lat, 1); assert.equal(host.map.props.location.lat, 3);
  assert.match(host.copy, /GPS 估算里程/); assert.match(host.copy, /有效记录时长/); assert.match(host.copy, /已停止上报/);
  assert.match(host.copy, /记录时段/); assert.match(host.copy, /模拟设备/); assert.match(host.copy, /轨迹不完整，部分记录未能同步/);
  assert.doesNotMatch(host.copy, /投递待处理|已丢弃|仅显示部分|最多 2000|统计为显示部分/);
  assert.equal(host.button('后一天').props.disabled, true); host.unmount();
});
test('no fix, empty, unmapped and failure never fabricate distance', async () => {
  for (const value of [history({ points: [] }), history({ points: [], availability: 'preparing' })]) {
    const host = mount(async () => value); await host.ready(); assert.equal(host.map.props.trail.length, 0);
    assert.match(host.copy, /--/); assert.match(host.copy, /无有效 GPS 定位记录|正在准备轨迹记录，稍后自动更新/); host.unmount();
  }
  const host = mount(async () => { throw new Error('failure'); }); await host.ready();
  assert.match(host.copy, /读取失败/); assert.equal(host.map.props.trail.length, 0); host.unmount();
});

test('sync messages distinguish pending and lost records while background reads preserve normal guidance', async () => {
  for (const syncState of ['pending', 'incomplete']) {
    const late = deferred(), host = mount((_call, index) => index === 1 ? Promise.resolve(history({ syncState })) : late.promise);
    assert.match(host.copy, /正在读取轨迹记录/); await host.ready();
    const expected = syncState === 'incomplete' ? /轨迹不完整，部分记录未能同步/ : /部分轨迹尚未同步，稍后自动更新/;
    assert.match(host.copy, expected); assert.match(host.copy, /GPS 估算 · 连续定位记录/);
    host.tick(); assert.match(host.copy, expected); assert.match(host.copy, /GPS 估算 · 连续定位记录/);
    assert.doesNotMatch(host.copy, /正在读取轨迹记录|投递待处理|已丢弃/);
    host.unmount(); late.resolve(history()); await settle();
  }
});

test('sheet receives compact summary and complete record details with estimate limits', async () => {
  const host = mount(async () => history({ simulated: true, partial: true })); await host.ready();
  assert.equal(host.map.props.isDark, false);
  assert.match(host.copy, /GPS 估算里程/); assert.match(host.copy, /00:00:00/);
  assert.match(host.copy, /模拟设备/); assert.match(host.copy, /记录时段/);
  assert.doesNotMatch(host.copy, /仅显示部分|最多 2000|统计为显示部分/);
  assert.match(host.copy, /首次定位/); assert.match(host.copy, /末次定位/);
  assert.match(host.copy, /部分定位精度未知/); assert.match(host.copy, /有效记录时长仅表示连续定位覆盖/);
  host.unmount();
});

test('date changes cancel reads, clear old trail and reject late pages', async () => {
  const late = deferred(), host = mount((_call, index) => index === 2 ? late.promise : Promise.resolve(history()));
  await host.ready(); host.tick(); host.press('前一天');
  assert.equal(host.calls[1].signal.aborted, true); assert.equal(host.map.props.trail.length, 0);
  await host.ready(); const key = host.map.props.trackKey;
  late.resolve(history({ historyId: 'retired-history' })); await host.ready(); assert.equal(host.map.props.trackKey, key);
  assert.equal(host.button('后一天').props.disabled, false); host.press('后一天'); await host.ready();
  assert.equal(host.button('后一天').props.disabled, true); host.unmount();
});

test('historical dates hide the live marker and returning to today restores it', async () => {
  const host = mount(); await host.ready();
  assert.equal(host.map.props.location.lat, 3); assert.equal(host.map.props.fresh, true);
  host.press('前一天'); await host.ready();
  assert.equal(host.map.props.location, undefined); assert.equal(host.map.props.fresh, false);
  assert.equal(host.map.props.trail.length, 1);
  host.setProps({ location: { lat: 9, lon: 8, observedAt: new Date(START + 5000).toISOString() } });
  assert.equal(host.map.props.location, undefined); assert.equal(host.map.props.fresh, false);
  host.press('今日'); await host.ready();
  assert.equal(host.map.props.location.lat, 9); assert.equal(host.map.props.fresh, true);
  host.unmount();
});

test('midnight follows today through the existing refresh and foreground paths while preserving historical dates', async () => {
  for (const historical of [false, true]) {
    const host = mount(); await host.ready();
    if (historical) { host.press('前一天'); await host.ready(); }
    const selectedStart = host.calls.at(-1).startTs;
    host.setClock(START + 86400000); host.tick(); await host.ready(); await host.ready();
    assert.equal(host.calls.at(-1).startTs, selectedStart + (historical ? 0 : 86400000));
    assert.equal(host.map.props.fresh, !historical);
    host.lifecycle('background'); host.setClock(START + 2 * 86400000); host.lifecycle('active');
    await host.ready(); await host.ready();
    assert.equal(host.calls.at(-1).startTs, selectedStart + (historical ? 0 : 2 * 86400000));
    assert.equal(host.map.props.fresh, !historical);
    assert.equal(host.timers.size, 1); host.unmount();
  }
});
test('background pauses requests and clears both trail and live location until foreground', async () => {
  const late = deferred(), host = mount((_call, index) => index === 2 ? late.promise : Promise.resolve(history()));
  await host.ready(); host.tick(); host.lifecycle('background');
  assert.equal(host.calls[1].signal.aborted, true); assert.equal(host.timers.size, 0);
  assert.equal(host.map.props.trail.length, 0); assert.equal(host.map.props.location, undefined);
  late.resolve(history()); await host.ready(); assert.equal(host.map.props.trail.length, 0);
  host.lifecycle('active'); await host.ready(); assert.equal(host.calls.length, 3); assert.equal(host.map.props.trail.length, 1); host.unmount();
});
test('user, device and authorization changes immediately retire previous history', async () => {
  for (const patch of [{ expectedUserId: 'user-b' }, { deviceId: 'device-b' }, { authorized: false }]) {
    const late = deferred(), host = mount((_call, index) => index === 1 ? Promise.resolve(history()) : late.promise);
    await host.ready(); const key = host.map.props.trackKey; host.setProps(patch);
    assert.equal(host.map.props.trail.length, 0); assert.notEqual(host.map.props.trackKey, key);
    if (patch.authorized === false) assert.equal(host.calls.length, 1);
    host.unmount(); late.resolve(history()); await settle();
  }
});
test('401 clears visible history and a new history identity replaces the map track key', async () => {
  let host;
  host = mount(async (_call, index) => {
    if (index === 2) throw new host.RemoteStateError('unauthorized');
    return history({ historyId: index === 1 ? 'history-a' : 'history-b' });
  });
  await host.ready(); const key = host.map.props.trackKey;
  host.tick(); await host.ready(); assert.match(host.copy, /授权已失效/); assert.equal(host.map.props.trail.length, 0);
  host.tick(); await host.ready(); assert.notEqual(host.map.props.trackKey, key); assert.match(host.map.props.trackKey, /:history-b$/); host.unmount();
});
test('collapse unmount aborts the in-flight history request', async () => {
  const late = deferred(), host = mount(() => late.promise); host.unmount(); assert.equal(host.calls[0].signal.aborted, true);
  late.resolve(history()); await settle(); assert.equal(host.timers.size, 0);
});
