import { HttpError } from "./http.ts";

export function actionFrom(
  request: Request,
  body: Record<string, unknown>,
  fallback?: string,
): string {
  if (typeof body.action === "string" && body.action.trim()) {
    return body.action.trim();
  }
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  if (
    last &&
    !["account-sessions", "device-binding", "admin-users", "admin-devices"]
      .includes(last)
  ) return last;
  if (fallback) return fallback;
  throw new HttpError(400, "missing_action", "action is required.");
}
