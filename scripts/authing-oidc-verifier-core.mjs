import { createPublicKey } from 'node:crypto';

const RSA_PRIVATE_JWK_FIELDS = Object.freeze(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']);

function requireHttpsUrl(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty URL`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  return url.toString();
}

function requireArrayIncludes(document, field, expected, label) {
  const value = document[field];
  if (!Array.isArray(value) || !value.includes(expected)) {
    throw new Error(`${label} ${field} must be an array containing ${expected}`);
  }
}

export function validateOidcDiscovery(discovery, expectedIssuer, label = 'OIDC') {
  if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) {
    throw new Error(`${label} discovery must be an object`);
  }
  const canonicalIssuer = requireHttpsUrl(expectedIssuer, `${label} expected issuer`).replace(/\/$/, '');
  const discoveredIssuer = requireHttpsUrl(discovery.issuer, `${label} issuer`).replace(/\/$/, '');
  if (discoveredIssuer !== canonicalIssuer) throw new Error(`${label} issuer must match discovery`);

  const authorizationEndpoint = requireHttpsUrl(discovery.authorization_endpoint, `${label} authorization_endpoint`);
  const tokenEndpoint = requireHttpsUrl(discovery.token_endpoint, `${label} token_endpoint`);
  const jwksUri = requireHttpsUrl(discovery.jwks_uri, `${label} jwks_uri`);
  requireArrayIncludes(discovery, 'response_types_supported', 'code', label);
  requireArrayIncludes(discovery, 'code_challenge_methods_supported', 'S256', label);
  requireArrayIncludes(discovery, 'scopes_supported', 'openid', label);
  requireArrayIncludes(discovery, 'scopes_supported', 'profile', label);
  requireArrayIncludes(discovery, 'id_token_signing_alg_values_supported', 'RS256', label);

  return { issuer: canonicalIssuer, authorizationEndpoint, tokenEndpoint, jwksUri };
}

function isUsableRs256SigningKey(key) {
  if (!key || typeof key !== 'object' || Array.isArray(key)) return false;
  if (typeof key.kid !== 'string' || !key.kid.trim()) return false;
  if (key.kty !== 'RSA' || key.alg !== 'RS256') return false;
  if (key.use !== undefined && key.use !== 'sig') return false;
  if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) return false;
  if (typeof key.n !== 'string' || !key.n || typeof key.e !== 'string' || !key.e) return false;
  if (RSA_PRIVATE_JWK_FIELDS.some((field) => Object.hasOwn(key, field))) return false;

  try {
    const publicKey = createPublicKey({ key, format: 'jwk' });
    return publicKey.asymmetricKeyType === 'rsa'
      && (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048;
  } catch {
    return false;
  }
}

export function validateOidcJwks(jwks, label = 'OIDC') {
  if (!jwks || typeof jwks !== 'object' || Array.isArray(jwks) || !Array.isArray(jwks.keys)) {
    throw new Error(`${label} JWKS keys must be an array`);
  }
  for (const key of jwks.keys) {
    if (
      key
      && typeof key === 'object'
      && !Array.isArray(key)
      && RSA_PRIVATE_JWK_FIELDS.some((field) => Object.hasOwn(key, field))
    ) {
      throw new Error(`${label} JWKS exposes RSA private key material`);
    }
  }
  const signingKeys = jwks.keys.filter(isUsableRs256SigningKey);
  if (signingKeys.length === 0) {
    throw new Error(`${label} JWKS must expose a parseable >=2048-bit RS256 verification key`);
  }
  const keyIds = signingKeys.map((key) => key.kid);
  if (new Set(keyIds).size !== keyIds.length) {
    throw new Error(`${label} JWKS must not contain duplicate usable signing key IDs`);
  }
  return keyIds;
}
