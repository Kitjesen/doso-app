import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [index, core, gateway, migration, config, packageText, gate, runbook] = await Promise.all([
  read('supabase/functions/robot-command-worker/index.ts'),
  read('supabase/functions/robot-command-worker/workerCore.ts'),
  read('supabase/functions/robot-command-worker/gatewayTransport.ts'),
  read('supabase/migrations/20260825182227_harden_robot_command_dispatch.sql'),
  read('supabase/config.toml'),
  read('package.json'),
  read('scripts/verify-release-gate.mjs'),
  read('docs/runbooks/ROBOT_COMMAND_WORKER_DEPLOYMENT.md'),
]);

assert.match(config, /\[functions\.robot-command-worker\]\s*verify_jwt\s*=\s*false/);
assert.match(core, /parsed\["robot-command-worker"\]/);
assert.match(core, /headers\.get\("apikey"\)/);
assert.doesNotMatch(core, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY["')]/);

assert.match(index, /createTransport:\s*\(read\)\s*=>\s*createRobotCommandGatewayTransport\(read\)/);
assert.match(gateway, /DOSO_ROBOT_COMMAND_GATEWAY_URL/);
assert.match(gateway, /DOSO_ROBOT_COMMAND_GATEWAY_API_KEY/);
assert.match(gateway, /endpoint\.protocol !== "https:"/);
assert.match(gateway, /"idempotency-key": publishedCommand\.command\.idempotency_key/);
assert.match(gateway, /response\.status === 202/);
assert.match(gateway, /definitely_not_delivered/);
assert.doesNotMatch(
  `${index}\n${core}\n${gateway}`,
  /(?:from\s+["'][^"']*(?:mqtt|gatt|broker|simulator|inmemory)|npm:[^\s"']*(?:mqtt|broker))/i,
);

assert.match(
  migration,
  /create function public\.begin_robot_command_publish\(\s*p_command_id uuid,\s*p_lease_token uuid,\s*p_fencing_token bigint/s,
);
assert.match(migration, /status = 'dispatching'/);
assert.match(
  migration,
  /grant execute on function public\.begin_robot_command_publish\(uuid,uuid,bigint\)\s+to service_role/,
);

const pkg = JSON.parse(packageText);
assert.equal(
  pkg.scripts?.['test:robot-command-worker-contract'],
  'node scripts/verify-robot-command-worker-contract.mjs',
);
assert.match(gate, /'test:robot-command-worker-contract'/);

assert.match(runbook, /DOSO_ROBOT_COMMAND_DELIVERY_ENABLED=false/);
assert.match(runbook, /transport_unconfigured/);
assert.match(runbook, /DOSO_ROBOT_COMMAND_GATEWAY_URL/);
assert.match(runbook, /MQTT\/mTLS/);
assert.match(runbook, /MQTT QoS 1 with `retain=false`/);
assert.match(runbook, /published[\s\S]*?ACK/);
assert.doesNotMatch(
  runbook,
  /(?:sb_secret_[A-Za-z0-9_-]+|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.)/,
);

console.log('ROBOT COMMAND WORKER DEPLOYMENT CONTRACT PASS — HTTPS gateway transport is fail-closed');
