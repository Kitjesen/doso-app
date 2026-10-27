import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyAndroidCapture, verifyFigmaExport } from './design-acceptance-provenance.mjs';
import { verifyDesignAcceptanceEvidence } from './verify-design-acceptance-evidence.mjs';

const STATES = Object.freeze(['light', 'dark', 'landscape']);
const THRESHOLDS = Object.freeze({ mae: 12, delta16Percent: 15, delta32Percent: 8, ssim: 0.8 });
const CANONICAL_TEXT_HASH_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.mts', '.ps1', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const EXTRA_CURRENT_RUN_FILES = Object.freeze([
  'app-capture.json',
  'comparison-metadata.json',
  'critical-regions.json',
  'figma-export.json',
  'layout-metrics.json',
]);
const VERIFICATION_COMMANDS = Object.freeze([
  Object.freeze({ id: 'typecheck', args: Object.freeze(['run', 'typecheck']), command: 'npm run typecheck' }),
  Object.freeze({ id: 'pageReleaseAudit', args: Object.freeze(['run', 'test:release-gate:design-audit']), command: 'npm run test:release-gate:design-audit' }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function required(filePath) {
  invariant(existsSync(filePath) && statSync(filePath).isFile(), `Required current-run evidence is missing: ${filePath}`);
  return filePath;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function canonicalSha256(filePath) {
  const bytes = readFileSync(filePath);
  const canonical = CANONICAL_TEXT_HASH_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes;
  return createHash('sha256').update(canonical).digest('hex');
}

function parsePageIds(value) {
  const pageIds = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  invariant(pageIds.length > 0, '--pages must name at least one page');
  invariant(new Set(pageIds).size === pageIds.length, '--pages must not contain duplicate page IDs');
  for (const pageId of pageIds) invariant(/^[a-z0-9-]+$/.test(pageId), `Invalid page ID: ${pageId}`);
  return pageIds;
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name, inlineValue] = argument.split('=', 2);
    invariant(name.startsWith('--'), `Unexpected argument: ${argument}`);
    invariant(['--output-root', '--pages', '--project-root'].includes(name), `Unknown argument: ${name}`);
    const value = inlineValue ?? argv[++index];
    invariant(value, `${name} requires a value`);
    invariant(options[name] === undefined, `${name} may only be provided once`);
    options[name] = value;
  }
  invariant(options['--output-root'], '--output-root is required');
  invariant(options['--pages'], '--pages is required; evidence refresh never infers pages from status');
  return {
    outputRoot: path.resolve(options['--output-root']),
    pageIds: parsePageIds(options['--pages']),
    projectRoot: path.resolve(options['--project-root'] ?? process.cwd()),
  };
}

function verifyMetrics(outputDirectory) {
  const metadataPath = required(path.join(outputDirectory, 'comparison-metadata.json'));
  const metadata = readJson(metadataPath);
  invariant(metadata?.schemaVersion === 1, `${metadataPath} must use schemaVersion 1`);
  for (const [key, expected] of Object.entries(THRESHOLDS)) {
    invariant(metadata.thresholds?.[key] === expected, `${metadataPath} must record the canonical ${key} threshold ${expected}`);
  }
  for (const state of STATES) {
    const metric = metadata.metrics?.[state];
    invariant(metric?.passed === true, `${state} comparison did not pass in ${metadataPath}`);
    invariant(Number.isFinite(metric.mae) && metric.mae <= THRESHOLDS.mae, `${state} MAE exceeds ${THRESHOLDS.mae}`);
    invariant(Number.isFinite(metric.delta16Percent) && metric.delta16Percent <= THRESHOLDS.delta16Percent, `${state} delta16 exceeds ${THRESHOLDS.delta16Percent}%`);
    invariant(Number.isFinite(metric.delta32Percent) && metric.delta32Percent <= THRESHOLDS.delta32Percent, `${state} delta32 exceeds ${THRESHOLDS.delta32Percent}%`);
    invariant(Number.isFinite(metric.ssim) && metric.ssim >= THRESHOLDS.ssim, `${state} SSIM is below ${THRESHOLDS.ssim}`);
    for (const kind of ['figma', 'app', 'comparison']) {
      const filename = `${kind}-${state}.png`;
      invariant(metadata.files?.[filename] === canonicalSha256(required(path.join(outputDirectory, filename))), `${metadataPath} has a stale ${filename} hash`);
    }
  }
  return metadata;
}

function verifyCurrentRunFiles(outputDirectory, page, record, runId) {
  verifyAndroidCapture(outputDirectory, { pageId: page.id, runId });
  // Provenance cross-check only; this receipt is not unforgeable external authentication.
  verifyFigmaExport(outputDirectory, { figma: page.figma, runId });
  verifyMetrics(outputDirectory);
  for (const filename of EXTRA_CURRENT_RUN_FILES) {
    const expected = record.evidenceSha256?.[filename];
    invariant(typeof expected === 'string' && /^[a-f0-9]{64}$/i.test(expected), `${page.id} evidence.json must hash current-run ${filename}`);
    invariant(canonicalSha256(required(path.join(outputDirectory, filename))) === expected.toLowerCase(), `${page.id} current-run ${filename} hash is stale or tampered`);
  }
}

function verifyCandidate({ currentCommit, outputDirectory, page, projectRoot, runId }) {
  required(path.join(outputDirectory, 'design-qa.md'));
  required(path.join(outputDirectory, 'verification.txt'));
  const recordPath = required(path.join(outputDirectory, 'evidence.json'));
  const record = readJson(recordPath);
  invariant(String(record.acceptedCommit ?? '').toLowerCase() === currentCommit, `${page.id} acceptedCommit must exactly match the current 40-character repository commit`);
  verifyCurrentRunFiles(outputDirectory, page, record, runId);
  // This is the sole pre-finalization caller. Manifest/CLI verification keeps
  // the central verifier's default finalization-record requirement enabled.
  const result = verifyDesignAcceptanceEvidence(outputDirectory, { projectRoot, requireFinalization: false });
  invariant(result.status === 'passed', `${page.id} evidence did not pass`);
  invariant(result.pageId === page.id, `${page.id} evidence belongs to ${result.pageId}`);
  invariant(result.figma.fileKey === page.figma.fileKey, `${page.id} Figma fileKey does not match the manifest`);
  for (const state of STATES) invariant(result.figma.nodes[state] === page.figma.nodes[state], `${page.id} ${state} Figma node does not match the manifest`);
  const missingSources = page.sourceFiles.filter((sourceFile) => !result.sourceFiles.includes(sourceFile));
  const extraSources = result.sourceFiles.filter((sourceFile) => !page.sourceFiles.includes(sourceFile));
  invariant(missingSources.length === 0, `${page.id} evidence is missing declared source files: ${missingSources.join(', ')}`);
  invariant(extraSources.length === 0, `${page.id} evidence contains undeclared source files: ${extraSources.join(', ')}`);
  return { record, result };
}

function updateReferenceRow(referenceIndex, pageId, evidenceDirectory) {
  const lines = referenceIndex.split(/\r?\n/);
  const matches = lines.map((line, index) => ({ index, line })).filter(({ line }) => line.startsWith('|') && line.includes(`\`${pageId}\``));
  invariant(matches.length === 1, `Figma reference index must contain exactly one row for ${pageId}`);
  const { index, line } = matches[0];
  const cells = line.split('|');
  invariant(cells.length >= 8, `Figma reference index row is malformed for ${pageId}`);
  cells[5] = ` \`${evidenceDirectory}/figma-light.png\`<br>\`${evidenceDirectory}/figma-dark.png\`<br>\`${evidenceDirectory}/figma-landscape.png\` `;
  cells[6] = ` **通过**。当前源码三态、QA、验证记录、像素门槛与源码哈希均通过强证据校验。完整证据：\`${evidenceDirectory}/\`。 `;
  lines[index] = `${cells.slice(0, 7).join('|')}|`;
  return lines.join('\n');
}

function writeExclusive(filePath, content) {
  writeFileSync(filePath, content, { flag: 'wx' });
}

function replaceFilePair({ manifestContent, manifestPath, referenceIndexContent, referenceIndexPath, renameFile = renameSync }) {
  const nonce = `${process.pid}-${Date.now()}`;
  const manifestTemporary = `${manifestPath}.tmp-${nonce}`;
  const indexTemporary = `${referenceIndexPath}.tmp-${nonce}`;
  const manifestBackup = `${manifestPath}.bak-${nonce}`;
  const indexBackup = `${referenceIndexPath}.bak-${nonce}`;
  let manifestBackedUp = false;
  let indexBackedUp = false;
  let manifestPublished = false;
  let indexPublished = false;
  let committed = false;
  let rollbackFailed = false;
  try {
    writeExclusive(manifestTemporary, manifestContent);
    writeExclusive(indexTemporary, referenceIndexContent);
    renameFile(manifestPath, manifestBackup);
    manifestBackedUp = true;
    renameFile(referenceIndexPath, indexBackup);
    indexBackedUp = true;
    renameFile(manifestTemporary, manifestPath);
    manifestPublished = true;
    renameFile(indexTemporary, referenceIndexPath);
    indexPublished = true;
    committed = true;
  } catch (error) {
    const rollbackErrors = [];
    const attempt = (action) => {
      try { action(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    };
    if (manifestPublished && existsSync(manifestPath)) attempt(() => unlinkSync(manifestPath));
    if (indexPublished && existsSync(referenceIndexPath)) attempt(() => unlinkSync(referenceIndexPath));
    if (manifestBackedUp && existsSync(manifestBackup)) attempt(() => renameSync(manifestBackup, manifestPath));
    if (indexBackedUp && existsSync(indexBackup)) attempt(() => renameSync(indexBackup, referenceIndexPath));
    if (rollbackErrors.length > 0) {
      rollbackFailed = true;
      throw new AggregateError([error, ...rollbackErrors], 'Manifest/index replacement and rollback both failed');
    }
    throw error;
  } finally {
    for (const leftover of [manifestTemporary, indexTemporary]) {
      if (existsSync(leftover)) unlinkSync(leftover);
    }
    if (committed && !rollbackFailed) {
      for (const backup of [manifestBackup, indexBackup]) {
        try { if (existsSync(backup)) unlinkSync(backup); } catch { /* a harmless recoverable backup may remain */ }
      }
    }
  }
}

function resolveNpmCli({ environment, execPath, existsFile }) {
  const configured = environment.npm_execpath;
  if (configured && existsFile(configured)) return path.resolve(configured);
  const bundled = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  invariant(existsFile(bundled), `Unable to locate npm-cli.js from npm_execpath or Node installation: ${bundled}`);
  return bundled;
}

export function runReleaseVerification({
  environment = process.env,
  execPath = process.execPath,
  existsFile = existsSync,
  projectRoot,
  spawnSyncFn = spawnSync,
}) {
  const npmCli = resolveNpmCli({ environment, execPath, existsFile });
  return {
    simulated: false,
    commands: VERIFICATION_COMMANDS.map(({ args, command, id }) => {
      const startedAt = new Date().toISOString();
      const invocationArgs = [npmCli, ...args];
      const result = spawnSyncFn(execPath, invocationArgs, {
        cwd: projectRoot,
        encoding: 'utf8',
        env: environment,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });
      return {
        args: invocationArgs,
        command,
        error: result.error?.message ?? null,
        executable: execPath,
        exitCode: result.status,
        finishedAt: new Date().toISOString(),
        id,
        signal: result.signal ?? null,
        startedAt,
        stderr: String(result.stderr ?? ''),
        stdout: String(result.stdout ?? ''),
      };
    }),
  };
}

function verifyRunnerResult(result) {
  invariant(result && Array.isArray(result.commands), 'Release verification runner returned an invalid result');
  for (const expected of VERIFICATION_COMMANDS) {
    const command = result.commands.find(({ id }) => id === expected.id);
    invariant(command?.command === expected.command, `Release verification is missing exact command: ${expected.command}`);
    invariant(Number.isFinite(Date.parse(command.startedAt)) && Number.isFinite(Date.parse(command.finishedAt)), `${expected.command} must record valid timestamps`);
    invariant(command.exitCode === 0 && !command.error && !command.signal, `${expected.command} failed with exit ${command.exitCode ?? 'unknown'}`);
  }
}

function buildSourceComparison(verifiedPages, projectRoot) {
  return Object.fromEntries(verifiedPages.map(({ pageId, record }) => [pageId, Object.fromEntries(
    Object.entries(record.sourceSha256).map(([relativePath, recorded]) => {
      const current = canonicalSha256(path.resolve(projectRoot, relativePath));
      const normalizedRecorded = String(recorded).toLowerCase();
      return [relativePath, { current, matches: current === normalizedRecorded, recorded: normalizedRecorded }];
    }),
  )]));
}

function assertSourceComparisonMatches(sourceComparison, phase) {
  for (const [pageId, sources] of Object.entries(sourceComparison)) {
    for (const [relativePath, result] of Object.entries(sources)) {
      invariant(result.matches, `${pageId} source changed ${phase}: ${relativePath}`);
    }
  }
}

function writeFinalizationRecord(outputRoot, record) {
  const recordPath = path.join(outputRoot, 'finalization-verification.json');
  invariant(!existsSync(recordPath), `Refusing to overwrite finalization record: ${recordPath}`);
  writeExclusive(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return recordPath;
}

export function finalizeDesignEvidenceRefresh({
  currentCommit,
  projectRoot,
  manifestPath = path.join(projectRoot, 'docs', 'design', 'DESIGN_ACCEPTANCE_MANIFEST.json'),
  outputRoot,
  pageIds,
  referenceIndexPath = path.join(projectRoot, 'docs', 'design', 'FIGMA_REFERENCE_INDEX.md'),
  renameFile = renameSync,
  runVerification = runReleaseVerification,
}) {
  invariant(Array.isArray(pageIds) && pageIds.length > 0, 'At least one explicit page ID is required');
  invariant(new Set(pageIds).size === pageIds.length, 'Explicit page IDs must be unique');
  invariant(typeof currentCommit === 'string' && /^[a-f0-9]{40}$/i.test(currentCommit), 'Current repository commit must be a full 40-character SHA');
  const resolvedOutputRoot = path.resolve(outputRoot);
  const runId = path.basename(resolvedOutputRoot);
  const finalizationStartedAt = new Date().toISOString();
  invariant(runId.trim(), 'Output root must identify a non-empty run');
  const manifest = readJson(manifestPath);
  const originalManifest = readFileSync(manifestPath, 'utf8');
  const originalReferenceIndex = readFileSync(referenceIndexPath, 'utf8');
  let nextReferenceIndex = originalReferenceIndex;
  const refreshed = [];
  const verifiedPages = [];

  for (const pageId of pageIds) {
    const page = manifest.pages.find((entry) => entry.id === pageId);
    invariant(page, `Unknown manifest page: ${pageId}`);
    const outputDirectory = path.join(resolvedOutputRoot, pageId);
    const verified = verifyCandidate({ currentCommit: currentCommit.toLowerCase(), outputDirectory, page, projectRoot, runId });
    const nextRelative = path.relative(projectRoot, outputDirectory).replaceAll('\\', '/');
    invariant(nextRelative && !nextRelative.startsWith('..') && !path.isAbsolute(nextRelative), `${pageId} output directory must be inside the project`);
    page.status = 'passed';
    page.evidenceDirectory = nextRelative;
    page.reason = '当前源码三态、QA、验证记录、像素门槛与源码哈希均通过强证据校验。';
    nextReferenceIndex = updateReferenceRow(nextReferenceIndex, pageId, nextRelative);
    refreshed.push({ id: pageId, evidenceDirectory: nextRelative });
    verifiedPages.push({ pageId, record: verified.record });
  }

  const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  invariant(nextManifest !== originalManifest || nextReferenceIndex !== originalReferenceIndex, 'Refresh produced no manifest or index change');
  const sourceComparisonBefore = buildSourceComparison(verifiedPages, projectRoot);
  assertSourceComparisonMatches(sourceComparisonBefore, 'before finalization verification');
  const verification = runVerification({ projectRoot });
  let verificationError = null;
  try {
    verifyRunnerResult(verification);
  } catch (error) {
    verificationError = error;
  }
  const sourceComparisonAfter = verificationError ? null : buildSourceComparison(verifiedPages, projectRoot);
  const finalizationRecordPath = writeFinalizationRecord(resolvedOutputRoot, {
    commands: verification.commands,
    currentCommit: currentCommit.toLowerCase(),
    finishedAt: new Date().toISOString(),
    note: verification.simulated === true
      ? 'TEST ONLY: injected runner; this record is not acceptable as production page evidence.'
      : 'Production finalizer commands executed locally; Figma receipt is source-record cross-checking, not unforgeable authentication.',
    pageIds,
    runId,
    schemaVersion: 1,
    simulated: verification.simulated === true,
    // Consumers gate promoted manifest entries against this post-command map.
    // Keep the pre-command snapshot separately so source mutation remains auditable.
    sourceComparison: sourceComparisonAfter,
    sourceComparisonBefore,
    startedAt: finalizationStartedAt,
  });
  if (verificationError) throw verificationError;
  assertSourceComparisonMatches(sourceComparisonAfter, 'during finalization verification');
  invariant(JSON.stringify(sourceComparisonAfter) === JSON.stringify(sourceComparisonBefore), 'Page source hashes changed during finalization verification');
  invariant(readFileSync(manifestPath, 'utf8') === originalManifest, 'Design acceptance manifest changed during finalization verification');
  invariant(readFileSync(referenceIndexPath, 'utf8') === originalReferenceIndex, 'Figma reference index changed during finalization verification');
  replaceFilePair({
    manifestContent: nextManifest,
    manifestPath,
    referenceIndexContent: nextReferenceIndex,
    referenceIndexPath,
    renameFile,
  });
  return { finalizationRecordPath, refreshed };
}

function currentGitCommit(projectRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim().toLowerCase();
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isCli) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = finalizeDesignEvidenceRefresh({ ...options, currentCommit: currentGitCommit(options.projectRoot) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
