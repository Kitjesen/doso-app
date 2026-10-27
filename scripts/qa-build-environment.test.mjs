import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const configuration = { projectId: 'vchvqfdlkomlrjenkdhj', publishableKey: 'sb_publishable_SYNTHETIC_CANARY' };
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

test('QA child environment includes only fixed public configuration and trusted tool paths', async () => {
  const { createQaBuildEnvironment } = await import('./qa-build-environment.mjs');
  const host = hostFixture();
  const env = createQaBuildEnvironment(host, configuration);
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.ENTRY_FILE, 'index.ts');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, 'https://vchvqfdlkomlrjenkdhj.supabase.co');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL_ANDROID, env.EXPO_PUBLIC_SUPABASE_URL);
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, configuration.publishableKey);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.DOSO_ANDROID_KEYSTORE_PASSWORD, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.doesNotMatch(env.PATH, /UNTRUSTED|CANARY/);
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
