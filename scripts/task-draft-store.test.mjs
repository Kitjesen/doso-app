import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}
const model = load('features/tasks/draft.ts');
const { createTaskDraftStore } = load('services/taskDraft.ts', {
  '../features/tasks/draft': model, './localStore': { localStore: {} },
});
const draft = { ...model.makeTaskDraft('2026-11-12'), name: '园区巡检', route: '东侧路线', checkpointCount: 6, checkpoint: 3 };
function storage() {
  const values = new Map();
  return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
}

test('draft survives a new store and stays isolated by account and device', async () => {
  const disk = storage(), store = createTaskDraftStore(disk);
  await store.save('account-a:robot-1', draft);
  const restored = createTaskDraftStore(disk);
  assert.equal((await restored.load('account-a:robot-1')).name, draft.name);
  assert.equal(await restored.load('account-a:robot-2'), null);
  assert.equal(await restored.load('account-b:robot-1'), null);
  assert.equal(await restored.load('account-a_3a_robot-1'), null);
  assert.match([...disk.values.keys()][0], /^[A-Za-z0-9._-]+$/);
});

test('queued saves retain order and a failed save preserves the last draft', async () => {
  const disk = storage();
  let complete, fail = false, writes = 0;
  const store = createTaskDraftStore({ ...disk, async setItem(key, value) {
    writes++;
    if (writes === 1) await new Promise(resolve => { complete = resolve; });
    if (fail) throw Error('disk unavailable');
    await disk.setItem(key, value);
  } });
  const first = store.save('a:r', draft), second = store.save('a:r', { ...draft, name: '新版' });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(writes, 1);
  complete(); await Promise.all([first, second]);
  assert.equal((await store.load('a:r')).name, '新版');
  fail = true;
  await assert.rejects(store.save('a:r', { ...draft, name: '不能保存' }), /disk unavailable/);
  assert.equal((await store.load('a:r')).name, '新版');
});

test('invalid stored data is reported without deleting or replacing it', async () => {
  const disk = storage(), store = createTaskDraftStore(disk);
  await store.save('a:r', draft);
  const key = [...disk.values.keys()][0];
  disk.values.set(key, JSON.stringify({ ...draft, checkpoint: 7 }));
  await assert.rejects(store.load('a:r'), /草稿格式/);
  assert.equal(JSON.parse(disk.values.get(key)).checkpoint, 7);
  assert.throws(() => store.save('a:r', { ...draft, name: null }), /草稿格式/);
});
