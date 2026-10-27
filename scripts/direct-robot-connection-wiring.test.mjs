import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = new Map();
function visit(node) {
  if (ts.isJsxSelfClosingElement(node)) elements.set(node.tagName.getText(ast), node);
  ts.forEachChild(node, visit);
}
visit(ast);
const pure = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/directRobotConnection.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: pure, exports: pure.exports, Date, URL });
function attribute(screen, name, context = {}) {
  const attr = elements.get(screen)?.attributes.properties.find(item => item.name?.getText(ast) === name);
  assert.ok(attr?.initializer && ts.isJsxExpression(attr.initializer), screen + ' explicit ' + name);
  const expression = attr.initializer.expression.getText(ast);
  const diagnosticNavigationOwner = {};
  return vm.runInNewContext(ts.transpileModule('(' + expression + ')', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { describeDirectRobotConnection: pure.exports.describeDirectRobotConnection,
    diagnosticNavigationOwner, diagnosticNavigation: { current: diagnosticNavigationOwner }, AppState: { currentState: 'active' },
    directTelemetry: { presentation: null }, controlEndpoint: null, directEndpointLabel: 'IP 直连设备', ...context });
}
const snapshot = () => pure.exports.createDirectRobotConnectionSnapshot({ host: 'robot.example.test', port: 13145 }, {
  source: 'brainstem.grpc.direct', transport: 'grpc-tls', observedAt: new Date().toISOString(),
  motionAuthorized: false, cloudBindingVerified: false,
  status: { fsmKind: 'standing', transition: 'none', owner: 'grpc', motorOutputEnabled: true,
    criticalMotorFault: false, grpcLeaseActive: true, readyForWalk: true },
});
const dormantControl = () => ({ state: { connected: false, leaseActive: false, status: null, error: null },
  canBeginManualControl: false, canAcquire: false, manualPrepared: false,
  operationReadiness: Object.fromEntries(['stop', 'stand', 'sit', 'enableMotor', 'disableMotor', 'switchPolicy'].map(key => [key, { ready: false }])),
  operationCallbacks: {}, runtimeState: {} });

test('an explicitly selected IP target projects its own observed state, never a cloud identity or command grant', () => {
  const observed = snapshot();
  const context = { controlTarget: 'direct', directConnection: { snapshot: observed, presentation: pure.exports.describeDirectRobotConnection(observed) }, connected: true,
    deviceName: 'ACCOUNT ROBOT', deviceType: 'ACCOUNT MODEL', displayBatteryPercent: 88, brainstemControl: dormantControl() };
  const state = attribute('ControlScreen', 'runtimeState', context);
  assert.equal(state.motorState, 'enabled');
  assert.equal(state.posture, 'standing');
  assert.equal(state.controlAuthority, 'not-held');
  assert.notEqual(state.controlLink, 'connected');
  assert.equal(attribute('ControlScreen', 'robotName', context), 'IP 直连设备');
  assert.equal(attribute('ControlScreen', 'connected', context), false);
  assert.equal(attribute('ControlScreen', 'batteryPercent', context), null);
});

test('read-only direct target has no movement grant, recall, map or task callbacks and no preview input', () => {
  const context = { controlTarget: 'direct', __DEV__: true, manualCommandAvailable: true,
    routeCommandAvailable: true, taskCommandAvailable: true, recallCommandAvailable: true,
    brainstemControl: dormantControl(), controlEndpoint: null };
  for (const prop of ['allowInteractionPreview', 'canUseManualControl', 'canUseRouteMode', 'canUseTaskMode', 'canRecall']) {
    assert.equal(attribute('ControlScreen', prop, context), false, prop);
  }
  for (const prop of ['onRecall', 'onOpenMap', 'onOpenRoutes', 'onOpenTasks']) assert.equal(attribute('ControlScreen', prop, context), undefined, prop);
  const readiness = attribute('ControlScreen', 'operationReadiness', context);
  for (const operation of Object.values(readiness)) assert.equal(operation.ready, false);
  assert.equal(attribute('ControlScreen', 'productionInput', context), undefined);
});

test('expired direct status cannot inherit the account battery, identity or state', () => {
  const context = { controlTarget: 'direct', directConnection: { snapshot: null, presentation: null },
    connected: true, displayBatteryPercent: 77, deviceName: 'CLOUD ROBOT', deviceType: 'CLOUD TYPE', brainstemControl: dormantControl() };
  const state = attribute('ControlScreen', 'runtimeState', context);
  assert.equal(state.motorState, 'unknown'); assert.equal(state.posture, 'unknown');
  assert.equal(state.controlAuthority, 'not-held');
  assert.equal(attribute('ControlScreen', 'robotName', context), 'IP 直连设备');
  assert.equal(attribute('ControlScreen', 'connected', context), false);
});

test('production props use only the explicit live core, never the read-only snapshot or account grant', async () => {
  const calls = [];
  let held = false, sequence = 0;
  const status = () => ({ fsmKind: 'standing', transition: 'none', owner: held ? 'grpc' : 'none',
    motorOutputEnabled: true, criticalMotorFault: false, grpcLeaseActive: held, readyForWalk: true });
  const reply = () => ({ status: status(), leaseActive: held, principalVerified: held, ...(held ? { sequence } : {}) });
  const session = new BrainstemControlSession({
    open: async () => ({ ...reply(), sessionId: 'fixture', transport: 'grpc-mtls', mutualTlsVerified: true }),
    read: async () => reply(),
    acquire: async () => { calls.push('acquire'); held = true; sequence = 1; return reply(); },
    input: async () => { calls.push('input'); sequence++; return reply(); },
    interrupt: async () => { held = false; return reply(); }, close: async () => {}, action: async () => reply(),
  });
  const endpoint = { host: 'robot.example.test', port: 13145, clientIdentityAlias: 'chosen' };
  const core = () => ({ state: session.state, runtimeState: session.runtimeState,
    canBeginManualControl: session.canBeginManualControl, canAcquire: session.canAcquire,
    manualPrepared: session.state.manualPrepared, operationReadiness: session.operationReadiness,
    drive: value => session.drive(value), turn: value => session.turn(value), interrupt: () => session.interrupt() });
  const context = () => ({ controlTarget: 'direct', controlEndpoint: endpoint, brainstemControl: core(),
    directConnection: { snapshot: snapshot(), presentation: pure.exports.describeDirectRobotConnection(snapshot()) },
    connected: true, manualCommandAvailable: true });
  assert.equal(attribute('ControlScreen', 'productionInput', context()).ready, false);
  attribute('ControlScreen', 'productionInput', context()).onDrive({ x: 0, y: -1 });
  await Promise.resolve(); assert.deepEqual(calls, []);
  await session.connect(endpoint, 'doso-g20@robot');
  assert.equal(attribute('ControlScreen', 'connected', context()), true);
  assert.equal(attribute('ControlScreen', 'canUseManualControl', context()), false, 'mTLS status still has no touch intent or lease');
  assert.equal(session.prepareManualControl(), true);
  const input = attribute('ControlScreen', 'productionInput', context());
  assert.equal(input.ready, true); input.onDrive({ x: 0, y: -1 });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.deepEqual(calls, ['acquire'], 'first gesture only acquires and verifies zero ACK');
  input.onDrive({ x: 0, y: -1 }); for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.deepEqual(calls, ['acquire', 'input']);
  assert.equal(attribute('ControlScreen', 'runtimeState', context()).controlAuthority, 'held');
  await session.disconnect();
  assert.equal(attribute('ControlScreen', 'productionInput', context()).ready, false);
  assert.equal(attribute('ControlScreen', 'connected', context()), false);
});

test('control opening requires the prepared-account gate and abort prevents late navigation', async () => {
  assert.equal(attribute('RobotConnectionScreen', 'onOpenControl', { canSelectDirectTarget: false }), undefined);
  let resolve, opens = 0, closes = 0;
  const calls = [], signal = new AbortController();
  const open = attribute('RobotConnectionScreen', 'onOpenControl', { canSelectDirectTarget: true, stage: 'main',
    brainstemControl: { connect: () => { opens++; return new Promise(yes => { resolve = yes; }); }, disconnect: async () => { closes++; } },
    setControlEndpoint: value => calls.push(['endpoint', value]), setControlTarget: value => calls.push(['target', value]),
    setStage: value => calls.push(['stage', value]), setRobotConnectionVisible: value => calls.push(['visible', value]) });
  const result = open({ host: 'robot.example.test', port: 13145, clientIdentityAlias: 'chosen' }, 'doso-g20@robot', signal.signal);
  assert.equal(opens, 1); signal.abort(); resolve(true);
  assert.equal(await result, false); assert.equal(closes, 1); assert.deepEqual(calls, []);
  assert.equal(await open({}, '', signal.signal), false); assert.equal(opens, 1, 'pre-aborted request never opens');
});

test('successful live control opening navigates only after connect and bootstrap acceptance', async () => {
  for (const permitted of [false, true]) {
    const calls = [];
    const open = attribute('RobotConnectionScreen', 'onOpenControl', { canSelectDirectTarget: true, stage: 'models',
      deviceBootstrapIntent: { current: { enter: () => permitted } },
      brainstemControl: { connect: async () => true, disconnect: async () => calls.push('closed') },
      setControlEndpoint: () => calls.push('endpoint'), setControlTarget: () => calls.push('target'),
      setStage: value => calls.push(value), setRobotConnectionVisible: () => calls.push('visible') });
    assert.equal(await open({ host: 'robot.example.test', port: 13145 }, 'doso-g20@robot', new AbortController().signal), permitted);
    assert.equal(calls.includes('control'), permitted); assert.equal(calls.includes('closed'), !permitted);
  }
});

test('continuation is absent outside the account gate and commits only after owner validation', () => {
  assert.equal(attribute('RobotConnectionScreen', 'onUseConnection', { canSelectDirectTarget: false }), undefined);
  for (const accepted of [false, true]) {
    const calls = [];
    const next = attribute('RobotConnectionScreen', 'onUseConnection', { canSelectDirectTarget: true, stage: 'main',
      brainstemControl: { disconnect: async () => {} }, setControlEndpoint: () => {},
      directConnection: { select: () => accepted }, setControlTarget: v => calls.push(['target', v]),
      setActiveTab: v => calls.push(['tab', v]), setStage: v => calls.push(['stage', v]),
      setRobotConnectionVisible: v => calls.push(['visible', v]) });
    assert.equal(next(snapshot()), accepted);
    assert.equal(calls.length, accepted ? 4 : 0);
    if (accepted) assert.ok(calls.some(([key, v]) => key === 'stage' && v === 'main'));
  }
});

test('first-use IP continuation still requires the existing bootstrap enter gate', () => {
  for (const permitted of [false, true]) {
    const calls = [];
    const next = attribute('RobotConnectionScreen', 'onUseConnection', { canSelectDirectTarget: true, stage: 'models',
      brainstemControl: { disconnect: async () => {} }, setControlEndpoint: () => {},
      directConnection: { select: () => true, clear: () => calls.push('cleared') },
      deviceBootstrapIntent: { current: { enter: () => permitted } },
      setControlTarget: () => calls.push('target'), setActiveTab: () => calls.push('tab'),
      setStage: () => calls.push('stage'), setRobotConnectionVisible: () => calls.push('visible') });
    assert.equal(next(snapshot()), permitted);
    assert.equal(calls.includes('stage'), permitted);
    assert.equal(calls.includes('cleared'), !permitted);
  }
});

test('direct diagnostics keep the selected endpoint identity and use its fresh telemetry', () => {
  const ownJoints = [{ id: 'fr1', label: 'front right', source: 'device', positionDeg: 12 }];
  const foreignJoints = [{ id: 'rl1', label: 'account robot', source: 'device', positionDeg: 99 }];
  const context = {
    controlTarget: 'direct', deviceName: 'ACCOUNT ROBOT B', directEndpointLabel: 'robot-a.example.test:13145',
    controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
    directTelemetry: { presentation: { runtimeState: { joints: ownJoints } } },
    directConnection: { presentation: { runtimeState: { joints: foreignJoints } } },
  };
  assert.equal(attribute('JointStatusScreen', 'deviceName', context), 'robot-a.example.test:13145');
  assert.equal(attribute('JointStatusScreen', 'joints', context), ownJoints);
  context.directTelemetry.presentation = null;
  assert.equal(attribute('JointStatusScreen', 'joints', context), undefined, 'no fallback to a different or older snapshot');
  context.controlTarget = 'account';
  assert.equal(attribute('JointStatusScreen', 'deviceName', context), 'ACCOUNT ROBOT B');
  assert.equal(attribute('JointStatusScreen', 'joints', context), undefined);
});

test('opening diagnostics waits for stop confirmation before navigation and never reacquires', async () => {
  const calls = [];
  const open = attribute('ControlScreen', 'onOpenJointStatus', {
    brainstemControl: { disconnect: () => { calls.push('disconnect'); return Promise.resolve(); },
      operationCallbacks: { stop: async () => { calls.push('stop'); } },
      acquire: () => calls.push('acquire'), prepareManualControl: () => calls.push('prepare') },
    setStage: value => calls.push(value),
  });
  await open();
  assert.deepEqual(calls, ['stop', 'disconnect', 'joint-status']);
});

test('returning from direct diagnostics requests explicit reconnection, never automatic control', () => {
  const calls = [];
  const back = attribute('JointStatusScreen', 'onBack', {
    controlTarget: 'direct', controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
    setStage: value => calls.push(value), setRobotConnectionVisible: value => calls.push(['connection', value]),
  });
  back();
  assert.deepEqual(calls, ['control', ['connection', true]]);
  calls.length = 0;
  attribute('ControlScreen', 'onBack', {
    setControlTarget: value => calls.push(['target', value]), setStage: value => calls.push(value),
  })();
  assert.deepEqual(calls, ['main'], 'returning home preserves the selected direct target');
});

test('choosing a read-only target retires a previous live target before selecting the new route', () => {
  const calls = [];
  const use = attribute('RobotConnectionScreen', 'onUseConnection', {
    canSelectDirectTarget: true, stage: 'main', directConnection: { select: () => true },
    brainstemControl: { disconnect: () => { calls.push('disconnect'); return Promise.resolve(); } },
    setControlEndpoint: value => calls.push(['endpoint', value]), setControlTarget: value => calls.push(['target', value]),
    setActiveTab: value => calls.push(['tab', value]), setStage: value => calls.push(['stage', value]),
    setRobotConnectionVisible: value => calls.push(['visible', value]),
  });
  assert.equal(use(snapshot()), true);
  assert.deepEqual(calls.slice(0, 2), ['disconnect', ['endpoint', null]]);
});

test('live control retains its authority while showing only fresh telemetry from its own reader', () => {
  const ownBattery = { voltageV: 48.2, percent: null, source: 'device' };
  const ownJoints = [{ id: '1', source: 'device' }];
  const context = { controlTarget: 'direct', controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
    brainstemControl: { state: { connected: true }, runtimeState: { controlAuthority: 'held', motorState: 'enabled' } },
    directTelemetry: { presentation: { runtimeState: { battery: ownBattery, joints: ownJoints, controlAuthority: 'not-held' } } },
    directConnection: { presentation: { runtimeState: { battery: { voltageV: 99 }, joints: [{ id: 'foreign' }] } } },
  };
  const state = attribute('ControlScreen', 'runtimeState', context);
  assert.equal(state.battery, ownBattery); assert.equal(state.joints, ownJoints);
  assert.equal(state.controlAuthority, 'held'); assert.equal(state.motorState, 'enabled');
  context.directTelemetry.presentation = null;
  assert.equal(attribute('ControlScreen', 'runtimeState', context).battery, undefined);
  context.brainstemControl.state.connected = false;
  assert.equal(attribute('ControlScreen', 'runtimeState', context).motorState, 'unknown');
  assert.equal(attribute('ControlScreen', 'runtimeState', context).battery, undefined);
});

test('a retained joystick callback cannot send after diagnostics retires a real control session', async () => {
  const calls = []; let held = false, sequence = 0;
  const reply = () => ({ status: { fsmKind: 'standing', transition: 'none', owner: held ? 'grpc' : 'none',
    motorOutputEnabled: true, criticalMotorFault: false, grpcLeaseActive: held, readyForWalk: true },
    leaseActive: held, principalVerified: held, ...(held ? { sequence } : {}) });
  const session = new BrainstemControlSession({
    open: async () => ({ ...reply(), sessionId: 'diagnostics-fixture', transport: 'grpc-mtls', mutualTlsVerified: true }),
    read: async () => reply(), acquire: async () => { calls.push('acquire'); held = true; sequence = 1; return reply(); },
    input: async () => { calls.push('input'); sequence++; return reply(); },
    interrupt: async () => { calls.push('interrupt'); held = false; return reply(); }, close: async () => { calls.push('close'); },
    action: async () => { calls.push('action'); return reply(); },
  });
  const endpoint = { host: 'robot-a.example.test', port: 13145, clientIdentityAlias: 'chosen' };
  await session.connect(endpoint, 'doso-g20@robot');
  session.prepareManualControl();
  await session.drive({ x: 0, y: 0 });
  assert.equal(session.state.leaseActive, true);
  const staleDrive = vector => session.drive(vector);
  await attribute('ControlScreen', 'onOpenJointStatus', { brainstemControl: {
    operationCallbacks: { stop: () => session.interrupt() }, disconnect: () => session.disconnect() }, setStage() {} })();
  assert.equal(session.state.connected, false); assert.equal(session.state.leaseActive, false);
  await staleDrive({ x: 0, y: -1 });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(calls.filter(value => value === 'acquire').length, 1);
  assert.equal(calls.includes('input'), false); assert.equal(calls.includes('action'), false);
  assert.ok(calls.includes('close'));
});

test('stop failure, background or a retired diagnostic request cannot navigate or clear its error', async () => {
  const calls = [];
  const base = { brainstemControl: { operationCallbacks: { stop: async () => { throw Error('stop_unconfirmed'); } },
    disconnect: () => calls.push('disconnect') }, setStage: value => calls.push(value) };
  await attribute('ControlScreen', 'onOpenJointStatus', base)();
  assert.deepEqual(calls, []);
  let resolveStop;
  const owner = {}, navigation = { current: owner }, appState = { currentState: 'active' };
  const open = attribute('ControlScreen', 'onOpenJointStatus', { ...base,
    diagnosticNavigationOwner: owner, diagnosticNavigation: navigation, AppState: appState,
    brainstemControl: { operationCallbacks: { stop: () => new Promise(resolve => { resolveStop = resolve; }) },
      disconnect: () => calls.push('disconnect') },
  });
  const pending = open();
  navigation.current = {}; resolveStop(); await pending;
  assert.deepEqual(calls, [], 'a different owner/endpoint/route retires the old continuation');
  navigation.current = owner;
  const backgrounded = open(); appState.currentState = 'background'; resolveStop(); await backgrounded;
  assert.deepEqual(calls, []);
});

test('opening a connection overlay retires an awaiting diagnostics continuation', () => {
  let rotation;
  function find(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast).startsWith('diagnosticNavigation.current.ownerKey')) rotation = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(rotation, 'diagnostic navigation has an ownership guard');
  const endpoint = {}, callbacks = {};
  const owner = { ownerKey: 'account-a', endpoint, target: 'direct', stage: 'control',
    robotConnectionVisible: false, connectionDiagnosticsOpen: false, callbacks };
  const navigation = { current: owner };
  vm.runInNewContext(ts.transpileModule(rotation.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { diagnosticNavigation: navigation, deviceSettingsIdentity: 'account-a', directEndpoint: endpoint,
    controlTarget: 'direct', stage: 'control', robotConnectionVisible: true, connectionDiagnosticsOpen: false,
    brainstemControl: { operationCallbacks: callbacks } });
  assert.notEqual(navigation.current, owner);
});

test('a background then foreground cycle retires a delayed diagnostics continuation', async () => {
  let lifecycleEffect;
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes("if (state !== 'active') diagnosticNavigation.current")) lifecycleEffect = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(lifecycleEffect);
  const owner = {}, navigation = { current: owner }, appState = { currentState: 'active' };
  let onState, resolveStop;
  vm.runInNewContext(ts.transpileModule(lifecycleEffect.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { diagnosticNavigation: navigation, useEffect: effect => effect(),
    AppState: { addEventListener: (_event, callback) => { onState = callback; return { remove() {} }; } } });
  const calls = [];
  const pending = attribute('ControlScreen', 'onOpenJointStatus', {
    diagnosticNavigationOwner: owner, diagnosticNavigation: navigation, AppState: appState,
    brainstemControl: { operationCallbacks: { stop: () => new Promise(resolve => { resolveStop = resolve; }) }, disconnect: () => calls.push('disconnect') },
    setStage: value => calls.push(value),
  })();
  appState.currentState = 'background'; onState('background');
  appState.currentState = 'active'; onState('active'); resolveStop(); await pending;
  assert.deepEqual(calls, []);
});
