import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  AUTH_CALLBACK_PATHS,
  AUTH_LINK_ORIGIN,
  SECURITY_HEADERS,
  buildFallbackHtml,
  createAssociationDocuments,
} from './build.mjs';

const sentinel = 'DOSO_QUERY_SENTINEL_7d399c';

function assertNoStatefulOrRedirectHeaders(response, pathname) {
  assert.equal(response.headers.get('set-cookie'), null, `${pathname} must not set cookies`);
  assert.equal(response.headers.get('location'), null, `${pathname} must not redirect`);
}

function normalizeCsp(value) {
  const directives = value.split(';').map((directive) => directive.trim()).filter(Boolean).map((directive) => {
    const [name, ...tokens] = directive.split(/\s+/);
    return `${name.toLowerCase()}${tokens.length ? ` ${tokens.join(' ')}` : ''}`;
  });
  assert.equal(new Set(directives.map((directive) => directive.split(' ', 1)[0])).size, directives.length, 'CSP must not contain duplicate directives');
  return directives.sort().join('; ');
}

function assertSecurityHeaders(response, pathname) {
  for (const [header, expectedValue] of Object.entries(SECURITY_HEADERS)) {
    const actualValue = response.headers.get(header) ?? '';
    if (header === 'Content-Security-Policy') {
      assert.equal(normalizeCsp(actualValue), normalizeCsp(expectedValue), `${pathname} CSP must match the complete reviewed directive set`);
    } else {
      assert.equal(actualValue, expectedValue, `${pathname} ${header} must match the reviewed value exactly`);
    }
  }
}

async function fetchManual(fetchImpl, url) {
  return fetchImpl(url, { redirect: 'manual', cache: 'no-store' });
}

export async function verifyDeployment({ origin, appleTeamId, androidFingerprints, fetchImpl = fetch }) {
  const normalizedOrigin = origin.replace(/\/$/, '');
  const expectedDocuments = createAssociationDocuments({ appleTeamId, androidFingerprints });

  for (const [pathname, expectedDocument] of [
    ['/.well-known/apple-app-site-association', expectedDocuments.apple],
    ['/.well-known/assetlinks.json', expectedDocuments.android],
  ]) {
    const response = await fetchManual(fetchImpl, `${normalizedOrigin}${pathname}`);
    assert.equal(response.status, 200, `${pathname} must return 200 without redirecting`);
    assertNoStatefulOrRedirectHeaders(response, pathname);
    assertSecurityHeaders(response, pathname);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/i, `${pathname} must be JSON`);
    assert.deepEqual(JSON.parse(await response.text()), expectedDocument, `${pathname} must match the supplied production identity exactly`);
  }

  for (const pathname of AUTH_CALLBACK_PATHS) {
    for (const suffix of ['', `?code=${sentinel}&state=${sentinel}`]) {
      const response = await fetchManual(fetchImpl, `${normalizedOrigin}${pathname}${suffix}`);
      assert.equal(response.status, 200, `${pathname} must return 200 without redirecting`);
      assertNoStatefulOrRedirectHeaders(response, pathname);
      assertSecurityHeaders(response, pathname);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i, `${pathname} must be HTML`);
      const body = await response.text();
      assert.equal(body, buildFallbackHtml(pathname), `${pathname} must match the reviewed generated fallback exactly`);
      assert.doesNotMatch(body, new RegExp(sentinel), `${pathname} must not reflect callback query values`);
    }
  }

  for (const pathname of ['/auth/callback/', '/auth/reset-password/', `/auth/${sentinel}`]) {
    const response = await fetchManual(fetchImpl, `${normalizedOrigin}${pathname}`);
    assert.equal(response.status, 404, `${pathname} must fail with 404`);
    assertNoStatefulOrRedirectHeaders(response, pathname);
  }
}

async function runCli() {
  const requestedOrigin = (process.argv[2] ?? '').replace(/\/$/, '');
  if (requestedOrigin !== AUTH_LINK_ORIGIN) throw new Error(`Usage: node verify-deployment.mjs ${AUTH_LINK_ORIGIN}`);
  await verifyDeployment({
    origin: requestedOrigin,
    appleTeamId: process.env.DOSO_APPLE_TEAM_ID,
    androidFingerprints: process.env.DOSO_ANDROID_APP_LINK_FINGERPRINTS,
  });
  console.log('DOSO auth link production deployment PASS');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await runCli();
