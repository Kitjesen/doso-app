import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const configuration = { projectId: 'vchvqfdlkomlrjenkdhj', publishableKey: 'sb_publishable_SYNTHETIC_CANARY' };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'doso-qa-once-'));
  const host = { SystemRoot: join(dir, 'Windows'), JAVA_HOME: join(dir, 'java'),
    ANDROID_HOME: join(dir, 'android'), TEMP: join(dir, 'temp'), TMP: join(dir, 'temp') };
  for (const path of [join(host.SystemRoot, 'System32'), join(host.JAVA_HOME, 'bin'),
    join(host.ANDROID_HOME, 'platform-tools'), host.TEMP]) mkdirSync(path, { recursive: true });
  writeFileSync(join(host.SystemRoot, 'System32/cmd.exe'), 'synthetic');
  writeFileSync(join(host.JAVA_HOME, 'bin/java.exe'), 'synthetic');
  const reportDir = join(dir, 'report');
  mkdirSync(reportDir);
  return { host, reportDir };
}

function buildRootFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'doso-qa-inputs-'));
  for (const path of ['src', 'assets', 'plugins', 'android/gradle/wrapper',
    'artifacts/release-readiness', 'releases/20261016', 'android/app/build/outputs/apk/qa']) {
    mkdirSync(join(fixtureRoot, path), { recursive: true });
  }
  for (const file of ['App.tsx', 'index.ts', 'app.json', 'package.json', 'package-lock.json', 'tsconfig.json',
    'android/gradle/wrapper/gradle-wrapper.jar']) writeFileSync(join(fixtureRoot, file), 'synthetic');
  copyFileSync(join(root, 'releases/20261016/DOSO-0.0.1-qa-f3135f77.apk'),
    join(fixtureRoot, 'releases/20261016/DOSO-0.0.1-qa-f3135f77.apk'));
  writeFileSync(join(fixtureRoot, 'android/app/build/outputs/apk/qa/app-qa.apk'), 'synthetic prior');
  return fixtureRoot;
}

const successfulExecution = { started: true, exitCode: 0, outcome: 'completed', bundleExecuted: true,
  assembleCompleted: true, buildSuccessful: true, cleanup: 'not_needed' };

test('insufficient resources persist one stopped attempt without invoking the build boundary', async () => {
  const { runQaBuildAttempt } = await import('./qa-build-once.mjs');
  const { host, reportDir } = fixture();
  let observations = 0;
  const result = await runQaBuildAttempt({ root, reportDir, host, configuration,
    observeResources: () => { observations++; return { freeMemoryKiB: 1, competingProcesses: [] }; },
    executeBuild: () => { throw new Error('must not build'); } });
  assert.equal(observations, 1);
  assert.equal(result.decision, 'preflight_stopped');
  assert.equal(result.buildStarts, 0);
  assert.equal(result.assessment.ready, false);
  assert.equal(result.inputDrift, 0);
  const saved = readFileSync(join(reportDir, 'build-result.json'), 'utf8');
  assert.doesNotMatch(saved, /CANARY|sb_publishable_|PRIVATE/);
  await assert.rejects(runQaBuildAttempt({ root, reportDir, host, configuration,
    observeResources: () => { throw new Error('must not probe twice'); }, executeBuild: () => {} }),
  /qa_attempt_already_exists/);
});

test('ready attempt invokes exactly one fixed Java QA command with isolated environment and preserves failure', async () => {
  const { runQaBuildAttempt } = await import('./qa-build-once.mjs');
  const { host, reportDir } = fixture();
  host.SUPABASE_SERVICE_ROLE_KEY = 'PRIVATE_CANARY';
  host.NODE_OPTIONS = '--require PRIVATE_CANARY';
  let launches = 0;
  const result = await runQaBuildAttempt({ root, reportDir, host, configuration,
    observeResources: () => ({ freeMemoryKiB: 5000000, competingProcesses: [] }),
    executeBuild: async (command) => {
      launches++;
      assert.equal(command.file, join(host.JAVA_HOME, 'bin/java.exe'));
      assert.deepEqual(command.args, ['-Xmx64m', '-Xms64m', '-Dorg.gradle.appname=gradlew', '-jar',
        'gradle/wrapper/gradle-wrapper.jar', ':app:createBundleQaJsAndAssets', '--rerun', ':app:assembleQa',
        '-PreactNativeArchitectures=arm64-v8a,x86_64', '--no-daemon', '--console=plain',
        '--no-build-cache', '--no-configuration-cache', '--max-workers=2', '--no-parallel']);
      assert.equal(command.options.shell, false);
      assert.equal(command.options.env.NODE_OPTIONS, undefined);
      assert.equal(command.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
      assert.equal(command.options.env.EXPO_NO_DOTENV, '1');
      assert.doesNotMatch(JSON.stringify(command.args), /CANARY|publishable/);
      return { started: true, exitCode: 37, outcome: 'nonzero_exit', bundleExecuted: false,
        assembleCompleted: false, buildSuccessful: false, cleanup: 'not_needed' };
    } });
  assert.equal(launches, 1);
  assert.equal(result.buildStarts, 1);
  assert.equal(result.decision, 'build_failed');
  assert.equal(result.execution.exitCode, 37);
  assert.equal(result.candidate, null);
  assert.doesNotMatch(readFileSync(join(reportDir, 'build-result.json'), 'utf8'), /CANARY|PRIVATE|sb_publishable_/);
});

test('progress parser survives split markers, discards arbitrary output and rejects unbounded or invalid output', async () => {
  const { createQaProgressScanner } = await import('./qa-build-once.mjs');
  const scanner = createQaProgressScanner();
  for (const text of ['PRIVATE_CANARY sb_publishable_SYNTHETIC_CANARY\n> Ta',
    'sk :app:createBundleQaJsAndAssets\r\n> Task :app:assembleQa\nBUILD SUC', 'CESSFUL in 3m 41s\n']) {
    scanner.push(Buffer.from(text));
  }
  assert.deepEqual(scanner.finish(), { bundleExecuted: true, assembleCompleted: true,
    buildSuccessful: true, rejected: false });
  assert.doesNotMatch(JSON.stringify(scanner), /CANARY|PRIVATE|publishable/);
  for (const chunks of [[Buffer.from('> Task :app:createBundleQaJsAndAssets UP-TO-DATE\n')],
    [Buffer.from('x'.repeat(2049))], [Buffer.from([0xff])]]) {
    const candidate = createQaProgressScanner();
    for (const chunk of chunks) candidate.push(chunk);
    const proof = candidate.finish();
    assert.equal(proof.bundleExecuted, false);
    if (chunks[0].length < 2049 && chunks[0][0] === 0x3e) assert.equal(proof.rejected, false);
    else assert.equal(proof.rejected, true);
  }
});

test('real local process preserves exit status, hides arbitrary output and bounds timeout cleanup', async () => {
  const { executeQaBuild } = await import('./qa-build-once.mjs');
  const command = (code) => ({ file: process.execPath, args: ['-e', code], options: {
    shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
  } });
  for (const exit of [0, 37]) {
    const result = await executeQaBuild(command(`console.log('PRIVATE_CANARY');
      console.log('> Task :app:createBundleQaJsAndAssets'); console.log('> Task :app:assembleQa');
      console.log('BUILD SUCCESSFUL in 1s'); process.exit(${exit});`), { timeoutMs: 3000 });
    assert.equal(result.exitCode, exit);
    assert.equal(result.outcome, exit === 0 ? 'completed' : 'nonzero_exit');
    assert.equal(result.started, true);
    assert.equal(result.bundleExecuted, true);
    assert.equal(result.buildSuccessful, true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|CANARY/);
  }
  const timeout = await executeQaBuild(command('setInterval(()=>{},1000)'), { timeoutMs: 250 });
  assert.equal(timeout.outcome, 'timeout');
  assert.equal(timeout.cleanup, 'terminated');
  assert.equal(timeout.exitCode, null);
  const absent = await executeQaBuild({ ...command(''), file: join(tmpdir(), 'doso-nonexistent-executable.exe') }, { timeoutMs: 3000 });
  assert.equal(absent.outcome, 'start_failed');
  assert.equal(absent.started, false);
  assert.equal(absent.exitCode, null);
});

test('successful candidate requires changed output, frozen old APK and unchanged inputs; metadata is never implied', async () => {
  const { runQaBuildAttempt } = await import('./qa-build-once.mjs');
  const fixtureRoot = buildRootFixture();
  for (const scenario of ['unchanged_output', 'fresh_output', 'input_changed', 'wrong_retained']) {
    const { host, reportDir } = fixture();
    let launches = 0;
    if (scenario === 'wrong_retained') writeFileSync(join(fixtureRoot, 'releases/20261016/DOSO-0.0.1-qa-f3135f77.apk'), 'wrong');
    const result = await runQaBuildAttempt({ root: fixtureRoot, reportDir, host, configuration,
      observeResources: () => ({ freeMemoryKiB: 5000000, competingProcesses: [] }),
      executeBuild: () => {
        launches++;
        if (scenario !== 'unchanged_output') writeFileSync(join(fixtureRoot, 'android/app/build/outputs/apk/qa/app-qa.apk'), scenario);
        if (scenario === 'input_changed') writeFileSync(join(fixtureRoot, 'src/changed.ts'), 'changed');
        return successfulExecution;
      } });
    assert.equal(result.metadataAcceptance, false);
    assert.equal(result.nativeAcceptance, false);
    if (scenario === 'fresh_output') {
      assert.equal(result.decision, 'candidate_pending_metadata');
      assert.ok(result.candidate.bytes > 0);
    } else {
      assert.equal(result.candidate, null);
      assert.equal(result.decision, scenario === 'wrong_retained' ? 'attempt_failed' :
        scenario === 'input_changed' ? 'input_changed' : 'candidate_unproven');
    }
    assert.equal(launches, scenario === 'wrong_retained' ? 0 : 1);
  }
});

test('lock ownership and cleanup failures preserve primary outcome without deleting changed lock content', async () => {
  const { runQaBuildAttempt } = await import('./qa-build-once.mjs');
  const fixtureRoot = buildRootFixture();
  const { host, reportDir } = fixture();
  const lock = join(fixtureRoot, 'artifacts/release-readiness/qa-build-active.lock');
  const result = await runQaBuildAttempt({ root: fixtureRoot, reportDir, host, configuration,
    observeResources: () => ({ freeMemoryKiB: 5000000, competingProcesses: [] }),
    executeBuild: () => {
      writeFileSync(lock, 'changed-by-external-actor');
      writeFileSync(join(fixtureRoot, 'android/app/build/outputs/apk/qa/app-qa.apk'), 'new synthetic candidate');
      return successfulExecution;
    } });
  assert.equal(result.decision, 'cleanup_unconfirmed');
  assert.equal(result.primaryDecision, 'candidate_pending_metadata');
  assert.equal(result.lockCleanup, 'unconfirmed');
  assert.equal(result.candidate, null);
  assert.equal(readFileSync(lock, 'utf8'), 'changed-by-external-actor');
  const next = fixture();
  let observations = 0;
  const blocked = await runQaBuildAttempt({ root: fixtureRoot, ...next, configuration,
    observeResources: () => { observations++; return {}; }, executeBuild: () => {} });
  assert.equal(observations, 0);
  assert.equal(blocked.failurePhase, 'lock');
  assert.equal(blocked.lockCleanup, 'not_owned');
  assert.equal(readFileSync(lock, 'utf8'), 'changed-by-external-actor');
});

test('CLI rejects pipes, unknown actions and report escape without resource/build side effects', t => {
  const script = fileURLToPath(new URL('./qa-build-once.mjs', import.meta.url));
  const report = mkdtempSync(join(root, 'artifacts/release-readiness/qa-cli-reject-'));
  // Only remove this test-owned empty directory; unexpected evidence remains for diagnosis.
  t.after(() => rmdirSync(report));
  for (const args of [[], ['--build'], ['--probe'], ['--build', '--report-dir', tmpdir()],
    ['--build', '--report-dir', report]]) {
    const output = spawnSync(process.execPath, [script, ...args], {
      input: `${configuration.publishableKey}\r`, encoding: 'utf8', timeout: 5000, windowsHide: true,
    });
    assert.equal(output.status, 1);
    assert.equal(output.stdout, '');
    assert.doesNotMatch(output.stderr, /CANARY|PRIVATE|publishable/);
  }
  assert.equal(existsSync(join(report, 'attempt.json')), false);
});
