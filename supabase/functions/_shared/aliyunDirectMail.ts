const DIRECT_MAIL_ENDPOINT = "https://dm.aliyuncs.com/";
const DEFAULT_ACCOUNT_NAME = "no-reply@auth.dosorobotics.com";
const DEFAULT_FROM_ALIAS = "DOSO";
const DEFAULT_REGION_ID = "cn-hangzhou";
const DIRECT_MAIL_VERSION = "2015-11-23";
const MAX_HTML_BODY_BYTES = 80 * 1024;

function compareParameterNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type SendSingleEmailOptions = {
  accessKeyId: string;
  accessKeySecret: string;
  toAddress: string;
  subject: string;
  htmlBody: string;
  notificationId: string;
  accountName?: string;
  fromAlias?: string;
  regionId?: string;
};

export type SendSingleEmailResult = {
  requestId: string;
  envId: string;
};

export type DirectMailDependencies = {
  fetch?: typeof fetch;
  now?: () => Date;
  randomUUID?: () => string;
};

export class AliyunDirectMailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "AliyunDirectMailError";
  }
}

export function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function canonicalizeParameters(
  parameters: Readonly<Record<string, string>>,
): string {
  return Object.entries(parameters)
    .filter(([key]) => key !== "Signature")
    .sort(([left], [right]) => compareParameterNames(left, right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
}

export function createStringToSign(
  parameters: Readonly<Record<string, string>>,
): string {
  return `POST&${percentEncode("/")}&${
    percentEncode(canonicalizeParameters(parameters))
  }`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function signRpcRequest(
  parameters: Readonly<Record<string, string>>,
  accessKeySecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${accessKeySecret}&`),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(createStringToSign(parameters)),
  );
  return bytesToBase64(new Uint8Array(signature));
}

function requiredTrimmed(
  value: string,
  field: string,
  maximumLength: number,
): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AliyunDirectMailError(
      "invalid_request",
      `${field} is required.`,
    );
  }
  if (Array.from(normalized).length > maximumLength) {
    throw new AliyunDirectMailError(
      "invalid_request",
      `${field} is too long.`,
    );
  }
  return normalized;
}

function emailAddress(value: string, field: string): string {
  const normalized = requiredTrimmed(value, field, 192);
  if (
    /[\s,\r\n]/.test(normalized) ||
    !/^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(normalized)
  ) {
    throw new AliyunDirectMailError(
      "invalid_request",
      `${field} must be one valid email address.`,
    );
  }
  return normalized;
}

function utcTimestamp(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new AliyunDirectMailError(
      "invalid_request",
      "The request timestamp is invalid.",
    );
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function formEncode(parameters: Readonly<Record<string, string>>): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => compareParameterNames(left, right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
}

function sanitizedProviderText(
  value: unknown,
  sensitive: {
    accessKeyId: string;
    accessKeySecret: string;
    accountName: string;
    toAddress: string;
  },
): string {
  if (typeof value !== "string") return "";
  let redacted = value;
  for (
    const secret of [
      sensitive.accessKeySecret,
      sensitive.accessKeyId,
      sensitive.accountName,
      sensitive.toAddress,
    ]
  ) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  redacted = redacted
    .replace(
      /AccessKeySecret\s*[:=]\s*[^\s,;]+/gi,
      "AccessKeySecret=[REDACTED]",
    )
    .replace(
      /AccessKeyId\s*[:=]\s*[^\s,;]+/gi,
      "AccessKeyId=[REDACTED]",
    )
    .replace(
      /(?:AccountName|ToAddress)\s*[:=]\s*[^\s,;]+/gi,
      "address=[REDACTED]",
    )
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi,
      "[REDACTED_EMAIL]",
    )
    .replace(/[\r\n]+/g, " ")
    .trim();
  return redacted.slice(0, 500);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function sendSingleEmail(
  options: SendSingleEmailOptions,
  dependencies: DirectMailDependencies = {},
): Promise<SendSingleEmailResult> {
  const accessKeyId = requiredTrimmed(options.accessKeyId, "accessKeyId", 256);
  const accessKeySecret = requiredTrimmed(
    options.accessKeySecret,
    "accessKeySecret",
    512,
  );
  const accountName = emailAddress(
    options.accountName ?? DEFAULT_ACCOUNT_NAME,
    "accountName",
  );
  const fromAlias = requiredTrimmed(
    options.fromAlias ?? DEFAULT_FROM_ALIAS,
    "fromAlias",
    15,
  );
  const toAddress = emailAddress(options.toAddress, "toAddress");
  const subject = requiredTrimmed(options.subject, "subject", 256);
  const htmlBody = requiredTrimmed(options.htmlBody, "htmlBody", 100_000);
  if (new TextEncoder().encode(htmlBody).byteLength > MAX_HTML_BODY_BYTES) {
    throw new AliyunDirectMailError(
      "invalid_request",
      "htmlBody exceeds the DirectMail signed-request limit.",
    );
  }
  const regionId = requiredTrimmed(
    options.regionId ?? DEFAULT_REGION_ID,
    "regionId",
    64,
  );
  if (!/^[a-z0-9-]+$/.test(regionId)) {
    throw new AliyunDirectMailError(
      "invalid_request",
      "regionId has an invalid format.",
    );
  }
  const notificationId = requiredTrimmed(
    options.notificationId,
    "notificationId",
    100,
  );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(notificationId)
  ) {
    throw new AliyunDirectMailError(
      "invalid_request",
      "notificationId must be a UUID.",
    );
  }
  const signatureNonce = dependencies.randomUUID?.() ?? crypto.randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(signatureNonce)
  ) {
    throw new AliyunDirectMailError(
      "invalid_request",
      "SignatureNonce must be a UUID.",
    );
  }

  const parameters: Record<string, string> = {
    AccessKeyId: accessKeyId,
    AccountName: accountName,
    Action: "SingleSendMail",
    AddressType: "1",
    ClickTrace: "0",
    Format: "JSON",
    FromAlias: fromAlias,
    HtmlBody: htmlBody,
    Headers: JSON.stringify({
      "Message-ID": `<${notificationId}@notify.dosorobotics.com>`,
      "X-User-Notify-Doso-ID": notificationId,
    }),
    RegionId: regionId,
    ReplyToAddress: "false",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: signatureNonce,
    SignatureVersion: "1.0",
    Subject: subject,
    Timestamp: utcTimestamp((dependencies.now ?? (() => new Date()))()),
    ToAddress: toAddress,
    Version: DIRECT_MAIL_VERSION,
  };
  parameters.Signature = await signRpcRequest(parameters, accessKeySecret);

  let response: Response;
  try {
    response = await (dependencies.fetch ?? fetch)(DIRECT_MAIL_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: formEncode(parameters),
    });
  } catch (error) {
    throw new AliyunDirectMailError(
      error instanceof DOMException && error.name === "AbortError"
        ? "provider_timeout"
        : "transport_error",
      "DirectMail request failed before a response was received.",
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    if (response.ok) {
      throw new AliyunDirectMailError(
        "invalid_provider_response",
        "DirectMail returned an invalid success response.",
        response.status,
      );
    }
  }

  const requestId = stringField(payload.RequestId);
  if (!response.ok) {
    const providerCode = sanitizedProviderText(
      stringField(payload.Code),
      { accessKeyId, accessKeySecret, accountName, toAddress },
    ) || "provider_error";
    const providerMessage = sanitizedProviderText(
      payload.Message,
      { accessKeyId, accessKeySecret, accountName, toAddress },
    );
    throw new AliyunDirectMailError(
      providerCode,
      providerMessage
        ? `DirectMail rejected the request: ${providerMessage}`
        : "DirectMail rejected the request.",
      response.status,
      requestId,
    );
  }

  const envId = stringField(payload.EnvId);
  if (!requestId || !envId) {
    throw new AliyunDirectMailError(
      "invalid_provider_response",
      "DirectMail success response omitted RequestId or EnvId.",
      response.status,
      requestId,
    );
  }

  return { requestId, envId };
}
