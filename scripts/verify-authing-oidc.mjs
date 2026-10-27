import assert from 'node:assert/strict';

import { validateOidcDiscovery, validateOidcJwks } from './authing-oidc-verifier-core.mjs';

const issuers = [
  ['wechat', process.env.AUTHING_WECHAT_ISSUER],
  ['qq', process.env.AUTHING_QQ_ISSUER],
];

async function readJson(url, label) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  assert.ok(response.ok, `${label} returned HTTP ${response.status}`);
  return response.json();
}

for (const [provider, rawIssuer] of issuers) {
  assert.ok(rawIssuer, `AUTHING_${provider.toUpperCase()}_ISSUER is required`);
  const issuer = new URL(rawIssuer);
  assert.equal(issuer.protocol, 'https:', `${provider} issuer must use HTTPS`);
  assert.equal(issuer.search, '', `${provider} issuer must not contain a query`);
  assert.equal(issuer.hash, '', `${provider} issuer must not contain a fragment`);
  const canonicalIssuer = issuer.toString().replace(/\/$/, '');
  const discovery = await readJson(`${canonicalIssuer}/.well-known/openid-configuration`, `${provider} discovery`);

  const validated = validateOidcDiscovery(discovery, canonicalIssuer, provider);
  const jwks = await readJson(validated.jwksUri, `${provider} JWKS`);
  validateOidcJwks(jwks, provider);
  console.log(`${provider} Authing OIDC discovery/JWKS PASS`);
}
