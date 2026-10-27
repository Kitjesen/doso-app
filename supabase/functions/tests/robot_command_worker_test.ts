import { canonicalizeRobotProtocolValue } from "../_shared/robotIngress.ts";
import {
  createRobotCommandWorkerHandler,
} from "../robot-command-worker/index.ts";
import {
  authenticateRobotCommandWorker,
  DEFAULT_COMMANDS_PER_INVOCATION,
  importEd25519Pkcs8Signer,
  MAX_COMMANDS_PER_INVOCATION,
  type PublishedCommand,
  readRobotCommandWorkerLimit,
  type RobotCommandRpcClient,
  type RobotCommandSigner,
  type RobotCommandTransport,
  type RobotCommandWorkerSummary,
  runRobotCommandWorker,
} from "../robot-command-worker/workerCore.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "worker-named-secret-test-value";
const BASE_URL = "https://project.test";
const COMMAND_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const TERMINAL_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const LEASE_TOKEN = "66666666-6666-4666-8666-666666666666";
const WORKER_ID = "77777777-7777-4777-8777-777777777777";
const DISPATCH_DEADLINE = "2027-01-15T08:00:30.000Z";

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SUPABASE_SECRET_KEYS: JSON.stringify({
      "robot-command-worker": SECRET,
      "robot-ingress": "different-ingress-secret",
    }),
    SUPABASE_URL: BASE_URL,
    DOSO_ROBOT_COMMAND_DELIVERY_ENABLED: "true",
    DOSO_ROBOT_COMMAND_SIGNING_PRIVATE_KEY_PKCS8_PEM: "test-pkcs8",
    ...overrides,
  };
  return (name: string) => values[name];
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    protocol_version: 1,
    command_id: COMMAND_ID,
    device_id: DEVICE_ID,
    owner_account_id: OWNER_ID,
    terminal_id: TERMINAL_ID,
    actor_user_id: OWNER_ID,
    authorization_epoch: 3,
    idempotency_key: "health-check-1",
    auth_session_id: SESSION_ID,
    policy_version: 1,
    safety_contract_id: "stationary-health-check",
    safety_contract_version: 1,
    capability: "command:diagnostics.health_check",
    kind: "diagnostics.health_check",
    command_class: "non_motion_diagnostic",
    may_actuate: false,
    expected_state: { authorization_epoch: 3, boot_id: "boot-alpha" },
    issued_at_ms: 1_800_000_000_000,
    expires_at_ms: 1_800_000_030_000,
    payload: { include: ["battery", "network", "sensors"] },
    ...overrides,
  };
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    claimed: true,
    command_id: COMMAND_ID,
    lease_token: LEASE_TOKEN,
    fencing_token: 1,
    leased_until: "2027-01-15T08:00:30.000Z",
    command: command(),
    ...overrides,
  };
}

function begun(dispatchDeadline = DISPATCH_DEADLINE) {
  return {
    begun: true,
    reason: "dispatch_authorized",
    dispatch_deadline: dispatchDeadline,
  };
}

function emptySummary(): RobotCommandWorkerSummary {
  return Object.freeze({
    reconciledBefore: 0,
    reconciledAfter: 0,
    claimed: 0,
    authorityChanged: 0,
    invalidClaims: 0,
    fencedOut: 0,
    published: 0,
    transportFailures: 0,
    deliveryUnknown: 0,
    persistenceUnknown: 0,
  });
}

const fakeSigner: RobotCommandSigner = {
  sign: async (value) =>
    Object.freeze({
      command: value,
      signature_b64url: "A".repeat(86),
    }),
};

function fakeTransport(
  publish: RobotCommandTransport["publish"] = async () => ({
    disposition: "published",
    transportMessageId: "transport-message-1",
  }),
): RobotCommandTransport {
  return { publish };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pem(label: string, bytes: Uint8Array): string {
  const body = base64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

async function signingIdentity() {
  const keys = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey(
      "pkcs8",
      keys.privateKey,
    ),
  );
  return {
    signer: await importEd25519Pkcs8Signer(pem("PRIVATE KEY", pkcs8)),
    publicKey: keys.publicKey,
  };
}

Deno.test("worker accepts only SUPABASE_SECRET_KEYS['robot-command-worker'] with no legacy fallback", () => {
  const authorized = authenticateRobotCommandWorker(
    new Request(BASE_URL, { headers: { apikey: SECRET } }),
    environment(),
  );
  assert(authorized === SECRET, "named worker secret was rejected");
  assert(
    authenticateRobotCommandWorker(
      new Request(BASE_URL, {
        headers: { apikey: "different-ingress-secret" },
      }),
      environment(),
    ) === null,
    "another named secret was accepted",
  );
  let threw = false;
  try {
    authenticateRobotCommandWorker(
      new Request(BASE_URL, { headers: { apikey: SECRET } }),
      environment({
        SUPABASE_SECRET_KEYS: undefined,
        SUPABASE_SECRET_KEY: SECRET,
      }),
    );
  } catch {
    threw = true;
  }
  assert(threw, "legacy SUPABASE_SECRET_KEY fallback was accepted");
});

Deno.test("method, authentication and disabled feature fail before body, client or transport side effects", async () => {
  for (const scenario of ["method", "auth", "disabled"] as const) {
    const effects = { body: 0, client: 0, transport: 0, signer: 0, run: 0 };
    class TrackedRequest extends Request {
      override json(): Promise<unknown> {
        effects.body += 1;
        return super.json();
      }
    }
    const request = new TrackedRequest(BASE_URL, {
      method: scenario === "method" ? "GET" : "POST",
      headers: { apikey: scenario === "auth" ? "wrong" : SECRET },
      body: scenario === "method" ? undefined : JSON.stringify({ limit: 1 }),
    });
    const handler = createRobotCommandWorkerHandler({
      readEnvironment: environment({
        DOSO_ROBOT_COMMAND_DELIVERY_ENABLED: scenario === "disabled"
          ? "false"
          : "true",
      }),
      createTransport: () => {
        effects.transport += 1;
        return fakeTransport();
      },
      importSigner: async () => {
        effects.signer += 1;
        return fakeSigner;
      },
      createAdminClient: () => {
        effects.client += 1;
        throw new Error("must not construct");
      },
      run: async () => {
        effects.run += 1;
        return emptySummary();
      },
    });
    const response = await handler(request);
    assert(
      [405, 401, 503].includes(response.status),
      `${scenario} did not fail`,
    );
    assert(
      Object.values(effects).every((value) => value === 0),
      `${scenario} crossed the zero-side-effect boundary`,
    );
  }
});

Deno.test("handler resolves transport, imports signer, reads bounded body, creates one same-key client, then runs", async () => {
  const events: string[] = [];
  let clientSecret = "";
  let clientCount = 0;
  class TrackedRequest extends Request {
    override json(): Promise<unknown> {
      events.push("body");
      return super.json();
    }
  }
  const handler = createRobotCommandWorkerHandler({
    readEnvironment: environment(),
    createTransport: () => {
      events.push("transport");
      return fakeTransport();
    },
    importSigner: async () => {
      events.push("signer");
      return fakeSigner;
    },
    createAdminClient: (url, secret) => {
      events.push("client");
      clientCount += 1;
      clientSecret = secret;
      assert(url === BASE_URL, "wrong Supabase URL");
      return { rpc: async () => ({ data: null, error: null }) };
    },
    run: async (limit) => {
      events.push("run");
      assert(limit === MAX_COMMANDS_PER_INVOCATION, "limit was not capped");
      return emptySummary();
    },
  });
  const response = await handler(
    new TrackedRequest(BASE_URL, {
      method: "POST",
      headers: { apikey: SECRET, "content-type": "application/json" },
      body: JSON.stringify({ limit: 999 }),
    }),
  );
  assert(response.status === 200, "configured injected worker failed");
  assert(
    events.join(",") === "transport,signer,body,client,run",
    `startup order drifted: ${events.join(",")}`,
  );
  assert(
    clientCount === 1 && clientSecret === SECRET,
    "admin client was not unique or reused a different key",
  );
});

Deno.test("production-shaped missing adapter is fixed 503 with zero claim", async () => {
  let clients = 0;
  let runs = 0;
  const handler = createRobotCommandWorkerHandler({
    readEnvironment: environment(),
    createTransport: () => null,
    importSigner: async () => {
      throw new Error("must not import");
    },
    createAdminClient: () => {
      clients += 1;
      throw new Error("must not construct");
    },
    run: async () => {
      runs += 1;
      return emptySummary();
    },
  });
  const response = await handler(
    new Request(BASE_URL, {
      method: "POST",
      headers: { apikey: SECRET },
      body: JSON.stringify({ limit: 1 }),
    }),
  );
  assert(response.status === 503, "unconfigured transport did not return 503");
  assert(
    (await response.json() as { error: { code: string } }).error.code ===
      "transport_unconfigured",
    "unconfigured transport returned an unstable code",
  );
  assert(
    clients === 0 && runs === 0,
    "unconfigured production path claimed work",
  );
});

Deno.test("request limit defaults to 10 and is capped at 25", async () => {
  const value = async (body?: string) =>
    readRobotCommandWorkerLimit(
      new Request(BASE_URL, {
        method: "POST",
        body,
      }),
    );
  assert(
    await value() === DEFAULT_COMMANDS_PER_INVOCATION,
    "missing body did not default",
  );
  assert(
    await value("not-json") === DEFAULT_COMMANDS_PER_INVOCATION,
    "invalid JSON did not default",
  );
  assert(
    await value(JSON.stringify({ limit: 0 })) ===
      DEFAULT_COMMANDS_PER_INVOCATION,
    "invalid limit did not default",
  );
  assert(
    await value(JSON.stringify({ limit: 250 })) === MAX_COMMANDS_PER_INVOCATION,
    "limit was not capped",
  );
});

Deno.test("worker reconciles, claims, strictly freezes, begins, signs, publishes and finishes serially", async () => {
  const identity = await signingIdentity();
  const events: string[] = [];
  let claimCount = 0;
  let reconcileCount = 0;
  let publishedCommand: PublishedCommand | null = null;
  const db: RobotCommandRpcClient = {
    rpc: async (name, args = {}) => {
      events.push(name);
      if (name === "reconcile_robot_command_timeouts") {
        reconcileCount += 1;
        return { data: reconcileCount, error: null };
      }
      if (name === "claim_robot_command_for_publish") {
        assert(args.p_lease_seconds === 30, "lease is not 30 seconds");
        claimCount += 1;
        return { data: claimCount === 1 ? claim() : null, error: null };
      }
      if (name === "begin_robot_command_publish") {
        return {
          data: begun(),
          error: null,
        };
      }
      if (name === "finish_robot_command_publish") {
        assert(
          args.p_outcome === "published",
          "published receipt was misclassified",
        );
        return {
          data: {
            applied: true,
            delivery_status: "published",
            ack_status: null,
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const transport = fakeTransport(async (value) => {
    events.push("transport.publish");
    publishedCommand = value;
    assert(
      Object.isFrozen(value) && Object.isFrozen(value.command),
      "published command is mutable",
    );
    assert(
      Object.isFrozen(value.command.payload) &&
        Object.isFrozen(value.command.payload.include),
      "nested command payload is mutable",
    );
    const verified = await crypto.subtle.verify(
      "Ed25519",
      identity.publicKey,
      Uint8Array.from(
        atob(
          value.signature_b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(
            88,
            "=",
          ),
        ),
        (character) => character.charCodeAt(0),
      ),
      new TextEncoder().encode(canonicalizeRobotProtocolValue(value.command)),
    );
    assert(
      verified,
      "worker Ed25519 signature is incompatible with G013 canonical JSON",
    );
    return {
      disposition: "published",
      transportMessageId: "transport-accepted-1",
    };
  });
  const summary = await runRobotCommandWorker(1, {
    db,
    signer: identity.signer,
    transport,
    randomUUID: () => WORKER_ID,
  });
  assert(
    publishedCommand !== null,
    "transport did not receive a signed command",
  );
  assert(
    summary.published === 1 && summary.claimed === 1,
    "published count is wrong",
  );
  assert(
    events.join(",") === [
      "reconcile_robot_command_timeouts",
      "claim_robot_command_for_publish",
      "begin_robot_command_publish",
      "transport.publish",
      "finish_robot_command_publish",
      "reconcile_robot_command_timeouts",
    ].join(","),
    `worker sequence drifted: ${events.join(",")}`,
  );
});

Deno.test("authority-changed and null claims never begin or reach transport", async () => {
  const events: string[] = [];
  let claims = 0;
  const db: RobotCommandRpcClient = {
    rpc: async (name) => {
      events.push(name);
      if (name === "reconcile_robot_command_timeouts") {
        return {
          data: 0,
          error: null,
        };
      }
      if (name === "claim_robot_command_for_publish") {
        claims += 1;
        return {
          data: claims === 1
            ? { claimed: false, reason: "authority_changed" }
            : null,
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  let transports = 0;
  const summary = await runRobotCommandWorker(2, {
    db,
    signer: fakeSigner,
    transport: fakeTransport(async () => {
      transports += 1;
      throw new Error("must not publish");
    }),
  });
  assert(
    summary.authorityChanged === 1 && transports === 0,
    "authority change reached transport",
  );
  assert(
    !events.includes("begin_robot_command_publish"),
    "authority change reached begin",
  );
});

Deno.test("strict non-motion envelope rejects extra, actuation and nested mutation before begin", async () => {
  for (
    const invalid of [
      claim({ extra: true }),
      claim({ command: command({ may_actuate: true }) }),
      claim({
        command: command({ payload: { include: ["battery", "battery"] } }),
      }),
    ]
  ) {
    let claims = 0;
    const calls: string[] = [];
    const db: RobotCommandRpcClient = {
      rpc: async (name) => {
        calls.push(name);
        if (name === "reconcile_robot_command_timeouts") {
          return { data: 0, error: null };
        }
        if (name === "claim_robot_command_for_publish") {
          claims += 1;
          return { data: claims === 1 ? invalid : null, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    };
    const summary = await runRobotCommandWorker(1, {
      db,
      signer: fakeSigner,
      transport: fakeTransport(),
    });
    assert(summary.invalidClaims === 1, "invalid envelope was not rejected");
    assert(
      !calls.includes("begin_robot_command_publish"),
      "invalid envelope reached begin",
    );
  }
});

Deno.test("failed begin is fenced before signing and transport", async () => {
  let signerCalls = 0;
  let transportCalls = 0;
  let claimed = false;
  const db: RobotCommandRpcClient = {
    rpc: async (name) => {
      if (name === "reconcile_robot_command_timeouts") {
        return {
          data: 0,
          error: null,
        };
      }
      if (name === "claim_robot_command_for_publish") {
        if (claimed) return { data: null, error: null };
        claimed = true;
        return { data: claim(), error: null };
      }
      if (name === "begin_robot_command_publish") {
        return {
          data: { begun: false, reason: "stale_lease" },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runRobotCommandWorker(1, {
    db,
    signer: {
      sign: async () => {
        signerCalls += 1;
        throw new Error("must not sign");
      },
    },
    transport: fakeTransport(async () => {
      transportCalls += 1;
      throw new Error("must not publish");
    }),
  });
  assert(
    summary.fencedOut === 1 && signerCalls === 0 && transportCalls === 0,
    "failed begin crossed transport boundary",
  );
});

Deno.test("signing pause past the absolute dispatch deadline never starts transport", async () => {
  let nowMs = 0;
  let claimed = false;
  let transportCalls = 0;
  let finishArgs: Record<string, unknown> | null = null;
  const db: RobotCommandRpcClient = {
    rpc: async (name, args = {}) => {
      if (name === "reconcile_robot_command_timeouts") {
        return { data: 0, error: null };
      }
      if (name === "claim_robot_command_for_publish") {
        if (claimed) return { data: null, error: null };
        claimed = true;
        return { data: claim(), error: null };
      }
      if (name === "begin_robot_command_publish") {
        return { data: begun(new Date(30_000).toISOString()), error: null };
      }
      if (name === "finish_robot_command_publish") {
        finishArgs = args;
        return { data: { applied: false }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runRobotCommandWorker(1, {
    db,
    signer: {
      sign: async (value) => {
        nowMs = 31_000;
        return fakeSigner.sign(value);
      },
    },
    transport: fakeTransport(async () => {
      transportCalls += 1;
      return {
        disposition: "published",
        transportMessageId: "must-not-publish",
      };
    }),
    now: () => nowMs,
    randomUUID: () => WORKER_ID,
  });
  assert(
    transportCalls === 0,
    "expired dispatch crossed the transport boundary",
  );
  const settled = finishArgs as unknown as Record<string, unknown>;
  assert(
    settled.p_outcome === "transport_failure" &&
      settled.p_error_code === "dispatch_deadline_elapsed",
    "known zero-delivery deadline expiry was not settled conservatively",
  );
  assert(summary.fencedOut === 1, "expired database dispatch was not fenced");
});

async function classifiedRun(
  publish: RobotCommandTransport["publish"],
  timeoutMs = 50,
) {
  let claimed = false;
  let finishArgs: Record<string, unknown> | null = null;
  const db: RobotCommandRpcClient = {
    rpc: async (name, args = {}) => {
      if (name === "reconcile_robot_command_timeouts") {
        return {
          data: 0,
          error: null,
        };
      }
      if (name === "claim_robot_command_for_publish") {
        if (claimed) return { data: null, error: null };
        claimed = true;
        return { data: claim(), error: null };
      }
      if (name === "begin_robot_command_publish") {
        return {
          data: begun(),
          error: null,
        };
      }
      if (name === "finish_robot_command_publish") {
        finishArgs = args;
        return { data: { applied: true }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runRobotCommandWorker(1, {
    db,
    signer: fakeSigner,
    transport: fakeTransport(publish),
    transportTimeoutMs: timeoutMs,
  });
  return {
    summary,
    finishArgs: finishArgs as unknown as Record<string, unknown>,
  };
}

Deno.test("only explicit definitely-not-delivered failures retry; ambiguous and ordinary errors are unknown", async () => {
  const explicit = await classifiedRun(async () => ({
    disposition: "transport_failure",
    definitelyNotDelivered: true,
    errorCode: "connection_refused",
  }));
  assert(
    explicit.summary.transportFailures === 1 &&
      explicit.finishArgs.p_outcome === "transport_failure",
    "explicit zero-delivery failure was not retryable",
  );

  const ambiguous = await classifiedRun(async () => ({
    disposition: "delivery_unknown",
    errorCode: "broker_ack_missing",
  }));
  assert(
    ambiguous.summary.deliveryUnknown === 1 &&
      ambiguous.finishArgs.p_outcome === "delivery_unknown",
    "structured ambiguity was not terminal unknown",
  );

  const malformed = await classifiedRun(async () => ({
    disposition: "transport_failure",
    definitelyNotDelivered: false,
    errorCode: "connection_refused",
  } as never));
  assert(
    malformed.summary.deliveryUnknown === 1 &&
      malformed.finishArgs.p_error_code === "transport_result_invalid",
    "unproven zero-delivery failure was retried",
  );

  const thrown = await classifiedRun(async () => {
    throw new Error("socket detail must not escape");
  });
  assert(
    thrown.summary.deliveryUnknown === 1 &&
      thrown.finishArgs.p_error_code === "transport_exception",
    "ordinary exception was not unknown",
  );

  let sideEffects = 0;
  const explosiveReceipt = await classifiedRun(async () => {
    sideEffects += 1;
    return Object.defineProperty({}, "disposition", {
      get() {
        throw new Error("receipt parsing failed after publish");
      },
    }) as never;
  });
  assert(
    sideEffects === 1 && explosiveReceipt.summary.deliveryUnknown === 1 &&
      explosiveReceipt.finishArgs.p_outcome === "delivery_unknown" &&
      explosiveReceipt.finishArgs.p_error_code === "transport_exception",
    "receipt parsing exception after transport side effect became retryable",
  );
});

Deno.test("transport timeout aborts and persists delivery_unknown", async () => {
  let aborted = false;
  const result = await classifiedRun(
    (_command, { signal }) =>
      new Promise((_resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
      }),
    1,
  );
  assert(aborted, "transport timeout did not abort its signal");
  assert(
    result.summary.deliveryUnknown === 1 &&
      result.finishArgs.p_error_code === "transport_timeout",
    "timeout was not delivery_unknown",
  );
});

Deno.test("finish persistence error counts unknown and stops before another claim", async () => {
  let claimCalls = 0;
  const events: string[] = [];
  const db: RobotCommandRpcClient = {
    rpc: async (name) => {
      events.push(name);
      if (name === "reconcile_robot_command_timeouts") {
        return {
          data: 0,
          error: null,
        };
      }
      if (name === "claim_robot_command_for_publish") {
        claimCalls += 1;
        return { data: claim(), error: null };
      }
      if (name === "begin_robot_command_publish") {
        return {
          data: begun(),
          error: null,
        };
      }
      if (name === "finish_robot_command_publish") {
        return {
          data: null,
          error: new Error("database detail"),
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runRobotCommandWorker(10, {
    db,
    signer: fakeSigner,
    transport: fakeTransport(),
  });
  assert(
    summary.persistenceUnknown === 1 && claimCalls === 1,
    "finish error did not stop the worker",
  );
  assert(
    events.at(-1) === "reconcile_robot_command_timeouts",
    "post-run reconcile was skipped",
  );
});

Deno.test("wall budget stops new claims while still running the final reconcile", async () => {
  let claimCalls = 0;
  let reconcileCalls = 0;
  const times = [0, 0, 45_001];
  const db: RobotCommandRpcClient = {
    rpc: async (name) => {
      if (name === "reconcile_robot_command_timeouts") {
        reconcileCalls += 1;
        return { data: 0, error: null };
      }
      if (name === "claim_robot_command_for_publish") {
        claimCalls += 1;
        return { data: claim(), error: null };
      }
      if (name === "begin_robot_command_publish") {
        return {
          data: begun(),
          error: null,
        };
      }
      if (name === "finish_robot_command_publish") {
        return {
          data: { applied: true },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const summary = await runRobotCommandWorker(25, {
    db,
    signer: fakeSigner,
    transport: fakeTransport(),
    now: () => times.shift() ?? 45_001,
  });
  assert(
    summary.claimed === 1 && claimCalls === 1,
    "wall budget admitted another claim",
  );
  assert(reconcileCalls === 2, "wall budget skipped final reconcile");
});

Deno.test("worker response contains no identifiers or secrets", async () => {
  const response = await createRobotCommandWorkerHandler({
    readEnvironment: environment(),
    createTransport: () => fakeTransport(),
    importSigner: async () => fakeSigner,
    createAdminClient: () => ({
      rpc: async () => ({ data: null, error: null }),
    }),
    run: async () => emptySummary(),
  })(new Request(BASE_URL, { method: "POST", headers: { apikey: SECRET } }));
  const text = await response.text();
  assert(
    !text.includes(SECRET) && !text.includes(COMMAND_ID) &&
      !/lease_token|fencing_token|transport_message_id|transportMessageId|errorCode|[0-9a-f]{8}-[0-9a-f-]{27,}/i
        .test(text),
    "worker response leaked details",
  );
});
