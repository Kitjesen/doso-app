import assert from "node:assert/strict";
import type { authenticate } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";
import {
  handleMapLibrary,
  MAP_CATALOG_COLUMNS,
  MAP_PART_SIZE_BYTES,
  type MapObjectStore,
  type MapVersion,
} from "../map-library/handler.ts";

const OWNER = "11000000-0000-4000-8000-000000000001";
const DEVICE = "22000000-0000-4000-8000-000000000001";
const VERSION = "33000000-0000-4000-8000-000000000001";
const REQUEST = "44000000-0000-4000-8000-000000000001";
const metadata = {
  name: "Garage",
  source_map_id: "garage",
  source_content_epoch: "2",
  frame_id: "odom",
  format: "lingtu-map-package-v1",
  schema_version: 1,
  archive_format: "tar.gz",
  size_bytes: MAP_PART_SIZE_BYTES + 10,
  sha256: "a".repeat(64),
  crc64: "1234",
};
const parts = [{ number: 1, etag: "a".repeat(32) }, {
  number: 2,
  etag: "b".repeat(32),
}];

function fixture() {
  const version: MapVersion = {
    ...metadata,
    id: VERSION,
    owner_id: OWNER,
    device_id: DEVICE,
    authorization_epoch: 2,
    request_id: REQUEST,
    status: "uploading",
    created_at: "2026-11-03T00:00:00.000Z",
    ready_at: null,
    object_key: `maps/${OWNER}/${VERSION}.tar.gz`,
    upload_id: null,
  };
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const storeCalls: string[] = [];
  const state = {
    authCalls: 0,
    revoked: false,
    unavailable: false,
    deny: false,
    concurrentUpload: false,
    initialized: 0,
    actual: null as { size: number; crc64: string } | null,
    completeLost: false,
    cancelOnComplete: false,
    revokeOnComplete: false,
    cancelOnSign: false,
    providerFails: false,
  };
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      assert.equal(args.p_owner_id, OWNER);
      if (state.deny) {
        return {
          data: null,
          error: { code: "42501", message: "private database detail" },
        };
      }
      if (name === "prepare_map_version") {
        assert.equal(args.p_device_id, DEVICE);
        assert.equal(args.p_request_id, REQUEST);
        assert.deepEqual(args.p_metadata, metadata);
      }
      if (name === "set_map_upload_id") {
        if (version.status !== "uploading") {
          return {
            data: null,
            error: { code: "55000", message: "map_state_conflict" },
          };
        }
        if (!version.upload_id) {
          version.upload_id = state.concurrentUpload
            ? "winning-upload"
            : String(args.p_upload_id);
        }
      }
      if (name === "begin_map_verification") {
        if (!["uploading", "verifying"].includes(version.status)) {
          return {
            data: null,
            error: { code: "55000", message: "map_state_conflict" },
          };
        }
        version.status = "verifying";
      }
      if (name === "finish_map_verification") {
        if (version.status !== "verifying") {
          return {
            data: null,
            error: { code: "55000", message: "map_state_conflict" },
          };
        }
        if (
          args.p_size_bytes !== version.size_bytes ||
          args.p_crc64 !== version.crc64
        ) {
          version.status = "failed";
          return { data: { ...version }, error: null };
        }
        version.status = "ready";
        version.ready_at = "2026-11-03T00:01:00.000Z";
      }
      if (name === "cancel_map_version") version.status = "cancelled";
      return { data: { ...version }, error: null };
    },
  };
  const userDb = {
    from(table: string) {
      assert.equal(table, "device_map_versions");
      return {
        select(columns: string) {
          assert.equal(columns, MAP_CATALOG_COLUMNS);
          return {
            eq(column: string, value: unknown) {
              assert.equal(column, "owner_id");
              assert.equal(value, OWNER);
              return {
                order(column: string, options: { ascending: boolean }) {
                  assert.equal(column, "created_at");
                  assert.equal(options.ascending, false);
                  return {
                    limit(count: number) {
                      assert.equal(count, 100);
                      return Promise.resolve({
                        data: [{ ...version }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const authenticateFake = (async () => {
    state.authCalls++;
    if (state.revoked) {
      throw new HttpError(401, "session_revoked", "Session revoked.");
    }
    return {
      caller: { user: { id: OWNER }, sessionId: "fixture-session" },
      db,
      userDb,
    };
  }) as unknown as typeof authenticate;
  const store: MapObjectStore = {
    async initialize(key) {
      assert.equal(key, version.object_key);
      storeCalls.push("initialize");
      state.initialized++;
      return `upload-${state.initialized}`;
    },
    async signPart(key, uploadId, number, size) {
      assert.equal(key, version.object_key);
      assert.equal(uploadId, version.upload_id);
      assert.equal(number, 2);
      assert.equal(size, 10);
      storeCalls.push("signPart");
      if (state.cancelOnSign) version.status = "cancelled";
      return "https://bucket.example/map?part-signature=secret";
    },
    async complete(key, uploadId, submittedParts) {
      assert.equal(key, version.object_key);
      assert.equal(uploadId, version.upload_id);
      assert.deepEqual(submittedParts, parts);
      storeCalls.push("complete");
      if (state.providerFails) {
        throw new Error("AccessKeySecret=private-provider-detail");
      }
      state.actual = { size: version.size_bytes, crc64: version.crc64 };
      if (state.cancelOnComplete) version.status = "cancelled";
      if (state.revokeOnComplete) state.revoked = true;
      if (state.completeLost) throw new Error("lost completion response");
    },
    async head() {
      storeCalls.push("head");
      return state.actual;
    },
    async abort(_key, uploadId) {
      storeCalls.push(`abort:${uploadId}`);
    },
    async signDownload() {
      storeCalls.push("signDownload");
      return "https://bucket.example/map?download-signature=secret";
    },
  };
  const dependencies = {
    authenticate: authenticateFake,
    objectStore: () => {
      if (state.unavailable) throw new Error("credentials missing");
      return store;
    },
  };
  async function request(
    body?: Record<string, unknown>,
    method = body ? "POST" : "GET",
  ) {
    const response = await handleMapLibrary(
      new Request("https://api.example/functions/v1/map-library", {
        method,
        ...(body
          ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
          : {}),
      }),
      dependencies,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return {
      response,
      body: response.status === 204
        ? {}
        : await response.json() as Record<string, unknown>,
    };
  }
  return { version, state, calls, storeCalls, request };
}

Deno.test("map catalog GET uses caller RLS, strips internal capabilities, and works without OSS", async () => {
  const f = fixture();
  f.state.unavailable = true;
  const result = await f.request();
  assert.equal(result.response.status, 200);
  const [row] = result.body.versions as Record<string, unknown>[];
  assert.equal(row.name, "Garage");
  assert.equal(row.object_key, undefined);
  assert.equal(row.upload_id, undefined);
  assert.equal(f.calls.length, 0);
  assert.equal(f.storeCalls.length, 0);
});

Deno.test("unsupported method and OPTIONS perform no authentication", async () => {
  const f = fixture();
  assert.equal((await f.request(undefined, "DELETE")).response.status, 405);
  assert.equal((await f.request(undefined, "OPTIONS")).response.status, 204);
  assert.equal(f.state.authCalls, 0);
});

Deno.test("revoked session is rejected before catalog or storage access", async () => {
  const f = fixture();
  f.state.revoked = true;
  assert.equal((await f.request()).response.status, 401);
  assert.equal(f.calls.length, 0);
  assert.equal(f.storeCalls.length, 0);
});

Deno.test("map upload preparation persists one multipart id and returns only safe catalog metadata", async () => {
  const f = fixture();
  const result = await f.request({
    action: "prepare-upload",
    deviceId: DEVICE,
    requestId: REQUEST,
    metadata,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.uploadAvailable, true);
  assert.equal(result.body.partCount, 2);
  assert.equal(result.body.partSizeBytes, MAP_PART_SIZE_BYTES);
  assert.equal(
    (result.body.version as Record<string, unknown>).upload_id,
    undefined,
  );
  assert.deepEqual(f.storeCalls, ["initialize"]);
  assert.equal(f.state.authCalls, 2);
  await f.request({
    action: "prepare-upload",
    deviceId: DEVICE,
    requestId: REQUEST,
    metadata,
  });
  assert.deepEqual(f.storeCalls, ["initialize"]);
});

Deno.test("concurrent multipart preparation aborts its unused upload rather than replacing winner", async () => {
  const f = fixture();
  f.state.concurrentUpload = true;
  assert.equal(
    (await f.request({
      action: "prepare-upload",
      deviceId: DEVICE,
      requestId: REQUEST,
      metadata,
    })).response.status,
    200,
  );
  assert.equal(f.version.upload_id, "winning-upload");
  assert.deepEqual(f.storeCalls, ["initialize", "abort:upload-1"]);
});

Deno.test("cross-owner or stale-source database denial produces no object capability and no database detail", async () => {
  const f = fixture();
  f.state.deny = true;
  const result = await f.request({
    action: "upload-part",
    versionId: VERSION,
    partNumber: 2,
  });
  assert.equal(result.response.status, 403);
  assert.equal(f.storeCalls.length, 0);
  assert.equal(
    JSON.stringify(result.body).includes("private database detail"),
    false,
  );
});

Deno.test("part grants bind final-part size and recheck authorization and status before releasing URL", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  const result = await f.request({
    action: "upload-part",
    versionId: VERSION,
    partNumber: 2,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.sizeBytes, 10);
  assert.deepEqual(result.body.headers, { "content-length": "10" });
  assert.equal(f.state.authCalls, 2);
  f.state.cancelOnSign = true;
  const cancelled = await f.request({
    action: "upload-part",
    versionId: VERSION,
    partNumber: 2,
  });
  assert.equal(cancelled.response.status, 409);
  assert.equal(cancelled.body.url, undefined);
});

Deno.test("invalid part numbers and non-uploading states never create upload capabilities", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  for (const partNumber of [0, 3, 1.5, "2"]) {
    assert.equal(
      (await f.request({
        action: "upload-part",
        versionId: VERSION,
        partNumber,
      })).response.status,
      400,
    );
  }
  for (const status of ["verifying", "ready", "cancelled", "failed"]) {
    f.version.status = status;
    assert.equal(
      (await f.request({
        action: "upload-part",
        versionId: VERSION,
        partNumber: 2,
      })).response.status,
      409,
    );
  }
  assert.equal(f.storeCalls.length, 0);
});

Deno.test("completion verifies actual OSS size and checksum before marking ready, including a lost response", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  f.state.completeLost = true;
  const result = await f.request({
    action: "complete-upload",
    versionId: VERSION,
    parts,
  });
  assert.equal(result.response.status, 200);
  assert.equal(f.version.status, "ready");
  assert.deepEqual(f.storeCalls, ["head", "complete", "head"]);
  const finish = f.calls.find((call) =>
    call.name === "finish_map_verification"
  )!;
  assert.equal(finish.args.p_size_bytes, metadata.size_bytes);
  assert.equal(finish.args.p_crc64, "1234");
  assert.equal(f.state.authCalls, 2);
});

Deno.test("completion retry checks already-completed object and does not overwrite it", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  f.version.status = "verifying";
  f.state.actual = { size: metadata.size_bytes, crc64: "1234" };
  assert.equal(
    (await f.request({ action: "complete-upload", versionId: VERSION, parts }))
      .response.status,
    200,
  );
  assert.deepEqual(f.storeCalls, ["head"]);
});

Deno.test("wrong server checksum or size cannot become ready", async () => {
  for (
    const actual of [{ size: metadata.size_bytes - 1, crc64: "1234" }, {
      size: metadata.size_bytes,
      crc64: "9999",
    }]
  ) {
    const f = fixture();
    f.version.upload_id = "upload";
    f.state.actual = actual;
    const result = await f.request({
      action: "complete-upload",
      versionId: VERSION,
      parts,
    });
    assert.equal(result.response.status, 409);
    assert.equal(f.version.status, "failed");
    assert.equal(
      (result.body.error as Record<string, unknown>).code,
      "map_verification_mismatch",
    );
    assert.equal(
      (await f.request({
        action: "complete-upload",
        versionId: VERSION,
        parts,
      })).response.status,
      409,
    );
  }
});

Deno.test("cancelled or revoked completion cannot publish a ready map", async () => {
  for (const change of ["cancelOnComplete", "revokeOnComplete"] as const) {
    const f = fixture();
    f.version.upload_id = "upload";
    f.state[change] = true;
    const result = await f.request({
      action: "complete-upload",
      versionId: VERSION,
      parts,
    });
    assert.equal(
      result.response.status,
      change === "cancelOnComplete" ? 409 : 401,
    );
    assert.notEqual(f.version.status, "ready");
  }
});

Deno.test("provider failure remains retryable and never leaks provider detail", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  f.state.providerFails = true;
  const result = await f.request({
    action: "complete-upload",
    versionId: VERSION,
    parts,
  });
  assert.equal(result.response.status, 503);
  assert.equal(f.version.status, "verifying");
  assert.equal(
    JSON.stringify(result.body).includes("private-provider-detail"),
    false,
  );
});

Deno.test("cancel persists the terminal state while OSS is unavailable", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  f.state.unavailable = true;
  assert.equal(
    (await f.request({ action: "cancel-upload", versionId: VERSION })).response
      .status,
    200,
  );
  assert.equal(f.version.status, "cancelled");
});

Deno.test("download uses fixed creator ownership and ready-only scope", async () => {
  const f = fixture();
  assert.equal(
    (await f.request({ action: "download", versionId: VERSION })).response
      .status,
    409,
  );
  f.version.status = "ready";
  const result = await f.request({ action: "download", versionId: VERSION });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.expiresInSeconds, 300);
  assert.equal(f.calls.at(-1)!.args.p_require_source, false);
  assert.equal(f.state.authCalls, 3);
});

Deno.test("multipart completion rejects gaps, duplicate numbers and untrusted ETag markup", async () => {
  const f = fixture();
  f.version.upload_id = "upload";
  for (
    const submitted of [[], parts.slice(1), [parts[0], parts[0]], [parts[0], {
      number: 2,
      etag: "<xml/>",
    }]]
  ) {
    assert.equal(
      (await f.request({
        action: "complete-upload",
        versionId: VERSION,
        parts: submitted,
      })).response.status,
      400,
    );
  }
  assert.equal(f.storeCalls.length, 0);
});
