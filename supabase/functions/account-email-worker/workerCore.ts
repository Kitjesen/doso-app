import {
  AccountEmailRenderError,
  isAccountEmailKindEnabled,
  isAccountEmailTemplateId,
  renderAccountEmail,
} from "../_shared/accountEmail.ts";
import {
  AliyunDirectMailError,
  sendSingleEmail,
  type SendSingleEmailOptions,
} from "../_shared/aliyunDirectMail.ts";

export const PROVIDER_TIMEOUT_MS = 15_000;
export const WORKER_WALL_BUDGET_MS = 45_000;
export const MAX_MESSAGES_PER_INVOCATION = 25;
export const DEFAULT_MESSAGES_PER_INVOCATION = 10;

type RpcResult = { data: unknown; error: unknown };
export type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type ClaimedEmail = {
  id: string;
  kind: string;
  recipient_email: string;
  payload: unknown;
  lease_token: string;
  attempt_id: string;
  attempt_count: number;
};

export type WorkerSummary = {
  workerId: string;
  claimed: number;
  accepted: number;
  retryScheduled: number;
  deadLettered: number;
  deliveryUnknown: number;
  unknownPersistencePending: number;
  fencedOut: number;
};

type EnvironmentReader = (name: string) => string | undefined;

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

export class WorkerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerRequestError";
  }
}

function requiredEnvironment(read: EnvironmentReader, name: string): string {
  const value = read(name)?.trim();
  if (!value) throw new WorkerConfigurationError(`${name} is not configured.`);
  return value;
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

export function authorizeNamedSecretKey(
  request: Request,
  read: EnvironmentReader,
): boolean {
  const name = read("DOSO_EMAIL_WORKER_SECRET_NAME")?.trim() || "automations";
  let expected: unknown;
  const namedKeys = read("SUPABASE_SECRET_KEYS")?.trim();
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys);
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
        expected = (parsed as Record<string, unknown>)[name];
      }
    } catch {
      throw new WorkerConfigurationError("SUPABASE_SECRET_KEYS is invalid.");
    }
  } else if (name === "automations") {
    // Supabase CLI local development exposes one secret key rather than the
    // hosted named-key JSON map.
    expected = read("SUPABASE_SECRET_KEY")?.trim();
  }
  if (typeof expected !== "string" || !expected.trim()) {
    throw new WorkerConfigurationError(
      `The Supabase secret key named ${name} is not configured.`,
    );
  }
  return constantTimeEqual(
    request.headers.get("apikey") ?? "",
    expected.trim(),
  );
}

export async function readWorkerLimit(request: Request): Promise<number> {
  if (!request.body) return DEFAULT_MESSAGES_PER_INVOCATION;
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new WorkerRequestError("The request body must be valid JSON.");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new WorkerRequestError("The request body must be a JSON object.");
  }
  const body = parsed as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "limit")) {
    throw new WorkerRequestError(
      "The request body contains unsupported fields.",
    );
  }
  const value = body.limit;
  if (
    !Number.isInteger(value) || Number(value) <= 0 ||
    Number(value) > MAX_MESSAGES_PER_INVOCATION
  ) {
    throw new WorkerRequestError(
      `limit must be an integer from 1 to ${MAX_MESSAGES_PER_INVOCATION}.`,
    );
  }
  return Number(value);
}

function providerFetchWithTimeout(
  fetchImpl: typeof fetch,
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(
      () => clearTimeout(timeout),
    );
  };
}

function normalizeClaim(value: unknown): ClaimedEmail | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || Array.isArray(row) || typeof row !== "object") return null;
  const claim = row as Record<string, unknown>;
  if (
    typeof claim.id !== "string" || typeof claim.kind !== "string" ||
    typeof claim.recipient_email !== "string" ||
    typeof claim.lease_token !== "string" ||
    typeof claim.attempt_id !== "string" ||
    typeof claim.attempt_count !== "number"
  ) return null;
  return claim as ClaimedEmail;
}

function safeError(error: unknown): { code: string; summary: string } {
  if (
    error instanceof AccountEmailRenderError ||
    error instanceof AliyunDirectMailError
  ) {
    return {
      code: error.code.slice(0, 200),
      summary: error.message.slice(0, 500),
    };
  }
  return {
    code: "worker_internal_error",
    summary:
      "The account email attempt failed without a classified provider response.",
  };
}

function classifyProviderFailure(
  error: unknown,
): "retry" | "dead" | "unknown" {
  if (!(error instanceof AliyunDirectMailError)) return "unknown";
  if (
    error.code === "transport_error" || error.code === "provider_timeout" ||
    error.code === "invalid_provider_response" || error.status === 408
  ) return "unknown";
  if (
    error.status === 429 || (error.status !== undefined && error.status >= 500)
  ) {
    return "retry";
  }
  if (error.status !== undefined && error.status >= 400) return "dead";
  return error.code === "invalid_request" ? "dead" : "unknown";
}

async function rpcBoolean(
  db: RpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data === true;
}

export type RunWorkerDependencies = {
  db: RpcClient;
  readEnvironment: EnvironmentReader;
  fetch?: typeof fetch;
  now?: () => number;
  randomUUID?: () => string;
  send?: typeof sendSingleEmail;
};

export async function runWorker(
  limit: number,
  dependencies: RunWorkerDependencies,
): Promise<WorkerSummary> {
  const read = dependencies.readEnvironment;
  // Provider configuration is resolved before the first claim. A broken secret
  // must never strand a leased row.
  const provider = {
    accessKeyId: requiredEnvironment(read, "ALIYUN_DM_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnvironment(read, "ALIYUN_DM_ACCESS_KEY_SECRET"),
    accountName: read("ALIYUN_DM_ACCOUNT_NAME")?.trim() ||
      "no-reply@auth.dosorobotics.com",
    regionId: read("ALIYUN_DM_REGION_ID")?.trim() || "cn-hangzhou",
  };
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const workerId = dependencies.randomUUID?.() ?? crypto.randomUUID();
  const summary: WorkerSummary = {
    workerId,
    claimed: 0,
    accepted: 0,
    retryScheduled: 0,
    deadLettered: 0,
    deliveryUnknown: 0,
    unknownPersistencePending: 0,
    fencedOut: 0,
  };
  const boundedLimit = Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_MESSAGES_PER_INVOCATION,
  );

  while (
    summary.claimed < boundedLimit && now() - startedAt < WORKER_WALL_BUDGET_MS
  ) {
    const { data, error } = await dependencies.db.rpc("claim_account_email", {
      p_worker_id: workerId,
    });
    if (error) throw error;
    const claim = normalizeClaim(data);
    if (!claim) break;
    summary.claimed += 1;

    let rendered;
    try {
      if (
        !isAccountEmailTemplateId(claim.kind) ||
        !isAccountEmailKindEnabled(claim.kind)
      ) {
        throw new AccountEmailRenderError(
          "disabled_email_kind",
          "This account email kind is not enabled by the worker.",
        );
      }
      rendered = renderAccountEmail(claim.kind, claim.payload);
    } catch (caught) {
      const failure = safeError(caught);
      if (
        await rpcBoolean(dependencies.db, "dead_letter_account_email", {
          p_id: claim.id,
          p_lease_token: claim.lease_token,
          p_attempt_id: claim.attempt_id,
          p_error_code: failure.code,
          p_error_summary: failure.summary,
        })
      ) summary.deadLettered += 1;
      continue;
    }

    if (
      !await rpcBoolean(dependencies.db, "begin_account_email_dispatch", {
        p_id: claim.id,
        p_lease_token: claim.lease_token,
        p_attempt_id: claim.attempt_id,
      })
    ) {
      summary.fencedOut += 1;
      continue;
    }

    let providerResult: { requestId: string; envId: string } | undefined;
    try {
      const options: SendSingleEmailOptions = {
        ...provider,
        notificationId: claim.id,
        toAddress: claim.recipient_email,
        subject: rendered.subject,
        htmlBody: rendered.html,
      };
      providerResult = await (dependencies.send ?? sendSingleEmail)(options, {
        fetch: providerFetchWithTimeout(dependencies.fetch ?? fetch),
      });
      const { data: accepted, error: acceptError } = await dependencies.db.rpc(
        "accept_account_email",
        {
          p_id: claim.id,
          p_attempt_id: claim.attempt_id,
          p_provider_request_id: providerResult.requestId,
          p_provider_env_id: providerResult.envId,
        },
      );
      if (!acceptError && accepted === true) {
        summary.accepted += 1;
        continue;
      }
      // DirectMail accepted the request. A failed DB acknowledgement is
      // ambiguous and must never route back through automatic retry.
      const { data: unknown, error: unknownError } = await dependencies.db.rpc(
        "mark_account_email_unknown",
        {
          p_id: claim.id,
          p_attempt_id: claim.attempt_id,
          p_error_code: "provider_accepted_ack_failed",
          p_error_summary:
            "Provider accepted the request but database acknowledgement failed.",
          p_provider_request_id: providerResult.requestId,
          p_provider_env_id: providerResult.envId,
        },
      );
      if (!unknownError && unknown === true) summary.deliveryUnknown += 1;
      else summary.unknownPersistencePending += 1;
    } catch (caught) {
      const failure = safeError(caught);
      const disposition = classifyProviderFailure(caught);
      if (disposition === "unknown") {
        const { data: unknown, error: unknownError } = await dependencies.db
          .rpc(
            "mark_account_email_unknown",
            {
              p_id: claim.id,
              p_attempt_id: claim.attempt_id,
              p_error_code: failure.code,
              p_error_summary: failure.summary,
              p_provider_request_id: providerResult?.requestId ?? null,
              p_provider_env_id: providerResult?.envId ?? null,
            },
          );
        if (!unknownError && unknown === true) summary.deliveryUnknown += 1;
        else summary.unknownPersistencePending += 1;
      } else if (disposition === "retry") {
        if (
          await rpcBoolean(dependencies.db, "retry_rejected_account_email", {
            p_id: claim.id,
            p_attempt_id: claim.attempt_id,
            p_error_code: failure.code,
            p_error_summary: failure.summary,
          })
        ) summary.retryScheduled += 1;
      } else if (
        await rpcBoolean(dependencies.db, "dead_letter_account_email", {
          p_id: claim.id,
          p_lease_token: claim.lease_token,
          p_attempt_id: claim.attempt_id,
          p_error_code: failure.code,
          p_error_summary: failure.summary,
        })
      ) summary.deadLettered += 1;
    }
  }
  return summary;
}
