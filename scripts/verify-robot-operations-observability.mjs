import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260825233536_add_robot_operations_observability.sql';
const [migration, pgTap, runbook, packageText, gate] = await Promise.all([
  read(migrationPath),
  read('supabase/tests/database/robot_operations_observability.test.sql'),
  read('docs/runbooks/ROBOT_COMMAND_WORKER_DEPLOYMENT.md'),
  read('package.json'),
  read('scripts/verify-release-gate.mjs'),
]);

const functionStart = migration.indexOf('create function public.get_robot_operations_observability(');
const privilegeStart = migration.indexOf(
  'revoke all on function public.get_robot_operations_observability(integer, integer)',
);
assert.ok(functionStart >= 0 && privilegeStart > functionStart, 'fixed observability function block exists');
const functionSql = migration.slice(functionStart, privilegeStart);
const normalized = functionSql.replace(/\s+/g, ' ').toLowerCase();

assert.ok(normalized.includes('p_window_seconds integer default 3600'));
assert.ok(normalized.includes('p_shadow_stale_seconds integer default 120'));
assert.ok(normalized.includes('returns jsonb'));
assert.ok(normalized.includes('language plpgsql'));
assert.ok(normalized.includes('stable'));
assert.ok(normalized.includes('security definer'));
assert.ok(normalized.includes("set search_path = ''"));
assert.equal((functionSql.match(/transaction_timestamp\(\)/g) ?? []).length, 1);
assert.doesNotMatch(functionSql, /clock_timestamp|statement_timestamp/i);

for (const source of [
  'private.device_command_outbox',
  'public.device_commands',
  'private.device_command_ack_events',
  'public.devices',
]) {
  assert.ok(functionSql.includes(source), `aggregate source is present: ${source}`);
}
assert.match(functionSql, /received_at >= v_window_start/);
assert.match(functionSql, /received_at <= v_sampled_at/);
assert.match(functionSql, /and not applied/);
assert.match(functionSql, /trusted_telemetry_received_at <= v_shadow_cutoff/);
assert.match(functionSql, /trusted_telemetry_received_at > v_shadow_cutoff/);
assert.doesNotMatch(functionSql, /reason\s*->|signature_b64url|frame_digest|transport_message_id|last_error_code/);

const fixedReasons = [
  'unknown_command',
  'device_not_owned',
  'unsupported_command_projection',
  'device_binding_mismatch',
  'authorization_epoch_mismatch',
  'boot_mismatch',
  'clock_unavailable',
  'clock_skew',
  'frame_expired',
  'command_expired',
  'illegal_ack_transition',
  'projection_conflict',
  'other',
];
for (const reason of fixedReasons) {
  assert.ok(functionSql.includes(`'${reason}'`), `fixed ACK taxonomy includes ${reason}`);
}

assert.match(
  migration,
  /revoke all on function public\.get_robot_operations_observability\(integer, integer\)[\s\S]*?from public, anon, authenticated, service_role;/,
);
assert.match(
  migration,
  /grant execute on function public\.get_robot_operations_observability\(integer, integer\)[\s\S]*?to service_role;/,
);
assert.doesNotMatch(migration, /grant\s+[^;]*\s+on\s+(?:table|sequence)\s+private\./i);
for (const indexName of [
  'device_command_outbox_operations_idx',
  'device_command_ack_events_rejected_operations_idx',
  'devices_trusted_shadow_operations_idx',
]) {
  assert.ok(migration.includes(indexName), `operations index exists: ${indexName}`);
}

const normalizedPgTap = pgTap.replace(/\s+/g, ' ');
const compactPgTap = pgTap.replace(/\s+/g, '');
const exactKeyContracts = new Map([
  ['result', [
    'ack_rejections','commands','contract_version','sampled_at',
    'shadow_stale_after_seconds','trusted_shadows','window',
  ]],
  ["result->'window'", ['seconds','started_at']],
  ["result->'commands'", ['attention','in_flight','queued']],
  ["result#>'{commands,queued}'", [
    'created_in_window_count','current_count','older_than_window_count','oldest_age_seconds',
  ]],
  ["result#>'{commands,in_flight}'", [
    'dispatching_count','dispatching_overdue_count','leased_count','leased_overdue_count',
    'published_count','published_overdue_count',
  ]],
  ["result#>'{commands,attention}'", [
    'dead_letter_count','delivery_unknown_count','revocation_pending_count',
  ]],
  ["result->'ack_rejections'", ['by_reason','event_attempt_count']],
  ["result#>'{ack_rejections,by_reason}'", [
    'authorization_epoch_mismatch','boot_mismatch','clock_skew','clock_unavailable',
    'command_expired','device_binding_mismatch','device_not_owned','frame_expired',
    'illegal_ack_transition','other','projection_conflict','unknown_command',
    'unsupported_command_projection',
  ]],
  ["result->'trusted_shadows'", [
    'eligible_device_count','fresh_count','missing_count','stale_count',
  ]],
]);
for (const [jsonExpression, keys] of exactKeyContracts) {
  const expected = `array(selectkeyfromjsonb_object_keys(${jsonExpression})askeys(key)orderbykey)=array[${keys.map((key) => `'${key}'`).join(',')}]`;
  assert.ok(compactPgTap.includes(expected), `pgTAP locks exact keys for ${jsonExpression}`);
}
for (const typeAssertion of [
  "jsonb_typeof(result) = 'object'",
  "jsonb_typeof(result->'contract_version') = 'number'",
  "jsonb_typeof(result->'sampled_at') = 'string'",
  "jsonb_typeof(result->'window') = 'object'",
  "jsonb_typeof(result#>'{window,seconds}') = 'number'",
  "jsonb_typeof(result#>'{window,started_at}') = 'string'",
  "jsonb_typeof(result->'shadow_stale_after_seconds') = 'number'",
  "jsonb_typeof(result->'commands') = 'object'",
  "jsonb_typeof(result#>'{commands,queued}') = 'object'",
  "jsonb_typeof(result#>'{commands,in_flight}') = 'object'",
  "jsonb_typeof(result#>'{commands,attention}') = 'object'",
  "jsonb_typeof(result->'ack_rejections') = 'object'",
  "jsonb_typeof(result#>'{ack_rejections,by_reason}') = 'object'",
  "jsonb_typeof(result->'trusted_shadows') = 'object'",
  "jsonb_typeof(result#>'{commands,queued,oldest_age_seconds}') in ('number','null')",
]) {
  assert.ok(normalizedPgTap.includes(typeAssertion), `pgTAP locks JSON type: ${typeAssertion}`);
}
assert.match(normalizedPgTap, /with recursive json_nodes\(value\)/i);
assert.match(normalizedPgTap, /jsonb_each\(.{0,240}union all.{0,240}jsonb_array_elements\(/i);
for (const sensitiveKey of [
  'device_id','command_id','owner_id','terminal_id','auth_session_id','boot_id',
  'fingerprint','frame_digest','signature','payload','reason','error','last_error_code',
  'transport_message_id',
]) {
  assert.ok(pgTap.includes(`'${sensitiveKey}'`), `recursive pgTAP denylist includes ${sensitiveKey}`);
}
for (const tablePrivilege of [
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN',
]) {
  assert.ok(pgTap.includes(`'${tablePrivilege}'`), `pgTAP denies table privilege ${tablePrivilege}`);
}
assert.ok(compactPgTap.includes(
  "fromunnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])asprivileges(privilege_name)",
));
for (const sequencePrivilege of ['USAGE','SELECT','UPDATE']) {
  assert.ok(pgTap.includes(`'${sequencePrivilege}'`), `pgTAP denies sequence privilege ${sequencePrivilege}`);
}
assert.ok(compactPgTap.includes(
  "fromunnest(array['USAGE','SELECT','UPDATE'])asprivileges(privilege_name)",
));

const normalizedRunbook = runbook.replace(/\s+/g, ' ');
assert.match(normalizedRunbook, /published.{0,80}(?:does not prove|not prove)/i);
assert.match(normalizedRunbook, /stale.{0,80}(?:does not mean|not mean)/i);
assert.match(normalizedRunbook, /(?:Edge|telemetry).{0,160}not persisted/i);
assert.match(normalizedRunbook, /positive delta.{0,80}adjacent samples?/i);
assert.match(normalizedRunbook, /repeated non-zero.{0,160}does not mean a new event/i);
assert.match(normalizedRunbook, /rolling[- ]window.{0,160}aging.{0,160}(?:offset|hide).{0,80}delta/i);
assert.match(normalizedRunbook, /persistent Edge logs or event stream/i);
assert.match(normalizedRunbook, /pause non-essential new command creation/i);
assert.match(normalizedRunbook, /worker must keep running.{0,120}reconcile/i);
assert.match(runbook, /get_robot_operations_observability/);
assert.doesNotMatch(
  runbook,
  /(?:sb_secret_[A-Za-z0-9_-]+|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.)/,
);

const pkg = JSON.parse(packageText);
assert.equal(
  pkg.scripts?.['test:robot-operations-observability'],
  'node scripts/verify-robot-operations-observability.mjs',
);
assert.match(gate, /'test:robot-operations-observability'/);

console.log('ROBOT OPERATIONS OBSERVABILITY CONTRACT PASS — aggregate-only, service-role-only');
