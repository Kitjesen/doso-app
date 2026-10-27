// @ts-nocheck -- Executed directly by Node 24 with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateFromPeripheral,
  maskPeripheralId,
  mergeCandidate,
  sortCandidates,
// @ts-expect-error Node verifier uses the explicit TypeScript source entrypoint.
} from '../src/features/robot-lifecycle/bleDiscoveryModel.ts';
import {
  isSuccessfulBleStopStatus,
  requiresLegacyAndroidLocationServices,
  runBleDiscoveryScanSession,
  shouldStopBleScanForAppState,
// @ts-expect-error Node verifier uses the explicit TypeScript source entrypoint.
} from '../src/features/robot-lifecycle/bleDiscoverySession.ts';
import {
  BleDiscoveryCancelledError,
  BleDiscoveryError,
// @ts-expect-error Node verifier uses the explicit TypeScript source entrypoint.
} from '../src/features/robot-lifecycle/bleDiscoveryContract.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

await check('name-prefix discovery accepts a real DOSO advertisement', () => {
  assert.deepEqual(candidateFromPeripheral({
    id: 'AA:BB:CC:DD:EE:01',
    name: 'DOSO-THUNDER-01',
    rssi: -48,
    serviceUUIDs: [],
  }, { namePrefix: 'DOSO', serviceUuid: null }), {
    id: 'AA:BB:CC:DD:EE:01',
    displayName: 'DOSO-THUNDER-01',
    rssi: -48,
    serviceUUIDs: [],
    matchBasis: 'name_hint',
  });
});

await check('all nearby advertisements stay explicitly unverified until a service UUID is configured', () => {
  assert.equal(candidateFromPeripheral({
    id: 'unrelated',
    name: 'Headphones',
    rssi: -41,
    serviceUUIDs: [],
  }, { namePrefix: 'DOSO', serviceUuid: null })?.matchBasis, 'unverified');
});

await check('configured service UUID is authoritative even when the advertised name changes', () => {
  const serviceUuid = '12345678-1234-5678-1234-56789abcdef0';
  assert.equal(candidateFromPeripheral({
    id: 'service-match',
    name: 'Factory Setup',
    rssi: -61,
    serviceUUIDs: [serviceUuid.toUpperCase()],
  }, { namePrefix: 'DOSO', serviceUuid })?.matchBasis, 'service_uuid');
  assert.equal(candidateFromPeripheral({
    id: 'name-only',
    name: 'DOSO-SPOOF',
    rssi: -30,
    serviceUUIDs: [],
  }, { namePrefix: 'DOSO', serviceUuid }), null);
});

await check('duplicate discoveries keep one candidate and the strongest observed RSSI', () => {
  assert.deepEqual(mergeCandidate({
    id: 'same-device', displayName: 'Nearby device', rssi: -70, serviceUUIDs: ['A'], matchBasis: 'unverified',
  }, {
    id: 'same-device', displayName: 'DOSO Thunder', rssi: -42, serviceUUIDs: ['B'], matchBasis: 'name_hint',
  }), {
    id: 'same-device', displayName: 'DOSO Thunder', rssi: -42, serviceUUIDs: ['A', 'B'], matchBasis: 'name_hint',
  });
});

await check('an unnamed duplicate cannot erase a previously observed device name', () => {
  const named = candidateFromPeripheral({
    id: 'same-device', name: 'DOSO Thunder', rssi: -62, serviceUUIDs: [],
  }, { namePrefix: 'DOSO', serviceUuid: null });
  const unnamed = candidateFromPeripheral({
    id: 'same-device', name: null, rssi: -40, serviceUUIDs: [],
  }, { namePrefix: 'DOSO', serviceUuid: null });
  assert.ok(named && unnamed);
  assert.equal(mergeCandidate(named, unnamed).displayName, 'DOSO Thunder');
  assert.equal(mergeCandidate(named, unnamed).rssi, -40);
});

await check('candidate ordering and peripheral masking are deterministic', () => {
  assert.deepEqual(sortCandidates([
    { id: 'weak', displayName: 'Weak', rssi: -80, serviceUUIDs: [], matchBasis: 'unverified' },
    { id: 'strong', displayName: 'Strong', rssi: -35, serviceUUIDs: [], matchBasis: 'unverified' },
  ]).map(({ id }) => id), ['strong', 'weak']);
  assert.equal(maskPeripheralId('AA:BB:CC:DD:EE:FF'), '••••EEFF');
});

await check('Android stop statuses and legacy location-service requirements are explicit', () => {
  assert.equal(isSuccessfulBleStopStatus(0), true);
  assert.equal(isSuccessfulBleStopStatus(10), true);
  assert.equal(isSuccessfulBleStopStatus(1), false);
  assert.equal(isSuccessfulBleStopStatus(undefined), false);
  assert.equal(requiresLegacyAndroidLocationServices(23), true);
  assert.equal(requiresLegacyAndroidLocationServices(30), true);
  assert.equal(requiresLegacyAndroidLocationServices(31), false);
  assert.equal(requiresLegacyAndroidLocationServices(36), false);
  assert.equal(shouldStopBleScanForAppState('active'), false);
  assert.equal(shouldStopBleScanForAppState('inactive'), true);
  assert.equal(shouldStopBleScanForAppState('background'), true);
});

await check('native scan session reports timeout success, deduplicates, and cleans listeners', async () => {
  const fake = createFakeBleRuntime();
  const updates = [];
  const pending = runBleDiscoveryScanSession(fake.runtime, {
    seconds: 8,
    onCandidates: (next) => updates.push(next),
    toCandidate: (peripheral) => candidateFromPeripheral(peripheral, { namePrefix: 'DOSO', serviceUuid: null }),
  });
  await fake.ready;
  fake.discover({ id: 'robot', name: 'DOSO One', rssi: -70, serviceUUIDs: [] });
  fake.discover({ id: 'robot', name: null, rssi: -41, serviceUUIDs: [] });
  fake.stop(10);
  const result = await pending;
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, 'DOSO One');
  assert.equal(result[0].rssi, -41);
  assert.equal(updates.length, 2);
  assert.equal(fake.removedSubscriptions, 2);
  assert.equal(fake.stopCalls, 0);
});

await check('native scan session preserves Android failure status instead of reporting no devices', async () => {
  const fake = createFakeBleRuntime();
  const pending = runBleDiscoveryScanSession(fake.runtime, {
    seconds: 8,
    onCandidates() {},
    toCandidate: (peripheral) => candidateFromPeripheral(peripheral, { namePrefix: 'DOSO', serviceUuid: null }),
  });
  await fake.ready;
  fake.stop(2);
  await assert.rejects(pending, (error) => (
    error instanceof BleDiscoveryError
    && error.code === 'scan_failed'
    && error.nativeStatus === 2
  ));
  assert.equal(fake.removedSubscriptions, 2);
});

await check('native scan session accepts an explicit normal stop status', async () => {
  const fake = createFakeBleRuntime();
  const pending = runBleDiscoveryScanSession(fake.runtime, {
    seconds: 8,
    onCandidates() {},
    toCandidate: (peripheral) => candidateFromPeripheral(peripheral, { namePrefix: 'DOSO', serviceUuid: null }),
  });
  await fake.ready;
  fake.stop(0);
  assert.deepEqual(await pending, []);
});

await check('native scan session cancellation stops hardware and ignores late events', async () => {
  const fake = createFakeBleRuntime();
  const controller = new AbortController();
  let updateCount = 0;
  const pending = runBleDiscoveryScanSession(fake.runtime, {
    seconds: 8,
    onCandidates() { updateCount += 1; },
    signal: controller.signal,
    toCandidate: (peripheral) => candidateFromPeripheral(peripheral, { namePrefix: 'DOSO', serviceUuid: null }),
  });
  await fake.ready;
  controller.abort();
  await assert.rejects(pending, BleDiscoveryCancelledError);
  fake.discover({ id: 'late', name: 'DOSO Late', rssi: -30, serviceUUIDs: [] });
  assert.equal(updateCount, 0);
  assert.equal(fake.stopCalls, 1);
  assert.equal(fake.removedSubscriptions, 2);
});

await check('native wiring requests permission, scans, cleans up, and never writes a characteristic', async () => {
  const [nativeAdapter, iosAdapter, scanSession, fallbackAdapter, screen, app, profile, appConfig, easConfig, packageText] = await Promise.all([
    source('src/features/robot-lifecycle/bleDiscoveryAdapter.android.ts'),
    source('src/features/robot-lifecycle/bleDiscoveryAdapter.ios.ts'),
    source('src/features/robot-lifecycle/bleDiscoverySession.ts'),
    source('src/features/robot-lifecycle/bleDiscoveryAdapter.ts'),
    source('src/screens/BleDiscoveryScreen.tsx'),
    source('App.tsx'),
    source('src/screens/ProfileScreen.tsx'),
    source('app.json'),
    source('eas.json'),
    source('package.json'),
  ]);

  for (const token of [
    'PermissionsAndroid.requestMultiple',
    'BLUETOOTH_SCAN',
    'BLUETOOTH_CONNECT',
    'ACCESS_FINE_LOCATION',
    'BleManager.start',
    'BleManager.checkState',
    'BleManager.onDiscoverPeripheral',
    'BleManager.onStopScan',
    'BleManager.scan',
    'BleManager.stopScan',
    'Location.hasServicesEnabledAsync',
    "BleDiscoveryError('location_off')",
  ]) assert.match(nativeAdapter, new RegExp(escapeRegex(token)), `native adapter missing ${token}`);
  assert.doesNotMatch(
    `${nativeAdapter}\n${iosAdapter}\n${scanSession}`,
    /(?:BleManager|runtime)\.(?:connect|disconnect|createBond|removeBond|retrieveServices|read|write|writeWithoutResponse|startNotification|stopNotification)\s*\(/,
  );
  for (const token of [
    'createIosBleDiscoveryAdapter',
    'manager.start',
    'BleState.Off',
    'BleState.Unauthorized',
    'BleState.Unsupported',
    'BleState.On',
    'runBleDiscoveryScanSession',
  ]) assert.match(iosAdapter, new RegExp(escapeRegex(token)), `iOS adapter missing ${token}`);
  assert.doesNotMatch(iosAdapter, /PermissionsAndroid|expo-location|enableBluetooth/);
  assert.match(fallbackAdapter, /supported:\s*false/);

  for (const token of ['bleDiscoveryAdapter.scan', '蓝牙扫描与连接', '不会自动绑定或配网', '候选设备']) {
    assert.match(screen, new RegExp(escapeRegex(token)), `screen missing ${token}`);
  }
  assert.match(screen, /scanPendingRef\.current/);
  assert.match(screen, /requestId === scanRequestRef\.current/);
  assert.match(screen, /bleDiscoveryAdapter\.supported \? \(/);
  assert.match(screen, /AppState\.addEventListener\('change'/);
  assert.match(screen, /shouldStopBleScanForAppState\(AppState\.currentState\)/, 'a scan cannot start after the app has already left the foreground');
  assert.match(screen, /shouldStopBleScanForAppState\(nextState\)/);
  assert.match(screen, /'interrupted'/, 'the UI has an explicit scan-interrupted state');
  assert.match(screen, /current === 'scanning' \? 'interrupted' : current/, 'backgrounding a live scan records interruption instead of silently returning idle');
  assert.match(screen, /应用进入后台，蓝牙扫描已停止/, 'the interruption reason is visible to the user');
  assert.match(screen, /accessibilityState=\{\{ busy: status === 'scanning' \}\}/, 'assistive technology receives the active scan state');
  assert.match(app, /import \{ BleDiscoveryScreen \} from '\.\/src\/screens\/BleDiscoveryScreen';/);
  assert.match(app, /stage === 'ble-discovery'[\s\S]*?<BleDiscoveryScreen[\s\S]*?onBack=\{returnToDeviceSettings\}/);
  assert.match(app, /onOpenBleDiscovery=\{\(\) => setStage\('ble-discovery'\)\}/);
  assert.match(app, /canOpenProvisioning=\{robotCapabilityReadiness\.provisioning\.available\}/);
  assert.match(profile, /title="附近 BLE 设备"/);
  // Connection is now explicit in the BLE screen, while this entry still only
  // navigates there. The scanner's no-connect/no-write assertion above stays.
  assert.match(profile, /onPress=\{onOpenBleDiscovery\}/);
  assert.match(screen, /bleConnectionAdapter\.connect\(candidate\.id, update\)/);
  assert.match(screen, /disabled testID="ble-identity-blocked"/);
  assert.match(screen, /disabled testID="ble-wifi-blocked"/);
  assert.match(profile, /真实配网尚未接入/);

  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.dependencies['react-native-ble-manager'], '12.5.1');
  assert.match(packageJson.dependencies['expo-dev-client'], /^~57\./);
  assert.match(packageJson.dependencies['expo-location'], /^~57\./);
  assert.match(packageJson.dependencies['expo-splash-screen'], /^~57\./);
  assert.equal(packageJson.scripts['test:ble-discovery'], 'node --experimental-strip-types scripts/verify-ble-discovery.mts && npm run test:ble-introspection');
  assert.equal(packageJson.scripts['test:ble-introspection'], 'expo config --type introspect --json | node scripts/verify-ble-introspection.mjs');

  const config = JSON.parse(appConfig);
  const plugin = config.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'react-native-ble-manager');
  assert.ok(plugin, 'BLE config plugin must have explicit options');
  assert.equal(plugin[1].neverForLocation, true);
  assert.equal(plugin[1].companionDeviceEnabled, false);
  assert.equal(plugin[1].isBleRequired, false);
  assert.equal(plugin[1].bluetoothAlwaysPermission, '允许 DOSO 扫描并连接附近蓝牙设备');

  const locationPlugin = config.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-location');
  assert.ok(locationPlugin, 'expo-location config must be explicit');
  assert.equal(locationPlugin[1].locationAlwaysAndWhenInUsePermission, false);
  assert.equal(locationPlugin[1].locationAlwaysPermission, false);
  assert.equal(locationPlugin[1].locationWhenInUsePermission, false);
  assert.equal(locationPlugin[1].motionUsagePermission, false);
  assert.ok(config.expo.plugins.includes('./plugins/withLegacyBleLocationPermissions'));

  const eas = JSON.parse(easConfig);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, 'internal');
});

console.log(`BLE discovery verification passed: ${passed}/${passed}`);

async function check(name: string, run: () => void | Promise<void>) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

function source(relativePath: string) {
  return readFile(path.join(appRoot, relativePath), 'utf8');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createFakeBleRuntime() {
  let discoverListener = () => {};
  let stopListener = () => {};
  let resolveReady;
  let scanning = false;
  const state = {
    removedSubscriptions: 0,
    stopCalls: 0,
  };
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const runtime = {
    onDiscover(listener) {
      discoverListener = listener;
      return { remove() { state.removedSubscriptions += 1; discoverListener = () => {}; } };
    },
    onStop(listener) {
      stopListener = listener;
      return { remove() { state.removedSubscriptions += 1; stopListener = () => {}; } };
    },
    async scan() {
      scanning = true;
      resolveReady();
    },
    async isScanning() {
      return scanning;
    },
    async stopScan() {
      state.stopCalls += 1;
      scanning = false;
    },
  };
  return {
    runtime,
    ready,
    discover(peripheral) { discoverListener(peripheral); },
    stop(status) { scanning = false; stopListener({ status }); },
    get removedSubscriptions() { return state.removedSubscriptions; },
    get stopCalls() { return state.stopCalls; },
  };
}
