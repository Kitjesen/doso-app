import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [edge, tests, migration, databaseTests, config, packageText, gate] = await Promise.all([
  read('supabase/functions/_shared/robotIngress.ts'),
  read('supabase/functions/tests/robot_ingress_test.ts'),
  read('supabase/migrations/20260825140714_add_robot_command_persistence.sql'),
  read('supabase/tests/database/robot_command_persistence.test.sql'),
  read('supabase/config.toml'),
  read('package.json'),
  read('scripts/verify-release-gate.mjs'),
]);

assert.match(config, /\[functions\.robot-ingress\]\s*verify_jwt\s*=\s*false/);
assert.match(edge, /SUPABASE_SECRET_KEYS/);
assert.match(edge, /p_precheck_rejection:\s*precheckRejection/);
assert.match(edge, /toString\(16\)\.padStart\(2,\s*"0"\)/);
assert.match(edge, /safety_contract_id === "stationary-health-check"/);
assert.doesNotMatch(edge, /doso\.robot\.non_motion\.v1|sha256Base64Url/);
assert.match(tests, /\^\[0-9a-f\]\{64\}\$/);
assert.match(migration, /create function public\.ingest_verified_robot_ack\(\s*p_device_fence jsonb,\s*p_command_fence jsonb,\s*p_ack jsonb,\s*p_signature_b64url text,\s*p_frame_digest text,\s*p_precheck_rejection text/s);
assert.match(migration, /p_frame_digest !~ '\^\[0-9a-f\]\{64\}\\?\$'/);
assert.match(migration, /p_precheck_rejection is not null/s);
const precheckAllowList = /p_precheck_rejection not in \(([^)]*)\)/s.exec(migration)?.[1] ?? '';
for (const reason of [
  'device_not_owned', 'unknown_command', 'unsupported_command_projection',
  'device_binding_mismatch', 'authorization_epoch_mismatch', 'boot_mismatch',
  'clock_unavailable', 'clock_skew', 'frame_expired', 'command_expired',
  'illegal_ack_transition',
]) assert.ok(precheckAllowList.includes(`'${reason}'`), `database precheck allow-list omits ${reason}`);
assert.match(migration, /grant execute on function public\.ingest_verified_robot_ack\(jsonb,jsonb,jsonb,text,text,text\) to service_role/);
assert.match(databaseTests, /ingest_verified_robot_ack\(jsonb,jsonb,jsonb,text,text,text\)/);

const pkg = JSON.parse(packageText);
assert.equal(pkg.scripts?.['test:robot-ingress-contract'], 'node scripts/verify-robot-ingress-contract.mjs');
assert.match(gate, /'test:db',[\s\S]*?'test:robot-ingress-contract'/);
console.log('ROBOT INGRESS EDGE/SQL CONTRACT PASS — real PostgREST probe remains an independent local-Supabase verification');
