// Isolated native PostgreSQL test. Auth/session dependencies are synthetic fixtures.
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
const cluster = join(runtime, `synthetic-map-catalog-${runId}`);
const evidence = join(root, 'artifacts/map-catalog', runId);
const database = 'doso_map_catalog_fixture';
const fixture = join(root, 'supabase/verification/local/device_map_catalog_fixture.sql');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const password = randomBytes(32).toString('hex');
const clientEnv = { ...cleanEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' };
const transcript = [];
const report = { runId, scope: 'SYNTHETIC_NATIVE_POSTGRES_MAP_CATALOG', cluster, database,
  evidence, cases: [], stopped: false, limitations: [
    'Auth JWT/session authority, profiles and devices are explicit synthetic dependencies.',
    'Uses the real candidate migration and PostgreSQL permissions, RLS and transactions.',
    'No hosted Supabase migration, OSS bytes, Android, robot, Linux or map package validation.',
    'Stored SHA256 is source-declared. ready here verifies trusted OSS size/CRC64 arguments only.',
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
    stopExecutable: join(bin, 'pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'] }, null, 2));
  const pipeName = `\\\\.\\pipe\\doso-map-init-${randomUUID()}`;
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
  assert.equal(report.cases.length, 4);
  const versionId = /^RACE_VERSION=([0-9a-f-]{36})$/m.exec(loaded.stdout)?.[1];
  assert(versionId, 'Fixture must provide the race version');
  const owner = '11111111-1111-4111-8111-111111111111';
  const cancellation = psql(`begin; set role service_role; select public.cancel_map_version('${owner}','${versionId}'); select pg_sleep(5); commit;`,
    { env: { ...clientEnv, PGAPPNAME: 'doso-map-cancel-race' } });
  await observe("select count(*) from pg_stat_activity where application_name='doso-map-cancel-race' and wait_event='PgSleep';", value => value === '1');
  const completion = psql(`set role service_role; select public.finish_map_verification('${owner}','${versionId}',662000000,'18446744073709551615');`,
    { env: { ...clientEnv, PGAPPNAME: 'doso-map-finish-race' }, allowFailure: true });
  report.lockObservation = JSON.parse(await observe("select coalesce((select json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'wait',wait_event_type)::text from pg_stat_activity where application_name='doso-map-finish-race'),'null');",
    value => { const state = JSON.parse(value); return state?.wait === 'Lock' && state.blockers.length > 0; }));
  const [cancelled, completed] = await Promise.all([cancellation, completion]);
  assert.equal(cancelled.code, 0);
  assert(completed.code !== 0 && completed.stderr.includes('map_state_conflict'), 'Late finish must fail after cancellation commits');
  assert.equal((await psql(`select status from public.device_map_versions where id='${versionId}';`)).stdout.trim(), 'cancelled');
  report.cases.push('PASS independent_backend_cancel_finish_race');
  report.result = 'PASS_LOCAL_CANDIDATE';
}

try { await main(); }
catch (error) { report.result = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  try {
    await access(join(cluster, 'PG_VERSION'));
    await command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20']);
    report.stopped = true;
  } catch (error) { report.stopError = error.message; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
