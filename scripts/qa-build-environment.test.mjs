import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const configuration = { publishableKey: 'sb_publishable_SYNTHETIC_CANARY' };
function hostFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doso-qa-env-'));
  const host = { SystemRoot: join(root, 'Windows'), JAVA_HOME: join(root, 'java'),
    ANDROID_HOME: join(root, 'android'), TEMP: join(root, 'temp'), TMP: join(root, 'temp'),
    PATH: 'UNTRUSTED_PARENT_PATH', NODE_OPTIONS: '--require PRIVATE_CANARY',
    SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_CANARY', DOSO_ANDROID_KEYSTORE_PASSWORD: 'PRIVATE_CANARY' };
  for (const path of [host.SystemRoot, join(host.SystemRoot, 'System32'), host.JAVA_HOME,
    join(host.JAVA_HOME, 'bin'), host.ANDROID_HOME, join(host.ANDROID_HOME, 'platform-tools'), host.TEMP]) {
    mkdirSync(path, { recursive: true });
  }
  writeFileSync(join(host.SystemRoot, 'System32/cmd.exe'), 'synthetic');
  return host;
}

function rustHostFixture() {
  const host = hostFixture();
  const root = host.TEMP;
  Object.assign(host, { DOSO_SDK_ROOT: join(root, 'sdk'), CARGO_HOME: join(root, 'cargo'),
    RUSTUP_HOME: join(root, 'rustup'), PROTOC: join(root, 'protoc.exe') });
  for (const path of [join(host.DOSO_SDK_ROOT, 'android'), join(host.CARGO_HOME, 'bin'), host.RUSTUP_HOME]) {
    mkdirSync(path, { recursive: true });
  }
  for (const path of [host.PROTOC, join(host.CARGO_HOME, 'bin/cargo.exe'), join(host.CARGO_HOME, 'bin/rustup.exe'),
    join(host.DOSO_SDK_ROOT, 'Cargo.toml'), join(host.DOSO_SDK_ROOT, 'android/Cargo.toml'),
    join(host.DOSO_SDK_ROOT, 'android/build.ps1')]) writeFileSync(path, 'synthetic');
  return host;
}

test('QA child environment includes only fixed public configuration and trusted tool paths', async () => {
  const { createQaBuildEnvironment } = await import('./qa-build-environment.mjs');
  const host = hostFixture();
  const env = createQaBuildEnvironment(host, configuration);
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.ENTRY_FILE, 'index.ts');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, 'https://api-test.dosorobotics.com');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL_ANDROID, env.EXPO_PUBLIC_SUPABASE_URL);
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, configuration.publishableKey);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.DOSO_ANDROID_KEYSTORE_PASSWORD, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.doesNotMatch(env.PATH, /UNTRUSTED|CANARY/);
});

test('isolated video environment preserves toolchain isolation without cloud configuration', async () => {
  const { createVideoBuildEnvironment } = await import('./android-video-test.mjs');
  const env = createVideoBuildEnvironment(hostFixture());
  assert.equal(env.ENTRY_FILE, 'index.video-test.ts');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(Object.keys(env).some(key => /SUPABASE|SECRET|PASSWORD|TOKEN|NODE_OPTIONS/.test(key)), false);
});

test('normal-entry local environment excludes cloud configuration and inherited feature flags', async () => {
  const { createLocalBuildEnvironment } = await import('./android-local-test.mjs');
  const host = hostFixture();
  Object.defineProperty(host, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', {
    enumerable: true, get() { throw new Error('inherited account configuration read'); },
  });
  const env = createLocalBuildEnvironment(host);
  assert.equal(env.ENTRY_FILE, 'index.ts');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(Object.keys(env).some(key => /SUPABASE|SECRET|PASSWORD|TOKEN|NODE_OPTIONS/.test(key)), false);
  assert.equal(env.EXPO_PUBLIC_DESIGN_QA, '0');
  assert.equal(env.EXPO_PUBLIC_BRAINSTEM_SIMULATION, '0');
});

test('Rust point-cloud builds receive only explicitly verified SDK and compiler paths', async () => {
  const { createToolchainBuildEnvironment } = await import('./qa-build-environment.mjs');
  const host = rustHostFixture();
  const env = createToolchainBuildEnvironment(host);
  for (const key of ['DOSO_SDK_ROOT', 'CARGO_HOME', 'RUSTUP_HOME', 'PROTOC']) assert.equal(env[key], host[key]);
  assert.equal(env.CARGO_BUILD_JOBS, '2');
  assert.ok(env.PATH.split(process.platform === 'win32' ? ';' : ':').includes(join(host.CARGO_HOME, 'bin')));
  assert.match(env.PATH, /WindowsPowerShell/);
  assert.equal(env.USERPROFILE, undefined);
  assert.equal(env.PATH.includes('UNTRUSTED_PARENT_PATH'), false);
  assert.equal(env.DOSO_ANDROID_KEYSTORE_PASSWORD, undefined);
});

test('partial, ambiguous or invalid Rust configuration is rejected without exposing its values', async () => {
  const { createToolchainBuildEnvironment } = await import('./qa-build-environment.mjs');
  for (const change of [
    { CARGO_HOME: undefined }, { RUSTUP_HOME: 'relative-CANARY' }, { PROTOC: 'PRIVATE_CANARY' },
    { DOSO_SDK_ROOT: 'relative-CANARY' }, { doso_sdk_root: 'ambiguous-CANARY' },
  ]) {
    assert.throws(() => createToolchainBuildEnvironment({ ...rustHostFixture(), ...change }), error => {
      assert.equal(error.message, 'qa_rust_toolchain_environment_rejected');
      assert.doesNotMatch(error.stack, /CANARY/);
      return true;
    });
  }
});

test('invalid, foreign, secret or extra configuration is rejected without value-bearing errors', async () => {
  const { createQaBuildEnvironment } = await import('./qa-build-environment.mjs');
  const host = hostFixture();
  for (const input of [null, [], {}, { ...configuration, projectId: 'foreign' },
    { ...configuration, publishableKey: 'sb_secret_PRIVATE_CANARY' },
    { ...configuration, publishableKey: 'sb_publishable_MASKED...' },
    { ...configuration, publishableKey: `${configuration.publishableKey}\nOTHER` },
    { ...configuration, unusedSecret: 'PRIVATE_CANARY' }]) {
    assert.throws(() => createQaBuildEnvironment(host, input), error => {
      assert.equal(error.message, 'qa_public_configuration_rejected');
      assert.doesNotMatch(error.stack, /CANARY|sb_secret/);
      return true;
    });
  }
});

test('unsafe inherited variables and case-ambiguous or nonexistent toolchain paths cannot enter the child', async () => {
  const { createQaBuildEnvironment } = await import('./qa-build-environment.mjs');
  const host = hostFixture();
  // Windows crypto initialization needs the actual OS root, not our fake folder.
  // Only this non-secret path is read; the fixture never writes into the OS root.
  if (process.platform === 'win32') host.SystemRoot = process.env.SystemRoot;
  Object.defineProperty(host, 'DATABASE_URL', { enumerable: true,
    get() { throw new Error('unapproved environment value read'); } });
  const env = createQaBuildEnvironment(host, configuration);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.EXPO_PUBLIC_DESIGN_QA, '0');
  assert.equal(env.EXPO_PUBLIC_BRAINSTEM_SIMULATION, '0');
  const text = execFileSync(process.execPath, ['-e',
    'console.log(JSON.stringify({secretPresent:Object.keys(process.env).some(k=>/SECRET|PASSWORD|TOKEN|DATABASE_URL|NODE_OPTIONS/.test(k)),dotenvDisabled:process.env.EXPO_NO_DOTENV==="1",normalEntry:process.env.ENTRY_FILE==="index.ts"}))'],
  { env, encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.deepEqual(JSON.parse(text), { secretPresent: false, dotenvDisabled: true, normalEntry: true });
  assert.doesNotMatch(text, /CANARY|sb_publishable_/);
  assert.throws(() => createQaBuildEnvironment({ ...hostFixture(), java_home: host.JAVA_HOME }, configuration),
    /qa_toolchain_environment_rejected/);
  assert.throws(() => createQaBuildEnvironment({ ...hostFixture(), JAVA_HOME: 'relative-path' }, configuration),
    /qa_toolchain_environment_rejected/);
  assert.throws(() => createQaBuildEnvironment({ ...hostFixture(), JAVA_HOME: join(host.TEMP, 'absent') }, configuration),
    /qa_toolchain_environment_rejected/);
});

test('no-echo input protocol accepts one bounded complete token and rejects controls or extra lines', async () => {
  const { parseQaPublishableInput } = await import('./qa-build-environment.mjs');
  assert.deepEqual(parseQaPublishableInput(`${configuration.publishableKey}\n`), configuration);
  assert.deepEqual(parseQaPublishableInput(`${configuration.publishableKey}\r\n`), configuration);
  assert.deepEqual(parseQaPublishableInput(`${configuration.publishableKey}\r`), configuration);
  for (const input of ['', configuration.publishableKey, `${configuration.publishableKey}\nextra\n`,
    `${configuration.publishableKey}\n\n`, ` ${configuration.publishableKey}\n`,
    `sb_publishable_${'x'.repeat(300)}\n`, `${configuration.publishableKey}\u0003\n`, 'sb_secret_PRIVATE_CANARY\n']) {
    assert.throws(() => parseQaPublishableInput(input), /qa_public_configuration_rejected/);
  }
});

test('CLI rejects non-TTY input and unsupported actions without echoing input or inherited credentials', () => {
  const script = fileURLToPath(new URL('./qa-build-environment.mjs', import.meta.url));
  for (const args of [[], ['--build'], ['--probe', 'extra'], ['--probe']]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      input: `${configuration.publishableKey}\n`, encoding: 'utf8', timeout: 3000, windowsHide: true,
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_CANARY' },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no build started/);
    assert.doesNotMatch(result.stderr, /CANARY|sb_publishable_|PRIVATE/);
  }
});
