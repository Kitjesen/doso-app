import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes, sign, verify } from 'node:crypto';

export const MAX_MESSAGE_BYTES = 4096;
export const GATT_PLAN = Object.freeze({
  service: 'bc8d1000-7c0e-4a4e-a5d4-60f8cbdc0001',
  info: 'bc8d1001-7c0e-4a4e-a5d4-60f8cbdc0001',
  session: 'bc8d1002-7c0e-4a4e-a5d4-60f8cbdc0001',
  data: 'bc8d1003-7c0e-4a4e-a5d4-60f8cbdc0001',
});
export class ProtocolError extends Error {
  constructor(code) { super(code); this.name = 'ProtocolError'; this.code = code; }
}
export class NetworkError extends Error {
  constructor(code) { super(code); this.name = 'NetworkError'; this.code = code; }
}
export function requireThat(condition, code) { if (!condition) throw new ProtocolError(code); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  requireThat(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value), 'message_invalid');
  return JSON.stringify(value);
}
export const bytes = value => Buffer.from(canonical(value), 'utf8');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const signed = (body, key) => ({ body, signature: sign(null, bytes(body), key).toString('base64url') });
export function verified(message, key) {
  requireThat(message && typeof message.signature === 'string' && message.signature.length <= 128, 'signature_invalid');
  requireThat(verify(null, bytes(message.body), key, Buffer.from(message.signature, 'base64url')), 'signature_invalid');
  return message.body;
}
export function ephemeral() {
  const key = createECDH('prime256v1'); key.generateKeys();
  return { publicKey: key.getPublicKey().toString('base64url'), secret: peer => key.computeSecret(Buffer.from(peer, 'base64url')) };
}
export const nonce = () => randomBytes(16).toString('base64url');
function decode(data) {
  requireThat(data.length > 0 && data.length <= MAX_MESSAGE_BYTES, 'message_length');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new ProtocolError('message_invalid'); }
}
export function frameMessage(data, attMtu = 23) {
  requireThat(Number.isInteger(attMtu) && attMtu >= 23 && attMtu <= 247, 'mtu_invalid');
  const input = Buffer.isBuffer(data) ? data : bytes(data);
  requireThat(input.length > 0 && input.length <= MAX_MESSAGE_BYTES, 'message_length');
  const payload = attMtu - 3, chunk = payload - 7, count = Math.ceil(input.length / chunk);
  return Array.from({ length: count }, (_, i) => {
    const body = input.subarray(i * chunk, (i + 1) * chunk), frame = Buffer.alloc(7 + body.length);
    frame[0] = 1; frame.writeUInt16BE(i, 1); frame.writeUInt16BE(count, 3); frame.writeUInt16BE(input.length, 5);
    body.copy(frame, 7); return frame;
  });
}
export function reassembler({ attMtu = 23, now, timeoutMs = 3000 }) {
  requireThat(Number.isInteger(attMtu) && attMtu >= 23 && attMtu <= 247, 'mtu_invalid');
  const chunk = attMtu - 10; let parts = [], total = 0, count = 0, deadline = 0;
  const clear = () => { parts = []; total = 0; count = 0; deadline = 0; };
  return {
    clear,
    push(frame) {
      try {
        requireThat(Buffer.isBuffer(frame) && frame.length >= 8 && frame.length <= attMtu - 3 && frame[0] === 1, 'frame_invalid');
        const index = frame.readUInt16BE(1), declaredCount = frame.readUInt16BE(3), length = frame.readUInt16BE(5);
        requireThat(length > 0 && length <= MAX_MESSAGE_BYTES && declaredCount === Math.ceil(length / chunk), 'frame_length');
        requireThat(index === parts.length && index < declaredCount, 'frame_order');
        if (parts.length === 0) { total = length; count = declaredCount; deadline = now() + timeoutMs; }
        requireThat(now() <= deadline && length === total && declaredCount === count, 'frame_expired_or_mixed');
        requireThat(frame.length - 7 === Math.min(chunk, total - index * chunk), 'frame_length');
        parts.push(Buffer.from(frame.subarray(7)));
        if (parts.length !== count) return null;
        const result = decode(Buffer.concat(parts)); clear(); return result;
      } catch (error) { clear(); throw error; }
    },
  };
}
export function transfer(value, options) {
  const receiver = reassembler(options); let result;
  for (const frame of frameMessage(value, options.attMtu)) result = receiver.push(frame);
  requireThat(result !== null && result !== undefined, 'message_incomplete'); return result;
}
export function secureChannel({ sharedSecret, transcript, sessionId, role }) {
  const material = Buffer.from(hkdfSync('sha256', sharedSecret, bytes(transcript), Buffer.from('DOSO BLE SIM v1'), 64));
  const outbound = role === 'client' ? 'c2r' : 'r2c', inbound = role === 'client' ? 'r2c' : 'c2r';
  const keyFor = direction => direction === 'c2r' ? material.subarray(0, 32) : material.subarray(32);
  const iv = (direction, sequence) => { const value = Buffer.alloc(12); value.write(direction, 0, 'ascii'); value.writeBigUInt64BE(BigInt(sequence), 4); return value; };
  const aad = (direction, sequence) => bytes(['DOSO BLE SIM v1', transcript, sessionId, direction, sequence]);
  let sent = 0, received = 0, closed = false;
  const destroy = () => { material.fill(0); closed = true; };
  const decodeCiphertext = (value, limit) => {
    requireThat(typeof value === 'string' && value.length <= limit && /^[A-Za-z0-9_-]+$/.test(value), 'ciphertext_invalid');
    const decoded = Buffer.from(value, 'base64url');
    requireThat(decoded.toString('base64url') === value, 'ciphertext_invalid'); return decoded;
  };
  return {
    destroy,
    seal(value) {
      requireThat(!closed, 'inactive_session');
      const plaintext = bytes(value), sequence = sent + 1;
      requireThat(sequence <= 0xffffffff && plaintext.length <= 2800, 'message_length');
      const cipher = createCipheriv('aes-256-gcm', keyFor(outbound), iv(outbound, sequence), { authTagLength: 16 }); cipher.setAAD(aad(outbound, sequence));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const packet = { version: 1, sessionId, sequence, ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
      requireThat(bytes(packet).length <= MAX_MESSAGE_BYTES, 'message_length'); sent = sequence; return packet;
    },
    open(packet) {
      requireThat(!closed, 'inactive_session');
      try {
        requireThat(packet?.version === 1 && packet.sessionId === sessionId && packet.sequence === received + 1, 'sequence_or_session');
        const ciphertext = decodeCiphertext(packet.ciphertext, 3800), tag = decodeCiphertext(packet.tag, 24);
        requireThat(tag.length === 16 && ciphertext.length > 0 && ciphertext.length <= 2800, 'ciphertext_invalid');
        const decipher = createDecipheriv('aes-256-gcm', keyFor(inbound), iv(inbound, packet.sequence), { authTagLength: 16 });
        decipher.setAAD(aad(inbound, packet.sequence)); decipher.setAuthTag(tag);
        const value = decode(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
        received = packet.sequence; return value;
      } catch (error) { destroy(); throw error instanceof ProtocolError ? error : new ProtocolError('authentication_failed'); }
    },
  };
}
export function validateWifi(ssid, password) {
  requireThat(typeof ssid === 'string' && Buffer.byteLength(ssid, 'utf8') >= 1 && Buffer.byteLength(ssid, 'utf8') <= 32
    && !ssid.includes('\0') && Buffer.from(ssid, 'utf8').toString('utf8') === ssid, 'ssid_invalid');
  requireThat(typeof password === 'string' && (/^[\x20-\x7e]{8,63}$/.test(password) || /^[a-fA-F0-9]{64}$/.test(password)), 'password_invalid');
}
