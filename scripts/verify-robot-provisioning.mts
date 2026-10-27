interface Assertions {
  equal(actual: unknown, expected: unknown): void;
  ok(value: unknown): asserts value;
  throws(run: () => unknown, pattern: RegExp): void;
}

const assert: Assertions = {
  equal(actual, expected) {
    if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`);
  },
  ok(value): asserts value {
    if (!value) throw new Error("expected truthy value");
  },
  throws(run, pattern) {
    try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
    throw new Error(`expected ${String(pattern)}`);
  },
};

// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { MutableClock, SimulatedDeviceIdentity } from "../iot/simulator/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { SimulatedProvisioningCloud, SimulatedProvisioningDevice } from "../iot/simulator/provisioning-simulator.ts";

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void): void => { tests.push({ name, run }); };

function fixture() {
  const clock = new MutableClock();
  const identity = new SimulatedDeviceIdentity("device-alpha");
  const cloud = new SimulatedProvisioningCloud(clock, { challengeTtlMs: 100 });
  const device = new SimulatedProvisioningDevice(identity, cloud.credentialAuthorityPublicKeyPem);
  const actor = { authenticated: true as const, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerOwnedDevice(identity, actor.account_id, actor.terminal_id, 2, 7);
  cloud.registerProvisioningDevice(device);
  cloud.registerSession(actor);
  const begin = () => {
    const session = cloud.begin(actor, identity.deviceId);
    return cloud.acceptDeviceProof(device.signSessionProof(session, clock.now()));
  };
  const submit = (provisioningId: string) => cloud.submitCredentials(actor, provisioningId, device, { ssid: "PlantNet", password: "secret-password" });
  const connect = (provisioningId: string) => {
    cloud.acceptDeviceReport(device.signProvisioningReport(cloud.session(provisioningId), "network_connected"));
    return device.signOnlineConfirmation(cloud.session(provisioningId), clock.now());
  };
  return { clock, identity, device, cloud, actor, begin, submit, connect };
}

test("authenticated owner can provision once after signed online confirmation", () => {
  const clock = new MutableClock();
  const identity = new SimulatedDeviceIdentity("device-alpha");
  const cloud = new SimulatedProvisioningCloud(clock, { challengeTtlMs: 100 });
  const device = new SimulatedProvisioningDevice(identity, cloud.credentialAuthorityPublicKeyPem);
  const actor = { authenticated: true as const, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerOwnedDevice(identity, actor.account_id, actor.terminal_id, 2, 7);
  cloud.registerProvisioningDevice(device);
  cloud.registerSession(actor);
  const session = cloud.begin(actor, identity.deviceId);
  assert.equal(session.phase, "authenticating");
  const ready = cloud.acceptDeviceProof(device.signSessionProof(session));
  assert.equal(ready.phase, "secure_channel_ready");
  cloud.submitCredentials(actor, session.provisioning_id, device, { ssid: "PlantNet", password: "secret-password" });
  cloud.acceptDeviceReport(device.signProvisioningReport(cloud.session(session.provisioning_id), "network_connected"));
  const confirmation = device.signOnlineConfirmation(cloud.session(session.provisioning_id));
  const completed = cloud.acceptOnlineConfirmation(confirmation);

  assert.equal(completed.phase, "succeeded");
  assert.equal(device.credentialWriteCount, 1);
  assert.equal("ssid" in completed, false);
  assert.equal("password" in completed, false);
});

test("client authentication claims require an active cloud session", () => {
  const clock = new MutableClock();
  const identity = new SimulatedDeviceIdentity("device-alpha");
  const cloud = new SimulatedProvisioningCloud(clock);
  const actor = { authenticated: true as const, user_id: "user-alpha", account_id: "account-alpha", terminal_id: "terminal-alpha", session_id: "session-alpha", capabilities: ["device:pair"] };
  cloud.registerOwnedDevice(identity, actor.account_id, actor.terminal_id, 2, 7);
  assert.throws(() => cloud.begin(actor, identity.deviceId), /session/);
});

test("credentials require a session-bound device proof and forged proof does not consume the session", () => {
  const f = fixture();
  const raw = f.cloud.begin(f.actor, f.identity.deviceId);
  assert.equal(raw.phase, "authenticating");
  assert.throws(() => f.submit(raw.provisioning_id), /secure channel/);
  assert.equal(f.device.credentialWriteCount, 0);

  const attacker = new SimulatedDeviceIdentity("device-attacker");
  const genuine = f.device.signSessionProof(raw, f.clock.now());
  assert.throws(() => f.cloud.acceptDeviceProof({ ...genuine, signature_b64url: attacker.sign(genuine.proof) }), /signature/);
  assert.throws(() => f.device.credentialEnvelope(raw, f.clock.now()), /authorization|unavailable|secure[- ]session/);
  assert.equal(f.cloud.session(raw.provisioning_id).phase, "authenticating");
  assert.equal(f.cloud.acceptDeviceProof(genuine).phase, "secure_channel_ready");
  f.submit(raw.provisioning_id);
  assert.equal(f.device.credentialWriteCount, 1);
});

test("device rejects credential delivery without an authenticated secure-session envelope", () => {
  const identity = new SimulatedDeviceIdentity("device-alpha");
  const device = new SimulatedProvisioningDevice(identity);
  assert.throws(
    () => device.applyCredentials("forged-delivery" as never, { ssid: "PlantNet", password: "secret-password" }, 0),
    /authenticated|authorization|envelope|signature|secure[- ]session/,
  );
  assert.equal(device.credentialWriteCount, 0);
});

test("double begin reuses the single active device provisioning session and writes credentials once", () => {
  const f = fixture();
  const first = f.cloud.begin(f.actor, f.identity.deviceId);
  const second = f.cloud.begin(f.actor, f.identity.deviceId);
  assert.equal(second.provisioning_id, first.provisioning_id);
  assert.equal(second.challenge_id, first.challenge_id);

  f.cloud.acceptDeviceProof(f.device.signSessionProof(first, f.clock.now()));
  f.submit(first.provisioning_id);
  assert.equal(f.device.credentialWriteCount, 1);
  assert.equal(f.cloud.session(second.provisioning_id).phase, "connecting");
  assert.throws(() => f.submit(second.provisioning_id), /replayed|out of order/);
  assert.equal(f.device.credentialWriteCount, 1);
});

test("device secure-session envelope is bound to challenge device auth epoch reset counter and expiry", () => {
  const f = fixture();
  const session = f.begin();
  const envelope = f.device.credentialEnvelope(session, f.clock.now());
  const changes = [
    { secure_session_handle: "forged-handle" },
    { provisioning_id: "provision-other" },
    { challenge_id: "challenge-other" },
    { device_id: "device-other" },
    { auth_session_id: "session-other" },
    { authorization_epoch: envelope.authorization_epoch + 1 },
    { factory_reset_counter: envelope.factory_reset_counter + 1 },
    { expires_at_ms: envelope.expires_at_ms + 1 },
    { signature_b64url: "forged-signature" },
  ];
  for (const change of changes) {
    assert.throws(
      () => f.device.applyCredentials({ ...envelope, ...change }, { ssid: "PlantNet", password: "secret-password" }, f.clock.now()),
      /authenticated|authorization|envelope|signature|secure[- ]session/,
    );
  }
  f.clock.advance(101);
  assert.throws(
    () => f.device.applyCredentials(envelope, { ssid: "PlantNet", password: "secret-password" }, f.clock.now()),
    /expired|time/,
  );
  assert.equal(f.device.credentialWriteCount, 0);
});

test("Wi-Fi secrets are ephemeral and revoked or unauthenticated sessions cannot transmit them", () => {
  const f = fixture();
  const first = f.begin();
  assert.throws(() => f.cloud.submitCredentials({ ...f.actor, authenticated: false }, first.provisioning_id, f.device, { ssid: "PlantNet", password: "secret-password" }), /authenticated/);
  assert.equal(f.device.credentialWriteCount, 0);
  f.submit(first.provisioning_id);
  const serialized = JSON.stringify(f.cloud.session(first.provisioning_id));
  assert.equal(serialized.includes("PlantNet"), false);
  assert.equal(serialized.includes("secret-password"), false);

  const secondFixture = fixture();
  const second = secondFixture.begin();
  secondFixture.cloud.revokeSession(secondFixture.actor.session_id);
  assert.throws(() => secondFixture.submit(second.provisioning_id), /session/);
  assert.equal(secondFixture.device.credentialWriteCount, 0);
});

test("disconnect recovery never writes credentials twice", () => {
  const f = fixture(); const session = f.begin();
  f.submit(session.provisioning_id);
  f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_disconnected"));
  assert.equal(f.cloud.session(session.provisioning_id).phase, "connecting");
  assert.throws(() => f.submit(session.provisioning_id), /replayed|out of order/);
  assert.equal(f.device.credentialWriteCount, 1);
  const confirmation = f.connect(session.provisioning_id);
  assert.equal(f.cloud.acceptOnlineConfirmation(confirmation).phase, "succeeded");
  assert.equal(f.device.credentialWriteCount, 1);
});

test("cancelled and expired provisioning sessions reject credentials and stay terminal", () => {
  const cancelled = fixture(); const cancelledSession = cancelled.begin();
  const cancelledEnvelope = cancelled.device.credentialEnvelope(cancelledSession, cancelled.clock.now());
  assert.equal(cancelled.cloud.cancel(cancelled.actor, cancelledSession.provisioning_id).phase, "cancelled");
  assert.throws(
    () => cancelled.device.applyCredentials(cancelledEnvelope, { ssid: "PlantNet", password: "secret-password" }, cancelled.clock.now()),
    /authorization|cancelled|inactive|invalidated|revoked|secure[- ]session/,
  );
  assert.throws(
    () => cancelled.device.acceptCredentialAuthorization(cancelledEnvelope, cancelled.clock.now()),
    /authorization|replay|revoked/,
  );
  assert.throws(
    () => cancelled.device.applyCredentials(cancelledEnvelope, { ssid: "PlantNet", password: "secret-password" }, cancelled.clock.now()),
    /authorization|inactive|revoked|secure[- ]session/,
  );
  assert.throws(() => cancelled.submit(cancelledSession.provisioning_id), /terminal/);
  assert.throws(() => cancelled.cloud.acceptDeviceReport(cancelled.device.signProvisioningReport(cancelled.cloud.session(cancelledSession.provisioning_id), "network_connected")), /terminal/);
  assert.equal(cancelled.device.credentialWriteCount, 0);

  const expired = fixture(); const expiredSession = expired.begin(); expired.clock.advance(101);
  assert.throws(() => expired.submit(expiredSession.provisioning_id), /expired/);
  assert.equal(expired.cloud.session(expiredSession.provisioning_id).phase, "expired");
  assert.throws(() => expired.cloud.cancel(expired.actor, expiredSession.provisioning_id), /terminal/);
  assert.equal(expired.device.credentialWriteCount, 0);
});

test("revoked superseded or ownership-invalidated cloud sessions fence the device authorization", () => {
  const revoked = fixture(); const revokedSession = revoked.begin(); const revokedEnvelope = revoked.device.credentialEnvelope(revokedSession, revoked.clock.now());
  revoked.cloud.revokeSession(revoked.actor.session_id);
  assert.throws(() => revoked.device.applyCredentials(revokedEnvelope, { ssid: "PlantNet", password: "secret-password" }, revoked.clock.now()), /authorization|inactive|invalidated|revoked|secure[- ]session/);
  assert.equal(revoked.device.credentialWriteCount, 0);

  const ownership = fixture(); const ownershipSession = ownership.begin(); const ownershipEnvelope = ownership.device.credentialEnvelope(ownershipSession, ownership.clock.now());
  ownership.cloud.updateOwnership(ownership.identity.deviceId, ownership.actor.account_id, ownership.actor.terminal_id, 3, 8);
  assert.throws(() => ownership.device.applyCredentials(ownershipEnvelope, { ssid: "PlantNet", password: "secret-password" }, ownership.clock.now()), /authorization|inactive|invalidated|revoked|secure[- ]session/);
  assert.equal(ownership.device.credentialWriteCount, 0);

  const superseded = fixture(); const oldSession = superseded.begin(); const oldEnvelope = superseded.device.credentialEnvelope(oldSession, superseded.clock.now());
  const nextActor = { ...superseded.actor, session_id: "session-next" };
  superseded.cloud.registerSession(nextActor);
  const nextSession = superseded.cloud.begin(nextActor, superseded.identity.deviceId);
  assert.equal(superseded.cloud.session(oldSession.provisioning_id).phase, "invalidated");
  assert.equal(nextSession.phase, "authenticating");
  assert.throws(() => superseded.device.applyCredentials(oldEnvelope, { ssid: "PlantNet", password: "secret-password" }, superseded.clock.now()), /authorization|inactive|invalidated|revoked|secure[- ]session/);
  assert.equal(superseded.device.credentialWriteCount, 0);
});

test("a silently expired session is fenced before a fresh provisioning retry starts", () => {
  const f = fixture();
  const oldSession = f.begin();
  const oldEnvelope = f.device.credentialEnvelope(oldSession, f.clock.now());
  f.clock.advance(101);

  const fresh = f.cloud.begin(f.actor, f.identity.deviceId);
  assert.equal(f.cloud.session(oldSession.provisioning_id).phase, "expired");
  assert.equal(fresh.phase, "authenticating");
  assert.equal(fresh.provisioning_id === oldSession.provisioning_id, false);
  assert.throws(() => f.device.acceptCredentialAuthorization(oldEnvelope, f.clock.now()), /authorization|expired|replay|revoked/);

  const ready = f.cloud.acceptDeviceProof(f.device.signSessionProof(fresh, f.clock.now()));
  assert.equal(ready.phase, "secure_channel_ready");
  f.submit(fresh.provisioning_id);
  assert.equal(f.device.credentialWriteCount, 1);
});

test("cross-device delivery and forged confirmation signatures are rejected without consuming success", () => {
  const cross = fixture(); const session = cross.begin();
  const otherIdentity = new SimulatedDeviceIdentity("device-other");
  const otherDevice = new SimulatedProvisioningDevice(otherIdentity);
  cross.cloud.registerOwnedDevice(otherIdentity, cross.actor.account_id, cross.actor.terminal_id, 2, 7);
  assert.throws(() => cross.cloud.submitCredentials(cross.actor, session.provisioning_id, otherDevice, { ssid: "OtherNet", password: "other-password" }), /cross-device/);
  assert.equal(otherDevice.credentialWriteCount, 0);

  cross.submit(session.provisioning_id);
  const genuine = cross.connect(session.provisioning_id);
  assert.throws(() => cross.cloud.acceptOnlineConfirmation({ ...genuine, signature_b64url: otherIdentity.sign(genuine.confirmation) }), /signature/);
  assert.equal(cross.cloud.session(session.provisioning_id).phase, "awaiting_confirmation");
  assert.equal(cross.cloud.acceptOnlineConfirmation(genuine).phase, "succeeded");
  assert.throws(() => cross.cloud.acceptOnlineConfirmation(genuine), /terminal/);
});

test("signed online confirmation is bound to device, auth session, epoch and factory-reset counter", () => {
  const changes = [
    { device_id: "device-other" },
    { auth_session_id: "session-other" },
    { authorization_epoch: 3 },
    { factory_reset_counter: 8 },
  ];
  for (const change of changes) {
    const f = fixture(); const session = f.begin(); f.submit(session.provisioning_id);
    const genuine = f.connect(session.provisioning_id);
    const confirmation = { ...genuine.confirmation, ...change };
    assert.throws(() => f.cloud.acceptOnlineConfirmation({ confirmation, signature_b64url: f.identity.sign(confirmation) }), /binding/);
    assert.equal(f.cloud.session(session.provisioning_id).phase, "awaiting_confirmation");
  }
});

test("cloud ownership is rechecked immediately before success", () => {
  const f = fixture(); const session = f.begin(); f.submit(session.provisioning_id);
  const confirmation = f.connect(session.provisioning_id);
  f.cloud.updateOwnership(f.identity.deviceId, f.actor.account_id, f.actor.terminal_id, 3, 7);
  assert.throws(() => f.cloud.acceptOnlineConfirmation(confirmation), /ownership/);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "invalidated");
});

test("revoked auth session after credential write cannot complete provisioning", () => {
  const f = fixture(); const session = f.begin(); f.submit(session.provisioning_id);
  const confirmation = f.connect(session.provisioning_id);
  f.cloud.revokeSession(f.actor.session_id);
  assert.throws(() => f.cloud.acceptOnlineConfirmation(confirmation), /invalidated/);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "invalidated");

  const capability = fixture(); const capabilitySession = capability.begin(); capability.submit(capabilitySession.provisioning_id);
  const capabilityConfirmation = capability.connect(capabilitySession.provisioning_id);
  capability.cloud.revokeCapability(capability.actor.session_id, "device:pair");
  assert.throws(() => capability.cloud.acceptOnlineConfirmation(capabilityConfirmation), /invalidated/);
  assert.equal(capability.cloud.session(capabilitySession.provisioning_id).phase, "invalidated");
});

test("factory-reset counter changes invalidate the old session without rewriting credentials", () => {
  const f = fixture(); const session = f.begin();
  f.submit(session.provisioning_id);
  assert.equal(f.device.credentialWriteCount, 1);
  f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_disconnected"));
  f.cloud.updateOwnership(f.identity.deviceId, f.actor.account_id, f.actor.terminal_id, 2, 8);
  assert.throws(() => f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_connected")), /invalidated/);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "invalidated");
  assert.throws(() => f.submit(session.provisioning_id), /invalidated/);
  assert.equal(f.device.credentialWriteCount, 1);
});

test("Wi-Fi authentication failure is secret-free and requires a new provisioning session", () => {
  const sentinel = "UNIQUE_WIFI_PASSWORD_SENTINEL_7f30";
  const f = fixture(); const session = f.begin();
  f.cloud.submitCredentials(f.actor, session.provisioning_id, f.device, { ssid: "PlantNet", password: sentinel });
  f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_connected"));
  const lateSuccess = f.device.signOnlineConfirmation(f.cloud.session(session.provisioning_id), f.clock.now());
  const failed = f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "failure_reported", "wifi_authentication_failed"));
  assert.equal(failed.phase, "failed");
  assert.equal(failed.failure?.code, "wifi_authentication_failed");
  assert.equal(JSON.stringify(failed).includes(sentinel), false);
  assert.throws(() => f.submit(session.provisioning_id), /terminal/);
  let lateError = "";
  try { f.cloud.acceptOnlineConfirmation(lateSuccess); } catch (error) { lateError = String(error); }
  assert.equal(lateError.includes("terminal"), true);
  assert.equal(lateError.includes(sentinel), false);

  const retry = f.cloud.begin(f.actor, f.identity.deviceId);
  assert.equal(retry.phase, "authenticating");
  assert.throws(() => f.cloud.submitCredentials(f.actor, retry.provisioning_id, f.device, { ssid: "PlantNet", password: sentinel }), /secure channel/);
  f.cloud.acceptDeviceProof(f.device.signSessionProof(retry, f.clock.now()));
  f.cloud.submitCredentials(f.actor, retry.provisioning_id, f.device, { ssid: "PlantNet", password: "user-corrected-password" });
  assert.equal(f.device.credentialWriteCount, 2);
  const retrySuccess = f.connect(retry.provisioning_id);
  assert.equal(f.cloud.acceptOnlineConfirmation(retrySuccess).phase, "succeeded");
});

test("device rejection is structured, secret-free and only valid after credential write", () => {
  const sentinel = "UNIQUE_DEVICE_REJECT_SENTINEL_b82a";
  const f = fixture(); const session = f.begin();
  assert.throws(() => f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "failure_reported", "device_rejected")), /out of order/);
  f.cloud.submitCredentials(f.actor, session.provisioning_id, f.device, { ssid: "PlantNet", password: sentinel });
  const failed = f.cloud.acceptDeviceReport(f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "failure_reported", "device_rejected"));
  assert.equal(failed.phase, "failed");
  assert.equal(failed.failure?.code, "device_rejected");
  assert.equal(JSON.stringify(failed).includes(sentinel), false);
  assert.equal(failed.failure?.safe_message.includes(sentinel), false);
});

test("device reports reject forged signatures, wrong bindings and replays without consuming the valid sequence", () => {
  const f = fixture(); const session = f.begin(); f.submit(session.provisioning_id);
  const validConnected = f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_connected");
  const attacker = new SimulatedDeviceIdentity("device-attacker");
  assert.throws(
    () => f.cloud.acceptDeviceReport({ ...validConnected, signature_b64url: attacker.sign(validConnected.report) }),
    /signature/,
  );
  assert.equal(f.cloud.session(session.provisioning_id).device_event_sequence, 0);

  const wrongBinding = { ...validConnected.report, nonce_b64url: "wrong-nonce" };
  assert.throws(
    () => f.cloud.acceptDeviceReport({ report: wrongBinding, signature_b64url: f.identity.sign(wrongBinding) }),
    /binding/,
  );
  assert.equal(f.cloud.session(session.provisioning_id).device_event_sequence, 0);

  assert.equal(f.cloud.acceptDeviceReport(validConnected).phase, "awaiting_confirmation");
  assert.equal(f.cloud.session(session.provisioning_id).device_event_sequence, 1);
  assert.throws(() => f.cloud.acceptDeviceReport(validConnected), /sequence|replay/);
  assert.equal(f.cloud.session(session.provisioning_id).device_event_sequence, 1);

  const validDisconnected = f.device.signProvisioningReport(f.cloud.session(session.provisioning_id), "network_disconnected");
  assert.equal(f.cloud.acceptDeviceReport(validDisconnected).phase, "connecting");
  assert.equal(f.cloud.session(session.provisioning_id).device_event_sequence, 2);
});

test("cancel requires the current active provisioning actor bound to account, terminal and auth session", () => {
  const f = fixture(); const session = f.begin();
  const other = { ...f.actor, user_id: "user-other", session_id: "session-other" };
  f.cloud.registerSession(other);
  assert.throws(() => f.cloud.cancel(other, session.provisioning_id), /bound|actor/);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "secure_channel_ready");

  f.cloud.revokeSession(f.actor.session_id);
  assert.throws(() => f.cloud.cancel(f.actor, session.provisioning_id), /session|authenticated/);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "invalidated");
});

test("device proof and online confirmation require bounded integer timestamps", () => {
  for (const invalidTime of [Number.NaN, -1, 0.5, 101]) {
    const f = fixture();
    const raw = f.cloud.begin(f.actor, f.identity.deviceId);
    const proof = { ...f.device.signSessionProof(raw).proof, proved_at_ms: invalidTime };
    assert.throws(
      () => f.cloud.acceptDeviceProof({ proof, signature_b64url: f.identity.sign(proof) }),
      /time|expired/,
    );
    assert.equal(f.cloud.session(raw.provisioning_id).phase, "authenticating");
  }

  for (const invalidTime of [Number.NaN, -1, 0.5, 101]) {
    const f = fixture();
    const session = f.begin();
    f.submit(session.provisioning_id);
    const genuine = f.connect(session.provisioning_id);
    const confirmation = { ...genuine.confirmation, confirmed_at_ms: invalidTime };
    assert.throws(
      () => f.cloud.acceptOnlineConfirmation({ confirmation, signature_b64url: f.identity.sign(confirmation) }),
      /time|expired/,
    );
    assert.equal(f.cloud.session(session.provisioning_id).phase, "awaiting_confirmation");
  }
});

test("device receipt prevents a second Wi-Fi write after cloud crash and retry", () => {
  const f = fixture();
  const session = f.begin();
  assert.throws(
    () => f.cloud.submitCredentials(
      f.actor,
      session.provisioning_id,
      f.device,
      { ssid: "PlantNet", password: "secret-password" },
      { crashAfterDeviceWrite: true },
    ),
    /simulated cloud crash/,
  );
  assert.equal(f.device.credentialWriteCount, 1);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "secure_channel_ready");

  f.submit(session.provisioning_id);
  assert.equal(f.device.credentialWriteCount, 1);
  assert.equal(f.cloud.session(session.provisioning_id).phase, "connecting");
  assert.equal(JSON.stringify(f.cloud.session(session.provisioning_id)).includes("secret-password"), false);
});

test("revoked compromised or retired manufacturing identity blocks provisioning", () => {
  for (const status of ["revoked", "compromised", "retired"] as const) {
    const active = fixture();
    const session = active.begin();
    active.cloud.setManufacturingStatus(active.identity.deviceId, status);
    assert.throws(() => active.submit(session.provisioning_id), /identity|invalidated/);
    assert.equal(active.cloud.session(session.provisioning_id).phase, "invalidated");
    assert.equal(active.device.credentialWriteCount, 0);

    const blocked = fixture();
    blocked.cloud.setManufacturingStatus(blocked.identity.deviceId, status);
    assert.throws(() => blocked.cloud.begin(blocked.actor, blocked.identity.deviceId), /identity/);
    assert.equal(blocked.device.credentialWriteCount, 0);
  }
});

test("authoritative provisioning clock rejects NaN and backward movement", () => {
  const invalid = fixture(); const invalidSession = invalid.begin(); invalid.clock.advance(Number.NaN);
  assert.throws(() => invalid.submit(invalidSession.provisioning_id), /clock/);
  assert.equal(invalid.device.credentialWriteCount, 0); assert.equal(invalid.cloud.session(invalidSession.provisioning_id).phase, "secure_channel_ready");

  const backward = fixture(); const backwardSession = backward.begin(); backward.clock.advance(10); backward.submit(backwardSession.provisioning_id);
  backward.clock.advance(-5);
  const report = backward.device.signProvisioningReport(backward.cloud.session(backwardSession.provisioning_id), "network_connected");
  assert.throws(() => backward.cloud.acceptDeviceReport(report), /clock/);
  assert.equal(backward.cloud.session(backwardSession.provisioning_id).phase, "connecting");
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`SIMULATED PASS ${item.name}`); }
  catch (error) { console.error(`SIMULATED FAIL ${item.name}`); throw error; }
}
console.log(`SIMULATED SUMMARY robot provisioning ${passed}/${tests.length} PASS`);
