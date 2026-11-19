// Exercises production App handlers and preference storage with controlled I/O.
// This suite does not claim native or physical-robot acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const statements = [];
function visit(node) {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node.initializer);
  if (ts.isIfStatement(node)) statements.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
const evaluate = (code, context) => vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const initial = (name, context) => evaluate(`(${declarations.get(name).getText(ast)})`, context);
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const dog = id => ({ id, owner_id: 'account-a', model_code: id, display_name: id, is_demo: false });

function fixture() {
  const a = dog('a'), b = dog('b'), calls = [];
  let finishUnbind;
  const context = { device: a, devices: [a, b], deviceBusy: false, user: { id: 'account-a' },
    useCallback: fn => fn, getRobotModel: id => ({ id }),
    deviceSettingsRenderContext: { identity: 'account-a:session', deviceId: 'a', ownerId: 'account-a' },
    currentUserIdRef: { current: 'account-a' },
    deviceSettingsMountedRef: { current: true }, deviceSettingsAttemptRef: { current: null },
    deviceSelectionRevision: { current: 0 }, unbindDeviceAttemptRef: { current: null },
    Platform: { OS: 'web' }, window: { confirm: () => true },
    directConnection: { clear: () => calls.push('clear') },
    brainstemControl: { disconnect: async () => { calls.push('disconnect'); } },
    setControlEndpoint: endpoint => calls.push(['endpoint', endpoint]),
    setControlTarget: target => calls.push(['target', target]),
    setRobotConnectionVisible() {}, setConnectionDiagnosticsOpen() {}, setSelectedModel() {},
    notify: (...args) => calls.push(['notice', ...args]),
    selectedDeviceStore: { save: async (...args) => calls.push(['saved', ...args]) },
    deviceRepository: { unbind: () => new Promise(resolve => { finishUnbind = resolve; }) },
    humanizeAuthError: error => String(error),
  };
  context.deviceSettingsContext = { current: context.deviceSettingsRenderContext };
  context.setSelectedDevice = next => { context.device = typeof next === 'function' ? next(context.device) : next; };
  context.setAccountDevices = update => { context.devices = typeof update === 'function' ? update(context.devices) : update; };
  context.setDeviceBusy = value => { context.deviceBusy = value; };
  context.setDevice = initial('setDevice', context);
  context.selectDevice = initial('selectDevice', context);
  return { context, calls, a, b,
    select: id => initial('handleSelectDevice', context)(id),
    unbind: () => evaluate(`((device, devices, deviceBusy, deviceSettingsRenderContext) =>
      (${declarations.get('handleUnbindDevice').getText(ast)}))(device, devices, deviceBusy, deviceSettingsRenderContext)`, context)(),
    completeUnbind: async () => { finishUnbind(); await settle(); },
  };
}

test('device switching clears the previous direct target before selecting another device', () => {
  const f = fixture();
  f.select('b');
  assert.equal(f.context.device, f.b);
  assert.deepEqual(f.calls.slice(0, 4), ['clear', 'disconnect', ['endpoint', null], ['target', 'account']]);
  assert.deepEqual(f.context.devices, [f.a, f.b]);
  f.select('foreign');
  assert.equal(f.context.device, f.b);
  f.context.deviceBusy = true;
  f.select('a');
  assert.equal(f.context.device, f.b);
});

test('a bound device is appended and settings update its existing row without dropping other dogs', () => {
  const f = fixture(), c = dog('c');
  f.context.setDevice(c);
  assert.equal(f.context.device, c);
  assert.deepEqual(Array.from(f.context.devices, value => value.id), ['a', 'b', 'c']);
  f.context.setDevice({ ...c, alerts_enabled: false });
  assert.equal(f.context.devices.length, 3);
  assert.equal(f.context.devices[2].alerts_enabled, false);
});

test('unbinding the selected dog keeps and selects the remaining account dog', async () => {
  const f = fixture();
  f.unbind();
  await f.completeUnbind();
  assert.equal(f.context.device, f.b);
  assert.deepEqual(f.context.devices, [f.b]);
  assert.equal(f.context.deviceBusy, false);
});

test('unbinding the last dog clears selection while a stale result cannot alter a new account', async () => {
  const f = fixture();
  f.context.devices = [f.a];
  f.unbind();
  await f.completeUnbind();
  assert.equal(f.context.device, null);
  assert.deepEqual(f.context.devices, []);
  assert.ok(f.calls.some(call => call[0] === 'saved' && call[1] === 'account-a' && call[2] === null));
  const stale = fixture();
  stale.unbind();
  const other = { ...dog('other'), owner_id: 'account-b' };
  stale.context.deviceSettingsContext.current = {};
  stale.context.currentUserIdRef.current = 'account-b';
  stale.context.device = other;
  stale.context.devices = [other];
  await stale.completeUnbind();
  assert.equal(stale.context.device, other);
  assert.deepEqual(stale.context.devices, [other]);
  assert.equal(stale.calls.length, 0);
});

test('connection owners rotate for device A-B-A and hide the old endpoint synchronously', () => {
  const a = {}, b = {};
  const context = { connectionOwner: { current: { context: a, generation: 0 } },
    deviceSettingsRenderContext: a, deviceSettingsIdentity: 'account:session', device: dog('a') };
  const rotate = statements.find(node => node.expression.getText(ast) === 'connectionOwner.current.context !== deviceSettingsRenderContext');
  const first = initial('robotConnectionOwnerKey', context);
  context.controlSelection = { ownerKey: first, endpoint: { host: 'old-robot' } };
  for (const [device, owner] of [[dog('b'), b], [dog('a'), {}]]) {
    context.device = device;
    context.deviceSettingsRenderContext = owner;
    evaluate(rotate.getText(ast), context);
    context.robotConnectionOwnerKey = initial('robotConnectionOwnerKey', context);
    assert.notEqual(context.robotConnectionOwnerKey, first);
    assert.equal(initial('controlEndpoint', context), null);
  }
});

test('retiring an account clears busy and an old unbind cannot clear a newer operation', async () => {
  const f = fixture();
  f.unbind();
  assert.equal(f.context.deviceBusy, true);
  const effects = [];
  const findEffects = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node);
    ts.forEachChild(node, findEffects);
  };
  findEffects(ast);
  const reset = effects.find(node => node.arguments[1]?.getText(ast) === '[deviceSettingsIdentity]');
  f.context.bindDeviceAbortControllerRef = { current: null };
  f.context.bindDeviceAttemptRef = { current: 1 };
  evaluate(`(${reset.arguments[0].getText(ast)})`, f.context)();
  assert.equal(f.context.deviceBusy, false);
  f.context.deviceSettingsContext.current = {};
  const newAttempt = Symbol();
  f.context.unbindDeviceAttemptRef.current = newAttempt;
  f.context.deviceBusy = true;
  await f.completeUnbind();
  assert.equal(f.context.deviceBusy, true);
  assert.equal(f.context.unbindDeviceAttemptRef.current, newAttempt);
});

test('a failed retired settings save cannot leave optimistic values in the device list', async () => {
  const f = fixture();
  f.a.alerts_enabled = true;
  let rejectSave;
  f.context.deviceRepository.updateSettings = () => new Promise((resolve, reject) => { rejectSave = reject; });
  const save = evaluate(`((device, deviceSettingsRenderContext) =>
    (${declarations.get('persistDeviceSettings').getText(ast)}))(device, deviceSettingsRenderContext)`, f.context);
  const pending = save({ alerts_enabled: false });
  assert.equal(f.context.device.alerts_enabled, false);
  assert.equal(f.context.devices[0].alerts_enabled, true);
  f.select('b');
  f.context.deviceSettingsContext.current = {};
  rejectSave(Error('network'));
  await pending;
  f.context.deviceSettingsRenderContext = f.context.deviceSettingsContext.current;
  f.select('a');
  assert.equal(f.context.device.alerts_enabled, true);
});

test('a successful retired settings save refreshes only its unchanged account device cache', async () => {
  const f = fixture();
  f.a.alerts_enabled = true;
  let completeSave;
  f.context.deviceRepository.updateSettings = () => new Promise(resolve => { completeSave = resolve; });
  const save = evaluate(`((device, deviceSettingsRenderContext) =>
    (${declarations.get('persistDeviceSettings').getText(ast)}))(device, deviceSettingsRenderContext)`, f.context);
  const pending = save({ alerts_enabled: false });
  f.select('b');
  f.context.deviceSettingsContext.current = { identity: 'account-a:session', deviceId: 'b', ownerId: 'account-a' };
  const saved = { ...f.a, alerts_enabled: false };
  completeSave(saved);
  await pending;
  assert.equal(f.context.device, f.b);
  assert.equal(f.context.devices[0], saved);
  f.context.deviceSettingsRenderContext = f.context.deviceSettingsContext.current;
  f.select('a');
  assert.equal(f.context.device.alerts_enabled, false);
});

test('A-B-A switching cannot admit a second settings save before the first settles', async () => {
  const f = fixture();
  f.a.alerts_enabled = true;
  let completeSave, requests = 0;
  f.context.deviceRepository.updateSettings = () => { requests++; return new Promise(resolve => { completeSave = resolve; }); };
  const getSave = () => evaluate(`((device, deviceSettingsRenderContext) =>
    (${declarations.get('persistDeviceSettings').getText(ast)}))(device, deviceSettingsRenderContext)`, f.context);
  const first = getSave()({ alerts_enabled: false });
  f.select('b');
  f.context.deviceSettingsContext.current = { identity: 'account-a:session', deviceId: 'b', ownerId: 'account-a' };
  f.context.deviceSettingsRenderContext = f.context.deviceSettingsContext.current;
  f.select('a');
  f.context.deviceSettingsContext.current = { identity: 'account-a:session', deviceId: 'a', ownerId: 'account-a' };
  f.context.deviceSettingsRenderContext = f.context.deviceSettingsContext.current;
  await getSave()({ alerts_enabled: false });
  assert.equal(requests, 1);
  completeSave({ ...f.a, alerts_enabled: false });
  await first;
  assert.equal(f.context.device.alerts_enabled, false);
  assert.equal(f.context.deviceSettingsAttemptRef.current, null);
});

test('selection persistence is account scoped, ordered and recovers after a failed write', async () => {
  const module = { exports: {} }, values = new Map();
  evaluate(readFileSync(new URL('../src/services/selectedDevice.ts', import.meta.url), 'utf8'), { module, exports: module.exports, require: () => ({ localStore: {} }) });
  let rejectNext = false;
  const store = module.exports.createSelectedDeviceStore({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { if (rejectNext) { rejectNext = false; throw Error('disk'); } values.set(key, value); },
  });
  await Promise.all([store.save('a', 'first'), store.save('a', 'second'), store.save('b', 'other')]);
  assert.equal(await store.load('a'), 'second');
  assert.equal(await store.load('b'), 'other');
  rejectNext = true;
  await assert.rejects(store.save('a', 'failed'));
  await store.save('a', null);
  assert.equal(await store.load('a'), '');
});
