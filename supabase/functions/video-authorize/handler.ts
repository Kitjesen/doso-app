import { sha256Hex } from "../_shared/crypto.ts";
import { handle, HttpError, json } from "../_shared/http.ts";
import { exact, readBoundedJson } from "../remote-state/handler.ts";
import { validGrant } from "../video-access/handler.ts";

type Client = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export async function handleVideoAuthorize(
  request: Request,
  dependencies: { createClient: () => Client; now?: () => number },
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const match = /^Bearer ([0-9a-f]{64})$/.exec(
      request.headers.get("authorization") ?? "",
    );
    if (!match) {
      throw new HttpError(
        401,
        "invalid_viewer_token",
        "A viewing credential is required.",
      );
    }
    const body = await readBoundedJson(request, 128);
    if (
      new URL(request.url).search || !exact(body, ["action"]) ||
      body.action !== "video.view"
    ) {
      throw new HttpError(400, "invalid_video_access", "Specify video.view.");
    }
    let result;
    try {
      result = await dependencies.createClient().rpc("authorize_video_access", {
        p_digest: await sha256Hex(match[1]),
      });
    } catch {
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization is unavailable.",
      );
    }
    if (result.error) {
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization is unavailable.",
      );
    }
    if (result.data === null) {
      throw new HttpError(
        403,
        "video_access_denied",
        "The viewing credential is no longer valid.",
      );
    }
    if (!validGrant(result.data, dependencies.now?.() ?? Date.now())) {
      throw new HttpError(
        503,
        "video_unavailable",
        "Video authorization could not be confirmed.",
      );
    }
    return json(result.data);
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
