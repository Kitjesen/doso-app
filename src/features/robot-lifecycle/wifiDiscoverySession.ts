import { matchRobotHotspot, type RobotHotspotRule, normalizeSsid } from './robotHotspotRules';

export type WifiPlatformKind = 'android-scan' | 'ios-current' | 'unsupported';

export type WifiDiscoveryErrorCode =
  | 'unsupported'
  | 'unavailable'
  | 'permission_denied'
  | 'permission_blocked'
  | 'location_off'
  | 'wifi_off'
  | 'scan_failed'
  | 'join_failed';

const ERROR_CODES = new Set<WifiDiscoveryErrorCode>([
  'unsupported', 'unavailable', 'permission_denied', 'permission_blocked',
  'location_off', 'wifi_off', 'scan_failed', 'join_failed',
]);

export class WifiDiscoveryError extends Error {
  readonly code: WifiDiscoveryErrorCode;

  constructor(code: WifiDiscoveryErrorCode) {
    super(code);
    this.name = 'WifiDiscoveryError';
    this.code = code;
  }
}

export function wifiErrorFromUnknown(error: unknown, fallback: WifiDiscoveryErrorCode = 'scan_failed'): WifiDiscoveryError {
  if (error instanceof WifiDiscoveryError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (ERROR_CODES.has(code as WifiDiscoveryErrorCode)) return new WifiDiscoveryError(code as WifiDiscoveryErrorCode);
  return new WifiDiscoveryError(fallback);
}

export type WifiJoinResult = 'joined' | 'already' | 'cancelled';

export type WifiScanPayload = Readonly<{
  ssids: readonly string[];
  throttled: boolean;
}>;

/** Keep SSID strings only. Signal strength and other radio fields are discarded. */
export function sanitizeWifiScanPayload(value: unknown): WifiScanPayload {
  if (!value || typeof value !== 'object') return { ssids: [], throttled: false };
  const record = value as Record<string, unknown>;
  const ssids = Array.isArray(record.ssids)
    ? record.ssids.filter((item): item is string => typeof item === 'string')
    : [];
  return { ssids, throttled: record.throttled === true };
}

export function androidWifiScanPermission(apiLevel: number): 'android.permission.NEARBY_WIFI_DEVICES' | 'android.permission.ACCESS_FINE_LOCATION' {
  return apiLevel >= 33 ? 'android.permission.NEARBY_WIFI_DEVICES' : 'android.permission.ACCESS_FINE_LOCATION';
}

export type HotspotSighting = Readonly<{
  matches: readonly RobotHotspotRule[];
  currentSsid: string | null;
  unrelatedCurrent: boolean;
  otherCount: number;
  apply: RobotHotspotRule | null;
}>;

function sightingFrom(matches: readonly RobotHotspotRule[], currentSsid: string | null, otherCount: number): HotspotSighting {
  return {
    matches,
    currentSsid,
    unrelatedCurrent: Boolean(currentSsid) && !matchRobotHotspot(currentSsid),
    otherCount,
    apply: matches.length === 1 ? matches[0] : null,
  };
}

export function interpretAndroidScan(ssids: readonly string[], currentSsid: string | null): HotspotSighting {
  const bySsid = new Map<string, RobotHotspotRule>();
  let otherCount = 0;
  for (const ssid of ssids) {
    const rule = matchRobotHotspot(ssid);
    if (rule) bySsid.set(rule.ssid, rule);
    else if (normalizeSsid(ssid)) otherCount += 1;
  }
  const current = normalizeSsid(currentSsid);
  const currentRule = matchRobotHotspot(current);
  if (currentRule) bySsid.set(currentRule.ssid, currentRule);
  return sightingFrom([...bySsid.values()], current, otherCount);
}

export function interpretCurrentNetwork(currentSsid: string | null): HotspotSighting {
  const current = normalizeSsid(currentSsid);
  const rule = matchRobotHotspot(current);
  return sightingFrom(rule ? [rule] : [], current, 0);
}

export function isWifiJoinResult(value: unknown): value is WifiJoinResult {
  return value === 'joined' || value === 'already' || value === 'cancelled';
}

export type WifiDiscoveryAdapter = Readonly<{
  platform: WifiPlatformKind;
  canJoinKnownHotspot: boolean;
  scan(): Promise<WifiScanPayload>;
  currentSsid(): Promise<string | null>;
  joinKnownHotspot(ssid: string): Promise<WifiJoinResult>;
  releaseJoinedNetwork(): Promise<void>;
}>;
