// Robot-owned hotspot SSIDs only. A shared lab router — phone and robot on the
// same LAN, for example TopSpeed5GCPE-5525 with a manual address — must not be
// added here. The planned dog hotspot is DOSOrobotics → 192.168.50.1:13145.
// 13145 is the Brainstem gRPC port. Do not point this rule at the web or SDK ports.

export type RobotHotspotRule = Readonly<{
  ssid: string;
  host: string;
  port: number;
  label: string;
}>;

export const ROBOT_HOTSPOT_RULES: readonly RobotHotspotRule[] = Object.freeze([
  Object.freeze({
    ssid: 'DOSOrobotics',
    host: '192.168.50.1',
    port: 13145,
    label: '机器狗热点',
  }),
]);

const UNKNOWN_SSID = new Set(['<unknown ssid>', 'unknown ssid', '0x']);

/** Strip the quotes Android adds and reject placeholders. SSIDs stay case-sensitive. */
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
  return ROBOT_HOTSPOT_RULES.find(rule => rule.ssid === normalized) ?? null;
}

export function sameHotspotEndpoint(host: string, port: string, rule: RobotHotspotRule): boolean {
  return host.trim().toLowerCase() === rule.host && port.trim() === String(rule.port);
}

/**
 * Fill automatically when the address is empty or already this hotspot.
 * A different manual address, such as the lab LAN IP, stays until the user confirms.
 */
export function autoApplyHotspot(host: string, port: string, rule: RobotHotspotRule | null): RobotHotspotRule | null {
  if (!rule) return null;
  const current = host.trim();
  if (!current) return rule;
  if (current.toLowerCase() !== rule.host) return null;
  return sameHotspotEndpoint(host, port, rule) ? null : rule;
}
