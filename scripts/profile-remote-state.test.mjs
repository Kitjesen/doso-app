import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');

function profile(remoteStatePanel, overrides = {}) {
  const tokens = loadVisualTokenModules();
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(name) {
      if (name === 'expo-font') return { useFonts: () => [true, null] };
      if (name.endsWith('.otf')) return name;
      if (name === '../components/ControlPanelMotion') return { ControlPanelMotion: 'View' };
      if (name === '../components/ProductHeader') return { ProductHeader: 'View' };
      if (name === '../components/HomeText') return { Text: 'Text' };
      if (name.endsWith('/fonts/home')) return { productType: { title: {}, section: {}, body: {}, caption: {}, button: {} } };
    if (name === 'react') return { useState: value => [value, () => {}], useMemo: fn => fn(), useCallback: fn => fn };
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
        ScrollView: 'ScrollView', Switch: 'Switch', StyleSheet: { create: value => value },
        useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '../components/AppText') return { Text: 'Text' };
      if (name === '../components/FontLicenseNotice') return { FontLicenseNotice: 'FontLicenseNotice' };
      if (name === '../theme') return { useAppTheme: () => ({ colors: tokens.theme.lightColors, isDark: false }) };
      if (name === '../appearance') return tokens.appearance;
      if (name === '../typography') return tokens.typography;
      if (name === './profileLayout') return load('src/screens/profileLayout.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      throw new Error(`Unexpected Profile import ${name}`);
    } });
    cache.set(path, module.exports);
    return module.exports;
  }
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node == null || typeof node === 'boolean') return;
    if (typeof node !== 'object') { nodes.push(String(node)); return; }
    if (typeof node.type === 'function') return walk(node.type(node.props));
    nodes.push(node);
    walk(node.props.children);
  }
  walk(load('src/screens/ProfileScreen.tsx').ProfileScreen({ connected: false, deviceName: '合成设备',
    deviceType: '测试型号', safetyLock: null, alertsEnabled: false, canOpenFirmwareUpdate: false,
    canOpenProvisioning: false, onOpenRobotConnection() {}, onOpenControl() {}, remoteStatePanel, ...overrides }));
  return { text: nodes.filter(value => typeof value === 'string').join(' '), nodes };
}

test('bound remote panel replaces legacy online placeholders while retaining local control entries', () => {
  const marker = jsx.jsx('RemoteStateMarker', { children: '远程状态测试入口' });
  const current = profile(marker);
  assert.equal(current.nodes.filter(node => node.type === 'RemoteStateMarker').length, 1);
  assert.match(current.text, /已绑定/);
  assert.doesNotMatch(current.text, /当前离线|断开说明/);
  assert.match(current.text, /控制中心/);
  assert.match(current.text, /搜索机器狗 Wi-Fi/);
  const legacy = profile(undefined);
  assert.match(legacy.text, /当前离线/);
  assert.equal(legacy.nodes.some(node => node.type === 'RemoteStateMarker'), false);
});

test('bound accounts can add another device and select a named device by its ID', () => {
  const selected = [], bound = [];
  const current = profile(undefined, { devices: [
    { id: 'dog-a', display_name: '巡检一号', serial_number: 'DOSO-A' },
    { id: 'dog-b', display_name: '巡检二号', serial_number: 'DOSO-B' },
  ], selectedDeviceId: 'dog-a', deviceId: 'dog-a',
  onSelectDevice: id => selected.push(id), onBindDevice: () => bound.push(true), onUnbindDevice() {} });
  const buttons = current.nodes.filter(node => node.type === 'Pressable');
  const first = buttons.find(node => node.props.accessibilityLabel === '巡检一号，dog-a，当前设备');
  const second = buttons.find(node => node.props.accessibilityLabel === '巡检二号，dog-b，切换到此设备');
  assert.equal(first.props.disabled, true);
  assert.equal(second.props.disabled, false);
  second.props.onPress();
  assert.deepEqual(selected, ['dog-b']);
  buttons.find(node => node.props.accessibilityHint === '打开添加并绑定真实设备').props.onPress();
  assert.deepEqual(bound, [true]);
  assert.match(current.text, /解绑当前设备/);
  const busy = profile(undefined, { devices: [{ id: 'dog-b', display_name: 'B', serial_number: 'B' }],
    selectedDeviceId: 'dog-a', deviceBusy: true, onSelectDevice() {} });
  assert.equal(busy.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'B，dog-b，切换到此设备').props.disabled, true);
});

test('device details show the original ID and versions with selectable identity values', () => {
  const deviceId = '8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5';
  const current = profile(undefined, { deviceId, robotVersion: 'unitree/go2', firmwareVersion: 'v2.3.0-test.1' });
  assert.match(current.text, /机器人版本： unitree\/go2/);
  assert.ok(current.text.includes(deviceId));
  assert.match(current.text, /固件版本/);
  assert.ok(current.text.includes('v2.3.0-test.1'));
  for (const id of ['profile-robot-id', 'profile-robot-version']) {
    const value = current.nodes.find(node => node.props?.testID === id);
    assert.equal(value.props.selectable, true);
    assert.equal(value.props.numberOfLines, undefined);
  }
  const pending = profile(undefined);
  assert.match(pending.text, /机器人版本： 待同步/);
  assert.match(pending.text, /机器人 ID： 待绑定/);
  assert.equal(pending.nodes.some(node => node.props?.accessibilityHint === '打开解绑当前设备'), false);
});
