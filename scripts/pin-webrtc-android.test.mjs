import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('the Expo plugin pins the Android media dependency once and is registered', () => {
  const source = readFileSync(new URL('../plugins/withPinnedWebRtcAndroid.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports,
    require: () => ({ withProjectBuildGradle: (config, action) => action(config) }) });
  const config = { modResults: { language: 'groovy', contents: 'allprojects {}' } };
  module.exports(config); module.exports(config);
  assert.equal(config.modResults.contents.match(/org\.jitsi:webrtc:155\.0\.1/g)?.length, 1);
  assert.throws(() => module.exports({ modResults: { language: 'kt', contents: '' } }));
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/withPinnedWebRtcAndroid'));
});
