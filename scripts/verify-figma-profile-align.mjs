import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./figma-profile-align-use-figma.js', import.meta.url), 'utf8');
new vm.Script(`(async () => { ${source} })()`);

for (const nodeId of ['139:7104', '139:4589', '139:10918']) {
  assert.match(source, new RegExp(nodeId.replace(':', '\\:')), `missing bound Profile node ${nodeId}`);
}

for (const staleCopy of [
  'Online', '50%', 'v2.4.1', '6.4 h', '2 min ago', 'Thunder-07', 'SN · DS07-8E4F-A912',
]) {
  assert.match(source, new RegExp(`\\['${staleCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',`), `missing replacement for stale fixture ${staleCopy}`);
}

for (const truthfulCopy of [
  '你好，DOSO Demo', '管理 THUNDER 01 的连接与设备设置', '离线', '待同步', '尚未同步',
  '序列号 · 待绑定', '连接说明', '状态说明', '当前离线', '真实安全配网能力未接入',
  '只读 · 实体执行器尚未接入', '偏好已开启 · 通知服务待接入',
]) {
  assert.ok(source.includes(truthfulCopy), `missing truthful Profile copy ${truthfulCopy}`);
}

assert.match(source, /getStyledTextSegments\(\['fontName'\]\)/, 'current Figma fonts must be discovered before text mutation');
assert.match(source, /family: 'Noto Sans SC'/, 'truthful Chinese copy must use the product CJK font');
assert.match(source, /mutatedNodeIds: \[\.\.\.mutatedNodeIds\]/, 'every mutation must return its node ID');
assert.match(source, /alignmentVersion: '2026-09-04\.3'/, 'alignment version must identify the executable patch');
assert.doesNotMatch(source, /setPluginData|figma\.notify|figma\.closePlugin/, 'use_figma patch must avoid unsupported plugin lifecycle and metadata APIs');
assert.doesNotMatch(source, /\.remove\s*\(/, 'Profile alignment must preserve bound frame and child node IDs');

console.log('Figma Profile alignment source PASS — 3 bound states, truthful fixtures, Noto Sans SC, no unsupported APIs');
