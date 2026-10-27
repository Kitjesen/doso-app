import {
  type PublishedCommand,
  type RobotCommandTransport,
  type RobotCommandTransportResult,
  RobotCommandWorkerConfigurationError,
} from "./workerCore.ts";

type EnvironmentReader = (name: string) => string | undefined;
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const GATEWAY_URL = "DOSO_ROBOT_COMMAND_GATEWAY_URL";
const GATEWAY_API_KEY = "DOSO_ROBOT_COMMAND_GATEWAY_API_KEY";
const MAX_RESPONSE_BYTES = 16 * 1024;
const ERROR_CODE = /^[a-z][a-z0-9_]{2,63}$/;
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/;

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configurationError(message: string): never {
  throw new RobotCommandWorkerConfigurationError(
    "transport_configuration_error",
    message,
  );
}

function readConfiguration(
  read: EnvironmentReader,
): Readonly<{ endpoint: URL; apiKey: string }> | null {
  const endpointValue = read(GATEWAY_URL)?.trim() ?? "";
  const apiKey = read(GATEWAY_API_KEY)?.trim() ?? "";

  if (!endpointValue && !apiKey) return null;
  if (!endpointValue || !apiKey) {
    return configurationError("The robot command gateway configuration is incomplete.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    return configurationError("The robot command gateway URL is invalid.");
  }
  if (
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash
  ) {
    return configurationError(
      "The robot command gateway must use an exact HTTPS endpoint without credentials, query, or fragment.",
    );
  }
  if (/\r|\n/.test(apiKey)) {
    return configurationError("The robot command gateway API key is invalid.");
  }
  return Object.freeze({ endpoint, apiKey });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return null;

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function publishedResult(value: unknown): RobotCommandTransportResult | null {
  if (
    !record(value) || !exact(value, ["accepted", "transport_message_id"]) ||
    value.accepted !== true || typeof value.transport_message_id !== "string" ||
    !MESSAGE_ID.test(value.transport_message_id)
  ) return null;
  return {
    disposition: "published",
    transportMessageId: value.transport_message_id,
  };
}

function rejectedResult(value: unknown): RobotCommandTransportResult | null {
  if (
    !record(value) ||
    !exact(value, ["accepted", "definitely_not_delivered", "error_code"]) ||
    value.accepted !== false || value.definitely_not_delivered !== true ||
    typeof value.error_code !== "string" || !ERROR_CODE.test(value.error_code)
  ) return null;
  return {
    disposition: "transport_failure",
    definitelyNotDelivered: true,
    errorCode: value.error_code,
  };
}

function unknown(errorCode: string): RobotCommandTransportResult {
  return { disposition: "delivery_unknown", errorCode };
}

function aborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError" ||
    record(error) && error.name === "AbortError";
}

export function createRobotCommandGatewayTransport(
  read: EnvironmentReader,
  fetcher: Fetcher = fetch,
): RobotCommandTransport | null {
  const configuration = readConfiguration(read);
  if (configuration === null) return null;

  return Object.freeze({
    async publish(
      publishedCommand: PublishedCommand,
      options: Readonly<{ signal: AbortSignal }>,
    ): Promise<RobotCommandTransportResult> {
      let response: Response;
      try {
        response = await fetcher(configuration.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${configuration.apiKey}`,
            "content-type": "application/json; charset=utf-8",
            "idempotency-key": publishedCommand.command.idempotency_key,
            "x-doso-command-id": publishedCommand.command.command_id,
            "x-doso-protocol": "robot-command/1",
          },
          body: JSON.stringify({
            protocol_version: 1,
            command: publishedCommand.command,
            signature_b64url: publishedCommand.signature_b64url,
          }),
          cache: "no-store",
          redirect: "error",
          signal: options.signal,
        });
      } catch (error) {
        return unknown(aborted(error)
          ? "gateway_publish_timeout"
          : "gateway_publish_error");
      }

      const body = await readBoundedJson(response).catch(() => null);
      if (response.status === 202) {
        return publishedResult(body) ?? unknown("gateway_response_invalid");
      }
      if (response.status >= 400 && response.status < 500) {
        return rejectedResult(body) ?? unknown("gateway_rejection_unproven");
      }
      return unknown(response.status >= 500
        ? "gateway_unavailable"
        : "gateway_response_invalid");
    },
  });
}
