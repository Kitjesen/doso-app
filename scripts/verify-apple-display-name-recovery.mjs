import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [app, screen, authService, types, authContext, preparationCore, nativeSocial, recoveryCore] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/DisplayNameConfirmationScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/auth/AuthContext.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/auth/sessionPreparationCore.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/socialAuthService.native.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/appleDisplayRecoveryCore.ts', import.meta.url), 'utf8'),
]);

assert.match(types, /['"]display-name-confirmation['"]/, 'App stage includes a real display-name recovery route');
assert.match(screen, /useState\(initialDisplayName\)/, 'Apple suggestion prefills the display-name input');
assert.match(screen, /title="确认显示名称"[\s\S]*label="显示名称"/, 'recovery UI is separately labeled as display name');
assert.match(screen, /normalizePresentationDisplayName\(displayName\)/, 'display-name form normalizes its own presentation value');
assert.match(screen, /onSave\(normalized\)/, 'display-name form uses a dedicated save handler');
assert.doesNotMatch(screen, /claimUsername|claim_username/, 'display-name UI never invokes canonical username claiming');

assert.match(app, /\[result\.session\.user\.id\]:\s*\{[\s\S]*?displayName:\s*result\.suggestedDisplayName!/, 'App retains B suggestion by result-session user even while context may still show A');
assert.match(app, /setStage\(['"]display-name-confirmation['"]\)/, 'needs-confirmation routes to the real recovery screen');
assert.match(app, /!appleRecoveryProbeResolved[\s\S]*pendingAppleDisplayName\?\.userId === user\.id[\s\S]*!hasClaimedUsername\(profile\)/, 'resolved recovery probe gates username and device routing');
assert.match(app, /updatePresentationDisplayName\(recovery\.userId, displayName\)/, 'App saves through the dedicated ID-scoped presentation service');
assert.match(app, /delete next\[userId\]/, 'success or skip clears only the matching user recovery');
assert.doesNotMatch(app, /claimUsername\((?:pendingAppleDisplayName|result\.suggestedDisplayName)/, 'Apple suggestion never reaches claimUsername');
assert.match(app, /isCurrentOperation = \(\) => \([\s\S]*isCurrent\(operation\)[\s\S]*currentUserIdRef\.current === operation\.userId[\s\S]*preparedSessionKeyRef\.current === operation\.readyKey/, 'every recovery boundary rechecks operation generation, user, and ready key');
assert.match(app, /key=\{`\$\{pendingAppleDisplayName\.userId\}:\$\{preparedSessionKey\}`\}/, 'form remounts for account or prepared session generation changes');
assert.match(app, /preparedSessionKey[\s\S]*appleRecoveryProbe\.readyKey === preparedSessionKey[\s\S]*pendingAppleDisplayName\?\.userId === user\.id/, 'screen renders only for resolved matching ready identity');
assert.match(app, /getPendingAppleDisplayName\(appleIdentitySubject\)/, 'terminal-ready App restores a staged name after restart');
assert.match(recoveryCore, /clearDurableDisplayName\(candidate\.subject\)/, 'save and explicit skip consume the exact probed subject staging');
assert.match(app, /probeAppleDisplayRecovery\([\s\S]*inMemoryCandidate\?\.displayName[\s\S]*getPendingAppleDisplayName/, 'App delegates read failures and memory/durable merging to the behavioral core');
assert.ok((app.match(/consumeAppleDisplayRecovery\(probe, socialAuthService\.clearPendingAppleDisplayName\)/g) ?? []).length >= 2, 'save and skip share durable-aware consumption behavior');
assert.ok((app.match(/if \(isCurrentOperation\(\)\) setAuthError/g) ?? []).length >= 2, 'stale recovery failures cannot write another session error');
assert.ok((app.match(/if \(isCurrentOperation\(\)\) setAccountBusy\(false\)/g) ?? []).length >= 2, 'stale recovery completion cannot clear another session busy state');
assert.match(app, /runAppleDisplayRecoveryConfirmation\(\{[\s\S]*update:[\s\S]*consume:[\s\S]*refresh:[\s\S]*resume:[\s\S]*notify:[\s\S]*isCurrent: isCurrentOperation/, 'confirm handler delegates every async boundary to the generation-guarded pipeline');
for (const status of ['unchecked', 'checking', 'pending', 'none', 'error']) {
  assert.match(app, new RegExp(`status: '${status}'`), `Apple recovery probe declares ${status}`);
}
assert.match(app, /user && preparedSessionKey && !appleRecoveryProbeResolved[\s\S]*正在检查 Apple 登录资料/, 'checking probe blocks all post-login routing');

const updateMethod = authService.match(/export async function updatePresentationDisplayName[\s\S]*?\n\}/)?.[0] ?? '';
assert.ok(updateMethod, 'dedicated presentation update method exists');
assert.match(updateMethod, /update\(\{ display_name:\s*normalized \}\)[\s\S]*\.eq\(['"]id['"], expectedUserId\)[\s\S]*\.select\(['"]id['"]\)/, 'service writes only the expected profile presentation row');
assert.doesNotMatch(updateMethod, /username|claim_username/, 'presentation update cannot mutate username state');
assert.doesNotMatch(nativeSocial, /\.from\(['"]profiles['"]\)[\s\S]*\.update\(/, 'social sign-in cannot write profiles before terminal readiness');
assert.match(nativeSocial, /stageDisplayMetadata:\s*stageAppleDisplayName/, 'first Apple name remains durably staged during sign-in');

assert.match(authContext, /preparedUserId:\s*string \| null/, 'Auth context exposes terminal-ready user identity');
assert.match(authContext, /preparedSessionKey:\s*string \| null/, 'Auth context exposes opaque ready session generation');
assert.match(authContext, /publishPreparedSession\(null\)[\s\S]*setSession\(nextSession\)/, 'every auth session change clears readiness before publishing the session');
assert.match(authContext, /registerCurrentTerminal\(\)[\s\S]*getProfile\(nextSession\.user\.id\)[\s\S]*isCurrent\(ticket\)[\s\S]*publishPreparedSession/, 'readiness is published only after terminal registration, profile load, and stale-ticket check');
assert.ok((authContext.match(/preparationTracker\.current\.isCurrent\(ticket\)/g) ?? []).length >= 4, 'prepare success, error, and completion writes are ticket guarded');
assert.match(authContext, /canHeartbeatPreparedSession\(session\?\.user\.id, preparedSession\?\.userId\)/, 'heartbeat does not start before terminal readiness');
assert.match(authContext, /heartbeatTicket[\s\S]*isCurrent\(heartbeatTicket\)[\s\S]*isRevokedSessionError/, 'heartbeat logout uses a live preparation-generation check');
assert.match(authContext, /liveSessionRef\.current[\s\S]*livePreparedSessionRef\.current[\s\S]*liveSession\?\.access_token === expectedAccessToken[\s\S]*livePrepared\?\.key === expectedPreparedKey/, 'deferred heartbeat failure rechecks the live token and ready generation before logout');
assert.match(authContext, /refreshProfile:\s*\(\) => loadProfile\(session\?\.user\.id \?\? null, preparedSession\?\.key \?\? null\)/, 'profile refresh is scoped to the rendered ready generation');

const transpiledPreparation = ts.transpileModule(preparationCore, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(transpiledPreparation.diagnostics?.length ?? 0, 0, 'session preparation tracker transpiles');
const trackerModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledPreparation.outputText).toString('base64')}`
);
const tracker = trackerModule.createSessionPreparationTracker();
const accountA = tracker.begin('account-a');
const accountB = tracker.begin('account-b');
assert.equal(tracker.isCurrent(accountA), false, 'stale account A preparation cannot become ready after B starts');
assert.equal(tracker.isCurrent(accountB), true, 'latest account B preparation may become ready');
const sameUserFirstSession = tracker.begin('same-user');
const sameUserSecondSession = tracker.begin('same-user');
assert.equal(tracker.isCurrent(sameUserFirstSession), false, 'same-user session replacement invalidates the old generation');
assert.equal(tracker.isCurrent(sameUserSecondSession), true, 'same-user replacement session owns the current generation');
assert.notEqual(trackerModule.getPreparedSessionKey(sameUserFirstSession), trackerModule.getPreparedSessionKey(sameUserSecondSession), 'same-user session generations receive different ready keys');
let resolveOldPreparation;
const oldPreparation = new Promise((resolve) => { resolveOldPreparation = resolve; });
const deferredTracker = trackerModule.createSessionPreparationTracker();
const deferredFirst = deferredTracker.begin('same-user');
const deferredCommit = oldPreparation.then(() => deferredTracker.isCurrent(deferredFirst));
const deferredSecond = deferredTracker.begin('same-user');
resolveOldPreparation();
assert.equal(await deferredCommit, false, 'deferred old same-user preparation cannot commit after a replacement session begins');
assert.equal(deferredTracker.isCurrent(deferredSecond), true, 'replacement generation remains current after old async completion');
assert.equal(trackerModule.canHeartbeatPreparedSession('account-b', null), false, 'heartbeat is disabled before readiness');
assert.equal(trackerModule.canHeartbeatPreparedSession('account-b', 'account-b'), true, 'heartbeat is enabled after matching readiness');
const signedOut = tracker.begin(null);
assert.equal(tracker.isCurrent(accountB), false, 'sign-out invalidates in-flight account preparation');
assert.equal(tracker.isCurrent(signedOut), true, 'signed-out generation is current without a ready user');

const transpiledRecovery = ts.transpileModule(recoveryCore, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(transpiledRecovery.diagnostics?.length ?? 0, 0, 'Apple display recovery behavioral core transpiles');
const recoveryModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledRecovery.outputText).toString('base64')}`
);
const memoryAndSecure = await recoveryModule.probeAppleDisplayRecovery(
  'Memory Name',
  'apple-subject',
  async () => 'Secure Name',
);
assert.deepEqual(memoryAndSecure, {
  status: 'pending',
  candidate: {
    displayName: 'Memory Name',
    subject: 'apple-subject',
    requiresDurableClear: true,
  },
}, 'memory display value preserves durable-record presence');
await assert.rejects(
  recoveryModule.consumeAppleDisplayRecovery(memoryAndSecure.candidate, async () => { throw new Error('store unavailable'); }),
  /store unavailable/,
  'memory plus secure delete failure remains pending instead of being consumed',
);
const memoryAfterReadFailure = await recoveryModule.probeAppleDisplayRecovery(
  'Memory Name',
  'apple-subject',
  async () => { throw new Error('read unavailable'); },
);
assert.equal(memoryAfterReadFailure.status, 'pending', 'store read failure retains a memory-only candidate');
assert.equal(memoryAfterReadFailure.candidate.requiresDurableClear, false, 'unconfirmed durable presence does not block memory-only recovery');
await recoveryModule.consumeAppleDisplayRecovery(
  memoryAfterReadFailure.candidate,
  async () => { throw new Error('delete unavailable'); },
);
assert.equal(memoryAfterReadFailure.status, 'pending', 'memory-only delete failure is best-effort');
const noMemoryReadFailure = await recoveryModule.probeAppleDisplayRecovery(
  null,
  'apple-subject',
  async () => { throw new Error('read unavailable'); },
);
assert.equal(noMemoryReadFailure.status, 'error', 'store read failure without memory evidence remains retryable error');

const operationTracker = recoveryModule.createAppleDisplayRecoveryOperationTracker();
const operationA = operationTracker.begin('account-a', 'ready-a');
let rejectA;
let resolveASuccess;
const deferredASuccess = new Promise((resolve) => { resolveASuccess = resolve; })
  .then(() => ({
    mayCommitSuccess: operationTracker.isCurrent(operationA),
    mayClearBusy: operationTracker.isCurrent(operationA),
  }));
const deferredA = new Promise((_, reject) => { rejectA = reject; })
  .catch(() => ({
    mayWriteError: operationTracker.isCurrent(operationA),
    mayClearBusy: operationTracker.isCurrent(operationA),
  }));
operationTracker.invalidate();
const operationB = operationTracker.begin('account-b', 'ready-b');
resolveASuccess();
rejectA(new Error('A failed late'));
assert.deepEqual(await deferredASuccess, { mayCommitSuccess: false, mayClearBusy: false }, 'late A success/finally cannot mutate B UI state');
assert.deepEqual(await deferredA, { mayWriteError: false, mayClearBusy: false }, 'late A catch/finally cannot mutate B UI state');
assert.equal(operationTracker.isCurrent(operationB), true, 'B operation remains current after A settles');

const confirmTracker = recoveryModule.createAppleDisplayRecoveryOperationTracker();
const confirmA = confirmTracker.begin('same-user', 'same-ready-key');
let resolveUpdateA;
const updateA = new Promise((resolve) => { resolveUpdateA = resolve; });
const effectsA = [];
let busyForB = true;
const confirmPipelineA = recoveryModule.runAppleDisplayRecoveryConfirmation({
  update: () => updateA,
  consume: async () => { effectsA.push('consume'); },
  refresh: async () => { effectsA.push('refresh'); },
  resume: () => { effectsA.push('resume'); },
  notify: () => { effectsA.push('notify'); },
  isCurrent: () => confirmTracker.isCurrent(confirmA),
}).finally(() => {
  if (confirmTracker.isCurrent(confirmA)) busyForB = false;
});
const confirmB = confirmTracker.begin('same-user', 'same-ready-key');
resolveUpdateA('Saved Name');
assert.equal(await confirmPipelineA, false, 'same-identity A confirmation stops after deferred update when B supersedes it');
assert.deepEqual(effectsA, [], 'superseded A cannot consume, refresh, resume, or notify');
assert.equal(busyForB, true, 'superseded A finally cannot clear B busy state');
assert.equal(confirmTracker.isCurrent(confirmB), true, 'same-identity B operation remains current');

console.log('DOSO Apple display-name recovery UI/contract PASS (68 focused assertions)');
