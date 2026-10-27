import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0, `${relativePath} transpiles without diagnostics`);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const core = await importTypeScript('../src/services/appleAuthCore.ts');
const redirect = await importTypeScript('../src/services/authRedirect.ts');
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const requestValues = ['raw-nonce', 'state-value'];
let signInOptions;
let delegatedExchange;
let stagedName;
const session = { user: { id: 'user-1' } };
const result = await core.performNativeAppleSignIn({
  randomString: async () => requestValues.shift(),
  sha256: async (value) => `sha256:${value}`,
  requestedScopes: ['full-name', 'email'],
  signIn: async (options) => {
    signInOptions = options;
    return {
      user: 'apple-subject', state: 'state-value', fullName: { givenName: 'Ada' },
      email: 'relay@privaterelay.appleid.com', identityToken: 'identity-token', authorizationCode: 'one-time-code',
    };
  },
  getCredentialState: async () => 'authorized',
  authorizedCredentialState: 'authorized',
  exchangeIdToken: async (credentials) => { delegatedExchange = credentials; return session; },
  formatFullName: () => '  Ada   Lovelace  ',
  stageDisplayMetadata: async (subject, name) => { stagedName = { subject, name }; },
  syncPendingDisplayMetadata: async () => 'synced',
  syncDisplayMetadata: async () => true,
});
equal(result, { session, metadataStatus: 'synced' }, 'native Apple flow returns an authenticated metadata outcome');
equal(signInOptions, {
  requestedScopes: ['full-name', 'email'], state: 'state-value', nonce: 'sha256:raw-nonce',
}, 'Apple receives distinct state and the SHA-256 nonce');
equal(delegatedExchange, {
  provider: 'apple', token: 'identity-token', nonce: 'raw-nonce', access_token: 'one-time-code',
}, 'Supabase receives the raw nonce and optional authorization code');
equal(stagedName, { subject: 'apple-subject', name: 'Ada Lovelace' }, 'first-login name is staged by Apple subject before exchange');
check(signInOptions.state !== delegatedExchange.nonce, 'state and raw nonce are distinct');

const baseFlow = (overrides = {}) => ({
  randomString: (() => { const values = ['nonce', 'state']; return async () => values.shift(); })(),
  sha256: async () => 'hash',
  requestedScopes: [],
  signIn: async () => ({
    user: 'subject', state: 'state', fullName: null, email: null,
    identityToken: 'token', authorizationCode: null,
  }),
  getCredentialState: async () => 1,
  authorizedCredentialState: 1,
  exchangeIdToken: async () => session,
  formatFullName: () => '',
  stageDisplayMetadata: async () => { throw new Error('repeat login must not stage empty metadata'); },
  syncPendingDisplayMetadata: async () => 'none',
  syncDisplayMetadata: async () => true,
  ...overrides,
});
await assert.rejects(
  core.performNativeAppleSignIn(baseFlow({ signIn: async () => ({
    user: 'subject', state: 'wrong', fullName: null, email: null, identityToken: 'token', authorizationCode: null,
  }) })),
  /状态校验失败/,
);
assertions += 1;
await assert.rejects(
  core.performNativeAppleSignIn(baseFlow({ signIn: async () => ({
    user: 'subject', state: 'state', fullName: null, email: null, identityToken: null, authorizationCode: null,
  }) })),
  /身份令牌/,
);
assertions += 1;
await assert.rejects(core.performNativeAppleSignIn(baseFlow({ getCredentialState: async () => 0 })), /凭据已失效/);
assertions += 1;
equal(await core.performNativeAppleSignIn(baseFlow()), { session, metadataStatus: 'none' }, 'repeat login accepts null name/email without metadata sync');
equal(core.buildAppleDisplayMetadata('Ada Lovelace'), {
  display_name: 'Ada Lovelace',
}, 'Apple name metadata contains display fields only');
check(!('username' in core.buildAppleDisplayMetadata('Ada Lovelace')), 'Apple name never becomes a DOSO username');
equal(core.buildAppleDisplayMetadata(null), null, 'empty Apple name produces no metadata write');
equal(core.normalizePresentationDisplayName('  Ada   Lovelace  '), 'Ada Lovelace', 'display-name confirmation normalizes whitespace');
assert.throws(() => core.normalizePresentationDisplayName('   '), /请输入显示名称/);
assertions += 1;
assert.throws(() => core.normalizePresentationDisplayName('x'.repeat(81)), /80/);
assertions += 1;
equal(
  core.isDisplayNameRecoveryForUser({ userId: 'account-a', displayName: 'A Name' }, 'account-a'),
  true,
  'display-name recovery belongs only to its captured account',
);
equal(
  core.isDisplayNameRecoveryForUser({ userId: 'account-a', displayName: 'A Name' }, 'account-b'),
  false,
  'account B cannot render account A recovery data',
);

check(core.isAppleLoginCancelled({ code: 'ERR_REQUEST_CANCELED' }), 'structured native cancellation is recognized');
check(!core.isAppleLoginCancelled({ code: 'ERR_REQUEST_FAILED' }), 'native failure is not mislabeled as cancellation');
equal(core.interpretAppleBrowserResult({ type: 'success', url: 'doso://auth/callback?code=x' }), {
  status: 'callback', callbackUrl: 'doso://auth/callback?code=x',
}, 'browser success returns its callback');
equal(core.interpretAppleBrowserResult({ type: 'cancel' }), { status: 'cancelled' }, 'browser cancel is cancelled');
equal(core.interpretAppleBrowserResult({ type: 'dismiss' }), { status: 'cancelled' }, 'browser dismiss is cancelled');
assert.throws(() => core.interpretAppleBrowserResult({ type: 'locked' }), /浏览器未完成授权/);
assertions += 1;
assert.throws(() => core.interpretAppleBrowserResult({ type: 'error' }), /浏览器未完成授权/);
assertions += 1;
equal(core.buildAppleOAuthArguments('https://links.dosorobotics.com/auth/callback'), {
  provider: 'apple',
  options: { redirectTo: 'https://links.dosorobotics.com/auth/callback', skipBrowserRedirect: true },
}, 'Android and Web use exact Supabase Apple OAuth arguments');

const states = { authorized: 1, revoked: 0, notFound: 2, transferred: 3 };
equal(core.mapAppleCredentialState(1, states), 'authorized', 'AUTHORIZED maps correctly');
equal(core.mapAppleCredentialState(0, states), 'revoked', 'REVOKED maps correctly');
equal(core.mapAppleCredentialState(2, states), 'not-found', 'NOT_FOUND maps correctly');
equal(core.mapAppleCredentialState(3, states), 'transferred', 'TRANSFERRED maps correctly');
equal(core.mapAppleCredentialState(99, states), 'unknown', 'unsupported credential state is unknown');
equal(core.getAppleIdentitySubject([
  { provider: 'email', identity_data: { sub: 'email' } },
  { provider: 'apple', identity_data: { sub: ' apple-sub ' } },
]), 'apple-sub', 'credential checks use the Apple identity_data.sub subject');

let starts = 0;
await assert.rejects(core.startWhenSocialLoginReady(
  { ready: false, blockerMessage: 'disabled' }, 'fallback', async () => { starts += 1; },
), /disabled/);
assertions += 1;
equal(starts, 0, 'disabled readiness short-circuits before any provider call');

const pendingNames = new Map();
let syncAttempts = 0;
let persistedName = null;
const metadataDependencies = {
  stageDisplayMetadata: async (subject, name) => { pendingNames.set(subject, name); },
  syncPendingDisplayMetadata: async (_session, subject) => {
    syncAttempts += 1;
    if (syncAttempts === 1) throw new Error('temporary profile failure');
    if (!pendingNames.has(subject)) return 'none';
    persistedName = pendingNames.get(subject);
    pendingNames.delete(subject);
    return 'synced';
  },
};
const firstMetadataLogin = await core.performNativeAppleSignIn(baseFlow({
  signIn: async () => ({
    user: 'metadata-subject', state: 'state', fullName: {}, email: 'relay@apple.test',
    identityToken: 'token', authorizationCode: null,
  }),
  formatFullName: () => 'First Login Name',
  ...metadataDependencies,
}));
equal(firstMetadataLogin, { session, metadataStatus: 'durably-pending' }, 'metadata failure after exchange remains explicitly authenticated and durably pending');
equal(pendingNames.get('metadata-subject'), 'First Login Name', 'failed metadata sync keeps the staged name durable');
const repeatMetadataLogin = await core.performNativeAppleSignIn(baseFlow({
  signIn: async () => ({
    user: 'metadata-subject', state: 'state', fullName: null, email: null,
    identityToken: 'token', authorizationCode: null,
  }),
  ...metadataDependencies,
}));
equal(repeatMetadataLogin, { session, metadataStatus: 'synced' }, 'repeat login with null Apple name retries staged metadata');
equal(persistedName, 'First Login Name', 'idempotent retries converge to the staged presentation value');
equal(pendingNames.has('metadata-subject'), false, 'converged presentation metadata clears durable staging');

let exchangeAfterStageFailure = 0;
let directSyncs = 0;
const stageFailureDirectSuccess = await core.performNativeAppleSignIn(baseFlow({
  signIn: async () => ({
    user: 'unstaged-subject', state: 'state', fullName: {}, email: null,
    identityToken: 'token', authorizationCode: null,
  }),
  formatFullName: () => 'Recovered Name',
  stageDisplayMetadata: async () => { throw new Error('secure store unavailable'); },
  exchangeIdToken: async () => { exchangeAfterStageFailure += 1; return session; },
  syncDisplayMetadata: async (_session, name) => {
    directSyncs += 1;
    equal(name, 'Recovered Name', 'direct recovery uses only the normalized in-memory display name');
    return true;
  },
}));
equal(exchangeAfterStageFailure, 1, 'SecureStore staging failure never blocks token exchange');
equal(directSyncs, 1, 'staging failure attempts direct metadata convergence after authentication');
equal(stageFailureDirectSuccess, { session, metadataStatus: 'synced' }, 'direct sync success returns authenticated and synced');

const needsConfirmation = await core.performNativeAppleSignIn(baseFlow({
  signIn: async () => ({
    user: 'confirmation-subject', state: 'state', fullName: {}, email: null,
    identityToken: 'token', authorizationCode: null,
  }),
  formatFullName: () => 'Confirm Me',
  stageDisplayMetadata: async () => { throw new Error('secure store unavailable'); },
  syncDisplayMetadata: async () => { throw new Error('profile unavailable'); },
}));
equal(needsConfirmation, {
  session,
  metadataStatus: 'needs-confirmation',
  suggestedDisplayName: 'Confirm Me',
}, 'staging and direct sync failure still returns authenticated needs-confirmation');

const environment = { configuredOrigin: 'https://links.dosorobotics.com' };
const webEnvironment = {
  ...environment,
  webOrigin: 'https://app.dosorobotics.com',
};
equal(
  redirect.buildAuthRedirectUrl('callback', webEnvironment),
  'https://app.dosorobotics.com/auth/callback',
  'deployed Web origin wins over the configured mobile Link origin',
);
equal(
  redirect.parseAuthCallbackKind('https://app.dosorobotics.com/auth/callback?code=web', webEnvironment),
  'callback',
  'Web accepts only its exact deployed same-origin callback',
);
assert.throws(
  () => redirect.buildAuthRedirectUrl('callback', { webOrigin: 'https://app.dosorobotics.com/path' }),
  /纯 HTTPS origin/,
);
assertions += 1;
const firstUrl = 'https://links.dosorobotics.com/auth/callback?code=once&state=a';
const reorderedUrl = 'https://links.dosorobotics.com/auth/callback?state=a&code=once';
equal(
  redirect.getAuthCallbackDeduplicationKey(firstUrl, environment),
  redirect.getAuthCallbackDeduplicationKey(reorderedUrl, environment),
  'equivalent query ordering produces one semantic callback key',
);
const deduper = redirect.createAuthCallbackDeduper(2);
let exchanges = 0;
await deduper.run(redirect.getAuthCallbackDeduplicationKey(firstUrl, environment), async () => { exchanges += 1; });
await deduper.run(redirect.getAuthCallbackDeduplicationKey(reorderedUrl, environment), async () => { exchanges += 1; });
equal(exchanges, 1, 'successful one-time authorization code is exchanged once');
let retries = 0;
await assert.rejects(deduper.run('callback:retry', async () => { retries += 1; throw new Error('temporary'); }));
assertions += 1;
await deduper.run('callback:retry', async () => { retries += 1; });
equal(retries, 2, 'failed exchange remains retryable');

const boundedDeduper = redirect.createAuthCallbackDeduper(1);
let releaseRunning;
const running = boundedDeduper.run('callback:first', () => new Promise((resolve) => { releaseRunning = resolve; }));
await assert.rejects(
  boundedDeduper.run('callback:second', async () => undefined),
  /处理队列已满/,
);
assertions += 1;
releaseRunning();
await running;

let currentSubject = 'account-a';
let resolveCredential;
let monitorLogouts = 0;
const monitor = core.createAppleCredentialMonitor({
  getCurrentSubject: () => currentSubject,
  checkCredential: () => new Promise((resolve) => { resolveCredential = resolve; }),
  logout: async () => { monitorLogouts += 1; },
  onDiagnostic: () => undefined,
});
const deferredCheck = monitor.check();
currentSubject = 'account-b';
monitor.invalidate();
resolveCredential({ status: 'revoked', reason: null });
equal((await deferredCheck).outcome, 'stale', 'deferred account A status cannot affect replacement account B');
equal(monitorLogouts, 0, 'identity switch prevents stale logout');

currentSubject = 'account-c';
let resolveUnmounted;
const unmountedMonitor = core.createAppleCredentialMonitor({
  getCurrentSubject: () => currentSubject,
  checkCredential: () => new Promise((resolve) => { resolveUnmounted = resolve; }),
  logout: async () => { monitorLogouts += 1; },
  onDiagnostic: () => undefined,
});
const unmountedCheck = unmountedMonitor.check();
unmountedMonitor.deactivate();
resolveUnmounted({ status: 'revoked', reason: null });
equal((await unmountedCheck).outcome, 'stale', 'unmounted credential monitor ignores deferred results');
equal(monitorLogouts, 0, 'unmount prevents logout');

const diagnostics = [];
const diagnosticMonitor = core.createAppleCredentialMonitor({
  getCurrentSubject: () => 'account-d',
  checkCredential: async () => ({ status: 'unknown', reason: 'native-or-transient-failure' }),
  logout: async () => { monitorLogouts += 1; },
  onDiagnostic: (result) => diagnostics.push(result),
});
await diagnosticMonitor.check();
equal(diagnostics, [{ status: 'unknown', reason: 'native-or-transient-failure' }], 'sanitized credential failure is surfaced diagnostically');
equal(monitorLogouts, 0, 'credential query failure never logs out');

console.log(`DOSO Apple Option A behavioral core PASS (${assertions} focused assertions)`);
