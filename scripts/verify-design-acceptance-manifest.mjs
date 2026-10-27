import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyDesignAcceptanceEvidence } from './verify-design-acceptance-evidence.mjs';

const PAGE_STATUSES = new Set([
  'passed',
  'stale',
  'needs_record',
  'needs_revalidation',
  'in_progress',
  'pending',
]);
const REFERENCE_STATUS_LABELS = Object.freeze({
  passed: Object.freeze(['通过']),
  stale: Object.freeze(['待复验', '复验中']),
  needs_record: Object.freeze(['待验收']),
  needs_revalidation: Object.freeze(['复验中']),
  in_progress: Object.freeze(['进行中', '复验中']),
  pending: Object.freeze(['待验收']),
});

export const PRIMARY_SOURCE_BY_PAGE = Object.freeze({
  'auth-login': 'src/screens/LoginScreen.tsx',
  'auth-register': 'src/screens/RegisterScreen.tsx',
  'auth-email-otp': 'src/screens/EmailOtpScreen.tsx',
  'auth-forgot-password': 'src/screens/ForgotPasswordScreen.tsx',
  'auth-reset-password': 'src/screens/ResetPasswordScreen.tsx',
  'auth-username': 'src/screens/UsernameOnboardingScreen.tsx',
  'auth-display-name': 'src/screens/DisplayNameConfirmationScreen.tsx',
  'auth-mfa': 'src/screens/MfaSetupScreen.tsx',
  'model-select': 'src/screens/ModelSelectScreen.tsx',
  'main-home': 'src/screens/HomeScreen.tsx',
  'main-routes': 'src/screens/MapScreen.tsx',
  'main-tasks': 'src/screens/TasksScreen.tsx',
  'main-analysis': 'src/screens/AnalysisScreen.tsx',
  'main-profile': 'src/screens/ProfileScreen.tsx',
  'robot-control': 'src/screens/ControlScreen.tsx',
  'device-bind': 'src/screens/BindDeviceScreen.tsx',
  'device-ble-discovery': 'src/screens/BleDiscoveryScreen.tsx',
  'device-provisioning': 'src/screens/DeviceUnavailableScreen.tsx',
  'device-firmware': 'src/screens/DeviceUnavailableScreen.tsx',
  'account-security': 'src/screens/AccountSecurityScreen.tsx',
});
export const EXPECTED_PAGE_IDS = Object.freeze(Object.keys(PRIMARY_SOURCE_BY_PAGE));
const BOTTOM_NAV_DEPENDENCIES = Object.freeze([
  'src/components/BottomNav.tsx',
  'src/assets.ts',
  'assets/figma/nav-home.png',
  'assets/figma/nav-map.png',
  'assets/figma/nav-tasks.png',
  'assets/figma/nav-analysis.png',
  'assets/figma/nav-profile.png',
]);
const BOTTOM_NAV_PAGES = new Set(['main-home', 'main-routes', 'main-tasks', 'main-analysis', 'main-profile']);
export const REQUIRED_SOURCE_FILES_BY_PAGE = Object.freeze(Object.fromEntries(
  EXPECTED_PAGE_IDS.map((pageId) => {
    if (pageId === 'main-routes') {
      return [pageId, Object.freeze([
        'App.tsx',
        'src/screens/MapScreen.tsx',
        'src/components/AppHeader.tsx',
        ...BOTTOM_NAV_DEPENDENCIES,
        'src/theme.ts',
        'src/features/routes/routeStartPolicy.ts',
        'src/features/robot-lifecycle/robotCapabilityReadiness.ts',
        'src/features/robot-lifecycle/robotCommandExecutor.ts',
        'scripts/verify-routes-ui.mjs',
        'scripts/verify-route-start-policy.mts',
        'scripts/verify-robot-capability-readiness.mjs',
        'scripts/verify-robot-command-executor.mts',
        'assets/figma/routes-map-compact.png',
        'assets/figma/routes-map-large.png',
      ])];
    }
    if (pageId === 'main-tasks') {
      return [pageId, Object.freeze([
        'src/screens/TasksScreen.tsx',
        'src/components/AppHeader.tsx',
        ...BOTTOM_NAV_DEPENDENCIES,
        'src/theme.ts',
        'src/features/tasks/taskStartPolicy.ts',
        'scripts/verify-tasks-ui.mjs',
        'scripts/verify-task-start-policy.mts',
        'assets/figma/tasks-05.png',
        'assets/figma/tasks-07.png',
        'assets/figma/tasks-11.png',
      ])];
    }
    return [pageId, Object.freeze([
      PRIMARY_SOURCE_BY_PAGE[pageId],
      'src/theme.ts',
      ...(BOTTOM_NAV_PAGES.has(pageId) ? BOTTOM_NAV_DEPENDENCIES : []),
    ])];
  }),
));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function matrixPageIds(matrixPath) {
  const source = readFileSync(matrixPath, 'utf8');
  return [...source.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((match) => match[1]);
}

function markdownCodeSpans(row) {
  return [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function markdownTableCells(row, label) {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
  invariant(cells.length === 6 || cells.length === 7, `${label} is not a supported Figma reference table row`);
  return cells;
}

function referenceIndexRows(referenceIndexPath) {
  const rows = new Map();
  for (const [lineIndex, line] of readFileSync(referenceIndexPath, 'utf8').split(/\r?\n/).entries()) {
    if (!line.startsWith('|')) continue;
    const canonicalTokens = [...line.matchAll(/`([a-z0-9-]+)`/g)]
      .map((match) => match[1])
      .filter((token) => EXPECTED_PAGE_IDS.includes(token));
    if (canonicalTokens.length === 0) continue;
    const label = `${referenceIndexPath}:${lineIndex + 1}`;
    invariant(canonicalTokens.length === 1, `${label} must mention exactly one canonical page ID`);
    const pageId = canonicalTokens[0];
    const cells = markdownTableCells(line, label);
    const firstCellTokens = [...cells[0].matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]);
    invariant(firstCellTokens.length === 1 && firstCellTokens[0] === pageId, `${label} must place ${pageId} in the first table cell`);
    invariant(!rows.has(pageId), `${referenceIndexPath} contains duplicate rows for ${pageId}`);
    rows.set(pageId, { cells, line, lineNumber: lineIndex + 1 });
  }
  verifyExactInventory([...rows.keys()], EXPECTED_PAGE_IDS, referenceIndexPath);
  return rows;
}

function resolveMarkdownPath(projectRoot, markdownPath) {
  const trimmed = markdownPath.replace(/[\\/]+$/, '');
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(projectRoot, trimmed);
}

function verifyFigmaReferenceCell(cell, page, state) {
  const links = [...cell.matchAll(/\[\`(\d+:\d+)\`\]\((https:\/\/www\.figma\.com\/design\/[^)\s]+)\)/g)];
  invariant(links.length === 1, `${page.id} reference index ${state} cell must contain exactly one Figma node link`);
  const [, linkedNodeId, href] = links[0];
  const parsed = new URL(href);
  const segments = parsed.pathname.split('/').filter(Boolean);
  invariant(segments[0] === 'design' && segments[1] === page.figma.fileKey, `${page.id} reference index ${state} cell must record exact Figma file ${page.figma.fileKey}`);
  invariant(linkedNodeId === page.figma.nodes[state], `${page.id} reference index ${state} label must record node ${page.figma.nodes[state]}`);
  invariant(parsed.searchParams.get('node-id') === page.figma.nodes[state].replace(':', '-'), `${page.id} reference index ${state} URL must record exact node ${page.figma.nodes[state]}`);
}

function verifyIndexedBaseline(baselineCell, page, projectRoot) {
  const plannedBaseline = /\*\*未导出（[^*]+）\*\*/.test(baselineCell);
  invariant(!plannedBaseline || page.status !== 'passed', `${page.id} is passed but its reference index says the Figma baseline is not exported`);
  const baselineCodeSpans = markdownCodeSpans(baselineCell);
  for (const state of ['light', 'dark', 'landscape']) {
    const baselinePaths = baselineCodeSpans.filter((entry) => {
      const basename = entry.replaceAll('\\', '/').split('/').at(-1);
      return new RegExp(`^[^/]+-${state}\\.png$`, 'i').test(basename)
        && !new RegExp(`^(?:app|comparison)-${state}\\.png$`, 'i').test(basename);
    });
    invariant(baselinePaths.length === 1, `${page.id} reference index baseline cell must record exactly one ${state} Figma path`);
    const stateBaseline = `\`${baselinePaths[0]}\``;
    const stateNotExported = baselineCell.includes(`${stateBaseline}（未导出）`)
      || baselineCell.includes(`${stateBaseline}(未导出)`);
    invariant(!stateNotExported || page.status !== 'passed', `${page.id} is passed but its ${state} Figma baseline is not exported`);
    if (plannedBaseline) {
      const expected = `artifacts/design-acceptance/{run-id}/${page.id}/figma-${state}.png`;
      invariant(baselinePaths[0].replaceAll('\\', '/') === expected, `${page.id} planned ${state} Figma baseline must use ${expected}`);
    } else if (!stateNotExported) {
      const resolved = resolveMarkdownPath(projectRoot, baselinePaths[0]);
      invariant(existsSync(resolved) && statSync(resolved).isFile(), `${page.id} ${state} Figma baseline is missing or is not a file: ${resolved}`);
    }
  }
}

function verifyIndexedEvidence(statusAndEvidenceCell, page, projectRoot) {
  const statusLabels = [...statusAndEvidenceCell.matchAll(/\*\*(通过|复验中|进行中|待验收|待复验)\*\*/g)].map((match) => match[1]);
  invariant(statusLabels.length === 1, `${page.id} reference index row must record exactly one acceptance status`);
  invariant(REFERENCE_STATUS_LABELS[page.status].includes(statusLabels[0]), `${page.id} reference index status ${statusLabels[0]} contradicts manifest status ${page.status}`);

  const evidenceRoot = path.resolve(projectRoot, 'artifacts/design-acceptance');
  const evidencePaths = markdownCodeSpans(statusAndEvidenceCell).filter((entry) => entry.replaceAll('\\', '/').includes('artifacts/design-acceptance/'));
  invariant(evidencePaths.length > 0, `${page.id} reference index row must record an evidence directory`);
  const resolvedEvidencePaths = evidencePaths.map((entry) => {
    const normalizedInput = entry.replaceAll('\\', '/').replace(/\/+$/, '');
    invariant(!normalizedInput.split('/').includes('..'), `${page.id} reference index evidence path must not contain traversal segments: ${entry}`);
    invariant(!entry.includes('{run-id}'), `${page.id} reference index evidence directory must not be a planned placeholder`);
    invariant(!/\.png$/i.test(entry), `${page.id} reference index evidence path must be a directory, not an image`);
    const resolved = resolveMarkdownPath(projectRoot, entry);
    const relativeToEvidenceRoot = path.relative(evidenceRoot, resolved);
    invariant(relativeToEvidenceRoot && !relativeToEvidenceRoot.startsWith('..') && !path.isAbsolute(relativeToEvidenceRoot), `${page.id} reference index evidence path escapes or equals the canonical evidence root: ${entry}`);
    invariant(path.basename(resolved) === page.id, `${page.id} reference index evidence directory must end with its page ID: ${entry}`);
    invariant(existsSync(resolved) && statSync(resolved).isDirectory(), `${page.id} reference index evidence directory is missing or is not a directory: ${resolved}`);
    return resolved;
  });
  if (page.status === 'passed') {
    const manifestEvidence = resolveInsideProject(projectRoot, page.evidenceDirectory, `${page.id}.evidenceDirectory`);
    invariant(resolvedEvidencePaths.some((entry) => path.resolve(entry) === path.resolve(manifestEvidence)), `${page.id} passed reference index must include its manifest evidenceDirectory`);
  }
}

export function verifyReferenceIndex(referenceIndexPath, manifest, projectRoot) {
  const rows = referenceIndexRows(referenceIndexPath);
  for (const page of manifest.pages) {
    const { cells } = rows.get(page.id);
    const baselineCell = cells.at(-2);
    const statusAndEvidenceCell = cells.at(-1);
    const lightCell = cells.at(-5);
    const darkCell = cells.at(-4);
    const landscapeCell = cells.at(-3);
    verifyFigmaReferenceCell(lightCell, page, 'light');
    verifyFigmaReferenceCell(darkCell, page, 'dark');
    verifyFigmaReferenceCell(landscapeCell, page, 'landscape');
    verifyIndexedBaseline(baselineCell, page, projectRoot);
    verifyIndexedEvidence(statusAndEvidenceCell, page, projectRoot);
  }
  return rows;
}

function verifyExactInventory(actualIds, expectedIds, label) {
  const missing = expectedIds.filter((pageId) => !actualIds.includes(pageId));
  const extra = actualIds.filter((pageId) => !expectedIds.includes(pageId));
  invariant(missing.length === 0, `${label} is missing canonical pages: ${missing.join(', ')}`);
  invariant(extra.length === 0, `${label} contains non-canonical pages: ${extra.join(', ')}`);
  invariant(actualIds.length === expectedIds.length, `${label} must contain exactly ${expectedIds.length} canonical pages`);
}

function resolveInsideProject(projectRoot, relativePath, label) {
  invariant(typeof relativePath === 'string' && relativePath.length > 0, `${label} must be a project-relative path`);
  invariant(!path.isAbsolute(relativePath), `${label} must not be absolute`);
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath);
  invariant(relativeToRoot && !relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot), `${label} escapes the project root`);
  return resolvedPath;
}

export function verifyDesignAcceptanceManifest(
  manifestPath,
  {
    matrixPath = path.resolve('docs/design/DESIGN_ACCEPTANCE_MATRIX.md'),
    projectRoot = process.cwd(),
    referenceIndexPath = path.resolve('docs/design/FIGMA_REFERENCE_INDEX.md'),
    requireAllPassed = false,
  } = {},
) {
  const resolvedManifest = path.resolve(manifestPath);
  const resolvedMatrix = path.resolve(matrixPath);
  const resolvedReferenceIndex = path.resolve(referenceIndexPath);
  invariant(existsSync(resolvedManifest), `Design acceptance manifest is missing: ${resolvedManifest}`);
  invariant(existsSync(resolvedMatrix), `Design acceptance matrix is missing: ${resolvedMatrix}`);
  invariant(existsSync(resolvedReferenceIndex), `Figma reference index is missing: ${resolvedReferenceIndex}`);
  const manifest = readJson(resolvedManifest);
  invariant(manifest?.schemaVersion === 1, `${resolvedManifest} must use schemaVersion 1`);
  invariant(Array.isArray(manifest.pages) && manifest.pages.length > 0, `${resolvedManifest} must list pages`);

  const matrixIds = matrixPageIds(resolvedMatrix);
  invariant(matrixIds.length > 0, `${resolvedMatrix} contains no page rows`);
  invariant(new Set(matrixIds).size === matrixIds.length, `${resolvedMatrix} contains duplicate page IDs`);
  verifyExactInventory(matrixIds, EXPECTED_PAGE_IDS, resolvedMatrix);
  const manifestIds = manifest.pages.map((page) => page.id);
  invariant(new Set(manifestIds).size === manifestIds.length, `${resolvedManifest} contains duplicate page IDs`);
  verifyExactInventory(manifestIds, EXPECTED_PAGE_IDS, resolvedManifest);

  const missingFromManifest = matrixIds.filter((pageId) => !manifestIds.includes(pageId));
  const extraInManifest = manifestIds.filter((pageId) => !matrixIds.includes(pageId));
  invariant(missingFromManifest.length === 0, `${resolvedManifest} is missing matrix pages: ${missingFromManifest.join(', ')}`);
  invariant(extraInManifest.length === 0, `${resolvedManifest} contains pages absent from the matrix: ${extraInManifest.join(', ')}`);
  const counts = Object.fromEntries([...PAGE_STATUSES].map((status) => [status, 0]));
  const verifiedPages = [];
  for (const page of manifest.pages) {
    invariant(typeof page.id === 'string' && /^[a-z0-9-]+$/.test(page.id), `${resolvedManifest} has an invalid page ID`);
    invariant(PAGE_STATUSES.has(page.status), `${resolvedManifest} has invalid status for ${page.id}: ${page.status}`);
    counts[page.status] += 1;
    invariant(typeof page.figma?.fileKey === 'string' && page.figma.fileKey.length >= 8, `${page.id} must record a Figma fileKey`);
    for (const state of ['light', 'dark', 'landscape']) {
      invariant(/^\d+:\d+$/.test(page.figma?.nodes?.[state] ?? ''), `${page.id} must record a valid ${state} Figma node`);
    }
    invariant(Array.isArray(page.sourceFiles) && page.sourceFiles.length > 0, `${page.id} must record sourceFiles`);
    invariant(new Set(page.sourceFiles).size === page.sourceFiles.length, `${page.id} sourceFiles contains duplicates`);
    const primarySource = PRIMARY_SOURCE_BY_PAGE[page.id];
    invariant(page.sourceFiles.includes(primarySource), `${page.id} sourceFiles must include canonical primary source ${primarySource}`);
    for (const requiredSource of REQUIRED_SOURCE_FILES_BY_PAGE[page.id]) {
      invariant(page.sourceFiles.includes(requiredSource), `${page.id} sourceFiles must include canonical dependency ${requiredSource}`);
    }
    for (const sourceFile of page.sourceFiles) {
      invariant(typeof sourceFile === 'string' && sourceFile === path.posix.normalize(sourceFile) && !sourceFile.includes('\\'), `${page.id} has an invalid sourceFiles path: ${sourceFile}`);
      const resolvedSource = resolveInsideProject(projectRoot, sourceFile, `${page.id}.sourceFiles`);
      invariant(existsSync(resolvedSource), `${page.id} source file is missing: ${resolvedSource}`);
    }

    const evidenceDirectory = page.evidenceDirectory
      ? resolveInsideProject(projectRoot, page.evidenceDirectory, `${page.id}.evidenceDirectory`)
      : null;
    if (page.status === 'passed') {
      invariant(evidenceDirectory, `${page.id} status passed requires an evidenceDirectory`);
      invariant(existsSync(evidenceDirectory), `${page.id} evidence directory is missing: ${evidenceDirectory}`);
      const result = verifyDesignAcceptanceEvidence(evidenceDirectory, { projectRoot });
      invariant(result.pageId === page.id, `${page.id} evidence record belongs to ${result.pageId}`);
      invariant(result.figma.fileKey === page.figma.fileKey, `${page.id} manifest Figma fileKey differs from its evidence record`);
      for (const state of ['light', 'dark', 'landscape']) {
        invariant(
          result.figma.nodes[state] === page.figma.nodes[state],
          `${page.id} manifest ${state} Figma node differs from its evidence record`,
        );
      }
      const missingSourceBindings = page.sourceFiles.filter((sourceFile) => !result.sourceFiles.includes(sourceFile));
      const extraSourceBindings = result.sourceFiles.filter((sourceFile) => !page.sourceFiles.includes(sourceFile));
      invariant(missingSourceBindings.length === 0, `${page.id} evidence is missing declared source files: ${missingSourceBindings.join(', ')}`);
      invariant(extraSourceBindings.length === 0, `${page.id} evidence contains undeclared source files: ${extraSourceBindings.join(', ')}`);
      verifiedPages.push(page.id);
    }
  }
  const referenceIndexRowsByPage = verifyReferenceIndex(resolvedReferenceIndex, manifest, projectRoot);

  if (requireAllPassed) {
    const incomplete = manifest.pages.filter((page) => page.status !== 'passed');
    invariant(
      incomplete.length === 0,
      `Design acceptance release gate is incomplete (${verifiedPages.length}/${manifest.pages.length} passed): ${incomplete.map((page) => `${page.id}=${page.status}`).join(', ')}`,
    );
  }

  return {
    counts,
    pageCount: manifest.pages.length,
    referenceIndexPages: referenceIndexRowsByPage.size,
    status: requireAllPassed ? 'passed' : 'audited',
    verifiedPages,
  };
}

function parseCliArguments(argv) {
  let json = false;
  let manifestPath = 'docs/design/DESIGN_ACCEPTANCE_MANIFEST.json';
  let matrixPath = 'docs/DESIGN_ACCEPTANCE_MATRIX.md';
  let projectRoot = process.cwd();
  let referenceIndexPath = 'docs/design/FIGMA_REFERENCE_INDEX.md';
  let requireAllPassed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') json = true;
    else if (argument === '--require-all-passed') requireAllPassed = true;
    else if (argument === '--manifest') {
      index += 1;
      invariant(argv[index], '--manifest requires a path');
      manifestPath = argv[index];
    } else if (argument === '--matrix') {
      index += 1;
      invariant(argv[index], '--matrix requires a path');
      matrixPath = argv[index];
    } else if (argument === '--project-root') {
      index += 1;
      invariant(argv[index], '--project-root requires a path');
      projectRoot = path.resolve(argv[index]);
    } else if (argument === '--reference-index') {
      index += 1;
      invariant(argv[index], '--reference-index requires a path');
      referenceIndexPath = argv[index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { json, manifestPath, matrixPath, projectRoot, referenceIndexPath, requireAllPassed };
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isCli) {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    const result = verifyDesignAcceptanceManifest(options.manifestPath, options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`DOSO design acceptance manifest ${result.status.toUpperCase()}: ${result.verifiedPages.length}/${result.pageCount} strong-evidence pages`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
