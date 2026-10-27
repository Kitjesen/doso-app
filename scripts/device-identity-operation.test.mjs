// Production repository/coordinator + installed public AuthClient. The storage,
// HTTP and device Data boundary are synthetic; no native/live-backend claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthClient } from '@supabase/supabase-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const ROOT = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111';
let sequence = 0;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function session(label, lifetime = 3600) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: USER, exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: USER, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const jsonResponse = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
async function fixture() {
  const modules = new Map(), values = new Map(), events = [], queries = [];
  const storageKey = `device-identity-${++sequence}`;
  const initial = session('initial'), expired = session('expired', -60), rotated = session('rotated');
  values.set(storageKey, JSON.stringify(initial));
  let auth, coordinator, storageHook, fetchHandler, getterReads = 0, lastAuthError;
  let dataResult = { data: [{ id: 'synthetic-device', owner_id: USER, is_demo: false }], error: null };
  const record = (action, phase) => { const state = coordinator.getAuthSessionOperationSnapshot(); const event = { action, phase, busy: state.busy, kind: state.kind }; events.push(event); return event; };
  const client = {
    auth: { async getUser() { const result = await auth.getUser(); lastAuthError = result.error; return result; }, getSession: () => auth.getSession() },
    from(table) {
      const query = [['from', table]]; queries.push(query);
      const chain = {};
      // Capture JSON-like Data arguments across the VM boundary without
      // comparing the production realm's Object.prototype to the host's.
      for (const method of ['select', 'eq', 'update', 'order', 'single']) chain[method] = (...args) => { query.push([method, ...structuredClone(args)]); return chain; };
      chain.then = (yes, no) => Promise.resolve(dataResult).then(yes, no);
      return chain;
    },
    functions: { invoke() { throw new Error('Binding is outside this fixture'); } },
  };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, URL, Response, fetch() { throw new Error('Identity-only fixture uses an external Data SDK stub'); }, require(name) {
      // Keep this older suite's controlled external Data SDK seam. Actual
      // PostgREST/HTTP and the new module are covered by device-data-query tests.
      if (name === '@supabase/postgrest-js') return { PostgrestClient: class { from(...args) { return client.from(...args); } } };
      if (name === './supabaseClient') return { supabaseConfig: { url: 'https://device-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' }, getSupabaseClient() { getterReads++; return client; } };
      if (name.startsWith('./')) return load(`src/services/${name.slice(2)}.ts`);
      throw new Error(`Unexpected device fixture dependency: ${name}`);
    } }, { filename: path }); return module.exports;
  };
  coordinator = load('src/services/authSessionOperation.ts');
  const repository = load('src/services/deviceRepository.ts');
  auth = new AuthClient({ url: 'https://device-fixture.supabase.co/auth/v1', headers: { apikey: 'sb_publishable_fixture', Authorization: 'Bearer sb_publishable_fixture' }, storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
    storage: {
      async getItem(key) { const event = record('get', 'auth-storage'); await storageHook?.(event); return values.get(key) ?? null; },
      async setItem(key, value) { const event = record('set', 'auth-storage'); await storageHook?.(event); values.set(key, value); },
      async removeItem(key) { const event = record('remove', 'auth-storage'); await storageHook?.(event); values.delete(key); },
    },
    fetch: createAuthRequestFetch(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.origin, 'https://device-fixture.supabase.co');
      const phase = url.pathname === '/auth/v1/token' ? 'refresh' : url.pathname === '/auth/v1/user' ? 'user' : 'unexpected';
      assert.notEqual(phase, 'unexpected');
      assert.equal(init.method, phase === 'refresh' ? 'POST' : 'GET');
      if (phase === 'refresh') assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      record('http', phase);
      return fetchHandler ? fetchHandler(phase) : jsonResponse(phase === 'refresh' ? rotated : initial.user);
    }, { timeoutMs: 5000 }),
  });
  assert.equal((await auth.initialize()).error, null);
  assert.equal(events.filter(event => event.action === 'http').length, 0);
  events.length = 0;
  return { coordinator, repository, events, queries, values, storageKey, rotated,
    get getterReads() { return getterReads; }, get dataResult() { return dataResult; },
    get lastAuthError() { return lastAuthError; },
    expire() { values.set(storageKey, JSON.stringify(expired)); }, clearSession() { values.delete(storageKey); },
    setDataResult(value) { dataResult = value; }, setStorageHook(value) { storageHook = value; }, setFetchHandler(value) { fetchHandler = value; },
    dispose: () => auth.dispose(),
  };
}

test('device list rejects busy before getter, Auth work and Data access', { timeout: 5000 }, async t => {
  const f = await fixture(), hold = deferred(), owner = {};
  f.expire();
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  try {
    const result = await f.repository.listDevices().then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'device-list-busy', outcome: result.status, getterReads: f.getterReads, dataQueries: f.queries.length, refreshRequests: f.events.filter(event => event.phase === 'refresh').length, authStorageWrites: f.events.filter(event => event.action === 'set').length, ownerStillBusy: f.coordinator.getAuthSessionOperationSnapshot().owner === owner }));
    assert.equal(result.status, 'rejected');
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(result.error), true);
    assert.equal(f.getterReads, 0); assert.deepEqual(f.queries, []); assert.deepEqual(f.events, []);
  } finally { hold.resolve(); await existing; await f.dispose(); }
});

test('device settings rejects busy before getter, Auth work and Data access', { timeout: 5000 }, async () => {
  const f = await fixture(), hold = deferred();
  f.expire();
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise);
  try {
    await assert.rejects(f.repository.updateDeviceSettings('synthetic-device', { alerts_enabled: false }), f.coordinator.isAuthSessionOperationBusyError);
    assert.equal(f.getterReads, 0); assert.deepEqual(f.events, []); assert.deepEqual(f.queries, []);
  } finally { hold.resolve(); await existing; await f.dispose(); }
});

const settings = { display_name: 'Desk robot', alerts_enabled: false };
const invoke = (f, operation) => operation === 'list' ? f.repository.listDevices() : f.repository.updateDeviceSettings('synthetic-device', settings);
const expectedQuery = operation => operation === 'list'
  ? [['from', 'devices'], ['select', '*'], ['eq', 'owner_id', USER], ['eq', 'is_demo', false], ['order', 'created_at', { ascending: true }]]
  : [['from', 'devices'], ['update', settings], ['eq', 'id', 'synthetic-device'], ['eq', 'owner_id', USER], ['select', '*'], ['single']];

for (const operation of ['list', 'settings']) {
  test(`${operation} owns actual refresh, delayed storage write and user GET until SDK settles`, { timeout: 5000 }, async t => {
    const f = await fixture(), writeEntered = deferred(), write = deferred(), userEntered = deferred(), user = deferred();
    f.expire();
    f.setStorageHook(event => { if (event.action === 'set') { writeEntered.resolve(); return write.promise; } });
    f.setFetchHandler(phase => { if (phase === 'refresh') return jsonResponse(f.rotated); userEntered.resolve(); return user.promise.then(() => jsonResponse({ id: USER, aud: 'authenticated' })); });
    const result = invoke(f, operation);
    try {
      await writeEntered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
      assert.deepEqual(f.queries, []);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      write.resolve(); await userEntered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      assert.deepEqual(f.queries, []);
      await assert.rejects(f.repository.listDevices(), f.coordinator.isAuthSessionOperationBusyError);
      user.resolve(); assert.equal(await result, f.dataResult.data);
      assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
      assert.equal(f.events.filter(event => event.action === 'set').length, 1);
      assert.ok(f.events.every(event => event.busy && event.kind === 'session-read'));
      assert.deepEqual(f.queries, [expectedQuery(operation)]);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      t.diagnostic(JSON.stringify({ scenario: `device-${operation}-owned-refresh`, refreshRequests: 1, storageWrites: 1, allAuthWorkOwned: true, dataQueriesAfterSdkSettlement: f.queries.length }));
    } finally { write.resolve(); user.resolve(); await result.catch(() => undefined); await f.dispose(); }
  });

  test(`${operation} preserves fresh verified owner filters, payload and returned data`, { timeout: 5000 }, async () => {
    const f = await fixture();
    if (operation === 'settings') f.setDataResult({ data: { id: 'synthetic-device', owner_id: USER, ...settings }, error: null });
    try {
      assert.equal(await invoke(f, operation), f.dataResult.data);
      assert.deepEqual(f.queries, [expectedQuery(operation)]);
      assert.equal(f.events.filter(event => event.phase === 'refresh' || event.action === 'set' || event.action === 'remove').length, 0);
      assert.ok(f.events.every(event => event.busy && event.kind === 'session-read'));
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { await f.dispose(); }
  });

  test(`${operation} preserves original Data error after verified identity`, { timeout: 5000 }, async () => {
    const f = await fixture(), failure = new Error('synthetic device Data failure');
    f.setDataResult({ data: null, error: failure });
    try {
      await assert.rejects(invoke(f, operation), error => error === failure);
      assert.deepEqual(f.queries, [expectedQuery(operation)]);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { await f.dispose(); }
  });
}

test('fresh user GET stays owned while its HTTP result is pending', { timeout: 5000 }, async () => {
  const f = await fixture(), entered = deferred(), reply = deferred();
  f.setFetchHandler(phase => { assert.equal(phase, 'user'); entered.resolve(); return reply.promise.then(() => jsonResponse({ id: USER })); });
  const result = f.repository.listDevices();
  try {
    await entered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.deepEqual(f.queries, []);
    await assert.rejects(f.repository.updateDeviceSettings('synthetic-device', settings), f.coordinator.isAuthSessionOperationBusyError);
    reply.resolve(); await result;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { reply.resolve(); await result.catch(() => undefined); await f.dispose(); }
});

test('missing SDK session fails closed without device Data access and preserves SDK error', { timeout: 5000 }, async () => {
  const f = await fixture(); f.clearSession();
  try {
    await assert.rejects(f.repository.listDevices(), error => error === f.lastAuthError && error.name === 'AuthSessionMissingError');
    assert.deepEqual(f.queries, []);
    assert.equal(f.events.filter(event => event.action === 'http').length, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('thrown SDK storage failure preserves error identity and releases owner', { timeout: 5000 }, async () => {
  const f = await fixture(), failure = new Error('synthetic identity storage failure');
  f.setStorageHook(() => { throw failure; });
  try {
    await assert.rejects(f.repository.updateDeviceSettings('synthetic-device', settings), error => error === failure);
    assert.deepEqual(f.queries, []);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('verified-user API error preserves actual SDK object and prevents device Data access', { timeout: 5000 }, async () => {
  const f = await fixture();
  f.setFetchHandler(() => new Response(JSON.stringify({ code: 'bad_jwt', message: 'Synthetic invalid JWT' }), { status: 401, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } }));
  try {
    await assert.rejects(f.repository.listDevices(), error => error === f.lastAuthError && error.name === 'AuthApiError' && error.code === 'bad_jwt');
    assert.deepEqual(f.queries, []);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});
