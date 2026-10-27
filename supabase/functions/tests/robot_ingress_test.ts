import {
  authorizeRobotIngress,
  canonicalizeRobotProtocolValue,
  createRobotIngressHandler,
  SupabaseRobotProjectionStore,
  type RobotIngressRpcClient,
} from "../_shared/robotIngress.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const NOW = 1_800_000_000_000;
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const SECRET = "sb_secret_robot_ingress_test";
const FINGERPRINT = "a".repeat(64);

function b64(bytes: Uint8Array): string { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function b64url(bytes: Uint8Array): string { return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function identity() {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const encoded = b64(spki).match(/.{1,64}/g)?.join("\n") ?? "";
  return {
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----`,
    async sign(value: unknown) { return b64url(new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(canonicalizeRobotProtocolValue(value))))); },
  };
}

type Resolver = (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;
function rpcClient(resolver: Resolver, calls: Array<{ name: string; args: Record<string, unknown> }>): RobotIngressRpcClient {
  return { rpc: async (name: string, args: Record<string, unknown> = {}) => { calls.push({ name, args }); return resolver(name, args); } };
}
function environment(name: string): string | undefined {
  if (name === "SUPABASE_SECRET_KEYS") return JSON.stringify({ "robot-ingress": SECRET, automations: "sb_secret_email_other" });
  return undefined;
}
function request(action: "ack" | "telemetry", frame: unknown, key = SECRET): Request {
  return new Request("https://example.test/functions/v1/robot-ingress", { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ action, frame }) });
}
function context(publicKeyPem: string, command: Record<string, unknown> | null = commandContext()) {
  return { found: true, device: { version: 7, device_id: DEVICE_ID, owner_account_id: ACCOUNT_ID, public_key_pem: publicKeyPem, public_key_fingerprint: FINGERPRINT, lifecycle: "owned", authorization_epoch: 3, active_boot_id: "boot-alpha", last_telemetry_sequence: 0 }, command };
}
function commandContext(): Record<string, unknown> {
  return { version: 4, command_id: COMMAND_ID, device_id: DEVICE_ID, owner_account_id: ACCOUNT_ID, authorization_epoch: 3, expected_boot_id: "boot-alpha", expected_device_version: 7, expected_public_key_fingerprint: FINGERPRINT, idempotency_key: "idem-alpha", expires_at_ms: NOW + 10_000, kind: "diagnostics.health_check", capability: "command:diagnostics.health_check", command_class: "non_motion_diagnostic", may_actuate: false, safety_contract_id: "stationary-health-check", safety_contract_version: 1, ack_status: null };
}
async function ackFrame(signer: Awaited<ReturnType<typeof identity>>, status = "accepted", overrides: Record<string, unknown> = {}) {
  const ack = { protocol_version: 1, command_id: COMMAND_ID, device_id: DEVICE_ID, authorization_epoch: 3, idempotency_key: "idem-alpha", boot_id: "boot-alpha", status, occurred_at_ms: NOW, reason: ["failed", "rejected", "expired", "cancelled"].includes(status) ? { code: "device_error", message: "Rejected." } : null, ...overrides };
  return { ack, signature_b64url: await signer.sign(ack) };
}
async function telemetryFrame(signer: Awaited<ReturnType<typeof identity>>) {
  const unsigned = { protocol_version: 1, device_id: DEVICE_ID, authorization_epoch: 3, boot_id: "boot-alpha", sequence: 1, captured_at_ms: NOW, kind: "diagnostics.health", payload: { battery_percent: 80, sensor_status: "ok", network_status: "online" } };
  return { ...unsigned, signature_b64url: await signer.sign(unsigned) };
}
function handler(db: RobotIngressRpcClient, options: { createStore?: () => SupabaseRobotProjectionStore } = {}) {
  return createRobotIngressHandler({ readEnvironment: environment, createStore: options.createStore ?? (() => new SupabaseRobotProjectionStore(db)), now: () => NOW });
}

Deno.test("robot ingress requires its independent named apikey", () => {
  assert(authorizeRobotIngress(new Request("https://example.test", { headers: { apikey: SECRET } }), environment), "robot named secret rejected");
  assert(!authorizeRobotIngress(new Request("https://example.test", { headers: { apikey: "sb_secret_email_other" } }), environment), "email secret was reused");
});

Deno.test("missing or wrong named key rejects before body consumption and DB construction", async () => {
  for (const key of [undefined, "wrong"]) {
    let stores = 0;
    const headers = key ? { apikey: key } : undefined;
    class TrackedRequest extends Request {
      bodyReads = 0;
      override get body() { this.bodyReads += 1; return super.body; }
    }
    const inbound = new TrackedRequest("https://example.test", { method: "POST", headers, body: "{}" });
    const response = await createRobotIngressHandler({ readEnvironment: environment, createStore: () => { stores += 1; throw new Error("must not construct"); } })(inbound);
    assert(response.status === 401 && inbound.bodyReads === 0 && stores === 0, "unauthorized request crossed the authentication boundary");
  }
});

Deno.test("canonical Ed25519 ACK commits through the single authenticated RPC", async () => {
  const signer = await identity(), calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = rpcClient((name) => name === "get_robot_ingress_context" ? { data: context(signer.publicKeyPem), error: null } : { data: { stored: true, applied: true, retryable: false, reason: null, status: "accepted", device_version: 7, command_version: 5, event_id: "event" }, error: null }, calls);
  const response = await handler(db)(request("ack", await ackFrame(signer)));
  assert(response.status === 200, "valid ACK was rejected");
  assert(calls.map((call) => call.name).join(",") === "get_robot_ingress_context,ingest_verified_robot_ack", "ACK used more than context + atomic commit RPCs");
  const args = calls[1].args; assert(typeof args.p_frame_digest === "string" && /^[0-9a-f]{64}$/.test(args.p_frame_digest) && typeof args.p_signature_b64url === "string", "canonical hex digest/signature omitted");
  assert(args.p_precheck_rejection === null, "valid ACK carried a rejection");
});

Deno.test("canonical Ed25519 telemetry waits for durable commit", async () => {
  const signer = await identity(), calls: Array<{ name: string; args: Record<string, unknown> }> = []; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const db = rpcClient(async (name) => {
    if (name === "get_robot_ingress_context") return { data: context(signer.publicKeyPem, null), error: null };
    await gate; return { data: { stored: true, applied: true, retryable: false, reason: null, sequence: 1, device_version: 8 }, error: null };
  }, calls);
  let settled = false; const pending = handler(db)(request("telemetry", await telemetryFrame(signer))).then((value) => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve(); assert(!settled, "telemetry responded before durable commit"); release();
  assert((await pending).status === 200 && calls[1].name === "ingest_verified_robot_telemetry", "telemetry durable RPC failed");
  assert(typeof calls[1].args.p_frame_digest === "string" && /^[0-9a-f]{64}$/.test(calls[1].args.p_frame_digest), "telemetry digest is not lowercase SHA-256 hex");
});

Deno.test("forged and unknown-device frames never reach commit", async () => {
  const signer = await identity(), attacker = await identity();
  for (const [ctx, frame] of [[context(signer.publicKeyPem), await ackFrame(attacker)], [{ found: false, device: null, command: null }, await ackFrame(signer)]] as const) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db = rpcClient(() => ({ data: ctx, error: null }), calls); const response = await handler(db)(request("ack", frame));
    assert([401, 404].includes(response.status) && calls.length === 1, "untrusted frame reached commit");
  }
});

Deno.test("unknown, duplicate, illegal and late authenticated ACKs are still appended", async () => {
  const signer = await identity();
  for (const [reason, command] of [["unknown_command", null], ["illegal_ack_transition", { ...commandContext(), ack_status: "accepted" }], ["illegal_ack_transition", commandContext()], ["frame_expired", commandContext()]] as const) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db = rpcClient((name) => name === "get_robot_ingress_context" ? { data: context(signer.publicKeyPem, command), error: null } : { data: { stored: true, applied: false, retryable: false, reason, status: command?.ack_status ?? null, event_id: "event" }, error: null }, calls);
    const status = reason === "illegal_ack_transition" ? "executing" : "accepted"; const response = await handler(db)(request("ack", await ackFrame(signer, status)));
    assert(response.status === 409 && calls.some((call) => call.name === "ingest_verified_robot_ack"), `${reason} was not appended`);
  }
});

Deno.test("non-UUID command ACK authenticates by UUID device then appends as unknown", async () => {
  const signer = await identity(), calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = rpcClient((name) => name === "get_robot_ingress_context"
    ? { data: context(signer.publicKeyPem, null), error: null }
    : { data: { stored: true, applied: false, retryable: false, reason: "unknown_command", status: null, event_id: "event" }, error: null }, calls);
  const response = await handler(db)(request("ack", await ackFrame(signer, "accepted", { command_id: "unknown-command" })));
  assert(response.status === 409, "unknown non-UUID command was not classified as unknown_command");
  assert(calls[0].args.p_device_id === DEVICE_ID && calls[0].args.p_command_id === null, "device context was not fetched independently of command UUID validity");
  assert(calls[1].args.p_command_fence === null && calls[1].args.p_precheck_rejection === "unknown_command", "unknown authenticated ACK was not appended with a forced rejection");
});

Deno.test("database cannot override a non-null Edge precheck rejection", async () => {
  const signer = await identity(), calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = rpcClient((name) => name === "get_robot_ingress_context"
    ? { data: context(signer.publicKeyPem, null), error: null }
    : { data: { stored: true, applied: true, retryable: false, reason: null, status: "accepted", event_id: "event" }, error: null }, calls);
  const response = await handler(db)(request("ack", await ackFrame(signer)));
  const body = await response.json() as Record<string, unknown>;
  assert(response.status === 503 && body.accepted === false && body.reason === "projection_store_unavailable", "DB applied=true overrode an Edge rejection");
  assert(calls[1].args.p_precheck_rejection === "unknown_command", "forced rejection was not sent to the six-parameter RPC");
});

Deno.test("wire and decoded resource limits fail closed", async () => {
  const noDb: RobotIngressRpcClient = { rpc: () => { throw new Error("DB must not be reached"); } };
  const oversized = new Request("https://example.test", { method: "POST", headers: { apikey: SECRET, "content-length": "65537" }, body: "{}" });
  assert((await handler(noDb)(oversized)).status === 413, "declared wire limit was ignored");
  const decodedHeavy = request("ack", { ack: {}, signature_b64url: "A".repeat(16), padding: "值".repeat(17_000) });
  const response = await handler(noDb)(decodedHeavy); assert(response.status === 400, "decoded resource limit was ignored");
});

Deno.test("device identity must be UUID before any database access", async () => {
  const signer = await identity(), calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = rpcClient(() => { throw new Error("DB must not be reached"); }, calls);
  const response = await handler(db)(request("ack", await ackFrame(signer, "accepted", { device_id: "device-alpha" })));
  assert(response.status === 400 && calls.length === 0, "non-UUID device was not rejected as invalid_frame");
});

Deno.test("context and commit outages are retryable without raw detail leakage", async () => {
  const signer = await identity();
  for (const phase of ["context", "commit"] as const) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db = rpcClient((name) => phase === "context" || name === "ingest_verified_robot_ack" ? { data: null, error: new Error("postgres password PEM PRIVATE signature raw-row") } : { data: context(signer.publicKeyPem), error: null }, calls);
    const response = await handler(db)(request("ack", await ackFrame(signer))); const text = await response.text();
    assert(response.status === 503 && !/password|PRIVATE|signature|raw-row|BEGIN PUBLIC KEY/i.test(text), "database detail leaked or outage was not retryable");
  }
});

Deno.test("CORS is service-only and action/method mismatches are rejected", async () => {
  const noDb: RobotIngressRpcClient = { rpc: () => { throw new Error("DB must not be reached"); } }; const ingress = handler(noDb);
  const options = await ingress(new Request("https://example.test", { method: "OPTIONS", headers: { origin: "https://attacker.test" } }));
  assert(options.status === 204 && !options.headers.has("access-control-allow-origin"), "browser origin was enabled");
  assert((await ingress(new Request("https://example.test", { method: "GET" }))).status === 405, "GET was allowed");
  const mismatch = await ingress(request("telemetry", { ack: {} })); assert(mismatch.status === 400, "action/frame mismatch reached DB");
});

Deno.test("production robot ingress contains no broker, transport or publish path", async () => {
  const sources = await Promise.all([Deno.readTextFile(new URL("../robot-ingress/index.ts", import.meta.url)), Deno.readTextFile(new URL("../_shared/robotIngress.ts", import.meta.url))]);
  assert(!/mqtt|gatt|broker|\.publish\(/i.test(sources.join("\n")), "production ingress imported a transport or publish path");
  const config = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));
  assert(/\[functions\.robot-ingress\]\s*verify_jwt\s*=\s*false/.test(config), "robot ingress custom-auth deployment mode is missing");
  const frame = await telemetryFrame(await identity()); const { signature_b64url: _, ...unsigned } = frame;
  assert(canonicalizeRobotProtocolValue(unsigned).includes('"sequence":1'), "telemetry canonical vector drifted");
});
