import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import tls from 'node:tls';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createLocalGrpcFixture, createLocalControlFixture, frameMessage, unframeMessage, requestLocalGrpc, STATUS_PATH, SERVICE, GRPC, MAX_MESSAGE_BYTES, summarizeSamples } from './local-grpc-fixture.mjs';
import { createFixtureClient, runPcBaseline } from './local-grpc-measure.mjs';
const require = createRequire(import.meta.url);

test('real loopback TLS/HTTP2 gRPC fixture enforces status-only observer access', async (t) => {
  const fixture = await createLocalGrpcFixture({ testOnly: true, timeoutMs: 500 });
  const { credentials, protocol, origin } = fixture;
  const call = (options = {}) => requestLocalGrpc({ origin, ca: credentials.ca, ...credentials.observer, ...options });
  const readStatus = (result) => protocol.statusType.toObject(protocol.statusType.decode(unframeMessage(result.body)), { enums: String, longs: String, defaults: true });
  let baseline;
  try {
    await t.test('loopback random port, actual proto fields, explicit SIMULATION marker', async () => {
      assert.equal(fixture.host, '127.0.0.1');
      assert.ok(fixture.port > 0);
      const result = await call();
      assert.equal(result.statusCode, GRPC.OK);
      assert.equal(result.simulation, true);
      assert.equal(result.headers['x-doso-simulation'], 'true');
      baseline = readStatus(result);
      assert.equal(baseline.fsm.kind, 'CMS_STATE_KIND_GROUNDED');
      assert.equal(baseline.fsm.transition, 'CMS_TRANSITION_KIND_NONE');
      assert.equal(baseline.motorOutputEnabled, false);
      assert.equal(baseline.owner, 'CONTROL_OWNER_NONE');
      assert.equal(baseline.grpcLeaseActive, false);
      assert.equal(baseline.leaseRemainingMs, 0);
      assert.equal(baseline.readyForWalk, false);
      assert.equal(baseline.ownerId, 'SIMULATION');
      assert.equal(baseline.acceptedCount, '0');
      assert.equal(baseline.rejectedCount, '0');
    });
    await t.test('missing client certificate fails TLS', async () => {
      await assert.rejects(call({ cert: undefined, key: undefined }));
    });
    await t.test('wrong server CA fails certificate verification', async () => {
      await assert.rejects(call({ ca: credentials.wrongCa }), /certificate|issuer|verify|self.signed/i);
    });
    await t.test('client signed by wrong CA fails TLS', async () => {
      await assert.rejects(call({ ...credentials.wrongClient }));
    });
    await t.test('same-CA same-CN different leaf is denied', async () => {
      assert.equal((await call({ ...credentials.unauthorized })).statusCode, GRPC.PERMISSION_DENIED);
    });
    await t.test('every other real proto method denied without state changes', async () => {
      for (const method of protocol.methods) {
        if (method === 'GetControlStatus') continue;
        const result = await call({ rpcPath: `/${SERVICE}/${method}` });
        assert.equal(result.statusCode, GRPC.PERMISSION_DENIED, method);
        assert.equal(result.body.length, 0, method);
      }
      assert.deepEqual(readStatus(await call()), baseline);
    });
    await t.test('unknown methods are unimplemented', async () => {
      assert.equal((await call({ rpcPath: `/${SERVICE}/NotAMethod` })).statusCode, GRPC.UNIMPLEMENTED);
      assert.equal((await call({ rpcPath: '/other.Service/GetControlStatus' })).statusCode, GRPC.UNIMPLEMENTED);
    });
    await t.test('malformed, compressed, multiple, nonempty and truncated frames denied', async () => {
      const malformed = [Buffer.alloc(0), Buffer.from([0]), Buffer.from([1, 0, 0, 0, 0]), Buffer.from([0, 0, 0, 0, 1]), Buffer.concat([frameMessage(), frameMessage()]), frameMessage(Buffer.from([0x80])), frameMessage(Buffer.from([8, 1]))];
      for (const body of malformed) assert.equal((await call({ body })).statusCode, GRPC.INVALID_ARGUMENT);
    });
    await t.test('declared or actual size above 64 KiB denied', async () => {
      const prefix = Buffer.alloc(5);
      prefix.writeUInt32BE(MAX_MESSAGE_BYTES + 1, 1);
      assert.equal((await call({ body: prefix })).statusCode, GRPC.RESOURCE_EXHAUSTED);
      assert.equal((await call({ body: frameMessage(Buffer.alloc(MAX_MESSAGE_BYTES + 1)) })).statusCode, GRPC.RESOURCE_EXHAUSTED);
    });
    await t.test('client rejects non-loopback endpoint configuration', () => {
      assert.throws(() => requestLocalGrpc({ origin: 'https://192.168.1.1:50051' }), /restricted/);
    });
    await t.test('listener configuration cannot be broadened', async () => {
      await assert.rejects(createLocalGrpcFixture({ host: '0.0.0.0' }), /no configurable/);
      await assert.rejects(createLocalGrpcFixture({ port: 50051 }), /no configurable/);
    });
    await t.test('unfinished requests receive deadline status and release resources', async () => {
      const socket = tls.connect({ host: '127.0.0.1', port: fixture.port, ca: credentials.ca, ...credentials.observer, rejectUnauthorized: true, ALPNProtocols: ['h2'], checkServerIdentity: (_host, peer) => tls.checkServerIdentity('127.0.0.1', peer) });
      const session = http2.connect(origin, { createConnection: () => socket });
      socket.on('error', () => {});
      session.on('error', () => {});
      try {
        const code = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Deadline response did not arrive')), 2_000);
          const request = session.request({ ':method': 'POST', ':path': STATUS_PATH, 'content-type': 'application/grpc+proto', te: 'trailers' });
          request.on('error', reject);
          request.on('close', () => clearTimeout(timer));
          request.on('trailers', (trailers) => resolve(Number(trailers['grpc-status'])));
          request.resume();
          request.write(Buffer.from([0]));
        });
        assert.equal(code, GRPC.DEADLINE_EXCEEDED);
      } finally { session.destroy(); socket.destroy(); }
    });
    await t.test('official grpc-js client validates TLS, framing and trailers independently', async () => {
      const grpc = require('@grpc/grpc-js');
      const client = new grpc.Client(`127.0.0.1:${fixture.port}`, grpc.credentials.createSsl(Buffer.from(credentials.ca), Buffer.from(credentials.observer.key), Buffer.from(credentials.observer.cert)));
      try {
        const result = await new Promise((resolve, reject) => {
          client.makeUnaryRequest(STATUS_PATH, (value) => Buffer.from(protocol.emptyType.encode(value).finish()), (bytes) => protocol.statusType.decode(bytes), {}, { deadline: Date.now() + 3_000 }, (error, value) => error ? reject(error) : resolve(value));
        });
        assert.equal(result.fsm.kind, 1);
        assert.equal(result.motorOutputEnabled, false);
        assert.equal(result.ownerId, 'SIMULATION');
        await assert.rejects(new Promise((resolve, reject) => {
          client.makeUnaryRequest(`/${SERVICE}/Enable`, () => Buffer.alloc(0), (bytes) => bytes, {}, { deadline: Date.now() + 3_000 }, (error, value) => error ? reject(error) : resolve(value));
        }), (error) => error.code === grpc.status.PERMISSION_DENIED);
      } finally { client.close(); }
    });
  } finally { await fixture.close(); }
  await t.test('server stopped, old endpoint no longer accepts requests', async () => {
    await assert.rejects(call());
    await fixture.close();
  });
});

test('PC control receiver simulates leases, ACKs and bounded timing without robot dependencies', async (t) => {
  const fixture = await createLocalControlFixture({ maxRecords: 3, leaseDurationMs: 100 });
  const client = createFixtureClient(fixture);
  const other = createFixtureClient(fixture, 'other@dev');
  const acquire = async () => {
    const value = await client.call('AcquireControl', { clientId: 'pc-baseline@dev' });
    assert.equal(value.accepted, true); assert.equal(value.status.ownerId, 'pc-baseline@dev'); return value.token;
  };
  const walk = (token, sequence, x = 0, timeoutMs) => client.call('WalkChecked', { token, sequence: String(sequence), direction: { x, y: 0, z: 0 } }, timeoutMs);
  try {
    await t.test('starts grounded, unsupported methods fail, fake motor telemetry is offline', async () => {
      const status = await client.call('GetControlStatus');
      assert.equal(status.motorOutputEnabled, false); assert.equal(status.ownerId, 'SIMULATION');
      assert.deepEqual((await client.call('GetVoltage')).values, Array(16).fill(0));
      assert.equal((await client.call('GetMotorStatus')).motors.every((motor) => !motor.online), true);
      await assert.rejects(client.call('Walk', { x: 0 }), (error) => error.code === 12);
      await assert.rejects(client.call('AcquireControl', { clientId: 'wrong@dev' }), (error) => error.code === 7);
      assert.equal((await client.call('AcquireControl', { clientId: 'pc-baseline@dev' })).accepted, false);
    });
    await client.call('Enable'); await client.call('StandUp');
    await t.test('initial zero, exact replay, sequence violation and owner validation', async () => {
      const token = await acquire();
      assert.equal((await walk(token, 1, .1)).reason, 6);
      await assert.rejects(other.call('WalkChecked', { token, sequence: '1', direction: { x: 0, y: 0, z: 0 } }), (error) => error.code === 7);
      assert.equal((await walk(token, 1)).accepted, true);
      assert.equal((await walk(token, 1)).accepted, true);
      assert.equal((await walk(token, 3)).reason, 2);
      assert.equal((await client.call('GetControlStatus')).grpcLeaseActive, false);
    });
    await t.test('lease expiry removes simulated motion with no extra incoming frames', async () => {
      const token = await acquire();
      await walk(token, 1); await sleep(22); await walk(token, 2, .1);
      assert.equal(fixture.snapshot().moving, true);
      await sleep(130);
      const snapshot = fixture.snapshot();
      assert.equal(snapshot.moving, false); assert.equal(snapshot.status.grpcLeaseActive, false);
      assert.equal(snapshot.lastStop.reason, 8);
      assert.equal((await walk(token, 3)).accepted, false);
    });
    await t.test('renew and neutral/release keep lease and sequence semantics', async () => {
      const token = await acquire(); await walk(token, 1);
      assert.equal((await client.call('RenewControlLease', { token })).accepted, true);
      await sleep(22); assert.equal((await walk(token, 2)).accepted, true);
      const release = await client.call('ReleaseControl', { token });
      assert.equal(release.grpcLeaseActive, false); assert.equal(release.ownerId, 'SIMULATION');
    });
    await t.test('controlled wrong sequence and rejection ACKs', async () => {
      let token = await acquire(); fixture.setFault({ ackSequenceOffset: 1 });
      const ack = await walk(token, 1); assert.equal(ack.accepted, true); assert.equal(ack.sequence, '2');
      await client.call('ReleaseControl', { token });
      fixture.setFault({ rejectReason: 5 }); token = await acquire();
      const rejected = await walk(token, 1); assert.equal(rejected.accepted, false); assert.equal(rejected.reason, 5);
      fixture.setFault();
      assert.throws(() => fixture.setFault({ delayMs: -1 }), /Invalid/);
      assert.throws(() => fixture.setFault({ robot: true }), /Invalid/);
    });
    await t.test('delayed ACK observes client deadline; no retry; lease expires', async () => {
      const token = await acquire(); fixture.setFault({ delayMs: 150 });
      const before = fixture.snapshot().received;
      await assert.rejects(walk(token, 1, 0, 40), (error) => error.code === 4);
      await sleep(130); fixture.setFault();
      assert.equal(fixture.snapshot().received, before + 1);
      assert.equal(fixture.snapshot().status.grpcLeaseActive, false);
    });
    await t.test('bounded records redact tokens/principals and preserve monotonic times', () => {
      const snapshot = fixture.snapshot();
      assert.equal(snapshot.source, 'SIMULATION'); assert.equal(snapshot.retainedRecords, 3);
      assert.ok(snapshot.droppedRecords > 0); assert.ok(snapshot.records.every((record, index) => index === 0 || record.monoMs >= snapshot.records[index - 1].monoMs));
      assert.ok(snapshot.intervalMs.count <= 3);
      assert.equal(JSON.stringify(snapshot).includes('pc-baseline@dev'), false);
      assert.equal(Object.hasOwn(snapshot.records[0], 'token'), false);
    });
    await t.test('transport disconnect does not ACK and stop timeout still applies', async () => {
      const token = await acquire(); fixture.setFault({ disconnect: true });
      await assert.rejects(walk(token, 1), (error) => [1, 14].includes(error.code));
      await sleep(130); assert.equal(fixture.snapshot().moving, false);
      assert.equal(fixture.snapshot().status.grpcLeaseActive, false);
    });
  } finally { client.close(); other.close(); await fixture.close(); await fixture.close(); }
  await assert.rejects(createLocalControlFixture({ host: '0.0.0.0' }), /no configurable/);
  await assert.rejects(createLocalControlFixture({ maxRecords: 0 }), /Invalid/);
  assert.deepEqual(summarizeSamples([3, 1, 2]), { count: 3, min: 1, p50: 2, p95: 3, max: 3, mean: 2 });
});

test('PC snapshot counts fixed-proto RPC arrivals without recording request data', async () => {
  const fixture = await createLocalControlFixture();
  const client = createFixtureClient(fixture);
  try {
    const names = Object.keys(fixture.definition).sort();
    assert.deepEqual(Object.keys(fixture.snapshot().rpcCounts).sort(), names);
    assert.ok(Object.values(fixture.snapshot().rpcCounts).every((count) => count === 0));
    for (const method of ['GetControlStatus', 'GetProfile', 'GetVoltage', 'GetMotorStatus']) await client.call(method);
    await client.call('GetControlStatus');
    await assert.rejects(client.call('Walk', { x: .1 }), (error) => error.code === 12);
    const counts = fixture.snapshot().rpcCounts;
    assert.equal(counts.GetControlStatus, 2);
    for (const method of ['GetProfile', 'GetVoltage', 'GetMotorStatus', 'Walk']) assert.equal(counts[method], 1);
    assert.ok(Object.values(counts).every((count) => Number.isSafeInteger(count) && count >= 0));
    assert.equal(JSON.stringify(counts).includes('pc-baseline@dev'), false);
    counts.GetProfile = 999; counts.arbitrary = 1;
    assert.equal(fixture.snapshot().rpcCounts.GetProfile, 1);
    assert.deepEqual(Object.keys(fixture.snapshot().rpcCounts).sort(), names);
  } finally { client.close(); await fixture.close(); }
});

test('PC 50 Hz measurement self-check uses real local gRPC ACKs and closes', async () => {
  const result = await runPcBaseline({ samples: 12 });
  assert.ok(result.received >= 2 && result.received <= 12);
  assert.equal(result.accepted + result.rejected, result.received);
  assert.equal(result.roundTripMs.count, result.received); assert.equal(result.targetHz, 50);
  assert.equal(result.firstFailure === null, result.rejected === 0);
  assert.equal(result.status.grpcLeaseActive, false);
});

test('bounded receiver CLI accepts stdin commands, prints no secrets and stops', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./local-grpc-measure.mjs', import.meta.url)), '--serve'], {
    input: 'snapshot\nfault {"delayMs":150}\nfault {}\nstop\n', encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(lines[0].host, '127.0.0.1'); assert.equal(lines[0].boundedLifetimeMs, 600_000);
  assert.ok(lines[0].port > 0); assert.ok(lines.every((line) => line.source === 'SIMULATION'));
  assert.equal(lines.filter((line) => line.faultUpdated).length, 2);
  assert.equal(result.stdout.includes('token'), false);
});
