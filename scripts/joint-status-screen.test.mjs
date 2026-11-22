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

function mount(joints, props = {}, options = {}) {
  const palette = { canvas: '#FFFFFF', surface: '#F4F7FA', ink: '#202020', secondary: '#666666', blueInk: '#214F71' };
  const state = [];
  const effects = [];
  const appStateListeners = new Set();
  const navigationCalls = [];
  let viewport = options.viewport ?? { width: 800, height: 480 };
  let stateIndex = 0;
  let effectIndex = 0;
  const allowed = {
    react: { useEffect: (run, dependencies) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))) return;
      previous?.cleanup?.();
      effects[index] = { dependencies, cleanup: run() };
    }, useState: initial => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; render(); }];
    } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value },
      useWindowDimensions: () => viewport,
      AppState: { currentState: options.appState ?? 'active', addEventListener: (_event, callback) => {
        appStateListeners.add(callback); return { remove: () => appStateListeners.delete(callback) };
      } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/AppText': { Text: 'Text' },
    '../appearance': { getProductAppearance: () => palette },
    '../theme': { useAppTheme: () => ({ isDark: false }) },
    '../services/brainstemGrpc': { setControlNavigationHidden: value => { navigationCalls.push(value); return Promise.resolve(0); } },
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
  let tree;
  function render() {
    stateIndex = 0;
    effectIndex = 0;
    nodes.length = 0;
    tree = module.exports.JointStatusScreen({ deviceName: 'THUNDER', joints, onBack() {}, ...props });
    walk(tree);
  }
  render();
  return { get copy() { return copy(tree).replace(/\s+/g, ' ').trim(); }, node: id => nodes.find(node => node.props?.testID === id),
    updateJoints: value => { joints = value; render(); },
    navigationCalls,
    changeAppState: value => { allowed['react-native'].AppState.currentState = value; appStateListeners.forEach(callback => callback(value)); },
    changeViewport: value => { viewport = value; render(); },
    unmount: () => { effects.forEach(effect => effect.cleanup?.()); },
    toggleDetails: () => nodes.find(node => node.props?.testID === 'joint-status-details-toggle')?.props.onPress(),
    nodeCopy: id => copy(nodes.find(node => node.props?.testID === id)).replace(/\s+/g, ' ').trim(),
    rowCopy: id => copy(nodes.find(node => node.props?.testID === `joint-status-${id}`)).replace(/\s+/g, ' ').trim(),
    get rowIds() { return nodes.filter(node => /^joint-status-\d+$/.test(node.props?.testID)).map(node => node.props.testID); } };
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
  const screen = mount([{ id: '0', label: '前右髋', source: 'device', online: true, statusCode: 2,
    positionDeg: 12.3, temperatureC: 40.2, voltageV: 51.4, velocityRps: 0.5, torqueNm: -1.2 }]);
  screen.toggleDetails();
  for (const value of ['12.3 °', '40.2 °C', '51.4 V', '0.5 rad/s', '-1.2 N m']) assert.ok(screen.rowCopy('0').includes(value));
  assert.match(source, /motorHealthLabel/);
  assert.doesNotMatch(source, /onStart|onControl|dispatch|sendCommand|fetch\(/);
});

test('joint status screen only renders validated joint records', () => {
  assert.match(source, /typeof joint\?\.id === 'string'/);
  assert.match(source, /typeof joint\.label === 'string'/);
  assert.match(source, /joint\.source === 'device'/);
});

test('a compact static line diagram identifies legs relative to the robot with front facing up', () => {
  const screen = mount([]);
  assert.equal(screen.node('joint-status-model-diagram'), undefined);
  assert.ok(screen.node('joint-status-generic-diagram'));
  assert.match(screen.node('joint-status-leg-diagram').props.accessibilityLabel, /以机器人自身为准，前方朝上/);
  assert.match(screen.node('joint-status-leg-diagram').props.accessibilityLabel, /不表示实时姿态或关节位置/);
  assert.match(screen.nodeCopy('joint-status-leg-diagram'), /前方 ↑/);
  assert.doesNotMatch(screen.nodeCopy('joint-status-leg-diagram'), /示意|以机器人自身方向为准/);
  assert.equal(screen.nodeCopy('joint-status-diagram-left'), '左前腿 左后腿');
  assert.equal(screen.nodeCopy('joint-status-diagram-right'), '右前腿 右后腿');
  assert.ok(mount([]).node('joint-status-leg-diagram'));
});

test('an explicitly supplied model line image preserves direction labels and theme contrast', () => {
  const robotDiagram = { uri: 'fixture://thunder-v4-top-line' };
  const screen = mount([], { robotDiagram });
  const image = screen.node('joint-status-model-diagram');
  assert.equal(image.props.source, robotDiagram);
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(image.props.style.at(-1).tintColor, '#666666');
  assert.equal(screen.node('joint-status-generic-diagram'), undefined);
  assert.equal(screen.nodeCopy('joint-status-diagram-left'), '左前腿 左后腿');
  assert.equal(screen.nodeCopy('joint-status-diagram-right'), '右前腿 右后腿');
});

test('joint page displays operating state semantics instead of calling nonzero statuses faults', () => {
  const screen = mount([0, 1, 2, 3, 99].map((statusCode, id) => ({
    id: String(id), label: `关节 ${id}`, source: 'device', online: true, statusCode, errors: [], fault: statusCode <= 2 ? 'clear' : 'unknown',
  })));
  assert.equal(screen.nodeCopy('joint-status-overview-0'), '复位');
  assert.equal(screen.nodeCopy('joint-status-overview-1'), '标定');
  assert.ok(screen.node('joint-status-running-2'));
  assert.equal(screen.nodeCopy('joint-status-overview-3'), '未知');
  assert.equal(screen.node('joint-status-running-3'), undefined);
  screen.toggleDetails();
  for (const [id, label] of [[0, '复位'], [1, '标定'], [2, '运行'], [3, '未知'], [4, '未知']]) {
    assert.match(screen.rowCopy(id), new RegExp(label));
    assert.doesNotMatch(screen.rowCopy(id), /正常|故障/);
  }
});

test('overview gives reported faults and offline motors distinct clickable cells while unverified data stays text', () => {
  const screen = mount([
    { id: '0', label: '故障电机', source: 'device', online: true, statusCode: 2, errors: [4] },
    { id: '1', label: '离线电机', source: 'device', online: false, statusCode: 2, errors: [] },
    { id: '2', label: '未知来源', source: 'unknown', online: true, statusCode: 2 },
  ]);
  assert.equal(screen.nodeCopy('joint-status-overview-0'), '故障');
  assert.equal(screen.nodeCopy('joint-status-overview-1'), '离线');
  assert.equal(screen.nodeCopy('joint-status-overview-2'), '未同步');
  assert.equal(screen.node('joint-status-running-2'), undefined);
  const cellStyle = id => screen.node(`joint-status-overview-${id}`).props.style({ pressed: false });
  assert.ok(cellStyle('0').some(value => value?.backgroundColor === '#FDECE9'));
  assert.ok(cellStyle('1').some(value => value?.backgroundColor === '#E7EDF2'));
  assert.equal(screen.node('joint-status-list'), undefined);
  screen.node('joint-status-overview-0').props.onPress();
  assert.match(screen.nodeCopy('joint-status-detail'), /故障|错误码 4/);
  assert.match(screen.nodeCopy('joint-status-detail'), /右前腿 · 髋关节 \/ ID 0/);
});

test('offline, fault and unverified sources stay distinct from operational modes', () => {
  const joint = { source: 'device', online: true, statusCode: 2, errors: [], fault: 'clear' };
  const screen = mount([
    { ...joint, id: 'offline', label: '离线电机', online: false, positionDeg: null, temperatureC: null, voltageV: null, velocityRps: null, torqueNm: null },
    { ...joint, id: 'fault', label: '错误电机', errors: [4] },
    { ...joint, id: 'unknown', label: '未知来源', source: 'unknown' },
    { ...joint, id: 'zero', label: '在线零值', positionDeg: 0, temperatureC: 0, velocityRps: 0, torqueNm: 0 },
  ]);
  screen.toggleDetails();
  assert.match(screen.rowCopy('offline'), /离线/);
  assert.doesNotMatch(screen.rowCopy('offline'), /0\.0|正常|运行/);
  assert.match(screen.rowCopy('fault'), /故障/);
  assert.match(screen.rowCopy('unknown'), /未同步/);
  assert.doesNotMatch(screen.rowCopy('unknown'), /正常|运行/);
  assert.match(screen.rowCopy('zero'), /0\.0 °/);
  assert.match(screen.rowCopy('zero'), /0\.0 rad\/s/);
});

test('all sixteen Matrix4 motors are grouped by leg including their wheel motor', () => {
  const joints = Array.from({ length: 16 }, (_, id) => ({ id: String(id), label: `关节 ${id}`, source: 'device', online: true, statusCode: 2, errors: [] }));
  const screen = mount(joints);
  assert.equal(screen.node('joint-status-list'), undefined);
  assert.equal(screen.node('joint-status-details-toggle').props.accessibilityState.expanded, false);
  screen.toggleDetails();
  assert.equal(screen.rowIds.length, 16);
  assert.equal(new Set(screen.rowIds).size, 16);
  for (let id = 0; id < 16; id++) assert.ok(screen.node(`joint-status-overview-${id}`));
  assert.equal(screen.nodeCopy('joint-status-overview-head'), '髋 大腿 小腿 足轮');
  assert.equal(screen.nodeCopy('joint-status-overview-0'), '');
  assert.ok(screen.node('joint-status-running-0'));
  assert.match(screen.node('joint-status-overview-0').props.accessibilityLabel, /右前腿髋关节，运行/);
  for (const [leg, ids] of [['front-left', [3, 4, 5, 13]], ['front-right', [0, 1, 2, 12]],
    ['rear-left', [9, 10, 11, 15]], ['rear-right', [6, 7, 8, 14]]]) {
    const rows = screen.node(`joint-status-leg-${leg}`).props.children[1];
    assert.deepEqual(Array.from(rows, row => row.props.testID), ids.map(id => `joint-status-${id}`));
    assert.match(screen.nodeCopy(`joint-status-leg-${leg}`), /足轮/);
  }
  assert.match(screen.nodeCopy('joint-status-report-count'), /16\s*\/16/);
  assert.match(screen.node('joint-status-summary').props.accessibilityLabel, /在线 16/);
  assert.equal(screen.node('joint-status-other'), undefined);
  screen.toggleDetails();
  assert.equal(screen.node('joint-status-list'), undefined);
  assert.equal(screen.node('joint-status-details-toggle').props.accessibilityState.expanded, false);
});

test('partial readings keep missing motors visible without inventing measurements or online state', () => {
  const screen = mount([
    { id: '0', label: '前右髋', source: 'device', online: true, statusCode: 2, errors: [], temperatureC: 35 },
    { id: '3', label: '前左髋', source: 'device', online: false, errors: [4], positionDeg: 91, temperatureC: 91 },
    { id: '12', label: '前右足轮', source: 'unknown', online: true, positionDeg: 91, temperatureC: 91 },
    { id: '21', label: '额外关节', source: 'device', online: true, statusCode: 2, temperatureC: 36 },
  ]);
  screen.toggleDetails();
  assert.equal(screen.rowIds.length, 17);
  assert.match(screen.rowCopy('1'), /未上报/);
  assert.doesNotMatch(screen.rowCopy('1'), /0\.0|运行|复位/);
  assert.match(screen.rowCopy('3'), /离线/);
  assert.match(screen.rowCopy('3'), /错误码 4/);
  assert.doesNotMatch(screen.rowCopy('3'), /91\.0/);
  assert.match(screen.rowCopy('12'), /未同步/);
  assert.doesNotMatch(screen.rowCopy('12'), /91\.0/);
  assert.match(screen.nodeCopy('joint-status-report-count'), /2\s*\/16/);
  assert.match(screen.node('joint-status-summary').props.accessibilityLabel, /在线 1/);
  assert.match(screen.nodeCopy('joint-status-offline-count'), /离线 1/);
  assert.match(screen.nodeCopy('joint-status-fault-count'), /故障 1/);
  assert.match(screen.node('joint-status-overview-1').props.accessibilityLabel, /未上报/);
  assert.match(screen.node('joint-status-overview-3').props.accessibilityLabel, /离线/);
  assert.match(screen.nodeCopy('joint-status-other'), /额外关节/);
  assert.equal(mount([]).node('joint-status-list'), undefined);
  assert.equal(mount([]).node('joint-status-summary'), undefined);
  assert.ok(mount([]).node('joint-status-empty'));
});

test('motor cells open live read-only details and close without leaving the screen', () => {
  const faulty = { id: '3', label: '前左髋', source: 'device', online: true, statusCode: 2, fault: 'active', errors: [4, -1, 1.5], temperatureC: 42 };
  const screen = mount([faulty], { deviceName: '模拟数据 · 非机器狗' });
  const cell = screen.node('joint-status-overview-3');
  assert.equal(cell.props.accessibilityRole, 'button');
  assert.equal(screen.node('joint-status-detail'), undefined);
  cell.props.onPress();
  assert.match(screen.nodeCopy('joint-status-detail'), /左前腿 · 髋关节/);
  assert.match(screen.nodeCopy('joint-status-detail'), /模拟数据 · 非机器狗/);
  assert.match(screen.nodeCopy('joint-status-detail'), /错误码 4/);
  assert.doesNotMatch(screen.nodeCopy('joint-status-detail'), /-1|1\.5/);
  assert.match(screen.nodeCopy('joint-status-detail'), /42\.0 °C/);
  assert.equal(screen.nodeCopy('joint-status-detail-code'), '状态码 2');
  screen.updateJoints([{ ...faulty, online: false, temperatureC: 91 }]);
  assert.match(screen.nodeCopy('joint-status-detail'), /离线/);
  assert.doesNotMatch(screen.nodeCopy('joint-status-detail'), /42\.0|91\.0/);
  screen.node('joint-status-detail-close').props.onPress();
  assert.equal(screen.node('joint-status-detail'), undefined);
  screen.node('joint-status-overview-0').props.onPress();
  assert.match(screen.nodeCopy('joint-status-detail'), /右前腿 · 髋关节/);
  assert.match(screen.nodeCopy('joint-status-detail'), /未上报/);
  assert.equal(screen.nodeCopy('joint-status-detail-code'), '状态码 —');
  screen.node('joint-status-detail-modal').props.onRequestClose();
  assert.equal(screen.node('joint-status-detail'), undefined);
});

test('detail does not infer a fault reason or reuse unverified measurements', () => {
  const screen = mount([{ id: '0', label: '髋', source: 'device', online: true, fault: 'active', errors: [] }]);
  screen.node('joint-status-overview-0').props.onPress();
  assert.equal(screen.nodeCopy('joint-status-detail-no-error-code'), '设备未提供错误码');
  screen.updateJoints([{ id: '0', label: '髋', source: 'unknown', online: true, errors: [4], positionDeg: 91 }]);
  assert.match(screen.nodeCopy('joint-status-detail'), /未同步/);
  assert.doesNotMatch(screen.nodeCopy('joint-status-detail'), /错误码 4|91\.0|设备未提供错误码/);
});

test('landscape navigation hides only while active and restores on rotation or exit', () => {
  const screen = mount([]);
  assert.deepEqual(screen.navigationCalls, [true]);
  screen.changeAppState('background');
  screen.changeAppState('active');
  assert.deepEqual(screen.navigationCalls, [true, false, true]);
  screen.changeViewport({ width: 400, height: 800 });
  assert.deepEqual(screen.navigationCalls.slice(-2), [false, false]);
  screen.changeAppState('active');
  assert.equal(screen.navigationCalls.at(-1), false);
  screen.changeViewport({ width: 800, height: 400 });
  assert.equal(screen.navigationCalls.at(-1), true);
  screen.unmount();
  assert.equal(screen.navigationCalls.at(-1), false);
  const count = screen.navigationCalls.length;
  screen.changeAppState('active');
  assert.equal(screen.navigationCalls.length, count);
  assert.deepEqual(mount([], {}, { appState: 'background' }).navigationCalls, [false]);
});

console.log('Joint status screen contract PASS — read-only, validated records, unknown telemetry remains unknown');
