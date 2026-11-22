import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import type { ControlSignalState } from '../features/control/controlOperations';

type WifiModule = { readWifiRssi?: () => Promise<unknown> };
let native: WifiModule | null = null;
try { if (Platform.OS === 'android') native = requireOptionalNativeModule<WifiModule>('DosoBrainstemGrpc'); } catch { /* Older APK: unknown signal. */ }

export function wifiSignalFromRssi(rssi: unknown): ControlSignalState | null {
  if (typeof rssi !== 'number' || !Number.isInteger(rssi) || rssi < -126 || rssi >= 0) return null;
  // Match Android's legacy signal scale: -100 dBm = 0%, -55 dBm = 100%; this is G20-to-AP RSSI.
  return { rssiDbm: rssi, qualityPercent: Math.round(Math.max(0, Math.min(100, (rssi + 100) * 100 / 45))), source: 'controller' };
}

export async function readControllerWifiSignal(): Promise<ControlSignalState | null> {
  if (AppState.currentState !== 'active' || !native?.readWifiRssi) return null;
  try { return wifiSignalFromRssi(await native.readWifiRssi()); } catch { return null; }
}
