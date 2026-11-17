// Synthetic introspection JSON tests the real validator, not Expo or a device.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const description = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'react-native-ble-manager')[1].bluetoothAlwaysPermission;
const { WIFI_LOCATION_USAGE } = require('../plugins/robotWifiPermissions');
function introspection(text) {
  const coarse = 'android.permission.ACCESS_COARSE_LOCATION';
  return { _internal: { modResults: {
    android: { manifest: { manifest: {
      'uses-permission': [
        { $: { 'android:name': coarse, 'tools:node': 'remove' } },
        { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION', 'android:maxSdkVersion': '32' } },
        { $: { 'android:name': 'android.permission.ACCESS_WIFI_STATE' } },
        { $: { 'android:name': 'android.permission.CHANGE_WIFI_STATE' } },
        { $: { 'android:name': 'android.permission.NEARBY_WIFI_DEVICES', 'android:usesPermissionFlags': 'neverForLocation' } },
      ],
      'uses-permission-sdk-23': [
        { $: { 'android:name': coarse, 'android:maxSdkVersion': '30' } },
      ],
    } } },
    ios: { infoPlist: { NSBluetoothAlwaysUsageDescription: text, NSLocationWhenInUseUsageDescription: WIFI_LOCATION_USAGE } },
  } } };
}
function validate(input) {
  return spawnSync(process.execPath, ['scripts/verify-ble-introspection.mjs'], { cwd: root, encoding: 'utf8',
    input: JSON.stringify(input), timeout: 5000, maxBuffer: 32768,
    env: { SystemRoot: 'C:/WINDOWS' }, windowsHide: true });
}
test('the real permission validator accepts the configured scan-and-connect description with unchanged legacy permissions', () => {
  assert.equal(description, '允许 DOSO 扫描并连接附近蓝牙设备');
  const result = validate(introspection(description));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /BLE native permission introspection PASS/);
});
test('the permission validator rejects always-on location and an unrestricted fine-location grant', () => {
  assert.notEqual(validate(introspection('允许 DOSO 扫描附近机器人发出的蓝牙广播')).status, 0);
  const alwaysOn = introspection(description);
  alwaysOn._internal.modResults.ios.infoPlist.NSLocationAlwaysUsageDescription = 'unwanted';
  assert.notEqual(validate(alwaysOn).status, 0);
  const unrestricted = introspection(description);
  unrestricted._internal.modResults.android.manifest.manifest['uses-permission'] =
    unrestricted._internal.modResults.android.manifest.manifest['uses-permission'].map(entry => (
      entry.$['android:name'] === 'android.permission.ACCESS_FINE_LOCATION' ? { $: { 'android:name': entry.$['android:name'] } } : entry
    ));
  assert.notEqual(validate(unrestricted).status, 0);
});
