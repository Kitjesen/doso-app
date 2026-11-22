const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

const NETWORK_PERMISSIONS = [
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.INTERNET',
];

const LOCAL_NETWORK_USAGE = 'DOSO 需要访问局域网，以接收机器狗的视频。';

function ensurePermission(manifest, name) {
  const permissions = manifest['uses-permission'] ?? [];
  const present = permissions.some(item => item?.$?.['android:name'] === name);
  if (!present) permissions.push({ $: { 'android:name': name } });
  manifest['uses-permission'] = permissions;
}

// Receive-only playback. Camera and microphone permissions stay removed.
function withReceiveOnlyWebRtc(config) {
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    for (const name of NETWORK_PERMISSIONS) ensurePermission(manifest, name);
    return mod;
  });
  config = withInfoPlist(config, mod => {
    const plist = mod.modResults;
    if (!plist.NSLocalNetworkUsageDescription) plist.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE;
    const ats = { ...(plist.NSAppTransportSecurity ?? {}) };
    ats.NSAllowsLocalNetworking = true;
    plist.NSAppTransportSecurity = ats;
    return mod;
  });
  return config;
}

module.exports = withReceiveOnlyWebRtc;
