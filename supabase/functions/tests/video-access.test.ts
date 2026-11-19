import assert from "node:assert/strict";
import { sha256Hex } from "../_shared/crypto.ts";
import { HttpError } from "../_shared/http.ts";
import { handleVideoAccess } from "../video-access/handler.ts";
import { handleVideoAuthorize } from "../video-authorize/handler.ts";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = 1793851200000;
const GRANT = { viewerId: VIEWER, deviceId: DEVICE, expiresAt: NOW + 60_000 };

function request(body: unknown, token?: string) {
  return new Request("https://api.test/video", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const state: { data: unknown; error: unknown; authError?: Error } = {
    data: GRANT,
    error: null,
  };
  const db = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: state.data, error: state.error });
    },
  };
  const authenticate = (() => {
    if (state.authError) return Promise.reject(state.authError);
    return Promise.resolve({
      caller: { user: { id: VIEWER } },
      userDb: db,
      db: {
        rpc() {
          throw new Error("Issuance must use caller authority.");
        },
      },
    });
  }) as unknown as typeof import("../_shared/auth.ts").authenticate;
  return { calls, state, db, authenticate };
}

Deno.test("video open returns opaque single-device credential and stores only its digest", async () => {
  const f = fixture();
  const response = await handleVideoAccess(
    request({ action: "open", deviceId: DEVICE }),
    {
      authenticate: f.authenticate,
      now: () => NOW,
    },
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(result.viewerToken, /^[0-9a-f]{64}$/);
  assert.deepEqual(f.calls, [{
    name: "open_video_access",
    args: {
      p_device_id: DEVICE,
      p_digest: await sha256Hex(result.viewerToken),
    },
  }]);
  assert.notEqual(f.calls[0].args.p_digest, result.viewerToken);
  assert.deepEqual({ ...result, viewerToken: undefined }, {
    ...GRANT,
    viewerToken: undefined,
  });
});

Deno.test("video open denies another owner and never returns an unconfirmed grant", async () => {
  for (
    const data of [
      { ...GRANT, deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { ...GRANT, viewerId: "22222222-2222-4222-8222-222222222222" },
      { ...GRANT, expiresAt: NOW },
      { ...GRANT, expiresAt: NOW + 65_001 },
    ]
  ) {
    const f = fixture();
    f.state.data = data;
    const response = await handleVideoAccess(
      request({ action: "open", deviceId: DEVICE }),
      {
        authenticate: f.authenticate,
        now: () => NOW,
      },
    );
    assert.equal(response.status, 503);
    assert.equal(
      JSON.stringify(await response.json()).includes("viewerToken"),
      false,
    );
  }
  const f = fixture();
  f.state.error = { code: "42501" };
  assert.equal(
    (await handleVideoAccess(request({ action: "open", deviceId: DEVICE }), {
      authenticate: f.authenticate,
    })).status,
    403,
  );
});

Deno.test("video authentication failure runs no database operation", async () => {
  const f = fixture();
  f.state.authError = new HttpError(401, "session_revoked", "Revoked.");
  assert.equal(
    (await handleVideoAccess(request({ action: "open", deviceId: DEVICE }), {
      authenticate: f.authenticate,
    })).status,
    401,
  );
  assert.equal(f.calls.length, 0);
});

Deno.test("video close revokes the current caller session through caller RPC", async () => {
  const f = fixture();
  assert.equal(
    (await handleVideoAccess(request({ action: "close", deviceId: DEVICE }), {
      authenticate: f.authenticate,
    })).status,
    204,
  );
  assert.deepEqual(f.calls, [{
    name: "close_video_access",
    args: { p_device_id: DEVICE },
  }]);
});

Deno.test("video authorize returns the Rust contract without forwarding the credential", async () => {
  const f = fixture();
  const response = await handleVideoAuthorize(
    request({ action: "video.view" }, "a".repeat(64)),
    {
      createClient: () => f.db,
      now: () => NOW,
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), GRANT);
  assert.deepEqual(f.calls, [{
    name: "authorize_video_access",
    args: {
      p_digest: await sha256Hex("a".repeat(64)),
    },
  }]);
});

Deno.test("video authorize rejects malformed, revoked, expired and unavailable permissions", async () => {
  const f = fixture();
  for (const token of [undefined, "user.jwt.token", "a".repeat(63)]) {
    assert.equal(
      (await handleVideoAuthorize(request({ action: "video.view" }, token), {
        createClient: () => {
          throw new Error("Must reject before constructing a client.");
        },
      })).status,
      401,
    );
  }
  f.state.data = null;
  assert.equal(
    (await handleVideoAuthorize(
      request({ action: "video.view" }, "a".repeat(64)),
      {
        createClient: () => f.db,
      },
    )).status,
    403,
  );
  f.state.data = { ...GRANT, expiresAt: NOW };
  assert.equal(
    (await handleVideoAuthorize(
      request({ action: "video.view" }, "a".repeat(64)),
      {
        createClient: () => f.db,
        now: () => NOW,
      },
    )).status,
    503,
  );
  f.state.error = { code: "08006" };
  assert.equal(
    (await handleVideoAuthorize(
      request({ action: "video.view" }, "a".repeat(64)),
      {
        createClient: () => f.db,
      },
    )).status,
    503,
  );
});
