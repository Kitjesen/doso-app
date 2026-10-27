// Synthetic introspection JSON tests the real validator, not Expo or a device.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const description = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'react-native-ble-manager')[1].bluetoothAlwaysPermission;
function introspection(text) {
  const names = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];
  return { _internal: { modResults: {
    android: { manifest: { manifest: {
      'uses-permission': names.map(name => ({ $: { 'android:name': name, 'tools:node': 'remove' } })),
      'uses-permission-sdk-23': names.map(name => ({ $: { 'android:name': name, 'android:maxSdkVersion': '30' } })),
    } } },
    ios: { infoPlist: { NSBluetoothAlwaysUsageDescription: text } },
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
test('the permission validator rejects the obsolete scan-only description and new broad location permissions', () => {
  assert.notEqual(validate(introspection('允许 DOSO 扫描附近机器人发出的蓝牙广播')).status, 0);
  const widened = introspection(description);
  widened._internal.modResults.ios.infoPlist.NSLocationAlwaysUsageDescription = 'unwanted';
  assert.notEqual(validate(widened).status, 0);
});
