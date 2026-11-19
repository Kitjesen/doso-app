import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { localBuildCommand } from './android-local-test.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('full local build selects only its normal-entry bundle and independent APK task', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const command = localBuildCommand(root, { JAVA_HOME: 'D:/Android/Android Studio/jbr' });
  assert.ok(command.args.includes(':app:createBundleLocaltestJsAndAssets'));
  assert.ok(command.args.includes(':app:assembleLocaltest'));
  assert.ok(command.args.includes('--rerun'));
  assert.ok(command.args.includes('-PreactNativeArchitectures=arm64-v8a'));
  assert.equal(command.options.shell, false);
  assert.doesNotMatch(command.args.join(' '), /assembleQa|assembleDebug|assembleRelease|install/);
  const gradle = read('plugins/android-local-test.gradle');
  assert.match(gradle, /applicationIdSuffix "\.localtest"/);
  assert.match(gradle, /debuggable true/);
  assert.match(gradle, /entryFile.set\(file\('\.\.\/\.\.\/index.ts'\)\)/);
});

test('local manifest keeps local hardware/networking but does not intercept production auth links', () => {
  const manifest = read('plugins/android-local-test-manifest.xml');
  assert.equal(read('android/app/src/localtest/AndroidManifest.xml').trim(), manifest.trim());
  assert.match(manifest, /android:label="DOSO Local Test"/);
  assert.match(manifest, /android:usesCleartextTraffic="true"/);
  assert.doesNotMatch(manifest, /uses-permission.*remove|android.intent.action.VIEW|links.dosorobotics.com/);
  assert.ok(JSON.parse(read('app.json')).expo.plugins.includes('./plugins/withLocalAcceptance'));
  assert.match(read('android/app/build.gradle'), /apply from: '\.\.\/\.\.\/plugins\/android-local-test.gradle'/);
  assert.match(read('index.ts'), /import App from '\.\/App'/);
});
