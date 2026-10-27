// Production entry/service/coordinator and public installed Auth SDK. Browser,
// native platform, storage, sessions and HTTP below are synthetic boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthClient } from '@supabase/supabase-js';

const ROOT = new URL('../', import.meta.url);
// Public callback allowlist is exact. This is only a parsed string; no request
// is sent to the production links host or any non-fixture transport.
const ORIGIN = 'https://links.dosorobotics.com';
let sequence = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture(target, { enabled = true } = {}) {
  const modules = new Map(), values = new Map(), events = [], browserCalls = [];
  const storageKey = `social-fixture-${++sequence}`;
  let auth, api, storageHook, browserHandler, fetchHandler, externalOwner = null, getterReads = 0;
  const keyKind = key => key === storageKey ? 'session' : key === `${storageKey}-code-verifier` ? 'legacy-verifier'
    : key === `${storageKey}-flows-code-verifier` ? 'flow-index' : key.startsWith(`${storageKey}-flow-`) ? 'flow-slot' : 'other';
  const record = (action, kind) => {
    const state = api.coordinator.getAuthSessionOperationSnapshot();
    const event = { action, kind, busy: state.busy, operation: state.kind, externalOwner: externalOwner !== null && state.owner === externalOwner };
    events.push(event); return event;
  };
  const env = { EXPO_PUBLIC_AUTH_LINK_ORIGIN: ORIGIN, EXPO_PUBLIC_APPLE_AUTH_ENABLED: String(enabled), EXPO_PUBLIC_WECHAT_AUTH_ENABLED: String(enabled), EXPO_PUBLIC_QQ_AUTH_ENABLED: String(enabled), EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER: 'custom:wechat', EXPO_PUBLIC_QQ_SUPABASE_PROVIDER: 'custom:qq' };
  const stubs = {
    'expo-web-browser': {
      maybeCompleteAuthSession() {},
      async openAuthSessionAsync(url, redirect, options) {
        const parsed = new URL(url);
        assert.equal(parsed.origin, 'https://social-fixture.supabase.co');
        assert.equal(parsed.pathname, '/auth/v1/authorize');
        assert.ok(parsed.searchParams.get('code_challenge'));
        assert.equal(redirect, `${ORIGIN}/auth/callback`);
        assert.equal(options.preferEphemeralSession, false);
        assert.equal(options.showInRecents, true);
        const state = api.coordinator.getAuthSessionOperationSnapshot();
        browserCalls.push({ provider: parsed.searchParams.get('provider'), busy: state.busy });
        return browserHandler ? browserHandler() : { type: 'cancel' };
      },
    },
    // These methods cannot be called by the Android OAuth path under test.
    'expo-apple-authentication': {}, 'expo-crypto': {}, 'expo-secure-store': {},
    'react-native': { Platform: { OS: 'android' } },
  };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, URL, URLSearchParams, Promise, Set, Map, RegExp, console, process: { env }, require(name) {
      if (name === './supabaseClient') return { getSupabaseClient() { getterReads++; return { auth }; } };
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
      throw new Error(`Unexpected social fixture dependency: ${name}`);
    } }, { filename: path });
    return module.exports;
  };
  api = { coordinator: load('src/services/authSessionOperation.ts'), service: load('src/services/authService.ts'), social: load(`src/services/socialAuthService${target === 'native' ? '.native' : ''}.ts`) };
  auth = new AuthClient({ url: 'https://social-fixture.supabase.co/auth/v1', headers: { apikey: 'sb_publishable_fixture', Authorization: 'Bearer sb_publishable_fixture' }, storageKey,
    autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce',
    storage: {
      async getItem(key) { const event = record('get', keyKind(key)); await storageHook?.(event); return values.get(key) ?? null; },
      async setItem(key, value) { const event = record('set', keyKind(key)); await storageHook?.(event); values.set(key, value); },
      async removeItem(key) { const event = record('remove', keyKind(key)); await storageHook?.(event); values.delete(key); },
    },
    async fetch(input, init) { record('http', 'callback-exchange'); if (!fetchHandler) throw new Error('Unexpected fixture HTTP'); return fetchHandler(input, init); },
  });
  assert.equal((await auth.initialize()).error, null);
  events.length = 0;
  return { ...api, auth, events, browserCalls, values, storageKey,
    get getterReads() { return getterReads; },
    setExternalOwner(value) { externalOwner = value; },
    setStorageHook(value) { storageHook = value; }, setBrowserHandler(value) { browserHandler = value; }, setFetchHandler(value) { fetchHandler = value; },
    dispose: () => auth.dispose(),
  };
}
async function assertBusyOAuth(target, t) {
  const f = await fixture(target), hold = deferred(), owner = {};
  f.setExternalOwner(owner);
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  try {
    const outcome = await f.social.signIn('wechat').then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'social-oauth-busy', target, outcome: outcome.status, getterReads: f.getterReads, storageOperations: f.events.length, verifierStored: f.values.has(`${f.storageKey}-code-verifier`), browserLaunches: f.browserCalls.length, externalOwnerStillBusy: f.coordinator.getAuthSessionOperationSnapshot().owner === owner }));
    assert.equal(outcome.status, 'rejected');
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(f.getterReads, 0);
    assert.deepEqual(f.events, []);
    assert.equal(f.values.size, 0);
    assert.equal(f.browserCalls.length, 0);
  } finally { hold.resolve(); await existing; await f.dispose(); }
}

test('native OAuth busy rejection precedes getter, real PKCE storage and browser launch', { timeout: 5000 }, t => assertBusyOAuth('native', t));

test('default OAuth busy rejection precedes getter, real PKCE storage and browser launch', { timeout: 5000 }, t => assertBusyOAuth('default', t));

for (const target of ['native', 'default']) {
  test(`${target} OAuth owns delayed PKCE preparation, then releases before browser cancellation`, { timeout: 5000 }, async t => {
    const f = await fixture(target), entered = deferred(), write = deferred();
    f.setStorageHook(event => {
      if (event.action === 'set' && event.kind === 'flow-slot') { entered.resolve(); return write.promise; }
    });
    const pending = f.social.signIn('qq');
    try {
      await entered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      assert.equal(f.browserCalls.length, 0);
      await assert.rejects(f.service.sendPasswordRecoveryOtp('synthetic@example.invalid'), f.coordinator.isAuthSessionOperationBusyError);
      write.resolve();
      assert.equal((await pending).status, 'cancelled');
      assert.ok(f.events.length > 0);
      assert.ok(f.events.every(event => event.busy && event.operation === 'session-write' && !event.externalOwner));
      assert.deepEqual(f.browserCalls, [{ provider: 'custom:qq', busy: false }]);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(f.values.has(`${f.storageKey}-code-verifier`), true, 'cancellation does not pretend to remove pending SDK material');
      t.diagnostic(JSON.stringify({ scenario: 'social-owned-pkce', target, storageOperations: f.events.length, allOwned: true, browserBusy: false, finalBusy: false, cancellationIsCleanup: false }));
    } finally { write.resolve(); await pending.catch(() => undefined); await f.dispose(); }
  });

  test(`${target} OAuth storage failure retains ownership until the actual write rejects and preserves the error`, { timeout: 5000 }, async () => {
    const f = await fixture(target), entered = deferred(), write = deferred(), failure = new Error('synthetic PKCE storage failure');
    f.setStorageHook(event => {
      if (event.action === 'set' && event.kind === 'flow-slot') { entered.resolve(); return write.promise; }
    });
    const pending = f.social.signIn('wechat').catch(error => error);
    try {
      await entered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      write.reject(failure);
      assert.equal(await pending, failure);
      assert.equal(f.browserCalls.length, 0);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(await f.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    } finally { write.resolve(); await pending; await f.dispose(); }
  });

  test(`${target} pending browser does not block the production PKCE callback exchange`, { timeout: 5000 }, async t => {
    const f = await fixture(target), browserEntered = deferred(), browser = deferred(), tokenEntered = deferred(), tokenReply = deferred();
    const callbackUrl = `${ORIGIN}/auth/callback?code=synthetic-auth-code`;
    const userId = '11111111-1111-4111-8111-111111111111';
    const sessionId = '22222222-2222-4222-8222-222222222222';
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const session = { access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: sessionId, exp: expiresAt })}.synthetic`, refresh_token: 'synthetic-social-refresh', token_type: 'bearer', expires_in: 3600, user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
    f.setBrowserHandler(() => { browserEntered.resolve(); return browser.promise; });
    f.setFetchHandler((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.origin, 'https://social-fixture.supabase.co');
      assert.equal(url.pathname, '/auth/v1/token');
      assert.equal(url.searchParams.get('grant_type'), 'pkce');
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal(body.auth_code, 'synthetic-auth-code');
      assert.equal(typeof body.code_verifier, 'string');
      assert.ok(body.code_verifier.length > 0);
      tokenEntered.resolve(); return tokenReply.promise;
    });
    const pending = f.social.signIn('apple');
    let exchange;
    try {
      await browserEntered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.deepEqual(f.browserCalls, [{ provider: 'apple', busy: false }]);
      exchange = f.service.exchangeSessionFromUrl(callbackUrl);
      await tokenEntered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.service.sendPasswordRecoveryOtp('synthetic@example.invalid'), f.coordinator.isAuthSessionOperationBusyError);
      tokenReply.resolve(new Response(JSON.stringify(session), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } }));
      const result = await exchange;
      assert.equal(result.user.id, userId);
      assert.equal(f.events.filter(event => event.action === 'http').length, 1);
      assert.ok(f.events.every(event => event.busy));
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      browser.resolve({ type: 'success', url: callbackUrl });
      const browserResult = await pending;
      assert.equal(browserResult.status, 'callback');
      assert.equal(browserResult.callbackUrl, callbackUrl);
      t.diagnostic(JSON.stringify({ scenario: 'social-browser-callback', target, browserBusy: false, callbackRequests: 1, callbackCompletedWhileBrowserPending: true, finalBusy: false }));
    } finally {
      tokenReply.resolve(new Response(JSON.stringify(session), { headers: { 'content-type': 'application/json' } }));
      browser.resolve({ type: 'cancel' });
      await exchange?.catch(() => undefined); await pending.catch(() => undefined); await f.dispose();
    }
  });

  test(`${target} disabled providers cannot touch SDK storage or browser`, { timeout: 5000 }, async () => {
    const f = await fixture(target, { enabled: false });
    try {
      for (const provider of ['apple', 'wechat', 'qq']) {
        assert.equal(f.social.getSocialLoginReadiness(provider).ready, false);
        await assert.rejects(f.social.signIn(provider), /尚未启用/);
      }
      assert.equal(f.getterReads, 0);
      assert.deepEqual(f.events, []);
      assert.deepEqual(f.browserCalls, []);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally { await f.dispose(); }
  });

  test(`${target} invalid browser callback keeps its existing error and leaves no operation held`, { timeout: 5000 }, async () => {
    const f = await fixture(target);
    f.setBrowserHandler(() => ({ type: 'success', url: 'https://untrusted.example.invalid/auth/callback' }));
    try {
      await assert.rejects(f.social.signIn('wechat'), /微信登录回调无效/);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.deepEqual(f.browserCalls, [{ provider: 'custom:wechat', busy: false }]);
    } finally { await f.dispose(); }
  });
}
