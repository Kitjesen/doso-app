const { withAndroidManifest, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');
const { applyRobotWifiEntitlements, applyRobotWifiManifest, applyRobotWifiPlist } = require('./robotWifiPermissions');

// Register this plugin before withLegacyBleLocationPermissions and expo-location.
// Expo runs manifest and plist mods in reverse registration order, so an earlier
// entry applies last and keeps the capped Wi-Fi location grant.
function withRobotWifiPermissions(config) {
  config = withAndroidManifest(config, mod => {
    applyRobotWifiManifest(mod.modResults.manifest);
    return mod;
  });
  config = withInfoPlist(config, mod => {
    applyRobotWifiPlist(mod.modResults);
    return mod;
  });
  config = withEntitlementsPlist(config, mod => {
    applyRobotWifiEntitlements(mod.modResults);
    return mod;
  });
  return config;
}

module.exports = withRobotWifiPermissions;
