import { createHash, createHmac, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function generateShadowKeys() {
  const jwtSecret = randomBytes(30).toString('base64');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = randomUUID();
  const issued = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  function token(role, asymmetric) {
    const header = asymmetric ? { alg: 'ES256', typ: 'JWT', kid } : { alg: 'HS256', typ: 'JWT' };
    const data = `${encode(header)}.${encode({ role, iss: 'supabase', iat: issued, exp: issued + 5 * 365 * 24 * 3600 })}`;
    const signature = asymmetric
      ? sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' })
      : createHmac('sha256', jwtSecret).update(data).digest();
    const valid = asymmetric
      ? verify('sha256', Buffer.from(data), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, signature)
      : createHmac('sha256', jwtSecret).update(data).digest().equals(signature);
    if (!valid || signature.length !== (asymmetric ? 64 : 32)) throw new Error('generated_signature_invalid');
    return `${data}.${signature.toString('base64url')}`;
  }
  function opaque(prefix) {
    const value = prefix + randomBytes(17).toString('base64url').slice(0, 22);
    return `${value}_${createHash('sha256').update(`supabase-self-hosted|${value}`).digest('base64url').slice(0, 8)}`;
  }
  const oct = { kty: 'oct', k: Buffer.from(jwtSecret, 'utf8').toString('base64url'), alg: 'HS256' };
  const ec = { kty: 'EC', kid, use: 'sig', alg: 'ES256', ext: true, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y };
  return {
    JWT_SECRET: jwtSecret,
    ANON_KEY: token('anon', false), SERVICE_ROLE_KEY: token('service_role', false),
    SUPABASE_PUBLISHABLE_KEY: opaque('sb_publishable_'), SUPABASE_SECRET_KEY: opaque('sb_secret_'),
    ANON_KEY_ASYMMETRIC: token('anon', true), SERVICE_ROLE_KEY_ASYMMETRIC: token('service_role', true),
    JWT_KEYS: JSON.stringify([{ ...ec, key_ops: ['sign', 'verify'], d: privateJwk.d }, oct]),
    JWT_JWKS: JSON.stringify({ keys: [{ ...ec, key_ops: ['verify'] }, oct] }),
    SECRET_KEY_BASE: randomBytes(48).toString('base64'), REALTIME_DB_ENC_KEY: randomBytes(8).toString('hex'),
    VAULT_ENC_KEY: randomBytes(16).toString('hex'), PG_META_CRYPTO_KEY: randomBytes(24).toString('base64'),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: randomBytes(24).toString('base64'), LOGFLARE_PRIVATE_ACCESS_TOKEN: randomBytes(24).toString('base64'),
    S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString('hex'), S3_PROTOCOL_ACCESS_KEY_SECRET: randomBytes(32).toString('hex'),
    MINIO_ROOT_PASSWORD: randomBytes(16).toString('hex'), POSTGRES_PASSWORD: randomBytes(16).toString('hex'),
    DASHBOARD_PASSWORD: randomBytes(16).toString('hex'),
  };
}

const direct = process.argv[1] === '-' || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (direct) {
  if (process.argv.length !== 3 || process.argv[2] !== '--private-pipe' || process.stdin.isTTY || process.stdout.isTTY || process.stderr.isTTY) {
    process.stderr.write('DOSO_PRIVATE_PIPE_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      process.stdout.write(JSON.stringify(generateShadowKeys()));
    } catch {
      process.stderr.write('DOSO_KEY_GENERATION_FAILED\n');
      process.exitCode = 1;
    }
  }
}
