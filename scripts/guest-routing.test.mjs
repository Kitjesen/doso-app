import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createDeviceBootstrapIntent } from '../src/services/deviceBootstrapIntent.ts';

// Evaluate the actual composition-root gates/callbacks without mounting its
// unrelated account, cloud and hardware effects. These fixtures never use an
// authenticated backend or a physical robot.
const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = new Map(), elements = [], conditionals = [], calls = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node);
  if (ts.isJsxSelfClosingElement(node)) elements.push(node);
  if (ts.isIfStatement(node)) conditionals.push(node);
  if (ts.isCallExpression(node)) calls.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
const evaluate = (node, context) => vm.runInNewContext(ts.transpileModule(`(${node.getText(ast)})`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
function initializer(name, context) {
  const node = variables.get(name)?.initializer;
  assert.ok(node, `App must define ${name}`);
  return evaluate(node, context);
}

test('device test entry requires exact native QA capability and successful local guest fence', () => {
  const evaluateEntry = (capability, enterResult) => {
    let guestCalls = 0, opened = 0;
    const callback = variables.get('enterDeviceTest').initializer.arguments[0];
    evaluate(callback, { isBrainstemLanAvailable: () => capability,
      enterGuest: () => { guestCalls++; return enterResult; }, setDeviceTestMode: value => { if (value) opened++; } })();
    return { guestCalls, opened };
  };
  assert.deepEqual(evaluateEntry(false, true), { guestCalls: 0, opened: 0 });
  assert.deepEqual(evaluateEntry(true, false), { guestCalls: 1, opened: 0 });
  assert.deepEqual(evaluateEntry(true, true), { guestCalls: 1, opened: 1 });
});

test('entering local test retires the hidden account G20 reader', () => {
  const hook = calls.find(node => node.expression.getText(ast) === 'useG20Input');
  assert.ok(hook);
  const active = hook.arguments[0];
  assert.equal(evaluate(active, { guestMode: true, stage: 'control', robotConnectionVisible: false }), false);
  assert.equal(evaluate(active, { guestMode: false, stage: 'control', robotConnectionVisible: false }), true);
  assert.equal(evaluate(active, { guestMode: false, stage: 'control', robotConnectionVisible: true }), false);
});

test('QA entry is rendered before account restoration errors, has no fabricated identity, and exits locally', () => {
  const branch = conditionals.find(node => node.expression.getText(ast) === 'deviceTestMode && isBrainstemLanAvailable()');
  assert.ok(branch && /isBrainstemLanAvailable\(\)/.test(branch.expression.getText(ast)));
  assert.ok(branch.pos < conditionals.find(node => node.expression.getText(ast) === 'initializationError || recoveryExitBusy').pos);
  assert.match(branch.thenStatement.getText(ast), /<DeviceTestScreen onExit=\{exitDeviceTest\}/);
  assert.doesNotMatch(branch.thenStatement.getText(ast), /user=|profile=|session=|onLogin/);
  const exit = variables.get('exitDeviceTest').initializer.arguments[0];
  const changes = [];
  evaluate(exit, { setDeviceTestMode: value => changes.push(['test', value]), setGuestMode: value => changes.push(['guest', value]) })();
  assert.deepEqual(changes, [['test', false], ['guest', false]]);
});
function screen(name) {
  const node = elements.find(node => node.tagName.getText(ast) === name);
  assert.ok(node, `App must mount ${name}`);
  return node;
}
function prop(node, name, context) {
  const attr = node.attributes.properties.find(item => item.name?.getText(ast) === name);
  assert.ok(attr?.initializer && ts.isJsxExpression(attr.initializer), `${node.tagName.getText(ast)} explicit ${name}`);
  return evaluate(attr.initializer.expression, context);
}
function context(overrides = {}) {
  return {
    guestMode: false, deviceTestMode: false, user: { id: 'cached-user' }, stage: 'main',
    deviceBootstrapIntent: { current: { canCommit: () => true } },
    preparedSessionKey: 'prepared-fixture', preparedUserId: 'cached-user',
    authLoading: false, initializationError: null, mfaVerificationPending: false, accountBusy: false,
    deviceBootstrapBusy: false,
    ...overrides,
  };
}

test('cached authenticated account cannot grant a guest native control or account actions', () => {
  const readyAccount = context();
  assert.equal(initializer('directConnectionReady', readyAccount), true);
  assert.equal(initializer('canOpenRobotAccountActions', readyAccount), true);
  for (const stage of ['main', 'models', 'control', 'bind-device', 'ble-discovery']) {
    const guest = context({ guestMode: true, stage });
    guest.directConnectionReady = initializer('directConnectionReady', guest);
    guest.canOpenRobotAccountActions = initializer('canOpenRobotAccountActions', guest);
    guest.canSelectDirectTarget = initializer('canSelectDirectTarget', guest);
    assert.equal(guest.directConnectionReady, false, stage);
    assert.equal(guest.canOpenRobotAccountActions, false, stage);
    assert.equal(guest.canSelectDirectTarget, false, stage);
    const connection = screen('RobotConnectionScreen');
    for (const name of ['onOpenControl', 'onUseConnection', 'onBindDevice', 'onOpenDeviceEnrollment', 'onOpenAccountDevice', 'onOpenBleDiscovery']) {
      assert.equal(prop(connection, name, guest), undefined, `${stage}: ${name}`);
    }
    assert.equal(prop(connection, 'accountDeviceName', guest), undefined);
    assert.equal(prop(connection, 'initialEndpoint', guest), undefined, 'guest cannot inherit an account-selected endpoint');
  }
});

test('guest native control hook remains unready even if hidden account stage is control', () => {
  const declaration = variables.get('brainstemControl')?.initializer;
  assert.ok(declaration && ts.isCallExpression(declaration));
  const input = declaration.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(input));
  const ready = input.properties.find(item => item.name?.getText(ast) === 'ready');
  assert.ok(ready && ts.isPropertyAssignment(ready));
  for (const robotConnectionVisible of [false, true]) {
    assert.equal(evaluate(ready.initializer, { directConnectionReady: false, stage: 'control', robotConnectionVisible }), false);
  }
});

test('a pending device read cannot reuse a previously prepared account to grant real control', () => {
  const reading = context({ deviceBootstrapBusy: true });
  reading.directConnectionReady = initializer('directConnectionReady', reading);
  reading.canOpenRobotAccountActions = initializer('canOpenRobotAccountActions', reading);
  reading.canSelectDirectTarget = initializer('canSelectDirectTarget', reading);
  assert.equal(reading.directConnectionReady, false);
  assert.equal(reading.canOpenRobotAccountActions, false);
  assert.equal(reading.canSelectDirectTarget, false);
  assert.equal(prop(screen('RobotConnectionScreen'), 'onOpenControl', reading), undefined);
});

test('guest shell precedes account errors/loading and receives only local navigation callbacks', () => {
  const guest = conditionals.find(node => node.expression.getText(ast) === 'guestMode'
    && node.thenStatement.getText(ast).includes('<GuestScreen'));
  assert.ok(guest, 'a dedicated guest branch must shield account loading/error states');
  const connection = conditionals.find(node => node.expression.getText(ast) === 'robotConnectionVisible');
  const authError = conditionals.find(node => node.expression.getText(ast).includes('initializationError || recoveryExitBusy'));
  const authLoading = conditionals.find(node => node.expression.getText(ast).includes('authLoading || mfaVerificationPending'));
  assert.ok(connection.pos < guest.pos && guest.pos < authError.pos && guest.pos < authLoading.pos);
  const component = screen('GuestScreen');
  assert.deepEqual(component.attributes.properties.map(item => item.name?.getText(ast)).sort(), ['onExitGuest', 'onOpenConnection']);
  const calls = [];
  const exit = variables.get('exitGuest')?.initializer;
  assert.ok(exit && ts.isCallExpression(exit));
  const exitGuest = evaluate(exit.arguments[0], {
    setGuestMode: value => calls.push(['guest', value]),
    setStage: () => assert.fail('leaving guest must preserve the underlying account route'),
  });
  const onExit = prop(component, 'onExitGuest', { exitGuest });
  onExit();
  assert.deepEqual(calls, [['guest', false]]);
  const onConnect = prop(component, 'onOpenConnection', { setRobotConnectionVisible: value => calls.push(['connection', value]) });
  onConnect(); assert.deepEqual(calls.at(-1), ['connection', true]);
});

test('Android guest Back never logs out the hidden account and connection Back stays in guest', () => {
  const call = calls.find(node => node.expression.getText(ast) === 'BackHandler.addEventListener');
  assert.ok(call && ts.isArrowFunction(call.arguments[1]));
  for (const stage of ['models', 'username-onboarding', 'reset-password', 'main']) {
    const events = [];
    const handler = evaluate(call.arguments[1], { guestMode: true, deviceTestMode: false, robotConnectionVisible: false, __DEV__: false,
      stage, setGuestMode: value => events.push(['guest', value]),
      handleLogout: () => assert.fail('guest Back must not clear an existing account'),
      setStage: () => assert.fail('guest Back must not mutate the hidden account route'),
    });
    assert.equal(handler(), true);
    assert.deepEqual(events, [['guest', false]], stage);
  }
  const events = [];
  const handler = evaluate(call.arguments[1], { guestMode: true, deviceTestMode: false, robotConnectionVisible: true,
    setRobotConnectionVisible: value => events.push(['connection', value]),
    setGuestMode: () => assert.fail('connection Back should first return to the guest shell'),
  });
  assert.equal(handler(), true); assert.deepEqual(events, [['connection', false]]);
});

test('entering guest does not authenticate, sign out, overwrite the account route or persist a fake user', () => {
  const node = variables.get('enterGuest')?.initializer;
  assert.ok(node, 'guest entry callback exists');
  const callback = ts.isCallExpression(node) ? node.arguments[0] : node;
  const actions = [];
  const forbidden = () => assert.fail('guest entry must not call an account mutation');
  const enter = evaluate(callback, { accountBusy: false, recoveryExitBusy: false, logoutPending: false, mfaBusy: false, mfaVerificationPending: false,
    accountFlowInFlightRef: { current: false }, otpDeliveryInFlightRef: { current: false },
    setGuestMode: value => actions.push(['guest', value]),
    setRobotConnectionVisible: value => actions.push(['connection', value]),
    setConnectionDiagnosticsOpen: value => actions.push(['diagnostics', value]),
    setStage: forbidden, login: forbidden, register: forbidden, logout: forbidden,
    handleLogout: forbidden, logoutLocalSession: forbidden, signInAnonymously: forbidden,
  });
  enter();
  assert.ok(actions.some(([name, value]) => name === 'guest' && value === true));
  assert.doesNotMatch(callback.getText(ast), /AsyncStorage|SecureStore|signInAnonymously|logoutLocalSession|\.signOut\s*\(/);
});

test('restore error and ordinary loading expose guest without cancelling account security operations', () => {
  const enterGuest = () => {};
  const withGuest = tag => elements.find(node => node.tagName.getText(ast) === tag
    && node.attributes.properties.some(attr => attr.name?.getText(ast) === 'onEnterGuest'));
  const error = withGuest('ServiceErrorScreen');
  const loading = withGuest('LoadingScreen');
  assert.ok(error && loading);
  const safe = { accountBusy: false, recoveryExitBusy: false, mfaBusy: false, mfaVerificationPending: false, logoutPending: false, enterGuest };
  assert.equal(prop(error, 'onEnterGuest', safe), enterGuest);
  for (const key of ['recoveryExitBusy', 'accountBusy', 'mfaBusy', 'mfaVerificationPending']) {
    assert.equal(prop(error, 'onEnterGuest', { ...safe, [key]: true }), undefined, key);
  }
  assert.equal(prop(loading, 'onEnterGuest', { ...safe, deviceBootstrapBusy: true }), enterGuest,
    'a pending readonly bootstrap must not hide the visitor escape');
  for (const key of ['logoutPending', 'accountBusy', 'mfaBusy', 'mfaVerificationPending', 'recoveryExitBusy']) {
    assert.equal(prop(loading, 'onEnterGuest', { ...safe, [key]: true }), undefined, key);
  }
  assert.equal(prop(screen('LoginScreen'), 'onEnterGuest', { enterGuest }), enterGuest);
});

function bootstrapHarness({ faultAccountBusyForRead = false } = {}) {
  const effectCall = calls.find(node => node.expression.getText(ast) === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('deviceRepository'));
  assert.ok(effectCall && ts.isArrowFunction(effectCall.arguments[0]), 'actual device bootstrap effect');
  const requests = [], events = [];
  const state = {
    guestMode: false, accountBusy: false, deviceBootstrapBusy: false,
    device: { id: 'preserved-device' }, model: { id: 'preserved-model' },
    stage: 'main', tab: 'profile', deviceLoadError: 'previous-error',
  };
  const completedDeviceBootstrapKey = { current: null };
  const intent = createDeviceBootstrapIntent();
  const values = {
    guestMode: false, authLoading: false, initializationError: null, mfaVerificationPending: false,
    user: { id: 'cached-user' }, profile: { id: 'cached-user' }, recovery: false, recoveryLink: false,
    appleRecoveryProbeResolved: true, pendingAppleDisplayName: null, preparedUserId: 'cached-user',
    hasClaimedUsername: () => true, deviceLoadAttempt: 0, completedDeviceBootstrapKey,
    accountBusy: false, recoveryExitBusy: false, mfaBusy: false, mfaProbeFailed: false,
    accountFlowInFlightRef: { current: false }, otpDeliveryInFlightRef: { current: false },
    deviceBootstrapIntent: { current: { ...intent,
      clearLocalEntry: () => { events.push(['clear-local-entry']); intent.clearLocalEntry(); },
    } },
    deviceRepository: { list: () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); }) },
    getRobotModel: code => ({ code }), humanizeAuthError: () => 'fixed fixture error',
    setAccountBusy: value => { values.accountBusy = state.accountBusy = value; events.push(['accountBusy', value]); },
    setDeviceBootstrapBusy: value => { values.deviceBootstrapBusy = state.deviceBootstrapBusy = value; events.push(['bootstrapBusy', value]); },
    setGuestMode: value => { values.guestMode = state.guestMode = value; events.push(['guestMode', value]); },
    setDevice: value => { state.device = value; events.push(['device', value]); },
    setSelectedModel: value => { state.model = value; events.push(['model', value]); },
    setDeviceLoadError: value => { state.deviceLoadError = value; events.push(['error', value]); },
    setStage: value => { state.stage = value; events.push(['stage', value]); },
    setActiveTab: value => { state.tab = value; events.push(['tab', value]); },
    setRobotConnectionVisible: value => events.push(['connection', value]),
    setConnectionDiagnosticsOpen: value => events.push(['diagnostics', value]),
  };
  let effectSource = effectCall.arguments[0].getText(ast);
  if (faultAccountBusyForRead) {
    // Focused fault injection of the reported former defect, not a historical
    // baseline file or an alternative production implementation.
    assert.ok(effectSource.includes('setDeviceBootstrapBusy(true)'));
    effectSource = effectSource.replace('setDeviceBootstrapBusy(true)', 'setAccountBusy(true)');
  }
  const compile = text => vm.runInNewContext(ts.transpileModule(`(${text})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, values);
  const updateCall = calls.find(node => node.expression.getText(ast) === 'deviceBootstrapIntent.current.update');
  assert.ok(updateCall && ts.isObjectLiteralExpression(updateCall.arguments[0]), 'actual render-time intent update');
  const renderIntent = ({ faultWithoutGuestGuard = false } = {}) => {
    let updateSource = updateCall.arguments[0].getText(ast);
    if (faultWithoutGuestGuard) {
      // Remove only the synchronous guest revocation to demonstrate why the
      // passive cleanup alone cannot protect this render/cleanup interval.
      assert.ok(updateSource.includes('!guestMode && user'));
      updateSource = updateSource.replace('!guestMode && user', 'user');
    }
    intent.update(compile(updateSource));
  };
  renderIntent();
  const effect = compile(effectSource);
  const enterNode = variables.get('enterGuest').initializer;
  const enterGuest = compile(enterNode.arguments[0].getText(ast));
  const exitNode = variables.get('exitGuest').initializer;
  const exitGuest = compile(exitNode.arguments[0].getText(ast));
  return { state, values, events, requests, completedDeviceBootstrapKey, effect, enterGuest, exitGuest, intent, renderIntent };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('pending readonly device lookup leaves account writes idle and guest entry available', async () => {
  const app = bootstrapHarness();
  const cleanup = app.effect();
  assert.equal(typeof cleanup, 'function'); assert.equal(app.requests.length, 1);
  assert.equal(app.state.deviceBootstrapBusy, true); assert.equal(app.state.accountBusy, false);
  assert.equal(app.events.some(([name]) => name === 'accountBusy'), false,
    'valid readonly lookup must never take the account write flag');
  const loading = elements.find(node => node.tagName.getText(ast) === 'LoadingScreen'
    && node.attributes.properties.some(attr => attr.name?.getText(ast) === 'onEnterGuest'));
  const loadingGate = conditionals.find(node => node.thenStatement.getText(ast).includes('<LoadingScreen')
    && node.expression.getText(ast).includes('deviceBootstrapBusy'));
  assert.ok(loadingGate);
  assert.equal(evaluate(loadingGate.expression, app.values), true, 'only the pending device read selects the loading surface');
  assert.equal(prop(loading, 'onEnterGuest', { ...app.values, logoutPending: false, enterGuest: app.enterGuest }), app.enterGuest);
  app.enterGuest(); assert.equal(app.state.guestMode, true);
  cleanup(); assert.equal(app.state.deviceBootstrapBusy, false);
  app.requests[0].resolve([]); await settle();
});

test('readonly-query regression detects taking accountBusy instead of the dedicated read flag', async () => {
  const app = bootstrapHarness({ faultAccountBusyForRead: true });
  const cleanup = app.effect();
  assert.equal(app.state.accountBusy, true);
  assert.throws(() => {
    app.enterGuest(); assert.equal(app.state.guestMode, true, 'readonly queries must allow guest entry');
  }, /readonly queries must allow guest entry/);
  cleanup(); app.requests[0].resolve([]); await settle();
});

for (const outcome of ['success', 'failure']) test(`retired readonly bootstrap ${outcome} cannot overwrite guest navigation or device`, async () => {
  const app = bootstrapHarness();
  const cleanup = app.effect();
  app.enterGuest(); cleanup();
  const retiredEvents = app.events.length;
  const device = app.state.device, model = app.state.model, route = app.state.stage, tab = app.state.tab;
  if (outcome === 'success') app.requests[0].resolve([{ id: 'late-device', model_code: 'late-model' }]);
  else app.requests[0].reject(new Error('fixture rejected after guest entry'));
  await settle();
  assert.equal(app.events.length, retiredEvents, 'late then/catch/finally must all remain inert');
  assert.equal(app.state.device, device); assert.equal(app.state.model, model);
  assert.equal(app.state.stage, route); assert.equal(app.state.tab, tab);
  assert.equal(app.state.guestMode, true); assert.equal(app.state.accountBusy, false);
  assert.equal(app.completedDeviceBootstrapKey.current, null, 'a retired request must not suppress a future read');
  assert.equal(app.effect(), undefined, 'guest dependency guard does not start another query');
  assert.equal(app.requests.length, 1);
});

for (const outcome of ['success', 'failure']) test(`guest render revokes a late bootstrap ${outcome} before passive cleanup`, async () => {
  const app = bootstrapHarness();
  assert.equal(app.intent.enter(), true, 'the account has a legitimate local selection before guest entry');
  const cleanup = app.effect();
  const preserved = { device: app.state.device, model: app.state.model, stage: app.state.stage,
    tab: app.state.tab, error: app.state.deviceLoadError };
  app.enterGuest(); app.renderIntent();
  assert.equal(app.state.guestMode, true);
  assert.equal(app.intent.canCommit('cached-user'), false, 'render must retire account commits before effect cleanup');
  assert.equal(app.state.deviceBootstrapBusy, true, 'old passive cleanup has deliberately not run');
  const atGuestRender = app.events.length;
  if (outcome === 'success') app.requests[0].resolve([{ id: 'late-before-cleanup', model_code: 'late-model' }]);
  else app.requests[0].reject(new Error('fixture failed during render/cleanup gap'));
  await settle();
  assert.equal(app.state.device, preserved.device); assert.equal(app.state.model, preserved.model);
  assert.equal(app.state.stage, preserved.stage); assert.equal(app.state.tab, preserved.tab);
  assert.equal(app.state.deviceLoadError, preserved.error); assert.equal(app.completedDeviceBootstrapKey.current, null);
  assert.equal(app.events.slice(atGuestRender).some(([name]) => name !== 'bootstrapBusy'), false,
    'only finishing the readonly busy indicator may change during this interval');
  assert.equal(app.state.accountBusy, false);
  cleanup();
  app.exitGuest(); app.renderIntent();
  assert.equal(app.intent.canCommit('cached-user'), true);
  assert.equal(app.intent.preservesNavigation('cached-user'), true,
    'same-account guest browsing pauses readiness without resetting the local selection');
});

test('render-gap regression detects removal of the synchronous guest intent guard', async () => {
  const app = bootstrapHarness();
  const cleanup = app.effect();
  const preserved = app.state.device;
  app.enterGuest(); app.renderIntent({ faultWithoutGuestGuard: true });
  assert.equal(app.intent.canCommit('cached-user'), true, 'targeted old-readiness fault leaves the stale owner live');
  app.requests[0].resolve([{ id: 'wrongly-committed-before-cleanup', model_code: 'late-model' }]);
  await settle();
  assert.throws(() => assert.equal(app.state.device, preserved, 'guest render must block late account device commits'),
    /guest render must block late account device commits/);
  cleanup();
});

test('leaving guest can start a fresh bootstrap without clearing preserved account/device state', async () => {
  const app = bootstrapHarness();
  const firstCleanup = app.effect(); app.enterGuest(); firstCleanup();
  const preserved = app.state.device;
  app.requests[0].resolve([{ id: 'retired-device' }]); await settle();
  app.exitGuest(); assert.equal(app.state.guestMode, false); assert.equal(app.state.device, preserved);
  const secondCleanup = app.effect();
  assert.equal(app.requests.length, 2); assert.equal(app.state.deviceBootstrapBusy, true);
  app.requests[1].resolve([{ id: 'fresh-device', model_code: 'fresh-model' }]); await settle();
  assert.equal(app.state.device.id, 'fresh-device'); assert.equal(app.state.model.code, 'fresh-model');
  assert.equal(app.state.stage, 'main'); assert.equal(app.state.tab, 'home');
  assert.equal(app.completedDeviceBootstrapKey.current, 'cached-user:0');
  assert.equal(app.state.deviceBootstrapBusy, false); assert.equal(app.state.accountBusy, false);
  secondCleanup();
});

test('guest entry refuses to interrupt account writes, recovery logout and MFA verification', () => {
  const node = variables.get('enterGuest')?.initializer;
  assert.ok(node && ts.isCallExpression(node));
  const callback = node.arguments[0];
  for (const blocked of [
    { accountBusy: true }, { recoveryExitBusy: true }, { mfaBusy: true }, { mfaVerificationPending: true },
    { accountFlowInFlightRef: { current: true } }, { otpDeliveryInFlightRef: { current: true } },
  ]) {
    const reject = () => assert.fail('blocked guest entry must not change the current flow');
    const enter = evaluate(callback, { accountBusy: false, recoveryExitBusy: false, mfaBusy: false, mfaVerificationPending: false,
      accountFlowInFlightRef: { current: false }, otpDeliveryInFlightRef: { current: false },
      setGuestMode: reject, setRobotConnectionVisible: reject, setConnectionDiagnosticsOpen: reject, ...blocked });
    enter();
  }
});
