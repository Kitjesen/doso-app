// Local PostgreSQL baseline experiment, NOT a Supabase Storage/API acceptance test.
// Creates a unique synthetic cluster, uses real RLS/RPC and independent backends,
// records the unsafe baseline, and stops only the cluster created by this run.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedCommand } from './helpers/bounded-command.mjs';
import { runProfileAvatarRetirementCases } from './helpers/profile-avatar-retirement-cases.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const retirementSafety = process.argv.includes('--retirement-safety');
assert(process.argv.slice(2).every((arg) => arg === '--retirement-safety'), 'Unknown local fixture mode');
const runtime = resolve(root, '../.local-toolchains/postgresql-17.11-5');
const bin = join(runtime, 'pgsql/bin');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const cluster = join(runtime, `synthetic-avatar-${runId}`);
const evidence = join(root, 'artifacts/release-readiness', `20261015-avatar-concurrency-${runId}`);
const database = 'doso_avatar_race_fixture';
const port = 65439;
const fixture = join(root, 'supabase/verification/local/profile_avatar_concurrency_fixture.sql');
const migration = join(root, 'supabase/migrations/20261012090000_add_profile_editing.sql');
const owner = '11111111-1111-4111-8111-111111111111';
const objectName = `${owner}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
const avatar = `profile-avatars/${objectName}`;
const claims = JSON.stringify({ sub: owner, role: 'authenticated' });
const transcript = [];
const clients = [];
let activeCommand = null;
let interrupted = false;
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const password = randomBytes(32).toString('hex'); // Synthetic, memory/child-env only; never output.
const clientEnv = { ...cleanEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' };
const report = {
  runId, scope: retirementSafety ? 'SYNTHETIC_POSTGRES_RETIREMENT_CANDIDATE' : 'SYNTHETIC_POSTGRES_BASELINE_ONLY', database, host: '127.0.0.1', port,
  cluster, evidence, cases: [], stopped: false, release: 'NO-GO',
  limitations: [
    retirementSafety ? 'Lock waits are produced by real prepare/save RPCs; no artificial owner-row lock is introduced.' : 'A uses an admin FOR UPDATE row lock solely as a deterministic fixture barrier, not a production DELETE step.',
    'This is an undeployed local candidate, not an original-bytes or hosted result.',
    'JWT validation, account/session authority and base tables are explicit synthetic fixtures.',
    'Storage metadata SQL DELETE is NOT the Storage API and proves nothing about object bytes/deletion order.',
    'No cloud, Android, production migration, real Storage API or full pgTAP/upgrade suite validation.',
    'Retirement safety covers authenticated App/RPC writers, not arbitrary privileged service-role/admin profile writes.',
  ],
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true;
  report.interruptedBy = signal;
  process.exitCode = 130;
  for (const client of clients) client.child.kill();
  // Killing pg_ctl during start can orphan its server. The main finally still
  // checks/stops the exact task-owned data directory. Hard process kill/power
  // loss cannot be handled in JS; owned-cluster.json identifies manual cleanup.
  if (activeCommand && !activeCommand.cleanup) activeCommand.child.kill();
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = async (name, value) => writeFile(join(evidence, name), value, { flag: 'wx' });

async function command(name, args, { env = cleanEnv, timeout = 30000 } = {}) {
  const cleanup = name === 'pg_ctl' && args[0] === 'stop';
  assert(!interrupted || cleanup, 'Run interrupted before command');
  let child;
  try {
    const result = await runBoundedCommand(join(bin, `${name}.exe`), args, {
      env, timeoutMs: timeout,
      onSpawn(value) { child = value; activeCommand = { child, cleanup }; },
    });
    transcript.push({ command: name, args, ...result });
    if (result.status !== 'exited' || result.code !== 0) {
      throw new Error(`${name}: ${result.status}; exitObserved=${result.exitObserved}; code=${result.code}; signal=${result.signal}; ${result.stderr}`);
    }
    return result.stdout.trim();
  } finally { if (activeCommand?.child === child) activeCommand = null; }
}

class Psql {
  constructor(label, db = database) {
    this.label = label;
    this.pending = null;
    this.lines = '';
    this.closed = false;
    this.child = spawn(join(bin, 'psql.exe'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w',
      '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db],
    { env: clientEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8').on('data', (text) => {
      this.lines += text;
      let newline;
      while ((newline = this.lines.indexOf('\n')) >= 0) {
        const line = this.lines.slice(0, newline).replace(/\r$/, '');
        this.lines = this.lines.slice(newline + 1);
        if (this.pending && line === this.pending.marker) {
          const pending = this.pending;
          this.pending = null;
          clearTimeout(pending.timer);
          transcript.push({ client: label, sql: pending.sql, rows: pending.rows, stderr: pending.stderr });
          pending.resolve(pending.rows);
        } else if (this.pending) this.pending.rows.push(line);
      }
    });
    this.child.stderr.setEncoding('utf8').on('data', (text) => {
      if (this.pending) this.pending.stderr += text;
    });
    const fail = (error) => {
      this.closed = true;
      if (!this.pending) return;
      const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
      transcript.push({ client: label, sql: pending.sql, rows: pending.rows, stderr: pending.stderr, error: error.message });
      pending.reject(error);
    };
    this.child.on('error', fail);
    this.child.on('exit', (code) => fail(new Error(`${label} psql exited ${code}`)));
    clients.push(this);
  }
  query(sql) {
    assert(!interrupted, 'Run interrupted before query');
    assert(!this.pending && !this.closed, `${this.label}: unavailable connection`);
    return new Promise((resolveQuery, reject) => {
      const marker = `DONE_${randomUUID()}`;
      const timer = setTimeout(() => {
        this.child.kill();
        reject(new Error(`${this.label}: bounded query timed out`));
      }, 20000);
      this.pending = { sql, marker, rows: [], stderr: '', resolve: resolveQuery, reject, timer };
      this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
  }
  close() { if (!this.closed) this.child.stdin.end('\\q\n'); }
}

async function main() {
  assert.equal(process.platform, 'win32', 'This runner is Windows/task-local only');
  await access(fixture);
  const identity = JSON.parse((await readFile(join(runtime, 'runtime-identity.json'), 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(identity.archiveSha256, '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f');
  assert.equal(sha(await readFile(join(bin, 'postgres.exe'))), identity.postgresSha256);
  assert.equal(await command('postgres', ['--version']), 'postgres (PostgreSQL) 17.11');
  // Fail on a port collision rather than connecting to any pre-existing database.
  const probe = createServer();
  probe.listen(port, '127.0.0.1'); await once(probe, 'listening');
  await new Promise((done) => probe.close(done));
  await mkdir(evidence); // No overwrite of earlier evidence.
  const commandHelper = join(root, 'scripts/helpers/bounded-command.mjs');
  const commandTests = join(root, 'scripts/bounded-command.test.mjs');
  const retirementTests = join(root, 'scripts/helpers/profile-avatar-retirement-cases.mjs');
  report.inputs = Object.fromEntries(await Promise.all([migration, fixture, fileURLToPath(import.meta.url), commandHelper, commandTests, retirementTests].map(async (path) => [path, sha(await readFile(path))])));
  assert.equal(report.inputs[migration], retirementSafety ? '36ecfea0e5a2f6c528dc1f978a82b5db42037ceb0a9c416c136eff10a3491f31' : '6c255505df12e632ae53985d2586d356c3ecdfee0a09c509d083af04ff7868e0', 'Fixture requires the deliberately selected candidate identity');
  const migrationBytes = await readFile(migration), fixtureBytes = await readFile(fixture);
  assert.equal(sha(migrationBytes), report.inputs[migration]);
  assert.equal(sha(fixtureBytes), report.inputs[fixture]);
  await save('tested-migration.sql', migrationBytes);
  await save('tested-fixture.sql', fixtureBytes);
  await save('tested-runner.mjs', await readFile(fileURLToPath(import.meta.url)));
  await save('tested-bounded-command.mjs', await readFile(commandHelper));
  await save('tested-bounded-command.test.mjs', await readFile(commandTests));
  await save('tested-retirement-cases.mjs', await readFile(retirementTests));
  // Preserve \ir's relative hierarchy and execute only these immutable copies.
  await mkdir(join(evidence, 'supabase/migrations'), { recursive: true });
  await mkdir(join(evidence, 'supabase/verification/local'), { recursive: true });
  await save('supabase/migrations/20261012090000_add_profile_editing.sql', migrationBytes);
  await save('supabase/verification/local/profile_avatar_concurrency_fixture.sql', fixtureBytes);
  await save('owned-cluster.json', JSON.stringify({ cluster, port, host: '127.0.0.1',
    scope: 'Entirely synthetic; created only by this run; no Windows service.',
    stopExecutable: join(bin, 'pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'],
    hardInterruption: 'If the runner is forcibly killed, inspect this exact data directory/PID and run only this exact stop operation. Never stop other PostgreSQL instances.' }, null, 2));
  report.runtimeIdentity = identity;
  // Windows named pipe supplies initdb's documented --pwfile input without a disk secret.
  const pipeName = `\\\\.\\pipe\\doso-avatar-init-${randomUUID()}`;
  const passwordSockets = new Set();
  const passwordPipe = createServer((socket) => {
    passwordSockets.add(socket);
    socket.once('close', () => passwordSockets.delete(socket));
    socket.end(`${password}\n`);
  });
  passwordPipe.listen(pipeName); await once(passwordPipe, 'listening');
  try {
    await command('initdb', ['-D', cluster, '-U', 'postgres', '-E', 'UTF8', '--no-locale',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', `--pwfile=${pipeName}`], { timeout: 90000 });
  } finally {
    // No password client is needed after initdb exit/timeout. Do not allow a
    // half-open task-owned pipe to make error cleanup wait indefinitely.
    for (const socket of passwordSockets) socket.destroy();
    await new Promise((done) => passwordPipe.close(done));
  }
  await command('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'server.log'), '-w', '-t', '20', '-o',
    `-h 127.0.0.1 -p ${port} -c shared_buffers=32MB -c max_connections=12 -c log_statement=none -c log_min_error_statement=panic`]);
  const admin = new Psql('admin', 'postgres');
  await admin.query(`CREATE DATABASE ${database};`);
  admin.close();
  await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1', '-p', String(port),
    '-U', 'postgres', '-d', database, '-f', join(evidence, 'supabase/verification/local/profile_avatar_concurrency_fixture.sql')], { env: clientEnv });
  report.migrationLoaded = true;
  const observer = new Psql('observer'), a = new Psql('delete-A'), b = new Psql('rpc-B');
  for (const client of [observer, a, b]) {
    await client.query("SET statement_timeout='12s'; SET lock_timeout='10s'; SET idle_in_transaction_session_timeout='25s';");
  }
  const [aPid] = await a.query('SELECT pg_backend_pid();');
  const [bPid] = await b.query('SELECT pg_backend_pid();');
  const [observerPid] = await observer.query('SELECT pg_backend_pid();');
  assert.equal(new Set([aPid, bPid, observerPid]).size, 3);
  report.server = JSON.parse((await observer.query("SELECT json_build_object('version',version(),'database',current_database(),'listen',current_setting('listen_addresses'),'port',current_setting('port'),'dataDirectory',current_setting('data_directory'),'hba', (SELECT json_agg(json_build_object('type',type,'address',address,'method',auth_method)) FROM pg_hba_file_rules));"))[0]);
  assert.equal(resolve(report.server.dataDirectory), resolve(cluster));
  assert.equal(report.server.listen, '127.0.0.1');
  assert(report.server.hba.every((rule) => rule.method === 'scram-sha-256'));
  report.backendPids = { aPid, bPid, observerPid };
  if (retirementSafety) {
    await runProfileAvatarRetirementCases({ observer, a, b, report, owner, objectName, avatar, claims, aPid, bPid });
  } else for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    await observer.query(`TRUNCATE storage.objects, public.profiles, public.audit_logs;
      INSERT INTO public.profiles(id,email,username,username_claimed_at,username_provenance,display_name,avatar_url)
      VALUES('${owner}','synthetic@example.test','fixture_user',clock_timestamp()-interval '1 day','registration','Synthetic',NULL);
      SELECT set_config('request.jwt.claims','${claims}',false);
      INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars','${objectName}');`);
    // The admin-only row lock is an explicit fixture barrier, not a product grant.
    // DELETE itself must switch to authenticated and pass the original RLS policy.
    const deleted = await a.query(`BEGIN;
      SELECT id FROM public.profiles WHERE id='${owner}' FOR UPDATE;
      SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${claims}',true);
      WITH removed AS (DELETE FROM storage.objects WHERE bucket_id='profile-avatars' AND name='${objectName}' RETURNING name)
      SELECT count(*) FROM removed;`);
    assert.equal(deleted.at(-1), '1', 'actual authenticated RLS DELETE must remove one fixture object');
    const deleteRole = JSON.parse((await a.query("SELECT json_build_object('role',current_user,'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user));"))[0]);
    assert.equal(deleteRole.role, 'authenticated');
    assert.equal(deleteRole.bypassRls, false);
    await b.query(`BEGIN ISOLATION LEVEL ${isolation}; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${claims}',true);`);
    const [actualRole] = await b.query("SELECT json_build_object('role',current_user,'isolation',current_setting('transaction_isolation'),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user));");
    assert.equal(JSON.parse(actualRole).bypassRls, false);
    assert.equal(JSON.parse(actualRole).role, 'authenticated');
    assert.equal(JSON.parse(actualRole).isolation, isolation.toLowerCase());
    const rpc = b.query(`SELECT (public.update_my_profile('${owner}','fixture_user','Synthetic','replace','${avatar}')).avatar_url;`)
      .then((rows) => ({ rows }), (error) => ({ error: error.message }));
    let blocking;
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const [row] = await observer.query(`SELECT json_build_object('pid',pid,'waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=${Number(bPid)};`);
      const state = JSON.parse(row);
      if (state.waitType === 'Lock' && state.blockers.includes(Number(aPid))) { blocking = state; break; }
      await new Promise((done) => setTimeout(done, 75));
    }
    assert(blocking, 'RPC must demonstrably block on A; elapsed time alone is not proof');
    await a.query('COMMIT;');
    const rpcResult = await rpc;
    assert(!rpcResult.error, rpcResult.error);
    assert.deepEqual(rpcResult.rows, [avatar]);
    await b.query('COMMIT;');
    const [state] = await observer.query(`SELECT json_build_object('profileAvatar',(SELECT avatar_url FROM public.profiles WHERE id='${owner}'),'objectExists',EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='profile-avatars' AND name='${objectName}'),'auditRows',(SELECT count(*) FROM public.audit_logs));`);
    const finalState = JSON.parse(state);
    assert.equal(finalState.profileAvatar, avatar);
    assert.equal(finalState.objectExists, false);
    report.cases.push({ isolation, deleteRole, actualRole: JSON.parse(actualRole), blocking, rpcResult, finalState, result: 'UNSAFE_BASELINE_REPRODUCED' });
  }
  report.inputMatchesAtEnd = Object.fromEntries(await Promise.all(Object.entries(report.inputs).map(async ([path, hash]) => [path, sha(await readFile(path)) === hash])));
  assert(Object.values(report.inputMatchesAtEnd).every(Boolean), 'test inputs changed while running');
  report.result = retirementSafety ? 'SYNTHETIC_RETIREMENT_CANDIDATE_PASS_NOT_DEPLOYED' : 'BASELINE_REPRODUCED_NOT_FIXED';
}

try { await main(); }
catch (error) { report.result = 'EXPERIMENT_INCOMPLETE'; report.error = error.message; process.exitCode = 1; }
finally {
  for (const client of clients) client.close();
  try {
    await access(join(cluster, 'PG_VERSION'));
    await command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20']);
    report.stopped = true;
  } catch (error) { report.stopNote = error.message; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  try {
    await save('transcript.json', JSON.stringify(transcript, null, 2));
    if (report.stopped) await save('server.log', await readFile(join(cluster, 'server.log')));
    await save('verification.json', JSON.stringify(report, null, 2));
  } catch (error) { console.error(`Evidence write: ${error.message}`); process.exitCode = 1; }
  console.log(JSON.stringify(report, null, 2));
}
