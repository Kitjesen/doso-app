// Native PostgreSQL contract test. Auth and robot observations are synthetic fixtures.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedCommand } from './helpers/bounded-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '../.local-toolchains/postgresql-17.11-5');
const bin = join(runtime, 'pgsql/bin');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const cluster = join(runtime, 'synthetic-remote-state-' + runId);
const evidence = join(root, 'artifacts/remote-state', runId);
const database = 'doso_remote_state_fixture';
const fixture = join(root, 'supabase/verification/local/remote_state_fixture.sql');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const password = randomBytes(32).toString('hex');
const clientEnv = { ...cleanEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' };
const transcript = [];
const report = { runId, scope: 'SYNTHETIC_NATIVE_POSTGRES_REMOTE_STATE', cluster, database,
  evidence, cases: [], stopped: false, limitations: [
    'Auth JWT/session checks and Gateway/device observations use explicit synthetic fixtures.',
    'Runs the candidate migration using actual PostgreSQL ACLs, transactions and row locks.',
    'Renewal/expiry threshold cases use explicit fixture-clock state changes, not real elapsed lease tests.',
    'No hosted Supabase, Rust/Edge integration, real network, App binary, robot, 5G or physical state verification.',
  ] };
let port;

async function command(name, args, { env = cleanEnv, timeoutMs = 30000, allowFailure = false } = {}) {
  const result = await runBoundedCommand(join(bin, name + '.exe'), args, { env, timeoutMs });
  transcript.push({ command: name, args, ...result });
  if (!allowFailure) assert(result.status === 'exited' && result.code === 0,
    name + ' ' + result.status + ' ' + result.code + ': ' + result.stderr);
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
    stopExecutable: join(bin, 'pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'] }, null, 2));
  const pipeName = '\\\\.\\pipe\\doso-remote-init-' + randomUUID();
  const sockets = new Set();
  const pipe = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.end(password + '\n');
  });
  pipe.listen(pipeName);
  await once(pipe, 'listening');
  try {
    await command('initdb', ['-D', cluster, '-U', 'postgres', '-E', 'UTF8', '--no-locale',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile=' + pipeName], { timeoutMs: 90000 });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => pipe.close(done));
  }
  await command('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'server.log'), '-w', '-t', '20', '-o',
    '-h 127.0.0.1 -p ' + port + ' -c shared_buffers=32MB -c max_connections=12 -c log_statement=none -c log_min_error_statement=panic']);
  await command('createdb', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database], { env: clientEnv });
  const identity = JSON.parse((await psql("select json_build_object('directory',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'version',version());")).stdout);
  assert.equal(resolve(identity.directory), resolve(cluster));
  assert.equal(identity.listen, '127.0.0.1');
  report.server = identity;
  const loaded = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1',
    '-p', String(port), '-U', 'postgres', '-d', database, '-f', fixture], { env: clientEnv });
  report.cases = loaded.stdout.split(/\r?\n/).filter(line => line.startsWith('PASS '));
  assert.equal(report.cases.length, 5);
  const payload = JSON.parse(/^RACE_OBSERVATION=(.+)$/m.exec(loaded.stdout)?.[1] ?? 'null');
  assert(payload?.deviceId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture must provide the race observation');
  const sqlPayload = JSON.stringify(payload).replaceAll("'", "''");
  const owner = '11111111-1111-4111-8111-111111111111';
  const closing = psql("begin; set role authenticated; select set_config('request.user_id','" + owner + "',false); select public.set_remote_state('" + payload.deviceId + "',false,2); select pg_sleep(5); commit;",
    { env: { ...clientEnv, PGAPPNAME: 'doso-remote-close-race' } });
  await observe("select count(*) from pg_stat_activity where application_name='doso-remote-close-race' and wait_event='PgSleep';", value => value === '1');
  const syncing = psql("set role service_role; select public.sync_remote_state(clock_timestamp(),'[" + sqlPayload + "]'::jsonb);",
    { env: { ...clientEnv, PGAPPNAME: 'doso-remote-sync-race' } });
  report.lockObservation = JSON.parse(await observe("select coalesce((select json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'wait',wait_event_type)::text from pg_stat_activity where application_name='doso-remote-sync-race'),'null');",
    value => { const state = JSON.parse(value); return state?.wait === 'Lock' && state.blockers.length > 0; }));
  const [closed, synced] = await Promise.all([closing, syncing]);
  assert.equal(closed.code, 0);
  assert.equal(synced.code, 0);
  const after = JSON.parse((await psql("select json_build_object('enabled',enabled,'revision',revision,'lastSeq',last_seq,'latest',latest,'lastSeenAt',last_seen_at,'reachable',gateway_reachable,'lastSuccess',last_success is not null) from private.device_remote_state where device_id='" + payload.deviceId + "';")).stdout);
  assert.deepEqual(after, { enabled: false, revision: 3, lastSeq: 0, latest: null, lastSeenAt: null, reachable: false, lastSuccess: true });
  assert.equal(JSON.parse(synced.stdout).permissions[0].permission.enabled, false);
  report.cases.push('PASS independent_backend_close_report_race');
  for (const scenario of [
    { id: 'session-read', call: "public.get_remote_state('" + payload.deviceId + "')",
      revoke: "update public.fixture_sessions set active=false where user_id='" + owner + "';",
      restore: "update public.fixture_sessions set active=true where user_id='" + owner + "';" },
    { id: 'account-write', call: "public.set_remote_state('" + payload.deviceId + "',true,3)",
      revoke: "update public.profiles set active=false where id='" + owner + "';",
      restore: "update public.profiles set active=true where id='" + owner + "';" },
  ]) {
    const lockerName = 'doso-remote-lock-' + scenario.id;
    const callerName = 'doso-remote-call-' + scenario.id;
    const locker = psql("begin; select id from public.devices where id='" + payload.deviceId + "' for update; select pg_sleep(5); commit;",
      { env: { ...clientEnv, PGAPPNAME: lockerName } });
    await observe("select count(*) from pg_stat_activity where application_name='" + lockerName + "' and wait_event='PgSleep';", value => value === '1');
    const caller = psql("set role authenticated; select set_config('request.user_id','" + owner + "',false); select " + scenario.call + ";",
      { env: { ...clientEnv, PGAPPNAME: callerName }, allowFailure: true });
    const waiting = JSON.parse(await observe("select coalesce((select json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'wait',wait_event_type)::text from pg_stat_activity where application_name='" + callerName + "'),'null');",
      value => { const state = JSON.parse(value); return state?.wait === 'Lock' && state.blockers.length > 0; }));
    await psql(scenario.revoke);
    const [released, rejected] = await Promise.all([locker, caller]);
    assert.equal(released.code, 0);
    assert(rejected.exitObserved && rejected.code !== 0 && rejected.stderr.includes('remote_state_access_denied'),
      'Authorization revoked while waiting must deny ' + scenario.id);
    await psql(scenario.restore);
    report.authorizationWaits ??= [];
    report.authorizationWaits.push({ scenario: scenario.id, ...waiting });
  }
  assert.equal((await psql("select enabled::text || ':' || revision::text from private.device_remote_state where device_id='" + payload.deviceId + "';")).stdout.trim(), 'false:3');
  report.cases.push('PASS authorization_rechecked_after_device_lock');
  report.result = 'PASS_LOCAL_CANDIDATE';
}

try { await main(); }
catch (error) { report.result = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  try {
    await access(join(cluster, 'PG_VERSION'));
    await command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20']);
    const stopped = await command('pg_ctl', ['status', '-D', cluster], { allowFailure: true });
    assert(stopped.exitObserved && stopped.code === 3, 'Task-owned PostgreSQL must be confirmed stopped');
    report.stopped = true;
  } catch (error) { report.stopError = error.message; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
