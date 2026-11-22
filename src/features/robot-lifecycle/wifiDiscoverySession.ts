import {
  matchRobotHotspot,
  normalizeSsid,
  ROBOT_HOTSPOT_HOST,
  ROBOT_HOTSPOT_PORT,
  sortRobotHotspots,
  type RobotHotspotRule,
} from './robotHotspotRules';

export type WifiPlatformKind = 'android-scan' | 'ios-current' | 'unsupported';

export type WifiDiscoveryErrorCode =
  | 'unsupported'
  | 'unavailable'
  | 'permission_denied'
  | 'permission_blocked'
  | 'location_off'
  | 'wifi_off'
  | 'scan_failed'
  | 'discovery_failed'
  | 'join_failed';

const ERROR_CODES = new Set<WifiDiscoveryErrorCode>([
  'unsupported',
  'unavailable',
  'permission_denied',
  'permission_blocked',
  'location_off',
  'wifi_off',
  'scan_failed',
  'discovery_failed',
  'join_failed',
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

export type AndroidWifiScanPermission =
  | 'android.permission.ACCESS_FINE_LOCATION'
  | 'android.permission.ACCESS_COARSE_LOCATION';

/**
 * Android WifiManager.startScan(), getScanResults(), and unredacted WifiInfo.ssid
 * require ACCESS_FINE_LOCATION across all API levels, including Android 13+ (API 33+).
 */
export function androidWifiScanPermission(_apiLevel?: number): 'android.permission.ACCESS_FINE_LOCATION' {
  return 'android.permission.ACCESS_FINE_LOCATION';
}

/**
 * On Android 12+ (API 31+, targetSdk >= 31), PermissionController ignores requests
 * for ACCESS_FINE_LOCATION unless ACCESS_COARSE_LOCATION is requested alongside it.
 */
export function androidWifiScanPermissions(apiLevel: number): readonly AndroidWifiScanPermission[] {
  if (apiLevel >= 31) {
    return [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ];
  }
  return ['android.permission.ACCESS_FINE_LOCATION'];
}

export type RawLanRobot = Readonly<{
  host?: unknown;
  port?: unknown;
  serviceName?: unknown;
  robotId?: unknown;
  displayName?: unknown;
  apSsid?: unknown;
  videoPort?: unknown;
  transport?: unknown;
}>;

export type DiscoveredLanRobot = Readonly<{
  host: string;
  port: number;
  serviceName: string | null;
  robotId: string | null;
  displayName: string;
  apSsid: string | null;
  videoPort: number | null;
  transport: 'lan-dev' | 'tls' | null;
}>;

export type LanDiscoveryPayload = Readonly<{
  robots: readonly DiscoveredLanRobot[];
  timedOut: boolean;
}>;

export const DEFAULT_LAN_DISCOVERY_TIMEOUT_MS = 3000;
const MIN_LAN_DISCOVERY_TIMEOUT_MS = 1500;
const MAX_LAN_DISCOVERY_TIMEOUT_MS = 6000;

export function clampLanDiscoveryTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) return DEFAULT_LAN_DISCOVERY_TIMEOUT_MS;
  return Math.max(MIN_LAN_DISCOVERY_TIMEOUT_MS, Math.min(MAX_LAN_DISCOVERY_TIMEOUT_MS, Math.round(timeoutMs)));
}

const STRICT_IPV4_PATTERN = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const STRICT_PORT_PATTERN = /^[1-9]\d{0,4}$/;
const UNSAFE_TEXT_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

/** Strict private RFC1918 IPv4 only (10.x, 172.16-31.x, 192.168.x); rejects leading zeros, loopback, link-local, public IPs, and hostnames. */
export function isPrivateIpv4(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed !== value) return false;
  const match = STRICT_IPV4_PATTERN.exec(trimmed);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const c = Number(match[3]);
  const d = Number(match[4]);
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function parseValidPort(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1 || value > 65535) return null;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!STRICT_PORT_PATTERN.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return parsed >= 1 && parsed <= 65535 ? parsed : null;
  }
  return null;
}

function sanitizeBoundedText(value: unknown, maxLength = 64): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(UNSAFE_TEXT_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() || null : cleaned;
}

function sanitizeTransport(value: unknown): 'lan-dev' | 'tls' | null {
  if (value === 'lan-dev' || value === 'tls') return value;
  return null;
}

export function sanitizeLanRobot(value: unknown): DiscoveredLanRobot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as RawLanRobot;
  const rawHost = typeof raw.host === 'string' ? raw.host.trim() : '';
  if (!isPrivateIpv4(rawHost)) return null;
  const port = parseValidPort(raw.port);
  if (port === null) return null;

  const serviceName = sanitizeBoundedText(raw.serviceName, 64);
  const robotId = sanitizeBoundedText(raw.robotId, 64);
  const explicitDisplayName = sanitizeBoundedText(raw.displayName, 64);
  const rawApSsid = sanitizeBoundedText(raw.apSsid, 32);
  const apSsid = normalizeSsid(rawApSsid);
  const videoPort = parseValidPort(raw.videoPort);
  const transport = sanitizeTransport(raw.transport);
  const displayName = explicitDisplayName ?? robotId ?? serviceName ?? rawHost;

  return Object.freeze({
    host: rawHost,
    port,
    serviceName,
    robotId,
    displayName,
    apSsid,
    videoPort,
    transport,
  });
}

function mergeLanRobot(existing: DiscoveredLanRobot, incoming: DiscoveredLanRobot): DiscoveredLanRobot {
  const displayName = existing.displayName !== existing.host
    ? existing.displayName
    : incoming.displayName;
  return Object.freeze({
    host: existing.host,
    port: existing.port,
    serviceName: existing.serviceName ?? incoming.serviceName,
    robotId: existing.robotId ?? incoming.robotId,
    displayName,
    apSsid: existing.apSsid ?? incoming.apSsid,
    videoPort: existing.videoPort ?? incoming.videoPort,
    transport: existing.transport ?? incoming.transport,
  });
}

function compareAscii(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

export function sameLanEndpoint(host: string, port: string, robot: Pick<DiscoveredLanRobot, 'host' | 'port'>): boolean {
  return host.trim().toLowerCase() === robot.host && port.trim() === String(robot.port);
}

/** Deterministic sort: matching current host (exact host:port first, then host) first, then displayName, then host, then port. */
export function sortLanRobots(
  robots: readonly DiscoveredLanRobot[],
  currentHost?: string | null,
  currentPort?: string | null,
): readonly DiscoveredLanRobot[] {
  const normalizedHost = typeof currentHost === 'string' ? currentHost.trim().toLowerCase() : '';
  const normalizedPort = typeof currentPort === 'string' ? currentPort.trim() : '';
  const rank = (robot: DiscoveredLanRobot): number => {
    if (normalizedHost && robot.host === normalizedHost) {
      return normalizedPort && String(robot.port) === normalizedPort ? 0 : 1;
    }
    return 2;
  };
  return [...robots].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const nameDiff = compareAscii(a.displayName, b.displayName);
    if (nameDiff !== 0) return nameDiff;
    const hostDiff = compareAscii(a.host, b.host);
    if (hostDiff !== 0) return hostDiff;
    return a.port - b.port;
  });
}

export function sanitizeLanDiscoveryPayload(
  value: unknown,
  currentHost?: string | null,
  currentPort?: string | null,
): LanDiscoveryPayload {
  if (!value || typeof value !== 'object') return { robots: [], timedOut: false };
  const record = value as Record<string, unknown>;
  const rawList = Array.isArray(record.robots) ? record.robots : [];
  const byEndpoint = new Map<string, DiscoveredLanRobot>();
  for (const item of rawList) {
    const robot = sanitizeLanRobot(item);
    if (!robot) continue;
    const key = `${robot.host}:${robot.port}`;
    const existing = byEndpoint.get(key);
    byEndpoint.set(key, existing ? mergeLanRobot(existing, robot) : robot);
  }
  return {
    robots: sortLanRobots([...byEndpoint.values()], currentHost, currentPort),
    timedOut: record.timedOut === true,
  };
}

export type HotspotSighting = Readonly<{
  matches: readonly RobotHotspotRule[];
  currentSsid: string | null;
  unrelatedCurrent: boolean;
  otherCount: number;
  apply: RobotHotspotRule | null;
}>;

function sightingFrom(matches: readonly RobotHotspotRule[], currentSsid: string | null, otherCount: number): HotspotSighting {
  const sorted = sortRobotHotspots(matches, currentSsid);
  const currentRule = matchRobotHotspot(currentSsid);
  const apply = sorted.length === 1
    ? sorted[0]
    : sorted.length > 1 && currentRule
      ? sorted.find(rule => rule.ssid === currentRule.ssid) ?? null
      : null;
  return {
    matches: sorted,
    currentSsid,
    unrelatedCurrent: Boolean(currentSsid) && !currentRule,
    otherCount,
    apply,
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

export type ReconciledDiscovery = Readonly<{
  sighting: HotspotSighting;
  lanRobots: readonly DiscoveredLanRobot[];
  hotspotMetadata: Readonly<Record<string, DiscoveredLanRobot>>;
}>;

/**
 * Prevent duplicate 192.168.50.1:13145 cards when the phone is on a robot AP
 * hotspot and LAN discovery also resolves the same AP endpoint. Metadata is
 * merged onto the matching hotspot card while distinct LAN IPs remain separate.
 */
export function reconcileDiscoveryResults(
  sighting: HotspotSighting,
  lanRobots: readonly DiscoveredLanRobot[],
  currentHost?: string | null,
  currentPort?: string | null,
): ReconciledDiscovery {
  const sortedLan = sortLanRobots(lanRobots, currentHost, currentPort);
  const currentRule = matchRobotHotspot(sighting.currentSsid);
  const hotspotMetadata: Record<string, DiscoveredLanRobot> = {};
  const remainingLan: DiscoveredLanRobot[] = [];

  for (const robot of sortedLan) {
    const isApEndpoint = robot.host === ROBOT_HOTSPOT_HOST && robot.port === ROBOT_HOTSPOT_PORT;
    if (currentRule && robot.host === currentRule.host && robot.port === currentRule.port) {
      if (!hotspotMetadata[currentRule.ssid]) hotspotMetadata[currentRule.ssid] = robot;
      continue;
    }
    if (isApEndpoint) {
      const matchedByAp = robot.apSsid
        ? sighting.matches.find(rule => rule.ssid === robot.apSsid)
        : undefined;
      const targetRule = matchedByAp ?? (sighting.matches.length === 1 ? sighting.matches[0] : undefined);
      if (targetRule) {
        if (!hotspotMetadata[targetRule.ssid]) hotspotMetadata[targetRule.ssid] = robot;
        continue;
      }
    }
    remainingLan.push(robot);
  }

  return {
    sighting,
    lanRobots: remainingLan,
    hotspotMetadata,
  };
}

/**
 * Permission sheets and the system hotspot confirmation report `inactive`.
 * Those must not cancel the attempt that opened them. Leaving the app
 * (`background`, and any other non-visible state) still stops it.
 */
export function shouldInterruptWifiDiscoveryForAppState(state: string): boolean {
  return state !== 'active' && state !== 'inactive';
}

export function isWifiJoinResult(value: unknown): value is WifiJoinResult {
  return value === 'joined' || value === 'already' || value === 'cancelled';
}

export type WifiDiscoveryAdapter = Readonly<{
  platform: WifiPlatformKind;
  canJoinKnownHotspot: boolean;
  canDiscoverLan?: boolean;
  scan(): Promise<WifiScanPayload>;
  currentSsid(): Promise<string | null>;
  discoverLanRobots?(timeoutMs?: number): Promise<LanDiscoveryPayload>;
  stopLanDiscovery?(): Promise<void>;
  joinKnownHotspot(ssid: string): Promise<WifiJoinResult>;
  releaseJoinedNetwork(): Promise<void>;
}>;
