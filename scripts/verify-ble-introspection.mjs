import assert from 'node:assert/strict';

let input = '';
for await (const chunk of process.stdin) input += chunk;
assert.ok(input.trim(), 'expo config introspection produced no JSON');

const introspected = JSON.parse(input);
const androidManifest = introspected._internal?.modResults?.android?.manifest?.manifest;
assert.ok(androidManifest, 'introspected Android manifest is missing');

const normalPermissions = androidManifest['uses-permission'] ?? [];
const legacyPermissions = androidManifest['uses-permission-sdk-23'] ?? [];
for (const permission of [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
]) {
  const normal = normalPermissions.filter((entry) => entry.$?.['android:name'] === permission);
  assert.ok(normal.length > 0, `${permission} removal marker is missing`);
  assert.ok(normal.every((entry) => entry.$?.['tools:node'] === 'remove'));
  const legacy = legacyPermissions.filter((entry) => entry.$?.['android:name'] === permission);
  assert.equal(legacy.length, 1, `${permission} must have one legacy declaration`);
  assert.equal(legacy[0].$?.['android:maxSdkVersion'], '30');
}

const infoPlist = introspected._internal?.modResults?.ios?.infoPlist;
assert.ok(infoPlist, 'introspected iOS Info.plist is missing');
assert.equal(
  infoPlist.NSBluetoothAlwaysUsageDescription,
  '允许 DOSO 扫描并连接附近蓝牙设备',
  'iOS Bluetooth usage text must describe explicit scanning and connecting',
);
for (const key of [
  'NSBluetoothPeripheralUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMotionUsageDescription',
]) assert.equal(infoPlist[key], undefined, `${key} must stay absent while iOS discovery is unsupported`);

console.log('BLE native permission introspection PASS');
