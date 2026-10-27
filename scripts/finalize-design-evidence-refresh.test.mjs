import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { composeComparison, encodeRgbaPng } from './compose-design-comparison.mjs';
import { finalizeDesignEvidenceRefresh, parseArguments, runReleaseVerification } from './finalize-design-evidence-refresh.mjs';

const CURRENT_COMMIT = 'a'.repeat(40);
const FIGMA = { fileKey: 'fixtureFigmaKey', nodes: { light: '1:1', dark: '1:2', landscape: '1:3' } };
const STATES = [
  { id: 'light', width: 390, height: 844 },
  { id: 'dark', width: 390, height: 844 },
  { id: 'landscape', width: 844, height: 390 },
];

function canonicalSha(filePath) {
  const bytes = readFileSync(filePath);
  const canonical = new Set(['.json', '.md', '.txt']).has(path.extname(filePath))
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))
    : bytes;
  return createHash('sha256').update(canonical).digest('hex');
}

function patternedPixels(width, height, offset) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (x * 3 + y + offset) % 256;
      pixels[index + 1] = (x + y * 5 + offset * 2) % 256;
      pixels[index + 2] = (x * 7 + y * 2 + offset * 3) % 256;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createPageEvidence(projectRoot, outputRoot, pageId, { acceptedCommit = CURRENT_COMMIT } = {}) {
  const directory = path.join(outputRoot, pageId);
  mkdirSync(directory, { recursive: true });
  const files = {};
  for (const [stateIndex, state] of STATES.entries()) {
    const pixels = patternedPixels(state.width, state.height, stateIndex * 17);
    const figmaPath = path.join(directory, `figma-${state.id}.png`);
    const appPath = path.join(directory, `app-${state.id}.png`);
    const comparisonPath = path.join(directory, `comparison-${state.id}.png`);
    writeFileSync(figmaPath, encodeRgbaPng(state.width, state.height, pixels));
    writeFileSync(appPath, encodeRgbaPng(state.width, state.height, pixels));
    composeComparison(figmaPath, appPath, comparisonPath);
    for (const filePath of [figmaPath, appPath, comparisonPath]) files[path.basename(filePath)] = canonicalSha(filePath);
  }
  writeFileSync(path.join(directory, 'design-qa.md'), 'light=PASS\ndark=PASS\nlandscape=PASS\nP0/P1/P2 = 0\n\nfinal result: passed\n');
  writeFileSync(path.join(directory, 'verification.txt'), 'typecheck=PASS\npage-release-audit=PASS\n');
  writeFileSync(path.join(directory, 'app-capture.json'), `${JSON.stringify({
    schemaVersion: 1,
    pageId,
    runId: path.basename(outputRoot),
    state: 'default',
    source: 'development-android-design-qa',
    serial: 'emulator-fixture',
    files: Object.fromEntries(STATES.map(({ id, height, width }) => [`app-${id}.png`, { height, sha256: files[`app-${id}.png`], width }])),
  }, null, 2)}\n`);
  writeFileSync(path.join(directory, 'figma-export.json'), `${JSON.stringify({
    schemaVersion: 1,
    runId: path.basename(outputRoot),
    fileKey: FIGMA.fileKey,
    nodes: FIGMA.nodes,
    producer: 'figma-native-export',
    exportedAt: '2026-10-10T00:00:00+08:00',
    receipt: 'fixture source receipt',
    files: Object.fromEntries(STATES.map(({ id }) => [`figma-${id}.png`, { nodeId: FIGMA.nodes[id], sha256: files[`figma-${id}.png`] }])),
  }, null, 2)}\n`);
  writeFileSync(path.join(directory, 'critical-regions.json'), `${JSON.stringify({
    schemaVersion: 1,
    states: Object.fromEntries(STATES.map(({ id }) => [id, [
      { id: 'primary-action', rect: { x: 80, y: 80, width: 80, height: 80 } },
    ]])),
  }, null, 2)}\n`);
  writeFileSync(path.join(directory, 'layout-metrics.json'), `${JSON.stringify({
    schemaVersion: 1,
    states: Object.fromEntries(STATES.map(({ id }) => [id, [
      {
        id: 'primary-action',
        figma: { x: 88, y: 96, spacing: 16, fontSize: 16, lineHeight: 24 },
        app: { x: 90, y: 94, spacing: 18, fontSize: 17, lineHeight: 25 },
        touchTarget: { width: 48, height: 48 },
      },
    ]])),
  }, null, 2)}\n`);
  writeFileSync(path.join(directory, 'comparison-metadata.json'), `${JSON.stringify({
    schemaVersion: 1,
    thresholds: { mae: 12, delta16Percent: 15, delta32Percent: 8, ssim: 0.8 },
    metrics: Object.fromEntries(STATES.map(({ id }) => [id, { passed: true, mae: 0, delta16Percent: 0, delta32Percent: 0, ssim: 1 }])),
    files,
  }, null, 2)}\n`);
  const sourcePath = path.join(projectRoot, `${pageId}.tsx`);
  writeFileSync(sourcePath, `export const page = '${pageId}';\n`);
  const evidenceFiles = Object.keys(files).concat([
    'design-qa.md', 'verification.txt', 'app-capture.json', 'comparison-metadata.json',
    'critical-regions.json', 'figma-export.json', 'layout-metrics.json',
  ]);
  const evidenceSha256 = Object.fromEntries(evidenceFiles.map((filename) => [filename, canonicalSha(path.join(directory, filename))]));
  writeFileSync(path.join(directory, 'evidence.json'), `${JSON.stringify({
    schemaVersion: 1,
    pageId,
    acceptedAt: '2026-10-10T00:00:00+08:00',
    acceptedCommit,
    figma: FIGMA,
    visual: { light: 'PASS', dark: 'PASS', landscape: 'PASS' },
    findings: { P0: 0, P1: 0, P2: 0 },
    verification: {
      typecheck: { status: 'PASS', exitCode: 0 },
      pageReleaseAudit: { status: 'PASS', exitCode: 0, mode: 'design-audit', command: 'npm run test:release-gate:design-audit' },
    },
    evidenceSha256,
    sourceSha256: { [`${pageId}.tsx`]: canonicalSha(sourcePath) },
  }, null, 2)}\n`);
  return directory;
}

function fixture(pageIds = ['main-home']) {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'doso-finalize-evidence-'));
  const outputRoot = path.join(projectRoot, 'artifacts', 'design-acceptance', 'current-run');
  const manifestPath = path.join(projectRoot, 'docs', 'design', 'DESIGN_ACCEPTANCE_MANIFEST.json');
  const referenceIndexPath = path.join(projectRoot, 'docs', 'design', 'FIGMA_REFERENCE_INDEX.md');
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  const pages = pageIds.map((id) => ({
    id, status: 'stale', figma: FIGMA, sourceFiles: [`${id}.tsx`],
    evidenceDirectory: `artifacts/design-acceptance/history/${id}`,
    reason: 'historical evidence is stale',
  }));
  writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, pages }, null, 2)}\n`);
  writeFileSync(referenceIndexPath, pageIds.map((id) => `| 页面 \`${id}\` | [\`1:1\`](https://www.figma.com/design/fixtureFigmaKey?node-id=1-1) | [\`1:2\`](https://www.figma.com/design/fixtureFigmaKey?node-id=1-2) | [\`1:3\`](https://www.figma.com/design/fixtureFigmaKey?node-id=1-3) | \`artifacts/design-acceptance/history/${id}/figma-light.png\`<br>\`artifacts/design-acceptance/history/${id}/figma-dark.png\`<br>\`artifacts/design-acceptance/history/${id}/figma-landscape.png\` | **待复验**。历史证据：\`artifacts/design-acceptance/history/${id}/\`。 |`).join('\n'));
  return { manifestPath, outputRoot, pageIds, projectRoot, referenceIndexPath };
}

function snapshots(paths) {
  return [readFileSync(paths.manifestPath, 'utf8'), readFileSync(paths.referenceIndexPath, 'utf8')];
}

function passingRunner() {
  return {
    simulated: true,
    commands: [
      { id: 'typecheck', command: 'npm run typecheck', exitCode: 0, error: null, signal: null, startedAt: '2026-10-10T00:00:00+08:00', finishedAt: '2026-10-10T00:01:00+08:00', stdout: 'typecheck fixture', stderr: '' },
      { id: 'pageReleaseAudit', command: 'npm run test:release-gate:design-audit', exitCode: 0, error: null, signal: null, startedAt: '2026-10-10T00:01:00+08:00', finishedAt: '2026-10-10T00:02:00+08:00', stdout: 'audit fixture', stderr: '' },
    ],
  };
}

function finalize(paths, overrides = {}) {
  const runVerification = passingRunner;
  return finalizeDesignEvidenceRefresh({ ...paths, currentCommit: CURRENT_COMMIT, runVerification, ...overrides });
}

test('CLI requires explicit pages and never infers a zero-page refresh', () => {
  assert.throws(() => parseArguments(['--output-root', 'out']), /--pages is required/);
  assert.throws(() => parseArguments(['--output-root', 'out', '--pages', ',']), /at least one page/);
});

test('production runner invokes npm-cli.js through Node and preserves raw process output', () => {
  const calls = [];
  const execPath = 'C:\\Program Files\\nodejs\\node.exe';
  const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const result = runReleaseVerification({
    environment: { npm_execpath: npmCli },
    execPath,
    existsFile: filePath => filePath === npmCli,
    projectRoot: 'C:\\fixture',
    spawnSyncFn(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0, signal: null, stdout: `raw stdout ${calls.length}\r\n`, stderr: `raw stderr ${calls.length}\r\n` };
    },
  });
  assert.equal(result.simulated, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ executable }) => executable), [execPath, execPath]);
  assert.deepEqual(calls[0].args, [npmCli, 'run', 'typecheck']);
  assert.deepEqual(calls[1].args, [npmCli, 'run', 'test:release-gate:design-audit']);
  assert.equal(calls[0].options.cwd, 'C:\\fixture');
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(result.commands[0].stdout, 'raw stdout 1\r\n');
  assert.equal(result.commands[1].stderr, 'raw stderr 2\r\n');
});

test('missing current-run verification leaves manifest and index byte-identical', () => {
  const paths = fixture();
  const evidenceDirectory = createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  rmSync(path.join(evidenceDirectory, 'verification.txt'));
  const before = snapshots(paths);
  assert.throws(() => finalize(paths), /Required current-run evidence is missing/);
  assert.deepEqual(snapshots(paths), before);
});

test('old acceptedCommit cannot be washed into a current acceptance', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0], { acceptedCommit: 'b'.repeat(40) });
  const before = snapshots(paths);
  assert.throws(() => finalize(paths), /acceptedCommit must exactly match/);
  assert.deepEqual(snapshots(paths), before);
});

test('incomplete Android capture metadata cannot promote a page', () => {
  const paths = fixture();
  const directory = createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const capturePath = path.join(directory, 'app-capture.json');
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
  delete capture.serial;
  writeFileSync(capturePath, `${JSON.stringify(capture, null, 2)}\n`);
  const before = snapshots(paths);
  assert.throws(() => finalize(paths), /non-empty Android serial/);
  assert.deepEqual(snapshots(paths), before);
});

for (const [label, mutate, expected] of [
  ['missing', capture => { delete capture.runId; }, /runId must match current-run/],
  ['wrong', capture => { capture.runId = 'another-run'; }, /runId must match current-run/],
]) {
  test(`${label} Android capture runId cannot promote a page`, () => {
    const paths = fixture();
    const directory = createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
    const capturePath = path.join(directory, 'app-capture.json');
    const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
    mutate(capture);
    writeFileSync(capturePath, `${JSON.stringify(capture, null, 2)}\n`);
    const before = snapshots(paths);
    assert.throws(() => finalize(paths), expected);
    assert.deepEqual(snapshots(paths), before);
  });
}

test('Figma receipt must bind the manifest node and exact exported bytes', () => {
  const paths = fixture();
  const directory = createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const exportPath = path.join(directory, 'figma-export.json');
  const receipt = JSON.parse(readFileSync(exportPath, 'utf8'));
  receipt.files['figma-light.png'].nodeId = '9:9';
  writeFileSync(exportPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const before = snapshots(paths);
  assert.throws(() => finalize(paths), /nodeId does not match/);
  assert.deepEqual(snapshots(paths), before);
});

test('one failing page prevents every manifest and index update', () => {
  const paths = fixture(['main-home', 'main-tasks']);
  createPageEvidence(paths.projectRoot, paths.outputRoot, 'main-home');
  const invalid = createPageEvidence(paths.projectRoot, paths.outputRoot, 'main-tasks');
  writeFileSync(path.join(invalid, 'verification.txt'), 'typecheck=FAIL\n');
  const before = snapshots(paths);
  assert.throws(() => finalize(paths), /stale or tampered|failing/);
  assert.deepEqual(snapshots(paths), before);
});

test('validated stale evidence alone promotes an explicitly selected page', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const result = finalize(paths);
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  const referenceIndex = readFileSync(paths.referenceIndexPath, 'utf8');
  assert.deepEqual(result.refreshed.map(({ id }) => id), ['main-home']);
  assert.equal(manifest.pages[0].status, 'passed');
  assert.equal(manifest.pages[0].evidenceDirectory, 'artifacts/design-acceptance/current-run/main-home');
  assert.match(referenceIndex, /\*\*通过\*\*/);
  assert.match(referenceIndex, /current-run\/main-home/);
  assert.doesNotMatch(referenceIndex, /history|待复验/);
  const finalization = JSON.parse(readFileSync(path.join(paths.outputRoot, 'finalization-verification.json'), 'utf8'));
  assert.equal(finalization.simulated, true);
  assert.match(finalization.note, /TEST ONLY/);
  assert.equal(finalization.sourceComparisonBefore['main-home']['main-home.tsx'].matches, true);
  assert.deepEqual(finalization.sourceComparison, finalization.sourceComparisonBefore);
});

test('source comparison uses the same canonical CRLF hashing as the central verifier', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const sourcePath = path.join(paths.projectRoot, 'main-home.tsx');
  writeFileSync(sourcePath, readFileSync(sourcePath, 'utf8').replace(/\n/g, '\r\n'));
  assert.doesNotThrow(() => finalize(paths));
});

test('failed release verification preserves manifest and index byte-for-byte', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const before = snapshots(paths);
  const runVerification = () => ({
    simulated: true,
    commands: [
      { id: 'typecheck', command: 'npm run typecheck', exitCode: 0, error: null, signal: null, startedAt: '2026-10-10T00:00:00+08:00', finishedAt: '2026-10-10T00:01:00+08:00', stdout: '', stderr: '' },
      { id: 'pageReleaseAudit', command: 'npm run test:release-gate:design-audit', exitCode: 1, error: null, signal: null, startedAt: '2026-10-10T00:01:00+08:00', finishedAt: '2026-10-10T00:02:00+08:00', stdout: '', stderr: 'failed fixture' },
    ],
  });
  assert.throws(() => finalize(paths, { runVerification }), /release-gate:design-audit failed/);
  assert.deepEqual(snapshots(paths), before);
  const record = JSON.parse(readFileSync(path.join(paths.outputRoot, 'finalization-verification.json'), 'utf8'));
  assert.equal(record.commands[1].exitCode, 1);
});

test('source mutation during release verification blocks promotion', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const before = snapshots(paths);
  const runVerification = () => {
    writeFileSync(path.join(paths.projectRoot, 'main-home.tsx'), "export const page = 'changed-during-run';\n");
    return {
      simulated: true,
      commands: [
        { id: 'typecheck', command: 'npm run typecheck', exitCode: 0, error: null, signal: null, startedAt: '2026-10-10T00:00:00+08:00', finishedAt: '2026-10-10T00:01:00+08:00', stdout: '', stderr: '' },
        { id: 'pageReleaseAudit', command: 'npm run test:release-gate:design-audit', exitCode: 0, error: null, signal: null, startedAt: '2026-10-10T00:01:00+08:00', finishedAt: '2026-10-10T00:02:00+08:00', stdout: '', stderr: '' },
      ],
    };
  };
  assert.throws(() => finalize(paths, { runVerification }), /source changed during finalization verification/);
  assert.deepEqual(snapshots(paths), before);
  const record = JSON.parse(readFileSync(path.join(paths.outputRoot, 'finalization-verification.json'), 'utf8'));
  assert.equal(record.sourceComparisonBefore['main-home']['main-home.tsx'].matches, true);
  assert.equal(record.sourceComparison['main-home']['main-home.tsx'].matches, false);
});

test('an index update during release verification is preserved and blocks promotion', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const concurrentIndex = `${readFileSync(paths.referenceIndexPath, 'utf8')}\nconcurrent update\n`;
  const manifestBefore = readFileSync(paths.manifestPath, 'utf8');
  const runVerification = () => {
    writeFileSync(paths.referenceIndexPath, concurrentIndex);
    return passingRunner();
  };
  assert.throws(() => finalize(paths, { runVerification }), /Figma reference index changed during finalization verification/);
  assert.equal(readFileSync(paths.manifestPath, 'utf8'), manifestBefore);
  assert.equal(readFileSync(paths.referenceIndexPath, 'utf8'), concurrentIndex);
});

test('a second publish rename failure rolls both manifest and index back', () => {
  const paths = fixture();
  createPageEvidence(paths.projectRoot, paths.outputRoot, paths.pageIds[0]);
  const before = snapshots(paths);
  let publicationRenames = 0;
  const renameFile = (source, destination) => {
    const publishing = destination === paths.manifestPath || destination === paths.referenceIndexPath;
    if (publishing && ++publicationRenames === 2) throw new Error('injected second publish rename failure');
    return renameSync(source, destination);
  };
  assert.throws(() => finalize(paths, { renameFile }), /injected second publish rename failure/);
  assert.deepEqual(snapshots(paths), before);
});
