import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { calculateDecodedComparisonMetrics } from './design-acceptance-metrics.mjs';
import { decodePng, readPngDimensions, verifyDesignAcceptanceEvidence } from './verify-design-acceptance-evidence.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ACCEPTED_COMMIT = '0123456789abcdef0123456789abcdef01234567';

test('canonical thresholds use raw values instead of rounded report values', () => {
  const width = 100;
  const height = 100;
  const reference = { width, height, pixels: Buffer.alloc(width * height * 4) };
  const actual = { width, height, pixels: Buffer.alloc(width * height * 4) };
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      reference.pixels[pixel * 4 + channel] = 128;
      actual.pixels[pixel * 4 + channel] = 140;
    }
    reference.pixels[pixel * 4 + 3] = 255;
    actual.pixels[pixel * 4 + 3] = 255;
  }
  actual.pixels[0] = 141;
  const metrics = calculateDecodedComparisonMetrics(reference, actual, { maskDynamicSystemBars: false });
  assert.equal(metrics.mae, 12);
  assert.equal(metrics.passed, false);
});

test('critical-region SSIM threshold uses raw values instead of rounded report values', () => {
  const width = 44;
  const height = 44;
  const reference = { width, height, pixels: Buffer.alloc(width * height * 4) };
  const actual = { width, height, pixels: Buffer.alloc(width * height * 4) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const expected = (x * 7 + y * 11) % 256;
      const observed = Math.round(expected * 0.625 + 128 * 0.375);
      for (let channel = 0; channel < 3; channel += 1) {
        reference.pixels[offset + channel] = expected;
        actual.pixels[offset + channel] = observed;
      }
      reference.pixels[offset + 3] = 255;
      actual.pixels[offset + 3] = 255;
    }
  }
  const metrics = calculateDecodedComparisonMetrics(reference, actual, {
    maskDynamicSystemBars: false,
    ssimThreshold: 0.9,
  });
  assert.equal(metrics.ssim, 0.8996);
  assert.equal(metrics.ssimPassed, false);
});

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

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32([typeBuffer, data]), 8 + data.length);
  return chunk;
}

function encodeRgbaPng(width, height, pixelAt) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [red, green, blue, alpha = 255] = pixelAt(x, y);
      scanlines[pixelOffset] = red;
      scanlines[pixelOffset + 1] = green;
      scanlines[pixelOffset + 2] = blue;
      scanlines[pixelOffset + 3] = alpha;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeRawRgbaPng(width, height, inflatedPayload) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(inflatedPayload)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function figmaPixel(x, y, scale, stateOffset) {
  const targetX = Math.floor(x / scale);
  const targetY = Math.floor(y / scale);
  return [
    (targetX * 3 + targetY + stateOffset) % 256,
    (targetX + targetY * 5 + stateOffset * 2) % 256,
    (targetX * 7 + targetY * 2 + stateOffset * 3) % 256,
    255,
  ];
}

function appPixel(x, y, stateOffset) {
  const [red, green, blue] = figmaPixel(x, y, 1, stateOffset);
  return [Math.min(255, red + 1), Math.max(0, green - 1), Math.min(255, blue + 2), 255];
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function verifyFixture(directory) {
  return verifyDesignAcceptanceEvidence(directory, { projectRoot: directory });
}

function createPassingEvidence() {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'doso-design-evidence-'));
  const directory = path.join(runRoot, 'fixture-page');
  mkdirSync(directory);
  const runId = path.basename(runRoot);
  const states = [
    { id: 'light', width: 390, height: 844, figmaScale: 1 },
    { id: 'dark', width: 390, height: 844, figmaScale: 1 },
    { id: 'landscape', width: 844, height: 390, figmaScale: 1 },
  ];

  states.forEach((state, stateIndex) => {
    const stateOffset = stateIndex * 17;
    writeFileSync(
      path.join(directory, `figma-${state.id}.png`),
      encodeRgbaPng(
        state.width * state.figmaScale,
        state.height * state.figmaScale,
        (x, y) => figmaPixel(x, y, state.figmaScale, stateOffset),
      ),
    );
    writeFileSync(
      path.join(directory, `app-${state.id}.png`),
      encodeRgbaPng(state.width, state.height, (x, y) => appPixel(x, y, stateOffset)),
    );
    writeFileSync(
      path.join(directory, `comparison-${state.id}.png`),
      encodeRgbaPng(state.width * 2, state.height, (x, y) => (
        x < state.width
          ? figmaPixel(x, y, 1, stateOffset)
          : appPixel(x - state.width, y, stateOffset)
      )),
    );
  });

  const criticalRegions = {
    schemaVersion: 1,
    states: Object.fromEntries(states.map(({ id }) => [id, [
      { id: 'primary-action', rect: { x: 80, y: 80, width: 80, height: 80 } },
    ]])),
  };
  const layoutMetrics = {
    schemaVersion: 1,
    states: Object.fromEntries(states.map(({ id }) => [id, [
      {
        id: 'primary-action',
        figma: { x: 88, y: 96, spacing: 16, fontSize: 16, lineHeight: 24 },
        app: { x: 90, y: 94, spacing: 18, fontSize: 17, lineHeight: 25 },
        touchTarget: { width: 48, height: 48 },
      },
    ]])),
  };
  writeFileSync(path.join(directory, 'critical-regions.json'), JSON.stringify(criticalRegions, null, 2));
  writeFileSync(path.join(directory, 'layout-metrics.json'), JSON.stringify(layoutMetrics, null, 2));
  writeFileSync(path.join(directory, 'app-capture.json'), JSON.stringify({
    schemaVersion: 1,
    pageId: 'fixture-page',
    runId,
    serial: 'emulator-fixture',
    source: 'development-android-design-qa',
    state: 'default',
    files: Object.fromEntries(states.map(({ id, width, height }) => {
      const filename = `app-${id}.png`;
      return [filename, { width, height, sha256: sha256(path.join(directory, filename)) }];
    })),
  }, null, 2));
  const figmaNodes = { light: '1:1', dark: '1:2', landscape: '1:3' };
  writeFileSync(path.join(directory, 'figma-export.json'), JSON.stringify({
    schemaVersion: 1,
    runId,
    fileKey: 'fixtureFigmaKey',
    producer: 'figma-native-export',
    exportedAt: '2026-08-26T11:00:00+08:00',
    receipt: 'fixture native export receipt',
    nodes: figmaNodes,
    files: Object.fromEntries(states.map(({ id }) => {
      const filename = `figma-${id}.png`;
      return [filename, { nodeId: figmaNodes[id], sha256: sha256(path.join(directory, filename)) }];
    })),
  }, null, 2));
  writeFileSync(path.join(directory, 'comparison-metadata.json'), JSON.stringify({
    schemaVersion: 1,
    thresholds: { mae: 12, delta16Percent: 15, delta32Percent: 8, ssim: 0.8 },
    metrics: Object.fromEntries(states.map(({ id }) => [id, {
      mae: 0,
      delta16Percent: 0,
      delta32Percent: 0,
      ssim: 1,
      passed: true,
    }])),
  }, null, 2));

  writeFileSync(path.join(directory, 'design-qa.md'), [
    '# QA',
    'light=PASS',
    'dark=PASS',
    'landscape=PASS',
    'P0/P1/P2 = 0',
    '',
    'final result: passed',
  ].join('\n'));
  writeFileSync(path.join(directory, 'verification.txt'), 'typecheck=PASS\npage-release-audit=PASS\n');
  writeFileSync(path.join(directory, 'screen.tsx'), 'export const screen = true;\n');
  const evidenceFiles = states.flatMap((state) => [
    `figma-${state.id}.png`,
    `app-${state.id}.png`,
    `comparison-${state.id}.png`,
  ]).concat(['app-capture.json', 'critical-regions.json', 'figma-export.json', 'layout-metrics.json', 'comparison-metadata.json', 'design-qa.md', 'verification.txt']);
  const evidenceSha256 = Object.fromEntries(evidenceFiles.map((filename) => [filename, sha256(path.join(directory, filename))]));
  writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    pageId: 'fixture-page',
    acceptedAt: '2026-08-26T12:00:00+08:00',
    acceptedCommit: ACCEPTED_COMMIT,
    figma: {
      fileKey: 'fixtureFigmaKey',
      nodes: figmaNodes,
    },
    visual: { light: 'PASS', dark: 'PASS', landscape: 'PASS' },
    findings: { P0: 0, P1: 0, P2: 0 },
    verification: {
      typecheck: { status: 'PASS', exitCode: 0 },
      pageReleaseAudit: {
        status: 'PASS',
        exitCode: 0,
        mode: 'design-audit',
        command: 'npm run test:release-gate:design-audit',
      },
    },
    evidenceSha256,
    sourceSha256: { 'screen.tsx': sha256(path.join(directory, 'screen.tsx')) },
  }, null, 2));
  const sourceHash = sha256(path.join(directory, 'screen.tsx'));
  const sourceComparison = {
    'fixture-page': {
      'screen.tsx': { current: sourceHash, matches: true, recorded: sourceHash },
    },
  };
  writeFileSync(path.join(runRoot, 'finalization-verification.json'), JSON.stringify({
    schemaVersion: 1,
    simulated: false,
    runId,
    pageIds: ['fixture-page'],
    currentCommit: ACCEPTED_COMMIT,
    commands: [
      { id: 'typecheck', command: 'npm run typecheck', exitCode: 0, error: null, signal: null },
      { id: 'pageReleaseAudit', command: 'npm run test:release-gate:design-audit', exitCode: 0, error: null, signal: null },
    ],
    sourceComparisonBefore: sourceComparison,
    sourceComparison,
  }, null, 2));
  return directory;
}

function refreshEvidenceHashes(directory, filenames) {
  const recordPath = path.join(directory, 'evidence.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  for (const filename of filenames) record.evidenceSha256[filename] = sha256(path.join(directory, filename));
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
}

function rewriteLightAppAndComparison(directory, pixelAt) {
  writeFileSync(path.join(directory, 'app-light.png'), encodeRgbaPng(390, 844, pixelAt));
  writeFileSync(
    path.join(directory, 'comparison-light.png'),
    encodeRgbaPng(780, 844, (x, y) => (
      x < 390 ? figmaPixel(x, y, 1, 0) : pixelAt(x - 390, y)
    )),
  );
  refreshEvidenceHashes(directory, ['app-light.png', 'comparison-light.png']);
}

test('reads PNG IHDR dimensions without an image dependency', () => {
  const directory = createPassingEvidence();
  const filePath = path.join(directory, 'app-light.png');
  assert.deepEqual(readPngDimensions(filePath), { width: 390, height: 844 });
});

test('accepts canonical text hashes after a CRLF checkout', () => {
  const directory = createPassingEvidence();
  for (const filename of ['design-qa.md', 'verification.txt', 'screen.tsx']) {
    const filePath = path.join(directory, filename);
    writeFileSync(filePath, readFileSync(filePath, 'utf8').replace(/\n/g, '\r\n'));
  }
  assert.equal(verifyFixture(directory).status, 'passed');
});

test('rejects oversized PNG dimensions before inflating image data', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'doso-design-evidence-png-limit-'));
  const filePath = path.join(directory, 'oversized.png');
  writeFileSync(filePath, encodeRawRgbaPng(4097, 1, Buffer.from([0, 0, 0, 0, 0])));
  assert.throws(() => decodePng(filePath), /dimensions exceed the evidence limit/);
});

test('caps inflated PNG output at the exact scanline payload length', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'doso-design-evidence-png-output-'));
  const filePath = path.join(directory, 'overflow.png');
  const expectedLength = (390 * 4 + 1) * 844;
  writeFileSync(filePath, encodeRawRgbaPng(390, 844, Buffer.alloc(expectedLength + 1)));
  assert.throws(() => decodePng(filePath), /PNG IDAT data cannot be decoded/);
});

test('accepts complete three-state evidence with same-size comparisons', () => {
  const directory = createPassingEvidence();
  const result = verifyFixture(directory);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.states.landscape.comparison, { width: 1688, height: 390, gap: 0 });
  assert.equal(result.states.light.fullFrameMetrics.passed, true);
  assert.equal(result.states.light.criticalRegions[0].id, 'primary-action');
});

test('accepts a finalized evidence commit even when unrelated repository HEAD may move', () => {
  const directory = createPassingEvidence();
  const result = verifyFixture(directory);
  assert.equal(result.status, 'passed');
});

test('rejects 2x Figma pixels in the formal acceptance path', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'figma-light.png'), encodeRgbaPng(780, 1688, (x, y) => figmaPixel(x, y, 2, 0)));
  assert.throws(() => verifyFixture(directory), /figma-light\.png must be exactly 390x844 for formal acceptance/);
});

test('rejects a comparison gutter in the formal acceptance path', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'comparison-light.png'), encodeRgbaPng(781, 844, (x, y) => (
    x < 390 ? figmaPixel(x, y, 1, 0) : appPixel(Math.min(389, x - 391), y, 0)
  )));
  assert.throws(() => verifyFixture(directory), /comparison-light\.png must contain exactly two 390x844 panels without a divider/);
});

test('rejects evidence without Android capture provenance', () => {
  const directory = createPassingEvidence();
  rmSync(path.join(directory, 'app-capture.json'));
  assert.throws(() => verifyFixture(directory), /Missing required evidence file: .*app-capture\.json/);
});

test('rejects evidence without a finalization record', () => {
  const directory = createPassingEvidence();
  rmSync(path.join(path.dirname(directory), 'finalization-verification.json'));
  assert.throws(() => verifyFixture(directory), /Missing required evidence file: .*finalization-verification\.json/);
});

test('rejects a simulated finalization record', () => {
  const directory = createPassingEvidence();
  const recordPath = path.join(path.dirname(directory), 'finalization-verification.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.simulated = true;
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
  assert.throws(() => verifyFixture(directory), /must record simulated=false/);
});

test('rejects a finalization source mismatch', () => {
  const directory = createPassingEvidence();
  const recordPath = path.join(path.dirname(directory), 'finalization-verification.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.sourceComparison['fixture-page']['screen.tsx'].current = 'f'.repeat(64);
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
  assert.throws(() => verifyFixture(directory), /does not match the current canonical source hash/);
});

test('rejects low full-frame similarity even when visual and comparison metadata claim PASS', () => {
  const directory = createPassingEvidence();
  rewriteLightAppAndComparison(directory, (x, y) => {
    const [red, green, blue] = figmaPixel(x, y, 1, 0);
    return [255 - red, 255 - green, 255 - blue, 255];
  });
  assert.throws(() => verifyFixture(directory), /light full-frame comparison failed canonical thresholds/);
});

test('rejects a critical region below SSIM 0.90 even when the full frame passes', () => {
  const directory = createPassingEvidence();
  rewriteLightAppAndComparison(directory, (x, y) => {
    if (x >= 80 && x < 160 && y >= 80 && y < 160) {
      const [red, green, blue] = figmaPixel(x, y, 1, 0);
      return [255 - red, 255 - green, 255 - blue, 255];
    }
    return appPixel(x, y, 0);
  });
  assert.throws(() => verifyFixture(directory), /light critical region primary-action SSIM .* is below 0\.9/);
});

test('rejects critical-region raw SSIM below 0.90 even when the reported value rounds to 0.9000', () => {
  const directory = createPassingEvidence();
  rewriteLightAppAndComparison(directory, (x, y) => {
    if (x >= 80 && x < 160 && y >= 80 && y < 160) {
      const expected = figmaPixel(x, y, 1, 0);
      const regionIndex = (y - 80) * 80 + x - 80;
      const blend = regionIndex < 4860 ? 0.374 : 0.373;
      return [
        Math.round(expected[0] * (1 - blend) + 128 * blend),
        Math.round(expected[1] * (1 - blend) + 128 * blend),
        Math.round(expected[2] * (1 - blend) + 128 * blend),
        255,
      ];
    }
    return appPixel(x, y, 0);
  });
  assert.throws(() => verifyFixture(directory), /light critical region primary-action SSIM 0\.9 is below 0\.9/);
});

test('rejects a critical layout position delta above 4dp', () => {
  const directory = createPassingEvidence();
  const metricsPath = path.join(directory, 'layout-metrics.json');
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  metrics.states.light[0].app.x = metrics.states.light[0].figma.x + 5;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  refreshEvidenceHashes(directory, ['layout-metrics.json']);
  assert.throws(() => verifyFixture(directory), /light primary-action x delta 5dp exceeds 4dp/);
});

test('rejects a critical layout font-size delta above 1sp', () => {
  const directory = createPassingEvidence();
  const metricsPath = path.join(directory, 'layout-metrics.json');
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  metrics.states.light[0].app.fontSize = metrics.states.light[0].figma.fontSize + 2;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  refreshEvidenceHashes(directory, ['layout-metrics.json']);
  assert.throws(() => verifyFixture(directory), /light primary-action fontSize delta 2sp exceeds 1sp/);
});

test('rejects a critical touch target below 44dp', () => {
  const directory = createPassingEvidence();
  const metricsPath = path.join(directory, 'layout-metrics.json');
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  metrics.states.light[0].touchTarget.width = 43;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  refreshEvidenceHashes(directory, ['layout-metrics.json']);
  assert.throws(() => verifyFixture(directory), /light primary-action touch target 43x48dp is below 44dp/);
});

test('rejects missing critical regions', () => {
  const directory = createPassingEvidence();
  const regionsPath = path.join(directory, 'critical-regions.json');
  const regions = JSON.parse(readFileSync(regionsPath, 'utf8'));
  regions.states.light = [];
  writeFileSync(regionsPath, JSON.stringify(regions, null, 2));
  refreshEvidenceHashes(directory, ['critical-regions.json']);
  assert.throws(() => verifyFixture(directory), /must record at least one light critical region/);
});

test('rejects a missing comparison image', () => {
  const directory = createPassingEvidence();
  rmSync(path.join(directory, 'comparison-light.png'));
  assert.throws(
    () => verifyFixture(directory),
    /Missing required evidence file: .*comparison-light\.png/,
  );
});

test('rejects a comparison whose two sides are not normalized to the target viewport', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'comparison-dark.png'), encodeRgbaPng(780, 1688, () => [0, 0, 0, 255]));
  assert.throws(
    () => verifyFixture(directory),
    /comparison-dark\.png must contain two 390x844 horizontal panels/,
  );
});

test('rejects a truncated PNG with no valid IDAT or IEND chunks', () => {
  const directory = createPassingEvidence();
  const truncated = Buffer.alloc(33);
  PNG_SIGNATURE.copy(truncated, 0);
  truncated.writeUInt32BE(13, 8);
  truncated.write('IHDR', 12, 'ascii');
  truncated.writeUInt32BE(780, 16);
  truncated.writeUInt32BE(844, 20);
  writeFileSync(path.join(directory, 'comparison-light.png'), truncated);
  assert.throws(() => verifyFixture(directory), /invalid CRC|missing IDAT|missing IEND/i);
});

test('rejects a same-size comparison that duplicates the App instead of composing Figma and App', () => {
  const directory = createPassingEvidence();
  writeFileSync(
    path.join(directory, 'comparison-light.png'),
    encodeRgbaPng(780, 844, (x, y) => appPixel(x % 390, y, 0)),
  );
  assert.throws(() => verifyFixture(directory), /left half must be pixel-identical/);
});

test('rejects a comparison whose matching RGB pixels are fully transparent', () => {
  const directory = createPassingEvidence();
  writeFileSync(
    path.join(directory, 'comparison-light.png'),
    encodeRgbaPng(780, 844, (x, y) => {
      const [red, green, blue] = x < 390
        ? figmaPixel(x, y, 1, 0)
        : appPixel(x - 390, y, 0);
      return [red, green, blue, 0];
    }),
  );
  assert.throws(() => verifyFixture(directory), /right half must be pixel-identical|left half does not match normalized/);
});

test('rejects a localized opaque patch on the Figma half of a comparison', () => {
  const directory = createPassingEvidence();
  writeFileSync(
    path.join(directory, 'comparison-light.png'),
    encodeRgbaPng(780, 844, (x, y) => {
      if (x < 80 && y < 80) return [255, 0, 255, 255];
      return x < 390
        ? figmaPixel(x, y, 1, 0)
        : appPixel(x - 390, y, 0);
    }),
  );
  assert.throws(() => verifyFixture(directory), /left half must be pixel-identical/);
});

test('rejects QA notes that do not prove P0, P1, and P2 are zero', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'design-qa.md'), [
    'light PASS',
    'dark PASS',
    'landscape PASS',
    'P0 = 0',
    'P1 = 0',
    '',
    'final result: passed',
  ].join('\n'));
  assert.throws(() => verifyFixture(directory), /must record P2 = 0/);
});

test('rejects contradictory non-zero priority findings even when a later line says zero', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'design-qa.md'), [
    'light=PASS',
    'dark=PASS',
    'landscape=PASS',
    'P2 = 99',
    'P0/P1/P2 = 0',
    '',
    'final result: passed',
  ].join('\n'));
  assert.throws(() => verifyFixture(directory), /non-zero P2 result/);
});

test('rejects a state mention that is not explicitly paired with PASS', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'design-qa.md'), [
    'light reviewed',
    'dark reviewed',
    'landscape reviewed',
    'P0/P1/P2 = 0',
    '',
    'final result: passed',
  ].join('\n'));
  assert.throws(() => verifyFixture(directory), /must record light = PASS/);
});

test('rejects QA notes without the exact terminal pass marker', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'design-qa.md'), [
    'light PASS',
    'dark PASS',
    'landscape PASS',
    'P0/P1/P2 = 0',
    '',
    'final result: in progress',
  ].join('\n'));
  assert.throws(() => verifyFixture(directory), /must end with exact text/);
});

test('rejects verification logs that contain FAIL even if another check says PASS', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'verification.txt'), 'typecheck=PASS\nrelease-gate=FAIL\n');
  assert.throws(() => verifyFixture(directory), /contains a failing, skipped, or bypassed verification/);
});

test('rejects BYPASS text instead of an exact successful release gate', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'verification.txt'), 'typecheck=PASS\nrelease-gate=BYPASS\n');
  assert.throws(() => verifyFixture(directory), /contains a failing, skipped, or bypassed verification/);
});

test('rejects a page release audit record with a non-audit command', () => {
  const directory = createPassingEvidence();
  const recordPath = path.join(directory, 'evidence.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.verification.pageReleaseAudit.command = 'npm run test:release-gate';
  writeFileSync(recordPath, JSON.stringify(record));
  assert.throws(() => verifyFixture(directory), /pageReleaseAudit\.command is invalid/);
});

test('rejects valid-looking evidence that was changed after its SHA-256 record', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'verification.txt'), 'typecheck=PASS\nrelease-gate=PASS\nrecheck=PASS\n');
  assert.throws(() => verifyFixture(directory), /verification\.txt SHA-256 mismatch/);
});

test('rejects evidence after a bound page source file changes', () => {
  const directory = createPassingEvidence();
  writeFileSync(path.join(directory, 'screen.tsx'), 'export const screen = false;\n');
  assert.throws(() => verifyFixture(directory), /screen\.tsx changed after acceptance/);
});
