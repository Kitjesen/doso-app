import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/brainstemSimulation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { BrainstemSimulationError, createBrainstemSimulationController } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const session = () => ({
  schemaVersion: 1, simulationOnly: true, sessionId: SESSION_ID, ready: true,
  leaseDurationMs: 300, limits: { linearMps: 0.25, yawRps: 0.5 },
});
const release = () => ({ schemaVersion: 1, simulationOnly: true, sessionId: SESSION_ID, zeroAcknowledged: true, released: true });
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function fakeTimers() {
  let now = 0;
  let id = 0;
  const entries = new Map();
  return {
    api: {
      setTimeout(callback, delayMs) { const handle = ++id; entries.set(handle, { callback, at: now + delayMs }); return handle; },
      clearTimeout(handle) { entries.delete(handle); },
    },
    async advance(ms) {
      now += ms;
      while (true) {
        const due = [...entries.entries()].filter(([, item]) => item.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        for (const [handle, item] of due) {
          if (!entries.delete(handle)) continue;
          item.callback();
          await settle();
        }
      }
    },
    get count() { return entries.size; },
  };
}

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function fixture(overrides = {}) {
  const timers = fakeTimers();
  const calls = [];
  let grpcSequence = 0;
  const fetchImpl = overrides.fetchImpl ?? (async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    const input = JSON.parse(init.body);
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: input.inputSequence,
      gRpcSequence: ++grpcSequence, status: 'accepted' });
  });
  const controller = createBrainstemSimulationController({
    developmentMode: true, clientId: 'doso-app-test', fetchImpl, timers: timers.api,
    ...overrides.options,
  });
  return { calls, controller, timers };
}

const putBodies = calls => calls.filter(call => call.init.method === 'PUT').map(call => call.body);
const errorCode = expected => error => error instanceof BrainstemSimulationError && error.code === expected;

test('a rising sequence with non-accepted status is rejected on both HTTP and stream paths', async () => {
  for(const status of ['rejected','replayed']) for(const stream of [false,true]) {
    let sequence=0;
    const badAck=input=>({schemaVersion:1,simulationOnly:true,accepted:true,sessionId:SESSION_ID,inputSequence:input.inputSequence,gRpcSequence:++sequence,status});
    const f=fixture({fetchImpl:async(_url,init)=>init.method==='POST'?json(session()):init.method==='DELETE'?json(release()):json(badAck(JSON.parse(init.body))),options:stream?{createInputChannel:async()=>({sendInput:async input=>badAck(input),release:async()=>release(),close(){}})}:{}});
    await f.controller.connect();f.controller.setDrive({x:0,y:-1});await settle();
    assert.equal(f.controller.getSnapshot().phase,'error');assert.equal(f.controller.getSnapshot().errorCode,'invalid_response');
    assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity,{x:0,y:0,z:0});await f.controller.dispose();
  }
});

test('late HTTP and stream ACKs expire even when the timer callback has not run', async () => {
  for(const stream of [false,true]) {
    const lateAck=async input=>{await new Promise(resolve=>setTimeout(resolve,25));return{schemaVersion:1,simulationOnly:true,accepted:true,sessionId:SESSION_ID,inputSequence:input.inputSequence,gRpcSequence:1,status:'accepted'};};
    const f=fixture({fetchImpl:async(_url,init)=>init.method==='POST'?json(session()):init.method==='DELETE'?json(release()):json(await lateAck(JSON.parse(init.body))),options:{inputTimeoutMs:5,...(stream?{createInputChannel:async()=>({sendInput:lateAck,release:async()=>release(),close(){}})}:{})}});
    await f.controller.connect();f.controller.setDrive({x:0,y:-1});
    // Intentionally never advance the fake timer queue: only the absolute
    // deadline check can reject this already-late response.
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(f.controller.getSnapshot().phase,'error');assert.equal(f.controller.getSnapshot().errorCode,'timeout');
    assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity,{x:0,y:0,z:0});await f.controller.dispose();
  }
});

test('only the fixed development loopback gateway is accepted and requests omit credentials', async () => {
  for (const [endpoint, developmentMode = true] of [
    ['http://localhost:8122'], ['http://10.0.2.2:8122'], ['http://127.0.0.1:8123'],
    ['https://127.0.0.1:8122'], ['http://127.0.0.1:8122/path'], ['http://127.0.0.1:8122?x=1'],
    ['http://127.0.0.1:8122', false],
  ]) assert.throws(() => createBrainstemSimulationController({ developmentMode, clientId: 'doso-app', endpoint }), errorCode('config'));
  const f = fixture();
  await f.controller.connect();
  assert.equal(f.calls[0].url, 'http://127.0.0.1:8122/api/v1/simulation/sessions');
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.equal(f.calls[0].init.credentials, 'omit');
  assert.deepEqual(f.calls[0].body, { clientId: 'doso-app-test' });
  assert.equal(f.controller.getSnapshot().phase, 'ready');
});

test('drive and turn map into bounded Brainstem body velocity', async () => {
  const f = fixture();
  await f.controller.connect();
  f.controller.setDrive({ x: 2, y: -0.8 });
  await settle();
  f.controller.setTurn({ x: 0.5, y: 1 });
  await settle();
  assert.deepEqual(putBodies(f.calls).map(item => item.velocity), [
    { x: 0.2, y: -0.25, z: 0 },
    { x: 0.2, y: -0.25, z: -0.25 },
  ]);
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0.2, y: -0.25, z: -0.25 });
});

test('releasing one stick preserves the other; full release immediately acknowledges zero', async () => {
  const f = fixture();
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  await settle();
  f.controller.setTurn({ x: 1, y: 0 });
  await settle();
  f.controller.setDrive({ x: 0, y: 0 });
  await settle();
  f.controller.setTurn({ x: 0, y: 0 });
  await settle();
  assert.deepEqual(putBodies(f.calls).map(item => item.velocity), [
    { x: 0.25, y: 0, z: 0 },
    { x: 0.25, y: 0, z: -0.5 },
    { x: 0, y: 0, z: -0.5 },
    { x: 0, y: 0, z: 0 },
  ]);
});

test('a held input is renewed every 50ms and stop sends zero while retaining the session', async () => {
  const f = fixture();
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  await settle();
  await f.timers.advance(50);
  assert.deepEqual(putBodies(f.calls).map(item => item.velocity), [
    { x: 0.25, y: 0, z: 0 }, { x: 0.25, y: 0, z: 0 },
  ]);
  await f.controller.stop();
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
  assert.equal(f.calls.some(call => call.init.method === 'DELETE'), false);
});

test('network updates are serialized and a queued change sends only the latest intent', async () => {
  const first = deferred();
  const calls = [];
  let puts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    puts += 1;
    if (puts === 1) return first.promise;
    const body = JSON.parse(init.body);
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: body.inputSequence, gRpcSequence: puts, status: 'accepted' });
  } });
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  f.controller.setDrive({ x: 1, y: 0 });
  f.controller.setTurn({ x: 1, y: 0 });
  await settle();
  assert.equal(calls.filter(call => call.init.method === 'PUT').length, 1);
  first.resolve(json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: 1, gRpcSequence: 1, status: 'accepted' }));
  await settle();
  const inputs = calls.filter(call => call.init.method === 'PUT').map(call => call.body);
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[1].velocity, { x: 0, y: -0.25, z: -0.5 });
});

test('disconnect releases through gateway zero acknowledgement and a late ACK cannot reactivate', async () => {
  const pending = deferred();
  let puts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    f.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    puts += 1;
    return pending.promise;
  } });
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  const stopped = f.controller.disconnect();
  await stopped;
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
  assert.equal(f.calls.filter(call => call.init.method === 'DELETE').length, 1);
  pending.resolve(json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: 1, gRpcSequence: 1, status: 'accepted' }));
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
  assert.equal(puts, 1);
});

test('repeated disconnect shares one release and connect waits without an old completion clobbering ready', async () => {
  const pendingRelease = deferred();
  const calls = [];
  let posts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') { posts += 1; return json(session()); }
    if (init.method === 'DELETE') return pendingRelease.promise;
    const body = JSON.parse(init.body);
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID,
      inputSequence: body.inputSequence, gRpcSequence: body.inputSequence, status: 'accepted' });
  } });
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  await settle();
  const first = f.controller.disconnect();
  const second = f.controller.disconnect();
  assert.equal(first, second);
  assert.equal(f.controller.getSnapshot().phase, 'stopping');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0.25, y: 0, z: 0 });
  const reconnecting = f.controller.connect();
  await settle();
  assert.equal(posts, 1);
  assert.equal(calls.filter(call => call.init.method === 'DELETE').length, 1);
  pendingRelease.resolve(json(release()));
  await Promise.all([first, second, reconnecting]);
  assert.equal(posts, 2);
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
});

test('failed old release preserves the last ACK and cannot overwrite a later ready session', async () => {
  const pendingRelease = deferred();
  let posts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    f.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') { posts += 1; return json(session()); }
    if (init.method === 'DELETE') return pendingRelease.promise;
    const body = JSON.parse(init.body);
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID,
      inputSequence: body.inputSequence, gRpcSequence: body.inputSequence, status: 'accepted' });
  } });
  await f.controller.connect();
  f.controller.setTurn({ x: 1, y: 0 });
  await settle();
  const disconnecting = f.controller.disconnect();
  const reconnecting = f.controller.connect();
  pendingRelease.resolve(json({ schemaVersion: 1, simulationOnly: true, sessionId: SESSION_ID,
    zeroAcknowledged: false, released: false }));
  await Promise.all([disconnecting, reconnecting]);
  assert.equal(posts, 2);
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
});

test('leaving during connect cleans up a session acquired by a transport that ignored abort', async () => {
  const pending = deferred();
  const calls = [];
  const f = fixture({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') return pending.promise;
    if (init.method === 'DELETE') return json(release());
    throw new Error('unexpected input');
  } });
  const connecting = f.controller.connect();
  const disconnecting = f.controller.disconnect();
  assert.equal(f.controller.getSnapshot().phase, 'stopping');
  pending.resolve(json(session()));
  await Promise.all([connecting, disconnecting]);
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
  assert.equal(calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('reconnect cannot start behind an unresolved acquire and waits for late lease cleanup', async () => {
  const pendingAcquire = deferred();
  const calls = [];
  let posts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') {
      posts += 1;
      return posts === 1 ? pendingAcquire.promise : json(session());
    }
    if (init.method === 'DELETE') return json(release());
    throw new Error('unexpected input');
  } });
  const firstConnect = f.controller.connect();
  const disconnecting = f.controller.disconnect();
  const reconnectDuringCleanup = f.controller.connect();
  assert.equal(reconnectDuringCleanup, firstConnect);
  await settle();
  assert.equal(posts, 1);
  assert.equal(f.controller.getSnapshot().phase, 'stopping');
  pendingAcquire.resolve(json(session()));
  await Promise.all([firstConnect, disconnecting, reconnectDuringCleanup]);
  assert.equal(calls.filter(call => call.init.method === 'DELETE').length, 1);
  assert.equal(posts, 1);
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
  await f.controller.connect();
  assert.equal(posts, 2);
  assert.equal(f.controller.getSnapshot().phase, 'ready');
});

test('failed cleanup of a late-acquired lease blocks safe disconnected state and no background reconnect starts', async () => {
  const pendingAcquire = deferred();
  let posts = 0;
  const f = fixture({ fetchImpl: async (url, init) => {
    f.calls.push({ url, init });
    if (init.method === 'POST') { posts += 1; return pendingAcquire.promise; }
    if (init.method === 'DELETE') return json({ schemaVersion: 1, simulationOnly: true,
      sessionId: SESSION_ID, zeroAcknowledged: false, released: false });
    throw new Error('unexpected input');
  } });
  const connecting = f.controller.connect();
  const disconnecting = f.controller.disconnect();
  f.controller.connect();
  pendingAcquire.resolve(json(session()));
  await Promise.allSettled([connecting, disconnecting]);
  assert.equal(posts, 1);
  assert.equal(f.controller.getSnapshot().phase, 'error');
  assert.equal(f.controller.getSnapshot().errorCode, 'invalid_response');
  assert.deepEqual(f.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
});

test('invalid input and mismatched ACK invalidate the session and request release', async () => {
  const invalid = fixture();
  await invalid.controller.connect();
  assert.throws(() => invalid.controller.setDrive({ x: Number.NaN, y: -1 }), errorCode('invalid_input'));
  await settle();
  assert.equal(invalid.controller.getSnapshot().phase, 'error');
  assert.deepEqual(invalid.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: 0 });
  assert.equal(invalid.calls.filter(call => call.init.method === 'DELETE').length, 1);

  const mismatch = fixture({ fetchImpl: async (url, init) => {
    mismatch.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: 999, gRpcSequence: 1, status: 'accepted' });
  } });
  await mismatch.controller.connect();
  mismatch.controller.setTurn({ x: 1, y: 0 });
  await settle();
  assert.equal(mismatch.controller.getSnapshot().phase, 'error');
  assert.equal(mismatch.calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('a replayed gRPC acknowledgement invalidates and releases the session', async () => {
  let puts = 0;
  const replay = fixture({ fetchImpl: async (url, init) => {
    replay.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    const body = JSON.parse(init.body);
    puts += 1;
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID, inputSequence: body.inputSequence,
      gRpcSequence: 1, status: puts === 1 ? 'accepted' : 'replayed' });
  } });
  await replay.controller.connect();
  replay.controller.setDrive({ x: 0, y: -1 });
  await settle();
  replay.controller.setTurn({ x: 1, y: 0 });
  await settle();
  assert.equal(replay.controller.getSnapshot().phase, 'error');
  assert.equal(replay.controller.getSnapshot().errorCode, 'invalid_response');
  assert.equal(replay.calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('input timeout does not retry uncertain nonzero motion and releases the session', async () => {
  const f = fixture({ fetchImpl: async (url, init) => {
    f.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    return new Promise(() => {});
  } });
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  await f.timers.advance(180);
  assert.equal(f.controller.getSnapshot().phase, 'error');
  assert.equal(f.controller.getSnapshot().errorCode, 'timeout');
  assert.equal(f.calls.filter(call => call.init.method === 'PUT').length, 1);
  assert.equal(f.calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('PUT and DELETE acknowledgements require the simulation schema and never claim unacknowledged zero', async () => {
  const missingPutSchema = fixture({ fetchImpl: async (url, init) => {
    missingPutSchema.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json(release());
    const body = JSON.parse(init.body);
    return json({ accepted: true, sessionId: SESSION_ID, inputSequence: body.inputSequence,
      gRpcSequence: 1, status: 'accepted' });
  } });
  await missingPutSchema.controller.connect();
  missingPutSchema.controller.setDrive({ x: 0, y: -1 });
  await settle();
  assert.equal(missingPutSchema.controller.getSnapshot().phase, 'error');

  const badRelease = fixture({ fetchImpl: async (url, init) => {
    badRelease.calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') return json(session());
    if (init.method === 'DELETE') return json({ sessionId: SESSION_ID, zeroAcknowledged: true, released: true });
    const body = JSON.parse(init.body);
    return json({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID,
      inputSequence: body.inputSequence, gRpcSequence: 1, status: 'accepted' });
  } });
  await badRelease.controller.connect();
  badRelease.controller.setTurn({ x: 1, y: 0 });
  await settle();
  await badRelease.controller.disconnect();
  assert.equal(badRelease.controller.getSnapshot().phase, 'error');
  assert.deepEqual(badRelease.controller.getSnapshot().lastAcknowledgedVelocity, { x: 0, y: 0, z: -0.5 });
});

test('an injected input channel must finish its handshake before ready and replaces PUT/DELETE transport', async () => {
  const opened = deferred();
  const sent = [];
  let released = 0;
  let closed = 0;
  const channel = {
    async sendInput(input) {
      sent.push(input);
      return { schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID,
        inputSequence: input.inputSequence, gRpcSequence: input.inputSequence + 1, status: 'accepted', kind: 'input-ack' };
    },
    async release() {
      released += 1;
      return { ...release(), kind: 'release-ack' };
    },
    close() { closed += 1; },
  };
  const f = fixture({ options: { createInputChannel: async () => opened.promise } });
  const connecting = f.controller.connect();
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'connecting');
  opened.resolve(channel);
  await connecting;
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  f.controller.setDrive({ x: 0, y: -1 });
  await settle();
  assert.deepEqual(sent[0].velocity, { x: 0.25, y: 0, z: 0 });
  assert.equal(f.calls.some(call => call.init.method === 'PUT'), false);
  await f.controller.disconnect();
  assert.equal(released, 1);
  assert.equal(closed, 1);
  assert.equal(f.calls.some(call => call.init.method === 'DELETE'), false);
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
});

test('a channel handshake timeout aborts the factory and releases the acquired HTTP session', async () => {
  let aborted = false;
  const f = fixture({ options: { createInputChannel: ({ signal }) => {
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    return new Promise(() => {});
  } } });
  const connecting = f.controller.connect();
  await settle();
  const failed = connecting.then(() => undefined, () => undefined);
  await f.timers.advance(1500);
  await failed;
  assert.equal(aborted, true);
  assert.equal(f.calls.filter(call => call.init.method === 'DELETE').length, 1);
  assert.equal(f.controller.getSnapshot().phase, 'error');
  assert.equal(f.controller.getSnapshot().errorCode, 'timeout');
});

test('disconnect during channel handshake aborts it, releases the acquired session, and stays disconnected', async () => {
  const pendingChannel = deferred();
  let aborted = false;
  const f = fixture({ options: { createInputChannel: ({ signal }) => {
    signal.addEventListener('abort', () => {
      aborted = true;
      pendingChannel.resolve(Promise.reject(new BrainstemSimulationError('unavailable')));
    }, { once: true });
    return pendingChannel.promise;
  } } });
  const connecting = f.controller.connect();
  await settle();
  const disconnecting = f.controller.disconnect();
  await Promise.all([connecting, disconnecting]);
  assert.equal(aborted, true);
  assert.equal(f.calls.filter(call => call.init.method === 'DELETE').length, 1);
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
});

test('disconnect releases a channel while input ACK is pending and ignores its late completion', async () => {
  const pendingInput = deferred();
  let releases = 0;
  const channel = {
    sendInput() { return pendingInput.promise; },
    async release() { releases += 1; return { ...release(), kind: 'release-ack' }; },
    close() {},
  };
  const f = fixture({ options: { createInputChannel: async () => channel } });
  await f.controller.connect();
  f.controller.setDrive({ x: 0, y: -1 });
  await settle();
  await f.controller.disconnect();
  assert.equal(releases, 1);
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
  pendingInput.resolve({ schemaVersion: 1, simulationOnly: true, accepted: true, sessionId: SESSION_ID,
    inputSequence: 1, gRpcSequence: 2, status: 'accepted', kind: 'input-ack' });
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'disconnected');
});
