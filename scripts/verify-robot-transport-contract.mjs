import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { SimulatedDeviceIdentity } from '../iot/simulator/robot-protocol-simulator.ts';
import {
  InMemoryRobotProjectionStore, TrustedRobotIngress, RobotTransportIngressSession, canonicalizeProtocolValue,
} from '../src/domain/device-protocol/index.ts';
import {
  DEVICE_SAFETY_CONTRACT_ID, DEVICE_SAFETY_CONTRACT_VERSION, NON_MOTION_DIAGNOSTIC,
} from '../src/domain/device-safety/index.ts';

const NOW = 1_800_000_000_000;
const verifier = {
  verify(publicKeyPem, canonicalPayload, signatureB64Url) {
    return verify(null, Buffer.from(canonicalPayload), publicKeyPem, Buffer.from(signatureB64Url, 'base64url'));
  },
};

function fixture(options = {}) {
  const identity = options.identity ?? new SimulatedDeviceIdentity('device-alpha');
  const attacker = new SimulatedDeviceIdentity('device-attacker');
  const device = {
    version: 1, device_id: 'device-alpha', owner_account_id: 'account-alpha', public_key_pem: identity.publicKeyPem,
    public_key_fingerprint: 'a'.repeat(64), lifecycle: 'owned', authorization_epoch: 7, active_boot_id: 'boot-alpha', last_telemetry_sequence: 0, health: null,
    ...options.device,
  };
  const command = {
    version: 1, command_id: 'command-health-001', device_id: device.device_id, owner_account_id: 'account-alpha',
    authorization_epoch: 7, expected_boot_id: 'boot-alpha', expected_device_version: device.version, expected_public_key_fingerprint: device.public_key_fingerprint,
    idempotency_key: 'idem-health-001', expires_at_ms: NOW + 10_000,
    kind: 'diagnostics.health_check', capability: 'command:diagnostics.health_check', command_class: NON_MOTION_DIAGNOSTIC,
    may_actuate: false, safety_contract_id: DEVICE_SAFETY_CONTRACT_ID, safety_contract_version: DEVICE_SAFETY_CONTRACT_VERSION,
    ack_status: null, ...options.command,
  };
  const baseStore = options.baseStore ?? new InMemoryRobotProjectionStore([device], [command]);
  const store = options.wrapStore ? options.wrapStore(baseStore) : baseStore;
  const ingress = new TrustedRobotIngress({
    now: options.now ?? (() => NOW), verifier: options.verifier ?? verifier, store,
    ackTtlMs: 30_000, telemetryTtlMs: 30_000, maxFutureSkewMs: 1_000, ackArrivalGraceMs: 1_000,
  });
  const ack = (status = 'accepted', overrides = {}) => {
    const unsigned = {
      protocol_version: 1, command_id: command.command_id, device_id: device.device_id,
      authorization_epoch: device.authorization_epoch, idempotency_key: command.idempotency_key,
      boot_id: device.active_boot_id, status, occurred_at_ms: NOW,
      reason: ['failed', 'rejected', 'expired', 'cancelled'].includes(status) ? { code: 'device_error', message: 'Device rejected request.' } : null,
      ...overrides,
    };
    return { ack: unsigned, signature_b64url: identity.sign(unsigned) };
  };
  const telemetry = (sequence = 1, overrides = {}) => {
    const unsigned = {
      protocol_version: 1, device_id: device.device_id, authorization_epoch: device.authorization_epoch,
      boot_id: device.active_boot_id, sequence, captured_at_ms: NOW, kind: 'diagnostics.health',
      payload: { battery_percent: 82, sensor_status: 'ok', network_status: 'online' }, ...overrides,
    };
    return { ...unsigned, signature_b64url: identity.sign(unsigned) };
  };
  const published = () => {
    const envelope = {
      protocol_version: 1, command_id: command.command_id, device_id: device.device_id, owner_account_id: command.owner_account_id,
      terminal_id: 'terminal-alpha', actor_user_id: 'user-alpha', authorization_epoch: command.authorization_epoch,
      idempotency_key: command.idempotency_key, auth_session_id: 'session-alpha', policy_version: 1,
      safety_contract_id: DEVICE_SAFETY_CONTRACT_ID, safety_contract_version: DEVICE_SAFETY_CONTRACT_VERSION,
      capability: 'command:diagnostics.health_check', kind: 'diagnostics.health_check', command_class: NON_MOTION_DIAGNOSTIC,
      may_actuate: false, expected_state: { authorization_epoch: command.authorization_epoch, boot_id: command.expected_boot_id },
      issued_at_ms: NOW, expires_at_ms: command.expires_at_ms, payload: { include: ['battery', 'sensors', 'network'] },
    };
    return { command: envelope, signature_b64url: identity.sign(envelope) };
  };
  return { identity, attacker, device, command, baseStore, store, ingress, ack, telemetry, published };
}

function resignAck(f, frame) { frame.signature_b64url = f.identity.sign(frame.ack); return frame; }
function resignTelemetry(f, frame) { const { signature_b64url: _, ...unsigned } = frame; frame.signature_b64url = f.identity.sign(unsigned); return frame; }
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('simulator canonical signing is compatible with trusted ingress', async () => {
  const f = fixture();
  assert.equal(await verifier.verify(f.identity.publicKeyPem, canonicalizeProtocolValue(f.ack().ack), f.ack().signature_b64url), true);
  assert.deepEqual(await f.ingress.accept(f.ack()), { accepted: true, frame: 'ack', status: 'accepted' });
});

test('canonicalization has an exact nested Unicode and array vector', () => {
  const vector = { z: [3, { 'β': '值', a: true }], a: 'é' };
  assert.equal(canonicalizeProtocolValue(vector), '{"a":"é","z":[3,{"a":true,"β":"值"}]}');
});

test('authenticated ACK and telemetry commit asynchronously', async () => {
  const ackFixture = fixture();
  assert.equal((await ackFixture.ingress.accept(ackFixture.ack())).accepted, true);
  assert.equal((await ackFixture.baseStore.readCommand(ackFixture.command.command_id)).ack_status, 'accepted');
  const telemetryFixture = fixture();
  assert.equal((await telemetryFixture.ingress.accept(telemetryFixture.telemetry(2))).accepted, true);
  assert.equal((await telemetryFixture.baseStore.readDevice(telemetryFixture.device.device_id)).last_telemetry_sequence, 2);
});

test('false and unavailable signature verifier are distinct and mutation-free', async () => {
  const invalid = fixture({ verifier: { verify: async () => false } });
  assert.equal((await invalid.ingress.accept(invalid.ack())).reason, 'invalid_signature');
  assert.equal(invalid.baseStore.commitCount, 0);
  const unavailable = fixture({ verifier: { verify: async () => { throw new Error('sensitive backend detail'); } } });
  assert.deepEqual(await unavailable.ingress.accept(unavailable.ack()), { accepted: false, reason: 'signature_verifier_unavailable', retryable: true });
  assert.equal(unavailable.baseStore.commitCount, 0);
});

test('projection store read and commit outages are retryable and mutation-free', async () => {
  const readFailure = fixture({ wrapStore: (base) => new ThrowingStore(base, 'read') });
  assert.deepEqual(await readFailure.ingress.accept(readFailure.ack()), { accepted: false, reason: 'projection_store_unavailable', retryable: true });
  assert.equal(readFailure.baseStore.commitCount, 0);
  const commitFailure = fixture({ wrapStore: (base) => new ThrowingStore(base, 'commit') });
  assert.deepEqual(await commitFailure.ingress.accept(commitFailure.telemetry()), { accepted: false, reason: 'projection_store_unavailable', retryable: true });
  assert.equal(commitFailure.baseStore.commitCount, 0);
});

test('forged ACK and telemetry signatures reject without projection', async () => {
  const ackFixture = fixture(); const forgedAck = ackFixture.ack(); forgedAck.signature_b64url = ackFixture.attacker.sign(forgedAck.ack);
  assert.equal((await ackFixture.ingress.accept(forgedAck)).reason, 'invalid_signature');
  const telemetryFixture = fixture(); const forgedTelemetry = telemetryFixture.telemetry(); forgedTelemetry.payload.battery_percent = 1;
  assert.equal((await telemetryFixture.ingress.accept(forgedTelemetry)).reason, 'invalid_signature');
  assert.equal(ackFixture.baseStore.commitCount + telemetryFixture.baseStore.commitCount, 0);
});

test('known-key rejected ACKs are durably appended without projection', async () => {
  const cases = [
    [() => fixture({ command: { owner_account_id: 'account-other' } }), (f) => f.ack(), 'device_binding_mismatch'],
    [() => fixture(), (f) => resignAck(f, f.ack('accepted', { authorization_epoch: 6 })), 'authorization_epoch_mismatch'],
    [() => fixture(), (f) => resignAck(f, f.ack('accepted', { boot_id: 'boot-old' })), 'boot_mismatch'],
  ];
  for (const [make, frame, reason] of cases) {
    const f = make(); assert.equal((await f.ingress.accept(frame(f))).reason, reason); assert.equal(f.baseStore.commitCount, 0); assert.equal(f.baseStore.authenticatedAckEvents.length, 1);
  }
  const missing = fixture(); missing.baseStore.replaceCommand({ ...missing.command, command_id: 'command-other', version: 2 });
  const missingStore = new InMemoryRobotProjectionStore([missing.device], []);
  const missingIngress = new TrustedRobotIngress({ now: () => NOW, verifier, store: missingStore });
  assert.equal((await missingIngress.accept(missing.ack())).reason, 'unknown_command'); assert.equal(missingStore.authenticatedAckEvents.length, 1);

  const unknownDevice = fixture();
  assert.equal((await unknownDevice.ingress.accept(resignAck(unknownDevice, unknownDevice.ack('accepted', { device_id: 'device-unknown' })))).reason, 'unknown_device');
  assert.equal(unknownDevice.baseStore.authenticatedAckEvents.length, 0);
  for (const [frame, reason] of [
    [resignTelemetry(unknownDevice, unknownDevice.telemetry(1, { authorization_epoch: 6 })), 'authorization_epoch_mismatch'],
    [resignTelemetry(unknownDevice, unknownDevice.telemetry(1, { boot_id: 'boot-old' })), 'boot_mismatch'],
  ]) assert.equal((await unknownDevice.ingress.accept(frame)).reason, reason);
});

test('new boot cannot accept an ACK for an old expected command boot', async () => {
  const f = fixture({ device: { active_boot_id: 'boot-new' }, command: { expected_boot_id: 'boot-old' } });
  assert.equal((await f.ingress.accept(f.ack())).reason, 'boot_mismatch');
  assert.equal(f.baseStore.commitCount, 0);
});

test('motion and unknown command projections are rejected', async () => {
  for (const mutation of [
    { may_actuate: true, command_class: 'motion' }, { kind: 'motion.drive' }, { safety_contract_version: 999 },
  ]) {
    const f = fixture({ command: mutation });
    assert.equal((await f.ingress.accept(f.ack())).reason, 'unsupported_command_projection');
    assert.equal(f.baseStore.commitCount, 0);
  }
});

test('ACK atomic commit fences authority and command changes after reads', async () => {
  const deviceMutations = [
    { lifecycle: 'quarantined' }, { owner_account_id: 'account-other' }, { authorization_epoch: 8 }, { active_boot_id: 'boot-new' }, { version: 2 },
  ];
  for (const mutation of deviceMutations) {
    const f = fixture({ wrapStore: (base) => new RacingStore(base, () => base.replaceDevice({ ...f.device, ...mutation, version: f.device.version + 1 })) });
    assert.equal((await f.ingress.accept(f.ack())).reason, 'projection_conflict');
    assert.equal(f.baseStore.commitCount, 0);
  }
  for (const mutation of [{ owner_account_id: 'account-other' }, { expected_boot_id: 'boot-new' }, { device_id: 'device-other' }, { version: 2 }]) {
    const f = fixture({ wrapStore: (base) => new RacingStore(base, () => base.replaceCommand({ ...f.command, ...mutation, version: f.command.version + 1 })) });
    assert.equal((await f.ingress.accept(f.ack())).reason, 'projection_conflict');
    assert.equal(f.baseStore.commitCount, 0);
  }
});

test('same-version signing-key replacement after verification conflicts at commit', async () => {
  const replacement = new SimulatedDeviceIdentity('device-alpha');
  const policy = fixture();
  assert.throws(() => policy.baseStore.replaceDevice({ ...policy.device, public_key_pem: replacement.publicKeyPem }), /increment device version/);
  const f = fixture({ wrapStore: (base) => new RacingStore(base, () => base.testOnlyCorruptDeviceWithoutVersionBump({ ...f.device, public_key_pem: replacement.publicKeyPem })) });
  assert.deepEqual(await f.ingress.accept(f.ack()), { accepted: false, reason: 'projection_conflict', retryable: true });
  assert.equal(f.baseStore.commitCount, 0);
});

test('telemetry atomic commit fences every device authority field after read', async () => {
  for (const mutation of [{ lifecycle: 'quarantined' }, { owner_account_id: 'account-other' }, { authorization_epoch: 8 }, { active_boot_id: 'boot-new' }, { version: 2 }]) {
    const f = fixture({ wrapStore: (base) => new RacingStore(base, null, () => base.replaceDevice({ ...f.device, ...mutation, version: f.device.version + 1 })) });
    assert.equal((await f.ingress.accept(f.telemetry())).reason, 'projection_conflict');
    assert.equal(f.baseStore.commitCount, 0);
  }
});

test('sequence replay, clock skew, expiry and illegal ACK order reject', async () => {
  const sequence = fixture(); assert.equal((await sequence.ingress.accept(sequence.telemetry(2))).accepted, true);
  assert.equal((await sequence.ingress.accept(sequence.telemetry(2))).reason, 'sequence_replay');
  assert.equal((await sequence.ingress.accept(sequence.telemetry(1))).reason, 'sequence_replay');
  const stale = fixture(); assert.equal((await stale.ingress.accept(resignTelemetry(stale, stale.telemetry(1, { captured_at_ms: NOW - 30_001 })))).reason, 'frame_expired');
  const future = fixture(); assert.equal((await future.ingress.accept(resignAck(future, future.ack('accepted', { occurred_at_ms: NOW + 1_001 })))).reason, 'clock_skew');
  const expired = fixture({ command: { expires_at_ms: NOW - 1_001 } }); assert.equal((await expired.ingress.accept(expired.ack())).reason, 'command_expired');
  const illegal = fixture(); assert.equal((await illegal.ingress.accept(illegal.ack('executing'))).reason, 'illegal_ack_transition');
  assert.equal(illegal.baseStore.authenticatedAckEvents.length, 1);
  const terminal = fixture(); assert.equal((await terminal.ingress.accept(terminal.ack('succeeded'))).accepted, true);
  assert.equal((await terminal.ingress.accept(terminal.ack('failed'))).reason, 'illegal_ack_transition');
  assert.equal(terminal.baseStore.authenticatedAckEvents.length, 2);
});

test('authoritative clock failure is retryable for ACK and telemetry', async () => {
  const ackFixture = fixture({ now: () => Number.NaN });
  assert.deepEqual(await ackFixture.ingress.accept(ackFixture.ack()), { accepted: false, reason: 'clock_unavailable', retryable: true });
  assert.equal(ackFixture.baseStore.commitCount, 0);
  const telemetryFixture = fixture({ now: () => { throw new Error('clock backend detail'); } });
  assert.deepEqual(await telemetryFixture.ingress.accept(telemetryFixture.telemetry()), { accepted: false, reason: 'clock_unavailable', retryable: true });
  assert.equal(telemetryFixture.baseStore.commitCount, 0);
});

test('snapshot rejects getters, sparse arrays, cycles, width, bytes and unsafe keys without reading or mutation', async () => {
  const frames = [];
  let objectGetterReads = 0; const getter = {};
  Object.defineProperty(getter, 'ack', { enumerable: true, get() { objectGetterReads += 1; return {}; } }); frames.push(getter);
  let arrayGetterReads = 0; const array = [];
  Object.defineProperty(array, '0', { enumerable: true, get() { arrayGetterReads += 1; return 'x'; } }); Object.defineProperty(array, 'length', { value: 1 }); frames.push(array);
  const sparse = []; sparse.length = 2; sparse[1] = 'x'; frames.push(sparse);
  const cyclic = {}; cyclic.self = cyclic; frames.push(cyclic);
  frames.push(Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, index])));
  frames.push({ payload: 'x'.repeat(33_000) });
  const unsafe = {}; Object.defineProperty(unsafe, '__proto__', { enumerable: true, value: {} }); frames.push(unsafe);
  for (const frame of frames) { const f = fixture(); const result = await f.ingress.accept(frame); assert.equal(result.reason, 'invalid_frame'); assert.equal(result.retryable, false); assert.equal(f.baseStore.commitCount, 0); }
  assert.equal(objectGetterReads, 0); assert.equal(arrayGetterReads, 0); assert.equal(Object.prototype.polluted, undefined);
});

test('publish requires connected state, a complete signed command and immutable bounded snapshots', async () => {
  const f = fixture(); const transport = new TestTransport(); const session = new RobotTransportIngressSession(transport, f.ingress);
  await assert.rejects(session.publish(f.published()), /not connected/);
  await session.start();
  await assert.rejects(session.publish({ command: { command_id: 'partial' }, signature_b64url: 'short' }), /invalid signed robot command/);
  const original = f.published(); const resultPromise = session.publish(original); original.command.payload.include[0] = 'network'; original.command.command_id = 'mutated-command';
  const receipt = await resultPromise;
  assert.equal(transport.published[0].command.command_id, f.command.command_id);
  assert.deepEqual(transport.published[0].command.payload.include, ['battery', 'sensors', 'network']);
  assert.equal(Object.isFrozen(transport.published[0]), true); assert.equal(receipt.disposition, 'accepted_for_delivery');
  assert.equal((await f.baseStore.readCommand(f.command.command_id)).ack_status, null); assert.equal(f.baseStore.commitCount, 0);
});

test('transport receipts are normalized and cannot be mutated after return', async () => {
  const f = fixture(); const transport = new TestTransport(); const session = new RobotTransportIngressSession(transport, f.ingress); await session.start();
  const receipt = await session.publish(f.published()); transport.receipt.transport_message_id = 'mutated';
  assert.equal(receipt.transport_message_id, 'transport-1'); assert.equal(Object.isFrozen(receipt), true);
  transport.receipt = { disposition: 'succeeded', transport_message_id: 'transport-2' };
  await assert.rejects(session.publish(f.published()), /invalid robot transport receipt/);
});

test('concurrent start creates one connection', async () => {
  const f = fixture(); const transport = new TestTransport({ deferred: true }); const session = new RobotTransportIngressSession(transport, f.ingress);
  const first = session.start(), second = session.start(); assert.equal(transport.connectCount, 1); assert.equal(session.state, 'connecting');
  assert.deepEqual(await transport.consumers[0].onFrame(f.telemetry()), { accepted: false, reason: 'stale_transport_generation', retryable: true });
  transport.resolveConnect(); await Promise.all([first, second]); assert.equal(session.state, 'connected'); assert.equal(transport.connectCount, 1);
});

test('stop during pending connect closes the late connection', async () => {
  const f = fixture(); const transport = new TestTransport({ deferred: true }); const session = new RobotTransportIngressSession(transport, f.ingress);
  const start = session.start(), stop = session.stop(); assert.equal(session.state, 'stopping'); transport.resolveConnect(); await Promise.all([start, stop]);
  assert.equal(session.state, 'idle'); assert.equal(transport.connections[0].closeCount, 1);
});

test('remote disconnect permits reconnect and isolates the old consumer', async () => {
  const f = fixture(); const transport = new TestTransport(); const session = new RobotTransportIngressSession(transport, f.ingress);
  await session.start(); const oldConsumer = transport.consumers[0]; await oldConsumer.onDisconnect('transport_error'); assert.equal(session.state, 'idle');
  await assert.rejects(session.publish(f.published()), /not connected/); await session.start(); assert.equal(transport.connectCount, 2);
  assert.equal((await oldConsumer.onFrame(f.telemetry(1))).reason, 'stale_transport_generation');
  assert.equal((await transport.consumers[1].onFrame(f.telemetry(1))).accepted, true);
});

test('publish cannot return a receipt across a disconnected generation', async () => {
  const f = fixture(); const transport = new TestTransport({ deferredPublish: true }); const session = new RobotTransportIngressSession(transport, f.ingress);
  await session.start(); const pending = session.publish(f.published()); await transport.consumers[0].onDisconnect('transport_error');
  transport.resolvePublish(); await assert.rejects(pending, /stale robot transport generation/); assert.equal(session.state, 'idle');
});

test('connection close remains idempotent across repeated stop calls', async () => {
  const f = fixture(); const transport = new TestTransport(); const session = new RobotTransportIngressSession(transport, f.ingress);
  await session.start(); await Promise.all([session.stop(), session.stop()]); await session.stop();
  assert.equal(transport.connections[0].closeCount, 1); assert.equal(session.state, 'idle');
});

test('a real close failure retains the connection and blocks reconnect until retry succeeds', async () => {
  const f = fixture(); const transport = new TestTransport({ rejectCloseTimes: 1 }); const session = new RobotTransportIngressSession(transport, f.ingress);
  await session.start(); const oldConsumer = transport.consumers[0]; await assert.rejects(session.stop(), /robot transport close failed/);
  assert.equal(session.state, 'close_failed'); assert.equal(transport.connectCount, 1); assert.equal(transport.connections[0].closed, false);
  await assert.rejects(session.start(), /close must be retried/); await assert.rejects(session.publish(f.published()), /not connected/);
  assert.deepEqual(await oldConsumer.onFrame(f.telemetry()), { accepted: false, reason: 'stale_transport_generation', retryable: true });
  await session.stop(); assert.equal(session.state, 'idle'); assert.equal(transport.connections[0].closed, true); assert.equal(transport.connections[0].closeAttempts, 2);
  await session.start(); assert.equal(session.state, 'connected'); assert.equal(transport.connectCount, 2);
});

test('consumer awaits durable projection commit for backpressure', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture({ wrapStore: (base) => new DelayedTelemetryStore(base, gate) });
  const transport = new TestTransport(); const session = new RobotTransportIngressSession(transport, f.ingress); await session.start();
  let settled = false; const delivery = transport.consumers[0].onFrame(f.telemetry()).then((value) => { settled = true; return value; });
  await Promise.resolve(); assert.equal(settled, false); release(); assert.equal((await delivery).accepted, true);
});

class RacingStore {
  constructor(base, beforeAck = null, beforeTelemetry = null) { this.base = base; this.beforeAck = beforeAck; this.beforeTelemetry = beforeTelemetry; }
  readIngressContext(deviceId, commandId) { return this.base.readIngressContext(deviceId, commandId); }
  async commitAuthenticatedAck(change) { this.beforeAck?.(); return this.base.commitAuthenticatedAck(change); }
  async commitTelemetry(change) { this.beforeTelemetry?.(); return this.base.commitTelemetry(change); }
}
class DelayedTelemetryStore extends RacingStore {
  constructor(base, gate) { super(base); this.gate = gate; }
  async commitTelemetry(change) { await this.gate; return this.base.commitTelemetry(change); }
}
class ThrowingStore extends RacingStore {
  constructor(base, phase) { super(base); this.phase = phase; }
  readIngressContext(deviceId, commandId) { if (this.phase === 'read') throw new Error('database connection detail'); return super.readIngressContext(deviceId, commandId); }
  async commitAuthenticatedAck(change) { if (this.phase === 'commit') throw new Error('database connection detail'); return super.commitAuthenticatedAck(change); }
  async commitTelemetry(change) { if (this.phase === 'commit') throw new Error('database connection detail'); return super.commitTelemetry(change); }
}
class TestTransport {
  constructor(options = {}) { this.deferred = options.deferred ?? false; this.deferredPublish = options.deferredPublish ?? false; this.rejectCloseTimes = options.rejectCloseTimes ?? 0; this.connectCount = 0; this.consumers = []; this.connections = []; this.published = []; this.pending = []; this.pendingPublishes = []; this.receipt = { disposition: 'accepted_for_delivery', transport_message_id: 'transport-1' }; }
  connect(consumer) {
    this.connectCount += 1; this.consumers.push(consumer);
    const connection = { closeCount: 0, closeAttempts: 0, closed: false, close: async () => {
      connection.closeAttempts += 1;
      if (connection.closeAttempts <= this.rejectCloseTimes) throw new Error('simulated close failure while still open');
      if (!connection.closed) { connection.closed = true; connection.closeCount += 1; }
    } }; this.connections.push(connection);
    if (!this.deferred) return Promise.resolve(connection);
    return new Promise((resolve) => this.pending.push(() => resolve(connection)));
  }
  resolveConnect() { const resolve = this.pending.shift(); if (!resolve) throw new Error('no pending connection'); resolve(); }
  publish(command) { this.published.push(command); return this.deferredPublish ? new Promise((resolve) => this.pendingPublishes.push(() => resolve(this.receipt))) : Promise.resolve(this.receipt); }
  resolvePublish() { const resolve = this.pendingPublishes.shift(); if (!resolve) throw new Error('no pending publish'); resolve(); }
}

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
console.log(`ROBOT TRANSPORT CONTRACT PASS ${passed}/${tests.length} — MQTT/mTLS/GATT/physical robot remain BLOCKED`);
