import type { authenticate } from "../_shared/auth.ts";
import { handle, HttpError, json } from "../_shared/http.ts";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

export function uuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(value);
}

export function timestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

export function counter(value: unknown, minimum = 1): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

export function status(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "state",
      "control",
      "transport",
      ...(Object.hasOwn(value, "location") ? ["location"] : []),
    ]) ||
    !record(value.state) || !record(value.control)
  ) return false;
  if (Object.hasOwn(value, "location")) {
    const fix = value.location;
    if (
      !record(fix) ||
      !exact(fix, ["lat", "lon", "fixType", "observedAt", "accuracyM"]) ||
      typeof fix.lat !== "number" || !Number.isFinite(fix.lat) ||
      Math.abs(fix.lat) > 90 ||
      typeof fix.lon !== "number" || !Number.isFinite(fix.lon) ||
      Math.abs(fix.lon) > 180 ||
      !Number.isInteger(fix.fixType) || Number(fix.fixType) < 1 ||
      Number(fix.fixType) > 8 ||
      !timestamp(fix.observedAt) ||
      (fix.accuracyM !== null &&
        (typeof fix.accuracyM !== "number" || !Number.isFinite(fix.accuracyM) ||
          fix.accuracyM < 0 || fix.accuracyM > 100000))
    ) return false;
  }
  return exact(value.state, ["kind", "transition"]) &&
    exact(value.control, [
      "owner",
      "motorOutputEnabled",
      "criticalMotorFault",
    ]) &&
    typeof value.state.kind === "string" &&
    /^CMS_STATE_KIND_[A-Z_]{1,64}$/.test(value.state.kind) &&
    typeof value.state.transition === "string" &&
    /^CMS_TRANSITION_KIND_[A-Z_]{1,64}$/.test(value.state.transition) &&
    typeof value.control.owner === "string" &&
    /^CONTROL_OWNER_[A-Z_]{1,64}$/.test(value.control.owner) &&
    typeof value.control.motorOutputEnabled === "boolean" &&
    typeof value.control.criticalMotorFault === "boolean" &&
    typeof value.transport === "string" &&
    ["local-insecure", "mtls"].includes(value.transport);
}

function reading(value: unknown, successOnly = false): boolean {
  if (value === null) return true;
  if (
    !record(value) || !timestamp(value.observedAt) ||
    !timestamp(value.receivedAt)
  ) return false;
  return exact(value, ["observedAt", "receivedAt", "status"]) &&
      status(value.status) ||
    !successOnly && exact(value, ["observedAt", "receivedAt", "error"]) &&
      value.error === "upstream_unavailable";
}

function publicState(value: unknown, deviceId: string): boolean {
  return record(value) &&
    exact(value, [
      "deviceId",
      "simulated",
      "enabled",
      "revision",
      "activation",
      "reachable",
      "fresh",
      "lastSeenAt",
      "latest",
      "lastSuccess",
    ]) &&
    value.deviceId === deviceId && typeof value.simulated === "boolean" &&
    typeof value.enabled === "boolean" &&
    counter(value.revision) &&
    ["off", "enabling", "on", "disabling", "unavailable"].includes(
      String(value.activation),
    ) &&
    (value.reachable === null || typeof value.reachable === "boolean") &&
    typeof value.fresh === "boolean" &&
    (value.lastSeenAt === null || timestamp(value.lastSeenAt)) &&
    reading(value.latest) && reading(value.lastSuccess, true);
}

export async function readBoundedJson(
  request: Request,
  maximum: number,
): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)
  ) {
    throw new HttpError(
      413,
      "payload_too_large",
      "The request exceeds the allowed size.",
    );
  }
  if (!request.body) {
    throw new HttpError(400, "invalid_json", "A JSON object is required.");
  }
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel().catch(() => {});
        throw new HttpError(
          413,
          "payload_too_large",
          "The request exceeds the allowed size.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "invalid_json",
      "The request body could not be read.",
    );
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(
      400,
      "invalid_json",
      "A valid UTF-8 JSON object is required.",
    );
  }
  if (!record(value)) {
    throw new HttpError(400, "invalid_json", "A JSON object is required.");
  }
  return value;
}

export async function handleRemoteState(
  request: Request,
  dependencies: { authenticate: typeof authenticate },
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "GET" && request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use GET or POST.");
    }
    let authorized: Awaited<ReturnType<typeof authenticate>>;
    try {
      authorized = await dependencies.authenticate(request);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "remote_state_unavailable",
        "Remote state is temporarily unavailable.",
      );
    }
    const url = new URL(request.url);
    let deviceId: string, method: string, args: Record<string, unknown>;
    if (request.method === "GET") {
      const value = url.searchParams.get("deviceId");
      if ([...url.searchParams].length !== 1 || !uuid(value)) {
        throw new HttpError(
          400,
          "invalid_remote_state",
          "Specify one deviceId UUID.",
        );
      }
      deviceId = value;
      method = "get_remote_state";
      args = { p_device_id: deviceId };
    } else {
      const body = await readBoundedJson(request, 4096);
      if (
        url.search || !exact(body, ["deviceId", "enabled", "revision"]) ||
        !uuid(body.deviceId) || typeof body.enabled !== "boolean" ||
        !counter(body.revision)
      ) {
        throw new HttpError(
          400,
          "invalid_remote_state",
          "Specify deviceId, enabled and the current revision.",
        );
      }
      deviceId = body.deviceId;
      method = "set_remote_state";
      args = {
        p_device_id: deviceId,
        p_enabled: body.enabled,
        p_revision: body.revision,
      };
    }
    let result;
    try {
      result = await authorized.userDb.rpc(method, args);
    } catch {
      throw new HttpError(
        503,
        "remote_state_unavailable",
        "Remote state is temporarily unavailable.",
      );
    }
    if (result.error) {
      const code = result.error.code;
      if (code === "42501") {
        throw new HttpError(
          403,
          "remote_state_access_denied",
          "This device is not available to the current account.",
        );
      }
      if (code === "22023") {
        throw new HttpError(
          400,
          "invalid_remote_state",
          "The remote state request is invalid.",
        );
      }
      if (code === "40001") {
        throw new HttpError(
          409,
          "remote_state_revision_conflict",
          "Remote state changed. Read its current value before retrying.",
        );
      }
      if (code === "54000") {
        throw new HttpError(
          409,
          "remote_state_revision_exhausted",
          "The remote state setting cannot be changed.",
        );
      }
      throw new HttpError(
        503,
        "remote_state_unavailable",
        "Remote state is temporarily unavailable.",
      );
    }
    if (!publicState(result.data, deviceId)) {
      throw new HttpError(
        503,
        "remote_state_unavailable",
        "The remote state response could not be confirmed.",
      );
    }
    return json(result.data);
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}
