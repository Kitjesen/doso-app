import {
  canonicalizeRobotProtocolValue,
  type ProtocolSignatureVerifier,
} from "./robotIngress.ts";
import {
  handle,
  HttpError,
  json,
  readJson,
} from "./http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]{16,1024}$/;
const ED25519_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const BOOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

type RpcResult = { data: unknown; error: unknown };

export type EnrollmentRpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
};

type AuthenticatedEnrollmentCaller = {
  userId: string;
  sessionId: string;
  db: EnrollmentRpcClient;
};

type EnrollmentSession = {
  enrollment_id: string;
  challenge_id: string;
  nonce_b64url: string;
  device_id: string;
  owner_account_id: string;
  terminal_id: string;
  auth_session_id: string;
  authority_version: number;
  authorization_epoch: number;
  factory_reset_counter: number;
  device_event_sequence: number;
  phase: string;
  version: number;
  issued_at_ms: number;
  expires_at_ms: number;
};

type EnrollmentContext = {
  session: EnrollmentSession;
  manufacturingPublicKeyPem: string;
};

export type RobotDeviceEnrollmentDependencies = {
  authenticate(
    request: Request,
  ): Promise<AuthenticatedEnrollmentCaller>;
  verifier: ProtocolSignatureVerifier;
  now?: () => number;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new HttpError(400, "invalid_request", `${field} must be a UUID.`);
  }
  return value;
}

function singleRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  if (!record(row)) throw new Error("invalid RPC contract");
  return row;
}

function requiredString(
  value: unknown,
  field: string,
  pattern: RegExp,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.length > maxLength || !pattern.test(value)) {
    throw new HttpError(400, "invalid_request", `${field} is invalid.`);
  }
  return value;
}

function parseSession(value: unknown): EnrollmentSession {
  if (!record(value)) throw new Error("invalid enrollment session");
  for (const field of [
    "enrollment_id",
    "challenge_id",
    "device_id",
    "owner_account_id",
    "terminal_id",
    "auth_session_id",
  ]) {
    if (typeof value[field] !== "string" || !UUID.test(value[field])) {
      throw new Error("invalid enrollment session");
    }
  }
  if (typeof value.nonce_b64url !== "string" || !B64URL.test(value.nonce_b64url)) {
    throw new Error("invalid enrollment session");
  }
  for (const field of [
    "authority_version",
    "authorization_epoch",
    "version",
    "issued_at_ms",
    "expires_at_ms",
  ]) {
    if (!safeInteger(value[field], 1)) throw new Error("invalid enrollment session");
  }
  if (!safeInteger(value.factory_reset_counter)) {
    throw new Error("invalid enrollment session");
  }
  if (!safeInteger(value.device_event_sequence)) {
    throw new Error("invalid enrollment session");
  }
  if (typeof value.phase !== "string") throw new Error("invalid enrollment session");
  return value as EnrollmentSession;
}

function parseContext(value: unknown): EnrollmentContext | null {
  const row = singleRow(value);
  if (row.found !== true) return null;
  const identity = row.manufacturing_identity;
  if (!record(identity) || identity.status !== "active" ||
    typeof identity.public_key_pem !== "string" ||
    identity.public_key_pem.length < 64 || identity.public_key_pem.length > 8192 ||
    typeof identity.public_key_fingerprint !== "string" ||
    !FINGERPRINT.test(identity.public_key_fingerprint)) {
    throw new Error("invalid enrollment context");
  }
  return {
    session: parseSession(row.session),
    manufacturingPublicKeyPem: identity.public_key_pem,
  };
}

async function rpc(
  db: EnrollmentRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) {
    const message = record(result.error) && typeof result.error.message === "string"
      ? result.error.message.toLowerCase()
      : "";
    if (
      message.includes("manufacturing identity is required") ||
      message.includes("owned physical robot is required") ||
      message.includes("physical robot device is required")
    ) {
      throw new HttpError(
        409,
        "robot_not_ready",
        "This robot is not ready for trusted enrollment.",
      );
    }
    if (
      message.includes("enrollment context changed") ||
      message.includes("enrollment challenge expired") ||
      message.includes("enrollment authority changed") ||
      message.includes("factory reset context changed") ||
      message.includes("timestamp is outside the challenge lifetime")
    ) {
      throw new HttpError(
        409,
        "enrollment_context_changed",
        "The robot enrollment challenge is no longer active.",
      );
    }
    throw new HttpError(
      503,
      "enrollment_service_unavailable",
      "Robot enrollment is temporarily unavailable.",
    );
  }
  return result.data;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertLiveContext(
  context: EnrollmentContext | null,
  caller: AuthenticatedEnrollmentCaller,
  enrollmentId: string,
  expectedPhase: string,
  now: number,
): EnrollmentContext {
  if (!context || context.session.enrollment_id !== enrollmentId ||
    context.session.owner_account_id !== caller.userId ||
    context.session.auth_session_id !== caller.sessionId ||
    context.session.phase !== expectedPhase ||
    context.session.expires_at_ms <= now) {
    throw new HttpError(
      409,
      "enrollment_context_changed",
      "The robot enrollment challenge is no longer active.",
    );
  }
  return context;
}

function assertProofFence(
  value: unknown,
  context: EnrollmentContext,
  kind: string,
  timestampField: string,
  expectedKeys: readonly string[],
  allowFactoryResetAdvance = false,
): Record<string, unknown> {
  const resetCounter = record(value) ? value.factory_reset_counter : undefined;
  if (!record(value) || !exact(value, expectedKeys) ||
    value.protocol_version !== 1 || value.kind !== kind ||
    value.enrollment_id !== context.session.enrollment_id ||
    value.challenge_id !== context.session.challenge_id ||
    value.nonce_b64url !== context.session.nonce_b64url ||
    value.device_id !== context.session.device_id ||
    value.owner_account_id !== context.session.owner_account_id ||
    value.terminal_id !== context.session.terminal_id ||
    value.auth_session_id !== context.session.auth_session_id ||
    value.authorization_epoch !== context.session.authorization_epoch ||
    !safeInteger(resetCounter) ||
    (!allowFactoryResetAdvance && resetCounter !== context.session.factory_reset_counter) ||
    (allowFactoryResetAdvance && resetCounter < context.session.factory_reset_counter) ||
    !safeInteger(value.device_event_sequence) ||
    value.device_event_sequence !== context.session.device_event_sequence + 1 ||
    !safeInteger(value[timestampField], 1) ||
    Number(value[timestampField]) < context.session.issued_at_ms ||
    Number(value[timestampField]) > context.session.expires_at_ms) {
    throw new HttpError(
      409,
      "enrollment_proof_mismatch",
      "The signed robot enrollment proof does not match the active challenge.",
    );
  }
  return value;
}

async function verify(
  verifier: ProtocolSignatureVerifier,
  publicKeyPem: string,
  payload: Record<string, unknown>,
  signature: string,
): Promise<string> {
  const canonical = canonicalizeRobotProtocolValue(payload);
  let valid: boolean;
  try {
    valid = await verifier.verify(publicKeyPem, canonical, signature) === true;
  } catch {
    throw new HttpError(
      401,
      "invalid_device_signature",
      "Robot identity verification failed.",
    );
  }
  if (!valid) {
    throw new HttpError(401, "invalid_device_signature", "Robot identity verification failed.");
  }
  return sha256Hex(canonical);
}

const PROOF_KEYS = [
  "protocol_version",
  "kind",
  "enrollment_id",
  "challenge_id",
  "nonce_b64url",
  "device_id",
  "owner_account_id",
  "terminal_id",
  "auth_session_id",
  "authorization_epoch",
  "factory_reset_counter",
  "device_event_sequence",
  "proved_at_ms",
] as const;

const CONFIRMATION_KEYS = [
  "protocol_version",
  "kind",
  "enrollment_id",
  "challenge_id",
  "nonce_b64url",
  "device_id",
  "owner_account_id",
  "terminal_id",
  "auth_session_id",
  "authorization_epoch",
  "factory_reset_counter",
  "device_event_sequence",
  "operational_public_key_pem",
  "operational_public_key_fingerprint",
  "active_boot_id",
  "network_status",
  "confirmed_at_ms",
] as const;

export function createRobotDeviceEnrollmentHandler(
  dependencies: RobotDeviceEnrollmentDependencies,
) {
  return (request: Request): Promise<Response> => handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      throw new HttpError(415, "unsupported_media_type", "Use application/json.");
    }

    const body = await readJson(request);
    const action = body.action;
    if (typeof action !== "string") {
      throw new HttpError(400, "invalid_request", "action is required.");
    }
    if (!new Set(["begin", "attest", "complete"]).has(action)) {
      throw new HttpError(404, "unknown_action", "Unknown enrollment action.");
    }

    if (action === "begin") {
      if (!exact(body, ["action", "deviceId"])) {
        throw new HttpError(400, "invalid_request", "Invalid enrollment request.");
      }
      const deviceId = uuid(body.deviceId, "deviceId");
      const caller = await dependencies.authenticate(request);
      const data = await rpc(caller.db, "begin_robot_device_enrollment", {
        p_user_id: caller.userId,
        p_auth_session_id: caller.sessionId,
        p_device_id: deviceId,
      });
      return json({ enrollment: parseSession(singleRow(data)) });
    }

    const expectedBodyKeys = action === "attest"
      ? ["action", "enrollmentId", "proof", "signatureB64url"]
      : ["action", "enrollmentId", "confirmation", "signatureB64url"];
    if (!exact(body, expectedBodyKeys)) {
      throw new HttpError(400, "invalid_request", "Invalid enrollment request.");
    }
    const enrollmentId = uuid(body.enrollmentId, "enrollmentId");
    const signature = requiredString(
      body.signatureB64url,
      "signatureB64url",
      ED25519_SIGNATURE,
      86,
    );
    const caller = await dependencies.authenticate(request);
    const contextData = await rpc(caller.db, "get_robot_device_enrollment_context", {
      p_user_id: caller.userId,
      p_auth_session_id: caller.sessionId,
      p_enrollment_id: enrollmentId,
    });
    const now = dependencies.now?.() ?? Date.now();
    if (!safeInteger(now, 1)) {
      throw new HttpError(503, "clock_unavailable", "Robot enrollment is temporarily unavailable.");
    }

    if (action === "attest") {
      const context = assertLiveContext(parseContext(contextData), caller, enrollmentId, "challenge_issued", now);
      const proof = assertProofFence(
        body.proof,
        context,
        "device.enrollment.identity_proof",
        "proved_at_ms",
        PROOF_KEYS,
        true,
      );
      const digest = await verify(dependencies.verifier, context.manufacturingPublicKeyPem, proof, signature);
      const proofResetCounter = proof.factory_reset_counter as number;
      if (proofResetCounter > context.session.factory_reset_counter) {
        const reset = await rpc(caller.db, "advance_robot_factory_reset_counter", {
          p_user_id: caller.userId,
          p_auth_session_id: caller.sessionId,
          p_enrollment_id: enrollmentId,
          p_expected_version: context.session.version,
          p_next_factory_reset_counter: proofResetCounter,
          p_device_event_sequence: proof.device_event_sequence,
          p_proof_digest: digest,
          p_proved_at_ms: proof.proved_at_ms,
        });
        return json({ enrollment: singleRow(reset) });
      }
      const committed = await rpc(caller.db, "confirm_robot_device_identity", {
        p_user_id: caller.userId,
        p_auth_session_id: caller.sessionId,
        p_enrollment_id: enrollmentId,
        p_expected_version: context.session.version,
        p_device_event_sequence: proof.device_event_sequence,
        p_proof_digest: digest,
        p_proved_at_ms: proof.proved_at_ms,
      });
      return json({ enrollment: singleRow(committed) });
    }

    const context = assertLiveContext(parseContext(contextData), caller, enrollmentId, "identity_verified", now);
    const confirmation = assertProofFence(
      body.confirmation,
      context,
      "device.enrollment.online_confirmation",
      "confirmed_at_ms",
      CONFIRMATION_KEYS,
    );
    const operationalKey = requiredString(
      confirmation.operational_public_key_pem,
      "operational_public_key_pem",
      /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/,
      8192,
    );
    const operationalFingerprint = requiredString(
      confirmation.operational_public_key_fingerprint,
      "operational_public_key_fingerprint",
      FINGERPRINT,
      64,
    );
    const activeBootId = requiredString(confirmation.active_boot_id, "active_boot_id", BOOT_ID, 128);
    if (confirmation.network_status !== "online") {
      throw new HttpError(409, "robot_not_online", "The robot has not confirmed an online connection.");
    }
    const digest = await verify(dependencies.verifier, context.manufacturingPublicKeyPem, confirmation, signature);
    const committed = await rpc(caller.db, "complete_robot_device_enrollment", {
      p_user_id: caller.userId,
      p_auth_session_id: caller.sessionId,
      p_enrollment_id: enrollmentId,
      p_expected_version: context.session.version,
      p_device_event_sequence: confirmation.device_event_sequence,
      p_completion_digest: digest,
      p_operational_public_key_pem: operationalKey,
      p_operational_public_key_fingerprint: operationalFingerprint,
      p_active_boot_id: activeBootId,
      p_confirmed_at_ms: confirmation.confirmed_at_ms,
    });
    return json({ enrollment: singleRow(committed) });
  });
}
