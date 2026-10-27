import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadLayout(relative = 'src/screens/profileLayout.ts') {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, require: name => {
    if (name === '../layout/adaptiveLayout') return loadLayout('src/layout/adaptiveLayout.ts');
    return require(name);
  } });
  return module.exports;
}

test('large text switches a wide Profile to a readable, full-width stack', () => {
  const { getProfileLayoutMetrics } = loadLayout();
  const metrics = getProfileLayoutMetrics({ containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: 1.6 });
  assert.equal(metrics.usesColumns, false);
  assert.equal(metrics.deviceColumnWidth, '100%');
  assert.equal(metrics.controlsColumnWidth, '100%');
});

test('short controller Profile allocates measured readable columns without reclaiming shell insets', () => {
  const { getProfileLayoutMetrics } = loadLayout();
  for (const [containerWidth, windowHeight] of [[675, 342], [753, 390], [882, 390], [1122, 360]]) {
    const metrics = getProfileLayoutMetrics({ containerWidth, windowHeight, isLandscape: true, fontScale: 1 });
    assert.equal(metrics.usesColumns, true);
    assert.equal(metrics.isCompactColumns, true);
    assert.ok(metrics.deviceColumnWidth >= 320);
    assert.ok(metrics.controlsColumnWidth >= 280);
    assert.equal(metrics.deviceColumnWidth + metrics.controlsColumnWidth + metrics.gridGap + metrics.padding * 2, containerWidth);
  }
});

test('narrow or enlarged-text short Profile windows stack even when the physical display is landscape', () => {
  const { getProfileLayoutMetrics } = loadLayout();
  for (const [containerWidth, windowHeight] of [[659, 390], [800, 600]]) {
    const metrics = getProfileLayoutMetrics({ containerWidth, windowHeight, isLandscape: true, fontScale: 1 });
    assert.equal(metrics.usesColumns, false, `${containerWidth} by ${windowHeight}`);
  }
  assert.equal(getProfileLayoutMetrics({ containerWidth: 753, windowHeight: 390, isLandscape: true, fontScale: 1.21 }).usesColumns, false);
  assert.equal(getProfileLayoutMetrics({ containerWidth: 753, windowHeight: 239, isLandscape: true, fontScale: 1 }).usesColumns, false);
});
