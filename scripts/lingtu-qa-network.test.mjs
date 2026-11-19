import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pluginPath = fileURLToPath(new URL('../plugins/withLocalSupabaseCleartext.js', import.meta.url));
const pluginSource = await readFile(pluginPath, 'utf8');
const template = await readFile(new URL('../plugins/android-qa-manifest.xml', import.meta.url), 'utf8');

function loadPlugin(env = {}) {
  const module = { exports: {} };
  const callbacks = {};
  const mocks = {
    withAndroidManifest(config, callback) { callbacks.manifest = callback; return config; },
    withAppBuildGradle(config, callback) { callbacks.gradle = callback; return config; },
    withDangerousMod(config, [platform, callback]) { assert.equal(platform, 'android'); callbacks.files = callback; return config; },
  };
  vm.runInNewContext(pluginSource, {
    module, __dirname: path.dirname(pluginPath), process: { env },
    require(name) { return name === 'expo/config-plugins' ? mocks : require(name); },
  }, { filename: pluginPath });
  module.exports({});
  return callbacks;
}

test('QA cleartext overlay is durable and does not add permissions, auth links or TLS exceptions', async () => {
  const generated = await readFile(new URL('../android/app/src/qa/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.equal(generated.trim(), template.trim());
  assert.match(template, /<application\s+android:usesCleartextTraffic="true"\s+tools:replace="android:usesCleartextTraffic"\s*\/>/);
  assert.doesNotMatch(template, /<activity|uses-permission|trust-anchors|networkSecurityConfig|debug-overrides|intent-filter/);
  const main = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(main, /android:usesCleartextTraffic="false"/);
  assert.match(main, /android:host="links\.dosorobotics\.com"/);
});

test('prebuild file callback creates only QA overlay and is idempotent for production and QA profiles', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'doso-qa-network-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sentinels = new Map([
    ['main/AndroidManifest.xml', '<manifest><application android:usesCleartextTraffic="false" /></manifest>'],
    ['release/AndroidManifest.xml', '<manifest><application android:allowBackup="false" /></manifest>'],
    ['preview/AndroidManifest.xml', '<manifest><uses-permission android:name="android.permission.INTERNET" tools:node="remove" /></manifest>'],
  ]);
  for (const [name, text] of sentinels) {
    const target = path.join(directory, 'app/src', name);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text);
  }
  for (const profile of ['qa', 'production']) {
    const callbacks = loadPlugin({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_AUTH_LINK_ORIGIN: 'https://links.dosorobotics.com' });
    const mod = { modRequest: { platformProjectRoot: directory } };
    assert.equal(await callbacks.files(mod), mod);
    assert.equal(await callbacks.files(mod), mod);
    assert.equal(await readFile(path.join(directory, 'app/src/qa/AndroidManifest.xml'), 'utf8'), template);
    for (const [name, text] of sentinels) assert.equal(await readFile(path.join(directory, 'app/src', name), 'utf8'), text);
  }
});

test('main manifest policy and production auth/signing groundwork remain unchanged', () => {
  for (const [url, expected] of [['https://api.example.test', 'false'], ['http://127.0.0.1:54321', 'true']]) {
    const callbacks = loadPlugin({ EXPO_PUBLIC_SUPABASE_URL_ANDROID: url });
    const application = { $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' }, activity: [{ $: { 'android:name': '.MainActivity' } }] };
    callbacks.manifest({ modResults: { manifest: { application: [application] } } });
    assert.equal(application.$['android:usesCleartextTraffic'], expected);
    assert.equal(application.$['android:allowBackup'], 'true');
    assert.equal(application.activity[0].$['android:name'], '.MainActivity');
    const mod = { modResults: { language: 'groovy', contents: 'android { namespace "com.doso.robot" }\n' } };
    callbacks.gradle(mod); const once = mod.modResults.contents; callbacks.gradle(mod);
    assert.equal(mod.modResults.contents, once);
    assert.match(once, /qa \{[\s\S]*initWith release[\s\S]*signingConfig signingConfigs\.debug/);
    assert.match(once, /release \{[\s\S]*signingConfig dosoMissingProductionSigningEnv\.isEmpty\(\) \? signingConfigs\.production : null/);
    assert.match(once, /hasReleaseTask && dosoProductionAuthLinkOrigin != dosoRequiredProductionAuthLinkOrigin/);
  }
  assert.throws(() => loadPlugin({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_AUTH_LINK_ORIGIN: 'https://wrong.example.test' }), /DOSO production builds require/);
});
