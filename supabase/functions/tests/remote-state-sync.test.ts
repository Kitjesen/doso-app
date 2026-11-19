import assert from "node:assert/strict";
import { createRemoteStateSyncHandler } from "../remote-state-sync/handler.ts";

const DEVICE = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const TIME = "2026-11-03T12:00:00.000Z";
const NOW = Date.parse(TIME);
const SECRET = "sb_secret_synthetic_remote_sync";
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
  transport: "local-insecure",
};

const LOCATION = {
  lat: 31.2304,
  lon: 121.4737,
  fixType: 8,
  observedAt: TIME,
  accuracyM: null,
};
const PERMISSION = {
  authorizationEpoch: 1,
  consentVersion: 2,
  enabled: true,
  connectionId: CONNECTION,
  reportingSessionId: SESSION,
  expiresAt: "2026-11-03T12:00:30.000Z",
};

function batch() {
  return {
    v: 1,
    observedAt: TIME,
    devices: [{
      deviceId: DEVICE,
      connectionId: CONNECTION,
      lastSeenAt: TIME,
      reachable: true,
      sessionReusable: true,
      permission: {
        authorizationEpoch: 1,
        consentVersion: 2,
        desiredEnabled: true,
        deviceConfirmed: true,
        reportingSessionId: SESSION,
        expiresAt: PERMISSION.expiresAt,
      },
      latest: {
        receivedAt: TIME,
        report: {
          v: 1,
          kind: "status.report",
          deviceId: DEVICE,
          connectionId: CONNECTION,
          reportingSessionId: SESSION,
          authorizationEpoch: 1,
          consentVersion: 2,
          seq: 1,
          observedAt: TIME,
          status: STATUS,
        },
      },
    }],
  };
}

function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const state: {
    clients: number;
    keys: string | undefined;
    secretName: string | undefined;
    data: unknown;
    error: unknown;
    throws: boolean;
  } = {
    clients: 0,
    keys: JSON.stringify({
      "remote-state-sync": SECRET,
      "robot-ingress": "sb_secret_other",
    }),
    secretName: undefined,
    data: { v: 1, permissions: [{ deviceId: DEVICE, permission: PERMISSION }] },
    error: null,
    throws: false,
  };
  const handler = createRemoteStateSyncHandler({
    now: () => NOW,
    readEnvironment: (name) =>
      name === "SUPABASE_SECRET_KEYS"
        ? state.keys
        : name === "DOSO_REMOTE_SYNC_SECRET_NAME"
        ? state.secretName
        : undefined,
    createClient() {
      state.clients++;
      return {
        async rpc(name, args) {
          calls.push({ name, args });
          if (state.throws) throw new Error("private-server-password");
          return { data: state.data, error: state.error };
        },
      };
    },
  });
  async function request(
    body: unknown = batch(),
    headers: Record<string, string> = { apikey: SECRET },
  ) {
    const response = await handler(
      new Request("https://api.test/remote-state-sync", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { response, data: await response.json() as Record<string, unknown> };
  }
  return { state, calls, handler, request };
}

Deno.test("sync forwards optional location without changing its fix time", async () => {
  const f = fixture();
  const input = structuredClone(batch());
  Object.assign(input.devices[0].latest.report.status, { location: LOCATION });
  assert.equal((await f.request(input)).response.status, 200);
  assert.deepEqual(f.calls[0].args.p_devices, input.devices);
});

Deno.test("sync rejects invalid location before database mutation", async () => {
  for (
    const location of [
      null,
      { ...LOCATION, lat: 91 },
      { ...LOCATION, lon: "121" },
      { ...LOCATION, fixType: 0 },
      { ...LOCATION, fixType: 1.5 },
      { ...LOCATION, accuracyM: -1 },
      { ...LOCATION, observedAt: "invalid" },
    ]
  ) {
    const f = fixture();
    const input = structuredClone(batch());
    Object.assign(input.devices[0].latest.report.status, { location });
    assert.equal((await f.request(input)).response.status, 400);
    assert.equal(f.calls.length, 0);
  }
});

Deno.test("sync requires its named apikey before reading body or constructing a privileged client", async () => {
  const f = fixture();
  class Tracked extends Request {
    reads = 0;
    override get body() {
      this.reads++;
      return super.body;
    }
  }
  const credentials: Record<string, string>[] = [
    {},
    { authorization: "Bearer user.jwt.value" },
    { apikey: "service.role.jwt" },
    { apikey: "sb_secret_other" },
  ];
  for (const headers of credentials) {
    const request = new Tracked("https://api.test/remote-state-sync", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal((await f.handler(request)).status, 401);
    assert.equal(request.reads, 0);
  }
  assert.equal(f.state.clients, 0);
  assert.equal(f.calls.length, 0);
});

Deno.test("sync rejects absent or malformed named-key configuration without a legacy fallback", async () => {
  for (
    const keys of [
      undefined,
      "invalid JSON",
      "{}",
      JSON.stringify({ "robot-ingress": SECRET }),
    ]
  ) {
    const f = fixture();
    f.state.keys = keys;
    assert.equal((await f.request()).response.status, 503);
    assert.equal(f.state.clients, 0);
  }
  const f = fixture();
  f.state.secretName = "custom-sync";
  f.state.keys = JSON.stringify({ "custom-sync": SECRET });
  assert.equal((await f.request()).response.status, 200);
});

Deno.test("valid sync forwards the existing Gateway projection and returns only the permission wire contract", async () => {
  const f = fixture(), body = batch();
  const result = await f.request(body);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, f.state.data);
  assert.deepEqual(f.calls, [{
    name: "sync_remote_state",
    args: { p_observed_at: TIME, p_devices: body.devices },
  }]);
  assert.equal(JSON.stringify(result.data).includes("rejected"), false);
});

Deno.test("null and missing permission responses never invent an enable", async () => {
  const f = fixture();
  f.state.data = {
    v: 1,
    permissions: [{ deviceId: DEVICE, permission: null }],
  };
  assert.deepEqual((await f.request()).data, f.state.data);
  f.state.data = { v: 1, permissions: [] };
  assert.deepEqual((await f.request()).data, f.state.data);
});

Deno.test("sync enforces the 32-device bound and rejects duplicate identities", async () => {
  const f = fixture();
  f.state.data = { v: 1, permissions: [] };
  const body: Record<string, unknown> = {
    v: 1,
    observedAt: TIME,
    devices: Array.from({ length: 32 }, (_, index) => ({
      deviceId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      connectionId: null,
      lastSeenAt: null,
      reachable: false,
      permission: null,
      latest: null,
      sessionReusable: false,
    })),
  };
  assert.equal((await f.request(body)).response.status, 200);
  assert.equal(
    (await f.request({
      ...body,
      devices: [...body.devices as unknown[], (body.devices as unknown[])[0]],
    })).response.status,
    400,
  );
  assert.equal(
    (await f.request({
      ...body,
      devices: [(body.devices as unknown[])[0], (body.devices as unknown[])[0]],
    })).response.status,
    400,
  );
  assert.equal(f.calls.length, 1);
});

Deno.test("sync accepts time-window boundaries and rejects stale, future and noncanonical UTC batches", async () => {
  for (const offset of [-15000, 2000]) {
    const f = fixture();
    assert.equal(
      (await f.request({
        ...batch(),
        observedAt: new Date(NOW + offset).toISOString(),
      })).response.status,
      200,
    );
  }
  for (
    const observedAt of [
      new Date(NOW - 15001).toISOString(),
      new Date(NOW + 2001).toISOString(),
      "2026-11-03T12:00:00Z",
      "2026-11-03T12:00:00.000+00:00",
      "2026-02-30T12:00:00.000Z",
    ]
  ) {
    const f = fixture();
    assert.equal(
      (await f.request({ ...batch(), observedAt })).response.status,
      400,
    );
    assert.equal(f.state.clients, 0);
  }
});

Deno.test("wire byte limits apply to both declared size and actual UTF-8 chunks", async () => {
  const f = fixture();
  assert.equal(
    (await f.request("{}", { apikey: SECRET, "content-length": "131073" }))
      .response.status,
    413,
  );
  assert.equal(
    (await f.request({ ...batch(), padding: "值".repeat(45000) })).response
      .status,
    413,
  );
  assert.equal(f.state.clients, 0);
});

Deno.test("old projection fields, unsafe counters and malformed outcomes do not reach the database", async () => {
  const changes = [
    { fresh: true },
    { lastSuccess: null },
    { rejectedSessionId: null },
    { sessionReusable: null },
    { connectionId: "dog" },
    {
      permission: {
        ...batch().devices[0].permission,
        authorizationEpoch: 9007199254740992,
      },
    },
    {
      latest: {
        ...batch().devices[0].latest,
        report: { ...batch().devices[0].latest.report, seq: 0 },
      },
    },
    {
      latest: {
        ...batch().devices[0].latest,
        report: {
          ...batch().devices[0].latest.report,
          error: "upstream_unavailable",
        },
      },
    },
    {
      latest: {
        ...batch().devices[0].latest,
        report: {
          ...batch().devices[0].latest.report,
          status: { ...STATUS, battery: 9 },
        },
      },
    },
    {
      latest: {
        ...batch().devices[0].latest,
        report: {
          ...batch().devices[0].latest.report,
          status: { ...STATUS, transport: { toString: "mtls" } },
        },
      },
    },
  ];
  for (const change of changes) {
    const f = fixture();
    const body = batch();
    assert.equal(
      (await f.request({
        ...body,
        devices: [{ ...body.devices[0], ...change }],
      })).response.status,
      400,
    );
    assert.equal(f.state.clients, 0);
  }
});

Deno.test("an upstream error is forwarded with its original report and receipt timestamps", async () => {
  const f = fixture(), body = batch();
  const { status: _status, ...report } = body.devices[0].latest.report;
  const error = {
    ...report,
    observedAt: "2026-11-03T11:59:00.000Z",
    error: "upstream_unavailable",
  };
  const devices = [{
    ...body.devices[0],
    latest: { receivedAt: "2026-11-03T11:59:00.100Z", report: error },
  }];
  assert.equal((await f.request({ ...body, devices })).response.status, 200);
  assert.deepEqual(f.calls[0].args.p_devices, devices);
});

Deno.test("unexpected response identities, duplicate grants and extra internals fail closed", async () => {
  for (
    const data of [
      { v: 1, permissions: [{ deviceId: CONNECTION, permission: PERMISSION }] },
      {
        v: 1,
        permissions: [{ deviceId: DEVICE, permission: PERMISSION }, {
          deviceId: DEVICE,
          permission: PERMISSION,
        }],
      },
      {
        v: 1,
        permissions: [{
          deviceId: DEVICE,
          permission: { ...PERMISSION, privateKey: "secret" },
        }],
      },
      {
        v: 1,
        permissions: [{
          deviceId: DEVICE,
          permission: { ...PERMISSION, reportingSessionId: null },
        }],
      },
      { v: 1, permissions: [], rejected: [] },
    ]
  ) {
    const f = fixture();
    f.state.data = data;
    const result = await f.request();
    assert.equal(result.response.status, 503);
    assert.equal(JSON.stringify(result.data).includes("secret"), false);
  }
});

Deno.test("database failures are masked and invalid batches receive a stable public error", async () => {
  for (const mode of ["throw", "database", "invalid"] as const) {
    const f = fixture();
    f.state.throws = mode === "throw";
    f.state.error = mode === "invalid"
      ? { code: "22023", message: "private-server-password" }
      : mode === "database"
      ? new Error("private-server-password")
      : null;
    const result = await f.request();
    assert.equal(result.response.status, mode === "invalid" ? 400 : 503);
    assert.equal(
      JSON.stringify(result.data).includes("private-server-password"),
      false,
    );
  }
});

Deno.test("sync CORS does not enable browsers and unsupported methods do no database work", async () => {
  const f = fixture();
  const options = await f.handler(
    new Request("https://api.test/remote-state-sync", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.test" },
    }),
  );
  assert.equal(options.status, 204);
  assert.equal(options.headers.has("access-control-allow-origin"), false);
  assert.equal(
    (await f.handler(new Request("https://api.test/remote-state-sync"))).status,
    405,
  );
  assert.equal(f.state.clients, 0);
});
