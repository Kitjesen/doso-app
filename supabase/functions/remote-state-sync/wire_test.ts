import assert from "node:assert/strict";
import { createRemoteStateSyncHandler } from "./handler.ts";

const source = "D:/DOSO/artifacts/robot-cloud/auto-sync-wire.json";
const before = await Deno.stat(source);
const bytes = await Deno.readFile(source);
const captured = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as {
  simulated: boolean;
  samples: Record<string, { request: { observedAt: string; devices: unknown[] }; response: unknown }>;
};
const after = await Deno.stat(source);
assert.equal(before.size, after.size);
assert.equal(before.mtime?.getTime(), after.mtime?.getTime(), "Wire artifact changed while reading.");
assert.equal(captured.simulated, true);
assert.deepEqual(Object.keys(captured.samples).sort(), ["closed", "confirmed", "defaultOff", "enabled", "renewed"]);
assert.equal(/"apikey"\s*:/i.test(new TextDecoder().decode(bytes)), false);
const digest = await crypto.subtle.digest("SHA-256", bytes);
console.log(JSON.stringify({
  event: "remote_sync_wire_replay",
  source,
  modifiedAt: after.mtime?.toISOString(),
  sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join(""),
  simulated: true,
  sampleCount: Object.keys(captured.samples).length,
}));

for (const [stage, sample] of Object.entries(captured.samples)) {
  Deno.test(`captured Rust ${stage} wire passes the Edge boundary`, async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let clients = 0;
    const secret = "sb_secret_synthetic_wire_replay";
    const handler = createRemoteStateSyncHandler({
      now: () => Date.parse(sample.request.observedAt),
      readEnvironment: name => name === "SUPABASE_SECRET_KEYS"
        ? JSON.stringify({ "remote-state-sync": secret }) : undefined,
      createClient() {
        clients++;
        return {
          rpc(name, args) {
            calls.push({ name, args });
            return Promise.resolve({ data: sample.response, error: null });
          },
        };
      },
    });
    const response = await handler(new Request("https://fixture.test/functions/v1/remote-state-sync", {
      method: "POST",
      headers: { apikey: secret, "content-type": "application/json" },
      body: JSON.stringify(sample.request),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(clients, 1);
    assert.deepEqual(calls, [{
      name: "sync_remote_state",
      args: { p_observed_at: sample.request.observedAt, p_devices: sample.request.devices },
    }]);
    assert.deepEqual(await response.json(), sample.response);
  });
}
