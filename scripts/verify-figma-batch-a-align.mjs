import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('./figma-batch-a-align-scripter.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8');
const ids = ['139:7397', '139:4784', '139:10680', '139:6722', '139:4209', '139:11041', '139:6636', '139:4126', '139:10575'];

for (const id of ids) assert.equal(source.split(`'${id}'`).length - 1, 1, `${id} must be targeted exactly once`);
assert.match(source, /getNodeByIdAsync\(target\.id\)/, 'must edit existing roots by ID');
assert.doesNotMatch(source, /\.remove\(\)|createFrame\(/, 'must not replace or rebuild root frames');
assert.match(source, /reusedEditableAssetCount/, 'must report retained editable assets');
assert.match(source, /parent\.insertChild\(mondayChildIndex, selected\)/, 'must move the selected task date in auto layout');
assert.match(source, /normalize\(node\.characters\) === spec\.value/, 'must reuse existing status text instead of stacking duplicates');
assert.match(source, /alignHomeRobots\(root\)/, 'must align the existing home robot assets');
assert.match(source, /moveToAbsolute\(filters, root, 69, 204\)/, 'must align the routes landscape filter to the safe-area column');
assert.doesNotMatch(source, /createNodeFromSvg|createEllipse\(/, 'must not fabricate replacement icons');
assert.match(source, /生产控制与路线执行器未接入/, 'must disclose unavailable route execution');
assert.match(source, /生产控制与任务执行器未接入/, 'must disclose unavailable task execution');
assert.match(source, /设备已离线 · 实体运动协议尚未接入/, 'must remove fake online state');
assert.match(source, /DOSO_BATCH_A_ALIGN_PASS/, 'must emit the Scripter completion marker');

console.log('FIGMA_BATCH_A_ALIGN_SOURCE_PASS');
