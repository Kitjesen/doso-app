// Regression through public production entry + installed SDK. Only
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
const OBJECT = '99999999-9999-4999-8999-999999999999', OLD_OBJECT_PATH = `${USER}/88888888-8888-4888-8888-888888888888.jpg`, INPUT = { username: 'pilot_01', displayName: 'Pilot' };
let sequence = 0;
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function session(label, lifetime = 3600, userId = USER) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: '22222222-2222-4222-8222-222222222222', exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
async function fixture({ target = 'retire', foreignAfterIdentity = false, expireAfterIdentity = false, afterIdentity } = {}) {
  const modules = new Map(), values = new Map(), journal = new Map(), events = [], initial = deferred(), hold = deferred(), foreignOwner = {};
  const storageKey = `profile-cleanup-request-${++sequence}`, fresh = session('fresh'), expired = session('expired', -60), rotated = session('rotated');
  const config = { url: 'https://profile-data-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' };
  values.set(storageKey, JSON.stringify(fresh));
  let coordinator, observed = false, changed = false, foreignOperation, getterReads = 0, storageHook, dataHandler, now = 0, userHttpReads = 0, profileHttpReads = 0;
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
    if (url.pathname === '/rest/v1/profiles') profileHttpReads++;
    const phase = url.pathname === '/auth/v1/user' ? 'user'
      : url.pathname === '/auth/v1/token' ? 'refresh'
      : url.pathname === '/rest/v1/profiles' ? (profileHttpReads === 1 ? 'profile-select' : 'readback')
      : url.pathname === '/rest/v1/rpc/prepare_my_profile_avatar_cleanup' ? 'retire'
      : url.pathname === '/storage/v1/object/profile-avatars' ? 'delete' : 'unexpected';
    assert.notEqual(phase, 'unexpected', 'Only synthetic recovery requests permitted; never upload or update_my_profile');
    record('http', phase);
    if (phase === 'user') { userHttpReads++; assert.equal(init.method, 'GET'); return response(fresh.user); }
    if (phase === 'refresh') { assert.equal(init.method, 'POST'); assert.equal(url.searchParams.get('grant_type'), 'refresh_token'); return response(rotated); }
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.ok([fresh.access_token, rotated.access_token].some(token => headers.get('Authorization') === `Bearer ${token}`), 'Request uses a synthetic fixture session; credential value is not emitted');
    if (phase === 'retire') {
      assert.equal(init.method, 'POST'); assert.equal(headers.get('content-profile'), 'public');
      assert.deepEqual(JSON.parse(init.body), { p_expected_user_id: USER, p_object_path: OLD_OBJECT_PATH });
    } else if (phase === 'delete') {
      assert.equal(init.method, 'DELETE'); assert.deepEqual(JSON.parse(init.body), { prefixes: [OLD_OBJECT_PATH] });
    } else {
      assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('select'), 'avatar_url'); assert.equal(url.searchParams.get('id'), `eq.${USER}`);
    }
    if (dataHandler && phase !== 'profile-select') {
      const controlled = await dataHandler(phase, url, init);
      if (controlled !== undefined) return controlled;
    }
    if (phase === 'retire') return response({ status: 'retired', ownerId: USER, objectPath: OLD_OBJECT_PATH });
    if (phase === 'delete') return response([{ name: OLD_OBJECT_PATH }]);
    return response([{ avatar_url: null }]);
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
      throw new Error(`Unexpected cleanup fixture dependency: ${name}`);
    } }, { filename: path }); return module.exports;
  };
  coordinator = load('src/services/authSessionOperation.ts');
  const profile = load('src/services/profileEditing.ts');
  const subscription = client.auth.onAuthStateChange(event => { if (event === 'INITIAL_SESSION') initial.resolve(); }).data.subscription;
  assert.equal((await client.auth.initialize()).error, null); await initial.promise; assert.equal((await client.auth.getSession()).error, null); subscription.unsubscribe();
  const journalApi = load('src/services/profileAvatarJournal.ts').profileAvatarJournal;
  // Seed prior confirmed removal through public production journal methods,
  // not by fabricating a private recovery state or invoking cleanup internals.
  await journalApi.beginPrepared(USER, OBJECT, null, OLD_OBJECT_PATH);
  await journalApi.arm(USER, OBJECT); await journalApi.mark(USER, OBJECT, 'committed');
  assert.equal((await journalApi.read(USER)).phase, 'committed');
  const unsubscribe = coordinator.subscribeAuthSessionOperations(() => {
    if (changed || userHttpReads < ({ retire: 3, delete: 4, readback: 5 }[target]) || coordinator.getAuthSessionOperationSnapshot().busy) return;
    changed = true;
    if (expireAfterIdentity) values.set(storageKey, JSON.stringify(expired));
    afterIdentity?.({ values, storageKey });
    if (foreignAfterIdentity) foreignOperation = coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: foreignOwner });
  });
  observed = true;
  return { coordinator, profile, events, client, get getterReads() { return getterReads; },
    config, get atBoundary() { return changed; },
    async journalEntry() { return load('src/services/profileAvatarJournal.ts').profileAvatarJournal.read(USER); },
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


test('caller cleanup timeout must retain real pending Auth and never dispatch a late DELETE', { timeout: 10000 }, async t => {
  const f = await fixture({ target: 'delete', expireAfterIdentity: true }), entered = deferred(), write = deferred(), refreshed = deferred();
  const subscription = f.client.auth.onAuthStateChange(event => { if (event === 'TOKEN_REFRESHED') refreshed.resolve(); }).data.subscription;
  f.setStorageHook(event => { if (f.atBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
  const pending = outcomeOf(recover(f));
  try {
    await entered.promise; assert.equal(http(f, 'delete').length, 0); assert.deepEqual(f.timerBudgets, [3000]);
    f.fireTimer(); const result = await pending; assert.equal(result.status, 'rejected'); await assertDebtRetained(f);
    const busyAfterCallerTimeout = f.coordinator.getAuthSessionOperationSnapshot().busy;
    write.resolve(); await refreshed.promise; await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.rotatedStored, true); await assertDebtRetained(f);
    t.diagnostic(JSON.stringify({ scenario: 'cleanup-late-delete-after-auth-timeout', callerReturnedPending: true, busyAfterCallerTimeout, actualRefreshPersisted: f.rotatedStored, lateSyntheticDeletes: http(f, 'delete').length, readbacks: http(f, 'readback').length, journalPhase: 'committed', cancellationClaimed: false, realObjectDeleted: false }));
    assert.equal(busyAfterCallerTimeout, true, 'Pending actual SDK Auth must remain owned after caller timeout');
    assert.equal(http(f, 'delete').length, 0, 'Do not start Storage DELETE after caller cleanup deadline');
  } finally { subscription.unsubscribe(); write.resolve(); await pending; await f.dispose(); }
});


const phaseReply = phase => phase === 'retire' ? response({ status: 'retired', ownerId: USER, objectPath: OLD_OBJECT_PATH }) : phase === 'delete' ? response([{ name: OLD_OBJECT_PATH }]) : response([{ avatar_url: null }]);
const serverFailure = (status = 503) => new Response(JSON.stringify({ message: 'synthetic cleanup unavailable', error: 'synthetic', statusCode: String(status), code: 'SYNTHETIC' }), { status, headers: { 'content-type': 'application/json' } });
const authEvents = f => f.events.filter(e => ['auth-storage', 'user', 'refresh'].includes(e.phase));
test('DELETE admission rejects foreign Auth before refresh, mutation or request construction', { timeout: 10000 }, async () => {
  const f = await fixture({ target: 'delete', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    await assert.rejects(recover(f)); await assertDebtRetained(f);
    assert.equal(f.foreignOwnerActive, true);
    assert.equal(foreign(f).filter(e => ['auth-storage', 'refresh', 'delete'].includes(e.phase)).length, 0);
    assert.equal(http(f, 'delete').length, 0); await f.releaseForeign(); assert.equal(http(f, 'delete').length, 0);
  } finally { await f.dispose(); }
});
test('full public-SDK recovery clears prior debt only after proof, matched DELETE and fresh readback', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(recover(f), /上次头像操作已核对/); assert.equal(await f.journalEntry(), null);
    for (const phase of ['retire', 'delete', 'readback']) { assert.equal(http(f, phase).length, 1); assert.equal(http(f, phase)[0].busy, false); }
    assert.ok(authEvents(f).every(e => e.busy && e.kind === 'session-read'));
    assert.equal(f.events.filter(e => e.phase === 'refresh').length, 0);
  } finally { await f.dispose(); }
});
for (const target of ['retire', 'delete', 'readback']) {
  test(`${target}: real delayed refresh write is owned before lock-free HTTP`, { timeout: 10000 }, async () => {
    const f = await fixture({ target, expireAfterIdentity: true }), entered = deferred(), write = deferred();
    f.setStorageHook(event => { if (f.atBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(recover(f));
    try {
      await entered.promise; assert.equal(http(f, target).length, 0);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      write.resolve(); await pending; assert.equal(f.rotatedStored, true);
      assert.equal(http(f, target).length, 1); assert.equal(http(f, target)[0].busy, false);
      assert.ok(authEvents(f).every(e => e.busy && e.kind === 'session-read'));
      assert.equal(await f.journalEntry(), null);
    } finally { write.resolve(); await pending; await f.dispose(); }
  });
  if (target !== 'delete') test(`${target}: Auth timeout retains real SDK and cannot later issue target HTTP or clear debt`, { timeout: 10000 }, async () => {
    const f = await fixture({ target, expireAfterIdentity: true }), entered = deferred(), write = deferred();
    f.setStorageHook(event => { if (f.atBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(recover(f));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [3000]); f.fireTimer(); await pending;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true); await assertDebtRetained(f);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      const idle = f.whenIdle(); write.resolve(); await idle; await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.rotatedStored, true); assert.equal(http(f, target).length, 0); await assertDebtRetained(f);
      assert.ok(authEvents(f).every(e => e.busy && e.kind === 'session-read'));
    } finally { write.resolve(); await pending; await f.dispose(); }
  });
  test(`${target}: dispatched HTTP wait leaves Auth free, timeout does not repeat or clear debt`, { timeout: 10000 }, async t => {
    const f = await fixture({ target }), entered = deferred(), reply = deferred();
    f.setDataHandler(phase => { if (phase === target) { entered.resolve(); return reply.promise; } });
    const pending = outcomeOf(recover(f));
    try {
      await entered.promise; assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      const result = await f.coordinator.runAuthSessionOperation(() => f.client.auth.getSession(), { kind: 'session-read' });
      assert.equal(result.data.session.user.id, USER); assert.deepEqual(f.timerBudgets, [3000]); f.fireTimer(); await pending;
      await assertDebtRetained(f); reply.resolve(phaseReply(target)); await new Promise(resolve => setImmediate(resolve));
      assert.equal(http(f, target).length, 1); await assertDebtRetained(f);
      t.diagnostic(JSON.stringify({ scenario: 'cleanup-network-timeout', target, networkOwnedAuth: false, dispatchedRequests: 1, automaticallyRepeated: false, lateReplyClearedJournal: false, cancelled: false }));
    } finally { reply.resolve(phaseReply(target)); await pending; await f.dispose(); }
  });
  test(`${target}:1200ms Auth consumption leaves1800ms of original3s`, { timeout: 10000 }, async t => {
    const f = await fixture({ target }), entered = deferred(), reply = deferred(); let advanced = false;
    f.setStorageHook(event => { if (f.atBoundary && !advanced && event.action === 'get') { advanced = true; f.advance(1200); } });
    f.setDataHandler(phase => { if (phase === target) { entered.resolve(); return reply.promise; } });
    const pending = outcomeOf(recover(f));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [1800]); f.fireTimer(); await pending; await assertDebtRetained(f);
      t.diagnostic(JSON.stringify({ scenario: 'cleanup-shared-auth-budget', target, authElapsedMs: 1200, remainingNetworkMs: 1800, totalBudgetMs: 3000 }));
    } finally { reply.resolve(phaseReply(target)); await pending; await f.dispose(); }
  });
  for (const state of ['missing', 'different-user']) test(`${target}: ${state} session cannot send request or discard committed debt`, { timeout: 10000 }, async () => {
    let f; f = await fixture({ target, afterIdentity: () => state === 'missing' ? f.clearSession() : f.switchUser() });
    try { await assert.rejects(recover(f)); assert.equal(http(f, target).length, 0); await assertDebtRetained(f); }
    finally { await f.dispose(); }
  });
}
test('retire exhausts shared3s before DELETE, without a reset budget', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => { if (phase === 'retire') f.advance(3001); });
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'retire').length, 1); assert.equal(http(f, 'delete').length, 0); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});
test('Auth completion after existing DELETE cutoff cannot construct the request', { timeout: 10000 }, async () => {
  const f = await fixture({ target: 'delete' }); let advanced = false;
  f.setStorageHook(event => { if (f.atBoundary && !advanced && event.action === 'get') { advanced = true; f.advance(3001); } });
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'delete').length, 0); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});
test('returned503 permits at most one fresh revalidated DELETE retry', { timeout: 10000 }, async () => {
  const f = await fixture(); let deletes = 0;
  f.setDataHandler(phase => { if (phase === 'delete' && ++deletes === 1) return serverFailure(); });
  try {
    await assert.rejects(recover(f), /上次头像操作已核对/); assert.equal(await f.journalEntry(), null);
    assert.equal(http(f, 'retire').length, 2); assert.equal(http(f, 'delete').length, 2); assert.equal(http(f, 'readback').length, 1);
  } finally { await f.dispose(); }
});
test('returned503 after deadline never starts second authority check or DELETE', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => { if (phase === 'delete') { f.advance(3001); return serverFailure(); } });
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'retire').length, 1); assert.equal(http(f, 'delete').length, 1); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});
test('second DELETE consumes remaining shared budget, not a fresh3s', { timeout: 10000 }, async t => {
  const f = await fixture(), entered = deferred(), reply = deferred(); let retires = 0, deletes = 0;
  f.setDataHandler(phase => {
    if (phase === 'retire' && ++retires === 1) f.advance(1000);
    if (phase === 'delete') {
      if (++deletes === 1) { f.advance(500); return serverFailure(); }
      entered.resolve(); return reply.promise;
    }
  });
  const pending = outcomeOf(recover(f));
  try {
    await entered.promise; assert.deepEqual(f.timerBudgets, [1500]); f.fireTimer(); await pending;
    assert.equal(http(f, 'retire').length, 2); assert.equal(http(f, 'delete').length, 2); await assertDebtRetained(f);
    t.diagnostic(JSON.stringify({ scenario: 'cleanup-retry-shared-budget', retireElapsedMs: 1000, firstDeleteElapsedMs: 500, secondDeleteBudgetMs: 1500, totalBudgetMs: 3000 }));
  } finally { reply.resolve(phaseReply('delete')); await pending; await f.dispose(); }
});
test('readback keeps independent original3s after remove used2800ms and ignores late reply', { timeout: 10000 }, async t => {
  const f = await fixture(), entered = deferred(), reply = deferred();
  f.setDataHandler(phase => {
    if (phase === 'retire') f.advance(2000);
    if (phase === 'delete') f.advance(800);
    if (phase === 'readback') { entered.resolve(); return reply.promise; }
  });
  const pending = outcomeOf(recover(f));
  try {
    await entered.promise; assert.deepEqual(f.timerBudgets, [3000]); f.fireTimer(); await pending; await assertDebtRetained(f);
    reply.resolve(phaseReply('readback')); await new Promise(resolve => setImmediate(resolve)); await assertDebtRetained(f);
    t.diagnostic(JSON.stringify({ scenario: 'cleanup-readback-independent-budget', removeElapsedMs: 2800, readbackBudgetMs: 3000, wholeCleanupThreeSecondsClaimed: false }));
  } finally { reply.resolve(phaseReply('readback')); await pending; await f.dispose(); }
});
for (const status of ['protected-current', 'retired-missing']) test(`proof ${status} never sends DELETE`, { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => phase === 'retire' ? response({ status, ownerId: USER, objectPath: OLD_OBJECT_PATH }) : undefined);
  try {
    await assert.rejects(recover(f)); assert.equal(http(f, 'delete').length, 0);
    if (status === 'retired-missing') assert.equal(await f.journalEntry(), null); else await assertDebtRetained(f);
  } finally { await f.dispose(); }
});
test('foreign cleanup proof cannot authorize DELETE or clear journal', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => phase === 'retire' ? response({ status: 'retired', ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', objectPath: OLD_OBJECT_PATH }) : undefined);
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'delete').length, 0); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});
test('successful but empty DELETE acknowledgement keeps debt and skips readback', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => phase === 'delete' ? response([]) : undefined);
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'delete').length, 1); assert.equal(http(f, 'readback').length, 0); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});
test('network rejection never retries DELETE or exposes raw error through recovery result', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => { if (phase === 'delete') throw new TypeError('synthetic private storage detail'); });
  try {
    const result = await outcomeOf(recover(f)); assert.equal(result.status, 'rejected'); assert.doesNotMatch(result.error.message, /synthetic private storage detail/);
    assert.equal(http(f, 'delete').length, 1); await assertDebtRetained(f);
  } finally { await f.dispose(); }
});
test('lost session after readback still prevents journal clear through final identity fence', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(phase => { if (phase === 'readback') { f.clearSession(); return phaseReply(phase); } });
  try { await assert.rejects(recover(f)); assert.equal(http(f, 'readback').length, 1); await assertDebtRetained(f); }
  finally { await f.dispose(); }
});

const outcomeOf = promise => promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
test('readback refuses implicit refresh/write/query under foreign Auth owner and keeps committed debt', { timeout: 10000 }, async t => {
  const f = await fixture({ target: 'readback', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    const result = await outcomeOf(recover(f)); assert.equal(result.status, 'rejected'); await assertDebtRetained(f);
    const events = foreign(f);
    t.diagnostic(JSON.stringify({ scenario: 'cleanup-readback-admission', foreignRefresh: events.filter(e => e.phase === 'refresh').length, foreignSessionWrites: events.filter(e => e.phase === 'auth-storage' && e.action === 'set').length, foreignReadbacks: events.filter(e => e.phase === 'readback').length, ownerStillBusy: f.foreignOwnerActive, journalPhase: 'committed', realObjectDeleted: false }));
    assert.equal(f.foreignOwnerActive, true);
    assert.equal(events.filter(e => ['refresh', 'readback'].includes(e.phase) || e.phase === 'auth-storage' && e.action === 'set').length, 0);
    await f.releaseForeign(); assert.equal(http(f, 'readback').length, 0);
  } finally { await f.dispose(); }
});
const recover = f => f.profile.saveProfileEdits(USER, INPUT);
const http = (f, phase) => f.events.filter(e => e.action === 'http' && e.phase === phase);
const foreign = f => f.events.filter(e => e.foreignOwner);
async function assertDebtRetained(f) {
  const entry = await f.journalEntry(); assert.equal(entry.phase, 'committed'); assert.equal(entry.operationId, OBJECT);
  assert.equal(entry.candidatePath, null); assert.equal(entry.previousPath, OLD_OBJECT_PATH);
  assert.equal(f.events.filter(e => e.phase === 'journal' && e.action === 'remove').length, 0);
}
test('retire must not implicitly refresh/write or issue cleanup RPC under foreign Auth owner', { timeout: 10000 }, async t => {
  const f = await fixture({ target: 'retire', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    const result = await outcomeOf(recover(f)); await assertDebtRetained(f);
    const events = foreign(f);
    t.diagnostic(JSON.stringify({ scenario: 'cleanup-retire-admission', recoveryRejected: result.status === 'rejected', foreignRefresh: events.filter(e => e.phase === 'refresh').length, foreignSessionWrites: events.filter(e => e.phase === 'auth-storage' && e.action === 'set').length, foreignRetirePosts: events.filter(e => e.phase === 'retire').length, deleteRequests: http(f, 'delete').length, ownerStillBusy: f.foreignOwnerActive, journalPhase: (await f.journalEntry()).phase }));
    assert.equal(f.foreignOwnerActive, true);
    assert.equal(events.filter(e => ['refresh', 'retire'].includes(e.phase) || e.phase === 'auth-storage' && e.action === 'set').length, 0);
    await f.releaseForeign(); assert.equal(http(f, 'retire').length, 0);
  } finally { await f.dispose(); }
});
