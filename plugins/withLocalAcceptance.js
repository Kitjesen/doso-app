const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const marker = "apply from: '../../plugins/android-local-test.gradle'";

module.exports = function withLocalAcceptance(config) {
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('DOSO local acceptance requires Groovy.');
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `\n${marker}\n`;
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/localtest');
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'android-local-test-manifest.xml'), path.join(destination, 'AndroidManifest.xml'));
    return mod;
  }]);
};
