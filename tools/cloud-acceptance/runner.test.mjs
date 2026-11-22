import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, join } from 'node:path';
import { classifyCommandResult, fixedChecks, formatPowerShellCommand, parseArguments, renderDashboard, sanitizeRustEvidence, validateOwnedCluster, validatePostgresEvidence } from './run.mjs';

const success = { status: 'exited', code: 0, exitObserved: true, timedOut: false, stdout: '', stderr: '' };

test('the fixed full run accepts no arguments', () => {
  assert.doesNotThrow(() => parseArguments([]));
  for (const args of [['--command', 'echo bad'], ['--check', 'oss'], ['--render-only'], ['anything']]) {
    assert.throws(() => parseArguments(args));
  }
  const checks = fixedChecks();
  assert.deepEqual(checks.map(check => check.id), ['app-maps', 'postgres-maps', 'edge-handler', 'oss-sdk', 'typescript', 'edge-types', 'remote-app', 'postgres-remote', 'remote-handler']);
  assert.deepEqual(checks.find(check => check.id === 'postgres-remote').args, ['scripts/verify-remote-state.mjs']);
  for (const entry of ['map-library', 'remote-state', 'remote-state-sync']) {
    assert(checks.find(check => check.id === 'edge-types').args.includes('supabase/functions/' + entry + '/index.ts'));
  }
  assert.equal(checks.find(check => check.id === 'remote-app').minimumCount, 21);
  assert.equal(checks.find(check => check.id === 'remote-handler').minimumCount, 21);
});

test('PowerShell display preserves executable spaces and literal apostrophe, backtick and dollar characters', () => {
  assert.equal(formatPowerShellCommand('C:\\Program Files\\node.exe', ["a'b", '`$name']),
    "& 'C:\\Program Files\\node.exe' 'a''b' '`$name'");
});

test('process failure, timeout and unknown exit never become passed from success text', () => {
  const spec = { kind: 'node', minimumCount: 17 };
  const stdout = '# tests 17\n# pass 17\n# fail 0\n';
  for (const changes of [{ status: 'timed-out', timedOut: true }, { code: 1 }, { exitObserved: false }, { code: null }, { status: 'spawn-error' }]) {
    assert.equal(classifyCommandResult(spec, { ...success, stdout, ...changes }).status, 'failed');
  }
  assert.equal(classifyCommandResult(spec, { ...success, stdout }).status, 'passed');
});

test('zero-exit test commands require observed minimum counts and no failed or skipped tests', () => {
  for (const stdout of ['', '# tests 0\n# pass 0\n# fail 0\n', '# tests 17\n# pass 16\n# fail 0\n']) {
    assert.equal(classifyCommandResult({ kind: 'node', minimumCount: 17 }, { ...success, stdout }).status, 'failed');
  }
  assert.equal(classifyCommandResult({ kind: 'deno', minimumCount: 16 }, { ...success, stdout: 'ok | 15 passed | 0 failed' }).status, 'failed');
  assert.equal(classifyCommandResult({ kind: 'deno', minimumCount: 16 }, { ...success, stdout: 'ok | 16 passed | 1 failed' }).status, 'failed');
  assert.equal(classifyCommandResult({ kind: 'deno', minimumCount: 16 }, { ...success, stdout: 'ok | 16 passed | 0 failed (5ms)' }).count, 16);
});

test('HTML embeds escaped JSON data that cannot close its script or execute markup', () => {
  const template = '<script type="application/json" id="acceptance-data"><!--ACCEPTANCE_DATA--></script>';
  const report = { text: '</script><script>alert(1)</script>&\u2028\u2029$&$`$\'' };
  const html = renderDashboard(template, report);
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
  const embedded = html.slice(template.indexOf('>') + 1, html.lastIndexOf('</script>'));
  assert.deepEqual(JSON.parse(embedded), report);
  assert.throws(() => renderDashboard('none', report));
  assert.throws(() => renderDashboard('<!--ACCEPTANCE_DATA--><!--ACCEPTANCE_DATA-->', report));
});

test('missing or partial Rust history stays unknown and arbitrary fields are never copied', () => {
  assert.equal(sanitizeRustEvidence(null, '2026-11-03T00:00:00.000Z').status, 'not-run');
  assert.equal(sanitizeRustEvidence({ checks: ['PASS anything'], token: 'secret' }, '2026-11-03T00:00:00.000Z').status, 'not-run');
  assert.equal(JSON.stringify(sanitizeRustEvidence({ token: 'secret' }, '')).includes('secret'), false);
  const complete = { simulated: true, installed: false, deployed: false, robotTested: false,
    path: 'real Rust Gateway / MQTT TLS / Rust Agent / simulated Brainstem', unitTests: { shared: 4, agent: 14, gateway: 12 },
    latest: { receivedAt: '2026-11-03T00:00:00.000Z', secret: 'private-field' }, token: 'private-token', checks: [
      'PASS signed status HTTP 200, SIMULATED Brainstem reads=1', 'PASS missing credential HTTP 401, reads=1',
      'PASS disabled registration HTTP 403, reads=1', 'PASS reporting: device confirmed; GROUNDED -> STANDING; seq increases',
      'PASS read failure: last success keeps its original time; fresh=false, reachable=true',
      'PASS disable: confirmed, sampling stopped, old grant rejected (409), query rejected (403)',
      'PASS expiry: sampling stopped; expired session cannot be renewed',
      'PASS reconnect: new connection ID; old grant rejected; no automatic collection',
    ] };
  const sanitized = sanitizeRustEvidence(complete, '2026-11-03T00:00:00.000Z');
  assert.equal(sanitized.status, 'passed');
  assert.equal(JSON.stringify(sanitized).includes('private-'), false);
  assert.equal(sanitizeRustEvidence({ ...complete, checks: [...complete.checks, 'FAIL another check'] }, '2026-11-03T00:00:00.000Z').status, 'not-run');
});

test('PostgreSQL pass requires current-run file, expected directory and cleanup confirmation', () => {
  for (const profile of [
    { id: 'postgres-maps', artifact: 'map-catalog', scope: 'SYNTHETIC_NATIVE_POSTGRES_MAP_CATALOG', count: 5, otherId: 'postgres-remote' },
    { id: 'postgres-remote', artifact: 'remote-state', scope: 'SYNTHETIC_NATIVE_POSTGRES_REMOTE_STATE', count: 7, otherId: 'postgres-maps' },
  ]) {
    const root = resolve('synthetic-app', 'artifacts', profile.artifact);
    const report = { runId: '2026-11-03T01-00-01-000Z', evidence: join(root, '2026-11-03T01-00-01-000Z'),
      scope: profile.scope, result: 'PASS_LOCAL_CANDIDATE', stopped: true,
      finishedAt: '2026-11-03T01:00:02.000Z', cases: Array.from({ length: profile.count }, (_, index) => 'PASS group_' + index) };
    const times = { checkId: profile.id, evidenceRoot: root, startedAt: '2026-11-03T01:00:00.000Z', finishedAt: '2026-11-03T01:00:03.000Z', fileModifiedAt: '2026-11-03T01:00:02.000Z' };
    assert.equal(validatePostgresEvidence(report, times).count, profile.count);
    assert.equal(validatePostgresEvidence(report, times).countUnit, 'groups');
    assert.throws(() => validatePostgresEvidence({ ...report, stopped: false }, times));
    assert.throws(() => validatePostgresEvidence(report, { ...times, fileModifiedAt: '2026-11-02T01:00:02.000Z' }));
    assert.throws(() => validatePostgresEvidence({ ...report, evidence: resolve('elsewhere', report.runId) }, times));
    assert.throws(() => validatePostgresEvidence({ ...report, result: 'FAIL' }, times));
    assert.throws(() => validatePostgresEvidence({ ...report, cases: ['PASS output alone'] }, times));
    assert.throws(() => validatePostgresEvidence({ ...report, finishedAt: 'invalid' }, times));
    assert.throws(() => validatePostgresEvidence(report, { ...times, checkId: profile.otherId }));
    assert.throws(() => validatePostgresEvidence(report, { ...times, checkId: '__proto__' }));
  }
});

test('database recovery requires exact child, nonce, time window and fixed root and command', () => {
  const appRoot = resolve('synthetic-app');
  const nativeRunId = '2026-11-03T01-00-01-000Z';
  const runtime = resolve(appRoot, '../.local-toolchains/postgresql-17.11-5');
  const cluster = join(runtime, `synthetic-map-catalog-${nativeRunId}`);
  const record = { runnerPid: 1234, acceptanceRunId: '2026-11-03T01-00-00-000Z-aabbccdd', port: 54321, cluster,
    stopExecutable: join(runtime, 'pgsql/bin/pg_ctl.exe'), stopArgs: ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'] };
  const context = { checkId: 'postgres-maps', appRoot, nativeRunId, acceptanceRunId: record.acceptanceRunId, childPid: 1234,
    startedAt: '2026-11-03T01:00:00.000Z', finishedAt: '2026-11-03T01:00:05.000Z', modifiedAt: '2026-11-03T01:00:01.000Z' };
  assert.equal(validateOwnedCluster(record, context).cluster, cluster);
  for (const changes of [{ runnerPid: 4321 }, { acceptanceRunId: 'another-run' }, { cluster: resolve('unrelated') },
    { stopExecutable: process.execPath }, { stopArgs: ['stop', '-D', resolve('unrelated')] }]) {
    assert.throws(() => validateOwnedCluster({ ...record, ...changes }, context));
  }
  assert.throws(() => validateOwnedCluster(record, { ...context, startedAt: '2026-11-03T01:00:02.000Z' }));
  assert.throws(() => validateOwnedCluster(record, { ...context, modifiedAt: '2026-11-02T01:00:01.000Z' }));
  const remoteCluster = join(runtime, 'synthetic-remote-state-' + nativeRunId);
  const remoteRecord = { ...record, cluster: remoteCluster, stopArgs: ['stop', '-D', remoteCluster, '-m', 'fast', '-w', '-t', '20'] };
  const remoteContext = { ...context, checkId: 'postgres-remote' };
  assert.equal(validateOwnedCluster(remoteRecord, remoteContext).cluster, remoteCluster);
  assert.throws(() => validateOwnedCluster(record, remoteContext));
  assert.throws(() => validateOwnedCluster(remoteRecord, context));
  assert.throws(() => validateOwnedCluster({ ...remoteRecord, runnerPid: 4321 }, remoteContext));
  assert.throws(() => validateOwnedCluster({ ...remoteRecord, acceptanceRunId: 'another-run' }, remoteContext));
  assert.throws(() => validateOwnedCluster(remoteRecord, { ...remoteContext, checkId: '__proto__' }));
});
