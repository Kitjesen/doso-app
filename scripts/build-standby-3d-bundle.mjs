import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const glbPath = resolve(rootDir, 'assets/models/thunder-r50-standby.glb');
const forestKitPath = resolve(rootDir, 'assets/models/forest-kit-photoreal.glb');
const forestSkyPath = resolve(rootDir, 'assets/models/forest-sky-misty-pines.jpg');
const forestHdrPath = resolve(rootDir, 'assets/models/forest-ibl-misty-pines.hdr');
const outDir = resolve(rootDir, 'assets/standby3d');
const androidAssetDir = resolve(rootDir, 'android/app/src/main/assets/standby3d');

if (!existsSync(glbPath)) {
  throw new Error(`Missing optimized GLB model at ${glbPath}. Run Blender export first.`);
}

mkdirSync(outDir, { recursive: true });

// 1. Bundle offline Three.js WebView viewer runtime (zero CDN / zero network)
const viewerOutPath = resolve(outDir, 'viewer.js');
await esbuild.build({
  entryPoints: [resolve(rootDir, 'src/components/standby3d/webviewEntry.ts')],
  outfile: viewerOutPath,
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome95', 'safari15'],
  platform: 'browser',
  sourcemap: false,
  legalComments: 'none',
});

// 2. Wrap GLB binary as an offline WebView-local script (never loaded into RN/Hermes JS bundle!)
const glbBytes = readFileSync(glbPath);
const modelDataOutPath = resolve(outDir, 'model-data.js');
writeFileSync(
  modelDataOutPath,
  `window.__DOSO_STANDBY_GLB_B64__=${JSON.stringify(glbBytes.toString('base64'))};\n`,
  'utf8',
);

// 2b. Wrap photoreal Blender-baked forest kit GLB + real misty_pines sky JPG + HDRI IBL for 100% offline WebView!
const forestDataOutPath = resolve(outDir, 'forest-data.js');
const forestChunks = [];
if (existsSync(forestKitPath)) {
  forestChunks.push(`window.__DOSO_FOREST_KIT_B64__=${JSON.stringify(readFileSync(forestKitPath).toString('base64'))};`);
}
if (existsSync(forestSkyPath)) {
  forestChunks.push(`window.__DOSO_FOREST_SKY_URI__=${JSON.stringify(`data:image/jpeg;base64,${readFileSync(forestSkyPath).toString('base64')}`)};`);
}
if (existsSync(forestHdrPath)) {
  forestChunks.push(`window.__DOSO_FOREST_HDR_B64__=${JSON.stringify(readFileSync(forestHdrPath).toString('base64'))};`);
}
writeFileSync(forestDataOutPath, `${forestChunks.join('\n')}\n`, 'utf8');

// 3. Emit self-contained offline HTML stage (do NOT preload 12 MB forest-data.js on Android startup)
const htmlOutPath = resolve(outDir, 'index.html');
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0e1319;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
#stage{display:block;width:100%;height:100%;touch-action:none;}
</style>
</head>
<body>
<canvas id="stage"></canvas>
<script src="./model-data.js"></script>
<script src="./viewer.js"></script>
</body>
</html>
`;
writeFileSync(htmlOutPath, html, 'utf8');

// 4. Mirror into android/app/src/main/assets/standby3d if Android project exists locally
// Keep Android APK lean and fast: omit unused 12 MB forest-data.js from Android assets.
const androidMainDir = resolve(rootDir, 'android/app/src/main');
if (existsSync(androidMainDir)) {
  mkdirSync(androidAssetDir, { recursive: true });
  for (const name of ['index.html', 'viewer.js', 'model-data.js']) {
    copyFileSync(resolve(outDir, name), resolve(androidAssetDir, name));
  }
}

const kb = file => `${(statSync(file).size / 1024).toFixed(1)} KB`;
console.log(
  `[standby3d] built offline assets: viewer.js (${kb(viewerOutPath)}), model-data.js (${kb(modelDataOutPath)}), forest-data.js (${kb(forestDataOutPath)}), index.html (${kb(htmlOutPath)})`
  + (existsSync(androidAssetDir) ? ` -> synced to android/app/src/main/assets/standby3d` : ''),
);
