import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredTargets, probeBackend, validateEndpoint } from './check-backend-connectivity.mjs';

test('rejects credentials, query, fragment and non-local HTTP', () => {
  for (const value of ['https://u:p@example.com', 'https://example.com/?x=1', 'https://example.com/#x', 'http://example.com']) assert.throws(() => validateEndpoint(value));
  assert.equal(validateEndpoint('http://127.0.0.1:54321/'), 'http://127.0.0.1:54321');
  assert.equal(validateEndpoint('http://[::1]:54321/'), 'http://[::1]:54321');
});
test('uses GET only, rejects redirects, and reports status classes without bodies', async () => {
  const calls = [];
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'public-secret', fetchImpl: async (url, init) => { calls.push({ url, init }); const body = url.endsWith('/health') ? JSON.stringify({ name: 'GoTrue', version: '1' }) : url.endsWith('/settings') ? JSON.stringify({ external: { email: true } }) : JSON.stringify({ code: 'PGRST301' }); return new Response(body, { status: url.includes('/rest/v1/') ? 401 : 200, headers: { 'content-type': 'application/json' } }); } });
  assert.equal(report.ok, false); assert.equal(report.results[2].classification, 'unauthorized'); assert.equal(calls.length, 3); assert.ok(calls.every(({ init }) => init.method === 'GET' && init.redirect === 'error' && init.headers.apikey === 'public-secret'));
  assert.deepEqual(Object.keys(report.results[0]).sort(), ['classification', 'path', 'status']);
  assert.deepEqual(report.validation, { scope: 'anonymous_service_connectivity', publicConnectivity: false, authenticatedDatabase: false, registrationFlow: false });
});
test('does not treat HTML or malformed JSON as ready', async () => {
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl: async () => new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal(report.ready, false); assert.equal(report.results[0].classification, 'invalid_content_type');
});
test('classifies timeout and does not leak error text', async () => {
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'TOPSECRET', timeoutMs: 1, fetchImpl: async (_url, init) => await new Promise((_, reject) => { init.signal.addEventListener('abort', () => { const e = new Error('TOPSECRET response body'); e.name = 'AbortError'; reject(e); }); }) });
  assert.equal(report.results[0].classification, 'timeout'); assert.doesNotMatch(JSON.stringify(report), /TOPSECRET/);
});

test('deadline covers a fetch and response body that ignore abort', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } })]) {
    const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', timeoutMs: 10, fetchImpl });
    assert.ok(report.results.every(result => result.classification === 'timeout'));
  }
});

test('limits real bytes, not just character count', async () => {
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl: async () => new Response('中'.repeat(22000), { headers: { 'content-type': 'application/json' } }) });
  assert.equal(report.results[0].classification, 'response_too_large');
});

test('valid public services pass with a no-data PostgREST identity probe', async () => {
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl: async url => {
    const body = url.endsWith('/health') ? { name: 'GoTrue', version: '1' } : url.endsWith('/settings') ? { external: { email: true } } : { code: 'PGRST205', details: null, hint: null, message: 'missing relation' };
    return new Response(JSON.stringify(body), { status: url.includes('/rest/v1/') ? 404 : 200, headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(report.ready, true);
  assert.equal(report.ok, true);
  assert.match(report.results[2].path, /^\/rest\/v1\/.*\?limit=0$/u);
  assert.notEqual(report.results[2].path, '/rest/v1/');
  assert.deepEqual(report.validation, { scope: 'anonymous_service_connectivity', publicConnectivity: true, authenticatedDatabase: false, registrationFlow: false });
});

test('a name collision returns no rows and is not mistaken for the identity response', async () => {
  const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl: async url => {
    if (url.endsWith('/health')) return Response.json({ name: 'GoTrue', version: '1' });
    if (url.endsWith('/settings')) return Response.json({ external: { email: true } });
    assert.match(url, /\?limit=0$/u);
    return Response.json([]);
  } });
  assert.equal(report.ready, false);
  assert.equal(report.results[2].classification, 'invalid_service_response');
});

test('does not accept an arbitrary 404 as PostgREST readiness', async () => {
  for (const body of [{ code: 'PGRST125' }, { message: 'missing relation' }]) {
    const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl: async url => {
      if (url.endsWith('/health')) return Response.json({ name: 'GoTrue', version: '1' });
      if (url.endsWith('/settings')) return Response.json({ external: { email: true } });
      return Response.json(body, { status: 404 });
    } });
    assert.equal(report.ready, false);
  }
});

test('403, changed URL, redirects and DNS errors never pass', async () => {
  for (const [fetchImpl, classification] of [
    [async () => new Response('denied', { status: 403 }), 'unauthorized'],
    [async () => { const r = new Response('{}'); Object.defineProperty(r, 'url', { value: 'https://other.example' }); return r; }, 'redirect_error'],
    [async () => { const r = new Response('{}'); Object.defineProperty(r, 'redirected', { value: true }); return r; }, 'redirect_error'],
    [async () => { throw Object.assign(new Error('TOPSECRET'), { cause: { code: 'ENOTFOUND' } }); }, 'dns_error'],
  ]) {
    const report = await probeBackend({ endpoint: 'https://example.com', publishableKey: 'x', fetchImpl });
    assert.equal(report.ready, false); assert.equal(report.results[0].classification, classification);
    assert.doesNotMatch(JSON.stringify(report), /TOPSECRET/);
  }
});

test('targets fall back and deduplicate for Web/iOS and Android; empty config cannot pass', () => {
  assert.throws(() => configuredTargets({}), /required/);
  const env = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.com' };
  assert.deepEqual(configuredTargets(env), [{ endpoint: 'https://example.com', platforms: ['web/ios', 'android'] }]);
  assert.equal(configuredTargets({ ...env, EXPO_PUBLIC_SUPABASE_URL_ANDROID: 'http://10.0.2.2:54321' }).length, 2);
});
