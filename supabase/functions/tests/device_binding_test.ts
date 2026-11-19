import { createDeviceBindingHandler } from "../_shared/deviceBinding.ts";
import type { authenticate } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/crypto.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5";
const device = { id: DEVICE_ID, owner_id: USER_ID, is_demo: false };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function setup({ owned = false, reject = false, legacyFound = true } = {}) {
  const queries: Array<Record<string, unknown>> = [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      const query: Record<string, unknown> = { table };
      queries.push(query);
      const chain = {
        select(columns: string) {
          query.columns = columns;
          return chain;
        },
        eq(field: string, value: unknown) {
          query[field] = value;
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({
            data: query.columns === "id"
              ? legacyFound ? { id: DEVICE_ID } : null
              : owned
              ? device
              : null,
            error: null,
          });
        },
      };
      return chain;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: reject ? null : device, error: null });
    },
  };
  const authenticateRequest = (async () => ({
    caller: { user: { id: USER_ID } },
    db,
  })) as unknown as typeof authenticate;
  const handler = createDeviceBindingHandler(
    authenticateRequest,
    async (_db, _caller, input) => {
      audits.push(input as unknown as Record<string, unknown>);
    },
  );
  const request = (body: Record<string, unknown>) =>
    handler(
      new Request(
        "https://example.test/functions/v1/device-binding",
        { method: "POST", body: JSON.stringify(body) },
      ),
    );
  return { request, calls, queries, audits };
}

Deno.test("UUID claim normalizes the ID and submits only its code digest", async () => {
  const test = setup();
  const response = await test.request({
    action: "claim",
    deviceId: ` ${DEVICE_ID.toUpperCase()} `,
    code: "claim-01",
  });
  assert(response.status === 200, "claim failed");
  assert(
    (await response.json()).device.id === DEVICE_ID,
    "wrong device returned",
  );
  assert(
    test.queries[0].id === DEVICE_ID,
    "ownership retry lookup used a different ID",
  );
  assert(
    test.calls[0].name === "claim_device_with_digest",
    "claim RPC changed",
  );
  assert(
    test.calls[0].args.p_device_id === DEVICE_ID,
    "UUID was not sent to SQL",
  );
  assert(test.calls[0].args.p_user_id === USER_ID, "caller identity changed");
  assert(
    test.calls[0].args.p_code_digest === await sha256Hex("CLAIM01"),
    "raw binding code reached SQL",
  );
  assert(
    !JSON.stringify(test.audits).includes("CLAIM01"),
    "audit contains a binding code",
  );
});

Deno.test("invalid device IDs and codes stop before any device query", async () => {
  for (
    const deviceId of [
      "thunder_v4_001",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      DEVICE_ID.replaceAll("-", ""),
    ]
  ) {
    const test = setup();
    const response = await test.request({
      action: "claim",
      deviceId,
      code: "CLAIM01",
    });
    assert(response.status === 400, "invalid device ID was accepted");
    assert(
      (await response.json()).error.code === "invalid_device_id",
      "wrong error code",
    );
    assert(
      test.queries.length === 0 && test.calls.length === 0,
      "invalid ID reached SQL",
    );
  }
  const test = setup();
  assert(
    (await test.request({ action: "claim", deviceId: DEVICE_ID, code: "bad" }))
      .status === 400,
    "short binding code accepted",
  );
  assert(
    test.queries.length === 0 && test.calls.length === 0,
    "invalid code reached SQL",
  );
});

Deno.test("installed serial claim resolves to the same UUID transaction", async () => {
  const test = setup();
  const response = await test.request({
    action: "claim",
    serialNumber: " old-serial ",
    code: "CLAIM01",
  });
  assert(response.status === 200, "installed App claim failed");
  assert(
    test.queries[0].serial_number === "OLD-SERIAL",
    "legacy serial normalization changed",
  );
  assert(test.queries[1].id === DEVICE_ID, "resolved device ID was not reused");
  assert(
    test.calls.length === 1 && test.calls[0].args.p_device_id === DEVICE_ID,
    "legacy claim bypassed UUID transaction",
  );
  const unknown = setup({ legacyFound: false });
  const rejected = await unknown.request({
    action: "claim",
    serialNumber: "unknown",
    code: "CLAIM01",
  });
  assert(
    rejected.status === 400 &&
      (await rejected.json()).error.code === "claim_rejected",
    "unknown serial was accepted",
  );
  assert(
    unknown.calls.length === 0,
    "unknown inventory record reached claim transaction",
  );
});

Deno.test("already committed claims return the existing device without consuming another code", async () => {
  const test = setup({ owned: true });
  const response = await test.request({
    action: "claim",
    deviceId: DEVICE_ID,
    code: "CLAIM01",
  });
  assert(
    response.status === 200 && (await response.json()).device.id === DEVICE_ID,
    "retry lost its committed device",
  );
  assert(test.calls.length === 0, "retry consumed a second claim");
  assert(
    test.audits[0].metadata &&
      (test.audits[0].metadata as Record<string, unknown>).idempotentRetry ===
        true,
    "retry audit missing",
  );
});

Deno.test("rejected claims and unbinds preserve their public errors", async () => {
  const test = setup({ reject: true });
  const claim = await test.request({
    action: "claim",
    deviceId: DEVICE_ID,
    code: "CLAIM01",
  });
  assert(
    claim.status === 400 &&
      (await claim.json()).error.code === "claim_rejected",
    "claim failure changed",
  );
  const unbind = await test.request({ action: "unbind", deviceId: DEVICE_ID });
  assert(
    unbind.status === 404 &&
      (await unbind.json()).error.code === "device_not_found",
    "unbind accepted a null result",
  );
  assert(test.calls[1].args.p_owner_id === USER_ID, "unbind lost owner check");
});

Deno.test("authentication failure stops binding", async () => {
  const handler = createDeviceBindingHandler(async () => {
    throw new HttpError(401, "invalid_authorization", "Authentication failed.");
  });
  const response = await handler(
    new Request("https://example.test/functions/v1/device-binding", {
      method: "POST",
      body: JSON.stringify({
        action: "claim",
        deviceId: DEVICE_ID,
        code: "CLAIM01",
      }),
    }),
  );
  assert(response.status === 401, "binding bypassed authentication");
});
