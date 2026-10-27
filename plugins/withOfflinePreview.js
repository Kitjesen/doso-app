const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const marker = "apply from: '../../plugins/android-preview.gradle'";

module.exports = function withOfflinePreview(config) {
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('DOSO preview requires Groovy.');
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `\n${marker}\n`;
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/preview');
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'android-preview-manifest.xml'), path.join(destination, 'AndroidManifest.xml'));
    return mod;
  }]);
};
