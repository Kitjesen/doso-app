import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { decodePng } from './verify-design-acceptance-evidence.mjs';
import { calculateDecodedComparisonMetrics, DESIGN_ACCEPTANCE_THRESHOLDS } from './design-acceptance-metrics.mjs';

export { DESIGN_ACCEPTANCE_THRESHOLDS } from './design-acceptance-metrics.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(parts) {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (const byte of part) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32([typeBuffer, data]), 8 + data.length);
  return chunk;
}

export function encodeRgbaPng(width, height, pixels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('PNG dimensions must be positive integers');
  if (!Buffer.isBuffer(pixels) || pixels.length !== width * height * 4) throw new Error('RGBA pixel length does not match PNG dimensions');

  const rowLength = width * 4;
  const scanlines = Buffer.alloc((rowLength + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const target = row * (rowLength + 1);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, row * rowLength, (row + 1) * rowLength);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function composeComparison(figmaPath, appPath, outputPath) {
  const figma = decodePng(figmaPath);
  const app = decodePng(appPath);
  if (figma.width !== app.width || figma.height !== app.height) {
    throw new Error(`Figma/App dimensions differ: ${figma.width}x${figma.height} vs ${app.width}x${app.height}`);
  }

  const width = figma.width * 2;
  const height = figma.height;
  const pixels = Buffer.alloc(width * height * 4);
  const sourceRowBytes = figma.width * 4;
  const outputRowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * sourceRowBytes;
    const outputStart = row * outputRowBytes;
    figma.pixels.copy(pixels, outputStart, sourceStart, sourceStart + sourceRowBytes);
    app.pixels.copy(pixels, outputStart + sourceRowBytes, sourceStart, sourceStart + sourceRowBytes);
  }
  writeFileSync(outputPath, encodeRgbaPng(width, height, pixels));
  return { height, width };
}

export function calculateComparisonMetrics(figmaPath, appPath) {
  const figma = decodePng(figmaPath);
  const app = decodePng(appPath);
  if (figma.width !== app.width || figma.height !== app.height) {
    throw new Error(`Figma/App dimensions differ: ${figma.width}x${figma.height} vs ${app.width}x${app.height}`);
  }
  const { ssimPassed, ...metrics } = calculateDecodedComparisonMetrics(figma, app);
  return metrics;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name, inlineValue] = argument.split('=', 2);
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    options[name.slice(2)] = value;
  }
  for (const key of ['output', 'figma-light', 'figma-dark', 'figma-landscape']) {
    if (!options[key]) throw new Error(`--${key} is required`);
  }
  return options;
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function prepareThreeStateComparisons({ outputDirectory, figma, app = {} }) {
  mkdirSync(outputDirectory, { recursive: true });
  const expected = {
    light: { width: 390, height: 844 },
    dark: { width: 390, height: 844 },
    landscape: { width: 844, height: 390 },
  };
  const files = {};
  const metrics = {};

  for (const state of ['light', 'dark', 'landscape']) {
    const figmaOutput = path.join(outputDirectory, `figma-${state}.png`);
    const appPath = path.join(outputDirectory, `app-${state}.png`);
    const comparisonPath = path.join(outputDirectory, `comparison-${state}.png`);
    copyFileSync(figma[state], figmaOutput);
    if (app[state]) copyFileSync(app[state], appPath);
    const figmaImage = decodePng(figmaOutput);
    const appImage = decodePng(appPath);
    const target = expected[state];
    if (figmaImage.width !== target.width || figmaImage.height !== target.height) throw new Error(`figma-${state}.png must be ${target.width}x${target.height}`);
    if (appImage.width !== target.width || appImage.height !== target.height) throw new Error(`app-${state}.png must be ${target.width}x${target.height}`);
    composeComparison(figmaOutput, appPath, comparisonPath);
    metrics[state] = calculateComparisonMetrics(figmaOutput, appPath);
    for (const filePath of [figmaOutput, appPath, comparisonPath]) {
      files[path.basename(filePath)] = sha256(filePath);
    }
  }

  writeFileSync(path.join(outputDirectory, 'comparison-metadata.json'), `${JSON.stringify({ schemaVersion: 1, thresholds: DESIGN_ACCEPTANCE_THRESHOLDS, metrics, files }, null, 2)}\n`);
  const failedStates = Object.entries(metrics).filter(([, result]) => !result.passed).map(([state]) => state);
  if (failedStates.length) throw new Error(`Design comparison threshold failed: ${failedStates.join(', ')}`);
  return files;
}

function main() {
  const options = parseArguments(process.argv);
  const outputDirectory = path.resolve(options.output);
  const files = prepareThreeStateComparisons({
    outputDirectory,
    figma: {
      light: path.resolve(options['figma-light']),
      dark: path.resolve(options['figma-dark']),
      landscape: path.resolve(options['figma-landscape']),
    },
    app: {
      light: options['app-light'] ? path.resolve(options['app-light']) : null,
      dark: options['app-dark'] ? path.resolve(options['app-dark']) : null,
      landscape: options['app-landscape'] ? path.resolve(options['app-landscape']) : null,
    },
  });
  console.log(JSON.stringify({ files, outputDirectory }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
