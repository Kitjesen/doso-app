import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const STORAGE_KEY = 'native-refresh-initialization-fixture';

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

function freshSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      aud: 'authenticated',
      exp: expiresAt,
      role: 'authenticated',
      session_id: SESSION_ID,
      sub: USER_ID,
    })}.${base64url({ fixture: true })}`,
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: 'fixture-refresh-initialization',
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'refresh-initialization@fixture.invalid',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2026-10-16T00:00:00.000Z',
    },
  };
}

function loadProductionRefreshModules() {
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const url = new URL(relative, ROOT);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      Error,
      Promise,
      console,
      require(name) {
        if (name === './authSessionOperation') return load('src/services/authSessionOperation.ts');
        throw new Error(`Unexpected production helper dependency: ${name}`);
      },
    }, { filename: relative });
    return module.exports;
  };
  return {
    coordinator: load('src/services/authSessionOperation.ts'),
    refresh: load('src/services/nativeAuthRefresh.ts'),
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('native refresh waits for real SDK initialization and the cooperative lease to become idle', { timeout: 10_000 }, async t => {
  const initialStorageReadEntered = deferred();
  const releaseInitialStorageRead = deferred();
  const releaseLease = deferred();
  const startCompleted = deferred();
  const stopCompleted = deferred();
  const values = new Map([[STORAGE_KEY, JSON.stringify(freshSession())]]);
  let holdInitialStorageRead = true;
  let unexpectedNetworkCount = 0;
  let initializeRequestCount = 0;
  let startRequestCount = 0;
  let stopRequestCount = 0;
  let helperDisposed = false;

  const storage = {
    async getItem(key) {
      if (holdInitialStorageRead) {
        holdInitialStorageRead = false;
        initialStorageReadEntered.resolve();
        await releaseInitialStorageRead.promise;
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
  const fetchStub = async () => {
    unexpectedNetworkCount += 1;
    throw new Error('Unexpected fixture network request');
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
  const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
  const { coordinator, refresh } = loadProductionRefreshModules();
  const listeners = new Set();
  const appState = {
    currentState: 'active',
    addEventListener(_event, listener) {
      listeners.add(listener);
      return { remove() { listeners.delete(listener); } };
    },
  };
  const auth = {
    async initialize() {
      initializeRequestCount += 1;
      return client.auth.initialize();
    },
    async startAutoRefresh() {
      startRequestCount += 1;
      const result = await client.auth.startAutoRefresh();
      startCompleted.resolve();
      return result;
    },
    async stopAutoRefresh() {
      stopRequestCount += 1;
      const result = await client.auth.stopAutoRefresh();
      stopCompleted.resolve();
      return result;
    },
  };

  let disposeHelper;
  let leaseOperation;
  try {
    await initialStorageReadEntered.promise;
    disposeHelper = refresh.attachNativeAuthRefresh(auth, appState);
    await flush();

    assert.equal(initializeRequestCount, 1);
    assert.equal(startRequestCount, 0, 'refresh started before the SDK core initialization settled');

    leaseOperation = coordinator.runAuthSessionOperation(async lease => {
      await lease.retain(() => releaseLease.promise);
    });
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, true);
    await flush();
    assert.equal(startRequestCount, 0, 'refresh started while SDK initialization and a lease were pending');

    releaseInitialStorageRead.resolve();
    const initialized = await client.auth.initialize();
    assert.equal(initialized.error, null);
    await flush();
    assert.equal(startRequestCount, 0, 'refresh started after core initialization while the lease was still busy');

    releaseLease.resolve();
    await leaseOperation;
    await startCompleted.promise;
    assert.equal(startRequestCount, 1, 'idle reconciliation must start refresh exactly once');
    assert.equal(unexpectedNetworkCount, 0);
  } finally {
    releaseInitialStorageRead.resolve();
    releaseLease.resolve();
    if (leaseOperation) await leaseOperation.catch(() => {});
    if (disposeHelper) {
      disposeHelper();
      helperDisposed = true;
      if (startRequestCount > stopRequestCount) await stopCompleted.promise;
      else await flush();
    }
    await client.auth.stopAutoRefresh();
    subscription.unsubscribe();
    await client.auth.dispose();
    t.diagnostic(`initialize_request_count=${initializeRequestCount}`);
    t.diagnostic(`start_request_count=${startRequestCount}`);
    t.diagnostic(`stop_request_count=${stopRequestCount}`);
    t.diagnostic(`unexpected_network_count=${unexpectedNetworkCount}`);
    t.diagnostic(`helper_disposed=${helperDisposed}`);
    t.diagnostic(`listener_count=${listeners.size}`);
    t.diagnostic('sdk_cleanup_completed=true');
  }
});
