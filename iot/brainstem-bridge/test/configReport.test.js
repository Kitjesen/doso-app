import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeConfig } from '../src/configReport.js';

const config = {
  protoRoot: '/private/proto',
  target: { host: '192.0.2.10', port: 13145, loopback: false },
  grpc: {
    transport: 'mtls', timeoutMs: 3000,
    caPath: '/private/ca.pem', certPath: '/private/client.pem', keyPath: '/private/client.key',
  },
  http: { host: '127.0.0.1', port: 8120, certPath: undefined, keyPath: undefined },
};

test('redacted report exposes protocol gates without paths, tokens or certificate material', () => {
  const report = summarizeConfig(config, path => path === '/private/proto' || path.endsWith('.pem') || path.endsWith('.key'));
  assert.equal(report.ok, true);
  assert.deepEqual(report.target, { configured: true, port: 13145, loopback: false });
  assert.equal(report.grpc.transport, 'mtls');
  assert.equal(report.grpc.access, 'read-only');
  assert.equal(report.grpc.statusRpc, 'GetControlStatus');
  assert.equal(report.grpc.motionRpc, false);
  assert.equal(report.grpc.controlLeaseRpc, false);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /private|192\.0\.2\.10|token|secret|certificate\.pem|client\.key/i);
});

test('missing certificate or proto paths blocks preflight while keeping the report safe', () => {
  const report = summarizeConfig(config, () => false);
  assert.equal(report.ok, false);
  assert.equal(report.proto.present, false);
  assert.equal(report.grpc.filesPresent, false);
  assert.equal(report.control.productionExecutor, false);
});
