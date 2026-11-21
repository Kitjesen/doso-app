import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, createPublicKey, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateShadowKeys } from './generate-shadow-keys.mjs';

test('official JWT/JWK and opaque-key contracts hold with actual crypto in memory', () => {
  const keys = generateShadowKeys();
  const signing = JSON.parse(keys.JWT_KEYS);
  const jwks = JSON.parse(keys.JWT_JWKS);
  assert.ok(signing.length === 2 && jwks.keys.length === 2, 'jwk_count');
  assert.ok(Array.isArray(signing) && !('d' in jwks.keys[0]) && !!signing[0].d, 'jwk_private_boundary');
  assert.ok(signing[1].k === Buffer.from(keys.JWT_SECRET, 'utf8').toString('base64url'), 'legacy_oct_uses_secret_text');
  const publicKey = createPublicKey({ key: jwks.keys[0], format: 'jwk' });
  for (const [name, role, asymmetric] of [['ANON_KEY', 'anon', false], ['SERVICE_ROLE_KEY', 'service_role', false], ['ANON_KEY_ASYMMETRIC', 'anon', true], ['SERVICE_ROLE_KEY_ASYMMETRIC', 'service_role', true]]) {
    const [head, body, signature] = keys[name].split('.');
    const header = JSON.parse(Buffer.from(head, 'base64url'));
    const payload = JSON.parse(Buffer.from(body, 'base64url'));
    assert.ok(header.alg === (asymmetric ? 'ES256' : 'HS256'), 'jwt_algorithm');
    assert.ok(payload.role === role && payload.iss === 'supabase' && payload.exp - payload.iat === 5 * 365 * 86400, 'jwt_claims');
    const data = Buffer.from(`${head}.${body}`);
    const valid = asymmetric
      ? verify('sha256', data, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))
      : createHmac('sha256', keys.JWT_SECRET).update(data).digest('base64url') === signature;
    assert.ok(valid, 'actual_signature_verification');
    assert.ok(Buffer.from(signature, 'base64url').length === (asymmetric ? 64 : 32), 'signature_format');
  }
  for (const [name, prefix] of [['SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_'], ['SUPABASE_SECRET_KEY', 'sb_secret_']]) {
    const value = keys[name];
    const intermediate = value.slice(0, -9);
    assert.ok(value.startsWith(prefix) && intermediate.length === prefix.length + 22, 'opaque_shape');
    assert.ok(value.slice(-8) === createHash('sha256').update(`supabase-self-hosted|${intermediate}`).digest('base64url').slice(0, 8), 'opaque_checksum');
  }
  for (const [name, bytes, encoding] of [['JWT_SECRET', 30, 'base64'], ['SECRET_KEY_BASE', 48, 'base64'], ['REALTIME_DB_ENC_KEY', 8, 'hex'], ['VAULT_ENC_KEY', 16, 'hex'], ['PG_META_CRYPTO_KEY', 24, 'base64'], ['LOGFLARE_PUBLIC_ACCESS_TOKEN', 24, 'base64'], ['LOGFLARE_PRIVATE_ACCESS_TOKEN', 24, 'base64'], ['S3_PROTOCOL_ACCESS_KEY_ID', 16, 'hex'], ['S3_PROTOCOL_ACCESS_KEY_SECRET', 32, 'hex'], ['MINIO_ROOT_PASSWORD', 16, 'hex'], ['POSTGRES_PASSWORD', 16, 'hex'], ['DASHBOARD_PASSWORD', 16, 'hex']]) {
    assert.ok(Buffer.from(keys[name], encoding).length === bytes, 'random_field_length');
  }
  assert.ok(keys.POSTGRES_PASSWORD !== keys.DASHBOARD_PASSWORD, 'independent_passwords');
});

test('CLI refuses missing pipe consent and only emits key material into explicit captured pipes', () => {
  const source = fileURLToPath(new URL('./generate-shadow-keys.mjs', import.meta.url));
  const refused = spawnSync(process.execPath, [source], { encoding: 'utf8', timeout: 10000 });
  assert.ok(refused.status === 1 && refused.stdout.length === 0 && refused.stderr === 'DOSO_PRIVATE_PIPE_REQUIRED\n', 'unguarded_cli_must_not_emit_keys');
  const accepted = spawnSync(process.execPath, [source, '--private-pipe'], { encoding: 'utf8', timeout: 10000 });
  assert.ok(accepted.status === 0 && accepted.stderr.length === 0, 'private_pipe_generation');
  assert.ok(Object.keys(JSON.parse(accepted.stdout)).length === 20, 'official_record_count');
});
