// Read-only QA preparation. This module has no build, install or device action.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINIMUM_FREE_MEMORY_KIB = 4 * 1024 * 1024;
export const QA_COMPETING_TASK_PREDICATE = String.raw`($_.Name -match '^(emulator|qemu-system.*)\.exe$') -or (($_.Name -match '^(java|gradle|node)\.exe$') -and ($_.CommandLine -match 'GradleDaemon|GradleWrapper|gradlew|assembleQa|build-android|expo.*export|metro|emulator'))`;

export function assessQaBuildReadiness({ freeMemoryKiB, environment = {}, competingProcesses }) {
  const blockers = [];
  if (!Number.isSafeInteger(freeMemoryKiB) || freeMemoryKiB < MINIMUM_FREE_MEMORY_KIB) {
    blockers.push('insufficient_memory');
  }
  if (!Array.isArray(competingProcesses) || competingProcesses.length !== 0) {
    blockers.push('competing_tasks_or_unknown');
  }
  if (environment.EXPO_NO_DOTENV !== '1') blockers.push('dotenv_not_disabled');
  const expectedUrl = 'https://vchvqfdlkomlrjenkdhj.supabase.co';
  if (environment.EXPO_PUBLIC_SUPABASE_URL !== expectedUrl ||
      environment.EXPO_PUBLIC_SUPABASE_URL_ANDROID !== expectedUrl ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')) {
    blockers.push('public_configuration_missing_or_wrong_target');
  }
  for (const flag of ['EXPO_PUBLIC_DESIGN_QA', 'EXPO_PUBLIC_CONNECTION_DIAGNOSTICS',
    'EXPO_PUBLIC_BRAINSTEM_SIMULATION', 'EXPO_PUBLIC_DESIGN_QA_CAPTURE',
    'EXPO_PUBLIC_APPLE_AUTH_ENABLED', 'EXPO_PUBLIC_WECHAT_AUTH_ENABLED', 'EXPO_PUBLIC_QQ_AUTH_ENABLED']) {
    if (environment[flag] && environment[flag] !== '0' && environment[flag] !== 'false') {
      blockers.push('nonstandard_entry_or_provider_enabled');
      break;
    }
  }
  return { ready: blockers.length === 0, blockers, freeMemoryKiB,
    minimumFreeMemoryKiB: MINIMUM_FREE_MEMORY_KIB, buildStarts: 0 };
}

export function snapshotQaBuildInputs(root) {
  const base = realpathSync(root);
  const result = [];
  const privateName = /^(?:\.env.*|local\.properties|.*\.(?:keystore|jks|p12|pfx|pem|key|p8)|.*credentials.*)$/i;
  const visit = (relative) => {
    const name = relative.split('/').at(-1);
    if (privateName.test(name)) return;
    if (relative.startsWith('android/') && /^(?:build|\.gradle|\.cxx|\.kotlin)$/.test(name)) return;
    if (/^modules\/[^/]+\/android\/(?:build|\.gradle|\.cxx|\.kotlin)$/.test(relative)) return;
    if (name === 'node_modules' || name === '.git') return;
    const absolute = join(base, relative);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('unsafe_input_link');
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) visit(`${relative}/${child}`);
    } else if (stat.isFile()) {
      result.push({ path: relative, sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') });
    } else throw new Error('unsupported_input_type');
  };
  for (const name of ['App.tsx', 'index.ts', 'app.json', 'package.json', 'package-lock.json', 'tsconfig.json',
    'src', 'assets', 'plugins', 'android']) {
    if (!existsSync(join(base, name))) throw new Error('required_input_missing');
    visit(name);
  }
  for (const name of ['index.preview.ts', 'eas.json', 'babel.config.js', 'babel.config.cjs', 'babel.config.mjs',
    'metro.config.js', 'metro.config.cjs', 'metro.config.mjs', 'react-native.config.js', 'modules']) {
    if (existsSync(join(base, name))) visit(name);
  }
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

// CLI probes resources once, not a wait/retry loop. It never starts Gradle.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--report-dir') throw new Error('expected_report_dir_only');
    const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
    const reportDir = realpathSync(args[1]);
    const reportBase = realpathSync(join(root, 'artifacts/release-readiness'));
    const reportRelative = relative(reportBase, reportDir);
    if (!reportRelative || reportRelative.startsWith('..') || isAbsolute(reportRelative)) {
      throw new Error('report_outside_release_evidence');
    }
    let observation = { freeMemoryKiB: null, competingProcesses: null };
    try {
      const text = execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `$os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $tasks=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { ${QA_COMPETING_TASK_PREDICATE} }); @{freeMemoryKiB=[long]$os.FreePhysicalMemory; competingTaskCount=$tasks.Count} | ConvertTo-Json -Compress`],
      { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const parsed = JSON.parse(text);
      if (!Number.isSafeInteger(parsed.freeMemoryKiB) || !Number.isSafeInteger(parsed.competingTaskCount) ||
          parsed.competingTaskCount < 0 || parsed.competingTaskCount > 10000) throw new Error('invalid_resource_observation');
      observation = { freeMemoryKiB: parsed.freeMemoryKiB,
        competingProcesses: Array.from({ length: parsed.competingTaskCount }, () => ({})) };
    } catch { /* Unknown resources are blockers; no raw process output retained. */ }
    const assessment = assessQaBuildReadiness({ ...observation, environment: process.env });
    const inputs = snapshotQaBuildInputs(root);
    const report = { observedAt: new Date().toISOString(), mode: 'read_only_preflight', assessment,
      entry: 'index.ts', taskNotStarted: ':app:assembleQa', inputs,
      limits: ['Not a build or native/auth acceptance', 'No private env or signing input digest',
        'Installed node_modules/dependency caches/toolchain binaries are not frozen',
        'Publishable key syntax is checked, not opaque key project ownership',
        'Readiness is a point-in-time prerequisite only'],
      excluded: ['private env/keystore/credentials/local.properties', 'android generated outputs/caches'] };
    writeFileSync(join(reportDir, 'preflight.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ mode: report.mode, ...assessment, inputCount: inputs.length }));
    process.exitCode = assessment.ready ? 0 : 2;
  } catch {
    console.error('QA preflight failed; no build started and no existing evidence overwritten.');
    process.exitCode = 1;
  }
}
