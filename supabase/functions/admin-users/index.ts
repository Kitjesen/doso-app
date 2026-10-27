import { type AppRole, authenticate } from "../_shared/auth.ts";
import { actionFrom } from "../_shared/actions.ts";
import {
  AccountStateSyncError,
  activateAccountFailSafe,
  suspendAccountFailSafe,
} from "../_shared/adminAccountState.ts";
import {
  handle,
  HttpError,
  json,
  optionalString,
  positiveInteger,
  readJson,
  requiredString,
} from "../_shared/http.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  filterAndPageDirectoryUsers,
  loadProfilesByUserId,
  mergeAuthUsersWithProfiles,
  scanAuthUsers,
} from "../_shared/userDirectory.ts";

const PUBLIC_USER_FIELDS = (user: Record<string, unknown>) => ({
  id: user.id,
  email: user.email,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
  lastSignInAt: user.last_sign_in_at,
  emailConfirmedAt: user.email_confirmed_at,
  bannedUntil: user.banned_until,
});

const PROFILE_FIELDS =
  "id,email,username,display_name,app_role,account_status,suspended_at,suspension_reason";

function requireAdmin(role: AppRole): void {
  if (role !== "admin") {
    throw new HttpError(
      403,
      "admin_required",
      "This action requires the admin role.",
    );
  }
}

function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.trim().slice(0, 200) ||
    crypto.randomUUID();
}

Deno.serve((request) =>
  handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const body = await readJson(request);
    const action = actionFrom(request, body);
    const { caller, db } = await authenticate(
      request,
      ["support", "admin"],
      true,
      true,
    );

    if (action === "list_users") {
      const page = positiveInteger(body.page, 1, 10_000);
      const perPage = positiveInteger(body.perPage, 25, 100);
      const search = optionalString(body, "search", 200)?.toLowerCase();
      let users: ReturnType<typeof mergeAuthUsersWithProfiles>;
      let total: number;
      if (search) {
        const allUsers = await scanAuthUsers(async (scanPage, scanPerPage) => {
          const { data, error } = await db.auth.admin.listUsers({
            page: scanPage,
            perPage: scanPerPage,
          });
          if (error) throw error;
          return {
            users: data.users as unknown as Record<string, unknown>[],
            total: data.total,
          };
        });
        const profileById = await loadProfilesByUserId(
          allUsers.map((user) => String(user.id ?? "")),
          async (userIds) => {
            const { data, error } = await db.from("profiles").select(
              PROFILE_FIELDS,
            ).in("id", userIds);
            if (error) throw error;
            return (data ?? []) as Record<string, unknown>[];
          },
        );
        const matches = filterAndPageDirectoryUsers(
          mergeAuthUsersWithProfiles(allUsers, profileById),
          search,
          page,
          perPage,
        );
        users = matches.users;
        total = matches.total;
      } else {
        const { data, error } = await db.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error) throw error;
        const authUsers = data.users as unknown as Record<string, unknown>[];
        const profileById = await loadProfilesByUserId(
          authUsers.map((user) => String(user.id ?? "")),
          async (userIds) => {
            const { data: profiles, error: profilesError } = await db.from(
              "profiles",
            ).select(PROFILE_FIELDS).in("id", userIds);
            if (profilesError) throw profilesError;
            return (profiles ?? []) as Record<string, unknown>[];
          },
        );
        users = mergeAuthUsersWithProfiles(authUsers, profileById);
        total = data.total;
      }
      return json({
        users: users.map((user) => ({
          ...PUBLIC_USER_FIELDS(user),
          profile: user.profile,
        })),
        pagination: { page, perPage, total },
      });
    }

    if (action === "list_audit_logs") {
      const page = positiveInteger(body.page, 1, 10_000);
      const perPage = positiveInteger(body.perPage, 25, 100);
      const from = (page - 1) * perPage;
      let query = db.from("audit_logs").select(
        "id,actor_user_id,target_user_id,action,resource_type,resource_id,metadata,created_at",
        { count: "exact" },
      ).order("created_at", { ascending: false }).range(
        from,
        from + perPage - 1,
      );
      const targetUserId = optionalString(body, "targetUserId", 64);
      if (targetUserId) query = query.eq("target_user_id", targetUserId);
      const { data, error, count } = await query;
      if (error) throw error;
      return json({
        auditLogs: data ?? [],
        pagination: { page, perPage, total: count ?? 0 },
      });
    }

    const targetUserId = requiredString(body, "userId", 64);
    const { data: targetProfile, error: profileError } = await db.from(
      "profiles",
    )
      .select("id,email,app_role,account_status").eq("id", targetUserId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!targetProfile) {
      throw new HttpError(404, "user_not_found", "User was not found.");
    }

    if (action === "send_password_reset") {
      const reason = optionalString(body, "reason", 500) ?? "admin_request";
      const { data: authUserData, error: authUserError } = await db.auth.admin
        .getUserById(targetUserId);
      if (authUserError) throw authUserError;
      const authUser = authUserData.user;
      const verifiedEmail = authUser?.email?.trim();
      if (!verifiedEmail || !authUser.email_confirmed_at) {
        throw new HttpError(
          409,
          "verified_email_required",
          "Password reset requires a verified email address.",
        );
      }
      const redirectTo = Deno.env.get("PASSWORD_RECOVERY_REDIRECT_URL");
      const { error } = await db.auth.resetPasswordForEmail(
        verifiedEmail,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) throw error;
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "user.password_reset_sent",
        targetType: "user",
        targetId: targetUserId,
        metadata: { reason },
      });
      return json({ sent: true });
    }

    requireAdmin(caller.role);
    if (
      caller.user.id === targetUserId &&
      ["set_status", "set_role"].includes(action)
    ) {
      throw new HttpError(
        409,
        "self_management_blocked",
        "Use another administrator for changes to your own role or status.",
      );
    }

    if (action === "list_user_terminals") {
      const { data, error } = await db.from("account_terminals").select(
        "id,platform,device_label,app_version,first_seen_at,last_seen_at,revoked_at,revocation_reason",
      ).eq("user_id", targetUserId).order("last_seen_at", { ascending: false });
      if (error) throw error;
      return json({
        userId: targetUserId,
        terminals: (data ?? []).map((terminal) => ({
          id: terminal.id,
          device_label: terminal.device_label,
          platform: terminal.platform,
          app_version: terminal.app_version,
          created_at: terminal.first_seen_at,
          last_seen_at: terminal.last_seen_at,
          revoked_at: terminal.revoked_at,
          revocation_reason: terminal.revocation_reason,
        })),
      });
    }

    if (action === "list_user_identities") {
      const { data, error } = await db.rpc("admin_list_user_identities", {
        p_user_id: targetUserId,
      });
      if (error) throw error;
      return json({
        userId: targetUserId,
        identities: (data ?? []).map((identity: Record<string, unknown>) => ({
          registry_id: identity.registry_id,
          provider_key: identity.provider_key,
          kind: identity.kind,
          email_verified: identity.email_verified,
          linked_at: identity.linked_at,
          provider_last_sign_in_at: identity.provider_last_sign_in_at,
          last_observed_at: identity.last_observed_at,
          unlinked_at: identity.unlinked_at,
          status: identity.status,
        })),
      });
    }

    if (action === "verify_username") {
      const reason = optionalString(body, "reason", 500) ??
        "admin_username_verification";
      const { error } = await db.rpc("admin_verify_username", {
        p_actor_id: caller.user.id,
        p_actor_role: caller.role,
        p_user_id: targetUserId,
        p_reason: reason,
        p_request_id: requestId(request),
      });
      if (error) {
        if (error.message.includes("profile_not_found")) {
          throw new HttpError(404, "user_not_found", "User was not found.");
        }
        if (error.message.includes("username_not_admin_verifiable")) {
          throw new HttpError(
            409,
            "username_not_admin_verifiable",
            "Only a legacy inferred username can be verified by an administrator.",
          );
        }
        throw error;
      }
      return json({
        userId: targetUserId,
        verified: true,
      });
    }

    if (action === "reconcile_user_identities") {
      try {
        const { data: observedCount, error } = await db.rpc(
          "admin_reconcile_user_identities",
          { p_user_id: targetUserId },
        );
        if (error) throw error;
        await writeAudit(db, caller, {
          request,
          outcome: "success",
          action: "user.identities_reconciled",
          targetType: "user",
          targetId: targetUserId,
          metadata: { observedIdentityCount: Number(observedCount ?? 0) },
        });
        return json({
          userId: targetUserId,
          observedIdentityCount: Number(observedCount ?? 0),
          reconciled: true,
        });
      } catch (error) {
        await writeAudit(db, caller, {
          request,
          outcome: "failed",
          action: "user.identities_reconciliation_failed",
          targetType: "user",
          targetId: targetUserId,
          metadata: {
            errorType: error instanceof Error ? error.name : "UnknownError",
          },
        });
        throw error;
      }
    }

    if (action === "revoke_user_terminal") {
      const terminalId = requiredString(body, "terminalId", 64);
      const reason = optionalString(body, "reason", 200) ??
        "admin_terminal_revoke";
      const { data: revoked, error } = await db.rpc(
        "admin_revoke_user_terminal",
        {
          p_actor_id: caller.user.id,
          p_actor_role: caller.role,
          p_user_id: targetUserId,
          p_terminal_id: terminalId,
          p_reason: reason,
          p_request_id: requestId(request),
        },
      );
      if (error) {
        if (error.message.includes("terminal does not belong to user")) {
          throw new HttpError(
            404,
            "terminal_not_found",
            "Terminal was not found for this user.",
          );
        }
        throw error;
      }
      return json({
        userId: targetUserId,
        terminalId,
        revoked: Number(revoked ?? 0) === 1,
      });
    }

    if (action === "set_status") {
      const status = requiredString(body, "status", 20);
      if (!["active", "suspended"].includes(status)) {
        throw new HttpError(
          400,
          "invalid_status",
          "status must be active or suspended.",
        );
      }
      const reason = optionalString(body, "reason", 500) ??
        (status === "suspended" ? "admin_suspension" : "admin_reactivation");
      if (status === "suspended") {
        const operationRequestId = requestId(request);
        try {
          const result = await suspendAccountFailSafe({
            blockDoso: async () => {
              const { data, error } = await db.rpc(
                "admin_suspend_user_account",
                {
                  p_actor_id: caller.user.id,
                  p_actor_role: caller.role,
                  p_user_id: targetUserId,
                  p_reason: reason,
                  p_request_id: operationRequestId,
                },
              );
              if (error) throw error;
              return Number(data ?? 0);
            },
            banAuth: async () => {
              const { error } = await db.auth.admin.updateUserById(
                targetUserId,
                { ban_duration: "876000h" },
              );
              if (error) throw error;
            },
          });
          await writeAudit(db, caller, {
            request,
            outcome: "success",
            action: "user.auth_ban_synchronized",
            targetType: "user",
            targetId: targetUserId,
            metadata: { operationRequestId },
          });
          return json({ userId: targetUserId, ...result });
        } catch (error) {
          if (error instanceof AccountStateSyncError) {
            return json({
              userId: targetUserId,
              ...error.state,
              error: { code: error.code, message: error.message },
            }, 503);
          }
          throw error;
        }
      }

      try {
        const result = await activateAccountFailSafe({
          currentStatus: targetProfile.account_status,
          unbanAuth: async () => {
            const { error } = await db.auth.admin.updateUserById(
              targetUserId,
              { ban_duration: "none" },
            );
            if (error) throw error;
          },
          activateDoso: async () => {
            const { error } = await db.rpc(
              "admin_activate_user_account",
              {
                p_actor_id: caller.user.id,
                p_actor_role: caller.role,
                p_user_id: targetUserId,
                p_reason: reason,
                p_request_id: requestId(request),
              },
            );
            if (error) throw error;
          },
        });
        return json({ userId: targetUserId, ...result });
      } catch (error) {
        if (error instanceof AccountStateSyncError) {
          return json({
            userId: targetUserId,
            ...error.state,
            error: { code: error.code, message: error.message },
          }, 503);
        }
        throw error;
      }
    }

    if (action === "set_role") {
      const role = requiredString(body, "role", 20);
      const reason = optionalString(body, "reason", 500) ?? "role_change";
      if (!["user", "support", "admin"].includes(role)) {
        throw new HttpError(
          400,
          "invalid_role",
          "role must be user, support, or admin.",
        );
      }
      const { error } = await db.from("profiles").update({ app_role: role }).eq(
        "id",
        targetUserId,
      );
      if (error) throw error;
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "user.role_changed",
        targetType: "user",
        targetId: targetUserId,
        metadata: {
          previousRole: targetProfile.app_role,
          newRole: role,
          reason,
        },
      });
      return json({ userId: targetUserId, role });
    }

    if (action === "global_signout") {
      const reason = optionalString(body, "reason", 500) ??
        "admin_global_signout";
      const { data: revoked, error } = await db.rpc(
        "admin_revoke_user_terminals",
        {
          p_user_id: targetUserId,
          p_reason: reason,
        },
      );
      if (error) throw error;
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "user.global_signout",
        targetType: "user",
        targetId: targetUserId,
        metadata: { revokedCount: revoked, reason },
      });
      return json({
        userId: targetUserId,
        applicationSessionsRevoked: Number(revoked ?? 0),
        nativeAuth: {
          attempted: false,
          succeeded: false,
          scope: "none",
          note:
            "Supabase Auth has no admin API to globally sign out by user id without that user's token. DOSO RLS and Edge Functions reject all registered sessions immediately.",
        },
      });
    }

    throw new HttpError(404, "unknown_action", `Unknown action: ${action}`);
  })
);
