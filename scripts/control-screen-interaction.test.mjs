import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const layoutModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/screens/controlLayout.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: layoutModule, exports: layoutModule.exports });
const operationsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/control/controlOperations.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: operationsModule, exports: operationsModule.exports });
const joystickLayoutModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/control/joystickLayoutPreferences.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: joystickLayoutModule, exports: joystickLayoutModule.exports });
const g20Module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/control/g20InputModel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: g20Module, exports: g20Module.exports });

const colors = {
  authFocus: '#0066FF', authPrimary: '#0066FF', background: '#FFFFFF', ink: '#111827',
  inkSoft: '#344054', line: '#D0D5DD', muted: '#667085', surfaceStrong: '#EAECF0',
  surface: '#F4F7FA', successText: '#2F6AA3',
};

// Executes the real ControlScreen state, handlers and lifecycle effects. The joystick
// responder math and native layout have their own focused tests; this harness invokes
// the real child props that ControlScreen supplies to the joystick pair.
function mount({ dev = true, initialAppState = 'active', dimensions = { fontScale: 1, height: 844, width: 390 }, layoutLoad = async () => joystickLayoutModule.exports.createDefaultJoystickLayoutPreferences(), layoutSave = async () => {}, navigationInset = async () => 0, ...overrides } = {}) {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const appStateListeners = new Set();
  const navigationCalls = [];
  const timers = new Map();
  let timerId = 0, now = 0, unmounted = false, lateUpdates = 0;
  let cursor = 0;
  let dirty = false;
  let nodes = [];
  let backCalls = 0;
  const viewport = { ...dimensions };
  const changed = (previous, next) => !previous || !next
    || previous.length !== next.length
    || next.some((value, index) => !Object.is(value, previous[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        if (unmounted) lateUpdates++;
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) {
          slots[index] = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: callback };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        pendingEffects.push(() => {
          slots[index]?.cleanup?.();
          const cleanup = effect();
          slots[index] = { cleanup, deps };
          effects[index] = slots[index];
        });
      }
    },
  };
  const ControlJoystickPair = function ControlJoystickPair() {};
  const ControlVideoSurface = function ControlVideoSurface() {};
  const JoystickLayoutSettings = function JoystickLayoutSettings() {};
  const host = {
    AccessibilityInfo: { isReduceMotionEnabled: async () => true },
    Animated: { Value: class { setValue() {} interpolate() { return 0; } }, View: 'AnimatedView',
      timing: () => ({ start() {}, stop() {} }) },
    Easing: { quad: value => value, out: value => value },
    AppState: {
      currentState: initialAppState,
      addEventListener(_event, listener) {
        appStateListeners.add(listener);
        return { remove: () => appStateListeners.delete(listener) };
      },
    },
    Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    StyleSheet: { create: value => value },
    useWindowDimensions: () => viewport,
  };
  const dependencies = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': host,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/ControlJoystick': { ControlJoystickPair },
    '../components/ControlVideoSurface': { ControlVideoSurface },
    '../components/JoystickLayoutSettings': { JoystickLayoutSettings },
    '../features/control/joystickLayoutPreferences': { ...joystickLayoutModule.exports,
      loadJoystickLayoutPreferences: layoutLoad, saveJoystickLayoutPreferences: layoutSave },
    '../components/G20InputPanel': { G20InputPanel: 'G20InputPanel' },
    '../features/control/g20InputModel': g20Module.exports,
    '../components/AppText': { Text: 'Text' },
    '../appearance': { getProductAppearance: () => ({ canvas: '#FFFFFF', ink: '#111827', secondary: '#667085', raised: '#FFFFFF', surface: colors.surface, action: '#98D1FF', actionInk: '#17354D', blueInk: '#214F71' }) },
    '../typography': { typography: { compactTitle: {}, label: {}, caption: {} } },
    '../theme': { useAppTheme: () => ({ colors, isDark: false }) },
    './controlLayout': layoutModule.exports,
    '../features/control/controlOperations': operationsModule.exports,
    '../services/brainstemIntegrationReadiness': { getBrainstemIntegrationReadiness: () => ({
      gates: [], readOnlyReady: false, controlReady: false,
      readOnlyLabel: '只读状态未就绪', controlLabel: '真实控制保持锁定',
      controlBlockedReason: '测试夹具：控制门禁保持锁定。',
    }) },
    '../services/brainstemGrpc': { setControlNavigationHidden: hidden => {
      navigationCalls.push(hidden); return Promise.resolve(navigationInset(hidden));
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    __DEV__: dev,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename: 'src/screens/ControlScreen.tsx' });

  const props = {
    allowInteractionPreview: false,
    batteryPercent: null,
    canUseManualControl: false,
    canUseRouteMode: false,
    canUseTaskMode: false,
    connected: false,
    diagnosticsDeviceClass: 'unknown',
    diagnosticsGateway: {},
    onBack: () => { backCalls += 1; },
    robotImage: { uri: 'fixture://robot' },
    robotName: 'THUNDER 01',
    robotType: '室外四足机器人',
    ...overrides,
  };

  function render(nextProps = {}) {
    Object.assign(props, nextProps);
    let passes = 0;
    do {
      assert.ok(++passes < 30, 'ControlScreen effects must settle');
      cursor = 0;
      dirty = false;
      nodes = [];
      const root = module.exports.ControlScreen(props);
      function walk(node) {
        if (node == null || typeof node === 'boolean') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') {
          nodes.push({ type: 'copy', value: String(node) });
          return;
        }
        nodes.push(node);
        walk(node.props?.children);
      }
      walk(root);
      while (pendingEffects.length) pendingEffects.shift()();
    } while (dirty);
  }

  render();
  nodes.find(node => node.props?.testID === 'control-surface').props.onLayout({ nativeEvent: { layout: dimensions } });
  render();
  const find = testID => nodes.find(node => node.props?.testID === testID);
  return {
    ControlJoystickPair,
    find,
    get inputPanel() { return nodes.find(node => node.type === 'G20InputPanel')?.props; },
    render,
    get backCalls() { return backCalls; },
    get navigationCalls() { return navigationCalls; },
    get copy() {
      return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' ').replace(/\s+/g, ' ').trim();
    },
    get pair() { return nodes.find(node => node.type === ControlJoystickPair)?.props; },
    get videoStage() { return nodes.find(node => node.type === ControlVideoSurface)?.props; },
    get joystickSettings() { return nodes.find(node => node.type === JoystickLayoutSettings)?.props; },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
      if (!unmounted) render();
    },
    get timerCount() { return timers.size; },
    get lateUpdates() { return lateUpdates; },
    get scroll() { return nodes.find(node => node.type === 'ScrollView')?.props; },
    get safeArea() { return nodes.find(node => node.type === 'SafeAreaView')?.props; },
    background(state = 'background') {
      for (const listener of appStateListeners) listener(state);
      render();
    },
    rotate() {
      [viewport.width, viewport.height] = [viewport.height, viewport.width];
      render();
    },
    layout(width, height) {
      find('control-surface').props.onLayout({ nativeEvent: { layout: { width, height } } });
      render();
    },
    back() {
      const node = nodes.find(candidate => candidate.props?.accessibilityLabel === '返回');
      assert.ok(node, 'Missing back action');
      node.props.onPress();
      render();
    },
    unmount() {
      unmounted = true;
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}

function capableProps() {
  return {
    batteryPercent: 88,
    canUseManualControl: true,
    canUseRouteMode: true,
    canUseTaskMode: true,
    connected: true,
  };
}

function physicalFixture() {
  const subscribers = new Set();
  let sequence = 0;
  let fresh = true;
  let fenceAt = 0;
  const controller = {
    state: { reading: true, calibrated: true, calibrating: false, available: true, status: 'reading',
      message: null, sample: { channels: Array(16).fill(1500) }, axes: {}, buttons: {}, vector: null },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    isFresh() { return fresh; }, start() {}, stop() {}, beginCalibration() {}, learnAxis() {}, learnButton() {},
    captureFence() { return fenceAt; },
    finishCalibration() {}, clearCalibration() {},
  };
  return { controller, setFresh(value) { fresh = value; }, setFence(value) { fenceAt = value; }, invalidate() { for (const listener of subscribers) listener({ sample: null, frame: null }); },
    sample({ moving = false, pressed = [], requestedAt = 1000 } = {}) {
      const sample = { generation: 1, sequence: ++sequence, requestStartedAtMonotonicMs: requestedAt };
      const frame = { vector: { leftX: moving ? .5 : 0, leftY: moving ? -.5 : 0, rightX: moving ? -.2 : 0, rightY: 0 },
        pressed, neutral: !moving && pressed.length === 0 };
      for (const listener of subscribers) listener({ sample, frame });
    } };
}

test('physical input needs neutral after motion permission and sends a coherent pair; stale input interrupts', () => {
  const hardware = physicalFixture(); const sent = []; let stopped = 0;
  const productionInput = { ready: false, onDrive() { throw Error('physical must use combined snapshot'); }, onTurn() {},
    onSticks(drive, turn, sampledAt) { sent.push([drive, turn, sampledAt]); }, onInterrupt() { stopped++; } };
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical', productionInput });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent.length, 0);
  screen.render({ productionInput: { ...productionInput, ready: true } });
  hardware.sample({ moving: true }); assert.equal(sent.length, 0, 'held input must not cross a permission grant');
  hardware.sample(); hardware.sample({ moving: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0].x, .5); assert.equal(sent[0][1].x, -.2);
  assert.equal(sent[0][2], 1000, 'the physical capture timestamp reaches the control callback unchanged');
  hardware.setFresh(false); const before = stopped; hardware.sample({ moving: true });
  assert.equal(sent.length, 1); assert.ok(stopped > before);
  screen.unmount();
});

test('physical source and motion grants reject neutral frames whose requests predate the Android fence', () => {
  for (const boundary of ['source', 'motion']) {
    const hardware = physicalFixture(); let sent = 0;
    const productionInput = { ready: boundary === 'source', onDrive() {}, onTurn() {}, onSticks() { sent++; }, onInterrupt() {} };
    const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller,
      inputSource: boundary === 'motion' ? 'physical' : undefined, productionInput });
    hardware.setFence(1050);
    if (boundary === 'source') { screen.find('control-input-source-physical').props.onPress(); screen.render(); }
    else screen.render({ productionInput: { ...productionInput, ready: true } });
    // Request began before the grant, but its callback arrives afterwards and is still native-fresh.
    hardware.sample({ requestedAt: 1000 }); hardware.sample({ moving: true, requestedAt: 1100 });
    assert.equal(sent, 0, boundary);
    hardware.sample({ requestedAt: 1050 }); hardware.sample({ moving: true, requestedAt: 1101 });
    assert.equal(sent, 0, `${boundary}: same-ms neutral is ambiguous`);
    hardware.sample({ requestedAt: 1102 }); hardware.sample({ moving: true, requestedAt: 1103 });
    assert.equal(sent, 1, boundary);
    screen.unmount();
  }
});

test('missing native fence cannot arm movement and does not swallow a fresh physical stop', () => {
  const hardware = physicalFixture(); hardware.controller.captureFence = () => null;
  let sent = 0, stopped = 0;
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onSticks() { sent++; }, onInterrupt() { stopped++; } } });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 0);
  const before = stopped; hardware.sample({ moving: true, pressed: ['stop'] });
  assert.ok(stopped > before); assert.equal(sent, 0); screen.unmount();
});

test('input settings interrupts control and never routes physical frames or keys', () => {
  const hardware = physicalFixture(); let sent = 0, stopped = 0;
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onSticks() { sent++; }, onInterrupt() { stopped++; } } });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  screen.find('control-open-input').props.onPress(); screen.render();
  assert.ok(screen.inputPanel); const before = sent; const interrupts = stopped;
  hardware.sample(); hardware.sample({ moving: true, pressed: ['stand'] });
  assert.equal(sent, before); assert.ok(stopped > 0);
  screen.inputPanel.onClose(); screen.render();
  hardware.sample({ moving: true }); assert.equal(sent, before);
  assert.ok(stopped > interrupts);
  screen.unmount();
});

test('physical source is exclusive and loss of calibration cannot retain drive authority', () => {
  const hardware = physicalFixture(); let sent = 0;
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller,
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onSticks() { sent++; }, onInterrupt() {} } });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 0, 'touch source ignores hardware');
  screen.find('control-input-source-physical').props.onPress(); screen.render();
  assert.equal(screen.pair.disabled, true);
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  hardware.controller.state = { ...hardware.controller.state, calibrated: false };
  screen.render(); hardware.sample({ moving: true });
  assert.equal(sent, 1); assert.equal(screen.find('control-input-source-physical').props.disabled, true);
  screen.unmount();
});

test('retired touch callbacks cannot cross source switches or a touch-physical-touch ABA', () => {
  const hardware = physicalFixture(); const sent = [];
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller,
    productionInput: { ready: true, onDrive(value) { sent.push(['drive', value]); }, onTurn(value) { sent.push(['turn', value]); }, onInterrupt() {} } });
  const oldDrive = screen.pair.left.onSample, oldTurn = screen.pair.right.onSample;
  screen.find('control-input-source-physical').props.onPress();
  oldDrive({ x: .3, y: -.4 }); oldTurn({ x: .2, y: 0 });
  assert.equal(sent.length, 0, 'source switch must retire callbacks before React renders');
  screen.render(); oldDrive({ x: .3, y: -.4 }); oldTurn({ x: .2, y: 0 });
  assert.equal(sent.length, 0);
  screen.find('control-input-source-touch').props.onPress(); screen.render();
  oldDrive({ x: .3, y: -.4 }); oldTurn({ x: .2, y: 0 });
  assert.equal(sent.length, 0, 'returning to touch must not resurrect the previous touch context');
  screen.pair.left.onSample({ x: .3, y: -.4 }); screen.pair.right.onSample({ x: .2, y: 0 });
  assert.equal(sent.length, 2, 'the newly rendered context can receive fresh touch samples');
  screen.unmount();
});

test('both settings surfaces permanently retire saved touch callbacks even after closing', () => {
  for (const kind of ['input', 'layout']) {
    const hardware = physicalFixture(); let sent = 0;
    const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller,
      productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() {} } });
    const oldDrive = screen.pair.left.onSample, oldTurn = screen.pair.right.onSample;
    screen.find(kind === 'input' ? 'control-open-input' : 'control-open-joystick-layout').props.onPress();
    oldDrive({ x: 1, y: 0 }); oldTurn({ x: 1, y: 0 });
    assert.equal(sent, 0, `${kind} settings must synchronously reject previous input`);
    screen.render();
    (kind === 'input' ? screen.inputPanel : screen.joystickSettings).onClose(); screen.render();
    oldDrive({ x: 1, y: 0 }); oldTurn({ x: 1, y: 0 });
    assert.equal(sent, 0, `${kind} closing must not revalidate old callbacks`);
    screen.pair.left.onSample({ x: .2, y: 0 }); assert.equal(sent, 1);
    screen.unmount();
  }
});

test('touch callbacks cannot survive permission revoke and regrant with identical callback identities', () => {
  let sent = 0;
  const productionInput = { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() {} };
  const screen = mount({ dev: false, ...capableProps(), productionInput });
  const previous = screen.pair.left.onSample;
  screen.render({ productionInput: { ...productionInput, ready: false } }); previous({ x: 1, y: 0 });
  assert.equal(sent, 0);
  screen.render({ productionInput }); previous({ x: 1, y: 0 });
  assert.equal(sent, 0, 'a prior permission generation must never be revived');
  screen.pair.left.onSample({ x: .2, y: 0 }); assert.equal(sent, 1);
  screen.unmount();
});

test('ordinary rerenders retain live touch ownership, while a replacement executor retires it', () => {
  const sent = [];
  const productionInput = { ready: true, onDrive() { sent.push('original'); }, onTurn() {}, onInterrupt() {} };
  const screen = mount({ dev: false, ...capableProps(), productionInput });
  const previous = screen.pair.left.onSample;
  screen.render({ productionInput: { ...productionInput } }); previous({ x: .2, y: 0 });
  assert.deepEqual(sent, ['original'], 'equivalent render props must not cancel a live gesture');
  screen.render({ productionInput: { ...productionInput, onDrive() { sent.push('replacement'); } } });
  previous({ x: .2, y: 0 }); assert.deepEqual(sent, ['original']);
  screen.pair.left.onSample({ x: .2, y: 0 }); assert.deepEqual(sent, ['original', 'replacement']);
  screen.unmount();
});

test('touch callbacks from before lifecycle, geometry, or cancellation boundaries remain retired', () => {
  for (const boundary of ['background', 'resize', 'rotation', 'cancel']) {
    let sent = 0;
    const screen = mount({ dev: false, ...capableProps(),
      productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() {} } });
    const previous = screen.pair.left.onSample;
    if (boundary === 'background') { screen.background(); screen.background('active'); }
    if (boundary === 'resize') screen.layout(391, 844);
    if (boundary === 'rotation') screen.rotate();
    if (boundary === 'cancel') { screen.pair.onCancel(); screen.render(); }
    previous({ x: 1, y: 0 });
    assert.equal(sent, 0, `${boundary} must retire old callback ownership`);
    screen.pair.left.onSample({ x: .2, y: 0 }); assert.equal(sent, 1);
    screen.unmount(); previous({ x: 1, y: 0 }); assert.equal(sent, 1);
  }
});

test('physical stop cancels a pending confirmation while another key remains held', () => {
  const hardware = physicalFixture(); let interrupted = 0, enabled = 0;
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onSticks() {}, onInterrupt() { interrupted++; } },
    operationReadiness: { enableMotor: { ready: true } }, operationCallbacks: { enableMotor() { enabled++; } } });
  hardware.sample(); hardware.sample({ pressed: ['enableMotor'] }); screen.render();
  assert.ok(screen.find('control-confirmation')); assert.equal(enabled, 0);
  const before = interrupted;
  hardware.sample({ pressed: ['enableMotor', 'stop'] }); screen.render();
  assert.ok(interrupted > before); assert.equal(enabled, 0);
  assert.equal(screen.find('control-confirmation'), undefined);
  const after = interrupted;
  hardware.sample({ pressed: ['enableMotor', 'stop'] }); screen.render();
  assert.equal(interrupted, after, 'held stop must not repeatedly dispatch');
  screen.unmount();
});

test('direct IP status is labelled as one read and cannot be mistaken for cloud-online control', () => {
  let opened = 0;
  const screen = mount({ dev: false, robotName: 'IP 直连设备', robotType: '只读状态 · 设备归属未核验',
    directConnection: { endpointLabel: 'robot.example.test:13145', fresh: true, summary: '状态已读取 · 设备归属未核验' },
    runtimeState: { controlLink: 'unknown', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    onOpenConnection: () => opened++ });
  assert.ok(screen.find('control-direct-connection'));
  assert.match(screen.copy, /状态已读取/); assert.match(screen.copy, /当前站立/); assert.match(screen.copy, /电机已使能/);
  assert.doesNotMatch(screen.copy, /设备在线|已取得控制权/);
  assert.equal(screen.pair.disabled, true);
  screen.find('control-open-connection').props.onPress(); assert.equal(opened, 1);
  screen.render({ directConnection: { endpointLabel: 'robot.example.test:13145', fresh: false, summary: '状态已过期 · 请重新检查' },
    runtimeState: { controlLink: 'unknown', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown' } });
  assert.match(screen.copy, /需重新检查/); assert.doesNotMatch(screen.copy, /当前站立|电机已使能/);
});

test('production control center exposes truthful status, map availability and labeled disabled sticks', () => {
  const screen = mount({ dev: false });
  for (const copy of ['THUNDER 01', '室外四足机器人', '设备离线', '电量未知', '手动控制未开放', '地图未接入']) {
    assert.ok(screen.copy.includes(copy), copy);
  }
  assert.equal(screen.pair.disabled, true);
  assert.equal(screen.pair.showLabels, true);
  assert.equal(screen.pair.left.testID, 'control-drive-stick');
  assert.equal(screen.pair.right.testID, 'control-turn-stick');
  assert.ok(screen.find('control-back'));
  for (const entry of ['map', 'tasks', 'routes', 'connection']) assert.ok(screen.find(`control-open-${entry}`));
  assert.equal(screen.find('control-recall').props.disabled, true);
  assert.ok(screen.find('control-terrain-mode'));
  for (const mode of ['flat', 'stairs', 'platform']) assert.equal(screen.find(`control-terrain-mode-${mode}`).props.disabled, true);
  assert.equal(screen.find('control-preview-toggle'), undefined);
  assert.equal(screen.find('control-stop-disabled'), undefined);
  assert.equal(screen.find('control-developer-toggle'), undefined);
  screen.unmount();
});

test('complete action surface keeps stop visible, supports collapse, and reports per-action states', () => {
  const screen = mount({ dev: false,
    runtimeState: {
      controlLink: 'disconnected', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown',
      deviceIdentity: 'bound-unverified', faultStatus: 'unknown',
      speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' },
      policyCatalogStatus: 'unknown', policyOptions: [],
    },
    operationStates: {
      stop: { status: 'timeout', detail: '失联清零尚未验收' },
      stand: { status: 'executing', detail: '等待设备终态' },
    },
  });
  assert.ok(screen.find('control-action-stop'));
  assert.match(screen.find('control-action-status-stop').props.children.join(''), /超时/);
  assert.match(screen.find('control-action-status-stand').props.children.join(''), /执行中/);
  assert.ok(screen.find('control-action-collapse'));
  screen.find('control-action-collapse').props.onPress();
  screen.render();
  assert.ok(screen.find('control-action-collapsed'));
  screen.unmount();
});

test('landscape keeps the four real action controls on the glass video surface', () => {
  const screen = mount({ dev: false, dimensions: { width: 844, height: 390, fontScale: 1 } });
  assert.ok(screen.find('control-back'));
  assert.ok(screen.find('control-immersive-surface'));
  assert.ok(screen.find('control-action-dock'));
  assert.ok(screen.find('control-action-stand'));
  assert.ok(screen.find('control-action-sit'));
  assert.ok(screen.find('control-action-stop'));
  assert.equal(screen.find('control-action-status-stand'), undefined);
  assert.equal(screen.find('control-secondary-navigation'), undefined);
  assert.equal(screen.find('control-speed-zone'), undefined);
  assert.equal(screen.find('control-input-source'), undefined);
  assert.equal(screen.find('control-map-content'), undefined);
  assert.equal(screen.find('control-brainstem-details'), undefined);
  assert.equal(screen.find('control-secondary-actions-toggle'), undefined);
  assert.ok(screen.find('control-telemetry'));
  assert.ok(screen.find('control-telemetry-speed'));
  assert.ok(screen.find('control-telemetry-signal'));
  assert.ok(screen.find('control-telemetry-battery'));
  assert.ok(screen.pair);
  assert.equal(screen.pair.variant, 'glass');
  assert.equal(screen.pair.showLabels, false);
  assert.equal(screen.pair.disabled, true);
  assert.match(screen.copy, /THUNDER-01/);
  assert.match(screen.copy, /速度|信号|电量/);
  assert.doesNotMatch(screen.copy, /手动控制|输入来源|地图|任务|路线|Brainstem|更多/);
  screen.unmount();
});

test('landscape canvas remains measured and bounded across system bars and input-panel return', async () => {
  const hardware = physicalFixture();
  const screen = mount({ dev: false, dimensions: { width: 753, height: 400, fontScale: 1 },
    g20Controller: hardware.controller, navigationInset: async () => 48 });
  const canvasHeight = () => Object.assign({}, ...screen.find('control-immersive-surface').props.style).height;
  await screen.settle();
  assert.equal(screen.scroll, undefined, 'the control surface cannot grow inside a percentage-height ScrollView');
  assert.equal(screen.navigationCalls.at(-1), true);
  assert.equal(canvasHeight(), 352);
  screen.layout(753, 448);
  assert.equal(canvasHeight(), 400, 'reserve the stable navigation height even while the bar is hidden');
  screen.find('control-open-input').props.onPress(); screen.render(); await screen.settle();
  assert.ok(screen.inputPanel);
  assert.equal(screen.navigationCalls.at(-1), false);
  screen.inputPanel.onClose(); screen.render(); await screen.settle();
  assert.equal(screen.navigationCalls.at(-1), true);
  screen.layout(753, 400);
  assert.equal(canvasHeight(), 352);
  assert.equal(screen.pair.disabled, true, 'window changes must not acquire input authority');
  screen.background(); await screen.settle();
  assert.equal(screen.navigationCalls.at(-1), false);
  screen.background('active'); await screen.settle();
  assert.equal(screen.navigationCalls.at(-1), true);
  screen.unmount();
  assert.equal(screen.navigationCalls.at(-1), false);
});

test('large text keeps its scrollable layout and a retired navigation reply cannot resize the screen', async () => {
  const large = mount({ dev: false, dimensions: { width: 753, height: 400, fontScale: 1.6 } });
  await large.settle();
  assert.ok(large.scroll);
  assert.equal(large.find('control-immersive-surface'), undefined);
  assert.equal(large.navigationCalls.at(-1), false);
  large.unmount();

  let resolveHidden;
  const screen = mount({ dev: false, dimensions: { width: 753, height: 400, fontScale: 1 },
    navigationInset: hidden => hidden ? new Promise(resolve => { resolveHidden = resolve; }) : 0 });
  screen.unmount();
  resolveHidden(48);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(screen.lateUpdates, 0);
  assert.equal(screen.navigationCalls.at(-1), false);
});

test('landscape diagnostics retires held touch before navigation', () => {
  const order = []; let sent = 0;
  const screen = mount({ dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() {}, onInterrupt() { order.push('interrupt'); } },
    onOpenJointStatus() { order.push('diagnostics'); } });
  const oldInput = screen.pair.left.onSample;
  oldInput({ x: .2, y: .2 });
  const before = sent;
  screen.find('control-open-diagnostics').props.onPress();
  assert.deepEqual(order.slice(-2), ['interrupt', 'diagnostics']);
  oldInput({ x: .3, y: .3 });
  assert.equal(sent, before);
  screen.unmount();
});

test('gesture library opens unavailable state and retires old touch without replay on return', () => {
  let sent = 0, interrupted = 0;
  const screen = mount({ dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() {}, onInterrupt() { interrupted++; } } });
  const oldInput = screen.pair.left.onSample;
  oldInput({ x: .2, y: .2 });
  const sentBefore = sent, interruptedBefore = interrupted;
  screen.find('control-open-gestures').props.onPress(); screen.render();
  assert.ok(screen.find('control-gesture-library'));
  assert.match(screen.copy, /动作库暂不可用/);
  assert.equal(screen.find('control-action-stand'), undefined);
  assert.ok(interrupted > interruptedBefore);
  oldInput({ x: .4, y: .4 }); assert.equal(sent, sentBefore);
  screen.find('control-close-gestures').props.onPress(); screen.render();
  assert.equal(screen.find('control-gesture-library'), undefined);
  assert.ok(screen.find('control-open-gestures'));
  oldInput({ x: .4, y: .4 }); assert.equal(sent, sentBefore);
  screen.unmount();
});

test('landscape exposes actual robot policy IDs without guessing terrain names or dispatching on open', () => {
  let called = 0;
  const screen = mount({ dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    runtimeState: { controlLink: 'connected', motorState: 'disabled', posture: 'sitting', policyCatalogStatus: 'synced',
      currentPolicy: { id: 'w5_current', label: 'W5' }, policyOptions: [{ id: 'w5_current', label: 'W5' }, { id: 'robot_candidate', label: '候选策略' }] },
    operationReadiness: { switchPolicy: { ready: true } },
    operationCallbacks: { switchPolicy() { called++; } } });
  screen.find('control-open-policy').props.onPress(); screen.render();
  assert.equal(screen.find('control-mode-w5_current').props.accessibilityState.selected, true);
  assert.equal(screen.find('control-mode-w5_current').props.disabled, true);
  assert.equal(screen.find('control-mode-robot_candidate').props.disabled, false);
  assert.equal(screen.find('control-mode-flat'), undefined);
  assert.equal(called, 0);
  screen.find('control-mode-robot_candidate').props.onPress(); screen.render();
  assert.match(screen.copy, /确认.*候选策略/);
  assert.equal(called, 0);
  screen.unmount();
});

test('landscape mode entry explains unavailable capability and never sends an action', () => {
  let called = 0;
  const screen = mount({ dev: false, dimensions: { width: 800, height: 480, fontScale: 1 },
    operationReadiness: { switchPolicy: { ready: false, blockedReason: '先连接机器人' } },
    operationCallbacks: { switchPolicy() { called++; } } });
  screen.find('control-open-policy').props.onPress(); screen.render();
  assert.doesNotMatch(screen.copy, /先连接机器人|待同步|未配置/);
  assert.equal(screen.find('control-mode-flat').props.accessibilityHint, '先连接机器人');
  assert.equal(called, 0);
  assert.equal(screen.pair.disabled, true);
  screen.unmount();
});

test('landscape mode entry opens real policy selection without executing a policy', () => {
  let called = 0;
  const screen = mount({ dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    runtimeState: { policyCatalogStatus: 'synced', policyOptions: [{ id: 'flat', label: '标准行走' }] },
    operationReadiness: { switchPolicy: { ready: true } }, operationCallbacks: { switchPolicy() { called++; } } });
  screen.find('control-open-policy').props.onPress(); screen.render();
  assert.match(screen.copy, /平地/);
  assert.doesNotMatch(screen.copy, /待同步|未配置/);
  assert.equal(screen.find('control-mode-flat').props.disabled, false);
  assert.equal(screen.find('control-mode-stairs').props.disabled, true);
  assert.equal(screen.find('control-mode-platform').props.disabled, true);
  assert.equal(called, 0);
  assert.equal(screen.pair.disabled, true);
  assert.ok(screen.find('control-mode-menu'));
  screen.find('control-mode-dismiss').props.onPress(); screen.render();
  assert.equal(screen.find('control-mode-menu'), undefined);
  screen.find('control-open-policy').props.onPress(); screen.render();
  assert.ok(screen.find('control-mode-menu'));
  screen.find('control-open-policy').props.onPress(); screen.render();
  assert.equal(screen.find('control-mode-menu'), undefined);
  assert.equal(called, 0);
  screen.unmount();
});

test('landscape removes the crossed joint shortcut without changing the controller gate', () => {
  let opened = 0;
  const screen = mount({ dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, onOpenJointStatus: () => { opened += 1; } });
  assert.equal(screen.find('control-open-joints'), undefined);
  assert.equal(opened, 0);
  assert.equal(screen.pair.disabled, true);
  screen.unmount();
});

test('speed and input-source surfaces stay truthful when no device telemetry or physical axis adapter exists', () => {
  const screen = mount({ dev: false, runtimeState: {
    controlLink: 'unknown', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown',
    deviceIdentity: 'unbound', faultStatus: 'unknown',
    speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' },
    policyCatalogStatus: 'unknown', policyOptions: [],
  } });
  assert.ok(screen.find('control-speed-zone'));
  assert.match(screen.copy, /线速度 未知/);
  assert.ok(screen.find('control-input-source-touch'));
  assert.equal(screen.find('control-input-source-physical').props.disabled, true);
  assert.ok(screen.find('control-physical-input-reason') === undefined);
  screen.unmount();
});

test('return action retains a 48 point touch target alongside robot identity', () => {
  const screen = mount();
  const styles = screen.find('control-back').props.style({ pressed: false });
  const target = Object.assign({}, ...styles.filter(Boolean));
  assert.ok(target.width >= 48 && target.height >= 48);
  assert.ok(screen.copy.includes('THUNDER 01'));
  screen.unmount();
});

test('production hard gate defeats preview and every legacy capability prop', () => {
  const screen = mount({ dev: false, ...capableProps(), allowInteractionPreview: true });
  assert.equal(screen.pair.disabled, true);
  assert.ok(screen.copy.includes('设备在线'));
  assert.ok(screen.copy.includes('88%'));
  assert.ok(screen.copy.includes('手动控制未开放'));
  assert.equal(screen.copy.includes('本地操作演示'), false);
  screen.pair.left.onChange({ x: 1, y: 1 });
  screen.pair.right.onChange({ x: 1, y: 0 });
  screen.render();
  assert.equal(screen.scroll.scrollEnabled, true, 'NOOP inputs cannot enter an active command state');
  screen.unmount();
});

test('development preview is direct, local-only, and never exposes a transport callback', () => {
  const screen = mount({ ...capableProps(), allowInteractionPreview: true });
  assert.equal(screen.pair.disabled, false);
  const resetKey = screen.pair.resetKey;
  screen.pair.left.onChange({ x: -0.42, y: 0.76 });
  screen.pair.right.onChange({ x: -0.31, y: 0 });
  screen.render();
  assert.equal(screen.pair.resetKey, resetKey);
  assert.ok(screen.copy.includes('本地操作演示'));
  assert.equal(screen.find('control-preview-toggle'), undefined);
  screen.unmount();
});

test('active touch pauses scrolling while component-local feedback is active', () => {
  const screen = mount({ ...capableProps(), allowInteractionPreview: true });
  assert.equal(screen.scroll.scrollEnabled, true);
  screen.pair.left.onActiveChange(true);
  screen.render();
  assert.equal(screen.scroll.scrollEnabled, false);
  screen.pair.left.onActiveChange(false);
  screen.render();
  assert.equal(screen.scroll.scrollEnabled, true);
  screen.unmount();
});

test('background resets and disables; foreground resumes only the development preview', () => {
  const screen = mount({ ...capableProps(), allowInteractionPreview: true });
  const activeResetKey = screen.pair.resetKey;
  screen.background();
  assert.equal(screen.pair.disabled, true);
  assert.ok(screen.pair.resetKey > activeResetKey);
  screen.background('active');
  assert.equal(screen.pair.disabled, false);
  screen.unmount();
});

test('rotation and return invalidate all prior touch ownership', () => {
  const screen = mount({ ...capableProps(), allowInteractionPreview: true });
  let resetKey = screen.pair.resetKey;
  screen.rotate();
  assert.ok(screen.pair.resetKey > resetKey);
  resetKey = screen.pair.resetKey;
  screen.back();
  assert.equal(screen.backCalls, 1);
  assert.equal(screen.pair.disabled, true);
  assert.ok(screen.pair.resetKey > resetKey);
  screen.unmount();
});

test('same-orientation window resize interrupts held local input inside the fixed landscape canvas', () => {
  let interrupts = 0;
  const screen = mount({
    dimensions: { width: 753, height: 471, fontScale: 1 },
    developmentInput: { ready: true, onDrive() {}, onTurn() {}, onInterrupt() { interrupts++; } },
  });
  screen.layout(753, 471);
  const baselineInterrupts = interrupts;
  const baselineReset = screen.pair.resetKey;
  screen.pair.left.onActiveChange(true);
  screen.render();
  assert.equal(screen.scroll, undefined);
  screen.layout(675, 390);
  assert.equal(interrupts, baselineInterrupts + 1);
  assert.ok(screen.pair.resetKey > baselineReset);
  assert.equal(screen.scroll, undefined);
  screen.layout(675, 390);
  assert.equal(interrupts, baselineInterrupts + 1, 'identical measurements do not repeatedly interrupt');
  screen.layout(675.5, 390);
  assert.equal(interrupts, baselineInterrupts + 2, 'fractional layout movement also invalidates the touch baseline');
  screen.unmount();
});

test('insufficient or invalid viewport removes undersized pads while keeping return available', () => {
  const screen = mount({ allowInteractionPreview: true, dimensions: { width: 753, height: 471, fontScale: 1 } });
  assert.ok(screen.pair);
  for (const [width, height] of [[80, 390], [753, 110], [NaN, 390], [753, Infinity]]) {
    screen.layout(width, height);
    assert.equal(screen.pair, undefined, 'no active or overflowing zero-sized pad');
    assert.ok(screen.find('control-back'));
    if (screen.scroll) assert.equal(screen.scroll.scrollEnabled, true);
  }
  screen.layout(675, 390);
  assert.equal(screen.pair.disabled, false);
  assert.ok(screen.pair.size >= 48 && screen.pair.size <= 144);
  screen.unmount();
});

test('development session must be ready before input reaches its callbacks', () => {
  const drive = [], turn = [];
  const input = { ready: false, onDrive: value => drive.push(value), onTurn: value => turn.push(value), onInterrupt() {} };
  const screen = mount({ developmentInput: input, allowInteractionPreview: true });
  assert.equal(screen.pair.disabled, true, 'an offline preview cannot bypass the session readiness gate');
  screen.pair.left.onChange({x:1,y:-1});
  assert.equal(drive.length, 0);
  screen.render({ developmentInput: {...input, ready:true} });
  assert.equal(screen.pair.disabled, false);
  screen.pair.left.onChange({x:.5,y:-.5});
  screen.pair.right.onChange({x:.3,y:0});
  assert.equal(drive.length, 1); assert.equal(turn.length, 1);
  screen.unmount();
});

test('production never invokes an injected development control session', () => {
  let inputs=0, interrupts=0;
  const input={ready:true,onDrive(){inputs++;},onTurn(){inputs++;},onInterrupt(){interrupts++;}};
  const screen=mount({dev:false,developmentInput:input,allowInteractionPreview:true});
  assert.equal(screen.pair.disabled,true);
  screen.pair.left.onChange({x:1,y:1}); screen.pair.right.onChange({x:1,y:0});
  screen.background();screen.rotate();screen.back();screen.unmount();
  assert.equal(inputs,0);assert.equal(interrupts,0);
});

test('production input uses the explicit real channel and cancels on lifecycle changes', () => {
  let samples = 0, interrupts = 0;
  const input = { ready: true, onDrive() { samples++; }, onTurn() { samples++; }, onInterrupt() { interrupts++; } };
  const screen = mount({ dev: false, canUseManualControl: true, productionInput: input });
  assert.equal(screen.pair.disabled, false);
  screen.pair.left.onSample({ x: .2, y: -.2 });
  screen.pair.right.onSample({ x: .2, y: 0 });
  assert.equal(samples, 2);
  screen.background(); assert.equal(interrupts, 1); assert.equal(screen.pair.disabled, true);
  screen.pair.left.onSample({ x: 1, y: 1 }); assert.equal(samples, 2);
  screen.unmount(); assert.equal(interrupts, 2);
});

test('a production posture action delegates its zero/release transaction without racing an external interrupt', async () => {
  let actions = 0, interrupts = 0;
  const screen = mount({ dev: false, canUseManualControl: true,
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onInterrupt() { interrupts++; } },
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', motorState: 'enabled', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } } });
  screen.find('control-action-sit').props.onPress();
  await Promise.resolve(); screen.render();
  assert.equal(actions, 1); assert.equal(interrupts, 0);
  screen.unmount();
});

test('a rejected stop is displayed as unconfirmed instead of accepted or completed', async () => {
  const screen = mount({ dev: false,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', motorState: 'enabled', posture: 'standing' },
    operationReadiness: { stop: { ready: true } },
    operationCallbacks: { stop: async () => { throw new Error('停止请求未确认'); } },
  });
  screen.find('control-action-stop').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); screen.render();
  assert.match(screen.copy, /未能确认操作结果/);
  assert.match(screen.find('control-action-status-stop').props.children.join(''), /失败/);
  assert.doesNotMatch(screen.copy, /请求已接受|设备状态已确认/);
  screen.unmount();
});

test('a successful stop reports control revocation without claiming measured physical standstill', async () => {
  const screen = mount({ dev: false,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held' },
    operationReadiness: { stop: { ready: true } }, operationCallbacks: { stop: async () => {} },
  });
  screen.find('control-action-stop').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); screen.render();
  screen.render({ runtimeState: { controlLink: 'connected', controlAuthority: 'not-held' } });
  assert.match(screen.copy, /控制权撤销已确认/);
  assert.doesNotMatch(screen.copy, /机器人已停止|机身已静止/);
  screen.unmount();
});

test('posture dispatch ACK stays pending until observed posture, then does not permanently lock the action', async () => {
  const screen = mount({ dev: false,
    runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => {} } });
  screen.find('control-action-sit').props.onPress(); await new Promise(resolve => setImmediate(resolve)); screen.render();
  assert.doesNotMatch(screen.copy, /设备状态已确认/);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'unknown' } });
  assert.doesNotMatch(screen.copy, /设备状态已确认/);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'sitting' } });
  assert.match(screen.copy, /设备状态已确认/);
  assert.equal(screen.timerCount, 0, 'confirmed results release their deadline');
  screen.advance(10_000);
  assert.match(screen.copy, /设备状态已确认/);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'standing' } });
  assert.equal(screen.find('control-action-sit').props.disabled, false);
  screen.unmount();
});

test('accepted action expires after ten seconds without replay or a fabricated terminal result', async () => {
  let actions = 0;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } } });
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  assert.match(screen.copy, /已接受/); assert.doesNotMatch(screen.copy, /设备状态已确认/);
  screen.advance(5_000); screen.render(); screen.advance(4_999);
  assert.match(screen.copy, /已接受/);
  screen.advance(1);
  assert.match(screen.copy, /结果未确认/); assert.match(screen.copy, /超时/);
  assert.doesNotMatch(screen.copy, /请求已接受|设备状态已确认/);
  assert.equal(actions, 1); assert.equal(screen.timerCount, 0);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'sitting' } });
  assert.doesNotMatch(screen.copy, /设备状态已确认/, 'late state cannot promote an expired request');
  screen.unmount();
});

test('a missing ACK also expires and cannot overwrite a newer request when it arrives late', async () => {
  let finish, actions = 0;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } },
    operationCallbacks: { sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); } } });
  screen.find('control-action-sit').props.onPress(); screen.render(); screen.advance(10_000);
  assert.match(screen.copy, /结果未确认/);
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  screen.advance(5_000); finish(); await screen.settle();
  assert.match(screen.copy, /已接受/); assert.equal(actions, 2);
  screen.advance(5_000); assert.match(screen.copy, /结果未确认/);
  screen.unmount();
});

test('disconnect or stale control state retires a pending result even when posture matches', async () => {
  for (const controlLink of ['disconnected', 'unknown', undefined]) {
    const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
      operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => {} } });
    screen.find('control-action-sit').props.onPress(); await screen.settle();
    screen.render({ runtimeState: { controlLink, posture: 'sitting' } });
    assert.match(screen.copy, /结果未确认/); assert.doesNotMatch(screen.copy, /设备状态已确认/);
    assert.equal(screen.timerCount, 0); screen.unmount();
  }
});

test('independent read-only telemetry freshness does not invalidate an action control result', async () => {
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    directConnection: { endpointLabel: 'robot.test:13145', fresh: false, summary: '遥测待刷新' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => {} } });
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  assert.match(screen.copy, /已接受/);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'sitting' } });
  assert.match(screen.copy, /设备状态已确认/); screen.unmount();
});

test('target and input-source changes retire old callbacks before another action can complete', async () => {
  for (const boundary of ['target', 'source-prop', 'source-press']) {
    let finish, actions = 0;
    const screen = mount({ dev: false, operationTargetKey: 'robot-a', inputSource: 'touch', physicalInputAvailable: true,
      runtimeState: { controlLink: 'connected', posture: 'standing' },
      operationReadiness: { sit: { ready: true } }, operationCallbacks: {
        sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); },
      } });
    screen.find('control-action-sit').props.onPress(); screen.render();
    if (boundary === 'target') screen.render({ operationTargetKey: 'robot-b' });
    if (boundary === 'source-prop') screen.render({ inputSource: 'physical' });
    if (boundary === 'source-press') {
      screen.find('control-input-source-physical').props.onPress();
      finish(); await screen.settle();
    }
    assert.match(screen.copy, /结果未确认/, boundary);
    screen.render({ operationTargetKey: 'robot-a', inputSource: 'touch' });
    screen.find('control-action-sit').props.onPress(); await screen.settle();
    finish(); await screen.settle(); assert.equal(actions, 2);
    assert.match(screen.copy, /已接受/);
    screen.render({ runtimeState: { controlLink: 'connected', posture: 'sitting' } });
    assert.match(screen.copy, /设备状态已确认/); assert.equal(screen.timerCount, 0);
    screen.unmount();
  }
});

test('unmount clears the result deadline and ignores a late action callback', async () => {
  let finish;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: () => new Promise(resolve => { finish = resolve; }) } });
  screen.find('control-action-sit').props.onPress(); screen.render();
  screen.unmount(); finish(); await Promise.resolve(); await Promise.resolve(); screen.advance(10_000);
  assert.equal(screen.timerCount, 0); assert.equal(screen.lateUpdates, 0);
});

test('a delayed ACK does not restart the original result deadline', async () => {
  let finish;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: () => new Promise(resolve => { finish = resolve; }) } });
  screen.find('control-action-sit').props.onPress(); screen.render(); screen.advance(9_000);
  finish(); await screen.settle(); assert.match(screen.copy, /已接受/);
  screen.advance(1_000); assert.match(screen.copy, /结果未确认/); screen.unmount();
});

test('an explicit newer dispatch of the same action replaces the old result deadline', async () => {
  let actions = 0;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } } });
  screen.find('control-action-sit').props.onPress(); await screen.settle(); screen.advance(5_000);
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  assert.equal(actions, 2); assert.equal(screen.timerCount, 1);
  screen.advance(5_000); assert.match(screen.copy, /已接受/); assert.doesNotMatch(screen.copy, /结果未确认/);
  screen.advance(5_000); assert.match(screen.copy, /结果未确认/); screen.unmount();
});

test('disconnect before ACK releases the old request and recovery does not revive its callback', async () => {
  let finish, actions = 0;
  const screen = mount({ dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } },
    operationCallbacks: { sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); } } });
  screen.find('control-action-sit').props.onPress(); screen.render();
  screen.render({ runtimeState: { controlLink: 'disconnected', posture: 'unknown' } });
  assert.match(screen.copy, /结果未确认/); assert.equal(screen.timerCount, 0);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'standing' } });
  screen.find('control-action-sit').props.onPress(); await screen.settle(); finish(); await screen.settle();
  assert.equal(actions, 2); assert.match(screen.copy, /已接受/);
  screen.unmount();
});

test('a new target or controlled input source also retires saved presses and motor confirmations', () => {
  for (const boundary of [{ operationTargetKey: 'robot-b' }, { inputSource: 'physical' }]) {
    let actions = 0;
    const screen = mount({ dev: false, operationTargetKey: 'robot-a', inputSource: 'touch', physicalInputAvailable: true,
      runtimeState: { controlLink: 'connected', motorState: 'disabled', posture: 'standing' },
      operationReadiness: { sit: { ready: true }, enableMotor: { ready: true } },
      operationCallbacks: { sit() { actions++; }, enableMotor() { actions++; } } });
    const oldPress = screen.find('control-action-sit').props.onPress;
    screen.find('control-action-enableMotor').props.onPress(); screen.render();
    const oldConfirm = screen.find('control-confirm-action').props.onPress;
    screen.render(boundary);
    assert.equal(screen.find('control-confirmation'), undefined);
    oldPress(); oldConfirm(); screen.render(); assert.equal(actions, 0);
    screen.unmount();
  }
});

test('background, rotation, return and unmount interrupt a development control session', () => {
  let interrupted=0;
  const input={ready:true,onDrive(){},onTurn(){},onInterrupt(){interrupted++;}};
  const screen=mount({developmentInput:input});
  screen.background();assert.equal(interrupted,1);assert.equal(screen.pair.disabled,true);
  screen.render({developmentInput:{...input,ready:false}});screen.background('active');
  assert.equal(screen.pair.disabled,true,'foreground does not reactivate a disconnected session');
  screen.rotate();assert.equal(interrupted,2);
  screen.back();assert.equal(interrupted,3);
  screen.unmount();assert.equal(interrupted,4);
});

test('unknown initial AppState fails closed until an active lifecycle event', () => {
  const screen=mount({initialAppState:null,developmentInput:{ready:true,onDrive(){},onTurn(){},onInterrupt(){}}});
  assert.equal(screen.pair.disabled,true);
  screen.background('active');assert.equal(screen.pair.disabled,false);screen.unmount();
});

test('pair cancellation interrupts the session before visual reset', () => {
  let interrupts=0;
  const screen=mount({developmentInput:{ready:true,onDrive(){},onTurn(){},onInterrupt(){interrupts++;}}});
  const reset=screen.pair.resetKey;
  screen.pair.onCancel();assert.equal(interrupts,1);screen.render();assert.ok(screen.pair.resetKey>reset);screen.unmount();
});

test('surface cancellation interrupts even when Android routes cancel to the scroll ancestor', () => {
  let interrupts=0;
  const screen=mount({developmentInput:{ready:true,onDrive(){},onTurn(){},onInterrupt(){interrupts++;}}});
  screen.find('control-surface').props.onTouchCancel();assert.equal(interrupts,1);screen.unmount();
});

test('only the development wrapper owns vertical insets; standalone and production retain all safe-area edges', () => {
  const input={ready:true,onDrive(){},onTurn(){},onInterrupt(){}};
  for(const options of [{},{dev:false,developmentInput:input},{developmentInput:input}]) {
    const screen=mount(options);
    assert.deepEqual([...screen.safeArea.edges],options.developmentInput&&options.dev!==false ? ['left','right'] : ['top','left','right','bottom']);
    screen.unmount();
  }
});

test('joystick layout is editable offline, persists per side and orientation, and resets only that orientation', async () => {
  const saved = [];
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); } });
  await screen.settle();
  const original = JSON.parse(JSON.stringify(screen.pair.layout));
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  assert.equal(screen.pair, undefined, 'editing surface must not mount motion responders');
  screen.joystickSettings.onChange('left', { sizeScale: 1.5, x: .3, y: .8 }); screen.render();
  assert.equal(screen.joystickSettings.layout.left.sizeScale, 1.5);
  screen.joystickSettings.onClose(); screen.render();
  assert.ok(screen.pair.layout.left.size > original.left.size);
  assert.equal(screen.pair.layout.right.size, original.right.size);
  await screen.settle();
  assert.equal(saved.at(-1).landscape.left.x, .3);
  assert.equal(saved.at(-1).portrait.left.sizeScale, 1);
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  screen.joystickSettings.onReset(); screen.render();
  assert.equal(screen.joystickSettings.layout.left.sizeScale, 1.35);
  screen.unmount();
});

test('opening layout editing synchronously cancels input and rejects an old touch callback', () => {
  let sent = 0, interrupted = 0;
  const input = { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { interrupted++; } };
  const screen = mount({ dev: false, ...capableProps(), productionInput: input });
  const oldSample = screen.pair.left.onSample;
  oldSample({ x: .2, y: -.2 }); assert.equal(sent, 1);
  screen.find('control-open-joystick-layout').props.onPress();
  assert.equal(interrupted, 1, 'transport is interrupted before the editor renders');
  oldSample({ x: 1, y: -1 }); assert.equal(sent, 1);
  screen.render(); assert.ok(screen.joystickSettings); assert.equal(screen.pair, undefined);
  screen.unmount();
});

test('slider previews update the layout without storage or motion, then commit once on release', async () => {
  const saved = []; let sent = 0;
  const screen = mount({ dev: false, ...capableProps(), dimensions: { width: 1100, height: 600, fontScale: 1 },
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() {} },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); } });
  await screen.settle();
  const oldSample = screen.pair.left.onSample;
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  for (const sizeScale of [1.1, 1.2, 1.3]) {
    screen.joystickSettings.onPreview('left', { sizeScale }); screen.render();
    assert.equal(screen.joystickSettings.layout.left.sizeScale, sizeScale);
    assert.equal(saved.length, 0, 'continuous moves must not write storage');
    oldSample({ x: 1, y: -1 });
  }
  assert.equal(sent, 0, 'editing must block held control callbacks');
  screen.joystickSettings.onChange('left', { sizeScale: 1.3 }); await screen.settle();
  assert.equal(saved.length, 1); assert.equal(saved[0].landscape.left.sizeScale, 1.3);
  screen.joystickSettings.onClose(); await screen.settle();
  assert.equal(saved.length, 1, 'closing after release must not duplicate the commit');
  screen.unmount();
});

test('closing flushes the latest slider preview and rejects late editor callbacks', async () => {
  const saved = [];
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); } });
  await screen.settle();
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  const oldEditor = screen.joystickSettings;
  oldEditor.onPreview('right', { x: .4, y: .8 }); screen.render();
  assert.equal(saved.length, 0);
  screen.joystickSettings.onClose(); await screen.settle();
  assert.equal(saved.length, 1); assert.equal(saved[0].landscape.right.x, .4);
  oldEditor.onPreview('right', { x: .9 }); oldEditor.onChange('right', { y: .1 });
  oldEditor.onReset(); await screen.settle();
  assert.equal(saved.length, 1, 'a retired editor cannot overwrite persisted placement');
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  assert.equal(screen.joystickSettings.layout.right.x, .4);
  assert.equal(screen.joystickSettings.layout.right.y, .8);
  screen.unmount();
});

test('reset retires slider callbacks before they can overwrite the defaults', async () => {
  const saved = [];
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); } });
  await screen.settle();
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  const heldEditor = screen.joystickSettings;
  heldEditor.onPreview('left', { sizeScale: 1.4, x: .3 }); screen.render();
  heldEditor.onReset();
  // A held finger's queued event can arrive before the reset has rendered.
  heldEditor.onPreview('left', { sizeScale: 1.7, x: .9 });
  heldEditor.onChange('left', { sizeScale: 1.7, x: .9 });
  await screen.settle();
  assert.equal(screen.joystickSettings.layout.left.sizeScale, 1.35);
  assert.equal(screen.joystickSettings.layout.left.x, .08);
  assert.equal(saved.length, 1, 'only the reset is persisted');
  const freshEditor = screen.joystickSettings;
  freshEditor.onPreview('left', { x: .2 }); screen.render();
  assert.equal(screen.joystickSettings.layout.left.x, .2, 'a new gesture may edit the reset layout');
  screen.unmount();
});

test('layout editing blocks physical frames and keys and requires neutral after closing', () => {
  const hardware = physicalFixture(); let sent = 0, interrupted = 0;
  const screen = mount({ dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() {}, onTurn() {}, onSticks() { sent++; }, onInterrupt() { interrupted++; } } });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  screen.find('control-open-joystick-layout').props.onPress();
  hardware.sample({ moving: true, pressed: ['stand'] }); assert.equal(sent, 1);
  screen.render(); hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  screen.joystickSettings.onClose(); screen.render();
  hardware.sample({ moving: true }); assert.equal(sent, 1, 'held physical input cannot cross the edit boundary');
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 2);
  assert.ok(interrupted >= 2); screen.unmount();
});

test('a late preferences read cannot overwrite a layout already edited locally', async () => {
  let finishLoad;
  const pending = new Promise(resolve => { finishLoad = resolve; });
  const screen = mount({ dev: false, layoutLoad: () => pending });
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  screen.joystickSettings.onChange('left', { sizeScale: 1.5 }); screen.render();
  const old = joystickLayoutModule.exports.createDefaultJoystickLayoutPreferences();
  old.portrait.left.sizeScale = .75;
  finishLoad(old); await screen.settle();
  assert.equal(screen.joystickSettings.layout.left.sizeScale, 1.5);
  screen.unmount();
});

test('layout save failure stays visible and a retry preserves the edited value', async () => {
  let attempts = 0;
  const screen = mount({ dev: false, layoutSave: async () => { if (++attempts === 1) throw Error('fixture storage unavailable'); } });
  screen.find('control-open-joystick-layout').props.onPress(); screen.render();
  screen.joystickSettings.onChange('right', { y: .75 }); screen.render(); await screen.settle();
  assert.match(screen.joystickSettings.storageError, /暂未保存/);
  screen.find('joystick-layout-retry').props.onPress(); await screen.settle();
  assert.equal(screen.joystickSettings.storageError, null);
  assert.equal(screen.joystickSettings.layout.right.y, .75);
  screen.unmount();
});

test('landscape removes the crossed policy row and only shows actionable feedback', () => {
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    controlSession: { label: '未连接', canAcquire: false, leaseActive: false, busy: false, onAcquire() {}, onRelease() {} } });
  assert.equal(screen.find('control-policy-strip'), undefined);
  assert.equal(screen.find('control-action-switchPolicy'), undefined);
  assert.equal(screen.find('control-terrain-mode'), undefined);
  assert.equal(screen.find('control-operation-feedback'), undefined);
  assert.doesNotMatch(screen.copy, /策略未同步|控制链未连接/);
  screen.render({ controlSession: { label: '未连接', error: '停止请求未确认', canAcquire: false, leaseActive: false, busy: false, onAcquire() {}, onRelease() {} } });
  assert.ok(screen.find('control-operation-feedback'));
  assert.match(screen.copy, /停止请求未确认/);
  screen.unmount();
});

test('portrait bottom placement reserves the complete scaled label below the disc', () => {
  for (const fontScale of [1, 1.5, 2]) {
    const screen = mount({ dev: false, dimensions: { width: 430, height: 900, fontScale } });
    screen.find('control-open-joystick-layout').props.onPress(); screen.render();
    screen.joystickSettings.onChange('left', { y: 1 }); screen.render();
    screen.joystickSettings.onClose(); screen.render();
    const disc = screen.pair.layout.left;
    assert.ok(disc.top + disc.size + 10 + 24 * fontScale <= screen.pair.touchAreaHeight,
      `disc label must stay inside the touch area at fontScale=${fontScale}`);
    screen.unmount();
  }
});

test('one motor switch follows observed state through confirmation, ACK and the reverse action', async () => {
  let enables = 0, disables = 0;
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor: async () => { enables++; }, disableMotor: async () => { disables++; } } });
  assert.equal(screen.find('control-action-enableMotor'), undefined);
  assert.equal(screen.find('control-action-disableMotor'), undefined);
  const original = screen.find('control-motor-toggle');
  assert.equal(original.props.accessibilityState.checked, false);
  assert.equal(original.props.disabled, false, 'dark represents observed off, not an unavailable action');
  assert.equal(screen.find('control-motor-toggle-circle').props.style[1].backgroundColor, '#111827');
  original.props.onPress(); original.props.onPress(); screen.render();
  assert.equal(enables, 0, 'opening a confirmation must not operate the device');
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, false);
  const enableConfirm = screen.find('control-immersive-confirm').props.onPress;
  enableConfirm(); enableConfirm(); await screen.settle();
  assert.equal(enables, 1); assert.equal(disables, 0);
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, false, 'ACK is not observed enabled state');
  assert.equal(screen.find('control-motor-toggle').props.disabled, true);
  assert.ok(screen.find('control-operation-feedback'));
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'enabled' } });
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, true);
  assert.equal(screen.find('control-motor-toggle-circle').props.style[1].backgroundColor, '#98D1FF');
  assert.equal(screen.find('control-operation-feedback'), undefined, 'an observed terminal state ends pending feedback');
  original.props.onPress(); enableConfirm(); screen.render();
  assert.equal(enables, 1, 'old press and confirmation cannot cross the observed state change');
  screen.find('control-motor-toggle').props.onPress(); screen.render();
  assert.match(screen.copy, /确认\s*失能电机/);
  screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
  assert.equal(disables, 1);
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, true, 'disable ACK alone cannot paint off');
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'disabled' } });
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, false);
  assert.equal(screen.find('control-motor-toggle').props.disabled, false);
  screen.unmount();
});

test('motor switch remains unknown for missing/disconnected state and respects the target permission', () => {
  let actions = 0;
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor() { actions++; }, disableMotor() { actions++; } } });
  for (const runtimeState of [undefined, { controlLink: 'connected', motorState: 'unknown' }, { controlLink: 'disconnected', motorState: 'enabled' }]) {
    screen.render({ runtimeState });
    const toggle = screen.find('control-motor-toggle');
    assert.equal(toggle.props.disabled, true); assert.equal(toggle.props.accessibilityState.checked, undefined);
    assert.equal(toggle.props.accessibilityValue.text, '状态未知'); toggle.props.onPress();
  }
  assert.equal(actions, 0);
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'enabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: false, blockedReason: '执行器未就绪' } } });
  const toggle = screen.find('control-motor-toggle');
  assert.equal(toggle.props.disabled, true); assert.equal(toggle.props.accessibilityState.checked, true);
  toggle.props.onPress(); assert.equal(actions, 0, 'enabled state cannot bypass disable readiness');
  screen.unmount();
});

test('observed motor change cancels an open confirmation without dispatching the opposite action', () => {
  let actions = 0;
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor() { actions++; }, disableMotor() { actions++; } } });
  screen.find('control-motor-toggle').props.onPress(); screen.render();
  const previousConfirm = screen.find('control-immersive-confirm').props.onPress;
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'enabled' } });
  assert.equal(screen.find('control-immersive-confirm'), undefined);
  previousConfirm(); screen.render(); assert.equal(actions, 0);
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, true);
  screen.unmount();
});

test('a rejected motor operation keeps observed off and exposes failure after removing the policy strip', async () => {
  const screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true } },
    operationCallbacks: { enableMotor: async () => { throw Error('fixture denied'); } } });
  screen.find('control-motor-toggle').props.onPress(); screen.render();
  screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
  assert.equal(screen.find('control-policy-strip'), undefined);
  assert.equal(screen.find('control-motor-toggle').props.accessibilityState.checked, false);
  assert.ok(screen.find('control-operation-feedback'));
  assert.match(screen.copy, /未能确认操作结果/);
  assert.doesNotMatch(screen.copy, /fixture denied|已使能/);
  screen.unmount();
});

test('video HUD forwards the actual media surface without granting motion or inventing telemetry', () => {
  let sent = 0, acquired = 0, interrupted = 0;
  const video = { phase: 'connecting', id: 'fixture-camera' };
  const videoSurface = { type: 'FixtureVideo', props: {} };
  const screen = mount({ dev: false, dimensions: { width: 753, height: 471, fontScale: 1 }, video, videoSurface,
    productionInput: { ready: false, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { interrupted++; } },
    controlSession: { label: '未连接', canAcquire: false, leaseActive: false, busy: false,
      onAcquire() { acquired++; }, onRelease() {} } });
  assert.ok(screen.videoStage);
  assert.equal(screen.videoStage.presentation, video);
  assert.equal(screen.videoStage.surface, videoSurface);
  assert.equal(screen.videoStage.active, true);
  assert.equal(screen.pair.variant, 'glass');
  assert.equal(screen.pair.right.label, '转向');
  assert.equal(screen.pair.disabled, true);
  screen.pair.left.onSample({ x: 1, y: -1 }); screen.pair.right.onSample({ x: 1, y: 0 });
  assert.equal(sent, 0); assert.equal(acquired, 0);
  assert.doesNotMatch(screen.copy, /0\.8\s*m\/s|78%|信号强|图传已连接/);
  const before = interrupted;
  screen.videoStage.onInterrupted();
  assert.equal(interrupted, before + 1);
  screen.background();
  assert.equal(screen.videoStage.active, false);
  screen.background('active');
  assert.equal(screen.videoStage.active, true);
  assert.equal(screen.pair.disabled, true);
  assert.equal(sent, 0); assert.equal(acquired, 0);
  screen.unmount();
});

test('video HUD loss retires the old touch context and recovery does not replay it', () => {
  let sent = 0;
  const screen = mount({ dev: false, dimensions: { width: 1250, height: 650, fontScale: 1 },
    ...capableProps(), video: { phase: 'receiving', id: 'fixture-camera' },
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() {} } });
  const held = screen.pair.left.onSample;
  held({ x: .2, y: -.2 }); assert.equal(sent, 1);
  screen.videoStage.onInterrupted();
  held({ x: .3, y: -.3 }); assert.equal(sent, 1);
  screen.render({ video: { phase: 'receiving', id: 'fixture-camera-reconnected' } });
  held({ x: .3, y: -.3 }); assert.equal(sent, 1);
  assert.equal(screen.pair.right.label, '转向');
  screen.unmount();
});

test('video HUD keeps an offline connection entry and three unknown metrics at narrow and wide sizes', () => {
  for (const dimensions of [{ width: 753, height: 471, fontScale: 1 }, { width: 1250, height: 650, fontScale: 1 }]) {
    let opened = 0;
    const screen = mount({ dev: false, dimensions, onOpenConnection() { opened++; } });
    assert.ok(screen.videoStage);
    assert.equal(screen.videoStage.presentation, undefined);
    for (const id of ['speed', 'battery', 'signal']) assert.ok(screen.find(`control-telemetry-${id}`));
    assert.match(screen.copy, /未连接/);
    assert.match(screen.copy, /—/);
    assert.ok(screen.find('control-action-stop'));
    assert.ok(screen.find('control-action-stand'));
    assert.ok(screen.find('control-action-sit'));
    assert.ok(screen.find('control-motor-toggle'));
    screen.find('control-open-connection').props.onPress(); assert.equal(opened, 1);
    assert.equal(screen.pair.disabled, true);
    screen.unmount();
  }
});

test('video HUD only displays measured speed and identified telemetry sources', () => {
  const screen = mount({ dev: false, dimensions: { width: 1250, height: 650, fontScale: 1 },
    runtimeState: {
      speed: { linearMps: .8, lateralMps: 0, yawRps: 0, source: 'command' },
      signal: { qualityPercent: 78, source: 'unknown' }, battery: { percent: null, voltageV: 48.1, source: 'unknown' },
    } });
  assert.doesNotMatch(screen.copy, /0\.8\s*m\/s|78%|48\.1\s*V/);
  screen.render({ runtimeState: {
    speed: { linearMps: .2, lateralMps: 0, yawRps: 0, source: 'device' },
    signal: { qualityPercent: 71, source: 'controller' }, battery: { percent: null, voltageV: 48.1, source: 'device' },
  } });
  assert.match(screen.copy, /0\.2\s*m\/s/); assert.match(screen.copy, /71%/); assert.match(screen.copy, /48\.1\s*V/);
  assert.equal(screen.pair.disabled, true, 'receiving telemetry is not an actuator permission');
  screen.unmount();
});
