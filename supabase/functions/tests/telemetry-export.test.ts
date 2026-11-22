import assert from "node:assert/strict";
import { createTelemetryExportHandler } from "../telemetry-export/handler.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "22222222-2222-4222-8222-222222222222";
const SECRET = "sb_secret_synthetic_telemetry";
function fixture() {
  const calls: unknown[] = [];
  const state = {
    data: { v: 1, items: [] } as unknown,
    error: null as unknown,
    keys: JSON.stringify({
      "telemetry-export": SECRET,
      "remote-state-sync": "other",
    }),
  };
  const handler = createTelemetryExportHandler({
    readEnvironment: (name) =>
      name === "SUPABASE_SECRET_KEYS" ? state.keys : undefined,
    createClient: () => ({
      rpc(name, args) {
        calls.push({ name, args });
        return Promise.resolve({ data: state.data, error: state.error });
      },
    }),
  });
  const request = (body: unknown = { v: 1, action: "claim" }, key = SECRET) =>
    handler(
      new Request("https://api.test/telemetry-export", {
        method: "POST",
        headers: { apikey: key },
        body: JSON.stringify(body),
      }),
    );
  return { state, calls, handler, request };
}

Deno.test("telemetry export requires its dedicated named key before accessing database", async () => {
  const f = fixture();
  for (const key of ["", "other", "user-bearer"]) {
    assert.equal((await f.request(undefined, key)).status, 401);
  }
  assert.equal(f.calls.length, 0);
  f.state.keys = "invalid";
  assert.equal((await f.request()).status, 503);
  assert.equal(f.calls.length, 0);
});

Deno.test("telemetry export validates actions and forwards exact RPC arguments", async () => {
  const f = fixture();
  assert.equal((await f.request()).status, 200);
  f.state.data = { v: 1, allowed: false };
  assert.equal(
    (await f.request({
      v: 1,
      action: "check",
      id: ID,
      leaseToken: TOKEN,
      tbDeviceId: null,
    })).status,
    200,
  );
  f.state.data = { v: 1, accepted: true };
  for (const outcome of ["delivered", "retry", "conflict"]) {
    assert.equal(
      (await f.request({
        v: 1,
        action: "finish",
        id: ID,
        leaseToken: TOKEN,
        outcome,
      })).status,
      200,
    );
  }
  assert.deepEqual(f.calls.slice(0, 2), [
    { name: "claim_telemetry_export", args: {} },
    {
      name: "check_telemetry_export",
      args: { p_id: ID, p_lease_token: TOKEN, p_tb_device_id: null },
    },
  ]);
  for (
    const body of [{ v: 2, action: "claim" }, {
      v: 1,
      action: "claim",
      extra: true,
    }, {
      v: 1,
      action: "finish",
      id: ID,
      leaseToken: TOKEN,
      outcome: "secret-error",
    }, { v: 1, action: "check", id: ID, leaseToken: TOKEN, tbDeviceId: "bad" }]
  ) {
    assert.equal((await f.request(body)).status, 400);
  }
  assert.equal(f.calls.length, 5);
});

Deno.test("telemetry claim preserves accepted optional fields without applying live age checks", async () => {
  const f = fixture();
  const received = {
    receivedAt: "2026-11-01T00:00:00.000Z",
    report: {
      v: 1,
      kind: "status.report",
      deviceId: ID,
      authorizationEpoch: 2,
      consentVersion: 3,
      seq: 1,
      connectionId: ID,
      reportingSessionId: TOKEN,
      observedAt: "2026-11-01T00:00:00.000Z",
      status: {
        state: {},
        control: {},
        transport: "mtls",
        location: { lat: 31, lon: 121 },
      },
    },
  };
  f.state.data = {
    v: 1,
    items: [{
      id: ID,
      leaseToken: TOKEN,
      deviceId: ID,
      ownerId: ID,
      authorizationEpoch: 2,
      consentVersion: 3,
      tbDeviceId: null,
      simulated: true,
      received,
    }],
  };
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items[0].received, received);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

Deno.test("telemetry export masks database errors and rejects unconfirmed responses", async () => {
  const f = fixture();
  for (
    const data of [{ v: 2, items: [] }, {
      v: 1,
      items: [{ password: "private" }],
    }, { v: 1, items: [], secret: true }]
  ) {
    f.state.data = data;
    const response = await f.request();
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes("private"), false);
  }
  f.state.error = { message: "private-password" };
  assert.equal(
    (await (await f.request()).text()).includes("private-password"),
    false,
  );
  const options = await f.handler(
    new Request("https://api.test/telemetry-export", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.test" },
    }),
  );
  assert.equal(options.status, 204);
  assert.equal(options.headers.has("access-control-allow-origin"), false);
});
