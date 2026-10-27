import { randomBytes } from 'node:crypto';
import { copyFile, cp, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceSupabase = path.join(appRoot, 'supabase');
const migrationDirectory = path.join(sourceSupabase, 'migrations');
const verificationDirectory = path.join(sourceSupabase, 'verification');
const preG002Cutoff = '20260824090000';
// Reuse the existing isolated-stack lifecycle; never run this upgrade against a
// linked/hosted project. The default username scenarios remain unchanged.
const profileEditingOnly = process.argv.includes('--profile-editing-only');
const releaseTailMigrations = profileEditingOnly ? [
  '20261012090000_add_profile_editing.sql',
  '20261016155923_require_auth_session_authority.sql',
] : [
  '20260824100000_add_username_provenance.sql',
  '20260824101000_canonicalize_login_method_contract.sql',
  '20260824102000_harden_audit_log_privileges.sql',
];
const sourceFiles = {
  config: path.join(sourceSupabase, 'config.toml'),
  predeployReport: path.join(verificationDirectory, 'predeploy', 'username_provenance_report.sql'),
  preG002Seed: path.join(verificationDirectory, 'upgrade', 'pre_g002_seed.sql'),
  usernameUpgradeTest: path.join(verificationDirectory, 'upgrade', 'username_upgrade.test.sql'),
  preUsernameSeed: path.join(verificationDirectory, 'upgrade', 'pre_username_seed.sql'),
  preG002StageSeed: path.join(verificationDirectory, 'upgrade', 'pre_g002_stage_seed.sql'),
  fullReleaseUpgradeTest: path.join(verificationDirectory, 'upgrade', 'full_release_upgrade.test.sql'),
  preProfileSeed: path.join(verificationDirectory, 'upgrade', 'pre_profile_editing_seed.sql'),
  profileUpgradeTest: path.join(verificationDirectory, 'upgrade', 'profile_editing_upgrade.test.sql'),
  profilePredeployReport: path.join(verificationDirectory, 'predeploy', 'profile_editing_report.sql'),
};
const scenarios = profileEditingOnly ? [
  {
    id: 'profileediting',
    label: 'pre-profile head to profile editing and Auth-session authority upgrade',
    initialCutoff: '20260827070734',
    resetSeed: sourceFiles.preProfileSeed,
    stagedCutoff: null,
    stageSeed: null,
    testSource: sourceFiles.profileUpgradeTest,
    testTarget: 'profile_editing_upgrade.test.sql',
    predeployReport: sourceFiles.profilePredeployReport,
  },
] : [
  {
    id: 'corrective',
    label: '0900 to 1020 corrective upgrade',
    initialCutoff: preG002Cutoff,
    resetSeed: sourceFiles.preG002Seed,
    stagedCutoff: null,
    stageSeed: null,
    testSource: sourceFiles.usernameUpgradeTest,
    testTarget: 'username_upgrade.test.sql',
  },
  {
    id: 'fullrelease',
    label: 'hosted 23111035 head to full release upgrade',
    initialCutoff: '20260823111035',
    resetSeed: sourceFiles.preUsernameSeed,
    stagedCutoff: preG002Cutoff,
    stageSeed: sourceFiles.preG002StageSeed,
    testSource: sourceFiles.fullReleaseUpgradeTest,
    testTarget: 'full_release_upgrade.test.sql',
  },
];
const preflightOnly = process.argv.includes('--preflight-only');
const reportLocal = process.argv.includes('--report-local');

if (reportLocal) {
  await runLocalPredeployReport();
} else {
  await assertInputsAvailable();
  for (const scenario of scenarios) await runIsolatedScenario(scenario);
  if (!preflightOnly) console.log(profileEditingOnly
    ? 'PASS isolated profile editing upgrade scenario'
    : 'PASS both isolated username release upgrade scenarios');
}

async function runLocalPredeployReport() {
  const localProjectId = await loadLocalProjectId();
  const report = runSqlInDatabase(
    `run redacted predeploy ${profileEditingOnly ? 'profile editing' : 'username provenance'} report against the existing local database`,
    await readFile(profileEditingOnly ? sourceFiles.profilePredeployReport : sourceFiles.predeployReport, 'utf8'),
    localProjectId,
  );
  console.log('PREDEPLOY REPORT (aggregate data only)');
  console.log(report.trim());
  console.log('PASS existing local database was inspected without applying migrations');
}

async function runIsolatedScenario(scenario) {
  const projectId = `dosoupgrade${scenario.id}${process.pid}${randomBytes(3).toString('hex')}`;
  const temporaryRoot = await realpath(os.tmpdir());
  let workdir;
  let stackAttempted = false;
  let primaryError;
  let cleanupError;

  try {
    workdir = await mkdtemp(path.join(temporaryRoot, `doso-${scenario.id}-upgrade-`));
    await prepareIsolatedProject(workdir, projectId, scenario);

    if (preflightOnly) {
      // Exercise the real file staging, not merely existence of source inputs.
      // No CLI, database, migration execution or Docker stack is started here.
      await installReleaseTailMigrations(workdir);
      const stagedNames = await readdir(path.join(workdir, 'supabase', 'migrations'));
      console.log(`PREFLIGHT PLAN ${JSON.stringify({
        scenario: scenario.id,
        initialCutoff: scenario.initialCutoff,
        releaseTailMigrations,
        stagedTailMigrations: stagedNames.filter((name) => releaseTailMigrations.includes(name)).sort(),
        databaseStarted: false,
      })}`);
      console.log(`PASS ${scenario.label} harness preflight`);
    } else {
      stackAttempted = true;
      runSupabase(`start isolated ${scenario.label} stack`, ['start'], workdir);
      runSupabase(`reset and seed isolated ${scenario.label} database`, ['db', 'reset'], workdir);

      if (scenario.stagedCutoff) {
        await installMigrationRange(workdir, scenario.initialCutoff, scenario.stagedCutoff);
        runSupabase(`apply pre-G002 backlog for ${scenario.label}`, ['migration', 'up', '--local'], workdir);
        runSqlInDatabase(
          `seed the pre-G002 stage for ${scenario.label}`,
          await readFile(scenario.stageSeed, 'utf8'),
          projectId,
        );
      }

      const report = runSqlInDatabase(
        `run redacted predeploy report for ${scenario.label}`,
        await readFile(scenario.predeployReport ?? sourceFiles.predeployReport, 'utf8'),
        projectId,
      );
      console.log(`PREDEPLOY REPORT (${scenario.label}; aggregate data only)`);
      console.log(report.trim());

      await installReleaseTailMigrations(workdir);
      runSupabase(`apply release-tail migrations for ${scenario.label}`, ['migration', 'up', '--local'], workdir);
      runSupabase(
        `run post-upgrade pgTAP for ${scenario.label}`,
        ['test', 'db', path.join(workdir, 'supabase', 'tests', 'upgrade', scenario.testTarget)],
        workdir,
      );
      console.log(`PASS ${scenario.label}`);
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (stackAttempted && workdir) {
      try {
        runSupabase(`stop isolated ${scenario.label} stack`, ['stop', '--no-backup'], workdir);
      } catch (error) {
        cleanupError = new Error(`${safeMessage(error)}; temporary workdir retained for recovery: ${workdir}`);
      }
    }
    if (workdir && !cleanupError) {
      try {
        // Validate the exact task-owned, direct-child target immediately before
        // recursive removal. Refuse broad paths, junctions and replaced targets.
        const resolvedTarget = path.resolve(workdir);
        const expectedName = new RegExp(`^doso-${scenario.id}-upgrade-[A-Za-z0-9]{6}$`);
        const targetInfo = await lstat(resolvedTarget);
        if (path.dirname(resolvedTarget) !== temporaryRoot
            || !expectedName.test(path.basename(resolvedTarget))
            || !targetInfo.isDirectory() || targetInfo.isSymbolicLink()
            || await realpath(resolvedTarget) !== resolvedTarget) {
          throw new Error('unsafe temporary cleanup target; retained for inspection');
        }
        await rm(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      } catch (error) {
        cleanupError = new Error(`cleanup temporary workdir failed: ${safeMessage(error)}`);
      }
    }
  }

  if (primaryError && cleanupError) {
    throw new AggregateError([primaryError, cleanupError], `${scenario.label} and cleanup failed`);
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
}

async function assertInputsAvailable() {
  const migrationNames = await readdir(migrationDirectory);
  const required = [sourceFiles.config];
  for (const scenario of scenarios) {
    required.push(scenario.predeployReport ?? sourceFiles.predeployReport, scenario.resetSeed, scenario.testSource);
    if (scenario.stageSeed) required.push(scenario.stageSeed);
  }
  required.push(...releaseTailMigrations.map((name) => path.join(migrationDirectory, name)));

  for (const file of required) {
    try {
      await readFile(file);
    } catch {
      throw new Error(`preflight failed: required release verification asset is missing: ${path.relative(appRoot, file)}`);
    }
  }

  for (const scenario of scenarios) {
    const initialMigrations = migrationNames.filter((name) => isMigrationAtOrBefore(name, scenario.initialCutoff)).sort();
    if (initialMigrations.length === 0 || initialMigrations.at(-1)?.slice(0, 14) !== scenario.initialCutoff) {
      throw new Error(`preflight failed: ${scenario.label} boundary ${scenario.initialCutoff} is unavailable`);
    }
    if (scenario.stagedCutoff) {
      const stagedMigrations = migrationNames.filter(
        (name) => isMigrationAfter(name, scenario.initialCutoff) && isMigrationAtOrBefore(name, scenario.stagedCutoff),
      );
      if (stagedMigrations.length === 0 || !stagedMigrations.some((name) => name.startsWith(scenario.stagedCutoff))) {
        throw new Error(`preflight failed: ${scenario.label} backlog through ${scenario.stagedCutoff} is unavailable`);
      }
    }
  }
}

async function prepareIsolatedProject(workdir, projectId, scenario) {
  const targetSupabase = path.join(workdir, 'supabase');
  const targetMigrations = path.join(targetSupabase, 'migrations');
  await mkdir(targetMigrations, { recursive: true });

  const ports = await allocatePorts(10);
  let config = await readFile(sourceFiles.config, 'utf8');
  config = config.replace(/^project_id\s*=\s*"[^"]*"/m, `project_id = "${projectId}"`);
  let portIndex = 0;
  config = config.replace(/^(\s*(?:port|shadow_port|inspector_port)\s*=\s*)\d+(\s*(?:#.*)?)$/gm, (_, prefix, suffix) => {
    const port = ports[portIndex++];
    if (!port) throw new Error('preflight failed: config contains more port fields than the harness reserved');
    return `${prefix}${port}${suffix}`;
  });
  await writeFile(path.join(targetSupabase, 'config.toml'), config, 'utf8');

  await cp(path.join(sourceSupabase, 'templates'), path.join(targetSupabase, 'templates'), { recursive: true });
  await copyFile(scenario.resetSeed, path.join(targetSupabase, 'seed.sql'));
  await copyMigrationsAtOrBefore(targetMigrations, scenario.initialCutoff);

  const targetTests = path.join(targetSupabase, 'tests', 'upgrade');
  await mkdir(targetTests, { recursive: true });
  await copyFile(scenario.testSource, path.join(targetTests, scenario.testTarget));
}

async function copyMigrationsAtOrBefore(targetDirectory, cutoff) {
  const names = (await readdir(migrationDirectory)).filter((name) => isMigrationAtOrBefore(name, cutoff)).sort();
  for (const name of names) await copyFile(path.join(migrationDirectory, name), path.join(targetDirectory, name));
}

async function installMigrationRange(workdir, afterExclusive, atOrBeforeInclusive) {
  const targetDirectory = path.join(workdir, 'supabase', 'migrations');
  const names = (await readdir(migrationDirectory))
    .filter((name) => isMigrationAfter(name, afterExclusive) && isMigrationAtOrBefore(name, atOrBeforeInclusive))
    .sort();
  for (const name of names) await copyFile(path.join(migrationDirectory, name), path.join(targetDirectory, name));
}

async function installReleaseTailMigrations(workdir) {
  const targetDirectory = path.join(workdir, 'supabase', 'migrations');
  for (const name of releaseTailMigrations) {
    await copyFile(path.join(migrationDirectory, name), path.join(targetDirectory, name));
  }
}

function isMigrationAtOrBefore(name, cutoff) {
  return /^\d{14}_.+\.sql$/.test(name) && name.slice(0, 14) <= cutoff;
}

function isMigrationAfter(name, cutoff) {
  return /^\d{14}_.+\.sql$/.test(name) && name.slice(0, 14) > cutoff;
}

function runSupabase(stage, args, workdir) {
  const npm = npmInvocation();
  return runCommand(stage, npm.command, [...npm.args, 'exec', '--', 'supabase', ...args, '--workdir', workdir], {
    cwd: appRoot,
    env: { ...process.env, DO_NOT_TRACK: '1' },
  });
}

function runSqlInDatabase(stage, sql, projectId) {
  return runCommand(
    stage,
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${projectId}`,
      'psql',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--file',
      '-',
    ],
    { cwd: appRoot, input: sql },
  );
}

function runCommand(stage, command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${stage} failed to start: ${safeMessage(result.error)}`);
  if (result.status !== 0) {
    const detail = redact(`${result.stderr ?? ''}\n${result.stdout ?? ''}`).trim().slice(-2000);
    throw new Error(`${stage} failed (exit ${result.status})${detail ? `:\n${detail}` : ''}`);
  }
  console.log(`PASS ${stage}`);
  return redact(result.stdout ?? '');
}

function npmInvocation() {
  if (process.platform !== 'win32') return { command: 'npm', args: [] };
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return { command: process.execPath, args: [npmCli] };
}

async function loadLocalProjectId() {
  let config;
  try {
    config = await readFile(sourceFiles.config, 'utf8');
    await readFile(profileEditingOnly ? sourceFiles.profilePredeployReport : sourceFiles.predeployReport);
  } catch (error) {
    throw new Error(`predeploy report preflight failed: ${safeMessage(error)}`);
  }
  const match = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!match) throw new Error('predeploy report preflight failed: config.toml has no safe project_id');
  return match[1];
}

async function allocatePorts(count) {
  const ports = new Set();
  while (ports.size < count) ports.add(await allocatePort());
  return [...ports];
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('operating system did not allocate an isolation port'));
        else resolve(port);
      });
    });
  });
}

function safeMessage(error) {
  return redact(error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function redact(value) {
  return String(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[redacted-id]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-database-url]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-token]')
    .replace(
      /((?:["']?)(?:(?:[a-z0-9]+[_-])*)(?:anon[_-]?key|service[_-]?role[_-]?key|secret(?:[_-]?key)?|password|token)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
      '$1[redacted]',
    );
}
