import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/screens/JointStatusScreen.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(joints, props = {}) {
  const palette = { canvas: '#FFFFFF', surface: '#F4F7FA', ink: '#202020', secondary: '#666666', blueInk: '#214F71' };
  const allowed = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/AppText': { Text: 'Text' },
    '../appearance': { getProductAppearance: () => palette },
    '../theme': { useAppTheme: () => ({ isDark: false }) },
    '../typography': { typography: { compactTitle: {}, caption: {}, label: {}, supporting: {} } },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    if (name in allowed) return allowed[name];
    throw new Error(`Unexpected joint status dependency: ${name}`);
  } });
  const nodes = [];
  const copy = node => {
    if (node == null || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(copy).join(' ');
    if (typeof node !== 'object') return String(node);
    return copy(node.props?.children);
  };
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node);
    walk(node.props?.children);
  }
  const tree = module.exports.JointStatusScreen({ deviceName: 'THUNDER', joints, onBack() {}, ...props });
  walk(tree);
  return { copy: copy(tree), node: id => nodes.find(node => node.props?.testID === id), rowCopy: id => copy(nodes.find(node => node.props?.testID === `joint-status-${id}`)) };
}

test('diagnostics show the selected endpoint, update time and safe refresh state', () => {
  let refreshes = 0;
  const props = { deviceName: 'robot-a.example.test:13145', observedAt: '2026-10-25T10:00:00Z',
    onRefresh: () => { refreshes++; }, error: '遥测读取失败' };
  const host = mount([], props);
  assert.match(host.copy, /robot-a\.example\.test:13145/);
  assert.ok(host.node('joint-status-updated'));
  assert.match(host.copy, /遥测读取失败/);
  host.node('joint-status-refresh').props.onPress(); assert.equal(refreshes, 1);
  assert.equal(mount([], { ...props, refreshing: true }).node('joint-status-refresh').props.disabled, true);
  assert.equal(mount([], { observedAt: 'invalid' }).node('joint-status-updated'), undefined);
});

test('joint status screen is read-only and keeps unknown telemetry truthful', () => {
  assert.match(source, /testID="joint-status-screen"/);
  assert.match(source, /testID="joint-status-empty"/);
  assert.match(source, /连接设备并完成状态读取后显示/);
  assert.match(source, /valueLabel\(joint\.positionDeg, '°'\)/);
  assert.match(source, /valueLabel\(joint\.temperatureC, '°C'\)/);
  assert.match(source, /valueLabel\(joint\.voltageV, 'V'\)/);
  assert.match(source, /valueLabel\(joint\.velocityRps, 'rad\/s'\)/);
  assert.match(source, /valueLabel\(joint\.torqueNm, 'N m'\)/);
  assert.match(source, /motorHealthLabel/);
  assert.doesNotMatch(source, /onStart|onControl|dispatch|sendCommand|fetch\(/);
});

test('joint status screen only renders validated joint records', () => {
  assert.match(source, /typeof joint\?\.id === 'string'/);
  assert.match(source, /typeof joint\.label === 'string'/);
  assert.match(source, /joint\.source === 'device'/);
});

test('joint page displays operating state semantics instead of calling nonzero statuses faults', () => {
  const screen = mount([0, 1, 2, 3, 99].map((statusCode, id) => ({
    id: String(id), label: `关节 ${id}`, source: 'device', online: true, statusCode, errors: [], fault: statusCode <= 2 ? 'clear' : 'unknown',
  })));
  for (const [id, label] of [[0, '复位'], [1, '标定'], [2, '运行'], [3, '未知'], [4, '未知']]) {
    assert.match(screen.rowCopy(id), new RegExp(label));
    assert.doesNotMatch(screen.rowCopy(id), /正常|故障/);
  }
});

test('offline, fault and unverified sources stay distinct from operational modes', () => {
  const joint = { source: 'device', online: true, statusCode: 2, errors: [], fault: 'clear' };
  const screen = mount([
    { ...joint, id: 'offline', label: '离线电机', online: false, positionDeg: null, temperatureC: null, voltageV: null, velocityRps: null, torqueNm: null },
    { ...joint, id: 'fault', label: '错误电机', errors: [4] },
    { ...joint, id: 'unknown', label: '未知来源', source: 'unknown' },
    { ...joint, id: 'zero', label: '在线零值', positionDeg: 0, temperatureC: 0, velocityRps: 0, torqueNm: 0 },
  ]);
  assert.match(screen.rowCopy('offline'), /离线/);
  assert.doesNotMatch(screen.rowCopy('offline'), /0\.0|正常|运行/);
  assert.match(screen.rowCopy('fault'), /故障/);
  assert.match(screen.rowCopy('unknown'), /未同步/);
  assert.doesNotMatch(screen.rowCopy('unknown'), /正常|运行/);
  assert.match(screen.rowCopy('zero'), /0\.0 °/);
  assert.match(screen.rowCopy('zero'), /0\.0 rad\/s/);
});

console.log('Joint status screen contract PASS — read-only, validated records, unknown telemetry remains unknown');
