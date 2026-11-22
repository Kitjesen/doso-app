import assert from "node:assert/strict";
import type { authenticate } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";
import { handleRemoteControl } from "../remote-control/handler.ts";

const DEVICE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const KEY = "synthetic-service-key-for-control-tests";
const grant = () => ({
  deviceId: DEVICE,
  sessionId: SESSION,
  expiresAt: new Date(Date.now() + 20_000).toISOString(),
  grant: "synthetic-signed-control-grant",
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

function fixture() {
  const filters: Array<[string, unknown]> = [];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const env: Record<string, string> = {
    DOSO_CONTROL_GATEWAY_URL: "https://gateway.test",
    DOSO_CONTROL_GATEWAY_KEY: KEY,
    DOSO_CONTROL_PUBLIC_URL: "https://control.test",
  };
  const state: {
    data: { id: string; robot_authorization_epoch: number } | null;
    dbError: unknown;
    authError: unknown;
    authCalls: number;
    upstream: () => Response;
  } = {
    data: { id: DEVICE, robot_authorization_epoch: 7 },
    dbError: null,
    authError: null,
    authCalls: 0,
    upstream: () => json(grant()),
  };
  const auth = (async () => {
    state.authCalls++;
    if (state.authError) throw state.authError;
    const builder = {
      select(columns: string) {
        assert.equal(columns, "id,robot_authorization_epoch");
        return builder;
      },
      eq(name: string, value: unknown) {
        filters.push([name, value]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: state.data, error: state.dbError });
      },
    };
    return {
      caller: { user: { id: USER } },
      userDb: {
        from(name: string) {
          assert.equal(name, "devices");
          return builder;
        },
      },
      db: {
        from() {
          throw new Error("Service-role ownership reads are forbidden.");
        },
      },
    };
  }) as unknown as typeof authenticate;
  const fetch = ((url: string | URL | Request, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(state.upstream());
  }) as typeof globalThis.fetch;
  async function request(
    body: unknown = { action: "create", deviceId: DEVICE },
    method = "POST",
  ) {
    const response = await handleRemoteControl(
      new Request("https://app.test/functions/v1/remote-control", {
        method,
        ...(method === "POST"
          ? {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
          : {}),
      }),
      { authenticate: auth, env: (name) => env[name], fetch },
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, body: await response.json() };
  }
  return { request, calls, filters, state, env };
}

Deno.test("control session uses authenticated owner and database epoch", async () => {
  const f = fixture(), result = await f.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.endpoint, "https://control.test");
  assert.equal(result.body.grant, "synthetic-signed-control-grant");
  assert.equal(result.body.operatorId, undefined);
  assert.deepEqual(f.filters, [["id", DEVICE], ["owner_id", USER], [
    "is_demo",
    false,
  ], ["is_simulated", false]]);
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.calls[0].url,
    `https://gateway.test/api/v1/robots/${DEVICE}/control/sessions`,
  );
  assert.equal(f.calls[0].init.method, "POST");
  assert.equal(f.calls[0].init.redirect, "error");
  assert.equal(
    (f.calls[0].init.headers as Record<string, string>).Authorization,
    `Bearer ${KEY}`,
  );
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
    operatorId: USER,
    authorizationEpoch: 7,
  });
  assert.equal(JSON.stringify(result.body).includes(KEY), false);
});

Deno.test("unauthenticated and foreign devices cannot reach the gateway", async () => {
  const denied = fixture();
  denied.state.authError = new HttpError(
    401,
    "invalid_authorization",
    "Access denied.",
  );
  assert.equal((await denied.request()).status, 401);
  assert.equal(denied.calls.length, 0);
  const foreign = fixture();
  foreign.state.data = null;
  assert.equal((await foreign.request()).status, 403);
  assert.equal(foreign.calls.length, 0);
});

Deno.test("caller cannot supply operator identity, epoch or an unsupported action", async () => {
  for (
    const body of [
      { action: "create", deviceId: DEVICE, operatorId: USER },
      { action: "create", deviceId: DEVICE, authorizationEpoch: 7 },
      { action: "velocity", deviceId: DEVICE },
      { action: "close", deviceId: DEVICE, sessionId: "bad" },
      { action: "create", deviceId: "bad" },
    ]
  ) {
    const f = fixture();
    assert.equal((await f.request(body)).status, 400);
    assert.equal(f.calls.length, 0);
  }
});

Deno.test("close checks ownership and requests only the specified session", async () => {
  const f = fixture();
  f.state.upstream = () => json({ closed: true });
  const result = await f.request({
    action: "close",
    deviceId: DEVICE,
    sessionId: SESSION,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { closed: true });
  assert.equal(f.calls[0].init.method, "DELETE");
  assert.equal(
    f.calls[0].url,
    `https://gateway.test/api/v1/robots/${DEVICE}/control/sessions/${SESSION}`,
  );
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
    operatorId: USER,
    authorizationEpoch: 7,
  });
});

Deno.test("configuration errors and backend failures never return a grant", async () => {
  for (
    const [name, value] of [
      ["DOSO_CONTROL_GATEWAY_URL", "http://public.test"],
      ["DOSO_CONTROL_GATEWAY_URL", "https://user:pass@gateway.test"],
      ["DOSO_CONTROL_GATEWAY_KEY", ""],
      ["DOSO_CONTROL_PUBLIC_URL", "http://public.test"],
      ["DOSO_CONTROL_PUBLIC_URL", "https://control.test?token=bad"],
    ]
  ) {
    const f = fixture();
    f.env[name] = value;
    assert.equal((await f.request()).status, 503);
    assert.equal(f.calls.length, 0);
  }
  for (const status of [401, 403, 404, 500, 503]) {
    const f = fixture();
    f.state.upstream = () => json({ key: KEY }, status);
    const result = await f.request();
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result.body).includes(KEY), false);
  }
  const busy = fixture();
  busy.state.upstream = () => json({}, 409);
  assert.equal((await busy.request()).status, 409);
});

Deno.test("malformed gateway results, expired grants and broken ownership data fail closed", async () => {
  for (
    const patch of [
      { deviceId: USER },
      { sessionId: "bad" },
      { expiresAt: "2026-02-30T00:00:00.000Z" },
      { expiresAt: new Date(Date.now() - 1).toISOString() },
      { expiresAt: new Date(Date.now() + 60_000).toISOString() },
      { grant: "" },
      { grant: "a".repeat(8193) },
      { extra: true },
    ]
  ) {
    const f = fixture();
    f.state.upstream = () => json({ ...grant(), ...patch });
    assert.equal((await f.request()).status, 503);
  }
  const broken = fixture();
  broken.state.data!.robot_authorization_epoch = 0;
  assert.equal((await broken.request()).status, 503);
  assert.equal(broken.calls.length, 0);
});
