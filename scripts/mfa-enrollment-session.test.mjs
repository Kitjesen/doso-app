import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_A = '55555555-5555-4555-8555-555555555555';
const SESSION_B = '66666666-6666-4666-8666-666666666666';

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
  assert.fail('Timed out waiting for the MFA enrollment boundary');
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

function enrollmentReply() {
  return {
    data: {
      id: 'fixture-enrollment',
      totp: {
        qr_code: 'data:image/svg+xml,fixture',
        secret: 'fixture-secret-not-logged',
        uri: 'otpauth://totp/fixture',
      },
    },
    error: null,
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
  const calls = { getSession: 0, enroll: 0 };
  const enrollInputs = [];
  const native = {
    sessions: [session(SESSION_A, 'before'), session(SESSION_A, 'after')],
    enroll: async () => enrollmentReply(),
  };
  const client = {
    auth: {
      getSession: async () => {
        const index = calls.getSession++;
        return { data: { session: native.sessions[Math.min(index, native.sessions.length - 1)] ?? null }, error: null };
      },
      mfa: {
        enroll: async input => {
          calls.enroll += 1;
          enrollInputs.push(input);
          return native.enroll(input);
        },
        listFactors: async () => ({ data: { all: [], totp: [] }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
        challengeAndVerify: async () => ({ data: {}, error: null }),
        unenroll: async () => ({ data: {}, error: null }),
      },
    },
  };
  return { calls, client, enrollInputs, native, ...loadProduction(client) };
}

const expectedIdentity = { userId: USER_ID, sessionId: SESSION_A };

test('inactive enrollment rejects before reaching the SDK', async () => {
  const state = harness();
  await assert.rejects(
    state.mfa.enrollTotp(expectedIdentity, () => false),
    error => error instanceof state.mfa.MfaEnrollmentInactiveError
      && error.message === '双重验证设置已失效，未创建新的验证器。',
  );
  assert.deepEqual(state.calls, { getSession: 0, enroll: 0 });
});

test('missing or malformed identity and invalid active callbacks fail before SDK use', async () => {
  const invalidInputs = [
    { identity: null, isCurrent: () => true, error: 'identity' },
    { identity: undefined, isCurrent: () => true, error: 'identity' },
    { identity: { userId: 'bad', sessionId: SESSION_A }, isCurrent: () => true, error: 'identity' },
    { identity: expectedIdentity, isCurrent: null, error: 'inactive' },
    { identity: expectedIdentity, isCurrent: () => { throw new Error('private callback failure'); }, error: 'inactive' },
  ];
  for (const input of invalidInputs) {
    const state = harness();
    await assert.rejects(
      state.mfa.enrollTotp(input.identity, input.isCurrent),
      error => input.error === 'identity'
        ? error instanceof state.mfa.MfaEnrollmentIdentityError
        : error instanceof state.mfa.MfaEnrollmentInactiveError,
    );
    assert.deepEqual(state.calls, { getSession: 0, enroll: 0 });
  }
});

test('busy factor operation rejects enrollment before SDK use', async () => {
  const state = harness();
  const held = deferred();
  const owner = state.coordinator.runAuthSessionOperation(() => held.promise, { kind: 'factor-write' });
  try {
    await assert.rejects(
      state.mfa.enrollTotp(expectedIdentity, () => true),
      state.coordinator.isAuthSessionOperationBusyError,
    );
    assert.deepEqual(state.calls, { getSession: 0, enroll: 0 });
  } finally {
    held.resolve();
    await owner;
  }
});

test('the first session read retains ownership and stale state before dispatch prevents enrollment', async () => {
  for (const stale of ['inactive', 'identity']) {
    const state = harness();
    const firstRead = deferred();
    let active = true;
    state.client.auth.getSession = async () => {
      state.calls.getSession += 1;
      return firstRead.promise;
    };
    const enrollment = state.mfa.enrollTotp(expectedIdentity, () => active);
    try {
      await waitFor(() => state.calls.getSession === 1);
      assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
      await assert.rejects(
        state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
        state.coordinator.isAuthSessionOperationBusyError,
      );
      if (stale === 'inactive') {
        active = false;
        firstRead.resolve({ data: { session: session(SESSION_A, 'inactive-before-dispatch') }, error: null });
        await assert.rejects(enrollment, error => error instanceof state.mfa.MfaEnrollmentInactiveError);
      } else {
        firstRead.resolve({ data: { session: session(SESSION_B, 'changed-before-dispatch') }, error: null });
        await assert.rejects(enrollment, error => error instanceof state.mfa.MfaEnrollmentIdentityError);
      }
      assert.deepEqual(state.calls, { getSession: 1, enroll: 0 });
    } finally {
      firstRead.resolve({ data: { session: null }, error: null });
      await enrollment.catch(() => {});
    }
  }
});

test('dispatched enrollment and its post-read retain ownership; late inactivity still returns same-session result', async () => {
  const state = harness();
  const enrollReply = deferred();
  const secondRead = deferred();
  let active = true;
  let readCount = 0;
  state.client.auth.getSession = async () => {
    state.calls.getSession += 1;
    readCount += 1;
    if (readCount === 1) return { data: { session: session(SESSION_A, 'before-dispatch') }, error: null };
    return secondRead.promise;
  };
  state.native.enroll = () => enrollReply.promise;
  const enrollment = state.mfa.enrollTotp(expectedIdentity, () => active, 'DOSO QA Authenticator');
  let completed = false;
  void enrollment.finally(() => { completed = true; });
  try {
    await waitFor(() => state.calls.enroll === 1);
    active = false;
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    await assert.rejects(
      state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError,
    );
    enrollReply.resolve(enrollmentReply());
    await waitFor(() => state.calls.getSession === 2);
    assert.equal(completed, false);
    await assert.rejects(
      state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError,
    );
    secondRead.resolve({ data: { session: session(SESSION_A, 'refreshed-after-dispatch') }, error: null });
    const result = await enrollment;
    assert.equal(result.factorId, 'fixture-enrollment');
    assert.deepEqual(state.calls, { getSession: 2, enroll: 1 });
    assert.equal(state.enrollInputs[0].friendlyName, 'DOSO QA Authenticator');
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    enrollReply.resolve({ data: null, error: new Error('fixture cleanup') });
    secondRead.resolve({ data: { session: null }, error: null });
    await enrollment.catch(() => {});
  }
});

test('identity change after dispatch withholds enrollment material', async () => {
  const state = harness();
  state.native.sessions = [session(SESSION_A, 'before-dispatch'), session(SESSION_B, 'after-dispatch')];

  await assert.rejects(
    state.mfa.enrollTotp(expectedIdentity, () => true),
    error => error instanceof state.mfa.MfaEnrollmentIdentityError
      && error.message === '无法确认当前登录会话，无法安全继续验证器设置。',
  );
  assert.deepEqual(state.calls, { getSession: 2, enroll: 1 });
});

test('unknown or failed post-dispatch session reads never return enrollment material', async () => {
  for (const outcome of ['unknown', 'error']) {
    const state = harness();
    const sdkError = new Error('synthetic post-enrollment session failure');
    let readCount = 0;
    state.client.auth.getSession = async () => {
      state.calls.getSession += 1;
      readCount += 1;
      if (readCount === 1) return { data: { session: session(SESSION_A, 'before-dispatch') }, error: null };
      return outcome === 'unknown'
        ? { data: { session: null }, error: null }
        : { data: { session: null }, error: sdkError };
    };

    await assert.rejects(
      state.mfa.enrollTotp(expectedIdentity, () => true),
      error => outcome === 'unknown'
        ? error instanceof state.mfa.MfaEnrollmentIdentityError
        : error === sdkError,
    );
    assert.deepEqual(state.calls, { getSession: 2, enroll: 1 });
  }
});

test('SDK enrollment failure propagates once without a post-dispatch read or retry', async () => {
  const state = harness();
  const sdkError = new Error('synthetic enrollment rejection');
  state.native.enroll = async () => ({ data: null, error: sdkError });

  await assert.rejects(
    state.mfa.enrollTotp(expectedIdentity, () => true),
    error => error === sdkError,
  );
  assert.deepEqual(state.calls, { getSession: 1, enroll: 1 });
  assert.equal(state.enrollInputs[0].friendlyName, 'DOSO Authenticator');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.calls.enroll, 1);
});
