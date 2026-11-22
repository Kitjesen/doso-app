const FINE = 'android.permission.ACCESS_FINE_LOCATION';
const NEARBY = 'android.permission.NEARBY_WIFI_DEVICES';
const WIFI_STATE = 'android.permission.ACCESS_WIFI_STATE';
const CHANGE_WIFI = 'android.permission.CHANGE_WIFI_STATE';
const NETWORK_STATE = 'android.permission.ACCESS_NETWORK_STATE';

const WIFI_LOCATION_USAGE = '用于确认手机是否已连上机器狗热点。不会记录位置，也不能列出附近的全部网络。';
const LOCAL_NETWORK_USAGE = '用于连接已经加入的机器狗热点。不会列出附近的全部网络。';

const WIFI_PERMISSIONS = new Set([FINE, NEARBY, WIFI_STATE, CHANGE_WIFI, NETWORK_STATE]);

function permission(name, extra = {}) {
  return { $: { 'android:name': name, ...extra } };
}

function applyRobotWifiManifest(manifest) {
  manifest.$ = manifest.$ ?? {};
  manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
  const uses = manifest['uses-permission'] ?? [];
  manifest['uses-permission'] = [
    ...uses.filter(entry => !WIFI_PERMISSIONS.has(entry.$?.['android:name'])),
    permission(FINE, { 'android:maxSdkVersion': '32' }),
    permission(NETWORK_STATE),
    permission(WIFI_STATE),
    permission(CHANGE_WIFI),
    permission(NEARBY, { 'android:usesPermissionFlags': 'neverForLocation', 'tools:targetApi': 'tiramisu' }),
  ];
  manifest['uses-permission-sdk-23'] = (manifest['uses-permission-sdk-23'] ?? [])
    .filter(entry => entry.$?.['android:name'] !== FINE);
  return manifest;
}

function applyRobotWifiPlist(plist) {
  plist.NSLocationWhenInUseUsageDescription = WIFI_LOCATION_USAGE;
  plist.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE;
  delete plist.NSLocationAlwaysAndWhenInUseUsageDescription;
  delete plist.NSLocationAlwaysUsageDescription;
  delete plist.NSMotionUsageDescription;
  return plist;
}

function applyRobotWifiEntitlements(entitlements) {
  entitlements['com.apple.developer.networking.wifi-info'] = true;
  entitlements['com.apple.developer.networking.HotspotConfiguration'] = true;
  return entitlements;
}

module.exports = {
  FINE, NEARBY, WIFI_STATE, CHANGE_WIFI, NETWORK_STATE,
  WIFI_LOCATION_USAGE, LOCAL_NETWORK_USAGE,
  applyRobotWifiManifest, applyRobotWifiPlist, applyRobotWifiEntitlements,
};
