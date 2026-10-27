import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSourceArchive, currentSourceFiles, projectRoot } from './ios-cloud.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'doso-ios-archive-test-'));
  const source = path.join(root, 'source');
  const archive = path.join(root, 'archive');
  mkdirSync(source);
  mkdirSync(archive);
  for (const file of ['.easignore', 'package.json', 'package-lock.json', 'app.json', 'eas.json',
    'tsconfig.json', 'App.tsx', 'index.ts', 'index.preview.ts', 'src/screens/HomeScreen.tsx',
    'assets/figma/home-02.png', 'plugins/withOfflinePreview.js']) {
    mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    writeFileSync(path.join(source, file), file === '.easignore' ? '**/.env*\n**/*.key\n' : file);
  }
  cpSync(source, archive, { recursive: true });
  // Only remove this test's uniquely created, literal temporary directory.
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { source, archive };
}

test('validates actual copied files and records a deterministic source digest', t => {
  const { source, archive } = fixture(t);
  const proof = assertSourceArchive(archive, source);
  assert.equal(proof.fileCount, 12);
  assert.match(proof.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(proof.sourceSha256, assertSourceArchive(archive, source).sourceSha256);
  assert.equal(proof.files.find(file => file.path === 'App.tsx').sha256.length, 64);
});

test('rejects empty archives, missing runtime assets, and stale source', t => {
  const { source, archive } = fixture(t);
  const empty = path.join(path.dirname(archive), 'empty');
  mkdirSync(empty);
  assert.throws(() => assertSourceArchive(empty, source), /missing/i);
  rmSync(path.join(archive, 'assets/figma/home-02.png'));
  assert.throws(() => assertSourceArchive(archive, source), /missing/i);
  cpSync(path.join(source, 'assets'), path.join(archive, 'assets'), { recursive: true });
  writeFileSync(path.join(archive, 'App.tsx'), 'stale app');
  assert.throws(() => assertSourceArchive(archive, source), /source mismatch/i);
});

test('rejects credentials and unrelated payload rather than silently uploading them', t => {
  const { source, archive } = fixture(t);
  for (const name of ['.env.local', 'assets/private.key', 'toolchain.zip']) {
    writeFileSync(path.join(archive, name), 'not uploadable');
    assert.throws(() => assertSourceArchive(archive, source), /unexpected/i);
    rmSync(path.join(archive, name));
  }
});

test('actual source selection excludes local configuration and includes all runtime registry assets', () => {
  const files = currentSourceFiles(projectRoot);
  assert.ok(files.includes('index.preview.ts'));
  assert.ok(!files.some(file => /(^|\/)\.env|^(android|ios|artifacts|docs|scripts|node_modules)\//.test(file)));
  const registry = readFileSync(path.join(projectRoot, 'src/assets.ts'), 'utf8');
  for (const match of registry.matchAll(/require\(['"]\.\.\/([^'"]+)['"]\)/g)) {
    assert.ok(files.includes(match[1]), match[1]);
  }
});
