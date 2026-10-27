import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, statSync, lstatSync, fstatSync, realpathSync, existsSync } from 'node:fs';
import { join, dirname, relative, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createQaBuildEnvironment, parseQaPublishableInput } from './qa-build-environment.mjs';
import { assessQaBuildReadiness, snapshotQaBuildInputs, QA_COMPETING_TASK_PREDICATE } from './qa-build-preflight.mjs';

const RETAINED = 'releases/20261016/DOSO-0.0.1-qa-f3135f77.apk';
const RETAINED_SHA = 'f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e';
const OUTPUT = 'android/app/build/outputs/apk/qa/app-qa.apk';

export function createQaProgressScanner() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const proof = { bundleExecuted: false, assembleCompleted: false, buildSuccessful: false, rejected: false };
  let pending = '';
  const consume = (text) => {
    for (const character of text) {
      if (character === '\n') {
        const line = pending.endsWith('\r') ? pending.slice(0, -1) : pending;
        if (line === '> Task :app:createBundleQaJsAndAssets') proof.bundleExecuted = true;
        if (/^> Task :app:assembleQa(?: UP-TO-DATE)?$/.test(line)) proof.assembleCompleted = true;
        if (/^BUILD SUCCESSFUL in [0-9hms .]+$/.test(line)) proof.buildSuccessful = true;
        pending = '';
      } else {
        if (pending.length >= 2048) { proof.rejected = true; pending = ''; return; }
        pending += character;
      }
    }
  };
  return {
    push(chunk) {
      if (proof.rejected) return;
      if (!Buffer.isBuffer(chunk) || chunk.length > 65536) { proof.rejected = true; return; }
      try { consume(decoder.decode(chunk, { stream: true })); } catch { proof.rejected = true; pending = ''; }
    },
    finish() {
      if (!proof.rejected) {
        try { consume(decoder.decode()); } catch { proof.rejected = true; }
      }
      pending = '';
      return { ...proof };
    },
    get rejected() { return proof.rejected; },
  };
}

export async function executeQaBuild(command, { timeoutMs = 20 * 60 * 1000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 20 * 60 * 1000) throw new Error('qa_timeout_rejected');
  const stdout = createQaProgressScanner();
  const stderr = createQaProgressScanner();
  return await new Promise((resolve) => {
    let child;
    let started = false;
    let stopping = null;
    let treeTerminationAccepted = false;
    let timer;
    let fallback;
    let finished = false;
    const finish = (outcome, exitCode, closed = true) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(fallback);
      process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted);
      const a = stdout.finish(); const b = stderr.finish();
      if (!closed && child) { child.stdout?.destroy(); child.stderr?.destroy(); child.unref(); }
      resolve({ started, outcome: a.rejected || b.rejected ? 'output_rejected' : outcome,
        exitCode: stopping ? null : exitCode,
        bundleExecuted: a.bundleExecuted || b.bundleExecuted,
        assembleCompleted: a.assembleCompleted || b.assembleCompleted,
        buildSuccessful: a.buildSuccessful || b.buildSuccessful,
        cleanup: stopping ? (closed && treeTerminationAccepted ? 'terminated' : 'unconfirmed') : 'not_needed' });
    };
    const stop = (reason) => {
      if (finished || stopping) return;
      stopping = reason;
      if (child && Number.isSafeInteger(child.pid) && child.pid > 0 && child.exitCode === null) {
        try {
          if (process.platform === 'win32') {
            const kill = spawnSync(join(command.options.env.SystemRoot, 'System32/taskkill.exe'),
              ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true,
                env: command.options.env, stdio: 'ignore', timeout: 5000 });
            treeTerminationAccepted = !kill.error && kill.status === 0;
          } else treeTerminationAccepted = child.kill('SIGKILL');
        } catch { /* Preserve the primary outcome; cleanup cannot be assumed. */ }
      }
      fallback = setTimeout(() => finish(reason, null, false), 5000);
    };
    const interrupted = () => stop('interrupted');
    try { child = spawn(command.file, command.args, command.options); }
    catch { finish('start_failed', null); return; }
    child.once('spawn', () => { started = true; });
    child.once('error', () => finish(started ? 'nonzero_exit' : 'start_failed', null));
    child.stdout.on('data', (chunk) => { stdout.push(chunk); if (stdout.rejected) stop('output_rejected'); });
    child.stderr.on('data', (chunk) => { stderr.push(chunk); if (stderr.rejected) stop('output_rejected'); });
    child.once('close', (code) => finish(stopping ?? (code === 0 ? 'completed' : 'nonzero_exit'),
      Number.isInteger(code) ? code : null));
    process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
    timer = setTimeout(() => stop('timeout'), timeoutMs);
  });
}
function identity(root, path) {
  try {
    const stat = lstatSync(join(root, path));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    const bytes = readFileSync(join(root, path));
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) { if (error?.code === 'ENOENT') return null; throw new Error('qa_artifact_identity_failed'); }
}

export function createQaBuildCommand(root, environment, workingDirectory = join(root, 'android')) {
  const file = join(environment.JAVA_HOME, 'bin/java.exe');
  if (realpathSync(workingDirectory) !== realpathSync(join(root, 'android')) ||
      !statSync(file).isFile() || !statSync(join(workingDirectory, 'gradle/wrapper/gradle-wrapper.jar')).isFile()) {
    throw new Error('qa_build_command_rejected');
  }
  return { file, args: ['-Xmx64m', '-Xms64m', '-Dorg.gradle.appname=gradlew', '-jar',
    'gradle/wrapper/gradle-wrapper.jar', ':app:createBundleQaJsAndAssets', '--rerun', ':app:assembleQa',
    '-PreactNativeArchitectures=arm64-v8a,x86_64', '--no-daemon', '--console=plain',
    '--no-build-cache', '--no-configuration-cache', '--max-workers=2', '--no-parallel'],
  options: { cwd: workingDirectory, env: environment, shell: false, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] } };
}

function validExecution(value) {
  return value && Object.keys(value).sort().join(',') ===
    'assembleCompleted,buildSuccessful,bundleExecuted,cleanup,exitCode,outcome,started' &&
    ['started', 'bundleExecuted', 'assembleCompleted', 'buildSuccessful'].every(key => typeof value[key] === 'boolean') &&
    ['completed', 'nonzero_exit', 'start_failed', 'timeout', 'output_rejected', 'interrupted'].includes(value.outcome) &&
    ['not_needed', 'terminated', 'unconfirmed'].includes(value.cleanup) &&
    (value.exitCode === null || (Number.isInteger(value.exitCode) && value.exitCode >= -2147483648 && value.exitCode <= 2147483647));
}

// The CLI will supply the real OS/process boundaries; tests substitute only those boundaries.
export async function runQaBuildAttempt({ root, reportDir, host, configuration, observeResources, executeBuild, workingDirectory }) {
  try {
    writeFileSync(join(reportDir, 'attempt.json'), JSON.stringify({ startedAt: new Date().toISOString(),
      scope: 'one_qa_build_attempt', nativeAcceptance: false }), { flag: 'wx' });
  } catch (error) { throw new Error(error?.code === 'EEXIST' ? 'qa_attempt_already_exists' : 'qa_attempt_init_failed'); }
  const lockPath = join(root, 'artifacts/release-readiness/qa-build-active.lock');
  let lock;
  let phase = 'lock';
  const result = { decision: 'setup_failed', buildStarts: 0, spawnAttempts: 0,
    assessment: null, inputDrift: null, inputs: null, execution: null, candidate: null,
    retainedApkUnchanged: null, lockCleanup: 'not_owned', metadataAcceptance: false, nativeAcceptance: false };
  try {
    try { lock = openSync(lockPath, 'wx'); }
    catch { throw new Error('qa_build_lock_unavailable'); }
    phase = 'environment';
    const environment = createQaBuildEnvironment(host, configuration);
    phase = 'inputs';
    const inputs = snapshotQaBuildInputs(root);
    result.inputs = inputs;
    phase = 'resource_observation';
    const assessment = assessQaBuildReadiness({ ...await observeResources(environment), environment });
    result.assessment = assessment;
    result.decision = 'preflight_stopped';
    if (assessment.ready) {
      phase = 'artifact_before';
      const retained = identity(root, RETAINED);
      if (retained?.sha256 !== RETAINED_SHA || retained.bytes !== 77340265) throw new Error();
      const prior = identity(root, OUTPUT);
      phase = 'command';
      const command = createQaBuildCommand(root, environment, workingDirectory);
      phase = 'execution';
      result.spawnAttempts = 1;
      const execution = await executeBuild(command);
      if (!validExecution(execution)) throw new Error();
      result.execution = execution;
      result.buildStarts = execution.started ? 1 : 0;
      result.decision = 'build_failed';
      phase = 'artifact_after';
      const retainedAfter = identity(root, RETAINED);
      result.retainedApkUnchanged = JSON.stringify(retained) === JSON.stringify(retainedAfter);
      const candidate = identity(root, OUTPUT);
      if (execution.outcome === 'completed' && execution.started && execution.exitCode === 0 &&
          execution.bundleExecuted && execution.assembleCompleted && execution.buildSuccessful &&
          execution.cleanup === 'not_needed' && result.retainedApkUnchanged && candidate?.bytes > 0 &&
          candidate.sha256 !== prior?.sha256 && candidate.sha256 !== retained.sha256) {
        result.decision = 'candidate_pending_metadata';
        result.candidate = candidate;
      } else if (execution.outcome === 'completed' && execution.exitCode === 0) result.decision = 'candidate_unproven';
    }
    phase = 'inputs_after';
    const after = snapshotQaBuildInputs(root);
    result.inputDrift = JSON.stringify(inputs) === JSON.stringify(after) ? 0 : 1;
    if (result.inputDrift) { result.decision = 'input_changed'; result.candidate = null; }
  } catch {
    if (phase === 'execution' && result.execution === null) result.buildStarts = null;
    result.failurePhase = phase;
    result.decision = 'attempt_failed';
    result.candidate = null;
  } finally {
    if (lock !== undefined) {
      try {
        const owned = fstatSync(lock);
        const current = lstatSync(lockPath);
        if (!current.isFile() || current.isSymbolicLink() || current.dev !== owned.dev ||
            current.ino !== owned.ino || current.size !== 0 || current.mtimeMs !== owned.mtimeMs) throw new Error();
        unlinkSync(lockPath);
        result.lockCleanup = 'succeeded';
      } catch { result.lockCleanup = 'unconfirmed'; }
      try { closeSync(lock); } catch { result.lockCleanup = 'unconfirmed'; }
    }
  }
  if (result.lockCleanup === 'unconfirmed') {
    result.primaryDecision = result.decision;
    result.decision = 'cleanup_unconfirmed';
    result.candidate = null;
  }
  writeFileSync(join(reportDir, 'build-result.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return result;
}

function observeResources(environment) {
  try {
    const observed = spawnSync(join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command',
        `$os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $tasks=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { ${QA_COMPETING_TASK_PREDICATE} }); @{freeMemoryKiB=[long]$os.FreePhysicalMemory; competingTaskCount=$tasks.Count} | ConvertTo-Json -Compress`],
      { env: environment, shell: false, encoding: 'utf8', windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, maxBuffer: 8192 });
    if (observed.error || observed.status !== 0) throw new Error();
    const value = JSON.parse(observed.stdout);
    if (!Number.isSafeInteger(value.freeMemoryKiB) || !Number.isSafeInteger(value.competingTaskCount) ||
        value.competingTaskCount < 0 || value.competingTaskCount > 10000) throw new Error();
    return { freeMemoryKiB: value.freeMemoryKiB,
      competingProcesses: Array.from({ length: value.competingTaskCount }, () => ({})) };
  } catch { return { freeMemoryKiB: null, competingProcesses: null }; }
}

async function readBuildConfiguration() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') throw new Error();
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  const text = await new Promise((accept, reject) => {
    let input = '';
    const finish = (failed) => {
      clearTimeout(timer); process.stdin.off('data', onData);
      process.stdin.off('end', onEnd); process.stdin.off('error', onEnd); process.stdin.pause();
      if (failed) reject(new Error()); else accept(input);
    };
    const onEnd = () => finish(true);
    const onData = (chunk) => {
      // Check incoming byte budget before concatenating retained input.
      if (Buffer.byteLength(chunk, 'utf8') > 256 - Buffer.byteLength(input, 'utf8') || /[^\x20-\x7e\r\n]/.test(chunk)) return finish(true);
      input += chunk;
      if (/[\r\n]/.test(input)) finish(false);
    };
    const timer = setTimeout(() => finish(true), 45000);
    process.stdin.on('data', onData); process.stdin.once('end', onEnd); process.stdin.once('error', onEnd);
    process.stdout.write('QA_BUILD_CONFIG_INPUT_READY_NO_ECHO\n');
  });
  return parseQaPublishableInput(text);
}

let isMain = false;
try { isMain = !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* Import is not a launch. */ }
if (isMain) {
  let phase = 'arguments';
  try {
    if (process.platform !== 'win32' || process.argv.length !== 5 || process.argv[2] !== '--build' ||
        process.argv[3] !== '--report-dir') throw new Error();
    const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
    const reportDir = realpathSync(process.argv[4]);
    const reportBase = realpathSync(join(root, 'artifacts/release-readiness'));
    const reportRelative = relative(reportBase, reportDir);
    if (!reportRelative || reportRelative.startsWith('..') || isAbsolute(reportRelative) ||
        existsSync(join(reportDir, 'attempt.json')) || realpathSync('C:/doso-build') !== root) throw new Error();
    const retained = identity(root, RETAINED);
    if (retained?.sha256 !== RETAINED_SHA || retained.bytes !== 77340265) throw new Error();
    phase = 'input';
    const configuration = await readBuildConfiguration();
    phase = 'single_attempt';
    const result = await runQaBuildAttempt({ root, reportDir, host: process.env, configuration,
      observeResources, executeBuild: executeQaBuild, workingDirectory: 'C:/doso-build/android' });
    console.log(JSON.stringify({ decision: result.decision, buildStarts: result.buildStarts,
      freeMemoryKiB: result.assessment?.freeMemoryKiB ?? null, inputDrift: result.inputDrift,
      lockCleanup: result.lockCleanup, newCandidate: !!result.candidate, metadataAcceptance: false, nativeAcceptance: false }));
    process.exitCode = result.decision === 'candidate_pending_metadata' && result.candidate ? 0 : 2;
  } catch {
    console.error(`QA single build stopped at ${phase}; inspect closed result evidence, do not retry this attempt.`);
    process.exitCode = 1;
  } finally {
    try { if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false); }
    catch { console.error('QA build terminal restoration unconfirmed.'); process.exitCode = 1; }
    process.stdin.pause();
  }
}
