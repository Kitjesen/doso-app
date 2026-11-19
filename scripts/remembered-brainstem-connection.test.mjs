import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as modes from '../src/features/control/robotModeCapabilities.ts';

const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(path, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(compile(path), { module, exports: module.exports, URL,
    require: name => { if (name in dependencies) return dependencies[name]; throw Error('Unexpected dependency ' + name); } });
  return module.exports;
}
const grpc = load('../src/services/brainstemGrpc.ts', {
  expo: { requireOptionalNativeModule: () => null },
  'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active' } },
  '../features/control/robotModeCapabilities': modes,
});
const core = load('../src/features/control/rememberedBrainstemConnection.ts', { '../../services/brainstemGrpc': grpc });
const lan = { endpoint: { host: '192.168.66.64', port: 13145, transport: 'lan-dev' }, principal: '' };
const tls = { endpoint: { host: 'robot.example.test', port: 13145, transport: 'tls', clientIdentityAlias: 'doso-client' }, principal: 'doso-g20@robot' };

test('strict preference schema accepts validated explicit targets and no authority or tokens', () => {
  assert.deepEqual(plain(core.normalizeRememberedBrainstemConnection(lan)), lan);
  assert.deepEqual(plain(core.normalizeRememberedBrainstemConnection(tls)), tls);
  for (const value of [null, [], { ...lan, lease: 'token' }, { ...tls, principal: '' },
    { ...lan, principal: tls.principal }, { ...lan, endpoint: { ...lan.endpoint, transport: undefined } },
    { ...lan, endpoint: { ...lan.endpoint, host: '8.8.8.8' } },
    { ...lan, endpoint: { ...lan.endpoint, port: '13145' } },
    { ...lan, endpoint: { ...lan.endpoint, clientIdentityAlias: 'alias' } },
    { ...tls, endpoint: { ...tls.endpoint, clientIdentityAlias: 'a\n' } },
    { ...tls, endpoint: { ...tls.endpoint, clientIdentityAlias: 'x'.repeat(513) } },
    { ...tls, principal: 'x'.repeat(129) + '@robot' }]) {
    assert.equal(core.normalizeRememberedBrainstemConnection(value), null);
  }
});

function storeFixture(overrides = {}) {
  const values = new Map(), calls = [];
  const storage = {
    async getItem(key) { calls.push(['get', key]); return values.get(key) ?? null; },
    async setItem(key, value) { calls.push(['set', key]); values.set(key, value); },
    async removeItem(key) { calls.push(['remove', key]); values.delete(key); },
    ...overrides,
  };
  return { values, calls, store: core.createRememberedBrainstemConnectionStore(storage) };
}
test('owner scopes remain isolated across QA and accounts, including separator collisions', async () => {
  const f = storeFixture();
  await f.store.save('qa-local-device-test', lan);
  await f.store.save('account:a-b', tls);
  assert.deepEqual(plain(await f.store.load('qa-local-device-test')), lan);
  assert.deepEqual(plain(await f.store.load('account:a-b')), tls);
  assert.equal(await f.store.load('account:a_b'), null);
  assert.equal(await f.store.load('account:other'), null);
  await f.store.forget('qa-local-device-test');
  assert.equal(await f.store.load('qa-local-device-test'), null);
  assert.deepEqual(plain(await f.store.load('account:a-b')), tls);
  for (const key of f.values.keys()) assert.match(key, /^[a-zA-Z0-9._-]+$/);
  const stored = [...f.values.values()][0];
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['endpoint', 'principal', 'version']);
});
test('slow old writes cannot overwrite a newer save or resurrect a forgotten endpoint', async () => {
  const gate = deferred(), values = new Map(), calls = [];
  const f = storeFixture({
    async setItem(key, value) { calls.push('set'); if (calls.length === 1) await gate.promise; values.set(key, value); },
    async getItem(key) { calls.push('get'); return values.get(key) ?? null; },
    async removeItem(key) { calls.push('remove'); values.delete(key); },
  });
  const first = f.store.save('account:a', lan);
  const second = f.store.save('account:a', tls);
  const forget = f.store.forget('account:a');
  const loaded = f.store.load('account:a');
  await settle(); assert.deepEqual(calls, ['set']);
  gate.resolve(); await Promise.all([first, second, forget]);
  assert.equal(await loaded, null);
  assert.deepEqual(calls, ['set', 'set', 'remove', 'get']);
});
test('invalid or unreadable persisted data never becomes an automatic target', async () => {
  for (const text of ['bad json', JSON.stringify({ version: 2, ...lan }),
    JSON.stringify({ version: 1, ...lan, token: 'unexpected' }), 'x'.repeat(2049)]) {
    const f = storeFixture({ async getItem() { return text; } });
    assert.equal(await f.store.load('account:a'), null);
  }
  const f = storeFixture({ async getItem() { throw Error('unavailable'); } });
  assert.equal(await f.store.load('account:a'), null);
  assert.equal(await f.store.load(''), null);
  await assert.rejects(f.store.save('', lan));
  await assert.rejects(f.store.forget('x'.repeat(161)));
});
test('a rejected storage write does not poison subsequent writes', async () => {
  let writes = 0;
  const f = storeFixture({ async setItem() { if (++writes === 1) throw Error('full'); } });
  await assert.rejects(f.store.save('account:a', lan));
  await f.store.save('account:a', tls);
  assert.equal(writes, 2);
});

function mount(store, { ownerKey = 'account:a', ready = true } = {}) {
  const slots = [], effects = [];
  let cursor = 0, value, unmounted = false, lateUpdates = 0;
  const changed = (a, b) => !a || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const react = {
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { if (unmounted) lateUpdates++; else slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useMemo(run, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: run() }; return slots[i].value; },
    useEffect(run, deps) { const i = cursor++; const old = slots[i]; if (!old || changed(old.deps, deps)) {
      effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: run() }; });
    } },
  };
  const hook = load('../src/features/control/useRememberedBrainstemConnection.ts', {
    react, './rememberedBrainstemConnection': { ...core, rememberedBrainstemConnectionStore: store },
  }).useRememberedBrainstemConnection;
  function render(next = {}) {
    if ('ownerKey' in next) ownerKey = next.ownerKey;
    if ('ready' in next) ready = next.ready;
    cursor = 0; value = hook(ownerKey, ready); while (effects.length) effects.shift()(); return value;
  }
  render();
  return { render, get value() { return value; }, get lateUpdates() { return lateUpdates; },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); } };
}
test('hook restores only ready owner and preserves stable connection/callback identities', async () => {
  const f = storeFixture(); await f.store.save('account:a', lan);
  const h = mount(f.store, { ready: false });
  assert.equal(h.value.loaded, false); assert.equal(h.value.connection, null);
  h.render({ ready: true }); await settle(); h.render();
  assert.equal(h.value.loaded, true); assert.deepEqual(plain(h.value.connection), lan);
  const previous = h.value; h.render();
  assert.equal(h.value.connection, previous.connection); assert.equal(h.value.remember, previous.remember);
  h.render({ ready: false }); assert.equal(h.value.connection, null); assert.equal(h.value.loaded, false);
  h.render({ ready: true }); await settle(); h.render();
  assert.deepEqual(plain(h.value.connection), lan);
});
test('manual success or forget defeats a delayed initial read and survives reopen', async () => {
  for (const operation of ['remember', 'forget']) {
    const gate = deferred(), f = storeFixture();
    const h = mount({ ...f.store, load: () => gate.promise });
    if (operation === 'remember') h.value.remember(lan.endpoint, lan.principal); else h.value.forget();
    h.render(); assert.equal(h.value.loaded, true);
    gate.resolve(tls); await settle(); h.render();
    assert.deepEqual(plain(h.value.connection), operation === 'remember' ? lan : null);
    const reopened = mount(f.store); await settle(); reopened.render();
    assert.deepEqual(plain(reopened.value.connection), operation === 'remember' ? lan : null);
  }
});
test('old A callbacks and delayed A-B-A loads cannot modify a replacement owner', async () => {
  const loads = [], calls = [];
  const store = { load(owner) { const gate = deferred(); loads.push({ owner, ...gate }); return gate.promise; },
    async save(...args) { calls.push(args); }, async forget(...args) { calls.push(args); } };
  const h = mount(store), old = h.value;
  h.render({ ownerKey: 'account:b' }); h.render({ ownerKey: 'account:a' });
  old.remember(lan.endpoint, ''); old.forget();
  loads[0].resolve(lan); loads[1].resolve(tls); await settle(); h.render();
  assert.equal(h.value.loaded, false); assert.equal(h.value.connection, null); assert.equal(calls.length, 0);
  loads[2].resolve(tls); await settle(); h.render();
  assert.deepEqual(plain(h.value.connection), tls);
});
test('storage failures and unmounted loads never break callbacks or publish late state', async () => {
  const failing = { async load() { throw Error('locked'); }, async save() { throw Error('full'); }, async forget() { throw Error('full'); } };
  const h = mount(failing); await settle(); h.render();
  assert.equal(h.value.loaded, true); assert.equal(h.value.connection, null);
  assert.equal(h.value.error, null);
  assert.doesNotThrow(() => h.value.remember(lan.endpoint, '')); await settle(); h.render();
  assert.deepEqual(plain(h.value.connection), lan);
  assert.equal(h.value.error, '连接信息未能保存，重新打开 App 后可能需要手动连接。');
  h.value.forget(); h.render(); assert.equal(h.value.error, null, 'the next mutation retires the previous failure');
  await settle(); h.render();
  assert.equal(h.value.connection, null);
  assert.equal(h.value.error, '未能清除自动连接记录，重新打开 App 后仍可能尝试连接，请重试。');
  const gate = deferred(), pending = mount({ ...failing, load: () => gate.promise });
  pending.unmount(); gate.resolve(lan); await settle(); assert.equal(pending.lateUpdates, 0);
});

test('late failed save or forget cannot report an error against a newer target or owner', async () => {
  for (const operation of ['save', 'forget']) for (const replacement of ['target', 'owner', 'unmount']) {
    const gate = deferred();
    const store = { async load() { return null; }, async save() {}, async forget() {}, [operation]: () => gate.promise };
    const h = mount(store); await settle(); h.render();
    if (operation === 'save') h.value.remember(lan.endpoint, ''); else h.value.forget();
    h.render();
    if (replacement === 'target') {
      if (operation === 'save') h.value.forget(); else h.value.remember(tls.endpoint, tls.principal);
      h.render();
    } else if (replacement === 'owner') h.render({ ownerKey: 'account:b' });
    else h.unmount();
    gate.reject(Error('private storage error')); await settle();
    if (replacement !== 'unmount') { h.render(); assert.equal(h.value.error, null); }
    assert.equal(h.lateUpdates, 0);
  }
});
test('legacy implicit TLS becomes an explicit stored TLS transport and malformed targets are ignored', async () => {
  const f = storeFixture(), h = mount(f.store); await settle(); h.render();
  const endpoint = { ...tls.endpoint }; delete endpoint.transport;
  h.value.remember(endpoint, tls.principal); await settle(); h.render();
  assert.deepEqual(plain(h.value.connection), tls);
  h.value.remember({ ...lan.endpoint, host: '8.8.8.8' }, ''); await settle(); h.render();
  assert.deepEqual(plain(h.value.connection), tls);
});
