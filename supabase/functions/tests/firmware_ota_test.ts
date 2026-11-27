import { assertEquals } from "jsr:@std/assert@1";
import { handleFirmwareOta, isAdminOnlyRelease } from "../firmware-ota/handler.ts";

const DEVICE_ID = "13131313-1313-4131-8131-131313131313";
const USER_ID = "e934cee0-2b14-45f9-bcf7-2679cb9ef372";

const SAMPLE_RELEASES = [
  {
    releaseId: "rel-bundle-1",
    version: "1.0.0",
    sequence: 10,
    channel: "stable",
    model: "THUNDER 01",
    hardwareRevision: "rdk-s100p",
    artifactSizeBytes: 10_000_000,
    artifactSha256: "a".repeat(64),
    artifactType: "release_bundle",
  },
  {
    releaseId: "rel-bms-1",
    version: "0.43.0",
    sequence: 11,
    channel: "stable",
    model: "THUNDER 01",
    hardwareRevision: "rdk-s100p",
    artifactSizeBytes: 200_000,
    artifactSha256: "b".repeat(64),
    artifactType: "component_release",
    component: "fw-bms",
  },
];

function mockAuth(role: "user" | "admin", owned = true) {
  const row = owned
    ? { id: DEVICE_ID, display_name: "THUNDER 研发机 003", serial_number: "THUNDER-DEV-003" }
    : null;
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: row ? [row] : [], error: null }),
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  const db = { from: () => builder };
  return async () => ({
    caller: {
      token: "tok",
      user: { id: USER_ID },
      sessionId: "sess-1",
      role,
      accountStatus: "active",
      aal: "aal1",
      profile: {},
    },
    db,
    userDb: db,
  }) as never;
}

const mockEnv = (name: string) =>
  name === "DOSO_OTA_RELEASE_URL"
    ? "http://127.0.0.1:8140"
    : name === "DOSO_OTA_RELEASE_TOKEN"
    ? "t".repeat(32)
    : undefined;

const mockFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("/status")) {
    return new Response(JSON.stringify({ deviceId: DEVICE_ID, firmwareVersion: "v0.0.3" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.endsWith("/firmware/releases")) {
    return new Response(JSON.stringify(SAMPLE_RELEASES), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.endsWith("/firmware/jobs")) {
    return new Response(
      JSON.stringify({
        jobId: "job-1",
        deviceId: DEVICE_ID,
        releaseId: "rel-bms-1",
        idempotencyKey: "k-1",
        phase: "scheduled",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }
  return new Response("not found", { status: 404 });
};

Deno.test("isAdminOnlyRelease gates hardware firmware components", () => {
  assertEquals(isAdminOnlyRelease({ artifactType: "release_bundle" }), false);
  assertEquals(isAdminOnlyRelease({ artifactType: "policy_package" }), false);
  assertEquals(isAdminOnlyRelease({ artifactType: "component_release", component: "voice" }), false);
  assertEquals(isAdminOnlyRelease({ artifactType: "component_release", component: "fw-esp32" }), true);
  assertEquals(isAdminOnlyRelease({ artifactType: "component_release", component: "fw-bms" }), true);
  assertEquals(isAdminOnlyRelease({ artifactType: "component_release", component: "ota" }), true);
});

Deno.test("regular user sees bundle only and is blocked from starting fw-bms", async () => {
  const inspectResp = await handleFirmwareOta(
    new Request("https://api-test.dosorobotics.com/functions/v1/firmware-ota", {
      method: "POST",
      body: JSON.stringify({ action: "inspect", deviceId: DEVICE_ID }),
    }),
    { authenticate: mockAuth("user"), env: mockEnv, fetch: mockFetch },
  );
  assertEquals(inspectResp.status, 200);
  const inspectBody = await inspectResp.json();
  assertEquals(inspectBody.isAdmin, false);
  assertEquals(inspectBody.releases.length, 1);
  assertEquals(inspectBody.releases[0].releaseId, "rel-bundle-1");

  const startResp = await handleFirmwareOta(
    new Request("https://api-test.dosorobotics.com/functions/v1/firmware-ota", {
      method: "POST",
      body: JSON.stringify({
        action: "start",
        deviceId: DEVICE_ID,
        releaseId: "rel-bms-1",
        idempotencyKey: "k-1",
      }),
    }),
    { authenticate: mockAuth("user"), env: mockEnv, fetch: mockFetch },
  );
  assertEquals(startResp.status, 403);
  const errBody = await startResp.json();
  assertEquals(errBody.error.code, "firmware_admin_only");
});

Deno.test("admin sees and can start fw-bms hardware release", async () => {
  const inspectResp = await handleFirmwareOta(
    new Request("https://api-test.dosorobotics.com/functions/v1/firmware-ota", {
      method: "POST",
      body: JSON.stringify({ action: "inspect", deviceId: DEVICE_ID }),
    }),
    { authenticate: mockAuth("admin"), env: mockEnv, fetch: mockFetch },
  );
  assertEquals(inspectResp.status, 200);
  const inspectBody = await inspectResp.json();
  assertEquals(inspectBody.isAdmin, true);
  assertEquals(inspectBody.releases.length, 2);

  const startResp = await handleFirmwareOta(
    new Request("https://api-test.dosorobotics.com/functions/v1/firmware-ota", {
      method: "POST",
      body: JSON.stringify({
        action: "start",
        deviceId: DEVICE_ID,
        releaseId: "rel-bms-1",
        idempotencyKey: "k-1",
      }),
    }),
    { authenticate: mockAuth("admin"), env: mockEnv, fetch: mockFetch },
  );
  assertEquals(startResp.status, 201);
  const body = await startResp.json();
  assertEquals(body.job.jobId, "job-1");
});

Deno.test("strips signed manifest from job responses, decodes version/size, preserves 202, and filters is_simulated", async () => {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    order: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () =>
      Promise.resolve({
        data: { id: DEVICE_ID, display_name: "Dog3", serial_number: "SN-3" },
        error: null,
      }),
  };
  const db = { from: () => builder };
  const auth = (async () => ({
    caller: {
      token: "tok",
      user: { id: USER_ID },
      sessionId: "sess-1",
      role: "user",
      accountStatus: "active",
      aal: "aal1",
      profile: {},
    },
    db,
    userDb: db,
  })) as never;

  const rawPayload = btoa(JSON.stringify({
    version: "1.0.5",
    artifactSizeBytes: 724464,
    artifactUrl: "https://oss-secret.example/pkg.tar.gz?Expires=999",
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const fetchWithManifest: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/firmware/releases")) {
      return new Response(JSON.stringify([SAMPLE_RELEASES[0]]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/firmware/jobs")) {
      return new Response(
        JSON.stringify({
          jobId: "job-202",
          deviceId: DEVICE_ID,
          releaseId: "rel-bundle-1",
          idempotencyKey: "k-202",
          phase: "waiting_safe_window",
          bytesDownloaded: 724464,
          currentVersion: "1.0.0",
          manifest: { payload: rawPayload, signature: "secret-sig" },
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  const resp = await handleFirmwareOta(
    new Request("https://api.dosorobotics.com/functions/v1/firmware-ota", {
      method: "POST",
      body: JSON.stringify({
        action: "start",
        deviceId: DEVICE_ID,
        releaseId: "rel-bundle-1",
        idempotencyKey: "k-202",
      }),
    }),
    { authenticate: auth, env: mockEnv, fetch: fetchWithManifest },
  );

  assertEquals(resp.status, 202);
  const body = await resp.json();
  assertEquals(body.job.manifest, undefined);
  assertEquals(body.job.targetVersion, "1.0.5");
  assertEquals(body.job.totalBytes, 724464);
  assertEquals(body.job.phase, "waiting_safe_window");
  assertEquals(
    filters.some(([col, val]) => col === "is_simulated" && val === false),
    true,
  );
});
