import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import grpc from '@grpc/grpc-js';
import { loadRobotControl } from '../src/proto.js';
import { shutdownGrpc, startLocalProtocolFixture } from '../tools/local-protocol-fixture.js';

const TOKEN = 'fixture-token-0123456789-ABCDEFGHIJKLMN';
const protoRoot = process.env.DOSO_BRAINSTEM_PROTO_ROOT;
const WRITE_METHODS = Object.freeze([
  'Enable', 'Disable', 'Walk', 'WalkChecked', 'AcquireControl', 'RenewControlLease',
  'ReleaseControl', 'StandUp', 'SitDown', 'SetSpeedMode', 'Tick', 'Step',
  'SwitchProfile', 'PlayGesture', 'ClearMotorFault', 'SetZero',
]);
const STREAM_METHODS = Object.freeze(['ListenHistory', 'ListenCmsState', 'ListenImu', 'ListenJoint']);
const RPC_DEADLINE_MS = 1_000;

function unary(client, methodName) {
  const clientMethod = `${methodName[0].toLowerCase()}${methodName.slice(1)}`;
  return new Promise((resolve, reject) => {
    client[clientMethod](
      {},
      { deadline: new Date(Date.now() + RPC_DEADLINE_MS) },
      (error, value) => error ? reject(error) : resolve(value),
    );
  });
}

function serverStream(client, methodName) {
  const clientMethod = `${methodName[0].toLowerCase()}${methodName.slice(1)}`;
  return new Promise((resolve, reject) => {
    const call = client[clientMethod]({}, { deadline: new Date(Date.now() + RPC_DEADLINE_MS) });
    call.once('data', () => reject(new Error(`${methodName} unexpectedly returned data`)));
    call.once('error', (error) => error?.code === grpc.status.UNIMPLEMENTED ? resolve() : reject(error));
    call.once('end', () => reject(new Error(`${methodName} ended without UNIMPLEMENTED`)));
  });
}

test('CLI refuses to start without the explicit local fixture opt-in', () => {
  const result = spawnSync(process.execPath, [join('tools', 'local-protocol-fixture.js')], {
    cwd: join(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, DOSO_BRAINSTEM_BEARER_TOKEN: TOKEN },
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(TOKEN, 'u'));
});

test('serves a fixed grounded read-only snapshot and rejects every write RPC', async () => {
  assert.ok(protoRoot, 'Set DOSO_BRAINSTEM_PROTO_ROOT to the directory containing brainstem_api/cms.proto');
  const logs = [];
  const fixture = await startLocalProtocolFixture({
    protoRoot,
    bearerToken: TOKEN,
    httpPort: 0,
    log: (entry) => logs.push(entry),
  });
  const RobotControl = await loadRobotControl(protoRoot);
  const client = new RobotControl(
    `127.0.0.1:${fixture.grpc.port}`,
    grpc.credentials.createInsecure(),
    { 'grpc.enable_http_proxy': 0 },
  );
  try {
    assert.equal(fixture.grpc.host, '127.0.0.1');
    assert.equal(fixture.http.host, '127.0.0.1');

    const response = await fetch(`http://127.0.0.1:${fixture.http.port}/api/v1/brainstem/status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.state, {
      kind: 'CMS_STATE_KIND_GROUNDED',
      transition: 'CMS_TRANSITION_KIND_NONE',
    });
    assert.deepEqual(body.control, {
      owner: 'CONTROL_OWNER_NONE',
      motorOutputEnabled: false,
      criticalMotorFault: false,
    });
    assert.equal(body.access, 'read-only');

    const directStatus = await unary(client, 'GetControlStatus');
    assert.equal(directStatus.fsm.kind, 'CMS_STATE_KIND_GROUNDED');
    assert.equal(directStatus.owner, 'CONTROL_OWNER_NONE');
    assert.equal(directStatus.motorOutputEnabled, false);
    assert.equal(directStatus.criticalMotorFault, false);

    for (const methodName of WRITE_METHODS) {
      await assert.rejects(unary(client, methodName), (error) => error?.code === grpc.status.UNIMPLEMENTED);
    }
    for (const methodName of STREAM_METHODS) await serverStream(client, methodName);

    const serializedLogs = JSON.stringify(logs);
    assert.doesNotMatch(serializedLogs, new RegExp(TOKEN, 'u'));
    assert.match(serializedLogs, /local-protocol-fixture/u);
    assert.match(serializedLogs, /brainstem\.api\.v1\.RobotControl\/GetControlStatus/u);
    for (const methodName of WRITE_METHODS) assert.match(serializedLogs, new RegExp(`RobotControl/${methodName}`, 'u'));
  } finally {
    client.close();
    await fixture.close();
  }
});

test('forces bounded gRPC shutdown when graceful shutdown never completes', async () => {
  let forced = false;
  const startedAt = Date.now();
  await shutdownGrpc({
    tryShutdown() {},
    forceShutdown() { forced = true; },
  }, 25);
  assert.equal(forced, true);
  assert.ok(Date.now() - startedAt < 500);
});

test('rejects invalid tokens before binding either listener', async () => {
  await assert.rejects(
    startLocalProtocolFixture({ protoRoot, bearerToken: 'too-short', httpPort: 0, log: () => {} }),
    /32-256/u,
  );
});
