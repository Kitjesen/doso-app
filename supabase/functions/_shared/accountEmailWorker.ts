import {
  AccountEmailRenderError,
  isAccountEmailKindEnabled,
  isAccountEmailTemplateId,
  renderAccountEmail,
} from "./accountEmail.ts";
import {
  AliyunDirectMailError,
  sendSingleEmail,
  type SendSingleEmailOptions,
  type SendSingleEmailResult,
} from "./aliyunDirectMail.ts";

export const PROVIDER_TIMEOUT_MS = 15_000;
export const WORKER_LEASE_SECONDS = 60;
export const MAX_MESSAGES_PER_INVOCATION = 1;
export const DEFAULT_MESSAGES_PER_INVOCATION = 1;
const ACK_ATTEMPTS = 3;

type RpcResult = { data: unknown; error: unknown };
export type AccountEmailRpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type ClaimedAccountEmail = {
  id: string;
  kind: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempt_count: number;
};

export type AccountEmailWorkerSummary = {
  workerId: string;
  claimed: number;
  accepted: number;
  retryScheduled: number;
  deadLettered: number;
  deliveryAmbiguous: number;
  ambiguousPersistencePending: number;
  fencedOut: number;
};

type EnvironmentReader = (name: string) => string | undefined;
type SafeLogFields = Record<string, string | number | boolean | null>;
type SafeLogger = (fields: SafeLogFields) => void;

export class AccountEmailWorkerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountEmailWorkerError";
  }
}

function requiredEnvironment(read: EnvironmentReader, name: string): string {
  const value = read(name)?.trim();
  if (!value) {
    throw new AccountEmailWorkerError(
      "worker_configuration_error",
      `${name} is not configured.`,
    );
  }
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
      throw new AccountEmailWorkerError(
        "worker_configuration_error",
        "SUPABASE_SECRET_KEYS is invalid.",
      );
    }
  } else if (name === "automations") {
    expected = read("SUPABASE_SECRET_KEY")?.trim();
  }
  if (typeof expected !== "string" || !expected.trim()) {
    throw new AccountEmailWorkerError(
      "worker_configuration_error",
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
  try {
    const parsed = await request.json();
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return DEFAULT_MESSAGES_PER_INVOCATION;
    }
    const requested = (parsed as Record<string, unknown>).limit;
    if (!Number.isInteger(requested) || Number(requested) <= 0) {
      return DEFAULT_MESSAGES_PER_INVOCATION;
    }
    return MAX_MESSAGES_PER_INVOCATION;
  } catch {
    return DEFAULT_MESSAGES_PER_INVOCATION;
  }
}

function providerFetchWithTimeout(fetchImpl: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(
      () => clearTimeout(timeout),
    );
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

export function parseClaimBatch(value: unknown): ClaimedAccountEmail | null {
  if (!Array.isArray(value)) {
    throw new AccountEmailWorkerError(
      "claim_contract_failure",
      "claim_account_email_batch must return an array.",
    );
  }
  if (value.length === 0) return null;
  if (value.length !== 1) {
    throw new AccountEmailWorkerError(
      "claim_contract_failure",
      "claim_account_email_batch returned more than one row.",
    );
  }
  const row = value[0];
  if (!row || Array.isArray(row) || typeof row !== "object") {
    throw new AccountEmailWorkerError(
      "claim_contract_failure",
      "The claimed account email row is not an object.",
    );
  }
  const claim = row as Record<string, unknown>;
  const payload = claim.payload;
  if (
    typeof claim.id !== "string" || !isUuid(claim.id) ||
    typeof claim.kind !== "string" || !claim.kind.trim() ||
    typeof claim.recipient_email !== "string" ||
    !claim.recipient_email.trim() ||
    typeof claim.lease_token !== "string" || !isUuid(claim.lease_token) ||
    !Number.isInteger(claim.attempt_count) || Number(claim.attempt_count) < 1 ||
    !payload || Array.isArray(payload) || typeof payload !== "object"
  ) {
    throw new AccountEmailWorkerError(
      "claim_contract_failure",
      "The claimed account email row does not match the worker contract.",
    );
  }
  return {
    id: claim.id,
    kind: claim.kind,
    recipient_email: claim.recipient_email,
    payload: payload as Record<string, unknown>,
    lease_token: claim.lease_token,
    attempt_count: Number(claim.attempt_count),
  };
}

function safeProviderCode(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120);
  return normalized || "provider_error";
}

function safeFailure(error: unknown): { code: string; summary: string } {
  if (error instanceof AccountEmailRenderError) {
    return {
      code: safeProviderCode(error.code),
      summary: error.message.slice(0, 300),
    };
  }
  if (error instanceof AliyunDirectMailError) {
    return {
      code: safeProviderCode(error.code),
      summary: `DirectMail failure classified as ${
        safeProviderCode(error.code)
      }.`,
    };
  }
  return {
    code: "worker_internal_error",
    summary:
      "The account email delivery failed without a classified provider response.",
  };
}

type ProviderDisposition = "retry" | "dead" | "ambiguous";

export function classifyProviderFailure(error: unknown): ProviderDisposition {
  if (!(error instanceof AliyunDirectMailError)) return "ambiguous";
  if (
    error.code === "transport_error" || error.code === "provider_timeout" ||
    error.code === "invalid_provider_response" || error.status === 408
  ) return "ambiguous";

  const normalizedCode = error.code.toLowerCase();
  const knownTransient = normalizedCode.includes("throttl") ||
    normalizedCode.includes("serviceunavailable") ||
    normalizedCode.includes("internalerror") ||
    normalizedCode.includes("internalfailure") ||
    normalizedCode.includes("systemerror");
  if (
    error.status === 429 ||
    (error.status !== undefined && error.status >= 500) ||
    knownTransient
  ) return "retry";
  if (
    error.code === "invalid_request" ||
    (error.status !== undefined && error.status >= 400 && error.status < 500)
  ) return "dead";
  return "ambiguous";
}

async function rpcBoolean(
  db: AccountEmailRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data === true;
}

async function persistAmbiguous(
  dependencies: RunAccountEmailWorkerDependencies,
  claim: ClaimedAccountEmail,
  failure: { code: string; summary: string },
  provider: Partial<SendSingleEmailResult> = {},
): Promise<boolean> {
  try {
    return await rpcBoolean(dependencies.db, "mark_account_email_ambiguous", {
      p_id: claim.id,
      p_lease_token: claim.lease_token,
      p_error_code: failure.code,
      p_error_summary: failure.summary,
      p_provider_request_id: provider.requestId ?? null,
      p_provider_env_id: provider.envId ?? null,
    });
  } catch {
    return false;
  }
}

export type RunAccountEmailWorkerDependencies = {
  db: AccountEmailRpcClient;
  readEnvironment: EnvironmentReader;
  fetch?: typeof fetch;
  randomUUID?: () => string;
  send?: (
    options: SendSingleEmailOptions,
    dependencies?: { fetch?: typeof fetch },
  ) => Promise<SendSingleEmailResult>;
  log?: SafeLogger;
};

export async function runAccountEmailWorker(
  _limit: number,
  dependencies: RunAccountEmailWorkerDependencies,
): Promise<AccountEmailWorkerSummary> {
  const read = dependencies.readEnvironment;
  // Resolve all provider credentials before claiming. A bad configuration must
  // never lease a row that this invocation cannot deliver.
  const provider = {
    accessKeyId: requiredEnvironment(read, "ALIYUN_DM_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnvironment(read, "ALIYUN_DM_ACCESS_KEY_SECRET"),
    accountName: read("ALIYUN_DM_ACCOUNT_NAME")?.trim() ||
      "no-reply@auth.dosorobotics.com",
    regionId: read("ALIYUN_DM_REGION_ID")?.trim() || "cn-hangzhou",
  };
  const workerId = dependencies.randomUUID?.() ?? crypto.randomUUID();
  const summary: AccountEmailWorkerSummary = {
    workerId,
    claimed: 0,
    accepted: 0,
    retryScheduled: 0,
    deadLettered: 0,
    deliveryAmbiguous: 0,
    ambiguousPersistencePending: 0,
    fencedOut: 0,
  };
  const claimResult = await dependencies.db.rpc("claim_account_email_batch", {
    p_worker_id: workerId,
    p_limit: 1,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });
  if (claimResult.error) throw claimResult.error;
  const claim = parseClaimBatch(claimResult.data);
  if (!claim) return summary;
  summary.claimed = 1;

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
  } catch (error) {
    const failure = safeFailure(error);
    if (
      await rpcBoolean(dependencies.db, "dead_letter_account_email", {
        p_id: claim.id,
        p_lease_token: claim.lease_token,
        p_error_code: failure.code,
        p_error_summary: failure.summary,
      })
    ) summary.deadLettered = 1;
    else summary.fencedOut = 1;
    return summary;
  }

  if (
    !await rpcBoolean(dependencies.db, "begin_account_email_delivery", {
      p_id: claim.id,
      p_lease_token: claim.lease_token,
    })
  ) {
    summary.fencedOut = 1;
    return summary;
  }

  let providerResult: SendSingleEmailResult | undefined;
  try {
    providerResult = await (dependencies.send ?? sendSingleEmail)({
      ...provider,
      toAddress: claim.recipient_email,
      subject: rendered.subject,
      htmlBody: rendered.html,
    }, {
      fetch: providerFetchWithTimeout(dependencies.fetch ?? fetch),
    });
    if (
      !providerResult || typeof providerResult.requestId !== "string" ||
      !providerResult.requestId.trim() ||
      typeof providerResult.envId !== "string" || !providerResult.envId.trim()
    ) {
      throw new AliyunDirectMailError(
        "invalid_provider_response",
        "DirectMail success response omitted RequestId or EnvId.",
        200,
        typeof providerResult?.requestId === "string"
          ? providerResult.requestId
          : undefined,
      );
    }

    let acknowledged = false;
    for (
      let attempt = 0;
      attempt < ACK_ATTEMPTS && !acknowledged;
      attempt += 1
    ) {
      try {
        acknowledged = await rpcBoolean(dependencies.db, "ack_account_email", {
          p_id: claim.id,
          p_lease_token: claim.lease_token,
          p_provider_request_id: providerResult.requestId,
          p_provider_env_id: providerResult.envId,
        });
      } catch {
        // Ack is retried locally only. The provider call is never repeated.
      }
    }
    if (acknowledged) {
      summary.accepted = 1;
      return summary;
    }

    dependencies.log?.({
      event: "account_email_ack_failed",
      outboxId: claim.id,
      providerRequestId: providerResult.requestId,
      providerEnvId: providerResult.envId,
    });
    const persisted = await persistAmbiguous(dependencies, claim, {
      code: "provider_accepted_ack_failed",
      summary:
        "Provider accepted the request but database acknowledgement failed.",
    }, providerResult);
    if (persisted) summary.deliveryAmbiguous = 1;
    else summary.ambiguousPersistencePending = 1;
    return summary;
  } catch (error) {
    const failure = safeFailure(error);
    const disposition = classifyProviderFailure(error);
    if (disposition === "ambiguous") {
      const partialProvider = error instanceof AliyunDirectMailError
        ? { requestId: error.requestId }
        : {};
      const persisted = await persistAmbiguous(
        dependencies,
        claim,
        failure,
        partialProvider,
      );
      if (persisted) summary.deliveryAmbiguous = 1;
      else summary.ambiguousPersistencePending = 1;
      return summary;
    }
    const rpcName = disposition === "retry"
      ? "retry_account_email"
      : "dead_letter_account_email";
    if (
      await rpcBoolean(dependencies.db, rpcName, {
        p_id: claim.id,
        p_lease_token: claim.lease_token,
        p_error_code: failure.code,
        p_error_summary: failure.summary,
      })
    ) {
      if (disposition === "retry") summary.retryScheduled = 1;
      else summary.deadLettered = 1;
    } else summary.fencedOut = 1;
    return summary;
  }
}
