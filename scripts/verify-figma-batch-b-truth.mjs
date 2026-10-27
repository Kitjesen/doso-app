import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./figma-batch-b-truth-scripter.js', import.meta.url), 'utf8');
new vm.Script(`(async () => { ${source} })()`);

for (const page of ['auth-login', 'auth-register', 'model-select', 'main-analysis', 'main-profile', 'robot-control']) {
  assert.match(source, new RegExp(`'${page}'`), `missing ${page}`);
}
assert.equal((source.match(/'139:\d+'/g) || []).length, 18, 'Batch B must preserve exactly 18 bound frames');
assert.match(source, /DOSO Social Providers \/ Unavailable/);
assert.match(source, /可预览 4 款机型/);
assert.match(source, /预览 · 正常/);
assert.match(source, /真实安全配网能力未接入/);
assert.match(source, /实时状态不可用/);
assert.doesNotMatch(source, /\.remove\s*\(/, 'targeted truth sync must not delete cloud nodes');
assert.match(source, /DOSO_BATCH_B_TRUTH_PASS/);

console.log('Figma Batch B truth sync source PASS — 18 bound frames, truthful states, no deletion');
