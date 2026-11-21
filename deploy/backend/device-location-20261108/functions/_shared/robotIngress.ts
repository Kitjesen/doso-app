const MAX_WIRE_BYTES = 64 * 1024;
const MAX_DECODED_UNITS = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const B64URL = /^[A-Za-z0-9_-]{16,1024}$/;
const ACK_STATUSES = new Set(["accepted", "executing", "succeeded", "failed", "rejected", "expired", "cancelled"]);
const TERMINAL = new Set(["succeeded", "failed", "rejected", "expired", "cancelled"]);
type EnvironmentReader = (name: string) => string | undefined;
type RpcResult = { data: unknown; error: unknown };
export type RobotIngressRpcClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult> };
export type ProtocolSignatureVerifier = { verify(publicKeyPem: string, canonicalPayload: string, signatureB64Url: string): boolean | Promise<boolean> };
type AckStatus = "accepted" | "executing" | "succeeded" | "failed" | "rejected" | "expired" | "cancelled";
type Ack = { protocol_version: 1; command_id: string; device_id: string; authorization_epoch: number; idempotency_key: string; boot_id: string; status: AckStatus; occurred_at_ms: number; reason: { code: string; message: string } | null };
type Telemetry = { protocol_version: 1; device_id: string; authorization_epoch: number; boot_id: string; sequence: number; captured_at_ms: number; kind: "diagnostics.health"; payload: { battery_percent: number; sensor_status: "ok" | "degraded"; network_status: "online" | "offline" }; signature_b64url: string };
type DeviceContext = { version: number; device_id: string; owner_account_id: string | null; public_key_pem: string; public_key_fingerprint: string; lifecycle: string; authorization_epoch: number; active_boot_id: string | null; last_telemetry_sequence: number };
type CommandContext = { version: number; command_id: string; device_id: string; owner_account_id: string; authorization_epoch: number; expected_boot_id: string; expected_device_version: number; expected_public_key_fingerprint: string; idempotency_key: string; expires_at_ms: number; kind: string; capability: string; command_class: string; may_actuate: boolean; safety_contract_id: string; safety_contract_version: number; ack_status: AckStatus | null };
type Context = { device: DeviceContext | null; command: CommandContext | null };
type IngressResult = { accepted: true; frame: "ack"; status: AckStatus } | { accepted: true; frame: "telemetry"; sequence: number } | { accepted: false; reason: string; retryable: boolean };

export class RobotIngressError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); this.name = "RobotIngressError"; }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(), expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function safeInteger(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && Number(value) >= minimum; }
function constantTimeEqual(left: string, right: string): boolean { const maximum = Math.max(left.length, right.length); let difference = left.length ^ right.length; for (let index = 0; index < maximum; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0); return difference === 0; }

export function authorizeRobotIngress(request: Request, read: EnvironmentReader): boolean {
  const secretName = read("DOSO_ROBOT_INGRESS_SECRET_NAME")?.trim() || "robot-ingress";
  const encoded = read("SUPABASE_SECRET_KEYS")?.trim();
  if (!encoded) throw new RobotIngressError("ingress_configuration_error", 503, "Robot ingress is not configured.");
  let parsed: unknown; try { parsed = JSON.parse(encoded); } catch { throw new RobotIngressError("ingress_configuration_error", 503, "Robot ingress is not configured."); }
  const expected = record(parsed) ? parsed[secretName] : undefined;
  if (typeof expected !== "string" || !expected.trim()) throw new RobotIngressError("ingress_configuration_error", 503, "Robot ingress is not configured.");
  return constantTimeEqual(request.headers.get("apikey") ?? "", expected.trim());
}

function decodedUnits(value: unknown, depth = 0): number {
  if (depth > 16) throw new RobotIngressError("invalid_frame", 400, "Robot frame is too deeply nested.");
  if (value === null || typeof value === "boolean" || typeof value === "number") return 8;
  if (typeof value === "string") return value.length * 2;
  if (Array.isArray(value)) { if (value.length > 64) throw new RobotIngressError("invalid_frame", 400, "Robot frame array is too large."); return value.reduce((sum, item) => sum + decodedUnits(item, depth + 1), 8); }
  if (!record(value)) throw new RobotIngressError("invalid_frame", 400, "Robot frame must be JSON-like.");
  const keys = Object.keys(value); if (keys.length > 64 || keys.some((key) => ["__proto__", "prototype", "constructor"].includes(key))) throw new RobotIngressError("invalid_frame", 400, "Robot frame object is invalid.");
  return keys.reduce((sum, key) => sum + key.length * 2 + decodedUnits(value[key], depth + 1), 8);
}
export function canonicalizeRobotProtocolValue(value: unknown): string {
  if (decodedUnits(value) > MAX_DECODED_UNITS) throw new RobotIngressError("invalid_frame", 400, "Robot frame exceeds the decoded limit.");
  const canonical = (item: unknown): string => {
    if (item === null || typeof item === "boolean" || typeof item === "string" || typeof item === "number") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    const object = item as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  };
  return canonical(value);
}

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_WIRE_BYTES)) throw new RobotIngressError("payload_too_large", 413, "Robot frame exceeds the wire limit.");
  if (!request.body) throw new RobotIngressError("invalid_json", 400, "A JSON body is required.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_WIRE_BYTES) throw new RobotIngressError("payload_too_large", 413, "Robot frame exceeds the wire limit."); chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new RobotIngressError("invalid_json", 400, "Request body must be valid UTF-8 JSON."); }
  if (!record(value) || !exact(value, ["action", "frame"]) || !["ack", "telemetry"].includes(String(value.action))) throw new RobotIngressError("invalid_action", 400, "Unsupported robot ingress action.");
  if (decodedUnits(value) > MAX_DECODED_UNITS) throw new RobotIngressError("invalid_frame", 400, "Robot frame exceeds the decoded limit.");
  return value;
}

function buffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }
function decodeBase64Url(value: string): Uint8Array { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function pemSpki(value: string): Uint8Array { const match = /^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PUBLIC KEY-----\s*$/.exec(value); if (!match) throw new Error("invalid public key"); const binary = atob(match[1].replace(/\s/g, "")); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
export const webCryptoEd25519Verifier: ProtocolSignatureVerifier = { async verify(publicKeyPem, canonicalPayload, signatureB64Url) { const keyBytes = pemSpki(publicKeyPem), signature = decodeBase64Url(signatureB64Url), data = new TextEncoder().encode(canonicalPayload); const key = await crypto.subtle.importKey("spki", buffer(keyBytes), { name: "Ed25519" }, false, ["verify"]); return crypto.subtle.verify("Ed25519", key, buffer(signature), buffer(data)); } };
async function sha256Hex(value: string): Promise<string> { const data = new TextEncoder().encode(value), digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer(data))); return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function requiredUuid(value: unknown, field: string): string { if (typeof value !== "string" || !UUID.test(value)) throw new RobotIngressError("invalid_frame", 400, `Invalid ${field}.`); return value; }
function parseDevice(value: unknown): DeviceContext | null {
  if (value === null) return null; if (!record(value)) throw new Error("invalid device context");
  const device = { version: value.version, device_id: value.device_id, owner_account_id: value.owner_account_id, public_key_pem: value.public_key_pem, public_key_fingerprint: value.public_key_fingerprint, lifecycle: value.lifecycle, authorization_epoch: value.authorization_epoch, active_boot_id: value.active_boot_id, last_telemetry_sequence: value.last_telemetry_sequence };
  if (!safeInteger(device.version, 1) || typeof device.device_id !== "string" || !UUID.test(device.device_id) || typeof device.public_key_pem !== "string" || typeof device.public_key_fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(device.public_key_fingerprint) || typeof device.lifecycle !== "string" || !safeInteger(device.authorization_epoch, 1) || !safeInteger(device.last_telemetry_sequence) || !(device.owner_account_id === null || typeof device.owner_account_id === "string") || !(device.active_boot_id === null || typeof device.active_boot_id === "string")) throw new Error("invalid device context");
  return device as DeviceContext;
}
function parseCommand(value: unknown): CommandContext | null {
  if (value === null) return null; if (!record(value)) throw new Error("invalid command context");
  const command = value;
  for (const field of ["command_id", "device_id", "owner_account_id", "expected_boot_id", "expected_public_key_fingerprint", "idempotency_key", "kind", "capability", "command_class", "safety_contract_id"]) if (typeof command[field] !== "string") throw new Error("invalid command context");
  for (const field of ["version", "authorization_epoch", "expected_device_version", "expires_at_ms", "safety_contract_version"]) if (!safeInteger(command[field], 1)) throw new Error("invalid command context");
  if (!/^[0-9a-f]{64}$/.test(String(command.expected_public_key_fingerprint)) || typeof command.may_actuate !== "boolean" || !(command.ack_status === null || typeof command.ack_status === "string" && ACK_STATUSES.has(command.ack_status))) throw new Error("invalid command context");
  return command as CommandContext;
}
function singleRow(value: unknown): Record<string, unknown> { const row = Array.isArray(value) ? value.length === 1 ? value[0] : null : value; if (!record(row)) throw new Error("invalid RPC contract"); return row; }

export class SupabaseRobotProjectionStore {
  constructor(private readonly db: RobotIngressRpcClient) {}
  async readContext(deviceId: string, commandId: string | null): Promise<Context> { const result = await this.db.rpc("get_robot_ingress_context", { p_device_id: requiredUuid(deviceId, "device_id"), p_command_id: commandId !== null && UUID.test(commandId) ? commandId : null }); if (result.error) throw new Error("robot context unavailable"); const context = singleRow(result.data); if (context.found !== true) return { device: null, command: null }; return { device: parseDevice(context.device), command: parseCommand(context.command) }; }
  async commitAck(device: DeviceContext, command: CommandContext | null, ack: Ack, signature: string, precheckRejection: string | null): Promise<{ stored: boolean; applied: boolean; retryable: boolean; reason: string | null; status: AckStatus | null }> { const result = await this.db.rpc("ingest_verified_robot_ack", { p_device_fence: device, p_command_fence: command, p_ack: ack, p_signature_b64url: signature, p_frame_digest: await sha256Hex(canonicalizeRobotProtocolValue(ack)), p_precheck_rejection: precheckRejection }); if (result.error) throw new Error("robot ACK commit unavailable"); const row = singleRow(result.data); if (typeof row.stored !== "boolean" || typeof row.applied !== "boolean" || typeof row.retryable !== "boolean" || !(row.reason === null || typeof row.reason === "string") || !(row.status === null || typeof row.status === "string" && ACK_STATUSES.has(row.status))) throw new Error("invalid ACK commit contract"); if (precheckRejection !== null && (row.applied !== false || row.reason !== precheckRejection)) throw new Error("ACK commit violated precheck rejection"); return row as { stored: boolean; applied: boolean; retryable: boolean; reason: string | null; status: AckStatus | null }; }
  async commitTelemetry(device: DeviceContext, frame: Telemetry): Promise<{ stored: boolean; applied: boolean; retryable: boolean; reason: string | null }> { const result = await this.db.rpc("ingest_verified_robot_telemetry", { p_device_fence: device, p_frame: frame, p_frame_digest: await sha256Hex(canonicalizeRobotProtocolValue(unsignedTelemetry(frame))) }); if (result.error) throw new Error("robot telemetry commit unavailable"); const row = singleRow(result.data); if (typeof row.stored !== "boolean" || typeof row.applied !== "boolean" || typeof row.retryable !== "boolean" || !(row.reason === null || typeof row.reason === "string")) throw new Error("invalid telemetry commit contract"); return row as { stored: boolean; applied: boolean; retryable: boolean; reason: string | null }; }
}

function assertAckFrame(value: unknown): { ack: Ack; signature: string } {
  if (!record(value) || !exact(value, ["ack", "signature_b64url"]) || typeof value.signature_b64url !== "string" || !B64URL.test(value.signature_b64url) || !record(value.ack)) throw new RobotIngressError("invalid_frame", 400, "Invalid ACK frame.");
  const ack = value.ack; if (!exact(ack, ["protocol_version", "command_id", "device_id", "authorization_epoch", "idempotency_key", "boot_id", "status", "occurred_at_ms", "reason"]) || ack.protocol_version !== 1 || typeof ack.command_id !== "string" || typeof ack.device_id !== "string" || !UUID.test(ack.device_id) || !safeInteger(ack.authorization_epoch, 1) || typeof ack.idempotency_key !== "string" || typeof ack.boot_id !== "string" || typeof ack.status !== "string" || !ACK_STATUSES.has(ack.status) || !safeInteger(ack.occurred_at_ms) || !ID.test(ack.idempotency_key) || !ID.test(ack.boot_id)) throw new RobotIngressError("invalid_frame", 400, "Invalid ACK frame.");
  if (!(ack.reason === null || record(ack.reason) && exact(ack.reason, ["code", "message"]) && typeof ack.reason.code === "string" && ID.test(ack.reason.code) && typeof ack.reason.message === "string" && ack.reason.message.length <= 256) || TERMINAL.has(ack.status) && ack.status !== "succeeded" && ack.reason === null) throw new RobotIngressError("invalid_frame", 400, "Invalid ACK reason.");
  return { ack: ack as Ack, signature: value.signature_b64url };
}
function assertTelemetry(value: unknown): Telemetry {
  if (!record(value) || !exact(value, ["protocol_version", "device_id", "authorization_epoch", "boot_id", "sequence", "captured_at_ms", "kind", "payload", "signature_b64url"]) || value.protocol_version !== 1 || typeof value.device_id !== "string" || !UUID.test(value.device_id) || !safeInteger(value.authorization_epoch, 1) || typeof value.boot_id !== "string" || !ID.test(value.boot_id) || !safeInteger(value.sequence, 1) || !safeInteger(value.captured_at_ms) || value.kind !== "diagnostics.health" || typeof value.signature_b64url !== "string" || !B64URL.test(value.signature_b64url) || !record(value.payload) || !exact(value.payload, ["battery_percent", "sensor_status", "network_status"]) || typeof value.payload.battery_percent !== "number" || value.payload.battery_percent < 0 || value.payload.battery_percent > 100 || !["ok", "degraded"].includes(String(value.payload.sensor_status)) || !["online", "offline"].includes(String(value.payload.network_status))) throw new RobotIngressError("invalid_frame", 400, "Invalid telemetry frame.");
  return value as Telemetry;
}
function unsignedTelemetry(frame: Telemetry): Omit<Telemetry, "signature_b64url"> { const { signature_b64url: _, ...unsigned } = frame; return unsigned; }
function retryable(reason: string): boolean { return ["signature_verifier_unavailable", "projection_conflict", "projection_store_unavailable", "clock_unavailable"].includes(reason); }
function reject(reason: string, override?: boolean): IngressResult { return { accepted: false, reason, retryable: override ?? retryable(reason) }; }
function nextAck(current: AckStatus | null, incoming: AckStatus): AckStatus | null { if (current === null) return incoming === "accepted" || TERMINAL.has(incoming) ? incoming : null; if (TERMINAL.has(current) || current === incoming) return null; if (current === "accepted" && (incoming === "executing" || TERMINAL.has(incoming))) return incoming; if (current === "executing" && TERMINAL.has(incoming)) return incoming; return null; }
function supported(command: CommandContext): boolean { return command.kind === "diagnostics.health_check" && command.capability === "command:diagnostics.health_check" && command.command_class === "non_motion_diagnostic" && command.may_actuate === false && command.safety_contract_id === "stationary-health-check" && command.safety_contract_version === 1; }

async function acceptFrame(frame: unknown, store: SupabaseRobotProjectionStore, verifier: ProtocolSignatureVerifier, now: () => number): Promise<IngressResult> {
  if (record(frame) && Object.prototype.hasOwnProperty.call(frame, "ack")) {
    let signed: { ack: Ack; signature: string }; try { signed = assertAckFrame(frame); canonicalizeRobotProtocolValue(frame); } catch (error) { if (error instanceof RobotIngressError) return reject("invalid_frame"); throw error; }
    let context: Context; try { context = await store.readContext(signed.ack.device_id, signed.ack.command_id); } catch { return reject("projection_store_unavailable"); }
    if (!context.device) return reject("unknown_device");
    let valid: boolean; try { valid = await verifier.verify(context.device.public_key_pem, canonicalizeRobotProtocolValue(signed.ack), signed.signature) === true; } catch { return reject("signature_verifier_unavailable"); }
    if (!valid) return reject("invalid_signature");
    const device = context.device, command = context.command, ack = signed.ack; let proposed: string | null = null;
    let currentTime: number | null = null; try { const value = now(); if (safeInteger(value)) currentTime = value; } catch { /* classified below */ }
    if (device.lifecycle !== "owned" || device.owner_account_id === null || device.active_boot_id === null) proposed = "device_not_owned";
    else if (!command) proposed = "unknown_command";
    else if (!supported(command)) proposed = "unsupported_command_projection";
    else if (command.device_id !== device.device_id || command.owner_account_id !== device.owner_account_id || command.idempotency_key !== ack.idempotency_key || command.expected_device_version !== device.version || command.expected_public_key_fingerprint !== device.public_key_fingerprint) proposed = "device_binding_mismatch";
    else if (ack.authorization_epoch !== device.authorization_epoch || command.authorization_epoch !== device.authorization_epoch) proposed = "authorization_epoch_mismatch";
    else if (ack.boot_id !== device.active_boot_id || command.expected_boot_id !== device.active_boot_id) proposed = "boot_mismatch";
    else if (currentTime === null) proposed = "clock_unavailable";
    else if (ack.occurred_at_ms > currentTime + 5_000) proposed = "clock_skew";
    else if (currentTime - ack.occurred_at_ms > 60_000) proposed = "frame_expired";
    else if (ack.occurred_at_ms > command.expires_at_ms || currentTime > command.expires_at_ms + 5_000) proposed = "command_expired";
    else if (nextAck(command.ack_status, ack.status) === null) proposed = "illegal_ack_transition";
    try { const committed = await store.commitAck(device, command, ack, signed.signature, proposed); if (!committed.stored || !committed.applied) return reject(committed.reason ?? proposed ?? "projection_conflict", committed.retryable || proposed !== null && retryable(proposed)); if (proposed !== null || committed.status === null) return reject("projection_conflict"); return { accepted: true, frame: "ack", status: committed.status }; } catch { return reject("projection_store_unavailable"); }
  }
  let telemetry: Telemetry; try { telemetry = assertTelemetry(frame); canonicalizeRobotProtocolValue(frame); } catch (error) { if (error instanceof RobotIngressError) return reject("invalid_frame"); throw error; }
  let context: Context; try { context = await store.readContext(telemetry.device_id, null); } catch { return reject("projection_store_unavailable"); }
  const device = context.device; if (!device) return reject("unknown_device");
  let valid: boolean; try { valid = await verifier.verify(device.public_key_pem, canonicalizeRobotProtocolValue(unsignedTelemetry(telemetry)), telemetry.signature_b64url) === true; } catch { return reject("signature_verifier_unavailable"); }
  if (!valid) return reject("invalid_signature");
  let currentTime: number | null = null; try { const value = now(); if (safeInteger(value)) currentTime = value; } catch { /* classified below */ }
  if (device.lifecycle !== "owned" || device.owner_account_id === null || device.active_boot_id === null) return reject("device_not_owned");
  if (telemetry.authorization_epoch !== device.authorization_epoch) return reject("authorization_epoch_mismatch");
  if (telemetry.boot_id !== device.active_boot_id) return reject("boot_mismatch");
  if (currentTime === null) return reject("clock_unavailable");
  if (telemetry.captured_at_ms > currentTime + 5_000) return reject("clock_skew");
  if (currentTime - telemetry.captured_at_ms > 60_000) return reject("frame_expired");
  if (telemetry.sequence <= device.last_telemetry_sequence) return reject("sequence_replay");
  try { const committed = await store.commitTelemetry(device, telemetry); if (!committed.stored || !committed.applied) return reject(committed.reason ?? "projection_conflict", committed.retryable); return { accepted: true, frame: "telemetry", sequence: telemetry.sequence }; } catch { return reject("projection_store_unavailable"); }
}

function safeStatus(reason: string, isRetryable: boolean): number { if (reason === "invalid_frame") return 400; if (reason === "unknown_device") return 404; if (reason === "invalid_signature") return 401; return isRetryable ? 503 : 409; }
function json(value: unknown, status: number): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function safeFailure(error: unknown): Response { if (error instanceof RobotIngressError) return json({ error: { code: error.code, message: error.message } }, error.status); return json({ error: { code: "robot_ingress_failed", message: "The robot frame could not be processed." } }, 500); }
export type RobotIngressHandlerDependencies = { readEnvironment: EnvironmentReader; createStore(): SupabaseRobotProjectionStore; verifier?: ProtocolSignatureVerifier; now?: () => number };
export function createRobotIngressHandler(dependencies: RobotIngressHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "apikey, content-type", "access-control-max-age": "600" } });
    if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Only POST is supported." } }, 405);
    try {
      if (!authorizeRobotIngress(request, dependencies.readEnvironment)) return json({ error: { code: "unauthorized_ingress", message: "Robot ingress authentication failed." } }, 401);
      const body = await readBoundedJson(request), frame = body.frame;
      if (!record(frame) || ((body.action === "ack") !== Object.prototype.hasOwnProperty.call(frame, "ack"))) throw new RobotIngressError("invalid_action", 400, "Robot frame does not match the requested action.");
      const result = await acceptFrame(frame, dependencies.createStore(), dependencies.verifier ?? webCryptoEd25519Verifier, dependencies.now ?? Date.now);
      if (!result.accepted) return json(result, safeStatus(result.reason, result.retryable)); return json(result, 200);
    } catch (error) { return safeFailure(error); }
  };
}
