// Manual known-RED diagnostic, intentionally outside normal *.test discovery.
// A nominal public getSession() read can refresh a near-expiry session even when
// autoRefreshToken is false and the production cooperative coordinator is busy.
// Uses only public SDK APIs, synthetic credentials, in-memory storage and stubbed fetch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const STORAGE_KEY = 'nominal-session-refresh-characterization';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function session(label, lifetimeSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return {
    access_token: `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      aud: 'authenticated',
      exp: expiresAt,
      role: 'authenticated',
      session_id: SESSION_ID,
      sub: USER_ID,
    })}.${base64url({ fixture: label })}`,
    expires_at: expiresAt,
    expires_in: lifetimeSeconds,
    refresh_token: `fixture-refresh-${label}`,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'nominal-session-refresh@fixture.invalid',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2026-10-16T00:00:00.000Z',
    },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function loadProductionCoordinator() {
  const url = new URL('src/services/authSessionOperation.ts', ROOT);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Error,
    Promise,
    Set,
  }, { filename: 'src/services/authSessionOperation.ts' });
  return module.exports;
}

test('nominal getSession does not refresh while the production session-operation lease is busy', { timeout: 10_000 }, async t => {
  const initialSession = session('initial', 3_600);
  const expiringSession = session('expiring', 1);
  const refreshedSession = session('refreshed', 3_600);
  const values = new Map([[STORAGE_KEY, JSON.stringify(initialSession)]]);
  const releaseLease = deferred();
  const refreshRequestEntered = deferred();
  const releaseRefreshResponse = deferred();
  const coordinator = loadProductionCoordinator();
  let storageReadCount = 0;
  let storageWriteCount = 0;
  let storageRemoveCount = 0;
  let refreshRequestCount = 0;
  let unexpectedRequestCount = 0;
  let requestStartedWhileBusy = false;
  let tokenRefreshedEventCount = 0;
  let readReturnedRefreshedSession = false;
  let cleanupCompleted = false;
  let leaseOperation;
  let readOperation;

  const storage = {
    async getItem(key) {
      storageReadCount += 1;
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      storageWriteCount += 1;
      values.set(key, value);
    },
    async removeItem(key) {
      storageRemoveCount += 1;
      values.delete(key);
    },
  };
  const fetchStub = async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/auth/v1/token')) {
      unexpectedRequestCount += 1;
      throw new Error('Unexpected characterization request');
    }
    refreshRequestCount += 1;
    requestStartedWhileBusy = coordinator.getAuthSessionOperationSnapshot().busy;
    refreshRequestEntered.resolve();
    await releaseRefreshResponse.promise;
    return jsonResponse(refreshedSession);
  };
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
      storageKey: STORAGE_KEY,
    },
    global: { fetch: fetchStub },
  });
  const { data: { subscription } } = client.auth.onAuthStateChange(event => {
    if (event === 'TOKEN_REFRESHED') tokenRefreshedEventCount += 1;
  });

  try {
    const initialized = await client.auth.initialize();
    assert.equal(initialized.error, null);
    values.set(STORAGE_KEY, JSON.stringify(expiringSession));

    leaseOperation = coordinator.runAuthSessionOperation(async lease => {
      await lease.retain(() => releaseLease.promise);
    });
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, true);

    readOperation = client.auth.getSession();
    const requestStarted = await Promise.race([
      refreshRequestEntered.promise.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 750)),
    ]);
    assert.equal(requestStarted, true, 'fixture did not observe the near-expiry getSession refresh path');
    assert.equal(
      refreshRequestCount,
      0,
      'getSession started a refresh request while the production session-operation lease was busy',
    );
  } finally {
    releaseRefreshResponse.resolve();
    if (readOperation) {
      const result = await readOperation.catch(() => null);
      readReturnedRefreshedSession = result?.data?.session?.refresh_token === refreshedSession.refresh_token;
    }
    releaseLease.resolve();
    if (leaseOperation) await leaseOperation.catch(() => {});
    await client.auth.stopAutoRefresh();
    subscription.unsubscribe();
    await client.auth.dispose();
    cleanupCompleted = true;
    t.diagnostic(`refresh_request_count=${refreshRequestCount}`);
    t.diagnostic(`request_started_while_busy=${requestStartedWhileBusy}`);
    t.diagnostic(`read_returned_refreshed_session=${readReturnedRefreshedSession}`);
    t.diagnostic(`token_refreshed_event_count=${tokenRefreshedEventCount}`);
    t.diagnostic(`unexpected_request_count=${unexpectedRequestCount}`);
    t.diagnostic(`storage_read_count=${storageReadCount}`);
    t.diagnostic(`storage_write_count=${storageWriteCount}`);
    t.diagnostic(`storage_remove_count=${storageRemoveCount}`);
    t.diagnostic(`coordinator_busy_after_cleanup=${coordinator.getAuthSessionOperationSnapshot().busy}`);
    t.diagnostic(`cleanup_completed=${cleanupCompleted}`);
  }
});
