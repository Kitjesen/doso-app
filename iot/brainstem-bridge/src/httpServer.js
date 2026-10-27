import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { BridgeError, bridgeError, ERRORS } from './errors.js';

const STATUS_PATH = '/api/v1/brainstem/status';
const MAX_RESPONSE_BYTES = 8 * 1024;
const PREFLIGHT_ALLOWED_HEADERS = Object.freeze(['authorization', 'x-request-id', 'accept']);
const PREFLIGHT_ALLOWED_HEADER_SET = new Set(PREFLIGHT_ALLOWED_HEADERS);

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function tokenMatches(authorization, expectedToken) {
  const supplied = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  const suppliedHash = createHash('sha256').update(supplied, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expectedToken, 'utf8').digest();
  return supplied.length > 0 && timingSafeEqual(suppliedHash, expectedHash);
}

function setCommonHeaders(response, requestId) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (requestId) response.setHeader('X-Request-Id', requestId);
}

function writeJson(response, statusCode, body, requestId) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  if (payload.byteLength > MAX_RESPONSE_BYTES) {
    const fallback = Buffer.from(JSON.stringify({
      error: { code: ERRORS.responseTooLarge.code, message: ERRORS.responseTooLarge.message },
      ...(requestId ? { requestId } : {}),
    }), 'utf8');
    response.statusCode = ERRORS.responseTooLarge.httpStatus;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', fallback.byteLength);
    response.end(fallback);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', payload.byteLength);
  response.end(payload);
}

function writeError(response, error, requestId) {
  const safe = error instanceof BridgeError ? error : bridgeError(ERRORS.internal);
  writeJson(response, safe.httpStatus, {
    error: { code: safe.code, message: safe.message },
    ...(requestId ? { requestId } : {}),
  }, requestId);
}

function requestIdFor(request) {
  const header = request.headers['x-request-id'];
  if (Array.isArray(header) || (header !== undefined && !isUuid(header))) {
    throw bridgeError(ERRORS.invalidRequestId);
  }
  return header ?? randomUUID();
}

function applyOriginPolicy(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  if (Array.isArray(origin) || !allowedOrigins.has(origin)) throw bridgeError(ERRORS.forbiddenOrigin);
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
}

function applyPreflightPolicy(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !allowedOrigins.has(origin)) {
    throw bridgeError(ERRORS.forbiddenOrigin);
  }
  const requestedMethod = request.headers['access-control-request-method'];
  const requestedHeadersValue = request.headers['access-control-request-headers'];
  if (requestedMethod !== 'GET' || Array.isArray(requestedHeadersValue)) {
    throw bridgeError(ERRORS.forbiddenPreflight);
  }

  const requestedHeaders = requestedHeadersValue === undefined
    ? []
    : requestedHeadersValue.split(',').map((value) => value.trim().toLowerCase());
  if (requestedHeaders.some((value) => value.length === 0 || !PREFLIGHT_ALLOWED_HEADER_SET.has(value))) {
    throw bridgeError(ERRORS.forbiddenPreflight);
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'GET');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Request-Id, Accept');
  response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
}

function hasBody(request) {
  const contentLength = request.headers['content-length'];
  return request.headers['transfer-encoding'] !== undefined || (contentLength !== undefined && contentLength !== '0');
}

export async function createGatewayServer({ config, adapter }) {
  let active = 0;
  const handler = async (request, response) => {
    let requestId;
    const abortController = new AbortController();
    const onRequestAborted = () => abortController.abort();
    const onResponseClose = () => {
      if (!response.writableFinished) abortController.abort();
    };
    request.once('aborted', onRequestAborted);
    response.once('close', onResponseClose);
    setCommonHeaders(response);
    try {
      requestId = requestIdFor(request);
      setCommonHeaders(response, requestId);

      if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//')) {
        throw bridgeError(ERRORS.invalidRequest);
      }
      const url = new URL(request.url, 'http://gateway.invalid');
      if (url.pathname !== STATUS_PATH) throw bridgeError(ERRORS.notFound);
      if (url.search.length > 0) throw bridgeError(ERRORS.invalidQuery);
      if (request.method === 'OPTIONS') {
        applyPreflightPolicy(request, response, config.http.allowedOrigins);
        if (hasBody(request)) throw bridgeError(ERRORS.invalidRequest);
        response.statusCode = 204;
        response.setHeader('Content-Length', '0');
        response.end();
        return;
      }

      applyOriginPolicy(request, response, config.http.allowedOrigins);
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET, OPTIONS');
        throw bridgeError(ERRORS.methodNotAllowed);
      }
      if (hasBody(request)) throw bridgeError(ERRORS.invalidRequest);
      if (!tokenMatches(request.headers.authorization, config.bearerToken)) {
        response.setHeader('WWW-Authenticate', 'Bearer');
        throw bridgeError(ERRORS.unauthorized);
      }
      if (active >= config.http.maxConcurrent) throw bridgeError(ERRORS.busy);

      active += 1;
      try {
        const snapshot = await adapter.readStatus({ signal: abortController.signal });
        writeJson(response, 200, {
          schemaVersion: 1,
          source: 'brainstem.grpc',
          access: 'read-only',
          requestId,
          observedAt: new Date().toISOString(),
          transport: adapter.transport,
          state: snapshot.state,
          control: snapshot.control,
        }, requestId);
      } finally {
        active -= 1;
      }
    } catch (error) {
      if (abortController.signal.aborted || response.destroyed) return;
      if (!response.headersSent) writeError(response, error, requestId);
      else response.destroy();
    } finally {
      request.off('aborted', onRequestAborted);
      response.off('close', onResponseClose);
    }
  };

  let server;
  if (config.http.certPath && config.http.keyPath) {
    const [cert, key] = await Promise.all([readFile(config.http.certPath), readFile(config.http.keyPath)]);
    server = https.createServer({ cert, key, maxHeaderSize: 8 * 1024 }, handler);
  } else {
    server = http.createServer({ maxHeaderSize: 8 * 1024 }, handler);
  }
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 20;
  return server;
}

export function listen(server, { host, port }) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve(server.address());
    });
  });
}

export function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
