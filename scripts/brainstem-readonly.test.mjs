import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/brainstemReadOnly.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { checkBrainstemConnection, checkCloudConnection, diagnosticOrigin, validateBrainstemSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const requestId = '123e4567-e89b-42d3-a456-426614174000';
const now = Date.now();
const token = 'test-only-token-0123456789-ABCDEFGHIJKLMN';
const snapshot = () => ({
  schemaVersion: 1, source: 'brainstem.grpc', access: 'read-only', requestId,
  observedAt: new Date(now).toISOString(), transport: 'mtls',
  state: { kind: 'CMS_STATE_KIND_GROUNDED', transition: 'CMS_TRANSITION_KIND_NONE' },
  control: { owner: 'CONTROL_OWNER_NONE', motorOutputEnabled: false, criticalMotorFault: false },
});
const response = (value, options = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...options });
const options = (fetchImpl, extra = {}) => ({ endpoint: 'https://gateway.example', token, requestId, now: () => now, fetchImpl, ...extra });
const code = expected => error => error.code === expected && !error.message.includes(token);

test('remote HTTPS only; explicit development loopback HTTP; no URL credentials or proxy paths', () => {
  for (const value of ['http://robot.local', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=x', 'https://example.com/#token', 'file:///tmp']) {
    assert.throws(() => diagnosticOrigin(value, true), code('config'));
  }
  assert.throws(() => diagnosticOrigin('http://127.0.0.1:8120'), code('config'));
  for (const host of ['127.0.0.1', '[::1]', 'localhost']) assert.equal(diagnosticOrigin(`http://${host}:8120`, true), `http://${host}:8120`);
  assert.throws(() => diagnosticOrigin('http://10.0.2.2:8120', true), code('config'));
});

test('a status read sends one GET, no cookies/redirects, and drops authority fields', async () => {
  const calls = [];
  const value = await checkBrainstemConnection(options(async (url, init) => {
    calls.push({ url, init });
    return response({ ...snapshot(), online: true, canControl: true, lease: 'fake' });
  }));
  assert.deepEqual(value, snapshot());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gateway.example/api/v1/brainstem/status');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[0].init.headers['X-Request-Id'], requestId);
});

test('rejects invalid token and nonce before network', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(snapshot()); };
  for (const extra of [{ token: 'short' }, { token: 'x'.repeat(257) }, { token: `${token}\n` }, { requestId: 'not-uuid' }]) {
    await assert.rejects(checkBrainstemConnection(options(fetchImpl, extra)), code('config'));
  }
  assert.equal(calls, 0);
});

test('rejects expired, future, wrong-origin contract and malformed hardware fields', () => {
  for (const extra of [
    { requestId: 'wrong' }, { source: 'simulator' }, { access: 'control' }, { schemaVersion: 2 },
    { observedAt: new Date(now - 15001).toISOString() }, { observedAt: new Date(now + 5001).toISOString() },
    { transport: 'insecure' }, { state: { kind: 'STANDING', transition: 'NONE' } },
    { control: { ...snapshot().control, motorOutputEnabled: 'false' } },
    { control: { ...snapshot().control, owner: 'UNKNOWN' } },
  ]) assert.throws(() => validateBrainstemSnapshot({ ...snapshot(), ...extra }, requestId, now), code('invalid_response'));
  for (const value of [null, [], 'ok', 0]) assert.throws(() => validateBrainstemSnapshot(value, requestId, now), code('invalid_response'));
});

test('unauthorized, HTTP failure, HTML and malformed JSON remain failures', async () => {
  for (const [result, expected] of [
    [response({}, { status: 401 }), 'unauthorized'], [response({}, { status: 403 }), 'unauthorized'],
    [response({}, { status: 503 }), 'unavailable'], [new Response('<html>ok</html>'), 'invalid_response'],
    [new Response('{', { headers: { 'content-type': 'application/json' } }), 'invalid_response'],
  ]) await assert.rejects(checkBrainstemConnection(options(async () => result)), code(expected));
});

test('oversized declared and streaming bodies are rejected', async () => {
  const declared = response(snapshot());
  declared.headers.set('content-length', '65537');
  await assert.rejects(checkBrainstemConnection(options(async () => declared)), code('invalid_response'));
  const large = new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(checkBrainstemConnection(options(async () => large)), code('invalid_response'));
});

test('redirected or rewritten responses cannot be treated as a gateway', async () => {
  for (const property of [{ redirected: true }, { url: 'https://other.example/' }]) {
    const result = response(snapshot());
    for (const [key, value] of Object.entries(property)) Object.defineProperty(result, key, { value });
    await assert.rejects(checkBrainstemConnection(options(async () => result)), code('invalid_response'));
  }
});

test('deadline covers fetch and a stalled response body even if transport ignores abort', async () => {
  await assert.rejects(checkBrainstemConnection(options(() => new Promise(() => {}), { timeoutMs: 15 })), code('timeout'));
  const body = new ReadableStream({ start() {} });
  await assert.rejects(checkBrainstemConnection(options(async () => new Response(body, { headers: { 'content-type': 'application/json' } }), { timeoutMs: 15 })), code('timeout'));
});

test('caller can cancel before or during a request; raw errors never expose token', async () => {
  const already = new AbortController(); already.abort();
  await assert.rejects(checkBrainstemConnection(options(async () => { throw Error('must not fetch'); }, { signal: already.signal })), code('cancelled'));
  const controller = new AbortController();
  const pending = checkBrainstemConnection(options(() => new Promise(() => {}), { signal: controller.signal }));
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  await assert.rejects(checkBrainstemConnection(options(async () => { throw Error(token); })), code('unavailable'));
});

test('cloud probe reads health only and does not imply login or database readiness', async () => {
  let path;
  await checkCloudConnection({ endpoint: 'https://cloud.example', publishableKey: 'fixture-public-key', fetchImpl: async url => {
    path = url; return response({ name: 'GoTrue', version: 'test' });
  } });
  assert.equal(path, 'https://cloud.example/auth/v1/health');
  await assert.rejects(checkCloudConnection({ endpoint: 'https://cloud.example', publishableKey: 'x', fetchImpl: async () => response({ healthy: true }) }), code('invalid_response'));
});

test('development entry keeps QA priority and production authentication boundaries', async () => {
  const index = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(index, /useConnectionDiagnostics = __DEV__ && !useDesignQa/);
  assert.match(index, /useDesignQa \? DesignQaEntry : useConnectionDiagnostics \? ConnectionDiagnosticsEntry : Root/);
  assert.match(app, /if \(__DEV__ && connectionDiagnosticsOpen\)/);
  assert.match(app, /PRODUCTION_ROBOT_COMMAND_EXECUTOR[^=]*= null/);
  assert.doesNotMatch(source, /acquireControl|enableMotor|sendCommand|\.rpc\(/);
  const control = await readFile(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
  assert.match(app, /<ControlScreen[\s\S]*?onOpenConnectionDiagnostics=\{__DEV__ \? \(\) => setConnectionDiagnosticsOpen\(true\) : undefined\}/);
  // The control surface may display the shared Brainstem readiness gates, but
  // it must not import the old diagnostic panel or perform a status probe.
  assert.doesNotMatch(control, /control-brainstem-connection|RobotDiagnosticsPanel|checkBrainstemConnection|BrainstemSnapshot|presentBrainstemSnapshot/);
  assert.match(control, /brainstemIntegration|brainstem-integration-readiness/);
  assert.match(control, /previewControlsEnabled = __DEV__ && allowInteractionPreview && appActive && !leaving/);
});

test('presentation distinguishes local/remote scope and never attributes gRPC ownership to this app', async () => {
  const presentationSource = await readFile(new URL('../src/services/brainstemPresentation.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(presentationSource, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
  const { presentBrainstemSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const remote = presentBrainstemSnapshot({ ...snapshot(), control: { ...snapshot().control, owner: 'CONTROL_OWNER_GRPC', motorOutputEnabled: true } });
  assert.equal(remote.scope, '远程只读，未验证设备身份');
  assert.equal(remote.owner, 'gRPC 客户端（不代表本 App）');
  assert.match(remote.authority, /未获取控制权/);
  assert.equal('canControl' in remote, false);
  assert.equal(presentBrainstemSnapshot({ ...snapshot(), transport: 'local-insecure' }).scope, '本地联调，未验证真机');
});
