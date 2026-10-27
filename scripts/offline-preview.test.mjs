import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('preview entry opens the safe browse shell without production auth', () => {
  const entry = read('index.preview.ts');
  assert.match(entry, /createElement\(DesignQaRoot/);
  assert.match(entry, /qa-browse=1&qa-stage=main-home&qa-theme=light/);
  assert.doesNotMatch(entry, /import.*(?:AuthProvider|services|supabase|\.\/App)/);
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
  assert.match(read('index.ts'), /const useDesignQa = __DEV__ &&/);
  assert.doesNotMatch(read('index.ts'), /index.preview|OfflinePreview/);
});
test('only the isolated preview build may select the preview entry', () => {
  const build = read('plugins/android-preview.gradle');
  assert.match(build, /applicationIdSuffix "\.preview"/);
  assert.match(build, /bundleTask.name == 'createBundlePreviewJsAndAssets'/);
  assert.match(build, /expectedEntry.*'index.preview.ts' : 'index.ts'/);
  assert.match(build, /throw new GradleException/);
  assert.ok(JSON.parse(read('app.json')).expo.plugins.includes('./plugins/withOfflinePreview'));
});
test('preview manifest removes networking, BLE and production callback links', () => {
  const manifest = read('plugins/android-preview-manifest.xml');
  assert.equal(read('android/app/src/preview/AndroidManifest.xml').trim(), manifest.trim());
  for (const permission of ['INTERNET', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'ACCESS_FINE_LOCATION']) {
    assert.ok(manifest.includes(`android.permission.${permission}" tools:node="remove"`));
  }
  assert.match(manifest, /android:label="DOSO Preview"/);
  assert.match(manifest, /MainActivity" tools:node="replace"/);
  assert.doesNotMatch(manifest, /android.intent.action.VIEW|links.dosorobotics.com/);
});
