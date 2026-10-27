import { randomBytes, verify } from "node:crypto";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { HEALTH_CHECK_KIND, PROTOCOL_VERSION, advanceAck, assertCommandAck, assertCommandEnvelope, assertTelemetryFrame, unsignedTelemetry, type AckStatus, type CommandAck, type CommandEnvelope, type PublishedCommand, type SignedAck, type TelemetryFrame } from "../../src/domain/device-protocol/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { DEVICE_SAFETY_CONTRACT_ID, DEVICE_SAFETY_CONTRACT_VERSION, NON_MOTION_DIAGNOSTIC } from "../../src/domain/device-safety/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { type Clock, SimulatedDeviceIdentity, SimulatedSigningIdentity } from "./robot-protocol-simulator.ts";

const clone = <T>(value: T): T => structuredClone(value);
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

export type G008DeliveryStatus = "queued" | "leased" | "sent" | "acknowledged" | "cancelled" | "dead_letter" | "execution_unknown";
export type G008CreateFault = "after_command" | "after_idempotency" | "after_outbox" | "after_audit";
export interface G008CommandProjection { envelope: CommandEnvelope; delivery_status: G008DeliveryStatus; device_ack_status: AckStatus | null }
interface G008OutboxRow {
  command_id: string;
  status: G008DeliveryStatus;
  attempts: number;
  available_at_ms: number;
  leased_until_ms: number | null;
  ack_deadline_ms: number | null;
  fencing_token: number;
  dead_letter_reason: string | null;
}
interface G008Store {
  commands: Map<string, G008CommandProjection>;
  idempotency: Map<string, string>;
  outbox: Map<string, G008OutboxRow>;
  audit: Array<{ event: string; command_id: string; at_ms: number }>;
}
export interface G008Lease { command_id: string; fencing_token: number; leased_until_ms: number }
export interface G008AuthoritativeSnapshot {
  device_id: string;
  authorization_epoch: number;
  boot_id: string;
  authority_version: number;
  issued_at_ms: number;
}
export interface G008SignedAuthoritativeSnapshot { snapshot: G008AuthoritativeSnapshot; signature_b64url: string }
export interface G008DevicePersistence {
  device_id: string;
  authorization_epoch: number;
  boot_id: string;
  receipts: Array<[string, { state: "received" | "succeeded"; final_ack: SignedAck | null }]>;
  telemetry_sequence: number;
  effect_count: number;
  authority_version: number;
  authority_issued_at_ms: number;
}
export interface G008AckEvent { readonly signed_ack: SignedAck; readonly received_at_ms: number }
export interface G008TelemetryProjection {
  device_id: string;
  authorization_epoch: number;
  boot_id: string;
  sequence: number;
  battery_percent: number;
  sensor_status: "ok" | "degraded";
  received_at_ms: number;
}

const TERMINAL = new Set<AckStatus>(["succeeded", "failed", "rejected", "expired", "cancelled"]);

export class SimulatedG008Cloud {
  readonly evidenceLabel = "SIMULATED" as const;
  readonly controlPublicKeyPem: string;
  private readonly ackLog: G008AckEvent[] = [];
  private readonly controlIdentity = new SimulatedSigningIdentity();
  private readonly deviceKeys = new Map<string, string>();
  private readonly deviceState = new Map<string, { authorization_epoch: number; boot_id: string; authority_version: number; last_issued_at_ms: number }>();
  private readonly clock: Clock;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly ackTimeoutMs: number;
  private readonly telemetryTtlMs: number;
  private readonly maxSkewMs: number;
  private store: G008Store = { commands: new Map(), idempotency: new Map(), outbox: new Map(), audit: [] };
  private readonly telemetryProjections = new Map<string, G008TelemetryProjection>();

  constructor(clock: Clock, options: Partial<{ leaseMs: number; maxAttempts: number; ackTimeoutMs: number; telemetryTtlMs: number; maxSkewMs: number }> = {}) {
    this.clock = clock;
    this.leaseMs = options.leaseMs ?? 100;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 1_000;
    this.telemetryTtlMs = options.telemetryTtlMs ?? 5_000;
    this.maxSkewMs = options.maxSkewMs ?? 1_000;
    this.controlPublicKeyPem = this.controlIdentity.publicKeyPem;
  }

  provision(identity: SimulatedDeviceIdentity, authorizationEpoch = 1, bootId = "boot-g008-001"): G008SignedAuthoritativeSnapshot {
    this.deviceKeys.set(identity.deviceId, identity.publicKeyPem);
    this.deviceState.set(identity.deviceId, { authorization_epoch: authorizationEpoch, boot_id: bootId, authority_version: 0, last_issued_at_ms: -1 });
    return this.authoritativeSnapshot(identity.deviceId);
  }

  authoritativeSnapshot(deviceId: string): G008SignedAuthoritativeSnapshot {
    const state = this.deviceState.get(deviceId);
    if (!state) throw new Error("SIMULATED unknown device");
    state.authority_version += 1;
    state.last_issued_at_ms = Math.max(this.clock.now(), state.last_issued_at_ms + 1);
    const snapshot: G008AuthoritativeSnapshot = {
      device_id: deviceId,
      authorization_epoch: state.authorization_epoch,
      boot_id: state.boot_id,
      authority_version: state.authority_version,
      issued_at_ms: state.last_issued_at_ms,
    };
    return { snapshot, signature_b64url: this.controlIdentity.sign(snapshot) };
  }

  advanceAuthority(deviceId: string, authorizationEpoch: number, bootId: string): G008SignedAuthoritativeSnapshot {
    const current = this.deviceState.get(deviceId);
    if (!current || authorizationEpoch < current.authorization_epoch) throw new Error("SIMULATED authority rollback rejected");
    current.authorization_epoch = authorizationEpoch;
    current.boot_id = bootId;
    return this.authoritativeSnapshot(deviceId);
  }

  testOnlySignAuthoritativeSnapshot(snapshot: G008AuthoritativeSnapshot): G008SignedAuthoritativeSnapshot {
    return { snapshot: clone(snapshot), signature_b64url: this.controlIdentity.sign(snapshot) };
  }

  createHealthCheck(input: {
    device_id: string;
    owner_account_id: string;
    terminal_id: string;
    actor_user_id: string;
    auth_session_id: string;
    idempotency_key: string;
  }, faultAfter?: G008CreateFault): CommandEnvelope {
    const state = this.deviceState.get(input.device_id);
    if (!state) throw new Error("SIMULATED device not provisioned");
    const key = `${input.device_id}\u0000${input.idempotency_key}`;
    const existingId = this.store.idempotency.get(key);
    if (existingId) return clone(this.store.commands.get(existingId)!.envelope);
    const now = this.clock.now();
    const envelope: CommandEnvelope = {
      protocol_version: PROTOCOL_VERSION,
      command_id: `g008-${randomBytes(10).toString("hex")}`,
      device_id: input.device_id,
      owner_account_id: input.owner_account_id,
      terminal_id: input.terminal_id,
      actor_user_id: input.actor_user_id,
      authorization_epoch: state.authorization_epoch,
      idempotency_key: input.idempotency_key,
      auth_session_id: input.auth_session_id,
      policy_version: 1,
      safety_contract_id: DEVICE_SAFETY_CONTRACT_ID,
      safety_contract_version: DEVICE_SAFETY_CONTRACT_VERSION,
      capability: "command:diagnostics.health_check",
      kind: HEALTH_CHECK_KIND,
      command_class: NON_MOTION_DIAGNOSTIC,
      may_actuate: false,
      expected_state: { authorization_epoch: state.authorization_epoch, boot_id: state.boot_id },
      issued_at_ms: now,
      expires_at_ms: now + 30_000,
      payload: { include: ["battery", "sensors", "network"] },
    };
    assertCommandEnvelope(envelope);
    const draft = clone(this.store);
    draft.commands.set(envelope.command_id, { envelope: clone(envelope), delivery_status: "queued", device_ack_status: null });
    this.inject(faultAfter, "after_command");
    if (draft.idempotency.has(key)) return clone(draft.commands.get(draft.idempotency.get(key)!)!.envelope);
    draft.idempotency.set(key, envelope.command_id);
    this.inject(faultAfter, "after_idempotency");
    draft.outbox.set(envelope.command_id, { command_id: envelope.command_id, status: "queued", attempts: 0, available_at_ms: now, leased_until_ms: null, ack_deadline_ms: null, fencing_token: 0, dead_letter_reason: null });
    this.inject(faultAfter, "after_outbox");
    draft.audit.push({ event: "command.created", command_id: envelope.command_id, at_ms: now });
    this.inject(faultAfter, "after_audit");
    this.store = draft;
    return clone(envelope);
  }

  leaseNext(): G008Lease | null {
    const now = this.clock.now();
    for (const outbox of this.store.outbox.values()) {
      if (outbox.status === "leased" && outbox.leased_until_ms !== null && outbox.leased_until_ms <= now) this.retryOrDeadLetter(outbox, "lease_expired");
      if (outbox.status === "sent" && outbox.ack_deadline_ms !== null && outbox.ack_deadline_ms <= now) this.reconcileMissingAck(outbox, now);
      if (outbox.status !== "queued" || outbox.available_at_ms > now) continue;
      outbox.status = "leased";
      outbox.attempts += 1;
      outbox.fencing_token += 1;
      outbox.leased_until_ms = now + this.leaseMs;
      outbox.ack_deadline_ms = null;
      this.store.commands.get(outbox.command_id)!.delivery_status = "leased";
      return { command_id: outbox.command_id, fencing_token: outbox.fencing_token, leased_until_ms: outbox.leased_until_ms };
    }
    return null;
  }

  publishForLease(lease: G008Lease): PublishedCommand {
    const { outbox, command } = this.requireLiveLease(lease);
    const authority = this.deviceState.get(command.envelope.device_id);
    assertCommandEnvelope(command.envelope);
    if (
      !authority
      || authority.authorization_epoch !== command.envelope.expected_state.authorization_epoch
      || authority.boot_id !== command.envelope.expected_state.boot_id
      || this.clock.now() >= command.envelope.expires_at_ms
    ) {
      outbox.status = "cancelled";
      outbox.leased_until_ms = null;
      command.delivery_status = "cancelled";
      throw new Error("SIMULATED publish-time revalidation rejected");
    }
    return { command: clone(command.envelope), signature_b64url: this.controlIdentity.sign(command.envelope) };
  }

  markSent(lease: G008Lease): void {
    const { outbox, command } = this.requireLiveLease(lease);
    outbox.status = "sent";
    outbox.leased_until_ms = null;
    outbox.ack_deadline_ms = this.clock.now() + this.ackTimeoutMs;
    command.delivery_status = "sent";
  }

  failTransport(lease: G008Lease): number {
    const { outbox } = this.requireLiveLease(lease);
    return this.retryOrDeadLetter(outbox, "transport_failure");
  }

  appendAck(signedAck: SignedAck): void {
    assertCommandAck(signedAck.ack);
    const publicKey = this.deviceKeys.get(signedAck.ack.device_id);
    if (!publicKey || !verify(null, bytes(signedAck.ack), publicKey, decode(signedAck.signature_b64url))) throw new Error("SIMULATED unauthenticated ACK");
    const immutable = Object.freeze({
      signed_ack: Object.freeze({ ack: Object.freeze(clone(signedAck.ack)), signature_b64url: signedAck.signature_b64url }),
      received_at_ms: this.clock.now(),
    });
    this.ackLog.push(immutable);
  }

  replayAckProjection(): void {
    for (const command of this.store.commands.values()) command.device_ack_status = null;
    for (const event of this.ackLog) {
      const ack = event.signed_ack.ack;
      const command = this.store.commands.get(ack.command_id);
      if (!command || command.envelope.device_id !== ack.device_id || command.envelope.idempotency_key !== ack.idempotency_key || command.envelope.authorization_epoch !== ack.authorization_epoch || command.envelope.expected_state.boot_id !== ack.boot_id) continue;
      const advanced = advanceAck(command.device_ack_status, ack.status);
      if (!advanced.applied) continue;
      command.device_ack_status = advanced.status;
      if (advanced.status && TERMINAL.has(advanced.status)) {
        const outbox = this.store.outbox.get(ack.command_id);
        if (outbox) { outbox.status = "acknowledged"; outbox.leased_until_ms = null; outbox.ack_deadline_ms = null; }
        command.delivery_status = "acknowledged";
      }
    }
  }

  acceptTelemetry(frame: TelemetryFrame): void {
    assertTelemetryFrame(frame);
    const publicKey = this.deviceKeys.get(frame.device_id);
    const authority = this.deviceState.get(frame.device_id);
    const previousSequence = this.telemetryProjections.get(frame.device_id)?.sequence ?? 0;
    if (!publicKey || !authority || authority.authorization_epoch !== frame.authorization_epoch || authority.boot_id !== frame.boot_id) throw new Error("SIMULATED telemetry authority rejected");
    if (frame.sequence <= previousSequence) throw new Error("SIMULATED telemetry sequence rejected");
    if (Math.abs(frame.captured_at_ms - this.clock.now()) > this.maxSkewMs) throw new Error("SIMULATED telemetry skew rejected");
    if (!verify(null, bytes(unsignedTelemetry(frame)), publicKey, decode(frame.signature_b64url))) throw new Error("SIMULATED telemetry signature rejected");
    this.telemetryProjections.set(frame.device_id, {
      device_id: frame.device_id,
      authorization_epoch: frame.authorization_epoch,
      boot_id: frame.boot_id,
      sequence: frame.sequence,
      battery_percent: frame.payload.battery_percent,
      sensor_status: frame.payload.sensor_status,
      received_at_ms: this.clock.now(),
    });
  }

  deviceProjection(deviceId?: string): (G008TelemetryProjection & { online: boolean }) | null {
    const projection = deviceId ? this.telemetryProjections.get(deviceId) : this.telemetryProjections.values().next().value as G008TelemetryProjection | undefined;
    if (!projection) return null;
    return { ...clone(projection), online: this.clock.now() - projection.received_at_ms <= this.telemetryTtlMs };
  }

  projections(): { commands: G008CommandProjection[]; outbox: G008OutboxRow[]; audit: G008Store["audit"]; ack_events: G008AckEvent[]; device: ReturnType<SimulatedG008Cloud["deviceProjection"]> } {
    return {
      commands: clone([...this.store.commands.values()]),
      outbox: clone([...this.store.outbox.values()]),
      audit: clone(this.store.audit),
      ack_events: clone(this.ackLog),
      device: this.deviceProjection(),
    };
  }

  get ackEvents(): readonly G008AckEvent[] { return clone(this.ackLog); }

  private inject(actual: G008CreateFault | undefined, point: G008CreateFault): void {
    if (actual === point) throw new Error(`SIMULATED injected transaction fault ${point}`);
  }

  private requireLiveLease(lease: G008Lease): { outbox: G008OutboxRow; command: G008CommandProjection } {
    const outbox = this.store.outbox.get(lease.command_id);
    const command = this.store.commands.get(lease.command_id);
    if (!outbox || !command || outbox.status !== "leased" || outbox.fencing_token !== lease.fencing_token || outbox.leased_until_ms !== lease.leased_until_ms || this.clock.now() >= lease.leased_until_ms) throw new Error("SIMULATED stale fenced lease");
    return { outbox, command };
  }

  private retryOrDeadLetter(outbox: G008OutboxRow, reason: string): number {
    outbox.leased_until_ms = null;
    outbox.ack_deadline_ms = null;
    const command = this.store.commands.get(outbox.command_id)!;
    if (outbox.attempts >= this.maxAttempts) {
      outbox.status = "dead_letter";
      outbox.dead_letter_reason = reason;
      command.delivery_status = "dead_letter";
      return 0;
    }
    const delay = 100 * 2 ** Math.max(0, outbox.attempts - 1);
    outbox.status = "queued";
    outbox.available_at_ms = this.clock.now() + delay;
    command.delivery_status = "queued";
    return delay;
  }

  private reconcileMissingAck(outbox: G008OutboxRow, now: number): void {
    const command = this.store.commands.get(outbox.command_id)!;
    outbox.ack_deadline_ms = null;
    if (now >= command.envelope.expires_at_ms || outbox.attempts >= this.maxAttempts) {
      outbox.status = "execution_unknown";
      command.delivery_status = "execution_unknown";
      return;
    }
    outbox.status = "queued";
    outbox.available_at_ms = now;
    command.delivery_status = "queued";
  }
}

export class SimulatedG008Device {
  readonly evidenceLabel = "SIMULATED" as const;
  private readonly identity: SimulatedDeviceIdentity;
  private readonly controlPublicKeyPem: string;
  private readonly clock: Clock;
  private epoch: number;
  private bootId: string;
  private synced = false;
  private durable = { receipts: new Map<string, { state: "received" | "succeeded"; final_ack: SignedAck | null }>(), effectCount: 0 };
  private telemetrySequence = 0;
  private authorityVersion = 0;
  private authorityIssuedAtMs = -1;

  constructor(identity: SimulatedDeviceIdentity, controlPublicKeyPem: string, clock: Clock, epoch = 1, bootId = "boot-g008-001") {
    this.identity = identity;
    this.controlPublicKeyPem = controlPublicKeyPem;
    this.clock = clock;
    this.epoch = epoch;
    this.bootId = bootId;
  }

  applyAuthoritativeSnapshot(signed: G008SignedAuthoritativeSnapshot): void {
    if (!verify(null, bytes(signed.snapshot), this.controlPublicKeyPem, decode(signed.signature_b64url))) throw new Error("SIMULATED authoritative snapshot signature rejected");
    if (signed.snapshot.device_id !== this.identity.deviceId) throw new Error("SIMULATED cross-device snapshot rejected");
    if (signed.snapshot.authority_version < this.authorityVersion) throw new Error("SIMULATED authority freshness rollback rejected");
    if (signed.snapshot.authority_version === this.authorityVersion) {
      const exactReplay = signed.snapshot.authorization_epoch === this.epoch
        && signed.snapshot.boot_id === this.bootId
        && signed.snapshot.issued_at_ms === this.authorityIssuedAtMs;
      if (!exactReplay) throw new Error("SIMULATED ambiguous authority replay rejected");
      this.synced = true;
      return;
    }
    if (signed.snapshot.authorization_epoch < this.epoch) throw new Error("SIMULATED epoch rollback rejected");
    this.epoch = signed.snapshot.authorization_epoch;
    this.bootId = signed.snapshot.boot_id;
    this.authorityVersion = signed.snapshot.authority_version;
    this.authorityIssuedAtMs = signed.snapshot.issued_at_ms;
    this.synced = true;
  }

  process(published: PublishedCommand, fault: "none" | "after_receipt" | "after_compute_before_commit" | "after_commit" = "none"): SignedAck[] {
    if (!this.synced) throw new Error("SIMULATED command blocked until authoritative sync");
    assertCommandEnvelope(published.command);
    if (!verify(null, bytes(published.command), this.controlPublicKeyPem, decode(published.signature_b64url))) throw new Error("SIMULATED command signature rejected");
    const command = published.command;
    if (command.device_id !== this.identity.deviceId || command.authorization_epoch !== this.epoch || command.expected_state.authorization_epoch !== this.epoch || command.expected_state.boot_id !== this.bootId || this.clock.now() >= command.expires_at_ms) throw new Error("SIMULATED command expected state rejected");
    const key = `${command.device_id}\u0000${command.idempotency_key}`;
    const existing = this.durable.receipts.get(key);
    if (existing?.final_ack) return [clone(existing.final_ack)];
    if (!existing) {
      const receiptCommit = clone(this.durable);
      receiptCommit.receipts.set(key, { state: "received", final_ack: null });
      this.durable = receiptCommit;
    }
    if (fault === "after_receipt") throw new Error("SIMULATED crash after durable device receipt");
    const accepted = this.ack(command, "accepted", null);
    const executing = this.ack(command, "executing", null);
    const succeeded = this.ack(command, "succeeded", { code: "health_check_complete", message: "stationary health check complete" });
    const effectCommit = clone(this.durable);
    effectCommit.effectCount += 1;
    effectCommit.receipts.set(key, { state: "succeeded", final_ack: succeeded });
    if (fault === "after_compute_before_commit") throw new Error("SIMULATED crash after effect computation before durable commit");
    this.durable = effectCommit;
    if (fault === "after_commit") throw new Error("SIMULATED crash after durable effect and receipt commit");
    return [accepted, executing, succeeded];
  }

  telemetry(): TelemetryFrame {
    if (!this.synced) throw new Error("SIMULATED telemetry blocked until authoritative sync");
    this.telemetrySequence += 1;
    const unsigned: Omit<TelemetryFrame, "signature_b64url"> = {
      protocol_version: PROTOCOL_VERSION,
      device_id: this.identity.deviceId,
      authorization_epoch: this.epoch,
      boot_id: this.bootId,
      sequence: this.telemetrySequence,
      captured_at_ms: this.clock.now(),
      kind: "diagnostics.health",
      payload: { battery_percent: 82, sensor_status: "ok", network_status: "online" },
    };
    return { ...unsigned, signature_b64url: this.identity.sign(unsigned) };
  }

  snapshot(): G008DevicePersistence {
    return { device_id: this.identity.deviceId, authorization_epoch: this.epoch, boot_id: this.bootId, receipts: clone([...this.durable.receipts.entries()]), telemetry_sequence: this.telemetrySequence, effect_count: this.durable.effectCount, authority_version: this.authorityVersion, authority_issued_at_ms: this.authorityIssuedAtMs };
  }

  restore(snapshot: G008DevicePersistence): void {
    if (snapshot.device_id !== this.identity.deviceId) throw new Error("SIMULATED persistence device mismatch");
    this.epoch = snapshot.authorization_epoch;
    this.bootId = snapshot.boot_id;
    this.durable = { receipts: new Map(clone(snapshot.receipts)), effectCount: snapshot.effect_count };
    this.telemetrySequence = snapshot.telemetry_sequence;
    this.authorityVersion = snapshot.authority_version;
    this.authorityIssuedAtMs = snapshot.authority_issued_at_ms;
    this.synced = false;
  }

  get executedEffects(): number { return this.durable.effectCount; }

  private ack(command: CommandEnvelope, status: AckStatus, reason: CommandAck["reason"]): SignedAck {
    const ack: CommandAck = { protocol_version: PROTOCOL_VERSION, command_id: command.command_id, device_id: command.device_id, authorization_epoch: command.authorization_epoch, idempotency_key: command.idempotency_key, boot_id: this.bootId, status, occurred_at_ms: this.clock.now(), reason };
    return { ack, signature_b64url: this.identity.sign(ack) };
  }
}

export function runSimulatedG008Scenario(clock: Clock): {
  evidence: "SIMULATED";
  projections: ReturnType<SimulatedG008Cloud["projections"]>;
  device_persistence: G008DevicePersistence;
} {
  const identity = new SimulatedDeviceIdentity("device-g008-canonical");
  const cloud = new SimulatedG008Cloud(clock);
  const authoritative = cloud.provision(identity, 1, "boot-g008-canonical");
  const device = new SimulatedG008Device(identity, cloud.controlPublicKeyPem, clock);
  device.applyAuthoritativeSnapshot(authoritative);
  cloud.createHealthCheck({ device_id: identity.deviceId, owner_account_id: "account-g008", terminal_id: "terminal-g008", actor_user_id: "user-g008", auth_session_id: "session-g008", idempotency_key: "idem-g008-canonical" });
  const lease = cloud.leaseNext();
  if (!lease) throw new Error("SIMULATED canonical scenario lease missing");
  const published = cloud.publishForLease(lease);
  const acks = device.process(published);
  cloud.markSent(lease);
  for (const ack of acks) cloud.appendAck(ack);
  cloud.replayAckProjection();
  cloud.acceptTelemetry(device.telemetry());
  return { evidence: "SIMULATED", projections: cloud.projections(), device_persistence: device.snapshot() };
}
