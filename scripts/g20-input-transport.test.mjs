import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/g20Input.ts', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
let sequence = 0;
async function load(native, platform = 'android') {
  globalThis.__g20Native = native; globalThis.__g20Platform = { OS: platform };
  const expo = moduleUrl(`export const requireOptionalNativeModule = () => globalThis.__g20Native; //${++sequence}`);
  const rn = moduleUrl(`export const Platform = globalThis.__g20Platform; //${sequence}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace("from 'expo'", `from '${expo}'`).replace("from 'react-native'", `from '${rn}'`);
  return (await import(moduleUrl(compiled + `\n//${sequence}`))).g20Input;
}
const native = (captureInputFence = () => 1050) => ({
  start: async () => ({}), stop: async () => ({}), getStatus: () => ({}), isSampleFresh: () => true,
  addListener: () => ({ remove() {} }), captureInputFence,
});

test('latest observation passes the request identity and fails closed when unavailable', async () => {
  const old = await load(native()); assert.equal(old.latestObservationAvailable, false);
  assert.equal(old.latestObservation('raw'), null);
  const module = native(); const sample = { sequence: 9 }; let requested;
  module.getLatestObservation = id => { requested = id; return sample; };
  const api = await load(module); assert.equal(api.latestObservationAvailable, true);
  assert.equal(api.latestObservation('raw'), sample); assert.equal(requested, 'raw');
  module.getLatestObservation = () => { throw Error('stopped'); };
  assert.equal(api.latestObservation('raw'), null);
});

test('fence uses the native Android timestamp unchanged, without the JS clock', async () => {
  const api = await load(native());
  assert.equal(api.available, true); assert.equal(api.captureFence(), 1050);
});
test('old native modules and non-Android cannot supply a grant fence or start capture', async () => {
  const old = native(); delete old.captureInputFence;
  for (const [module, platform] of [[old, 'android'], [native(), 'web'], [native(), 'ios']]) {
    const api = await load(module, platform); assert.equal(api.available, false);
    assert.equal(api.captureFence(), null); await assert.rejects(api.start('fixture'));
  }
});
test('invalid or unavailable native clocks never turn into an eligible fence', async () => {
  for (const value of [null, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const api = await load(native(() => value)); assert.equal(api.captureFence(), null);
  }
  const api = await load(native(() => { throw Error('native unavailable'); }));
  assert.equal(api.captureFence(), null);
});
test('observation requires its own native entry and never falls back to configuration polling', async () => {
  let guardedStarts = 0;
  const old = native(); old.start = async () => { guardedStarts++; return {}; };
  const oldApi = await load(old);
  assert.equal(oldApi.observationAvailable, false); await assert.rejects(oldApi.observe('raw'));
  assert.equal(guardedStarts, 0);
  old.observe = async requestId => ({ requestId, configurationReady: false });
  const api = await load(old); assert.equal(api.observationAvailable, true);
  assert.equal((await api.observe('raw')).configurationReady, false);
  assert.equal(guardedStarts, 0);
});
