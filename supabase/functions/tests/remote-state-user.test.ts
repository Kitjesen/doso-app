import assert from "node:assert/strict";
import type { authenticate } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";
import { handleRemoteState, status } from "../remote-state/handler.ts";

const DEVICE = "11111111-1111-4111-8111-111111111111";
const TIME = "2026-11-03T12:00:00.000Z";
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
};

const LOCATION = {
  lat: 31.2304,
  lon: 121.4737,
  fixType: 1,
  observedAt: TIME,
  accuracyM: null,
};

function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const state: {
    authCalls: number;
    authError: unknown;
    error: unknown;
    data: Record<string, unknown>;
    rpc?: () => Promise<unknown>;
  } = {
    authCalls: 0,
    authError: null,
    error: null,
    data: {
      deviceId: DEVICE,
      simulated: false,
      enabled: false,
      revision: 1,
      activation: "off",
      reachable: null,
      fresh: false,
      lastSeenAt: null,
      latest: null,
      lastSuccess: null,
    },
  };
  const authorize = (async () => {
    state.authCalls++;
    if (state.authError) throw state.authError;
    return {
      caller: { user: { id: "22222222-2222-4222-8222-222222222222" } },
      db: {
        rpc() {
          throw new Error("Privileged user operation is forbidden.");
        },
      },
      userDb: {
        async rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          if (state.rpc) await state.rpc();
          return { data: state.data, error: state.error };
        },
      },
    };
  }) as unknown as typeof authenticate;
  async function request(
    body?: unknown,
    query = `?deviceId=${DEVICE}`,
    method = body === undefined ? "GET" : "POST",
  ) {
    const response = await handleRemoteState(
      new Request(
        `https://api.test/remote-state${body === undefined ? query : ""}`,
        {
          method,
          ...(body === undefined ? {} : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
        },
      ),
      { authenticate: authorize },
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return {
      response,
      data: response.status === 204
        ? null
        : await response.json() as Record<string, unknown>,
    };
  }
  return { state, calls, request, authorize };
}

Deno.test("remote state GET returns the caller-owned default-off DTO through caller RLS", async () => {
  const f = fixture();
  const result = await f.request();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, f.state.data);
  assert.deepEqual(f.calls, [{
    name: "get_remote_state",
    args: { p_device_id: DEVICE },
  }]);
});

Deno.test("public status omits transport while internal report validation still requires it", async () => {
  assert.equal(status(STATUS), false);
  assert.equal(status({ ...STATUS, transport: "mtls" }), true);
  assert.equal(status({ ...STATUS, transport: "unexpected" }), false);
  const f = fixture();
  f.state.data.latest = { observedAt: TIME, receivedAt: TIME, status: STATUS };
  const publicResult = await f.request();
  assert.equal(publicResult.response.status, 200);
  assert(!JSON.stringify(publicResult.data).includes('"transport"'));
  f.state.data.latest = { observedAt: TIME, receivedAt: TIME, status: { ...STATUS, transport: "mtls" } };
  assert.equal((await f.request()).response.status, 503);
});

Deno.test("remote state preserves original GNSS time and unknown accuracy", async () => {
  const f = fixture();
  const status = { ...STATUS, location: LOCATION };
  f.state.data.latest = { observedAt: TIME, receivedAt: TIME, status };
  const result = await f.request();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data?.latest, f.state.data.latest);
});

Deno.test("remote state rejects malformed GNSS in stored results", async () => {
  for (
    const location of [
      null,
      { ...LOCATION, lat: 91 },
      { ...LOCATION, lon: -181 },
      { ...LOCATION, fixType: 0 },
      { ...LOCATION, accuracyM: -1 },
      { ...LOCATION, accuracyM: 100001 },
      { ...LOCATION, observedAt: "now" },
      { ...LOCATION, extra: true },
    ]
  ) {
    const f = fixture();
    f.state.data.latest = {
      observedAt: TIME,
      receivedAt: TIME,
      status: { ...STATUS, location },
    };
    assert.equal((await f.request()).response.status, 503);
  }
});

Deno.test("remote state change waits for the transactional result and forwards CAS revision", async () => {
  const f = fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const dispatched = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.state.rpc = () => {
    entered();
    return gate;
  };
  let completed = false;
  const pending = f.request({ deviceId: DEVICE, enabled: true, revision: 1 })
    .then((result) => {
      completed = true;
      return result;
    });
  await dispatched;
  assert.equal(completed, false);
  f.state.data = {
    ...f.state.data,
    enabled: true,
    revision: 2,
    activation: "enabling",
  };
  release();
  const result = await pending;
  assert.equal(result.response.status, 200);
  assert.equal(result.data?.activation, "enabling");
  assert.deepEqual(f.calls, [{
    name: "set_remote_state",
    args: { p_device_id: DEVICE, p_enabled: true, p_revision: 1 },
  }]);
});

Deno.test("user authorization failure reads no body and invokes no database RPC", async () => {
  const f = fixture();
  f.state.authError = new HttpError(401, "session_revoked", "Session revoked.");
  class Tracked extends Request {
    reads = 0;
    override get body() {
      this.reads++;
      return super.body;
    }
  }
  const request = new Tracked("https://api.test/remote-state", {
    method: "POST",
    body: "{}",
  });
  const result = await handleRemoteState(request, {
    authenticate: f.authorize,
  });
  assert.equal(result.status, 401);
  assert.equal(request.reads, 0);
  assert.equal(f.calls.length, 0);
});

Deno.test("user methods and OPTIONS reject or return before authentication", async () => {
  const f = fixture();
  assert.equal((await f.request(undefined, "", "DELETE")).response.status, 405);
  assert.equal(
    (await f.request(undefined, "", "OPTIONS")).response.status,
    204,
  );
  assert.equal(f.state.authCalls, 0);
});

Deno.test("user requests accept one canonical device and typed enabled/revision only", async () => {
  const f = fixture();
  for (
    const query of [
      "",
      `?deviceId=${DEVICE}&deviceId=${DEVICE}`,
      `?deviceId=${DEVICE}&owner=other`,
      "?deviceId=dog",
    ]
  ) {
    assert.equal((await f.request(undefined, query)).response.status, 400);
  }
  for (
    const body of [
      { deviceId: DEVICE, enabled: "true", revision: 1 },
      { deviceId: DEVICE, enabled: true, revision: -1 },
      { deviceId: DEVICE, enabled: true, revision: 0 },
      { deviceId: DEVICE, enabled: true, revision: 1.5 },
      { deviceId: DEVICE, enabled: true, revision: 9007199254740992 },
      { deviceId: DEVICE, enabled: true, revision: 1, ownerId: "other" },
      { enabled: true, revision: 1 },
    ]
  ) assert.equal((await f.request(body)).response.status, 400);
  assert.equal(f.calls.length, 0);
});

Deno.test("database access denial and CAS conflicts use fixed public errors", async () => {
  for (
    const [code, status, expected] of [
      ["42501", 403, "remote_state_access_denied"],
      ["40001", 409, "remote_state_revision_conflict"],
      ["54000", 409, "remote_state_revision_exhausted"],
      ["22023", 400, "invalid_remote_state"],
      ["XX000", 503, "remote_state_unavailable"],
    ] as const
  ) {
    const f = fixture();
    f.state.error = { code, message: "database password/private-token" };
    const result = await f.request({
      deviceId: DEVICE,
      enabled: false,
      revision: 1,
    });
    assert.equal(result.response.status, status);
    assert.equal(
      (result.data?.error as Record<string, unknown>).code,
      expected,
    );
    assert.equal(JSON.stringify(result.data).includes("private-token"), false);
  }
});

Deno.test("latest error preserves the original last-success time without exposing internal report identity", async () => {
  const f = fixture();
  f.state.data = {
    ...f.state.data,
    enabled: true,
    activation: "on",
    reachable: true,
    lastSeenAt: TIME,
    latest: {
      observedAt: TIME,
      receivedAt: TIME,
      error: "upstream_unavailable",
    },
    lastSuccess: {
      observedAt: "2026-11-03T11:59:00.000Z",
      receivedAt: "2026-11-03T11:59:00.100Z",
      status: STATUS,
    },
  };
  const result = await f.request();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, f.state.data);
  assert.equal(
    JSON.stringify(result.data).includes("reportingSessionId"),
    false,
  );
});

Deno.test("malformed or internal database projection fails closed instead of leaking the row", async () => {
  for (
    const change of [
      { deviceId: "22222222-2222-4222-8222-222222222222" },
      { reportingSessionId: "internal" },
      { revision: 9007199254740992 },
      { revision: 0 },
      { activation: "ready" },
      { lastSeenAt: "2026-11-03T12:00:00Z" },
      {
        latest: {
          observedAt: TIME,
          receivedAt: TIME,
          status: STATUS,
          error: "upstream_unavailable",
        },
      },
      {
        lastSuccess: {
          observedAt: TIME,
          receivedAt: TIME,
          error: "upstream_unavailable",
        },
      },
      {
        latest: {
          observedAt: TIME,
          receivedAt: TIME,
          status: { ...STATUS, battery: 99 },
        },
      },
    ]
  ) {
    const f = fixture();
    f.state.data = { ...f.state.data, ...change };
    const result = await f.request();
    assert.equal(result.response.status, 503);
    assert.equal(JSON.stringify(result.data).includes("internal"), false);
  }
});

Deno.test("user JSON body is bounded and invalid UTF-8 is rejected", async () => {
  const f = fixture();
  for (
    const [body, expected] of [[" ".repeat(4097), 413], [
      new Uint8Array([0xff]),
      400,
    ]] as const
  ) {
    const response = await handleRemoteState(
      new Request("https://api.test/remote-state", { method: "POST", body }),
      { authenticate: f.authorize },
    );
    assert.equal(response.status, expected);
  }
  assert.equal(f.calls.length, 0);
});

Deno.test("simulation identity is returned only from inventory DTO", async () => {
  const f = fixture();
  f.state.data.simulated = true;
  assert.equal((await f.request()).data?.simulated, true);
  for (const value of [undefined, "true", null]) {
    f.state.data.simulated = value;
    assert.equal((await f.request()).response.status, 503);
  }
});
