import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ignore = require('ignore');
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('simulator release build needs no device signing and preserves production entry', () => {
  const config = JSON.parse(read('eas.json'));
  const profile = config.build['ios-simulator'];
  assert.equal(profile.ios.simulator, true);
  assert.equal(profile.ios.buildConfiguration, 'Release');
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.env.EXPO_NO_DOTENV, '1');
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
  assert.equal(config.build.production.ios?.simulator, undefined);
  assert.match(read('index.ts'), /__DEV__ && designQaSearch !== null/);
});

test('cloud archive excludes secrets and historical outputs', () => {
  const filter = ignore().add(read('.easignore'));
  for (const path of ['.env.local', 'credentials.json', 'src/.env.production',
    'assets/signing.p12', 'plugins/private.key', 'artifacts/old.png',
    'android/app/debug.keystore', 'node_modules/expo/package.json', 'docs/CURRENT_RELEASE_STATUS.md',
    '.eas', '.maestro', '.eas/workflows/ios-auth-smoke.yml', '.maestro/ios-auth-smoke.yml']) {
    assert.equal(filter.ignores(path), true, path);
  }
  // EAS fs.cp checks directory paths WITHOUT a trailing slash before descending.
  for (const path of ['src', 'assets', 'plugins', 'iot', 'App.tsx', 'index.ts', 'package-lock.json', 'app.json', 'eas.json',
    'src/screens/HomeScreen.tsx', 'plugins/android-preview.gradle', 'iot/simulator/index.ts']) {
    assert.equal(filter.ignores(path), false, path);
  }
});

test('browser preview is an unsigned standalone simulator profile, never the production entry', () => {
  const config = JSON.parse(read('eas.json'));
  const profile = config.build['ios-browser-preview'];
  assert.equal(profile.extends, 'ios-simulator');
  assert.equal(profile.env.ENTRY_FILE, 'index.preview.ts');
  assert.equal(profile.env.EXPO_NO_DOTENV, '1');
  assert.equal(config.build['ios-simulator'].ios.simulator, true);
  assert.equal(config.build['ios-simulator'].ios.buildConfiguration, 'Release');
  for (const name of ['ios-simulator', 'development', 'qa', 'production']) {
    assert.equal(config.build[name].env?.ENTRY_FILE, undefined, name);
  }
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
});

test('native smoke reuses an exact simulator build and is manual, read-only, recorded', () => {
  const yaml = require('js-yaml');
  const workflow = yaml.load(read('.eas/workflows/ios-auth-smoke.yml'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.jobs), ['auth_smoke']);
  const job = workflow.jobs.auth_smoke;
  assert.equal(job.type, 'maestro');
  assert.equal(job.params.build_id, 'ca1d0d14-e5e6-48e9-8a39-fa26b6e71a61');
  assert.equal(job.params.skip_build_check, false);
  assert.equal(job.params.record_screen, true);
  assert.equal(job.params.retries, 0);
  const [header, steps] = yaml.loadAll(read(job.params.flow_path));
  assert.equal(header.appId, 'com.doso.robot');
  assert.equal(steps[0].launchApp.clearState, true);
  assert.equal(steps[0].launchApp.clearKeychain, undefined);
  const allowed = new Set(['launchApp', 'extendedWaitUntil', 'takeScreenshot', 'tapOn', 'assertVisible', 'scrollUntilVisible']);
  for (const step of steps) assert.ok(allowed.has(Object.keys(step)[0]));
  // No credential entry, backend scripts, registration submission, or email send.
  assert.ok(!JSON.stringify(steps).includes('register-submit'));
  assert.ok(!JSON.stringify(steps).includes('发送验证码'));
  assert.equal(steps.filter(step => step.takeScreenshot).length, 5);
});

test('every asset in the runtime registry is included in the upload', () => {
  const filter = ignore().add(read('.easignore'));
  // Runtime asset registry is the source, not a manually maintained asset list.
  const registry = read('src/assets.ts');
  const paths = [...registry.matchAll(/require\(['"]\.\.\/([^'"]+)['"]\)/g)].map(match => match[1]);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.ok(existsSync(new URL(path, root)), path);
    assert.equal(filter.ignores(path), false, path);
  }
});
