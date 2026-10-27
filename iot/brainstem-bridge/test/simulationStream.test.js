import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, test } from 'node:test';
import WebSocket from 'ws';
import { createSimulationGateway } from '../src/simulationGateway.js';

const resources = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs = 750) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail('timed out waiting for stream lifecycle evidence');
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

async function observer(instanceId) {
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      schemaVersion: 1,
      simulationOnly: true,
      source: 'brainstem.local-simulation',
      instanceId,
      pose: { x: 0, y: 0, yaw: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    }));
  });
  const address = await listen(server);
  resources.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${address.port}`;
}

function fakeRpc({ failRenew = false, failWalkAt = 0, slowWalkAt = 0 } = {}) {
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
      if (failRenew) throw new Error('renew failed');
      return { accepted: true, leaseDurationMs: 300 };
    },
    release: async () => {
      calls.push(['release']);
      return { grpcLeaseActive: false, owner: 'CONTROL_OWNER_NONE' };
    },
    walk: async (_token, sequence, velocity) => {
      calls.push(['walk', sequence, velocity]);
      walkCount += 1;
      if (walkCount === slowWalkAt) await sleep(80);
      if (walkCount === failWalkAt) throw new Error('walk failed');
      return { accepted: true, sequence, status: { readyForWalk: true } };
    },
    status: async () => ({ readyForWalk: true, owner: 'CONTROL_OWNER_GRPC' }),
    close: () => calls.push(['close']),
  };
}

async function fixture(options = {}) {
  const instanceId = randomUUID();
  const rpc = options.rpc ?? fakeRpc();
  const gateway = await createSimulationGateway({
    expectedInstanceId: instanceId,
    observerOrigin: await observer(instanceId),
    rpcAdapter: rpc,
    port: 0,
    renewIntervalMs: options.renewIntervalMs ?? 80,
    inactivityMs: options.inactivityMs ?? 250,
    bootstrapMs: options.bootstrapMs ?? 1_000,
    commandSpacingMs: 1,
  });
  const address = await gateway.start();
  resources.push(() => gateway.close());
  return { rpc, gateway, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function json(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await response.json();
  return { response, body };
}

async function createSession(baseUrl) {
  const result = await json(baseUrl, '/api/v1/simulation/sessions', {
    method: 'POST',
    body: JSON.stringify({ clientId: 'android-stream-test' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

function createStream(baseUrl, sessionId, options = {}) {
  const messages = [];
  const waiters = [];
  const url = `${baseUrl.replace(/^http/u, 'ws')}/api/v1/simulation/sessions/${sessionId}/stream`;
  const socket = new WebSocket(url, options);
  resources.push(() => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.terminate();
  });
  socket.on('message', (data, isBinary) => {
    const message = isBinary ? data : JSON.parse(data.toString('utf8'));
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  const opened = new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const next = (predicate, timeoutMs = 750) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error('timed out waiting for stream message'));
      }, timeoutMs);
      waiters.push(waiter);
    });
  };
  return { socket, opened, next, messages };
}

function rejectedStream(baseUrl, sessionId, options = {}) {
  const url = `${baseUrl.replace(/^http/u, 'ws')}/api/v1/simulation/sessions/${sessionId}/stream`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('open', () => reject(new Error('stream unexpectedly opened')));
    socket.once('error', () => {});
  });
}

function rejectedUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('open', () => reject(new Error('stream unexpectedly opened')));
    socket.once('error', () => {});
  });
}

afterEach(async () => {
  while (resources.length) await resources.pop()();
});

describe('local simulation WebSocket stream', () => {
  test('streams contiguous input acknowledgements and releases only after zero and lease acknowledgement', async () => {
    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    const stream = createStream(baseUrl, session.sessionId);
    await stream.opened;
    assert.deepEqual(await stream.next((message) => message.kind === 'stream-ready'), {
      kind: 'stream-ready', schemaVersion: 1, simulationOnly: true, sessionId: session.sessionId,
    });

    stream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.2, y: -0.1, z: 0.4 } }));
    const inputAck = await stream.next((message) => message.kind === 'input-ack');
    assert.deepEqual(inputAck, {
      kind: 'input-ack', schemaVersion: 1, simulationOnly: true, sessionId: session.sessionId,
      inputSequence: 1, accepted: true, gRpcSequence: 2, status: 'accepted',
    });

    stream.socket.send(JSON.stringify({ kind: 'release' }));
    const releaseAck = await stream.next((message) => message.kind === 'release-ack');
    assert.equal(releaseAck.zeroAcknowledged, true);
    assert.equal(JSON.stringify(stream.messages).includes('private-token'), false);
    const tail = rpc.calls.filter((entry) => entry[0] === 'walk' || entry[0] === 'release').slice(-2);
    assert.deepEqual(tail[0][2], { x: 0, y: 0, z: 0 });
    assert.equal(tail[1][0], 'release');
  });

  test('accepts omitted and exact loopback origins while rejecting non-loopback origins', async () => {
    for (const originKind of ['omitted', 'http', 'ws']) {
      const { baseUrl } = await fixture();
      const session = await createSession(baseUrl);
      const origin = originKind === 'omitted' ? undefined : `${originKind}://127.0.0.1:${new URL(baseUrl).port}`;
      const stream = createStream(baseUrl, session.sessionId, origin ? { origin } : {});
      await stream.opened;
      await stream.next((message) => message.kind === 'stream-ready');
      stream.socket.send(JSON.stringify({ kind: 'release' }));
      await stream.next((message) => message.kind === 'release-ack');
    }

    const { baseUrl } = await fixture();
    const session = await createSession(baseUrl);
    assert.equal(await rejectedStream(baseUrl, session.sessionId, { origin: 'https://evil.example' }), 403);
    assert.equal(await rejectedStream(baseUrl, session.sessionId, { headers: { Host: 'evil.example' } }), 403);
    assert.equal(await rejectedStream(baseUrl, randomUUID()), 404);
    const streamUrl = `${baseUrl.replace(/^http/u, 'ws')}/api/v1/simulation/sessions/${session.sessionId}/stream?unsafe=1`;
    assert.equal(await rejectedUrl(streamUrl), 404);
    await json(baseUrl, `/api/v1/simulation/sessions/${session.sessionId}`, { method: 'DELETE' });
  });

  test('rejects duplicate streams and HTTP/stream transport mixing with a safe stop', async () => {
    const first = await fixture();
    const firstSession = await createSession(first.baseUrl);
    const stream = createStream(first.baseUrl, firstSession.sessionId);
    await stream.opened;
    await stream.next((message) => message.kind === 'stream-ready');
    assert.equal(await rejectedStream(first.baseUrl, firstSession.sessionId), 409);
    await waitUntil(() => first.rpc.calls.some((entry) => entry[0] === 'release'));

    const second = await fixture();
    const secondSession = await createSession(second.baseUrl);
    const httpInput = await json(second.baseUrl, `/api/v1/simulation/sessions/${secondSession.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }),
    });
    assert.equal(httpInput.response.status, 200);
    assert.equal(await rejectedStream(second.baseUrl, secondSession.sessionId), 409);
    await waitUntil(() => second.rpc.calls.some((entry) => entry[0] === 'release'));

    const third = await fixture();
    const thirdSession = await createSession(third.baseUrl);
    const thirdStream = createStream(third.baseUrl, thirdSession.sessionId);
    await thirdStream.opened;
    await thirdStream.next((message) => message.kind === 'stream-ready');
    const mixed = await json(third.baseUrl, `/api/v1/simulation/sessions/${thirdSession.sessionId}/input`, {
      method: 'PUT', body: JSON.stringify({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }),
    });
    assert.equal(mixed.response.status, 409);
    await waitUntil(() => third.rpc.calls.some((entry) => entry[0] === 'release'));
  });

  test('fails closed for invalid JSON, binary frames, oversized frames and replay', async () => {
    const invalidFrames = [
      (socket) => socket.send('{'),
      (socket) => socket.send(Buffer.from('{}')),
      (socket) => socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0, y: 0, z: 0 }, padding: 'x'.repeat(17 * 1024) })),
      (socket) => socket.send(JSON.stringify({ kind: 'unknown' })),
      (socket) => socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.251, y: 0, z: 0 } })),
    ];
    for (const sendInvalid of invalidFrames) {
      const { baseUrl, rpc } = await fixture();
      const session = await createSession(baseUrl);
      const stream = createStream(baseUrl, session.sessionId);
      await stream.opened;
      await stream.next((message) => message.kind === 'stream-ready');
      sendInvalid(stream.socket);
      await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
      assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
    }

    const { baseUrl, rpc } = await fixture();
    const session = await createSession(baseUrl);
    const stream = createStream(baseUrl, session.sessionId);
    await stream.opened;
    await stream.next((message) => message.kind === 'stream-ready');
    stream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }));
    await stream.next((message) => message.kind === 'input-ack');
    stream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.2, y: 0, z: 0 } }));
    await waitUntil(() => rpc.calls.some((entry) => entry[0] === 'release'));
    assert.deepEqual(rpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
  });

  test('allows release during an in-flight input but treats a second pending input as unsafe', async () => {
    const releasingRpc = fakeRpc({ slowWalkAt: 2 });
    const releasing = await fixture({ rpc: releasingRpc });
    const releasingSession = await createSession(releasing.baseUrl);
    const releasingStream = createStream(releasing.baseUrl, releasingSession.sessionId);
    await releasingStream.opened;
    await releasingStream.next((message) => message.kind === 'stream-ready');
    releasingStream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }));
    await waitUntil(() => releasingRpc.calls.some((entry) => entry[0] === 'walk' && entry[1] === 2));
    releasingStream.socket.send(JSON.stringify({ kind: 'release' }));
    await releasingStream.next((message) => message.kind === 'release-ack');
    assert.deepEqual(releasingRpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
    assert.equal(releasingRpc.calls.filter((entry) => entry[0] === 'release').length, 1);

    const concurrentRpc = fakeRpc({ slowWalkAt: 2 });
    const concurrent = await fixture({ rpc: concurrentRpc });
    const concurrentSession = await createSession(concurrent.baseUrl);
    const concurrentStream = createStream(concurrent.baseUrl, concurrentSession.sessionId);
    await concurrentStream.opened;
    await concurrentStream.next((message) => message.kind === 'stream-ready');
    concurrentStream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }));
    await waitUntil(() => concurrentRpc.calls.some((entry) => entry[0] === 'walk' && entry[1] === 2));
    concurrentStream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 2, velocity: { x: 0.2, y: 0, z: 0 } }));
    await waitUntil(() => concurrentRpc.calls.some((entry) => entry[0] === 'release'));
    assert.equal(concurrentRpc.calls.some((entry) => entry[0] === 'walk' && entry[2].x === 0.2), false);
    assert.deepEqual(concurrentRpc.calls.filter((entry) => entry[0] === 'walk').at(-1)[2], { x: 0, y: 0, z: 0 });
  });

  test('closes and releases on bootstrap timeout, socket loss, command error, renewal error and gateway shutdown', async () => {
    const timeout = await fixture({ bootstrapMs: 45, inactivityMs: 20 });
    const timeoutSession = await createSession(timeout.baseUrl);
    const timeoutStream = createStream(timeout.baseUrl, timeoutSession.sessionId);
    await timeoutStream.opened;
    await timeoutStream.next((message) => message.kind === 'stream-ready');
    await waitUntil(() => timeout.rpc.calls.some((entry) => entry[0] === 'release'));

    const lost = await fixture();
    const lostSession = await createSession(lost.baseUrl);
    const lostStream = createStream(lost.baseUrl, lostSession.sessionId);
    await lostStream.opened;
    await lostStream.next((message) => message.kind === 'stream-ready');
    lostStream.socket.terminate();
    await waitUntil(() => lost.rpc.calls.some((entry) => entry[0] === 'release'));

    const commandRpc = fakeRpc({ failWalkAt: 2 });
    const command = await fixture({ rpc: commandRpc });
    const commandSession = await createSession(command.baseUrl);
    const commandStream = createStream(command.baseUrl, commandSession.sessionId);
    await commandStream.opened;
    await commandStream.next((message) => message.kind === 'stream-ready');
    commandStream.socket.send(JSON.stringify({ kind: 'input', inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } }));
    await waitUntil(() => commandRpc.calls.some((entry) => entry[0] === 'release'));

    const renewRpc = fakeRpc({ failRenew: true });
    const renewing = await fixture({ rpc: renewRpc, renewIntervalMs: 25 });
    const renewingSession = await createSession(renewing.baseUrl);
    const renewingStream = createStream(renewing.baseUrl, renewingSession.sessionId);
    await renewingStream.opened;
    await renewingStream.next((message) => message.kind === 'stream-ready');
    await waitUntil(() => renewRpc.calls.some((entry) => entry[0] === 'release'));

    const shuttingDown = await fixture();
    const shutdownSession = await createSession(shuttingDown.baseUrl);
    const shutdownStream = createStream(shuttingDown.baseUrl, shutdownSession.sessionId);
    await shutdownStream.opened;
    await shutdownStream.next((message) => message.kind === 'stream-ready');
    await shuttingDown.gateway.close();
    assert.equal(shuttingDown.rpc.calls.filter((entry) => entry[0] === 'release').length, 1);
  });
});
