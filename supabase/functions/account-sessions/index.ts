import { authenticate } from "../_shared/auth.ts";
import { actionFrom } from "../_shared/actions.ts";
import {
  handle,
  HttpError,
  json,
  optionalString,
  readJson,
  requiredString,
} from "../_shared/http.ts";
import { writeAudit } from "../_shared/audit.ts";

const SAFE_TERMINAL_COLUMNS =
  "id,installation_id,platform,device_label,app_version,first_seen_at,last_seen_at,revoked_at,revocation_reason,auth_session_id";

function publicTerminal(
  terminal: Record<string, unknown> | null,
  currentSessionId: string,
) {
  if (!terminal) return null;
  const { auth_session_id, user_id: _userId, user_agent: _userAgent, ...safe } =
    terminal;
  return { ...safe, isCurrent: auth_session_id === currentSessionId };
}

async function invokeNativeSignOut(
  db: ReturnType<typeof import("../_shared/auth.ts").serviceClient>,
  token: string,
  scope: "local" | "others" | "global",
): Promise<
  { attempted: true; succeeded: boolean; scope: string; note?: string }
> {
  // Supabase supports only local / others / global sign-out scopes. It does
  // not expose a server API to revoke an arbitrary session id. A specific
  // terminal is therefore revoked immediately at DOSO's database/function
  // boundary, while native Auth revocation applies only for these scopes.
  const { error } = await db.auth.admin.signOut(token, scope);
  return error
    ? {
      attempted: true,
      succeeded: false,
      scope,
      note:
        "DOSO application access was revoked; native Auth revocation could not be confirmed.",
    }
    : { attempted: true, succeeded: true, scope };
}

Deno.serve((request) =>
  handle(request, async () => {
    if (!["GET", "POST"].includes(request.method)) {
      throw new HttpError(405, "method_not_allowed", "Use GET or POST.");
    }
    const body = await readJson(request);
    const action = actionFrom(
      request,
      body,
      request.method === "GET" ? "list" : undefined,
    );
    const { caller, db, userDb } = await authenticate(
      request,
      undefined,
      action !== "register",
    );

    if (action === "register") {
      const { data, error } = await userDb.rpc("register_account_terminal", {
        p_installation_id: requiredString(body, "installationId", 100),
        p_platform: requiredString(body, "platform", 30),
        p_device_label: requiredString(body, "deviceLabel", 100),
        p_app_version: requiredString(body, "appVersion", 30),
        p_user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      });
      if (error) {
        throw error;
      }
      return json({ terminal: publicTerminal(data, caller.sessionId) });
    }

    if (action === "list" || action === "list_sessions") {
      const { data, error } = await userDb.from("account_terminals").select(
        SAFE_TERMINAL_COLUMNS,
      )
        .eq("user_id", caller.user.id).order("last_seen_at", {
          ascending: false,
        });
      if (error) throw error;
      return json({
        terminals: (data ?? []).map((terminal) =>
          publicTerminal(terminal, caller.sessionId)
        ),
      });
    }

    if (action === "heartbeat") {
      const { data, error } = await userDb.rpc("heartbeat_current_terminal");
      if (error) throw error;
      if (!data || data.revoked_at) {
        throw new HttpError(
          401,
          "session_revoked",
          "This DOSO terminal session has been revoked.",
        );
      }
      return json({ terminal: publicTerminal(data, caller.sessionId) });
    }

    if (action === "revoke_one" || action === "revoke") {
      const terminalId = requiredString(body, "terminalId", 64);
      const { data: terminal, error: findError } = await db.from(
        "account_terminals",
      )
        .select("id,auth_session_id,revoked_at").eq("id", terminalId).eq(
          "user_id",
          caller.user.id,
        ).maybeSingle();
      if (findError) throw findError;
      if (!terminal) {
        throw new HttpError(
          404,
          "terminal_not_found",
          "Terminal was not found.",
        );
      }
      const { data: count, error } = await userDb.rpc(
        "revoke_account_terminal",
        {
          p_terminal_id: terminalId,
          p_reason: optionalString(body, "reason", 100) ?? "user_request",
        },
      );
      if (error) throw error;
      const isCurrent = terminal.auth_session_id === caller.sessionId;
      const nativeAuth = isCurrent
        ? await invokeNativeSignOut(db, caller.token, "local")
        : {
          attempted: false,
          succeeded: false,
          scope: "none",
          note:
            "Supabase Auth cannot revoke one arbitrary remote session; DOSO RLS and Edge Functions reject it immediately.",
        };
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "terminal.revoke",
        targetType: "terminal",
        targetId: terminalId,
        metadata: { isCurrent },
      });
      return json({
        revoked: Number(count ?? 0),
        applicationAccessRevoked: true,
        nativeAuth,
      });
    }

    if (action === "revoke_others") {
      const { data: count, error } = await userDb.rpc(
        "revoke_other_terminals",
        { p_reason: "user_request" },
      );
      if (error) throw error;
      const nativeAuth = await invokeNativeSignOut(db, caller.token, "others");
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "terminal.revoke_others",
        targetType: "user",
        targetId: caller.user.id,
        metadata: { revokedCount: count },
      });
      return json({
        revoked: Number(count ?? 0),
        applicationAccessRevoked: true,
        nativeAuth,
      });
    }

    if (action === "revoke_all") {
      const { data: count, error } = await userDb.rpc("revoke_all_terminals", {
        p_reason: "user_request",
      });
      if (error) throw error;
      const nativeAuth = await invokeNativeSignOut(db, caller.token, "global");
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "terminal.revoke_all",
        targetType: "user",
        targetId: caller.user.id,
        metadata: { revokedCount: count },
      });
      return json({
        revoked: Number(count ?? 0),
        applicationAccessRevoked: true,
        nativeAuth,
      });
    }

    throw new HttpError(404, "unknown_action", `Unknown action: ${action}`);
  })
);
