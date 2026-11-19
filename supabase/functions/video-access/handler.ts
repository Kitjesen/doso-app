import type { authenticate } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { handle, HttpError, json } from "../_shared/http.ts";
import {
  exact,
  readBoundedJson,
  record,
  uuid,
} from "../remote-state/handler.ts";

export function validGrant(value: unknown, now: number): value is {
  viewerId: string;
  deviceId: string;
  expiresAt: number;
} {
  return record(value) && exact(value, ["viewerId", "deviceId", "expiresAt"]) &&
    uuid(value.viewerId) && uuid(value.deviceId) &&
    Number.isSafeInteger(value.expiresAt) && Number(value.expiresAt) > now &&
    // Database time owns expiry; tolerate a small host-clock offset without extending it.
    Number(value.expiresAt) <= now + 65_000;
}

export async function handleVideoAccess(
  request: Request,
  dependencies: { authenticate: typeof authenticate; now?: () => number },
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const authorized = await dependencies.authenticate(request);
    const body = await readBoundedJson(request, 1024);
    if (
      new URL(request.url).search || !exact(body, ["action", "deviceId"]) ||
      !uuid(body.deviceId) || !["open", "close"].includes(String(body.action))
    ) {
      throw new HttpError(
        400,
        "invalid_video_access",
        "Specify action and deviceId.",
      );
    }
    const open = body.action === "open";
    const token = open
      ? Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("")
      : null;
    let result;
    try {
      result = await authorized.userDb.rpc(
        open ? "open_video_access" : "close_video_access",
        {
          p_device_id: body.deviceId,
          ...(token ? { p_digest: await sha256Hex(token) } : {}),
        },
      );
    } catch {
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization is unavailable.",
      );
    }
    if (result.error) {
      if (result.error.code === "42501") {
        throw new HttpError(
          403,
          "video_access_denied",
          "This device is not available to this account.",
        );
      }
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization is unavailable.",
      );
    }
    if (!open) return new Response(null, { status: 204 });
    const now = dependencies.now?.() ?? Date.now();
    if (
      !validGrant(result.data, now) ||
      result.data.viewerId !== authorized.caller.user.id ||
      result.data.deviceId !== body.deviceId
    ) {
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization could not be confirmed.",
      );
    }
    return json({ ...result.data, viewerToken: token });
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
