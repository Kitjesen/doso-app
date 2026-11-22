import { requireOptionalNativeModule } from 'expo';

import { matchRobotHotspot } from './robotHotspotRules';
import {
  isWifiJoinResult,
  WifiDiscoveryError,
  wifiErrorFromUnknown,
  type WifiDiscoveryAdapter,
  type WifiJoinResult,
} from './wifiDiscoverySession';

type NativeRobotWifi = {
  readCurrentSsid(): Promise<unknown>;
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

function requireNative(module: NativeRobotWifi | null): NativeRobotWifi {
  if (!module) throw new WifiDiscoveryError('unavailable');
  return module;
}

export function createIosWifiDiscoveryAdapter(module: NativeRobotWifi | null = nativeModule): WifiDiscoveryAdapter {
  return {
    platform: 'ios-current',
    canJoinKnownHotspot: true,
    async scan() {
      // iOS does not provide a public API that lists nearby SSIDs. Callers must
      // read the current network or ask to join a known hotspot instead.
      throw new WifiDiscoveryError('unsupported');
    },
    async currentSsid() {
      const native = requireNative(module);
      try {
        const value = await native.readCurrentSsid();
        return typeof value === 'string' ? value : null;
      } catch (error) {
        throw wifiErrorFromUnknown(error, 'scan_failed');
      }
    },
    async joinKnownHotspot(ssid: string): Promise<WifiJoinResult> {
      if (!matchRobotHotspot(ssid)) throw new WifiDiscoveryError('join_failed');
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
      try { await module.releaseJoinedNetwork(); } catch { /* leaving the hotspot is best-effort */ }
    },
  };
}

export const wifiDiscoveryAdapter = createIosWifiDiscoveryAdapter();
