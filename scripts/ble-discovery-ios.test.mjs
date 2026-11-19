import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const contractSource = await source('../src/features/robot-lifecycle/bleDiscoveryContract.ts');
const modelSource = await source('../src/features/robot-lifecycle/bleDiscoveryModel.ts');
const sessionSource = await source('../src/features/robot-lifecycle/bleDiscoverySession.ts');
const adapterSource = await source('../src/features/robot-lifecycle/bleDiscoveryAdapter.ios.ts');
const androidSource = await source('../src/features/robot-lifecycle/bleDiscoveryAdapter.android.ts');
const fallbackSource = await source('../src/features/robot-lifecycle/bleDiscoveryAdapter.ts');

const contractUrl = moduleUrl(transpile(contractSource));
const modelUrl = moduleUrl(transpile(modelSource));
const sessionUrl = moduleUrl(
  transpile(sessionSource)
    .replaceAll("from './bleDiscoveryContract.ts'", `from '${contractUrl}'`)
    .replaceAll("from './bleDiscoveryModel.ts'", `from '${modelUrl}'`),
);
const managerUrl = moduleUrl(`
  export const BleScanMode = { LowLatency: 2 };
  export const BleState = Object.freeze({
    Unknown: 'unknown', Resetting: 'resetting', Unsupported: 'unsupported',
    Unauthorized: 'unauthorized', On: 'on', Off: 'off'
  });
  export default globalThis.__iosBleManager;
`);

globalThis.__iosBleManager = createManager();
const adapterUrl = moduleUrl(
  transpile(adapterSource)
    .replace("from 'react-native-ble-manager'", `from '${managerUrl}'`)
    .replace("from './bleDiscoveryContract'", `from '${contractUrl}'`)
    .replace("from './bleDiscoveryModel'", `from '${modelUrl}'`)
    .replace("from './bleDiscoverySession'", `from '${sessionUrl}'`),
);
const [{ createIosBleDiscoveryAdapter }, contract] = await Promise.all([
  import(adapterUrl),
  import(contractUrl),
]);
const { DOSO_BLE_SERVICE_UUID } = await import(modelUrl);

test('Android and iOS default to the same DOSO service and reject unrelated advertisements', async () => {
  const nativeHostUrl = moduleUrl(`
    export const Platform = { Version: 36 };
    export const PermissionsAndroid = {
      PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' },
      RESULTS: { GRANTED: 'granted', NEVER_ASK_AGAIN: 'never' },
      async requestMultiple() { return { scan: 'granted', connect: 'granted' }; },
      async request() { return 'granted'; }
    };
  `);
  const locationUrl = moduleUrl('export async function hasServicesEnabledAsync() { return true; }');
  const androidManager = createManager();
  globalThis.__androidBleManager = androidManager.api;
  const androidManagerUrl = moduleUrl(`
    export const BleScanMode = { LowLatency: 2 };
    export const BleState = { On: 'on' };
    export default globalThis.__androidBleManager;
  `);
  const androidUrl = moduleUrl(transpile(androidSource)
    .replace("from 'react-native-ble-manager'", `from '${androidManagerUrl}'`)
    .replace("from 'react-native'", `from '${nativeHostUrl}'`)
    .replace("from 'expo-location'", `from '${locationUrl}'`)
    .replace("from './bleDiscoveryContract'", `from '${contractUrl}'`)
    .replace("from './bleDiscoveryModel'", `from '${modelUrl}'`)
    .replace("from './bleDiscoverySession'", `from '${sessionUrl}'`));
  const android = (await import(androidUrl)).bleDiscoveryAdapter;
  const iosManager = createManager();
  for (const [adapter, manager] of [[android, androidManager], [createIosBleDiscoveryAdapter(iosManager.api), iosManager]]) {
    const pending = adapter.scan({ onCandidates() {} });
    await manager.waitForScan(1);
    assert.deepEqual(manager.lastScan.serviceUUIDs, [DOSO_BLE_SERVICE_UUID]);
    manager.discover({ id: 'headphones', name: 'Headphones', rssi: -30, advertising: { serviceUUIDs: [] } });
    manager.discover(peripheral('robot', 'DOSO-ABCDEF', -50));
    manager.finish(10);
    const candidates = await pending;
    assert.deepEqual(candidates.map(candidate => candidate.id), ['robot']);
    assert.equal(candidates[0].connectable, false);
    assert.equal(candidates[0].matchBasis, 'service_uuid');
  }
  const { Platform } = await import(nativeHostUrl);
  Platform.Version = 25;
  const legacyScan = android.scan({ onCandidates() {} });
  await androidManager.waitForScan(2);
  const legacyPeripheral = peripheral('legacy', 'DOSO-LEGACY', -50);
  legacyPeripheral.advertising.isConnectable = true;
  androidManager.discover(legacyPeripheral);
  androidManager.finish(0);
  assert.equal((await legacyScan)[0].connectable, false, 'legacy bridge fallback must not enable connection');
});

test('iOS timeout completes discovery, merges duplicates, and removes listeners', async () => {
  const manager = createManager();
  const adapter = createIosBleDiscoveryAdapter(manager.api);
  const updates = [];
  const pending = adapter.scan({ seconds: 1, onCandidates: (next) => updates.push(next) });
  await manager.waitForScan(1);
  manager.discover(peripheral('robot', 'DOSO One', -72));
  manager.discover(peripheral('robot', null, -39));
  manager.finish(10);

  const result = await pending;
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, 'DOSO One');
  assert.equal(result[0].rssi, -39);
  assert.equal(updates.length, 2);
  assert.equal(manager.removedSubscriptions, 2);
});

test('Android and iOS scan the explicit service override and reject the default service', async () => {
  const previous = process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID;
  const configured = '67cf35ba-9905-4acc-9712-044bd6d6f13a';
  process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID = ` ${configured} `;
  try {
    const nativeHostUrl = moduleUrl(`
      export const Platform = { Version: 36 };
      export const PermissionsAndroid = {
        PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' },
        RESULTS: { GRANTED: 'granted', NEVER_ASK_AGAIN: 'never' },
        async requestMultiple() { return { scan: 'granted', connect: 'granted' }; },
        async request() { return 'granted'; }
      };
    `);
    const locationUrl = moduleUrl('export async function hasServicesEnabledAsync() { return true; }');
    const androidManager = createManager(), iosManager = createManager();
    globalThis.__configuredAndroidManager = androidManager.api;
    const configuredManagerUrl = moduleUrl(`
      export const BleScanMode = { LowLatency: 2 };
      export const BleState = { On: 'on' };
      export default globalThis.__configuredAndroidManager;
    `);
    const androidUrl = moduleUrl(transpile(androidSource)
      .replace("from 'react-native-ble-manager'", `from '${configuredManagerUrl}'`)
      .replace("from 'react-native'", `from '${nativeHostUrl}'`)
      .replace("from 'expo-location'", `from '${locationUrl}'`)
      .replace("from './bleDiscoveryContract'", `from '${contractUrl}'`)
      .replace("from './bleDiscoveryModel'", `from '${modelUrl}'`)
      .replace("from './bleDiscoverySession'", `from '${sessionUrl}'`));
    const configuredIosUrl = moduleUrl(transpile(adapterSource)
      .replace("from 'react-native-ble-manager'", `from '${managerUrl}'`)
      .replace("from './bleDiscoveryContract'", `from '${contractUrl}'`)
      .replace("from './bleDiscoveryModel'", `from '${modelUrl}'`)
      .replace("from './bleDiscoverySession'", `from '${sessionUrl}'`) + '\n// configured service fixture');
    const android = (await import(androidUrl)).bleDiscoveryAdapter;
    const ios = (await import(configuredIosUrl)).createIosBleDiscoveryAdapter(iosManager.api);
    for (const [adapter, manager] of [[android, androidManager], [ios, iosManager]]) {
      const pending = adapter.scan({ onCandidates() {} });
      await manager.waitForScan(1);
      assert.deepEqual(manager.lastScan.serviceUUIDs, [configured]);
      manager.discover(peripheral('default-service', 'DOSO', -40));
      const robot = peripheral('configured-service', 'DOSO', -50);
      robot.advertising.serviceUUIDs = [configured];
      manager.discover(robot); manager.finish(10);
      assert.deepEqual((await pending).map(candidate => candidate.id), ['configured-service']);
    }
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID;
    else process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID = previous;
  }
});

test('stop cancels initialization and prevents a late scan from starting', async () => {
  let resolveStart;
  const delayedStart = new Promise((resolve) => { resolveStart = resolve; });
  const manager = createManager({ startPromise: delayedStart });
  const adapter = createIosBleDiscoveryAdapter(manager.api);
  const pending = adapter.scan({ onCandidates() {} });
  await Promise.resolve();
  await adapter.stop();
  resolveStart();

  await assert.rejects(pending, contract.BleDiscoveryCancelledError);
  assert.equal(manager.scanCalls, 0);
});

test('Bluetooth off and rejected authorization fail before scanning', async () => {
  for (const [state, code] of [
    ['off', 'bluetooth_off'],
    ['unauthorized', 'permission_denied'],
  ]) {
    const manager = createManager({ state });
    const adapter = createIosBleDiscoveryAdapter(manager.api);
    await assert.rejects(
      adapter.scan({ onCandidates() {} }),
      (error) => error instanceof contract.BleDiscoveryError && error.code === code,
    );
    assert.equal(manager.scanCalls, 0);
  }
});

test('unknown and resetting states never masquerade as a successful scan', async () => {
  for (const state of ['unknown', 'resetting']) {
    const manager = createManager({ state });
    const adapter = createIosBleDiscoveryAdapter(manager.api);
    await assert.rejects(
      adapter.scan({ onCandidates() {} }),
      (error) => error instanceof contract.BleDiscoveryError && error.code === 'scan_failed',
    );
    assert.equal(manager.scanCalls, 0);
  }
});

test('a repeated scan cancels the old session and isolates its late events', async () => {
  const manager = createManager();
  const adapter = createIosBleDiscoveryAdapter(manager.api);
  let firstUpdates = 0;
  let secondUpdates = 0;
  const first = adapter.scan({ onCandidates() { firstUpdates += 1; } });
  await manager.waitForScan(1);
  const second = adapter.scan({ onCandidates() { secondUpdates += 1; } });
  await assert.rejects(first, contract.BleDiscoveryCancelledError);
  await manager.waitForScan(2);

  manager.discover(peripheral('new', 'DOSO New', -44));
  manager.finish(10);
  assert.equal((await second)[0].id, 'new');
  assert.equal(firstUpdates, 0);
  assert.equal(secondUpdates, 1);
  assert.equal(manager.startCalls, 1, 'native manager initialization is reused');
});

test('platform resolution remains isolated: iOS is supported and default/web fallback is not', () => {
  assert.match(adapterSource, /supported:\s*true/);
  assert.match(fallbackSource, /supported:\s*false/);
  assert.doesNotMatch(adapterSource, /PermissionsAndroid|expo-location|enableBluetooth/);
  assert.doesNotMatch(
    adapterSource,
    /\.(?:connect|disconnect|createBond|removeBond|retrieveServices|read|write|writeWithoutResponse|startNotification|stopNotification)\s*\(/,
  );
});

function createManager({ state = 'on', startPromise = Promise.resolve() } = {}) {
  let discoverListener = () => {};
  let stopListener = () => {};
  let scanning = false;
  const counters = { removedSubscriptions: 0, scanCalls: 0, startCalls: 0 };
  let lastScan;
  const api = {
    async start() {
      counters.startCalls += 1;
      await startPromise;
    },
    async checkState() { return state; },
    onDiscoverPeripheral(listener) {
      discoverListener = listener;
      return { remove() { counters.removedSubscriptions += 1; discoverListener = () => {}; } };
    },
    onStopScan(listener) {
      stopListener = listener;
      return { remove() { counters.removedSubscriptions += 1; stopListener = () => {}; } };
    },
    async scan(options) {
      lastScan = options;
      counters.scanCalls += 1;
      scanning = true;
    },
    async isScanning() { return scanning; },
    async stopScan() { scanning = false; },
  };
  return {
    api,
    discover(value) { discoverListener(value); },
    finish(status) { scanning = false; stopListener({ status }); },
    async waitForScan(expected) {
      for (let attempt = 0; attempt < 100 && counters.scanCalls < expected; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assert.equal(counters.scanCalls, expected, `expected ${expected} scan call(s)`);
    },
    get removedSubscriptions() { return counters.removedSubscriptions; },
    get scanCalls() { return counters.scanCalls; },
    get startCalls() { return counters.startCalls; },
    get lastScan() { return lastScan; },
  };
}

function peripheral(id, name, rssi) {
  return { id, name, rssi, advertising: { localName: name, serviceUUIDs: [DOSO_BLE_SERVICE_UUID], isConnectable: false } };
}

function transpile(value) {
  return ts.transpileModule(value, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function moduleUrl(value) {
  return `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`;
}

function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}
