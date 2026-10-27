// Actual profile save/journal/coordinator + public AuthClient. Only platform
// persistence, HTTP, Data SDK and caller timer are controlled synthetic seams.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthClient, createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const ROOT = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const INPUT = { username: 'pilot_01', displayName: 'Pilot' };
let sequence = 0;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function session(label, lifetime = 3600) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: USER, session_id: SESSION, exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: USER, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const jsonResponse = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
function returnedProfile() { return { id: USER, email: 'synthetic@example.invalid', username: INPUT.username, username_claimed_at: '2026-10-12T00:00:00.000Z', username_provenance: 'registration', display_name: INPUT.displayName, avatar_url: null, app_role: 'user', account_status: 'active', suspended_at: null, suspension_reason: null, created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z' }; }
async function fixture({ coordinator: sharedCoordinator } = {}) {
  const modules = new Map(), values = new Map(), journalValues = new Map(), events = [];
  const storageKey = `profile-identity-${++sequence}`;
  const initial = session('initial'), expired = session('expired', -60), rotated = session('rotated');
  values.set(storageKey, JSON.stringify(initial));
  let api, auth, externalOwner = null, getterReads = 0, profileReads = 0, profileWrites = 0, journalReads = 0, storageHook, fetchHandler, lastUserRead;
  const sdk = { calls: 0, settled: 0 };
  const timers = new Map();
  const timerApi = {
    setTimeout(callback, ms) { if (ms === 20_000 || ms === 3_000) { const id = {}; timers.set(id, callback); return id; } return setTimeout(callback, ms); },
    clearTimeout(id) { if (timers.has(id)) timers.delete(id); else clearTimeout(id); },
  };
  const record = (action, phase) => {
    const snapshot = api.coordinator.getAuthSessionOperationSnapshot();
    const event = { action, phase, busy: snapshot.busy, kind: snapshot.kind, externalOwner: externalOwner !== null && snapshot.owner === externalOwner };
    events.push(event); return event;
  };
  const client = {
    auth: { getUser() { sdk.calls++; lastUserRead = auth.getUser().finally(() => { sdk.settled++; }); return lastUserRead; }, getSession() { return auth.getSession(); } },
    from(table) { assert.equal(table, 'profiles'); return { select: () => ({ eq: () => ({ maybeSingle: async () => { profileReads++; return { data: { avatar_url: null }, error: null }; } }) }) }; },
    async rpc(name) { assert.equal(name, 'update_my_profile'); profileWrites++; return { data: returnedProfile(), error: null }; },
    storage: { from() { throw new Error('No avatar storage call expected in identity-read fixture'); } },
  };
  const stubs = {
    'expo-crypto': { randomUUID: () => '99999999-9999-4999-8999-999999999999' },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      async getItemAsync(key) { journalReads++; return journalValues.get(key) ?? null; },
      async setItemAsync(key, value) { journalValues.set(key, value); },
      async deleteItemAsync(key) { journalValues.delete(key); },
    },
    'react-native': { Platform: { OS: 'android' } },
  };
  const load = path => {
    if (path === 'src/services/authSessionOperation.ts' && sharedCoordinator) return sharedCoordinator;
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, Promise, Map, Set, RegExp, URL, URLSearchParams, Uint8Array, ArrayBuffer, performance, console, fetch: async () => { throw new Error('Data HTTP is outside this identity fixture'); }, ...timerApi, require(name) {
      // Preserve this identity fixture's external Data stub; actual getSession
      // forwards to the same public AuthClient and production coordinator.
      if (name === '@supabase/postgrest-js') return { PostgrestClient: class { from(...args) { return client.from(...args); } rpc(...args) { return client.rpc(...args); } } };
      if (name === '@supabase/storage-js') return { StorageClient: class { from(...args) { return client.storage.from(...args); } } };
      if (name === './supabaseClient') return { supabaseConfig: { url: 'https://profile-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' }, SupabaseConfigurationError: class extends Error {}, getSupabaseClient() { getterReads++; return client; } };
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
      throw new Error(`Unexpected profile identity fixture dependency: ${name}`);
    } }, { filename: path });
    return module.exports;
  };
  api = { coordinator: load('src/services/authSessionOperation.ts'), profile: load('src/services/profileEditing.ts') };
  auth = new AuthClient({ url: 'https://profile-fixture.supabase.co/auth/v1', headers: { apikey: 'sb_publishable_fixture', Authorization: 'Bearer sb_publishable_fixture' }, storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
    storage: {
      async getItem(key) { const event = record('get', 'auth-storage'); await storageHook?.(event); return values.get(key) ?? null; },
      async setItem(key, value) { const event = record('set', 'auth-storage'); await storageHook?.(event); values.set(key, value); },
      async removeItem(key) { const event = record('remove', 'auth-storage'); await storageHook?.(event); values.delete(key); },
    },
    fetch: createAuthRequestFetch(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.origin, 'https://profile-fixture.supabase.co');
      const phase = url.pathname === '/auth/v1/token' ? 'refresh' : url.pathname === '/auth/v1/user' ? 'user' : 'unexpected';
      assert.notEqual(phase, 'unexpected');
      if (phase === 'refresh') { assert.equal(init.method, 'POST'); assert.equal(url.searchParams.get('grant_type'), 'refresh_token'); }
      else assert.equal(init.method, 'GET');
      record('http', phase);
      return fetchHandler ? fetchHandler(phase) : jsonResponse(phase === 'refresh' ? rotated : initial.user);
    }, { timeoutMs: 5000 }),
  });
  // Settle public initial delivery before mounting the controlled Provider;
  // otherwise a preceding fixture can leave this setup racing INITIAL.
  const initialDelivery = deferred();
  const initialSubscription = auth.onAuthStateChange(event => { if (event === 'INITIAL_SESSION') initialDelivery.resolve(); }).data.subscription;
  assert.equal((await auth.initialize()).error, null); await initialDelivery.promise;
  assert.equal((await auth.getSession()).error, null); initialSubscription.unsubscribe();
  assert.equal(events.filter(event => event.action === 'http').length, 0);
  events.length = 0;
  return { ...api, auth, events, values, storageKey, rotated, sdk,
    get counts() { return { getterReads, profileReads, profileWrites, journalReads }; },
    expire() { values.set(storageKey, JSON.stringify(expired)); },
    setExternalOwner(value) { externalOwner = value; }, setStorageHook(value) { storageHook = value; }, setFetchHandler(value) { fetchHandler = value; },
    expireIdentityTimer() { assert.equal(timers.size, 1); const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    waitForUserSettlement() { return lastUserRead; },
    async dispose() { timers.clear(); await auth.dispose(); },
  };
}

test('profile save busy rejection precedes getter, real user refresh and all profile/journal access', { timeout: 5000 }, async t => {
  const f = await fixture(), hold = deferred(), owner = {};
  f.expire(); f.setExternalOwner(owner);
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  try {
    const result = await f.profile.saveProfileEdits(USER, INPUT).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'profile-identity-busy', outcome: result.status, ...f.counts, authStorageWrites: f.events.filter(event => event.action === 'set').length, refreshRequests: f.events.filter(event => event.phase === 'refresh').length, userRequests: f.events.filter(event => event.phase === 'user').length, externalOwnerStillBusy: f.coordinator.getAuthSessionOperationSnapshot().owner === owner }));
    assert.equal(result.status, 'rejected');
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(result.error), true);
    assert.deepEqual(f.counts, { getterReads: 0, profileReads: 0, profileWrites: 0, journalReads: 0 });
    assert.deepEqual(f.events, []);
  } finally { hold.resolve(); await existing; await f.dispose(); }
});

test('expired profile identity read owns refresh, delayed storage write and every user read', { timeout: 5000 }, async t => {
  const f = await fixture(), entered = deferred(), write = deferred();
  f.expire();
  f.setStorageHook(event => { if (event.action === 'set') { entered.resolve(); return write.promise; } });
  const saving = f.profile.saveProfileEdits(USER, INPUT);
  try {
    await entered.promise;
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    assert.equal(f.counts.profileWrites, 0);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    write.resolve();
    const result = await saving;
    assert.equal(result.profile.id, USER);
    assert.equal(f.counts.profileWrites, 1);
    assert.equal(f.sdk.calls, 2);
    assert.equal(f.sdk.settled, 2);
    assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
    assert.ok(f.events.every(event => event.busy && event.kind === 'session-read'));
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    t.diagnostic(JSON.stringify({ scenario: 'profile-owned-refresh', refreshRequests: 1, userRequests: f.events.filter(event => event.phase === 'user').length, sdkReads: f.sdk.calls, profileWrites: f.counts.profileWrites, allAuthWorkOwned: true }));
  } finally { write.resolve(); await saving.catch(() => undefined); await f.dispose(); }
});

test('late refresh write and user request stay owned after profile caller timeout without resuming a save', { timeout: 5000 }, async t => {
  const f = await fixture(), refreshEntered = deferred(), refreshReply = deferred();
  f.expire();
  f.setFetchHandler(phase => { if (phase === 'refresh') { refreshEntered.resolve(); return refreshReply.promise; } return jsonResponse({ id: USER, aud: 'authenticated' }); });
  const outcome = f.profile.saveProfileEdits(USER, INPUT).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
  try {
    await refreshEntered.promise;
    f.expireIdentityTimer();
    const result = await outcome;
    assert.equal(result.status, 'rejected'); assert.ok(result.error instanceof f.profile.ProfileEditTimeoutError);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    refreshReply.resolve(jsonResponse(f.rotated));
    await f.waitForUserSettlement(); await Promise.resolve();
    assert.equal(f.sdk.settled, 1);
    assert.ok(f.events.some(event => event.action === 'set'), 'actual SDK refresh writes after caller timeout');
    assert.ok(f.events.every(event => event.busy && event.kind === 'session-read'));
    assert.equal(f.counts.profileReads + f.counts.profileWrites + f.counts.journalReads, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    t.diagnostic(JSON.stringify({ scenario: 'profile-late-refresh', lateStorageWrites: f.events.filter(event => event.action === 'set').length, allAuthWorkOwned: true, profileWrites: 0, finalBusy: false, serverCancellationClaimed: false }));
  } finally { refreshReply.resolve(jsonResponse(f.rotated)); await outcome; await f.waitForUserSettlement(); await f.dispose(); }
});

test('a mismatched verified user still prevents profile and journal access', { timeout: 5000 }, async () => {
  const f = await fixture();
  f.setFetchHandler(phase => { assert.equal(phase, 'user'); return jsonResponse({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }); });
  try {
    await assert.rejects(f.profile.saveProfileEdits(USER, INPUT), /当前账户与待编辑资料不一致/);
    assert.equal(f.counts.profileReads + f.counts.profileWrites + f.counts.journalReads, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('a thrown SDK storage error preserves its identity and releases the identity owner', { timeout: 5000 }, async () => {
  const f = await fixture(), failure = new Error('synthetic auth storage failure');
  f.setStorageHook(() => { throw failure; });
  try {
    await assert.rejects(f.profile.saveProfileEdits(USER, INPUT), error => error === failure);
    assert.equal(f.counts.profileReads + f.counts.profileWrites + f.counts.journalReads, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

function providerEnvironment(options) {
  // Reuse the existing controlled hooks/native host, not its tests or a
  // substitute Provider. Production Provider and profile save share its real
  // coordinator and the same actual public AuthClient via authClient below.
  const source = readFileSync(new URL('scripts/auth-provider-ingestion.test.mjs', ROOT), 'utf8');
  const file = ts.createSourceFile('provider-tests.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['USER_A', 'USER_B', 'session']);
  const selected = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'environment'
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.has(declaration.name.getText(file))));
  assert.equal(selected.length, 4);
  const module = { exports: {} };
  vm.runInNewContext(`${selected.map(node => node.getText(file)).join('\n')}\nmodule.exports=environment;`, {
    module, assert, ROOT, ts, vm, readFileSync, deferred, createClient, createAuthRequestFetch, Buffer,
    nodeRequire: createRequire(import.meta.url), Error, Promise, URL, URLSearchParams, Response, Request, Headers, AbortController,
    TextDecoder, Uint8Array, atob, performance, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, setImmediate,
  });
  return module.exports(options);
}

test('ordinary profile identity reads preserve actual Provider preparation without an auth event', { timeout: 10000 }, async () => {
  const authClient = { auth: null }, state = providerEnvironment({ authClient });
  const f = await fixture({ coordinator: state.coordinator }); authClient.auth = f.auth;
  const provider = state.mount(), entered = deferred(), reply = deferred();
  let saving;
  try {
    await provider.settle();
    const key = provider.value.preparedSessionKey; assert.ok(key);
    const registrations = state.observations.registeredUsers.length;
    f.setFetchHandler(phase => { assert.equal(phase, 'user'); entered.resolve(); return reply.promise.then(() => jsonResponse({ id: USER, aud: 'authenticated' })); });
    saving = f.profile.saveProfileEdits(USER, INPUT);
    await entered.promise; await provider.settle();
    assert.equal(provider.value.preparedSessionKey, key);
    assert.equal(provider.value.loading, false);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    reply.resolve(jsonResponse({ id: USER, aud: 'authenticated' }));
    await saving; await provider.settle();
    assert.equal(provider.value.preparedSessionKey, key);
    assert.equal(provider.value.loading, false);
    assert.equal(state.observations.registeredUsers.length, registrations);
  } finally { reply.resolve(jsonResponse({ id: USER })); await saving?.catch(() => undefined); provider.unmount(); await f.dispose(); }
});

test('real refresh events during a profile identity read still invalidate and reprepare the Provider', { timeout: 10000 }, async t => {
  const authClient = { auth: null }, state = providerEnvironment({ authClient });
  const f = await fixture({ coordinator: state.coordinator }); authClient.auth = f.auth;
  const provider = state.mount(), entered = deferred(), reply = deferred();
  let saving;
  try {
    await provider.settle();
    const oldKey = provider.value.preparedSessionKey; assert.ok(oldKey);
    f.expire();
    f.setFetchHandler(phase => {
      if (phase === 'refresh') return jsonResponse(f.rotated);
      entered.resolve(); return reply.promise.then(() => jsonResponse({ id: USER, aud: 'authenticated' }));
    });
    saving = f.profile.saveProfileEdits(USER, INPUT);
    await entered.promise; await provider.settle();
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    assert.equal(provider.value.preparedSessionKey, null, 'a real TOKEN_REFRESHED is not hidden by read intent');
    assert.equal(provider.value.loading, true);
    reply.resolve(); await saving; await provider.settle();
    assert.ok(provider.value.preparedSessionKey);
    assert.notEqual(provider.value.preparedSessionKey, oldKey);
    assert.equal(provider.value.loading, false);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(f.events.filter(event => event.phase === 'refresh').length, 1);
    t.diagnostic(JSON.stringify({ scenario: 'profile-provider-refresh', actualSdkRefreshRequests: 1, preparedInvalidatedDuringRead: true, newPreparedKey: true, finalBusy: false }));
  } finally { reply.resolve(); await saving?.catch(() => undefined); provider.unmount(); await f.dispose(); }
});

test('profile identity caller timeout cannot release a pending real SDK user read', { timeout: 5000 }, async t => {
  const f = await fixture(), entered = deferred(), reply = deferred();
  f.setFetchHandler(phase => { assert.equal(phase, 'user'); entered.resolve(); return reply.promise; });
  const outcome = f.profile.saveProfileEdits(USER, INPUT).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
  try {
    await entered.promise;
    f.expireIdentityTimer();
    const result = await outcome;
    t.diagnostic(JSON.stringify({ scenario: 'profile-identity-timeout', outcome: result.status, timeoutError: result.error instanceof f.profile.ProfileEditTimeoutError, busyAfterCallerTimeout: f.coordinator.getAuthSessionOperationSnapshot().busy, sdkCalls: f.sdk.calls, sdkSettled: f.sdk.settled, ...f.counts }));
    assert.equal(result.status, 'rejected');
    assert.ok(result.error instanceof f.profile.ProfileEditTimeoutError);
    assert.equal(result.error.outcomeMayBeUnknown, true);
    assert.equal(f.sdk.settled, 0);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
    await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
    reply.resolve(jsonResponse({ id: USER, aud: 'authenticated', app_metadata: {}, user_metadata: {} }));
    await f.waitForUserSettlement();
    await Promise.resolve();
    assert.equal(f.sdk.settled, 1);
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(f.counts.profileReads + f.counts.profileWrites + f.counts.journalReads, 0, 'late SDK success cannot resume the rejected save');
  } finally { reply.resolve(jsonResponse({ id: USER })); await outcome; await f.waitForUserSettlement(); await f.dispose(); }
});
