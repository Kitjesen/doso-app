// Characterization through public production entry + installed SDK. Only
// native persistence/UUID and HTTP are controlled. No SDK method replacement.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { StorageClient } from '@supabase/storage-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';
const ROOT = new URL('../', import.meta.url), USER = '11111111-1111-4111-8111-111111111111';
const OBJECT = '99999999-9999-4999-8999-999999999999', INPUT = { username: 'pilot_01', displayName: 'Pilot' };
let sequence = 0;
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function session(label, lifetime = 3600, userId = USER) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: '22222222-2222-4222-8222-222222222222', exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
async function fixture({ foreignAfterIdentity = false, expireAfterIdentity = false, afterIdentity } = {}) {
  const modules = new Map(), values = new Map(), journal = new Map(), events = [], initial = deferred(), hold = deferred(), foreignOwner = {};
  const storageKey = `profile-data-boundary-${++sequence}`, fresh = session('fresh'), expired = session('expired', -60), rotated = session('rotated');
  const config = { url: 'https://profile-data-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' };
  values.set(storageKey, JSON.stringify(fresh));
  let coordinator, observed = false, changed = false, foreignOperation, getterReads = 0, storageHook, dataHandler, now = 0;
  const timers = new Map();
  const timerApi = {
    setTimeout(callback, ms) { const id = {}; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const record = (action, phase) => {
    if (!observed) return;
    const state = coordinator.getAuthSessionOperationSnapshot(), event = { action, phase, busy: state.busy, kind: state.kind, foreignOwner: state.owner === foreignOwner };
    events.push(event); return event;
  };
  const transport = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, config.url);
    const phase = url.pathname === '/auth/v1/user' ? 'user' : url.pathname === '/auth/v1/token' ? 'refresh' : url.pathname === '/rest/v1/profiles' ? 'profile-select' : url.pathname === `/storage/v1/object/sign/profile-avatars/${USER}/${OBJECT}.jpg` ? 'avatar-sign' : 'unexpected';
    assert.notEqual(phase, 'unexpected', 'No profile RPC or avatar mutation may follow the controlled SELECT failure');
    record('http', phase);
    if (phase === 'user') { assert.equal(init.method, 'GET'); return response(fresh.user); }
    if (phase === 'refresh') { assert.equal(init.method, 'POST'); assert.equal(url.searchParams.get('grant_type'), 'refresh_token'); return response(rotated); }
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.ok([fresh.access_token, rotated.access_token].some(token => headers.get('Authorization') === `Bearer ${token}`), 'Request uses a synthetic fixture session; credential value is not emitted');
    if (dataHandler) return dataHandler(phase, url, init);
    if (phase === 'avatar-sign') {
      assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), { expiresIn: 3600 });
      return response({ signedURL: `/object/sign/profile-avatars/${USER}/${OBJECT}.jpg?token=synthetic-signed-url` });
    }
    assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('select'), 'avatar_url'); assert.equal(url.searchParams.get('id'), `eq.${USER}`);
    return new Response(JSON.stringify({ code: '42501', message: 'Synthetic profile read stop', details: null, hint: null }), { status: 403, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient(config.url, config.publishableKey, { auth: { storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce', storage: {
    async getItem(key) { const event = record('get', 'auth-storage'); await storageHook?.(event); return values.get(key) ?? null; },
    async setItem(key, value) { const event = record('set', 'auth-storage'); await storageHook?.(event); values.set(key, value); },
    async removeItem(key) { const event = record('remove', 'auth-storage'); await storageHook?.(event); values.delete(key); },
  } }, global: { fetch: createAuthRequestFetch(transport, { timeoutMs: 5000 }) } });
  const stubs = {
    'expo-crypto': { randomUUID: () => OBJECT },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1, async getItemAsync(key) { record('get', 'journal'); return journal.get(key) ?? null; }, async setItemAsync(key, value) { record('set', 'journal'); journal.set(key, value); }, async deleteItemAsync(key) { record('remove', 'journal'); journal.delete(key); } },
    'react-native': { Platform: { OS: 'android' } },
  };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, Promise, Map, Set, RegExp, URL, URLSearchParams, ArrayBuffer, Uint8Array, performance: { now: () => now }, ...timerApi, fetch: transport, require(name) {
      if (name === '@supabase/postgrest-js') return { PostgrestClient };
      if (name === '@supabase/storage-js') return { StorageClient };
      if (name === './supabaseClient') return { supabaseConfig: config, SupabaseConfigurationError: class extends Error {}, getSupabaseClient() { getterReads++; return client; } };
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith('./')) return load(`src/services/${name.slice(2)}.ts`);
      throw new Error(`Unexpected profile Data fixture dependency: ${name}`);
    } }, { filename: path }); return module.exports;
  };
  coordinator = load('src/services/authSessionOperation.ts');
  const profile = load('src/services/profileEditing.ts');
  const subscription = client.auth.onAuthStateChange(event => { if (event === 'INITIAL_SESSION') initial.resolve(); }).data.subscription;
  assert.equal((await client.auth.initialize()).error, null); await initial.promise; assert.equal((await client.auth.getSession()).error, null); subscription.unsubscribe();
  const unsubscribe = coordinator.subscribeAuthSessionOperations(() => {
    if (changed || coordinator.getAuthSessionOperationSnapshot().busy) return;
    changed = true;
    if (expireAfterIdentity) values.set(storageKey, JSON.stringify(expired));
    afterIdentity?.({ values, storageKey });
    if (foreignAfterIdentity) foreignOperation = coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: foreignOwner });
  });
  observed = true;
  return { coordinator, profile, events, client, get getterReads() { return getterReads; },
    config,
    get timerBudgets() { return [...timers.values()].map(value => value.ms); },
    get rotatedStored() { return values.get(storageKey) === JSON.stringify(rotated); },
    advance(ms) { now += ms; },
    expire() { values.set(storageKey, JSON.stringify(expired)); },
    clearSession() { values.delete(storageKey); },
    switchUser() { values.set(storageKey, JSON.stringify(session('other-user', 3600, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))); },
    setStorageHook(value) { storageHook = value; }, setDataHandler(value) { dataHandler = value; },
    fireTimer() { assert.equal(timers.size, 1); const [id, { callback, ms }] = timers.entries().next().value; timers.delete(id); now += ms; callback(); },
    whenIdle() { if (!coordinator.getAuthSessionOperationSnapshot().busy) return Promise.resolve(); return new Promise(resolve => { const unsubscribeIdle = coordinator.subscribeAuthSessionOperations(() => { if (!coordinator.getAuthSessionOperationSnapshot().busy) { unsubscribeIdle(); resolve(); } }); }); },
    get foreignOwnerActive() { const state = coordinator.getAuthSessionOperationSnapshot(); return state.busy && state.owner === foreignOwner; },
    startForeign(expire = false) {
      changed = true;
      if (expire) values.set(storageKey, JSON.stringify(expired));
      foreignOperation = coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: foreignOwner });
    },
    async releaseForeign() { hold.resolve(); await foreignOperation; await new Promise(resolve => setImmediate(resolve)); },
    async dispose() { unsubscribe(); timers.clear(); hold.resolve(); await foreignOperation; await client.auth.dispose(); await client.removeAllChannels(); },
  };
}

test('profile SELECT rejects a foreign Auth owner before implicit refresh, storage write or query', { timeout: 10000 }, async t => {
  const f = await fixture({ foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    const outcome = await f.profile.saveProfileEdits(USER, INPUT).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    const foreign = f.events.filter(event => event.foreignOwner);
    t.diagnostic(JSON.stringify({ scenario: 'profile-select-admission', busyError: f.coordinator.isAuthSessionOperationBusyError(outcome.error), foreignRefresh: foreign.filter(event => event.phase === 'refresh').length, foreignSessionWrites: foreign.filter(event => event.phase === 'auth-storage' && event.action === 'set').length, queryRequests: foreign.filter(event => event.phase === 'profile-select').length, externalOwnerStillBusy: f.foreignOwnerActive }));
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(foreign.filter(event => event.phase === 'refresh' || event.phase === 'profile-select' || event.phase === 'auth-storage' && event.action === 'set').length, 0);
    assert.equal(f.foreignOwnerActive, true);
    assert.equal(f.getterReads, 2); await f.releaseForeign(); assert.equal(dataEvents(f).length, 0);
  } finally { await f.dispose(); }
});

test('avatar signature rejects a foreign Auth owner before implicit refresh, storage write or request', { timeout: 10000 }, async t => {
  const f = await fixture(); f.startForeign(true);
  try {
    const outcome = await f.profile.resolveProfileAvatarUrl(`profile-avatars/${USER}/${OBJECT}.jpg`, USER).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'avatar-sign-admission', busyError: f.coordinator.isAuthSessionOperationBusyError(outcome.error), refresh: f.events.filter(event => event.phase === 'refresh').length, sessionWrites: f.events.filter(event => event.phase === 'auth-storage' && event.action === 'set').length, signRequests: f.events.filter(event => event.phase === 'avatar-sign').length, externalOwnerStillBusy: f.foreignOwnerActive }));
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(f.events.filter(event => event.phase === 'refresh' || event.phase === 'avatar-sign' || event.action === 'set').length, 0);
    assert.equal(f.foreignOwnerActive, true);
    assert.equal(f.getterReads, 0); await f.releaseForeign(); assert.equal(dataEvents(f).length, 0);
  } finally { await f.dispose(); }
});

const avatarValue = `profile-avatars/${USER}/${OBJECT}.jpg`;
const profileFailure = () => new Response(JSON.stringify({ code: '42501', message: 'Synthetic profile read stop' }), { status: 403, headers: { 'content-type': 'application/json' } });
const signatureSuccess = () => response({ signedURL: `/object/sign/profile-avatars/${USER}/${OBJECT}.jpg?token=synthetic-signed-url` });
const read = (f, kind) => kind === 'select' ? f.profile.saveProfileEdits(USER, INPUT) : f.profile.resolveProfileAvatarUrl(avatarValue, USER);
const outcomeOf = promise => promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
const dataEvents = f => f.events.filter(event => event.phase === 'profile-select' || event.phase === 'avatar-sign');
const authEvents = f => f.events.filter(event => ['auth-storage', 'user', 'refresh'].includes(event.phase));

for (const kind of ['select', 'sign']) {
  test(`${kind}: normal read keeps SDK request/result/error contract and Auth outside Data wait`, { timeout: 10000 }, async () => {
    const f = await fixture();
    try {
      const outcome = await outcomeOf(read(f, kind));
      if (kind === 'select') { assert.equal(outcome.status, 'rejected'); assert.match(outcome.error.message, /Synthetic profile read stop/); }
      else { assert.equal(outcome.status, 'fulfilled'); assert.equal(new URL(outcome.value).pathname, `/storage/v1/object/sign/profile-avatars/${USER}/${OBJECT}.jpg`); }
      assert.equal(dataEvents(f).length, 1); assert.equal(dataEvents(f)[0].busy, false);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      assert.equal(f.events.filter(event => event.phase === 'refresh' || event.action === 'set').length, 0);
    } finally { await f.dispose(); }
  });

  test(`${kind}: real expired session refresh and delayed write remain owned before query construction`, { timeout: 10000 }, async () => {
    const f = await fixture({ expireAfterIdentity: kind === 'select' }), entered = deferred(), write = deferred();
    if (kind === 'sign') f.expire();
    f.setStorageHook(event => { if (event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(read(f, kind));
    try {
      await entered.promise; assert.equal(dataEvents(f).length, 0);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      write.resolve(); await pending;
      assert.equal(f.rotatedStored, true); assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      assert.equal(dataEvents(f).length, 1); assert.equal(dataEvents(f)[0].busy, false);
    } finally { write.resolve(); await pending; await f.dispose(); }
  });

  test(`${kind}: caller timeout retains real pending SDK write and cannot later dispatch Data`, { timeout: 10000 }, async t => {
    const f = await fixture({ expireAfterIdentity: kind === 'select' }), entered = deferred(), write = deferred();
    if (kind === 'sign') f.expire();
    f.setStorageHook(event => { if (event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(read(f, kind));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [20_000]); f.fireTimer();
      const result = await pending;
      assert.ok(result.error instanceof f.profile.ProfileEditTimeoutError);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      const idle = f.whenIdle(); write.resolve(); await idle; await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.rotatedStored, true); assert.equal(dataEvents(f).length, 0);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      t.diagnostic(JSON.stringify({ scenario: 'profile-read-late-sdk', kind, callerTimedOut: true, sdkWriteSettled: true, lateDataRequests: 0, finalBusy: false, cancellationClaimed: false }));
    } finally { write.resolve(); await pending; await f.dispose(); }
  });

  test(`${kind}: pending Data permits another actual session read`, { timeout: 10000 }, async () => {
    const f = await fixture(), entered = deferred(), reply = deferred();
    f.setDataHandler(() => { entered.resolve(); return reply.promise; });
    const pending = outcomeOf(read(f, kind));
    try {
      await entered.promise; assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      const sessionResult = await f.coordinator.runAuthSessionOperation(() => f.client.auth.getSession(), { kind: 'session-read' });
      assert.equal(sessionResult.data.session.user.id, USER);
      reply.resolve(kind === 'select' ? profileFailure() : signatureSuccess()); await pending;
      assert.equal(dataEvents(f).length, 1); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { reply.resolve(kind === 'select' ? profileFailure() : signatureSuccess()); await pending; await f.dispose(); }
  });

  test(`${kind}: Auth and Data share the original20s deadline rather than each getting20s`, { timeout: 10000 }, async t => {
    let armed = kind === 'sign', advanced = false;
    const f = await fixture({ afterIdentity: () => { armed = true; } }), entered = deferred(), reply = deferred();
    f.setStorageHook(event => { if (armed && !advanced && event.action === 'get') { advanced = true; f.advance(7000); } });
    f.setDataHandler(() => { entered.resolve(); return reply.promise; });
    const pending = outcomeOf(read(f, kind));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [13_000]);
      f.fireTimer(); const result = await pending; assert.ok(result.error instanceof f.profile.ProfileEditTimeoutError);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      t.diagnostic(JSON.stringify({ scenario: 'profile-read-shared-deadline', kind, authElapsedMs: 7000, dataBudgetMs: 13000, totalBudgetMs: 20000, dataHttpCancelled: false }));
    } finally { reply.resolve(kind === 'select' ? profileFailure() : signatureSuccess()); await pending; await f.dispose(); }
  });

  for (const state of ['missing', 'different-user']) test(`${kind}: ${state} session cannot dispatch a read`, { timeout: 10000 }, async () => {
    let f; f = await fixture({ afterIdentity: () => state === 'missing' ? f.clearSession() : f.switchUser() });
    if (kind === 'sign') { if (state === 'missing') f.clearSession(); else f.switchUser(); }
    try {
      await assert.rejects(read(f, kind), /当前账户与待编辑资料不一致/);
      assert.equal(dataEvents(f).length, 0); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { await f.dispose(); }
  });
}

test('expiry of shared deadline before Data construction prevents any query without faking cancellation', { timeout: 10000 }, async () => {
  const f = await fixture(); let advanced = false;
  f.setStorageHook(event => { if (!advanced && event.action === 'get') { advanced = true; f.advance(20_001); } });
  try { await assert.rejects(read(f, 'sign'), error => error instanceof f.profile.ProfileEditTimeoutError); assert.equal(dataEvents(f).length, 0); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); }
  finally { await f.dispose(); }
});

test('invalid or null owned avatar path remains a no-op without Auth or network', { timeout: 10000 }, async () => {
  const f = await fixture();
  try { for (const value of [null, 'https://untrusted.invalid/avatar.jpg', `profile-avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${OBJECT}.jpg`]) assert.equal(await f.profile.resolveProfileAvatarUrl(value, USER), null); assert.equal(f.getterReads, 0); assert.deepEqual(f.events, []); }
  finally { await f.dispose(); }
});

test('a thrown Auth storage error keeps its identity and prevents a signature request', { timeout: 10000 }, async () => {
  const f = await fixture(), failure = new Error('synthetic session storage failure');
  f.setStorageHook(() => { throw failure; });
  try { await assert.rejects(read(f, 'sign'), error => error === failure); assert.equal(dataEvents(f).length, 0); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); }
  finally { await f.dispose(); }
});

test('missing public config fails before a signature Auth getter or network request', { timeout: 10000 }, async () => {
  const f = await fixture(); f.config.url = null;
  try { await assert.rejects(read(f, 'sign')); assert.equal(f.getterReads, 0); assert.deepEqual(f.events, []); }
  finally { await f.dispose(); }
});

test('installed GET retry reuses only request-local bearer without another Auth read', { timeout: 10000 }, async t => {
  const f = await fixture(); let attempts = 0, firstBearer, authReadsBeforeRetry;
  f.setDataHandler(async (phase, url, init) => {
    assert.equal(phase, 'profile-select'); attempts++;
    if (attempts === 1) {
      firstBearer = new Headers(init.headers).get('Authorization');
      f.expire(); await f.coordinator.runAuthSessionOperation(() => f.client.auth.getSession(), { kind: 'session-read' });
      authReadsBeforeRetry = f.events.filter(event => event.phase === 'auth-storage' && event.action === 'get').length;
      return new Response(JSON.stringify({ message: 'synthetic retry' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    assert.ok(new Headers(init.headers).get('Authorization') === firstBearer, 'A retry must retain this request credential, not re-read a rotated session');
    return profileFailure();
  });
  try {
    await assert.rejects(read(f, 'select'), /Synthetic profile read stop/);
    assert.equal(attempts, 2); assert.equal(f.rotatedStored, true);
    const extraReads = f.events.filter(event => event.phase === 'auth-storage' && event.action === 'get').length - authReadsBeforeRetry;
    assert.equal(extraReads, 0);
    t.diagnostic(JSON.stringify({ scenario: 'profile-read-get-retry', attempts, actualInterveningRefresh: 1, additionalAuthReadsOnRetry: extraReads, requestBearerUnchanged: true }));
  } finally { await f.dispose(); }
});

for (const [status, message, expected] of [[404, 'Bucket not found', /头像存储服务尚未部署或当前会话无读取权限/], [503, 'synthetic signature unavailable', /synthetic signature unavailable/]]) {
  test(`signature server${status} preserves mapped error and never automatically retries POST`, { timeout: 10000 }, async () => {
    const f = await fixture();
    f.setDataHandler(phase => { assert.equal(phase, 'avatar-sign'); return new Response(JSON.stringify({ message, statusCode: String(status), error: 'synthetic' }), { status, headers: { 'content-type': 'application/json' } }); });
    try { await assert.rejects(read(f, 'sign'), expected); assert.equal(dataEvents(f).length, 1); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); }
    finally { await f.dispose(); }
  });
}
