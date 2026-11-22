import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/RemoteStatePanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const USER = '11111111-1111-4111-8111-111111111111', DEVICE = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';
const START = Date.parse('2026-11-03T00:00:00.000Z');
const status = { state: { kind: 'CMS_STATE_KIND_STANDING', transition: 'CMS_TRANSITION_KIND_NONE' },
  control: { owner: 'CONTROL_OWNER_NONE', motorOutputEnabled: false, criticalMotorFault: false }, transport: 'mtls' };
const reading = (at = START) => ({ observedAt: new Date(at).toISOString(), receivedAt: new Date(at).toISOString(), status });
const state = (patch = {}) => ({ deviceId: DEVICE, simulated: false, enabled: false, revision: 1, activation: 'off', reachable: null, fresh: false,
  lastSeenAt: null, latest: null, lastSuccess: null, ...patch });
const on = (patch = {}) => state({ enabled: true, activation: 'on', reachable: true, fresh: true, latest: reading(), lastSuccess: reading(), ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Execute actual TSX handlers, while controlling API responses, lifecycle and time.
function mount({ get = async () => state(), set = async () => state({ enabled: true, revision: 2, activation: 'enabling' }) } = {}) {
  const slots = [], effects = [], listeners = new Set(), timers = new Map(), reads = [], writes = [];
  let cursor = 0, nodes = [], unmounted = false, lateUpdates = 0, at = START, nextTimer = 0;
  let props = { expectedUserId: USER, deviceId: DEVICE };
  const react = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial; return [slots[id], value => {
      if (unmounted) lateUpdates++; else slots[id] = typeof value === 'function' ? value(slots[id]) : value;
    }]; },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useEffect(effect, deps) { const id = cursor++, previous = slots[id];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) effects.push(() => { previous?.cleanup?.(); slots[id] = { deps, cleanup: effect() }; });
    },
  };
  class Clock extends Date { constructor(...args) { if (args.length) super(...args); else super(at); } static now() { return at; } }
  class RemoteStateError extends Error { constructor(code, outcomeMayBeUnknown = false) { super(code); this.code = code; this.outcomeMayBeUnknown = outcomeMayBeUnknown; } }
  class AuthSessionOperationBusyError extends Error {}
  const appState = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: appState, Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } },
    '../appearance': { cardLayout: { radius: 24, inset: 16 }, getProductAppearance: () => ({ surface: '#fff', ink: '#123', secondary: '#567', blueInk: '#123', blueSoft: '#def' }) },
    './AppText': { Text: 'Text' }, './TrackPanel': { TrackPanel: 'LocationMap' }, '../theme': { useAppTheme: () => ({ isDark: false }) }, '../typography': { typography: {} },
    '../services/authSessionOperation': { AuthSessionOperationBusyError },
    '../services/remoteState': { RemoteStateError,
      getRemoteState(userId, deviceId, options) { const call = { userId, deviceId, ...options }; reads.push(call); return get(call, reads.length); },
      setRemoteState(userId, deviceId, enabled, revision, options) { const call = { userId, deviceId, enabled, revision, ...options }; writes.push(call); return set(call, writes.length); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, Date: Clock,
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, interval: delay, due: at + delay }); return id; }, clearInterval: id => timers.delete(id),
    require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const render = () => {
    cursor = 0; nodes = [];
    const walk = node => { if (node == null || typeof node === 'boolean') return; if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; } nodes.push(node); walk(node.props.children); };
    walk(module.exports.RemoteStatePanel(props));
    while (effects.length) effects.shift()();
  };
  render(); render();
  return { reads, writes, timers, RemoteStateError, render,
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get lateUpdates() { return lateUpdates; },
    get now() { return at; },
    get map() { return nodes.find(node => node.type === 'LocationMap'); },
    element: id => nodes.find(node => node.props?.testID === id),
    async ready() { await settle(); render(); },
    press(id) { const element = this.element(id); assert.ok(element, id); const result = element.props.onPress(); render(); return result; },
    async click(id) { await this.press(id); await this.ready(); },
    setProps(patch) { props = { ...props, ...patch }; render(); render(); },
    advance(ms) {
      const until = at + ms;
      while (timers.size) {
        const earliest = Math.min(...[...timers.values()].map(timer => timer.due));
        if (earliest > until) break;
        at = earliest;
        for (const [id, timer] of [...timers]) if (timer.due <= at && timers.has(id)) { timer.due += timer.interval; timer.callback(); }
      }
      at = until; render();
    },
    lifecycle(value) { appState.currentState = value; for (const listener of listeners) listener(value); render(); },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('opening reads unknown setting then canonical off without any automatic write', async () => {
  const reply = deferred(), host = mount({ get: () => reply.promise });
  assert.equal(host.element('remote-state-toggle').props.disabled, true); assert.match(host.copy, /设置待确认/);
  reply.resolve(state()); await host.ready();
  assert.match(host.copy, /远程状态已关闭/); assert.equal(host.element('remote-state-toggle').props.disabled, false);
  assert.equal(host.element('remote-state-refresh'), undefined);
  assert.equal(host.reads.length, 1); assert.equal(host.writes.length, 0);
  assert.match(host.copy, /运行状态、GNSS 位置与关键故障；视频另行选择/);
  assert.match(host.copy, /关闭远程状态后，设备仍可能保持云连接并发送设备标识和联系时间/); host.unmount();
});

test('explicit enable saves current revision and waits for device confirmation before fresh status', async () => {
  const saved = deferred(); let enabled = false;
  const host = mount({ get: async () => enabled ? on({ revision: 2 }) : state(), set: () => saved.promise });
  await host.ready(); host.press('remote-state-toggle'); await host.ready();
  assert.equal(host.writes.length, 1); assert.equal(host.writes[0].enabled, true); assert.equal(host.writes[0].revision, 1);
  assert.match(host.copy, /正在保存/); assert.doesNotMatch(host.copy, /设备已确认开启/);
  saved.resolve(state({ enabled: true, revision: 2, activation: 'enabling' })); await host.ready();
  assert.match(host.copy, /开启已保存，等待设备确认/); assert.doesNotMatch(host.copy, /最新状态/);
  enabled = true; host.advance(4000); await host.ready();
  assert.match(host.copy, /设备已确认开启/); assert.match(host.copy, /最新状态/); assert.match(host.copy, /站立/);
  assert.equal(host.writes.length, 1); assert.doesNotMatch(host.copy, /revision|authorizationEpoch|reportingSession|mtls|电量/); host.unmount();
});

test('disabled remote management does not present missing visibility as an unreachable robot', async () => {
  const host = mount({ get: async () => state({ reachable: false }) });
  await host.ready();
  assert.equal(host.element('remote-state-reachable'), undefined);
  assert.equal(host.element('remote-state-seen'), undefined);
  assert.doesNotMatch(host.copy, /设备暂不可达/);
  assert.equal(host.writes.length, 0);
  host.unmount();
});

test('explicit close immediately shows cloud stop acceptance and retains pending device confirmation', async () => {
  const host = mount({ get: async () => on({ revision: 7 }), set: async () => state({ revision: 8, activation: 'disabling' }) });
  await host.ready(); await host.click('remote-state-toggle');
  assert.equal(host.writes[0].enabled, false); assert.equal(host.writes[0].revision, 7);
  assert.match(host.copy, /云端已停止接收，等待设备确认/); assert.doesNotMatch(host.copy, /远程状态已关闭/);
  host.unmount(); assert.equal(host.writes.length, 1);
});

test('foreground polling stops in background, resumes with GET, and never changes consent', async () => {
  const host = mount(); await host.ready(); host.advance(4000); await host.ready(); assert.equal(host.reads.length, 2);
  host.lifecycle('background'); assert.equal(host.timers.size, 0); assert.equal(host.element('remote-state-toggle').props.disabled, true);
  host.advance(20000); await host.ready(); assert.equal(host.reads.length, 2);
  host.lifecycle('active'); await host.ready(); assert.equal(host.reads.length, 3); assert.equal(host.writes.length, 0);
  host.unmount(); assert.equal(host.timers.size, 0);
});

test('old success becomes stale after five seconds even while a poll never returns', async () => {
  const reply = deferred(), host = mount({ get: (_call, count) => count === 1 ? Promise.resolve(on()) : reply.promise });
  await host.ready(); assert.match(host.copy, /最新状态/);
  host.advance(4000); await host.ready(); assert.equal(host.reads.length, 2);
  host.advance(1000); await host.ready(); assert.match(host.copy, /状态已过期/); assert.match(host.copy, /5 秒前/);
  assert.match(host.copy, /站立/); host.unmount(); assert.equal(host.reads[1].signal.aborted, true);
  reply.resolve(on()); await host.ready(); assert.equal(host.lateUpdates, 0);
});

test('read failure preserves last success time and unknown enums display as unknown', async () => {
  const past = reading(START - 12000);
  const host = mount({ get: async () => on({ fresh: false, latest: { observedAt: new Date(START).toISOString(), receivedAt: new Date(START).toISOString(), error: 'upstream_unavailable' },
    lastSuccess: { ...past, status: { ...status, state: { kind: 'CMS_STATE_KIND_FUTURE', transition: 'CMS_TRANSITION_KIND_FUTURE' } } } }) });
  await host.ready(); assert.match(host.copy, /本次设备状态读取失败/); assert.match(host.copy, /上次成功状态/); assert.match(host.copy, /12 秒前/);
  assert.equal(host.element('remote-state-kind').props.children[1].props.children, '未知'); assert.doesNotMatch(host.copy, /初始状态/); host.unmount();
});

test('account and device changes cancel old reads and retire previous action handlers', async () => {
  for (const patch of [{ expectedUserId: OTHER }, { deviceId: OTHER }]) {
    const reply = deferred(), host = mount({ get: (_call, count) => count === 1 ? reply.promise : Promise.resolve(state({ deviceId: patch.deviceId ?? DEVICE })) });
    const oldToggle = host.element('remote-state-toggle').props.onPress;
    host.setProps(patch); assert.equal(host.reads[0].signal.aborted, true); await host.ready();
    reply.resolve(on()); await host.ready(); oldToggle(); await host.ready();
    assert.equal(host.writes.length, 0); assert.doesNotMatch(host.copy, /站立/); assert.equal(host.reads.length, 2); host.unmount();
  }
});

test('unknown POST outcomes and CAS conflicts reconcile canonical GET without retrying the write', async () => {
  for (const kind of ['timeout', 'revision_conflict']) {
    const canonical = deferred(); let host;
    host = mount({ get: (_call, count) => count === 1 ? Promise.resolve(state()) : canonical.promise,
      set: async () => { throw new host.RemoteStateError(kind, kind === 'timeout'); } });
    await host.ready(); host.press('remote-state-toggle'); await host.ready();
    assert.match(host.copy, /正在确认保存结果/); assert.equal(host.element('remote-state-toggle').props.disabled, true);
    canonical.resolve(state({ enabled: true, revision: 3, activation: 'enabling' })); await host.ready();
    assert.match(host.copy, /开启已保存，等待设备确认/); assert.equal(host.writes.length, 1); assert.equal(host.reads.length, 2); host.unmount();
  }
});

test('failed reconciliation blocks another write until a later read confirms persisted choice', async () => {
  let host;
  host = mount({ get: (_call, count) => count === 1 ? Promise.resolve(state()) : count === 2 ? Promise.reject(new Error('unreachable')) : Promise.resolve(state({ enabled: true, revision: 1, activation: 'enabling' })),
    set: async () => { throw new host.RemoteStateError('unavailable', true); } });
  await host.ready(); host.press('remote-state-toggle'); await host.ready();
  assert.match(host.copy, /保存结果尚未确认/); assert.equal(host.element('remote-state-toggle').props.disabled, true);
  host.press('remote-state-toggle'); await host.ready(); assert.equal(host.writes.length, 1);
  host.advance(4000); await host.ready(); assert.match(host.copy, /开启已保存/); assert.equal(host.element('remote-state-toggle').props.disabled, false);
  assert.equal(host.writes.length, 1); host.unmount();
});

test('background during save discards late response and resumes by reading persisted choice', async () => {
  const save = deferred(); let saved = false;
  const host = mount({ get: async () => state(saved ? { enabled: true, revision: 1, activation: 'enabling' } : {}), set: () => save.promise });
  await host.ready(); host.press('remote-state-toggle'); await host.ready();
  host.lifecycle('background'); assert.equal(host.writes[0].signal.aborted, true); saved = true;
  save.resolve(state({ enabled: true, revision: 1, activation: 'enabling' })); await host.ready(); assert.doesNotMatch(host.copy, /开启已保存/);
  host.lifecycle('active'); await host.ready(); assert.match(host.copy, /开启已保存，等待设备确认/); assert.equal(host.writes.length, 1); host.unmount();
});

test('authorization failure during reconciliation or later polling clears previous state and uncertainty', async () => {
  for (const rejectAt of [2, 3]) {
    let host;
    host = mount({ get: (_call, count) => count === 1 ? Promise.resolve(on()) : count === rejectAt
      ? Promise.reject(new host.RemoteStateError('unauthorized')) : Promise.reject(new Error('unreachable')),
      set: async () => { throw new host.RemoteStateError('timeout', true); } });
    await host.ready(); assert.match(host.copy, /站立/);
    host.press('remote-state-toggle'); await host.ready();
    if (rejectAt === 3) { assert.match(host.copy, /保存结果尚未确认，正在自动核对/); host.advance(4000); await host.ready(); }
    assert.equal(host.element('remote-state-status'), undefined);
    assert.equal(host.element('remote-state-toggle').props.disabled, true);
    assert.match(host.copy, /unauthorized/); assert.doesNotMatch(host.copy, /保存结果尚未确认/);
    assert.equal(host.writes.length, 1); host.unmount();
  }
});

test('simulated telemetry is clearly identified in the actual state panel', async () => {
  const host = mount({ get: async () => on({ simulated: true }) });
  await host.ready();
  assert.match(host.copy, /模拟设备/); assert.match(host.copy, /并非机器狗实际运行数据/);
  assert.match(host.copy, /采集时间/); assert.match(host.copy, /站立/); host.unmount();
});

test('GPS fix expires independently while status keeps refreshing and map shares the same reading', async () => {
  const location = { lat: 31.2304, lon: 121.4737, fixType: 4, accuracyM: null, observedAt: new Date(START).toISOString() };
  let host;
  host = mount({ get: async () => { const current = reading(host?.now ?? START); current.status = { ...status, location }; return on({ latest: current, lastSuccess: current, simulated: true }); } });
  await host.ready(); assert.match(host.copy, /最新定位/); assert.match(host.copy, /31.230400, 121.473700/);
  assert.match(host.copy, /2026-11-03T00:00:00.000Z/); assert.match(host.copy, /RTK 固定解 · 精度未知/);
  assert.doesNotMatch(host.copy, /fixType/);
  assert.equal(host.map, undefined);
  await host.click('remote-location-toggle');
  host.advance(5000); await host.ready();
  assert.match(host.copy, /最新状态/); assert.match(host.copy, /定位已过期/);
  assert.equal(host.map.props.fresh, false); assert.equal(host.map.props.simulated, true); assert.equal(host.map.props.location, location);
  host.setProps({ deviceId: OTHER }); await host.ready();
  assert.equal(host.map, undefined); host.unmount();
});

test('old messages without GPS show no location and never substitute a default coordinate', async () => {
  const host = mount({ get: async () => on() }); await host.ready();
  assert.match(host.copy, /暂无 GPS 定位/); assert.equal(host.element('remote-state-location-coordinates'), undefined);
  await host.click('remote-location-toggle'); assert.equal(host.map.props.location, undefined);
  await host.click('remote-location-toggle'); assert.equal(host.map, undefined); host.unmount();
});

test('active telemetry refreshes before the five-second freshness window despite transport delay', async () => {
  const replies = []; let host;
  host = mount({ get: (_call, count) => {
    if (count === 1) return Promise.resolve(on({ latest: reading(START - 2000), lastSuccess: reading(START - 2000) }));
    const reply = deferred(), sample = reading(host.now - 2000);
    replies.push({ reply, value: on({ latest: sample, lastSuccess: sample }) });
    return reply.promise;
  } });
  await host.ready();
  for (let count = 0; count < 8; count++) {
    host.advance(count === 0 ? 1000 : 800); await host.ready();
    assert.equal(replies.length, count + 1, 'active state should poll each second without waiting four seconds');
    assert.match(host.copy, /最新状态/); assert.doesNotMatch(host.copy, /状态已过期/);
    host.advance(200); await host.ready();
    replies[count].reply.resolve(replies[count].value); await host.ready();
    assert.match(host.copy, /最新状态/); assert.doesNotMatch(host.copy, /状态已过期/);
  }
  host.unmount();
});

test('user close supersedes a read without disabling the switch or accepting its late result', async () => {
  const reply = deferred();
  const host = mount({ get: (_call, count) => count === 1 ? Promise.resolve(on({ revision: 7 })) : reply.promise,
    set: async () => state({ revision: 8, activation: 'disabling' }) });
  await host.ready(); host.advance(1000); await host.ready();
  assert.equal(host.reads.length, 2);
  assert.equal(host.element('remote-state-toggle').props.disabled, false);
  await host.click('remote-state-toggle');
  assert.equal(host.reads[1].signal.aborted, true);
  assert.equal(host.writes.length, 1); assert.equal(host.writes[0].enabled, false); assert.equal(host.writes[0].revision, 7);
  reply.resolve(on({ revision: 7 })); await host.ready();
  assert.match(host.copy, /云端已停止接收/); assert.doesNotMatch(host.copy, /设备已确认开启/);
  host.unmount();
});
