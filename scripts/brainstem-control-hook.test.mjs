import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';
import { BrainstemConnectionRecovery } from '../src/features/control/brainstemConnectionRecovery.ts';

const endpoint = { host: '192.0.2.1', port: 13145, transport: 'lan-dev' };
const source = ts.transpileModule(readFileSync(new URL('../src/features/control/useBrainstemControl.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function mount(initial = {}) {
  const slots = [], effects = [], timers = new Set(), lifecycle = new Set(), calls = [], persisted = [];
  let cursor = 0, at = 0, value;
  let props = { ownerKey: 'owner-a', ready: true, autoConnectEndpoint: endpoint,
    onConnected: target => persisted.push(target), ...initial };
  const changed = (before, after) => !before || before.length !== after.length || before.some((x, i) => !Object.is(x, after[i]));
  const react = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useMemo(fn, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) effects.push(() => {
      slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn(), fn };
    }); },
  };
  const app = { currentState: 'active', addEventListener(_name, callback) { lifecycle.add(callback); return { remove: () => lifecycle.delete(callback) }; } };
  const reply = () => ({ transport: 'grpc-lan', principalVerified: false, leaseOwnerMatched: false, leaseActive: false,
    status: { fsmKind: 'grounded', transition: 'none', motorOutputEnabled: false,
      owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false } });
  const transport = {
    async open(target) { calls.push(['open', target.host]); return { ...reply(), sessionId: `s${calls.length}`, mutualTlsVerified: false, clientIdentitySelected: false,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }; },
    async read() { calls.push(['read']); return reply(); },
    async interrupt() { calls.push(['interrupt']); return reply(); }, async close() { calls.push(['close']); },
    async action() { throw Error('unexpected action'); }, async acquire() { throw Error('unexpected acquire'); }, async input() { throw Error('unexpected input'); },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, performance: { now: () => at },
    setInterval(callback) { timers.add(callback); return callback; }, clearInterval(callback) { timers.delete(callback); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { AppState: app };
      if (name === '../../services/brainstemControl') return { brainstemControlTransport: transport };
      if (name === './brainstemControlSession') return { BrainstemControlSession };
      if (name === './brainstemConnectionRecovery') return { BrainstemConnectionRecovery };
      if (name === './useControllerWifiSignal') return { useControllerWifiSignal: () => undefined };
      throw Error(name);
    },
  });
  function render() { cursor = 0; value = module.exports.useBrainstemControl(props); while (effects.length) effects.shift()(); return value; }
  render();
  return { calls, persisted, transport, reply, get value() { return value; }, render,
    async advance(ms = 0) { at += ms; for (const callback of timers) callback(); await tick(); render(); },
    async lifecycle(state) { app.currentState = state; for (const callback of lifecycle) callback(state); await tick(); render(); },
    update(patch) { props = { ...props, ...patch }; render(); },
    replayEffects() { for (const slot of slots) if (slot?.fn) slot.cleanup?.();
      for (const slot of slots) if (slot?.fn) slot.cleanup = slot.fn(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('hook automatically restores persisted endpoint, returns from background, and retires old owner', async () => {
  const h = mount(); await h.advance(); assert.equal(h.value.state.connected, true);
  assert.deepEqual(h.calls.filter(call => call[0] === 'open'), [['open', endpoint.host]]);
  await h.lifecycle('background'); await h.advance(100000); assert.equal(h.value.state.connected, false);
  await h.lifecycle('active'); await h.advance(); assert.equal(h.value.state.connected, true);
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 2);
  assert.equal(h.value.state.leaseActive, false); assert.equal(h.value.manualPrepared, false);
  h.update({ ownerKey: null, ready: false }); await h.advance(100000);
  assert.equal(h.value.state.connected, false); assert.equal(h.calls.filter(call => call[0] === 'open').length, 2); h.unmount();
});

test('hook intentional disconnect stays disconnected across foreground and unchanged persistence props', async () => {
  const h = mount(); await h.advance(); await h.value.disconnect(); h.render();
  h.update({ autoConnectEndpoint: { ...endpoint } }); await h.lifecycle('background'); await h.lifecycle('active'); await h.advance(100000);
  assert.equal(h.value.state.connected, false); assert.equal(h.calls.filter(call => call[0] === 'open').length, 1); h.unmount();
});

test('hook preserves navigation suspension and reopens only after readiness returns', async () => {
  const h = mount(); await h.advance(); await h.value.suspend();
  h.update({ ready: false }); await h.advance(100000); assert.equal(h.value.state.connected, false);
  h.update({ ready: true }); await h.advance(); assert.equal(h.value.state.connected, true);
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 2); h.unmount();
});

test('React development effect replay does not suppress saved-target connection', async () => {
  const h = mount(); h.replayEffects(); await h.advance(); await h.advance(500);
  assert.equal(h.value.state.connected, true); assert.equal(h.calls.filter(call => call[0] === 'open').length, 2);
  assert.equal(h.persisted.length, 1); assert.ok(h.calls.some(call => call[0] === 'close')); h.unmount();
});

test('navigation readiness never discards an unconfirmed-stop latch', async t => {
  t.mock.method(console, 'info', () => {});
  const h = mount(); await h.advance();
  h.transport.action = async () => h.reply(); await h.value.action('enable');
  h.transport.read = async () => { throw { code: 'timeout' }; };
  h.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  await h.advance(500); assert.equal(h.value.state.failureCode, 'stop_unconfirmed');
  h.update({ ready: false }); await h.advance(100000);
  h.update({ ready: true }); await h.advance(100000);
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 1);
  assert.equal(h.value.state.failureCode, 'stop_unconfirmed');
  assert.match(h.value.state.error, /停止请求未确认/); h.unmount();
});

test('foreground on IP selection page cannot reconnect old target but permits explicit replacement', async () => {
  const h = mount(); await h.advance();
  h.update({ autoReconnectEnabled: false, autoConnectEndpoint: null }); await h.advance();
  await h.lifecycle('background'); await h.lifecycle('active'); await h.advance(100000);
  assert.equal(h.value.state.connected, false); assert.equal(h.calls.filter(call => call[0] === 'open').length, 1);
  const replacement = { ...endpoint, host: '192.0.2.2' };
  assert.equal(await h.value.connect(replacement, ''), true);
  h.update({ autoReconnectEnabled: true, autoConnectEndpoint: replacement }); await h.advance();
  assert.equal(h.value.state.connected, true);
  assert.deepEqual(h.calls.filter(call => call[0] === 'open'), [['open', endpoint.host], ['open', replacement.host]]); h.unmount();
});

test('selection navigation and suspend cannot turn an authorization failure into a retry', async t => {
  t.mock.method(console, 'info', () => {});
  for (const suspendFirst of [false, true]) {
    const h = mount(); await h.advance();
    h.transport.read = async () => { throw { code: 'unauthorized' }; };
    await h.advance(500);
    if (suspendFirst) await h.value.suspend();
    h.update({ autoReconnectEnabled: false, autoConnectEndpoint: null }); await h.advance();
    h.update({ autoReconnectEnabled: true, autoConnectEndpoint: endpoint }); await h.advance(100000);
    assert.equal(h.calls.filter(call => call[0] === 'open').length, 1); h.unmount();
  }
});

test('native retirement before JS background cannot invent an unknown stop on a read-only connection', async t => {
  t.mock.method(console, 'info', () => {});
  for (const code of ['background', 'cancelled']) {
    const h = mount(); await h.advance(); const read = h.transport.read;
    h.transport.interrupt = async () => { throw { code }; };
    h.transport.read = async () => { throw { code }; };
    await h.advance(500);
    assert.equal(h.value.state.failureCode, 'unavailable'); assert.doesNotMatch(h.value.state.error, /停止请求未确认/);
    await h.lifecycle('background'); h.transport.read = read;
    await h.lifecycle('active'); await h.advance(500);
    assert.equal(h.value.state.connected, true); assert.equal(h.value.state.leaseActive, false);
    assert.equal(h.calls.filter(call => call[0] === 'open').length, 2); h.unmount();
  }
});

test('native already-closed read-only channel needs no duplicate interrupt before foreground restore', async () => {
  const h = mount(); await h.advance(); let attempts = 0;
  h.transport.interrupt = async () => { attempts++; throw { code: 'cancelled' }; };
  await h.lifecycle('background'); assert.equal(attempts, 0); assert.equal(h.value.state.error, null);
  await h.lifecycle('active'); await h.advance(500);
  assert.equal(h.value.state.connected, true); assert.equal(h.value.state.leaseActive, false); h.unmount();
});

test('background cancellation during an already-dispatched action still latches unknown stop', async t => {
  t.mock.method(console, 'info', () => {});
  const h = mount(); await h.advance(); let rejectAction;
  h.transport.action = () => new Promise((_resolve, reject) => { rejectAction = reject; });
  const action = h.value.action('enable').catch(() => undefined); await tick();
  h.transport.interrupt = async () => { throw { code: 'background' }; };
  await h.lifecycle('background'); assert.equal(h.value.state.failureCode, 'stop_unconfirmed');
  rejectAction({ code: 'cancelled' }); await action;
  await h.lifecycle('active'); await h.advance(100000);
  assert.equal(h.value.state.failureCode, 'stop_unconfirmed'); assert.equal(h.calls.filter(call => call[0] === 'open').length, 1);
  h.unmount();
});

test('confirmed rejected action retires authority before native background teardown', async t => {
  t.mock.method(console, 'info', () => {});
  const h = mount(); await h.advance();
  h.transport.action = async () => { throw { code: 'precondition' }; };
  await assert.rejects(h.value.action('enable'), error => error.code === 'precondition'); h.render();
  assert.equal(h.value.state.connected, true);
  h.transport.interrupt = async () => { throw { code: 'cancelled' }; };
  await h.lifecycle('background'); assert.equal(h.value.state.error, null);
  await h.lifecycle('active'); await h.advance(500);
  assert.equal(h.value.state.connected, true); assert.equal(h.value.state.leaseActive, false);
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 2); h.unmount();
});
