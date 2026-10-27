import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_A = '22222222-2222-4222-8222-222222222222';
const SESSION_B = '33333333-3333-4333-8333-333333333333';
const FACTOR_ID = 'fixture-factor';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for the MFA cleanup boundary');
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function session(sessionId, label) {
  return {
    access_token: `${base64url({ alg: 'none' })}.${base64url({ session_id: sessionId, sub: USER_ID })}.${base64url({ fixture: label })}`,
    user: { id: USER_ID },
  };
}

function loadProduction(client) {
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
      Set,
      TextDecoder,
      Uint8Array,
      atob,
      globalThis: { atob },
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: () => client };
        if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected production dependency: ${name}`);
      },
    }, { filename: relative });
    return module.exports;
  };
  return {
    coordinator: load('src/services/authSessionOperation.ts'),
    mfa: load('src/services/mfaService.ts'),
  };
}

function harness() {
  const calls = { getSession: 0, listFactors: 0, unenroll: 0 };
  const native = {
    sessions: [session(SESSION_A, 'initial'), session(SESSION_A, 'confirmed')],
    listFactors: async () => ({
      data: { all: [{ id: FACTOR_ID, factor_type: 'totp', status: 'unverified' }], totp: [] },
      error: null,
    }),
    unenroll: async () => ({ data: {}, error: null }),
  };
  const client = {
    auth: {
      getSession: async () => {
        const index = calls.getSession++;
        const value = native.sessions[Math.min(index, native.sessions.length - 1)] ?? null;
        return { data: { session: value }, error: null };
      },
      mfa: {
        listFactors: async () => {
          calls.listFactors += 1;
          return native.listFactors();
        },
        unenroll: async input => {
          calls.unenroll += 1;
          return native.unenroll(input);
        },
      },
    },
  };
  return { calls, client, native, ...loadProduction(client) };
}

const expectedIdentity = { userId: USER_ID, sessionId: SESSION_A };

test('missing or malformed expected identity fails before any SDK call', async () => {
  for (const invalid of [null, undefined, { userId: 'bad', sessionId: SESSION_A }, { userId: USER_ID, sessionId: 'bad' }]) {
    const state = harness();
    await assert.rejects(
      state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, invalid),
      error => error instanceof state.mfa.MfaCleanupIdentityError
        && error.message === '无法确认当前登录会话，未清理未完成的验证器。',
    );
    assert.deepEqual(state.calls, { getSession: 0, listFactors: 0, unenroll: 0 });
  }
});

test('busy coordinator rejects before cleanup reaches the SDK', async () => {
  const state = harness();
  const held = deferred();
  const owner = state.coordinator.runAuthSessionOperation(() => held.promise);
  try {
    await assert.rejects(
      state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity),
      state.coordinator.isAuthSessionOperationBusyError,
    );
    assert.deepEqual(state.calls, { getSession: 0, listFactors: 0, unenroll: 0 });
  } finally {
    held.resolve();
    await owner;
  }
});

test('unknown or failed session reads never fall through to factor cleanup', async () => {
  const unknown = harness();
  unknown.native.sessions = [null];
  await assert.rejects(
    unknown.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity),
    error => error instanceof unknown.mfa.MfaCleanupIdentityError,
  );
  assert.deepEqual(unknown.calls, { getSession: 1, listFactors: 0, unenroll: 0 });

  const failed = harness();
  const sdkError = new Error('synthetic session read failure');
  failed.client.auth.getSession = async () => {
    failed.calls.getSession += 1;
    return { data: { session: null }, error: sdkError };
  };
  await assert.rejects(
    failed.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity),
    error => error === sdkError,
  );
  assert.deepEqual(failed.calls, { getSession: 1, listFactors: 0, unenroll: 0 });
});

test('a held factor list retains factor-write ownership until actual completion', async () => {
  const state = harness();
  const list = deferred();
  state.native.listFactors = () => list.promise;
  const cleanup = state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity);
  try {
    await waitFor(() => state.calls.listFactors === 1);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    await assert.rejects(
      state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError,
    );
    list.resolve({ data: { all: [], totp: [] }, error: null });
    await cleanup;
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    list.resolve({ data: { all: [], totp: [] }, error: null });
    await cleanup.catch(() => {});
  }
});

test('a held post-list identity read retains ownership and never deletes after identity change or SDK failure', async () => {
  for (const outcome of ['changed', 'error']) {
    const state = harness();
    const secondRead = deferred();
    const sdkError = new Error('synthetic second session read failure');
    state.client.auth.getSession = async () => {
      state.calls.getSession += 1;
      if (state.calls.getSession === 1) {
        return { data: { session: session(SESSION_A, 'before-list') }, error: null };
      }
      return secondRead.promise;
    };
    const cleanup = state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity);
    try {
      await waitFor(() => state.calls.getSession === 2);
      assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
      await assert.rejects(
        state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
        state.coordinator.isAuthSessionOperationBusyError,
      );

      if (outcome === 'changed') {
        secondRead.resolve({ data: { session: session(SESSION_B, 'after-list') }, error: null });
        await assert.rejects(cleanup, error => error instanceof state.mfa.MfaCleanupIdentityError);
      } else {
        secondRead.resolve({ data: { session: null }, error: sdkError });
        await assert.rejects(cleanup, error => error === sdkError);
      }
      assert.deepEqual(state.calls, { getSession: 2, listFactors: 1, unenroll: 0 });
      assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
    } finally {
      secondRead.resolve({ data: { session: null }, error: sdkError });
      await cleanup.catch(() => {});
    }
  }
});

test('a rejected delete retains ownership until settlement, propagates once, and is never replayed', async () => {
  const state = harness();
  const deletion = deferred();
  const sdkError = new Error('synthetic unenroll rejection');
  state.native.unenroll = () => deletion.promise;
  const cleanup = state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity);
  try {
    await waitFor(() => state.calls.unenroll === 1);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    await assert.rejects(
      state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError,
    );

    deletion.reject(sdkError);
    await assert.rejects(cleanup, error => error === sdkError);
    assert.deepEqual(state.calls, { getSession: 2, listFactors: 1, unenroll: 1 });
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.calls.unenroll, 1);
  } finally {
    deletion.reject(sdkError);
    await cleanup.catch(() => {});
  }
});

test('identity change after factor listing prevents deletion', async () => {
  const state = harness();
  state.native.sessions = [session(SESSION_A, 'before-list'), session(SESSION_B, 'after-list')];

  await assert.rejects(
    state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity),
    error => error instanceof state.mfa.MfaCleanupIdentityError,
  );
  assert.deepEqual(state.calls, { getSession: 2, listFactors: 1, unenroll: 0 });
});

test('same-session token refresh is accepted and the unverified TOTP factor is deleted', async () => {
  const state = harness();
  state.native.sessions = [session(SESSION_A, 'old-token'), session(SESSION_A, 'refreshed-token')];

  await state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity);
  assert.deepEqual(state.calls, { getSession: 2, listFactors: 1, unenroll: 1 });
});

test('missing, verified, and non-TOTP factors are never deleted', async () => {
  const factors = [
    [],
    [{ id: FACTOR_ID, factor_type: 'totp', status: 'verified' }],
    [{ id: FACTOR_ID, factor_type: 'phone', status: 'unverified' }],
  ];
  for (const all of factors) {
    const state = harness();
    state.native.listFactors = async () => ({ data: { all, totp: [] }, error: null });
    await state.mfa.cancelUnverifiedTotpEnrollment(FACTOR_ID, expectedIdentity);
    assert.deepEqual(state.calls, { getSession: 1, listFactors: 1, unenroll: 0 });
  }
});
