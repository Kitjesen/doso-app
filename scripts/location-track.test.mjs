import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/location/track.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { buildTrack } = module.exports;
const at = Date.parse('2026-11-09T00:00:00.000Z');
const point = (seconds, meters = 0, patch = {}) => ({ reportTs: at + seconds * 1000, breakBefore: false,
  location: { lat: 0, lon: meters / 111194.9266, fixType: 1, observedAt: new Date(at + seconds * 1000).toISOString(), accuracyM: null }, ...patch });

test('no fix keeps metrics absent and one fix records zero covered time', () => {
  assert.equal(buildTrack([]).distanceM, null);
  assert.equal(buildTrack([point(0, 0, { location: null })]).durationMs, null);
  const track = buildTrack([point(0)]);
  assert.equal(track.distanceM, 0); assert.equal(track.durationMs, 0); assert.equal(track.unknownAccuracy, true);
});
test('distance accumulates from accepted anchors while continuous fixes cover elapsed time', () => {
  const track = buildTrack([point(0), point(1, 1), point(2, 2), point(3, 4)]);
  assert.ok(Math.abs(track.distanceM - 4) < 0.01); assert.equal(track.durationMs, 3000);
  assert.equal(track.trail.length, 4); assert.equal(track.trail[0].breakBefore, true);
});
test('known accuracy raises movement threshold', () => {
  const start = point(0), end = point(1, 6); start.location.accuracyM = 10; end.location.accuracyM = 10;
  const track = buildTrack([start, end]); assert.equal(track.distanceM, 0); assert.equal(track.unknownAccuracy, false);
});
test('null fixes, consent changes, long gaps and jumps break distance and covered time', () => {
  for (const points of [[point(0), point(1, 0, { location: null }), point(2, 10)],
    [point(0), point(1, 10, { breakBefore: true })], [point(0), point(16, 10)], [point(0), point(1, 100)]]) {
    const track = buildTrack(points); assert.equal(track.distanceM, 0); assert.equal(track.durationMs, 0);
    assert.equal(track.gaps, 1); assert.equal(track.trail[1].breakBefore, true);
  }
});
test('fix timestamps deduplicate globally and reversed fixes never connect backwards', () => {
  const track = buildTrack([point(2), point(2, 10), point(1, 5), point(3, 10)]);
  assert.equal(track.trail.length, 2); assert.equal(track.trail[1].breakBefore, true);
  assert.equal(track.durationMs, 0); assert.equal(track.distanceM, 0);
  assert.equal(track.firstFix, new Date(at + 2000).toISOString());
});
test('a repeated fix after a no-fix report cannot bridge the missing interval', () => {
  const track = buildTrack([point(0), point(1, 0, { location: null }), point(0), point(2, 10)]);
  assert.equal(track.durationMs, 0); assert.equal(track.distanceM, 0); assert.equal(track.trail.length, 2);
});
