const { withAndroidManifest } = require('expo/config-plugins');

function withLandscapeOrientation(config) {
  return withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application?.[0];
    const activities = application?.activity ?? [];
    for (const activity of activities) {
      if (activity?.$?.['android:name'] === '.MainActivity') {
        activity.$['android:screenOrientation'] = 'sensorLandscape';
      }
    }
    return mod;
  });
}

module.exports = withLandscapeOrientation;
