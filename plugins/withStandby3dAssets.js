const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const STANDBY_3D_FILES = ['index.html', 'viewer.js', 'model-data.js'];

function copyStandbyAssets(projectRoot, targetDir) {
  const sourceDir = path.join(projectRoot, 'assets', 'standby3d');
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of STANDBY_3D_FILES) {
    const src = path.join(sourceDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, file));
    }
  }
}

function withStandby3dAssets(config) {
  return withDangerousMod(config, [
    'android',
    async mod => {
      const targetDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'standby3d',
      );
      copyStandbyAssets(mod.modRequest.projectRoot, targetDir);
      return mod;
    },
  ]);
}

module.exports = withStandby3dAssets;
