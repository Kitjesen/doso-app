import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_PAGE_IDS,
  PRIMARY_SOURCE_BY_PAGE,
  REQUIRED_SOURCE_FILES_BY_PAGE,
  verifyDesignAcceptanceManifest,
  verifyReferenceIndex,
} from './verify-design-acceptance-manifest.mjs';

function matrixSource(pageIds) {
  return ['| Page ID | Page |', '| --- | --- |', ...pageIds.map((pageId) => `| \`${pageId}\` | Fixture |`), ''].join('\n');
}

function referenceIndexSource(pages) {
  const labels = {
    passed: '通过',
    stale: '待复验',
    needs_record: '待验收',
    needs_revalidation: '复验中',
    in_progress: '进行中',
    pending: '待验收',
  };
  return [
    '| Page ID | Light | Dark | Landscape | Local baseline | Status and evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...pages.map((page) => {
      const links = ['light', 'dark', 'landscape'].map((state) => {
        const nodeId = page.figma.nodes[state];
        return `[\`${nodeId}\`](https://www.figma.com/design/${page.figma.fileKey}?node-id=${nodeId.replace(':', '-')})`;
      });
      const baselines = ['light', 'dark', 'landscape']
        .map((state) => `\`artifacts/design-acceptance/{run-id}/${page.id}/figma-${state}.png\``)
        .join('<br>');
      return `| \`${page.id}\` | ${links[0]} | ${links[1]} | ${links[2]} | **未导出（Figma OAuth 阻塞）**；计划路径：${baselines} | **${labels[page.status]}**；\`artifacts/design-acceptance/current/${page.id}\` |`;
    }),
    '',
  ].join('\n');
}

function fixture() {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'doso-design-manifest-'));
  const docsDirectory = path.join(projectRoot, 'docs');
  mkdirSync(docsDirectory);
  const matrixPath = path.join(docsDirectory, 'matrix.md');
  const manifestPath = path.join(docsDirectory, 'manifest.json');
  const referenceIndexPath = path.join(docsDirectory, 'figma-index.md');
  for (const sourceFile of new Set(Object.values(REQUIRED_SOURCE_FILES_BY_PAGE).flat())) {
    const sourcePath = path.join(projectRoot, sourceFile);
    mkdirSync(path.dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, 'export const fixture = true;\n');
  }
  writeFileSync(matrixPath, matrixSource(EXPECTED_PAGE_IDS));
  const pages = EXPECTED_PAGE_IDS.map((pageId, index) => ({
    id: pageId,
    status: 'pending',
    figma: { fileKey: 'fixtureFileKey', nodes: { light: `${index + 1}:1`, dark: `${index + 1}:2`, landscape: `${index + 1}:3` } },
    sourceFiles: [...REQUIRED_SOURCE_FILES_BY_PAGE[pageId]],
  }));
  for (const page of pages) mkdirSync(path.join(projectRoot, 'artifacts', 'design-acceptance', 'current', page.id), { recursive: true });
  writeFileSync(referenceIndexPath, referenceIndexSource(pages));
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    pages,
  }));
  return { manifestPath, matrixPath, projectRoot, referenceIndexPath };
}

function mutateReferenceRow(paths, pageId, mutate) {
  const lines = readFileSync(paths.referenceIndexPath, 'utf8').split('\n');
  const rowIndex = lines.findIndex((line) => line.startsWith('|') && line.includes(`\`${pageId}\``));
  assert.notEqual(rowIndex, -1, `fixture reference index must contain ${pageId}`);
  lines[rowIndex] = mutate(lines[rowIndex]);
  writeFileSync(paths.referenceIndexPath, lines.join('\n'));
}

test('audits a complete page inventory without pretending pending pages passed', () => {
  const paths = fixture();
  const result = verifyDesignAcceptanceManifest(paths.manifestPath, paths);
  assert.equal(result.status, 'audited');
  assert.equal(result.pageCount, 20);
  assert.equal(result.counts.pending, 20);
});

test('release mode fails closed while any page is not passed', () => {
  const paths = fixture();
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, { ...paths, requireAllPassed: true }),
    /auth-login=pending/,
  );
});

test('rejects a manifest that omits a matrix page', () => {
  const paths = fixture();
  writeFileSync(paths.matrixPath, matrixSource(EXPECTED_PAGE_IDS.slice(1)));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /missing canonical pages: auth-login/);
});

test('rejects duplicate manifest page IDs', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  manifest.pages.push(JSON.parse(JSON.stringify(manifest.pages[0])));
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /duplicate page IDs/);
});

test('rejects a Figma reference index that omits a canonical page', () => {
  const paths = fixture();
  const source = readFileSync(paths.referenceIndexPath, 'utf8');
  writeFileSync(paths.referenceIndexPath, source.split('\n').filter((line) => !line.includes('`auth-login`')).join('\n'));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /missing canonical pages: auth-login/);
});

test('rejects a Figma reference index with a wrong node binding', () => {
  const paths = fixture();
  const source = readFileSync(paths.referenceIndexPath, 'utf8').replace('node-id=1-1', 'node-id=999-1');
  writeFileSync(paths.referenceIndexPath, source);
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /auth-login reference index light URL must record exact node 1:1/);
});

test('rejects a Figma reference index without a three-state baseline path contract', () => {
  const paths = fixture();
  const source = readFileSync(paths.referenceIndexPath, 'utf8').replace('auth-login/figma-light.png', 'auth-login/baseline.png');
  writeFileSync(paths.referenceIndexPath, source);
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /auth-login reference index baseline cell must record exactly one light Figma path/);
});

test('rejects a Figma reference index whose recorded evidence directory is missing', () => {
  const paths = fixture();
  const source = readFileSync(paths.referenceIndexPath, 'utf8').replace(
    'artifacts/design-acceptance/current/auth-login',
    'artifacts/design-acceptance/missing/auth-login',
  );
  writeFileSync(paths.referenceIndexPath, source);
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /auth-login reference index evidence directory is missing or is not a directory/);
});

test('rejects Figma file-key prefixes instead of exact file bindings', () => {
  const paths = fixture();
  mutateReferenceRow(paths, 'auth-login', (row) => row.replace(
    '/design/fixtureFileKey?node-id=1-1',
    '/design/fixtureFileKeyExtra?node-id=1-1',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /exact Figma file fixtureFileKey/);
});

test('rejects node-id prefix collisions and state links placed in the wrong cells', () => {
  const prefixPaths = fixture();
  mutateReferenceRow(prefixPaths, 'auth-login', (row) => row.replace('node-id=1-1', 'node-id=1-10'));
  assert.throws(() => verifyDesignAcceptanceManifest(prefixPaths.manifestPath, prefixPaths), /light URL must record exact node 1:1/);

  const swappedPaths = fixture();
  const light = '[`1:1`](https://www.figma.com/design/fixtureFileKey?node-id=1-1)';
  const dark = '[`1:2`](https://www.figma.com/design/fixtureFileKey?node-id=1-2)';
  mutateReferenceRow(swappedPaths, 'auth-login', (row) => row.replace(`${light} | ${dark}`, `${dark} | ${light}`));
  assert.throws(() => verifyDesignAcceptanceManifest(swappedPaths.manifestPath, swappedPaths), /light label must record node 1:1/);
});

test('rejects a second canonical page ID hidden in another table cell', () => {
  const paths = fixture();
  mutateReferenceRow(paths, 'auth-login', (row) => row.replace(
    '`artifacts/design-acceptance/current/auth-login`',
    '`artifacts/design-acceptance/current/auth-login`；参见 `auth-register`',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /must mention exactly one canonical page ID/);
});

test('rejects evidence files, the evidence root, another page directory, and traversal', () => {
  const filePaths = fixture();
  const fileParent = path.join(filePaths.projectRoot, 'artifacts', 'design-acceptance', 'files');
  mkdirSync(fileParent, { recursive: true });
  writeFileSync(path.join(fileParent, 'auth-login'), 'not a directory\n');
  mutateReferenceRow(filePaths, 'auth-login', (row) => row.replace(
    'artifacts/design-acceptance/current/auth-login',
    'artifacts/design-acceptance/files/auth-login',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(filePaths.manifestPath, filePaths), /missing or is not a directory/);

  const rootPaths = fixture();
  mutateReferenceRow(rootPaths, 'auth-login', (row) => row.replace(
    'artifacts/design-acceptance/current/auth-login',
    'artifacts/design-acceptance/',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(rootPaths.manifestPath, rootPaths), /escapes or equals the canonical evidence root/);

  const wrongPagePaths = fixture();
  mutateReferenceRow(wrongPagePaths, 'auth-login', (row) => row.replace(
    'artifacts/design-acceptance/current/auth-login',
    'artifacts/design-acceptance/current/auth-register',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(wrongPagePaths.manifestPath, wrongPagePaths), /must end with its page ID/);

  const traversalPaths = fixture();
  mkdirSync(path.join(traversalPaths.projectRoot, 'artifacts', 'outside', 'auth-login'), { recursive: true });
  mutateReferenceRow(traversalPaths, 'auth-login', (row) => row.replace(
    'artifacts/design-acceptance/current/auth-login',
    'artifacts/design-acceptance/../../outside/auth-login',
  ));
  assert.throws(() => verifyDesignAcceptanceManifest(traversalPaths.manifestPath, traversalPaths), /must not contain traversal segments/);
});

test('rejects manifest/index status disagreement and passed OAuth placeholders', () => {
  const statusPaths = fixture();
  mutateReferenceRow(statusPaths, 'auth-login', (row) => row.replace('**待验收**', '**通过**'));
  assert.throws(() => verifyDesignAcceptanceManifest(statusPaths.manifestPath, statusPaths), /status 通过 contradicts manifest status pending/);

  const placeholderPaths = fixture();
  const manifest = JSON.parse(readFileSync(placeholderPaths.manifestPath, 'utf8'));
  manifest.pages[0].status = 'passed';
  assert.throws(
    () => verifyReferenceIndex(placeholderPaths.referenceIndexPath, manifest, placeholderPaths.projectRoot),
    /auth-login is passed but its reference index says the Figma baseline is not exported/,
  );
});

test('allows a non-passed page to record a partially exported Figma baseline', () => {
  const paths = fixture();
  const lightBaseline = path.join(paths.projectRoot, 'baselines', 'auth-login-light.png');
  mkdirSync(path.dirname(lightBaseline), { recursive: true });
  writeFileSync(lightBaseline, 'fixture\n');
  mutateReferenceRow(paths, 'auth-login', (row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    cells[cells.length - 2] = [
      '`baselines/auth-login-light.png`',
      '`baselines/auth-login-dark.png`（未导出）',
      '`baselines/auth-login-landscape.png`（未导出）',
    ].join('<br>');
    return `| ${cells.join(' | ')} |`;
  });
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  assert.doesNotThrow(() => verifyReferenceIndex(paths.referenceIndexPath, manifest, paths.projectRoot));
});

test('rejects a passed page with a partially exported Figma baseline', () => {
  const paths = fixture();
  const lightBaseline = path.join(paths.projectRoot, 'baselines', 'auth-login-light.png');
  mkdirSync(path.dirname(lightBaseline), { recursive: true });
  writeFileSync(lightBaseline, 'fixture\n');
  mutateReferenceRow(paths, 'auth-login', (row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    cells[cells.length - 2] = [
      '`baselines/auth-login-light.png`',
      '`baselines/auth-login-dark.png`（未导出）',
      '`baselines/auth-login-landscape.png`（未导出）',
    ].join('<br>');
    return `| ${cells.join(' | ')} |`;
  });
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  manifest.pages[0].status = 'passed';
  assert.throws(
    () => verifyReferenceIndex(paths.referenceIndexPath, manifest, paths.projectRoot),
    /auth-login is passed but its dark Figma baseline is not exported/,
  );
});

test('requires a passed index row to include the exact manifest evidence directory', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  const page = manifest.pages[0];
  page.status = 'passed';
  page.evidenceDirectory = 'artifacts/design-acceptance/approved/auth-login';
  mkdirSync(path.join(paths.projectRoot, page.evidenceDirectory), { recursive: true });
  const baselineDirectory = path.join(paths.projectRoot, 'baselines');
  mkdirSync(baselineDirectory);
  for (const state of ['light', 'dark', 'landscape']) writeFileSync(path.join(baselineDirectory, `auth-login-${state}.png`), 'fixture\n');
  mutateReferenceRow(paths, 'auth-login', (row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    cells[cells.length - 2] = ['light', 'dark', 'landscape'].map((state) => `\`baselines/auth-login-${state}.png\``).join('<br>');
    cells[cells.length - 1] = '**通过**；`artifacts/design-acceptance/current/auth-login`';
    return `| ${cells.join(' | ')} |`;
  });
  assert.throws(
    () => verifyReferenceIndex(paths.referenceIndexPath, manifest, paths.projectRoot),
    /passed reference index must include its manifest evidenceDirectory/,
  );
});

test('rejects a passed page without an evidence directory', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  manifest.pages[0].status = 'passed';
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /auth-login status passed requires an evidenceDirectory/);
});

test('allows non-passed pages to retain a historical evidence path that is not in the release slice', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  manifest.pages[0].status = 'needs_revalidation';
  manifest.pages[0].evidenceDirectory = 'artifacts/historical/auth-login';
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  writeFileSync(paths.referenceIndexPath, readFileSync(paths.referenceIndexPath, 'utf8').replace('**待验收**', '**复验中**'));
  const result = verifyDesignAcceptanceManifest(paths.manifestPath, paths);
  assert.equal(result.counts.needs_revalidation, 1);
  assert.deepEqual(result.verifiedPages, []);
});

test('rejects deleting the same canonical page from both matrix and manifest', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  manifest.pages = manifest.pages.filter((page) => page.id !== 'account-security');
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  writeFileSync(paths.matrixPath, matrixSource(EXPECTED_PAGE_IDS.filter((pageId) => pageId !== 'account-security')));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /missing canonical pages: account-security/);
});

test('rejects source binding that omits the canonical primary screen', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  writeFileSync(path.join(paths.projectRoot, 'package.json'), '{}\n');
  manifest.pages[0].sourceFiles = ['package.json'];
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyDesignAcceptanceManifest(paths.manifestPath, paths), /must include canonical primary source src\/screens\/LoginScreen\.tsx/);
});

test('rejects coordinated manifest and evidence downgrade that removes a canonical shared dependency', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  const taskPage = manifest.pages.find((page) => page.id === 'main-tasks');
  taskPage.sourceFiles = taskPage.sourceFiles.filter((sourceFile) => sourceFile !== 'src/components/BottomNav.tsx');
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, paths),
    /main-tasks sourceFiles must include canonical dependency src\/components\/BottomNav\.tsx/,
  );
});

test('rejects a BottomNav page that omits a source Figma navigation asset', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  const homePage = manifest.pages.find((page) => page.id === 'main-home');
  homePage.sourceFiles = homePage.sourceFiles.filter((sourceFile) => sourceFile !== 'assets/figma/nav-home.png');
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, paths),
    /main-home sourceFiles must include canonical dependency assets\/figma\/nav-home\.png/,
  );
});

test('rejects a route evidence downgrade that removes the production executor seam', () => {
  const paths = fixture();
  const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
  const routePage = manifest.pages.find((page) => page.id === 'main-routes');
  routePage.sourceFiles = routePage.sourceFiles.filter((sourceFile) => sourceFile !== 'App.tsx');
  writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, paths),
    /main-routes sourceFiles must include canonical dependency App\.tsx/,
  );
});

test('rejects a passed manifest whose Figma binding differs from the reference index or evidence record', () => {
  const paths = fixture();
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repositoryManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'docs/design/DESIGN_ACCEPTANCE_MANIFEST.json'), 'utf8'));
  const taskPage = repositoryManifest.pages.find((page) => page.id === 'main-tasks');
  assert(taskPage, 'repository manifest must contain main-tasks');
  taskPage.figma.fileKey = 'forgedFigmaFileKey';
  writeFileSync(paths.manifestPath, JSON.stringify(repositoryManifest));
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, {
      ...paths,
      matrixPath: path.join(repositoryRoot, 'docs/DESIGN_ACCEPTANCE_MATRIX.md'),
      projectRoot: repositoryRoot,
      referenceIndexPath: path.join(repositoryRoot, 'docs/design/FIGMA_REFERENCE_INDEX.md'),
    }),
    /reference index light cell must record exact Figma file|manifest Figma fileKey differs from its evidence record/,
  );
});

test('rejects historical passed evidence that lacks the current evidence gate or has stale source bindings', () => {
  const paths = fixture();
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repositoryManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'docs/design/DESIGN_ACCEPTANCE_MANIFEST.json'), 'utf8'));
  const taskPage = repositoryManifest.pages.find((page) => page.id === 'main-tasks');
  const historicalEvidenceDirectory = 'artifacts/design-acceptance/20260826-121733-tasks-pass5/main-tasks';
  const historicalEvidence = JSON.parse(readFileSync(path.join(repositoryRoot, historicalEvidenceDirectory, 'evidence.json'), 'utf8'));
  taskPage.status = 'passed';
  taskPage.evidenceDirectory = historicalEvidenceDirectory;
  taskPage.sourceFiles = [...new Set([
    ...Object.keys(historicalEvidence.sourceSha256),
    ...REQUIRED_SOURCE_FILES_BY_PAGE['main-tasks'],
    'src/screens/HomeScreen.tsx',
  ])];
  writeFileSync(paths.manifestPath, JSON.stringify(repositoryManifest));
  writeFileSync(paths.referenceIndexPath, readFileSync(path.join(repositoryRoot, 'docs/design/FIGMA_REFERENCE_INDEX.md'), 'utf8'));
  mutateReferenceRow(paths, 'main-tasks', (row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    cells[cells.length - 2] = ['light', 'dark', 'landscape']
      .map((state) => `\`${historicalEvidenceDirectory}/figma-${state}.png\``)
      .join('<br>');
    cells[cells.length - 1] = `**通过**。\`${historicalEvidenceDirectory}/\``;
    return `| ${cells.join(' | ')} |`;
  });
  assert.throws(
    () => verifyDesignAcceptanceManifest(paths.manifestPath, {
      ...paths,
      matrixPath: path.join(repositoryRoot, 'docs/DESIGN_ACCEPTANCE_MATRIX.md'),
      projectRoot: repositoryRoot,
      referenceIndexPath: paths.referenceIndexPath,
    }),
    /Missing required evidence file: .*critical-regions\.json|stale: src\/(?:components\/BottomNav|screens\/TasksScreen)\.tsx changed after acceptance|evidence is missing declared source files: src\/screens\/HomeScreen\.tsx/,
  );
});
