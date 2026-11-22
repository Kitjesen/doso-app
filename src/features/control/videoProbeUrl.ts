// The video probe listens on the robot LAN host, beside the Brainstem port.
// Playback never uses the Brainstem port and never invents another host.
export const VIDEO_PROBE_PORT = 5050;
export const VIDEO_PROBE_STREAM_SRC = 'cam';

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** `http://<brainstem-host>:5050` for a private IPv4 host, otherwise no probe. */
export function videoProbeBaseUrl(host: string | null | undefined): string | null {
  if (typeof host !== 'string') return null;
  const normalized = host.trim().toLowerCase();
  if (!isPrivateIPv4(normalized)) return null;
  return `http://${normalized}:${VIDEO_PROBE_PORT}`;
}

export function isVideoProbeBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === videoProbeBaseUrl(url.hostname)
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}
