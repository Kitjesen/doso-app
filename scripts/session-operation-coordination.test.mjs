import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

function syntheticSession(userId, label) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: userId, exp: expiresAt, role: 'authenticated' })}.fixture`,
    refresh_token: `synthetic-refresh-${label}`,
    expires_at: expiresAt, expires_in: 3600, token_type: 'bearer',
    user: { id: userId, email: `${label.toLowerCase()}@fixture.invalid`, aud: 'authenticated',
      app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-16T00:00:00Z' },
  };
}

// Load actual production collaborators together so every entry shares the same
// module-level coordinator. Only SDK transport/native storage are test seams.
function productionModules(client, clock) {
  const modules = new Map();
  const load = url => {
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const module = { exports: {} };
    modules.set(url.href, module);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, Error, Promise, URL, URLSearchParams,
      Response, Headers, TextDecoder, Uint8Array, atob, performance,
      setTimeout: clock?.setTimeout ?? setTimeout, clearTimeout: clock?.clearTimeout ?? clearTimeout,
      performance: clock ? { now: () => clock.now } : performance, process: { env: {} },
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: () => client };
        if (name === 'react-native') return { Platform: { OS: 'android', Version: 35 } };
        if (name === 'expo-secure-store') return {
          getItemAsync: async () => '22222222-2222-4222-8222-222222222222', setItemAsync: async () => {},
        };
        if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
        throw new Error('Unexpected production fixture dependency');
      },
    });
    return module.exports;
  };
  return {
    load,
    auth: load(new URL('../src/services/authService.ts', import.meta.url)),
    sessions: load(new URL('../src/services/sessionService.ts', import.meta.url)),
  };
}

let sequence = 0;
function fixture({ clock, holdLogin = false } = {}) {
  const sessionA = syntheticSession('11111111-1111-4111-8111-111111111111', 'A');
  const sessionB = syntheticSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'B');
  const storageKey = `doso-coordination-fixture-${++sequence}`;
  const memory = new Map([[storageKey, JSON.stringify(sessionA)]]);
  const readEntered = deferred(), readReply = deferred(), refreshEntered = deferred(), refreshReply = deferred();
  let holdNextRead = false;
  const revokeReply = deferred(), logoutReply = deferred(), loginReply = deferred();
  const requests = [];
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storageKey,
      storage: { getItem: async key => {
          if (holdNextRead) { holdNextRead = false; readEntered.resolve(); await readReply.promise; }
          return memory.get(key) ?? null;
        },
        setItem: async (key, value) => { memory.set(key, value); },
        removeItem: async key => { memory.delete(key); } } },
    global: { fetch: async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/functions/v1/account-sessions')) {
        requests.push({ kind: 'revoke' });
        return revokeReply.promise;
      }
      if (url.includes('/auth/v1/logout')) {
        requests.push({ kind: 'logout' });
        return logoutReply.promise;
      }
      if (url.includes('/rest/v1/rpc/revoke_')) {
        requests.push({ kind: 'rpc' });
        return revokeReply.promise;
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        requests.push({ kind: 'login' });
        return holdLogin ? loginReply.promise : json(sessionB);
      }
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        requests.push({ kind: 'refresh' }); refreshEntered.resolve();
        return refreshReply.promise;
      }
      throw new Error('Unexpected fixture URL');
    } },
  });
  return { client, sessionB, requests, json, revokeReply, logoutReply, loginReply,
    readEntered, readReply, refreshEntered, refreshReply,
    expireStoredSession: () => memory.set(storageKey, JSON.stringify({ ...sessionA, expires_at: Math.floor(Date.now() / 1000) + 1 })),
    holdSessionRead: () => { holdNextRead = true; }, ...productionModules(client, clock) };
}

async function waitFor(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Expected fixture boundary was not reached');
}

test('an App-owned session read excludes a competing operation until its actual SDK read settles', { timeout: 10_000 }, async () => {
  const state = fixture();
  await state.client.auth.initialize();
  const coordinator = state.load(new URL('../src/services/authSessionOperation.ts', import.meta.url));
  state.holdSessionRead();
  const read = state.auth.getSession();
  try {
    await state.readEntered.promise;
    await assert.rejects(coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      coordinator.isAuthSessionOperationBusyError,
      'pending App session read must exclude a competing session mutation');
    state.readReply.resolve();
    assert.ok(await read);
    assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
  } finally {
    state.readReply.resolve(); await read.catch(() => {});
    await state.client.auth.dispose();
  }
});

test('a busy App session read rejects before entering SDK storage or implicit refresh', { timeout: 10_000 }, async () => {
  const state = fixture(), held = deferred();
  await state.client.auth.initialize();
  const coordinator = state.load(new URL('../src/services/authSessionOperation.ts', import.meta.url));
  state.expireStoredSession(); state.holdSessionRead();
  const operation = coordinator.runAuthSessionOperation(() => held.promise);
  try {
    await assert.rejects(state.auth.getSession(), coordinator.isAuthSessionOperationBusyError);
    assert.equal(state.requests.some(request => request.kind === 'refresh'), false);
    held.resolve(); await operation;
    // A fresh caller, not an automatically replayed busy read, can now proceed.
    const read = state.auth.getSession();
    await state.readEntered.promise;
    state.readReply.resolve();
    await state.refreshEntered.promise;
    state.refreshReply.resolve(state.json(state.sessionB));
    assert.equal((await read)?.user.id, state.sessionB.user.id);
    assert.equal(state.requests.filter(request => request.kind === 'refresh').length, 1);
  } finally {
    state.readReply.resolve(); state.refreshReply.resolve(state.json(state.sessionB));
    held.resolve(); await operation;
    await state.client.auth.dispose();
  }
});

test('an App read holds exclusion through real SDK implicit refresh and its late completion', { timeout: 10_000 }, async () => {
  const state = fixture();
  await state.client.auth.initialize();
  const coordinator = state.load(new URL('../src/services/authSessionOperation.ts', import.meta.url));
  state.expireStoredSession();
  const read = state.auth.getSession();
  try {
    await state.refreshEntered.promise;
    await assert.rejects(coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      coordinator.isAuthSessionOperationBusyError);
    // Caller does not cancel the actual promise by dropping its wait.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, true);
    state.refreshReply.resolve(state.json(state.sessionB));
    assert.equal((await read)?.user.id, state.sessionB.user.id);
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    state.refreshReply.resolve(state.json(state.sessionB)); await read.catch(() => {});
    await state.client.auth.dispose();
  }
});

test('a caller failure retains its leased App read until actual SDK settlement', { timeout: 10_000 }, async () => {
  const state = fixture();
  await state.client.auth.initialize();
  const coordinator = state.load(new URL('../src/services/authSessionOperation.ts', import.meta.url));
  state.holdSessionRead();
  let read;
  await assert.rejects(coordinator.runAuthSessionOperation(async lease => {
    read = state.auth.getSession(lease);
    void read.catch(() => {});
    throw new Error('fixture caller stopped waiting');
  }), /fixture caller stopped waiting/);
  try {
    await state.readEntered.promise;
    await assert.rejects(coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      coordinator.isAuthSessionOperationBusyError);
    state.readReply.resolve(); await read;
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    state.readReply.resolve(); await read.catch(() => {});
    await state.client.auth.dispose();
  }
});

test('a fresh B login is rejected during A revocation and SDK cleanup, then succeeds after A settles', { timeout: 10_000 }, async () => {
  const state = fixture();
  await state.client.auth.initialize();
  const revoke = state.sessions.revokeAllTerminals('fixture');
  const attemptB = () => state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' });
  try {
    await waitFor(() => state.requests.some(request => request.kind === 'revoke'));
    const first = await attemptB().then(() => ({ accepted: true }), error => ({ accepted: false, error }));
    assert.equal(first.accepted, false, 'B login must not enter the SDK while A revocation is pending');
    assert.equal(first.error.name, 'AuthSessionOperationBusyError');
    assert.equal(state.requests.filter(request => request.kind === 'login').length, 0);

    state.revokeReply.resolve(state.json({ revoked: 1 }));
    await waitFor(() => state.requests.some(request => request.kind === 'logout'));
    await assert.rejects(attemptB(), error => error.name === 'AuthSessionOperationBusyError');
    assert.equal(state.requests.filter(request => request.kind === 'login').length, 0);

    state.logoutReply.resolve(state.json({}));
    assert.equal(await revoke, 1);
    const freshLogin = await attemptB();
    assert.equal(freshLogin.session?.user.id === state.sessionB.user.id, true);
    const current = await state.client.auth.getSession();
    assert.equal(current.data.session?.user.id === state.sessionB.user.id, true);
  } finally {
    state.revokeReply.resolve(state.json({ revoked: 1 }));
    state.logoutReply.resolve(state.json({}));
    await revoke.catch(() => undefined);
  }
});

function fakeClock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    get now() { return now; },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

test('a UI deadline keeps the underlying SDK lease held until its late completion without native logout replay', { timeout: 10_000 }, async () => {
  const clock = fakeClock();
  const state = fixture({ clock });
  await state.client.auth.initialize();
  const revoke = state.sessions.revokeAllTerminals('fixture');
  const outcome = revoke.catch(error => error);
  try {
    await waitFor(() => state.requests.some(request => request.kind === 'revoke'));
    clock.advance(15_000);
    const error = await outcome;
    assert.equal(error.outcome, 'revocation-unconfirmed');
    await assert.rejects(state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' }),
      error => error.name === 'AuthSessionOperationBusyError');
    assert.equal(state.requests.filter(request => request.kind === 'login').length, 0);
    state.revokeReply.resolve(state.json({ revoked: 1 }));
    // Drain late response parsing and the retain release; never start another mutation to poll it.
    for (let count = 0; count < 20; count++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.requests.filter(request => request.kind === 'logout').length, 0);
    const fresh = await state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' });
    assert.equal(fresh.session?.user.id === state.sessionB.user.id, true);
  } finally {
    state.revokeReply.resolve(state.json({ revoked: 1 }));
    state.logoutReply.resolve(state.json({}));
    await outcome;
  }
});

test('authService session-writing entry points reject before SDK use while a revocation is pending', { timeout: 10_000 }, async () => {
  const state = fixture();
  await state.client.auth.initialize();
  const pending = state.sessions.revokeAllTerminals('fixture');
  try {
    await waitFor(() => state.requests.some(request => request.kind === 'revoke'));
    const entries = [
      () => state.auth.register({ username: 'fixture_user', email: 'b@fixture.invalid', password: 'synthetic-password' }),
      () => state.auth.verifySignupOtp('b@fixture.invalid', '11111111'),
      () => state.auth.verifyPasswordRecoveryOtp('b@fixture.invalid', '11111111'),
      () => state.auth.resetPassword('synthetic-password'),
      () => state.auth.exchangeCodeForSession('synthetic-code'),
      () => state.auth.exchangeSessionFromUrl(`${state.auth.getAuthRedirectUrl('callback')}?code=synthetic-code`),
      () => state.auth.logout('local'),
    ];
    for (const entry of entries) {
      await assert.rejects(entry(), error => error.name === 'AuthSessionOperationBusyError');
    }
    assert.equal(state.requests.length, 1, 'rejected entries must not dispatch another SDK request');
  } finally {
    state.revokeReply.resolve(state.json({ revoked: 1 }));
    state.logoutReply.resolve(state.json({}));
    await pending;
  }
});

test('every revocation entry rejects before dispatch when a public authService login already owns the lease', { timeout: 10_000 }, async () => {
  const state = fixture({ holdLogin: true });
  await state.client.auth.initialize();
  const login = state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' });
  try {
    await waitFor(() => state.requests.some(request => request.kind === 'login'));
    const entries = [
      () => state.sessions.revokeCurrentTerminal(),
      () => state.sessions.revokeOtherTerminals(),
      () => state.sessions.revokeAllTerminals(),
      () => state.sessions.revokeAccountTerminal('33333333-3333-4333-8333-333333333333'),
      () => state.sessions.revokeCurrentTerminalWithoutAudit(),
      () => state.sessions.revokeAllTerminalsWithoutAudit(),
    ];
    for (const entry of entries) {
      await assert.rejects(entry(), error => state.sessions.isAccountSessionOutcomeError(error)
        && error.outcome === 'operation-busy');
    }
    assert.equal(state.requests.length, 1, 'no preflight read, revocation or logout may dispatch while login owns the lease');
    state.loginReply.resolve(state.json(state.sessionB));
    assert.equal((await login).session?.user.id === state.sessionB.user.id, true);
    assert.equal((await state.client.auth.getSession()).data.session?.user.id === state.sessionB.user.id, true);
  } finally {
    state.loginReply.resolve(state.json(state.sessionB));
    await login;
  }
});

test('both emergency RPC deadlines retain actual SDK exclusion without late native cleanup', { timeout: 10_000 }, async () => {
  for (const method of ['revokeCurrentTerminalWithoutAudit', 'revokeAllTerminalsWithoutAudit']) {
    const clock = fakeClock(), state = fixture({ clock });
    await state.client.auth.initialize();
    const outcome = state.sessions[method]('fixture').catch(error => error);
    try {
      await waitFor(() => state.requests.some(request => request.kind === 'rpc'));
      clock.advance(15_000);
      assert.equal((await outcome).outcome, 'revocation-unconfirmed');
      await assert.rejects(state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' }),
        error => error.name === 'AuthSessionOperationBusyError');
      state.revokeReply.resolve(state.json(1));
      for (let count = 0; count < 20; count++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(state.requests.filter(request => request.kind === 'logout').length, 0);
      assert.equal((await state.auth.login({ email: state.sessionB.user.email, password: 'synthetic-password' }))
        .session?.user.id === state.sessionB.user.id, true);
    } finally {
      state.revokeReply.resolve(state.json(1));
      state.logoutReply.resolve(state.json({}));
      await outcome;
    }
  }
});
