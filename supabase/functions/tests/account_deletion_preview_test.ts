import { HttpError } from "../_shared/http.ts";
import type { authenticate } from "../_shared/auth.ts";
import { handleAccountDeletionPreview } from "../account-deletion-preview/preview.ts";

const USER_ID = "91000000-0000-4000-8000-000000000001";
const SESSION_ID = "93000000-0000-4000-8000-000000000001";
const BASE_BLOCKERS = [
  "device_disposition_policy_unapproved",
  "retention_redaction_policy_unapproved",
  "provider_revocation_not_verified",
  "server_avatar_cleanup_unavailable",
  "inflight_command_enrollment_handling_unapproved",
  "deletion_executor_ledger_unavailable",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function authorizedFixture(deviceReply: { count?: unknown; error?: unknown }) {
  let authCalls = 0;
  let deviceQueries = 0;
  const filters: Array<[string, unknown]> = [];
  const userDb = {
    from(table: string) {
      deviceQueries += 1;
      assert(table === "devices", "preview queried an unexpected table");
      return {
        select(columns: string, options: Record<string, unknown>) {
          assert(columns === "id", "preview selected unexpected device fields");
          assert(
            options.count === "exact" && options.head === true,
            "preview must use exact head-only device count",
          );
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return {
                eq(nextColumn: string, nextValue: unknown) {
                  filters.push([nextColumn, nextValue]);
                  return Promise.resolve(deviceReply);
                },
              };
            },
          };
        },
      };
    },
  };
  const authenticateFake = (async () => {
    authCalls += 1;
    return {
      db: {},
      userDb,
      caller: {
        token: "fixture-token",
        user: { id: USER_ID },
        sessionId: SESSION_ID,
        role: "user",
        accountStatus: "active",
        aal: "aal1",
        profile: {},
      },
    };
  }) as unknown as typeof authenticate;
  return {
    dependencies: { authenticate: authenticateFake },
    get authCalls() {
      return authCalls;
    },
    get deviceQueries() {
      return deviceQueries;
    },
    filters,
  };
}

Deno.test("authorization failure performs no device query", async () => {
  let authCalls = 0;
  let deviceQueries = 0;
  const authenticateFake = (async () => {
    authCalls += 1;
    throw new HttpError(401, "invalid_authorization", "fixture");
  }) as typeof authenticate;
  const response = await handleAccountDeletionPreview(
    new Request(
      "https://fixture.invalid/functions/v1/account-deletion-preview",
    ),
    { authenticate: authenticateFake },
  );

  assert(response.status === 401, "authorization failure did not remain 401");
  const payload = await body(response);
  assert(
    (payload.error as Record<string, unknown>)?.code ===
      "preview_authorization_required",
    "authorization failure leaked or changed its public code",
  );
  assert(authCalls === 1, "authenticate was not called exactly once");
  assert(deviceQueries === 0, "device query ran after authorization failure");
  assert(
    response.headers.get("cache-control") === "no-store",
    "failure response was cacheable",
  );
});

Deno.test("zero visible physical robots remains planning-only and cannot submit", async () => {
  const fixture = authorizedFixture({ count: 0, error: null });
  const response = await handleAccountDeletionPreview(
    new Request(
      "https://fixture.invalid/functions/v1/account-deletion-preview",
    ),
    fixture.dependencies,
  );
  const payload = await body(response);

  assert(response.status === 200, "zero-device preview failed");
  assert(
    payload.state === "planning_only",
    "preview exposed an executable state",
  );
  assert(payload.canSubmit === false, "zero-device preview enabled submission");
  assert(
    payload.requestCreated === false,
    "zero-device preview claimed a request",
  );
  assert(
    payload.executionAvailable === false,
    "zero-device preview enabled execution",
  );
  assert(
    payload.hasVisibleBoundPhysicalRobot === false,
    "zero-device result was misreported",
  );
  assert(
    JSON.stringify(payload.blockers) === JSON.stringify(BASE_BLOCKERS),
    "zero-device blockers changed",
  );
  assert(
    JSON.stringify(fixture.filters) === JSON.stringify([
      ["owner_id", USER_ID],
      ["is_demo", false],
    ]),
    "device query was not caller-owned and physical-only",
  );
  assert(
    response.headers.get("cache-control") === "no-store",
    "preview response was cacheable",
  );
  assert(
    response.headers.get("pragma") === "no-cache",
    "preview response missed pragma no-cache",
  );
});

Deno.test("a visible physical robot adds a policy blocker but never enables deletion", async () => {
  const fixture = authorizedFixture({ count: 1, error: null });
  const response = await handleAccountDeletionPreview(
    new Request(
      "https://fixture.invalid/functions/v1/account-deletion-preview",
    ),
    fixture.dependencies,
  );
  const payload = await body(response);

  assert(response.status === 200, "bound-device preview failed");
  assert(
    payload.hasVisibleBoundPhysicalRobot === true,
    "bound physical robot was hidden",
  );
  assert(
    payload.canSubmit === false,
    "bound-device preview enabled submission",
  );
  assert(
    payload.requestCreated === false,
    "bound-device preview claimed a request",
  );
  assert(
    payload.executionAvailable === false,
    "bound-device preview enabled execution",
  );
  assert(
    JSON.stringify(payload.blockers) === JSON.stringify([
      ...BASE_BLOCKERS,
      "physical_robot_binding_requires_decision",
    ]),
    "bound-device policy blocker changed",
  );
});

Deno.test("malformed caller count returns a fixed unavailable response", async () => {
  for (
    const deviceReply of [
      { count: "0", error: null },
      { count: -1, error: null },
      { count: 0 },
      { count: 0, error: { message: "private database detail" } },
    ]
  ) {
    const fixture = authorizedFixture(deviceReply);
    const response = await handleAccountDeletionPreview(
      new Request(
        "https://fixture.invalid/functions/v1/account-deletion-preview",
      ),
      fixture.dependencies,
    );
    const payload = await body(response);
    assert(response.status === 503, "malformed count did not fail closed");
    assert(
      (payload.error as Record<string, unknown>)?.code ===
        "preview_unavailable",
      "malformed count leaked its internal error",
    );
    assert(
      !JSON.stringify(payload).includes("private database detail"),
      "database detail leaked",
    );
    assert(
      fixture.deviceQueries === 1,
      "malformed count retried the device query",
    );
  }
});

Deno.test("mutating methods are rejected before authentication", async () => {
  let authCalls = 0;
  const authenticateFake = (async () => {
    authCalls += 1;
    throw new Error("must not run");
  }) as typeof authenticate;
  const response = await handleAccountDeletionPreview(
    new Request(
      "https://fixture.invalid/functions/v1/account-deletion-preview",
      { method: "POST" },
    ),
    { authenticate: authenticateFake },
  );
  const payload = await body(response);

  assert(response.status === 405, "mutating method was not rejected");
  assert(
    (payload.error as Record<string, unknown>)?.code === "method_not_allowed",
    "wrong method error",
  );
  assert(authCalls === 0, "mutating method invoked authentication");
});

Deno.test("OPTIONS returns CORS metadata without authentication", async () => {
  let authCalls = 0;
  const authenticateFake = (async () => {
    authCalls += 1;
    throw new Error("must not run");
  }) as typeof authenticate;
  const response = await handleAccountDeletionPreview(
    new Request(
      "https://fixture.invalid/functions/v1/account-deletion-preview",
      { method: "OPTIONS" },
    ),
    { authenticate: authenticateFake },
  );

  assert(
    response.status === 204,
    "OPTIONS did not return an empty success response",
  );
  assert(authCalls === 0, "OPTIONS invoked authentication");
  assert(
    response.headers.get("access-control-allow-methods") === "GET, OPTIONS",
    "OPTIONS advertised mutating methods",
  );
  assert(
    response.headers.get("cache-control") === "no-store",
    "OPTIONS response was cacheable",
  );
});
