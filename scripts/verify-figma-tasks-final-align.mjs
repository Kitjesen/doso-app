import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./figma-tasks-final-align-scripter.js', import.meta.url), 'utf8');

for (const id of ['139:6722', '139:4209', '139:11041']) assert.match(source, new RegExp(id.replace(':', '\\:')));
assert.match(source, /DOSO_TASKS_FINAL_ALIGN_PASS/);
assert.match(source, /dosoTasksFinalAlignVersion/);
assert.match(source, /const PREFIX = 'DOSO QA \/ Tasks Final \/'/);
assert.match(source, /root\.id === id/);
assert.doesNotMatch(source, /\.remove\s*\(/);
assert.doesNotMatch(source, /createPage\s*\(/);
assert.doesNotMatch(source, /createFrame\s*\(/);
assert.doesNotMatch(source, /figma\.notify\s*\(/);
assert.match(source, /生产控制与任务执行器未接入/);
assert.match(source, /THUNDER 01 尚未同步可信任务/);
assert.match(source, /paint\.type === 'IMAGE'/);

console.log('figma tasks final align verifier: PASS');
