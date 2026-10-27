import { canonicalizeRobotProtocolValue } from "../_shared/robotIngress.ts";

export const DEFAULT_COMMANDS_PER_INVOCATION = 10;
export const MAX_COMMANDS_PER_INVOCATION = 25;
export const WORKER_WALL_BUDGET_MS = 45_000;
export const COMMAND_LEASE_SECONDS = 30;
export const TRANSPORT_TIMEOUT_MS = 10_000;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ERROR_CODE = /^[a-z][a-z0-9_]{2,63}$/;
const TRANSPORT_MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/;
const INCLUDE = new Set(["battery", "network", "sensors"]);

type EnvironmentReader = (name: string) => string | undefined;
type RpcResult = { data: unknown; error: unknown };
export type RobotCommandRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type RobotCommandEnvelope = Readonly<{
  protocol_version: 1;
  command_id: string;
  device_id: string;
  owner_account_id: string;
  terminal_id: string;
  actor_user_id: string;
  authorization_epoch: number;
  idempotency_key: string;
  auth_session_id: string;
  policy_version: number;
  safety_contract_id: "stationary-health-check";
  safety_contract_version: 1;
  capability: "command:diagnostics.health_check";
  kind: "diagnostics.health_check";
  command_class: "non_motion_diagnostic";
  may_actuate: false;
  expected_state: Readonly<{ authorization_epoch: number; boot_id: string }>;
  issued_at_ms: number;
  expires_at_ms: number;
  payload: Readonly<
    { include: readonly ("battery" | "network" | "sensors")[] }
  >;
}>;

export type PublishedCommand = Readonly<{
  command: RobotCommandEnvelope;
  signature_b64url: string;
}>;

export type ClaimedRobotCommand = Readonly<{
  commandId: string;
  leaseToken: string;
  fencingToken: number;
  leasedUntil: string;
  command: RobotCommandEnvelope;
}>;

export type RobotCommandTransportResult =
  | Readonly<{
    disposition: "published";
    transportMessageId: string;
  }>
  | Readonly<{
    disposition: "transport_failure";
    definitelyNotDelivered: true;
    errorCode: string;
  }>
  | Readonly<{
    disposition: "delivery_unknown";
    errorCode: string;
  }>;

export interface RobotCommandTransport {
  publish(
    command: PublishedCommand,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<RobotCommandTransportResult>;
}

export interface RobotCommandSigner {
  sign(command: RobotCommandEnvelope): Promise<PublishedCommand>;
}

export type RobotCommandWorkerSummary = Readonly<{
  reconciledBefore: number;
  reconciledAfter: number;
  claimed: number;
  authorityChanged: number;
  invalidClaims: number;
  fencedOut: number;
  published: number;
  transportFailures: number;
  deliveryUnknown: number;
  persistenceUnknown: number;
}>;

export class RobotCommandWorkerConfigurationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RobotCommandWorkerConfigurationError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function singleRpcRow(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  return value.length === 1 ? value[0] : undefined;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function constantTimeEqual(left: string, right: string): boolean {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function requiredEnvironment(read: EnvironmentReader, name: string): string {
  const value = read(name)?.trim();
  if (!value) {
    throw new RobotCommandWorkerConfigurationError(
      "worker_configuration_error",
      `${name} is not configured.`,
    );
  }
  return value;
}

export function authenticateRobotCommandWorker(
  request: Request,
  read: EnvironmentReader,
): string | null {
  const encoded = read("SUPABASE_SECRET_KEYS")?.trim();
  if (!encoded) {
    throw new RobotCommandWorkerConfigurationError(
      "worker_configuration_error",
      "The robot command worker named secret is not configured.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new RobotCommandWorkerConfigurationError(
      "worker_configuration_error",
      "The robot command worker named secret is not configured.",
    );
  }
  const expected = record(parsed) ? parsed["robot-command-worker"] : undefined;
  if (typeof expected !== "string" || !expected.trim()) {
    throw new RobotCommandWorkerConfigurationError(
      "worker_configuration_error",
      "The robot command worker named secret is not configured.",
    );
  }
  const secret = expected.trim();
  return constantTimeEqual(request.headers.get("apikey") ?? "", secret)
    ? secret
    : null;
}

export function robotCommandDeliveryEnabled(read: EnvironmentReader): boolean {
  return read("DOSO_ROBOT_COMMAND_DELIVERY_ENABLED")?.trim() === "true";
}

export function robotCommandWorkerUrl(read: EnvironmentReader): string {
  return requiredEnvironment(read, "SUPABASE_URL");
}

export function robotCommandSigningKey(read: EnvironmentReader): string {
  return requiredEnvironment(
    read,
    "DOSO_ROBOT_COMMAND_SIGNING_PRIVATE_KEY_PKCS8_PEM",
  );
}

export async function readRobotCommandWorkerLimit(
  request: Request,
): Promise<number> {
  if (!request.body) return DEFAULT_COMMANDS_PER_INVOCATION;
  try {
    const body = await request.json();
    if (!record(body) || !exact(body, ["limit"])) {
      return DEFAULT_COMMANDS_PER_INVOCATION;
    }
    return safeInteger(body.limit, 1)
      ? Math.min(body.limit, MAX_COMMANDS_PER_INVOCATION)
      : DEFAULT_COMMANDS_PER_INVOCATION;
  } catch {
    return DEFAULT_COMMANDS_PER_INVOCATION;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function decodePkcs8Pem(value: string): Uint8Array {
  const match =
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----\s*$/
      .exec(
        value,
      );
  if (!match) {
    throw new RobotCommandWorkerConfigurationError(
      "signer_unconfigured",
      "The robot command signing key is not valid PKCS8 PEM.",
    );
  }
  try {
    const binary = atob(match[1].replace(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new RobotCommandWorkerConfigurationError(
      "signer_unconfigured",
      "The robot command signing key is not valid PKCS8 PEM.",
    );
  }
}

export async function importEd25519Pkcs8Signer(
  pkcs8Pem: string,
): Promise<RobotCommandSigner> {
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer(decodePkcs8Pem(pkcs8Pem)),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof RobotCommandWorkerConfigurationError) throw error;
    throw new RobotCommandWorkerConfigurationError(
      "signer_unconfigured",
      "The robot command signing key could not be imported.",
    );
  }
  return Object.freeze({
    async sign(command: RobotCommandEnvelope): Promise<PublishedCommand> {
      const canonical = canonicalizeRobotProtocolValue(command);
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          "Ed25519",
          privateKey,
          buffer(new TextEncoder().encode(canonical)),
        ),
      );
      return deepFreeze({ command, signature_b64url: base64Url(signature) });
    },
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function parseCommandEnvelope(value: unknown): RobotCommandEnvelope | null {
  if (
    !record(value) || !exact(value, [
      "protocol_version",
      "command_id",
      "device_id",
      "owner_account_id",
      "terminal_id",
      "actor_user_id",
      "authorization_epoch",
      "idempotency_key",
      "auth_session_id",
      "policy_version",
      "safety_contract_id",
      "safety_contract_version",
      "capability",
      "kind",
      "command_class",
      "may_actuate",
      "expected_state",
      "issued_at_ms",
      "expires_at_ms",
      "payload",
    ])
  ) return null;
  if (
    value.protocol_version !== 1 || !uuid(value.command_id) ||
    !uuid(value.device_id) || !uuid(value.owner_account_id) ||
    !uuid(value.terminal_id) || !uuid(value.actor_user_id) ||
    !uuid(value.auth_session_id) || !identifier(value.idempotency_key) ||
    !safeInteger(value.authorization_epoch, 1) ||
    !safeInteger(value.policy_version, 1) ||
    value.safety_contract_id !== "stationary-health-check" ||
    value.safety_contract_version !== 1 ||
    value.capability !== "command:diagnostics.health_check" ||
    value.kind !== "diagnostics.health_check" ||
    value.command_class !== "non_motion_diagnostic" ||
    value.may_actuate !== false || !safeInteger(value.issued_at_ms) ||
    !safeInteger(value.expires_at_ms) ||
    value.expires_at_ms <= value.issued_at_ms ||
    !record(value.expected_state) ||
    !exact(value.expected_state, ["authorization_epoch", "boot_id"]) ||
    value.expected_state.authorization_epoch !== value.authorization_epoch ||
    !identifier(value.expected_state.boot_id) || !record(value.payload) ||
    !exact(value.payload, ["include"]) ||
    !Array.isArray(value.payload.include) ||
    value.payload.include.length < 1 || value.payload.include.length > 3 ||
    new Set(value.payload.include).size !== value.payload.include.length ||
    !value.payload.include.every((item) =>
      typeof item === "string" && INCLUDE.has(item)
    )
  ) return null;

  const include = [...value.payload.include] as (
    "battery" | "network" | "sensors"
  )[];
  return deepFreeze({
    protocol_version: 1,
    command_id: value.command_id,
    device_id: value.device_id,
    owner_account_id: value.owner_account_id,
    terminal_id: value.terminal_id,
    actor_user_id: value.actor_user_id,
    authorization_epoch: value.authorization_epoch,
    idempotency_key: value.idempotency_key,
    auth_session_id: value.auth_session_id,
    policy_version: value.policy_version,
    safety_contract_id: "stationary-health-check",
    safety_contract_version: 1,
    capability: "command:diagnostics.health_check",
    kind: "diagnostics.health_check",
    command_class: "non_motion_diagnostic",
    may_actuate: false,
    expected_state: {
      authorization_epoch: value.authorization_epoch,
      boot_id: value.expected_state.boot_id,
    },
    issued_at_ms: value.issued_at_ms,
    expires_at_ms: value.expires_at_ms,
    payload: { include },
  }) as RobotCommandEnvelope;
}

function parseClaim(value: unknown):
  | { kind: "empty" }
  | { kind: "authority_changed" }
  | { kind: "invalid" }
  | { kind: "claimed"; claim: ClaimedRobotCommand } {
  const row = singleRpcRow(value);
  if (row === null) return { kind: "empty" };
  if (!record(row)) return { kind: "invalid" };
  if (row.claimed === false) {
    return exact(row, ["claimed", "reason"]) &&
        row.reason === "authority_changed"
      ? { kind: "authority_changed" }
      : { kind: "invalid" };
  }
  if (
    !exact(row, [
      "claimed",
      "command_id",
      "lease_token",
      "fencing_token",
      "leased_until",
      "command",
    ]) || row.claimed !== true || !uuid(row.command_id) ||
    !uuid(row.lease_token) || !safeInteger(row.fencing_token, 1) ||
    typeof row.leased_until !== "string" ||
    !Number.isFinite(Date.parse(row.leased_until))
  ) return { kind: "invalid" };
  const command = parseCommandEnvelope(row.command);
  if (!command || command.command_id !== row.command_id) {
    return { kind: "invalid" };
  }
  return {
    kind: "claimed",
    claim: deepFreeze({
      commandId: row.command_id,
      leaseToken: row.lease_token,
      fencingToken: row.fencing_token,
      leasedUntil: row.leased_until,
      command,
    }) as ClaimedRobotCommand,
  };
}

function parseBegin(value: unknown):
  | { begun: false }
  | { begun: true; dispatchDeadlineMs: number }
  | null {
  const row = singleRpcRow(value);
  if (!record(row) || typeof row.begun !== "boolean") return null;
  if (!row.begun) return { begun: false };
  if (typeof row.dispatch_deadline !== "string") return null;
  const dispatchDeadlineMs = Date.parse(row.dispatch_deadline);
  return Number.isFinite(dispatchDeadlineMs)
    ? { begun: true, dispatchDeadlineMs }
    : null;
}

function parseFinish(value: unknown): { applied: boolean } | null {
  const row = singleRpcRow(value);
  if (!record(row) || typeof row.applied !== "boolean") return null;
  return { applied: row.applied };
}

function parseReconcile(value: unknown): number | null {
  const row = singleRpcRow(value);
  return safeInteger(row) ? row : null;
}

type FinishDisposition = Readonly<{
  outcome: "published" | "transport_failure" | "delivery_unknown";
  transportMessageId: string | null;
  errorCode: string | null;
}>;

function normalizeTransportResult(value: unknown): FinishDisposition {
  if (!record(value) || typeof value.disposition !== "string") {
    return {
      outcome: "delivery_unknown",
      transportMessageId: null,
      errorCode: "transport_result_invalid",
    };
  }
  if (
    value.disposition === "published" &&
    typeof value.transportMessageId === "string" &&
    TRANSPORT_MESSAGE_ID.test(value.transportMessageId)
  ) {
    return {
      outcome: "published",
      transportMessageId: value.transportMessageId,
      errorCode: null,
    };
  }
  if (
    value.disposition === "transport_failure" &&
    value.definitelyNotDelivered === true &&
    typeof value.errorCode === "string" && ERROR_CODE.test(value.errorCode)
  ) {
    return {
      outcome: "transport_failure",
      transportMessageId: null,
      errorCode: value.errorCode,
    };
  }
  if (
    value.disposition === "delivery_unknown" &&
    typeof value.errorCode === "string" && ERROR_CODE.test(value.errorCode)
  ) {
    return {
      outcome: "delivery_unknown",
      transportMessageId: null,
      errorCode: value.errorCode,
    };
  }
  return {
    outcome: "delivery_unknown",
    transportMessageId: null,
    errorCode: "transport_result_invalid",
  };
}

async function publishWithDeadline(
  transport: RobotCommandTransport,
  command: PublishedCommand,
  timeoutMs: number,
): Promise<FinishDisposition> {
  const controller = new AbortController();
  let timeout: number | undefined;
  const operation = Promise.resolve()
    .then(() => transport.publish(command, { signal: controller.signal }))
    .then(
      (value) => ({ kind: "result" as const, value }),
      () => ({ kind: "error" as const }),
    );
  const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
    timeout = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const settled = await Promise.race([operation, deadline]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (settled.kind === "timeout") {
    controller.abort();
    return {
      outcome: "delivery_unknown",
      transportMessageId: null,
      errorCode: "transport_timeout",
    };
  }
  if (settled.kind === "error") {
    return {
      outcome: "delivery_unknown",
      transportMessageId: null,
      errorCode: "transport_exception",
    };
  }
  return normalizeTransportResult(settled.value);
}

export type RunRobotCommandWorkerDependencies = {
  db: RobotCommandRpcClient;
  signer: RobotCommandSigner;
  transport: RobotCommandTransport;
  now?: () => number;
  randomUUID?: () => string;
  transportTimeoutMs?: number;
  wallBudgetMs?: number;
};

export async function runRobotCommandWorker(
  requestedLimit: number,
  dependencies: RunRobotCommandWorkerDependencies,
): Promise<RobotCommandWorkerSummary> {
  const summary = {
    reconciledBefore: 0,
    reconciledAfter: 0,
    claimed: 0,
    authorityChanged: 0,
    invalidClaims: 0,
    fencedOut: 0,
    published: 0,
    transportFailures: 0,
    deliveryUnknown: 0,
    persistenceUnknown: 0,
  };
  const limit = Math.min(
    Math.max(Math.trunc(requestedLimit), 1),
    MAX_COMMANDS_PER_INVOCATION,
  );
  const timeoutMs = Math.min(
    Math.max(
      Math.trunc(dependencies.transportTimeoutMs ?? TRANSPORT_TIMEOUT_MS),
      1,
    ),
    TRANSPORT_TIMEOUT_MS,
  );
  const wallBudgetMs = Math.min(
    Math.max(Math.trunc(dependencies.wallBudgetMs ?? WORKER_WALL_BUDGET_MS), 1),
    WORKER_WALL_BUDGET_MS,
  );
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const wallDeadlineMs = startedAt + wallBudgetMs;
  const workerId = dependencies.randomUUID?.() ?? crypto.randomUUID();

  const reconcile = async (): Promise<number | null> => {
    const result = await dependencies.db.rpc(
      "reconcile_robot_command_timeouts",
      { p_limit: MAX_COMMANDS_PER_INVOCATION },
    );
    return result.error ? null : parseReconcile(result.data);
  };

  const before = await reconcile();
  if (before === null) {
    summary.persistenceUnknown += 1;
    return Object.freeze(summary);
  }
  summary.reconciledBefore = before;

  let inspected = 0;
  while (inspected < limit && now() - startedAt < wallBudgetMs) {
    const claimed = await dependencies.db.rpc(
      "claim_robot_command_for_publish",
      { p_worker_id: workerId, p_lease_seconds: COMMAND_LEASE_SECONDS },
    );
    if (claimed.error) {
      summary.persistenceUnknown += 1;
      break;
    }
    const parsed = parseClaim(claimed.data);
    if (parsed.kind === "empty") break;
    inspected += 1;
    if (parsed.kind === "authority_changed") {
      summary.authorityChanged += 1;
      continue;
    }
    if (parsed.kind === "invalid") {
      summary.invalidClaims += 1;
      break;
    }

    const claim = parsed.claim;
    summary.claimed += 1;
    if (now() >= wallDeadlineMs) {
      break;
    }
    const begun = await dependencies.db.rpc("begin_robot_command_publish", {
      p_command_id: claim.commandId,
      p_lease_token: claim.leaseToken,
      p_fencing_token: claim.fencingToken,
    });
    if (begun.error) {
      summary.persistenceUnknown += 1;
      break;
    }
    const beginResult = parseBegin(begun.data);
    if (!beginResult) {
      summary.persistenceUnknown += 1;
      break;
    }
    if (!beginResult.begun) {
      summary.fencedOut += 1;
      continue;
    }

    let disposition: FinishDisposition = {
      outcome: "transport_failure",
      transportMessageId: null,
      errorCode: "signing_failed",
    };
    const transportDeadlineMs = Math.min(
      beginResult.dispatchDeadlineMs,
      Date.parse(claim.leasedUntil),
      claim.command.expires_at_ms,
      wallDeadlineMs,
    );
    if (now() >= transportDeadlineMs) {
      disposition = {
        outcome: "transport_failure",
        transportMessageId: null,
        errorCode: "dispatch_deadline_elapsed",
      };
    } else {
      let published: PublishedCommand | null = null;
      try {
        published = await dependencies.signer.sign(claim.command);
      } catch {
        // Signing is local and happens before transport, so zero delivery is
        // still certain and the command may follow the normal retry policy.
      }
      if (published !== null) {
        const remainingMs = transportDeadlineMs - now();
        if (remainingMs <= 0) {
          disposition = {
            outcome: "transport_failure",
            transportMessageId: null,
            errorCode: "dispatch_deadline_elapsed",
          };
        } else {
          try {
            disposition = await publishWithDeadline(
              dependencies.transport,
              published,
              Math.min(timeoutMs, Math.max(1, Math.floor(remainingMs))),
            );
          } catch {
            // Once transport starts, an exception cannot prove that no device
            // received the command. Never convert it into a retryable failure.
            disposition = {
              outcome: "delivery_unknown",
              transportMessageId: null,
              errorCode: "transport_exception",
            };
          }
        }
      }
    }

    const finished = await dependencies.db.rpc(
      "finish_robot_command_publish",
      {
        p_command_id: claim.commandId,
        p_lease_token: claim.leaseToken,
        p_fencing_token: claim.fencingToken,
        p_outcome: disposition.outcome,
        p_transport_message_id: disposition.transportMessageId,
        p_error_code: disposition.errorCode,
      },
    );
    if (finished.error) {
      summary.persistenceUnknown += 1;
      break;
    }
    const finishResult = parseFinish(finished.data);
    if (!finishResult) {
      summary.persistenceUnknown += 1;
      break;
    }
    if (!finishResult.applied) {
      summary.fencedOut += 1;
      continue;
    }
    if (disposition.outcome === "published") summary.published += 1;
    else if (disposition.outcome === "transport_failure") {
      summary.transportFailures += 1;
    } else summary.deliveryUnknown += 1;
  }

  const after = await reconcile();
  if (after === null) summary.persistenceUnknown += 1;
  else summary.reconciledAfter = after;
  return Object.freeze(summary);
}
