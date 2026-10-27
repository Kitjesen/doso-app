import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/screens/GuestScreen.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

function mount(dimensions = { width: 390, height: 844 }) {
  const slots = []; let cursor = 0, nodes = [], connectionCalls = 0, exitCalls = 0;
  const BottomNav = () => null;
  const TasksScreen = () => null;
  const AnalysisScreen = () => null;
  const appearance = { canvas: '#fff', surface: '#f5f5f5', ink: '#123', secondary: '#567', action: '#98d1ff', actionInk: '#123', blueInk: '#145', isDark: false };
  const imports = {
    react: { useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: value => value }, useWindowDimensions: () => dimensions },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../appearance': { useProductAppearance: () => appearance },
    '../components/AppText': { Text: 'Text' },
    '../components/BottomNav': { BottomNav }, './TasksScreen': { TasksScreen }, './AnalysisScreen': { AnalysisScreen },
    '../../assets/brand/doso-auth-lockup-sky-v2.png': 1,
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.ok(name in imports, `guest must not import account, storage or transport dependency: ${name}`);
    return imports[name];
  } });
  function render() {
    cursor = 0; nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); walk(node.props?.children);
    }
    walk(module.exports.GuestScreen({ onOpenConnection: () => connectionCalls++, onExitGuest: () => exitCalls++ }));
  }
  render();
  return {
    render,
    element: id => nodes.find(node => node.props?.testID === id),
    get navigation() { return nodes.find(node => node.type === BottomNav).props; },
    get task() { return nodes.find(node => node.type === TasksScreen)?.props; },
    get analysis() { return nodes.find(node => node.type === AnalysisScreen)?.props; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get connectionCalls() { return connectionCalls; }, get exitCalls() { return exitCalls; },
  };
}

test('guest starts locally with the existing five-tab navigation and an unconnected device state', () => {
  const guest = mount();
  assert.equal(guest.navigation.active, 'home');
  assert.ok(guest.element('guest-screen'));
  assert.match(guest.copy, /游客/); assert.match(guest.copy, /尚未连接机器狗/);
  assert.doesNotMatch(guest.copy, /THUNDER|在线|%|预览|Demo/i);
  assert.equal(guest.connectionCalls, 0); assert.equal(guest.exitCalls, 0);
  guest.element('guest-open-connection').props.onPress();
  assert.equal(guest.connectionCalls, 1); assert.equal(guest.exitCalls, 0);
});

test('task browsing uses actual templates with both execution gates closed', () => {
  const guest = mount();
  guest.element('guest-open-tasks').props.onPress(); guest.render();
  assert.equal(guest.navigation.active, 'tasks');
  assert.equal(guest.task.controlAvailable, false); assert.equal(guest.task.executorAvailable, false);
  assert.equal(guest.task.robotName, '未连接设备');
  guest.task.onStartTask('untrusted-fixture');
  assert.equal(guest.connectionCalls, 0); assert.equal(guest.exitCalls, 0);
});

test('map and analysis never inject example geometry or telemetry', () => {
  const guest = mount();
  guest.navigation.onChange('map'); guest.render();
  assert.match(guest.copy, /尚未同步设备地图/);
  guest.navigation.onChange('analysis'); guest.render();
  assert.equal(guest.analysis.previewMode, false);
  assert.equal(guest.task, undefined);
});

test('profile offers login without account mutation handlers or a fake user record', () => {
  const guest = mount();
  guest.navigation.onChange('profile'); guest.render();
  assert.match(guest.copy, /登录 DOSO/);
  assert.doesNotMatch(guest.copy, /删除|退出当前账户|修改密码|邮箱地址|DOSO Demo/);
  guest.element('guest-exit').props.onPress();
  assert.equal(guest.exitCalls, 1); assert.equal(guest.connectionCalls, 0);
});

test('G20 landscape reserves space for the original side navigation', () => {
  const guest = mount({ width: 753, height: 471 });
  const safeStyles = guest.element('guest-screen').props.style.filter(Boolean);
  assert.ok(safeStyles.some(style => style.paddingRight === 78));
  assert.equal(guest.navigation.active, 'home');
});
