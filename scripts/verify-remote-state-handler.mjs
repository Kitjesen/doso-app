// Actual handlers and PostgreSQL, with synthetic authentication and a psql RPC adapter.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedCommand } from './helpers/bounded-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '../.local-toolchains/postgresql-17.11-5');
const bin = join(runtime, 'pgsql/bin');
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const cluster = join(runtime, 'synthetic-remote-handler-' + runId);
const evidence = join(root, 'artifacts/remote-state-handler', runId);
const database = 'doso_remote_state_fixture';
const fixture = join(root, 'supabase/verification/local/remote_state_fixture.sql');
const migration = join(root, 'supabase/migrations/20261103150000_add_remote_state.sql');
const lab = join(root, 'supabase/verification/local/remote_state_handler_lab.ts');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const password = randomBytes(32).toString('hex');
const transcript = [];
const report = { runId, scope: 'ACTUAL_HANDLERS_NATIVE_POSTGRES_SYNTHETIC_AUTH', cluster,
  database, evidence, stopped: false, cases: [], limitations: [
    'Authentication uses fixed synthetic bearer identities and fixture account/session checks.',
    'Actual handlers call actual PostgreSQL migration functions through a local psql adapter.',
    'Supabase Auth, PostgREST, hosted Edge, Rust, App binary, robot and 5G are outside this check.',
    'No HTTP listener or external network service is started.',
  ] };
let port, startAttempted = false;
async function command(file, args, options = {}) {
  const result = await runBoundedCommand(file, args, { env: cleanEnv, timeoutMs: 30000, ...options });
  transcript.push({ file, args, ...result });
  return result;
}
async function pg(name, args, options = {}) {
  const result = await command(join(bin, name + '.exe'), args, options);
  assert(result.status === 'exited' && result.exitObserved && result.code === 0, name + ': ' + result.stderr);
  return result;
}
const clientEnv = () => ({ ...cleanEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' });
const connection = () => ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database];
async function main() {
  await mkdir(evidence, { recursive: true });
  const source = await readFile(fixture, 'utf8');
  const marker = 'create function pg_temp.assert';
  const include = '\\ir ../../migrations/20261103150000_add_remote_state.sql';
  assert.equal(source.split(marker).length, 2, 'Fixture bootstrap marker must be unique');
  const bootstrap = source.split(marker)[0];
  assert.equal(bootstrap.split(include).length, 2, 'Fixture must include the exact candidate migration once');
  const seed = bootstrap.replace(include, '\\i ' + "'" + migration.replaceAll('\\', '/') + "'") + `
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.profiles select id,true from auth.users;
insert into public.fixture_sessions select id,true from auth.users;
insert into public.devices(id,owner_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
`;
  const seedPath = join(evidence, 'bootstrap.sql');
  await writeFile(seedPath, seed);
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  port = portServer.address().port;
  await new Promise(done => portServer.close(done));
  report.port = port;
  const pipeName = '\\\\.\\pipe\\doso-handler-init-' + randomUUID();
  const sockets = new Set();
  const pipe = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.end(password + '\n');
  });
  pipe.listen(pipeName);
  await once(pipe, 'listening');
  try {
    await pg('initdb', ['-D', cluster, '-U', 'postgres', '-E', 'UTF8', '--no-locale',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile=' + pipeName], { timeoutMs: 90000 });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => pipe.close(done));
  }
  startAttempted = true;
  await writeFile(join(evidence, 'owned-cluster.json'), JSON.stringify({ cluster, port, runnerPid: process.pid,
    initialized: true, startAttempted: true, stopExecutable: join(bin, 'pg_ctl.exe') }, null, 2));
  await pg('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'server.log'), '-w', '-t', '20', '-o',
    '-h 127.0.0.1 -p ' + port + ' -c shared_buffers=32MB -c max_connections=12 -c log_statement=none -c log_min_error_statement=panic']);
  await pg('createdb', connection().slice(0, -2).concat(database), { env: clientEnv() });
  report.server = JSON.parse((await pg('psql', ['-X', '-qAt', ...connection(), '-c',
    "select json_build_object('directory',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'version',version());"], { env: clientEnv() })).stdout);
  assert.equal(resolve(report.server.directory), resolve(cluster));
  assert.equal(report.server.listen, '127.0.0.1');
  await pg('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection(), '-f', seedPath], { env: clientEnv() });
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = await command(process.execPath, [npm, 'exec', '--offline', '--yes', '--package=deno@2.5.6', '--',
    'deno', 'run', '--frozen', '--node-modules-dir=none', '--config', join(root, 'supabase/functions/deno.json'),
    '--allow-env', '--allow-read=' + root, '--allow-write=' + evidence,
    '--allow-run=' + join(bin, 'psql.exe'), lab], {
      timeoutMs: 90000,
      env: { ...clientEnv(), PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: database,
        DOSO_LAB_PSQL: join(bin, 'psql.exe'), DOSO_LAB_RESULT: join(evidence, 'handler-result.json') },
    });
  assert(result.status === 'exited' && result.exitObserved && result.code === 0, 'Handler lab failed: ' + result.stderr + result.stdout);
  const handler = JSON.parse(await readFile(join(evidence, 'handler-result.json'), 'utf8'));
  assert.equal(handler.result, 'PASS');
  assert.equal(handler.cases.length, 6);
  report.cases = handler.cases;
  report.rpcCalls = handler.rpcCalls;
  report.result = 'PASS_LOCAL_CANDIDATE';
}
try { await main(); }
catch (error) { report.result = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  if (startAttempted) {
    try {
      const before = await command(join(bin, 'pg_ctl.exe'), ['status', '-D', cluster]);
      assert(!before.timedOut && before.exitObserved && (before.code === 0 || before.code === 3), 'Task database status must be observed');
      if (before.code === 0) await pg('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20']);
      const status = await command(join(bin, 'pg_ctl.exe'), ['status', '-D', cluster]);
      assert(!status.timedOut && status.exitObserved && status.code === 3, 'Task database stop must be observed');
      report.stopped = true;
    } catch (error) { report.result = 'FAIL'; report.stopError = error.message; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
