import process from 'node:process';
import { pathToFileURL } from 'node:url';

// The Data API root no longer exposes its OpenAPI document to publishable/anon
// keys. A deliberately nonexistent relation returns the stable PGRST205 code,
// proving that the request reached PostgREST without reading application data.
// limit=0 also guarantees zero rows if that defensive name ever collides.
const PATHS = ['/auth/v1/health', '/auth/v1/settings', '/rest/v1/__doso_connectivity_probe__?limit=0'];
const MAX_BYTES = 65536;

export function validateEndpoint(raw, { allowLocalHttp = true } = {}) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('invalid endpoint URL'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('endpoint must not contain userinfo, query, fragment, or a path');
  const local = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) throw new Error('endpoint must use HTTPS (HTTP is allowed only for local targets)');
  return url.origin;
}

const failure = code => Object.assign(new Error('connection check failed'), { code });
function classify(error) {
  const code = error?.cause?.code || error?.code;
  if (['invalid_content_type', 'response_too_large', 'redirect_error', 'timeout'].includes(code)) return code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_error';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'timeout';
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID' || code?.startsWith?.('CERT_') || /TLS|SSL/i.test(error?.message || '')) return 'tls_error';
  return 'network_error';
}

async function jsonBody(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw failure('response_too_large');
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES) throw failure('response_too_large');
    return JSON.parse(text);
  }
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > MAX_BYTES) throw failure('response_too_large');
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function validService(path, json) {
  if (path.endsWith('/health')) return json?.name === 'GoTrue' && typeof json?.version === 'string';
  if (path.endsWith('/settings')) return typeof json?.external?.email === 'boolean';
  return json?.code === 'PGRST205';
}

export function configuredTargets(env) {
  const base = env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('EXPO_PUBLIC_SUPABASE_URL is required');
  const grouped = new Map();
  for (const [platform, value] of [['web/ios', base], ['android', env.EXPO_PUBLIC_SUPABASE_URL_ANDROID || base]]) {
    const endpoint = validateEndpoint(value);
    const item = grouped.get(endpoint) || { endpoint, platforms: [] };
    item.platforms.push(platform);
    grouped.set(endpoint, item);
  }
  return [...grouped.values()];
}

export async function probeBackend({ endpoint, publishableKey, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const base = validateEndpoint(endpoint);
  if (!publishableKey) throw new Error('publishable key is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('timeout must be positive');
  const results = [];
  for (const path of PATHS) {
    const controller = new AbortController();
    let timer;
    let response;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { reject(failure('timeout')); controller.abort(); }, timeoutMs);
    });
    try {
      const classification = await Promise.race([deadline, (async () => {
        const url = base + path;
        response = await fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { apikey: publishableKey, accept: 'application/json' } });
        if (response.redirected || (response.url && response.url !== url)) throw failure('redirect_error');
        if (response.status === 401 || response.status === 403) return 'unauthorized';
        const expectedPostgrestMiss = path.startsWith('/rest/v1/') && response.status === 404;
        if (response.status === 404 && !expectedPostgrestMiss) return 'http_404';
        if (!response.ok && !expectedPostgrestMiss) return 'http_error';
        if (!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw failure('invalid_content_type');
        let json;
        try { json = await jsonBody(response); }
        catch (error) { if (error instanceof SyntaxError) return 'invalid_service_response'; throw error; }
        return validService(path, json) ? 'service_response' : 'invalid_service_response';
      })()]);
      results.push({ path, status: response.status, classification });
    } catch (error) {
      results.push({ path, ...(response ? { status: response.status } : {}), classification: classify(error) });
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  }
  const reachable = results.every(r => !['dns_error', 'timeout', 'tls_error', 'network_error'].includes(r.classification));
  const ready = results.every(r => r.classification === 'service_response');
  return {
    endpoint: base,
    results,
    reachable,
    ready,
    ok: ready,
    validation: {
      scope: 'anonymous_service_connectivity',
      publicConnectivity: ready,
      authenticatedDatabase: false,
      registrationFlow: false,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const reports = [];
    for (const target of configuredTargets(process.env)) reports.push({ platforms: target.platforms, ...(await probeBackend({ endpoint: target.endpoint, publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY })) });
    const ok = reports.every(r => r.ok);
    console.log(JSON.stringify({ reports, ok }, null, 2));
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 2;
  }
}
