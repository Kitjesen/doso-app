import BleManager, { BleState, type Peripheral } from 'react-native-ble-manager';

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
  runBleDiscoveryScanSession,
  type BleDiscoveryRuntime,
} from './bleDiscoverySession';

const namePrefix = process.env.EXPO_PUBLIC_DOSO_BLE_NAME_PREFIX?.trim() || 'DOSO';
const serviceUuid = process.env.EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID?.trim() || null;

type IosBleManager = Pick<typeof BleManager,
  | 'start'
  | 'checkState'
  | 'onDiscoverPeripheral'
  | 'onStopScan'
  | 'scan'
  | 'isScanning'
  | 'stopScan'
>;

export function createIosBleDiscoveryAdapter(manager: IosBleManager): BleDiscoveryAdapter {
  let startPromise: Promise<void> | null = null;
  let scanGeneration = 0;
  let activeScanController: AbortController | null = null;
  let activeScanPromise: Promise<BleRobotCandidate[]> | null = null;

  function ensureStarted() {
    if (!startPromise) {
      // Creating CBCentralManager is what lets iOS present its native Bluetooth
      // permission prompt. This is reached only from the user's explicit scan action.
      startPromise = manager.start({ showAlert: false }).catch((error) => {
        startPromise = null;
        throw error;
      });
    }
    return startPromise;
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
    onDiscover: (listener) => manager.onDiscoverPeripheral(listener),
    onStop: (listener) => manager.onStopScan(listener),
    scan: ({ serviceUUIDs, seconds }) => manager.scan({
      serviceUUIDs,
      seconds,
      allowDuplicates: true,
    }),
    isScanning: () => manager.isScanning(),
    stopScan: () => manager.stopScan(),
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

    try {
      await ensureStarted();
      ensureCurrentScan(generation);
      const state = await manager.checkState();
      ensureCurrentScan(generation);
      if (state === BleState.Off) throw new BleDiscoveryError('bluetooth_off');
      // CoreBluetooth does not expose whether Unauthorized is a first denial or
      // a restriction that cannot be changed in-app, so report the truthful
      // common denominator and let the UI direct the user to Settings.
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

  return {
    supported: true,
    scan,
    stop: stopNativeScan,
  };
}

export const bleDiscoveryAdapter = createIosBleDiscoveryAdapter(BleManager);
