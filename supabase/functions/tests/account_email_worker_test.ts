import { AliyunDirectMailError } from "../_shared/aliyunDirectMail.ts";
import { createAccountEmailWorkerHandler } from "../account-email-worker/index.ts";
import {
  authorizeNamedSecretKey,
  type ClaimedEmail,
  DEFAULT_MESSAGES_PER_INVOCATION,
  MAX_MESSAGES_PER_INVOCATION,
  PROVIDER_TIMEOUT_MS,
  type RpcClient,
  runWorker,
  WORKER_WALL_BUDGET_MS,
} from "../account-email-worker/workerCore.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const claim = (suffix = "1"): ClaimedEmail => ({
  id: `11111111-1111-4111-8111-11111111111${suffix}`,
  kind: "new_device_login",
  recipient_email: "pilot@example.com",
  payload: {
    event_time: "2026-08-25 09:00:00 Asia/Shanghai",
    device: "android · Pixel",
    security_url: "https://dosorobotics.com/account/security",
  },
  lease_token: `22222222-2222-4222-8222-22222222222${suffix}`,
  attempt_id: `33333333-3333-4333-8333-33333333333${suffix}`,
  attempt_count: 1,
});

const providerEnvironment = (name: string) => ({
  ALIYUN_DM_ACCESS_KEY_ID: "test-id",
  ALIYUN_DM_ACCESS_KEY_SECRET: "test-secret",
}[name]);

Deno.test("worker accepts only the selected named secret apikey", () => {
  const read = (name: string) => ({
    DOSO_EMAIL_WORKER_SECRET_NAME: "automations",
    SUPABASE_SECRET_KEYS: JSON.stringify({ automations: "sb_secret_correct" }),
  }[name]);
  assert(
    !authorizeNamedSecretKey(
      new Request("https://example.test", {
        headers: { apikey: "sb_publishable_wrong" },
      }),
      read,
    ),
    "publishable key was accepted",
  );
  assert(
    authorizeNamedSecretKey(
      new Request("https://example.test", {
        headers: { apikey: "sb_secret_correct" },
      }),
      read,
    ),
    "named secret key was rejected",
  );
});

Deno.test("worker HTTP boundary returns 401 and 200 for the expected credentials", async () => {
  const read = (name: string) =>
    name === "SUPABASE_SECRET_KEYS"
      ? JSON.stringify({ automations: "sb_secret_correct" })
      : undefined;
  const handler = createAccountEmailWorkerHandler({
    readEnvironment: read,
    run: async () => ({
      workerId: "worker",
      claimed: 0,
      accepted: 0,
      retryScheduled: 0,
      deadLettered: 0,
      deliveryUnknown: 0,
      unknownPersistencePending: 0,
      fencedOut: 0,
    }),
  });
  const bad = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { apikey: "sb_publishable_wrong" },
    }),
  );
  const good = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { apikey: "sb_secret_correct" },
    }),
  );
  assert(bad.status === 401, "bad key did not return 401");
  assert(good.status === 200, "named key did not return 200");
});

Deno.test("worker HTTP boundary defaults only an absent body and rejects malformed limits", async () => {
  const read = (name: string) =>
    name === "SUPABASE_SECRET_KEYS"
      ? JSON.stringify({ automations: "sb_secret_correct" })
      : undefined;
  const limits: number[] = [];
  const handler = createAccountEmailWorkerHandler({
    readEnvironment: read,
    run: async (limit) => {
      limits.push(limit);
      return {
        workerId: "worker",
        claimed: 0,
        accepted: 0,
        retryScheduled: 0,
        deadLettered: 0,
        deliveryUnknown: 0,
        unknownPersistencePending: 0,
        fencedOut: 0,
      };
    },
  });
  const headers = {
    apikey: "sb_secret_correct",
    "content-type": "application/json",
  };

  const absent = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { apikey: "sb_secret_correct" },
    }),
  );
  assert(absent.status === 200, "absent body did not use the default");
  assert(
    limits[0] === DEFAULT_MESSAGES_PER_INVOCATION,
    "absent body used the wrong default",
  );

  for (
    const body of [
      "{",
      "null",
      "[]",
      "{}",
      '{"limit":0}',
      '{"limit":1.5}',
      `{"limit":${MAX_MESSAGES_PER_INVOCATION + 1}}`,
    ]
  ) {
    const before = limits.length;
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers,
        body,
      }),
    );
    assert(response.status === 400, `invalid body was accepted: ${body}`);
    assert(limits.length === before, `worker ran for invalid body: ${body}`);
  }

  const valid = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers,
      body: '{"limit":3}',
    }),
  );
  assert(valid.status === 200, "valid limit was rejected");
  assert(limits.at(-1) === 3, "valid limit did not reach the worker");
});

Deno.test("provider success plus DB acknowledgement failure becomes unknown without resend", async () => {
  const calls: string[] = [];
  let claimed = false;
  let sends = 0;
  const db: RpcClient = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "claim_account_email") {
        if (claimed) return { data: [], error: null };
        claimed = true;
        return { data: [claim()], error: null };
      }
      if (name === "begin_account_email_dispatch") {
        return {
          data: true,
          error: null,
        };
      }
      if (name === "accept_account_email") {
        return {
          data: null,
          error: new Error("ack lost"),
        };
      }
      if (name === "mark_account_email_unknown") {
        return {
          data: true,
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runWorker(10, {
    db,
    readEnvironment: providerEnvironment,
    randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    send: async () => {
      sends += 1;
      return { requestId: "request", envId: "env" };
    },
  });
  assert(sends === 1, "provider request was repeated");
  assert(summary.deliveryUnknown === 1, "unknown was not persisted");
  assert(
    !calls.includes("retry_rejected_account_email"),
    "unknown was retried",
  );
});

Deno.test("worker claims and completes exactly one message before the next claim", async () => {
  const events: string[] = [];
  const queue = [claim("1"), claim("2")];
  const db: RpcClient = {
    rpc: async (name) => {
      events.push(name);
      if (name === "claim_account_email") {
        return { data: queue.length ? [queue.shift()] : [], error: null };
      }
      if (
        name === "begin_account_email_dispatch" ||
        name === "accept_account_email"
      ) {
        return { data: true, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  await runWorker(2, {
    db,
    readEnvironment: providerEnvironment,
    randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    send: async () => {
      events.push("provider_send");
      return { requestId: "request", envId: "env" };
    },
  });
  assert(
    events.join(",") === [
      "claim_account_email",
      "begin_account_email_dispatch",
      "provider_send",
      "accept_account_email",
      "claim_account_email",
      "begin_account_email_dispatch",
      "provider_send",
      "accept_account_email",
    ].join(","),
    "worker claimed ahead of completed processing",
  );
});

Deno.test("stale begin-dispatch fencing prevents provider access", async () => {
  let claimCount = 0;
  let sends = 0;
  const db: RpcClient = {
    rpc: async (name) => {
      if (name === "claim_account_email") {
        claimCount += 1;
        return { data: claimCount === 1 ? [claim()] : [], error: null };
      }
      if (name === "begin_account_email_dispatch") {
        return {
          data: false,
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runWorker(1, {
    db,
    readEnvironment: providerEnvironment,
    send: async () => {
      sends += 1;
      return { requestId: "request", envId: "env" };
    },
  });
  assert(
    sends === 0 && summary.fencedOut === 1,
    "stale fence reached provider",
  );
});

Deno.test("timeout is unknown while an explicit 503 is retryable", async () => {
  for (
    const [error, expectedRpc] of [
      [
        new AliyunDirectMailError("provider_timeout", "timeout"),
        "mark_account_email_unknown",
      ],
      [
        new AliyunDirectMailError("ServiceUnavailable", "rejected", 503),
        "retry_rejected_account_email",
      ],
    ] as const
  ) {
    let claimed = false;
    const calls: string[] = [];
    const db: RpcClient = {
      rpc: async (name) => {
        calls.push(name);
        if (name === "claim_account_email") {
          if (claimed) return { data: [], error: null };
          claimed = true;
          return { data: [claim()], error: null };
        }
        return { data: true, error: null };
      },
    };
    await runWorker(1, {
      db,
      readEnvironment: providerEnvironment,
      send: () => Promise.reject(error),
    });
    assert(calls.includes(expectedRpc), `${expectedRpc} was not used`);
  }
});

Deno.test("provider configuration fails before the first claim", async () => {
  let rpcCalled = false;
  try {
    await runWorker(1, {
      db: {
        rpc: async () => {
          rpcCalled = true;
          return { data: [], error: null };
        },
      },
      readEnvironment: () => undefined,
    });
  } catch {
    assert(!rpcCalled, "row was claimed before configuration validation");
    return;
  }
  throw new Error("missing configuration was accepted");
});

Deno.test("provider and worker time budgets are server constants", () => {
  assert(PROVIDER_TIMEOUT_MS === 15_000, "provider timeout changed");
  assert(WORKER_WALL_BUDGET_MS === 45_000, "worker budget changed");
});
