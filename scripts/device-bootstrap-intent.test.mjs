// Runs the real App navigation effect/handlers with deferred repository results.
// React scheduling and the device repository are fixture boundaries; no device,
// network, credentials or AuthProvider changes are involved.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const appFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
const declarations = [];
const visit = node => { if (ts.isVariableDeclaration(node)) declarations.push(node); ts.forEachChild(node, visit); };
visit(appFunction);
const initializer = name => declarations.find(node => node.name.getText(ast) === name)?.initializer.getText(ast);
const navigation = appFunction.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'useEffect'
  && node.expression.arguments[0]?.getText(ast).includes('const bootstrapKey ='))?.expression;
assert.ok(navigation, 'App device bootstrap must be exercised');
const intentUpdate = appFunction.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(ast) === 'deviceBootstrapIntent.current.update')?.getText(ast);
let skipHandler, modelBusy;
const findSkip = node => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'ModelSelectScreen') {
    skipHandler = node.attributes.properties.find(attribute => attribute.name?.getText(ast) === 'onSkip')?.initializer.expression.getText(ast);
    modelBusy = node.attributes.properties.find(attribute => attribute.name?.getText(ast) === 'busy')?.initializer.expression.getText(ast);
  }
  ts.forEachChild(node, findSkip);
};
findSkip(appFunction);
assert.ok(skipHandler);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
  const state = { stage: 'login', selectedModel: null, device: null, accountBusy: false, deviceLoadError: null,
    deviceBusy: false, authError: null, accountDevices: [], deviceBootstrapBusy: false };
  const requests = [], claims = [];
  const context = vm.createContext({
    user: { id: 'user-a' }, profile: { id: 'user-a', username_claimed_at: 'fixture', username_provenance: 'registration' },
    preparedUserId: 'user-a', preparedSessionKey: 'prepared-a-1', authLoading: false, initializationError: null,
    deviceLoadAttempt: 0, mfaVerificationPending: false, mfaProbeFailed: false, recovery: false, recoveryLink: false,
    deviceBusy: false, accountBusy: false, guestMode: false,
    setProfileDeviceOpen() {},
    selectedDeviceStore: { load: async () => null },
    deviceSettingsContext: { current: {} },
    deviceSelectionRevision: { current: 0 },
    appleRecoveryProbeResolved: true, pendingAppleDisplayName: null,
    useRef: value => ({ current: value }), useCallback: callback => callback,
    AbortController, Error, BIND_DEVICE_TIMEOUT_MS: 15000,
    // Only the real reconciliation backoff clock is replaced; its identity,
    // UUID matching, repository reads and caller attempt guards still run.
    setTimeout: callback => { queueMicrotask(callback); return 0; },
    getRobotModel: code => ({ id: code, name: code }),
    robotModels: [{ id: 'thunder-01', name: 'THUNDER 01' }],
    deviceRepository: {
      list() { const request = deferred(); requests.push(request); return request.promise; },
      claim() { const request = deferred(); claims.push(request); return request.promise; },
    },
    humanizeAuthError: () => 'device-load-failed', notify() {},
  });
  for (const key of Object.keys(state)) context['set' + key[0].toUpperCase() + key.slice(1)] = value => {
    if (key === 'device') context.deviceSelectionRevision.current += 1;
    state[key] = typeof value === 'function' ? value(state[key]) : value;
    context[key] = state[key];
  };
  const evaluate = source => vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const claimedProvenances = ast.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
    .find(node => node.name.getText(ast) === 'CLAIMED_USERNAME_PROVENANCES');
  evaluate(`const ${claimedProvenances.getText(ast)};`);
  context.hasClaimedUsername = evaluate(`(${ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'hasClaimedUsername').getText(ast)})`);
  const helper = new URL('../src/services/deviceBootstrapIntent.ts', import.meta.url);
  if (existsSync(helper)) {
    context.module = { exports: {} };
    context.exports = context.module.exports;
    evaluate(readFileSync(helper, 'utf8'));
    Object.assign(context, context.module.exports);
  }
  context.completedDeviceBootstrapKey = evaluate(`(${initializer('completedDeviceBootstrapKey')})`);
  if (initializer('deviceBootstrapIntent')) context.deviceBootstrapIntent = evaluate(`(${initializer('deviceBootstrapIntent')})`);
  for (const name of ['bindDeviceAbortControllerRef', 'pendingBindDeviceIdRef', 'bindDeviceAttemptRef', 'currentUserIdRef', 'bleRobotIdRef']) {
    context[name] = evaluate(`(${initializer(name)})`);
  }
  context.returnToDeviceSettings = evaluate(`(${initializer('returnToDeviceSettings')})`);
  context.reconcileBoundDevice = evaluate(`(${initializer('reconcileBoundDevice')})`);
  let dependencies, cleanup;
  const render = (values = {}) => {
    Object.assign(context, values);
    context.currentUserIdRef.current = context.user?.id ?? null;
    if (intentUpdate) evaluate(intentUpdate);
    const next = evaluate(`(${navigation.arguments[1].getText(ast)})`);
    if (!dependencies || next.some((value, i) => !Object.is(value, dependencies[i]))) {
      cleanup?.();
      dependencies = next;
      cleanup = evaluate(`(${navigation.arguments[0].getText(ast)})`)();
    }
  };
  return { state, requests, claims, render,
    enter: model => evaluate(`(${initializer('enterApp')})`)(model),
    skip: () => evaluate(`(${skipHandler})`)(),
    modelIsBusy: () => evaluate(`(${modelBusy})`),
    bind: () => evaluate(`(${initializer('handleBindDevice')})`)('8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5', 'fixture-code'),
    cancelBind: () => evaluate(`(${initializer('cancelBindDeviceAttempt')})`)(),
    choosePage: stage => context.setStage(stage),
    async showModels() { render(); requests.at(-1).resolve([]); await settle(); assert.equal(state.stage, 'models'); },
  };
}

test('Continue during same-account rebootstrap keeps the chosen model and current workspace page after a late empty list', async () => {
  const app = fixture();
  await app.showModels();
  app.render({ authLoading: true, preparedSessionKey: null });
  app.render({ authLoading: false, preparedSessionKey: 'prepared-a-2', appleRecoveryProbeResolved: false });
  app.render({ appleRecoveryProbeResolved: true });
  const pending = app.requests.at(-1);
  const model = { id: 'thunder-01', name: 'THUNDER 01' };
  await app.enter(model);
  assert.equal(app.state.stage, 'control');
  app.choosePage('joint-status');
  pending.resolve([]);
  await settle();
  assert.equal(app.state.stage, 'joint-status');
  assert.equal(app.state.selectedModel, model);
  assert.equal(app.state.device, null);
});

test('failed session preparation cannot accept another local model entry or preserve the earlier entry', async () => {
  const app = fixture();
  await app.showModels();
  const chosen = { id: 'thunder-01', name: 'THUNDER 01' };
  await app.enter(chosen);
  app.choosePage('joint-status');
  app.render({ initializationError: new Error('synthetic preparation failure') });
  await app.enter({ id: 'other-model', name: 'Other model' });
  assert.equal(app.state.selectedModel, chosen);
  assert.equal(app.state.stage, 'joint-status');
  app.render({ initializationError: null, appleRecoveryProbeResolved: false });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.stage, 'models');
  assert.equal(app.state.selectedModel, null);
});

test('the local Skip entry has the same navigation ownership as Continue', async () => {
  const app = fixture();
  await app.showModels();
  app.skip();
  const chosen = app.state.selectedModel;
  assert.equal(app.state.stage, 'control');
  app.choosePage('joint-status');
  app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.stage, 'joint-status');
  assert.equal(app.state.selectedModel, chosen);
});

test('an already-open robot workspace keeps its local model and selected page through same-account preparation and an empty rebootstrap', async () => {
  const app = fixture();
  await app.showModels();
  const model = { id: 'thunder-01', name: 'THUNDER 01' };
  await app.enter(model);
  app.choosePage('main');
  app.render({ authLoading: true, preparedSessionKey: null, profile: null });
  app.render({ authLoading: false, preparedSessionKey: 'prepared-a-2',
    profile: { id: 'user-a', username_claimed_at: 'fixture', username_provenance: 'registration' }, appleRecoveryProbeResolved: false });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.stage, 'main');
  assert.equal(app.state.selectedModel, model);
});

test('logout and account replacement prevent an older device response from committing', async () => {
  for (const nextUser of [null, { id: 'user-b' }]) {
    const app = fixture();
    await app.showModels();
    await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
    app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
    app.render({ appleRecoveryProbeResolved: true });
    const obsolete = app.requests.at(-1);
    app.render({ user: nextUser, preparedUserId: nextUser?.id ?? null, preparedSessionKey: nextUser ? 'prepared-b-1' : null,
      profile: nextUser ? { id: 'user-b', username_claimed_at: 'fixture-b', username_provenance: 'registration' } : null });
    const stateAfterIdentityChange = { ...app.state };
    obsolete.resolve([{ id: 'old-user-device', model_code: 'old-model' }]);
    await settle();
    assert.deepEqual(app.state, stateAfterIdentityChange);
    if (nextUser) {
      app.requests.at(-1).resolve([]);
      await settle();
      assert.equal(app.state.stage, 'models');
      assert.equal(app.state.selectedModel, null);
      assert.equal(app.state.device, null);
    } else {
      assert.equal(app.state.stage, 'login');
      assert.equal(app.state.selectedModel, null);
    }
  }
});

test('an unresolved preparation probe disables the existing model Continue control', async () => {
  const app = fixture();
  await app.showModels();
  assert.equal(app.modelIsBusy(), false);
  app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
  assert.equal(app.modelIsBusy(), true);
});

test('trusted bound-device results remain authoritative and retire the old unbound local entry', async () => {
  const app = fixture();
  await app.showModels();
  await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
  app.render({ deviceLoadAttempt: 1 });
  const trusted = { id: 'real-repository-device', owner_id: 'user-a', is_demo: false, model_code: 'bound-model' };
  app.requests.at(-1).resolve([trusted]);
  await settle();
  assert.equal(app.state.device, trusted);
  assert.equal(app.state.selectedModel.id, 'bound-model');
  app.render({ deviceLoadAttempt: 2 });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.device, null);
  assert.equal(app.state.stage, 'models');
  assert.equal(app.state.selectedModel, null);
});

test('reload restores only a valid device selection from the current account', async () => {
  const a = { id: 'a', owner_id: 'user-a', is_demo: false, model_code: 'a' };
  const b = { id: 'b', owner_id: 'user-a', is_demo: false, model_code: 'b' };
  const foreign = { id: 'foreign', owner_id: 'user-b', is_demo: false, model_code: 'foreign' };
  for (const [rememberedId, expected] of [['b', b], ['removed', a], ['foreign', a]]) {
    const app = fixture();
    app.render({ selectedDeviceStore: { load: async owner => { assert.equal(owner, 'user-a'); return rememberedId; } } });
    app.requests.at(-1).resolve([foreign, a, b]);
    await settle();
    assert.equal(app.state.device, expected);
    assert.deepEqual(Array.from(app.state.accountDevices), [a, b]);
  }
});

test('a delayed bootstrap success or failure cannot overwrite a newer successful binding', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const app = fixture();
    app.render();
    const pendingList = app.requests.at(-1);
    const trusted = { id: 'new-dog', owner_id: 'user-a', model_code: 'new-model', display_name: 'New dog' };
    const binding = app.bind();
    app.claims.at(-1).resolve(trusted);
    await binding;
    pendingList[outcome](outcome === 'resolve' ? [] : Error('old request failed'));
    await settle();
    assert.equal(app.state.device, trusted);
    assert.equal(app.state.stage, 'main');
  }
});

test('recovery, MFA, username, Apple and failed-preparation gates retire local navigation and reject late device commits', async () => {
  const claimedProfile = { id: 'user-a', username_claimed_at: 'fixture', username_provenance: 'registration' };
  for (const gate of [
    { recovery: true }, { recoveryLink: true }, { mfaVerificationPending: true },
    { profile: { ...claimedProfile, username_claimed_at: null } },
    { profile: { ...claimedProfile, username_provenance: 'untrusted' } },
    { pendingAppleDisplayName: { userId: 'user-a', displayName: 'Synthetic Name' } },
    { initializationError: new Error('synthetic preparation failure') },
    { mfaProbeFailed: true, appleRecoveryProbeResolved: false },
  ]) {
    const app = fixture();
    await app.showModels();
    const chosen = { id: 'thunder-01', name: 'THUNDER 01' };
    await app.enter(chosen);
    app.render({ deviceLoadAttempt: 1 });
    const obsolete = app.requests.at(-1);
    app.render(gate);
    const stateAtGate = { ...app.state };
    await app.enter({ id: 'forbidden-new-choice', name: 'Blocked' });
    obsolete.resolve([{ id: 'obsolete-device', model_code: 'obsolete' }]);
    await settle();
    assert.deepEqual(app.state, stateAtGate);
    app.render({ recovery: false, recoveryLink: false, mfaVerificationPending: false, profile: claimedProfile,
      pendingAppleDisplayName: null, initializationError: null, mfaProbeFailed: false, appleRecoveryProbeResolved: true, deviceLoadAttempt: 2 });
    app.requests.at(-1).resolve([]);
    await settle();
    assert.equal(app.state.stage, 'models');
    assert.equal(app.state.selectedModel, null);
  }
});

test('device lookup failure still reaches the existing device-error route after a local choice', async () => {
  const app = fixture();
  await app.showModels();
  await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
  app.render({ deviceLoadAttempt: 1 });
  app.requests.at(-1).reject(new Error('synthetic repository failure'));
  await settle();
  assert.equal(app.state.stage, 'device-error');
  assert.equal(app.state.deviceLoadError, 'device-load-failed');
});

test('a real claim-success handler retires the earlier local model entry before a later empty device list', async () => {
  const app = fixture();
  await app.showModels();
  await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
  const trusted = { id: 'claimed-device', model_code: 'bound-model', display_name: 'Fixture bound robot' };
  const binding = app.bind();
  app.claims.at(-1).resolve(trusted);
  await binding;
  assert.equal(app.state.device, trusted);
  assert.equal(app.state.selectedModel.id, 'bound-model');
  app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.device, null);
  assert.equal(app.state.stage, 'models');
  assert.equal(app.state.selectedModel, null);
});

test('an ambiguous claim reconciled by the real UUID-matching path retires the earlier local model entry', async () => {
  const app = fixture();
  await app.showModels();
  await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
  const trusted = { id: '8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5', model_code: 'bound-model', display_name: 'Fixture bound robot', serial_number: 'FIXTURE-SERIAL' };
  const previousReads = app.requests.length;
  const binding = app.bind();
  app.claims.at(-1).reject(new Error('synthetic network timeout'));
  await settle();
  assert.equal(app.requests.length, previousReads + 1);
  app.requests.at(-1).resolve([{ ...trusted, id: 'another-device' }, trusted]);
  await binding;
  assert.equal(app.state.device, trusted);
  assert.equal(app.state.selectedModel.id, 'bound-model');
  app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.device, null);
  assert.equal(app.state.stage, 'models');
  assert.equal(app.state.selectedModel, null);
});

test('the real cancel reconciliation retires local entry while the cancelled claim still cannot commit', async () => {
  const app = fixture();
  await app.showModels();
  await app.enter({ id: 'thunder-01', name: 'THUNDER 01' });
  const trusted = { id: '8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5', model_code: 'bound-model', display_name: 'Fixture bound robot', serial_number: 'fixture-serial' };
  const previousReads = app.requests.length;
  const binding = app.bind();
  const cancelledClaim = app.claims.at(-1);
  app.cancelBind();
  await settle();
  assert.equal(app.requests.length, previousReads + 1);
  app.requests.at(-1).resolve([trusted]);
  await settle();
  assert.equal(app.state.device, trusted);
  assert.equal(app.state.selectedModel.id, 'bound-model');
  const beforeLateClaim = { ...app.state };
  cancelledClaim.resolve({ id: 'obsolete-claim-device', model_code: 'obsolete', display_name: 'Obsolete fixture' });
  await binding;
  assert.deepEqual(app.state, beforeLateClaim);
  app.render({ appleRecoveryProbeResolved: false, preparedSessionKey: 'prepared-a-2' });
  app.render({ appleRecoveryProbeResolved: true });
  app.requests.at(-1).resolve([]);
  await settle();
  assert.equal(app.state.device, null);
  assert.equal(app.state.stage, 'models');
  assert.equal(app.state.selectedModel, null);
});
