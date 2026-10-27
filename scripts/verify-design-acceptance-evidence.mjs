import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  calculateDecodedComparisonMetrics,
  CRITICAL_REGION_SSIM_THRESHOLD,
  DESIGN_ACCEPTANCE_THRESHOLDS,
  isDynamicSystemBarPixel,
} from './design-acceptance-metrics.mjs';
import { verifyAndroidCapture, verifyFigmaExport } from './design-acceptance-provenance.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_FILE_BYTES = 32 * 1024 * 1024;
const MAX_PNG_DIMENSION = 4096;
const MAX_PNG_PIXELS = 6_000_000;
const CANONICAL_TEXT_HASH_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.mts', '.ps1', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const STATES = Object.freeze([
  { id: 'light', width: 390, height: 844 },
  { id: 'dark', width: 390, height: 844 },
  { id: 'landscape', width: 844, height: 390 },
]);
const FINALIZATION_COMMANDS = Object.freeze([
  Object.freeze({ id: 'typecheck', command: 'npm run typecheck' }),
  Object.freeze({ id: 'pageReleaseAudit', command: 'npm run test:release-gate:design-audit' }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredPath(directory, filename) {
  const filePath = path.join(directory, filename);
  invariant(existsSync(filePath), `Missing required evidence file: ${filePath}`);
  return filePath;
}

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
}));

function crc32(buffers) {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterScanlines(inflated, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  invariant(inflated.length === (stride + 1) * height, `PNG inflated payload length is invalid: expected ${(stride + 1) * height}, got ${inflated.length}`);
  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inputOffset];
    inputOffset += 1;
    invariant(filterType >= 0 && filterType <= 4, `Unsupported PNG scanline filter: ${filterType}`);
    const rowOffset = y * stride;
    const priorRowOffset = rowOffset - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? output[priorRowOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? output[priorRowOffset + x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      if (filterType === 2) predictor = above;
      if (filterType === 3) predictor = Math.floor((left + above) / 2);
      if (filterType === 4) predictor = paethPredictor(left, above, upperLeft);
      output[rowOffset + x] = (raw + predictor) & 0xff;
    }
    inputOffset += stride;
  }

  return output;
}

function convertToRgba(scanlines, width, height, colorType, palette, transparency) {
  const pixelCount = width * height;
  const rgba = Buffer.alloc(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const target = pixel * 4;
    if (colorType === 0) {
      const gray = scanlines[pixel];
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      rgba[target + 3] = transparency && gray === transparency.readUInt16BE(0) ? 0 : 255;
    } else if (colorType === 2) {
      const source = pixel * 3;
      rgba[target] = scanlines[source];
      rgba[target + 1] = scanlines[source + 1];
      rgba[target + 2] = scanlines[source + 2];
      rgba[target + 3] = transparency
        && scanlines[source] === transparency.readUInt16BE(0)
        && scanlines[source + 1] === transparency.readUInt16BE(2)
        && scanlines[source + 2] === transparency.readUInt16BE(4)
        ? 0
        : 255;
    } else if (colorType === 3) {
      const paletteIndex = scanlines[pixel];
      const source = paletteIndex * 3;
      invariant(palette && source + 2 < palette.length, `PNG palette index ${paletteIndex} is out of range`);
      rgba[target] = palette[source];
      rgba[target + 1] = palette[source + 1];
      rgba[target + 2] = palette[source + 2];
      rgba[target + 3] = transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
    } else if (colorType === 4) {
      const source = pixel * 2;
      const gray = scanlines[source];
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      rgba[target + 3] = scanlines[source + 1];
    } else if (colorType === 6) {
      const source = pixel * 4;
      rgba[target] = scanlines[source];
      rgba[target + 1] = scanlines[source + 1];
      rgba[target + 2] = scanlines[source + 2];
      rgba[target + 3] = scanlines[source + 3];
    }
  }
  return rgba;
}

export function decodePng(filePath) {
  const buffer = readFileSync(filePath);
  invariant(buffer.length >= 33, `PNG is too short to contain a complete IHDR chunk: ${filePath}`);
  invariant(buffer.length <= MAX_PNG_FILE_BYTES, `PNG exceeds the ${MAX_PNG_FILE_BYTES}-byte evidence limit: ${filePath}`);
  invariant(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `Invalid PNG signature: ${filePath}`);

  let offset = PNG_SIGNATURE.length;
  let header;
  let palette;
  let transparency;
  let sawEnd = false;
  const compressedParts = [];

  while (offset < buffer.length) {
    invariant(offset + 12 <= buffer.length, `PNG has a truncated chunk header: ${filePath}`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    invariant(chunkEnd <= buffer.length, `PNG chunk ${type} is truncated: ${filePath}`);
    const typeBuffer = buffer.subarray(offset + 4, offset + 8);
    const data = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    invariant(crc32([typeBuffer, data]) === expectedCrc, `PNG chunk ${type} has an invalid CRC: ${filePath}`);

    if (!header) invariant(type === 'IHDR', `PNG first chunk must be IHDR: ${filePath}`);
    if (type === 'IHDR') {
      invariant(!header && length === 13, `PNG must contain exactly one 13-byte IHDR chunk: ${filePath}`);
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
      invariant(
        header.width > 0
          && header.height > 0
          && header.width <= MAX_PNG_DIMENSION
          && header.height <= MAX_PNG_DIMENSION
          && header.width * header.height <= MAX_PNG_PIXELS,
        `PNG dimensions exceed the evidence limit (${MAX_PNG_DIMENSION}px per axis, ${MAX_PNG_PIXELS} pixels): ${filePath}`,
      );
    } else if (type === 'PLTE') {
      invariant(!palette, `PNG contains multiple PLTE chunks: ${filePath}`);
      palette = data;
    } else if (type === 'tRNS') {
      invariant(!transparency, `PNG contains multiple tRNS chunks: ${filePath}`);
      transparency = data;
    } else if (type === 'IDAT') {
      compressedParts.push(data);
    } else if (type === 'IEND') {
      invariant(length === 0, `PNG IEND chunk must be empty: ${filePath}`);
      sawEnd = true;
      offset = chunkEnd;
      break;
    } else {
      const isCritical = type[0] === type[0].toUpperCase();
      invariant(!isCritical, `Unsupported critical PNG chunk ${type}: ${filePath}`);
    }
    offset = chunkEnd;
  }

  invariant(header, `PNG is missing IHDR: ${filePath}`);
  invariant(sawEnd, `PNG is missing IEND: ${filePath}`);
  invariant(offset === buffer.length, `PNG contains trailing bytes after IEND: ${filePath}`);
  invariant(compressedParts.length > 0, `PNG is missing IDAT image data: ${filePath}`);
  invariant(header.bitDepth === 8, `Only 8-bit PNG evidence is supported: ${filePath}`);
  invariant(header.compression === 0 && header.filter === 0 && header.interlace === 0, `Unsupported PNG compression/filter/interlace mode: ${filePath}`);
  const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bytesPerPixel = channelsByColorType[header.colorType];
  invariant(bytesPerPixel, `Unsupported PNG color type ${header.colorType}: ${filePath}`);
  if (header.colorType === 3) invariant(palette && palette.length > 0 && palette.length % 3 === 0, `Indexed PNG is missing a valid PLTE chunk: ${filePath}`);
  if (transparency) {
    if (header.colorType === 0) invariant(transparency.length === 2, `Grayscale PNG tRNS chunk must be 2 bytes: ${filePath}`);
    else if (header.colorType === 2) invariant(transparency.length === 6, `Truecolor PNG tRNS chunk must be 6 bytes: ${filePath}`);
    else if (header.colorType === 3) invariant(transparency.length > 0 && transparency.length <= palette.length / 3, `Indexed PNG tRNS chunk exceeds its palette: ${filePath}`);
    else invariant(false, `PNG color type ${header.colorType} must not contain tRNS: ${filePath}`);
  }

  let inflated;
  const expectedInflatedLength = (header.width * bytesPerPixel + 1) * header.height;
  try {
    inflated = inflateSync(Buffer.concat(compressedParts), { maxOutputLength: expectedInflatedLength });
  } catch (error) {
    throw new Error(`PNG IDAT data cannot be decoded: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
  const scanlines = unfilterScanlines(inflated, header.width, header.height, bytesPerPixel);
  const pixels = convertToRgba(scanlines, header.width, header.height, header.colorType, palette, transparency);
  return { ...header, pixels };
}

export function readPngDimensions(filePath) {
  const { width, height } = decodePng(filePath);
  return { width, height };
}

function verifyExactDimensions(image, filePath, expectedWidth, expectedHeight) {
  const dimensions = { width: image.width, height: image.height };
  invariant(
    dimensions.width === expectedWidth && dimensions.height === expectedHeight,
    `${filePath} must be ${expectedWidth}x${expectedHeight}, got ${dimensions.width}x${dimensions.height}`,
  );
  return dimensions;
}

function verifyComparisonDimensions(image, filePath, expectedWidth, expectedHeight) {
  const dimensions = { width: image.width, height: image.height };
  const gap = dimensions.width - expectedWidth * 2;
  invariant(
    dimensions.height === expectedHeight && gap >= 0 && gap <= 32,
    `${filePath} must contain two ${expectedWidth}x${expectedHeight} horizontal panels with at most a 32px divider, got ${dimensions.width}x${dimensions.height}`,
  );
  return { ...dimensions, gap };
}

function verifyFigmaDimensions(image, filePath, expectedWidth, expectedHeight) {
  const dimensions = { width: image.width, height: image.height };
  const widthScale = dimensions.width / expectedWidth;
  const heightScale = dimensions.height / expectedHeight;
  invariant(
    Number.isInteger(widthScale) && widthScale >= 1 && widthScale === heightScale,
    `${filePath} must be an integer-scale ${expectedWidth}x${expectedHeight} Figma export, got ${dimensions.width}x${dimensions.height}`,
  );
  return { ...dimensions, scale: widthScale };
}

function flattenedChannel(pixels, pixelOffset, channel) {
  const alpha = pixels[pixelOffset + 3];
  return Math.round((pixels[pixelOffset + channel] * alpha + 255 * (255 - alpha)) / 255);
}

function normalizedFigmaChannel(figma, targetX, targetY, scale, channel) {
  let total = 0;
  for (let offsetY = 0; offsetY < scale; offsetY += 1) {
    for (let offsetX = 0; offsetX < scale; offsetX += 1) {
      const sourceX = targetX * scale + offsetX;
      const sourceY = targetY * scale + offsetY;
      const sourceOffset = (sourceY * figma.width + sourceX) * 4;
      total += flattenedChannel(figma.pixels, sourceOffset, channel);
    }
  }
  return Math.round(total / (scale * scale));
}

function compareRegion({ actual, actualX, expected, expectedScale = 1, width, height }) {
  let totalError = 0;
  let highErrorPixels = 0;
  let maxError = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const actualOffset = (y * actual.width + actualX + x) * 4;
      let pixelMaxError = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const expectedValue = expectedScale === 1
          ? flattenedChannel(expected.pixels, (y * expected.width + x) * 4, channel)
          : normalizedFigmaChannel(expected, x, y, expectedScale, channel);
        const actualValue = flattenedChannel(actual.pixels, actualOffset, channel);
        const error = Math.abs(actualValue - expectedValue);
        totalError += error;
        pixelMaxError = Math.max(pixelMaxError, error);
        maxError = Math.max(maxError, error);
      }
      if (pixelMaxError > 24) highErrorPixels += 1;
    }
  }
  const pixelCount = width * height;
  return {
    highErrorRatio: highErrorPixels / pixelCount,
    maxError,
    meanAbsoluteError: totalError / (pixelCount * 3),
  };
}

function verifyComparisonPixels(figma, app, comparison, figmaPath, appPath, comparisonPath, width, height, figmaScale, gap) {
  const left = compareRegion({ actual: comparison, actualX: 0, expected: figma, expectedScale: figmaScale, width, height });
  const right = compareRegion({ actual: comparison, actualX: width + gap, expected: app, width, height });

  invariant(
    right.meanAbsoluteError === 0 && right.maxError === 0,
    `${comparisonPath} right half must be pixel-identical to ${appPath}; mean error ${right.meanAbsoluteError.toFixed(4)}, max ${right.maxError}`,
  );
  invariant(
    left.meanAbsoluteError === 0 && left.maxError === 0,
    `${comparisonPath} left half must be pixel-identical to the deterministic normalized ${figmaPath}; mean error ${left.meanAbsoluteError.toFixed(4)}, max ${left.maxError}`,
  );
  return { left, right };
}

function sha256File(filePath) {
  const bytes = readFileSync(filePath);
  const canonicalBytes = CANONICAL_TEXT_HASH_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes;
  return createHash('sha256').update(canonicalBytes).digest('hex');
}

function verifySha256(value, label) {
  invariant(typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value), `${label} must be a SHA-256 hex digest`);
  return value.toLowerCase();
}

function readEvidenceJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function verifyCriticalRegionConfig(filePath) {
  const config = readEvidenceJson(filePath, 'critical-regions.json');
  invariant(config?.schemaVersion === 1, `${filePath} must use schemaVersion 1`);
  invariant(config.states && typeof config.states === 'object' && !Array.isArray(config.states), `${filePath} must record states`);
  return config;
}

function verifyLayoutMetricsConfig(filePath) {
  const config = readEvidenceJson(filePath, 'layout-metrics.json');
  invariant(config?.schemaVersion === 1, `${filePath} must use schemaVersion 1`);
  invariant(config.states && typeof config.states === 'object' && !Array.isArray(config.states), `${filePath} must record states`);
  return config;
}

function verifyCriticalRegions({ app, config, figma, figmaScale, filePath, state }) {
  const regions = config.states[state.id];
  invariant(Array.isArray(regions) && regions.length > 0, `${filePath} must record at least one ${state.id} critical region`);
  const ids = new Set();
  return regions.map((region, index) => {
    const label = `${filePath} states.${state.id}[${index}]`;
    invariant(typeof region?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(region.id), `${label}.id is invalid`);
    invariant(!ids.has(region.id), `${filePath} contains duplicate ${state.id} critical region id: ${region.id}`);
    ids.add(region.id);
    const rect = region.rect;
    invariant(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger), `${label}.rect must contain integer x/y/width/height`);
    invariant(rect.x >= 0 && rect.y >= 0 && rect.width >= 44 && rect.height >= 44, `${label}.rect must be at least 44x44 and start inside the viewport`);
    invariant(rect.x + rect.width <= state.width && rect.y + rect.height <= state.height, `${label}.rect exceeds the ${state.width}x${state.height} viewport`);
    let includesContentPixel = false;
    for (let y = rect.y; y < rect.y + rect.height && !includesContentPixel; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        if (!isDynamicSystemBarPixel(x, y, state.width, state.height)) {
          includesContentPixel = true;
          break;
        }
      }
    }
    invariant(includesContentPixel, `${label}.rect must not contain only dynamic system-bar pixels`);
    const metrics = calculateDecodedComparisonMetrics(figma, app, {
      maskDynamicSystemBars: false,
      rect,
      referenceScale: figmaScale,
      ssimThreshold: CRITICAL_REGION_SSIM_THRESHOLD,
    });
    invariant(
      metrics.ssimPassed,
      `${state.id} critical region ${region.id} SSIM ${metrics.ssim} is below ${CRITICAL_REGION_SSIM_THRESHOLD}`,
    );
    return { id: region.id, rect, metrics };
  });
}

function finiteMetric(value, label) {
  invariant(Number.isFinite(value), `${label} must be finite`);
  return value;
}

function verifyLayoutMetrics({ config, criticalRegions, filePath, state }) {
  const entries = config.states[state.id];
  invariant(Array.isArray(entries) && entries.length > 0, `${filePath} must record at least one ${state.id} layout metric`);
  const regionIds = new Set(criticalRegions.map((region) => region.id));
  const ids = new Set();
  const results = entries.map((entry, index) => {
    const label = `${filePath} states.${state.id}[${index}]`;
    invariant(typeof entry?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(entry.id), `${label}.id is invalid`);
    invariant(!ids.has(entry.id), `${filePath} contains duplicate ${state.id} layout metric id: ${entry.id}`);
    ids.add(entry.id);
    invariant(regionIds.has(entry.id), `${label}.id must correspond to a ${state.id} critical region`);
    invariant(entry.figma && typeof entry.figma === 'object', `${label}.figma is required`);
    invariant(entry.app && typeof entry.app === 'object', `${label}.app is required`);
    invariant(entry.touchTarget && typeof entry.touchTarget === 'object', `${label}.touchTarget is required`);
    for (const side of ['figma', 'app']) {
      for (const field of ['x', 'y', 'spacing', 'fontSize', 'lineHeight']) finiteMetric(entry[side][field], `${label}.${side}.${field}`);
      invariant(entry[side].x >= 0 && entry[side].x <= state.width, `${label}.${side}.x is outside the viewport`);
      invariant(entry[side].y >= 0 && entry[side].y <= state.height, `${label}.${side}.y is outside the viewport`);
      invariant(entry[side].spacing >= 0, `${label}.${side}.spacing must be non-negative`);
      invariant(entry[side].fontSize > 0 && entry[side].lineHeight > 0, `${label}.${side} typography must be positive`);
    }
    const deltas = {
      x: Math.abs(entry.app.x - entry.figma.x),
      y: Math.abs(entry.app.y - entry.figma.y),
      spacing: Math.abs(entry.app.spacing - entry.figma.spacing),
      fontSize: Math.abs(entry.app.fontSize - entry.figma.fontSize),
      lineHeight: Math.abs(entry.app.lineHeight - entry.figma.lineHeight),
    };
    for (const field of ['x', 'y', 'spacing']) invariant(deltas[field] <= 4, `${state.id} ${entry.id} ${field} delta ${deltas[field]}dp exceeds 4dp`);
    for (const field of ['fontSize', 'lineHeight']) invariant(deltas[field] <= 1, `${state.id} ${entry.id} ${field} delta ${deltas[field]}sp exceeds 1sp`);
    const touchWidth = finiteMetric(entry.touchTarget.width, `${label}.touchTarget.width`);
    const touchHeight = finiteMetric(entry.touchTarget.height, `${label}.touchTarget.height`);
    invariant(touchWidth >= 44 && touchHeight >= 44, `${state.id} ${entry.id} touch target ${touchWidth}x${touchHeight}dp is below 44dp`);
    return { deltas, id: entry.id, touchTarget: { height: touchHeight, width: touchWidth } };
  });
  const missingLayoutIds = [...regionIds].filter((id) => !ids.has(id));
  invariant(missingLayoutIds.length === 0, `${filePath} is missing ${state.id} layout metrics for critical regions: ${missingLayoutIds.join(', ')}`);
  return results;
}

function verifyEvidenceRecord(recordPath, evidenceDirectory, projectRoot, requiredEvidenceFiles) {
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid evidence.json: ${recordPath} (${error instanceof Error ? error.message : String(error)})`);
  }

  invariant(record?.schemaVersion === 1, `${recordPath} must use schemaVersion 1`);
  invariant(typeof record.pageId === 'string' && /^[a-z0-9-]+$/.test(record.pageId), `${recordPath} has an invalid pageId`);
  invariant(typeof record.acceptedCommit === 'string' && /^[a-f0-9]{7,40}$/i.test(record.acceptedCommit), `${recordPath} has an invalid acceptedCommit`);
  invariant(Number.isFinite(Date.parse(record.acceptedAt)), `${recordPath} has an invalid acceptedAt timestamp`);
  invariant(Date.parse(record.acceptedAt) <= Date.now(), `${recordPath} acceptedAt cannot be in the future`);

  invariant(typeof record.figma?.fileKey === 'string' && record.figma.fileKey.length >= 8, `${recordPath} must record the Figma fileKey`);
  for (const state of STATES) {
    invariant(/^\d+:\d+$/.test(record.figma?.nodes?.[state.id] ?? ''), `${recordPath} must record a valid ${state.id} Figma node`);
    invariant(record.visual?.[state.id] === 'PASS', `${recordPath} must record visual.${state.id}=PASS`);
  }
  for (const priority of ['P0', 'P1', 'P2']) {
    invariant(record.findings?.[priority] === 0, `${recordPath} must record findings.${priority}=0`);
  }
  invariant(record.verification?.typecheck?.status === 'PASS', `${recordPath} must record verification.typecheck.status=PASS`);
  invariant(record.verification?.typecheck?.exitCode === 0, `${recordPath} must record verification.typecheck.exitCode=0`);
  const pageReleaseAudit = record.verification?.pageReleaseAudit;
  const legacyReleaseGate = record.verification?.releaseGate;
  invariant(Boolean(pageReleaseAudit) !== Boolean(legacyReleaseGate), `${recordPath} must record exactly one pageReleaseAudit or legacy releaseGate result`);
  if (pageReleaseAudit) {
    invariant(pageReleaseAudit.status === 'PASS' && pageReleaseAudit.exitCode === 0, `${recordPath} must record verification.pageReleaseAudit PASS with exitCode=0`);
    invariant(pageReleaseAudit.mode === 'design-audit', `${recordPath} pageReleaseAudit.mode must be design-audit`);
    invariant(pageReleaseAudit.command === 'npm run test:release-gate:design-audit', `${recordPath} pageReleaseAudit.command is invalid`);
  } else {
    invariant(legacyReleaseGate.status === 'PASS' && legacyReleaseGate.exitCode === 0, `${recordPath} must record verification.releaseGate PASS with exitCode=0`);
    invariant(legacyReleaseGate.mode === 'legacy-full', `${recordPath} legacy releaseGate.mode must be legacy-full`);
    invariant(legacyReleaseGate.command === 'npm run test:release-gate', `${recordPath} legacy releaseGate.command is invalid`);
  }

  const evidenceHashes = record.evidenceSha256;
  invariant(evidenceHashes && typeof evidenceHashes === 'object' && !Array.isArray(evidenceHashes), `${recordPath} must record evidenceSha256`);
  for (const filename of requiredEvidenceFiles) {
    const expectedHash = verifySha256(evidenceHashes[filename], `${recordPath} evidenceSha256.${filename}`);
    const actualHash = sha256File(path.join(evidenceDirectory, filename));
    invariant(actualHash === expectedHash, `${recordPath} is stale or tampered: ${filename} SHA-256 mismatch`);
  }

  const sourceHashes = record.sourceSha256;
  invariant(sourceHashes && typeof sourceHashes === 'object' && !Array.isArray(sourceHashes), `${recordPath} must record sourceSha256`);
  const sourceEntries = Object.entries(sourceHashes);
  invariant(sourceEntries.length > 0, `${recordPath} must bind at least one page source file`);
  const resolvedRoot = path.resolve(projectRoot);
  for (const [relativePath, recordedHash] of sourceEntries) {
    invariant(!path.isAbsolute(relativePath), `${recordPath} source path must be project-relative: ${relativePath}`);
    const sourcePath = path.resolve(resolvedRoot, relativePath);
    const relativeToRoot = path.relative(resolvedRoot, sourcePath);
    invariant(relativeToRoot && !relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot), `${recordPath} source path escapes the project: ${relativePath}`);
    invariant(existsSync(sourcePath), `${recordPath} source file is missing: ${sourcePath}`);
    const expectedHash = verifySha256(recordedHash, `${recordPath} sourceSha256.${relativePath}`);
    const actualHash = sha256File(sourcePath);
    invariant(actualHash === expectedHash, `${recordPath} is stale: ${relativePath} changed after acceptance`);
  }

  return record;
}

function verifyQaSummary(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  invariant(content.endsWith('final result: passed'), `${filePath} must end with exact text: final result: passed`);

  invariant(!/\b(?:FAIL(?:ED)?|REQUEST\s+CHANGES|BYPASS)\b|未通过/i.test(content), `${filePath} contains an explicit failing or bypass result`);
  const groupedMatches = [...content.matchAll(/P0\s*\/\s*P1\s*\/\s*P2(?:\s*\/\s*P3)?\s*=\s*(\d+)/gi)];
  const groupedPrioritiesAreZero = groupedMatches.some((match) => Number(match[1]) === 0);
  invariant(groupedMatches.every((match) => Number(match[1]) === 0), `${filePath} contains a non-zero grouped P0/P1/P2 result`);
  for (const priority of ['P0', 'P1', 'P2']) {
    const values = [...content.matchAll(new RegExp(`${priority}\\s*=\\s*(\\d+)`, 'gi'))].map((match) => Number(match[1]));
    invariant(values.every((value) => value === 0), `${filePath} contains a non-zero ${priority} result`);
    const individualPriorityIsZero = values.includes(0);
    invariant(groupedPrioritiesAreZero || individualPriorityIsZero, `${filePath} must record ${priority} = 0`);
  }

  for (const [state, matcher] of [
    ['light', /(?:light|浅色)[^\n;|]*(?:PASS|通过)/i],
    ['dark', /(?:dark|深色)[^\n;|]*(?:PASS|通过)/i],
    ['landscape', /(?:landscape|横屏)[^\n;|]*(?:PASS|通过)/i],
  ]) {
    invariant(matcher.test(content), `${filePath} must record ${state} = PASS`);
  }
}

function verifyVerificationLog(filePath) {
  const content = readFileSync(filePath, 'utf8').trim();
  invariant(content.length > 0, `${filePath} must not be empty`);
  invariant(!/\b(?:FAIL(?:ED)?|BYPASS|SKIP(?:PED)?)\b/i.test(content), `${filePath} contains a failing, skipped, or bypassed verification`);
  invariant(/typecheck(?:=|:\s*)PASS/i.test(content), `${filePath} must record typecheck=PASS`);
  invariant(
    /(?:page[- ]release[- ]audit|release[- ]?gate)(?:=|:\s*)PASS/i.test(content),
    `${filePath} must record page-release-audit=PASS or release-gate=PASS`,
  );
}

function verifyFinalizationRecord({ currentCommit, evidenceDirectory, pageId, projectRoot, runId, sourceFiles }) {
  const recordPath = requiredPath(path.dirname(evidenceDirectory), 'finalization-verification.json');
  const finalization = readEvidenceJson(recordPath, 'finalization-verification.json');
  invariant(finalization?.schemaVersion === 1, `${recordPath} must use schemaVersion 1`);
  invariant(finalization.simulated === false, `${recordPath} must record simulated=false`);
  invariant(finalization.runId === runId, `${recordPath} runId must match ${runId}`);
  invariant(Array.isArray(finalization.pageIds) && finalization.pageIds.includes(pageId), `${recordPath} pageIds must include ${pageId}`);
  invariant(finalization.currentCommit === currentCommit, `${recordPath} currentCommit must match the page evidence acceptedCommit`);
  invariant(Array.isArray(finalization.commands) && finalization.commands.length === FINALIZATION_COMMANDS.length, `${recordPath} must record exactly ${FINALIZATION_COMMANDS.length} verification commands`);
  for (const expected of FINALIZATION_COMMANDS) {
    const commands = finalization.commands.filter((command) => command?.id === expected.id);
    invariant(commands.length === 1 && commands[0].command === expected.command, `${recordPath} must record exact successful command: ${expected.command}`);
    invariant(commands[0].exitCode === 0 && commands[0].error === null && commands[0].signal === null, `${recordPath} command ${expected.command} did not complete successfully`);
  }
  for (const field of ['sourceComparisonBefore', 'sourceComparison']) {
    const pageSources = finalization[field]?.[pageId];
    invariant(pageSources && typeof pageSources === 'object' && !Array.isArray(pageSources), `${recordPath} ${field} must record ${pageId}`);
    invariant(
      JSON.stringify(Object.keys(pageSources).sort()) === JSON.stringify([...sourceFiles].sort()),
      `${recordPath} ${field}.${pageId} must cover exactly the evidence source files`,
    );
    for (const relativePath of sourceFiles) {
      const source = pageSources[relativePath];
      const actual = sha256File(path.resolve(projectRoot, relativePath));
      invariant(
        source?.matches === true && source.current === actual && source.recorded === actual,
        `${recordPath} ${field}.${pageId}.${relativePath} does not match the current canonical source hash`,
      );
    }
  }
  invariant(
    JSON.stringify(finalization.sourceComparison[pageId]) === JSON.stringify(finalization.sourceComparisonBefore[pageId]),
    `${recordPath} source comparison changed while verification commands ran`,
  );
  return finalization;
}

export function verifyDesignAcceptanceEvidence(directory, { projectRoot = process.cwd(), requireFinalization = true } = {}) {
  const resolvedDirectory = path.resolve(directory);
  const stateEvidence = {};
  const criticalRegionsPath = requiredPath(resolvedDirectory, 'critical-regions.json');
  const layoutMetricsPath = requiredPath(resolvedDirectory, 'layout-metrics.json');
  const criticalRegionConfig = verifyCriticalRegionConfig(criticalRegionsPath);
  const layoutMetricsConfig = verifyLayoutMetricsConfig(layoutMetricsPath);
  requiredPath(resolvedDirectory, 'app-capture.json');
  requiredPath(resolvedDirectory, 'figma-export.json');
  const requiredEvidenceFiles = ['app-capture.json', 'critical-regions.json', 'figma-export.json', 'layout-metrics.json'];

  for (const state of STATES) {
    const figmaPath = requiredPath(resolvedDirectory, `figma-${state.id}.png`);
    const appPath = requiredPath(resolvedDirectory, `app-${state.id}.png`);
    const comparisonPath = requiredPath(resolvedDirectory, `comparison-${state.id}.png`);
    requiredEvidenceFiles.push(`figma-${state.id}.png`, `app-${state.id}.png`, `comparison-${state.id}.png`);

    const figma = decodePng(figmaPath);
    const app = decodePng(appPath);
    const comparison = decodePng(comparisonPath);
    const figmaDimensions = verifyFigmaDimensions(figma, figmaPath, state.width, state.height);
    const comparisonDimensions = verifyComparisonDimensions(comparison, comparisonPath, state.width, state.height);
    invariant(figmaDimensions.scale === 1, `${figmaPath} must be exactly ${state.width}x${state.height} for formal acceptance`);
    invariant(comparisonDimensions.gap === 0, `${comparisonPath} must contain exactly two ${state.width}x${state.height} panels without a divider`);
    const fullFrameMetrics = calculateDecodedComparisonMetrics(figma, app, {
      maskDynamicSystemBars: true,
      referenceScale: figmaDimensions.scale,
    });
    invariant(
      fullFrameMetrics.passed,
      `${state.id} full-frame comparison failed canonical thresholds ${JSON.stringify(DESIGN_ACCEPTANCE_THRESHOLDS)}: ${JSON.stringify(fullFrameMetrics)}`,
    );
    const criticalRegions = verifyCriticalRegions({
      app,
      config: criticalRegionConfig,
      figma,
      figmaScale: figmaDimensions.scale,
      filePath: criticalRegionsPath,
      state,
    });
    const layoutMetrics = verifyLayoutMetrics({
      config: layoutMetricsConfig,
      criticalRegions,
      filePath: layoutMetricsPath,
      state,
    });
    stateEvidence[state.id] = {
      figma: figmaDimensions,
      app: verifyExactDimensions(app, appPath, state.width, state.height),
      comparison: comparisonDimensions,
      composition: verifyComparisonPixels(figma, app, comparison, figmaPath, appPath, comparisonPath, state.width, state.height, figmaDimensions.scale, comparisonDimensions.gap),
      criticalRegions,
      fullFrameMetrics,
      layoutMetrics,
    };
  }

  const qaPath = requiredPath(resolvedDirectory, 'design-qa.md');
  const verificationPath = requiredPath(resolvedDirectory, 'verification.txt');
  requiredEvidenceFiles.push('design-qa.md', 'verification.txt');
  verifyQaSummary(qaPath);
  verifyVerificationLog(verificationPath);
  const recordPath = requiredPath(resolvedDirectory, 'evidence.json');
  const record = verifyEvidenceRecord(recordPath, resolvedDirectory, projectRoot, requiredEvidenceFiles);
  const runId = path.basename(path.dirname(resolvedDirectory));
  verifyAndroidCapture(resolvedDirectory, { pageId: record.pageId, runId });
  verifyFigmaExport(resolvedDirectory, { figma: record.figma, runId });
  if (requireFinalization) {
    const acceptedCommit = record.acceptedCommit.toLowerCase();
    invariant(/^[a-f0-9]{40}$/.test(acceptedCommit), `${recordPath} acceptedCommit must be a full 40-character Git commit`);
    verifyFinalizationRecord({
      currentCommit: acceptedCommit,
      evidenceDirectory: resolvedDirectory,
      pageId: record.pageId,
      projectRoot,
      runId,
      sourceFiles: Object.keys(record.sourceSha256),
    });
  }

  return {
    directory: resolvedDirectory,
    figma: record.figma,
    pageId: record.pageId,
    sourceFiles: Object.keys(record.sourceSha256),
    states: stateEvidence,
    status: 'passed',
  };
}

function parseCliArguments(argv) {
  let json = false;
  let projectRoot = process.cwd();
  const directories = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--project-root') {
      index += 1;
      invariant(argv[index], '--project-root requires a path');
      projectRoot = path.resolve(argv[index]);
    } else {
      directories.push(argument);
    }
  }
  invariant(directories.length > 0, 'Usage: node scripts/verify-design-acceptance-evidence.mjs [--json] <evidence-dir> [...]');
  return { directories, json, projectRoot };
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isCli) {
  try {
    const { directories, json, projectRoot } = parseCliArguments(process.argv.slice(2));
    const results = directories.map((directory) => verifyDesignAcceptanceEvidence(directory, { projectRoot }));
    if (json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const result of results) {
        console.log(`DOSO design acceptance evidence PASS: ${result.directory}`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
