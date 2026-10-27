import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import { validateOidcDiscovery, validateOidcJwks } from './authing-oidc-verifier-core.mjs';

let assertions = 0;
function check(run) {
  run();
  assertions += 1;
}

const issuer = 'https://tenant.authing.example';
const validDiscovery = {
  issuer,
  authorization_endpoint: `${issuer}/oidc/auth`,
  token_endpoint: `${issuer}/oidc/token`,
  jwks_uri: `${issuer}/oidc/jwks`,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['openid', 'profile'],
  id_token_signing_alg_values_supported: ['RS256'],
};

check(() => assert.deepEqual(validateOidcDiscovery(validDiscovery, issuer), {
  issuer,
  authorizationEndpoint: `${issuer}/oidc/auth`,
  tokenEndpoint: `${issuer}/oidc/token`,
  jwksUri: `${issuer}/oidc/jwks`,
}));

for (const field of [
  'response_types_supported',
  'code_challenge_methods_supported',
  'scopes_supported',
  'id_token_signing_alg_values_supported',
]) {
  check(() => assert.throws(
    () => validateOidcDiscovery({ ...validDiscovery, [field]: String(validDiscovery[field]) }, issuer),
    /must be an array containing/,
  ));
}
check(() => assert.throws(
  () => validateOidcDiscovery({ ...validDiscovery, issuer: 'https://attacker.example' }, issuer),
  /issuer must match discovery/,
));
check(() => assert.throws(
  () => validateOidcDiscovery({ ...validDiscovery, issuer: 'https://user:pass@tenant.authing.example' }, issuer),
  /must not contain credentials/,
));
check(() => assert.throws(
  () => validateOidcDiscovery({ ...validDiscovery, token_endpoint: 'https://user:pass@tenant.authing.example/token' }, issuer),
  /must not contain credentials/,
));

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const validJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'authing-rs256-1',
  alg: 'RS256',
  use: 'sig',
  key_ops: ['verify'],
};
const leakedPrivateJwk = {
  ...privateKey.export({ format: 'jwk' }),
  kid: 'leaked-private-key',
  alg: 'RS256',
  use: 'sig',
  key_ops: ['verify'],
};
check(() => assert.deepEqual(validateOidcJwks({ keys: [validJwk] }), ['authing-rs256-1']));
check(() => assert.throws(
  () => validateOidcJwks({ keys: [leakedPrivateJwk] }),
  /exposes RSA private key material/,
));
check(() => assert.throws(
  () => validateOidcJwks({ keys: [validJwk, leakedPrivateJwk] }),
  /exposes RSA private key material/,
));
check(() => assert.throws(
  () => validateOidcJwks({ keys: [validJwk, { ...validJwk }] }),
  /duplicate usable signing key IDs/,
));
check(() => assert.throws(() => validateOidcJwks({ keys: 'not-an-array' }), /keys must be an array/));
check(() => assert.throws(
  () => validateOidcJwks({ keys: [{ kid: 'stub', kty: 'RSA', alg: 'RS256' }] }),
  /parseable >=2048-bit/,
));
for (const mutation of [
  { alg: 'RS512' },
  { use: 'enc' },
  { key_ops: ['sign'] },
  { key_ops: 'verify' },
  { kid: '' },
]) {
  check(() => assert.throws(
    () => validateOidcJwks({ keys: [{ ...validJwk, ...mutation }] }),
    /parseable >=2048-bit/,
  ));
}

const { publicKey: weakPublicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
check(() => assert.throws(
  () => validateOidcJwks({
    keys: [{
      ...weakPublicKey.export({ format: 'jwk' }),
      kid: 'weak',
      alg: 'RS256',
      use: 'sig',
      key_ops: ['verify'],
    }],
  }),
  /parseable >=2048-bit/,
));

console.log(`DOSO Authing OIDC verifier behavior PASS (${assertions}/${assertions} assertions; no network or secrets)`);
