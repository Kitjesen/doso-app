interface Assertions {
  equal(actual: unknown, expected: unknown): void;
  ok(value: unknown): asserts value;
  throws(run: () => unknown, pattern: RegExp): void;
}
const assert: Assertions = {
  equal(actual, expected) { if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`); },
  ok(value): asserts value { if (!value) throw new Error("expected truthy value"); },
  throws(run, pattern) { try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; } throw new Error(`expected ${pattern}`); },
};
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { MutableClock, SimulatedDeviceIdentity, SimulatedG008Cloud, SimulatedG008Device, runSimulatedG008Scenario, type G008CreateFault } from "../iot/simulator/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { assertCommandEnvelope, type CommandAck, type SignedAck } from "../src/domain/device-protocol/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { assertSimulatedDeviceSafetyCommand } from "../src/domain/device-safety/index.ts";

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void): void => { tests.push({ name, run }); };

function fixture(options: ConstructorParameters<typeof SimulatedG008Cloud>[1] = {}) {
  const clock = new MutableClock();
  const identity = new SimulatedDeviceIdentity("device-g008-alpha");
  const cloud = new SimulatedG008Cloud(clock, options);
  const signedSnapshot = cloud.provision(identity, 4, "boot-g008-alpha");
  const device = new SimulatedG008Device(identity, cloud.controlPublicKeyPem, clock, 4, "boot-g008-alpha");
  device.applyAuthoritativeSnapshot(signedSnapshot);
  const input = { device_id: identity.deviceId, owner_account_id: "account-g008", terminal_id: "terminal-g008", actor_user_id: "user-g008", auth_session_id: "session-g008", idempotency_key: "idem-g008-alpha" };
  return { clock, identity, cloud, device, input, signedSnapshot };
}

test("safety contract structurally permits only stationary non-actuating health check", () => {
  assertSimulatedDeviceSafetyCommand({ kind: "diagnostics.health_check", command_class: "non_motion_diagnostic", may_actuate: false });
  assert.throws(() => assertSimulatedDeviceSafetyCommand({ kind: "motion.drive", command_class: "motion", may_actuate: true }), /safety contract/);
  assert.throws(() => assertSimulatedDeviceSafetyCommand({ kind: "diagnostics.health_check", command_class: "non_motion_diagnostic", may_actuate: false, speed: 1 }), /shape/);
  const f = fixture(); const command = f.cloud.createHealthCheck(f.input); assertCommandEnvelope(command);
  assert.equal(command.safety_contract_version, 1); assert.equal(command.expected_state.boot_id, "boot-g008-alpha"); assert.equal(command.may_actuate, false);
});

test("copy-on-write creation is all-or-none after every logical write", () => {
  for (const point of ["after_command", "after_idempotency", "after_outbox", "after_audit"] as G008CreateFault[]) {
    const f = fixture(); assert.throws(() => f.cloud.createHealthCheck(f.input, point), /injected transaction fault/);
    const projection = f.cloud.projections();
    assert.equal(projection.commands.length, 0); assert.equal(projection.outbox.length, 0); assert.equal(projection.audit.length, 0);
  }
});

test("device plus idempotency key returns one command, outbox and audit", () => {
  const f = fixture(); const first = f.cloud.createHealthCheck(f.input); const duplicate = f.cloud.createHealthCheck(f.input);
  assert.equal(duplicate.command_id, first.command_id);
  const projection = f.cloud.projections();
  assert.equal(projection.commands.length, 1); assert.equal(projection.outbox.length, 1); assert.equal(projection.audit.length, 1);
});

test("transport retry exhaustion reaches DLQ without inventing device failure", () => {
  const f = fixture({ maxAttempts: 2 }); const command = f.cloud.createHealthCheck(f.input);
  const first = f.cloud.leaseNext(); assert.ok(first); const delay = f.cloud.failTransport(first); f.clock.advance(delay);
  const second = f.cloud.leaseNext(); assert.ok(second); assert.equal(f.cloud.failTransport(second), 0);
  const projected = f.cloud.projections().commands.find((row) => row.envelope.command_id === command.command_id)!;
  assert.equal(projected.delivery_status, "dead_letter"); assert.equal(projected.device_ack_status, null);
});

test("crash-before-send expires lease, backs off and fences stale publisher", () => {
  const f = fixture({ leaseMs: 10 }); f.cloud.createHealthCheck(f.input); const abandoned = f.cloud.leaseNext(); assert.ok(abandoned);
  f.clock.advance(11); assert.equal(f.cloud.leaseNext(), null); f.clock.advance(100);
  const replacement = f.cloud.leaseNext(); assert.ok(replacement); assert.equal(replacement.fencing_token, abandoned.fencing_token + 1);
  assert.throws(() => f.cloud.publishForLease(abandoned), /stale fenced lease/);
  assert.equal(f.cloud.publishForLease(replacement).command.kind, "diagnostics.health_check");
});

test("lease is expired and fenced at the exact deadline boundary", () => {
  const f = fixture({ leaseMs: 10 }); f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease);
  f.clock.advance(10); assert.throws(() => f.cloud.publishForLease(lease), /stale fenced lease/);
  assert.equal(f.cloud.leaseNext(), null); assert.equal(f.cloud.projections().commands[0].delivery_status, "queued");
});

test("publish-time expected-state revalidation cancels without transport DLQ or device failure", () => {
  const f = fixture(); f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease);
  f.cloud.advanceAuthority(f.identity.deviceId, 4, "boot-g008-replaced");
  assert.throws(() => f.cloud.publishForLease(lease), /revalidation rejected/);
  const projection = f.cloud.projections(); assert.equal(projection.commands[0].delivery_status, "cancelled");
  assert.equal(projection.commands[0].device_ack_status, null); assert.equal(projection.outbox[0].dead_letter_reason, null);
});

test("device rejects at the exact command expiry boundary without receipt or effect", () => {
  const f = fixture(); const command = f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease); const published = f.cloud.publishForLease(lease);
  f.clock.advance(command.expires_at_ms - f.clock.now());
  assert.throws(() => f.device.process(published), /expected state rejected/);
  const persistence = f.device.snapshot(); assert.equal(persistence.effect_count, 0); assert.equal(persistence.receipts.length, 0);
});

test("send-before-durable-mark permits redelivery but durable receipt effects exactly once", () => {
  const f = fixture({ leaseMs: 10 }); f.cloud.createHealthCheck(f.input); const first = f.cloud.leaseNext(); assert.ok(first);
  const sent = f.cloud.publishForLease(first); const originalAcks = f.device.process(sent); assert.equal(f.device.executedEffects, 1);
  f.clock.advance(11); assert.equal(f.cloud.leaseNext(), null); f.clock.advance(100);
  const retry = f.cloud.leaseNext(); assert.ok(retry); const redelivered = f.cloud.publishForLease(retry); const duplicateAcks = f.device.process(redelivered);
  assert.equal(duplicateAcks.length, 1); assert.equal(duplicateAcks[0].ack.status, "succeeded"); assert.equal(f.device.executedEffects, 1);
  f.cloud.markSent(retry); for (const ack of originalAcks) f.cloud.appendAck(ack); f.cloud.replayAckProjection();
  assert.equal(f.cloud.projections().commands[0].delivery_status, "acknowledged");
});

test("lost ACK after sent deterministically redelivers and closes from saved device receipt", () => {
  const f = fixture({ ackTimeoutMs: 10, maxAttempts: 2 }); f.cloud.createHealthCheck(f.input); const first = f.cloud.leaseNext(); assert.ok(first);
  const published = f.cloud.publishForLease(first); f.device.process(published); f.cloud.markSent(first); assert.equal(f.device.executedEffects, 1);
  f.clock.advance(10); const retry = f.cloud.leaseNext(); assert.ok(retry); const redelivery = f.cloud.publishForLease(retry); const saved = f.device.process(redelivery);
  assert.equal(saved.length, 1); assert.equal(saved[0].ack.status, "succeeded"); assert.equal(f.device.executedEffects, 1);
  f.cloud.markSent(retry); f.cloud.appendAck(saved[0]); f.cloud.replayAckProjection();
  assert.equal(f.cloud.projections().commands[0].delivery_status, "acknowledged");
});

test("sent delivery expires to execution-unknown without inventing a device ACK", () => {
  const f = fixture({ ackTimeoutMs: 10, maxAttempts: 3 }); f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease);
  const published = f.cloud.publishForLease(lease); f.device.process(published); f.cloud.markSent(lease);
  f.clock.advance(30_000); assert.equal(f.cloud.leaseNext(), null);
  const projection = f.cloud.projections().commands[0]; assert.equal(projection.delivery_status, "execution_unknown"); assert.equal(projection.device_ack_status, null); assert.equal(f.device.executedEffects, 1);
});

test("persistence restores receipts and blocks processing until signed non-rollback sync", () => {
  const f = fixture(); f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease); const published = f.cloud.publishForLease(lease);
  assert.throws(() => f.device.process(published, "after_receipt"), /crash after durable device receipt/);
  assert.equal(f.device.telemetry().sequence, 1);
  const persisted = f.device.snapshot(); const restarted = new SimulatedG008Device(f.identity, f.cloud.controlPublicKeyPem, f.clock); restarted.restore(persisted);
  assert.throws(() => restarted.process(published), /blocked until authoritative sync/);
  restarted.applyAuthoritativeSnapshot(f.signedSnapshot); restarted.process(published); assert.equal(restarted.executedEffects, 1); assert.equal(restarted.telemetry().sequence, 2);
  const forward = f.cloud.advanceAuthority(f.identity.deviceId, 5, "boot-g008-next"); restarted.applyAuthoritativeSnapshot(forward);
  assert.throws(() => restarted.applyAuthoritativeSnapshot(f.signedSnapshot), /rollback/);
});

test("authority freshness is strictly monotonic and exact replay cannot mask boot rollback", () => {
  const f = fixture(); f.device.applyAuthoritativeSnapshot(f.signedSnapshot);
  const advanced = f.cloud.advanceAuthority(f.identity.deviceId, 4, "boot-g008-same-epoch-next");
  assert.equal(advanced.snapshot.authority_version, f.signedSnapshot.snapshot.authority_version + 1);
  assert.ok(advanced.snapshot.issued_at_ms > f.signedSnapshot.snapshot.issued_at_ms);
  f.device.applyAuthoritativeSnapshot(advanced);
  assert.throws(() => f.device.applyAuthoritativeSnapshot(f.signedSnapshot), /freshness rollback/);
  const ambiguous = f.cloud.testOnlySignAuthoritativeSnapshot({ ...advanced.snapshot, boot_id: "boot-g008-ambiguous" });
  assert.throws(() => f.device.applyAuthoritativeSnapshot(ambiguous), /ambiguous authority replay/);
});

test("effect result and final receipt commit atomically across both simulated crash windows", () => {
  const beforeCommit = fixture(); beforeCommit.cloud.createHealthCheck(beforeCommit.input); const lease = beforeCommit.cloud.leaseNext(); assert.ok(lease); const published = beforeCommit.cloud.publishForLease(lease);
  assert.throws(() => beforeCommit.device.process(published, "after_compute_before_commit"), /before durable commit/);
  assert.equal(beforeCommit.device.snapshot().effect_count, 0);
  const retried = beforeCommit.device.process(published); assert.equal(retried.at(-1)!.ack.status, "succeeded"); assert.equal(beforeCommit.device.executedEffects, 1);
  assert.equal(beforeCommit.device.process(published)[0].ack.status, "succeeded"); assert.equal(beforeCommit.device.executedEffects, 1);

  const afterCommit = fixture(); afterCommit.cloud.createHealthCheck(afterCommit.input); const secondLease = afterCommit.cloud.leaseNext(); assert.ok(secondLease); const secondPublished = afterCommit.cloud.publishForLease(secondLease);
  assert.throws(() => afterCommit.device.process(secondPublished, "after_commit"), /after durable effect and receipt commit/);
  assert.equal(afterCommit.device.executedEffects, 1); const saved = afterCommit.device.process(secondPublished);
  assert.equal(saved.length, 1); assert.equal(saved[0].ack.status, "succeeded"); assert.equal(afterCommit.device.executedEffects, 1);
});

test("append-only ACK replay ignores unknown, out-of-order and conflicting terminal events", () => {
  const f = fixture(); const command = f.cloud.createHealthCheck(f.input); const lease = f.cloud.leaseNext(); assert.ok(lease); const published = f.cloud.publishForLease(lease); f.cloud.markSent(lease);
  const acks = f.device.process(published); const unknownAck: CommandAck = { ...acks[0].ack, command_id: "g008-command-unknown", idempotency_key: "idem-g008-unknown" };
  f.cloud.appendAck({ ack: unknownAck, signature_b64url: f.identity.sign(unknownAck) });
  f.cloud.appendAck(acks[2]); f.cloud.appendAck(acks[2]); f.cloud.appendAck(acks[0]);
  const conflicting: CommandAck = { ...acks[2].ack, status: "failed", reason: { code: "conflict", message: "conflicting terminal" } };
  const signedConflict: SignedAck = { ack: conflicting, signature_b64url: f.identity.sign(conflicting) }; f.cloud.appendAck(signedConflict);
  f.cloud.replayAckProjection(); f.cloud.replayAckProjection();
  const projection = f.cloud.projections(); const row = projection.commands.find((candidate) => candidate.envelope.command_id === command.command_id)!;
  assert.equal(projection.ack_events.length, 5); assert.equal(row.device_ack_status, "succeeded"); assert.equal(row.delivery_status, "acknowledged");
});

test("trusted telemetry rejects without cursor effects and online uses authenticated receive TTL", () => {
  const f = fixture({ telemetryTtlMs: 20, maxSkewMs: 10 }); const valid = f.device.telemetry(); const forged = { ...valid, payload: { ...valid.payload, battery_percent: 1 } };
  assert.throws(() => f.cloud.acceptTelemetry(forged), /signature/); assert.equal(f.cloud.deviceProjection(), null);
  const { signature_b64url: _, ...staleUnsigned } = { ...valid, boot_id: "boot-g008-stale" }; const stale = { ...staleUnsigned, signature_b64url: f.identity.sign(staleUnsigned) };
  assert.throws(() => f.cloud.acceptTelemetry(stale), /authority/); assert.equal(f.cloud.deviceProjection(), null);
  f.cloud.acceptTelemetry(valid); const accepted = f.cloud.deviceProjection(); assert.ok(accepted); assert.equal(accepted.sequence, 1); assert.equal(accepted.online, true);
  assert.throws(() => f.cloud.acceptTelemetry(valid), /sequence/); assert.equal(f.cloud.deviceProjection()!.sequence, 1);
  f.clock.advance(21); assert.equal(f.cloud.deviceProjection()!.online, false);
});

test("telemetry cursors remain isolated per device across interleaved frames", () => {
  const f = fixture(); const otherIdentity = new SimulatedDeviceIdentity("device-g008-beta"); const otherAuthority = f.cloud.provision(otherIdentity, 2, "boot-g008-beta");
  const otherDevice = new SimulatedG008Device(otherIdentity, f.cloud.controlPublicKeyPem, f.clock, 2, "boot-g008-beta"); otherDevice.applyAuthoritativeSnapshot(otherAuthority);
  const alphaOne = f.device.telemetry(); const betaOne = otherDevice.telemetry();
  f.cloud.acceptTelemetry(alphaOne); f.cloud.acceptTelemetry(betaOne);
  assert.throws(() => f.cloud.acceptTelemetry(alphaOne), /sequence/);
  assert.equal(f.cloud.deviceProjection(f.identity.deviceId)!.sequence, 1); assert.equal(f.cloud.deviceProjection(otherIdentity.deviceId)!.sequence, 1);
});

test("canonical API serializes SIMULATED projections without secrets", () => {
  const result = runSimulatedG008Scenario(new MutableClock()); const serialized = JSON.stringify(result);
  assert.equal(result.evidence, "SIMULATED"); assert.ok(serialized.includes("acknowledged")); assert.equal(/PRIVATE KEY|private_key|secret/i.test(serialized), false);
});

let passed = 0;
console.log("SIMULATED G008 COMMAND DELIVERY VERIFICATION");
for (const entry of tests) {
  try { entry.run(); passed += 1; console.log(`SIMULATED PASS ${entry.name}`); }
  catch (error) { console.error(`SIMULATED FAIL ${entry.name}`); throw error; }
}
console.log(`SIMULATED SUMMARY ${passed}/${tests.length} PASS, 0 FAIL`);
