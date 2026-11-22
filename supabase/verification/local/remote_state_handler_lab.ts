import assert from "node:assert/strict";
import type { authenticate } from "../../functions/_shared/auth.ts";
import { HttpError } from "../../functions/_shared/http.ts";
import { handleRemoteState } from "../../functions/remote-state/handler.ts";
import { createRemoteStateSyncHandler } from "../../functions/remote-state-sync/handler.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONNECTION = "44444444-4444-4444-8444-444444444444";
const SECRET = "sb_secret_synthetic_handler_lab";
const psql = Deno.env.get("DOSO_LAB_PSQL");
const resultPath = Deno.env.get("DOSO_LAB_RESULT");
assert(psql && resultPath, "Run through scripts/verify-remote-state-handler.mjs");
assert.equal(Deno.env.get("PGHOST"), "127.0.0.1");
assert.equal(Deno.env.get("PGDATABASE"), "doso_remote_state_fixture");
const cases: string[] = [];
const rpcCalls: string[] = [];
const literal = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";

function client(userId?: string) {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      let call: string;
      if (userId && name === "get_remote_state") {
        call = `public.get_remote_state(${literal(args.p_device_id)}::uuid)`;
      } else if (userId && name === "set_remote_state") {
        call = `public.set_remote_state(${literal(args.p_device_id)}::uuid,${literal(args.p_enabled)}::boolean,${literal(args.p_revision)}::bigint)`;
      } else if (!userId && name === "sync_remote_state") {
        call = `public.sync_remote_state(${literal(args.p_observed_at)}::timestamptz,${literal(JSON.stringify(args.p_devices))}::jsonb)`;
      } else throw new Error("Unsupported lab RPC");
      rpcCalls.push(name);
      const role = userId ? "authenticated" : "service_role";
      const setting = userId ? `set local request.user_id=${literal(userId)};` : "";
      const child = new Deno.Command(psql!, {
        args: ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-w",
          "-c", `begin; set local role ${role}; ${setting} select ${call}; commit;`],
        stdout: "piped", stderr: "piped",
      });
      const output = await child.output();
      if (!output.success) {
        const error = new TextDecoder().decode(output.stderr);
        const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(error)?.[1];
        assert(code, "PostgreSQL must provide an actual SQLSTATE: " + error);
        return { data: null, error: { code } };
      }
      return { data: JSON.parse(new TextDecoder().decode(output.stdout)), error: null };
    },
  };
}
const authorize = (async (request: Request) => {
  const token = request.headers.get("authorization");
  const userId = token === "Bearer synthetic-owner" ? OWNER : token === "Bearer synthetic-other" ? OTHER : null;
  if (!userId) throw new HttpError(401, "synthetic_auth_required", "Synthetic lab identity required.");
  return { userDb: client(userId) };
}) as unknown as typeof authenticate;
const syncHandler = createRemoteStateSyncHandler({
  readEnvironment: name => name === "SUPABASE_SECRET_KEYS" ? JSON.stringify({ "remote-state-sync": SECRET }) : undefined,
  createClient: () => client(),
});
type Body = Record<string, unknown>;
type Permission = { authorizationEpoch: number; consentVersion: number; enabled: boolean;
  connectionId: string; reportingSessionId: string | null; expiresAt: string };
async function user(body?: Body, identity = "synthetic-owner", expected = 200): Promise<Body> {
  const response = await handleRemoteState(new Request("http://127.0.0.1/remote-state" +
    (body ? "" : "?deviceId=" + DEVICE), {
    method: body ? "POST" : "GET", headers: { authorization: "Bearer " + identity, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { authenticate: authorize });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  assert.equal(response.headers.get("cache-control"), "no-store");
  return data;
}
function observation(permission: Permission | null, latest: unknown = null) {
  return { deviceId: DEVICE, connectionId: CONNECTION, lastSeenAt: new Date().toISOString(), reachable: true,
    sessionReusable: true, latest, permission: permission ? {
      authorizationEpoch: permission.authorizationEpoch, consentVersion: permission.consentVersion,
      desiredEnabled: permission.enabled, deviceConfirmed: true,
      reportingSessionId: permission.reportingSessionId, expiresAt: permission.expiresAt,
    } : null };
}
async function sync(device: ReturnType<typeof observation>, key = SECRET, expected = 200) {
  const response = await syncHandler(new Request("http://127.0.0.1/remote-state-sync", {
    method: "POST", headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ v: 1, observedAt: new Date().toISOString(), devices: [device] }),
  }));
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data as { v: number; permissions: { deviceId: string; permission: Permission | null }[] };
}

const initial = await user();
assert.equal(initial.enabled, false);
assert.equal(initial.activation, "off");
assert.equal(initial.latest, null);
const disabled = (await sync(observation(null))).permissions[0].permission;
assert.equal(disabled?.enabled, false);
assert.equal((await user()).lastSeenAt, null);
cases.push("default_off_hides_gateway_visibility");

const callsBeforeUnauthorized = rpcCalls.length;
await user(undefined, "synthetic-other", 403);
await user({ deviceId: DEVICE, enabled: true, revision: 1 }, "synthetic-other", 403);
await sync(observation(null), "wrong-synthetic-key", 401);
assert.equal(rpcCalls.length, callsBeforeUnauthorized + 2, "Invalid sync key must be rejected before RPC");
cases.push("cross_owner_and_dedicated_key_rejected");

const enabled = await user({ deviceId: DEVICE, enabled: true, revision: initial.revision });
assert.equal(enabled.enabled, true);
assert.equal(enabled.revision, 2);
await user({ deviceId: DEVICE, enabled: false, revision: initial.revision }, "synthetic-owner", 409);
const grant = (await sync(observation(null))).permissions[0].permission;
assert(grant?.enabled && grant.reportingSessionId);
assert.equal(grant.consentVersion, 2);
cases.push("explicit_enable_issues_real_database_grant_and_revision_fence");

const time = new Date().toISOString();
const received = { receivedAt: time, report: { v: 1, kind: "status.report", deviceId: DEVICE,
  connectionId: CONNECTION, reportingSessionId: grant.reportingSessionId,
  authorizationEpoch: grant.authorizationEpoch, consentVersion: grant.consentVersion, seq: 1, observedAt: time,
  status: { state: { kind: "CMS_STATE_KIND_STANDING", transition: "CMS_TRANSITION_KIND_NONE" },
    control: { owner: "CONTROL_OWNER_GRPC", motorOutputEnabled: true, criticalMotorFault: false }, transport: "mtls" } } };
await sync(observation(grant, received));
const active = await user();
assert.equal(active.activation, "on");
assert.equal(active.fresh, true);
assert.deepEqual(active.latest, { observedAt: time, receivedAt: time, status: received.report.status });
assert.deepEqual(active.lastSuccess, active.latest);
cases.push("matching_device_ack_and_status_round_trip");

await sync(observation(grant, { ...received, receivedAt: new Date().toISOString() }));
assert.deepEqual((await user()).latest, active.latest, "Repeated sequence must retain original timestamps");
cases.push("repeated_sequence_does_not_refresh_sample_time");

const closed = await user({ deviceId: DEVICE, enabled: false, revision: enabled.revision });
assert.equal(closed.enabled, false);
assert.equal(closed.latest, null);
const closeGrant = (await sync(observation(grant, {
  ...received, report: { ...received.report, seq: 2 },
}))).permissions[0].permission;
assert.equal(closeGrant?.enabled, false);
assert(closeGrant);
await sync(observation(closeGrant));
const off = await user();
assert.equal(off.activation, "off");
assert.equal(off.latest, null);
assert.equal(off.lastSeenAt, null);
assert.deepEqual(off.lastSuccess, active.lastSuccess);
cases.push("close_rejects_old_status_and_preserves_original_history");

await Deno.writeTextFile(resultPath, JSON.stringify({ result: "PASS", cases, rpcCalls,
  authentication: "synthetic fixed identities", rpcTransport: "psql adapter", database: "actual isolated PostgreSQL",
  finishedAt: new Date().toISOString() }, null, 2));
console.log("PASS actual handlers -> PostgreSQL, " + cases.length + " cases");
