import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import type { Caller } from "./auth.ts";

const SECRET_KEY_PATTERN =
  /(password|token|secret|code|digest|authorization|key|session)/i;

export function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, entry]) => [key, sanitizeMetadata(entry)]),
  );
}

export async function writeAudit(
  db: SupabaseClient,
  caller: Caller,
  input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    outcome: "success" | "denied" | "failed";
    requestId?: string | null;
    request?: Request;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const requestId = input.request?.headers.get("x-request-id")?.trim().slice(
    0,
    200,
  ) || input.requestId?.trim().slice(0, 200) || crypto.randomUUID();
  const { error } = await db.from("audit_logs").insert({
    actor_user_id: caller.user.id,
    target_user_id: input.targetType === "user" && input.targetId
      ? input.targetId
      : null,
    action: input.action,
    resource_type: input.targetType,
    resource_id: input.targetId ?? null,
    metadata: sanitizeMetadata({
      ...input.metadata,
      actorRole: caller.role,
      outcome: input.outcome,
      requestId,
    }),
  });
  if (error) throw error;
}
