import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, describe, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSimulationGateway } from '../src/simulationGateway.js';

const resources = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function waitUntil(predicate, timeoutMs = 750) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail('timed out waiting for the local simulation lifecycle condition');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

async function observer(instanceId, overrides = {}) {
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      schemaVersion: 1,
      simulationOnly: true,
      source: 'brainstem.local-simulation',
      instanceId,
      pose: { x: 1, y: 2, yaw: 0.1 },
      velocity: { x: 0, y: 0, z: 0 },
      events: [],
      ...overrides,
    }));
  });
  const address = await listen(server);
  resources.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${address.port}`;
}

function fakeRpc({ failRenew = false, renewAccepted = true, failWalkAt = 0, slowWalkAt = 0, releaseStatus } = {}) {
  const calls = [];
  let walkCount = 0;
  return {
    calls,
    acquire: async (clientId) => {
      calls.push(['acquire', clientId]);
      return { accepted: true, token: 'private-token', leaseDurationMs: 300 };
    },
    renew: async () => {
      calls.push(['renew']);
      if (failRenew) throw new Error('expired');
      return { accepted: renewAccepted, leaseDurationMs: 300 };
    },
    release: async () => {
      calls.push(['release']);
      return releaseStatus ?? { grpcLeaseActive: false, owner: 'CONTROL_OWNER_NONE' };
    },
    walk: async (_token, sequence, direction) => {
      calls.push(['walk', sequence, direction]);
      walkCount += 1;
      if (slowWalkAt === walkCount) await sleep(80);
      if (failWalkAt === walkCount) throw new Error('walk failed');
      return { accepted: true, sequence, status: { readyForWalk: true } };
    },
    status: async () => ({ readyForWalk: true, owner: 'CONTROL_OWNER_GRPC' }),
    close: () => calls.push(['close']),
  };
}

async function fixture(options = {}) {
  const instanceId = options.instanceId ?? randomUUID();
  const rpc = options.rpc ?? fakeRpc();
  const observerOrigin = await observer(instanceId, options.observerOverrides);
  const gateway = await createSimulationGateway({
    expectedInstanceId: options.expectedInstanceId ?? instanceId,
    observerOrigin,
    rpcAdapter: rpc,
    fetchImpl: options.fetchImpl ?? fetch,
    port: 0,
    renewIntervalMs: options.renewIntervalMs ?? 80,
    inactivityMs: options.inactivityMs ?? 250,
    bootstrapMs: options.bootstrapMs ?? 1_000,
    commandSpacingMs: options.commandSpacingMs ?? 1,
  });
  const address = await gateway.start();
  if (options.registerGatewayCleanup !== false) resources.push(() => gateway.close());
  return { instanceId, rpc, gateway, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function json(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
}

async function rawJson(baseUrl, path, headers) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ response, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function createSession(baseUrl) {
  const result = await json(baseUrl, '/api/v1/simulation/sessions', {
    method: 'POST', body: JSON.stringify({ clientId: 'android-emulator' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

afterEach(async () => {
  while (resources.length) await resources.pop()();
});

describe('local simulation motion gateway', () => {
  test('rejects non-finite and non-positive lifecycle timing configuration', async () => {
    for (const override of [
      { bootstrapMs: Infinity },
      { bootstrapMs: 0 },
      { inactivityMs: -1 },
      { renewIntervalMs: Number.NaN },
      { commandSpacingMs: 0 },
    ]) {
      await assert.rejects(() => createSimulationGateway({
        expectedInstanceId: randomUUID(),
        observerOrigin: 'http://127.0.0.1:13148',
        rpcAdapter: fakeRpc(),
        ...override,
      }), /must be a finite positive number/u);
    }
  });

  test('attests the simulator before acquire and sends sequence 1 zero before accepting input', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    assert.equal(session.simulationOnly, true);
    assert.deepEqual(session.limits, { linearMps: 0.25, yawRps: 0.5 });
    assert.deepEqual(rpc.calls.slice(0, 2), [
      ['acquire', 'android-emulator'],
      ['walk', 1, { x: 0, y: 0, z: 0 }],
    ]);
    assert.equal(JSON.stringify(session).includes('private-token'), false);
  });

  test('accepts React Native UTF-8 JSON content-type and rejects other encodings and media types', async () => {
    const { baseUrl } = await fixture();
    const accepted = await json(baseUrl, '/api/v1/simulation/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'Application/JSON ; charset = UTF-8' },
      body: JSON.stringify({ clientId: 'android-okhttp' }),
    });
    assert.equal(accepted.response.status, 201);
    await json(baseUrl, `/api/v1/simulation/sessions/${accepted.body.sessionId}`, { method: 'DELETE' });

    for (const contentType of ['application/json; charset=iso-8859-1', 'text/plain; charset=utf-8']) {
      const rejected = await json(baseUrl, '/api/v1/simulation/sessions', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: JSON.stringify({ clientId: 'android-okhttp' }),
      });
      assert.equal(rejected.response.status, 415);
    }
  });

  test('allows a slow Android client to deliver its first input inside the zero-speed bootstrap window', async () => {
    const { baseUrl, rpc } = await fixture({ bootstrapMs: 140, inactivityMs: 40 });
    const session = await createSession(baseUrl);
    await sleep(75);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'release'), false);
    const input = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.05, y: 0, z: 0 } }),
    });
    assert.equal(input.response.status, 200);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
  });

  test('releases a zero-only session when no first input arrives before bootstrap timeout', async () => {
    const { baseUrl, rpc } = await fixture({ bootstrapMs: 50, inactivityMs: 20 });
    await createSession(baseUrl);
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    const walks = rpc.calls.filter((entry) => entry[0] === 'walk');
    assert.deepEqual(walks.map((entry) => entry[2]), [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
  });

  test('switches to the strict inactivity timeout as soon as the first input arrives', async () => {
    const { baseUrl, rpc } = await fixture({ bootstrapMs: 250, inactivityMs: 45 });
    const session = await createSession(baseUrl);
    await sleep(70);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.05, y: 0, z: 0 } }),
    });
    const inputAt = Date.now();
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    assert.ok(Date.now() - inputAt < 180, 'strict inactivity timeout must replace the longer bootstrap window');
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
  });

  test('spaces only WalkChecked calls while renewals use the shared queue without extra delay', async () => {
    const rpc = fakeRpc();
    const events = [];
    const walk = rpc.walk;
    const renew = rpc.renew;
    rpc.walk = async (...args) => {
      events.push({ kind: 'walk', at: performance.now() });
      return walk(...args);
    };
    rpc.renew = async (...args) => {
      events.push({ kind: 'renew', at: performance.now() });
      return renew(...args);
    };
    const { baseUrl } = await fixture({ rpc, commandSpacingMs: 25, renewIntervalMs: 15, bootstrapMs: 500, inactivityMs: 200 });
    const session = await createSession(baseUrl);
    await sleep(18);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.04, y: 0, z: 0 } }),
    });
    await sleep(18);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 2, velocity: { x: 0, y: 0, z: 0.1 } }),
    });
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
    const walks = events.filter((event) => event.kind === 'walk');
    for (let index = 1; index < walks.length; index += 1) {
      assert.ok(walks[index].at - walks[index - 1].at >= 20, 'WalkChecked calls must retain safe minimum spacing');
    }
    assert.equal(events.some((event, index) => event.kind === 'renew'
      && events.slice(0, index).some((prior) => prior.kind === 'walk')
      && events.slice(index + 1).some((later) => later.kind === 'walk')), true);
  });

  test('maps accepted movement and turn inputs to contiguous WalkChecked RPCs', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    const move = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: -0.1, z: 0.4 } }),
    });
    assert.equal(move.response.status, 200);
    assert.equal(move.body.gRpcSequence, 2);
    assert.equal(move.body.status, 'accepted');
    assert.deepEqual(rpc.calls.find((entry) => entry[0] === 'walk' && entry[1] === 2), ['walk', 2, { x: 0.2, y: -0.1, z: 0.4 }]);
  });

  test('rejects replay without consuming an RPC sequence and releases the session', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }),
    });
    const replay = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    assert.equal(replay.response.status, 409);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2].x, 0);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'release').length, 1);
  });

  test('rejects values beyond limits and fails closed with stop then release', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    const invalid = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.251, y: 0, z: 0 } }),
    });
    assert.equal(invalid.response.status, 422);
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk'), [
      ['walk', 1, { x: 0, y: 0, z: 0 }],
      ['walk', 2, { x: 0, y: 0, z: 0 }],
    ]);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'release'), true);
  });

  test('watchdog sends zero and releases after client input inactivity', async () => {
    const { baseUrl, rpc } = await fixture({ inactivityMs: 70, renewIntervalMs: 25 });
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    const walks = rpc.calls.filter((entry) => entry[0] === 'walk');
    assert.deepEqual(walks.at(-1)[2], { x: 0, y: 0, z: 0 });
    assert.equal(rpc.calls.some((entry) => entry[0] === 'release'), true);
  });

  test('explicit release orders zero before lease release', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    const released = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
    assert.equal(released.response.status, 200);
    assert.deepEqual(released.body, { schemaVersion: 1, simulationOnly: true, released: true, zeroAcknowledged: true, sessionId: session.sessionId });
    const tail = rpc.calls.filter((entry) => entry[0] === 'walk' || entry[0] === 'release').slice(-2);
    assert.deepEqual(tail[0][2], { x: 0, y: 0, z: 0 });
    assert.equal(tail[1][0], 'release');
  });

  test('renewal error stops and releases an active command', async () => {
    const rpc = fakeRpc({ failRenew: true });
    const { baseUrl } = await fixture({ rpc, renewIntervalMs: 25, inactivityMs: 200 });
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
    assert.equal(rpc.calls.some((entry) => entry[0] === 'release'), true);
  });

  test('rejected renewal stops and releases an active command', async () => {
    const rpc = fakeRpc({ renewAccepted: false });
    const { baseUrl } = await fixture({ rpc, renewIntervalMs: 25, inactivityMs: 200 });
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
  });

  test('releases a granted lease when the mandatory initial zero is rejected', async () => {
    const rpc = fakeRpc({ failWalkAt: 1 });
    const { baseUrl } = await fixture({ rpc });
    const result = await json(baseUrl, '/api/v1/simulation/sessions', {
      method: 'POST', body: JSON.stringify({ clientId: 'android-emulator' }),
    });
    assert.equal(result.response.status, 502);
    assert.deepEqual(rpc.calls.map((entry) => entry[0]), ['acquire', 'walk', 'release']);
  });

  test('does not report release success without an inactive lease confirmation', async () => {
    const rpc = fakeRpc({ releaseStatus: { grpcLeaseActive: true, owner: 'CONTROL_OWNER_GRPC' } });
    const { baseUrl, gateway } = await fixture({ rpc, registerGatewayCleanup: false });
    const session = await createSession(baseUrl);
    const result = await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error.message, 'local simulation gateway failed closed');
    await assert.rejects(gateway.close(), /shutdown could not confirm every session stopped/u);
  });

  test('queued movement cannot execute after release begins and zero remains the final command', async () => {
    const rpc = fakeRpc({ slowWalkAt: 2 });
    const { baseUrl } = await fixture({ rpc, inactivityMs: 500 });
    const session = await createSession(baseUrl);
    const first = json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'walk' && entry[1] === 2));
    const second = json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 2, velocity: { x: 0.2, y: 0, z: 0 } }),
    });
    await sleep(5);
    const released = json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
    await Promise.all([first, second, released]);
    const walks = rpc.calls.filter((entry) => entry[0] === 'walk');
    assert.equal(walks.some((entry) => entry[2].x === 0.2), false);
    assert.deepEqual(walks.at(-1)[2], { x: 0, y: 0, z: 0 });
    assert.equal(rpc.calls.at(-1)[0], 'release');
  });

  test('refuses mismatched observer attestation before acquiring control', async () => {
    const rpc = fakeRpc();
    const { baseUrl } = await fixture({ rpc, expectedInstanceId: randomUUID() });
    const result = await json(baseUrl, '/api/v1/simulation/sessions', {
      method: 'POST', body: JSON.stringify({ clientId: 'android-emulator' }),
    });
    assert.equal(result.response.status, 502);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'acquire'), false);
  });

  test('returns combined attested observer and actual control state', async () => {
    const { baseUrl } = await fixture();
    const state = await json(baseUrl, '/api/v1/simulation/state');
    assert.equal(state.response.status, 200);
    assert.equal(state.body.source, 'brainstem.local-simulation');
    assert.deepEqual(state.body.pose, { x: 1, y: 2, yaw: 0.1 });
    assert.equal(state.body.control.readyForWalk, true);
  });

  test('enforces explicit CORS origins and strict loopback Host', async () => {
    const { baseUrl } = await fixture();
    const blockedOrigin = await json(baseUrl, '/api/v1/simulation/state', { headers: { Origin: 'https://evil.example' } });
    assert.equal(blockedOrigin.response.status, 403);
    const url = new URL(baseUrl);
    const blockedHost = await rawJson(baseUrl, '/api/v1/simulation/state', { Host: `evil.example:${url.port}` });
    assert.equal(blockedHost.response.statusCode, 403);
  });

  test('shutdown shares one result, cleans every resource, and rejects unacknowledged zero or release', async () => {
    for (const rpc of [
      fakeRpc({ failWalkAt: 2 }),
      fakeRpc({ releaseStatus: { grpcLeaseActive: true, owner: 'CONTROL_OWNER_GRPC' } }),
    ]) {
      const { baseUrl, gateway } = await fixture({ rpc, registerGatewayCleanup: false });
      await createSession(baseUrl);
      const first = gateway.close();
      const second = gateway.close();
      assert.equal(first, second);
      await assert.rejects(first, /shutdown could not confirm every session stopped/u);
      assert.equal(gateway.server.listening, false);
      assert.equal(rpc.calls.filter((entry) => entry[0] === 'close').length, 1);
      await assert.rejects(gateway.close(), /shutdown could not confirm every session stopped/u);
      assert.equal(rpc.calls.filter((entry) => entry[0] === 'close').length, 1);
    }
  });

  test('shutdown retains and reports an earlier watchdog stop failure after the session left the active map', async () => {
    const rpc = fakeRpc({ failWalkAt: 3 });
    const { baseUrl, gateway } = await fixture({
      rpc, inactivityMs: 35, renewIntervalMs: 15, registerGatewayCleanup: false,
    });
    const session = await createSession(baseUrl);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    await assert.rejects(gateway.close(), /shutdown could not confirm every session stopped/u);
    assert.equal(gateway.server.listening, false);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'close').length, 1);
  });

  test('shutdown waits for delayed attestation and prevents a late acquire or renewal', async () => {
    const observed = deferred();
    let fetchCalls = 0;
    const rpc = fakeRpc();
    const { instanceId, baseUrl, gateway } = await fixture({
      rpc,
      fetchImpl: async () => {
        fetchCalls += 1;
        return observed.promise;
      },
      renewIntervalMs: 20,
    });
    const creating = json(baseUrl, '/api/v1/simulation/sessions', {
      method: 'POST', body: JSON.stringify({ clientId: 'closing-observer' }),
    });
    await waitUntil(() => fetchCalls === 1);
    const closing = gateway.close();
    observed.resolve(new Response(JSON.stringify({
      schemaVersion: 1, simulationOnly: true, source: 'brainstem.local-simulation', instanceId,
    }), { headers: { 'content-type': 'application/json' } }));
    const response = await creating;
    await closing;
    assert.equal(response.response.status, 503);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'acquire'), false);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'renew'), false);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'close').length, 1);
  });

  test('shutdown waits for a delayed acquire, confirms zero and release, and never registers renewal', async () => {
    const granted = deferred();
    const rpc = fakeRpc();
    rpc.acquire = async (clientId) => {
      rpc.calls.push(['acquire', clientId]);
      return granted.promise;
    };
    const { baseUrl, gateway } = await fixture({ rpc, renewIntervalMs: 20 });
    const creating = json(baseUrl, '/api/v1/simulation/sessions', {
      method: 'POST', body: JSON.stringify({ clientId: 'closing-acquire' }),
    });
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'acquire'));
    const closing = gateway.close();
    granted.resolve({ accepted: true, token: 'late-private-token', leaseDurationMs: 300 });
    const response = await creating;
    await closing;
    await sleep(50);
    assert.equal(response.response.status, 503);
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').map((entry) => entry[2]), [
      { x: 0, y: 0, z: 0 },
    ]);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'release').length, 1);
    assert.equal(rpc.calls.some((entry) => entry[0] === 'renew'), false);
    assert.equal(rpc.calls.filter((entry) => entry[0] === 'close').length, 1);
  });
});
