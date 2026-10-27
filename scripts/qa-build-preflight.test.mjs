import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const publicEnvironment = {
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_SUPABASE_URL: 'https://vchvqfdlkomlrjenkdhj.supabase.co',
  EXPO_PUBLIC_SUPABASE_URL_ANDROID: 'https://vchvqfdlkomlrjenkdhj.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_CANARY',
};

test('insufficient memory blocks build readiness without exposing environment values', async () => {
  const { assessQaBuildReadiness } = await import('./qa-build-preflight.mjs');
  const result = assessQaBuildReadiness({
    freeMemoryKiB: 2464452,
    competingProcesses: [],
    environment: {
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_SUPABASE_URL: 'https://vchvqfdlkomlrjenkdhj.supabase.co',
      EXPO_PUBLIC_SUPABASE_URL_ANDROID: 'https://vchvqfdlkomlrjenkdhj.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_CANARY',
      SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_CANARY',
    },
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ['insufficient_memory']);
  assert.doesNotMatch(JSON.stringify(result), /CANARY|sb_publishable_/);
  assert.equal(result.buildStarts, 0);
});

test('missing native inputs and input links cannot yield a complete manifest', async () => {
  const { snapshotQaBuildInputs } = await import('./qa-build-preflight.mjs');
  const empty = mkdtempSync(join(tmpdir(), 'doso-qa-preflight-empty-'));
  assert.throws(() => snapshotQaBuildInputs(empty), /required_input_missing/);
  const root = mkdtempSync(join(tmpdir(), 'doso-qa-preflight-link-'));
  for (const name of ['App.tsx', 'index.ts', 'app.json', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    writeFileSync(join(root, name), 'synthetic');
  }
  for (const name of ['src', 'assets', 'plugins', 'android']) mkdirSync(join(root, name));
  const outside = mkdtempSync(join(tmpdir(), 'doso-qa-preflight-outside-'));
  symlinkSync(outside, join(root, 'src/unsafe-link'), 'junction');
  assert.throws(() => snapshotQaBuildInputs(root), /unsafe_input_link/);
});

test('unknown resource observations fail closed instead of coercing values', async () => {
  const { assessQaBuildReadiness } = await import('./qa-build-preflight.mjs');
  for (const freeMemoryKiB of [null, undefined, NaN, Infinity, '8388608', -1, 4194303]) {
    assert.equal(assessQaBuildReadiness({ freeMemoryKiB, environment: publicEnvironment,
      competingProcesses: [] }).ready, false);
  }
});

test('real CLI rejects build and unknown arguments without a resource probe or value echo', () => {
  const script = fileURLToPath(new URL('./qa-build-preflight.mjs', import.meta.url));
  for (const args of [[], ['--build'], ['--report-dir'], ['--unknown'], ['--report-dir', 'absent', '--build']]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 3000, windowsHide: true,
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_CLI_CANARY' },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no build started/);
    assert.doesNotMatch(result.stderr, /CANARY|supabase|sb_publishable_/i);
  }
});

test('actual PowerShell filter detects QEMU by name without emulator command text', { skip: process.platform !== 'win32' }, async () => {
  const { QA_COMPETING_TASK_PREDICATE } = await import('./qa-build-preflight.mjs');
  const script = `@(
    [pscustomobject]@{Id=1;Name='qemu-system-x86_64.exe';CommandLine='-avd DOSO_API_35 -port 5556'}
    [pscustomobject]@{Id=2;Name='emulator.exe';CommandLine='-avd DOSO_API_35'}
    [pscustomobject]@{Id=3;Name='java.exe';CommandLine='GradleWrapperMain :app:assembleQa'}
    [pscustomobject]@{Id=4;Name='node.exe';CommandLine='metro start'}
    [pscustomobject]@{Id=5;Name='node.exe';CommandLine='unrelated-server.mjs'}
    [pscustomobject]@{Id=6;Name='explorer.exe';CommandLine='desktop'}
  ) | Where-Object { ${QA_COMPETING_TASK_PREDICATE} } | Select-Object -ExpandProperty Id | ConvertTo-Json -Compress`;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  assert.deepEqual(JSON.parse(output), [1, 2, 3, 4]);
});

test('manifest includes ignored native inputs, omits private files and outputs, and detects content drift', async () => {
  const { snapshotQaBuildInputs } = await import('./qa-build-preflight.mjs');
  const root = mkdtempSync(join(tmpdir(), 'doso-qa-preflight-'));
  for (const folder of ['src', 'assets', 'plugins', 'android/app/build', 'android/.gradle',
    'modules/brainstem-grpc/android/src', 'modules/brainstem-grpc/android/build']) {
    mkdirSync(join(root, folder), { recursive: true });
  }
  const files = {
    'App.tsx': 'app', 'index.ts': 'entry', 'app.json': '{}', 'package.json': '{}',
    'package-lock.json': '{}', 'tsconfig.json': '{}',
    'src/example.ts': 'first', 'assets/example.png': 'synthetic pixels',
    'plugins/example.gradle': 'plugin', 'android/app/build.gradle': 'native',
    'android/app/build/output.apk': 'output', 'android/.gradle/cache': 'cache',
    'android/app/debug.keystore': 'PRIVATE_CANARY', '.env.local': 'PRIVATE_CANARY',
    'android/local.properties': 'PRIVATE_CANARY',
    'modules/brainstem-grpc/expo-module.config.json': '{}',
    'modules/brainstem-grpc/android/build.gradle': 'grpc-native',
    'modules/brainstem-grpc/android/src/Status.java': 'native-input',
    'modules/brainstem-grpc/android/build/output.jar': 'generated',
    'modules/brainstem-grpc/android/client.key': 'PRIVATE_CANARY',
  };
  for (const [path, value] of Object.entries(files)) writeFileSync(join(root, path), value);
  const before = snapshotQaBuildInputs(root);
  assert.equal(before.some(row => row.path === 'android/app/build.gradle'), true);
  assert.equal(before.some(row => row.path === 'src/example.ts'), true);
  assert.equal(before.some(row => row.path === 'modules/brainstem-grpc/android/src/Status.java'), true);
  assert.equal(before.some(row => row.path === 'modules/brainstem-grpc/android/build.gradle'), true);
  assert.equal(before.some(row => row.path === 'modules/brainstem-grpc/expo-module.config.json'), true);
  assert.equal(before.some(row => /output\.jar|client\.key/.test(row.path)), false);
  assert.equal(before.some(row => /keystore|\.env|local\.properties|cache|output\.apk/.test(row.path)), false);
  writeFileSync(join(root, 'src/example.ts'), 'second');
  const after = snapshotQaBuildInputs(root);
  assert.notDeepEqual(after, before);
  assert.doesNotMatch(JSON.stringify(before), /PRIVATE_CANARY/);
  // Synthetic fixture retained in the OS temp directory; no recursive deletion.
});

test('missing configuration, dotenv loading and competing tasks fail closed', async () => {
  const { assessQaBuildReadiness } = await import('./qa-build-preflight.mjs');
  for (const environment of [{}, { ...publicEnvironment, EXPO_NO_DOTENV: '0' },
    { ...publicEnvironment, EXPO_PUBLIC_SUPABASE_URL_ANDROID: 'http://localhost:8000' },
    { ...publicEnvironment, EXPO_PUBLIC_DESIGN_QA: '1' }]) {
    const result = assessQaBuildReadiness({ freeMemoryKiB: 8388608, environment,
      competingProcesses: [] });
    assert.equal(result.ready, false);
    assert.doesNotMatch(JSON.stringify(result), /CANARY|sb_publishable_/);
  }
  assert.equal(assessQaBuildReadiness({ freeMemoryKiB: 8388608, environment: publicEnvironment,
    competingProcesses: [{ processId: 42, name: 'java.exe' }] }).ready, false);
  assert.equal(assessQaBuildReadiness({ freeMemoryKiB: 8388608, environment: publicEnvironment,
    competingProcesses: null }).ready, false);
  assert.equal(assessQaBuildReadiness({ freeMemoryKiB: 4194304, environment: publicEnvironment,
    competingProcesses: [] }).ready, true);
});
