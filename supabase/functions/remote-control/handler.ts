import type { authenticate } from "../_shared/auth.ts";
import { handle, HttpError, json } from "../_shared/http.ts";
import {
  counter,
  exact,
  readBoundedJson,
  record,
  timestamp,
  uuid,
} from "../remote-state/handler.ts";

type Dependencies = {
  authenticate: typeof authenticate;
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
};

function unavailable(): HttpError {
  return new HttpError(
    503,
    "remote_control_unavailable",
    "Remote control is temporarily unavailable.",
  );
}

function endpoint(value: string | undefined): URL {
  try {
    const url = new URL(value ?? "");
    const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname !== "/"
    ) {
      throw unavailable();
    }
    return url;
  } catch {
    throw unavailable();
  }
}

async function gatewayJson(
  response: Response,
): Promise<Record<string, unknown>> {
  if (
    !response.headers.get("content-type")?.toLowerCase().includes(
      "application/json",
    ) || !response.body
  ) {
    throw unavailable();
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12 * 1024) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!record(value)) throw unavailable();
  return value;
}

export async function handleRemoteControl(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const body = await readBoundedJson(request, 1024);
    if (
      new URL(request.url).search || !uuid(body.deviceId) ||
      !(body.action === "create" && exact(body, ["action", "deviceId"]) ||
        body.action === "close" &&
          exact(body, ["action", "deviceId", "sessionId"]) &&
          uuid(body.sessionId))
    ) {
      throw new HttpError(
        400,
        "invalid_remote_control",
        "Specify a device and a supported control-session action.",
      );
    }
    let authorized: Awaited<ReturnType<typeof authenticate>>;
    try {
      authorized = await dependencies.authenticate(request);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw unavailable();
    }
    const operatorId = authorized.caller.user.id;
    if (!uuid(operatorId)) throw unavailable();
    let device;
    try {
      const result = await authorized.userDb.from("devices")
        .select("id,robot_authorization_epoch")
        .eq("id", body.deviceId).eq("owner_id", operatorId).eq("is_demo", false)
        .eq("is_simulated", false).maybeSingle();
      if (result.error) throw unavailable();
      device = result.data;
    } catch {
      throw unavailable();
    }
    if (!device) {
      throw new HttpError(
        403,
        "remote_control_access_denied",
        "This device is not owned by the current account.",
      );
    }
    if (
      device.id !== body.deviceId || !counter(device.robot_authorization_epoch)
    ) throw unavailable();
    const env = dependencies.env ?? Deno.env.get;
    const gateway = endpoint(env("DOSO_CONTROL_GATEWAY_URL"));
    const publicEndpoint = body.action === "create"
      ? endpoint(env("DOSO_CONTROL_PUBLIC_URL")).origin
      : undefined;
    const key = env("DOSO_CONTROL_GATEWAY_KEY");
    if (!key || !/^[\x21-\x7e]{32,256}$/.test(key)) throw unavailable();
    const path = `/api/v1/robots/${body.deviceId}/control/sessions${
      body.action === "close" ? `/${body.sessionId}` : ""
    }`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const upstream = await (dependencies.fetch ?? fetch)(
        new URL(path, gateway),
        {
          method: body.action === "create" ? "POST" : "DELETE",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "content-type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            operatorId,
            authorizationEpoch: device.robot_authorization_epoch,
          }),
        },
      );
      if (upstream.status === 409) {
        throw new HttpError(
          409,
          "remote_control_busy",
          "The robot already has a control session.",
        );
      }
      if (!upstream.ok || upstream.redirected) throw unavailable();
      const value = await gatewayJson(upstream);
      if (body.action === "close") {
        if (!exact(value, ["closed"]) || value.closed !== true) {
          throw unavailable();
        }
        return json({ closed: true });
      }
      if (
        !exact(value, ["deviceId", "sessionId", "expiresAt", "grant"]) ||
        value.deviceId !== body.deviceId ||
        !uuid(value.sessionId) || !timestamp(value.expiresAt) ||
        Date.parse(value.expiresAt) <= Date.now() ||
        Date.parse(value.expiresAt) > Date.now() + 32_000 ||
        typeof value.grant !== "string" || !value.grant ||
        new TextEncoder().encode(value.grant).length > 8192
      ) {
        throw unavailable();
      }
      return json({ ...value, endpoint: publicEndpoint });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timeout);
    }
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}
