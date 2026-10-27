import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';
import BleManager, { BleScanMode, BleState, type Peripheral } from 'react-native-ble-manager';

import {
  BleDiscoveryCancelledError,
  BleDiscoveryError,
  type BleDiscoveryAdapter,
  type BleDiscoveryScanOptions,
} from './bleDiscoveryContract';
import {
  candidateFromPeripheral,
  type BleRobotCandidate,
} from './bleDiscoveryModel';
import {
  requiresLegacyAndroidLocationServices,
  runBleDiscoveryScanSession,
  type BleDiscoveryRuntime,
} from './bleDiscoverySession';

const namePrefix = process.env.EXPO_PUBLIC_DOSO_BLE_NAME_PREFIX?.trim() || 'DOSO';
const serviceUuid = process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID?.trim() || null;

let startPromise: Promise<void> | null = null;
let scanGeneration = 0;
let activeScanController: AbortController | null = null;
let activeScanPromise: Promise<BleRobotCandidate[]> | null = null;

function ensureStarted() {
  if (!startPromise) {
    startPromise = BleManager.start({ showAlert: false }).catch((error) => {
      startPromise = null;
      throw error;
    });
  }
  return startPromise;
}

async function requestScanPermission(apiLevel: number) {
  if (apiLevel >= 31) {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const values = permissions.map((permission) => results[permission]);
    if (values.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
      throw new BleDiscoveryError('permission_blocked');
    }
    if (values.some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new BleDiscoveryError('permission_denied');
    }
    return;
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    throw new BleDiscoveryError('permission_blocked');
  }
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new BleDiscoveryError('permission_denied');
  }
}

function ensureCurrentScan(generation: number) {
  if (generation !== scanGeneration) throw new BleDiscoveryCancelledError();
}

function peripheralCandidate(peripheral: Peripheral) {
  return candidateFromPeripheral({
    id: peripheral.id,
    name: peripheral.name ?? peripheral.advertising?.localName,
    rssi: peripheral.rssi,
    serviceUUIDs: peripheral.advertising?.serviceUUIDs ?? [],
  }, { namePrefix, serviceUuid });
}

const nativeRuntime: BleDiscoveryRuntime<Peripheral> = {
  onDiscover: (listener) => BleManager.onDiscoverPeripheral(listener),
  onStop: (listener) => BleManager.onStopScan(listener),
  scan: ({ serviceUUIDs, seconds }) => BleManager.scan({
    serviceUUIDs,
    seconds,
    allowDuplicates: true,
    scanMode: BleScanMode.LowLatency,
  }),
  isScanning: () => BleManager.isScanning(),
  stopScan: () => BleManager.stopScan(),
};

async function stopNativeScan() {
  scanGeneration += 1;
  const controller = activeScanController;
  const pending = activeScanPromise;
  controller?.abort();
  await pending?.catch(() => undefined);
}

async function scan({ seconds = 8, onCandidates }: BleDiscoveryScanOptions): Promise<BleRobotCandidate[]> {
  if (activeScanPromise) await stopNativeScan();
  const generation = ++scanGeneration;
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  await requestScanPermission(apiLevel);
  ensureCurrentScan(generation);

  try {
    await ensureStarted();
    ensureCurrentScan(generation);
    if (requiresLegacyAndroidLocationServices(apiLevel)
      && !await Location.hasServicesEnabledAsync()) {
      throw new BleDiscoveryError('location_off');
    }
    ensureCurrentScan(generation);
    const state = await BleManager.checkState();
    ensureCurrentScan(generation);
    if (state === BleState.Off || state === BleState.TurningOff) throw new BleDiscoveryError('bluetooth_off');
    if (state === BleState.Unauthorized) throw new BleDiscoveryError('permission_denied');
    if (state === BleState.Unsupported) throw new BleDiscoveryError('unsupported');
    if (state !== BleState.On) throw new BleDiscoveryError('scan_failed');

    const controller = new AbortController();
    const pending = runBleDiscoveryScanSession(nativeRuntime, {
      seconds,
      serviceUUIDs: serviceUuid ? [serviceUuid] : [],
      signal: controller.signal,
      onCandidates,
      toCandidate: peripheralCandidate,
    });
    activeScanController = controller;
    activeScanPromise = pending;
    try {
      return await pending;
    } finally {
      if (activeScanPromise === pending) {
        activeScanController = null;
        activeScanPromise = null;
      }
    }
  } catch (error) {
    if (error instanceof BleDiscoveryError || error instanceof BleDiscoveryCancelledError) throw error;
    throw new BleDiscoveryError('scan_failed');
  }
}

export const bleDiscoveryAdapter: BleDiscoveryAdapter = {
  supported: true,
  scan,
  stop: stopNativeScan,
};
