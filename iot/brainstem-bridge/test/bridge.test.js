import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import grpc from '@grpc/grpc-js';
import { loadConfig, parseTarget } from '../src/config.js';
import { createGatewayServer, closeServer, listen } from '../src/httpServer.js';
import { loadRobotControl } from '../src/proto.js';
import { createReadOnlyGrpcAdapter } from '../src/readOnlyGrpc.js';

const TOKEN = 'fixture-token-0123456789-ABCDEFGHIJKLMN';
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const protoRoot = process.env.DOSO_BRAINSTEM_PROTO_ROOT;

function grpcBind(server, address) {
  return new Promise((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) reject(error);
      else resolve(port);
    });
  });
}

function grpcShutdown(server) {
  return new Promise((resolve) => server.tryShutdown(resolve));
}

function baseConfig(target, overrides = {}) {
  return {
    target: parseTarget(target),
    protoRoot,
    bearerToken: TOKEN,
    grpc: { transport: 'local-insecure', timeoutMs: 3_000 },
    http: {
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: new Set(['https://app.example']),
      maxConcurrent: 2,
      ...overrides,
    },
  };
}

async function fetchJson(baseUrl, path = '/api/v1/brainstem/status', init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...init });
  return { response, body: await response.json() };
}

describe('real proto replay through mock gRPC and loopback HTTP', () => {
  let mockGrpc;
  let adapter;
  let httpServer;
  let baseUrl;
  const calls = new Map();

  before(async () => {
    assert.ok(protoRoot, 'Set DOSO_BRAINSTEM_PROTO_ROOT to the absolute directory containing brainstem_api/cms.proto');
    assert.ok(join(protoRoot, 'brainstem_api', 'cms.proto'));
    await access(join(protoRoot, 'brainstem_api', 'cms.proto'));
    const RobotControl = await loadRobotControl(protoRoot);
    mockGrpc = new grpc.Server();
    const implementation = {};
    for (const methodName of Object.keys(RobotControl.service)) {
      implementation[methodName] = (_call, callback) => {
        calls.set(methodName, (calls.get(methodName) ?? 0) + 1);
        callback?.(null, {});
      };
    }
    implementation.GetControlStatus = (_call, callback) => {
      calls.set('getControlStatus', (calls.get('getControlStatus') ?? 0) + 1);
      callback(null, {
        fsm: {
          kind: 'CMS_STATE_KIND_STANDING',
          transition: 'CMS_TRANSITION_KIND_NONE',
        },
        motorOutputEnabled: true,
        owner: 'CONTROL_OWNER_YUNZHUO',
        criticalMotorFault: false,
      });
    };
    mockGrpc.addService(RobotControl.service, implementation);
    const grpcPort = await grpcBind(mockGrpc, '127.0.0.1:0');
    const config = baseConfig(`127.0.0.1:${grpcPort}`);
    adapter = await createReadOnlyGrpcAdapter(config);
    httpServer = await createGatewayServer({ config, adapter });
    const address = await listen(httpServer, config.http);
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    adapter?.close();
    if (httpServer?.listening) await closeServer(httpServer);
    if (mockGrpc) await grpcShutdown(mockGrpc);
  });

  test('returns only the versioned read-only DTO and echoes the UUID nonce', async () => {
    const { response, body } = await fetchJson(baseUrl, undefined, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'X-Request-Id': REQUEST_ID },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('x-request-id'), REQUEST_ID);
    assert.deepEqual(Object.keys(body), [
      'schemaVersion', 'source', 'access', 'requestId', 'observedAt', 'transport', 'state', 'control',
    ]);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.source, 'brainstem.grpc');
    assert.equal(body.access, 'read-only');
    assert.equal(body.requestId, REQUEST_ID);
    assert.match(body.observedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(body.transport, 'local-insecure');
    assert.deepEqual(body.state, {
      kind: 'CMS_STATE_KIND_STANDING',
      transition: 'CMS_TRANSITION_KIND_NONE',
    });
    assert.deepEqual(body.control, {
      owner: 'CONTROL_OWNER_YUNZHUO',
      motorOutputEnabled: true,
      criticalMotorFault: false,
    });
    assert.equal('online' in body, false);
    assert.equal('canControl' in body, false);
    assert.equal('battery' in body, false);
  });

  test('generates a UUID request id when the client omits it', async () => {
    const { response, body } = await fetchJson(baseUrl, undefined, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/u);
    assert.equal(response.headers.get('x-request-id'), body.requestId);
  });

  test('rejects missing or incorrect bearer authentication before gRPC', async () => {
    const beforeCount = calls.get('getControlStatus') ?? 0;
    for (const authorization of [undefined, 'Bearer incorrect']) {
      const headers = authorization ? { Authorization: authorization } : {};
      const { response, body } = await fetchJson(baseUrl, undefined, { headers });
      assert.equal(response.status, 401);
      assert.deepEqual(body.error, {
        code: 'UNAUTHORIZED',
        message: 'Valid bearer authentication is required.',
      });
    }
    assert.equal(calls.get('getControlStatus') ?? 0, beforeCount);
  });

  test('does not redirect, rejects query strings, methods, bad UUIDs, and unknown paths', async () => {
    const headers = { Authorization: `Bearer ${TOKEN}` };
    const trailing = await fetchJson(baseUrl, '/api/v1/brainstem/status/', { headers });
    assert.equal(trailing.response.status, 404);
    assert.equal(trailing.response.headers.get('location'), null);

    const query = await fetchJson(baseUrl, '/api/v1/brainstem/status?target=elsewhere', { headers });
    assert.equal(query.response.status, 400);
    assert.equal(query.body.error.code, 'INVALID_QUERY');

    const method = await fetchJson(baseUrl, undefined, { method: 'POST', headers });
    assert.equal(method.response.status, 405);
    assert.equal(method.response.headers.get('allow'), 'GET, OPTIONS');

    const methodWithBody = await fetchJson(baseUrl, undefined, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: 'not accepted',
    });
    assert.equal(methodWithBody.response.status, 405);

    const crossOriginMethod = await fetchJson(baseUrl, undefined, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://untrusted.example' },
    });
    assert.equal(crossOriginMethod.response.status, 403);

    const badId = await fetchJson(baseUrl, undefined, {
      headers: { ...headers, 'X-Request-Id': 'not-a-uuid' },
    });
    assert.equal(badId.response.status, 400);
    assert.equal(badId.body.error.code, 'INVALID_REQUEST_ID');

    const origin = await fetchJson(baseUrl, undefined, {
      headers: { ...headers, Origin: 'https://untrusted.example' },
    });
    assert.equal(origin.response.status, 403);
    assert.equal(origin.response.headers.get('access-control-allow-origin'), null);
    assert.equal(origin.body.error.code, 'FORBIDDEN_ORIGIN');
  });

  test('calls only GetControlStatus and never any motion, lease, stop, or other RPC', () => {
    assert.ok((calls.get('getControlStatus') ?? 0) >= 2);
    const calledMethods = [...calls.entries()].filter(([, count]) => count > 0).map(([name]) => name);
    assert.deepEqual(calledMethods, ['getControlStatus']);
  });

  test('answers only the strict allowlisted OPTIONS preflight without bearer or gRPC', async () => {
    const beforeCount = calls.get('getControlStatus') ?? 0;
    const response = await fetch(`${baseUrl}/api/v1/brainstem/status`, {
      method: 'OPTIONS',
      redirect: 'manual',
      headers: {
        Origin: 'https://app.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Request-ID, Authorization, Accept',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Authorization, X-Request-Id, Accept');
    assert.equal(response.headers.get('location'), null);
    assert.equal(calls.get('getControlStatus') ?? 0, beforeCount);
  });

  test('rejects unsafe preflights and does not widen path or query handling', async () => {
    const beforeCount = calls.get('getControlStatus') ?? 0;
    const preflight = (path, headers) => fetch(`${baseUrl}${path}`, {
      method: 'OPTIONS',
      redirect: 'manual',
      headers,
    });
    const baseHeaders = {
      Origin: 'https://app.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization, X-Request-Id',
    };

    const wrongOrigin = await preflight('/api/v1/brainstem/status', {
      ...baseHeaders,
      Origin: 'https://untrusted.example',
    });
    assert.equal(wrongOrigin.status, 403);

    const wrongMethod = await preflight('/api/v1/brainstem/status', {
      ...baseHeaders,
      'Access-Control-Request-Method': 'POST',
    });
    assert.equal(wrongMethod.status, 403);

    const wrongHeader = await preflight('/api/v1/brainstem/status', {
      ...baseHeaders,
      'Access-Control-Request-Headers': 'Authorization, Content-Type',
    });
    assert.equal(wrongHeader.status, 403);

    const wrongPath = await preflight('/api/v1/brainstem/other', baseHeaders);
    assert.equal(wrongPath.status, 404);

    const query = await preflight('/api/v1/brainstem/status?target=other', baseHeaders);
    assert.equal(query.status, 400);
    assert.equal(calls.get('getControlStatus') ?? 0, beforeCount);
  });
});

test('maps gRPC timeout to a fixed error without exposing upstream details', async () => {
  assert.ok(protoRoot, 'Set DOSO_BRAINSTEM_PROTO_ROOT for the real proto fixture');
  const RobotControl = await loadRobotControl(protoRoot);
  const slowServer = new grpc.Server();
  slowServer.addService(RobotControl.service, {
    GetControlStatus(_call, callback) {
      setTimeout(() => callback(null, {}), 200);
    },
  });
  const port = await grpcBind(slowServer, '127.0.0.1:0');
  const config = baseConfig(`127.0.0.1:${port}`);
  config.grpc.timeoutMs = 30;
  const slowAdapter = await createReadOnlyGrpcAdapter(config);
  const server = await createGatewayServer({ config, adapter: slowAdapter });
  const address = await listen(server, config.http);
  try {
    const { response, body } = await fetchJson(`http://127.0.0.1:${address.port}`, undefined, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 504);
    assert.deepEqual(body.error, {
      code: 'UPSTREAM_TIMEOUT',
      message: 'Brainstem did not respond before the read deadline.',
    });
    assert.doesNotMatch(JSON.stringify(body), /deadline exceeded|grpc|127\.0\.0\.1/iu);
  } finally {
    slowAdapter.close();
    await closeServer(server);
    await grpcShutdown(slowServer);
  }
});

test('maps unexpected adapter failures to the fixed internal error structure', async () => {
  const config = baseConfig('127.0.0.1:13145');
  const server = await createGatewayServer({
    config,
    adapter: {
      transport: 'local-insecure',
      async readStatus() {
        throw new Error('secret upstream detail');
      },
    },
  });
  const address = await listen(server, config.http);
  try {
    const { response, body } = await fetchJson(`http://127.0.0.1:${address.port}`, undefined, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 500);
    assert.deepEqual(body.error, {
      code: 'INTERNAL_ERROR',
      message: 'The diagnostics request could not be completed.',
    });
    assert.doesNotMatch(JSON.stringify(body), /secret upstream detail/iu);
  } finally {
    await closeServer(server);
  }
});

test('enforces the configured concurrent diagnostics limit', async () => {
  const config = baseConfig('127.0.0.1:13145', { maxConcurrent: 1 });
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const snapshot = {
    state: { kind: 'CMS_STATE_KIND_ZERO', transition: 'CMS_TRANSITION_KIND_NONE' },
    control: { owner: 'CONTROL_OWNER_NONE', motorOutputEnabled: false, criticalMotorFault: false },
  };
  const server = await createGatewayServer({
    config,
    adapter: {
      transport: 'local-insecure',
      async readStatus() {
        started();
        await blocked;
        return snapshot;
      },
    },
  });
  const address = await listen(server, config.http);
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const first = fetchJson(url, undefined, { headers: { Authorization: `Bearer ${TOKEN}` } });
    await startedPromise;
    const second = await fetchJson(url, undefined, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(second.response.status, 429);
    assert.equal(second.body.error.code, 'BUSY');
    release();
    assert.equal((await first).response.status, 200);
  } finally {
    release();
    await closeServer(server);
  }
});

test('cancels the gRPC call and releases concurrency when the HTTP client disconnects', { timeout: 5_000 }, async () => {
  assert.ok(protoRoot, 'Set DOSO_BRAINSTEM_PROTO_ROOT for the real proto fixture');
  const RobotControl = await loadRobotControl(protoRoot);
  const grpcServer = new grpc.Server();
  let callCount = 0;
  let markStarted;
  let markCancelled;
  const firstStarted = new Promise((resolve) => { markStarted = resolve; });
  const firstCancelled = new Promise((resolve) => { markCancelled = resolve; });
  grpcServer.addService(RobotControl.service, {
    GetControlStatus(call, callback) {
      callCount += 1;
      if (callCount === 1) {
        markStarted();
        call.once('cancelled', markCancelled);
        return;
      }
      callback(null, {
        fsm: { kind: 'CMS_STATE_KIND_ZERO', transition: 'CMS_TRANSITION_KIND_NONE' },
        motorOutputEnabled: false,
        owner: 'CONTROL_OWNER_NONE',
        criticalMotorFault: false,
      });
    },
  });
  const grpcPort = await grpcBind(grpcServer, '127.0.0.1:0');
  const config = baseConfig(`127.0.0.1:${grpcPort}`, { maxConcurrent: 1 });
  const grpcAdapter = await createReadOnlyGrpcAdapter(config);
  const server = await createGatewayServer({ config, adapter: grpcAdapter });
  const address = await listen(server, config.http);
  try {
    const disconnectedRequest = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: '/api/v1/brainstem/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    disconnectedRequest.on('error', () => {});
    disconnectedRequest.end();
    await firstStarted;
    disconnectedRequest.destroy();
    await firstCancelled;

    const { response } = await fetchJson(`http://127.0.0.1:${address.port}`, undefined, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    assert.equal(callCount, 2);
  } finally {
    grpcAdapter.close();
    await closeServer(server);
    await grpcShutdown(grpcServer);
  }
});

test('fails closed for unsafe configuration', () => {
  const shared = {
    DOSO_BRAINSTEM_PROTO_ROOT: protoRoot,
    DOSO_BRAINSTEM_BEARER_TOKEN: TOKEN,
  };
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: '192.0.2.10:13145',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
  }), /restricted to loopback/u);
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:13145',
  }), /requires mTLS/u);
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:13145',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
    DOSO_BRAINSTEM_HTTP_HOST: '0.0.0.0',
  }), /requires HTTPS/u);
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:13145',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
    DOSO_BRAINSTEM_TLS_SERVER_NAME: 'override.invalid',
  }), /overrides are not supported/u);
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:9999',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
  }), /port 13145/u);
  assert.throws(() => loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:13145',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
    DOSO_BRAINSTEM_ALLOWED_ORIGINS: 'http://remote.example',
  }), /canonical HTTPS origins or loopback HTTP origins/u);
  const httpsOriginConfig = loadConfig({
    ...shared,
    DOSO_BRAINSTEM_TARGET: 'localhost:13145',
    DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
    DOSO_BRAINSTEM_ALLOWED_ORIGINS: 'http://127.0.0.1:19006,https://remote.example',
  });
  assert.deepEqual([...httpsOriginConfig.http.allowedOrigins], ['http://127.0.0.1:19006', 'https://remote.example']);
  for (const invalidToken of [
    'A'.repeat(31),
    'A'.repeat(257),
    `${'A'.repeat(31)}中`,
    `${'A'.repeat(31)}\n`,
    `${'A'.repeat(31)} `,
  ]) {
    assert.throws(() => loadConfig({
      ...shared,
      DOSO_BRAINSTEM_BEARER_TOKEN: invalidToken,
      DOSO_BRAINSTEM_TARGET: 'localhost:13145',
      DOSO_BRAINSTEM_LOCAL_INSECURE: 'true',
    }), /32-256 non-space printable ASCII/u);
  }
});
