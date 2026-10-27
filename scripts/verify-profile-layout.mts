// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

import { readTrustedSafetyLock } from '../src/features/robot-lifecycle/trustedSafetyLock.ts';

const require = createRequire(import.meta.url);

function loadLayout(relative = 'src/screens/profileLayout.ts') {
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, require: (name: string) => {
    if (name === '../layout/adaptiveLayout') return loadLayout('src/layout/adaptiveLayout.ts');
    return require(name);
  } });
  return module.exports;
}
const { getProfileLayoutMetrics } = loadLayout();

function occupiedWidth(metrics: ReturnType<typeof getProfileLayoutMetrics>) {
  assert.equal(typeof metrics.deviceColumnWidth, 'number');
  assert.equal(typeof metrics.controlsColumnWidth, 'number');
  return metrics.deviceColumnWidth + metrics.controlsColumnWidth + metrics.gridGap;
}

// Retire the old 330/39/340 Figma grid and 122/49 absolute-header offset
// assertions: shared headers now participate in normal flow in App and QA.
test('wide Profile columns fill the measured content without a second safe-area or rail deduction', () => {
  const metrics = getProfileLayoutMetrics({ containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: 1 });
  assert.equal(metrics.usesColumns, true);
  assert.equal(metrics.availableGridWidth + metrics.padding * 2, 882);
  assert.ok(metrics.deviceColumnWidth > metrics.controlsColumnWidth);
  assert.equal(occupiedWidth(metrics), metrics.availableGridWidth);
});

test('narrow landscape Profile content stacks instead of shrinking below readability limits', () => {
  const metrics = getProfileLayoutMetrics({ containerWidth: 600, windowHeight: 600, isLandscape: true, fontScale: 1 });
  assert.equal(metrics.usesColumns, false);
  assert.equal(metrics.deviceColumnWidth, '100%');
  assert.equal(metrics.controlsColumnWidth, '100%');
});

test('portrait and non-positive measurements always use the safe stacked layout', () => {
  for (const containerWidth of [0, -1, NaN, Infinity]) {
    assert.equal(getProfileLayoutMetrics({ containerWidth, windowHeight: 600, isLandscape: true, fontScale: 1 }).usesColumns, false);
  }
  assert.equal(getProfileLayoutMetrics({ containerWidth: 900, windowHeight: 1200, isLandscape: false, fontScale: 1 }).usesColumns, false);
});

test('safety lock stays unknown when no trusted device value exists', () => {
  assert.equal(readTrustedSafetyLock(undefined), null, 'missing device is unknown');
  assert.equal(readTrustedSafetyLock({}), null, 'missing safety_lock field is unknown');
  assert.equal(readTrustedSafetyLock({ safety_lock: null }), null, 'null safety_lock field is unknown');
});

test('safety lock preserves both trusted boolean states', () => {
  assert.equal(readTrustedSafetyLock({ safety_lock: true }), true);
  assert.equal(readTrustedSafetyLock({ safety_lock: false }), false);
});

function renderProfileSafetyLock(
  safetyLock: boolean | null,
  connected: boolean,
  options: Record<string, unknown> & { height?: number; width?: number } = {},
) {
  const { height = 844, width = 390, fontScale = 1, measuredWidth, measuredHeight = height, ...profileOverrides } = options;
  const cache = new Map<string, Record<string, unknown>>();
  const slots: unknown[] = [];
  let cursor = 0;
  const react = {
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (value: unknown) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const colors = {
    background: '#FFFFFF', dangerSurface: '#FFF2F3', dangerText: '#B52E42', green: '#7EA9E8',
    greenDark: '#1F4D7A', greenStrong: '#4F8BD9', ink: '#050808', inkSoft: '#373737', line: '#E2E6F0',
    mint: '#B8D6F4', muted: '#686868', successText: '#2F6AA3', surfaceStrong: '#EAEDF8',
  };
  const reactNative = {
    Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', View: 'View',
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width, height, fontScale }),
  };
  const load = (relative: string): Record<string, unknown> => {
    const cached = cache.get(relative);
    if (cached) return cached;
    const module = { exports: {} as Record<string, unknown> };
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (name: string) => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: reactNative.Text, TextInput: 'TextInput' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return reactNative;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) };
      if (name === '../components/FontLicenseNotice') return { FontLicenseNotice: 'FontLicenseNotice' };
      if (name === '../theme') return { useAppTheme: () => ({ colors, isDark: false }) };
      if (name === '../appearance') return loadVisualTokenModules().appearance;
      if (name === '../typography') return loadVisualTokenModules().typography;
      if (name === './profileLayout') return load('src/screens/profileLayout.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      throw new Error(`Unexpected Profile dependency: ${name}`);
    };
    vm.runInNewContext(code, { Error, exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  };
  const ProfileScreen = load('src/screens/ProfileScreen.tsx').ProfileScreen as (props: Record<string, unknown>) => unknown;
  const nodes: Array<{ type: unknown; props: Record<string, unknown> }> = [];
  const copy: string[] = [];
  const walk = (node: unknown) => {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') { copy.push(String(node)); return; }
    const element = node as { type: unknown; props: Record<string, unknown> };
    if (typeof element.type === 'function') { walk(element.type(element.props)); return; }
    nodes.push(element);
    walk(element.props.children);
  };
  const props = {
    accountEmail: 'qa@example.invalid', alertsEnabled: false, batteryPercent: null,
    canOpenFirmwareUpdate: false, canOpenProvisioning: false, connected,
    deviceName: 'THUNDER 01', deviceType: '室外四足机器人', onBindDevice: () => undefined,
    onConnect: () => undefined, onDisconnect: () => undefined, onLogout: () => undefined,
    onOpenAccountSecurity: () => undefined, onOpenBleDiscovery: () => undefined,
    onOpenFirmwareUpdate: () => undefined, onOpenProvisioning: () => undefined,
    onRetry: () => undefined, onToggleAlerts: () => undefined, onUnbindDevice: () => undefined,
    safetyLock,
    ...profileOverrides,
  };
  walk(ProfileScreen(props));
  if (measuredWidth !== undefined) {
    nodes[0].props.onLayout({ nativeEvent: { layout: { width: measuredWidth, height: measuredHeight } } });
    cursor = 0;
    nodes.length = 0;
    copy.length = 0;
    walk(ProfileScreen(props));
  }
  return { copy: copy.join(' '), nodes };
}

test('landscape device card grows with long trusted values instead of clipping its final stat row', () => {
  const rendered = renderProfileSafetyLock(null, false, {
    displayName: '很长的现场操作员用户名用于动态字号验证',
    firmwareVersion: '2026.10.14-release-candidate-long-version',
    height: 390,
    lastSyncLabel: '2026-10-14 23:59:59 +08:00',
    width: 844,
  });
  const card = rendered.nodes.find((node) => node.props.testID === 'profile-device-card');
  assert.ok(card, 'device card remains directly inspectable in the rendered Profile component');
  assert.equal(card.props.style.height, undefined, 'device card has no fixed height that can clip scaled text');
  assert.ok(card.props.style.minHeight >= 184, 'landscape card preserves the accepted visual footprint');
  assert.ok((card.props.style.paddingBottom ?? card.props.style.padding) >= 16, 'the final stat row retains the shared16 inset without a fixed clipping height');
  assert.match(rendered.copy, /2026\.10\.14-release-candidate-long-version/);
  assert.match(rendered.copy, /2026-10-14 23:59:59 \+08:00/);
});

test('Profile renders every safety-lock state as read-only status, never as a Switch', () => {
  for (const [safetyLock, connected, expected] of [
    [null, false, '安全锁，未连接。设备未连接 · 状态待同步'],
    [null, true, '安全锁，待同步。状态待同步 · 只读'],
    [true, false, '安全锁，已开启。记录状态 · 只读'],
    [false, false, '安全锁，已关闭。记录状态 · 只读'],
  ] as const) {
    const rendered = renderProfileSafetyLock(safetyLock, connected);
    const safetyRow = rendered.nodes.find((node) => node.props.accessibilityLabel === expected);
    assert.ok(safetyRow, `expected accessible safety status: ${expected}`);
    assert.equal(rendered.nodes.filter((node) => node.type === 'Switch').length, 1, 'only the local alert preference remains a Switch');
    assert.equal(rendered.nodes.find((node) => node.type === 'Switch')?.props.accessibilityLabel, '状态警报');
    assert.match(rendered.copy, new RegExp(expected.includes('已开启') ? '已开启' : expected.includes('已关闭') ? '已关闭' : expected.includes('未连接') ? '未连接' : '待同步'));
  }
});

test('Profile retains 48dp minimum action targets for touch on phone and wide controllers', () => {
  for (const options of [{ width: 390, height: 844, measuredWidth: 390 }, { width: 960, height: 600, measuredWidth: 882 }]) {
    const rendered = renderProfileSafetyLock(null, false, { ...options, onEditProfile: () => {}, onOpenControl: () => {} });
    for (const node of rendered.nodes.filter(item => item.type === 'Pressable')) {
      const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      const flattened = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
      assert.ok(flattened.minHeight >= 48, `target ${node.props.testID ?? node.props.accessibilityHint} has ${flattened.minHeight ?? 0}dp`);
    }
  }
});

test('Profile keeps long identity, firmware and unavailable explanations visible without line truncation', () => {
  const rendered = renderProfileSafetyLock(null, false, {
    width: 960, height: 600, measuredWidth: 882, fontScale: 1.6,
    displayName: '现场机器人管理员很长的昵称用于真实大字号适配',
    firmwareVersion: '2026.10.22-production-long-firmware-release-candidate',
    provisioningBlockedReason: '设备配网功能尚未接入，请先完成可信连接、授权和设备能力验证后再尝试',
  });
  const truncated = rendered.nodes.filter(node => node.type === 'Text' && node.props.numberOfLines != null);
  assert.equal(truncated.length, 0, 'Profile data and explanations should wrap instead of ellipsizing');
});

test('short controller Profile keeps device and all settings in separate scrollable panes with reachable truthful entries', () => {
  const contains = (element: any, id: string): boolean => Array.isArray(element)
    ? element.some(child => contains(child, id))
    : !!element && typeof element === 'object' && (element.props?.testID === id || contains(element.props?.children, id));
  for (const [measuredWidth, measuredHeight] of [[675, 342], [753, 390]]) {
    const calls: string[] = [];
    const rendered = renderProfileSafetyLock(null, false, {
      width: 844, height: 438, measuredWidth, measuredHeight,
      onEditProfile: () => calls.push('edit'), onOpenControl: () => calls.push('control'),
      onOpenRobotConnection: () => calls.push('connection'),
      onBindDevice: () => calls.push('bind'), onOpenBleDiscovery: () => calls.push('ble'),
    });
    const primary = rendered.nodes.find(node => node.props.testID === 'profile-controller-primary');
    const secondary = rendered.nodes.find(node => node.props.testID === 'profile-controller-secondary');
    assert.equal(primary?.type, 'ScrollView');
    assert.equal(secondary?.type, 'ScrollView');
    assert.equal(rendered.nodes.filter(node => node.type === 'ScrollView').length, 2);
    assert.ok(contains(primary, 'profile-device-card'));
    assert.ok(contains(secondary, 'profile-controls-column') && contains(secondary, 'profile-more-content'));
    assert.ok(!contains(primary, 'profile-more-content'));
    assert.match(rendered.copy, /绑定真实设备.*附近 BLE 设备.*账户/);
    for (const node of rendered.nodes.filter(item => item.type === 'Pressable')) {
      const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      assert.ok(Object.assign({}, ...[style].flat(Infinity).filter(Boolean)).minHeight >= 48);
    }
    for (const hint of ['打开IP 连接 / 添加机器狗', '打开绑定真实设备', '打开附近 BLE 设备']) {
      rendered.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityHint === hint).props.onPress();
    }
    assert.deepEqual(calls, ['connection', 'bind', 'ble']);
    assert.equal(rendered.nodes.filter(node => node.type === 'Switch').length, 1);
    assert.equal(rendered.nodes.filter(node => node.type === 'Text' && node.props.numberOfLines != null).length, 0);
  }
});

test('Profile stacks enlarged text in a short post-header viewport even on a tall landscape window', () => {
  const rendered = renderProfileSafetyLock(null, false, { width: 1280, height: 800, measuredWidth: 1122, measuredHeight: 360, fontScale: 1.5 });
  const deviceColumn = rendered.nodes.find(node => node.props.testID === 'profile-device-column');
  const controlsColumn = rendered.nodes.find(node => node.props.testID === 'profile-controls-column');
  assert.equal(deviceColumn.props.style.width, '100%');
  assert.equal(controlsColumn.props.style.width, '100%');
});

test('measured Profile keeps its two-column device emphasis and uses a native scrolling fallback', () => {
  for (const options of [
    { width: 1280, height: 800, measuredWidth: 1122, measuredHeight: 680, columns: true },
    { width: 960, height: 600, measuredWidth: 882, measuredHeight: 500, columns: true },
    { width: 960, height: 600, measuredWidth: 882, measuredHeight: 500, fontScale: 1.6, columns: false },
    { width: 960, height: 600, measuredWidth: 780, measuredHeight: 500, columns: false },
    { width: 844, height: 438, measuredWidth: 675, measuredHeight: 342, fontScale: 1.5, columns: false },
    { width: 844, height: 438, measuredWidth: 659, measuredHeight: 342, columns: false },
    { width: 390, height: 844, measuredWidth: 390, measuredHeight: 680, columns: false },
  ]) {
    const { columns, ...viewport } = options;
    const rendered = renderProfileSafetyLock(null, false, viewport);
    const device = rendered.nodes.find(node => node.props.testID === 'profile-device-column').props.style;
    const controls = rendered.nodes.find(node => node.props.testID === 'profile-controls-column').props.style;
    const scroll = rendered.nodes.find(node => node.props.testID === 'profile-scroll');
    assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'automatic');
    assert.equal(scroll.props.style.flex, 1);
    assert.equal(rendered.nodes[1].props.style.position, undefined, 'viewport stays in normal flow');
    assert.equal(device.paddingTop, undefined, 'device no longer compensates for an absolute Header');
    assert.equal(controls.paddingTop, undefined, 'controls no longer compensate for an absolute Header');
    if (columns) {
      assert.ok(device.width > controls.width);
      assert.ok(device.width + controls.width + scroll.props.contentContainerStyle.paddingHorizontal * 2 <= viewport.measuredWidth);
    } else {
      assert.equal(device.width, '100%');
      assert.equal(controls.width, '100%');
    }
  }
});

test('Profile preserves existing account, device and unavailable-feature explanation callbacks', () => {
  const calls: string[] = [];
  const callbacks = Object.fromEntries([
    'onEditProfile', 'onOpenControl', 'onOpenProvisioning', 'onOpenFirmwareUpdate',
    'onOpenBleDiscovery', 'onOpenConnectionDiagnostics', 'onBindDevice', 'onUnbindDevice',
    'onOpenDataPrivacy', 'onOpenAccountSecurity', 'onLogout', 'onToggleAlerts', 'onRetry', 'onConnect', 'onDisconnect',
  ].map(name => [name, () => calls.push(name)]));
  const rendered = renderProfileSafetyLock(null, false, { ...callbacks, width: 1280, height: 800, measuredWidth: 1122, measuredHeight: 680 });
  const press = (predicate: (node: any) => boolean) => {
    const target = rendered.nodes.find(node => node.type === 'Pressable' && predicate(node));
    assert.ok(target);
    assert.notEqual(target.props.disabled, true);
    target.props.onPress();
  };
  for (const id of ['profile-edit-entry', 'profile-control-entry']) press(node => node.props.testID === id);
  for (const title of ['连接管理', '网络与配网', '固件更新', '绑定真实设备', '附近 BLE 设备', '连接诊断', '数据与隐私']) {
    press(node => node.props.accessibilityHint === `打开${title}`);
  }
  press(node => node.props.accessibilityHint === '管理账户身份与安全设置');
  press(node => node.props.accessibilityHint === '退出当前 DOSO 账户');
  press(node => node.props.accessibilityHint === '查看设备状态来源与同步说明');
  press(node => node.props.accessibilityHint === '查看真实连接能力的当前说明');
  rendered.nodes.find(node => node.type === 'Switch').props.onValueChange(true);
  assert.equal(calls.filter(name => name === 'onOpenProvisioning').length, 2, 'both existing provisioning explanation entries remain reachable');
  for (const name of Object.keys(callbacks).filter(name => !['onUnbindDevice', 'onDisconnect'].includes(name))) assert.ok(calls.includes(name), `${name} remains wired`);
  assert.ok(!calls.includes('onDisconnect'), 'offline disconnect remains disabled');
  const bound = renderProfileSafetyLock(null, true, { ...callbacks, serialNumber: 'REAL-DEVICE-SERIAL' });
  bound.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityHint === '打开解绑当前设备').props.onPress();
  assert.ok(calls.includes('onUnbindDevice'));
  assert.match(rendered.copy, /真实配网尚未接入.*生产固件更新尚未接入/);
});
