import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('src/screens/HomeScreen.tsx');
const app = read('App.tsx');
const qa = read('src/design-qa/DesignQaRoot.tsx');
// Check the current runtime components, not obsolete raster/absolute geometry.
assert.match(home, /useProductAppearance\(\)/);
assert.doesNotMatch(home, /doso-soft-air/, 'home keeps a solid page background');
assert.doesNotMatch(read('src/components/BottomNav.tsx'), /doso-soft-air/, 'navigation does not depend on a generated backdrop');
assert.match(read('src/appearance.ts'), /useAppTheme\(\)/);
assert.match(home, /useWindowDimensions\(\)/);
assert.match(home, /getAdaptivePageLayout\(/);
assert.match(home, /columns: \{ flexDirection: 'row'/);
assert.match(home, /<ScrollView/);
assert.doesNotMatch(home, /landscapeCanvasWidth|resizeMode="stretch"/);
assert.match(qa, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/);
assert.match(app, /const safeAreaEdges:[\s\S]*?\['top', 'left', 'right', 'bottom'\]/);
assert.match(app, /<AppHeader\s+flow(?:\s|>)/);
assert.match(qa, /<AppHeader\s+flow(?:\s|>)/);
assert.equal((home.match(/source=\{robotImage\}/g) || []).length, 1);
assert.doesNotMatch(home, /images\.home(?:Recall|Quick|Metric)/, 'native icons replace white-backed functional PNGs');
assert.match(home, /batteryPercent\?: number \| null/);
assert.match(home, /Number.isFinite\(batteryPercent\)/);
assert.match(home, /hasTrustedBattery \? batteryPercent : '—'/);
assert.match(home, />待同步<\/Text>/);
assert.doesNotMatch(home, />34%<|12\/12|32°C|运行中/);
assert.match(home, /实际操作需连接设备并获得控制权限/);
assert.match(home, /disabled=\{!canRecall\}/);
assert.match(home, /if \(canRecall\) onRecall\(\)/);
assert.match(home, /recallBlockedReason \?\?/);
assert.match(home, /onPress=\{onOpenControl\}/);
for (const callback of ['onOpenRoutes', 'onOpenTasks', 'onOpenSafety']) assert.ok(home.includes('onPress: ' + callback));
assert.doesNotMatch(home, /quickSubtitle/);
const flat = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
for (const config of [{}, { dark: true }, { width: 320, height: 844, fontScale: 1.5 }, { width: 960, height: 600 }]) {
  const calls = [];
  const screen = mountAuthScreen({ screen: 'home', robotName: 'THUNDER 01', robotImage: 'selected-robot',
    connected: false, canRecall: false, safetyLock: false,
    onRecall: () => calls.push('recall'), onOpenControl: () => calls.push('control'),
    onOpenRoutes: () => calls.push('routes'), onOpenTasks: () => calls.push('tasks'),
    onOpenSafety: () => calls.push('safety'), ...config });
  assert.equal(screen.nodes.filter(node => node.type === 'Image').length, 1);
  assert.match(screen.copy, /离线/);
  assert.match(screen.copy, /电量待同步/);
  assert.doesNotMatch(screen.copy, /34%|12\/12|32°C|运行中|查看路线|查看任务|状态与设置/);
  assert.equal(screen.nodes.some(node => node.props?.testID === 'home-battery-meter'), false);
  const recall = screen.action('home-recall');
  assert.equal(recall.props.disabled, true);
  recall.props.onPress();
  assert.deepEqual(calls, []);
  for (const [id, call] of [['home-control','control'],['home-quick-0','routes'],['home-quick-1','tasks'],['home-quick-2','safety']]) {
    const node = screen.action(id);
    assert.equal(node.props.accessibilityRole, 'button');
    assert.ok(flat(node.props.style({ pressed: false })).minHeight >= 48);
    node.props.onPress();
    assert.equal(calls.at(-1), call);
  }
}
console.log('DOSO adaptive home component and product-truth contract PASS (not native verification)');
