import {
  canonicalizeRobotProtocolValue,
  webCryptoEd25519Verifier,
} from "../_shared/robotIngress.ts";
import {
  createRobotDeviceEnrollmentHandler,
  type EnrollmentRpcClient,
} from "../_shared/robotDeviceEnrollment.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = 1_800_000_000_000;
const USER_ID = "e1000000-0000-4000-8000-000000000001";
const SESSION_ID = "e1000000-0000-4000-8000-000000000012";
const TERMINAL_ID = "e1000000-0000-4000-8000-000000000011";
const DEVICE_ID = "e1000000-0000-4000-8000-000000000021";
const ENROLLMENT_ID = "e1000000-0000-4000-8000-000000000031";
const CHALLENGE_ID = "e1000000-0000-4000-8000-000000000032";
const NONCE = "A".repeat(43);
const FINGERPRINT = "a".repeat(64);

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function identity() {
  const keys = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const encoded = b64(spki).match(/.{1,64}/g)?.join("\n") ?? "";
  return {
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----`,
    async sign(value: unknown) {
      const payload = new TextEncoder().encode(canonicalizeRobotProtocolValue(value));
      return b64url(new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, payload)));
    },
  };
}

type Call = { name: string; args: Record<string, unknown> };
type Resolver = (
  name: string,
  args: Record<string, unknown>,
) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;

function rpcClient(resolver: Resolver, calls: Call[]): EnrollmentRpcClient {
  return {
    rpc: (name, args = {}) => {
      calls.push({ name, args });
      return Promise.resolve(resolver(name, args));
    },
  };
}

function challenge() {
  return {
    enrollment_id: ENROLLMENT_ID,
    challenge_id: CHALLENGE_ID,
    nonce_b64url: NONCE,
    device_id: DEVICE_ID,
    owner_account_id: USER_ID,
    terminal_id: TERMINAL_ID,
    auth_session_id: SESSION_ID,
    authority_version: 4,
    authorization_epoch: 7,
    factory_reset_counter: 3,
    device_event_sequence: 0,
    phase: "challenge_issued",
    version: 1,
    issued_at_ms: NOW - 1_000,
    expires_at_ms: NOW + 60_000,
    reused: false,
  };
}

function context(publicKeyPem: string, phase = "challenge_issued", version = 1) {
  return {
    found: true,
    session: {
      ...challenge(),
      phase,
      version,
      device_event_sequence: phase === "identity_verified" ? 1 : 0,
    },
    manufacturing_identity: {
      public_key_pem: publicKeyPem,
      public_key_fingerprint: FINGERPRINT,
      status: "active",
    },
  };
}

function proof() {
  return {
    protocol_version: 1,
    kind: "device.enrollment.identity_proof",
    enrollment_id: ENROLLMENT_ID,
    challenge_id: CHALLENGE_ID,
    nonce_b64url: NONCE,
    device_id: DEVICE_ID,
    owner_account_id: USER_ID,
    terminal_id: TERMINAL_ID,
    auth_session_id: SESSION_ID,
    authorization_epoch: 7,
    factory_reset_counter: 3,
    device_event_sequence: 1,
    proved_at_ms: NOW,
  };
}

function confirmation(publicKeyPem: string) {
  return {
    protocol_version: 1,
    kind: "device.enrollment.online_confirmation",
    enrollment_id: ENROLLMENT_ID,
    challenge_id: CHALLENGE_ID,
    nonce_b64url: NONCE,
    device_id: DEVICE_ID,
    owner_account_id: USER_ID,
    terminal_id: TERMINAL_ID,
    auth_session_id: SESSION_ID,
    authorization_epoch: 7,
    factory_reset_counter: 3,
    device_event_sequence: 2,
    operational_public_key_pem: publicKeyPem,
    operational_public_key_fingerprint: FINGERPRINT,
    active_boot_id: "boot-enrollment-001",
    network_status: "online",
    confirmed_at_ms: NOW,
  };
}

function request(action: string, body: Record<string, unknown>): Request {
  return new Request("https://example.test/functions/v1/device-enrollment", {
    method: "POST",
    headers: { authorization: "Bearer verified", "content-type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
}

function handler(db: EnrollmentRpcClient) {
  return createRobotDeviceEnrollmentHandler({
    authenticate: () => Promise.resolve({ userId: USER_ID, sessionId: SESSION_ID, db }),
    verifier: webCryptoEd25519Verifier,
    now: () => NOW,
  });
}

Deno.test("begin creates one owner-and-session-fenced enrollment challenge", async () => {
  const calls: Call[] = [];
  const db = rpcClient(() => ({ data: challenge(), error: null }), calls);
  const response = await handler(db)(request("begin", { deviceId: DEVICE_ID }));
  const body = await response.json() as Record<string, unknown>;
  assert(response.status === 200, "begin failed");
  assert(calls.length === 1 && calls[0].name === "begin_robot_device_enrollment", "begin crossed an unexpected RPC boundary");
  assert(calls[0].args.p_user_id === USER_ID && calls[0].args.p_auth_session_id === SESSION_ID, "verified caller fence was omitted");
  assert((body.enrollment as Record<string, unknown>).nonce_b64url === NONCE, "challenge was not returned");
  assert(!JSON.stringify(body).includes("public_key_pem"), "manufacturing public key leaked to the app response");
});

Deno.test("valid manufacturing proof commits only after Ed25519 verification", async () => {
  const signer = await identity();
  const calls: Call[] = [];
  const db = rpcClient((name) => name === "get_robot_device_enrollment_context"
    ? { data: context(signer.publicKeyPem), error: null }
    : { data: { enrollment_id: ENROLLMENT_ID, phase: "identity_verified", version: 2 }, error: null }, calls);
  const signedProof = proof();
  const response = await handler(db)(request("attest", {
    enrollmentId: ENROLLMENT_ID,
    proof: signedProof,
    signatureB64url: await signer.sign(signedProof),
  }));
  assert(response.status === 200, "valid manufacturing proof was rejected");
  assert(calls.map((call) => call.name).join(",") === "get_robot_device_enrollment_context,confirm_robot_device_identity", "proof used more than context + atomic commit RPCs");
  assert(calls[1].args.p_expected_version === 1 && /^[0-9a-f]{64}$/.test(String(calls[1].args.p_proof_digest)), "proof fence or digest was omitted");
  assert(calls[1].args.p_device_event_sequence === 1, "identity proof event sequence was omitted");
});

Deno.test("signed higher factory-reset counter invalidates old runtime authority before retry", async () => {
  const signer = await identity();
  const calls: Call[] = [];
  const db = rpcClient((name) => name === "get_robot_device_enrollment_context"
    ? { data: context(signer.publicKeyPem), error: null }
    : { data: { enrollment_id: ENROLLMENT_ID, phase: "invalidated", reason: "factory_reset_counter_advanced", retry_required: true, factory_reset_counter: 4 }, error: null }, calls);
  const resetProof = { ...proof(), factory_reset_counter: 4 };
  const response = await handler(db)(request("attest", {
    enrollmentId: ENROLLMENT_ID,
    proof: resetProof,
    signatureB64url: await signer.sign(resetProof),
  }));
  const body = await response.json() as { enrollment?: { retry_required?: boolean } };
  assert(response.status === 200 && body.enrollment?.retry_required === true, "signed reset counter did not request a fresh challenge");
  assert(calls.map((call) => call.name).join(",") === "get_robot_device_enrollment_context,advance_robot_factory_reset_counter", "reset proof crossed the wrong atomic RPC boundary");
  assert(calls[1].args.p_next_factory_reset_counter === 4 && calls[1].args.p_device_event_sequence === 1, "reset counter or event sequence was omitted");
});

Deno.test("factory-reset counter accepts only safe JSON integers", async () => {
  const signer = await identity();
  for (const invalidCounter of ["4", true, null, Number.MAX_SAFE_INTEGER + 1]) {
    const calls: Call[] = [];
    const db = rpcClient(() => ({ data: context(signer.publicKeyPem), error: null }), calls);
    const invalidProof = { ...proof(), factory_reset_counter: invalidCounter };
    const response = await handler(db)(request("attest", {
      enrollmentId: ENROLLMENT_ID,
      proof: invalidProof,
      signatureB64url: await signer.sign(invalidProof),
    }));
    assert(response.status === 409 && calls.length === 1, `invalid reset counter ${String(invalidCounter)} reached commit`);
  }
});

Deno.test("forged or cross-session identity proofs never reach commit", async () => {
  const signer = await identity();
  const attacker = await identity();
  for (const candidate of [
    { proof: proof(), signatureB64url: await attacker.sign(proof()) },
    { proof: { ...proof(), auth_session_id: "e1000000-0000-4000-8000-000000000099" }, signatureB64url: await signer.sign({ ...proof(), auth_session_id: "e1000000-0000-4000-8000-000000000099" }) },
  ]) {
    const calls: Call[] = [];
    const db = rpcClient(() => ({ data: context(signer.publicKeyPem), error: null }), calls);
    const response = await handler(db)(request("attest", { enrollmentId: ENROLLMENT_ID, ...candidate }));
    assert([400, 401, 409].includes(response.status) && calls.length === 1, "untrusted identity proof reached commit");
  }
});

Deno.test("online confirmation atomically installs the device operational key", async () => {
  const manufacturing = await identity();
  const operational = await identity();
  const calls: Call[] = [];
  const db = rpcClient((name) => name === "get_robot_device_enrollment_context"
    ? { data: context(manufacturing.publicKeyPem, "identity_verified", 2), error: null }
    : { data: { enrollment_id: ENROLLMENT_ID, phase: "completed", version: 3, authority_version: 5, authorization_epoch: 8 }, error: null }, calls);
  const signedConfirmation = confirmation(operational.publicKeyPem);
  const response = await handler(db)(request("complete", {
    enrollmentId: ENROLLMENT_ID,
    confirmation: signedConfirmation,
    signatureB64url: await manufacturing.sign(signedConfirmation),
  }));
  assert(response.status === 200, "valid online confirmation was rejected");
  assert(calls.map((call) => call.name).join(",") === "get_robot_device_enrollment_context,complete_robot_device_enrollment", "completion used more than context + atomic commit RPCs");
  assert(calls[1].args.p_operational_public_key_pem === operational.publicKeyPem, "signed operational key was not committed");
  assert(calls[1].args.p_active_boot_id === "boot-enrollment-001" && calls[1].args.p_confirmed_at_ms === NOW, "online device confirmation was incomplete");
  assert(calls[1].args.p_device_event_sequence === 2, "online confirmation event sequence was omitted");
});

Deno.test("expired, replayed and unavailable enrollment contexts fail closed", async () => {
  const signer = await identity();
  for (const data of [
    { ...context(signer.publicKeyPem), session: { ...challenge(), expires_at_ms: NOW - 1 } },
    context(signer.publicKeyPem, "completed", 3),
    { found: false, session: null, manufacturing_identity: null },
  ]) {
    const calls: Call[] = [];
    const db = rpcClient(() => ({ data, error: null }), calls);
    const signedProof = proof();
    const response = await handler(db)(request("attest", { enrollmentId: ENROLLMENT_ID, proof: signedProof, signatureB64url: await signer.sign(signedProof) }));
    assert(response.status === 409 && calls.length === 1, "invalid context reached commit");
  }

  const calls: Call[] = [];
  const unavailable = rpcClient(() => ({ data: null, error: new Error("postgres password PRIVATE KEY raw-row") }), calls);
  const response = await handler(unavailable)(request("begin", { deviceId: DEVICE_ID }));
  const text = await response.text();
  assert(response.status === 503 && !/password|PRIVATE KEY|raw-row/i.test(text), "database outage leaked details or was not retryable");
});

Deno.test("signed proof time and Ed25519 signature shape are bounded", async () => {
  const signer = await identity();
  const calls: Call[] = [];
  const db = rpcClient(() => ({ data: context(signer.publicKeyPem), error: null }), calls);
  const staleProof = { ...proof(), proved_at_ms: NOW - 120_000 };
  const stale = await handler(db)(request("attest", {
    enrollmentId: ENROLLMENT_ID,
    proof: staleProof,
    signatureB64url: await signer.sign(staleProof),
  }));
  assert(stale.status === 409 && calls.length === 1, "proof timestamp outside the challenge reached commit");

  calls.length = 0;
  const malformed = await handler(db)(request("attest", {
    enrollmentId: ENROLLMENT_ID,
    proof: proof(),
    signatureB64url: "A".repeat(20),
  }));
  assert(malformed.status === 400 && calls.length === 0, "malformed Ed25519 signature reached authentication or DB");
});

Deno.test("known enrollment readiness rejection is a stable app conflict", async () => {
  const calls: Call[] = [];
  const db = rpcClient(() => ({ data: null, error: { message: "active robot manufacturing identity is required" } }), calls);
  const response = await handler(db)(request("begin", { deviceId: DEVICE_ID }));
  const body = await response.json() as { error?: { code?: string } };
  assert(response.status === 409 && body.error?.code === "robot_not_ready", "known readiness rejection looked like an outage");
});

Deno.test("method, action and decoded payload shape are bounded before database mutation", async () => {
  const calls: Call[] = [];
  const db = rpcClient(() => { throw new Error("DB must not be reached"); }, calls);
  assert((await handler(db)(new Request("https://example.test", { method: "GET" }))).status === 405, "GET was allowed");
  assert((await handler(db)(new Request("https://example.test/functions/v1/device-enrollment", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ action: "begin", deviceId: DEVICE_ID }),
  }))).status === 415, "non-JSON content type was allowed");
  assert((await handler(db)(request("unknown", {}))).status === 404, "unknown action was allowed");
  assert((await handler(db)(request("begin", { deviceId: "not-a-uuid" }))).status === 400, "invalid device identity reached DB");
  assert(calls.length === 0, "invalid request reached DB");
});
