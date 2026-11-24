import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as modes from '../src/features/control/robotModeCapabilities.ts';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = new Map();
const initializers = new Map();
function visit(node) {
  if (ts.isJsxSelfClosingElement(node)) elements.set(node.tagName.getText(ast), node);
  if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const pure = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/directRobotConnection.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: pure, exports: pure.exports, Date, URL, require: name => { assert.equal(name, '../features/control/robotModeCapabilities.ts'); return modes; } });

function attribute(screen, name, context = {}) {
  const attr = elements.get(screen)?.attributes.properties.find(item => item.name?.getText(ast) === name);
  assert.ok(attr?.initializer && ts.isJsxExpression(attr.initializer), screen + ' explicit ' + name);
  const expression = attr.initializer.expression.getText(ast);
  const diagnosticNavigationOwner = {};
  return vm.runInNewContext(ts.transpileModule('(' + expression + ')', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    describeDirectRobotConnection: pure.exports.describeDirectRobotConnection,
    diagnosticNavigationOwner,
    diagnosticNavigation: { current: diagnosticNavigationOwner },
    AppState: { currentState: 'active' },
    WORKSPACE_OWNER_KEY: 'local-workspace',
    directTelemetry: { presentation: null },
    controlEndpoint: null,
    directEndpoint: null,
    directEndpointLabel: '机器狗 Wi-Fi',
    workspaceDeviceName: '机器狗 Wi-Fi',
    rememberedControl: { remember() {}, forget() {} },
    ...context,
  });
}

function initializer(name, context = {}) {
  assert.ok(initializers.has(name), name);
  return vm.runInNewContext(ts.transpileModule('(' + initializers.get(name) + ')', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}

function openWorkspace(context = {}) {
  const owner = {};
  return initializer('openRobotPage', {
    useCallback: fn => fn,
    stage: 'control',
    workspaceTab: 'control',
    brainstemControl: { state: { connected: false }, operationCallbacks: { stop: () => assert.fail('offline navigation sent STOP') } },
    diagnosticNavigationOwner: owner,
    diagnosticNavigation: { current: owner },
    controlExitPending: { current: false },
    controlExitRevision: { current: 0 },
    prepareControlExit: { current: null },
    BackHandler: { exitApp: () => assert.fail('navigation requested an unexpected exit') },
    AppState: { currentState: 'active' },
    setProfileDeviceOpen() {},
    setOpenSettingsSignal() {},
    ...context,
  });
}

const snapshot = () => pure.exports.createDirectRobotConnectionSnapshot({ host: 'robot.example.test', port: 13145 }, {
  source: 'brainstem.grpc.direct', transport: 'grpc-tls', observedAt: new Date().toISOString(),
  motionAuthorized: false, cloudBindingVerified: false,
  status: { fsmKind: 'standing', transition: 'none', owner: 'grpc', motorOutputEnabled: true,
    criticalMotorFault: false, grpcLeaseActive: true, readyForWalk: true },
});

const dormantControl = () => ({
  state: { connected: false, leaseActive: false, status: null, error: null },
  canBeginManualControl: false,
  canAcquire: false,
  manualPrepared: false,
  operationReadiness: Object.fromEntries(['stop', 'stand', 'sit', 'enableMotor', 'disableMotor', 'switchPolicy'].map(key => [key, { ready: false }])),
  operationCallbacks: {},
  runtimeState: {},
});

test('video binding is retired synchronously on a target change, including A to B to A', () => {
  let rotation, config;
  function find(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'videoTargetGeneration.current.target !== currentVideoTarget') rotation = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'videoConfig') config = node.initializer;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(rotation); assert.ok(config);
  const run = (code, context) => vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const ref = { current: { target: 'A', generation: 0 } };
  const selection = { videoTarget: 'A', videoGeneration: 0 };
  const getConfig = target => run(`(${config.getText(ast)})`, {
    navigationEndpoint: 'https://robot.example', currentVideoTarget: target,
    navigationBinding: selection, videoTargetGeneration: ref, isBrainstemLanAvailable: () => false,
    lanVideoOrigin: null, directEndpoint: null, controlEndpoint: { transport: 'tls' },
  });
  assert.equal(getConfig('A').deviceId, 'A');
  run(rotation.getText(ast), { videoTargetGeneration: ref, currentVideoTarget: 'B' });
  assert.equal(getConfig('B'), null);
  run(rotation.getText(ast), { videoTargetGeneration: ref, currentVideoTarget: 'A' });
  assert.equal(getConfig('A'), null, 'returning to A cannot resurrect an earlier selection');
  assert.equal(attribute('ControlScreen', 'videoSurface', { videoConfig: null, controlVideo: { surface: 'old-frame' } }), undefined);
});

test('an explicitly selected IP target projects its own observed state without granting control', () => {
  const observed = snapshot();
  const context = {
    directConnection: { snapshot: observed, presentation: pure.exports.describeDirectRobotConnection(observed) },
    brainstemControl: dormantControl(),
    workspaceDeviceName: 'robot.example.test:13145',
  };
  const state = attribute('ControlScreen', 'runtimeState', context);
  assert.equal(state.motorState, 'enabled');
  assert.equal(state.posture, 'standing');
  assert.equal(state.controlAuthority, 'not-held');
  assert.notEqual(state.controlLink, 'connected');
  assert.equal(attribute('ControlScreen', 'robotName', context), 'robot.example.test:13145');
  assert.equal(attribute('ControlScreen', 'connected', context), false);
  assert.equal(attribute('ControlScreen', 'batteryPercent', context), null);
});

test('read-only direct target has no movement grant, recall, map or task callbacks and no preview input', () => {
  const context = {
    brainstemControl: dormantControl(),
    controlEndpoint: null,
    directConnection: { snapshot: null, presentation: null },
  };
  for (const prop of ['allowInteractionPreview', 'canUseManualControl', 'canUseRouteMode', 'canUseTaskMode', 'canRecall']) {
    assert.equal(attribute('ControlScreen', prop, context), false, prop);
  }
  for (const prop of ['onRecall', 'onOpenMap', 'onOpenRoutes', 'onOpenTasks']) {
    assert.ok(!elements.get('ControlScreen').attributes.properties.some(item => item.name?.getText(ast) === prop), prop);
  }
  assert.equal(attribute('ControlScreen', 'showPlanning', context), false);
  const readiness = attribute('ControlScreen', 'operationReadiness', context);
  for (const operation of Object.values(readiness)) assert.equal(operation.ready, false);
  assert.equal(attribute('ControlScreen', 'productionInput', context), undefined);
});

test('expired direct status remains disconnected and unknown without synthetic telemetry', () => {
  const context = {
    directConnection: { snapshot: null, presentation: null },
    brainstemControl: dormantControl(),
    workspaceDeviceName: '机器狗 Wi-Fi',
  };
  const state = attribute('ControlScreen', 'runtimeState', context);
  assert.equal(state.motorState, 'unknown');
  assert.equal(state.posture, 'unknown');
  assert.equal(state.controlAuthority, 'not-held');
  assert.equal(attribute('ControlScreen', 'robotName', context), '机器狗 Wi-Fi');
  assert.equal(attribute('ControlScreen', 'connected', context), false);
});

test('production props use only the explicit live core, never the read-only snapshot', async () => {
  const calls = [];
  let held = false, sequence = 0;
  const status = () => ({ fsmKind: 'standing', transition: 'none', owner: held ? 'grpc' : 'none',
    motorOutputEnabled: true, criticalMotorFault: false, grpcLeaseActive: held, readyForWalk: true });
  const reply = () => ({ status: status(), leaseActive: held, principalVerified: held, ...(held ? { sequence } : {}) });
  const session = new BrainstemControlSession({
    open: async () => ({ ...reply(), sessionId: 'fixture', transport: 'grpc-mtls', mutualTlsVerified: true,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }),
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
  const context = () => ({ controlEndpoint: endpoint, brainstemControl: core(),
    directConnection: { snapshot: snapshot(), presentation: pure.exports.describeDirectRobotConnection(snapshot()) } });
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

test('control opening aborts cleanly without persisting or navigating', async () => {
  let resolve, opens = 0, closes = 0;
  const calls = [], signal = new AbortController();
  const open = attribute('RobotConnectionScreen', 'onOpenControl', {
    rememberedControl: { remember: () => calls.push('remember') },
    brainstemControl: { connect: () => { opens++; return new Promise(yes => { resolve = yes; }); }, disconnect: async () => { closes++; } },
    setControlEndpoint: value => calls.push(['endpoint', value]),
    setStage: value => calls.push(['stage', value]),
    setRobotConnectionVisible: value => calls.push(['visible', value]),
  });
  const result = open({ host: 'robot.example.test', port: 13145, clientIdentityAlias: 'chosen' }, 'doso-g20@robot', signal.signal);
  assert.equal(opens, 1); signal.abort(); resolve(true);
  assert.equal(await result, false); assert.equal(closes, 1); assert.deepEqual(calls, []);
  assert.equal(await open({}, '', signal.signal), false); assert.equal(opens, 1, 'pre-aborted request never opens');
});

test('successful live control opening remembers target and returns to control', async () => {
  const calls = [];
  const open = attribute('RobotConnectionScreen', 'onOpenControl', {
    rememberedControl: { remember: (endpoint, principal) => calls.push(['remember', endpoint, principal]) },
    brainstemControl: { connect: async () => true, disconnect: async () => calls.push('closed') },
    setControlEndpoint: value => calls.push(['endpoint', value]),
    setStage: value => calls.push(['stage', value]),
    setRobotConnectionVisible: value => calls.push(['visible', value]),
  });
  assert.equal(await open({ host: 'robot.example.test', port: 13145 }, 'doso-g20@robot', new AbortController().signal), true);
  assert.ok(calls.some(([k, v]) => k === 'stage' && v === 'control'));
  assert.ok(calls.some(([k, v]) => k === 'visible' && v === false));
  const saved = calls.find(([k]) => k === 'remember');
  assert.ok(saved);
  assert.equal(saved[1].host, 'robot.example.test');
  assert.equal(saved[2], 'doso-g20@robot');
});

test('failed or rejected live opens never persist or change the current route', async () => {
  for (const outcome of ['false', 'throw']) {
    const calls = [];
    const open = attribute('RobotConnectionScreen', 'onOpenControl', {
      rememberedControl: { remember: () => calls.push('remember') },
      brainstemControl: { connect: async () => { if (outcome === 'throw') throw Error('unavailable'); return false; } },
      setControlEndpoint: () => calls.push('endpoint'),
      setStage: () => calls.push('stage'),
      setRobotConnectionVisible: () => calls.push('visible'),
    });
    const pending = open({ host: 'robot.example.test', port: 13145 }, 'doso-g20@robot', new AbortController().signal);
    if (outcome === 'throw') await assert.rejects(pending); else assert.equal(await pending, false);
    assert.deepEqual(calls, []);
  }
});

test('auto-connect options carry remembered target and pause while editing connection', () => {
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'brainstemControl') declaration = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(declaration);
  const endpoint = { host: 'robot.example.test', port: 13145, transport: 'tls', clientIdentityAlias: 'chosen' };
  const evaluate = patch => vm.runInNewContext(ts.transpileModule('(' + declaration.initializer.arguments[0].getText(ast) + ')', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    WORKSPACE_OWNER_KEY: 'local-workspace',
    isRobotWorkspace: true,
    robotConnectionVisible: false,
    rememberedControl: { connection: { endpoint, principal: 'doso-g20@robot' } },
    ...patch,
  });
  const options = evaluate();
  assert.equal(options.autoConnectEndpoint, endpoint);
  assert.equal(options.autoConnectPrincipal, 'doso-g20@robot');
  assert.equal(options.ready, true);
  assert.equal(options.ownerKey, 'local-workspace');
  assert.equal(options.autoReconnectEnabled, true);
  assert.deepEqual(Object.keys(options).sort(), ['autoConnectEndpoint', 'autoConnectPrincipal', 'autoReconnectEnabled', 'ownerKey', 'ready']);
  assert.equal(evaluate({ isRobotWorkspace: false }).ready, false);
  assert.equal(evaluate({ robotConnectionVisible: true }).autoConnectEndpoint, null);
  assert.equal(evaluate({ robotConnectionVisible: true }).autoReconnectEnabled, false, 'editing IP cannot revive the old desired target');
  assert.equal(evaluate({ rememberedControl: { connection: null } }).autoConnectEndpoint, undefined);
});

test('mismatched owner key hides any previous owned control endpoint', () => {
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'controlEndpoint') declaration = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(declaration);
  const expression = ts.transpileModule('(' + declaration.initializer.getText(ast) + ')', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const endpoint = { host: 'robot-a.example.test', port: 13145 };
  const selection = { ownerKey: 'local-workspace', endpoint };
  assert.equal(vm.runInNewContext(expression, { controlSelection: selection, WORKSPACE_OWNER_KEY: 'local-workspace' }), endpoint);
  assert.equal(vm.runInNewContext(expression, { controlSelection: selection, WORKSPACE_OWNER_KEY: 'other-owner' }), null);
});

test('onUseConnection commits only after snapshot validation', () => {
  for (const accepted of [false, true]) {
    const calls = [];
    const next = attribute('RobotConnectionScreen', 'onUseConnection', {
      directConnection: { select: () => accepted },
      setControlEndpoint: value => calls.push(['endpoint', value]),
      setStage: value => calls.push(['stage', value]),
      setRobotConnectionVisible: value => calls.push(['visible', value]),
    });
    assert.equal(next(snapshot()), accepted);
    assert.equal(calls.length, accepted ? 3 : 0);
    if (accepted) assert.ok(calls.some(([key, v]) => key === 'stage' && v === 'control'));
  }
});

test('robot status keeps the selected endpoint identity and uses only its fresh telemetry', () => {
  const ownJoints = [{ id: 'fr1', label: 'front right', source: 'device', positionDeg: 12 }];
  const foreignJoints = [{ id: 'rl1', label: 'other snapshot', source: 'device', positionDeg: 99 }];
  const context = {
    directEndpoint: { host: 'robot-a.example.test', port: 13145 },
    directEndpointLabel: 'robot-a.example.test:13145',
    workspaceDeviceName: 'robot-a.example.test:13145',
    controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
    directTelemetry: { presentation: { fresh: true, runtimeState: { joints: ownJoints } }, snapshot: { observation: {} } },
    directConnection: { presentation: { fresh: true, runtimeState: { joints: foreignJoints } }, snapshot: { observation: {} } },
  };
  const joints = () => {
    context.statusPresentation = initializer('statusPresentation', context);
    context.statusObservation = initializer('statusObservation', context);
    context.statusRuntime = initializer('statusRuntime', context);
    return attribute('JointStatusScreen', 'joints', context);
  };
  assert.equal(attribute('JointStatusScreen', 'deviceName', context), 'robot-a.example.test:13145');
  assert.equal(joints(), ownJoints);
  context.directTelemetry.presentation.fresh = false;
  assert.equal(joints(), undefined, 'no fallback to a different or older snapshot');
});

test('the Thunder model diagram is wired to JointStatusScreen', () => {
  const diagram = { uri: 'fixture://thunder-v4-top-line' };
  const context = { images: { thunderJointDiagram: diagram } };
  assert.equal(attribute('JointStatusScreen', 'robotDiagram', context), diagram);
});

test('the control status shortcut retires input, then waits for stop and keeps the connection', async () => {
  const calls = [];
  const open = attribute('ControlScreen', 'onOpenJointStatus', {
    openRobotPage: openWorkspace({
      brainstemControl: { state: { connected: true }, operationCallbacks: { stop: async () => { calls.push('stop'); } } },
      prepareControlExit: { current: () => { calls.push('retire input'); } },
      setStage: value => calls.push(value),
    }),
  });
  await open();
  assert.deepEqual(calls, ['retire input', 'stop', 'joint-status']);
});

test('returning from direct diagnostics returns to control without reopening the connection form', () => {
  const calls = [];
  const back = attribute('JointStatusScreen', 'onBack', {
    controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
    setStage: value => calls.push(value),
  });
  back();
  assert.deepEqual(calls, ['control']);
  calls.length = 0;
  attribute('ControlScreen', 'onBack', { openRobotPage: tab => calls.push(tab) })();
  assert.deepEqual(calls, ['status']);
});

test('live control retains its authority while showing only fresh telemetry from its own reader', () => {
  const ownBattery = { voltageV: 48.2, percent: null, source: 'device' };
  const ownJoints = [{ id: '1', source: 'device' }];
  const context = {
    controlEndpoint: { host: 'robot-a.example.test', port: 13145 },
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
    open: async () => ({ ...reply(), sessionId: 'diagnostics-fixture', transport: 'grpc-mtls', mutualTlsVerified: true,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }),
    read: async () => reply(), acquire: async () => { calls.push('acquire'); held = true; sequence = 1; return reply(); },
    input: async () => { calls.push('input'); sequence++; return reply(); },
    interrupt: async () => { calls.push('interrupt'); held = false; return reply(); }, close: async () => { calls.push('close'); },
    action: async () => { calls.push('action'); return reply(); },
  });
  const endpoint = { host: 'robot-a.example.test', port: 13145, clientIdentityAlias: 'chosen' };
  await session.connect(endpoint, 'doso-g20@robot');
  session.prepareManualControl();
  await session.drive({ x: 0, y: -0.5 });
  assert.equal(session.state.leaseActive, true);
  const staleDrive = vector => session.drive(vector);
  await openWorkspace({ brainstemControl: {
    state: session.state, operationCallbacks: { stop: () => session.interrupt() } }, setStage() {} })('status');
  assert.equal(session.state.connected, true); assert.equal(session.state.leaseActive, false);
  await staleDrive({ x: 0, y: -1 });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(calls.filter(value => value === 'acquire').length, 1);
  assert.equal(calls.includes('input'), false); assert.equal(calls.includes('action'), false);
  assert.ok(!calls.includes('close'));
  await session.disconnect();
});

test('stop failure, background or a retired diagnostic request cannot navigate or clear its error', async () => {
  const calls = [];
  const base = { brainstemControl: { state: { connected: true }, operationCallbacks: { stop: async () => { throw Error('stop_unconfirmed'); } } },
    setStage: value => calls.push(value) };
  await openWorkspace(base)('status');
  base.brainstemControl.state = { connected: false, failureCode: 'stop_unconfirmed' };
  await openWorkspace(base)('settings');
  assert.deepEqual(calls, []);
  let resolveStop;
  const owner = {}, navigation = { current: owner }, appState = { currentState: 'active' };
  const open = openWorkspace({ ...base,
    diagnosticNavigationOwner: owner, diagnosticNavigation: navigation, AppState: appState,
    brainstemControl: { state: { connected: true }, operationCallbacks: { stop: () => new Promise(resolve => { resolveStop = resolve; }) } },
  });
  const pending = open('status');
  navigation.current = {}; resolveStop(); await pending;
  assert.deepEqual(calls, [], 'a different owner/endpoint/route retires the old continuation');
  navigation.current = owner;
  const backgrounded = open('settings'); appState.currentState = 'background'; resolveStop(); await backgrounded;
  assert.deepEqual(calls, []);
});

test('the status page is available before a device connects, and only one destination is accepted while waiting for STOP', async () => {
  const calls = [];
  await openWorkspace({ setStage: value => calls.push(value) })('status');
  assert.deepEqual(calls, ['joint-status']);
  calls.length = 0;
  let confirmStop;
  let settingsSignals = 0;
  let resumed = 0;
  const open = openWorkspace({
    brainstemControl: { state: { connected: true }, operationCallbacks: { stop: () => new Promise(resolve => { confirmStop = resolve; }) } },
    prepareControlExit: { current: () => () => { resumed++; } },
    setStage: value => calls.push(value),
    setOpenSettingsSignal: update => { settingsSignals = typeof update === 'function' ? update(settingsSignals) : update; },
  });
  const fromNav = attribute('RobotMainNav', 'onChange', { openRobotPage: open });
  const waiting = fromNav('settings');
  await fromNav('status');
  assert.deepEqual(calls, []);
  assert.equal(settingsSignals, 0);
  confirmStop(); await waiting;
  assert.deepEqual(calls, ['control']);
  assert.equal(settingsSignals, 1);
  assert.equal(resumed, 1, 'opening unified settings in place on control resumes control after STOP confirms');
});

test('leaving the control workspace on Android waits for STOP before the native exit', async () => {
  const calls = [];
  const openOffline = openWorkspace({
    BackHandler: { exitApp: () => calls.push('exit') },
    setStage: () => assert.fail('Android exit changed the workspace page'),
  });
  await openOffline(null);
  assert.deepEqual(calls, ['exit']);
  calls.length = 0;
  let confirmStop;
  const open = openWorkspace({
    BackHandler: { exitApp: () => calls.push('exit') },
    brainstemControl: { state: { connected: true }, operationCallbacks: { stop: () => {
      calls.push('stop');
      return new Promise(resolve => { confirmStop = resolve; });
    } } },
    prepareControlExit: { current: () => { calls.push('retire'); return () => calls.push('resume'); } },
    setStage: () => assert.fail('Android exit changed the workspace page'),
  });
  const leaving = open(null);
  await open(null);
  await open('status');
  assert.deepEqual(calls, ['retire', 'stop']);
  confirmStop();
  await leaving;
  assert.deepEqual(calls, ['retire', 'stop', 'exit', 'resume']);
});

test('an unconfirmed STOP leaves Android in the control workspace', async () => {
  const calls = [];
  await openWorkspace({
    brainstemControl: { state: { connected: false, failureCode: 'stop_unconfirmed' }, operationCallbacks: { stop: async () => {
      calls.push('stop');
      throw Error('stop_unconfirmed');
    } } },
    prepareControlExit: { current: () => () => calls.push('resume') },
    setStage: () => assert.fail('Android exit changed the workspace page'),
  })(null);
  assert.deepEqual(calls, ['stop', 'resume']);
});

test('opening a connection overlay retires an awaiting diagnostics continuation', () => {
  let rotation;
  function find(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast).includes('diagnosticNavigation.current.ownerKey !== WORKSPACE_OWNER_KEY')) rotation = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(rotation, 'diagnostic navigation has an ownership guard');
  const endpoint = {}, callbacks = {};
  const owner = {
    ownerKey: 'local-workspace', endpoint, stage: 'control',
    robotConnectionVisible: false, callbacks,
  };
  const navigation = { current: owner };
  vm.runInNewContext(ts.transpileModule(rotation.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    diagnosticNavigation: navigation,
    WORKSPACE_OWNER_KEY: 'local-workspace',
    directEndpoint: endpoint,
    stage: 'control',
    robotConnectionVisible: true,
    brainstemControl: { operationCallbacks: callbacks },
  });
  assert.notEqual(navigation.current, owner);
});

test('a background then foreground cycle retires a delayed diagnostics continuation', async () => {
  let lifecycleEffect;
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes("if (state !== 'active') controlExitRevision.current")) lifecycleEffect = node;
    ts.forEachChild(node, find);
  }
  find(ast); assert.ok(lifecycleEffect);
  const owner = {}, navigation = { current: owner }, appState = { currentState: 'active' }, revision = { current: 0 };
  let onState, resolveStop;
  vm.runInNewContext(ts.transpileModule(lifecycleEffect.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { controlExitRevision: revision, useEffect: effect => effect(),
    AppState: { addEventListener: (_event, callback) => { onState = callback; return { remove() {} }; } } });
  const calls = [];
  let settingsSignals = 0;
  const open = openWorkspace({
    diagnosticNavigationOwner: owner, diagnosticNavigation: navigation, AppState: appState, controlExitRevision: revision,
    brainstemControl: { state: { connected: true }, operationCallbacks: { stop: () => new Promise(resolve => { resolveStop = resolve; }) } },
    setStage: value => calls.push(value),
    setOpenSettingsSignal: update => { settingsSignals = typeof update === 'function' ? update(settingsSignals) : update; },
  });
  const pending = open('status');
  appState.currentState = 'background'; onState('background');
  appState.currentState = 'active'; onState('active'); resolveStop(); await pending;
  assert.deepEqual(calls, []);
  assert.equal(settingsSignals, 0);
  const subsequent = open('settings');
  resolveStop(); await subsequent;
  assert.deepEqual(calls, ['control'], 'a fresh request works after the app returns to the foreground');
  assert.equal(settingsSignals, 1);
});
