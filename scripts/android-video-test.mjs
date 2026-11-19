import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToolchainBuildEnvironment } from './qa-build-environment.mjs';
import { createQaBuildCommand, executeQaBuild } from './qa-build-once.mjs';
import { assessBuildResources, QA_COMPETING_TASK_PREDICATE, snapshotQaBuildInputs } from './qa-build-preflight.mjs';

export function createVideoBuildEnvironment(host) {
  return { ...createToolchainBuildEnvironment(host), ENTRY_FILE: 'index.video-test.ts' };
}

export function videoBuildCommand(root, environment) {
  const command = createQaBuildCommand(root, environment, 'C:/doso-build/android');
  command.args = ['-Xmx64m', '-Xms64m', '-Dorg.gradle.appname=gradlew', '-jar',
    'gradle/wrapper/gradle-wrapper.jar', ':app:createBundleVideotestJsAndAssets', '--rerun', ':app:assembleVideotest',
    '-PreactNativeArchitectures=arm64-v8a', '--no-daemon', '--console=plain',
    '--no-build-cache', '--no-configuration-cache', '--max-workers=2', '--no-parallel'];
  return command;
}

async function main() {
  const [mode, destination] = process.argv.slice(2);
  if (process.platform !== 'win32' || process.argv.length !== 4 || mode !== '--build') {
    throw Error('Use --build and a fresh release evidence directory on Windows');
  }
  const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
  const output = realpathSync(destination);
  const inside = relative(realpathSync(join(root, 'artifacts/release-readiness')), output);
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || realpathSync('C:/doso-build') !== root) {
    throw Error('Fresh project evidence directory and verified short build path required');
  }
  writeFileSync(join(output, 'attempt.json'), JSON.stringify({ scope: 'isolated_native_video',
    startedAt: new Date().toISOString(), cloudConfigured: false, nativeAcceptance: false }), { flag: 'wx' });
  const environment = createVideoBuildEnvironment(process.env);
  const lockPath = join(root, 'artifacts/release-readiness/qa-build-active.lock');
  const lock = openSync(lockPath, 'wx');
  const result = { assessment: null, execution: null, inputDrift: null, apk: null, lockCleanup: false };
  try {
    const probe = spawnSync(join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command',
        `$o=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $p=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -ne ${process.pid} -and (${QA_COMPETING_TASK_PREDICATE}) }); @{freeMemoryKiB=[long]$o.FreePhysicalMemory; count=$p.Count}|ConvertTo-Json -Compress`],
      { env: environment, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    if (probe.status !== 0) throw Error('Resource probe failed');
    const resources = JSON.parse(probe.stdout);
    if (!Number.isSafeInteger(resources.count) || resources.count < 0 || resources.count > 10000) throw Error('Invalid resource observation');
    result.assessment = assessBuildResources({ freeMemoryKiB: resources.freeMemoryKiB, environment,
      competingProcesses: Array.from({ length: resources.count }, () => ({})) });
    writeFileSync(join(output, 'preflight.json'), JSON.stringify(result.assessment, null, 2), { flag: 'wx' });
    if (!result.assessment.ready) throw Error(`Preflight blocked: ${result.assessment.blockers.join(',')}`);
    const before = snapshotQaBuildInputs(root, environment.DOSO_SDK_ROOT);
    writeFileSync(join(output, 'inputs-before.json'), JSON.stringify(before), { flag: 'wx' });
    const execution = await executeQaBuild(videoBuildCommand(root, environment), {
      tasks: { bundle: ':app:createBundleVideotestJsAndAssets', assemble: ':app:assembleVideotest' },
    });
    result.execution = execution;
    const after = snapshotQaBuildInputs(root, environment.DOSO_SDK_ROOT);
    writeFileSync(join(output, 'inputs-after.json'), JSON.stringify(after), { flag: 'wx' });
    result.inputDrift = JSON.stringify(before) !== JSON.stringify(after);
    if (!result.inputDrift && execution.outcome === 'completed' && execution.started
        && execution.exitCode === 0 && execution.bundleExecuted && execution.assembleCompleted && execution.buildSuccessful) {
      const path = join(root, 'android/app/build/outputs/apk/videotest/app-videotest.apk');
      const bytes = readFileSync(path);
      result.apk = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  } finally {
    try {
      const owned = fstatSync(lock), current = lstatSync(lockPath);
      if (owned.ino !== current.ino || owned.dev !== current.dev || !current.isFile()) throw Error('Build lock changed');
      unlinkSync(lockPath);
      result.lockCleanup = true;
    } finally {
      closeSync(lock);
      writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
    }
  }
  console.log(JSON.stringify(result));
  if (!result.apk || !result.lockCleanup) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
