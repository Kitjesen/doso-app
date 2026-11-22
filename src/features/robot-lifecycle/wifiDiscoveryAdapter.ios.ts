import { requireOptionalNativeModule } from 'expo';

import { matchRobotHotspot } from './robotHotspotRules';
import {
  clampLanDiscoveryTimeout,
  isWifiJoinResult,
  sanitizeLanDiscoveryPayload,
  WifiDiscoveryError,
  wifiErrorFromUnknown,
  type LanDiscoveryPayload,
  type WifiDiscoveryAdapter,
  type WifiJoinResult,
} from './wifiDiscoverySession';

type NativeRobotWifi = {
  readCurrentSsid(): Promise<unknown>;
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

function requireNative(module: NativeRobotWifi | null): NativeRobotWifi {
  if (!module) throw new WifiDiscoveryError('unavailable');
  return module;
}

export function createIosWifiDiscoveryAdapter(module: NativeRobotWifi | null = nativeModule): WifiDiscoveryAdapter {
  const hasLanDiscovery = typeof module?.discoverLanRobots === 'function';
  return {
    platform: 'ios-current',
    canJoinKnownHotspot: true,
    canDiscoverLan: hasLanDiscovery,
    async scan() {
      // iOS does not provide a public API that lists nearby SSIDs.
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
      try { await module.releaseJoinedNetwork(); } catch { /* leaving the hotspot is best-effort */ }
    },
  };
}

export const wifiDiscoveryAdapter = createIosWifiDiscoveryAdapter();
