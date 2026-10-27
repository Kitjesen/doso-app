import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [source, liveVerifierSource] = await Promise.all([
  readFile(new URL('./figma-source-sync-scripter-min.js', import.meta.url), 'utf8'),
  readFile(new URL('./figma-source-sync-scripter-verify.js', import.meta.url), 'utf8'),
]);
const SECTION_NAME = 'DOSO · Source Sync · 11 Pages × 3 States';

function createMockFigma() {
  let nextId = 1;
  const variablesById = new Map();
  const collections = [];

  class MockNode {
    constructor(type) {
      this.id = `${type.toLowerCase()}-${nextId++}`;
      this.type = type;
      this.name = '';
      this.children = [];
      this.parent = null;
      this.pluginData = new Map();
      this.explicitVariableModes = {};
      this.fills = [];
      this.strokes = [];
      this.x = 0;
      this.y = 0;
      this.width = 0;
      this.height = 0;
      this.removed = false;
    }

    appendChild(node) {
      if (node.parent) {
        const currentIndex = node.parent.children.indexOf(node);
        if (currentIndex >= 0) node.parent.children.splice(currentIndex, 1);
      }
      node.parent = this;
      this.children.push(node);
    }

    resize(width, height) {
      this.width = width;
      this.height = height;
    }

    resizeWithoutConstraints(width, height) {
      this.resize(width, height);
    }

    setPluginData(key, value) {
      this.pluginData.set(key, String(value));
    }

    getPluginData(key) {
      return this.pluginData.get(key) ?? '';
    }

    setExplicitVariableModeForCollection(collection, modeId) {
      this.explicitVariableModes[collection.id] = modeId;
    }

    remove() {
      if (this.parent) {
        const index = this.parent.children.indexOf(this);
        if (index >= 0) this.parent.children.splice(index, 1);
      }
      this.parent = null;
      this.removed = true;
      for (const child of this.children) child.removed = true;
    }

    findOne(predicate) {
      for (const child of this.children) {
        if (predicate(child)) return child;
        const nested = child.findOne(predicate);
        if (nested) return nested;
      }
      return null;
    }

    findAll(predicate) {
      const found = [];
      for (const child of this.children) {
        if (predicate(child)) found.push(child);
        found.push(...child.findAll(predicate));
      }
      return found;
    }
  }

  const page = new MockNode('PAGE');
  page.selection = [];

  function createCollection(name, id = `collection-${nextId++}`) {
    const collection = {
      id,
      name,
      modes: [{ name: 'Mode 1', modeId: `${id}-mode-1` }],
      variableIds: [],
      addMode(modeName) {
        const modeId = `${id}-mode-${this.modes.length + 1}`;
        this.modes.push({ name: modeName, modeId });
        return modeId;
      },
      renameMode(modeId, modeName) {
        const mode = this.modes.find((item) => item.modeId === modeId);
        if (!mode) throw new Error(`Unknown mode ${modeId}`);
        mode.name = modeName;
      },
      remove() {
        const index = collections.indexOf(this);
        if (index >= 0) collections.splice(index, 1);
        for (const variableId of this.variableIds) variablesById.delete(variableId);
      },
    };
    collections.push(collection);
    return collection;
  }

  const oldLight = createCollection('DOSO / Theme', 'old-light');
  const oldDark = createCollection('DOSO / Theme / Dark', 'old-dark');
  oldLight.renameMode(oldLight.modes[0].modeId, 'Light');
  oldDark.renameMode(oldDark.modes[0].modeId, 'Dark');

  const oldSection = new MockNode('SECTION');
  oldSection.name = SECTION_NAME;
  oldSection.resize(1784, 10330);
  oldSection.x = 321;
  oldSection.y = 0;
  oldSection.setPluginData('source', 'doso-app/scripts/figma-source-sync-scripter-min.js');
  oldSection.setPluginData('contractVersion', '2026-08-28.2');
  oldSection.setPluginData('createdFrameCount', '33');
  oldSection.setPluginData('themeCollectionId', oldLight.id);
  oldSection.setPluginData('darkThemeCollectionId', oldDark.id);
  for (let index = 0; index < 33; index += 1) {
    const frame = new MockNode('FRAME');
    frame.name = `old-frame-${index + 1}`;
    frame.setPluginData('dosoPageId', `old-page-${Math.floor(index / 3) + 1}`);
    oldSection.appendChild(frame);
  }
  page.appendChild(oldSection);

  const figma = {
    editorType: 'figma',
    currentPage: page,
    viewport: { scrollAndZoomIntoView() {} },
    commitUndo() {},
    notify() {},
    async listAvailableFontsAsync() {
      return [
        { fontName: { family: 'Inter', style: 'Regular' } },
        { fontName: { family: 'Inter', style: 'Semi Bold' } },
        { fontName: { family: 'Inter', style: 'Bold' } },
      ];
    },
    async loadFontAsync() {},
    createFrame() {
      const node = new MockNode('FRAME');
      page.appendChild(node);
      return node;
    },
    createText() {
      const node = new MockNode('TEXT');
      page.appendChild(node);
      return node;
    },
    createSection() {
      const section = new MockNode('SECTION');
      page.appendChild(section);
      return section;
    },
    variables: {
      async getLocalVariableCollectionsAsync() { return [...collections]; },
      createVariableCollection(name) { return createCollection(name); },
      async getVariableByIdAsync(id) { return variablesById.get(id) ?? null; },
      createVariable(name, collection, resolvedType) {
        const variable = {
          id: `variable-${nextId++}`,
          name,
          resolvedType,
          scopes: [],
          valuesByMode: {},
          setValueForMode(modeId, value) { this.valuesByMode[modeId] = value; },
          setVariableCodeSyntax() {},
        };
        variablesById.set(variable.id, variable);
        collection.variableIds.push(variable.id);
        return variable;
      },
      setBoundVariableForPaint(paint, _field, variable) {
        return { ...paint, boundVariables: { color: { id: variable.id } } };
      },
    },
  };

  return { collections, figma, oldSection, page };
}

async function runGenerator(testHooks = {}) {
  const mock = createMockFigma();
  let printed;
  const context = {
    DOSO_SOURCE_SYNC_TEST: testHooks,
    figma: mock.figma,
    print(value) { printed = value; },
  };
  const promise = vm.runInNewContext(`(async () => { ${source}\n })()`, context);
  return { ...mock, printed, promise };
}

for (const failAtFrame of [1, 17, 33]) {
  const run = await runGenerator({ failAtFrame });
  const oldPluginData = Object.fromEntries(run.oldSection.pluginData);
  const oldChildren = [...run.oldSection.children];
  const oldCollectionIds = run.collections.map((collection) => collection.id);
  await assert.rejects(run.promise, new RegExp(`Injected acceptance-frame failure at ${failAtFrame}`));
  const liveSections = run.page.children.filter((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
  assert.equal(liveSections.length, 1, `failure ${failAtFrame}: exactly one live Section remains`);
  assert.equal(liveSections[0], run.oldSection, `failure ${failAtFrame}: the old Section remains authoritative`);
  assert.deepEqual(run.oldSection.children, oldChildren, `failure ${failAtFrame}: all old frames remain untouched`);
  assert.deepEqual(Object.fromEntries(run.oldSection.pluginData), oldPluginData, `failure ${failAtFrame}: old pluginData remains untouched`);
  assert.deepEqual(run.collections.map((collection) => collection.id), oldCollectionIds, `failure ${failAtFrame}: temporary theme collections are removed`);
  assert.deepEqual(run.page.children, [run.oldSection], `failure ${failAtFrame}: no staging or orphan scene nodes remain on the page`);
}

for (const failAfterSceneCreateAt of [1, 2, 33]) {
  const run = await runGenerator({ failAfterSceneCreateAt });
  const oldPluginData = Object.fromEntries(run.oldSection.pluginData);
  const oldChildren = [...run.oldSection.children];
  const oldCollectionIds = run.collections.map((collection) => collection.id);
  await assert.rejects(run.promise, new RegExp(`Injected scene-node failure after create at ${failAfterSceneCreateAt}`));
  assert.deepEqual(run.page.children, [run.oldSection], `scene failure ${failAfterSceneCreateAt}: no orphan Frame/Text nodes remain`);
  assert.deepEqual(run.oldSection.children, oldChildren, `scene failure ${failAfterSceneCreateAt}: all old frames remain untouched`);
  assert.deepEqual(Object.fromEntries(run.oldSection.pluginData), oldPluginData, `scene failure ${failAfterSceneCreateAt}: old pluginData remains untouched`);
  assert.deepEqual(run.collections.map((collection) => collection.id), oldCollectionIds, `scene failure ${failAfterSceneCreateAt}: temporary theme collections are removed`);
}

const success = await runGenerator();
await success.promise;
const liveSections = success.page.children.filter((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
assert.equal(liveSections.length, 1, 'success: one canonical Section remains');
assert.notEqual(liveSections[0], success.oldSection, 'success: the staging Section atomically replaces the old Section');
assert.equal(success.oldSection.removed, true, 'success: the old Section is retired only after staging validation');
assert.equal(liveSections[0].children.length, 33, 'success: replacement contains 33 frames');
assert.equal(liveSections[0].getPluginData('contractVersion'), '2026-08-30.1', 'success: replacement carries the new contract');
assert.equal(liveSections[0].getPluginData('createdFrameCount'), '33', 'success: replacement records the validated frame count');
assert.equal(liveSections[0].findAll((node) => node.type === 'FRAME' && node.name.indexOf('Field / ') === 0).length, 81, 'success: unavailable pages do not invent fields');
assert.equal(liveSections[0].findAll((node) => node.type === 'FRAME' && node.name === 'Action / Disabled').length, 6, 'success: only real disabled contract actions remain');
assert.equal(liveSections[0].findAll((node) => node.type === 'FRAME' && node.name === 'Action / Available').length, 21, 'success: available action count stays stable');
assert.equal(liveSections[0].findAll((node) => node.type === 'FRAME' && node.name === 'Demo Banner').length, 6, 'success: both unavailable pages render Demo Banner in all variants');
assert.equal(liveSections[0].findAll((node) => node.type === 'FRAME' && node.name === 'Blocked State').length, 6, 'success: both unavailable pages render Blocked State in all variants');
const activeThemeCollections = success.collections.filter((collection) => collection.name.startsWith('DOSO / Source Sync Theme / 2026-08-30.1'));
assert.ok(activeThemeCollections.length >= 1 && activeThemeCollections.every((collection) => collection.variableIds.length === 12), 'success: each new theme collection owns 12 variables');
assert.deepEqual(
  JSON.parse(liveSections[0].getPluginData('historicalThemeCollectionIds')).sort(),
  ['old-dark', 'old-light'],
  'success: retained previous collections are explicitly recorded as historical instead of silently leaked or unsafely deleted',
);
assert.deepEqual(success.page.children, liveSections, 'success: every generated scene node is nested under the replacement Section');

let liveReport;
await vm.runInNewContext(`(async () => { ${liveVerifierSource}\n })()`, {
  figma: success.figma,
  print(value) { liveReport = value; },
});
assert.equal(liveReport.pass, true, `success: live verifier passes: ${liveReport.errors.join(', ')}`);
assert.deepEqual(
  { ...liveReport.counts },
  { frames: 33, fields: 81, disabledActions: 6, availableActions: 21 },
  'success: live verifier reports the canonical frame, field, and action counts',
);
assert.ok(liveReport.collections.every((collection) => collection.variableCount === 12), 'success: live verifier reports 12 variables for each active collection');

console.log('Figma source-sync atomic replacement PASS (frame 1/17/33 + orphan Frame/Text cleanup + success)');
