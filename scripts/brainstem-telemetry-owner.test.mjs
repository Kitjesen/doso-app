import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const endpoint = { host: 'robot.example.test', port: 13145, clientIdentityAlias: 'selected-identity' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function mount(initial = {}) {
  const slots = [], effects = [], timers = new Map(), listeners = new Set(), calls = [];
  let cursor = 0, timerId = 0, now = Date.parse('2026-10-25T10:00:00Z'), value, unmounted = false, lateUpdates = 0;
  let props = { ownerKey: 'account-a', endpoint, active: true, ...initial };
  const react = {
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { if (unmounted) lateUpdates++; slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(run, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((entry, index) => entry !== old.deps[index])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, run, cleanup: run() }; }); },
  };
  class Clock extends Date { static now() { return now; } }
  const appState = { currentState: 'active', addEventListener(_name, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const observation = () => ({ source: 'brainstem.grpc.direct', transport: 'grpc-tls', observedAt: new Clock(now).toISOString(),
    motionAuthorized: false, cloudBindingVerified: false, status: { fsmKind: 'standing', transition: 'none', motorOutputEnabled: true,
      owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false } });
  const readers = {
    status: async () => observation(),
    profile: async () => ({ profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }),
    voltage: async () => ({ voltage: { values: [24.5, 24.7] } }),
    motors: async () => ({ motors: [{ id: 0, online: true, statusCode: 2, temperatureC: 42, voltageV: 0,
      positionRad: .1, velocityRps: .2, torqueNm: 1, errors: [] }] }),
  };
  const services = Object.fromEntries(['status', 'profile', 'voltage', 'motors'].map(kind => [
    { status: 'readBrainstemGrpcStatus', profile: 'readBrainstemGrpcProfile', voltage: 'readBrainstemGrpcVoltage', motors: 'readBrainstemGrpcMotorStatus' }[kind],
    options => { calls.push({ kind, ...options }); return Promise.resolve().then(() => readers[kind](options)); },
  ]));
  function load(path) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, Date: Clock, AbortController,
      setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
      clearTimeout: id => timers.delete(id),
      setInterval(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay, interval: delay }); return id; },
      clearInterval: id => timers.delete(id),
      require(name) {
        if (name === 'react') return react;
        if (name === 'react-native') return { AppState: appState };
        if (name === '../../services/brainstemGrpc') return services;
        if (name === '../../services/directRobotConnection') return load('../src/services/directRobotConnection.ts');
        throw Error('Unexpected dependency ' + name);
      },
    });
    return module.exports;
  }
  const hook = load('../src/features/control/useBrainstemTelemetry.ts').useBrainstemTelemetry;
  function render(next = {}) { props = { ...props, ...next }; cursor = 0; value = hook(props); while (effects.length) effects.shift()(); return value; }
  async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); return render(); }
  render();
  return { render, settle, calls, readers, observation, get value() { return value; }, get now() { return now; }, get lateUpdates() { return lateUpdates; },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) {
      if (timer.interval) timer.due = now + timer.interval; else timers.delete(id); timer.callback();
    } return render(); },
    lifecycle(state) { appState.currentState = state; for (const listener of listeners) listener(state); return render(); },
    restartEffects() { for (const slot of slots) slot?.cleanup?.(); for (const slot of slots) if (slot?.run) slot.cleanup = slot.run(); },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('selected identity reads four unary methods in order and projects only actual telemetry', async () => {
  const host = mount(); await host.settle();
  assert.deepEqual(host.calls.map(call => call.kind), ['status', 'profile', 'voltage', 'motors']);
  assert.ok(host.calls.every(call => call.endpoint.clientIdentityAlias === endpoint.clientIdentityAlias));
  assert.equal(new Set(host.calls.map(call => call.requestId)).size, 4);
  assert.ok(host.calls.every(call => /^[A-Za-z0-9_-]{1,80}$/.test(call.requestId)));
  const runtime = host.value.presentation.runtimeState;
  assert.equal(runtime.battery.voltageV, 24.5); assert.equal(runtime.battery.percent, null);
  assert.equal(runtime.joints[0].voltageV, 24.5); assert.equal(runtime.controlAuthority, 'not-held');
  assert.equal(runtime.speed, undefined); assert.equal(runtime.signal, undefined);
  assert.ok(!JSON.stringify(host.value.snapshot).includes(endpoint.clientIdentityAlias));
  host.unmount();
});

test('polling and explicit refresh cannot overlap a pending unary read', async () => {
  const host = mount(), pending = deferred(); host.readers.status = () => pending.promise;
  await host.settle(); host.advance(5000); host.value.refresh(); host.value.refresh();
  assert.equal(host.calls.length, 1);
  pending.resolve(host.observation()); await host.settle();
  assert.equal(host.calls.length, 4); host.advance(5000); await host.settle();
  assert.equal(host.calls.length, 8); host.unmount();
});

test('optional failures clear old corresponding fields and never expose raw errors', async () => {
  const host = mount(); await host.settle();
  for (const kind of ['profile', 'voltage', 'motors']) host.readers[kind] = async () => { throw Error('private upstream detail'); };
  await host.value.refresh(); await host.settle();
  assert.equal(host.value.snapshot.observation.voltage, undefined);
  assert.equal(host.value.presentation.runtimeState.battery, undefined);
  assert.equal(host.value.presentation.runtimeState.joints, undefined);
  assert.equal(host.value.presentation.runtimeState.currentPolicy, null);
  assert.ok(host.value.error); assert.ok(!host.value.error.includes('private upstream'));
  host.unmount();
});

test('status failure clears the whole previous observation and stops that cycle', async () => {
  const host = mount(); await host.settle(); const count = host.calls.length;
  host.readers.status = async () => { throw Error('private status detail'); };
  await host.value.refresh(); await host.settle();
  assert.equal(host.value.snapshot, null); assert.equal(host.value.presentation, null);
  assert.equal(host.calls.length, count + 1); assert.ok(host.value.error); host.unmount();
});

test('owner, host, port, alias and active changes retire late A-B-A responses', async () => {
  for (const change of [{ ownerKey: 'account-b' }, { endpoint: { ...endpoint, host: 'other.test' } },
    { endpoint: { ...endpoint, port: 13146 } }, { endpoint: { ...endpoint, clientIdentityAlias: 'other' } }, { endpoint: { ...endpoint, transport: 'lan-dev' } }, { active: false }]) {
    const host = mount(), pending = deferred(); host.readers.status = () => pending.promise; await host.settle();
    const old = host.calls[0]; host.render(change); host.render({ ownerKey: 'account-a', endpoint, active: true });
    assert.equal(old.signal.aborted, true); assert.equal(host.value.snapshot, null);
    host.readers.status = async () => { throw Error('replacement has no data'); };
    pending.resolve(host.observation()); await host.settle();
    assert.equal(host.calls.filter(call => call.kind === 'voltage').length, 0, 'retired reads must not continue to optional telemetry');
    host.unmount();
  }
});

test('equivalent endpoint objects do not restart selected telemetry', async () => {
  const host = mount(); await host.settle(); host.render({ endpoint: { ...endpoint } }); await host.settle();
  assert.equal(host.calls.length, 4); assert.ok(host.value.snapshot); host.unmount();
});

test('a cancelled Strict Mode effect cannot publish a failure into its restarted owner', async () => {
  const host = mount(), first = deferred(), second = deferred(); host.readers.status = () => first.promise;
  await host.settle(); host.readers.status = () => second.promise; host.restartEffects();
  first.reject(Error('cancelled old request')); await host.settle();
  assert.equal(host.value.error, null); assert.equal(host.value.refreshing, true);
  second.resolve(host.observation()); await host.settle(); assert.ok(host.value.snapshot); host.unmount();
});

test('background cancels pending work and clears telemetry; foreground creates a new read', async () => {
  const host = mount(); await host.settle(); const pending = deferred(); host.readers.status = () => pending.promise;
  host.value.refresh(); const call = host.calls.at(-1); host.lifecycle('background');
  assert.equal(call.signal.aborted, true); assert.equal(host.value.snapshot, null);
  const count = host.calls.length; host.advance(10000); await host.settle(); assert.equal(host.calls.length, count);
  host.readers.status = async () => host.observation(); host.lifecycle('active'); await host.settle(); assert.ok(host.value.snapshot);
  pending.resolve(host.observation()); await host.settle(); host.unmount();
});

test('the earliest status time expires telemetry even while a replacement read is pending', async () => {
  const host = mount(); await host.settle(); const pending = deferred(); host.readers.status = () => pending.promise;
  const previous = host.value.snapshot;
  host.advance(5000); await host.settle();
  assert.equal(host.value.snapshot, previous, 'same-owner fresh data remains visible while polling');
  assert.equal(host.value.refreshing, true);
  host.advance(10000); await host.settle();
  assert.equal(host.value.snapshot, null); assert.equal(host.value.presentation, null);
  pending.resolve({ ...host.observation(), observedAt: new Date(host.now - 15000).toISOString() }); await host.settle();
  assert.equal(host.value.snapshot, null); host.unmount();
});

test('later diagnostics do not renew the oldest status timestamp', async () => {
  const host = mount(), pending = deferred(); host.readers.voltage = () => pending.promise;
  await host.settle(); const firstObservedAt = host.observation().observedAt;
  host.advance(14000); pending.resolve({ voltage: { values: [24.2] } }); await host.settle();
  assert.equal(host.value.snapshot.observation.observedAt, firstObservedAt);
  assert.equal(host.value.presentation.runtimeState.battery.voltageV, 24.2);
  host.advance(1000); await host.settle(); assert.equal(host.value.snapshot, null);
  host.unmount();
});

test('an earlier diagnostic clock also shortens the combined snapshot lifetime', async () => {
  const host = mount();
  const earlier = new Date(host.now - 1000).toISOString();
  host.readers.profile = async () => ({ observedAt: earlier, profile: { current: '', available: [], descriptions: [], currentDescription: '' } });
  await host.settle(); assert.equal(host.value.snapshot.observation.observedAt, earlier);
  host.unmount();
});

test('unselected or inactive targets perform no reads, and unmount ignores late results', async () => {
  const host = mount(), pending = deferred(); host.readers.status = () => pending.promise; await host.settle();
  const call = host.calls[0]; host.unmount(); assert.equal(call.signal.aborted, true);
  pending.resolve(host.observation()); await host.settle(); assert.equal(host.lateUpdates, 0);
  for (const next of [{ ownerKey: null }, { endpoint: null }, { active: false }]) {
    const other = mount(next); await other.settle();
    other.advance(10000); await other.settle(); assert.equal(other.calls.length, 0); assert.equal(other.value.snapshot, null); other.unmount();
  }
});
