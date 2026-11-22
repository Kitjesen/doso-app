import { createAdminDevicesHandler } from "../admin-devices/handler.ts";
import type { authenticate } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { HttpError } from "../_shared/http.ts";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function setup({ error = null, missing = false }: {
  error?: { code: string; message: string } | null;
  missing?: boolean;
} = {}) {
  const authCalls: Array<Parameters<typeof authenticate>> = [];
  const calls: Array<{ name: string; values: Record<string, unknown> }> = [];
  let projection = "";
  const db = {
    rpc(name: string, values: Record<string, unknown>) {
      calls.push({ name, values });
      if (name === "create_device_inventory") {
        return {
          select(columns: string) {
            projection = columns;
            return {
              single() {
                return Promise.resolve({
                  data: error ? null : {
                    id: DEVICE_ID,
                    owner_id: null,
                    model_code: values.p_model_code,
                    display_name: values.p_display_name,
                    category: values.p_category,
                    environment: values.p_environment,
                    serial_number: values.p_serial_number,
                    connection_status: "offline",
                    is_demo: false,
                    is_simulated: values.p_is_simulated,
                  },
                  error,
                });
              },
            };
          },
        };
      }
      if (
        name === "admin_rotate_device_claim" ||
        name === "admin_issue_factory_claim"
      ) {
        return Promise.resolve({ data: !missing, error });
      }
      assert(name === "admin_unbind_device", "unexpected RPC");
      return Promise.resolve({
        data: missing ? null : { id: DEVICE_ID, owner_id: null },
        error,
      });
    },
  };
  const authenticateRequest = ((...args: Parameters<typeof authenticate>) => {
    authCalls.push(args);
    return Promise.resolve({
      caller: { user: { id: ADMIN_ID }, role: "admin" },
      db,
    });
  }) as unknown as typeof authenticate;
  const handler = createAdminDevicesHandler(authenticateRequest);
  const request = (body: Record<string, unknown>) =>
    handler(
      new Request("https://example.test/functions/v1/admin-devices", {
        method: "POST",
        headers: { "x-request-id": "inventory-test" },
        body: JSON.stringify({ action: "create_inventory", ...body }),
      }),
    );
  return { request, authCalls, calls, projection: () => projection };
}

Deno.test("inventory creation uses one audited RPC and safe device projection", async () => {
  const test = setup();
  const response = await test.request({
    serialNumber: " doso-local-001 ",
    modelCode: " Thunder ",
    owner_id: ADMIN_ID,
    is_demo: true,
  });
  assert(response.status === 201, "inventory creation failed");
  const device = (await response.json()).device;
  assert(device.id === DEVICE_ID, "database device ID was not returned");
  assert(
    device.owner_id === null && device.is_demo === false,
    "inventory creation assigned ownership or created a demo",
  );
  assert(test.calls.length === 1, "inventory creation made multiple writes");
  const call = test.calls[0];
  assert(
    call.name === "create_device_inventory" &&
      call.values.p_actor_user_id === ADMIN_ID &&
      call.values.p_serial_number === "DOSO-LOCAL-001" &&
      call.values.p_model_code === "Thunder" &&
      call.values.p_display_name === "Thunder" &&
      call.values.p_category === "四足" &&
      call.values.p_environment === "室外" &&
      call.values.p_reason === "inventory_provision" &&
      call.values.p_request_id === "inventory-test" &&
      !("owner_id" in call.values) && !("is_demo" in call.values),
    "inventory RPC lost normalized values or audit context",
  );
  assert(
    test.projection().includes("serial_number") &&
      !test.projection().includes("robot_authorization_epoch"),
    "inventory response did not use the existing safe columns",
  );
  const [, roles, activeSession, aal2] = test.authCalls[0];
  assert(
    roles?.join(",") === "admin" && activeSession === true && aal2 === true,
    "inventory creation relaxed administrator authentication",
  );
});

Deno.test("inventory creation preserves explicit domain values", async () => {
  const test = setup();
  const response = await test.request({
    serialNumber: "DOSO-LOCAL-002",
    modelCode: "Thunder",
    displayName: "室内巡检",
    category: "轮式",
    environment: "室内",
    reason: "local verification",
  });
  assert(response.status === 201, "explicit inventory creation failed");
  const device = (await response.json()).device;
  assert(
    device.display_name === "室内巡检" && device.category === "轮式" &&
      device.environment === "室内" &&
      test.calls[0].values.p_reason === "local verification",
    "explicit inventory values changed",
  );
});

Deno.test("only an inventory serial conflict returns serial_exists", async () => {
  for (
    const [message, expectedStatus] of [["serial_exists", 409], [
      "audit constraint",
      500,
    ]] as const
  ) {
    const test = setup({ error: { code: "23505", message } });
    const response = await test.request({
      serialNumber: "doso-local-001",
      modelCode: "Thunder",
    });
    assert(
      response.status === expectedStatus,
      "unique error was misclassified",
    );
    const body = await response.json();
    assert(
      body.error.code ===
        (expectedStatus === 409 ? "serial_exists" : "internal_error"),
      "public error changed",
    );
    assert(test.calls.length === 1, "conflict caused an additional write");
  }
});

Deno.test("invalid inventory fields stop before the transaction", async () => {
  for (
    const fields of [
      { serialNumber: "", modelCode: "Thunder" },
      { serialNumber: "DOSO-LOCAL-001", modelCode: "" },
      { serialNumber: "DOSO-LOCAL-001", modelCode: "x".repeat(101) },
      {
        serialNumber: "DOSO-LOCAL-001",
        modelCode: "Thunder",
        category: "robot",
      },
      {
        serialNumber: "DOSO-LOCAL-001",
        modelCode: "Thunder",
        environment: "unassigned",
      },
    ]
  ) {
    const test = setup();
    const response = await test.request(fields);
    assert(response.status === 400, "invalid inventory fields were accepted");
    await response.body?.cancel();
    assert(test.calls.length === 0, "invalid inventory fields reached storage");
  }
});

Deno.test("inventory authentication failures stop before storage", async () => {
  const handler = createAdminDevicesHandler(() =>
    Promise.reject(
      new HttpError(403, "mfa_required", "Administrator MFA is required."),
    )
  );
  const response = await handler(
    new Request("https://example.test/functions/v1/admin-devices", {
      method: "POST",
      body: JSON.stringify({
        action: "create_inventory",
        serialNumber: "DOSO-LOCAL-001",
        modelCode: "Thunder",
      }),
    }),
  );
  assert(
    response.status === 403 &&
      (await response.json()).error.code === "mfa_required",
    "inventory creation bypassed administrator MFA",
  );
});

Deno.test("inventory transaction failures do not return creation success", async () => {
  const test = setup({
    error: { code: "P0001", message: "audit unavailable" },
  });
  const response = await test.request({
    serialNumber: "DOSO-LOCAL-001",
    modelCode: "Thunder",
  });
  assert(
    response.status === 500 &&
      (await response.json()).error.code === "internal_error",
    "failed transaction returned creation success",
  );
  assert(
    test.calls.length === 1,
    "failed transaction was followed by another write",
  );
});

Deno.test("binding code rotation sends only its digest to the audited transaction", async () => {
  const test = setup();
  const response = await test.request({
    action: "rotate_binding_code",
    deviceId: DEVICE_ID,
    code: "ab-cd-12",
    reason: "rotation",
  });
  assert(response.status === 200, "rotation failed");
  const result = await response.json();
  const call = test.calls[0];
  assert(
    call.name === "admin_rotate_device_claim" &&
      call.values.p_actor_user_id === ADMIN_ID &&
      call.values.p_device_id === DEVICE_ID &&
      call.values.p_code_digest === await sha256Hex("ABCD12") &&
      call.values.p_reason === "rotation" &&
      call.values.p_request_id === "inventory-test",
    "rotation lost digest or audit context",
  );
  assert(
    result.bindingCode === "ABCD12" && result.oneTimeDisplay === true &&
      result.expiresAt === call.values.p_expires_at &&
      !JSON.stringify(result).includes(String(call.values.p_code_digest)),
    "rotation exposed private claim data or lost its one-time result",
  );
});

Deno.test("force unbind uses the audited administrator transaction", async () => {
  const test = setup();
  const response = await test.request({
    action: "unbind",
    deviceId: DEVICE_ID,
    reason: "returned device",
  });
  const result = await response.json();
  assert(
    response.status === 200 && result.unbound === true &&
      result.device.id === DEVICE_ID,
    "unbind result changed",
  );
  const call = test.calls[0];
  assert(
    call.name === "admin_unbind_device" &&
      call.values.p_actor_user_id === ADMIN_ID &&
      call.values.p_device_id === DEVICE_ID &&
      call.values.p_reason === "returned device" &&
      call.values.p_request_id === "inventory-test",
    "unbind lost its audit context",
  );
});

Deno.test("factory QR contains a fresh 160-bit claim and stores only its digest", async () => {
  const test = setup();
  const expiresAt = new Date(Date.now() + 730 * 86400_000).toISOString();
  const results = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await test.request({
      action: "issue_factory_claim",
      deviceId: DEVICE_ID.toUpperCase(),
      expiresAt,
    });
    assert(response.status === 200, "factory issuance failed");
    assert(
      response.headers.get("cache-control") === "no-store",
      "secret response may be cached",
    );
    const result = await response.json();
    const claimUrl = new URL(result.claimUrl);
    const code = claimUrl.searchParams.get("claim")!;
    assert(
      claimUrl.protocol === "doso:" && claimUrl.hostname === "robot" &&
        claimUrl.pathname === `/${DEVICE_ID}` &&
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{32}$/.test(code),
      "factory QR contract changed",
    );
    const call = test.calls[attempt];
    assert(
      call.name === "admin_issue_factory_claim" &&
        call.values.p_code_digest === await sha256Hex(code) &&
        call.values.p_expires_at === expiresAt &&
        call.values.p_actor_user_id === ADMIN_ID &&
        call.values.p_reason === "factory_claim_issuance",
      "factory issuance lost its digest or expiry",
    );
    assert(
      !JSON.stringify(call.values).includes(code) &&
        !JSON.stringify(result).includes(String(call.values.p_code_digest)) &&
        result.oneTimeDisplay === true,
      "claim secret or digest leaked across its boundary",
    );
    results.push(code);
  }
  assert(results[0] !== results[1], "factory issuance reused a claim secret");
  const [, roles, activeSession, aal2] = test.authCalls[0];
  assert(
    roles?.join(",") === "admin" && activeSession === true && aal2 === true,
    "factory issuance relaxed admin authentication",
  );
});

Deno.test("factory issuance requires a UUID v4 and explicit future UTC expiry", async () => {
  for (
    const fields of [
      {},
      { expiresAt: "invalid" },
      { expiresAt: "2020-01-01T00:00:00.000Z" },
      { expiresAt: "2030-02-30T00:00:00.000Z" },
      { expiresAt: "2030-01-01" },
      { deviceId: "not-a-uuid", expiresAt: "2030-01-01T00:00:00.000Z" },
    ]
  ) {
    const test = setup();
    const response = await test.request({
      action: "issue_factory_claim",
      deviceId: DEVICE_ID,
      ...fields,
    });
    assert(
      response.status === 400 && test.calls.length === 0,
      "invalid factory issuance reached storage",
    );
    await response.body?.cancel();
  }
});

Deno.test("factory issuance reports ineligible, missing and transaction failures", async () => {
  for (
    const [options, expectedStatus] of [
      [
        { error: { code: "P0001", message: "factory_device_unavailable" } },
        409,
      ],
      [{ missing: true }, 404],
      [{ error: { code: "P0001", message: "audit unavailable" } }, 500],
    ] as const
  ) {
    const test = setup(options);
    const response = await test.request({
      action: "issue_factory_claim",
      deviceId: DEVICE_ID,
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert(
      response.status === expectedStatus && test.calls.length === 1,
      "failed factory transaction returned success",
    );
    assert(
      !JSON.stringify(await response.json()).includes("claimUrl"),
      "failed factory transaction returned a secret",
    );
  }
});

Deno.test("missing devices return 404 for rotation and unbind", async () => {
  for (const action of ["rotate_binding_code", "unbind"]) {
    const test = setup({ missing: true });
    const response = await test.request({
      action,
      deviceId: DEVICE_ID,
      reason: "missing device",
      code: "ABC123",
    });
    assert(
      response.status === 404 &&
        (await response.json()).error.code === "device_not_found",
      "missing device did not return 404",
    );
  }
});

Deno.test("rotation and unbind transaction errors do not return success", async () => {
  for (const action of ["rotate_binding_code", "unbind"]) {
    const test = setup({
      error: { code: "P0001", message: "audit unavailable" },
    });
    const response = await test.request({
      action,
      deviceId: DEVICE_ID,
      reason: "audit failure",
      code: "ABC123",
    });
    assert(
      response.status === 500 &&
        (await response.json()).error.code === "internal_error",
      "failed audited transaction returned success",
    );
    assert(
      test.calls.length === 1,
      "mutation made additional writes after failure",
    );
  }
});

Deno.test("simulated inventory is explicit and still unowned", async () => {
  const test = setup();
  const response = await test.request({
    serialNumber: "DOSO-SIM-001",
    modelCode: "Thunder",
    simulated: true,
  });
  const device = (await response.json()).device;
  assert(
    response.status === 201 && device.is_simulated === true &&
      device.is_demo === false && device.owner_id === null,
    "simulation identity was lost",
  );
  assert(
    test.calls[0].values.p_is_simulated === true &&
      test.projection().includes("is_simulated"),
    "simulation must be created by the audited RPC",
  );
  const invalid = setup();
  assert(
    (await invalid.request({
      serialNumber: "DOSO-SIM-002",
      modelCode: "Thunder",
      simulated: "true",
    })).status === 400,
    "invalid simulation flag accepted",
  );
  assert(invalid.calls.length === 0, "invalid flag reached database");
});
