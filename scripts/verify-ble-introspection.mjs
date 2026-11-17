import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WIFI_LOCATION_USAGE } = require('../plugins/robotWifiPermissions');

let input = '';
for await (const chunk of process.stdin) input += chunk;
assert.ok(input.trim(), 'expo config introspection produced no JSON');

const introspected = JSON.parse(input);
const androidManifest = introspected._internal?.modResults?.android?.manifest?.manifest;
assert.ok(androidManifest, 'introspected Android manifest is missing');

const normalPermissions = androidManifest['uses-permission'] ?? [];
const legacyPermissions = androidManifest['uses-permission-sdk-23'] ?? [];

const coarse = 'android.permission.ACCESS_COARSE_LOCATION';
const coarseNormal = normalPermissions.filter((entry) => entry.$?.['android:name'] === coarse);
assert.ok(coarseNormal.length > 0, `${coarse} removal marker is missing`);
assert.ok(coarseNormal.every((entry) => entry.$?.['tools:node'] === 'remove'));
const coarseLegacy = legacyPermissions.filter((entry) => entry.$?.['android:name'] === coarse);
assert.equal(coarseLegacy.length, 1, `${coarse} must have one legacy declaration`);
assert.equal(coarseLegacy[0].$?.['android:maxSdkVersion'], '30');

const fine = 'android.permission.ACCESS_FINE_LOCATION';
const fineNormal = normalPermissions.filter((entry) => entry.$?.['android:name'] === fine);
assert.equal(fineNormal.length, 1, 'Wi-Fi scan keeps one fine-location grant');
assert.equal(fineNormal[0].$?.['android:maxSdkVersion'], '32', 'fine location stops at Android 12');
assert.equal(fineNormal[0].$?.['tools:node'], undefined, 'fine location must not be removed outright');
assert.equal(legacyPermissions.filter((entry) => entry.$?.['android:name'] === fine).length, 0);

const nearby = normalPermissions.filter((entry) => entry.$?.['android:name'] === 'android.permission.NEARBY_WIFI_DEVICES');
assert.equal(nearby.length, 1);
assert.equal(nearby[0].$?.['android:usesPermissionFlags'], 'neverForLocation');
for (const permission of ['android.permission.ACCESS_WIFI_STATE', 'android.permission.CHANGE_WIFI_STATE']) {
  assert.equal(normalPermissions.filter((entry) => entry.$?.['android:name'] === permission).length, 1, permission);
}

const infoPlist = introspected._internal?.modResults?.ios?.infoPlist;
assert.ok(infoPlist, 'introspected iOS Info.plist is missing');
assert.equal(
  infoPlist.NSBluetoothAlwaysUsageDescription,
  '允许 DOSO 扫描并连接附近蓝牙设备',
  'iOS Bluetooth usage text must describe explicit scanning and connecting',
);
assert.equal(infoPlist.NSLocationWhenInUseUsageDescription, WIFI_LOCATION_USAGE);
for (const key of [
  'NSBluetoothPeripheralUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSMotionUsageDescription',
]) assert.equal(infoPlist[key], undefined, `${key} must stay absent`);

console.log('BLE native permission introspection PASS');
