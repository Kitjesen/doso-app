import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./figma-control-align-use-figma.js', import.meta.url), 'utf8');
new vm.Script(`(async () => {\n${source}\n})()`);

for (const id of ['139:6520', '139:4019', '139:8596']) {
  assert.match(source, new RegExp(`id: '${id.replace(':', '\\:')}'`), `Control alignment keeps bound Figma frame ${id}`);
}

for (const fixture of ['120 m', '34%', '50%', '60%', '6.4 h', '94%', '12 / 12 sensors online']) {
  assert.match(source, new RegExp(`\\['${fixture.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}',`), `Control alignment replaces stale fixture ${fixture}`);
}

for (const copy of ['待同步', '设备离线，可信遥测尚未接入', '实时状态不可用', '地图待同步']) {
  assert.ok(source.includes(copy), `Control alignment includes truthful copy: ${copy}`);
}

assert.match(source, /node\.name === 'Live Route Map'/, 'Control alignment targets the native route-map node');
assert.match(source, /neutralizePaint\(paint, target\.neutral\)/, 'Control alignment neutralizes route paints instead of replacing the native map asset');
assert.match(source, /node\.name === 'Map \/ Unavailable'/, 'Control alignment reuses an existing unavailable badge');
assert.match(source, /badge = figma\.createFrame\(\)/, 'Control alignment creates a standard Figma frame when the badge is absent');
assert.match(source, /alignmentVersion: '2026-09-04\.2'/, 'Control alignment returns a versioned execution result');
assert.match(source, /mutatedNodeIds: \[\.\.\.mutatedNodeIds\]/, 'Control alignment reports every mutated node');
assert.doesNotMatch(source, /setPluginData|figma\.notify|figma\.closePlugin|\.remove\(/, 'Control alignment avoids unsupported lifecycle calls and destructive deletion');

console.log('DOSO Figma Control alignment script PASS — bound, truthful, native-map preserving, non-destructive');
