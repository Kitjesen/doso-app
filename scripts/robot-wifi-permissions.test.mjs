import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const permissions = require('../plugins/robotWifiPermissions.js');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Wi-Fi permission mutator caps location and adds nearby Wi-Fi without always-on location', () => {
  const manifest = {
    $: {},
    'uses-permission': [
      { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION', 'tools:node': 'remove' } },
      { $: { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION', 'tools:node': 'remove' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_SCAN', 'android:usesPermissionFlags': 'neverForLocation' } },
    ],
    'uses-permission-sdk-23': [
      { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION', 'android:maxSdkVersion': '30' } },
      { $: { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION', 'android:maxSdkVersion': '30' } },
    ],
  };
  permissions.applyRobotWifiManifest(manifest);
  const fine = manifest['uses-permission'].filter(entry => entry.$['android:name'] === permissions.FINE);
  assert.equal(fine.length, 1);
  assert.equal(fine[0].$['android:maxSdkVersion'], '32');
  assert.equal(fine[0].$['tools:node'], undefined);
  const nearby = manifest['uses-permission'].find(entry => entry.$['android:name'] === permissions.NEARBY);
  assert.equal(nearby.$['android:usesPermissionFlags'], 'neverForLocation');
  assert.equal(manifest['uses-permission-sdk-23'].some(entry => entry.$['android:name'] === permissions.FINE), false);
  const coarseLegacy = manifest['uses-permission-sdk-23'].find(entry => entry.$['android:name'] === 'android.permission.ACCESS_COARSE_LOCATION');
  assert.equal(coarseLegacy.$['android:maxSdkVersion'], '30');
  const plist = { NSLocationAlwaysUsageDescription: 'unwanted', NSMotionUsageDescription: 'unwanted' };
  permissions.applyRobotWifiPlist(plist);
  assert.equal(plist.NSLocationWhenInUseUsageDescription, permissions.WIFI_LOCATION_USAGE);
  assert.equal(plist.NSLocalNetworkUsageDescription, permissions.LOCAL_NETWORK_USAGE);
  assert.equal(plist.NSLocationAlwaysUsageDescription, undefined);
  assert.equal(plist.NSMotionUsageDescription, undefined);
  const entitlements = {};
  permissions.applyRobotWifiEntitlements(entitlements);
  assert.equal(entitlements['com.apple.developer.networking.wifi-info'], true);
  assert.equal(entitlements['com.apple.developer.networking.HotspotConfiguration'], true);
});

test('the Expo config and optional prebuilt Android manifest match the Wi-Fi permission contract', () => {
  assert.match(read('app.json'), /withRobotWifiPermissions/);
  assert.match(read('plugins/withRobotWifiPermissions.js'), /applyRobotWifiManifest/);
  const manifestUrl = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
  if (existsSync(manifestUrl)) {
    const manifest = readFileSync(manifestUrl, 'utf8');
    assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION" android:maxSdkVersion="32"/);
    assert.match(manifest, /android\.permission\.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation"/);
    assert.match(manifest, /android\.permission\.ACCESS_WIFI_STATE"/);
    assert.match(manifest, /android\.permission\.CHANGE_WIFI_STATE"/);
    assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION" tools:node="remove"/);
  }
});
