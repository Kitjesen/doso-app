import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { calculateComparisonMetrics, composeComparison, encodeRgbaPng } from './compose-design-comparison.mjs';
import { decodePng } from './verify-design-acceptance-evidence.mjs';

test('composes exact Figma-left and App-right RGBA halves', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doso-design-comparison-'));
  try {
    const figmaPath = path.join(directory, 'figma.png');
    const appPath = path.join(directory, 'app.png');
    const outputPath = path.join(directory, 'comparison.png');
    const figmaPixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
    const appPixels = Buffer.from([0, 0, 255, 255, 255, 255, 0, 255]);
    writeFileSync(figmaPath, encodeRgbaPng(2, 1, figmaPixels));
    writeFileSync(appPath, encodeRgbaPng(2, 1, appPixels));

    assert.deepEqual(composeComparison(figmaPath, appPath, outputPath), { width: 4, height: 1 });
    const output = decodePng(outputPath);
    assert.deepEqual(output.pixels, Buffer.concat([figmaPixels, appPixels]));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('rejects mismatched Figma and App dimensions', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doso-design-comparison-'));
  try {
    const figmaPath = path.join(directory, 'figma.png');
    const appPath = path.join(directory, 'app.png');
    writeFileSync(figmaPath, encodeRgbaPng(2, 1, Buffer.alloc(8)));
    writeFileSync(appPath, encodeRgbaPng(1, 1, Buffer.alloc(4)));
    assert.throws(() => composeComparison(figmaPath, appPath, path.join(directory, 'comparison.png')), /dimensions differ/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('calculates and gates exact pixel metrics', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doso-design-comparison-'));
  try {
    const figmaPath = path.join(directory, 'figma.png');
    const samePath = path.join(directory, 'same.png');
    const differentPath = path.join(directory, 'different.png');
    const reference = Buffer.from([20, 40, 60, 255, 80, 100, 120, 255]);
    writeFileSync(figmaPath, encodeRgbaPng(2, 1, reference));
    writeFileSync(samePath, encodeRgbaPng(2, 1, reference));
    writeFileSync(differentPath, encodeRgbaPng(2, 1, Buffer.from([255, 255, 255, 255, 255, 255, 255, 255])));

    assert.deepEqual(calculateComparisonMetrics(figmaPath, samePath), {
      mae: 0,
      delta16Percent: 0,
      delta32Percent: 0,
      ssim: 1,
      evaluatedPixelCount: 2,
      maskedPixelCount: 0,
      passed: true,
    });
    assert.equal(calculateComparisonMetrics(figmaPath, differentPath).passed, false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('masks only dynamic system-bar rows from acceptance metrics', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doso-design-comparison-'));
  try {
    const figmaPath = path.join(directory, 'figma.png');
    const appPath = path.join(directory, 'app.png');
    const width = 390;
    const height = 844;
    const reference = Buffer.alloc(width * height * 4, 255);
    const actual = Buffer.from(reference);
    for (const y of [0, height - 1]) {
      for (let x = 0; x < width; x += 1) actual.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
    writeFileSync(figmaPath, encodeRgbaPng(width, height, reference));
    writeFileSync(appPath, encodeRgbaPng(width, height, actual));

    const metrics = calculateComparisonMetrics(figmaPath, appPath);
    assert.equal(metrics.passed, true);
    assert.equal(metrics.evaluatedPixelCount, width * (height - 56));
    assert.equal(metrics.maskedPixelCount, width * 56);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
