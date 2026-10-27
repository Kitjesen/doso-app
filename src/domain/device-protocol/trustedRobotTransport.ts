// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { HEALTH_CHECK_KIND, advanceAck, assertCommandAck, assertSignedCommand, assertTelemetryFrame, unsignedTelemetry, type AckStatus, type PublishedCommand, type SignedAck, type TelemetryFrame } from "./index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { DEVICE_SAFETY_CONTRACT_ID, DEVICE_SAFETY_CONTRACT_VERSION, NON_MOTION_DIAGNOSTIC } from "../device-safety/index.ts";

export type TransportPublishReceipt = Readonly<{ disposition: "accepted_for_delivery"; transport_message_id: string }>;
export interface RobotTransportConsumer { onFrame(frame: unknown): Promise<IngressResult>; onDisconnect(reason: "closed" | "transport_error"): Promise<void> }
/** close() must be idempotent. */
export interface RobotTransportConnection { close(): Promise<void> }
/**
 * connect() must not deliver before it resolves, must await onFrame for
 * backpressure, and must stop delivery before close() resolves. A publish
 * receipt is delivery evidence only; device success requires a trusted ACK.
 */
export interface RobotTransport { connect(consumer: RobotTransportConsumer): Promise<RobotTransportConnection>; publish(command: PublishedCommand): Promise<unknown> }
export interface ProtocolSignatureVerifier { verify(publicKeyPem: string, canonicalPayload: string, signatureB64Url: string): boolean | Promise<boolean> }

export interface TrustedDeviceProjection {
  version: number; device_id: string; owner_account_id: string | null; public_key_pem: string; public_key_fingerprint: string;
  lifecycle: "owned" | "quarantined" | "compromised" | "retired" | "unassigned";
  authorization_epoch: number; active_boot_id: string | null; last_telemetry_sequence: number;
  health: Readonly<{ sequence: number; captured_at_ms: number; battery_percent: number; sensor_status: "ok" | "degraded"; network_status: "online" | "offline" }> | null;
}
export interface TrustedCommandProjection {
  version: number; command_id: string; device_id: string; owner_account_id: string; authorization_epoch: number; expected_boot_id: string;
  expected_device_version: number; expected_public_key_fingerprint: string;
  idempotency_key: string; expires_at_ms: number; kind: typeof HEALTH_CHECK_KIND; capability: "command:diagnostics.health_check";
  command_class: typeof NON_MOTION_DIAGNOSTIC; may_actuate: false; safety_contract_id: typeof DEVICE_SAFETY_CONTRACT_ID;
  safety_contract_version: typeof DEVICE_SAFETY_CONTRACT_VERSION; ack_status: AckStatus | null;
}
export interface DeviceAuthorityFence {
  version: number; device_id: string; lifecycle: "owned"; owner_account_id: string; public_key_pem: string; public_key_fingerprint: string; authorization_epoch: number; active_boot_id: string;
}
export interface CommandProjectionFence {
  version: number; command_id: string; device_id: string; owner_account_id: string; authorization_epoch: number; expected_boot_id: string;
  expected_device_version: number; expected_public_key_fingerprint: string;
  idempotency_key: string; expires_at_ms: number; kind: typeof HEALTH_CHECK_KIND; capability: "command:diagnostics.health_check";
  command_class: typeof NON_MOTION_DIAGNOSTIC; may_actuate: false; safety_contract_id: typeof DEVICE_SAFETY_CONTRACT_ID;
  safety_contract_version: typeof DEVICE_SAFETY_CONTRACT_VERSION; ack_status: AckStatus | null;
}
export interface RobotIngressContext { device: TrustedDeviceProjection | null; command: TrustedCommandProjection | null }
export interface AuthenticatedAckCommit {
  deviceContext: TrustedDeviceProjection; commandContext: TrustedCommandProjection | null; ack: SignedAck["ack"];
  signatureB64Url: string; proposedRejection: IngressRejection | null; nextAckStatus: AckStatus | null;
}
export interface AuthenticatedAckCommitResult {
  stored: boolean; projected: boolean; retryable: boolean; rejection: IngressRejection | null; status: AckStatus | null;
}
export interface TelemetryProjectionCommit { deviceFence: DeviceAuthorityFence; frame: TelemetryFrame }
/** Production implementations must make each commit a single durable transaction. Every authority change must increment device.version. */
export interface RobotProjectionStore {
  readIngressContext(deviceId: string, commandId: string | null): Promise<RobotIngressContext>;
  commitAuthenticatedAck(change: AuthenticatedAckCommit): Promise<AuthenticatedAckCommitResult>;
  commitTelemetry(change: TelemetryProjectionCommit): Promise<boolean>;
}

export type IngressRejection = "invalid_frame" | "unknown_device" | "device_not_owned" | "invalid_signature" | "signature_verifier_unavailable"
  | "unknown_command" | "unsupported_command_projection" | "device_binding_mismatch" | "authorization_epoch_mismatch" | "boot_mismatch"
  | "clock_skew" | "clock_unavailable" | "frame_expired" | "command_expired" | "sequence_replay" | "illegal_ack_transition"
  | "projection_conflict" | "projection_store_unavailable" | "stale_transport_generation";
export type IngressResult = Readonly<{ accepted: true; frame: "ack"; status: AckStatus }>
  | Readonly<{ accepted: true; frame: "telemetry"; sequence: number }> | Readonly<{ accepted: false; reason: IngressRejection; retryable: boolean }>;
export interface TrustedRobotIngressOptions {
  now(): number; verifier: ProtocolSignatureVerifier; store: RobotProjectionStore; ackTtlMs?: number; telemetryTtlMs?: number;
  maxFutureSkewMs?: number; ackArrivalGraceMs?: number;
}

type SnapshotBudget = { nodes: number; properties: number; approximateBytes: number; ancestors: WeakSet<object> };
const MAX_DEPTH = 16, MAX_NODES = 256, MAX_PROPERTIES = 1_024, MAX_ARRAY_LENGTH = 64, MAX_OBJECT_PROPERTIES = 64, MAX_APPROXIMATE_BYTES = 64 * 1024;
const B64URL = /^[A-Za-z0-9_-]{16,1024}$/, TRANSPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const RETRYABLE_REJECTIONS = new Set<IngressRejection>(["signature_verifier_unavailable", "projection_conflict", "projection_store_unavailable", "clock_unavailable", "stale_transport_generation"]);
const rejected = (reason: IngressRejection): IngressResult => Object.freeze({ accepted: false, reason, retryable: RETRYABLE_REJECTIONS.has(reason) });

function useBudget(budget: SnapshotBudget, nodes: number, properties: number, approximateBytes: number): void {
  budget.nodes += nodes; budget.properties += properties; budget.approximateBytes += approximateBytes;
  if (budget.nodes > MAX_NODES || budget.properties > MAX_PROPERTIES || budget.approximateBytes > MAX_APPROXIMATE_BYTES) throw new Error("protocol frame resource limit exceeded");
}
function cloneSnapshot<T>(value: T, budget: SnapshotBudget, depth: number): T {
  if (depth > MAX_DEPTH) throw new Error("protocol frame nesting limit exceeded");
  if (value === null) { useBudget(budget, 1, 0, 1); return value; }
  if (typeof value === "string") { useBudget(budget, 1, 0, value.length * 2); return value; }
  if (typeof value === "boolean") { useBudget(budget, 1, 0, 1); return value; }
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("protocol numbers must be finite"); useBudget(budget, 1, 0, 8); return value; }
  if (typeof value !== "object") throw new Error("protocol frame must be JSON-like");
  if (budget.ancestors.has(value)) throw new Error("protocol frame cannot be cyclic");
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) { if (prototype !== Array.prototype || value.length > MAX_ARRAY_LENGTH) throw new Error("invalid protocol array"); }
  else if (prototype !== Object.prototype && prototype !== null) throw new Error("protocol objects must be plain");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("protocol frame cannot contain symbols");
  budget.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length) throw new Error("invalid protocol array length");
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== value.length) throw new Error("protocol arrays cannot be sparse or extended");
      useBudget(budget, 1, value.length, value.length * 2);
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("protocol array entries must be enumerable data fields");
        Object.defineProperty(output, String(index), { value: cloneSnapshot(descriptor.value, budget, depth + 1), enumerable: true, writable: false, configurable: false });
      }
      Object.defineProperty(output, "length", { value: value.length, writable: false }); return Object.freeze(output) as T;
    }
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_OBJECT_PROPERTIES) throw new Error("protocol object is too wide");
    useBudget(budget, 1, keys.length, keys.reduce((sum, key) => sum + key.length * 2, 0));
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (UNSAFE_KEYS.has(key)) throw new Error("unsafe protocol property");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("protocol properties must be enumerable data fields");
      Object.defineProperty(output, key, { value: cloneSnapshot(descriptor.value, budget, depth + 1), enumerable: true, writable: false, configurable: false });
    }
    return Object.freeze(output) as T;
  } finally { budget.ancestors.delete(value); }
}
/** Bounds already-decoded plain frames. Wire-byte and rate limits belong to the transport adapter. Arbitrary Proxy traps are outside this boundary. */
function safeSnapshot<T>(value: T): T { return cloneSnapshot(value, { nodes: 0, properties: 0, approximateBytes: 0, ancestors: new WeakSet() }, 0); }
function canonicalizeSnapshot(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeSnapshot).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeSnapshot(object[key])}`).join(",")}}`;
}
export function canonicalizeProtocolValue(value: unknown): string { return canonicalizeSnapshot(safeSnapshot(value)); }
function isSupportedCommand(command: TrustedCommandProjection): boolean {
  return command.kind === HEALTH_CHECK_KIND && command.capability === "command:diagnostics.health_check" && command.command_class === NON_MOTION_DIAGNOSTIC
    && command.may_actuate === false && command.safety_contract_id === DEVICE_SAFETY_CONTRACT_ID && command.safety_contract_version === DEVICE_SAFETY_CONTRACT_VERSION;
}

export class TrustedRobotIngress {
  readonly #now: () => number; readonly #verifier: ProtocolSignatureVerifier; readonly #store: RobotProjectionStore;
  readonly #ackTtlMs: number; readonly #telemetryTtlMs: number; readonly #maxFutureSkewMs: number; readonly #ackArrivalGraceMs: number; #lastNow: number | null = null;
  constructor(options: TrustedRobotIngressOptions) {
    this.#now = options.now; this.#verifier = options.verifier; this.#store = options.store;
    this.#ackTtlMs = positiveDuration(options.ackTtlMs ?? 60_000, "ackTtlMs"); this.#telemetryTtlMs = positiveDuration(options.telemetryTtlMs ?? 60_000, "telemetryTtlMs");
    this.#maxFutureSkewMs = nonNegativeDuration(options.maxFutureSkewMs ?? 5_000, "maxFutureSkewMs"); this.#ackArrivalGraceMs = nonNegativeDuration(options.ackArrivalGraceMs ?? 5_000, "ackArrivalGraceMs");
  }
  async accept(untrustedFrame: unknown): Promise<IngressResult> {
    let frame: unknown; try { frame = safeSnapshot(untrustedFrame); } catch { return rejected("invalid_frame"); }
    if (!frame || typeof frame !== "object") return rejected("invalid_frame");
    return hasOwn(frame, "ack") ? this.#acceptAck(frame) : this.#acceptTelemetry(frame);
  }
  async #acceptAck(frame: object): Promise<IngressResult> {
    const signed = frame as Partial<SignedAck> & Record<string, unknown>;
    if (Object.keys(signed).length !== 2 || !hasOwn(signed, "ack") || !hasOwn(signed, "signature_b64url") || typeof signed.signature_b64url !== "string" || !B64URL.test(signed.signature_b64url)) return rejected("invalid_frame");
    try { assertCommandAck(signed.ack); } catch { return rejected("invalid_frame"); }
    const ack = signed.ack;
    let contextValue: RobotIngressContext;
    try { contextValue = await this.#store.readIngressContext(ack.device_id, ack.command_id); }
    catch { return rejected("projection_store_unavailable"); }
    let device: TrustedDeviceProjection | null, command: TrustedCommandProjection | null;
    try { device = contextValue.device && safeSnapshot(contextValue.device); command = contextValue.command && safeSnapshot(contextValue.command); } catch { return rejected("projection_conflict"); }
    if (!device) return rejected("unknown_device");
    const signature = await this.#verify(device, ack, signed.signature_b64url);
    if (signature !== "valid") return rejected(signature === "invalid" ? "invalid_signature" : "signature_verifier_unavailable");
    let proposedRejection: IngressRejection | null = null;
    let nextAckStatus: AckStatus | null = null;
    const now = this.#trustedNow();
    const deviceAuthority = deviceFence(device);
    if (!deviceAuthority) proposedRejection = "device_not_owned";
    else if (!command) proposedRejection = "unknown_command";
    else if (!isSupportedCommand(command)) proposedRejection = "unsupported_command_projection";
    else if (command.device_id !== device.device_id || command.owner_account_id !== device.owner_account_id || command.idempotency_key !== ack.idempotency_key || command.expected_device_version !== device.version || command.expected_public_key_fingerprint !== device.public_key_fingerprint) proposedRejection = "device_binding_mismatch";
    else if (ack.authorization_epoch !== device.authorization_epoch || command.authorization_epoch !== device.authorization_epoch) proposedRejection = "authorization_epoch_mismatch";
    else if (device.active_boot_id === null || ack.boot_id !== device.active_boot_id || command.expected_boot_id !== device.active_boot_id || ack.boot_id !== command.expected_boot_id) proposedRejection = "boot_mismatch";
    else if (now === null) proposedRejection = "clock_unavailable";
    else if (ack.occurred_at_ms > now + this.#maxFutureSkewMs) proposedRejection = "clock_skew";
    else if (now - ack.occurred_at_ms > this.#ackTtlMs) proposedRejection = "frame_expired";
    else if (ack.occurred_at_ms > command.expires_at_ms || now > command.expires_at_ms + this.#ackArrivalGraceMs) proposedRejection = "command_expired";
    else {
      const advanced = advanceAck(command.ack_status, ack.status);
      if (!advanced.applied || advanced.status === null) proposedRejection = "illegal_ack_transition";
      else nextAckStatus = advanced.status;
    }
    try {
      const committed = await this.#store.commitAuthenticatedAck({
        deviceContext: device, commandContext: command, ack, signatureB64Url: signed.signature_b64url,
        proposedRejection, nextAckStatus,
      });
      if (!committed.stored) return rejected(committed.rejection ?? "projection_conflict");
      if (!committed.projected) return Object.freeze({ accepted: false, reason: committed.rejection ?? "projection_conflict", retryable: committed.retryable });
      if (committed.status === null) return rejected("projection_conflict");
      return Object.freeze({ accepted: true, frame: "ack", status: committed.status });
    } catch { return rejected("projection_store_unavailable"); }
  }
  async #acceptTelemetry(frame: object): Promise<IngressResult> {
    let telemetry: TelemetryFrame; try { assertTelemetryFrame(frame); telemetry = frame; } catch { return rejected("invalid_frame"); }
    let deviceValue: TrustedDeviceProjection | null;
    try { deviceValue = (await this.#store.readIngressContext(telemetry.device_id, null)).device; } catch { return rejected("projection_store_unavailable"); }
    let device: TrustedDeviceProjection | null; try { device = deviceValue && safeSnapshot(deviceValue); } catch { return rejected("projection_conflict"); }
    if (!device) return rejected("unknown_device");
    const signature = await this.#verify(device, unsignedTelemetry(telemetry), telemetry.signature_b64url);
    if (signature !== "valid") return rejected(signature === "invalid" ? "invalid_signature" : "signature_verifier_unavailable");
    const deviceAuthority = deviceFence(device);
    if (!deviceAuthority) return rejected("device_not_owned");
    if (telemetry.authorization_epoch !== device.authorization_epoch) return rejected("authorization_epoch_mismatch");
    if (device.active_boot_id === null || telemetry.boot_id !== device.active_boot_id) return rejected("boot_mismatch");
    const now = this.#trustedNow(); if (now === null) return rejected("clock_unavailable");
    if (telemetry.captured_at_ms > now + this.#maxFutureSkewMs) return rejected("clock_skew");
    if (now - telemetry.captured_at_ms > this.#telemetryTtlMs) return rejected("frame_expired");
    if (telemetry.sequence <= device.last_telemetry_sequence) return rejected("sequence_replay");
    try { if (!await this.#store.commitTelemetry({ deviceFence: deviceAuthority, frame: telemetry })) return rejected("projection_conflict"); }
    catch { return rejected("projection_store_unavailable"); }
    return Object.freeze({ accepted: true, frame: "telemetry", sequence: telemetry.sequence });
  }
  async #verify(device: TrustedDeviceProjection, payload: unknown, signature: string): Promise<"valid" | "invalid" | "unavailable"> {
    try { return await this.#verifier.verify(device.public_key_pem, canonicalizeSnapshot(payload), signature) === true ? "valid" : "invalid"; } catch { return "unavailable"; }
  }
  #trustedNow(): number | null {
    try { const now = this.#now(); if (!Number.isSafeInteger(now) || now < 0 || this.#lastNow !== null && now < this.#lastNow) return null; this.#lastNow = now; return now; }
    catch { return null; }
  }
}

export type RobotTransportSessionState = "idle" | "connecting" | "connected" | "stopping" | "close_failed";
export class RobotTransportIngressSession {
  readonly #transport: RobotTransport; readonly #ingress: TrustedRobotIngress; #state: RobotTransportSessionState = "idle"; #generation = 0;
  #connection: RobotTransportConnection | null = null; #startTask: Promise<void> | null = null; #stopTask: Promise<void> | null = null;
  constructor(transport: RobotTransport, ingress: TrustedRobotIngress) { this.#transport = transport; this.#ingress = ingress; }
  get state(): RobotTransportSessionState { return this.#state; }
  async start(): Promise<void> {
    if (this.#state === "connected") return;
    if (this.#state === "close_failed") throw new Error("robot transport close must be retried before reconnecting");
    if (this.#state === "connecting" && this.#startTask) return this.#startTask;
    if (this.#state === "stopping" && this.#stopTask) { await this.#stopTask; return this.start(); }
    const generation = ++this.#generation; this.#state = "connecting";
    const consumer: RobotTransportConsumer = {
      onFrame: async (frame) => this.#generation === generation && this.#state === "connected" ? this.#ingress.accept(frame) : rejected("stale_transport_generation"),
      onDisconnect: async () => { if (this.#generation !== generation || this.#state === "stopping") return; this.#generation += 1; this.#connection = null; this.#state = "idle"; },
    };
    const task = (async () => {
      let connection: RobotTransportConnection;
      try { connection = await this.#transport.connect(consumer); }
      catch (error) { if (this.#generation === generation && this.#state === "connecting") this.#state = "idle"; throw error; }
      if (this.#generation !== generation || this.#state !== "connecting") {
        try { await connection.close(); }
        catch {
          if (this.#state === "stopping") { this.#connection = connection; this.#state = "close_failed"; }
          throw new Error("robot transport close failed");
        }
        return;
      }
      this.#connection = connection; this.#state = "connected";
    })();
    this.#startTask = task; try { await task; } finally { if (this.#startTask === task) this.#startTask = null; }
  }
  async publish(commandValue: unknown): Promise<TransportPublishReceipt> {
    if (this.#state !== "connected" || !this.#connection) throw new Error("robot transport is not connected");
    const generation = this.#generation;
    let command: PublishedCommand;
    try { const snapshot = safeSnapshot(commandValue); assertSignedCommand(snapshot); command = snapshot; } catch { throw new Error("invalid signed robot command"); }
    const rawReceipt = await this.#transport.publish(command);
    if (this.#generation !== generation || this.#state !== "connected" || !this.#connection) throw new Error("stale robot transport generation");
    let receipt: unknown; try { receipt = safeSnapshot(rawReceipt); } catch { throw new Error("invalid robot transport receipt"); }
    if (!receipt || typeof receipt !== "object" || Object.keys(receipt).length !== 2 || !hasOwn(receipt, "disposition") || !hasOwn(receipt, "transport_message_id")) throw new Error("invalid robot transport receipt");
    const candidate = receipt as Record<string, unknown>;
    if (candidate.disposition !== "accepted_for_delivery" || typeof candidate.transport_message_id !== "string" || !TRANSPORT_ID.test(candidate.transport_message_id)) throw new Error("invalid robot transport receipt");
    return receipt as TransportPublishReceipt;
  }
  async stop(): Promise<void> {
    if (this.#state === "idle") return;
    if (this.#state === "stopping" && this.#stopTask) return this.#stopTask;
    const generation = ++this.#generation; this.#state = "stopping"; const connection = this.#connection; const pendingStart = this.#startTask;
    const task = (async () => {
      let closeFailed = false;
      try {
        if (connection) {
          try { await connection.close(); }
          catch { closeFailed = true; if (this.#generation === generation) { this.#connection = connection; this.#state = "close_failed"; } }
        }
        if (pendingStart) {
          try { await pendingStart; }
          catch { if (this.#state === "close_failed") closeFailed = true; }
        }
      } finally {
        if (!closeFailed && this.#generation === generation && this.#state === "stopping") { this.#connection = null; this.#state = "idle"; }
      }
      if (closeFailed) throw new Error("robot transport close failed");
    })();
    this.#stopTask = task; try { await task; } finally { if (this.#stopTask === task) this.#stopTask = null; }
  }
}

/** Test/reference store only. Production must supply durable transactional CAS. */
export class InMemoryRobotProjectionStore implements RobotProjectionStore {
  readonly #devices = new Map<string, TrustedDeviceProjection>(); readonly #commands = new Map<string, TrustedCommandProjection>();
  readonly authenticatedAckEvents: AuthenticatedAckCommit[] = []; commitCount = 0;
  constructor(devices: TrustedDeviceProjection[] = [], commands: TrustedCommandProjection[] = []) {
    for (const device of devices) this.#devices.set(device.device_id, safeSnapshot(device)); for (const command of commands) this.#commands.set(command.command_id, safeSnapshot(command));
  }
  async readDevice(deviceId: string): Promise<TrustedDeviceProjection | null> { const value = this.#devices.get(deviceId); return value ? safeSnapshot(value) : null; }
  async readCommand(commandId: string): Promise<TrustedCommandProjection | null> { const value = this.#commands.get(commandId); return value ? safeSnapshot(value) : null; }
  async readIngressContext(deviceId: string, commandId: string | null): Promise<RobotIngressContext> {
    return Object.freeze({ device: await this.readDevice(deviceId), command: commandId === null ? null : await this.readCommand(commandId) });
  }
  async commitAuthenticatedAck(change: AuthenticatedAckCommit): Promise<AuthenticatedAckCommitResult> {
    const snapshot = safeSnapshot(change); this.authenticatedAckEvents.push(snapshot);
    if (change.proposedRejection) return Object.freeze({ stored: true, projected: false, retryable: RETRYABLE_REJECTIONS.has(change.proposedRejection), rejection: change.proposedRejection, status: change.commandContext?.ack_status ?? null });
    const commandContext = change.commandContext;
    const device = this.#devices.get(change.deviceContext.device_id);
    const command = commandContext === null ? undefined : this.#commands.get(commandContext.command_id);
    if (!device || !command || commandContext === null || !sameDeviceProjection(device, change.deviceContext) || !sameCommandFence(command, commandFence(commandContext)) || !sameCommandAuthorityBinding(device, command) || change.nextAckStatus === null) {
      return Object.freeze({ stored: true, projected: false, retryable: true, rejection: "projection_conflict", status: command?.ack_status ?? null });
    }
    const advanced = advanceAck(command.ack_status, change.nextAckStatus);
    if (!advanced.applied || advanced.status !== change.nextAckStatus) return Object.freeze({ stored: true, projected: false, retryable: false, rejection: "illegal_ack_transition", status: command.ack_status });
    this.#commands.set(command.command_id, safeSnapshot({ ...command, version: command.version + 1, ack_status: change.nextAckStatus })); this.commitCount += 1;
    return Object.freeze({ stored: true, projected: true, retryable: false, rejection: null, status: change.nextAckStatus });
  }
  async commitTelemetry(change: TelemetryProjectionCommit): Promise<boolean> {
    const device = this.#devices.get(change.deviceFence.device_id), frame = change.frame;
    if (!device || !sameDeviceFence(device, change.deviceFence) || frame.device_id !== device.device_id || frame.authorization_epoch !== device.authorization_epoch || frame.boot_id !== device.active_boot_id || frame.sequence <= device.last_telemetry_sequence) return false;
    this.#devices.set(device.device_id, safeSnapshot({ ...device, version: device.version + 1, last_telemetry_sequence: frame.sequence,
      health: { sequence: frame.sequence, captured_at_ms: frame.captured_at_ms, battery_percent: frame.payload.battery_percent, sensor_status: frame.payload.sensor_status, network_status: frame.payload.network_status } }));
    this.commitCount += 1; return true;
  }
  replaceDevice(device: TrustedDeviceProjection): void {
    const current = this.#devices.get(device.device_id);
    if (current && authorityChanged(current, device) && device.version <= current.version) throw new Error("authority changes must increment device version");
    this.#devices.set(device.device_id, safeSnapshot(device));
  }
  /** Corruption injector for contract tests; never use as an authority update path. */
  testOnlyCorruptDeviceWithoutVersionBump(device: TrustedDeviceProjection): void { this.#devices.set(device.device_id, safeSnapshot(device)); }
  replaceCommand(command: TrustedCommandProjection): void {
    const current = this.#commands.get(command.command_id);
    if (current && canonicalizeSnapshot(current) !== canonicalizeSnapshot(command) && command.version <= current.version) throw new Error("command changes must increment command version");
    this.#commands.set(command.command_id, safeSnapshot(command));
  }
}
function deviceFence(device: TrustedDeviceProjection): DeviceAuthorityFence | null {
  return device.lifecycle === "owned" && device.owner_account_id !== null && device.active_boot_id !== null ? Object.freeze({
    version: device.version, device_id: device.device_id, lifecycle: "owned", owner_account_id: device.owner_account_id, public_key_pem: device.public_key_pem, public_key_fingerprint: device.public_key_fingerprint,
    authorization_epoch: device.authorization_epoch, active_boot_id: device.active_boot_id,
  }) : null;
}
function commandFence(command: TrustedCommandProjection): CommandProjectionFence {
  return Object.freeze({
    version: command.version, command_id: command.command_id, device_id: command.device_id, owner_account_id: command.owner_account_id,
    authorization_epoch: command.authorization_epoch, expected_boot_id: command.expected_boot_id, expected_device_version: command.expected_device_version,
    expected_public_key_fingerprint: command.expected_public_key_fingerprint, idempotency_key: command.idempotency_key,
    expires_at_ms: command.expires_at_ms, kind: command.kind, capability: command.capability, command_class: command.command_class,
    may_actuate: command.may_actuate, safety_contract_id: command.safety_contract_id, safety_contract_version: command.safety_contract_version,
    ack_status: command.ack_status,
  });
}
function sameDeviceFence(current: TrustedDeviceProjection, expected: DeviceAuthorityFence): boolean {
  return current.version === expected.version && current.device_id === expected.device_id && current.lifecycle === expected.lifecycle
    && current.owner_account_id === expected.owner_account_id && current.public_key_pem === expected.public_key_pem && current.public_key_fingerprint === expected.public_key_fingerprint
    && current.authorization_epoch === expected.authorization_epoch && current.active_boot_id === expected.active_boot_id;
}
function sameDeviceProjection(current: TrustedDeviceProjection, expected: TrustedDeviceProjection): boolean {
  return canonicalizeSnapshot(current) === canonicalizeSnapshot(expected);
}
function sameCommandFence(current: TrustedCommandProjection, expected: CommandProjectionFence): boolean {
  return current.version === expected.version && current.command_id === expected.command_id && current.device_id === expected.device_id && current.owner_account_id === expected.owner_account_id
    && current.authorization_epoch === expected.authorization_epoch && current.expected_boot_id === expected.expected_boot_id
    && current.expected_device_version === expected.expected_device_version && current.expected_public_key_fingerprint === expected.expected_public_key_fingerprint && current.idempotency_key === expected.idempotency_key
    && current.expires_at_ms === expected.expires_at_ms && current.ack_status === expected.ack_status && isSupportedCommand(current)
    && current.kind === expected.kind && current.capability === expected.capability && current.command_class === expected.command_class && current.may_actuate === expected.may_actuate
    && current.safety_contract_id === expected.safety_contract_id && current.safety_contract_version === expected.safety_contract_version;
}
function sameCommandAuthorityBinding(device: TrustedDeviceProjection, command: TrustedCommandProjection): boolean {
  return device.lifecycle === "owned" && device.owner_account_id !== null && device.active_boot_id !== null
    && command.device_id === device.device_id && command.owner_account_id === device.owner_account_id
    && command.authorization_epoch === device.authorization_epoch && command.expected_boot_id === device.active_boot_id
    && command.expected_device_version === device.version && command.expected_public_key_fingerprint === device.public_key_fingerprint;
}
function authorityChanged(current: TrustedDeviceProjection, next: TrustedDeviceProjection): boolean {
  return current.lifecycle !== next.lifecycle || current.owner_account_id !== next.owner_account_id || current.public_key_pem !== next.public_key_pem || current.public_key_fingerprint !== next.public_key_fingerprint
    || current.authorization_epoch !== next.authorization_epoch || current.active_boot_id !== next.active_boot_id;
}
function positiveDuration(value: number, name: string): number { if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`); return value; }
function nonNegativeDuration(value: number, name: string): number { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`); return value; }
