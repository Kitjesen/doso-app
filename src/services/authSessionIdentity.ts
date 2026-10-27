export type AuthSessionIdentity = Readonly<{
  userId: string;
  sessionId: string;
}>;

export type PublicAuthSession = Readonly<{
  user: Readonly<{ id: string }>;
  access_token: string;
}>;

function decodeBase64Url(value: string) {
  // Hermes does not provide the browser atob global. Decode the bounded JWT
  // payload directly so native and web use the same session identity check.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const content = value.replace(/=+$/, '');
  if (content.length % 4 === 1) return null;
  if (value.includes('=') && value.length % 4 !== 0) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  try {
    const bytes = new Uint8Array(Math.floor(content.length * 6 / 8));
    let pending = 0, bits = 0, offset = 0;
    for (const character of content) {
      pending = (pending << 6) | alphabet.indexOf(character);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[offset++] = (pending >>> bits) & 255;
        pending &= (1 << bits) - 1;
      }
    }
    if (pending !== 0) return null;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseAuthSessionId(accessToken: string | null | undefined) {
  if (!accessToken || accessToken.length > 32_768) return null;
  const segments = accessToken.split('.');
  if (segments.length !== 3 || !segments[1]) return null;
  const payload = decodeBase64Url(segments[1]);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as { session_id?: unknown };
    return isUuid(parsed.session_id) ? parsed.session_id : null;
  } catch {
    return null;
  }
}

export function readAuthSessionIdentity(session: PublicAuthSession | null): AuthSessionIdentity | null {
  if (!session || !isUuid(session.user?.id)) return null;
  const sessionId = parseAuthSessionId(session.access_token);
  return sessionId ? { userId: session.user.id, sessionId } : null;
}
