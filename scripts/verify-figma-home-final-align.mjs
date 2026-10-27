import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./figma-home-final-align-scripter.js', import.meta.url), 'utf8');

for (const id of ['139:6636', '139:4126', '139:10575']) assert.match(source, new RegExp(id.replace(':', '\\:')));
assert.match(source, /DOSO_HOME_FINAL_ALIGN_PASS/);
assert.match(source, /dosoHomeFinalAlignVersion/);
assert.match(source, /快捷操作/);
assert.match(source, /Quick actions/);
assert.match(source, /node\.id === id/);
assert.doesNotMatch(source, /\.remove\s*\(/);
assert.doesNotMatch(source, /createPage\s*\(/);
assert.doesNotMatch(source, /createFrame\s*\(/);
assert.doesNotMatch(source, /figma\.notify\s*\(/);

console.log('figma home final align verifier: PASS');
