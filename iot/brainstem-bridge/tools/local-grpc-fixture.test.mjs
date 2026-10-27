import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import tls from 'node:tls';
import { createRequire } from 'node:module';
import { createLocalGrpcFixture, frameMessage, unframeMessage, requestLocalGrpc, STATUS_PATH, SERVICE, GRPC, MAX_MESSAGE_BYTES } from './local-grpc-fixture.mjs';
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
