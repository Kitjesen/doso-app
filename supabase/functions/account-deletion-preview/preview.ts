import type { authenticate } from "../_shared/auth.ts";
import { handle, HttpError, json } from "../_shared/http.ts";

const UNRESOLVED_BLOCKERS = [
  "device_disposition_policy_unapproved",
  "retention_redaction_policy_unapproved",
  "provider_revocation_not_verified",
  "server_avatar_cleanup_unavailable",
  "inflight_command_enrollment_handling_unapproved",
  "deletion_executor_ledger_unavailable",
] as const;

function unavailable(): HttpError {
  return new HttpError(
    503,
    "preview_unavailable",
    "Account impact preview could not be confirmed.",
  );
}

export async function handleAccountDeletionPreview(
  request: Request,
  dependencies: { authenticate: typeof authenticate },
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "GET") {
      throw new HttpError(
        405,
        "method_not_allowed",
        "Use GET for a read-only preview.",
      );
    }
    if (new URL(request.url).search) {
      throw new HttpError(
        400,
        "invalid_request",
        "Preview accepts no query parameters.",
      );
    }
    let authorized: Awaited<ReturnType<typeof authenticate>>;
    try {
      // Defaults require the current active account and caller-RLS session.
      // No caller-provided ID, privileged query or authority fallback.
      authorized = await dependencies.authenticate(request);
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new HttpError(
          error.status,
          "preview_authorization_required",
          "An active authorized session is required.",
        );
      }
      throw unavailable();
    }
    let hasVisibleBoundPhysicalRobot: boolean;
    try {
      const { count, error } = await authorized.userDb.from("devices")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", authorized.caller.user.id)
        .eq("is_demo", false);
      if (
        error !== null || typeof count !== "number" ||
        !Number.isSafeInteger(count) || count < 0
      ) {
        throw unavailable();
      }
      hasVisibleBoundPhysicalRobot = count > 0;
    } catch {
      // Do not log/return database messages, rows, identifiers or credentials.
      throw unavailable();
    }
    return json({
      state: "planning_only",
      canSubmit: false,
      requestCreated: false,
      executionAvailable: false,
      scope: "caller_rls_current_devices_only",
      hasVisibleBoundPhysicalRobot,
      blockers: [
        ...UNRESOLVED_BLOCKERS,
        ...(hasVisibleBoundPhysicalRobot
          ? ["physical_robot_binding_requires_decision"]
          : []),
      ],
    });
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("access-control-allow-methods", "GET, OPTIONS");
  return response;
}
