import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/features/robot-lifecycle/bleConnectionSession.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { createBleConnectionSession } = await import(`data:text/javascript;base64,${Buffer.from(code + '\n//# sourceURL=bleConnectionSession-fixture.js').toString('base64')}`);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture() {
  const calls = [], listeners = new Set();
  const runtime = {
    async prepare() { calls.push('prepare'); },
    async connect(id) { calls.push(['connect', id]); },
    async retrieveServices(id) { calls.push(['discover', id]); return { id, services: [{ uuid: 'fixture-service' }], characteristics: [{ service: 'fixture-service', characteristic: 'fixture-characteristic' }] }; },
    async disconnect(id) { calls.push(['disconnect', id]); },
    onDisconnect(callback) { listeners.add(callback); return { remove() { listeners.delete(callback); } }; },
  };
  return { calls, listeners, runtime };
}
test('explicit connection discovers actual services without claiming robot identity, binding or Wi-Fi configuration', async () => {
  const f = fixture(), updates = [];
  const adapter = createBleConnectionSession(f.runtime);
  const result = await adapter.connect('fixture-robot', state => updates.push(state));
  assert.equal(result.phase, 'connected');
  assert.equal(result.serviceCount, 1);
  assert.equal(result.characteristicCount, 1);
  assert.equal(result.identityVerified, false);
  assert.equal(result.bound, false);
  assert.equal(result.wifiConfigured, false);
  assert.deepEqual(f.calls, ['prepare', ['connect', 'fixture-robot'], ['discover', 'fixture-robot']]);
  await adapter.disconnect();
  assert.deepEqual(f.calls.at(-1), ['disconnect', 'fixture-robot']);
  assert.equal(f.listeners.size, 0);
  assert.equal(updates.at(-1).phase, 'disconnected');
});

test('cancelling an in-flight native connection rejects it and releases a late connect without discovering services', async () => {
  const f = fixture(), native = deferred(), states = [];
  f.runtime.connect = id => { f.calls.push(['connect', id]); return native.promise; };
  const adapter = createBleConnectionSession(f.runtime);
  const outcome = adapter.connect('fixture-robot', state => states.push(state)).then(value => ({ value }), error => ({ error }));
  await settle();
  await adapter.disconnect();
  native.resolve();
  await settle();
  assert.equal((await outcome).error?.code, 'cancelled');
  assert.ok(!f.calls.some(call => Array.isArray(call) && call[0] === 'discover'));
  assert.equal(f.listeners.size, 0);
  assert.equal(states.at(-1).phase, 'disconnected');
  assert.equal(states.at(-1).cleanupConfirmed, true);
});

function manualClock() {
  let next = 0;
  const timers = new Map();
  return { timers, setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, fire(ms) { const row = [...timers].find(([, row]) => row.ms === ms); assert.ok(row); timers.delete(row[0]); row[1].fn(); } };
}
test('timeout covers a native connect that never settles and blocks a new connection until late cleanup completes', async () => {
  const f = fixture(), native = deferred(), states = [], clock = manualClock();
  f.runtime.connect = () => native.promise;
  const adapter = createBleConnectionSession(f.runtime, { clock, timeoutMs: 100, cleanupTimeoutMs: 40 });
  const outcome = adapter.connect('fixture-robot', s => states.push(s)).catch(error => error);
  await settle(); clock.fire(100); await settle();
  assert.equal((await outcome).code, 'timeout');
  assert.equal(states.at(-1).cleanupConfirmed, false);
  await assert.rejects(adapter.connect('fixture-other', () => {}), { code: 'busy' });
  native.resolve(); await settle();
  assert.equal(states.at(-1).cleanupConfirmed, true);
  assert.equal(f.calls.filter(row => Array.isArray(row) && row[0] === 'disconnect').length, 2);
  assert.equal(clock.timers.size, 0);
});
test('cancelling during permission preparation cannot start a late native connection', async () => {
  const f = fixture(), preparation = deferred();
  f.runtime.prepare = () => preparation.promise;
  const adapter = createBleConnectionSession(f.runtime);
  const outcome = adapter.connect('fixture-robot', () => {}).catch(error => error);
  await adapter.disconnect(); preparation.resolve(); await settle();
  assert.equal((await outcome).code, 'cancelled');
  assert.deepEqual(f.calls, []);
});
test('remote disconnect removes the listener and never reacts to a different peripheral', async () => {
  const f = fixture(), states = [];
  const adapter = createBleConnectionSession(f.runtime);
  await adapter.connect('fixture-robot', s => states.push(s));
  for (const listener of f.listeners) listener({ id: 'another-peripheral', confirmed: true });
  assert.equal(states.at(-1).phase, 'connected');
  for (const listener of [...f.listeners]) listener({ id: 'fixture-robot', confirmed: true });
  assert.equal(states.at(-1).phase, 'disconnected');
  assert.equal(states.at(-1).cleanupConfirmed, true);
  assert.equal(f.listeners.size, 0);
});
test('failed disconnect stays quarantined and raw native errors never enter state or the public error', async () => {
  const f = fixture(), states = [];
  f.runtime.disconnect = async () => { throw new Error('PRIVATE_NATIVE_CANARY'); };
  const adapter = createBleConnectionSession(f.runtime);
  await adapter.connect('fixture-robot', s => states.push(s));
  await adapter.disconnect();
  assert.equal(states.at(-1).phase, 'error');
  assert.equal(states.at(-1).cleanupConfirmed, false);
  assert.ok(!JSON.stringify(states).includes('PRIVATE_NATIVE_CANARY'));
  await assert.rejects(adapter.connect('fixture-other', () => {}), { code: 'busy' });
});
test('a returning screen can inspect an unconfirmed cleanup instead of showing a fresh idle connection', async () => {
  const f = fixture();
  f.runtime.disconnect = async () => { throw new Error('fixture disconnect failure'); };
  const adapter = createBleConnectionSession(f.runtime);
  await adapter.connect('fixture-robot', () => {});
  await adapter.disconnect();
  assert.equal(adapter.getSnapshot().phase, 'error');
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
});
test('discovery failure disconnects and does not claim a connected or identified robot', async () => {
  for (const info of [{ id: 'wrong-target' }, { id: 'fixture-robot', services: 'malformed' }]) {
    const f = fixture(), states = [];
    f.runtime.retrieveServices = async () => info;
    const adapter = createBleConnectionSession(f.runtime);
    await assert.rejects(adapter.connect('fixture-robot', s => states.push(s)), { code: 'discovery_failed' });
    await settle();
    assert.equal(states.at(-1).phase, 'error');
    assert.equal(states.at(-1).cleanupConfirmed, true);
    assert.ok(states.every(s => !s.identityVerified && !s.bound && !s.wifiConfigured));
    assert.equal(f.listeners.size, 0);
  }
});
test('a stalled service discovery is cancelled by the same deadline and its late result cannot resurrect connection state', async () => {
  const f = fixture(), discovery = deferred(), clock = manualClock(), states = [];
  f.runtime.retrieveServices = () => discovery.promise;
  const adapter = createBleConnectionSession(f.runtime, { clock, timeoutMs: 100 });
  const outcome = adapter.connect('fixture-robot', s => states.push(s)).catch(error => error);
  await settle(); clock.fire(100); await settle();
  assert.equal((await outcome).code, 'timeout');
  assert.equal(states.at(-1).cleanupConfirmed, true);
  discovery.resolve({ id: 'fixture-robot', services: [] }); await settle();
  assert.ok(!states.some(state => state.phase === 'connected'));
  assert.equal(f.listeners.size, 0);
});
test('a native disconnect that never settles is bounded and remains explicitly unconfirmed', async () => {
  const f = fixture(), clock = manualClock(), never = deferred();
  f.runtime.disconnect = () => never.promise;
  const adapter = createBleConnectionSession(f.runtime, { clock, cleanupTimeoutMs: 40 });
  await adapter.connect('fixture-robot', () => {});
  const stopping = adapter.disconnect(); await settle(); clock.fire(40); await stopping;
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  await assert.rejects(adapter.connect('another-peripheral', () => {}), { code: 'busy' });
});
test('native connection failure returns only a closed error and releases listener and timer ownership', async () => {
  const f = fixture(), clock = manualClock();
  f.runtime.connect = async () => { throw new Error('PRIVATE_NATIVE_CONNECT_CANARY'); };
  const adapter = createBleConnectionSession(f.runtime, { clock });
  await assert.rejects(adapter.connect('fixture-robot', () => {}), { code: 'connect_failed', message: 'connect_failed' });
  await settle();
  assert.equal(f.listeners.size, 0);
  assert.equal(clock.timers.size, 0);
  assert.equal(adapter.getSnapshot().cleanupConfirmed, true);
});
test('a returning observer sees late cleanup complete and can unsubscribe without retaining old screen callbacks', async () => {
  const f = fixture(), native = deferred(), clock = manualClock(), updates = [];
  f.runtime.connect = () => native.promise;
  const adapter = createBleConnectionSession(f.runtime, { clock, timeoutMs: 100 });
  const outcome = adapter.connect('fixture-robot', () => {}).catch(error => error);
  await settle(); clock.fire(100); await settle(); await outcome;
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  const unsubscribe = adapter.subscribe(state => updates.push(state));
  native.resolve(); await settle();
  assert.equal(updates.at(-1).cleanupConfirmed, true);
  unsubscribe();
  const count = updates.length;
  await adapter.connect('fixture-other', () => {}); await adapter.disconnect();
  assert.equal(updates.length, count);
});
