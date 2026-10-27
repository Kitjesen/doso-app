import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

import { runBoundedCommand } from './helpers/bounded-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '../.local-toolchains/postgresql-17.11-5');
const bin = join(runtime, 'pgsql/bin');
const port = 65440;
const database = 'doso_avatar_race_fixture';
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
const cluster = join(runtime, `synthetic-auth-session-${runId}`);
const evidence = join(root, 'artifacts/release-readiness', `20261017-auth-session-authority-${runId}`);
const args = process.argv.slice(2);
assert.equal(args.length, 1, 'Use exactly --baseline or --candidate=<migration filename>');
const baseline = args[0] === '--baseline';
const candidateName = baseline ? null : args[0].startsWith('--candidate=') ? args[0].slice(12) : null;
if (!baseline) assert.match(candidateName ?? '', /^\d{14}_[a-z0-9_]+\.sql$/u, 'Candidate must be one repository migration filename');
const candidate = candidateName ? resolve(root, 'supabase/migrations', candidateName) : null;
assert(!candidate || dirname(candidate) === resolve(root, 'supabase/migrations'), 'Candidate must stay in migrations');

const profileFixture = resolve(root, 'supabase/verification/local/profile_avatar_concurrency_fixture.sql');
const profileMigration = resolve(root, 'supabase/migrations/20261012090000_add_profile_editing.sql');
const baselineMigration = resolve(root, 'supabase/migrations/20260822185835_add_account_terminal_security.sql');
const outboxMigration = resolve(root, 'supabase/migrations/20260825070607_add_account_email_outbox.sql');
const authorityFixture = resolve(root, 'supabase/verification/local/auth_session_authority.fixture.sql');
const authorityTest = resolve(root, 'supabase/verification/local/auth_session_authority.test.sql');
const candidateTest = resolve(root, 'supabase/verification/local/auth_session_authority_candidate.test.sql');
const avatarRecoveryTest = resolve(root, 'supabase/verification/local/auth_session_avatar_recovery.test.sql');
const privilegesFixture = resolve(root, 'supabase/verification/local/auth_session_privileges.fixture.sql');
const privilegesTest = resolve(root, 'supabase/verification/local/auth_session_privileges.test.sql');
const boundedHelper = resolve(root, 'scripts/helpers/bounded-command.mjs');
const boundedTests = resolve(root, 'scripts/bounded-command.test.mjs');
const runner = fileURLToPath(import.meta.url);
const selectedInputs = [profileFixture, profileMigration, baselineMigration, outboxMigration, authorityFixture, authorityTest, candidateTest,
  boundedHelper, boundedTests, runner,
  ...(candidate ? [candidate, avatarRecoveryTest, privilegesFixture, privilegesTest] : [])];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalizeSource = value => value.replace(/\r\n?/gu, '\n').trim();
const namedPipePrefix = String.fromCharCode(92, 92, 46, 92) + 'pipe' + String.fromCharCode(92);
assert.equal(namedPipePrefix, '\\\\.\\pipe\\', 'Windows named-pipe prefix must be exact');
const passwordPipeName = `${namedPipePrefix}doso-auth-session-init-${randomUUID()}`;
assert.match(passwordPipeName, /^\\\\\.\\pipe\\doso-auth-session-init-[0-9a-f-]{36}$/u,
  'Task-owned password pipe must stay under the Windows named-pipe namespace');
function functionDefinition(source, qualifiedName) {
  const escaped = qualifiedName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(`create or replace function ${escaped}\\(\\)[\\s\\S]*?\\n\\$\\$;`, 'iu').exec(source);
  assert(match, `Missing function definition: ${qualifiedName}`);
  return normalizeSource(match[0]);
}
function registerMigrationPrefix(source) {
  const match = /create or replace function public\.register_account_terminal\([\s\S]*?\r?\nend \$\$;/iu.exec(source);
  assert(match, 'Latest register_account_terminal definition missing');
  return source.slice(0, match.index + match[0].length);
}
const password = randomBytes(32).toString('hex');
const baseEnv = {};
for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'Path', 'PATHEXT']) {
  if (typeof process.env[name] === 'string') baseEnv[name] = process.env[name];
}
const clientEnv = { ...baseEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PSQL_PAGER: '' };
const transcript = [];
let activeCommand = null;
let interrupted = false;
const report = {
  runId, mode: baseline ? 'BASELINE_EXPECTED_RED' : 'CANDIDATE_LOCAL_ONLY', database,
  host: '127.0.0.1', port, cluster, evidence, stopped: false, release: 'NO-GO',
  limitations: [
    'Synthetic PostgreSQL only: no JWT signature validation or real Auth service.',
    'Storage tables/RLS are SQL fixtures only: no Storage HTTP, object bytes, S3 or hosted Supabase.',
    'This is not the complete pgTAP or Supabase upgrade suite.',
    'Baseline intentionally exits nonzero when the historical terminal-only check accepts a deleted Auth session.',
    'The account-email migration is loaded only through the latest register_account_terminal definition; worker/email delivery functions are outside this slice.',
  ],
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true;
  process.exitCode = 130;
  if (activeCommand && !activeCommand.cleanup) activeCommand.child.kill();
});

async function save(path, value) {
  await writeFile(join(evidence, path), value, { flag: 'wx' });
}

async function command(name, commandArgs, { env = baseEnv, timeout = 30000, allowNonzero = false } = {}) {
  const cleanup = name === 'pg_ctl' && commandArgs[0] === 'stop';
  if (interrupted && !cleanup) throw new Error('Run interrupted');
  let child;
  const result = await runBoundedCommand(join(bin, `${name}.exe`), commandArgs, {
    env, timeoutMs: timeout, onSpawn(value) { child = value; activeCommand = { child, cleanup }; },
  });
  if (activeCommand?.child === child) activeCommand = null;
  transcript.push({ command: name, args: commandArgs, status: result.status, code: result.code,
    signal: result.signal, exitObserved: result.exitObserved, durationMs: result.durationMs,
    stdout: result.stdout, stderr: result.stderr });
  if (!allowNonzero && (result.status !== 'exited' || result.code !== 0)) {
    throw new Error(`${name}_failed_${result.status}_${result.code}`);
  }
  return result;
}

async function copyInput(source, relative) {
  const bytes = await readFile(source);
  const target = join(evidence, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  return { source, relative, sha256: sha256(bytes) };
}

async function main() {
  assert.equal(process.platform, 'win32', 'Windows/task-local runner only');
  await Promise.all(selectedInputs.map(path => access(path)));
  const identity = JSON.parse((await readFile(join(runtime, 'runtime-identity.json'), 'utf8')).replace(/^\uFEFF/u, ''));
  assert.equal(identity.archiveSha256, '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f');
  assert.equal(sha256(await readFile(join(bin, 'postgres.exe'))), identity.postgresSha256);
  const historicalSource = normalizeSource(await readFile(baselineMigration, 'utf8'));
  const outboxSource = await readFile(outboxMigration, 'utf8');
  const outboxPrefix = registerMigrationPrefix(outboxSource);
  const fixtureSource = normalizeSource(await readFile(authorityFixture, 'utf8'));
  for (const functionName of ['private.current_session_id', 'private.is_account_active', 'private.is_session_active']) {
    assert.equal(functionDefinition(fixtureSource, functionName), functionDefinition(historicalSource, functionName),
      `Historical baseline drift: ${functionName}`);
  }
  const version = await command('postgres', ['--version']);
  assert.equal(version.stdout.trim(), 'postgres (PostgreSQL) 17.11');

  const probe = createServer();
  probe.listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise(resolveClose => probe.close(resolveClose));

  await mkdir(evidence);
  const copies = [];
  copies.push(await copyInput(profileFixture, 'supabase/verification/local/profile_avatar_concurrency_fixture.sql'));
  copies.push(await copyInput(profileMigration, 'supabase/migrations/20261012090000_add_profile_editing.sql'));
  copies.push(await copyInput(baselineMigration, 'supabase/migrations/20260822185835_add_account_terminal_security.sql'));
  copies.push(await copyInput(outboxMigration, 'supabase/migrations/20260825070607_add_account_email_outbox.sql'));
  copies.push(await copyInput(authorityFixture, 'supabase/verification/local/auth_session_authority.fixture.sql'));
  copies.push(await copyInput(authorityTest, 'supabase/verification/local/auth_session_authority.test.sql'));
  copies.push(await copyInput(candidateTest, 'supabase/verification/local/auth_session_authority_candidate.test.sql'));
  if (candidate) {
    copies.push(await copyInput(avatarRecoveryTest,
      'supabase/verification/local/auth_session_avatar_recovery.test.sql'));
    copies.push(await copyInput(privilegesFixture, 'supabase/verification/local/auth_session_privileges.fixture.sql'));
    copies.push(await copyInput(privilegesTest, 'supabase/verification/local/auth_session_privileges.test.sql'));
  }
  copies.push(await copyInput(boundedHelper, 'scripts/helpers/bounded-command.mjs'));
  copies.push(await copyInput(boundedTests, 'scripts/bounded-command.test.mjs'));
  copies.push(await copyInput(runner, 'scripts/verify-auth-session-authority.mjs'));
  if (candidate) copies.push(await copyInput(candidate, `supabase/migrations/${candidateName}`));
  const outboxPrefixRelative = 'supabase/verification/local/account_email_register_prefix.sql';
  await mkdir(dirname(join(evidence, outboxPrefixRelative)), { recursive: true });
  await writeFile(join(evidence, outboxPrefixRelative), outboxPrefix, { flag: 'wx' });
  report.outboxRegisterPrefix = {
    source: outboxMigration,
    sourceSha256: sha256(outboxSource),
    derivedSha256: sha256(outboxPrefix),
  };
  report.inputs = copies;
  report.runtimeIdentity = identity;
  await save('owned-cluster.json', JSON.stringify({ cluster, host: '127.0.0.1', port,
    stopExecutable: join(bin, 'pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'],
    scope: 'Only this unique task-created PostgreSQL data directory.' }, null, 2));

  const sockets = new Set();
  const passwordPipe = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.end(`${password}\n`);
  });
  passwordPipe.listen(passwordPipeName);
  await once(passwordPipe, 'listening');
  try {
    await command('initdb', ['-D', cluster, '-U', 'postgres', '-E', 'UTF8', '--no-locale',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', `--pwfile=${passwordPipeName}`], { timeout: 90000 });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolveClose => passwordPipe.close(resolveClose));
  }
  await command('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'server.log'), '-w', '-t', '20', '-o',
    `-h 127.0.0.1 -p ${port} -c shared_buffers=32MB -c max_connections=8 -c log_statement=none -c log_min_error_statement=panic`]);
  const common = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres'];
  const serverIdentityResult = await command('psql', [...common, '-d', 'postgres', '-c',
    `select pg_catalog.json_build_object('dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses'),'port',current_setting('port'),'hbaMethods',(select pg_catalog.json_agg(auth_method order by line_number) from pg_catalog.pg_hba_file_rules where error is null))::text`],
    { env: clientEnv });
  const serverIdentity = JSON.parse(serverIdentityResult.stdout.trim());
  assert.equal(resolve(serverIdentity.dataDirectory), resolve(cluster), 'server_data_directory_mismatch');
  assert.equal(serverIdentity.listenAddresses, '127.0.0.1', 'server_listen_addresses_mismatch');
  assert.equal(serverIdentity.port, String(port), 'server_port_mismatch');
  assert(Array.isArray(serverIdentity.hbaMethods) && serverIdentity.hbaMethods.length > 0,
    'server_hba_rules_missing');
  assert(serverIdentity.hbaMethods.every(method => method === 'scram-sha-256'), 'server_hba_not_all_scram');
  report.serverIdentity = serverIdentity;
  await command('psql', [...common, '-d', 'postgres', '-c', `create database ${database}`], { env: clientEnv });
  const db = [...common, '-d', database];
  await command('psql', [...db, '-f', join(evidence, 'supabase/verification/local/profile_avatar_concurrency_fixture.sql')], { env: clientEnv });
  await command('psql', [...db, '-f', join(evidence, 'supabase/verification/local/auth_session_authority.fixture.sql')], { env: clientEnv });
  await command('psql', [...db, '-f', join(evidence, outboxPrefixRelative)], { env: clientEnv });
  if (candidateName) {
    await command('psql', [...db, '-f', join(evidence, 'supabase/verification/local/auth_session_privileges.fixture.sql')], { env: clientEnv });
    await command('psql', [...db, '-f', join(evidence, `supabase/migrations/${candidateName}`)], { env: clientEnv });
  }
  const verificationTest = baseline ? 'auth_session_authority.test.sql' : 'auth_session_authority_candidate.test.sql';
  const verification = await command('psql', [...db, '-f', join(evidence, `supabase/verification/local/${verificationTest}`)],
    { env: clientEnv, allowNonzero: true });
  report.verification = { status: verification.status, code: verification.code, exitObserved: verification.exitObserved };
  if (baseline) {
    assert.equal(verification.status, 'nonzero-exit');
    assert.notEqual(verification.code, 0);
    assert.match(verification.stderr, /deleted_auth_session_must_be_inactive/u);
    report.result = 'BASELINE_COUNTEREXAMPLE_REPRODUCED';
    process.exitCode = 1;
  } else {
    assert.equal(verification.status, 'exited');
    assert.equal(verification.code, 0);
    assert.match(verification.stdout, /candidate_auth_session_authority_pass/u);
    const avatarRecovery = await command('psql', [...db, '-f', join(evidence,
      'supabase/verification/local/auth_session_avatar_recovery.test.sql')],
    { env: clientEnv, allowNonzero: true });
    report.avatarRecovery = { status: avatarRecovery.status, code: avatarRecovery.code,
      exitObserved: avatarRecovery.exitObserved, markerObserved: /auth_session_avatar_recovery_pass/u.test(avatarRecovery.stdout) };
    assert.equal(avatarRecovery.status, 'exited');
    assert.equal(avatarRecovery.code, 0);
    assert.equal(report.avatarRecovery.markerObserved, true);
    const privileges = await command('psql', [...db, '-f', join(evidence,
      'supabase/verification/local/auth_session_privileges.test.sql')], { env: clientEnv, allowNonzero: true });
    report.privileges = { status: privileges.status, code: privileges.code, exitObserved: privileges.exitObserved,
      markerObserved: /auth_session_privileges_pass/u.test(privileges.stdout) };
    assert.equal(privileges.status, 'exited');
    assert.equal(privileges.code, 0);
    assert.equal(report.privileges.markerObserved, true);
    report.result = 'CANDIDATE_SHARED_GATE_PASS_LOCAL_ONLY';
  }
  report.inputsUnchanged = Object.fromEntries(await Promise.all(copies.map(async input =>
    [input.source, sha256(await readFile(input.source)) === input.sha256])));
  assert(Object.values(report.inputsUnchanged).every(Boolean));
}

try {
  await main();
} catch (error) {
  report.result = 'EXPERIMENT_INCOMPLETE';
  report.error = error instanceof Error ? error.message : 'unknown_failure';
  process.exitCode = 1;
} finally {
  try {
    await access(join(cluster, 'PG_VERSION'));
    await command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20']);
    report.stopped = true;
  } catch (error) {
    report.stopNote = error instanceof Error ? error.message : 'stop_unconfirmed';
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  try {
    await save('transcript.json', JSON.stringify(transcript, null, 2));
    await save('verification.json', JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`Evidence write failed: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ result: report.result, stopped: report.stopped, mode: report.mode }));
}
