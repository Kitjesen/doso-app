import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const copy = node => node == null || typeof node === 'boolean' ? ''
  : Array.isArray(node) ? node.map(copy).join(' ')
    : typeof node === 'object' ? copy(node.props?.children) : String(node);
const contains = (node, id) => Array.isArray(node) ? node.some(child => contains(child, id))
  : !!node && typeof node === 'object' && (node.props?.testID === id || contains(node.props?.children, id));
const home = props => mountAuthScreen({
  screen: 'home', robotImage: 'robot', robotName: 'THUNDER 01', connected: false,
  canRecall: false, safetyLock: false, onRecall() {}, onOpenControl() {},
  onOpenRoutes() {}, onOpenTasks() {}, onOpenSafety() {}, ...props,
});

test('Home omits the connection banner and retains the control entry', () => {
  for (const dimensions of [{ width: 390, height: 844 }, { width: 844, height: 390, fontScale: 1.6 }]) {
    let opened = false;
    const screen = home({ ...dimensions, onOpenRobotConnection: () => { opened = true; } });
    const entry = screen.action('home-robot-connection');
    assert.equal(entry, undefined);
    assert.equal(opened, false);
    assert.equal(screen.action('home-control').props.accessibilityLabel, '控制中心');
  }
  assert.equal(home().action('home-robot-connection'), undefined);
});

test('Home shows a separately identified direct-IP target without claiming the account device is online', () => {
  let opened = 0;
  const screen = home({
    directConnection: { endpointLabel: '192.0.2.64:13145', fresh: true, summary: '只读状态已读取 · 操作未开放' },
    onOpenDirectControl: () => opened++,
  });
  const summary = screen.nodes.find(node => node.props?.testID === 'home-direct-connection');
  assert.match(copy(summary), /IP 直连设备.*192\.0\.2\.64:13145.*只读状态已读取/);
  assert.match(copy(screen.nodes.find(node => node.props?.testID === 'home-connection-state')), /离线/);
  const action = screen.action('home-direct-control');
  assert.match(copy(action), /查看状态/);
  assert.ok(flatten(action.props.style({ pressed: false })).minHeight >= 48);
  action.props.onPress();
  assert.equal(opened, 1);
  screen.render({ directConnection: { endpointLabel: '192.0.2.64:13145', fresh: false, summary: '需要重新检查连接' } });
  assert.match(screen.copy, /状态已过期.*需要重新检查连接/);
  screen.action('home-direct-control').props.onPress();
  assert.equal(opened, 2, 'expired target remains reachable for inspection');
  screen.render({ directConnection: undefined });
  assert.equal(screen.nodes.some(node => node.props?.testID === 'home-direct-connection'), false);
  assert.equal(screen.action('home-direct-control'), undefined);
});

test('direct-IP status wraps on large-text screens and never offers a handlerless action', () => {
  const screen = home({
    width: 844, height: 390, fontScale: 1.6, connected: true,
    directConnection: { endpointLabel: '现场机器狗 · 192.0.2.64:13145', fresh: false, summary: '状态已过期，请重新检查设备连接与权限' },
  });
  assert.equal(screen.action('home-direct-control'), undefined);
  assert.match(copy(screen.nodes.find(node => node.props?.testID === 'home-connection-state')), /已连接/);
  const summary = screen.nodes.find(node => node.props?.testID === 'home-direct-connection');
  assert.match(copy(summary), /状态已过期/);
  assert.equal(flatten(summary.props.style).height, undefined);
  assert.equal(screen.nodes.filter(node => node.type === 'Text' && node.props.numberOfLines != null).length, 0);
});

// Run the real Profile tree against host React/Native boundaries; this does not
// measure Yoga layout, Android touch dispatch, or a live robot connection.
function profile(overrides = {}) {
  const tokens = loadVisualTokenModules();
  const require = createRequire(import.meta.url);
  const modules = new Map();
  const react = { useCallback: fn => fn, useMemo: fn => fn(), useState: initial => [initial, () => {}] };
  const native = {
    View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch',
    StyleSheet: { create: styles => styles, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 844, height: 390, fontScale: 1.6 }),
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports: module.exports, module, require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return native;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '../components/AppText') return { Text: 'Text' };
      if (name === '../components/FontLicenseNotice') return { FontLicenseNotice: 'FontLicenseNotice' };
      if (name === '../theme') return tokens.theme;
      if (name === '../appearance') return tokens.appearance;
      if (name === '../typography') return tokens.typography;
      if (name === './profileLayout') return load('src/screens/profileLayout.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      throw new Error(`Unexpected Profile dependency: ${name}`);
    } }, { filename: path });
    modules.set(path, module.exports);
    return module.exports;
  }
  const nodes = [];
  const walk = node => {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') return;
    if (typeof node.type === 'function') return walk(node.type(node.props));
    nodes.push(node);
    walk(node.props.children);
  };
  walk(load('src/screens/ProfileScreen.tsx').ProfileScreen({
    connected: false, deviceName: 'THUNDER 01', deviceType: '四足机器人', safetyLock: null,
    canOpenProvisioning: false, canOpenFirmwareUpdate: false, alertsEnabled: false, ...overrides,
  }));
  return nodes;
}

test('Profile exposes IP connection as a real callback and does not turn a direct connection into online account status', () => {
  let opened = false;
  const nodes = profile({ onOpenRobotConnection: () => { opened = true; } });
  const entry = nodes.find(node => node.type === 'Pressable' && /IP 连接 \/ 添加机器狗/.test(copy(node)));
  assert.ok(entry, 'IP is visible in the device connection title');
  assert.match(copy(entry), /输入机器狗 IP/);
  assert.ok(flatten(entry.props.style({ pressed: false })).minHeight >= 48);
  assert.equal(nodes.filter(node => node.type === 'Text' && node.props.numberOfLines != null).length, 0);
  assert.ok(nodes.some(node => node.type === 'Text' && copy(node) === '离线'));
  entry.props.onPress();
  assert.equal(opened, true);
  assert.equal(profile().some(node => node.type === 'Pressable' && /IP 连接 \/ 添加机器狗/.test(copy(node))), false);
});
