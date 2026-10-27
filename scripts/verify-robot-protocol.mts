interface Assertions {
  equal(actual: unknown, expected: unknown): void; ok(value: unknown): asserts value;
  deepEqual(actual: unknown, expected: unknown): void; throws(run: () => unknown, pattern: RegExp): void;
}
const assert: Assertions = {
  equal(actual, expected) { if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`); },
  ok(value): asserts value { if (!value) throw new Error("expected truthy value"); },
  deepEqual(actual, expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`); },
  throws(run, pattern) { try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; } throw new Error(`expected ${pattern}`); },
};
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { MutableClock, SimulatedDeviceIdentity, SimulatedProtocolCloud, SimulatedRobot, type ReceiptStore } from "../iot/simulator/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { PROTOCOL_VERSION, type AuthenticatedActor, type SignedAck } from "../src/domain/device-protocol/index.ts";

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void): void => { tests.push({ name, run }); };

function fixture() {
  const clock = new MutableClock();
  const cloud = new SimulatedProtocolCloud(clock, { challengeTtlMs: 100, commandTtlMs: 5_000, leaseMs: 100, maxAttempts: 3, maxClockSkewMs: 100 });
  const identity = new SimulatedDeviceIdentity("device-alpha");
  const actor: AuthenticatedActor = { authenticated: true, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair", "command:diagnostics.health_check"] };
  cloud.registerAccount(actor.account_id); cloud.registerTerminal(actor.terminal_id); cloud.registerSession(actor); cloud.registerManufacturedDevice(identity);
  const challenge = cloud.issuePairingChallenge(actor, identity.deviceId);
  const pairing = cloud.completePairing(actor, challenge, identity.sign(challenge));
  const receipts: ReceiptStore = new Map();
  const robot = new SimulatedRobot(identity, cloud.controlPublicKeyPem, clock, pairing.epochUpdate.update.previous_epoch, receipts);
  robot.applyEpochUpdate(pairing.epochUpdate);
  const bootChallenge = cloud.issueBootChallenge(identity.deviceId);
  cloud.completeBoot(bootChallenge, robot.bootId, robot.signBoot(bootChallenge));
  const command = (key = "idem-health-001") => cloud.createHealthCheck(actor, identity.deviceId, cloud.devices.get(identity.deviceId)!.authorization_epoch, key);
  const leaseAndPublish = () => { const lease = cloud.leaseNext(); assert.ok(lease); return { lease, published: cloud.publishLease(lease) }; };
  const authorize = (published: ReturnType<typeof cloud.publishLease>, target = robot) => { const challenge = target.issueDeliveryChallenge(published.command.command_id); return { challenge, delivery: cloud.authorizeDelivery(published, challenge) }; };
  const deliver = (published: ReturnType<typeof cloud.publishLease>, target = robot, crash: "none" | "after_receipt" | "after_executing" = "none") => { const { challenge, delivery } = authorize(published, target); return cloud.deliver(target, published, challenge, delivery, crash); };
  return { clock, cloud, identity, actor, robot, receipts, command, leaseAndPublish, authorize, deliver };
}

test("success path uses manufactured identity, signed command, ACK event projection and telemetry", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const acks = f.deliver(published);
  assert.deepEqual(acks.map((ack) => ack.ack.status), ["accepted", "executing", "succeeded"]);
  assert.deepEqual(acks.map((ack) => f.cloud.acceptAck(ack)), [true, true, true]);
  assert.equal(f.cloud.ackEvents.length, 3); assert.equal(f.cloud.outbox.get(published.command.command_id)!.status, "completed");
  f.cloud.acceptTelemetry(f.robot.telemetry(1));
});

test("pairing challenge is deep-copied and invalid signature does not consume CAS", () => {
  const clock = new MutableClock(); const cloud = new SimulatedProtocolCloud(clock); const identity = new SimulatedDeviceIdentity("device-alpha"); const attacker = new SimulatedDeviceIdentity("device-attacker");
  const actor: AuthenticatedActor = { authenticated: true, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerAccount(actor.account_id); cloud.registerTerminal(actor.terminal_id); cloud.registerSession(actor); cloud.registerManufacturedDevice(identity);
  const changed = cloud.issuePairingChallenge(actor, identity.deviceId); changed.owner_account_id = "account-mutated";
  assert.throws(() => cloud.completePairing(actor, changed, identity.sign(changed)), /changed/);
  const valid = cloud.issuePairingChallenge(actor, identity.deviceId);
  assert.throws(() => cloud.completePairing(actor, valid, attacker.sign(valid)), /signature/);
  cloud.completePairing(actor, valid, identity.sign(valid));
  assert.throws(() => cloud.completePairing(actor, valid, identity.sign(valid)), /replayed/);
});

test("pairing challenge expiry and cross-device binding reject replay", () => {
  const clock = new MutableClock(); const cloud = new SimulatedProtocolCloud(clock, { challengeTtlMs: 10 }); const identity = new SimulatedDeviceIdentity("device-alpha");
  const actor: AuthenticatedActor = { authenticated: true, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerAccount(actor.account_id); cloud.registerTerminal(actor.terminal_id); cloud.registerSession(actor); cloud.registerManufacturedDevice(identity);
  const challenge = cloud.issuePairingChallenge(actor, identity.deviceId); clock.advance(11);
  assert.throws(() => cloud.completePairing(actor, challenge, identity.sign(challenge)), /expired/);
  const other = { ...challenge, challenge_id: "pair-changed", device_id: "device-other" };
  assert.throws(() => cloud.completePairing(actor, other, identity.sign(other)), /missing/);
});

test("manufacturing registry rejects unknown identity and public-key reuse", () => {
  const clock = new MutableClock(); const cloud = new SimulatedProtocolCloud(clock); const identity = new SimulatedDeviceIdentity("device-alpha");
  const actor: AuthenticatedActor = { authenticated: true, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerAccount(actor.account_id); cloud.registerTerminal(actor.terminal_id); cloud.registerSession(actor);
  assert.throws(() => cloud.issuePairingChallenge(actor, identity.deviceId), /identity unavailable/);
  cloud.registerManufacturedDevice(identity);
  const alias = Object.create(identity) as SimulatedDeviceIdentity; Object.defineProperty(alias, "deviceId", { value: "device-alias" });
  assert.throws(() => cloud.registerManufacturedDevice(alias), /public key already assigned/);
});

test("revoked, compromised and retired identities cannot ordinary rebind", () => {
  for (const status of ["revoked", "compromised", "retired"] as const) {
    const f = fixture(); const update = f.cloud.unbind(f.identity.deviceId); f.robot.applyEpochUpdate(update); f.cloud.setManufacturingStatus(f.identity.deviceId, status);
    assert.throws(() => f.cloud.issuePairingChallenge(f.actor, f.identity.deviceId), /identity unavailable/);
  }
});

test("actor authentication, session, account, terminal and capability are enforced", () => {
  const f = fixture();
  assert.throws(() => f.cloud.createHealthCheck({ ...f.actor, session_id: "" }, f.identity.deviceId, 2, "idem-no-session"), /capability rejected/);
  assert.throws(() => f.cloud.createHealthCheck({ ...f.actor, capabilities: ["device:pair"] }, f.identity.deviceId, 2, "idem-no-cap"), /capability rejected/);
  f.cloud.suspendAccount(f.actor.account_id);
  assert.throws(() => f.cloud.createHealthCheck(f.actor, f.identity.deviceId, 3, "idem-suspended"), /capability rejected/);
});

test("signed command rejects tampering, cross-device delivery and stale epoch", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const { challenge, delivery } = f.authorize(published);
  const tampered = { ...published, command: { ...published.command, idempotency_key: "idem-tampered" } };
  assert.throws(() => f.cloud.deliver(f.robot, tampered, challenge, delivery), /signature/);
  const other = new SimulatedDeviceIdentity("device-other"); const otherRobot = new SimulatedRobot(other, f.cloud.controlPublicKeyPem, f.clock, 2);
  const otherChallenge = otherRobot.issueDeliveryChallenge(published.command.command_id);
  assert.throws(() => f.cloud.authorizeDelivery(published, otherChallenge), /identity unavailable|challenge binding/);
  const update = f.cloud.quarantine(f.identity.deviceId); f.robot.applyEpochUpdate(update);
  assert.throws(() => f.cloud.deliver(f.robot, published, challenge, delivery), /authoritative delivery cancelled/);
});

test("epoch updates are signed, exact, monotonic and device-bound", () => {
  const f = fixture(); const update = f.cloud.quarantine(f.identity.deviceId);
  const attacker = new SimulatedDeviceIdentity("device-attacker");
  assert.throws(() => f.robot.applyEpochUpdate({ update: update.update, signature_b64url: attacker.sign(update.update) }), /signature/);
  f.robot.applyEpochUpdate(update);
  assert.throws(() => f.robot.applyEpochUpdate(update), /stale/);
  const forged = { ...update.update, previous_epoch: 3, next_epoch: 5 };
  assert.throws(() => f.robot.applyEpochUpdate({ update: forged, signature_b64url: attacker.sign(forged) }), /signature/);
});

test("account suspension atomically bumps epoch, cancels queued and flags published", () => {
  const f = fixture(); const queued = f.command("idem-queued"); const publishedCommand = f.command("idem-published");
  const first = f.cloud.leaseNext(); assert.ok(first); const published = f.cloud.publishLease(first);
  assert.equal(published.command.command_id, queued.command_id); // insertion order publishes the first command
  const updates = f.cloud.suspendAccount(f.actor.account_id); assert.equal(updates.length, 1);
  assert.equal(f.cloud.devices.get(f.identity.deviceId)!.authorization_epoch, 3);
  assert.equal(f.cloud.commands.get(queued.command_id)!.status, "revocation_pending");
  assert.equal(f.cloud.commands.get(publishedCommand.command_id)!.status, "cancelled");
  assert.equal(f.cloud.outbox.get(publishedCommand.command_id)!.status, "cancelled");
});

test("terminal revocation, unbind and quarantine invalidate old leases", () => {
  for (const operation of ["terminal", "unbind", "quarantine"] as const) {
    const f = fixture(); f.command(); const lease = f.cloud.leaseNext(); assert.ok(lease);
    if (operation === "terminal") f.cloud.revokeTerminal(f.actor.terminal_id);
    if (operation === "unbind") f.cloud.unbind(f.identity.deviceId);
    if (operation === "quarantine") f.cloud.quarantine(f.identity.deviceId);
    assert.throws(() => f.cloud.publishLease(lease), /stale|policy/);
  }
});

test("policy failures become expired, cancelled or rejected and never DLQ", () => {
  const expired = fixture(); const expiredCommand = expired.command(); expired.clock.advance(5_001); assert.equal(expired.cloud.leaseNext(), null);
  assert.equal(expired.cloud.commands.get(expiredCommand.command_id)!.status, "expired"); assert.equal(expired.cloud.outbox.get(expiredCommand.command_id)!.status, "cancelled");
  const rejected = fixture(); const rejectedCommand = rejected.command(); rejected.cloud.devices.get(rejected.identity.deviceId)!.allowed_commands = []; assert.equal(rejected.cloud.leaseNext(), null);
  assert.equal(rejected.cloud.commands.get(rejectedCommand.command_id)!.status, "rejected"); assert.equal(rejected.cloud.outbox.get(rejectedCommand.command_id)!.status, "cancelled");
});

test("outbox fencing rejects stale/reused leases and exposes exponential jittered retry", () => {
  const f = fixture(); f.command(); const first = f.cloud.leaseNext(); assert.ok(first); const delay1 = f.cloud.retryLease(first); assert.ok(delay1 >= 1_000 && delay1 < 1_250);
  f.clock.advance(delay1); const second = f.cloud.leaseNext(); assert.ok(second); assert.equal(second.fencingToken, first.fencingToken + 1);
  assert.throws(() => f.cloud.publishLease(first), /stale/); const published = f.cloud.publishLease(second);
  assert.throws(() => f.cloud.publishLease(second), /already-used/); assert.equal(f.cloud.outbox.get(published.command.command_id)!.status, "published");
});

test("lease-holder crashes recover with backoff and reach transport-only DLQ", () => {
  const f = fixture(); f.command();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const lease = f.cloud.leaseNext(); assert.ok(lease);
    f.clock.advance(101); // holder disappears without retryLease
    assert.equal(f.cloud.leaseNext(), null);
    const row = [...f.cloud.outbox.values()][0];
    if (attempt < 3) {
      assert.equal(row.status, "queued"); const delay = row.availableAt - f.clock.now();
      assert.ok(delay >= 1_000 * 2 ** (attempt - 1) && delay < 1_250 * 2 ** (attempt - 1)); f.clock.advance(delay);
    } else {
      assert.equal(row.status, "dead_letter"); assert.equal(row.deadLetterReason, "transport_lease_holder_crash_exhausted");
    }
  }
});

test("transport attempts reach DLQ only at max attempts", () => {
  const f = fixture(); f.command();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const lease = f.cloud.leaseNext(); assert.ok(lease); const delay = f.cloud.retryLease(lease);
    if (attempt < 3) { assert.ok(delay > 0); f.clock.advance(delay); } else assert.equal(delay, 0);
  }
  assert.equal([...f.cloud.outbox.values()][0].status, "dead_letter"); assert.equal([...f.cloud.outbox.values()][0].deadLetterReason, "transport_retry_exhausted");
});

test("boot challenge is signed, one-use, expiring and counter-monotonic", () => {
  const f = fixture(); const challenge = f.cloud.issueBootChallenge(f.identity.deviceId);
  const attacker = new SimulatedDeviceIdentity("device-attacker");
  assert.throws(() => f.cloud.completeBoot(challenge, "bootid-attacker", attacker.sign({ challenge, boot_id: "bootid-attacker" })), /signature/);
  const nextRobot = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2);
  f.cloud.completeBoot(challenge, nextRobot.bootId, nextRobot.signBoot(challenge));
  assert.throws(() => f.cloud.completeBoot(challenge, nextRobot.bootId, nextRobot.signBoot(challenge)), /replayed/);
  const expired = f.cloud.issueBootChallenge(f.identity.deviceId); f.clock.advance(101);
  assert.throws(() => f.cloud.completeBoot(expired, nextRobot.bootId, nextRobot.signBoot(expired)), /expired/);
});

test("ACK authentication, append-only event order, active boot and final monotonicity hold", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const acks = f.deliver(published);
  const attacker = new SimulatedDeviceIdentity("device-attacker"); const forged: SignedAck = { ack: acks[0].ack, signature_b64url: attacker.sign(acks[0].ack) };
  assert.throws(() => f.cloud.acceptAck(forged), /unauthenticated/); assert.equal(f.cloud.ackEvents.length, 0);
  for (const ack of acks) assert.equal(f.cloud.acceptAck(ack), true);
  assert.equal(f.cloud.acceptAck(acks[0]), false); assert.equal(f.cloud.ackEvents.at(-1)!.reason, "command_already_terminal");
  const contradictory: SignedAck = { ...acks[2], ack: { ...acks[2].ack, status: "failed" } };
  contradictory.signature_b64url = f.identity.sign(contradictory.ack); assert.equal(f.cloud.acceptAck(contradictory), false);
  assert.equal(f.cloud.commands.get(published.command.command_id)!.status, "succeeded");
});

test("authenticated unknown and binding-mismatched ACKs append before rejected projection", () => {
  const f = fixture(); const command = f.command();
  const base = { protocol_version: PROTOCOL_VERSION, command_id: "command-unknown", device_id: f.identity.deviceId, authorization_epoch: 2, idempotency_key: "idem-unknown", boot_id: f.robot.bootId, status: "accepted" as const, occurred_at_ms: f.clock.now(), reason: null };
  assert.equal(f.cloud.acceptAck({ ack: base, signature_b64url: f.identity.sign(base) }), false);
  assert.equal(f.cloud.ackEvents.at(-1)!.reason, "unknown_command");
  const mismatch = { ...base, command_id: command.command_id, idempotency_key: "idem-wrong" };
  assert.equal(f.cloud.acceptAck({ ack: mismatch, signature_b64url: f.identity.sign(mismatch) }), false);
  assert.equal(f.cloud.ackEvents.at(-1)!.reason, "binding_mismatch");
});

test("expired, cancelled and rejected command finals cannot be reversed by ACK", () => {
  for (const terminal of ["expired", "cancelled", "rejected"] as const) {
    const f = fixture(); const command = f.command(); f.cloud.commands.get(command.command_id)!.status = terminal;
    const ack = { protocol_version: PROTOCOL_VERSION, command_id: command.command_id, device_id: f.identity.deviceId, authorization_epoch: 2, idempotency_key: command.idempotency_key, boot_id: f.robot.bootId, status: "accepted" as const, occurred_at_ms: f.clock.now(), reason: null };
    assert.equal(f.cloud.acceptAck({ ack, signature_b64url: f.identity.sign(ack) }), false);
    assert.equal(f.cloud.commands.get(command.command_id)!.status, terminal); assert.equal(f.cloud.ackEvents.at(-1)!.reason, "command_already_terminal");
  }
});

test("ACK from an old boot is appended but cannot project", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const oldAcks = f.deliver(published);
  const newRobot = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2); const challenge = f.cloud.issueBootChallenge(f.identity.deviceId);
  f.cloud.completeBoot(challenge, newRobot.bootId, newRobot.signBoot(challenge));
  assert.equal(f.cloud.acceptAck(oldAcks[0]), false); assert.equal(f.cloud.ackEvents.at(-1)!.reason, "inactive_boot_or_authorization");
});

test("durable receipt covers crash after accepted without duplicate execution", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish();
  assert.throws(() => f.deliver(published, f.robot, "after_receipt"), /crash/);
  const restarted = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2, f.receipts, f.robot.bootId);
  const recovered = f.deliver(published, restarted); assert.deepEqual(recovered.map((ack) => ack.ack.status), ["accepted", "executing", "succeeded"]); assert.equal(restarted.executionCount, 1);
  assert.equal(f.deliver(published, restarted)[0].ack.status, "succeeded"); assert.equal(restarted.executionCount, 1);
});

test("durable executing receipt fails closed after crash and does not replay execution", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish();
  assert.throws(() => f.deliver(published, f.robot, "after_executing"), /crash/);
  const restarted = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2, f.receipts, f.robot.bootId);
  const recovered = f.deliver(published, restarted); assert.equal(recovered[0].ack.status, "failed"); assert.equal(restarted.executionCount, 0);
  assert.equal(f.deliver(published, restarted)[0].ack.status, "failed");
});

test("cached allow cannot cross unbind when epoch update is lost", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish();
  const { challenge, delivery: cachedAllow } = f.authorize(published);
  assert.equal(cachedAllow.authorization.decision, "allow");
  f.cloud.unbind(f.identity.deviceId); // deliberately drop the signed epoch update
  assert.throws(() => f.cloud.deliver(f.robot, published, challenge, cachedAllow), /authoritative delivery cancelled/);
  assert.equal(f.robot.executionCount, 0);
});

test("one-time delivery authorization and robot nonce reject replay", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const { challenge, delivery } = f.authorize(published);
  const result = f.cloud.deliver(f.robot, published, challenge, delivery); assert.equal(result.at(-1)!.ack.status, "succeeded");
  assert.throws(() => f.cloud.deliver(f.robot, published, challenge, delivery), /replayed/); assert.equal(f.robot.executionCount, 1);
});

test("forged or tampered signed delivery challenges do not advance counter and genuine challenge succeeds", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const genuine = f.robot.issueDeliveryChallenge(published.command.command_id);
  const attacker = new SimulatedDeviceIdentity("device-attacker"); const before = f.cloud.devices.get(f.identity.deviceId)!.delivery_counter;
  assert.throws(() => f.cloud.authorizeDelivery(published, { challenge: genuine.challenge, signature_b64url: attacker.sign(genuine.challenge) }), /challenge signature/);
  const tampered = { ...genuine, challenge: { ...genuine.challenge, nonce_b64url: "tampered_nonce_value_1234" } };
  assert.throws(() => f.cloud.authorizeDelivery(published, tampered), /challenge signature/);
  assert.equal(f.cloud.devices.get(f.identity.deviceId)!.delivery_counter, before);
  const authorization = f.cloud.authorizeDelivery(published, genuine); const result = f.cloud.deliver(f.robot, published, genuine, authorization);
  assert.equal(result.at(-1)!.ack.status, "succeeded"); assert.equal(f.cloud.devices.get(f.identity.deviceId)!.delivery_counter, before + 1);
});

test("robot-side validation failure atomically preserves authorization and counters", () => {
  const f = fixture(); f.command(); const { published } = f.leaseAndPublish(); const signedChallenge = f.robot.issueDeliveryChallenge(published.command.command_id);
  const authorization = f.cloud.authorizeDelivery(published, signedChallenge); const before = f.cloud.devices.get(f.identity.deviceId)!.delivery_counter;
  const wrongRobot = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2, new Map(), f.robot.bootId);
  assert.throws(() => f.cloud.deliver(wrongRobot, published, signedChallenge, authorization), /robot delivery challenge/);
  assert.equal(f.cloud.devices.get(f.identity.deviceId)!.delivery_counter, before);
  const result = f.cloud.deliver(f.robot, published, signedChallenge, authorization);
  assert.equal(result.at(-1)!.ack.status, "succeeded"); assert.equal(f.cloud.devices.get(f.identity.deviceId)!.delivery_counter, before + 1);
});

test("envelope persists actor/session policy and publish rechecks revoked session or capability", () => {
  const session = fixture(); const sessionCommand = session.command();
  assert.equal(sessionCommand.actor_user_id, session.actor.user_id); assert.equal(sessionCommand.auth_session_id, session.actor.session_id);
  assert.equal(sessionCommand.policy_version, 1); assert.equal(sessionCommand.capability, "command:diagnostics.health_check");
  const sessionLease = session.cloud.leaseNext(); assert.ok(sessionLease); session.cloud.revokeSession(session.actor.session_id);
  assert.throws(() => session.cloud.publishLease(sessionLease), /policy rejected/);
  assert.equal(session.cloud.commands.get(sessionCommand.command_id)!.status, "cancelled");

  const capability = fixture(); const capabilityCommand = capability.command(); const capabilityLease = capability.cloud.leaseNext(); assert.ok(capabilityLease);
  capability.cloud.revokeSessionCapability(capability.actor.session_id, "command:diagnostics.health_check");
  assert.throws(() => capability.cloud.publishLease(capabilityLease), /policy rejected/);
  assert.equal(capability.cloud.commands.get(capabilityCommand.command_id)!.status, "rejected");
});

test("telemetry rejects forged signature, replay, stale boot, stale epoch and skew", () => {
  const f = fixture(); const valid = f.robot.telemetry(1); f.cloud.acceptTelemetry(valid);
  assert.throws(() => f.cloud.acceptTelemetry(valid), /replayed/);
  const forged = { ...f.robot.telemetry(2), payload: { ...f.robot.telemetry(2).payload, battery_percent: 1 } }; assert.throws(() => f.cloud.acceptTelemetry(forged), /signature/);
  assert.throws(() => f.cloud.acceptTelemetry(f.robot.telemetry(2, f.clock.now() - 101)), /skew/);
  const oldRobot = f.robot; const newRobot = new SimulatedRobot(f.identity, f.cloud.controlPublicKeyPem, f.clock, 2); const boot = f.cloud.issueBootChallenge(f.identity.deviceId); f.cloud.completeBoot(boot, newRobot.bootId, newRobot.signBoot(boot));
  assert.throws(() => f.cloud.acceptTelemetry(oldRobot.telemetry(2)), /boot stale/); f.cloud.acceptTelemetry(newRobot.telemetry(1));
  f.cloud.quarantine(f.identity.deviceId); assert.throws(() => f.cloud.acceptTelemetry(newRobot.telemetry(2)), /owned/);
});

test("real non-empty structured logs redact private keys, Wi-Fi credentials and tokens", () => {
  const f = fixture(); assert.ok(f.cloud.logs.length > 3);
  f.cloud.testOnlyWriteLog("redaction.probe", { private_key: "-----BEGIN PRIVATE KEY-----secret", wifi_password: "super-secret-wifi", access_token: "token-value", nested: { credential: "credential-value" } });
  const logs = f.cloud.logs.join("\n"); assert.ok(logs.includes("SIMULATED")); assert.ok(logs.includes("[REDACTED]"));
  for (const secret of ["BEGIN PRIVATE KEY", "super-secret-wifi", "token-value", "credential-value"]) assert.equal(logs.includes(secret), false);
});

let passed = 0;
console.log("SIMULATED ROBOT PROTOCOL VERIFICATION");
for (const entry of tests) {
  try { entry.run(); passed += 1; console.log(`SIMULATED PASS ${entry.name}`); }
  catch (error) { console.error(`SIMULATED FAIL ${entry.name}`); throw error; }
}
console.log(`SIMULATED SUMMARY ${passed}/${tests.length} PASS, 0 FAIL`);
console.log(`SIMULATED PROTOCOL VERSION ${PROTOCOL_VERSION}`);
