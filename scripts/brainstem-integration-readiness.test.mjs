import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAINSTEM_CONTROL_CONTRACT,
  getBrainstemIntegrationReadiness,
} from '../src/services/brainstemIntegrationReadiness.ts';

const blocked = {
  nativeModuleAvailable: false,
  endpointConfigured: false,
  readOnlyObservationFresh: false,
  deviceIdentity: 'unbound',
  clientIdentitySelected: false,
  remoteListenerConfirmed: false,
  remoteMtlsVerified: false,
  controlLeaseActive: false,
  productionExecutorConnected: false,
  ackContractReady: false,
  deadmanStopReady: false,
};

const readable = {
  ...blocked,
  nativeModuleAvailable: true,
  endpointConfigured: true,
  readOnlyObservationFresh: true,
};

test('LAN readiness is explicit and never rebrands an unauthenticated development session as paired mTLS', () => {
  const input = { ...readable, transport: 'lan-dev', lanDevConnectionConfirmed: true, remoteListenerConfirmed: true,
    controlLeaseActive: true, productionExecutorConnected: true, ackContractReady: true, deadmanStopReady: true };
  const result = getBrainstemIntegrationReadiness(input);
  assert.equal(result.controlReady, true);
  assert.match(result.gates.find(gate => gate.id === 'device-identity').label, /未认证/);
  assert.match(result.gates.find(gate => gate.id === 'remote-mtls').label, /明文/);
  for (const patch of [{ lanDevConnectionConfirmed: false }, { remoteMtlsVerified: true }, { clientIdentitySelected: true },
    { pairedClientAuthorized: true }, { controlLeaseActive: false }, { ackContractReady: false }, { transport: undefined }]) {
    assert.equal(getBrainstemIntegrationReadiness({ ...input, ...patch }).controlReady, false);
  }
});

test('missing Brainstem prerequisites fail closed and expose no secret-shaped fields', () => {
  const result = getBrainstemIntegrationReadiness(blocked);
  assert.equal(result.readOnlyReady, false);
  assert.equal(result.controlReady, false);
  assert.equal(result.controlLabel, '真实控制保持锁定');
  assert.match(result.controlBlockedReason, /Android 原生 gRPC 模块/);
  assert.equal(result.gates.length, 9);
  assert.ok(result.gates.every(gate => typeof gate.detail === 'string'));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /token|private.?key|certificate|password/i);
});

test('a fresh GetControlStatus read enables diagnostics only, never control', () => {
  const result = getBrainstemIntegrationReadiness(readable);
  assert.equal(result.readOnlyReady, true);
  assert.equal(result.readOnlyLabel, '只读状态可用');
  assert.equal(result.controlReady, false);
  assert.equal(result.gates.find(gate => gate.id === 'readonly-observation').state, 'ready');
  assert.equal(result.gates.find(gate => gate.id === 'control-lease').state, 'blocked');
});

test('control becomes ready only when identity, remote mTLS, lease, executor and deadman gates all agree', () => {
  const result = getBrainstemIntegrationReadiness({
    ...readable,
    deviceIdentity: 'verified',
    remoteListenerConfirmed: true,
    remoteMtlsVerified: true,
    controlLeaseActive: true,
    productionExecutorConnected: true,
    ackContractReady: true,
    deadmanStopReady: true,
  });
  assert.equal(result.readOnlyReady, true);
  assert.equal(result.controlReady, true);
  assert.equal(result.controlLabel, '真实控制前置条件已满足');
  assert.ok(result.gates.every(gate => gate.state === 'ready'));
});

test('Brainstem contract records authenticated remote actuator scope without granting any action', () => {
  const walk = BRAINSTEM_CONTROL_CONTRACT.find(item => item.rpc === 'WalkChecked');
  const acquire = BRAINSTEM_CONTROL_CONTRACT.find(item => item.rpc === 'AcquireControl');
  const enable = BRAINSTEM_CONTROL_CONTRACT.find(item => item.rpc === 'Enable');
  const disable = BRAINSTEM_CONTROL_CONTRACT.find(item => item.rpc === 'Disable');
  assert.deepEqual({ scope: walk?.scope, safety: walk?.safety }, { scope: 'remote-mtls', safety: '序号与 ACK' });
  assert.equal(acquire?.scope, 'remote-mtls');
  assert.equal(enable?.scope, 'remote-mtls');
  assert.equal(disable?.scope, 'remote-mtls');
  assert.equal(getBrainstemIntegrationReadiness(readable).controlReady, false);
});
