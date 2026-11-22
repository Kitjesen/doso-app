import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

import { matchRobotHotspot } from './robotHotspotRules';
import {
  androidWifiScanPermission,
  isWifiJoinResult,
  sanitizeWifiScanPayload,
  wifiErrorFromUnknown,
  WifiDiscoveryError,
  type WifiDiscoveryAdapter,
  type WifiJoinResult,
} from './wifiDiscoverySession';

type NativeRobotWifi = {
  scanSsids(): Promise<unknown>;
  currentSsid(): Promise<unknown>;
  joinKnownSsid(ssid: string): Promise<unknown>;
  releaseJoinedNetwork(): Promise<void>;
};

function loadNative(): NativeRobotWifi | null {
  try {
    return requireOptionalNativeModule<NativeRobotWifi>('RobotWifi');
  } catch {
    return null;
  }
}

const nativeModule = loadNative();

export async function requestAndroidWifiScanPermission(apiLevel = Number(Platform.Version)): Promise<void> {
  const permission = androidWifiScanPermission(apiLevel);
  const granted = await PermissionsAndroid.check(permission);
  if (granted) return;
  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) throw new WifiDiscoveryError('permission_blocked');
  if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new WifiDiscoveryError('permission_denied');
}

function requireNative(module: NativeRobotWifi | null): NativeRobotWifi {
  if (!module) throw new WifiDiscoveryError('unavailable');
  return module;
}

async function readSsid(module: NativeRobotWifi | null): Promise<string | null> {
  if (!module) return null;
  try {
    const value = await module.currentSsid();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function createAndroidWifiDiscoveryAdapter(options?: {
  requestPermission?: () => Promise<void>;
  nativeModule?: NativeRobotWifi | null;
}): WifiDiscoveryAdapter {
  const requestPermission = options?.requestPermission ?? (() => requestAndroidWifiScanPermission());
  const module = options && 'nativeModule' in options ? options.nativeModule ?? null : nativeModule;
  return {
    platform: 'android-scan',
    canJoinKnownHotspot: true,
    async scan() {
      await requestPermission();
      const native = requireNative(module);
      try {
        return sanitizeWifiScanPayload(await native.scanSsids());
      } catch (error) {
        throw wifiErrorFromUnknown(error, 'scan_failed');
      }
    },
    currentSsid() {
      return readSsid(module);
    },
    async joinKnownHotspot(ssid: string): Promise<WifiJoinResult> {
      if (!matchRobotHotspot(ssid)) throw new WifiDiscoveryError('join_failed');
      await requestPermission();
      const native = requireNative(module);
      try {
        const result = await native.joinKnownSsid(ssid);
        if (!isWifiJoinResult(result)) throw new WifiDiscoveryError('join_failed');
        return result;
      } catch (error) {
        throw wifiErrorFromUnknown(error, 'join_failed');
      }
    },
    async releaseJoinedNetwork() {
      if (!module) return;
      try { await module.releaseJoinedNetwork(); } catch { /* restoring the previous network is best-effort */ }
    },
  };
}

export const wifiDiscoveryAdapter = createAndroidWifiDiscoveryAdapter();
