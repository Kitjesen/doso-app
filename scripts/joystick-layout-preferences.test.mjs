import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import {
  JOYSTICK_LAYOUT_STORAGE_KEY,
  JoystickLayoutStorageError,
  createDefaultJoystickLayoutPreferences,
  createJoystickLayoutPreferenceStore,
  normalizeJoystickLayoutPreferences,
  resetJoystickLayout,
  resolveJoystickLayout,
  updateJoystickPlacement,
} from '../src/features/control/joystickLayoutPreferences.ts';

test('defaults are independent between orientations and instances', () => {
  const a = createDefaultJoystickLayoutPreferences(), b = createDefaultJoystickLayoutPreferences();
  assert.deepEqual(a.landscape.left, { sizeScale: 1.35, x: .08, y: .8 });
  assert.deepEqual(a.landscape.right, { sizeScale: 1.35, x: .92, y: .8 });
  assert.deepEqual(a.portrait.left, { sizeScale: 1, x: 0, y: .5 });
  assert.deepEqual(a.portrait.right, { sizeScale: 1, x: 1, y: .5 });
  assert.notEqual(a.portrait, a.landscape);
  assert.notEqual(a.portrait.left, a.landscape.left);
  assert.notEqual(a.landscape.left, b.landscape.left);
});

test('unknown versions and malformed records recover defaults without trusting numeric strings', () => {
  const defaults = createDefaultJoystickLayoutPreferences();
  for (const value of [undefined, null, [], 'stored', { version: 0 }, { version: 2 }]) {
    assert.deepEqual(normalizeJoystickLayoutPreferences(value), defaults);
  }
  const result = normalizeJoystickLayoutPreferences({ version: 1,
    landscape: { left: { sizeScale: '1.5', x: NaN, y: Infinity }, right: { sizeScale: 900, x: -5, y: 9 } },
    portrait: [] });
  assert.deepEqual(result.landscape.left, defaults.landscape.left);
  assert.deepEqual(result.landscape.right, { sizeScale: 1.75, x: 0, y: 1 });
  assert.deepEqual(result.portrait, defaults.portrait);
});

test('editing one disc and orientation preserves the other, clamps and never mutates the prior value', () => {
  const original = createDefaultJoystickLayoutPreferences();
  const changed = updateJoystickPlacement(original, 'landscape', 'left', { sizeScale: 4, x: .375, y: -3 });
  assert.deepEqual(changed.landscape.left, { sizeScale: 1.75, x: .375, y: 0 });
  assert.deepEqual(changed.landscape.right, original.landscape.right);
  assert.deepEqual(changed.portrait, original.portrait);
  assert.deepEqual(original.landscape.left, { sizeScale: 1.35, x: .08, y: .8 });
  const invalid = updateJoystickPlacement(changed, 'landscape', 'left', { x: NaN, sizeScale: Infinity });
  assert.deepEqual(invalid.landscape.left, changed.landscape.left);
  const portrait = updateJoystickPlacement(changed, 'portrait', 'right', { x: .2, y: .8 });
  const restored = resetJoystickLayout(portrait, 'landscape');
  assert.deepEqual(restored.landscape, original.landscape);
  assert.deepEqual(restored.portrait, portrait.portrait);
});

function insideResolved(result, width, height) {
  for (const side of ['left', 'right']) {
    const value = result[side];
    assert.ok(value.size >= 0 && Number.isFinite(value.size));
    assert.ok(value.left >= -1e-8 && value.top >= -1e-8);
    assert.ok(value.left + value.size <= width + 1e-8);
    assert.ok(value.top + value.size <= height + 1e-8);
    assert.equal(value.centerX, value.left + value.size / 2);
    assert.equal(value.centerY, value.top + value.size / 2);
  }
  assert.ok(result.left.left + result.left.size <= result.right.left + 1e-8, 'opposite-half discs overlap');
}

test('G20 and phone disc rectangles stay within opposite halves at every size and placement extreme', () => {
  for (const [width, height] of [[1232, 430], [753, 230], [350, 180], [240, 48], [90, 30], [8, 0], [0, 0]]) {
    for (const sizeScale of [.75, 1, 1.75]) for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
      const result = resolveJoystickLayout({ left: { sizeScale, x, y }, right: { sizeScale, x: 1 - x, y } },
        { width, height, baseSize: 144 });
      insideResolved(result, width, height);
      assert.equal(result.usable, result.left.size >= 48 && result.right.size >= 48);
    }
  }
});

test('relative layout recomputes safely across rotation and malformed dimensions disable interaction', () => {
  const requested = { left: { sizeScale: 1.5, x: .4, y: .8 }, right: { sizeScale: .75, x: .7, y: .3 } };
  const wide = resolveJoystickLayout(requested, { width: 1200, height: 400, baseSize: 144 });
  const narrow = resolveJoystickLayout(requested, { width: 360, height: 160, baseSize: 144 });
  assert.equal(wide.left.size, 216); assert.equal(wide.right.size, 108);
  assert.ok(narrow.left.size < wide.left.size);
  insideResolved(wide, 1200, 400); insideResolved(narrow, 360, 160);
  assert.deepEqual(requested.left, { sizeScale: 1.5, x: .4, y: .8 });
  for (const dimensions of [{ width: NaN, height: 50, baseSize: 100 },
    { width: 360, height: Infinity, baseSize: 100 }, { width: 360, height: 160, baseSize: 0 }]) {
    assert.equal(resolveJoystickLayout(requested, dimensions).usable, false);
  }
});

test('landscape factory defaults match the annotated lower thumb positions while portrait stays centered', () => {
  const preferences = createDefaultJoystickLayoutPreferences();
  const result = resolveJoystickLayout(preferences.landscape, { width: 1250 - 24, height: 650 - 104 - 116, baseSize: 144 });
  assert.equal(result.left.size, 194); assert.equal(result.right.size, 194);
  const leftRatio = (12 + result.left.centerX) / 1250;
  const rightRatio = (12 + result.right.centerX) / 1250;
  const verticalRatio = (104 + result.left.centerY) / 650;
  assert.ok(Math.abs(leftRatio - .115) < .003, `left center ${leftRatio}`);
  assert.ok(Math.abs(rightRatio - .885) < .003, `right center ${rightRatio}`);
  assert.ok(Math.abs(verticalRatio - .6) < .005, `vertical center ${verticalRatio}`);
  assert.equal(result.left.centerY, result.right.centerY);
  insideResolved(result, 1250 - 24, 650 - 104 - 116);
});

const legacyLandscape = () => ({ left: { sizeScale: 1, x: 0, y: .5 }, right: { sizeScale: 1, x: 1, y: .5 } });
test('only the whole exact unmarked legacy landscape factory pair migrates, without a storage write', async () => {
  const portrait = { left: { sizeScale: 1.2, x: .2, y: .8 }, right: { sizeScale: .9, x: .6, y: .7 } };
  let writes = 0;
  const store = createJoystickLayoutPreferenceStore({
    async getItem() { return JSON.stringify({ version: 1, portrait, landscape: legacyLandscape() }); },
    async setItem() { writes++; },
  });
  const loaded = await store.load();
  assert.deepEqual(loaded.landscape, createDefaultJoystickLayoutPreferences().landscape);
  assert.deepEqual(loaded.portrait, portrait); assert.equal(writes, 0);
});

test('legacy custom positions or metadata remain authoritative, even if the other disc is untouched', async () => {
  for (const customize of [
    value => { value.left.x = .001; },
    value => { value.right.sizeScale = 1.001; },
    value => { value.left.y = .501; },
    value => { value.customized = true; },
    value => { value.right.customized = true; },
  ]) {
    const landscape = legacyLandscape(); customize(landscape);
    const source = { version: 1, portrait: createDefaultJoystickLayoutPreferences().portrait, landscape };
    const store = createJoystickLayoutPreferenceStore({ async getItem() { return JSON.stringify(source); }, async setItem() { throw Error('unexpected write'); } });
    assert.deepEqual((await store.load()).landscape, normalizeJoystickLayoutPreferences(source).landscape);
  }
});

test('a current explicit save at the old coordinates never migrates on reload and keeps schema/key v1', async () => {
  let text = null;
  const keys = [];
  const store = createJoystickLayoutPreferenceStore({
    async getItem(key) { keys.push(key); return text; },
    async setItem(key, value) { keys.push(key); text = value; },
  });
  const selected = { ...createDefaultJoystickLayoutPreferences(), landscape: legacyLandscape() };
  await store.save(selected);
  assert.equal(JSON.parse(text).version, 1);
  assert.equal(JSON.parse(text).defaultsRevision, 2);
  assert.deepEqual(await store.load(), selected);
  assert.ok(keys.every(key => key === JOYSTICK_LAYOUT_STORAGE_KEY));
  text = JSON.stringify({ ...selected, defaultsRevision: 3 });
  assert.deepEqual(await store.load(), selected, 'future saved metadata must not be treated as untouched legacy defaults');
});

test('local preference round trip reads and writes only its dedicated key', async () => {
  let value = null;
  const keys = [];
  const store = createJoystickLayoutPreferenceStore({
    async getItem(key) { keys.push(key); return value; },
    async setItem(key, text) { keys.push(key); value = text; },
  });
  assert.deepEqual(await store.load(), createDefaultJoystickLayoutPreferences());
  const preferred = updateJoystickPlacement(createDefaultJoystickLayoutPreferences(), 'portrait', 'right', { y: .9 });
  await store.save(preferred);
  assert.deepEqual(await store.load(), preferred);
  assert.ok(keys.every(key => key === JOYSTICK_LAYOUT_STORAGE_KEY));
  value = '{broken'; assert.deepEqual(await store.load(), createDefaultJoystickLayoutPreferences());
  value = '{"version":0}'; assert.deepEqual(await store.load(), createDefaultJoystickLayoutPreferences());
});

test('slow earlier saves cannot overwrite a later edit', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [], values = [];
  const store = createJoystickLayoutPreferenceStore({
    async getItem() { return values.at(-1) ?? null; },
    async setItem(key, value) { calls.push(key); if (calls.length === 1) await gate; values.push(value); },
  });
  const one = updateJoystickPlacement(createDefaultJoystickLayoutPreferences(), 'landscape', 'left', { x: .1 });
  const two = updateJoystickPlacement(one, 'landscape', 'left', { x: .9 });
  const first = store.save(one), second = store.save(two);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1, 'newer write started while old write was unresolved');
  release(); await Promise.all([first, second]);
  assert.deepEqual(await store.load(), two);
});

test('storage failures are surfaced without raw exceptions and a later save can recover', async () => {
  let fail = true, value = null;
  const store = createJoystickLayoutPreferenceStore({
    async getItem() { if (fail) throw new Error('private provider failure'); return value; },
    async setItem(key, text) { if (fail) throw new Error('private provider failure'); value = text; },
  });
  const failsSafely = error => error instanceof JoystickLayoutStorageError && !error.message.includes('private');
  await assert.rejects(store.load(), failsSafely);
  await assert.rejects(store.save(createDefaultJoystickLayoutPreferences()), failsSafely);
  fail = false;
  const saved = updateJoystickPlacement(createDefaultJoystickLayoutPreferences(), 'landscape', 'left', { sizeScale: 1.5 });
  await store.save(saved); assert.deepEqual(await store.load(), saved);
});

test('default web/native adapters use the dedicated layout key without crossing account stores', async () => {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/features/control/joystickLayoutPreferences.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const platform of ['web', 'android']) {
    const module = { exports: {} }, values = new Map(), calls = [];
    const dependencies = {
      'react-native': { Platform: { OS: platform } },
      'expo-secure-store': {
        async getItemAsync(key) { calls.push(['native-get', key]); return values.get(key) ?? null; },
        async setItemAsync(key, value) { calls.push(['native-set', key]); values.set(key, value); },
      },
    };
    vm.runInNewContext(code, { module, exports: module.exports,
      localStorage: {
        getItem(key) { calls.push(['web-get', key]); return values.get(key) ?? null; },
        setItem(key, value) { calls.push(['web-set', key]); values.set(key, value); },
      },
      require(name) {
        if (!(name in dependencies)) throw Error(`Unexpected layout dependency: ${name}`);
        return dependencies[name];
      },
    });
    const api = module.exports;
    const preferred = api.updateJoystickPlacement(api.createDefaultJoystickLayoutPreferences(), 'landscape', 'right', { y: .8 });
    await api.saveJoystickLayoutPreferences(preferred);
    assert.deepEqual(JSON.parse(JSON.stringify(await api.loadJoystickLayoutPreferences())), JSON.parse(JSON.stringify(preferred)));
    assert.ok(calls.length >= 2);
    assert.ok(calls.every(([method, key]) => method.startsWith(platform === 'web' ? 'web-' : 'native-') && key === JOYSTICK_LAYOUT_STORAGE_KEY));
    assert.deepEqual([...values.keys()], [JOYSTICK_LAYOUT_STORAGE_KEY]);
  }
});
