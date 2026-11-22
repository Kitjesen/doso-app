import type { BrainstemGrpcEndpoint } from '../../services/brainstemGrpc';

/** A selected navigation origin is usable for video only for the same direct target. */
export function videoTargetKey(owner: string | null, endpoint: BrainstemGrpcEndpoint | null): string | null {
  return owner && endpoint ? JSON.stringify([owner, endpoint.host, endpoint.port, endpoint.transport, endpoint.clientIdentityAlias ?? null]) : null;
}

export function bindVideoOrigin(owner: string | null, endpoint: BrainstemGrpcEndpoint | null, origin: string): string | null {
  const key = videoTargetKey(owner, endpoint);
  if (!key || !endpoint) return null;
  try {
    return new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase() === endpoint.host.replace(/^\[|\]$/g, '').toLowerCase() ? key : null;
  } catch { return null; }
}

/**
 * The LAN robot exposes the read-only WebRTC gateway beside Brainstem.
 * Keep this derivation in one place so a direct connection can also start
 * video without requiring the user to open the navigation setup first.
 */
export function directVideoOrigin(endpoint: BrainstemGrpcEndpoint | null): string | null {
  if (endpoint?.transport !== 'lan-dev') return null;
  const host = endpoint.host.trim().replace(/^\[|\]$/g, '');
  if (!host || /[^0-9a-f:.]/i.test(host)) return null;
  return host.includes(':') ? `http://[${host}]:5050` : `http://${host}:5050`;
}
