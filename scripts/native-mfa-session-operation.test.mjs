import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const servicesDirectory = fileURLToPath(new URL('../src/services/', import.meta.url));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for the production operation to reach its boundary');
}

function createHarness() {
  const native = {
    signInCalls: 0,
    exchangeCalls: 0,
    challengeCalls: 0,
    listFactorCalls: 0,
    assuranceCalls: 0,
    signInWithIdToken: async () => ({ data: { session: { user: { id: 'synthetic-user' } } }, error: null }),
    challengeAndVerify: async () => ({ data: {}, error: null }),
    listFactors: async () => ({ data: { totp: [], all: [] }, error: null }),
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    }),
  };
  let randomByte = 0;
  const client = {
    auth: {
      signInWithIdToken: async (credentials) => {
        native.exchangeCalls += 1;
        return native.signInWithIdToken(credentials);
      },
      signInWithOAuth: async () => ({ data: { url: 'https://example.invalid/auth' }, error: null }),
      mfa: {
        challengeAndVerify: async (credentials) => {
          native.challengeCalls += 1;
          return native.challengeAndVerify(credentials);
        },
        listFactors: async () => {
          native.listFactorCalls += 1;
          return native.listFactors();
        },
        getAuthenticatorAssuranceLevel: () => {
          native.assuranceCalls += 1;
          return native.getAuthenticatorAssuranceLevel();
        },
      },
    },
  };
  const stubs = new Map([
    ['expo-apple-authentication', {
      AppleAuthenticationScope: { FULL_NAME: 1, EMAIL: 2 },
      AppleAuthenticationCredentialState: { AUTHORIZED: 1, REVOKED: 2, NOT_FOUND: 3, TRANSFERRED: 4 },
      isAvailableAsync: async () => true,
      signInAsync: async (options) => {
        native.signInCalls += 1;
        return {
          user: 'synthetic-apple-subject',
          state: options.state,
          fullName: null,
          email: null,
          identityToken: 'synthetic-id-token',
          authorizationCode: null,
        };
      },
      getCredentialStateAsync: async () => 1,
      formatFullName: () => '',
      addRevokeListener: () => ({ remove() {} }),
    }],
    ['expo-crypto', {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      getRandomBytesAsync: async (length) => new Uint8Array(length).fill(++randomByte),
      digestStringAsync: async (_algorithm, value) => `digest:${value}`,
    }],
    ['expo-secure-store', {
      setItemAsync: async () => undefined,
      getItemAsync: async () => null,
      deleteItemAsync: async () => undefined,
    }],
    ['expo-web-browser', { openAuthSessionAsync: async () => ({ type: 'cancel' }) }],
    ['react-native', { Platform: { OS: 'ios' } }],
    ['./authService', { getAuthRedirectUrl: () => 'doso://auth/callback' }],
    ['./supabaseClient', { getSupabaseClient: () => client }],
  ]);
  const cache = new Map();

  function loadModule(filename) {
    const resolved = path.resolve(filename);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const code = ts.transpileModule(readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: resolved,
    }).outputText;
    const localRequire = (specifier) => {
      if (stubs.has(specifier)) return stubs.get(specifier);
      if (specifier.startsWith('.')) return loadModule(path.resolve(path.dirname(resolved), `${specifier}.ts`));
      throw new Error(`Unexpected test dependency: ${specifier}`);
    };
    vm.runInNewContext(`(function(require, module, exports) { ${code}\n})`, {
      Error,
      Promise,
      process: { env: { EXPO_PUBLIC_APPLE_AUTH_ENABLED: 'true' } },
      URL,
    })(localRequire, module, module.exports);
    return module.exports;
  }

  return {
    native,
    coordinator: loadModule(path.join(servicesDirectory, 'authSessionOperation.ts')),
    social: loadModule(path.join(servicesDirectory, 'socialAuthService.native.ts')),
    mfa: loadModule(path.join(servicesDirectory, 'mfaService.ts')),
  };
}

test('native Apple reaches its prompt but not the session SDK while another writer owns the lease', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  const held = deferred();
  const owner = harness.coordinator.runAuthSessionOperation(() => held.promise);

  await assert.rejects(
    harness.social.signIn('apple'),
    harness.coordinator.isAuthSessionOperationBusyError,
  );
  assert.equal(harness.native.signInCalls, 1);
  assert.equal(harness.native.exchangeCalls, 0);

  held.resolve();
  await owner;
});

test('an in-flight native Apple exchange excludes another writer and releases after success', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  const exchange = deferred();
  harness.native.signInWithIdToken = () => exchange.promise;

  const signIn = harness.social.signIn('apple');
  await waitFor(() => harness.native.exchangeCalls === 1);
  await assert.rejects(
    harness.coordinator.runAuthSessionOperation(async () => undefined),
    harness.coordinator.isAuthSessionOperationBusyError,
  );

  exchange.resolve({ data: { session: { user: { id: 'synthetic-user' } } }, error: null });
  assert.equal((await signIn).status, 'authenticated');
  assert.equal(await harness.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
});

test('a failed native Apple exchange preserves its public error and releases the writer lease', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  harness.native.signInWithIdToken = async () => ({ data: { session: null }, error: new Error('synthetic SDK failure') });

  await assert.rejects(harness.social.signIn('apple'), /Apple 身份验证失败/);
  assert.equal(await harness.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
});

test('standalone MFA status cannot dispatch either SDK subread while another operation owns the lease', { timeout: 10_000 }, async () => {
  const harness = createHarness(), held = deferred();
  const owner = harness.coordinator.runAuthSessionOperation(() => held.promise);
  try {
    await assert.rejects(harness.mfa.getMfaStatus(), harness.coordinator.isAuthSessionOperationBusyError);
    assert.equal(harness.native.listFactorCalls, 0);
    assert.equal(harness.native.assuranceCalls, 0);
  } finally { held.resolve(); await owner; }
});

test('an early factor-read rejection cannot release a still-pending assurance read', { timeout: 10_000 }, async () => {
  const harness = createHarness(), assurance = deferred(), failure = new Error('synthetic factor read failure');
  harness.native.listFactors = async () => { throw failure; };
  harness.native.getAuthenticatorAssuranceLevel = () => assurance.promise;
  const result = harness.mfa.getMfaStatus().catch(error => error);
  try {
    assert.equal(await result, failure);
    assert.equal(harness.native.assuranceCalls, 1);
    await assert.rejects(harness.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      harness.coordinator.isAuthSessionOperationBusyError);
  } finally {
    assurance.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    await result;
    await waitFor(() => !harness.coordinator.getAuthSessionOperationSnapshot().busy);
  }
});

test('standalone MFA status keeps read classification and exclusion until both subreads settle', { timeout: 10_000 }, async () => {
  const harness = createHarness(), factors = deferred(), assurance = deferred();
  harness.native.listFactors = () => factors.promise;
  harness.native.getAuthenticatorAssuranceLevel = () => assurance.promise;
  const result = harness.mfa.getMfaStatus();
  try {
    await waitFor(() => harness.native.listFactorCalls === 1 && harness.native.assuranceCalls === 1);
    assert.equal(harness.coordinator.getAuthSessionOperationSnapshot().kind, 'session-read');
    assurance.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(harness.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      harness.coordinator.isAuthSessionOperationBusyError);
    factors.resolve({ data: { all: [], totp: [] }, error: null });
    const status = await result;
    assert.equal(status.currentLevel, 'aal1');
    assert.equal(status.nextLevel, 'aal2');
    assert.equal(harness.coordinator.getAuthSessionOperationSnapshot().kind, null);
  } finally {
    factors.resolve({ data: { all: [], totp: [] }, error: null });
    assurance.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    await result.catch(() => {});
  }
});

test('verification keeps its write lease after synchronous assurance failure until factor read settles', { timeout: 10_000 }, async () => {
  const harness = createHarness(), factors = deferred(), failure = new Error('synthetic assurance read failure');
  harness.native.listFactors = () => factors.promise;
  harness.native.getAuthenticatorAssuranceLevel = () => { throw failure; };
  const result = harness.mfa.verifyTotpFactor('synthetic-factor', '123456').catch(error => error);
  try {
    assert.equal(await result, failure);
    assert.equal(harness.native.challengeCalls, 1);
    assert.equal(harness.coordinator.getAuthSessionOperationSnapshot().kind, 'session-write');
    await assert.rejects(harness.mfa.getMfaStatus(), harness.coordinator.isAuthSessionOperationBusyError);
    assert.equal(harness.native.listFactorCalls, 1, 'rejected status must not start another factor read');
  } finally {
    factors.resolve({ data: { all: [], totp: [] }, error: null }); await result;
    await waitFor(() => !harness.coordinator.getAuthSessionOperationSnapshot().busy);
  }
});

test('returned MFA error is preserved only after both retained reads have completed', { timeout: 10_000 }, async () => {
  const harness = createHarness(), assurance = deferred(), failure = new Error('synthetic returned MFA error');
  harness.native.listFactors = async () => ({ data: null, error: failure });
  harness.native.getAuthenticatorAssuranceLevel = () => assurance.promise;
  let settled = false;
  const result = harness.mfa.getMfaStatus().catch(error => error).finally(() => { settled = true; });
  try {
    await waitFor(() => harness.native.assuranceCalls === 1);
    assert.equal(settled, false);
    assert.equal(harness.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assurance.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    assert.equal(await result, failure);
    assert.equal(harness.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    assurance.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }); await result;
  }
});

test('MFA verification does not reach the session SDK while another writer owns the lease', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  const held = deferred();
  const owner = harness.coordinator.runAuthSessionOperation(() => held.promise);

  await assert.rejects(
    harness.mfa.verifyTotpFactor('synthetic-factor', '123456'),
    harness.coordinator.isAuthSessionOperationBusyError,
  );
  assert.equal(harness.native.challengeCalls, 0);

  held.resolve();
  await owner;
});

test('MFA verification keeps the writer lease through its status refresh and releases after success', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  const factors = deferred();
  harness.native.listFactors = () => factors.promise;

  const verification = harness.mfa.verifyTotpFactor('synthetic-factor', '123 456');
  await waitFor(() => harness.native.listFactorCalls === 1);
  await assert.rejects(
    harness.coordinator.runAuthSessionOperation(async () => undefined),
    harness.coordinator.isAuthSessionOperationBusyError,
  );

  factors.resolve({ data: { totp: [], all: [] }, error: null });
  assert.equal((await verification).enabled, false);
  assert.equal(await harness.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
});

test('a failed MFA verification preserves the SDK error and releases the writer lease', { timeout: 10_000 }, async () => {
  const harness = createHarness();
  const sdkError = new Error('synthetic MFA rejection');
  harness.native.challengeAndVerify = async () => ({ data: null, error: sdkError });

  await assert.rejects(
    harness.mfa.verifyTotpFactor('synthetic-factor', '123456'),
    (error) => error === sdkError,
  );
  assert.equal(harness.native.listFactorCalls, 0);
  assert.equal(await harness.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
});
