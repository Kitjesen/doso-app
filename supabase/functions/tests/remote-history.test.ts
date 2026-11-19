import assert from "node:assert/strict";
import { HttpError } from "../_shared/http.ts";
import { handleRemoteHistory } from "../remote-history/handler.ts";

const DEVICE = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const TB = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const HISTORY = "55555555-5555-4555-8555-555555555555";
const START = Date.parse("2026-11-09T00:00:00.000Z");
const LOCATION = {
  lat: 31,
  lon: 121,
  fixType: 1,
  observedAt: "2026-11-08T23:59:59.000Z",
  accuracyM: null,
};
const STATUS = {
  state: {
    kind: "CMS_STATE_KIND_STANDING",
    transition: "CMS_TRANSITION_KIND_NONE",
  },
  control: {
    owner: "CONTROL_OWNER_NONE",
    motorOutputEnabled: false,
    criticalMotorFault: false,
  },
  transport: "mtls",
};
function row(
  offset = 0,
  payload: Record<string, unknown> = {
    status: { ...STATUS, location: LOCATION },
  },
) {
  return {
    ts: START + offset,
    value: JSON.stringify({
      v: 1,
      kind: "status.report",
      deviceId: DEVICE,
      connectionId: DEVICE,
      reportingSessionId: DEVICE,
      authorizationEpoch: 2,
      consentVersion: 3,
      seq: offset + 1,
      observedAt: new Date(START + offset).toISOString(),
      ...payload,
    }),
  };
}
function fixture() {
  const state = {
    access: {
      deviceId: DEVICE,
      ownerId: OWNER,
      simulated: true,
      authorizationEpoch: 2,
      historyId: HISTORY as string | null,
      tbDeviceId: TB as string | null,
      enabled: false,
      pendingCount: 1,
      failedCount: 2,
      droppedCount: 3,
    },
    reads: 0,
    fetches: 0,
    query: "",
    options: undefined as RequestInit | undefined,
    authError: null as unknown,
    rpcError: null as { code: string } | null,
    body: { sourceReport: [row()] } as unknown,
    url: "https://thingsboard.test",
    key: "test-service-key",
    platform: undefined as (() => Response | Promise<Response>) | undefined,
    reread: undefined as (() => void) | undefined,
  };
  const authenticate = (() => {
    if (state.authError) throw state.authError;
    return Promise.resolve({
      caller: { user: { id: OWNER }, sessionId: SESSION },
      db: {
        rpc(name: string, args: unknown) {
          assert.equal(name, "get_telemetry_history_access");
          assert.deepEqual(args, { p_device_id: DEVICE, p_owner_id: OWNER, p_session_id: SESSION });
          if (++state.reads === 2) state.reread?.();
          return Promise.resolve({
            data: structuredClone(state.access),
            error: state.rpcError,
          });
        },
      },
      userDb: { rpc() { throw new Error("History mappings must not use the user RPC boundary"); } },
    });
  }) as unknown as typeof import("../_shared/auth.ts").authenticate;
  async function request(
    query = `deviceId=${DEVICE}&startTs=${START}&endTs=${START + 1000}`,
    method = "GET",
  ) {
    const response = await handleRemoteHistory(
      new Request(`https://api.test/remote-history?${query}`, { method }),
      {
        authenticate,
        readEnvironment: (name) =>
          name === "DOSO_THINGSBOARD_URL" ? state.url : state.key,
        fetch: ((_input: string | URL | Request, options?: RequestInit) => {
          state.fetches++;
          state.query = String(_input);
          state.options = options;
          return Promise.resolve(
            state.platform ? state.platform() : Response.json(state.body),
          );
        }) as typeof fetch,
      },
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    return {
      response,
      data: response.status === 204 ? null : await response.json(),
    };
  }
  return { state, request };
}

Deno.test("history preserves GNSS source time, unknown accuracy and null interruptions when reporting is off", async () => {
  const f = fixture();
  f.state.body = {
    sourceReport: [
      row(),
      row(1, { status: STATUS }),
      row(2, { error: "upstream_unavailable" }),
    ],
  };
  const { response, data } = await f.request();
  assert.equal(response.status, 200);
  assert.deepEqual(data, {
    deviceId: DEVICE,
    simulated: true,
    historyId: HISTORY,
    startTs: START,
    endTs: START + 1000,
    points: [
      { reportTs: START, breakBefore: true, location: LOCATION },
      { reportTs: START + 1, breakBefore: false, location: null },
      { reportTs: START + 2, breakBefore: false, location: null },
    ],
    nextTs: null,
    enabled: false,
    availability: "ready",
    syncState: "incomplete",
  });
  assert.equal(f.state.reads, 2);
  assert.equal(f.state.options?.redirect, "error");
  assert(f.state.options?.signal instanceof AbortSignal);
  assert.equal(
    new Headers(f.state.options?.headers).get("x-authorization"),
    "ApiKey test-service-key",
  );
  assert(!JSON.stringify(data).includes(TB));
  assert(!JSON.stringify(data).includes(f.state.key));
  for (const field of ["ownerId", "authorizationEpoch", "consentVersion", "connectionId", "reportingSessionId", "sourceReport", "seq", "tbDeviceId", "pendingCount", "failedCount", "droppedCount"]) {
    assert(!JSON.stringify(data).includes(`"${field}"`), field);
  }
});

Deno.test("history pages ascending report milliseconds with an exclusive end and strict after", async () => {
  const f = fixture();
  f.state.body = {
    sourceReport: Array.from({ length: 501 }, (_, index) => row(index)),
  };
  const first = await f.request();
  assert.equal(first.response.status, 200);
  assert.equal(first.data.points.length, 500);
  assert.equal(first.data.nextTs, START + 499);
  let query = new URL(f.state.query).searchParams;
  assert.equal(query.get("startTs"), String(START));
  assert.equal(query.get("endTs"), String(START + 999));
  assert.equal(query.get("limit"), "501");
  assert.equal(query.get("agg"), "NONE");
  assert.equal(query.get("orderBy"), "ASC");
  assert.equal(query.get("keys"), "sourceReport");
  f.state.body = { sourceReport: [row(500)] };
  const second = await f.request(
    `deviceId=${DEVICE}&startTs=${START}&endTs=${START + 1000}&after=${
      START + 499
    }`,
  );
  assert.equal(second.data.nextTs, null);
  assert.equal(second.data.points[0].reportTs, START + 500);
  query = new URL(f.state.query).searchParams;
  assert.equal(query.get("startTs"), String(START + 499));
  assert.equal(query.get("limit"), "502");
  const exhausted = fixture();
  const last = await exhausted.request(
    `deviceId=${DEVICE}&startTs=${START}&endTs=${START + 1000}&after=${
      START + 999
    }`,
  );
  assert.equal(last.response.status, 200);
  assert.deepEqual(last.data.points, []);
  assert.equal(last.data.nextTs, null);
  assert.equal(exhausted.state.fetches, 0);
});

Deno.test("history returns confirmed unmapped history without contacting the platform", async () => {
  const f = fixture();
  f.state.access.tbDeviceId = null;
  f.state.url = "invalid";
  const { response, data } = await f.request();
  assert.equal(response.status, 200);
  assert.deepEqual(data.points, []);
  assert.equal(data.availability, "preparing");
  assert.equal(f.state.fetches, 0);
  assert.equal(f.state.reads, 2);
  for (const body of [{}, { sourceReport: [] }]) {
    const mapped = fixture();
    mapped.state.body = body;
    assert.equal((await mapped.request()).response.status, 200);
  }
});

Deno.test("history preserves consent boundaries across pages using one internal overlap report", async () => {
  const f = fixture();
  f.state.body = { sourceReport: [row(499), row(500), row(501, { status: { ...STATUS, location: LOCATION }, consentVersion: 4 })] };
  const query = `deviceId=${DEVICE}&startTs=${START}&endTs=${START + 1000}&after=${START + 499}`;
  const { response, data } = await f.request(query);
  assert.equal(response.status, 200);
  assert.deepEqual(data.points.map((point: { reportTs: number; breakBefore: boolean }) => [point.reportTs, point.breakBefore]), [
    [START + 500, false], [START + 501, true],
  ]);
  f.state.body = { sourceReport: [row(500)] };
  const missingOverlap = await f.request(query);
  assert.equal(missingOverlap.data.points[0].breakBefore, true);

  const full = fixture();
  full.state.body = { sourceReport: Array.from({length: 502}, (_, index) => row(index + 499)) };
  const continuation = await full.request(`deviceId=${DEVICE}&startTs=${START}&endTs=${START + 1100}&after=${START + 499}`);
  assert.equal(continuation.response.status, 200);
  assert.equal(continuation.data.points.length, 500);
  assert.equal(continuation.data.nextTs, START + 999);
  assert.equal(continuation.data.points[0].breakBefore, false);
});

Deno.test("history exposes business availability and synchronization without platform diagnostics", async () => {
  const f = fixture();
  f.state.access.failedCount = 0;
  f.state.access.droppedCount = 0;
  assert.equal((await f.request()).data.syncState, "pending");
  f.state.access.pendingCount = 0;
  assert.equal((await f.request()).data.syncState, "current");
  f.state.access.historyId = null;
  assert.equal((await f.request()).response.status, 503);
});

Deno.test("history rejects malformed, duplicated and out-of-window request parameters", async () => {
  for (
    const query of [
      `deviceId=${DEVICE}&startTs=0&endTs=86400001`,
      `deviceId=${DEVICE}&startTs=1&endTs=1`,
      `deviceId=${DEVICE}&startTs=-1&endTs=1`,
      `deviceId=${DEVICE}&startTs=1.0&endTs=2`,
      `deviceId=${DEVICE}&startTs=01&endTs=2`,
      `deviceId=${DEVICE}&startTs=1e2&endTs=200`,
      `deviceId=${DEVICE}&startTs=0&endTs=9007199254740992`,
      `deviceId=${DEVICE}&endTs=1`,
      `deviceId=${DEVICE}&startTs=0&endTs=1&after=1`,
      `deviceId=${DEVICE}&startTs=1&endTs=2&after=0`,
      `deviceId=${DEVICE}&startTs=0&endTs=2&after=`,
      `deviceId=${DEVICE}&startTs=0&endTs=2&after=0&after=1`,
      `deviceId=${DEVICE}&startTs=0&endTs=2&tbDeviceId=${TB}`,
      `deviceId=${DEVICE}&startTs=0&startTs=1&endTs=2`,
    ]
  ) {
    const f = fixture();
    assert.equal((await f.request(query)).response.status, 400, query);
    assert.equal(f.state.reads, 0);
    assert.equal(f.state.fetches, 0);
  }
  assert.equal(
    (await fixture().request(undefined, "POST")).response.status,
    405,
  );
});

Deno.test("history denies revoked access and any changed ownership, epoch or mapping before return", async () => {
  for (
    const field of [
      "ownerId",
      "authorizationEpoch",
      "historyId",
      "tbDeviceId",
      "simulated",
      "permission",
    ]
  ) {
    const f = fixture();
    f.state.reread = () => {
      if (field === "ownerId") f.state.access.ownerId = DEVICE;
      if (field === "authorizationEpoch") f.state.access.authorizationEpoch++;
      if (field === "historyId") f.state.access.historyId = DEVICE;
      if (field === "tbDeviceId") f.state.access.tbDeviceId = DEVICE;
      if (field === "simulated") f.state.access.simulated = false;
      if (field === "permission") f.state.rpcError = { code: "42501" };
    };
    const result = await f.request();
    assert.equal(result.response.status, 403, field);
    assert.equal(result.data.points, undefined);
  }
  const denied = fixture();
  denied.state.rpcError = { code: "42501" };
  assert.equal((await denied.request()).response.status, 403);
  assert.equal(denied.state.fetches, 0);
  const auth = fixture();
  auth.state.authError = new HttpError(401, "session_revoked", "Revoked");
  assert.equal((await auth.request()).response.status, 401);
});

Deno.test("history rejects corrupt platform reports instead of manufacturing empty history", async () => {
  const mutations: Array<(report: Record<string, unknown>) => void> = [
    (r) => r.deviceId = TB,
    (r) => r.authorizationEpoch = 1,
    (r) => r.consentVersion = 0,
    (r) => r.observedAt = new Date(START + 1).toISOString(),
    (r) => r.seq = 0,
    (r) => r.status = { ...STATUS, location: { ...LOCATION, lat: 91 } },
    (r) =>
      r.status = {
        ...STATUS,
        location: { ...LOCATION, observedAt: "invalid" },
      },
    (r) => r.status = { ...STATUS, location: { ...LOCATION, accuracyM: -1 } },
    (r) => r.status = { ...STATUS, location: null },
    (r) => r.error = "upstream_unavailable",
    (r) => r.extra = true,
  ];
  const invalid: unknown[] = [
    null,
    [],
    { sourceReport: null },
    { other: [] },
    { sourceReport: [row(), row()] },
    { sourceReport: [row(1), row()] },
    { sourceReport: [row(1000)] },
    { sourceReport: [row(-1)] },
    { sourceReport: [{ ...row(), value: "{" }] },
    { sourceReport: [{ ...row(), ts: String(START) }] },
    { sourceReport: Array.from({ length: 502 }, (_, index) => row(index)) },
  ];
  for (const mutate of mutations) {
    const item = row();
    const report = JSON.parse(item.value);
    mutate(report);
    item.value = JSON.stringify(report);
    invalid.push({ sourceReport: [item] });
  }
  for (const body of invalid) {
    const f = fixture();
    f.state.body = body;
    assert.equal(
      (await f.request()).response.status,
      503,
      JSON.stringify(body)?.slice(0, 150),
    );
  }
});

Deno.test("history confines the platform credential to HTTPS or explicit HTTP loopback", async () => {
  for (
    const url of [
      "http://thingsboard.test",
      "https://user:pass@thingsboard.test",
      "https://thingsboard.test/path",
      "https://thingsboard.test?x=1",
      "https://thingsboard.test#fragment",
      "file:///tmp/history",
      "invalid",
    ]
  ) {
    const f = fixture();
    f.state.url = url;
    assert.equal((await f.request()).response.status, 503);
    assert.equal(f.state.fetches, 0);
  }
  for (
    const url of [
      "http://127.0.0.1:8080",
      "http://localhost:8080",
      "http://[::1]:8080",
    ]
  ) {
    const f = fixture();
    f.state.url = url;
    assert.equal((await f.request()).response.status, 200);
  }
  const f = fixture();
  f.state.key = "";
  assert.equal((await f.request()).response.status, 503);
});

Deno.test("history maps platform errors, oversized bodies, broken streams and deadlines to unavailable", async () => {
  for (
    const platform of [
      () => new Response("denied", { status: 401 }),
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://other.test" },
        }),
      () => new Response("broken-json"),
      () => new Response("{}", { headers: { "content-length": "4194305" } }),
      () => new Response(" ".repeat(4194305)),
      () => Promise.reject(new DOMException("Timed out", "TimeoutError")),
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("broken stream"));
            },
          }),
        ),
    ]
  ) {
    const f = fixture();
    f.state.platform = platform;
    assert.equal((await f.request()).response.status, 503);
  }
  const f = fixture();
  f.state.authError = new Error("auth transport");
  assert.equal((await f.request()).response.status, 503);
});

Deno.test("history aborts stalled response bodies after the platform deadline and cancels rejected bodies", async () => {
  const stalled = fixture();
  let aborted = false;
  stalled.state.platform = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          stalled.state.options!.signal!.addEventListener("abort", () => {
            aborted = true;
            controller.error(
              new DOMException("Deadline exceeded", "AbortError"),
            );
          }, { once: true });
        },
      }),
    );
  assert.equal((await stalled.request()).response.status, 503);
  assert.equal(aborted, true);
  const oversized = fixture();
  let cancelled = false;
  oversized.state.platform = () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-length": "4194305" } },
    );
  assert.equal((await oversized.request()).response.status, 503);
  assert.equal(cancelled, true);
});
