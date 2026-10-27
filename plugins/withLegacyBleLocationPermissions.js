const { withAndroidManifest } = require('expo/config-plugins');

const LEGACY_LOCATION_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];

module.exports = function withLegacyBleLocationPermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const usesPermissions = manifest['uses-permission'] ?? [];
    manifest['uses-permission'] = [
      ...usesPermissions.filter((entry) => (
        !LEGACY_LOCATION_PERMISSIONS.includes(entry.$?.['android:name'])
      )),
      ...LEGACY_LOCATION_PERMISSIONS.map((permission) => ({
        $: {
          'android:name': permission,
          'tools:node': 'remove',
        },
      })),
    ];

    const legacyPermissions = manifest['uses-permission-sdk-23'] ?? [];
    manifest['uses-permission-sdk-23'] = [
      ...legacyPermissions.filter((entry) => (
        !LEGACY_LOCATION_PERMISSIONS.includes(entry.$?.['android:name'])
      )),
      ...LEGACY_LOCATION_PERMISSIONS.map((permission) => ({
        $: {
          'android:name': permission,
          'android:maxSdkVersion': '30',
        },
      })),
    ];
    return modConfig;
  });
};

module.exports.LEGACY_LOCATION_PERMISSIONS = LEGACY_LOCATION_PERMISSIONS;
