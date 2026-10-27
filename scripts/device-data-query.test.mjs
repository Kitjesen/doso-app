// Public installed SDK and production modules. Only Auth persistence and HTTP
// are synthetic. No credential values are emitted or SDK methods replaced.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';
const ROOT = new URL('../', import.meta.url), USER = '11111111-1111-4111-8111-111111111111';
let sequence = 0;
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function session(label, lifetime = 3600, userId = USER) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
async function fixture({ foreignAtIdentityEnd = false, afterIdentity } = {}) {
  const modules = new Map(), values = new Map(), events = [], initial = deferred(), hold = deferred(), foreignOwner = {};
  const storageKey = `device-query-${++sequence}`, fresh = session('fresh'), expired = session('expired', -60), rotated = session('rotated');
  const rows = [{ id: 'synthetic-device', owner_id: USER, is_demo: false }], settings = { display_name: 'Desk robot', alerts_enabled: false };
  const config = { url: 'https://device-query-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' };
  values.set(storageKey, JSON.stringify(fresh));
  let coordinator, observed = false, getterReads = 0, foreignOperation, changed = false, storageHook, dataHandler;
  const record = (action, phase) => {
    if (!observed) return;
    const state = coordinator.getAuthSessionOperationSnapshot(), event = { action, phase, busy: state.busy, kind: state.kind, foreignOwner: state.owner === foreignOwner };
    events.push(event); return event;
  };
  const transport = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, config.url);
    const phase = url.pathname === '/auth/v1/user' ? 'user' : url.pathname === '/auth/v1/token' ? 'refresh' : url.pathname === '/rest/v1/devices' ? 'devices' : 'unexpected';
    assert.notEqual(phase, 'unexpected'); record('http', phase);
    if (phase === 'user') return response(fresh.user);
    if (phase === 'refresh') return response(rotated);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.ok([fresh.access_token, rotated.access_token].some(token => headers.get('Authorization') === `Bearer ${token}`), 'Data bearer comes from fixture session');
    assert.equal(url.searchParams.get('owner_id'), `eq.${USER}`);
    if (dataHandler) return dataHandler(url, init);
    if (init.method === 'GET') { assert.equal(url.searchParams.get('is_demo'), 'eq.false'); assert.equal(url.searchParams.get('order'), 'created_at.asc'); return response(rows); }
    assert.equal(init.method, 'PATCH'); assert.equal(url.searchParams.get('id'), 'eq.synthetic-device'); assert.deepEqual(JSON.parse(init.body), settings);
    assert.equal(headers.get('Content-Type'), 'application/json'); assert.ok(headers.get('Prefer').includes('return=representation'));
    return response({ ...rows[0], ...settings });
  };
  const client = createClient(config.url, config.publishableKey, { auth: { storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce', storage: {
    async getItem(key) { const event = record('get', 'storage'); await storageHook?.(event); return values.get(key) ?? null; },
    async setItem(key, value) { const event = record('set', 'storage'); await storageHook?.(event); values.set(key, value); },
    async removeItem(key) { const event = record('remove', 'storage'); await storageHook?.(event); values.delete(key); },
  } }, global: { fetch: createAuthRequestFetch(transport, { timeoutMs: 5000 }) } });
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, URL, Headers, Response, fetch: transport, require(name) {
      if (name === '@supabase/postgrest-js') return { PostgrestClient };
      if (name === './supabaseClient') return { supabaseConfig: config, SupabaseConfigurationError: class extends Error {}, getSupabaseClient() { getterReads++; return client; } };
      if (name.startsWith('./')) return load(`src/services/${name.slice(2)}.ts`);
      throw new Error(`Unexpected device Data fixture dependency: ${name}`);
    } }, { filename: path }); return module.exports;
  };
  coordinator = load('src/services/authSessionOperation.ts');
  const repository = load('src/services/deviceRepository.ts');
  const subscription = client.auth.onAuthStateChange(event => { if (event === 'INITIAL_SESSION') initial.resolve(); }).data.subscription;
  assert.equal((await client.auth.initialize()).error, null); await initial.promise; assert.equal((await client.auth.getSession()).error, null); subscription.unsubscribe();
  const unsubscribe = coordinator.subscribeAuthSessionOperations(() => {
    if (changed || coordinator.getAuthSessionOperationSnapshot().busy) return;
    changed = true;
    afterIdentity?.({ values, storageKey, expired, rotated });
    if (foreignAtIdentityEnd) { values.set(storageKey, JSON.stringify(expired)); foreignOperation = coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: foreignOwner }); }
  });
  observed = true;
  return { coordinator, repository, events, rows, settings, client,
    loadDataQuery: () => load('src/services/deviceDataQuery.ts'),
    get getterReads() { return getterReads; }, setStorageHook(value) { storageHook = value; }, setDataHandler(value) { dataHandler = value; },
    async dispose() { unsubscribe(); hold.resolve(); await foreignOperation; await client.auth.dispose(); await client.removeAllChannels(); },
  };
}

test('foreign Auth owner after verified device identity rejects before implicit refresh or Data query', { timeout: 10000 }, async t => {
  const f = await fixture({ foreignAtIdentityEnd: true });
  try {
    const outcome = await f.repository.listDevices().then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    const foreign = f.events.filter(event => event.foreignOwner);
    t.diagnostic(JSON.stringify({ scenario: 'device-query-admission', outcome: outcome.status, getterReads: f.getterReads, foreignRefresh: foreign.filter(event => event.phase === 'refresh').length, foreignWrites: foreign.filter(event => event.action === 'set').length, deviceRequests: f.events.filter(event => event.phase === 'devices').length }));
    assert.equal(outcome.status, 'rejected'); assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(f.getterReads, 1); assert.deepEqual(foreign, []);
  } finally { await f.dispose(); }
});

for (const operation of ['list', 'settings']) {
  test(`healthy ${operation} keeps real SDK filters, payload and response`, { timeout: 10000 }, async () => {
    const f = await fixture();
    try {
      const result = operation === 'list' ? await f.repository.listDevices() : await f.repository.updateDeviceSettings('synthetic-device', f.settings);
      assert.deepEqual(result, operation === 'list' ? f.rows : { ...f.rows[0], ...f.settings });
      assert.equal(f.events.filter(event => event.phase === 'devices').length, 1);
      assert.equal(f.events.filter(event => event.phase === 'refresh' || event.action === 'set').length, 0);
      assert.ok(f.events.filter(event => event.phase !== 'devices').every(event => event.busy && event.kind === 'session-read'));
      assert.equal(f.events.find(event => event.phase === 'devices').busy, false);
    } finally { await f.dispose(); }
  });
}

test('settings also rejects a foreign owner before query construction or refresh', { timeout: 10000 }, async () => {
  const f = await fixture({ foreignAtIdentityEnd: true });
  try {
    await assert.rejects(f.repository.updateDeviceSettings('synthetic-device', f.settings), f.coordinator.isAuthSessionOperationBusyError);
    assert.equal(f.getterReads, 1); assert.equal(f.events.filter(event => event.foreignOwner).length, 0);
  } finally { await f.dispose(); }
});

test('actual delayed Data token refresh write stays owned until SDK settlement', { timeout: 10000 }, async t => {
  const entered = deferred(), write = deferred();
  const f = await fixture({ afterIdentity: ({ values, storageKey, expired }) => values.set(storageKey, JSON.stringify(expired)) });
  f.setStorageHook(event => { if (event?.action === 'set') { entered.resolve(); return write.promise; } });
  const pending = f.repository.listDevices();
  try {
    await entered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    assert.equal(f.events.filter(event => event.phase === 'devices').length, 0);
    write.resolve(); assert.deepEqual(await pending, f.rows);
    assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
    assert.equal(f.events.filter(event => event.action === 'set').length, 1);
    assert.ok(f.events.filter(event => event.phase !== 'devices').every(event => event.busy && event.kind === 'session-read'));
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    t.diagnostic(JSON.stringify({ scenario: 'device-query-owned-refresh', refreshRequests: 1, sessionWrites: 1, allAuthWorkOwned: true, dataWaitOwned: false }));
  } finally { write.resolve(); await pending.catch(() => undefined); await f.dispose(); }
});

test('pending Data HTTP does not prevent a real shared SDK Auth read completing', { timeout: 10000 }, async () => {
  const f = await fixture(), entered = deferred(), reply = deferred();
  f.setDataHandler(() => { entered.resolve(); return reply.promise.then(() => response(f.rows)); });
  const pending = f.repository.listDevices(); let settled = false; void pending.then(() => { settled = true; });
  try {
    await entered.promise; assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    const auth = await f.coordinator.runAuthSessionOperation(() => f.client.auth.getSession(), { kind: 'session-read' });
    assert.equal(auth.error, null); assert.equal(auth.data.session.user.id, USER); assert.equal(settled, false);
    reply.resolve(); await pending;
  } finally { reply.resolve(); await pending.catch(() => undefined); await f.dispose(); }
});

for (const state of ['missing', 'changed']) {
  test(`${state} session after verified identity fails closed before Data HTTP`, { timeout: 10000 }, async () => {
    const f = await fixture({ afterIdentity: ({ values, storageKey }) => {
      if (state === 'missing') values.delete(storageKey);
      else values.set(storageKey, JSON.stringify(session('other', 3600, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')));
    } });
    try {
      await assert.rejects(f.repository.listDevices(), /当前账户已变化/);
      assert.equal(f.events.filter(event => event.phase === 'devices').length, 0);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { await f.dispose(); }
  });
}

test('token-read storage exception retains original identity before Data SDK can wrap it', { timeout: 10000 }, async () => {
  const failure = new Error('synthetic token-read failure'); let identityDone = false;
  const f = await fixture({ afterIdentity: () => { identityDone = true; } });
  f.setStorageHook(() => { if (identityDone) throw failure; });
  try {
    await assert.rejects(f.repository.listDevices(), error => error === failure);
    assert.equal(f.events.filter(event => event.phase === 'devices').length, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('original actual PostgREST server error is thrown unchanged by the query module', { timeout: 10000 }, async () => {
  const f = await fixture(); let sdkError;
  f.setDataHandler(() => new Response(JSON.stringify({ code: '42501', message: 'Synthetic forbidden', details: null, hint: null }), { status: 403, headers: { 'content-type': 'application/json' } }));
  try {
    await assert.rejects(f.loadDataQuery().runDeviceDataQuery(USER, async client => {
      const result = await client.from('devices').select('*').eq('owner_id', USER); sdkError = result.error; return result;
    }), error => error === sdkError && error.code === '42501');
    assert.equal(f.events.filter(event => event.phase === 'devices').length, 1);
  } finally { await f.dispose(); }
});

test('default GET transient retry reuses request credential without another Auth read', { timeout: 10000 }, async t => {
  const f = await fixture(); let attempts = 0, firstAuthReads;
  f.setDataHandler(() => {
    attempts++;
    const authReads = f.events.filter(event => event.action === 'get').length;
    if (attempts === 1) { firstAuthReads = authReads; return new Response('temporary', { status: 503, headers: { 'retry-after': '0' } }); }
    assert.equal(authReads, firstAuthReads); return response(f.rows);
  });
  try {
    assert.deepEqual(await f.repository.listDevices(), f.rows);
    assert.equal(attempts, 2); assert.equal(f.events.filter(event => event.phase === 'refresh').length, 0);
    t.diagnostic(JSON.stringify({ scenario: 'device-query-data-retry', deviceAttempts: 2, additionalAuthReadsOnRetry: 0, authBusyRetryQueued: false }));
  } finally { await f.dispose(); }
});
