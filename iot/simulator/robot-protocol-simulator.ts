import { generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from "node:crypto";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { HEALTH_CHECK_KIND, PROTOCOL_VERSION, advanceAck, assertCommandAck, assertCommandEnvelope, assertNextEpoch, assertSignedCommand, assertTelemetryFrame, unsignedTelemetry, type AccountLifecycle, type AckStatus, type AuditEvent, type AuthenticatedActor, type BootChallenge, type CommandAck, type CommandEnvelope, type CommandStatus, type DeliveryAuthorization, type DeliveryChallenge, type DeviceLifecycle, type DeviceRecord, type EpochUpdate, type IdentityLifecycle, type OutboxStatus, type PairingChallenge, type PublishedCommand, type SignedAck, type SignedDeliveryAuthorization, type SignedDeliveryChallenge, type SignedEpochUpdate, type TelemetryFrame, type TerminalLifecycle } from "../../src/domain/device-protocol/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { DEVICE_SAFETY_CONTRACT_ID, DEVICE_SAFETY_CONTRACT_VERSION, NON_MOTION_DIAGNOSTIC } from "../../src/domain/device-safety/index.ts";

export interface Clock { now(): number }
export class MutableClock implements Clock {
  private value: number;
  constructor(initial = 1_800_000_000_000) { this.value = initial; }
  now(): number { return this.value; }
  advance(ms: number): void { this.value += ms; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonical(value));
function decode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
const clone = <T>(value: T): T => structuredClone(value);
const IMMEDIATE_DELIVERY = Symbol("simulated-immediate-authoritative-delivery");

export class SimulatedSigningIdentity {
  readonly publicKeyPem: string;
  #privateKey: KeyObject;
  constructor() {
    const pair = generateKeyPairSync("ed25519"); this.#privateKey = pair.privateKey;
    this.publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  }
  sign(value: unknown): string { return sign(null, bytes(value), this.#privateKey).toString("base64url"); }
}
export class SimulatedDeviceIdentity extends SimulatedSigningIdentity {
  readonly deviceId: string;
  constructor(deviceId: string) { super(); this.deviceId = deviceId; }
}

interface ManufacturingRecord { deviceId: string; publicKeyPem: string; status: IdentityLifecycle }
interface SessionRecord { sessionId: string; userId: string; accountId: string; terminalId: string; active: boolean; capabilities: Set<string>; policyVersion: number }
interface ChallengeState<T> { value: T; consumed: boolean }
interface CommandRow { envelope: CommandEnvelope; status: CommandStatus; ackStatus: AckStatus | null }
interface OutboxRow {
  commandId: string; status: OutboxStatus; attempts: number; availableAt: number; leasedUntil: number | null;
  fencingToken: number; deadLetterReason: string | null;
}
export interface Lease { commandId: string; fencingToken: number; leasedUntil: number }
export interface AckEvent { ack: CommandAck; receivedAt: number; applied: boolean; reason: string | null }
interface Receipt { status: "accepted" | "executing" | "succeeded" | "failed"; finalAck: SignedAck | null }
export type ReceiptStore = Map<string, Receipt>;
const DELIVERY_COUNTERS = new WeakMap<ReceiptStore, number>();

export class SimulatedProtocolCloud {
  readonly audit: AuditEvent[] = [];
  readonly ackEvents: AckEvent[] = [];
  readonly logs: string[] = [];
  readonly commands = new Map<string, CommandRow>();
  readonly outbox = new Map<string, OutboxRow>();
  readonly devices = new Map<string, DeviceRecord>();
  readonly accounts = new Map<string, AccountLifecycle>();
  readonly terminals = new Map<string, TerminalLifecycle>();
  readonly controlPublicKeyPem: string;
  private readonly controlIdentity = new SimulatedSigningIdentity();
  private readonly manufacturing = new Map<string, ManufacturingRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly publicKeyOwners = new Map<string, string>();
  private readonly pairingChallenges = new Map<string, ChallengeState<PairingChallenge>>();
  private readonly bootChallenges = new Map<string, ChallengeState<BootChallenge>>();
  private readonly deliveryAuthorizations = new Map<string, ChallengeState<DeliveryAuthorization>>();
  private readonly idempotency = new Map<string, string>();
  private readonly clock: Clock;
  private readonly challengeTtlMs: number;
  private readonly commandTtlMs: number;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly maxClockSkewMs: number;

  constructor(clock: Clock, options: Partial<{ challengeTtlMs: number; commandTtlMs: number; leaseMs: number; maxAttempts: number; maxClockSkewMs: number }> = {}) {
    this.clock = clock; this.controlPublicKeyPem = this.controlIdentity.publicKeyPem;
    this.challengeTtlMs = options.challengeTtlMs ?? 30_000; this.commandTtlMs = options.commandTtlMs ?? 15_000;
    this.leaseMs = options.leaseMs ?? 5_000; this.maxAttempts = options.maxAttempts ?? 3; this.maxClockSkewMs = options.maxClockSkewMs ?? 60_000;
    this.writeLog("cloud.started", { protocol_version: PROTOCOL_VERSION });
  }

  registerAccount(accountId: string): void { this.accounts.set(accountId, "active"); }
  registerTerminal(terminalId: string): void { this.terminals.set(terminalId, "active"); }
  registerSession(actor: AuthenticatedActor, policyVersion = 1): void {
    if (this.accounts.get(actor.account_id) !== "active" || this.terminals.get(actor.terminal_id) !== "active") throw new Error("session principal unavailable");
    this.sessions.set(actor.session_id, { sessionId: actor.session_id, userId: actor.user_id, accountId: actor.account_id, terminalId: actor.terminal_id, active: true, capabilities: new Set(actor.capabilities), policyVersion });
  }
  revokeSession(sessionId: string): void { const session = this.sessions.get(sessionId); if (!session) throw new Error("session unknown"); session.active = false; }
  revokeSessionCapability(sessionId: string, capability: string): void { const session = this.sessions.get(sessionId); if (!session) throw new Error("session unknown"); session.capabilities.delete(capability); session.policyVersion += 1; }
  registerManufacturedDevice(identity: SimulatedDeviceIdentity): void {
    const owner = this.publicKeyOwners.get(identity.publicKeyPem);
    if (owner && owner !== identity.deviceId) throw new Error("manufacturing public key already assigned to another device");
    const existing = this.manufacturing.get(identity.deviceId);
    if (existing && existing.publicKeyPem !== identity.publicKeyPem) throw new Error("manufacturing identity is immutable");
    this.publicKeyOwners.set(identity.publicKeyPem, identity.deviceId);
    this.manufacturing.set(identity.deviceId, { deviceId: identity.deviceId, publicKeyPem: identity.publicKeyPem, status: "active" });
    if (!this.devices.has(identity.deviceId)) this.devices.set(identity.deviceId, {
      device_id: identity.deviceId, owner_account_id: null, terminal_id: null, public_key_pem: identity.publicKeyPem,
      authorization_epoch: 1, lifecycle: "unassigned", active_boot_id: null, boot_counter: 0, revocation_version: 0, delivery_counter: 0,
      last_telemetry_sequence: 0, allowed_commands: [HEALTH_CHECK_KIND],
    });
    this.writeLog("manufacturing.registered", { device_id: identity.deviceId });
  }
  setManufacturingStatus(deviceId: string, status: IdentityLifecycle): void {
    const identity = this.manufacturing.get(deviceId); if (!identity) throw new Error("manufacturing identity unknown");
    identity.status = status;
    const device = this.devices.get(deviceId)!;
    if (status === "compromised") this.transitionDevice(deviceId, "compromised", "identity_compromised");
    if (status === "retired") this.transitionDevice(deviceId, "retired", "identity_retired");
    if (status === "revoked") this.transitionDevice(deviceId, "quarantined", "identity_revoked");
  }

  issuePairingChallenge(actor: AuthenticatedActor, deviceId: string): PairingChallenge {
    this.requireActor(actor, "device:pair");
    const identity = this.requireManufacturingActive(deviceId);
    const device = this.devices.get(deviceId)!;
    if (device.lifecycle !== "unassigned") throw new Error("device is not available for ordinary pairing");
    if (identity.publicKeyPem !== device.public_key_pem) throw new Error("manufacturing identity mismatch");
    const challenge: PairingChallenge = {
      challenge_id: `pair-${randomBytes(12).toString("hex")}`, nonce_b64url: randomBytes(32).toString("base64url"),
      device_id: deviceId, owner_account_id: actor.account_id, terminal_id: actor.terminal_id,
      issued_at_ms: this.clock.now(), expires_at_ms: this.clock.now() + this.challengeTtlMs,
    };
    this.pairingChallenges.set(challenge.challenge_id, { value: clone(challenge), consumed: false });
    return clone(challenge);
  }

  completePairing(actor: AuthenticatedActor, supplied: PairingChallenge, signatureB64url: string): { device: DeviceRecord; epochUpdate: SignedEpochUpdate } {
    this.requireActor(actor, "device:pair");
    const state = this.pairingChallenges.get(supplied.challenge_id);
    if (!state || canonical(state.value) !== canonical(supplied)) throw new Error("pairing challenge missing or changed");
    if (state.consumed) throw new Error("pairing challenge replayed");
    if (this.clock.now() > state.value.expires_at_ms) throw new Error("pairing challenge expired");
    if (actor.account_id !== supplied.owner_account_id || actor.terminal_id !== supplied.terminal_id) throw new Error("pairing actor mismatch");
    const identity = this.requireManufacturingActive(supplied.device_id);
    if (!verify(null, bytes(state.value), identity.publicKeyPem, decode(signatureB64url))) throw new Error("invalid pairing signature");
    // Verification precedes the synchronous compare-and-set consumption point.
    if (state.consumed) throw new Error("pairing challenge lost CAS");
    state.consumed = true;
    const device = this.devices.get(supplied.device_id)!;
    if (device.lifecycle !== "unassigned") throw new Error("device is not available for ordinary pairing");
    const update = this.advanceDeviceEpoch(device, "pairing_completed");
    device.owner_account_id = actor.account_id; device.terminal_id = actor.terminal_id; device.lifecycle = "owned";
    this.audit.push({ event: "device.paired", at_ms: this.clock.now(), device_id: device.device_id });
    this.writeLog("device.paired", { device_id: device.device_id, account_id: actor.account_id });
    return { device: clone(device), epochUpdate: update };
  }

  issueBootChallenge(deviceId: string): BootChallenge {
    const device = this.requireOwnedDevice(deviceId);
    const challenge: BootChallenge = {
      challenge_id: `boot-${randomBytes(12).toString("hex")}`, nonce_b64url: randomBytes(32).toString("base64url"),
      device_id: deviceId, authorization_epoch: device.authorization_epoch, boot_counter: device.boot_counter + 1,
      issued_at_ms: this.clock.now(), expires_at_ms: this.clock.now() + this.challengeTtlMs,
    };
    this.bootChallenges.set(challenge.challenge_id, { value: clone(challenge), consumed: false });
    return clone(challenge);
  }
  completeBoot(supplied: BootChallenge, bootId: string, signatureB64url: string): void {
    const state = this.bootChallenges.get(supplied.challenge_id); const device = this.requireOwnedDevice(supplied.device_id);
    if (!state || canonical(state.value) !== canonical(supplied)) throw new Error("boot challenge missing or changed");
    if (state.consumed || supplied.boot_counter !== device.boot_counter + 1) throw new Error("boot challenge replayed or counter stale");
    if (this.clock.now() > supplied.expires_at_ms) throw new Error("boot challenge expired");
    const claim = { challenge: state.value, boot_id: bootId };
    if (!verify(null, bytes(claim), device.public_key_pem, decode(signatureB64url))) throw new Error("invalid boot signature");
    if (state.consumed) throw new Error("boot challenge lost CAS"); state.consumed = true;
    device.boot_counter = supplied.boot_counter; device.active_boot_id = bootId; device.last_telemetry_sequence = 0;
    this.writeLog("boot.activated", { device_id: device.device_id, boot_id: bootId, counter: device.boot_counter });
  }

  createHealthCheck(actor: AuthenticatedActor, deviceId: string, epoch: number, idempotencyKey: string): CommandEnvelope {
    this.requireActor(actor, "command:diagnostics.health_check"); const device = this.requireOwnedDevice(deviceId);
    if (!device.active_boot_id) throw new Error("command requires an active boot");
    if (device.owner_account_id !== actor.account_id || device.terminal_id !== actor.terminal_id || device.authorization_epoch !== epoch || !device.allowed_commands.includes(HEALTH_CHECK_KIND)) throw new Error("command authorization or policy rejected");
    const key = `${deviceId}\u0000${idempotencyKey}`; const existing = this.idempotency.get(key);
    if (existing) return clone(this.commands.get(existing)!.envelope);
    const session = this.sessions.get(actor.session_id)!; const now = this.clock.now(); const envelope: CommandEnvelope = {
      protocol_version: PROTOCOL_VERSION, command_id: `command-${randomBytes(12).toString("hex")}`,
      device_id: deviceId, owner_account_id: actor.account_id, terminal_id: actor.terminal_id, actor_user_id: actor.user_id,
      authorization_epoch: epoch, idempotency_key: idempotencyKey, auth_session_id: actor.session_id,
      policy_version: session.policyVersion, safety_contract_id: DEVICE_SAFETY_CONTRACT_ID, safety_contract_version: DEVICE_SAFETY_CONTRACT_VERSION,
      capability: "command:diagnostics.health_check", kind: HEALTH_CHECK_KIND, command_class: NON_MOTION_DIAGNOSTIC, may_actuate: false,
      expected_state: { authorization_epoch: epoch, boot_id: device.active_boot_id },
      issued_at_ms: now, expires_at_ms: now + this.commandTtlMs, payload: { include: ["battery", "sensors", "network"] },
    };
    assertCommandEnvelope(envelope);
    const auditLength = this.audit.length;
    try {
      this.commands.set(envelope.command_id, { envelope: clone(envelope), status: "queued", ackStatus: null });
      this.outbox.set(envelope.command_id, { commandId: envelope.command_id, status: "queued", attempts: 0, availableAt: now, leasedUntil: null, fencingToken: 0, deadLetterReason: null });
      this.idempotency.set(key, envelope.command_id);
      this.audit.push({ event: "command.created", at_ms: now, device_id: deviceId, command_id: envelope.command_id });
    } catch (error) {
      this.commands.delete(envelope.command_id); this.outbox.delete(envelope.command_id); this.idempotency.delete(key); this.audit.length = auditLength; throw error;
    }
    this.writeLog("command.created", { device_id: deviceId, command_id: envelope.command_id }); return clone(envelope);
  }

  leaseNext(): Lease | null {
    const now = this.clock.now();
    for (const row of this.outbox.values()) {
      if (row.status === "leased" && row.leasedUntil !== null && row.leasedUntil <= now) this.recoverExpiredLease(row, now);
      if (row.status !== "queued" || row.availableAt > now) continue;
      const command = this.commands.get(row.commandId)!;
      const invalid = this.policyInvalidReason(command.envelope, now);
      if (invalid) { this.finishPolicyInvalid(command, row, invalid); continue; }
      row.status = "leased"; row.attempts += 1; row.fencingToken += 1; row.leasedUntil = now + this.leaseMs;
      return { commandId: row.commandId, fencingToken: row.fencingToken, leasedUntil: row.leasedUntil };
    }
    return null;
  }
  publishLease(lease: Lease): PublishedCommand {
    const row = this.outbox.get(lease.commandId); const command = this.commands.get(lease.commandId);
    if (!row || !command || row.status !== "leased" || row.fencingToken !== lease.fencingToken || row.leasedUntil !== lease.leasedUntil || this.clock.now() > lease.leasedUntil) throw new Error("stale or already-used publish lease");
    const invalid = this.policyInvalidReason(command.envelope, this.clock.now());
    if (invalid) { this.finishPolicyInvalid(command, row, invalid); throw new Error(`publish policy rejected: ${invalid}`); }
    row.status = "published"; row.leasedUntil = null; command.status = "published";
    const published = { command: clone(command.envelope), signature_b64url: this.controlIdentity.sign(command.envelope) };
    this.writeLog("command.published", { command_id: command.envelope.command_id, fencing_token: lease.fencingToken }); return published;
  }
  authorizeDelivery(published: PublishedCommand, signedChallenge: SignedDeliveryChallenge): SignedDeliveryAuthorization {
    assertSignedCommand(published);
    if (!verify(null, bytes(published.command), this.controlPublicKeyPem, decode(published.signature_b64url))) throw new Error("invalid published command signature");
    const challenge = signedChallenge.challenge;
    const device = this.devices.get(published.command.device_id); const invalid = this.policyInvalidReason(published.command, this.clock.now());
    const manufacturing = this.requireManufacturingActive(challenge.device_id);
    if (!verify(null, bytes(challenge), manufacturing.publicKeyPem, decode(signedChallenge.signature_b64url))) throw new Error("invalid delivery challenge signature");
    if (challenge.command_id !== published.command.command_id || challenge.device_id !== published.command.device_id || challenge.boot_id !== device?.active_boot_id || challenge.expected_epoch !== published.command.authorization_epoch || challenge.delivery_counter !== (device?.delivery_counter ?? -1) + 1 || this.clock.now() > challenge.expires_at_ms) throw new Error("delivery challenge binding rejected");
    const authorization: DeliveryAuthorization = {
      authorization_id: `delivery-${randomBytes(12).toString("hex")}`, challenge_id: challenge.challenge_id, nonce_b64url: challenge.nonce_b64url,
      command_id: published.command.command_id, device_id: published.command.device_id, boot_id: challenge.boot_id,
      command_epoch: published.command.authorization_epoch, authoritative_epoch: device?.authorization_epoch ?? published.command.authorization_epoch,
      revocation_version: device?.revocation_version ?? -1, delivery_counter: challenge.delivery_counter,
      decision: invalid ? "cancel" : "allow", reason: invalid ?? "authorized", issued_at_ms: this.clock.now(), expires_at_ms: this.clock.now() + Math.min(this.leaseMs, 1_000),
    };
    this.deliveryAuthorizations.set(authorization.authorization_id, { value: clone(authorization), consumed: false });
    return { authorization: clone(authorization), signature_b64url: this.controlIdentity.sign(authorization) };
  }
  deliver(robot: SimulatedRobot, published: PublishedCommand, signedChallenge: SignedDeliveryChallenge, signed: SignedDeliveryAuthorization, crashAt: "none" | "after_receipt" | "after_executing" = "none"): SignedAck[] {
    assertSignedCommand(published);
    if (!verify(null, bytes(published.command), this.controlPublicKeyPem, decode(published.signature_b64url))) throw new Error("invalid published command signature");
    const challenge = signedChallenge.challenge; const manufacturing = this.requireManufacturingActive(challenge.device_id);
    if (!verify(null, bytes(challenge), manufacturing.publicKeyPem, decode(signedChallenge.signature_b64url))) throw new Error("invalid delivery challenge signature");
    const token = signed.authorization; const state = this.deliveryAuthorizations.get(token.authorization_id);
    if (!state || state.consumed || canonical(state.value) !== canonical(token)) throw new Error("delivery authorization replayed, missing, or changed");
    if (!verify(null, bytes(token), this.controlPublicKeyPem, decode(signed.signature_b64url))) throw new Error("invalid delivery authorization signature");
    const device = this.devices.get(token.device_id); const invalid = this.policyInvalidReason(published.command, this.clock.now());
    if (token.challenge_id !== challenge.challenge_id || token.nonce_b64url !== challenge.nonce_b64url || token.command_id !== published.command.command_id || token.device_id !== published.command.device_id || token.boot_id !== challenge.boot_id || token.delivery_counter !== challenge.delivery_counter || this.clock.now() > token.expires_at_ms) throw new Error("delivery authorization binding or TTL rejected");
    if (token.decision !== "allow" || invalid || !device || token.authoritative_epoch !== device.authorization_epoch || token.command_epoch !== device.authorization_epoch || token.revocation_version !== device.revocation_version || token.delivery_counter !== device.delivery_counter + 1 || token.boot_id !== device.active_boot_id) throw new Error(`authoritative delivery cancelled: ${invalid ?? "authority_changed"}`);
    // Phase 1 is side-effect free on both sides. A robot validation failure leaves every CAS and counter untouched.
    robot.validateImmediateDelivery(IMMEDIATE_DELIVERY, published, signedChallenge, signed);
    // Phase 2 contains only already-validated, non-throwing state commits before execution. Expected execution crashes consume delivery exactly once.
    if (state.consumed) throw new Error("delivery authorization lost CAS");
    state.consumed = true; device.delivery_counter = token.delivery_counter;
    return robot.commitImmediateDelivery(IMMEDIATE_DELIVERY, published, signedChallenge, signed, crashAt);
  }
  retryLease(lease: Lease): number {
    const row = this.outbox.get(lease.commandId);
    if (!row || row.status !== "leased" || row.fencingToken !== lease.fencingToken || row.leasedUntil !== lease.leasedUntil) throw new Error("stale retry lease");
    row.leasedUntil = null;
    if (row.attempts >= this.maxAttempts) { row.status = "dead_letter"; row.deadLetterReason = "transport_retry_exhausted"; this.commands.get(row.commandId)!.status = "failed"; return 0; }
    const base = 1_000 * 2 ** (row.attempts - 1); const jitter = this.deterministicJitter(row.commandId, base);
    row.availableAt = this.clock.now() + base + jitter; row.status = "queued"; return base + jitter;
  }

  acceptAck(signed: SignedAck): boolean {
    assertCommandAck(signed.ack); const ack = signed.ack; const device = this.devices.get(ack.device_id);
    if (!device || !verify(null, bytes(ack), device.public_key_pem, decode(signed.signature_b64url))) throw new Error("unauthenticated ACK");
    const event: AckEvent = { ack: clone(ack), receivedAt: this.clock.now(), applied: false, reason: null };
    this.ackEvents.push(event); // append-only authenticated event precedes projection.
    const command = this.commands.get(ack.command_id);
    if (!command) { event.reason = "unknown_command"; return false; }
    if (command.envelope.device_id !== ack.device_id || command.envelope.idempotency_key !== ack.idempotency_key || command.envelope.authorization_epoch !== ack.authorization_epoch) { event.reason = "binding_mismatch"; return false; }
    if (["succeeded", "failed", "rejected", "expired", "cancelled"].includes(command.status)) { event.reason = "command_already_terminal"; return false; }
    if (device.lifecycle !== "owned" || device.active_boot_id !== ack.boot_id || device.authorization_epoch !== ack.authorization_epoch) { event.reason = "inactive_boot_or_authorization"; return false; }
    const advanced = advanceAck(command.ackStatus, ack.status);
    if (!advanced.applied) { event.reason = "duplicate_or_illegal_transition"; return false; }
    command.ackStatus = advanced.status; command.status = advanced.status!; event.applied = true;
    if (advanced.status === "succeeded" || advanced.status === "failed") {
      const outbox = this.outbox.get(ack.command_id); if (outbox && outbox.status === "published") outbox.status = "completed";
    }
    this.audit.push({ event: `command.${ack.status}`, at_ms: ack.occurred_at_ms, device_id: ack.device_id, command_id: ack.command_id }); return true;
  }

  acceptTelemetry(frame: TelemetryFrame): void {
    assertTelemetryFrame(frame); const device = this.requireOwnedDevice(frame.device_id);
    if (frame.authorization_epoch !== device.authorization_epoch || frame.boot_id !== device.active_boot_id) throw new Error("telemetry authorization or boot stale");
    if (frame.sequence <= device.last_telemetry_sequence) throw new Error("telemetry sequence replayed");
    if (Math.abs(frame.captured_at_ms - this.clock.now()) > this.maxClockSkewMs) throw new Error("telemetry clock skew");
    if (!verify(null, bytes(unsignedTelemetry(frame)), device.public_key_pem, decode(frame.signature_b64url))) throw new Error("invalid telemetry signature");
    device.last_telemetry_sequence = frame.sequence; this.writeLog("telemetry.accepted", { device_id: frame.device_id, sequence: frame.sequence });
  }

  suspendAccount(accountId: string): SignedEpochUpdate[] {
    if (!this.accounts.has(accountId)) throw new Error("account unknown"); this.accounts.set(accountId, "suspended");
    return [...this.devices.values()].filter((device) => device.owner_account_id === accountId).map((device) => this.revokeAuthorization(device, "account_suspended"));
  }
  revokeTerminal(terminalId: string): SignedEpochUpdate[] {
    if (!this.terminals.has(terminalId)) throw new Error("terminal unknown"); this.terminals.set(terminalId, "revoked");
    return [...this.devices.values()].filter((device) => device.terminal_id === terminalId).map((device) => this.revokeAuthorization(device, "terminal_revoked"));
  }
  unbind(deviceId: string): SignedEpochUpdate {
    const device = this.requireOwnedDevice(deviceId); const update = this.revokeAuthorization(device, "device_unbound");
    device.lifecycle = "unassigned"; device.owner_account_id = null; device.terminal_id = null; return update;
  }
  quarantine(deviceId: string): SignedEpochUpdate { return this.transitionDevice(deviceId, "quarantined", "device_quarantined"); }

  testOnlyWriteLog(event: string, fields: Record<string, unknown>): void { this.writeLog(event, fields); }

  private transitionDevice(deviceId: string, lifecycle: DeviceLifecycle, reason: string): SignedEpochUpdate {
    const device = this.devices.get(deviceId); if (!device) throw new Error("device unknown"); const update = this.revokeAuthorization(device, reason); device.lifecycle = lifecycle; return update;
  }
  private revokeAuthorization(device: DeviceRecord, reason: string): SignedEpochUpdate {
    const update = this.advanceDeviceEpoch(device, reason); device.revocation_version += 1; device.active_boot_id = null; device.last_telemetry_sequence = 0;
    for (const row of this.commands.values()) {
      if (row.envelope.device_id !== device.device_id || ["succeeded", "failed", "expired", "cancelled", "rejected"].includes(row.status)) continue;
      const outbox = this.outbox.get(row.envelope.command_id)!;
      if (row.status === "published" || row.status === "accepted" || row.status === "executing") row.status = "revocation_pending";
      else { row.status = "cancelled"; outbox.status = "cancelled"; outbox.leasedUntil = null; }
    }
    this.audit.push({ event: reason, at_ms: this.clock.now(), device_id: device.device_id }); return update;
  }
  private advanceDeviceEpoch(device: DeviceRecord, reason: string): SignedEpochUpdate {
    const update: EpochUpdate = { device_id: device.device_id, previous_epoch: device.authorization_epoch, next_epoch: device.authorization_epoch + 1, reason, issued_at_ms: this.clock.now() };
    assertNextEpoch(update.previous_epoch, update.next_epoch); device.authorization_epoch = update.next_epoch;
    return { update, signature_b64url: this.controlIdentity.sign(update) };
  }
  private policyInvalidReason(command: CommandEnvelope, now: number): "expired" | "account" | "terminal" | "device" | "ownership" | "epoch" | "expected_state" | "capability" | null {
    const device = this.devices.get(command.device_id);
    if (now > command.expires_at_ms) return "expired";
    if (this.accounts.get(command.owner_account_id) !== "active") return "account";
    if (this.terminals.get(command.terminal_id) !== "active") return "terminal";
    if (!device || device.lifecycle !== "owned") return "device";
    if (device.owner_account_id !== command.owner_account_id || device.terminal_id !== command.terminal_id) return "ownership";
    if (device.authorization_epoch !== command.authorization_epoch) return "epoch";
    if (command.expected_state.authorization_epoch !== device.authorization_epoch || command.expected_state.boot_id !== device.active_boot_id) return "expected_state";
    const session = this.sessions.get(command.auth_session_id);
    if (!session?.active || session.userId !== command.actor_user_id || session.accountId !== command.owner_account_id || session.terminalId !== command.terminal_id) return "account";
    if (session.policyVersion !== command.policy_version || !session.capabilities.has(command.capability) || !device.allowed_commands.includes(command.kind)) return "capability";
    return null;
  }
  private finishPolicyInvalid(command: CommandRow, outbox: OutboxRow, reason: NonNullable<ReturnType<SimulatedProtocolCloud["policyInvalidReason"]>>): void {
    command.status = reason === "expired" ? "expired" : reason === "capability" || reason === "ownership" || reason === "expected_state" ? "rejected" : "cancelled";
    outbox.status = "cancelled"; outbox.leasedUntil = null;
    this.audit.push({ event: `command.${command.status}`, at_ms: this.clock.now(), device_id: command.envelope.device_id, command_id: command.envelope.command_id, detail: reason });
  }
  private requireActor(actor: AuthenticatedActor, capability: AuthenticatedActor["capabilities"][number]): void {
    const session = this.sessions.get(actor.session_id);
    if (!actor.authenticated || !actor.session_id || !actor.user_id || this.accounts.get(actor.account_id) !== "active" || this.terminals.get(actor.terminal_id) !== "active" || !actor.capabilities.includes(capability) || !session?.active || session.userId !== actor.user_id || session.accountId !== actor.account_id || session.terminalId !== actor.terminal_id || !session.capabilities.has(capability)) throw new Error("authenticated actor capability rejected");
  }
  private requireManufacturingActive(deviceId: string): ManufacturingRecord {
    const identity = this.manufacturing.get(deviceId); if (!identity || identity.status !== "active") throw new Error("manufacturing identity unavailable"); return identity;
  }
  private requireOwnedDevice(deviceId: string): DeviceRecord {
    const device = this.devices.get(deviceId); if (!device || device.lifecycle !== "owned" || !device.owner_account_id || !device.terminal_id || this.requireManufacturingActive(deviceId).publicKeyPem !== device.public_key_pem) throw new Error("device is not actively owned"); return device;
  }
  private deterministicJitter(commandId: string, base: number): number {
    let hash = 0; for (const character of commandId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0; return hash % Math.max(1, Math.floor(base / 4));
  }
  private recoverExpiredLease(row: OutboxRow, now: number): void {
    row.leasedUntil = null;
    if (row.attempts >= this.maxAttempts) {
      row.status = "dead_letter"; row.deadLetterReason = "transport_lease_holder_crash_exhausted";
      this.commands.get(row.commandId)!.status = "failed"; return;
    }
    const base = 1_000 * 2 ** (row.attempts - 1); row.availableAt = now + base + this.deterministicJitter(row.commandId, base); row.status = "queued";
  }
  private writeLog(event: string, fields: Record<string, unknown>): void {
    const sanitize = (value: unknown, key = ""): unknown => {
      if (/password|private|secret|token|signature|credential/i.test(key)) return "[REDACTED]";
      if (typeof value === "string" && (/PRIVATE KEY/.test(value) || /^-----BEGIN/.test(value))) return "[REDACTED]";
      if (Array.isArray(value)) return value.map((item) => sanitize(item));
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
      return value;
    };
    this.logs.push(`SIMULATED ${canonical({ event, ...sanitize(fields) as Record<string, unknown> })}`);
  }
}

export class SimulatedRobot {
  readonly bootId: string;
  executionCount = 0;
  private epoch: number;
  private readonly identity: SimulatedDeviceIdentity;
  private readonly controlPublicKeyPem: string;
  private readonly clock: Clock;
  private readonly receipts: ReceiptStore;
  private readonly deliveryChallenges = new Map<string, ChallengeState<DeliveryChallenge>>();
  private deliveryCounter: number;
  constructor(identity: SimulatedDeviceIdentity, controlPublicKeyPem: string, clock: Clock, epoch: number, receipts: ReceiptStore = new Map(), bootId = `bootid-${randomBytes(12).toString("hex")}`) {
    this.identity = identity; this.controlPublicKeyPem = controlPublicKeyPem; this.clock = clock; this.epoch = epoch; this.receipts = receipts; this.bootId = bootId;
    this.deliveryCounter = DELIVERY_COUNTERS.get(receipts) ?? 0;
  }
  signPairing(challenge: PairingChallenge): string { return this.identity.sign(challenge); }
  signBoot(challenge: BootChallenge): string { return this.identity.sign({ challenge, boot_id: this.bootId }); }
  issueDeliveryChallenge(commandId: string): SignedDeliveryChallenge {
    const challenge: DeliveryChallenge = {
      challenge_id: `robot-delivery-${randomBytes(12).toString("hex")}`, nonce_b64url: randomBytes(32).toString("base64url"),
      device_id: this.identity.deviceId, boot_id: this.bootId, command_id: commandId, expected_epoch: this.epoch,
      delivery_counter: this.deliveryCounter + 1, issued_at_ms: this.clock.now(), expires_at_ms: this.clock.now() + 1_000,
    };
    this.deliveryChallenges.set(challenge.challenge_id, { value: clone(challenge), consumed: false });
    return { challenge: clone(challenge), signature_b64url: this.identity.sign(challenge) };
  }
  applyEpochUpdate(signed: SignedEpochUpdate): void {
    if (!verify(null, bytes(signed.update), this.controlPublicKeyPem, decode(signed.signature_b64url))) throw new Error("invalid epoch update signature");
    if (signed.update.device_id !== this.identity.deviceId || signed.update.previous_epoch !== this.epoch) throw new Error("stale or cross-device epoch update");
    assertNextEpoch(this.epoch, signed.update.next_epoch); this.epoch = signed.update.next_epoch;
  }
  validateImmediateDelivery(capability: typeof IMMEDIATE_DELIVERY, published: PublishedCommand, signedChallenge: SignedDeliveryChallenge, delivery: SignedDeliveryAuthorization): void {
    if (capability !== IMMEDIATE_DELIVERY) throw new Error("delivery must use live authoritative control plane");
    const challenge = signedChallenge.challenge;
    assertSignedCommand(published); const command = published.command;
    if (!verify(null, bytes(command), this.controlPublicKeyPem, decode(published.signature_b64url))) throw new Error("invalid command signature");
    if (!verify(null, bytes(delivery.authorization), this.controlPublicKeyPem, decode(delivery.signature_b64url))) throw new Error("invalid delivery authorization signature");
    const authorization = delivery.authorization;
    const challengeState = this.deliveryChallenges.get(challenge.challenge_id);
    if (!challengeState || challengeState.consumed || canonical(challengeState.value) !== canonical(challenge)) throw new Error("robot delivery challenge replayed, missing, or changed");
    if (authorization.challenge_id !== challenge.challenge_id || authorization.nonce_b64url !== challenge.nonce_b64url || authorization.boot_id !== this.bootId || authorization.delivery_counter !== this.deliveryCounter + 1 || authorization.command_id !== command.command_id || authorization.device_id !== command.device_id || authorization.command_epoch !== command.authorization_epoch || this.clock.now() > authorization.expires_at_ms || this.clock.now() > challenge.expires_at_ms) throw new Error("delivery authorization binding or TTL rejected");
    if (authorization.decision !== "allow") throw new Error(`authoritative delivery cancelled: ${authorization.reason}`);
    if (authorization.authoritative_epoch !== command.authorization_epoch || command.device_id !== this.identity.deviceId || command.authorization_epoch !== this.epoch || this.clock.now() > command.expires_at_ms) throw new Error("command device, epoch, or TTL rejected");
  }
  commitImmediateDelivery(capability: typeof IMMEDIATE_DELIVERY, published: PublishedCommand, signedChallenge: SignedDeliveryChallenge, delivery: SignedDeliveryAuthorization, crashAt: "none" | "after_receipt" | "after_executing" = "none"): SignedAck[] {
    if (capability !== IMMEDIATE_DELIVERY) throw new Error("delivery must use live authoritative control plane");
    const challenge = signedChallenge.challenge; const challengeState = this.deliveryChallenges.get(challenge.challenge_id)!;
    challengeState.consumed = true; this.deliveryCounter = delivery.authorization.delivery_counter; DELIVERY_COUNTERS.set(this.receipts, this.deliveryCounter);
    const command = published.command;
    const key = `${command.device_id}\u0000${command.idempotency_key}`; let receipt = this.receipts.get(key);
    if (receipt?.finalAck) return [clone(receipt.finalAck)];
    if (!receipt) { receipt = { status: "accepted", finalAck: null }; this.receipts.set(key, receipt); if (crashAt === "after_receipt") throw new Error("SIMULATED crash after durable receipt"); }
    if (receipt.status === "executing") {
      const failed = this.signedAck(command, "failed", { code: "execution_uncertain", message: "uncertain execution recovered without replay" }); receipt.status = "failed"; receipt.finalAck = failed; return [failed];
    }
    const output: SignedAck[] = [this.signedAck(command, "accepted", null)]; receipt.status = "executing";
    output.push(this.signedAck(command, "executing", null)); if (crashAt === "after_executing") throw new Error("SIMULATED crash after durable executing receipt");
    this.executionCount += 1; const success = this.signedAck(command, "succeeded", { code: "health_check_complete", message: "health check complete" }); receipt.status = "succeeded"; receipt.finalAck = success; output.push(success); return output;
  }
  telemetry(sequence: number, capturedAt = this.clock.now()): TelemetryFrame {
    const unsigned: Omit<TelemetryFrame, "signature_b64url"> = {
      protocol_version: PROTOCOL_VERSION, device_id: this.identity.deviceId, authorization_epoch: this.epoch,
      boot_id: this.bootId, sequence, captured_at_ms: capturedAt, kind: "diagnostics.health",
      payload: { battery_percent: 83, sensor_status: "ok", network_status: "online" },
    };
    return { ...unsigned, signature_b64url: this.identity.sign(unsigned) };
  }
  private signedAck(command: CommandEnvelope, status: AckStatus, reason: CommandAck["reason"]): SignedAck {
    const ack: CommandAck = { protocol_version: PROTOCOL_VERSION, command_id: command.command_id, device_id: command.device_id, authorization_epoch: command.authorization_epoch, idempotency_key: command.idempotency_key, boot_id: this.bootId, status, occurred_at_ms: this.clock.now(), reason };
    return { ack, signature_b64url: this.identity.sign(ack) };
  }
}
