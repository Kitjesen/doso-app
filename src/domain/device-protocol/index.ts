// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { DEVICE_SAFETY_CONTRACT_ID, DEVICE_SAFETY_CONTRACT_VERSION, NON_MOTION_DIAGNOSTIC, assertSimulatedDeviceSafetyCommand } from "../device-safety/index.ts";

export const PROTOCOL_VERSION = 1 as const;
export const HEALTH_CHECK_KIND = "diagnostics.health_check" as const;

export type DeviceLifecycle = "unassigned" | "owned" | "quarantined" | "compromised" | "retired";
export type IdentityLifecycle = "active" | "revoked" | "compromised" | "retired";
export type AccountLifecycle = "active" | "suspended";
export type TerminalLifecycle = "active" | "revoked";
export type AckStatus = "accepted" | "executing" | "succeeded" | "failed" | "rejected" | "expired" | "cancelled";
export type CommandStatus = "queued" | "published" | "revocation_pending" | AckStatus | "expired" | "cancelled" | "rejected";
export type OutboxStatus = "queued" | "leased" | "published" | "completed" | "cancelled" | "dead_letter";
export type Capability = "device:pair" | "command:diagnostics.health_check";

export interface AuthenticatedActor {
  authenticated: true;
  user_id: string;
  account_id: string;
  terminal_id: string;
  session_id: string;
  capabilities: Capability[];
}
export interface CommandEnvelope {
  protocol_version: typeof PROTOCOL_VERSION;
  command_id: string;
  device_id: string;
  owner_account_id: string;
  terminal_id: string;
  actor_user_id: string;
  authorization_epoch: number;
  idempotency_key: string;
  auth_session_id: string;
  policy_version: number;
  safety_contract_id: typeof DEVICE_SAFETY_CONTRACT_ID;
  safety_contract_version: typeof DEVICE_SAFETY_CONTRACT_VERSION;
  capability: "command:diagnostics.health_check";
  kind: typeof HEALTH_CHECK_KIND;
  command_class: typeof NON_MOTION_DIAGNOSTIC;
  may_actuate: false;
  expected_state: { authorization_epoch: number; boot_id: string };
  issued_at_ms: number;
  expires_at_ms: number;
  payload: { include: Array<"battery" | "sensors" | "network"> };
}
export interface PublishedCommand { command: CommandEnvelope; signature_b64url: string }
export interface DeliveryChallenge {
  challenge_id: string; nonce_b64url: string; device_id: string; boot_id: string; command_id: string;
  expected_epoch: number; delivery_counter: number; issued_at_ms: number; expires_at_ms: number;
}
export interface SignedDeliveryChallenge { challenge: DeliveryChallenge; signature_b64url: string }
export interface DeliveryAuthorization {
  authorization_id: string; challenge_id: string; nonce_b64url: string; command_id: string; device_id: string; boot_id: string;
  command_epoch: number; authoritative_epoch: number; revocation_version: number; delivery_counter: number;
  decision: "allow" | "cancel"; reason: string; issued_at_ms: number; expires_at_ms: number;
}
export interface SignedDeliveryAuthorization { authorization: DeliveryAuthorization; signature_b64url: string }
export interface CommandAck {
  protocol_version: typeof PROTOCOL_VERSION;
  command_id: string;
  device_id: string;
  authorization_epoch: number;
  idempotency_key: string;
  boot_id: string;
  status: AckStatus;
  occurred_at_ms: number;
  reason: { code: string; message: string } | null;
}
export interface SignedAck { ack: CommandAck; signature_b64url: string }
export interface TelemetryFrame {
  protocol_version: typeof PROTOCOL_VERSION;
  device_id: string;
  authorization_epoch: number;
  boot_id: string;
  sequence: number;
  captured_at_ms: number;
  kind: "diagnostics.health";
  payload: { battery_percent: number; sensor_status: "ok" | "degraded"; network_status: "online" | "offline" };
  signature_b64url: string;
}
export interface PairingChallenge {
  challenge_id: string; nonce_b64url: string; device_id: string; owner_account_id: string; terminal_id: string;
  issued_at_ms: number; expires_at_ms: number;
}
export interface BootChallenge {
  challenge_id: string; nonce_b64url: string; device_id: string; authorization_epoch: number; boot_counter: number;
  issued_at_ms: number; expires_at_ms: number;
}
export interface EpochUpdate {
  device_id: string; previous_epoch: number; next_epoch: number; reason: string; issued_at_ms: number;
}
export interface SignedEpochUpdate { update: EpochUpdate; signature_b64url: string }
export interface DeviceRecord {
  device_id: string; owner_account_id: string | null; terminal_id: string | null; public_key_pem: string;
  authorization_epoch: number; lifecycle: DeviceLifecycle; active_boot_id: string | null; boot_counter: number;
  revocation_version: number; delivery_counter: number; last_telemetry_sequence: number; allowed_commands: Array<typeof HEALTH_CHECK_KIND>;
}
export interface AuditEvent { event: string; at_ms: number; device_id: string; command_id?: string; detail?: string }

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const B64URL = /^[A-Za-z0-9_-]{16,1024}$/;
const ACKS = new Set<AckStatus>(["accepted", "executing", "succeeded", "failed", "rejected", "expired", "cancelled"]);
const INCLUDE = new Set(["battery", "sensors", "network"]);
const RANK: Record<AckStatus, number> = { accepted: 1, executing: 2, succeeded: 3, failed: 3, rejected: 3, expired: 3, cancelled: 3 };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const id = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const epoch = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function assertCommandEnvelope(value: unknown): asserts value is CommandEnvelope {
  if (!record(value) || !exact(value, ["protocol_version", "command_id", "device_id", "owner_account_id", "terminal_id", "actor_user_id", "authorization_epoch", "idempotency_key", "auth_session_id", "policy_version", "safety_contract_id", "safety_contract_version", "capability", "kind", "command_class", "may_actuate", "expected_state", "issued_at_ms", "expires_at_ms", "payload"])) throw new Error("invalid command envelope shape");
  if (value.protocol_version !== PROTOCOL_VERSION || value.kind !== HEALTH_CHECK_KIND) throw new Error("unsupported command");
  for (const key of ["command_id", "device_id", "owner_account_id", "terminal_id", "actor_user_id", "idempotency_key", "auth_session_id"] as const) if (!id(value[key])) throw new Error(`invalid ${key}`);
  if (!epoch(value.authorization_epoch) || !epoch(value.policy_version) || value.capability !== "command:diagnostics.health_check" || value.safety_contract_id !== DEVICE_SAFETY_CONTRACT_ID || value.safety_contract_version !== DEVICE_SAFETY_CONTRACT_VERSION || !timestamp(value.issued_at_ms) || !timestamp(value.expires_at_ms) || value.expires_at_ms <= value.issued_at_ms) throw new Error("invalid command epoch, policy, safety contract, capability, or timestamps");
  assertSimulatedDeviceSafetyCommand({ kind: value.kind, command_class: value.command_class, may_actuate: value.may_actuate });
  if (!record(value.expected_state) || !exact(value.expected_state, ["authorization_epoch", "boot_id"]) || value.expected_state.authorization_epoch !== value.authorization_epoch || !id(value.expected_state.boot_id)) throw new Error("invalid expected device state");
  if (!record(value.payload) || !exact(value.payload, ["include"]) || !Array.isArray(value.payload.include) || value.payload.include.length < 1 || value.payload.include.length > 3 || new Set(value.payload.include).size !== value.payload.include.length || !value.payload.include.every((item) => typeof item === "string" && INCLUDE.has(item))) throw new Error("invalid health check payload");
}
export function assertSignedCommand(value: unknown): asserts value is PublishedCommand {
  if (!record(value) || !exact(value, ["command", "signature_b64url"]) || typeof value.signature_b64url !== "string" || !B64URL.test(value.signature_b64url)) throw new Error("invalid signed command shape");
  assertCommandEnvelope(value.command);
}
export function assertCommandAck(value: unknown): asserts value is CommandAck {
  if (!record(value) || !exact(value, ["protocol_version", "command_id", "device_id", "authorization_epoch", "idempotency_key", "boot_id", "status", "occurred_at_ms", "reason"])) throw new Error("invalid ACK shape");
  if (value.protocol_version !== PROTOCOL_VERSION) throw new Error("invalid ACK version");
  for (const key of ["command_id", "device_id", "idempotency_key", "boot_id"] as const) if (!id(value[key])) throw new Error(`invalid ACK ${key}`);
  if (!epoch(value.authorization_epoch) || !timestamp(value.occurred_at_ms) || typeof value.status !== "string" || !ACKS.has(value.status as AckStatus)) throw new Error("invalid ACK fields");
  if (!(value.reason === null || record(value.reason) && exact(value.reason, ["code", "message"]) && id(value.reason.code) && typeof value.reason.message === "string" && value.reason.message.length <= 256)) throw new Error("invalid ACK reason");
  if (["failed", "rejected", "expired", "cancelled"].includes(value.status as string) && value.reason === null) throw new Error("terminal failure ACK requires structured reason");
}
export function unsignedTelemetry(frame: TelemetryFrame): Omit<TelemetryFrame, "signature_b64url"> { const { signature_b64url: _, ...unsigned } = frame; return unsigned; }
export function assertTelemetryFrame(value: unknown): asserts value is TelemetryFrame {
  if (!record(value) || !exact(value, ["protocol_version", "device_id", "authorization_epoch", "boot_id", "sequence", "captured_at_ms", "kind", "payload", "signature_b64url"])) throw new Error("invalid telemetry shape");
  if (value.protocol_version !== PROTOCOL_VERSION || value.kind !== "diagnostics.health" || !id(value.device_id) || !id(value.boot_id) || !epoch(value.authorization_epoch) || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 || !timestamp(value.captured_at_ms) || typeof value.signature_b64url !== "string" || !B64URL.test(value.signature_b64url)) throw new Error("invalid telemetry identity fields");
  if (!record(value.payload) || !exact(value.payload, ["battery_percent", "sensor_status", "network_status"]) || typeof value.payload.battery_percent !== "number" || !Number.isFinite(value.payload.battery_percent) || value.payload.battery_percent < 0 || value.payload.battery_percent > 100 || !["ok", "degraded"].includes(value.payload.sensor_status as string) || !["online", "offline"].includes(value.payload.network_status as string)) throw new Error("invalid telemetry payload");
}
export function advanceAck(current: AckStatus | null, incoming: AckStatus): { applied: boolean; status: AckStatus | null } {
  if (current === null) return incoming === "accepted" || RANK[incoming] === 3 ? { applied: true, status: incoming } : { applied: false, status: null };
  if (RANK[current] === 3 || incoming === current) return { applied: false, status: current };
  if (current === "accepted" && (incoming === "executing" || RANK[incoming] === 3)) return { applied: true, status: incoming };
  if (current === "executing" && RANK[incoming] === 3) return { applied: true, status: incoming };
  return { applied: false, status: current };
}
export function assertNextEpoch(current: number, next: number): void { if (!Number.isSafeInteger(next) || next !== current + 1) throw new Error("authorization epoch must increment exactly once"); }

// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
export * from "./trustedRobotTransport.ts";
