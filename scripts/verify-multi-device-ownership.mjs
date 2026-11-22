// Isolated native PostgreSQL verification of production ownership and remote-state SQL.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedCommand } from './helpers/bounded-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '../.local-toolchains/postgresql-17.11-5');
const bin = join(runtime, 'pgsql/bin');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const cluster = join(runtime, `multi-device-${runId}`);
const evidence = join(root, 'artifacts/multi-device', runId);
const database = 'doso_multi_device_verification';
const fixture = join(root, 'supabase/verification/local/multi_device_ownership.sql');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const password = randomBytes(32).toString('hex');
const clientEnv = { ...cleanEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' };
const transcript = [];
const report = { runId, scope: 'LOCAL_POSTGRES_MULTI_DEVICE_OWNERSHIP', cluster, database,
  evidence, cases: [], stopped: false, limitations: [
    'Uses local test identities, sessions and device records, with production binding, robot-authority and remote-state migrations.',
    'Supabase Auth transport and JWT issuance are outside this local SQL verification.',
    'No hosted deployment, App binary, robot hardware or real telemetry verification.',
  ] };
let port;

async function command(name, args, { env = cleanEnv, timeoutMs = 30000, allowFailure = false } = {}) {
  const result = await runBoundedCommand(join(bin, `${name}.exe`), args, { env, timeoutMs });
  transcript.push({ command: name, args, ...result });
  if (!allowFailure) assert(result.status === 'exited' && result.code === 0,
    `${name} ${result.status} ${result.code}: ${result.stderr}`);
  return result;
}
function psql(sql, options = {}) {
  return command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-c', sql], { env: clientEnv, ...options });
}
async function observe(sql, predicate) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await psql(sql);
    if (predicate(result.stdout.trim())) return result.stdout.trim();
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error('Independent-backend lock observation timed out');
}

async function main() {
  await mkdir(evidence, { recursive: true });
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  port = portServer.address().port;
  await new Promise(done => portServer.close(done));
  report.port = port;
  await writeFile(join(evidence, 'owned-cluster.json'), JSON.stringify({ cluster, port,
    runnerPid: process.pid, acceptanceRunId: process.env.DOSO_ACCEPTANCE_RUN_ID ?? null,
    stopExecutable: join(bin, 'pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '60'] }, null, 2));
  const pipeName = `\\\\.\\pipe\\doso-multi-device-init-${randomUUID()}`;
  const sockets = new Set();
  const pipe = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.end(`${password}\n`);
  });
  pipe.listen(pipeName);
  await once(pipe, 'listening');
  try {
    await command('initdb', ['-D', cluster, '-U', 'postgres', '-E', 'UTF8', '--no-locale',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', `--pwfile=${pipeName}`], { timeoutMs: 90000 });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => pipe.close(done));
  }
  await command('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'server.log'), '-w', '-t', '20', '-o',
    `-h 127.0.0.1 -p ${port} -c shared_buffers=32MB -c max_connections=12 -c log_statement=none -c log_min_error_statement=panic`]);
  await command('createdb', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database], { env: clientEnv });
  const identity = JSON.parse((await psql("select json_build_object('directory',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'version',version());")).stdout);
  assert.equal(resolve(identity.directory), resolve(cluster));
  assert.equal(identity.listen, '127.0.0.1');
  report.server = identity;
  const loaded = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f', fixture], { env: clientEnv });
  report.cases = loaded.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS '));
  assert.equal(report.cases.length, 7);
  const simulated = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f',
    join(root, 'supabase/verification/local/simulated_devices.test.sql')], { env: clientEnv });
  report.cases.push(...simulated.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  const location = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f',
    join(root, 'supabase/verification/local/remote_location.test.sql')], { env: clientEnv });
  report.cases.push(...location.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  const telemetry = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f',
    join(root, 'supabase/verification/local/telemetry_export.test.sql')], { env: clientEnv });
  report.cases.push(...telemetry.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  const history = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f',
    join(root, 'supabase/verification/local/history_access.test.sql')], { env: clientEnv });
  report.cases.push(...history.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  const telemetryHook = process.env.DOSO_TELEMETRY_INTEGRATION_HOOK;
  if (telemetryHook) {
    const integration = await runBoundedCommand(process.execPath, [resolve(telemetryHook)], {
      env: { ...clientEnv, DOSO_TELEMETRY_PSQL: join(bin, 'psql.exe'), DOSO_TELEMETRY_PGHOST: '127.0.0.1',
        DOSO_TELEMETRY_PGPORT: String(port), DOSO_TELEMETRY_PGDATABASE: database, DOSO_TELEMETRY_APP_ROOT: root },
      timeoutMs: 300000,
    });
    transcript.push({ command: 'telemetry-integration-hook', ...integration });
    assert(integration.status === 'exited' && integration.code === 0,
      `telemetry integration ${integration.status}: ${integration.stderr}`);
    report.cases.push(...integration.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  }
  const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const digest = 'c'.repeat(64);
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const first = psql("begin; set role service_role; select (public.claim_device_with_digest('" + owner + "','" + deviceId + "'::uuid,'" + digest + "')).owner_id; select pg_sleep(3); commit;",
    { env: { ...clientEnv, PGAPPNAME: 'doso-multi-device-first-claim' } });
  await observe("select count(*) from pg_stat_activity where application_name='doso-multi-device-first-claim' and wait_event='PgSleep';", value => value === '1');
  const second = psql("set role service_role; select (public.claim_device_with_digest('" + other + "','" + deviceId + "'::uuid,'" + digest + "')).owner_id;",
    { env: { ...clientEnv, PGAPPNAME: 'doso-multi-device-second-claim' } });
  report.lockObservation = JSON.parse(await observe("select coalesce((select json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'wait',wait_event_type)::text from pg_stat_activity where application_name='doso-multi-device-second-claim'),'null');",
    value => { const state = JSON.parse(value); return state?.wait === 'Lock' && state.blockers.length > 0; }));
  const [claimed, rejected] = await Promise.all([first, second]);
  assert.equal(claimed.code, 0);
  assert.equal(rejected.code, 0);
  assert.equal(rejected.stdout.trim(), '', 'Second owner must receive a null claim result after the first transaction commits');
  const state = JSON.parse((await psql("select json_build_object('owner',d.owner_id,'consumedBy',c.consumed_by,'consumed',c.consumed_at is not null) from public.devices d join private.device_claims c on c.device_id=d.id where d.serial_number='LOCAL-RACE';")).stdout);
  assert.deepEqual(state, { owner, consumedBy: owner, consumed: true });
  report.cases.push('PASS independent_backend_same_device_cross_owner_claim_race');
  const minimalDatabase = 'doso_multi_device_minimal_verification';
  await command('createdb', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', minimalDatabase], { env: clientEnv });
  const minimal = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'minimal_epoch=1',
    '-v', 'reuse_roles=1', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', minimalDatabase, '-f', fixture], { env: clientEnv });
  const minimalCases = minimal.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS '));
  assert.equal(minimalCases.length, 9);
  report.cases.push(...minimalCases.map(value => value.replace('PASS ', 'PASS minimal_path_')));
  const epochMigration = await readFile(join(root, 'supabase/migrations/20261103140000_add_device_authorization_epoch.sql'), 'utf8');
  for (const change of [
    'alter table public.devices disable trigger devices_enforce_robot_update;',
    'drop trigger devices_enforce_robot_update on public.devices; create trigger devices_enforce_robot_update before update on public.devices for each row execute function private.set_updated_at();',
  ]) {
    const rejectedTrigger = await psql(`begin; ${change} ${epochMigration} rollback;`, { allowFailure: true });
    assert.equal(rejectedTrigger.code, 1);
    assert.match(rejectedTrigger.stderr, /unexpected devices_enforce_robot_update trigger/);
  }
  report.cases.push('PASS disabled_or_wrong_full_epoch_trigger_rejected');
  const factoryClaims = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database,
    '-f', join(root, 'supabase/tests/database/factory_claim.test.sql')], { env: clientEnv });
  report.cases.push(...factoryClaims.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  const videoGrants = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database,
    '-f', join(root, 'supabase/tests/database/video_grants.test.sql')], { env: clientEnv });
  report.cases.push(...videoGrants.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS ')));
  // Exercise the upload SQL unchanged in this owned cluster's default postgres database.
  const videoReleaseArgs = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
  const videoSeed = join(evidence, 'video-release-seed.sql');
  const header = (await readFile(fixture, 'utf8')).split('create function pg_temp.assert')[0]
    .replace("'doso_multi_device_verification','doso_multi_device_minimal_verification'", "'postgres'")
    .replace(/^\\ir (.+)$/gm, (_, file) => `\\ir '${resolve(dirname(fixture), file.trim()).replaceAll('\\', '/').replaceAll("'", "''")}'`);
  await writeFile(videoSeed, '\\set reuse_roles 1\n' + header);
  for (const file of [videoSeed, join(root, 'supabase/migrations/20261103170000_allow_multiple_owned_devices.sql'),
    join(root, 'deploy/backend/device-admin-20261104/sql/apply.sql'),
    join(root, 'deploy/backend/video-access-20261106/sql/apply.sql'),
    join(root, 'deploy/backend/video-access-20261106/sql/postflight.sql')]) {
    await command('psql', [...videoReleaseArgs, '-f', file], { env: clientEnv });
  }
  report.cases.push('PASS video_release_original_sql_and_readonly_postflight');
  const repeatedVideoRelease = await command('psql', [...videoReleaseArgs, '-f',
    join(root, 'deploy/backend/video-access-20261106/sql/apply.sql')], { env: clientEnv, allowFailure: true });
  assert.equal(repeatedVideoRelease.code, 3);
  await command('psql', [...videoReleaseArgs, '-f',
    join(root, 'deploy/backend/video-access-20261106/sql/postflight.sql')], { env: clientEnv });
  report.cases.push('PASS video_release_repeat_rejected_and_permissions_preserved');
  for (const file of ['20261104100000_create_device_inventory.sql', '20261107100000_add_simulated_devices.sql',
    '20261108010000_add_remote_location.sql']) {
    await command('psql', [...videoReleaseArgs, '-f', join(root, 'supabase/migrations', file)], { env: clientEnv });
  }
  const historyRelease = join(root, 'deploy/backend/remote-history-20261109/sql');
  await command('psql', [...videoReleaseArgs, '-f', join(historyRelease, 'apply.sql')], { env: clientEnv });
  await command('psql', [...videoReleaseArgs, '-c', 'begin read only;', '-f', join(historyRelease, 'postflight.sql'),
    '-c', 'commit;'], { env: clientEnv });
  report.cases.push('PASS history_release_original_sql_and_readonly_postflight');
  const repeatedHistoryRelease = await command('psql', [...videoReleaseArgs, '-f', join(historyRelease, 'apply.sql')],
    { env: clientEnv, allowFailure: true });
  assert.equal(repeatedHistoryRelease.code, 3);
  await command('psql', [...videoReleaseArgs, '-c', 'begin read only;', '-f', join(historyRelease, 'postflight.sql'),
    '-c', 'commit;'], { env: clientEnv });
  report.cases.push('PASS history_release_repeat_rejected_and_permissions_preserved');
  const bootstrapDatabase = 'doso_admin_bootstrap_verification';
  await command('createdb', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', bootstrapDatabase], { env: clientEnv });
  const bootstrapArgs = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', bootstrapDatabase];
  const bootstrapQuery = (sql, allowFailure = false) => command('psql', [...bootstrapArgs, '-c', sql], { env: clientEnv, allowFailure });
  const bootstrapFile = (name, options = {}) => command('psql', [...bootstrapArgs, '-f',
    join(root, 'deploy/backend/admin-bootstrap', name)], { env: clientEnv, ...options });
  await command('psql', [...bootstrapArgs, '-f', join(root, 'supabase/verification/local/admin_bootstrap.sql')], { env: clientEnv });
  const backup = join(evidence, 'admin-bootstrap.dump');
  await command('pg_dump', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', bootstrapDatabase,
    '-Fc', '-f', backup], { env: clientEnv });
  await command('pg_restore', ['--list', backup]);
  report.cases.push('PASS admin_bootstrap_backup_is_readable');
  const bootstrapState = async () => JSON.parse((await bootstrapQuery("select json_build_object('admins',(select count(*) from public.profiles where app_role='admin'),'audits',(select count(*) from public.audit_logs));")).stdout);
  await bootstrapQuery("insert into auth.users(id,email) values('88888888-8888-4888-8888-888888888888','second@local.test');");
  assert.equal((await bootstrapFile('apply.sql', { allowFailure: true })).code, 3);
  assert.deepEqual(await bootstrapState(), { admins: 0, audits: 0 });
  await bootstrapQuery("delete from auth.users where email='second@local.test'; update public.profiles set account_status='suspended';");
  assert.equal((await bootstrapFile('apply.sql', { allowFailure: true })).code, 3);
  await bootstrapQuery("update public.profiles set account_status='active',app_role='support';");
  assert.equal((await bootstrapFile('apply.sql', { allowFailure: true })).code, 3);
  await bootstrapQuery("update public.profiles set app_role='user';");
  report.cases.push('PASS admin_bootstrap_rejects_ambiguous_or_ineligible_account');
  await bootstrapQuery("create function public.reject_bootstrap_audit() returns trigger language plpgsql as $$ begin raise exception 'local_audit_failure'; end; $$; create trigger reject_bootstrap_audit before insert on public.audit_logs for each row execute function public.reject_bootstrap_audit();");
  assert.equal((await bootstrapFile('apply.sql', { allowFailure: true })).code, 3);
  assert.deepEqual(await bootstrapState(), { admins: 0, audits: 0 });
  await bootstrapQuery('drop trigger reject_bootstrap_audit on public.audit_logs; drop function public.reject_bootstrap_audit();');
  report.cases.push('PASS admin_bootstrap_audit_failure_rolls_back_role');
  const original = (await bootstrapQuery("select json_build_object('auth',(select json_agg(u) from auth.users u),'profile',(select to_jsonb(p)-'app_role'-'updated_at' from public.profiles p));")).stdout;
  await bootstrapQuery("create function public.pause_bootstrap_role() returns trigger language plpgsql as $$ begin perform pg_sleep(2); return new; end; $$; create trigger pause_bootstrap_role before update of app_role on public.profiles for each row execute function public.pause_bootstrap_role();");
  const firstBootstrap = bootstrapFile('apply.sql', { env: { ...clientEnv, PGAPPNAME: 'doso-bootstrap-first' } });
  await observe("select count(*) from pg_stat_activity where application_name='doso-bootstrap-first' and wait_event='PgSleep';", value => value === '1');
  const secondBootstrap = bootstrapFile('apply.sql', { allowFailure: true });
  const bootstrapResults = await Promise.all([firstBootstrap, secondBootstrap]);
  assert.deepEqual(bootstrapResults.map(result => result.code), [0, 3]);
  assert.deepEqual(await bootstrapState(), { admins: 1, audits: 1 });
  await bootstrapQuery('drop trigger pause_bootstrap_role on public.profiles; drop function public.pause_bootstrap_role();');
  assert.equal((await bootstrapQuery("select json_build_object('auth',(select json_agg(u) from auth.users u),'profile',(select to_jsonb(p)-'app_role'-'updated_at' from public.profiles p));")).stdout, original);
  report.cases.push('PASS admin_bootstrap_concurrent_single_change_preserves_identity');
  await bootstrapQuery("create function public.reject_bootstrap_audit() returns trigger language plpgsql as $$ begin raise exception 'local_audit_failure'; end; $$; create trigger reject_bootstrap_audit before insert on public.audit_logs for each row execute function public.reject_bootstrap_audit();");
  assert.equal((await bootstrapFile('rollback.sql', { allowFailure: true })).code, 3);
  assert.deepEqual(await bootstrapState(), { admins: 1, audits: 1 });
  await bootstrapQuery('drop trigger reject_bootstrap_audit on public.audit_logs; drop function public.reject_bootstrap_audit();');
  await bootstrapFile('rollback.sql');
  assert.deepEqual(await bootstrapState(), { admins: 0, audits: 2 });
  assert.equal((await bootstrapFile('rollback.sql', { allowFailure: true })).code, 3);
  assert.equal((await bootstrapFile('apply.sql', { allowFailure: true })).code, 3);
  assert.deepEqual(await bootstrapState(), { admins: 0, audits: 2 });
  report.cases.push('PASS admin_bootstrap_rollback_is_atomic_and_one_time');
  report.result = 'PASS_LOCAL_POSTGRES';
}

try { await main(); }
catch (error) { report.result = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  try {
    await access(join(cluster, 'PG_VERSION'));
    await command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '60'], { timeoutMs: 75000 });
    const stopped = await command('pg_ctl', ['status', '-D', cluster], { allowFailure: true });
    assert(!stopped.timedOut && stopped.exitObserved && stopped.code === 3, 'Task-owned PostgreSQL must be confirmed stopped');
    report.stopped = true;
  } catch (error) { report.result = 'FAIL'; report.stopError = error.message; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
