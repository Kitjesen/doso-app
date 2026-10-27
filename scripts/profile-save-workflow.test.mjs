// Production save/journal/coordinator + installed public initialized SDK.
// Only native persistence/UUID/clock and HTTP are synthetic. No real server/RLS
// behavior is proved by this model; no SDK method or production method is replaced.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { StorageClient } from '@supabase/storage-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const ROOT = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '99999999-9999-4999-8999-999999999999';
const OPERATION_ID = '77777777-7777-4777-8777-777777777777';
const OLD = `${USER}/88888888-8888-4888-8888-888888888888.jpg`;
const CANDIDATE = `${USER}/${CANDIDATE_ID}.jpg`;
const persisted = path => path === null ? null : `profile-avatars/${path}`;
const INPUT = { username: 'pilot_01', displayName: 'Pilot' };
const JPEG = [255, 216, 255, 219, 0, 1];
const AVATAR = { uri: 'file:///synthetic.jpg', mimeType: 'image/jpeg', base64: Buffer.from(JPEG).toString('base64') };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const outcomeOf = promise => promise.then(value => ({ value }), error => ({ error }));
let sequence = 0;

function session() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: USER, session_id: OPERATION_ID, exp })}.synthetic`, refresh_token: 'synthetic-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id: USER, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
function profileValue(avatarValue) {
  return { id: USER, email: 'synthetic@example.invalid', username: INPUT.username, username_claimed_at: '2026-10-12T00:00:00.000Z', username_provenance: 'registration', display_name: INPUT.displayName, avatar_url: avatarValue, app_role: 'user', account_status: 'active', suspended_at: null, suspension_reason: null, created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z', avatar_managed_by_user: true };
}

async function fixture({ kind = 'replace', previous = OLD, fault = null } = {}) {
  const modules = new Map(), authStore = new Map(), journalStore = new Map(), events = [], timers = new Map();
  const initial = deferred(), fresh = session(), storageKey = `profile-save-workflow-${++sequence}`;
  const config = { url: 'https://profile-workflow-fixture.supabase.co', publishableKey: 'sb_publishable_fixture' };
  const objects = new Set(previous === null ? [] : [previous]);
  const uuids = kind === 'replace' ? [CANDIDATE_ID, OPERATION_ID] : kind === 'remove' && previous ? [OPERATION_ID] : [];
  let coordinator, observed = false, storedAvatar = persisted(previous), now = 0, startRead = true, hook;
  authStore.set(storageKey, JSON.stringify(fresh));
  const journalEntry = () => { const raw = journalStore.get(`doso.avatar-journal.v1.${USER}`); return raw ? JSON.parse(raw) : null; };
  const record = (action, phase, extra = {}) => {
    if (!observed) return;
    const state = coordinator.getAuthSessionOperationSnapshot();
    events.push({ action, phase, busy: state.busy, kind: state.kind, journalPhase: journalEntry()?.phase ?? null, ...extra });
  };
  const commitProfile = () => {
    if (kind === 'replace') { assert.ok(objects.has(CANDIDATE)); storedAvatar = persisted(CANDIDATE); }
    if (kind === 'remove') storedAvatar = null;
    return profileValue(storedAvatar);
  };
  const transport = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url), headers = new Headers(init.headers);
    assert.equal(url.origin, config.url, 'All HTTP stays at synthetic origin');
    const phase = url.pathname === '/auth/v1/user' ? 'user'
      : url.pathname === '/rest/v1/profiles' ? (startRead ? (startRead = false, 'select') : 'readback')
      : url.pathname === `/storage/v1/object/profile-avatars/${CANDIDATE}` ? 'upload'
      : url.pathname === '/rest/v1/rpc/update_my_profile' ? 'rpc'
      : url.pathname === '/rest/v1/rpc/prepare_my_profile_avatar_cleanup' ? 'retire'
      : url.pathname === '/storage/v1/object/profile-avatars' ? 'delete' : 'unexpected';
    assert.notEqual(phase, 'unexpected', 'Unexpected HTTP is forbidden, including refresh and signed URLs');
    record('http', phase);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.equal(headers.get('authorization'), `Bearer ${fresh.access_token}`, 'Synthetic bearer stays request-local; value is not emitted');
    if (phase === 'user') { assert.equal(init.method, 'GET'); return response(fresh.user); }
    if (phase === 'select' || phase === 'readback') {
      assert.equal(init.method, 'GET'); assert.equal(headers.get('accept-profile'), 'public');
      assert.equal(url.searchParams.get('select'), 'avatar_url'); assert.equal(url.searchParams.get('id'), `eq.${USER}`);
      return response([{ avatar_url: storedAvatar }]);
    }
    if (phase === 'upload') {
      assert.equal(init.method, 'POST'); assert.equal(headers.get('content-type'), 'image/jpeg');
      assert.equal(headers.get('cache-control'), 'max-age=3600'); assert.equal(headers.get('x-upsert'), 'false');
      assert.deepEqual([...new Uint8Array(init.body)], JPEG); assert.equal(journalEntry().phase, 'uncertain');
      assert.equal(journalEntry().candidatePath, CANDIDATE); assert.equal(journalEntry().operationId, OPERATION_ID);
      assert.equal(objects.has(CANDIDATE), false); objects.add(CANDIDATE);
      // Actual storage-js HTTP schema maps Id/Key, not a client-shaped data object.
      return response({ Id: CANDIDATE_ID, Key: persisted(CANDIDATE) });
    }
    const body = JSON.parse(init.body);
    if (phase === 'rpc') {
      assert.equal(init.method, 'POST'); assert.equal(headers.get('content-profile'), 'public');
      assert.deepEqual(body, { p_expected_user_id: USER, p_username: INPUT.username, p_display_name: INPUT.displayName, p_avatar_action: kind, p_avatar_path: kind === 'replace' ? persisted(CANDIDATE) : null });
      if ((kind !== 'keep' && previous !== null) || kind === 'replace') assert.equal(journalEntry().phase, 'uncertain');
      if (hook) { const reply = await hook(phase); if (reply !== undefined) { record('http-settled', phase); return reply; } }
      const saved = commitProfile();
      return response(fault === 'unverifiable' ? { id: USER } : saved);
    }
    assert.equal(journalEntry().phase, 'committed', 'Known commit is durably recorded before cleanup');
    if (phase === 'retire') {
      assert.equal(init.method, 'POST'); assert.equal(headers.get('content-profile'), 'public');
      assert.deepEqual(body, { p_expected_user_id: USER, p_object_path: previous });
      assert.notEqual(storedAvatar, persisted(previous));
      return response({ status: objects.has(previous) ? 'retired' : 'retired-missing', ownerId: USER, objectPath: previous });
    }
    assert.equal(init.method, 'DELETE'); assert.deepEqual(body, { prefixes: [previous] });
    assert.notEqual(previous, CANDIDATE, 'Success cleanup must not delete the new candidate');
    if (fault === 'cleanup403') return response({ message: 'Synthetic cleanup denied', statusCode: '403', error: 'Unauthorized' }, 403);
    objects.delete(previous); return response([{ name: previous }]);
  };
  const client = createClient(config.url, config.publishableKey, { auth: { storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce', storage: {
    async getItem(key) { record('get', 'auth-storage'); return authStore.get(key) ?? null; },
    async setItem(key, value) { record('set', 'auth-storage'); authStore.set(key, value); },
    async removeItem(key) { record('remove', 'auth-storage'); authStore.delete(key); },
  } }, global: { fetch: createAuthRequestFetch(transport, { timeoutMs: 5000 }) } });
  const stubs = {
    'expo-crypto': { randomUUID() { assert.ok(uuids.length, 'Unexpected replay generated another UUID'); return uuids.shift(); } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      async getItemAsync(key) { record('get', 'journal'); return journalStore.get(key) ?? null; },
      async setItemAsync(key, value) { journalStore.set(key, value); record('set', 'journal'); },
      async deleteItemAsync(key) { record('remove', 'journal'); journalStore.delete(key); },
    },
    'react-native': { Platform: { OS: 'android' } },
  };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, Promise, Map, Set, RegExp, URL, URLSearchParams, ArrayBuffer, Uint8Array, performance: { now: () => now },
      setTimeout(callback, ms) { const id = {}; timers.set(id, { callback, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, fetch: transport,
      require(name) {
        if (name === '@supabase/postgrest-js') return { PostgrestClient };
        if (name === '@supabase/storage-js') return { StorageClient };
        if (name === './supabaseClient') return { supabaseConfig: config, SupabaseConfigurationError: class extends Error {}, getSupabaseClient: () => client };
        if (Object.hasOwn(stubs, name)) return stubs[name];
        if (name.startsWith('./')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected workflow dependency: ${name}`);
      },
    }, { filename: path }); return module.exports;
  };
  coordinator = load('src/services/authSessionOperation.ts');
  const service = load('src/services/profileEditing.ts');
  const subscription = client.auth.onAuthStateChange(event => { if (event === 'INITIAL_SESSION') initial.resolve(); }).data.subscription;
  assert.equal((await client.auth.initialize()).error, null); await initial.promise;
  assert.equal((await client.auth.getSession()).error, null); subscription.unsubscribe(); observed = true;
  return { events, objects, service, commitProfile, get storedAvatar() { return storedAvatar; },
    setFault(value) { fault = value; }, setHook(value) { hook = value; },
    save(input = { ...INPUT, ...(kind === 'keep' ? {} : { avatar: kind === 'remove' ? null : AVATAR }) }) { startRead = true; return service.saveProfileEdits(USER, input); },
    journal: () => load('src/services/profileAvatarJournal.ts').profileAvatarJournal.read(USER),
    fireTimer() { assert.equal(timers.size, 1); const [id, timer] = timers.entries().next().value; assert.equal(timer.ms, 20000); timers.delete(id); now += timer.ms; timer.callback(); },
    async dispose() { assert.equal(timers.size, 0); await client.auth.dispose(); await client.removeAllChannels(); },
  };
}
const dataPhases = f => f.events.filter(e => e.action === 'http' && e.phase !== 'user').map(e => e.phase);
function assertOwnership(f) {
  const auth = f.events.filter(e => e.phase === 'auth-storage' || e.phase === 'user');
  assert.ok(auth.length > 0); assert.ok(auth.every(e => e.busy && e.kind === 'session-read'));
  assert.ok(f.events.filter(e => e.action === 'http' && e.phase !== 'user').every(e => !e.busy));
}
function assertJournalClearedAfterProof(f, phases = ['prepared', 'uncertain', 'committed']) {
  assert.deepEqual(f.events.filter(e => e.phase === 'journal' && e.action === 'set').map(e => e.journalPhase), phases);
  const clear = f.events.findIndex(e => e.phase === 'journal' && e.action === 'remove');
  const readback = f.events.findLastIndex(e => e.action === 'http' && e.phase === 'readback');
  assert.ok(clear > readback && readback >= 0);
  assert.ok(f.events.slice(readback + 1, clear).some(e => e.action === 'http' && e.phase === 'user'), 'Final identity check precedes journal removal');
}

for (const [name, options, expected, phases, remaining] of [
  ['replacement', {}, persisted(CANDIDATE), ['select', 'upload', 'rpc', 'retire', 'delete', 'readback'], [CANDIDATE]],
  ['first avatar', { previous: null }, persisted(CANDIDATE), ['select', 'upload', 'rpc', 'readback'], [CANDIDATE]],
  ['removal', { kind: 'remove' }, null, ['select', 'rpc', 'retire', 'delete', 'readback'], []],
  ['text-only keep', { kind: 'keep' }, persisted(OLD), ['select', 'rpc'], [OLD]],
]) test(`public SDK complete new save: ${name}`, { timeout: 10000 }, async t => {
  const f = await fixture(options);
  try {
    const result = await f.save(); assert.equal(result.profile.avatar_url, expected); assert.equal(f.storedAvatar, expected);
    assert.equal(result.profile.username, INPUT.username); assert.equal(result.profile.display_name, INPUT.displayName);
    assert.equal(result.avatarCleanup, phases.includes('delete') ? 'removed' : 'not-needed');
    assert.deepEqual(dataPhases(f), phases); assert.deepEqual([...f.objects].sort(), remaining.sort());
    assert.equal(await f.journal(), null); assertOwnership(f);
    if (options.kind === 'keep') assert.equal(f.events.filter(e => e.phase === 'journal' && e.action !== 'get').length, 0);
    else assertJournalClearedAfterProof(f);
    t.diagnostic(JSON.stringify({ scenario: 'public-sdk-new-save', name, phases, syntheticObjectsRemaining: f.objects.size, journalAbsent: true, journalUsed: options.kind !== 'keep', nativeOrCloudPass: false }));
  } finally { await f.dispose(); }
});

test('verified new save with cleanup403 keeps committed debt; recovery does not replay form', { timeout: 10000 }, async () => {
  const f = await fixture({ fault: 'cleanup403' });
  try {
    const result = await f.save(); assert.equal(result.avatarCleanup, 'pending'); assert.equal(result.profile.avatar_url, persisted(CANDIDATE));
    assert.deepEqual(dataPhases(f), ['select', 'upload', 'rpc', 'retire', 'delete']);
    assert.equal((await f.journal()).phase, 'committed'); assert.deepEqual([...f.objects].sort(), [OLD, CANDIDATE].sort());
    assert.equal(f.events.filter(e => e.action === 'remove' && e.phase === 'journal').length, 0);
    f.setFault(null);
    await assert.rejects(f.save({ username: 'different_form', displayName: 'Do not replay', avatar: null }), /上次头像操作已核对/);
    assert.deepEqual(dataPhases(f), ['select', 'upload', 'rpc', 'retire', 'delete', 'select', 'retire', 'delete', 'readback']);
    assert.equal(await f.journal(), null); assert.deepEqual([...f.objects], [CANDIDATE]); assertOwnership(f);
    assertJournalClearedAfterProof(f, ['prepared', 'uncertain', 'committed', 'committed']);
  } finally { await f.dispose(); }
});

test('new upload with unverifiable RPC success preserves objects and committed journal without false saved result', { timeout: 10000 }, async () => {
  const f = await fixture({ fault: 'unverifiable' });
  try {
    await assert.rejects(f.save(), /返回结果无法验证/);
    assert.deepEqual(dataPhases(f), ['select', 'upload', 'rpc']); assert.equal(f.storedAvatar, persisted(CANDIDATE));
    assert.equal((await f.journal()).phase, 'committed'); assert.deepEqual([...f.objects].sort(), [OLD, CANDIDATE].sort());
    assert.equal(f.events.filter(e => e.action === 'remove' && e.phase === 'journal').length, 0); assertOwnership(f);
  } finally { await f.dispose(); }
});

test('dispatched RPC timeout can commit later; public recovery confirms new avatar without re-upload or RPC replay', { timeout: 10000 }, async t => {
  const f = await fixture(), entered = deferred(), reply = deferred();
  f.setHook(() => { entered.resolve(); return reply.promise; }); const pending = outcomeOf(f.save());
  try {
    await entered.promise; f.fireTimer(); const result = await pending;
    assert.ok(result.error instanceof f.service.ProfileEditTimeoutError); assert.equal((await f.journal()).phase, 'uncertain');
    assert.deepEqual(dataPhases(f), ['select', 'upload', 'rpc']); assert.equal(f.storedAvatar, persisted(OLD));
    reply.resolve(response(f.commitProfile())); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.events.filter(e => e.action === 'http-settled' && e.phase === 'rpc').length, 1);
    assert.equal((await f.journal()).phase, 'uncertain'); assert.deepEqual([...f.objects].sort(), [OLD, CANDIDATE].sort());
    await assert.rejects(f.save({ username: 'different_form', displayName: 'Do not replay', avatar: null }), /上次头像操作已核对/);
    assert.deepEqual(dataPhases(f), ['select', 'upload', 'rpc', 'select', 'retire', 'delete', 'readback']);
    assert.equal(await f.journal(), null); assert.deepEqual([...f.objects], [CANDIDATE]); assertOwnership(f); assertJournalClearedAfterProof(f);
    t.diagnostic(JSON.stringify({ scenario: 'public-sdk-late-rpc-recovery', callerTimedOut: true, syntheticServerCommittedLater: true, uploadPosts: 1, rpcPosts: 1, cancellationClaimed: false, nativeOrCloudPass: false }));
  } finally { reply.resolve(response(profileValue(f.storedAvatar))); await pending; await f.dispose(); }
});
