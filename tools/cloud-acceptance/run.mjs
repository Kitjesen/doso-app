import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedCommand } from '../../scripts/helpers/bounded-command.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = join(appRoot, 'artifacts/cloud-acceptance');
const templatePath = join(appRoot, 'tools/cloud-acceptance/dashboard.html');
const rustPath = 'D:/DOSO/artifacts/robot-cloud/reporting-result.json';
const runIdPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const postgresProfiles = {
  'postgres-maps': { artifact: 'map-catalog', scope: 'SYNTHETIC_NATIVE_POSTGRES_MAP_CATALOG', prefix: 'synthetic-map-catalog-', minimumGroups: 5 },
  'postgres-remote': { artifact: 'remote-state', scope: 'SYNTHETIC_NATIVE_POSTGRES_REMOTE_STATE', prefix: 'synthetic-remote-state-', minimumGroups: 7 },
};

function postgresProfile(checkId) {
  if (!Object.hasOwn(postgresProfiles, checkId)) throw new Error('Unknown fixed PostgreSQL check.');
  return postgresProfiles[checkId];
}
const boundaries = [
  '本页执行本地验收，不连接 OSS、ECS、真实机器狗或 5G。',
  'PostgreSQL 使用独立真实数据库，账号与会话依赖采用合成测试夹具。',
  'Edge Handler 使用模拟认证、RPC 与对象存储。SDK 检查使用合成密钥。',
  'Rust 报告作为历史只读证据导入，未在本次验收重新执行。',
];

export function parseArguments(args) {
  if (args.length) throw new Error('Use node tools/cloud-acceptance/run.mjs without arguments.');
}

export function formatPowerShellCommand(file, args) {
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  return `& ${[file, ...args].map(quote).join(' ')}`;
}

export function renderDashboard(template, report) {
  if (template.split('<!--ACCEPTANCE_DATA-->').length !== 2) throw new Error('Dashboard must contain exactly one acceptance data placeholder.');
  const escapes = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  const data = JSON.stringify(report).replace(/[<>&\u2028\u2029]/g, value => escapes[value]);
  return template.replace('<!--ACCEPTANCE_DATA-->', () => data);
}

export function fixedChecks() {
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const deno = args => [npmCli, 'exec', '--yes', '--package=deno@2.5.6', '--', 'deno', ...args];
  const config = ['--node-modules-dir=none', '--config', 'supabase/functions/deno.json'];
  return [
    { id: 'app-maps', label: 'App 地图目录与入口', scope: 'Node 服务、界面和导航测试', minimumCount: 17, kind: 'node',
      args: ['--test', '--test-reporter=tap', 'scripts/cloud-maps-service.test.mjs', 'scripts/cloud-maps-screen.test.mjs', 'scripts/map-library-navigation.test.mjs'] },
    { id: 'postgres-maps', label: '地图数据库权限与事务', scope: '原生 PostgreSQL 独立实例，合成账号和会话依赖', kind: 'postgres',
      args: ['scripts/verify-device-map-catalog.mjs'] },
    { id: 'edge-handler', label: '地图业务 API', scope: '模拟认证、RPC 和对象存储的 Handler 测试', minimumCount: 16, kind: 'deno',
      args: deno(['test', ...config, '--allow-read', '--allow-env', 'supabase/functions/tests/map-library.test.ts']) },
    { id: 'oss-sdk', label: '官方 OSS SDK 签名', scope: '合成密钥，本地签名及配置校验', minimumCount: 2, kind: 'deno',
      args: deno(['test', ...config, '--allow-read', '--allow-env', '--allow-sys=osRelease,networkInterfaces', 'supabase/functions/map-library/oss_test.ts']) },
    { id: 'typescript', label: 'App TypeScript', scope: 'App 静态类型检查', kind: 'static',
      args: ['node_modules/typescript/bin/tsc', '--noEmit'] },
    { id: 'edge-types', label: '地图与远程状态 Edge 入口类型', scope: 'Deno 三个业务入口静态检查', kind: 'static',
      args: deno(['check', ...config, 'supabase/functions/map-library/index.ts', 'supabase/functions/remote-state/index.ts', 'supabase/functions/remote-state-sync/index.ts']) },
    { id: 'remote-app', label: 'App 远程状态与用户开关', scope: 'Node 服务、面板和个人页接线测试', minimumCount: 21, kind: 'node',
      args: ['--test', '--test-reporter=tap', 'scripts/remote-state-service.test.mjs', 'scripts/remote-state-panel.test.mjs', 'scripts/profile-remote-state.test.mjs'] },
    { id: 'postgres-remote', label: '远程状态授权与后台续期', scope: '原生 PostgreSQL 独立实例，合成 Gateway 与 Auth 依赖', kind: 'postgres',
      args: ['scripts/verify-remote-state.mjs'] },
    { id: 'remote-handler', label: '远程状态业务与同步 API', scope: '模拟会话、服务密钥和数据库的 Handler 测试', minimumCount: 21, kind: 'deno',
      args: deno(['test', ...config, '--allow-read', '--allow-env', 'supabase/functions/tests/remote-state-user.test.ts', 'supabase/functions/tests/remote-state-sync.test.ts']) },
  ];
}

export function classifyCommandResult(spec, result) {
  if (result.status !== 'exited' || result.code !== 0 || result.exitObserved !== true || result.timedOut === true) {
    return { status: 'failed', details: [`Process outcome ${result.status}, exit ${String(result.code)}, exit observed ${result.exitObserved === true}.`] };
  }
  if (spec.kind === 'node') {
    const total = /^# tests (\d+)\s*$/m.exec(result.stdout)?.[1];
    const passed = /^# pass (\d+)\s*$/m.exec(result.stdout)?.[1];
    const failed = /^# fail (\d+)\s*$/m.exec(result.stdout)?.[1];
    if (!total || Number(total) < spec.minimumCount || Number(passed) !== Number(total) || failed !== '0') {
      return { status: 'failed', details: ['Node TAP did not confirm the required tests all passed.'] };
    }
    return { status: 'passed', count: Number(total), countUnit: 'tests', details: ['Observed Node TAP totals and a successful process exit.'] };
  }
  if (spec.kind === 'deno') {
    const summary = /(?:^|\n)ok\s*\|\s*(\d+) passed\s*\|\s*(\d+) failed\b/.exec(result.stdout);
    if (!summary || Number(summary[1]) < spec.minimumCount || summary[2] !== '0') {
      return { status: 'failed', details: ['Deno did not confirm the required tests all passed.'] };
    }
    return { status: 'passed', count: Number(summary[1]), countUnit: 'tests', details: ['Observed Deno test totals and a successful process exit.'] };
  }
  return { status: 'passed', details: ['The fixed check completed with an observed zero exit code.'] };
}

export function validatePostgresEvidence(report, { checkId, evidenceRoot, startedAt, finishedAt, fileModifiedAt }) {
  const profile = postgresProfile(checkId);
  const folder = typeof report?.evidence === 'string' ? resolve(report.evidence) : '';
  const start = Date.parse(startedAt), end = Date.parse(finishedAt), modified = Date.parse(fileModifiedAt), recordedEnd = Date.parse(report?.finishedAt);
  if (!folder || basename(resolve(evidenceRoot)) !== profile.artifact || dirname(folder) !== resolve(evidenceRoot) || basename(folder) !== report.runId ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(report.runId ?? '') ||
    !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(modified) || !Number.isFinite(recordedEnd) ||
    modified < start || modified > end + 1000 || recordedEnd < start || recordedEnd > end + 1000 ||
    report.scope !== profile.scope || report.result !== 'PASS_LOCAL_CANDIDATE' || report.stopped !== true ||
    !Array.isArray(report.cases) || report.cases.length < profile.minimumGroups || !report.cases.every(value => typeof value === 'string' && /^PASS [a-z0-9_]{1,120}$/.test(value))) {
    throw new Error('PostgreSQL evidence is incomplete, stale, outside the expected directory, or did not confirm cleanup.');
  }
  return { count: report.cases.length, countUnit: 'groups', details: report.cases.map(value => value.slice(5)),
    evidence: { path: join(folder, 'verification.json'), modifiedAt: fileModifiedAt } };
}

const rustChecks = [
  'PASS signed status HTTP 200, SIMULATED Brainstem reads=1',
  'PASS missing credential HTTP 401, reads=1',
  'PASS disabled registration HTTP 403, reads=1',
  'PASS reporting: device confirmed; GROUNDED -> STANDING; seq increases',
  'PASS read failure: last success keeps its original time; fresh=false, reachable=true',
  'PASS disable: confirmed, sampling stopped, old grant rejected (409), query rejected (403)',
  'PASS expiry: sampling stopped; expired session cannot be renewed',
  'PASS reconnect: new connection ID; old grant rejected; no automatic collection',
];

export function sanitizeRustEvidence(value, modifiedAt) {
  const counts = ['shared', 'agent', 'gateway'].map(key => value?.unitTests?.[key]);
  if (value?.simulated !== true || value.installed !== false || value.deployed !== false || value.robotTested !== false ||
    value.path !== 'real Rust Gateway / MQTT TLS / Rust Agent / simulated Brainstem' ||
    !Array.isArray(value.checks) || !value.checks.every(check => typeof check === 'string' && check.startsWith('PASS ') && check.length <= 300) ||
    !rustChecks.every(check => value.checks.includes(check)) ||
    !counts.every(count => Number.isInteger(count) && count > 0 && count <= 100000) ||
    !Number.isFinite(Date.parse(value.latest?.receivedAt)) || !Number.isFinite(Date.parse(modifiedAt))) {
    return { status: 'not-run', details: ['Rust 历史报告缺失或格式不完整，无法确认结果。'] };
  }
  return { status: 'passed', count: counts.reduce((sum, count) => sum + count, 0), countUnit: 'reported unit tests',
    details: ['历史只读导入，本次未执行 Rust 检查。', 'Rust Gateway / MQTT TLS / Rust Agent / 模拟 Brainstem。',
      `报告状态时间 ${value.latest.receivedAt}`, `shared=${counts[0]}, agent=${counts[1]}, gateway=${counts[2]}。`,
      ...rustChecks.map(check => check.slice(5)), '报告标记 installed=false、deployed=false、robotTested=false。'] };
}

async function importRustEvidence() {
  const check = { id: 'rust-reporting', label: 'Rust 持续状态上报历史证据', source: 'imported', scope: '外部只读报告，模拟 Brainstem',
    command: '', workdir: 'D:/DOSO/robot-cloud', startedAt: null, finishedAt: null, durationMs: null, exitCode: null, logPath: null };
  try {
    const before = await stat(rustPath);
    if (!before.isFile() || before.size > 1024 * 1024) throw new Error('Unexpected evidence size.');
    const value = JSON.parse(await readFile(rustPath, 'utf8'));
    const after = await stat(rustPath);
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new Error('Evidence changed while reading.');
    return { ...check, ...sanitizeRustEvidence(value, after.mtime.toISOString()), evidence: { path: rustPath, modifiedAt: after.mtime.toISOString() } };
  } catch {
    return { ...check, status: 'not-run', details: ['Rust 历史报告缺失、读取失败或发生变化，结果未知。'], evidence: { path: rustPath, modifiedAt: null } };
  }
}

async function atomicWrite(path, value) {
  await writeFile(`${path}.tmp`, value);
  await rename(`${path}.tmp`, path);
}

export function validateOwnedCluster(record, context) {
  const profile = postgresProfile(context.checkId);
  const nativeTime = /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(context.nativeRunId ?? '');
  const createdAt = nativeTime ? Date.parse(`${nativeTime[1]}${nativeTime[2]}:${nativeTime[3]}:${nativeTime[4]}.${nativeTime[5]}Z`) : NaN;
  const started = Date.parse(context.startedAt), finished = Date.parse(context.finishedAt), modified = Date.parse(context.modifiedAt);
  const runtime = resolve(context.appRoot, '../.local-toolchains/postgresql-17.11-5');
  const cluster = join(runtime, profile.prefix + context.nativeRunId);
  const binary = join(runtime, 'pgsql/bin/pg_ctl.exe');
  const args = ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '20'];
  if (![createdAt, started, finished, modified].every(Number.isFinite) || createdAt < started || createdAt > finished ||
    modified < started || modified > finished || !Number.isInteger(context.childPid) || context.childPid < 1 ||
    record?.runnerPid !== context.childPid || record.acceptanceRunId !== context.acceptanceRunId || !runIdPattern.test(context.acceptanceRunId ?? '') ||
    !Number.isInteger(record.port) || record.port < 1 || record.port > 65535 ||
    record.cluster !== cluster || record.stopExecutable !== binary || JSON.stringify(record.stopArgs) !== JSON.stringify(args)) {
    throw new Error('Cluster record does not prove ownership by this acceptance child.');
  }
  return { cluster, binary, args };
}

async function recoverPostgres(check, previousNames, acceptanceRunId, runFolder) {
  const root = join(appRoot, 'artifacts', postgresProfile(check.id).artifact);
  const candidates = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || previousNames.has(entry.name)) continue;
    const folder = join(root, entry.name), marker = join(folder, 'owned-cluster.json');
    try {
      if (await realpath(folder) !== folder || await realpath(marker) !== marker) continue;
      const info = await stat(marker);
      if (!info.isFile() || info.size > 16000) continue;
      const record = JSON.parse(await readFile(marker, 'utf8'));
      const owned = validateOwnedCluster(record, { checkId: check.id, appRoot, nativeRunId: entry.name, acceptanceRunId, childPid: check.processId,
        startedAt: check.startedAt, finishedAt: check.finishedAt, modifiedAt: info.mtime.toISOString() });
      if (await realpath(owned.cluster) !== owned.cluster || await realpath(owned.binary) !== owned.binary) continue;
      candidates.push({ ...owned, marker });
    } catch { /* Unproven records never authorize stopping a database. */ }
  }
  if (candidates.length !== 1) return { attempted: false, confirmed: false, detail: 'Owned PostgreSQL recovery could not be established. No server was stopped.' };
  const owned = candidates[0], logPath = 'logs/' + check.id + '-recovery.log';
  const commands = [];
  const command = async args => {
    const result = await runBoundedCommand(owned.binary, args, { timeoutMs: 30000 });
    commands.push({ command: formatPowerShellCommand(owned.binary, args), ...result });
    return result;
  };
  const stopped = result => result.exitObserved === true && result.code === 3 && result.timedOut !== true;
  let status = await command(['status', '-D', owned.cluster]);
  if (!stopped(status) && status.exitObserved === true && status.code === 0 && status.timedOut !== true) {
    await command(owned.args);
    status = await command(['status', '-D', owned.cluster]);
  }
  await writeFile(join(runFolder, logPath), commands.map(item => `${item.command}\n${item.stdout}${item.stderr}\nstatus=${item.status} exit=${item.code}\n`).join('\n'));
  return { attempted: true, confirmed: stopped(status), markerPath: owned.marker, logPath,
    detail: stopped(status) ? 'Task-owned PostgreSQL cleanup confirmed by pg_ctl status exit 3.' : 'Task-owned PostgreSQL cleanup remains unconfirmed. Review the exact cluster marker and recovery log.' };
}

async function saveReport(report, template) {
  const folder = join(artifactRoot, report.runId);
  await atomicWrite(join(folder, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(join(folder, 'dashboard.html'), renderDashboard(template, report));
  const indexReport = { ...report, checks: report.checks.map(check => ({ ...check, logPath: check.logPath ? `${report.runId}/${check.logPath}` : null })) };
  await atomicWrite(join(artifactRoot, 'index.html'), renderDashboard(template, indexReport));
  await atomicWrite(join(artifactRoot, 'latest.json'), `${JSON.stringify({ schemaVersion: 1, runId: report.runId,
    resultPath: `${report.runId}/result.json`, updatedAt: report.finishedAt ?? report.startedAt }, null, 2)}\n`);
}

async function verifyPostgresOutput(result, check) {
  const announced = JSON.parse(result.stdout.trim());
  const folder = typeof announced.evidence === 'string' ? resolve(announced.evidence) : '';
  const expectedRoot = join(appRoot, 'artifacts', postgresProfile(check.id).artifact);
  if (dirname(folder) !== expectedRoot || basename(folder) !== announced.runId) throw new Error('Unexpected PostgreSQL evidence path.');
  const path = join(folder, 'verification.json');
  const info = await stat(path);
  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.runId !== announced.runId || report.finishedAt !== announced.finishedAt || report.result !== announced.result) {
    throw new Error('PostgreSQL output and evidence file disagree.');
  }
  return validatePostgresEvidence(report, { checkId: check.id, evidenceRoot: expectedRoot, startedAt: check.startedAt, finishedAt: check.finishedAt,
    fileModifiedAt: info.mtime.toISOString() });
}

export async function main(args = process.argv.slice(2)) {
  parseArguments(args);
  const template = await readFile(templatePath, 'utf8');
  renderDashboard(template, {});
  process.chdir(appRoot);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
  const folder = join(artifactRoot, runId);
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(folder);
  await mkdir(join(folder, 'logs'));
  const specs = fixedChecks();
  const report = { schemaVersion: 1, runId, mode: 'local', status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    generatedAt: new Date().toISOString(), artifactDirectory: folder, boundaries,
    checks: specs.map(spec => ({ id: spec.id, label: spec.label, status: 'not-run', source: 'executed', scope: spec.scope,
      command: formatPowerShellCommand(process.execPath, spec.args), workdir: appRoot,
      startedAt: null, finishedAt: null, durationMs: null, exitCode: null, logPath: null, details: [] })) };
  report.checks.push(await importRustEvidence());
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    report.status = 'interrupted'; report.interruptedAt = new Date().toISOString();
    console.log('\nINTERRUPTED. Waiting for the bounded active check to finish cleanup. No further checks will start.');
  };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    await saveReport(report, template);
    for (const spec of specs) {
      if (interrupted) break;
      const check = report.checks.find(value => value.id === spec.id);
      check.status = 'running'; check.startedAt = new Date().toISOString(); check.logPath = `logs/${spec.id}.log`;
      console.log(`\nBEGIN ${spec.id} ${check.startedAt} ${spec.label}`);
      await saveReport(report, template);
      const log = createWriteStream(join(folder, check.logPath));
      const existingPgFolders = spec.kind === 'postgres' ? new Set(await readdir(join(appRoot, 'artifacts', postgresProfile(spec.id).artifact)).catch(() => [])) : null;
      let result;
      try {
        result = await runBoundedCommand(process.execPath, spec.args, { timeoutMs: 180000,
          env: { ...process.env, NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1', DOSO_ACCEPTANCE_RUN_ID: runId }, onSpawn(child) {
            check.processId = child.pid ?? null;
            for (const stream of [child.stdout, child.stderr]) stream.on('data', text => { log.write(text); process.stdout.write(text); });
          } });
      } finally { await new Promise(done => log.end(done)); }
      check.finishedAt = new Date().toISOString(); check.durationMs = result.durationMs; check.exitCode = result.code;
      Object.assign(check, classifyCommandResult(spec, result));
      if (check.status === 'passed' && spec.kind === 'postgres') {
        try { Object.assign(check, await verifyPostgresOutput(result, check)); }
        catch { check.status = 'failed'; check.details = ['PostgreSQL did not supply a valid, cleaned-up evidence file from this check.']; }
      }
      if (check.status === 'failed' && spec.kind === 'postgres') {
        check.cleanup = await recoverPostgres(check, existingPgFolders, runId, folder);
        check.details.push(check.cleanup.detail);
      }
      if (interrupted) { check.status = 'not-run'; check.details = ['Run interrupted while this check was active. Its result is not accepted as completed.']; }
      console.log(`END ${spec.id} ${check.status} ${check.durationMs}ms`);
      report.generatedAt = new Date().toISOString();
      await saveReport(report, template);
    }
    if (!interrupted) { report.status = 'completed'; report.finishedAt = new Date().toISOString(); }
    report.generatedAt = new Date().toISOString();
    await saveReport(report, template);
    console.log(`\nREPORT ${join(folder, 'result.json')}\nDASHBOARD ${join(artifactRoot, 'index.html')}`);
    if (interrupted) process.exitCode = 130;
    else if (report.checks.some(check => check.source === 'executed' && check.status !== 'passed')) process.exitCode = 1;
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
