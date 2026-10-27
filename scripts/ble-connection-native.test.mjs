import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const read = name => readFileSync(new URL('../src/features/robot-lifecycle/' + name, import.meta.url), 'utf8');
const transpile = (source, module = ts.ModuleKind.ESNext) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sessionUrl = url(transpile(read('bleConnectionSession.ts')) + '\n//# sourceURL=bleConnectionSession-native-fixture.js');
const session = await import(sessionUrl);
const native = await import(url(transpile(read('bleConnectionNative.ts')).replace("from './bleConnectionSession'", `from '${sessionUrl}'`) + '\n//# sourceURL=bleConnectionNative-fixture.js'));
function manager() {
  const calls = [], listeners = new Set();
  const emit = event => { for (const fn of [...listeners]) fn(event); };
  return { calls, listeners, emit, api: {
    async isStarted() { return true; }, async checkState() { return 'on'; },
    async connect(...args) { calls.push(['connect', ...args]); },
    async retrieveServices(id) { calls.push(['discover', id]); return { id, services: [{ uuid: 'fixture-only' }], characteristics: [] }; },
    async disconnect(...args) { calls.push(['disconnect', ...args]); emit({ peripheral: args[0], status: 0 }); },
    onDisconnectPeripheral(fn) { listeners.add(fn); return { remove() { listeners.delete(fn); } }; },
  } };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function manualClock() {
  let next = 0;
  const timers = new Map();
  return { timers, setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, fire(ms) { const row = [...timers].find(([, row]) => row.ms === ms); assert.ok(row); timers.delete(row[0]); row[1].fn(); } };
}
test('a resolved native disconnect acknowledgement without an event stays quarantined after the cleanup deadline', async () => {
  const f = manager(), clock = manualClock();
  f.api.disconnect = async (...args) => { f.calls.push(['disconnect', ...args]); };
  const adapter = native.createBleNativeConnectionAdapter(f.api, undefined, { clock, cleanupTimeoutMs: 40 });
  await adapter.connect('fixture-peripheral', () => {});
  const stopping = adapter.disconnect(); await settle();
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  clock.fire(40); await stopping;
  assert.equal(adapter.getSnapshot().errorCode, 'cleanup_unconfirmed');
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  assert.equal(f.listeners.size, 0);
  assert.equal(clock.timers.size, 0);
  f.emit({ peripheral: 'fixture-peripheral', status: 0 });
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  await assert.rejects(adapter.connect('another-peripheral', () => {}), { code: 'busy' });
});
test('Android disconnect failure status cannot turn a successful request acknowledgement into cleanup evidence', async () => {
  const f = manager();
  f.api.disconnect = async id => { f.emit({ peripheral: id, status: 257, description: 'PRIVATE_NATIVE_CANARY' }); };
  const adapter = native.createBleNativeConnectionAdapter(f.api);
  await adapter.connect('fixture-peripheral', () => {});
  await adapter.disconnect();
  assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
  assert.equal(adapter.getSnapshot().errorCode, 'cleanup_unconfirmed');
  assert.equal(f.listeners.size, 0);
  assert.ok(!JSON.stringify(adapter.getSnapshot()).includes('PRIVATE_NATIVE_CANARY'));
  await assert.rejects(adapter.connect('another-peripheral', () => {}), { code: 'busy' });
});
test('autonomous failure events cannot release the connection lease or be relabelled as successful disconnects', async () => {
  for (const failure of [{ status: 257 }, { domain: 'fixture-error-domain', code: 6 }]) {
    const f = manager(), adapter = native.createBleNativeConnectionAdapter(f.api);
    await adapter.connect('fixture-peripheral', () => {});
    f.emit({ peripheral: 'fixture-peripheral', ...failure, description: 'PRIVATE_NATIVE_CANARY' });
    assert.equal(adapter.getSnapshot().phase, 'error');
    assert.equal(adapter.getSnapshot().errorCode, 'cleanup_unconfirmed');
    assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
    assert.equal(f.listeners.size, 0);
    assert.ok(!JSON.stringify(adapter.getSnapshot()).includes('PRIVATE_NATIVE_CANARY'));
    await assert.rejects(adapter.connect('another-peripheral', () => {}), { code: 'busy' });
  }
});
test('only a matching successful Android or error-free iOS event releases an acknowledged disconnect', async () => {
  for (const success of [{ status: 0 }, {}]) {
    const f = manager(), clock = manualClock(), normalDisconnect = f.api.disconnect;
    f.api.disconnect = async () => {};
    const adapter = native.createBleNativeConnectionAdapter(f.api, undefined, { clock, cleanupTimeoutMs: 40 });
    await adapter.connect('fixture-peripheral', () => {});
    let completed = false;
    const stopping = adapter.disconnect().then(() => { completed = true; });
    await settle();
    assert.equal(completed, false);
    f.emit({ peripheral: 'another-peripheral', ...success }); await settle();
    assert.equal(completed, false);
    assert.equal(adapter.getSnapshot().cleanupConfirmed, false);
    f.emit({ peripheral: 'fixture-peripheral', ...success }); await stopping;
    assert.equal(adapter.getSnapshot().phase, 'disconnected');
    assert.equal(adapter.getSnapshot().cleanupConfirmed, true);
    assert.equal(f.listeners.size, 0);
    assert.equal(clock.timers.size, 0);
    f.api.disconnect = normalDisconnect;
    await adapter.connect('another-peripheral', () => {}); await adapter.disconnect();
  }
});
test('the native adapter invokes installed API connect with autoconnect off, retrieves services and waits for non-forced disconnect evidence', async () => {
  const f = manager();
  const adapter = native.createBleNativeConnectionAdapter(f.api);
  const state = await adapter.connect('fixture-peripheral', () => {});
  assert.equal(state.serviceCount, 1);
  await adapter.disconnect();
  assert.deepEqual(f.calls, [['connect', 'fixture-peripheral', { autoconnect: false }], ['discover', 'fixture-peripheral'], ['disconnect', 'fixture-peripheral', false]]);
  assert.equal(f.listeners.size, 0);
});
test('native readiness failure never connects or starts a second manager', async () => {
  for (const change of [{ isStarted: async () => false }, { checkState: async () => 'off' }]) {
    const f = manager(); Object.assign(f.api, change);
    const adapter = native.createBleNativeConnectionAdapter(f.api);
    await assert.rejects(adapter.connect('fixture-peripheral', () => {}), { code: 'preparation_failed' });
    assert.deepEqual(f.calls, []);
  }
});
function android(manager, granted) {
  const module = { exports: {} }, permissions = [];
  const host = { Platform: { Version: 33 }, PermissionsAndroid: {
    PERMISSIONS: { BLUETOOTH_CONNECT: 'CONNECT' }, RESULTS: { GRANTED: 'granted' },
    async check(p) { permissions.push(['check', p]); return false; },
    async request(p) { permissions.push(['request', p]); return granted ? 'granted' : 'denied'; },
  } };
  vm.runInNewContext(transpile(read('bleConnectionAdapter.android.ts'), ts.ModuleKind.CommonJS), {
    module, exports: module.exports, require(name) {
      if (name === 'react-native') return host;
      if (name === 'react-native-ble-manager') return { __esModule: true, default: manager };
      if (name === './bleConnectionNative') return native;
      if (name === './bleConnectionSession') return session;
      throw new Error('unexpected_fixture_dependency');
    },
  });
  return { adapter: module.exports.bleConnectionAdapter, permissions };
}
test('Android connection uses CONNECT permission only and denial stops before native connection', async () => {
  for (const granted of [false, true]) {
    const f = manager(), loaded = android(f.api, granted);
    if (granted) { await loaded.adapter.connect('fixture-peripheral', () => {}); await loaded.adapter.disconnect(); }
    else await assert.rejects(loaded.adapter.connect('fixture-peripheral', () => {}), { code: 'preparation_failed' });
    assert.deepEqual(loaded.permissions, [['check', 'CONNECT'], ['request', 'CONNECT']]);
    if (!granted) assert.deepEqual(f.calls, []);
  }
});
