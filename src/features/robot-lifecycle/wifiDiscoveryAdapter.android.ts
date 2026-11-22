import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

import { matchRobotHotspot } from './robotHotspotRules';
import {
  androidWifiScanPermission,
  androidWifiScanPermissions,
  clampLanDiscoveryTimeout,
  isWifiJoinResult,
  sanitizeLanDiscoveryPayload,
  sanitizeWifiScanPayload,
  wifiErrorFromUnknown,
  WifiDiscoveryError,
  type LanDiscoveryPayload,
  type WifiDiscoveryAdapter,
  type WifiJoinResult,
} from './wifiDiscoverySession';

type NativeRobotWifi = {
  scanSsids(): Promise<unknown>;
  currentSsid(): Promise<unknown>;
  joinKnownSsid(ssid: string): Promise<unknown>;
  releaseJoinedNetwork(): Promise<void>;
  discoverLanRobots?: (timeoutMs?: number) => Promise<unknown>;
  stopLanDiscovery?: () => Promise<void>;
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
  const primary = androidWifiScanPermission(apiLevel);
  const granted = await PermissionsAndroid.check(primary);
  if (granted) return;
  const requested = androidWifiScanPermissions(apiLevel);
  const result = requested.length > 1
    ? (await PermissionsAndroid.requestMultiple([...requested]))[primary]
    : await PermissionsAndroid.request(primary);
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
  const hasLanDiscovery = typeof module?.discoverLanRobots === 'function';
  return {
    platform: 'android-scan',
    canJoinKnownHotspot: true,
    canDiscoverLan: hasLanDiscovery,
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
    async discoverLanRobots(timeoutMs?: number): Promise<LanDiscoveryPayload> {
      if (!module || typeof module.discoverLanRobots !== 'function') {
        return { robots: [], timedOut: false };
      }
      try {
        const payload = await module.discoverLanRobots(clampLanDiscoveryTimeout(timeoutMs));
        return sanitizeLanDiscoveryPayload(payload);
      } catch (error) {
        throw wifiErrorFromUnknown(error, 'discovery_failed');
      }
    },
    async stopLanDiscovery() {
      if (!module || typeof module.stopLanDiscovery !== 'function') return;
      try {
        await module.stopLanDiscovery();
      } catch {
        /* stopping LAN discovery is best-effort */
      }
    },
    async joinKnownHotspot(ssid: string): Promise<WifiJoinResult> {
      const matched = matchRobotHotspot(ssid);
      if (!matched) throw new WifiDiscoveryError('join_failed');
      await requestPermission();
      const native = requireNative(module);
      try {
        const result = await native.joinKnownSsid(matched.ssid);
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
