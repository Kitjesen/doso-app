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
async function fixture({ target = 'rpc', foreignAfterIdentity = false, expireAfterIdentity = false, afterIdentity } = {}) {
  const modules = new Map(), values = new Map(), journal = new Map(), events = [], initial = deferred(), hold = deferred(), foreignOwner = {};
  const storageKey = `profile-write-boundary-${++sequence}`, fresh = session('fresh'), expired = session('expired', -60), rotated = session('rotated');
  const config = { url: 'https://profile-data-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' };
  values.set(storageKey, JSON.stringify(fresh));
  let coordinator, observed = false, changed = false, foreignOperation, getterReads = 0, storageHook, dataHandler, now = 0, userHttpReads = 0;
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
    const phase = url.pathname === '/auth/v1/user' ? 'user' : url.pathname === '/auth/v1/token' ? 'refresh' : url.pathname === '/rest/v1/profiles' ? 'profile-select' : url.pathname === `/storage/v1/object/sign/profile-avatars/${USER}/${OBJECT}.jpg` ? 'avatar-sign' : url.pathname === '/rest/v1/rpc/update_my_profile' ? 'rpc' : url.pathname === `/storage/v1/object/profile-avatars/${USER}/${OBJECT}.jpg` ? 'upload' : 'unexpected';
    assert.notEqual(phase, 'unexpected', 'No unexpected request, deletion or cleanup RPC is permitted');
    record('http', phase);
    if (phase === 'user') { userHttpReads++; assert.equal(init.method, 'GET'); return response(fresh.user); }
    if (phase === 'refresh') { assert.equal(init.method, 'POST'); assert.equal(url.searchParams.get('grant_type'), 'refresh_token'); return response(rotated); }
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.ok([fresh.access_token, rotated.access_token].some(token => headers.get('Authorization') === `Bearer ${token}`), 'Request uses a synthetic fixture session; credential value is not emitted');
    if (phase === 'rpc') {
      assert.equal(init.method, 'POST');
      assert.equal(headers.get('content-profile'), 'public');
      assert.deepEqual(JSON.parse(init.body), { p_expected_user_id: USER, p_username: INPUT.username, p_display_name: INPUT.displayName, p_avatar_action: target === 'remove' ? 'remove' : 'keep', p_avatar_path: null });
    }
    if (phase === 'upload') {
      assert.equal(init.method, 'POST'); assert.equal(headers.get('content-type'), 'image/jpeg');
      assert.equal(headers.get('cache-control'), 'max-age=3600'); assert.equal(headers.get('x-upsert'), 'false');
      assert.deepEqual([...new Uint8Array(init.body)], [255, 216, 255, 219, 0, 1]);
    }
    if (dataHandler && phase !== 'profile-select') return dataHandler(phase, url, init);
    if (phase === 'rpc') return response(returnedProfile());
    if (phase === 'upload') return writeFailure('Synthetic upload stop', 403);
    if (phase === 'avatar-sign') {
      assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), { expiresIn: 3600 });
      return response({ signedURL: `/object/sign/profile-avatars/${USER}/${OBJECT}.jpg?token=synthetic-signed-url` });
    }
    assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('select'), 'avatar_url'); assert.equal(url.searchParams.get('id'), `eq.${USER}`);
    return response([{ avatar_url: target === 'remove' ? `profile-avatars/${USER}/88888888-8888-4888-8888-888888888888.jpg` : null }]);
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
    if (changed || userHttpReads < (target === 'rpc' ? 2 : 3) || coordinator.getAuthSessionOperationSnapshot().busy) return;
    changed = true;
    if (expireAfterIdentity) values.set(storageKey, JSON.stringify(expired));
    afterIdentity?.({ values, storageKey });
    if (foreignAfterIdentity) foreignOperation = coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: foreignOwner });
  });
  observed = true;
  return { coordinator, profile, events, client, get getterReads() { return getterReads; },
    config, get atWriteBoundary() { return changed; },
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

function returnedProfile() { return { id: USER, email: 'synthetic@example.invalid', username: INPUT.username, username_claimed_at: '2026-10-12T00:00:00.000Z', username_provenance: 'registration', display_name: INPUT.displayName, avatar_url: null, app_role: 'user', account_status: 'active', suspended_at: null, suspension_reason: null, created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z' }; }
const writeFailure = (message, status = 503) => new Response(JSON.stringify({ message, code: 'SYNTHETIC', error: 'synthetic', statusCode: String(status) }), { status, headers: { 'content-type': 'application/json' } });
const avatar = { uri: 'file:///synthetic.jpg', mimeType: 'image/jpeg', base64: Buffer.from([255, 216, 255, 219, 0, 1]).toString('base64') };
const save = (f, kind) => f.profile.saveProfileEdits(USER, kind === 'rpc' ? INPUT : { ...INPUT, avatar: kind === 'remove' ? null : avatar });
const outcomeOf = promise => promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
const writes = (f, kind) => f.events.filter(event => event.action === 'http' && event.phase === kind);
const authEvents = f => f.events.filter(event => ['auth-storage', 'user', 'refresh'].includes(event.phase));
test('upload admission preserves uncertain journal and rejects foreign Auth before any POST', { timeout: 10000 }, async t => {
  const f = await fixture({ target: 'upload', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    const result = await outcomeOf(save(f, 'upload')), foreign = f.events.filter(event => event.foreignOwner), entry = await f.journalEntry();
    t.diagnostic(JSON.stringify({ scenario: 'profile-upload-admission', busyError: f.coordinator.isAuthSessionOperationBusyError(result.error), foreignRefresh: foreign.filter(event => event.phase === 'refresh').length, foreignSessionWrites: foreign.filter(event => event.phase === 'auth-storage' && event.action === 'set').length, uploadPosts: writes(f, 'upload').length, rpcPosts: writes(f, 'rpc').length, journalPhase: entry?.phase, ownerStillBusy: f.foreignOwnerActive }));
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(result.error), true);
    assert.equal(foreign.filter(event => event.phase === 'refresh' || event.phase === 'upload' || event.phase === 'auth-storage' && event.action === 'set').length, 0);
    assert.equal(entry.phase, 'uncertain'); assert.equal(entry.candidatePath, `${USER}/${OBJECT}.jpg`);
    assert.equal(writes(f, 'rpc').length, 0); assert.equal(f.events.filter(event => event.phase === 'journal' && event.action === 'remove').length, 0);
    assert.equal(f.foreignOwnerActive, true); await f.releaseForeign(); assert.equal(writes(f, 'upload').length, 0);
  } finally { await f.dispose(); }
});
test('rpc admission rejects foreign Auth owner before implicit refresh, storage write or POST', { timeout: 10000 }, async t => {
  const f = await fixture({ target: 'rpc', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    const result = await outcomeOf(save(f, 'rpc')), foreign = f.events.filter(event => event.foreignOwner);
    t.diagnostic(JSON.stringify({ scenario: 'profile-rpc-admission', busyError: f.coordinator.isAuthSessionOperationBusyError(result.error), foreignRefresh: foreign.filter(event => event.phase === 'refresh').length, foreignSessionWrites: foreign.filter(event => event.phase === 'auth-storage' && event.action === 'set').length, rpcPosts: writes(f, 'rpc').length, ownerStillBusy: f.foreignOwnerActive }));
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(result.error), true);
    assert.equal(foreign.filter(event => event.phase === 'refresh' || event.phase === 'rpc' || event.phase === 'auth-storage' && event.action === 'set').length, 0);
    assert.equal(f.foreignOwnerActive, true); assert.equal(await f.journalEntry(), null);
    await f.releaseForeign(); assert.equal(writes(f, 'rpc').length, 0);
  } finally { await f.dispose(); }
});

async function assertUncertain(f, kind) {
  const entry = await f.journalEntry();
  if (kind === 'rpc') assert.equal(entry, null);
  else { assert.equal(entry.phase, 'uncertain'); assert.equal(f.events.filter(event => event.phase === 'journal' && event.action === 'remove').length, 0); }
}
for (const kind of ['rpc', 'upload']) {
  test(`${kind}: original body, headers and result/error survive with HTTP outside Auth lock`, { timeout: 10000 }, async () => {
    const f = await fixture({ target: kind });
    try {
      const result = await outcomeOf(save(f, kind));
      if (kind === 'rpc') { assert.equal(result.status, 'fulfilled'); assert.equal(result.value.profile.id, USER); assert.equal(result.value.avatarCleanup, 'not-needed'); }
      else { assert.equal(result.status, 'rejected'); assert.match(result.error.message, /Synthetic upload stop/); await assertUncertain(f, kind); }
      assert.equal(writes(f, kind).length, 1); assert.equal(writes(f, kind)[0].busy, false);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      assert.equal(f.events.filter(event => event.phase === 'refresh' || event.phase === 'auth-storage' && event.action === 'set').length, 0);
    } finally { await f.dispose(); }
  });
  test(`${kind}: expired session refresh and delayed real SDK write remain owned`, { timeout: 10000 }, async () => {
    const f = await fixture({ target: kind, expireAfterIdentity: true }), entered = deferred(), write = deferred();
    f.setStorageHook(event => { if (f.atWriteBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(save(f, kind));
    try {
      await entered.promise; assert.equal(writes(f, kind).length, 0);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      write.resolve(); await pending; assert.equal(f.rotatedStored, true);
      assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      assert.equal(writes(f, kind).length, 1); assert.equal(writes(f, kind)[0].busy, false);
    } finally { write.resolve(); await pending; await f.dispose(); }
  });
  test(`${kind}: caller timeout retains late SDK without late POST or journal cleanup`, { timeout: 10000 }, async t => {
    const f = await fixture({ target: kind, expireAfterIdentity: true }), entered = deferred(), write = deferred();
    f.setStorageHook(event => { if (f.atWriteBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
    const pending = outcomeOf(save(f, kind));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [20000]); f.fireTimer();
      const result = await pending; assert.ok(result.error instanceof f.profile.ProfileEditTimeoutError);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true); await assertUncertain(f, kind);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      const idle = f.whenIdle(); write.resolve(); await idle; await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.rotatedStored, true); assert.equal(writes(f, kind).length, 0); await assertUncertain(f, kind);
      assert.ok(authEvents(f).every(event => event.busy && event.kind === 'session-read'));
      t.diagnostic(JSON.stringify({ scenario: 'profile-write-late-sdk', kind, callerTimedOut: true, realSdkWriteSettled: true, latePosts: 0, journalRemoved: false, cancellationClaimed: false }));
    } finally { write.resolve(); await pending; await f.dispose(); }
  });
  test(`${kind}: HTTP pending permits another actual session read`, { timeout: 10000 }, async () => {
    const f = await fixture({ target: kind }), entered = deferred(), reply = deferred();
    f.setDataHandler(() => { entered.resolve(); return reply.promise; });
    const pending = outcomeOf(save(f, kind));
    try {
      await entered.promise; assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      const result = await f.coordinator.runAuthSessionOperation(() => f.client.auth.getSession(), { kind: 'session-read' });
      assert.equal(result.data.session.user.id, USER);
      reply.resolve(kind === 'rpc' ? response(returnedProfile()) : writeFailure('Synthetic upload stop', 403)); await pending;
      assert.equal(writes(f, kind).length, 1);
    } finally { reply.resolve(writeFailure('Synthetic pending stop')); await pending; await f.dispose(); }
  });
  test(`${kind}: Auth7s leaves13s of original20s, not a fresh20s`, { timeout: 10000 }, async t => {
    const f = await fixture({ target: kind }), entered = deferred(), reply = deferred(); let advanced = false;
    f.setStorageHook(event => { if (f.atWriteBoundary && !advanced && event.action === 'get') { advanced = true; f.advance(7000); } });
    f.setDataHandler(() => { entered.resolve(); return reply.promise; });
    const pending = outcomeOf(save(f, kind));
    try {
      await entered.promise; assert.deepEqual(f.timerBudgets, [13000]); f.fireTimer();
      assert.ok((await pending).error instanceof f.profile.ProfileEditTimeoutError);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); await assertUncertain(f, kind);
      assert.equal(writes(f, kind).length, 1);
      t.diagnostic(JSON.stringify({ scenario: 'profile-write-shared-deadline', kind, authElapsedMs: 7000, writeBudgetMs: 13000, totalBudgetMs: 20000, dispatchedWriteCancelled: false }));
    } finally { reply.resolve(writeFailure('Synthetic late reply')); await pending; await f.dispose(); }
  });
  for (const state of ['missing', 'different-user']) test(`${kind}: ${state} session refuses write and retains uncertain intent`, { timeout: 10000 }, async () => {
    let f; f = await fixture({ target: kind, afterIdentity: () => state === 'missing' ? f.clearSession() : f.switchUser() });
    try {
      await assert.rejects(save(f, kind), /当前账户与待编辑资料不一致/);
      assert.equal(writes(f, kind).length, 0); await assertUncertain(f, kind);
    } finally { await f.dispose(); }
  });
  test(`${kind}: gateway503 never automatically replays mutation`, { timeout: 10000 }, async () => {
    const f = await fixture({ target: kind }); f.setDataHandler(() => writeFailure('Synthetic write unavailable'));
    try { await assert.rejects(save(f, kind), /Synthetic write unavailable/); assert.equal(writes(f, kind).length, 1); await assertUncertain(f, kind); }
    finally { await f.dispose(); }
  });
  test(`${kind}: actual Auth storage error is preserved without write`, { timeout: 10000 }, async () => {
    const f = await fixture({ target: kind }), failure = new Error('synthetic write-session storage error');
    f.setStorageHook(() => { if (f.atWriteBoundary) throw failure; });
    try { await assert.rejects(save(f, kind), error => error === failure); assert.equal(writes(f, kind).length, 0); await assertUncertain(f, kind); }
    finally { await f.dispose(); }
  });
}
test('remove-avatar RPC Busy after arm retains uncertain intent and never cleans or replays', { timeout: 10000 }, async () => {
  const f = await fixture({ target: 'remove', foreignAfterIdentity: true, expireAfterIdentity: true });
  try {
    await assert.rejects(save(f, 'remove'), f.coordinator.isAuthSessionOperationBusyError); await assertUncertain(f, 'remove');
    assert.equal((await f.journalEntry()).candidatePath, null); assert.equal(writes(f, 'rpc').length, 0);
    assert.equal(f.events.filter(event => event.phase === 'refresh' || event.phase === 'upload').length, 0);
    await f.releaseForeign(); assert.equal(writes(f, 'rpc').length, 0);
  } finally { await f.dispose(); }
});
test('remove-avatar RPC Auth timeout retains uncertain journal after late SDK settles', { timeout: 10000 }, async () => {
  const f = await fixture({ target: 'remove', expireAfterIdentity: true }), entered = deferred(), write = deferred();
  f.setStorageHook(event => { if (f.atWriteBoundary && event.action === 'set') { entered.resolve(); return write.promise; } });
  const pending = outcomeOf(save(f, 'remove'));
  try {
    await entered.promise; f.fireTimer(); assert.ok((await pending).error instanceof f.profile.ProfileEditTimeoutError);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true); await assertUncertain(f, 'remove');
    const idle = f.whenIdle(); write.resolve(); await idle; await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes(f, 'rpc').length, 0); await assertUncertain(f, 'remove');
  } finally { write.resolve(); await pending; await f.dispose(); }
});
test('RPC unverifiable success is not falsely published as saved', { timeout: 10000 }, async () => {
  const f = await fixture(); f.setDataHandler(() => response({ id: USER }));
  try { await assert.rejects(save(f, 'rpc'), /返回结果无法验证/); assert.equal(writes(f, 'rpc').length, 1); }
  finally { await f.dispose(); }
});
test('upload quota error keeps original user mapping and uncertain journal', { timeout: 10000 }, async () => {
  const f = await fixture({ target: 'upload' }); f.setDataHandler(() => writeFailure('avatar_quota_exceeded', 400));
  try { await assert.rejects(save(f, 'upload'), /头像存储空间已满/); assert.equal(writes(f, 'upload').length, 1); assert.equal(writes(f, 'rpc').length, 0); await assertUncertain(f, 'upload'); }
  finally { await f.dispose(); }
});
