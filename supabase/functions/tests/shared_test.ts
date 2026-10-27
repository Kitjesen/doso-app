import { actionFrom } from "../_shared/actions.ts";
import {
  AccountStateSyncError,
  activateAccountFailSafe,
  suspendAccountFailSafe,
} from "../_shared/adminAccountState.ts";
import { normalizeBindingCode, sha256Hex } from "../_shared/crypto.ts";
import {
  handle,
  HttpError,
  isOriginAllowed,
  localWebOriginEscapeEnabled,
  optionalString,
  parseAllowedWebOrigins,
  positiveInteger,
  requiredString,
} from "../_shared/http.ts";
import { sanitizeMetadata } from "../_shared/audit.ts";
import {
  AUTH_USER_SCAN_PAGE_SIZE,
  filterAndPageDirectoryUsers,
  loadProfilesByUserId,
  MAX_AUTH_USERS_TO_SCAN,
  mergeAuthUsersWithProfiles,
  PROFILE_LOOKUP_BATCH_SIZE,
  scanAuthUsers,
} from "../_shared/userDirectory.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(
  action: () => Promise<unknown>,
  errorType: typeof Error,
  messageFragment: string,
) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof errorType, "rejection used the wrong error type");
    assert(
      error.message.includes(messageFragment),
      `rejection did not include ${messageFragment}`,
    );
    return;
  }
  throw new Error("expected promise to reject");
}

Deno.test("binding code normalization and digest are deterministic", async () => {
  const normalized = normalizeBindingCode(" abcd-2345 ");
  assert(normalized === "ABCD2345", "binding code was not normalized");
  assert(
    await sha256Hex(normalized) ===
      "a00d76646eba91b057841554d5c8334f498dc592ed744bce404f21fe271cd36e",
    "unexpected SHA-256 digest",
  );
});

Deno.test("audit metadata recursively removes secrets", () => {
  const sanitized = sanitizeMetadata({
    reason: "support",
    password: "never-store-this",
    sessionId: "never-store-this",
    nested: { accessToken: "never-store-this", status: "ok" },
    entries: [{ bindingCodeDigest: "never-store-this", id: "safe" }],
  }) as Record<string, unknown>;
  assert(!("password" in sanitized), "password leaked");
  assert(
    JSON.stringify(sanitized) ===
      '{"reason":"support","nested":{"status":"ok"},"entries":[{"id":"safe"}]}',
    "metadata was not sanitized",
  );
});

Deno.test("action dispatcher supports JSON action and path fallback", () => {
  const request = new Request(
    "https://example.test/functions/v1/admin-users/list_users",
    { method: "POST" },
  );
  assert(
    actionFrom(request, {}) === "list_users",
    "path action was not detected",
  );
  assert(
    actionFrom(request, { action: "set_status" }) === "set_status",
    "body action must win",
  );
});

Deno.test("request validation bounds untrusted input", () => {
  assert(
    requiredString({ id: " abc " }, "id") === "abc",
    "required string was not trimmed",
  );
  assert(
    optionalString({}, "reason") === null,
    "optional string should default to null",
  );
  assert(
    positiveInteger(500, 25, 100) === 100,
    "pagination maximum was not applied",
  );
  let threw = false;
  try {
    requiredString({ id: "" }, "id");
  } catch (error) {
    threw = error instanceof HttpError && error.status === 400;
  }
  assert(threw, "missing input should raise a 400 HttpError");
});

Deno.test("configured web origins restrict browsers while native requests remain valid", () => {
  assert(
    JSON.stringify(parseAllowedWebOrigins(
      " https://admin.doso.test,https://app.doso.test,https://admin.doso.test ",
      "https://legacy.doso.test",
    )) ===
      '["https://admin.doso.test","https://app.doso.test"]',
    "comma-separated origins were not normalized",
  );
  assert(
    JSON.stringify(
      parseAllowedWebOrigins(undefined, "https://legacy.doso.test"),
    ) ===
      '["https://legacy.doso.test"]',
    "legacy administrator origin was not preserved",
  );
  const allowed = ["https://app.doso.test"];
  assert(
    isOriginAllowed(null, allowed),
    "native requests must not require Origin",
  );
  assert(
    isOriginAllowed("https://app.doso.test", allowed),
    "configured browser origin was rejected",
  );
  assert(
    !isOriginAllowed("https://evil.test", allowed),
    "unconfigured browser origin was accepted",
  );
  assert(
    !isOriginAllowed("https://app.doso.test", []),
    "an absent allowlist must reject browser origins by default",
  );
  assert(
    isOriginAllowed("http://localhost:8081", [], true),
    "the explicit local-development escape hatch was ignored",
  );
  assert(
    localWebOriginEscapeEnabled(" TRUE ") &&
      !localWebOriginEscapeEnabled("1") &&
      !localWebOriginEscapeEnabled(undefined),
    "the local-development escape hatch must require an explicit true value",
  );
});

Deno.test("CORS applies one fail-closed decision to preflight and actual requests", async () => {
  const keys = [
    "DOSO_ALLOWED_WEB_ORIGINS",
    "DOSO_ALLOWED_ADMIN_ORIGIN",
    "DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV",
  ] as const;
  const original = new Map(keys.map((key) => [key, Deno.env.get(key)]));
  try {
    for (const key of keys) Deno.env.delete(key);
    const origin = "https://browser.doso.test";
    const deniedPreflight = await handle(
      new Request("https://edge.doso.test", {
        method: "OPTIONS",
        headers: { origin },
      }),
      () => Promise.resolve(new Response("must not run")),
    );
    const deniedActual = await handle(
      new Request("https://edge.doso.test", { headers: { origin } }),
      () => Promise.resolve(new Response("must not run")),
    );
    for (const response of [deniedPreflight, deniedActual]) {
      assert(
        response.status === 403,
        "unconfigured browser origin was not denied",
      );
      assert(
        response.headers.get("access-control-allow-origin") === null,
        "denied browser origin received a CORS allow header",
      );
    }

    Deno.env.set("DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV", "true");
    const allowedPreflight = await handle(
      new Request("https://edge.doso.test", {
        method: "OPTIONS",
        headers: { origin },
      }),
      () => Promise.resolve(new Response("must not run")),
    );
    const allowedActual = await handle(
      new Request("https://edge.doso.test", { headers: { origin } }),
      () => Promise.resolve(new Response("ok")),
    );
    assert(allowedPreflight.status === 204, "local preflight was not allowed");
    assert(
      allowedActual.status === 200,
      "local actual request was not allowed",
    );
    for (const response of [allowedPreflight, allowedActual]) {
      assert(
        response.headers.get("access-control-allow-origin") === origin,
        "preflight and actual response used different CORS decisions",
      );
      assert(
        response.headers.get("access-control-allow-origin") !== "*",
        "local escape hatch must echo the requesting origin instead of wildcarding",
      );
    }

    Deno.env.delete("DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV");
    Deno.env.set("DOSO_ALLOWED_WEB_ORIGINS", origin);
    const allowlisted = await handle(
      new Request("https://edge.doso.test", { headers: { origin } }),
      () => Promise.resolve(new Response("ok")),
    );
    assert(
      allowlisted.status === 200,
      "allowlisted browser origin was rejected",
    );

    const native = await handle(
      new Request("https://edge.doso.test"),
      () => Promise.resolve(new Response("ok")),
    );
    assert(native.status === 200, "native request without Origin was rejected");
    assert(
      native.headers.get("access-control-allow-origin") === null,
      "native request received an unnecessary browser CORS header",
    );
  } finally {
    for (const key of keys) {
      const value = original.get(key);
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test("admin user directory search scans auth, merges profiles, then paginates", async () => {
  const firstPage = Array.from(
    { length: AUTH_USER_SCAN_PAGE_SIZE },
    (_, index) => ({ id: `user-${index}`, email: `user${index}@example.test` }),
  );
  const finalPage = [
    { id: "remote-match-1", email: "pilot@doso.test" },
    { id: "remote-match-2", email: "mechanic@doso.test" },
  ];
  const requestedPages: number[] = [];
  const users = await scanAuthUsers(async (page) => {
    requestedPages.push(page);
    return {
      users: page === 1 ? firstPage : finalPage,
      total: firstPage.length + finalPage.length,
    };
  });
  const profileById = await loadProfilesByUserId(
    users.map((user) => String(user.id)),
    (ids) =>
      Promise.resolve(
        ids.includes("remote-match-2")
          ? [{ id: "remote-match-2", username: "pilot_robot" }]
          : [],
      ),
  );
  const directory = mergeAuthUsersWithProfiles(users, profileById);
  const result = filterAndPageDirectoryUsers(directory, "pilot", 2, 1);
  assert(
    JSON.stringify(requestedPages) === "[1,2]",
    "directory scan did not read every Auth page",
  );
  assert(
    result.total === 2,
    "matching total must describe the email/username union",
  );
  assert(
    result.users[0]?.id === "remote-match-2",
    "pagination was not applied after global filtering",
  );
});

Deno.test("admin profile lookups are bounded batches instead of N+1 queries", async () => {
  const ids = Array.from(
    { length: PROFILE_LOOKUP_BATCH_SIZE + 1 },
    (_, index) => `user-${index}`,
  );
  const batches: string[][] = [];
  const profileById = await loadProfilesByUserId(ids, (batch) => {
    batches.push(batch);
    return Promise.resolve(batch.map((id) => ({ id, username: `name-${id}` })));
  });
  assert(batches.length === 2, "profile lookup did not use bounded batches");
  assert(
    batches[0].length === PROFILE_LOOKUP_BATCH_SIZE && batches[1].length === 1,
    "profile batches exceeded their configured bound",
  );
  assert(profileById.size === ids.length, "profile lookup lost directory rows");
});

Deno.test("auth directory scan fails explicitly above its supported bound", async () => {
  let error: unknown;
  try {
    await scanAuthUsers(async () => ({
      users: [],
      total: MAX_AUTH_USERS_TO_SCAN + 1,
    }));
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof HttpError &&
      error.status === 413 && error.code === "user_directory_too_large",
    "oversized Auth directories need an explicit bounded-scan error",
  );
});

Deno.test("account session RPCs use caller-scoped client, never service auth context", async () => {
  const source = await Deno.readTextFile(
    new URL("../account-sessions/index.ts", import.meta.url),
  );
  for (
    const rpc of [
      "register_account_terminal",
      "heartbeat_current_terminal",
      "revoke_account_terminal",
      "revoke_other_terminals",
      "revoke_all_terminals",
    ]
  ) {
    assert(
      new RegExp(`userDb\\.rpc\\(\\s*\"${rpc}\"`).test(source),
      `${rpc} must use the caller-scoped client`,
    );
    assert(
      !new RegExp(`(?<!user)db\\.rpc\\(\\s*\"${rpc}\"`).test(source),
      `${rpc} must not use the service client`,
    );
  }
  assert(
    source.includes('userDb.from("account_terminals")'),
    "terminal list must use caller RLS",
  );
  assert(
    source.includes("publicTerminal(data, caller.sessionId)"),
    "terminal RPC rows must be sanitized before returning",
  );
  assert(
    !source.includes("currentSessionId: caller.sessionId"),
    "raw Auth session id must not be returned",
  );
});

Deno.test("account registration delegates atomic terminal, email, and audit writes to one RPC", async () => {
  const source = await Deno.readTextFile(
    new URL("../account-sessions/index.ts", import.meta.url),
  );
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260825070607_add_account_email_outbox.sql",
      import.meta.url,
    ),
  );
  const registration = source.slice(
    source.indexOf('if (action === "register")'),
    source.indexOf('if (action === "list"'),
  );
  assert(
    registration.includes('userDb.rpc("register_account_terminal"'),
    "terminal registration must remain caller-scoped",
  );
  assert(
    !registration.includes("enqueue_new_device_login") &&
      !registration.includes('action: "terminal.register"'),
    "Edge registration must not perform a second enqueue or audit write",
  );
  assert(
    migration.includes(
      "create or replace function public.register_account_terminal",
    ) &&
      migration.includes("insert into public.account_email_outbox") &&
      migration.includes("'terminal.register'") &&
      /from auth\.users u where u\.id\s*=\s*v_user_id/.test(migration),
    "registration RPC must atomically derive email, enqueue, and audit in SQL",
  );
  assert(
    registration.includes(
      "return json({ terminal: publicTerminal(data, caller.sessionId) })",
    ),
    "the existing terminal response contract changed",
  );
  assert(
    /'security_url'\s*,\s*'https:\/\/dosorobotics\.com\/account\/security'/.test(migration) &&
      !/jsonb_build_object\([^;]*'account_email'\s*,/s.test(migration) &&
      !/jsonb_build_object\([^;]*'ip_address'\s*,/s.test(migration) &&
      !/jsonb_build_object\([^;]*'location'\s*,/s.test(migration),
    "security payload must be server-derived and omit duplicated/spoofable PII",
  );
  assert(
    /values\s*\(\s*'new_device_login'\s*,\s*false\s*\)/.test(migration) &&
      migration.includes("v_email_status := 'not_applicable'") &&
      migration.includes("v_email_status text := 'disabled'"),
    "disabled or email-less registration must still succeed with explicit audit status",
  );
  assert(
    !registration.includes('request.headers.get("x-forwarded-for")'),
    "client-spoofable forwarding headers must not enter registration",
  );
});

Deno.test("admin functions require AAL2 and inventory uses domain values", async () => {
  const adminUsers = await Deno.readTextFile(
    new URL("../admin-users/index.ts", import.meta.url),
  );
  const adminDevices = await Deno.readTextFile(
    new URL("../admin-devices/index.ts", import.meta.url),
  );
  for (const source of [adminUsers, adminDevices]) {
    assert(
      /authenticate\([\s\S]*?true,\s*true,\s*\)/.test(source),
      "administrator function must require an active AAL2 session",
    );
  }
  assert(
    adminDevices.includes('["四足", "轮式"]'),
    "device categories must match the app domain",
  );
  assert(
    adminDevices.includes('["室内", "室外"]'),
    "device environments must match the app domain",
  );
  assert(
    !adminDevices.includes('?? "robot"'),
    "invalid category default remains",
  );
  assert(
    !adminDevices.includes('?? "unassigned"'),
    "invalid environment default remains",
  );
});

Deno.test("admin account state transitions are fail-safe and terminal actions are scoped", async () => {
  const source = await Deno.readTextFile(
    new URL("../admin-users/index.ts", import.meta.url),
  );
  const orchestration = await Deno.readTextFile(
    new URL("../_shared/adminAccountState.ts", import.meta.url),
  );
  const suspendRpc = source.indexOf('"admin_suspend_user_account"');
  const authBan = source.indexOf('ban_duration: "876000h"');
  const authUnban = source.indexOf('ban_duration: "none"');
  const activateRpc = source.indexOf('"admin_activate_user_account"');
  assert(
    suspendRpc >= 0 && authBan > suspendRpc,
    "suspension must block DOSO atomically before synchronizing the Auth ban",
  );
  assert(
    authUnban >= 0 && activateRpc > authUnban,
    "resume must remove the Auth ban before atomically enabling DOSO access",
  );
  assert(
    source.includes('action === "list_user_terminals"') &&
      source.includes('.eq("user_id", targetUserId)'),
    "admin terminal inventory must be target-user scoped",
  );
  assert(
    source.includes('action === "revoke_user_terminal"') &&
      source.includes('"admin_revoke_user_terminal"'),
    "admin terminal revocation must use the ownership-validating audit RPC",
  );
  assert(
    orchestration.includes("reconciliationRequired: true") &&
      orchestration.includes("retryable: true"),
    "cross-system sync failures must return an explicit reconciliation state",
  );
});

Deno.test("admin account orchestration stays fail-safe under injected failures", async () => {
  const suspendOrder: string[] = [];
  let suspendError: unknown;
  try {
    await suspendAccountFailSafe({
      blockDoso: () => {
        suspendOrder.push("block-doso");
        return Promise.resolve(3);
      },
      banAuth: () => {
        suspendOrder.push("ban-auth");
        return Promise.reject(new Error("injected auth outage"));
      },
    });
  } catch (error) {
    suspendError = error;
  }
  assert(
    suspendOrder.join(",") === "block-doso,ban-auth",
    "Auth ban ran before DOSO was blocked",
  );
  assert(
    suspendError instanceof AccountStateSyncError &&
      suspendError.code === "auth_ban_sync_failed" &&
      suspendError.state.applicationAccess === "blocked" &&
      suspendError.state.revokedTerminals === 3 &&
      suspendError.state.retryable === true,
    "Auth ban failure did not preserve an explicit blocked reconciliation state",
  );

  let banCalled = false;
  await assertRejects(
    () =>
      suspendAccountFailSafe({
        blockDoso: () => Promise.reject(new Error("injected database outage")),
        banAuth: () => {
          banCalled = true;
          return Promise.resolve();
        },
      }),
    Error,
    "injected database outage",
  );
  assert(!banCalled, "Auth was mutated after the DOSO transaction failed");

  let activateCalled = false;
  let activationError: unknown;
  try {
    await activateAccountFailSafe({
      currentStatus: "suspended",
      unbanAuth: () => Promise.reject(new Error("injected auth outage")),
      activateDoso: () => {
        activateCalled = true;
        return Promise.resolve();
      },
    });
  } catch (error) {
    activationError = error;
  }
  assert(!activateCalled, "DOSO was activated before Auth could be unbanned");
  assert(
    activationError instanceof AccountStateSyncError &&
      activationError.code === "auth_unban_sync_failed" &&
      activationError.state.applicationAccess === "blocked",
    "Auth unban failure did not leave DOSO explicitly blocked",
  );
});

Deno.test("network backend source contracts protect audits and unbind results", async () => {
  const audit = await Deno.readTextFile(
    new URL("../_shared/audit.ts", import.meta.url),
  );
  const deviceBinding = await Deno.readTextFile(
    new URL("../device-binding/index.ts", import.meta.url),
  );
  const http = await Deno.readTextFile(
    new URL("../_shared/http.ts", import.meta.url),
  );
  assert(
    !audit.includes("actorSessionId"),
    "audit metadata stores a session id",
  );
  assert(
    audit.includes('headers.get("x-request-id")') &&
      audit.includes("crypto.randomUUID()"),
    "audit records need a caller request id or generated correlation id",
  );
  assert(
    audit.includes('outcome: "success" | "denied" | "failed"') &&
      !audit.includes('outcome ?? "success"'),
    "audit outcome must be explicit instead of silently defaulting to success",
  );
  assert(
    deviceBinding.includes("Array.isArray(data) ? data[0] : data") &&
      deviceBinding.includes("if (!device)"),
    "user unbind must reject null and empty RPC results",
  );
  assert(
    !deviceBinding.includes("Boolean(data ?? true)"),
    "user unbind still treats an empty RPC result as success",
  );
  assert(
    deviceBinding.includes('"physical_device_limit"'),
    "a second physical-device claim needs a stable API conflict code",
  );
  assert(
    deviceBinding.includes('.eq("owner_id", caller.user.id)') &&
      deviceBinding.includes("idempotentRetry: true"),
    "an already-committed claim must be returned idempotently after a client timeout",
  );
  assert(
    http.indexOf("const originAllowed = isOriginAllowed(") <
      http.indexOf('request.method === "OPTIONS"'),
    "CORS preflight must be checked against the origin allowlist",
  );
});
