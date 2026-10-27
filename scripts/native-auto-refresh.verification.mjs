// Manual known-RED diagnostic, intentionally outside normal *.test discovery.
// Public stop cancels queued timers, not an SDK tick already inside its read.
// No private methods, real credentials, server requests or expected-pass wrapper.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const STORAGE_KEY = 'native-auto-refresh-stop-characterization';

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

function session(label) {
  const expiresAt = Math.floor(Date.now() / 1000) + 1;
  const accessToken = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
    aud: 'authenticated',
    exp: expiresAt,
    role: 'authenticated',
    session_id: SESSION_ID,
    sub: USER_ID,
  })}.${base64url({ fixture: label })}`;

  return {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 1,
    refresh_token: `fixture-refresh-${label}`,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'refresh-characterization@fixture.invalid',
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

test('stopAutoRefresh prevents a tick that already entered its storage read from refreshing', { timeout: 10_000 }, async t => {
  const initialSession = session('initial');
  const refreshedSession = session('refreshed');
  const values = new Map([[STORAGE_KEY, JSON.stringify(initialSession)]]);
  const storageReadEntered = deferred();
  const releaseStorageRead = deferred();
  const refreshRequestEntered = deferred();
  const refreshCompleted = deferred();
  let holdNextStorageRead = false;
  let storageReadGateEntered = false;
  let stopReturnedBeforeStorageRelease = false;
  let refreshRequestCount = 0;

  const storage = {
    async getItem(key) {
      if (holdNextStorageRead) {
        holdNextStorageRead = false;
        storageReadGateEntered = true;
        storageReadEntered.resolve();
        await releaseStorageRead.promise;
      }
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };

  const fetchStub = async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/auth/v1/token')) {
      throw new Error('Unexpected characterization request');
    }
    refreshRequestCount += 1;
    refreshRequestEntered.resolve();
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
    if (event === 'TOKEN_REFRESHED') refreshCompleted.resolve();
  });

  try {
    await client.auth.initialize();
    holdNextStorageRead = true;

    await client.auth.startAutoRefresh();
    await storageReadEntered.promise;
    await client.auth.stopAutoRefresh();
    stopReturnedBeforeStorageRelease = true;
    releaseStorageRead.resolve();

    await Promise.race([
      refreshRequestEntered.promise,
      new Promise(resolve => setTimeout(resolve, 250)),
    ]);

    assert.equal(
      refreshRequestCount,
      0,
      'a refresh request started after stopAutoRefresh returned for an already-entered tick',
    );
  } finally {
    releaseStorageRead.resolve();
    await client.auth.stopAutoRefresh();
    let completionObserved = refreshRequestCount === 0;
    if (refreshRequestCount > 0) {
      let timer;
      completionObserved = await Promise.race([
        refreshCompleted.promise.then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), 1_000); }),
      ]);
      clearTimeout(timer);
    }
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`storage_read_gate_entered=${storageReadGateEntered}`);
    t.diagnostic(`stop_returned_before_storage_release=${stopReturnedBeforeStorageRelease}`);
    t.diagnostic(`refresh_request_count=${refreshRequestCount}`);
    t.diagnostic(`refresh_completion_observed=${completionObserved}`);
    t.diagnostic('cleanup_completed=true');
  }
});
