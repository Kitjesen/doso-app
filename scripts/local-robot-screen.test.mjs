import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as modes from '../src/features/control/robotModeCapabilities.ts';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const grpcModule = { exports: {} };
vm.runInNewContext(compile('../src/services/brainstemGrpc.ts'), { module: grpcModule, exports: grpcModule.exports, URL,
  require: name => {
    if (name === '../features/control/robotModeCapabilities') return modes;
    if (name === 'expo') return { requireOptionalNativeModule: () => null };
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: 'active' } };
    assert.fail(`Unexpected native service dependency ${name}`);
  } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const target = { host: '192.168.66.64', port: 13145, transport: 'tls', clientIdentityAlias: 'local-client' };

function mount({ available = true, lanAvailable = false } = {}) {
  let cursor = 0, node, dirty = false, unmounted = false, lateUpdates = 0;
  const slots = [], effects = [], pending = [], listeners = new Set(), back = new Set(), calls = [], options = [];
  const changed = (a, b) => !a || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { if (unmounted) lateUpdates++; else { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(create, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: create(), deps }; return slots[i].value; },
    useEffect(create, deps) { const i = cursor++; if (!effects[i] || changed(effects[i].deps, deps)) pending.push({ i, create, deps }); },
  };
  const appState = { currentState: 'active', addEventListener(_name, listener) {
    listeners.add(listener); return { remove: () => listeners.delete(listener) };
  } };
  const control = {
    state: { phase: 'ready', connected: false, sequence: 0, clientIdentitySelected: false, mutualTlsVerified: false,
      principalVerified: false, leaseActive: false, transport: null, error: null }, runtimeState: { controlLink: 'connected' },
    canAcquire: false, canBeginManualControl: false, canBeginTouchControl: false, manualPrepared: false,
    connect: async (...args) => { calls.push(['connect', ...args]); return true; },
    disconnect: async () => { calls.push(['disconnect']); },
    interrupt: () => calls.push(['interrupt']), prepareManualControl: () => calls.push(['acquire']),
    endTouchGesture: () => calls.push(['release-touch']), drive: () => calls.push(['drive']), turn: () => calls.push(['turn']), sticks: () => calls.push(['sticks']),
    operationCallbacks: { stop: async () => { calls.push(['stop']); }, stand: () => calls.push(['stand']), enableMotor: () => calls.push(['enable']) },
    operationReadiness: { stand: { ready: false }, enableMotor: { ready: false } },
  };
  const ControlScreen = () => null, RobotConnectionScreen = () => null;
  const imports = {
    react, 'expo-crypto': { randomUUID: () => 'local-session-fixture' }, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { Alert: { alert: (...args) => calls.push(['alert', ...args]) }, AppState: appState,
      BackHandler: { addEventListener(_name, listener) { back.add(listener); return { remove: () => back.delete(listener) }; } } },
    '../assets': { images: { thunderHero: 1 } },
    '../features/control/useBrainstemControl': { useBrainstemControl: value => { options.push(['control', value]); return control; } },
    '../features/control/useBrainstemTelemetry': { useBrainstemTelemetry: value => { options.push(['telemetry', value]); return { presentation: null }; } },
    '../features/control/useG20Input': { useG20Input: value => { options.push(['input', value]); return {}; } },
    '../features/robot-lifecycle/robotDiagnosticsGateway': { createRobotDiagnosticsGateway: () => ({}) },
    '../services/brainstemControl': { isBrainstemControlAvailable: () => available },
    '../services/brainstemGrpc': { isBrainstemGrpcAvailable: () => true, isBrainstemLanAvailable: () => lanAvailable,
      validateBrainstemEndpoint: grpcModule.exports.validateBrainstemEndpoint },
    '../services/brainstemIntegrationReadiness': { getBrainstemIntegrationReadiness: value => value },
    '../services/directRobotConnection': { describeDirectRobotConnection: () => ({ runtimeState: { controlLink: 'unknown' } }) },
    './ControlScreen': { ControlScreen }, './RobotConnectionScreen': { RobotConnectionScreen },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('../src/screens/LocalRobotScreen.tsx'), { module, exports: module.exports, JSON,
    require: name => { assert.ok(name in imports, `Local use must not load cloud, accounts or storage (${name})`); return imports[name]; } });
  const onExit = () => calls.push(['exit']);
  const render = () => {
    do {
      dirty = false; cursor = 0; node = module.exports.LocalRobotScreen({ onExit });
      for (const effect of pending.splice(0)) {
        effects[effect.i]?.cleanup?.(); effects[effect.i] = { deps: effect.deps, cleanup: effect.create() };
      }
    } while (dirty);
  };
  render();
  return { calls, options, control, render,
    get props() { return node.props; }, get page() { return node.type === RobotConnectionScreen ? 'connection' : 'control'; },
    get lateUpdates() { return lateUpdates; },
    background() { appState.currentState = 'background'; [...listeners].forEach(listener => listener('background')); render(); },
    foreground() { appState.currentState = 'active'; [...listeners].forEach(listener => listener('active')); render(); },
    hardwareBack() { [...back].at(-1)(); },
    unmount() { unmounted = true; effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test('local entry starts without an account, cloud calls, auto connection or automatic control', () => {
  const app = mount();
  assert.equal(app.page, 'connection'); assert.deepEqual(app.calls, []);
  assert.equal(app.options.find(([kind]) => kind === 'control')[1].ownerKey, 'local-use:local-session-fixture');
  assert.equal(app.options.find(([kind]) => kind === 'control')[1].autoReconnectEnabled, false);
  assert.equal(app.options.find(([kind]) => kind === 'control')[1].autoConnectEndpoint, undefined);
  assert.equal(app.props.onBindDevice, undefined); assert.equal(app.props.onOpenDeviceEnrollment, undefined);
  assert.equal(mount({ available: false }).props.onOpenControl, undefined);
});

test('explicit TLS connection uses local credentials while lease and motor gates stay inactive', async () => {
  const app = mount();
  assert.equal(await app.props.onOpenControl(target, ' local-operator ', new AbortController().signal), true);
  app.render(); assert.equal(app.page, 'control');
  const connected = app.calls.find(([name]) => name === 'connect');
  assert.equal(connected[1].clientIdentityAlias, 'local-client'); assert.equal(connected[2], 'local-operator');
  assert.equal(app.props.canUseManualControl, false); assert.equal(app.props.controlSession.leaseActive, false);
  assert.equal(app.props.productionInput.ready, false); assert.equal(app.props.canUseRouteMode, false); assert.equal(app.props.canUseTaskMode, false);
  assert.deepEqual(app.calls.map(([name]) => name), ['connect']);
});

test('local screen preserves certificate and native LAN restrictions', async () => {
  const app = mount();
  for (const [candidate, principal] of [[{ ...target, clientIdentityAlias: undefined }, 'operator'], [target, ' '],
    [{ host: '192.168.66.64', port: 13145, transport: 'lan-dev' }, '']]) {
    assert.equal(await app.props.onOpenControl(candidate, principal, new AbortController().signal), false);
  }
  assert.deepEqual(app.calls, []);
  const qa = mount({ lanAvailable: true });
  assert.equal(await qa.props.onOpenControl({ host: '8.8.8.8', port: 13145, transport: 'lan-dev' }, '', new AbortController().signal), false);
  assert.equal(await qa.props.onOpenControl({ host: '192.168.66.64', port: 13145, transport: 'lan-dev' }, '', new AbortController().signal), true);
});

for (const interruption of ['abort', 'background', 'back', 'unmount']) test(`${interruption} discards a pending local connection and its late completion`, async () => {
  const app = mount(), pending = deferred(), abort = new AbortController();
  app.control.connect = async () => pending.promise;
  const result = app.props.onOpenControl(target, 'operator', abort.signal);
  if (interruption === 'abort') abort.abort();
  else if (interruption === 'background') { app.background(); app.foreground(); }
  else if (interruption === 'back') app.props.onBack();
  else app.unmount();
  pending.resolve(true); assert.equal(await result, false); await settle();
  if (interruption !== 'unmount') { app.render(); assert.equal(app.page, 'connection'); }
  assert.equal(app.lateUpdates, 0);
  assert.ok(app.calls.some(([name]) => name === 'disconnect'));
});

test('background clears a connected target and returning stays on the connection page', async () => {
  const app = mount(); await app.props.onOpenControl(target, 'operator', new AbortController().signal); app.render();
  app.background(); app.foreground(); assert.equal(app.page, 'connection');
  assert.equal(app.props.initialEndpoint, undefined);
  assert.equal(app.calls.filter(([name]) => name === 'connect').length, 1);
});

test('leaving waits for disconnect and retired page callbacks cannot reopen or close a newer page', async () => {
  const app = mount(), initial = app.props;
  await app.props.onOpenControl(target, 'operator', new AbortController().signal); app.render();
  assert.equal(await initial.onOpenControl(target, 'operator', new AbortController().signal), false);
  initial.onBack(); await settle(); assert.equal(app.calls.some(([name]) => name === 'exit'), false);
  const pending = deferred(); app.control.disconnect = async () => { app.calls.push(['disconnect']); await pending.promise; };
  app.hardwareBack(); await settle(); assert.equal(app.calls.some(([name]) => name === 'exit'), false);
  pending.resolve(); await settle(); assert.deepEqual(app.calls.at(-1), ['exit']);
});

test('a real session with unconfirmed stop stays visible on exit and keeps the stop latch', async () => {
  const app = mount();
  const status = { fsmKind: 'standing', transition: 'none', motorOutputEnabled: true,
    owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: true };
  const reply = { status, leaseActive: false, principalVerified: false };
  const session = new BrainstemControlSession({
    open: async () => ({ ...reply, sessionId: 'local-session', transport: 'grpc-mtls', mutualTlsVerified: true,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }),
    acquire: async () => ({ ...reply, status: { ...status, owner: 'grpc', grpcLeaseActive: true },
      leaseActive: true, leaseOwnerMatched: true, principalVerified: true, sequence: 1 }),
    interrupt: async () => { throw { code: 'stop_unconfirmed' }; }, close: async () => {},
  }, () => true);
  Object.defineProperty(app.control, 'state', { get: () => session.state });
  app.control.connect = session.connect.bind(session);
  app.control.operationCallbacks.stop = session.interrupt.bind(session);
  app.control.disconnect = session.disconnect.bind(session);
  await app.props.onOpenControl(target, 'operator', new AbortController().signal);
  await session.acquire(); app.render();
  app.props.onBack(); await settle(); app.render();
  assert.equal(app.page, 'control');
  assert.equal(app.calls.some(([name]) => name === 'exit'), false);
  assert.equal(session.state.failureCode, 'stop_unconfirmed');
  assert.match(app.calls.find(([name]) => name === 'alert')[2], /硬件急停/);
  assert.match(app.props.controlSession.error, /停止请求未确认/);
  app.props.onBack(); await settle();
  assert.equal(app.calls.filter(([name]) => name === 'alert').length, 2, 'closed stop latch still blocks a second exit');
});

test('an ordinary closed local connection error does not block exit', async () => {
  const app = mount(); app.control.state = { connected: false, failureCode: 'unavailable', error: 'old timeout' };
  app.control.operationCallbacks.stop = async () => { throw Error('must not stop an already closed ordinary failure'); };
  app.render(); app.props.onBack(); await settle();
  assert.equal(app.calls.some(([name]) => name === 'exit'), true);
  assert.equal(app.calls.some(([name]) => name === 'alert'), false);
});

test('an ordinary closed local connection error allows returning to connection settings', async () => {
  const app = mount(); await app.props.onOpenControl(target, 'operator', new AbortController().signal); app.render();
  app.control.state = { connected: false, failureCode: 'unavailable', error: 'old timeout' };
  app.control.operationCallbacks.stop = async () => { throw Error('already closed'); };
  app.render(); app.props.onOpenConnection(); await settle(); app.render();
  assert.equal(app.page, 'connection');
  assert.equal(app.calls.some(([name]) => name === 'disconnect'), true);
  assert.equal(app.calls.some(([name]) => name === 'alert'), false);
});

test('an unconfirmed local stop keeps connection settings closed and gives local feedback', async () => {
  const app = mount(); await app.props.onOpenControl(target, 'operator', new AbortController().signal); app.render();
  app.control.state = { connected: false, failureCode: 'stop_unconfirmed', error: 'stop unconfirmed' };
  app.control.operationCallbacks.stop = async () => { throw Error('stop unconfirmed'); };
  app.render(); app.props.onOpenConnection(); await settle(); app.render();
  assert.equal(app.page, 'control');
  assert.match(app.calls.find(([name]) => name === 'alert')[2], /硬件急停/);
});
