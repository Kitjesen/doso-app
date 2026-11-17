import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('native Wi-Fi discovery returns SSIDs only and joins only from the explicit method', () => {
  const kotlin = read('modules/robot-wifi/android/src/main/java/expo/modules/robotwifi/RobotWifiModule.kt');
  const swift = read('modules/robot-wifi/ios/RobotWifiModule.swift');
  assert.match(kotlin, /Name\("RobotWifi"\)/);
  assert.doesNotMatch(kotlin, /rssi|RSSI|\.level|BSSID|signalLevel|StandUp|Walk\(/);
  assert.match(kotlin, /mapOf\("ssids" to names\.toList\(\), "throttled" to throttled\)/);
  const scan = kotlin.slice(kotlin.indexOf('private fun scan'), kotlin.indexOf('private fun release'));
  assert.doesNotMatch(scan, /requestNetwork|bindProcessToNetwork|WifiNetworkSpecifier/);
  const join = kotlin.slice(kotlin.indexOf('private fun join'));
  assert.match(join, /WifiNetworkSpecifier\.Builder\(\)\.setSsid\(clean\)/);
  assert.match(join, /bindProcessToNetwork\(network\)/);
  assert.match(join, /promise\.resolve\("already"\)/);
  assert.doesNotMatch(swift, /scanSsids|CNCopySupportedInterfaces|rssi|BSSID/);
  assert.match(swift, /NEHotspotNetwork\.fetchCurrent/);
  assert.match(swift, /configuration\.joinOnce = true/);
  assert.match(swift, /NEHotspotConfiguration\(ssid: clean\)/);
});

test('platform adapters keep the hotspot rule and do not invent an iOS scan', () => {
  const android = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.android.ts');
  const ios = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.ios.ts');
  const web = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.ts');
  assert.match(android, /androidWifiScanPermission/);
  assert.match(android, /matchRobotHotspot\(ssid\)/);
  assert.match(android, /requireOptionalNativeModule<NativeRobotWifi>\('RobotWifi'\)/);
  assert.doesNotMatch(android, /5050|5052|192\.168\.66\.64/);
  assert.match(ios, /throw new WifiDiscoveryError\('unsupported'\)/);
  assert.doesNotMatch(ios, /PermissionsAndroid|scanSsids|loadWifiList/);
  assert.match(web, /platform: 'unsupported'/);
});

test('the connection screen keeps manual entry, Bluetooth honesty, and releases a joined hotspot on edit or leave', () => {
  const screen = read('src/screens/RobotConnectionScreen.tsx');
  assert.match(screen, /WifiDiscoveryPanel/);
  assert.match(screen, /releaseWifi\.current\(\)/);
  assert.match(screen, /身份验证和配网尚未接入/);
  assert.match(screen, /查找蓝牙设备/);
  assert.match(screen, /连接机器狗/);
  assert.match(screen, /账号设备/);
  assert.doesNotMatch(screen, /192\.168\.66\.64|5050|5052|云端状态已通/);
});
