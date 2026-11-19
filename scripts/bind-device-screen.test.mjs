import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function mountBindDeviceScreen(initialProps = {}, component = 'binding', initialPermission = { granted: true, canAskAgain: true }) {
  const slots = [];
  const cleanups = [];
  const cache = new Map();
  let cursor = 0;
  let focusedLabel = null;
  let nodes = [];
  let mounted = true;
  let updatesAfterCleanup = 0;
  let permission = initialPermission;
  let availablePermission = initialPermission;
  let permissionRequests = 0;
  let permissionRefreshes = 0;
  let settingsRequests = 0;
  const appStateListeners = new Set();
  const getPermission = async () => {
    permissionRefreshes += 1;
    permission = availablePermission;
    return permission;
  };
  const props = { onBack: () => {}, onFindNearby: () => {}, onBind: () => {}, ...initialProps };
  const colors = {
    authFocus: '#0066FF', background: '#FFFFFF', dangerSurface: '#FFF1F0', dangerText: '#B42318',
    greenStrong: '#137A5B', ink: '#171C24', inkSoft: '#313844', line: '#E4E7EC', muted: '#616B79',
    surface: '#FFFFFF', surfaceStrong: '#F2F5FA', successText: '#137A5B',
  };
  const react = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => {
        if (!mounted) updatesAfterCleanup += 1;
        slots[slot] = typeof value === 'function' ? value(slots[slot]) : value;
      }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(effect) {
      const slot = cursor++;
      if (!(slot in slots)) { slots[slot] = true; cleanups.push(effect()); }
    },
  };
  const allowed = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Linking: { async openSettings() { settingsRequests += 1; } },
      AppState: { addEventListener(event, listener) {
        assert.equal(event, 'change');
        appStateListeners.add(listener);
        return { remove: () => appStateListeners.delete(listener) };
      } },
      Text: 'Text', TextInput: 'TextInput', View: 'View',
      Platform: { OS: 'android', select: value => value.default }, StyleSheet: { create: value => value, hairlineWidth: 1 },
      useColorScheme: () => 'light',
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [permission, async () => { permissionRequests += 1; return permission; }, getPermission] },
    '../components/DeviceScanner': { DeviceScanner: 'DeviceScanner' },
    './GradientButton': { GradientButton: 'GradientButton' },
    '../components/GradientButton': { GradientButton: 'GradientButton' },
    '../theme': { useAppTheme: () => ({ colors, isDark: false }) },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: allowed['react-native'].Text, TextInput: allowed['react-native'].TextInput };
      if (name in allowed) return allowed[name];
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === '../features/robot-lifecycle/robotCode') return load('src/features/robot-lifecycle/robotCode.ts');
      if (name === './devicePageLayout') return load('src/screens/devicePageLayout.ts');
      throw new Error(`Unexpected bind screen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const renderComponent = component === 'scanner'
    ? load('src/components/DeviceScanner.tsx').DeviceScanner
    : load('src/screens/BindDeviceScreen.tsx').BindDeviceScreen;
  function render(nextProps = {}) {
    Object.assign(props, nextProps);
    cursor = 0;
    nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props));
      if (node.type === 'TextInput' && node.props.ref) {
        node.props.ref.current = { focus: () => { focusedLabel = node.props.accessibilityLabel; } };
      }
      nodes.push(node);
      walk(node.props.children);
    }
    walk(renderComponent(props));
    return nodes;
  }
  render();
  return {
    render,
    get nodes() { return nodes; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get focusedLabel() { return focusedLabel; },
    field: label => nodes.find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label),
    button: () => nodes.find(node => node.type === 'GradientButton'),
    action: label => nodes.find(node => node.props?.accessibilityLabel === label || node.type === 'GradientButton' && node.props.label === label),
    scanner: () => nodes.find(node => node.type === 'DeviceScanner'),
    camera: () => nodes.find(node => node.type === 'CameraView'),
    get permissionRequests() { return permissionRequests; },
    get permissionRefreshes() { return permissionRefreshes; },
    get appStateListenerCount() { return appStateListeners.size; },
    get settingsRequests() { return settingsRequests; },
    setPermission(value) { permission = value; availablePermission = value; },
    setPermissionInSettings(value) { availablePermission = value; },
    appState(state) { for (const listener of appStateListeners) listener(state); },
    get updatesAfterCleanup() { return updatesAfterCleanup; },
    cleanup: () => { mounted = false; cleanups.forEach(cleanup => cleanup?.()); },
  };
}

const styleOf = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

const robotId = '8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5';
const publicRobotCode = `doso://robot/${robotId}`;
const robotCode = `${publicRobotCode}?claim=claim01`;

function identify(screen, deviceId = robotId, code = 'CLAIM01') {
  const action = screen.action('重新扫描') ?? screen.action('扫描专属绑定二维码');
  action.props.onPress();
  screen.render();
  screen.scanner().props.onScan({ deviceId, code });
  screen.render();
}

test('a QR must match the selected BLE robot before confirmation and can be rescanned', async () => {
  const calls = [], expectedRobotId = 'de305d54-75b4-431b-adb2-eb6b9e546014';
  const screen = mountBindDeviceScreen({ expectedRobotId, onBind: (...args) => calls.push(args) });
  identify(screen);
  assert.equal(screen.button().props.disabled, true);
  assert.match(screen.copy, /编号不一致.*重新扫描/);
  screen.button().props.onPress(); await Promise.resolve();
  assert.deepEqual(calls, []);
  identify(screen, expectedRobotId);
  assert.equal(screen.button().props.disabled, false);
  assert.match(screen.copy, /编号一致.*身份仍待验证/);
  screen.button().props.onPress(); await Promise.resolve();
  assert.deepEqual(calls, [[expectedRobotId, 'CLAIM01']]);
  screen.cleanup();
});

test('binding entry offers nearby discovery and scanning without an editable robot identifier', () => {
  const screen = mountBindDeviceScreen();
  const layout = screen.nodes.find(node => node.type === 'View' && styleOf(node).gap === 24);
  assert.ok(layout);
  assert.equal(screen.field('机器人 ID'), undefined);
  assert.equal(screen.field('一次性绑定码'), undefined);
  assert.equal(screen.button(), undefined);
  assert.ok(screen.action('扫描专属绑定二维码'));
  assert.ok(screen.action('查找附近机器人'));
  const back = screen.action('返回');
  assert.equal(styleOf(back).width, 48);
  const title = screen.nodes.find(node => node.type === 'Text' && node.props.children === '绑定机器人');
  assert.equal(styleOf(title).fontSize, 20);
  assert.equal(styleOf(title).lineHeight, 28);
  assert.doesNotMatch(screen.copy, /输入.*机器人 ID/);
});

test('nearby discovery is a separate user action and cannot open during scanning or busy state', () => {
  let nearbyCalls = 0;
  let bindCalls = 0;
  const screen = mountBindDeviceScreen({ onFindNearby: () => { nearbyCalls += 1; }, onBind: () => { bindCalls += 1; } });
  assert.equal(nearbyCalls, 0);
  screen.action('查找附近机器人').props.onPress();
  assert.equal(nearbyCalls, 1);
  assert.equal(bindCalls, 0);
  screen.action('扫描专属绑定二维码').props.onPress();
  screen.render();
  assert.equal(screen.action('查找附近机器人').props.disabled, true);
  screen.action('查找附近机器人').props.onPress();
  assert.equal(nearbyCalls, 1);
  screen.scanner().props.onClose();
  screen.render({ busy: true });
  screen.action('查找附近机器人').props.onPress();
  assert.equal(nearbyCalls, 1);
  assert.equal(bindCalls, 0);
});

test('cancelling the first scan keeps the confirmation form closed and sends nothing', () => {
  let bindCalls = 0;
  const screen = mountBindDeviceScreen({ onBind: () => { bindCalls += 1; } });
  screen.action('扫描专属绑定二维码').props.onPress();
  screen.render();
  screen.scanner().props.onClose();
  screen.render();
  assert.equal(bindCalls, 0);
  assert.equal(screen.scanner(), undefined);
  assert.equal(screen.field('一次性绑定码'), undefined);
  assert.equal(screen.button(), undefined);
  assert.doesNotMatch(screen.copy, /6–32/);
});

test('scanning keeps the credential private and submits once only after confirmation', async () => {
  let resolve;
  const payloads = [];
  const screen = mountBindDeviceScreen({ onBind: (deviceId, code) => {
    payloads.push([deviceId, code]);
    return new Promise(done => { resolve = done; });
  } });
  identify(screen);
  assert.equal(screen.scanner(), undefined);
  assert.match(screen.copy, /已识别绑定二维码/);
  assert.match(screen.copy, /3db1a5/);
  assert.doesNotMatch(screen.copy, new RegExp(robotId));
  assert.equal(payloads.length, 0);
  assert.equal(screen.nodes.some(node => node.type === 'TextInput'), false);
  assert.doesNotMatch(screen.copy, /CLAIM01|claim01|doso:\/\//);
  assert.match(screen.copy, /设备身份仍待验证/);
  assert.equal(screen.button().props.label, '确认绑定');
  screen.button().props.onPress();
  screen.button().props.onPress();
  screen.render();
  assert.deepEqual(payloads, [[robotId, 'CLAIM01']]);
  assert.equal(screen.button().props.disabled, true);
  assert.equal(screen.action('重新扫描').props.disabled, true);
  resolve();
  await new Promise(done => setImmediate(done));
  screen.render();
  assert.equal(screen.button().props.disabled, false);
  screen.cleanup();
});

test('rescan cancellation keeps the original claim and a successful rescan replaces it', async () => {
  const payloads = [];
  const screen = mountBindDeviceScreen({ onBind: (deviceId, code) => { payloads.push([deviceId, code]); } });
  identify(screen);
  screen.action('重新扫描').props.onPress();
  screen.render();
  const cancelledScanner = screen.scanner();
  screen.button().props.onPress();
  assert.equal(payloads.length, 0);
  screen.scanner().props.onClose();
  screen.render();
  assert.equal(screen.scanner(), undefined);
  cancelledScanner.props.onScan({ deviceId: 'b31f6e29-2a18-4ced-b503-f406b0226d30', code: 'OTHER02' });
  screen.render();
  assert.match(screen.copy, /3db1a5/);
  screen.button().props.onPress();
  await new Promise(done => setImmediate(done));
  screen.render();
  assert.deepEqual(payloads, [[robotId, 'CLAIM01']]);
  identify(screen, 'b31f6e29-2a18-4ced-b503-f406b0226d30', 'OTHER02');
  assert.match(screen.copy, /226d30/);
  assert.doesNotMatch(screen.copy, /OTHER02|CLAIM01/);
  screen.button().props.onPress();
  await new Promise(done => setImmediate(done));
  assert.deepEqual(payloads[1], ['b31f6e29-2a18-4ced-b503-f406b0226d30', 'OTHER02']);
});

test('parent busy state locks scanning and submission while server errors remain visible', () => {
  let bindCalls = 0;
  const screen = mountBindDeviceScreen({ onBind: () => { bindCalls += 1; } });
  identify(screen);
  screen.render({ busy: true, error: '网络连接失败，请稍后重试。' });
  screen.button().props.onPress();
  assert.equal(bindCalls, 0);
  assert.equal(screen.button().props.disabled, true);
  assert.equal(screen.action('重新扫描').props.disabled, true);
  assert.match(screen.copy, /网络连接失败，请稍后重试/);
});

test('a pending bind permits back navigation and completion after unmount', async () => {
  let resolve;
  let backCalls = 0;
  const screen = mountBindDeviceScreen({ onBack: () => { backCalls += 1; }, onBind: () => new Promise(done => { resolve = done; }) });
  identify(screen);
  screen.button().props.onPress();
  screen.render();
  assert.notEqual(screen.action('返回').props.disabled, true);
  screen.action('返回').props.onPress();
  assert.equal(backCalls, 1);
  screen.cleanup();
  resolve();
  await new Promise(done => setImmediate(done));
  assert.equal(screen.updatesAfterCleanup, 0);
});

test('scanner rejects public and malformed QR data and accepts one normalized credential', () => {
  const claims = [];
  const screen = mountBindDeviceScreen({ onScan: claim => claims.push(claim), onClose() {} }, 'scanner');
  const camera = screen.camera();
  assert.deepEqual(Array.from(camera.props.barcodeScannerSettings.barcodeTypes), ['qr']);
  for (const data of [robotId, 'https://example.com/', publicRobotCode,
    'doso://robot/6ba7b810-9dad-11d1-80b4-00c04fd430c8?claim=CLAIM01',
    `${publicRobotCode}?claim=short`, `${publicRobotCode}?claim=${'a'.repeat(33)}`,
    `${publicRobotCode}?claim=CLAIM-01`, `${robotCode}&claim=OTHER02`, `${robotCode}#fragment`,
    `${publicRobotCode}?code=secret`]) {
    camera.props.onBarcodeScanned({ data });
    screen.render();
    assert.match(screen.copy, /请扫描随设备提供的专属绑定二维码/);
    assert.doesNotMatch(screen.copy, /claim01|secret|OTHER02/);
    assert.ok(screen.camera());
  }
  camera.props.onBarcodeScanned({ data: ` ${robotCode.toUpperCase()} ` });
  camera.props.onBarcodeScanned({ data: robotCode });
  screen.render();
  assert.equal(claims.length, 1);
  assert.equal(claims[0].deviceId, robotId);
  assert.equal(claims[0].code, 'CLAIM01');
  assert.equal(screen.camera(), undefined);
});

test('camera scan passes a private claim to the confirmation page without binding automatically', async () => {
  const payloads = [];
  const screen = mountBindDeviceScreen({ onBind: (deviceId, code) => { payloads.push([deviceId, code]); } });
  screen.action('扫描专属绑定二维码').props.onPress();
  screen.render();
  const scanner = mountBindDeviceScreen(screen.scanner().props, 'scanner');
  scanner.camera().props.onBarcodeScanned({ data: publicRobotCode });
  scanner.render();
  screen.render();
  assert.match(scanner.copy, /请扫描随设备提供的专属绑定二维码/);
  assert.equal(screen.button(), undefined);
  scanner.camera().props.onBarcodeScanned({ data: robotCode });
  screen.render();
  assert.equal(screen.scanner(), undefined);
  assert.equal(payloads.length, 0);
  assert.equal(screen.nodes.some(node => node.type === 'TextInput'), false);
  assert.doesNotMatch(screen.copy, /claim01|CLAIM01|doso:\/\//);
  screen.button().props.onPress();
  await new Promise(done => setImmediate(done));
  assert.deepEqual(payloads, [[robotId, 'CLAIM01']]);
  scanner.cleanup();
  screen.cleanup();
});

test('scanner accepts the minimum and maximum alphanumeric claim lengths', () => {
  for (const code of ['a1b2c3', 'Ab12'.repeat(8)]) {
    let selected;
    const screen = mountBindDeviceScreen({ onScan: claim => { selected = claim; }, onClose() {} }, 'scanner');
    screen.camera().props.onBarcodeScanned({ data: `${publicRobotCode}?claim=${code}` });
    assert.equal(selected.deviceId, robotId);
    assert.equal(selected.code, code.toUpperCase());
    screen.cleanup();
  }
});

test('binding ignores repeated scanner results and all callbacks after unmount', () => {
  let binds = 0;
  const screen = mountBindDeviceScreen({ onBind: () => { binds += 1; } });
  screen.action('扫描专属绑定二维码').props.onPress();
  screen.render();
  const scanner = screen.scanner();
  scanner.props.onScan({ deviceId: robotId, code: 'CLAIM01' });
  scanner.props.onScan({ deviceId: 'b31f6e29-2a18-4ced-b503-f406b0226d30', code: 'OTHER02' });
  screen.render();
  assert.match(screen.copy, /3db1a5/);
  assert.doesNotMatch(screen.copy, /226d30/);
  const button = screen.button();
  screen.cleanup();
  scanner.props.onScan({ deviceId: robotId, code: 'CLAIM01' });
  scanner.props.onClose();
  button.props.onPress();
  assert.equal(screen.updatesAfterCleanup, 0);
  assert.equal(binds, 0);
});

test('network rejection preserves the claim for explicit retry without automatic submission', async () => {
  const payloads = [];
  const screen = mountBindDeviceScreen({ onBind: async (deviceId, code) => {
    payloads.push([deviceId, code]);
    throw new Error('timeout');
  } });
  identify(screen);
  screen.button().props.onPress();
  await new Promise(done => setImmediate(done));
  screen.render({ error: '请求超时，请重试。' });
  assert.match(screen.copy, /请求超时/);
  assert.equal(payloads.length, 1);
  assert.equal(screen.button().props.disabled, false);
  screen.button().props.onPress();
  await new Promise(done => setImmediate(done));
  assert.deepEqual(payloads, [[robotId, 'CLAIM01'], [robotId, 'CLAIM01']]);
});

test('scanner closes through the native back action and ignores late scan callbacks', () => {
  let closes = 0;
  let scans = 0;
  const screen = mountBindDeviceScreen({ onScan: () => { scans += 1; }, onClose: () => { closes += 1; } }, 'scanner');
  const camera = screen.camera();
  screen.nodes.find(node => node.type === 'Modal').props.onRequestClose();
  camera.props.onBarcodeScanned({ data: robotCode });
  assert.equal(closes, 1);
  assert.equal(scans, 0);
  screen.cleanup();
  camera.props.onMountError({ message: 'late error' });
  assert.equal(screen.updatesAfterCleanup, 0);
});

test('scanner waits for permission and directs permanently denied access to settings', async () => {
  const screen = mountBindDeviceScreen({ onScan() {}, onClose() {} }, 'scanner', { granted: false, canAskAgain: true });
  assert.equal(screen.camera(), undefined);
  await screen.action('允许使用相机').props.onPress();
  assert.equal(screen.permissionRequests, 1);
  screen.setPermission({ granted: false, canAskAgain: false });
  screen.render();
  assert.equal(screen.camera(), undefined);
  await screen.action('打开系统设置').props.onPress();
  assert.equal(screen.settingsRequests, 1);
  screen.setPermissionInSettings({ granted: true, canAskAgain: true });
  screen.appState('active');
  await new Promise(done => setImmediate(done));
  screen.render();
  assert.equal(screen.permissionRefreshes, 1);
  assert.ok(screen.camera());
  screen.cleanup();
  assert.equal(screen.appStateListenerCount, 0);
  screen.appState('active');
  assert.equal(screen.permissionRefreshes, 1);
});

test('camera mount failure releases its preview and can be retried', () => {
  const screen = mountBindDeviceScreen({ onScan() {}, onClose() {} }, 'scanner');
  screen.camera().props.onMountError({ message: 'unavailable' });
  screen.render();
  assert.equal(screen.camera(), undefined);
  assert.match(screen.copy, /相机暂时不可用/);
  screen.action('重试相机').props.onPress();
  screen.render();
  assert.ok(screen.camera());
});
