import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const screenCode = compile('../src/screens/DeviceTestScreen.tsx');
const grpcModule = { exports: {} };
vm.runInNewContext(compile('../src/services/brainstemGrpc.ts'), { module: grpcModule, exports: grpcModule.exports,
  URL, require: name => {
    if (name === 'expo') return { requireOptionalNativeModule: () => null };
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: 'active' } };
    assert.fail(`Unexpected grpc dependency ${name}`);
  } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function mount({ available = true } = {}) {
  let cursor = 0, node, dirty = false, unmounted = false, lateUpdates = 0;
  const slots = [], effects = [], pending = [], listeners = new Set(), backListeners = new Set();
  const calls = [], options = [], appState = { currentState: 'active', addEventListener: (_name, listener) => {
    listeners.add(listener); return { remove: () => listeners.delete(listener) };
  } };
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { if (unmounted) lateUpdates++; else { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; } }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useMemo(create, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: create(), deps }; return slots[i].value; },
    useEffect(create, deps) { const i = cursor++; if (!effects[i] || changed(effects[i].deps, deps)) pending.push({ i, create, deps }); },
  };
  const ControlScreen = () => null, RobotConnectionScreen = () => null, JointStatusScreen = () => null;
  const control = {
    state: { phase: 'disconnected', connected: false, sequence: 0, clientIdentitySelected: false, mutualTlsVerified: false,
      principalVerified: false, leaseActive: false, transport: null, error: null },
    runtimeState: { controlLink: 'connected', speed: { linearMps: null, source: 'unknown' } },
    operationReadiness: { stand: { ready: false }, enableMotor: { ready: false } },
    canAcquire: false, canBeginManualControl: false, manualPrepared: false,
    connect: async (endpoint, principal) => { calls.push(['connect', endpoint, principal]); return true; },
    disconnect: async () => { calls.push(['disconnect']); },
    drive: () => calls.push(['drive']), turn: () => calls.push(['turn']), sticks: () => calls.push(['sticks']),
    interrupt: async () => { calls.push(['interrupt']); }, prepareManualControl: () => calls.push(['acquire']),
    operationCallbacks: { stop: async () => { calls.push(['stop']); }, stand: () => calls.push(['stand']), enableMotor: () => calls.push(['enable']) },
  };
  const telemetry = { snapshot: null, presentation: null, refreshing: false, error: null, refresh: async () => calls.push(['refresh']) };
  const input = { start: () => calls.push(['input-start']) };
  const unknown = { controlLink: 'disconnected', speed: { linearMps: null, source: 'unknown' } };
  const imports = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: appState, Pressable: 'Pressable', View: 'View', BackHandler: {
      addEventListener: (_name, listener) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; },
    } },
    '../assets': { images: { thunderHero: 1 } }, '../components/AppText': { Text: 'Text' },
    '../features/control/useBrainstemControl': { useBrainstemControl: value => { options.push(['control', value]); return control; } },
    '../features/control/useBrainstemTelemetry': { useBrainstemTelemetry: value => { options.push(['telemetry', value]); return telemetry; } },
    '../features/control/useG20Input': { useG20Input: value => { options.push(['input', value]); return input; } },
    '../features/robot-lifecycle/robotDiagnosticsGateway': { createRobotDiagnosticsGateway: () => ({}) },
    '../services/brainstemControl': { isBrainstemControlAvailable: () => true },
    '../services/brainstemGrpc': { isBrainstemLanAvailable: () => available, validateBrainstemEndpoint: grpcModule.exports.validateBrainstemEndpoint },
    '../services/brainstemIntegrationReadiness': { getBrainstemIntegrationReadiness: value => value },
    '../services/directRobotConnection': { describeDirectRobotConnection: () => ({ runtimeState: unknown, fresh: false }) },
    './ControlScreen': { ControlScreen }, './RobotConnectionScreen': { RobotConnectionScreen }, './JointStatusScreen': { JointStatusScreen },
  };
  const module = { exports: {} };
  vm.runInNewContext(screenCode, { module, exports: module.exports, JSON,
    require: name => { assert.ok(name in imports, `Test route must not import accounts, storage or cloud: ${name}`); return imports[name]; } });
  const render = () => {
    do {
      dirty = false; cursor = 0; node = module.exports.DeviceTestScreen({ onExit: () => calls.push(['exit']) });
      for (const effect of pending.splice(0)) { effects[effect.i]?.cleanup?.(); effects[effect.i] = { deps: effect.deps, cleanup: effect.create() }; }
    } while (dirty);
  };
  render();
  return {
    render, calls, options, control, telemetry, input,
    get props() { return node.props; },
    get page() { return node.type === ControlScreen ? 'control' : node.type === RobotConnectionScreen ? 'connection' : node.type === JointStatusScreen ? 'joints' : 'unavailable'; },
    get lateUpdates() { return lateUpdates; },
    background() { appState.currentState = 'background'; [...listeners].forEach(listener => listener('background')); },
    foreground() { appState.currentState = 'active'; [...listeners].forEach(listener => listener('active')); },
    back() { [...backListeners].at(-1)?.(); render(); },
    unmount() { unmounted = true; effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test('QA gate fails closed and initial local control never starts input, a connection or an action', () => {
  const blocked = mount({ available: false });
  assert.equal(blocked.page, 'unavailable'); assert.equal(blocked.calls.length, 0);
  assert.ok(blocked.options.every(([kind, value]) => kind === 'control' ? value.ready === false : kind === 'input' ? value === false : value.active === false));
  const app = mount();
  assert.equal(app.page, 'control'); assert.equal(app.calls.length, 0);
  assert.equal(app.props.g20Controller, app.input);
  for (const prop of ['canUseManualControl', 'canUseRouteMode', 'canUseTaskMode', 'canRecall']) assert.equal(app.props[prop], false);
  assert.equal(app.props.batteryPercent, null); assert.equal(app.props.productionInput, undefined);
  assert.equal(app.props.runtimeState.controlLink, 'disconnected');
  assert.equal(app.props.operationReadiness, app.control.operationReadiness);
  assert.equal(app.props.operationCallbacks, app.control.operationCallbacks);
  assert.equal(app.props.onOpenMap, undefined); assert.equal(app.props.onRecall, undefined);
});

test('explicit connection rejects TLS, certificates and public endpoints before reaching transport', async () => {
  const app = mount(); app.props.onOpenConnection(); app.render();
  assert.equal(app.page, 'connection');
  for (const endpoint of [
    { host: '192.168.42.64', port: 13145, transport: 'tls' },
    { host: '8.8.8.8', port: 13145, transport: 'lan-dev' },
    { host: 'robot.example.com', port: 13145, transport: 'lan-dev' },
    { host: '192.168.42.64', port: 13145, transport: 'lan-dev', clientIdentityAlias: 'identity' },
  ]) assert.equal(await app.props.onOpenControl(endpoint, 'ignored', new AbortController().signal), false);
  assert.equal(app.calls.some(([name]) => name === 'connect'), false);
});

test('successful explicit private LAN connection carries real gates into control without acquiring', async () => {
  const app = mount(); app.props.onOpenConnection(); app.render();
  const result = await app.props.onOpenControl({ host: ' 192.168.42.64 ', port: 13145, transport: 'lan-dev' }, 'not-a-cloud-user', new AbortController().signal);
  assert.equal(result, true); app.render(); assert.equal(app.page, 'control');
  const call = app.calls.find(([name]) => name === 'connect');
  assert.equal(call[1].host, '192.168.42.64'); assert.equal(call[1].transport, 'lan-dev'); assert.equal(call[2], '');
  assert.equal(app.props.productionInput.ready, false); assert.equal(app.props.controlSession.canAcquire, false);
  assert.equal(app.props.brainstemIntegration.deviceIdentity, 'unbound');
  assert.equal(app.calls.some(([name]) => ['acquire', 'enable', 'stand', 'drive', 'sticks', 'input-start'].includes(name)), false);
});

for (const interruption of ['abort', 'background', 'back', 'unmount']) test(`${interruption} retires a pending connect and never navigates on its late success`, async () => {
  const app = mount(), pending = deferred(); app.control.connect = async () => pending.promise;
  app.props.onOpenConnection(); app.render();
  const abort = new AbortController();
  const result = app.props.onOpenControl({ host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, '', abort.signal);
  if (interruption === 'abort') abort.abort();
  else if (interruption === 'background') { app.background(); app.foreground(); }
  else if (interruption === 'back') app.props.onBack();
  else app.unmount();
  pending.resolve(true); assert.equal(await result, false);
  if (interruption !== 'unmount') { app.render(); assert.equal(app.page, interruption === 'back' ? 'control' : 'connection'); }
  assert.equal(app.lateUpdates, 0);
});

test('diagnostic navigation requires a confirmed stop and disconnect before readonly telemetry', async () => {
  const app = mount();
  app.control.operationCallbacks.stop = async () => { throw Error('unconfirmed'); };
  await app.props.onOpenJointStatus(); app.render(); assert.equal(app.page, 'control');
  assert.equal(app.calls.some(([name]) => name === 'disconnect'), false);
  app.control.operationCallbacks.stop = async () => { app.calls.push(['confirmed-stop']); };
  await app.props.onOpenJointStatus(); app.render(); assert.equal(app.page, 'joints');
  assert.deepEqual(app.calls.map(([name]) => name), ['confirmed-stop', 'disconnect']);
  assert.equal(app.options.filter(([name]) => name === 'control').at(-1)[1].ready, false);
  assert.equal(app.options.filter(([name]) => name === 'input').at(-1)[1], false);
  app.props.onBack(); app.render(); assert.equal(app.page, 'connection');
});

test('a stop completed after exiting cannot open diagnostics', async () => {
  const app = mount(), pending = deferred(); app.control.operationCallbacks.stop = () => pending.promise;
  const result = app.props.onOpenJointStatus(); app.props.onBack();
  pending.resolve(); await result; await settle(); app.render();
  assert.equal(app.page, 'control'); assert.deepEqual(app.calls.map(([name]) => name), ['disconnect', 'exit']);
});

test('callbacks retired by navigation cannot stop, connect or leave a newer page', async () => {
  const app = mount(), oldControl = app.props;
  app.props.onOpenConnection(); app.render();
  const connection = app.props, atConnection = app.calls.length;
  await oldControl.onOpenJointStatus(); oldControl.onOpenConnection(); oldControl.onBack();
  assert.equal(app.calls.length, atConnection);
  connection.onBack(); app.render();
  const atControl = app.calls.length;
  assert.equal(await connection.onOpenControl({ host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, '', new AbortController().signal), false);
  connection.onBack();
  assert.equal(app.calls.length, atControl); assert.equal(app.page, 'control');
});
