// Robot-owned hotspot SSIDs only. Shared lab routers (e.g. TopSpeed5GCPE-5525)
// must never match here. Matched hotspots always map to 192.168.50.1:13145.

export type RobotHotspotRule = Readonly<{
  ssid: string;
  host: string;
  port: number;
  label: string;
}>;

export const ROBOT_HOTSPOT_HOST = '192.168.50.1';
export const ROBOT_HOTSPOT_PORT = 13145;
export const LEGACY_ROBOT_HOTSPOT_SSID = 'DOSOrobotics';
export const ROBOT_HOTSPOT_PREFIX_PATTERN = /^DOSO-[A-Za-z0-9_-]{2,24}$/i;

export const ROBOT_HOTSPOT_RULES: readonly RobotHotspotRule[] = Object.freeze([
  Object.freeze({
    ssid: LEGACY_ROBOT_HOTSPOT_SSID,
    host: ROBOT_HOTSPOT_HOST,
    port: ROBOT_HOTSPOT_PORT,
    label: '机器狗热点',
  }),
]);

const UNKNOWN_SSID = new Set(['<unknown ssid>', 'unknown ssid', '0x']);

/** Strip quotes Android adds and reject placeholders. SSIDs stay case-sensitive. */
export function normalizeSsid(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  let ssid = value.trim();
  if (ssid.length >= 2 && ssid.startsWith('"') && ssid.endsWith('"')) ssid = ssid.slice(1, -1).trim();
  if (!ssid || UNKNOWN_SSID.has(ssid.toLowerCase())) return null;
  return ssid;
}

export function matchRobotHotspot(ssid: string | null | undefined): RobotHotspotRule | null {
  const normalized = normalizeSsid(ssid);
  if (!normalized) return null;
  const legacy = ROBOT_HOTSPOT_RULES.find(rule => rule.ssid === normalized);
  if (legacy) return legacy;
  if (ROBOT_HOTSPOT_PREFIX_PATTERN.test(normalized)) {
    const suffix = normalized.slice(5);
    return Object.freeze({
      ssid: normalized,
      host: ROBOT_HOTSPOT_HOST,
      port: ROBOT_HOTSPOT_PORT,
      label: `机器狗 ${suffix}`,
    });
  }
  return null;
}

function compareAscii(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

/** Deterministic sort: currently connected SSID first, then alphabetical by SSID. */
export function sortRobotHotspots(
  rules: readonly RobotHotspotRule[],
  currentSsid: string | null | undefined,
): readonly RobotHotspotRule[] {
  const current = normalizeSsid(currentSsid);
  return [...rules].sort((a, b) => {
    const aCurrent = current !== null && a.ssid === current ? 0 : 1;
    const bCurrent = current !== null && b.ssid === current ? 0 : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    return compareAscii(a.ssid, b.ssid);
  });
}

export function sameHotspotEndpoint(host: string, port: string, rule: RobotHotspotRule): boolean {
  return host.trim().toLowerCase() === rule.host && port.trim() === String(rule.port);
}

/**
 * Fill automatically when the address is empty or already this hotspot.
 * A different manual address, such as a lab LAN IP, stays until the user confirms.
 */
export function autoApplyHotspot(host: string, port: string, rule: RobotHotspotRule | null): RobotHotspotRule | null {
  if (!rule) return null;
  const current = host.trim();
  if (!current) return rule;
  if (current.toLowerCase() !== rule.host) return null;
  return sameHotspotEndpoint(host, port, rule) ? null : rule;
}
