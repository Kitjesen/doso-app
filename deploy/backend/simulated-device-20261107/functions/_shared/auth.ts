import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2.112.3";
import { HttpError } from "./http.ts";

export type AppRole = "user" | "support" | "admin";

export interface Caller {
  token: string;
  user: User;
  sessionId: string;
  role: AppRole;
  accountStatus: string;
  aal: string;
  profile: Record<string, unknown>;
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function callerClient(token: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    throw new HttpError(
      401,
      "missing_authorization",
      "A Bearer access token is required.",
    );
  }
  return match[1];
}

function verifiedJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("missing payload");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    );
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid payload");
    }
    return parsed;
  } catch {
    throw new HttpError(
      401,
      "invalid_session",
      "The access token does not identify a Supabase session.",
    );
  }
}

export function jwtSessionId(token: string): string {
  const sessionId = verifiedJwtPayload(token).session_id;
  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpError(
      401,
      "invalid_session",
      "The access token does not identify a Supabase session.",
    );
  }
  return sessionId;
}

export function jwtAal(token: string): string {
  const aal = verifiedJwtPayload(token).aal;
  return typeof aal === "string" ? aal : "aal1";
}

export async function authenticate(
  request: Request,
  allowedRoles?: AppRole[],
  requireActiveSession = true,
  requireAal2 = false,
): Promise<{ caller: Caller; db: SupabaseClient; userDb: SupabaseClient }> {
  return await authenticateWithClients(
    request,
    { serviceClient, callerClient },
    allowedRoles,
    requireActiveSession,
    requireAal2,
  );
}

// Explicit SDK factories make the authorization boundary testable without
// replacing production globals or weakening the production client's privileges.
export async function authenticateWithClients(
  request: Request,
  clients: {
    serviceClient: typeof serviceClient;
    callerClient: typeof callerClient;
  },
  allowedRoles?: AppRole[],
  requireActiveSession = true,
  requireAal2 = false,
): Promise<{ caller: Caller; db: SupabaseClient; userDb: SupabaseClient }> {
  const token = bearerToken(request);
  const db = clients.serviceClient();

  // getUser performs a network verification with Supabase Auth. JWT claims are
  // decoded only after this succeeds and are never accepted as caller identity.
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) {
    throw new HttpError(
      401,
      "invalid_authorization",
      "The access token is invalid or expired.",
    );
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,email,display_name,app_role,account_status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    throw new HttpError(
      403,
      "profile_unavailable",
      "The account profile is unavailable.",
    );
  }

  const role: AppRole =
    profile.app_role === "admin" || profile.app_role === "support"
      ? profile.app_role
      : "user";
  const accountStatus = typeof profile.account_status === "string"
    ? profile.account_status
    : "active";
  if (accountStatus !== "active") {
    throw new HttpError(403, "account_inactive", "This account is not active.");
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new HttpError(
      403,
      "forbidden",
      "This action is not allowed for your role.",
    );
  }

  const sessionId = jwtSessionId(token);
  const aal = jwtAal(token);
  if (requireAal2 && aal !== "aal2") {
    throw new HttpError(
      403,
      "mfa_required",
      "Administrator actions require an AAL2 multi-factor session.",
    );
  }
  const userDb = clients.callerClient(token);
  if (requireActiveSession) {
    // Use the caller's RLS boundary, never a service-role terminal visibility
    // check. Joint Auth-session authority requires the reviewed SQL candidate
    // to be deployed before the Edge change; no privileged fallback is safe.
    const { data: terminal, error: terminalError } = await userDb.from(
      "account_terminals",
    )
      .select("id,revoked_at").eq("user_id", authData.user.id).eq(
        "auth_session_id",
        sessionId,
      ).maybeSingle();
    if (terminalError !== null) {
      throw new HttpError(
        403,
        "session_check_failed",
        "The DOSO terminal session could not be verified.",
      );
    }
    if (!terminal || typeof terminal.id !== "string" || !terminal.id
      || terminal.revoked_at !== null) {
      throw new HttpError(
        401,
        "session_revoked",
        "This DOSO terminal session is not active.",
      );
    }
  }

  return {
    db,
    userDb,
    caller: {
      token,
      user: authData.user,
      sessionId,
      role,
      accountStatus,
      aal,
      profile,
    },
  };
}
