import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';
import { beginRobotRecovery, presentRobotRecovery } from '../src/features/control/robotRecovery.ts';

function validateLingtuOriginForTest(value, allowLocalHttp = false) {
  const url = new URL(String(value).trim());
  if (url.protocol === 'https:') return url.origin;
  if (allowLocalHttp && url.protocol === 'http:') return url.origin;
  throw new Error('config');
}

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
const controlPrefsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/control/controlPreferences.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: controlPrefsModule,
  exports: controlPrefsModule.exports,
  setTimeout,
  clearTimeout,
});
const controlHudModelModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/controlHudModel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: controlHudModelModule, exports: controlHudModelModule.exports });
const gestureAssetsStub = {
  gesturePreviews: new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' ? { uri: `asset://gestures/${prop}.gif` } : undefined),
  }),
};
const gesturePreviewAssetsStub = {
  GESTURE_PREVIEW_ASSETS: gestureAssetsStub.gesturePreviews,
  getGesturePreviewAsset: key => (typeof key === 'string' ? { uri: `asset://gestures/${key}.gif` } : undefined),
};
const standbyScenesStub = {
  DEFAULT_STANDBY_SCENE: 'forest',
  STANDBY_SCENES: [
    { id: 'forest', label: '迷雾森林', shortLabel: '森林', source: { uri: 'asset://scene/cockpit-standby-forest.jpg' } },
    { id: 'charcoal', label: '炭灰影棚', shortLabel: '影棚', source: { uri: 'asset://scene/cockpit-standby-charcoal.jpg' } },
    { id: 'gallery', label: '建筑展厅', shortLabel: '展厅', source: { uri: 'asset://scene/cockpit-standby-gallery.jpg' } },
    { id: 'hangar', label: '星际舱室', shortLabel: '舱室', source: { uri: 'asset://scene/cockpit-standby-hangar.jpg' } },
  ],
  normalizeStandbyScene: v => (v === 'charcoal' || v === 'gallery' || v === 'hangar' || v === 'forest' ? v : 'forest'),
  getStandbySceneSpec: v => standbyScenesStub.STANDBY_SCENES.find(s => s.id === (v === 'charcoal' || v === 'gallery' || v === 'hangar' || v === 'forest' ? v : 'forest')),
  getStandbySceneAsset: v => ({ uri: `asset://scene/cockpit-standby-${v === 'charcoal' || v === 'gallery' || v === 'hangar' || v === 'forest' ? v : 'forest'}.jpg` }),
};
const hudAnimatedStub = {
  Value: class { setValue() { } interpolate() { return 0; } },
  View: 'AnimatedView',
  timing: () => ({ start(cb) { cb?.({ finished: true }); }, stop() { } }),
  spring: () => ({ start(cb) { cb?.({ finished: true }); }, stop() { } }),
  loop: () => ({ start() { }, stop() { } }),
  sequence: () => ({ start() { }, stop() { } }),
  delay: () => ({ start() { }, stop() { } }),
};
const hudComponentDependencies = {
  react: { useEffect() { }, useRef: v => ({ current: v }), useState: v => [typeof v === 'function' ? v() : v, () => { }] },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-native': { Animated: hudAnimatedStub, Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' }, hairlineWidth: 1 }, View: 'View' },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '../assets': gestureAssetsStub,
  './gesturePreviewAssets': gesturePreviewAssetsStub,
  './standbyScenes': standbyScenesStub,
  './StandbyScene3D': { StandbyScene3D: 'StandbyScene3D' },
  './AppText': { Text: 'Text' },
  './ControlSlider': { ControlSlider: 'ControlSlider' },
  './controlHudModel': controlHudModelModule.exports,
  '../officialPalette': { officialDark: { cta: '#F0F4FE', ctaInk: '#1C1C1B', ink: '#E8E8E6', muted: '#A0A09B' } },
};
const controlHudDashboardModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/ControlHudDashboard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: controlHudDashboardModule,
  exports: controlHudDashboardModule.exports,
  require: name => {
    if (name in hudComponentDependencies) return hudComponentDependencies[name];
    throw new Error(`Unexpected ControlHudDashboard dependency: ${name}`);
  },
});
const controlHudPanelsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/ControlHudPanels.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: controlHudPanelsModule,
  exports: controlHudPanelsModule.exports,
  require: name => {
    if (name in hudComponentDependencies) return hudComponentDependencies[name];
    throw new Error(`Unexpected ControlHudPanels dependency: ${name}`);
  },
});
const landscapeHudModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/controlLandscapeHud.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: landscapeHudModule,
  exports: landscapeHudModule.exports,
  require(name) {
    if (name in hudComponentDependencies) return hudComponentDependencies[name];
    if (name === './ControlHudDashboard') return controlHudDashboardModule.exports;
    if (name === './ControlHudPanels') return controlHudPanelsModule.exports;
    throw new Error(`Unexpected landscape HUD dependency: ${name}`);
  },
});

const controlMediaModelModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/video/controlMediaModel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: controlMediaModelModule, exports: controlMediaModelModule.exports });

const controlMediaCaptureWebModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/video/controlMediaCapture.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: controlMediaCaptureWebModule,
  exports: controlMediaCaptureWebModule.exports,
  Blob: globalThis.Blob,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  require(name) {
    if (name === './controlMediaModel.ts' || name === './controlMediaModel') return controlMediaModelModule.exports;
    throw new Error(`Unexpected controlMediaCapture dependency: ${name}`);
  },
});

const recoveryPanelModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/RobotRecoveryControls.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: recoveryPanelModule,
  exports: recoveryPanelModule.exports,
  require(name) {
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (name === 'react-native') return { Pressable: 'Pressable', StyleSheet: { create: value => value }, View: 'View' };
    if (name === './AppText') return { Text: 'Text' };
    throw new Error(`Unexpected recovery panel dependency: ${name}`);
  },
});

const colors = {
  authFocus: '#0066FF', authPrimary: '#0066FF', background: '#FFFFFF', ink: '#111827',
  inkSoft: '#344054', line: '#D0D5DD', muted: '#667085', surfaceStrong: '#EAECF0',
  surface: '#F4F7FA', successText: '#2F6AA3',
};

const compiledReferenceUi = ts.transpileModule(readFileSync(new URL('../src/components/ControlReferenceUi.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledMediaCaptureHook = ts.transpileModule(readFileSync(new URL('../src/features/video/useControlMediaCapture.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledLingtuVoiceService = ts.transpileModule(readFileSync(new URL('../src/services/lingtuVoiceChat.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledVoiceHook = ts.transpileModule(readFileSync(new URL('../src/features/control/useRobotVoiceChat.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledVoicePanel = ts.transpileModule(readFileSync(new URL('../src/components/ControlVoiceChatPanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledStatusBento = ts.transpileModule(readFileSync(new URL('../src/components/StatusBentoCard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Executes the real ControlScreen state, handlers and lifecycle effects. The joystick
// responder math and native layout have their own focused tests; this harness invokes
// the real child props that ControlScreen supplies to the joystick pair.
function mount({ dev = true, initialAppState = 'active', dimensions = { fontScale: 1, height: 844, width: 390 }, layoutLoad = async () => joystickLayoutModule.exports.createDefaultJoystickLayoutPreferences(), layoutSave = async () => { }, navigationInset = async () => 0, voiceFetch = async () => ({ status: 503, json: async () => ({ error: 'unavailable' }) }), ...overrides } = {}) {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const appStateListeners = new Set();
  const navigationCalls = [];
  const timers = new Map();
  const intervals = new Set();
  const keepAwakeCalls = [];
  const hapticCalls = [];
  const audioCalls = [];
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
  const ControlJoystickPair = function ControlJoystickPair() { };
  const ControlVideoSurface = function ControlVideoSurface() { };
  const JoystickLayoutSettings = function JoystickLayoutSettings() { };
  const host = {
    AccessibilityInfo: { isReduceMotionEnabled: async () => true },
    Animated: {
      Value: class { setValue() { } interpolate() { return 0; } }, View: 'AnimatedView',
      timing: () => ({ start() { }, stop() { } })
    },
    Easing: { quad: value => value, out: value => value },
    AppState: {
      currentState: initialAppState,
      addEventListener(_event, listener) {
        appStateListeners.add(listener);
        return { remove: () => appStateListeners.delete(listener) };
      },
    },
    Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View',
    Platform: { OS: 'ios' },
    StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' }, hairlineWidth: 1 },
    useWindowDimensions: () => viewport,
  };
  const standbyDriveEvents = [];
  let standbyDriveCurrent = { driveX: 0, driveY: 0, turnX: 0 };
  const standbyDriveBusStub = {
    publishStandbyDriveInput: (driveX, driveY, turnX) => {
      standbyDriveCurrent = { driveX, driveY, turnX };
      standbyDriveEvents.push(standbyDriveCurrent);
    },
    resetStandbyDriveInput: () => {
      standbyDriveCurrent = { driveX: 0, driveY: 0, turnX: 0 };
      standbyDriveEvents.push(standbyDriveCurrent);
    },
    getStandbyDriveInput: () => standbyDriveCurrent,
    subscribeStandbyDriveInput: () => () => { },
  };
  const dependencies = {
    '../components/standby3d/standbyDriveBus': standbyDriveBusStub,
    '../features/control/useControlRobotVideo': { useControlRobotVideo: () => ({}) },
    '../features/app-update/androidApkUpdater': {
      checkAndroidApkUpdate: async () => null,
      formatAppUpdateStatus: () => ({ statusLabel: '已是最新', actionLabel: '下载更新' }),
    },
    '../features/app-update/appVersion': {
      formatInstalledAppVersionLabel: () => 'v0.1.0',
    },
    '../features/app-update/promptAppUpdate': {
      checkAndPromptAppUpdate: async () => { },
      openApkDownload: async () => { },
    },
    '../features/control/useKeepScreenAwake': { useKeepScreenAwake: active => { keepAwakeCalls.push(Boolean(active)); } },
    '../utils/haptics': { triggerControlHaptic: kind => { hapticCalls.push(kind); } },
    '../features/video/controlMediaModel': controlMediaModelModule.exports,
    '../components/DepthSnapshotView': { DepthSnapshotView: 'DepthSnapshotView' },
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '../components/ControlSetupSurface': { ControlSetupBackground: 'ControlSetupBackground', ControlSetupPage: 'ControlSetupPage', controlSetupColors: {}, controlSetupAppearance: {} },
    'react-native': host,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '../components/ControlPanelMotion': { ControlPanelMotion: 'ControlPanelMotion' },
    './ControlPanelMotion': { ControlPanelMotion: 'ControlPanelMotion' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }), SafeAreaView: 'SafeAreaView' },
    '../components/ControlJoystick': { ControlJoystickPair },
    '../components/standby3d/standbyDriveBus': standbyDriveBusStub,
    '../components/ControlHudPanels': controlHudPanelsModule.exports,
    '../components/controlLandscapeHud': landscapeHudModule.exports,
    '../components/controlHudModel': controlHudModelModule.exports,
    '../assets': gestureAssetsStub,
    '../components/RobotRecoveryControls': recoveryPanelModule.exports,
    '../features/control/robotRecovery': { beginRobotRecovery, presentRobotRecovery },
    '../components/ControlVideoSurface': { ControlVideoSurface },
    '../components/ControlGlass': {
      ControlGlassTarget: 'GlassTarget', useControlGlass: () => ({
        target: { current: null }, canvas: '#F9F9FB', surface: 'rgba(255,255,255,0.86)', ink: '#1C2024', muted: '#60646C',
        border: 'rgba(255,255,255,0.78)', backdrop: () => ({ type: 'BlurBackdrop', props: { pointerEvents: 'none' } }),
      })
    },
    '../components/JoystickLayoutSettings': { JoystickLayoutSettings },
    '../features/control/joystickLayoutPreferences': {
      ...joystickLayoutModule.exports,
      loadJoystickLayoutPreferences: layoutLoad, saveJoystickLayoutPreferences: layoutSave
    },
    '../components/G20InputPanel': { G20InputPanel: 'G20InputPanel' },
    '../features/control/g20InputModel': g20Module.exports,
    '../features/control/controlPreferences': {
      ...controlPrefsModule.exports,
      loadControlPreferences: async () => controlPrefsModule.exports.createDefaultControlPreferences(),
      saveControlPreferences: async () => { },
      estimateClientStorageGb: async () => ({ usedGb: 1.2, totalGb: 32 }),
    },
    '../components/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '../appearance': { getProductAppearance: () => ({ canvas: '#FFFFFF', ink: '#111827', secondary: '#667085', raised: '#FFFFFF', surface: colors.surface, action: '#98D1FF', actionInk: '#17354D', blueInk: '#214F71' }) },
    '../typography': { typography: { compactTitle: {}, label: {}, caption: {} } },
    '../theme': { useAppTheme: () => ({ colors, isDark: false }) },
    './controlLayout': layoutModule.exports,
    '../features/control/controlOperations': operationsModule.exports,
    '../services/brainstemIntegrationReadiness': {
      getBrainstemIntegrationReadiness: () => ({
        gates: [], readOnlyReady: false, controlReady: false,
        readOnlyLabel: '只读状态未就绪', controlLabel: '真实控制保持锁定',
        controlBlockedReason: '测试夹具：控制门禁保持锁定。',
      })
    },
    '../services/brainstemGrpc': {
      setControlNavigationHidden: hidden => {
        navigationCalls.push(hidden); return Promise.resolve(navigationInset(hidden));
      },
      isNativeVoiceInputAvailable: async () => false,
      recognizeNativeVoiceOnce: async () => '',
      speakNativeVoiceText: async (text, volume) => { audioCalls.push({ kind: 'speak', text, volume }); return false; },
      playNativeFeedbackTone: async volume => { audioCalls.push({ kind: 'tone', volume }); return true; },
      stopNativeVoiceSpeech: () => { },
    },
  };
  const referenceUi = { exports: {} };
  vm.runInNewContext(compiledReferenceUi, {
    module: referenceUi,
    exports: referenceUi.exports,
    require: name => name === './AppText'
      ? { Text: 'Text', TextInput: 'TextInput' }
      : name === './ControlHudPanels'
        ? controlHudPanelsModule.exports
        : name === './controlHudModel'
          ? controlHudModelModule.exports
          : name === './standbyScenes'
            ? standbyScenesStub
            : name === './FsdMotionPrimitives'
              ? { FsdSegmentedControl: 'FsdSegmentedControl', FsdSwitch: 'FsdSwitch', FsdDetentSlider: 'FsdDetentSlider', FsdSheetMotion: 'FsdSheetMotion', FsdTabReveal: 'FsdTabReveal', FsdRadarPulse: 'FsdRadarPulse', triggerFsdLayoutSpring() { } }
              : name === '../screens/WifiDiscoveryPanel'
                ? { WifiDiscoveryPanel: 'WifiDiscoveryPanel' }
                : dependencies[name],
  });
  dependencies['../components/ControlReferenceUi'] = referenceUi.exports;

  const mediaCaptureHookModule = { exports: {} };
  vm.runInNewContext(compiledMediaCaptureHook, {
    module: mediaCaptureHookModule,
    exports: mediaCaptureHookModule.exports,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(callback, delay) {
      const id = ++timerId;
      intervals.add(id);
      const step = () => {
        if (!intervals.has(id) || unmounted) return;
        callback();
        if (intervals.has(id) && !unmounted) timers.set(id, { callback: step, due: now + delay });
      };
      timers.set(id, { callback: step, due: now + delay });
      return id;
    },
    clearInterval: id => { intervals.delete(id); timers.delete(id); },
    require(name) {
      if (name === 'react') return react;
      if (name === './controlMediaModel.ts' || name === './controlMediaModel') return controlMediaModelModule.exports;
      if (name === './controlMediaCapture.ts' || name === './controlMediaCapture') return controlMediaCaptureWebModule.exports;
      throw new Error(`Unexpected useControlMediaCapture dependency: ${name}`);
    },
  });
  dependencies['../features/video/useControlMediaCapture'] = mediaCaptureHookModule.exports;

  const schedSetTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; };
  const schedClearTimeout = id => timers.delete(id);
  const schedSetInterval = (callback, delay) => {
    const id = ++timerId;
    intervals.add(id);
    const step = () => {
      if (!intervals.has(id) || unmounted) return;
      callback();
      if (intervals.has(id) && !unmounted) timers.set(id, { callback: step, due: now + delay });
    };
    timers.set(id, { callback: step, due: now + delay });
    return id;
  };
  const schedClearInterval = id => { intervals.delete(id); timers.delete(id); };

  const lingtuVoiceServiceModule = { exports: {} };
  vm.runInNewContext(compiledLingtuVoiceService, {
    module: lingtuVoiceServiceModule,
    exports: lingtuVoiceServiceModule.exports,
    __DEV__: dev,
    URL,
    AbortController,
    fetch: voiceFetch,
    setTimeout: schedSetTimeout,
    clearTimeout: schedClearTimeout,
    require(name) {
      if (name === 'react-native') return host;
      if (name === './brainstemGrpc') return dependencies['../services/brainstemGrpc'];
      if (name === './brainstemWebDevBridge') return { resolveWebDevBridgeOrigin: () => 'http://127.0.0.1:8121' };
      if (name === './lingtuReadOnly') return { validateLingtuOrigin: validateLingtuOriginForTest };
      throw new Error(`Unexpected lingtuVoiceChat dependency: ${name}`);
    },
  });

  const voiceHookModule = { exports: {} };
  vm.runInNewContext(compiledVoiceHook, {
    module: voiceHookModule,
    exports: voiceHookModule.exports,
    AbortController,
    setTimeout: schedSetTimeout,
    clearTimeout: schedClearTimeout,
    setInterval: schedSetInterval,
    clearInterval: schedClearInterval,
    require(name) {
      if (name === 'react') return react;
      if (name === '../../services/lingtuVoiceChat') return lingtuVoiceServiceModule.exports;
      throw new Error(`Unexpected useRobotVoiceChat dependency: ${name}`);
    },
  });
  dependencies['../features/control/useRobotVoiceChat'] = voiceHookModule.exports;

  const voicePanelModule = { exports: {} };
  vm.runInNewContext(compiledVoicePanel, {
    module: voicePanelModule,
    exports: voicePanelModule.exports,
    setTimeout: schedSetTimeout,
    clearTimeout: schedClearTimeout,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === './AppText') return { Text: 'Text', TextInput: 'TextInput' };
      throw new Error(`Unexpected ControlVoiceChatPanel dependency: ${name}`);
    },
  });
  dependencies['../components/ControlVoiceChatPanel'] = voicePanelModule.exports;

  const bentoSlots = [];
  let bentoCursor = 0;
  const bentoReact = {
    useState(initial) {
      const index = bentoCursor++;
      if (!(index in bentoSlots)) bentoSlots[index] = typeof initial === 'function' ? initial() : initial;
      return [bentoSlots[index], value => {
        const next = typeof value === 'function' ? value(bentoSlots[index]) : value;
        if (!Object.is(next, bentoSlots[index])) {
          bentoSlots[index] = next;
          dirty = true;
        }
      }];
    },
  };
  const statusBentoModule = { exports: {} };
  vm.runInNewContext(compiledStatusBento, {
    module: statusBentoModule,
    exports: statusBentoModule.exports,
    require(name) {
      if (name === 'react') return bentoReact;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return { ...host, Modal: 'Modal' };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === './AppText') return { Text: 'Text', TextInput: 'TextInput' };
      if (name === '../../assets/scene/thunder-r44-top.png') return { uri: 'asset://scene/thunder-r44-top.png' };
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected StatusBentoCard dependency: ${name}`);
    },
  });
  dependencies['../components/StatusBentoCard'] = statusBentoModule.exports;

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
      bentoCursor = 0;
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
        if (node.type === statusBentoModule.exports.StatusBentoCard) {
          walk(statusBentoModule.exports.StatusBentoCard(node.props ?? {}));
          return;
        }
        nodes.push(node);
        walk(node.props?.header);
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
    get keepAwakeCalls() { return keepAwakeCalls; },
    get hapticCalls() { return hapticCalls; },
    get audioCalls() { return audioCalls; },
    get standbyDrive() { return standbyDriveCurrent; },
    get copy() {
      return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' ').replace(/\s+/g, ' ').trim();
    },
    get pair() { return nodes.find(node => node.type === ControlJoystickPair)?.props; },
    get pairKey() { return nodes.find(node => node.type === ControlJoystickPair)?.key; },
    get videoStage() { return nodes.find(node => node.type === ControlVideoSurface)?.props; },
    get joystickSettings() { return nodes.find(node => node.type === JoystickLayoutSettings)?.props; },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        let nextEntry = null;
        for (const entry of timers) {
          if (entry[1].due <= target && (!nextEntry || entry[1].due < nextEntry[1].due)) nextEntry = entry;
        }
        if (!nextEntry) break;
        const [id, timer] = nextEntry;
        now = Math.max(now, timer.due);
        timers.delete(id);
        timer.callback();
      }
      now = target;
      if (!unmounted) render();
    },
    get timerCount() { return timers.size; },
    get lateUpdates() { return lateUpdates; },
    get scroll() { return nodes.find(node => node.type === 'ScrollView' && !node.props.horizontal)?.props; },
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

test('landscape shows the current control owner without guessing', () => {
  const screen = mount({ dev: false, dimensions: { fontScale: 1, width: 800, height: 480 } });
  for (const [owner, label] of [['none', '无人控制'], ['this-device', '本设备控制'],
  ['remote', '远程控制中'], ['robot-remote', '机器人侧遥控中'], ['unknown', '控制状态未知']]) {
    screen.render({ connected: true, runtimeState: { controlLink: 'connected', controlOwner: owner } });
    assert.equal(screen.find('control-owner').props.accessibilityLabel, label);
    assert.ok(screen.find('control-open-connection').props.accessibilityLabel.includes(label));
  }
  screen.unmount();
});

function openSettings(screen, id) {
  if (id === 'control-open-policy' && screen.find('control-mode-menu')) {
    screen.find('control-mode-dismiss').props.onPress(); screen.render(); return;
  }
  const more = screen.find('control-open-more');
  if (more && !screen.find(id)) { more.props.onPress(); screen.render(); }
  for (const tab of ['操控', '机器狗维护', '连接与设备', '图传与音频', '关于与隐私']) {
    if (!screen.find(id) && screen.find(`control-settings-tab-${tab}`)) {
      screen.find(`control-settings-tab-${tab}`).props.onPress();
      screen.render();
    }
  }
  assert.ok(screen.find(id), `missing settings action ${id}`);
  screen.find(id).props.onPress();
}

function motorToggle(screen) {
  if (!screen.find('control-motor-toggle')) { openSettings(screen, 'control-open-gestures'); screen.render(); }
  return screen.find('control-motor-toggle');
}

function physicalFixture() {
  const subscribers = new Set();
  let sequence = 0;
  let fresh = true;
  let fenceAt = 0;
  const controller = {
    state: {
      reading: true, calibrated: true, calibrating: false, available: true, status: 'reading',
      message: null, sample: { channels: Array(16).fill(1500), configurationReady: true }, axes: {}, buttons: {}, vector: null
    },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    isFresh() { return fresh; }, start() { }, observe() { }, stop() { }, beginCalibration() { }, learnAxis() { }, learnButton() { },
    captureFence() { return fenceAt; },
    finishCalibration() { }, clearCalibration() { },
  };
  return {
    controller, setFresh(value) { fresh = value; }, setFence(value) { fenceAt = value; }, invalidate() { for (const listener of subscribers) listener({ sample: null, frame: null }); },
    sample({ moving = false, pressed = [], requestedAt = 1000 } = {}) {
      const sample = { generation: 1, sequence: ++sequence, requestStartedAtMonotonicMs: requestedAt };
      const frame = {
        vector: { leftX: moving ? .5 : 0, leftY: moving ? -.5 : 0, rightX: moving ? -.2 : 0, rightY: 0 },
        pressed, neutral: !moving && pressed.length === 0
      };
      for (const listener of subscribers) listener({ sample, frame });
    }
  };
}

test('offline touch preview never dispatches and is retired before live control', () => {
  const calls = [];
  const input = {
    ready: true, touchReady: true, onTouchBegin() { calls.push('begin'); },
    onTouchEnd() { calls.push('end'); }, onDrive() { calls.push('drive'); },
    onTurn() { calls.push('turn'); }, onInterrupt() { calls.push('interrupt'); }
  };
  const screen = mount({ dev: false, connected: false, runtimeState: { controlLink: 'disconnected' }, productionInput: input });
  const preview = screen.pair, previewKey = screen.pairKey;
  assert.equal(preview.disabled, false);
  assert.equal(preview.left.onSample, undefined); assert.equal(preview.right.onSample, undefined);
  preview.left.onActiveChange(true); preview.left.onChange({ x: 1, y: 1 });
  preview.right.onActiveChange(true); preview.right.onChange({ x: 1, y: 0 });
  preview.left.onActiveChange(false); preview.right.onActiveChange(false); preview.onCancel();
  assert.deepEqual(calls, []);
  screen.render({ connected: true, runtimeState: { controlLink: 'connected' } });
  assert.notEqual(screen.pairKey, previewKey, 'a held preview must not survive connection');
  preview.left.onChange({ x: 1, y: 1 }); preview.left.onActiveChange(true); preview.onCancel();
  assert.deepEqual(calls, []);
  const live = screen.pair;
  live.left.onActiveChange(true); live.left.onSample({ x: .2, y: 0 });
  assert.deepEqual(calls, ['begin', 'drive']);
  screen.render({ connected: false, runtimeState: { controlLink: 'disconnected' } });
  live.left.onSample({ x: 1, y: 0 }); live.left.onActiveChange(true);
  assert.deepEqual(calls, ['begin', 'drive'], 'stale live input must not resume offline');
  screen.unmount();
});

test('disconnected preview cannot choose a real executor when a debug simulator is also present', () => {
  let sent = 0;
  const input = {
    ready: true, touchReady: true, onTouchBegin() { sent++; }, onDrive() { sent++; },
    onTurn() { sent++; }, onInterrupt() { }
  };
  const simulation = { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } };
  const screen = mount({
    dev: true, connected: false, runtimeState: { controlLink: 'disconnected' },
    productionInput: input, developmentInput: simulation
  });
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  screen.pair.left.onActiveChange(true); screen.pair.left.onChange({ x: 1, y: 1 });
  assert.equal(sent, 0);
  screen.unmount();
});

test('contradictory connection states cannot grant movement', () => {
  let sent = 0;
  const input = {
    ready: true, touchReady: true, onTouchBegin() { sent++; },
    onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { }
  };
  for (const state of [{ connected: false, controlLink: 'connected' }, { connected: true, controlLink: 'disconnected' }]) {
    const screen = mount({ dev: false, connected: state.connected, runtimeState: { controlLink: state.controlLink }, productionInput: input });
    assert.equal(screen.pair.disabled, true);
    screen.pair.left.onActiveChange(true); screen.pair.left.onChange({ x: 1, y: 1 });
    assert.equal(sent, 0);
    screen.unmount();
  }
});

test('settings menu cancels touch, blocks old input and keeps the stop action available', async () => {
  let sent = 0, interrupted = 0, stops = 0, sits = 0;
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, ...capableProps(),
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { }, onInterrupt() { interrupted++; } },
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing' },
    operationReadiness: { stop: { ready: true }, sit: { ready: true } },
    operationCallbacks: { stop: async () => { stops++; }, sit: async () => { sits++; } },
  });
  const oldInput = screen.pair.left.onSample;
  oldInput({ x: .2, y: 0 }); assert.equal(sent, 1);
  screen.find('control-open-more').props.onPress();
  oldInput({ x: 1, y: 0 }); assert.equal(sent, 1);
  screen.render();
  assert.ok(screen.find('control-settings-menu')); assert.equal(screen.pair.disabled, true);
  assert.ok(screen.find('control-immersive-surface').props.children.includes(screen.find('control-settings-menu')));
  assert.ok(interrupted > 0); assert.equal(screen.find('control-action-sit'), undefined);
  assert.equal(screen.find('control-action-stop').props.disabled, false);
  screen.find('control-action-stop').props.onPress(); await screen.settle();
  assert.equal(stops, 1); assert.equal(sits, 0); assert.equal(screen.find('control-settings-menu'), undefined);
  screen.unmount();
});

test('layout editor keeps the shared stop action operational', async () => {
  let stops = 0;
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 },
    runtimeState: { controlLink: 'connected' }, operationReadiness: { stop: { ready: true } },
    operationCallbacks: { stop: async () => { stops++; } }
  });
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  assert.equal(screen.find('control-action-stop').props.disabled, false);
  screen.find('control-action-stop').props.onPress(); await screen.settle();
  assert.equal(stops, 1);
  assert.ok(screen.joystickSettings);
  screen.unmount();
});

test('stop cancels a mode picker or its confirmation without dispatching the old choice', async () => {
  for (const confirm of [false, true]) {
    let stops = 0, switches = 0;
    const screen = mount({
      dev: false, dimensions: { width: 1280, height: 720, fontScale: 1 }, connected: true,
      runtimeState: {
        controlLink: 'connected', policyCatalogStatus: 'synced',
        currentPolicy: { id: 'flat', label: '平地' }, policyOptions: [{ id: 'flat', label: '平地' }, { id: 'stairs', label: '楼梯' }]
      },
      operationReadiness: { stop: { ready: true }, switchPolicy: { ready: true } },
      operationCallbacks: { stop: async () => { stops++; }, switchPolicy: async () => { switches++; } }
    });
    openSettings(screen, 'control-open-policy'); screen.render();
    const oldChoice = screen.find('control-mode-stairs').props.onPress;
    let oldConfirm;
    if (confirm) { oldChoice(); screen.render(); oldConfirm = screen.find('control-immersive-confirm').props.onPress; }
    assert.equal(screen.find('control-action-stop').props.disabled, false);
    screen.find('control-action-stop').props.onPress(); await screen.settle();
    assert.equal(stops, 1); assert.equal(switches, 0);
    assert.equal(screen.find('control-mode-menu'), undefined);
    assert.equal(screen.find('control-immersive-confirm'), undefined);
    oldChoice(); oldConfirm?.(); await screen.settle();
    assert.equal(switches, 0);
    assert.equal(screen.find('control-immersive-confirm'), undefined);
    screen.unmount();
  }
});

test('physical stop remains available immediately while opening settings', () => {
  const hardware = physicalFixture(); let sent = 0, interrupted = 0;
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, ...capableProps(),
    g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { interrupted++; } },
  });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  screen.find('control-open-more').props.onPress();
  const afterOpen = interrupted;
  hardware.sample({ moving: true, pressed: ['stop'] });
  assert.ok(interrupted > afterOpen); assert.equal(sent, 1);
  screen.render(); assert.equal(screen.find('control-settings-menu'), undefined);
  screen.unmount();
});

test('physical stop remains available while opening posture menu', () => {
  const hardware = physicalFixture(); let sent = 0, interrupted = 0;
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, ...capableProps(),
    g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { interrupted++; } },
  });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  openSettings(screen, 'control-open-gestures');
  const afterOpen = interrupted;
  hardware.sample({ moving: true, pressed: ['stop'] });
  assert.ok(interrupted > afterOpen); assert.equal(sent, 1);
  screen.render(); assert.equal(screen.find('control-posture-menu'), undefined);
  screen.unmount();
});

test('settings links open real connection and diagnostics handlers', () => {
  let connections = 0, diagnostics = 0;
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 },
    onOpenConnection: () => { connections++; }, onOpenJointStatus: () => { diagnostics++; }
  });
  screen.find('control-open-more').props.onPress(); screen.render();
  screen.find('control-settings-tab-连接与设备').props.onPress(); screen.render();
  screen.find('control-settings-connection').props.onPress(); screen.render();
  assert.equal(connections, 1);
  screen.find('control-open-more').props.onPress(); screen.render();
  screen.find('control-settings-tab-机器狗维护').props.onPress(); screen.render();
  screen.find('control-open-diagnostics').props.onPress();
  assert.equal(diagnostics, 1);
  screen.unmount();
});

test('reference settings hide unimplemented placeholders cleanly and overlay visibility grants no motion', () => {
  let sent = 0;
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 447, fontScale: 1 },
    productionInput: { ready: false, onDrive() { sent++; }, onTurn() { }, onInterrupt() { } }
  });
  assert.equal(screen.find('control-action-prone'), undefined);
  assert.equal(screen.find('control-action-recovery'), undefined);
  screen.find('control-open-more').props.onPress(); screen.render();
  assert.equal(screen.find('control-setting-mirror'), undefined);
  screen.find('control-settings-tab-图传与音频').props.onPress(); screen.render();
  assert.equal(screen.find('control-setting-recording'), undefined);
  assert.equal(screen.find('control-setting-volume'), undefined);
  screen.find('control-setting-overlay').props.onPress(); screen.render();
  screen.find('control-settings-tab-机器狗维护').props.onPress(); screen.render();
  assert.equal(screen.find('control-setting-stop-confirm'), undefined);
  screen.find('control-close-settings').props.onPress(); screen.render();
  assert.equal(screen.find('control-telemetry-speed'), undefined);
  assert.equal(screen.find('control-telemetry-battery'), undefined);
  assert.ok(screen.find('control-action-stop'));
  assert.equal(sent, 0);
  screen.unmount();
});

test('all five FSD settings pages show distinct content without granting control or sending motion', () => {
  let sent = 0, acquired = 0, released = 0;
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 447, fontScale: 1.25 },
    inputSource: 'physical',
    productionInput: { ready: false, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } },
    controlSession: {
      label: '无人控制', canAcquire: true, leaseActive: false, busy: false,
      onAcquire() { acquired++; }, onRelease() { released++; }
    }
  });
  screen.find('control-open-more').props.onPress(); screen.render();
  const pages = [
    ['操控', '摇杆设置'], ['图传与音频', '待机场景'],
    ['连接与设备', '热点扫描'], ['机器狗维护', '机器人状态'], ['关于与隐私', '应用与版本'],
  ];
  for (const [page, heading] of pages) {
    screen.find(`control-settings-tab-${page}`).props.onPress(); screen.render();
    assert.ok(screen.find(`control-settings-page-${page}`));
    assert.ok(screen.copy.includes(heading));
    for (const [other] of pages) if (other !== page) assert.equal(screen.find(`control-settings-page-${other}`), undefined);
    assert.ok(screen.find('control-action-stop'));
    assert.ok(screen.find('control-close-settings'));
    assert.equal(screen.find(`control-settings-tab-${page}`).props.accessibilityState.selected, true);
    assert.equal(Boolean(screen.find('control-lease')), page === '连接与设备');
    assert.equal(screen.pair.disabled, true);
  }
  assert.equal(sent, 0); assert.equal(acquired, 0); assert.equal(released, 0);
  screen.unmount();
});

test('settings keep robot authority separate from input source and retire disconnected observations', () => {
  const runtimeState = {
    controlLink: 'connected', controlOwner: 'robot-remote', posture: 'standing', motorState: 'enabled',
    currentPolicy: { id: 'stairs', label: '楼梯' }
  };
  const screen = mount({
    dev: false, dimensions: { width: 1280, height: 720, fontScale: 1 },
    connected: true, inputSource: 'physical', runtimeState
  });
  screen.find('control-open-more').props.onPress(); screen.render();
  screen.find('control-settings-tab-连接与设备').props.onPress(); screen.render();
  assert.match(screen.copy, /机器人侧遥控中/); assert.match(screen.copy, /G20 实体摇杆/);
  screen.find('control-settings-tab-机器狗维护').props.onPress(); screen.render();
  assert.match(screen.copy, /已使能/); assert.match(screen.copy, /楼梯/);
  screen.render({ connected: false, runtimeState: { ...runtimeState, controlLink: 'disconnected' } });
  const panel = screen.find('control-settings-page-机器狗维护');
  const panelText = JSON.stringify(panel);
  assert.doesNotMatch(panelText, /已使能|楼梯|本设备控制/);
  assert.match(panelText, /未读取/);
  screen.unmount();
});

test('physical input needs neutral after motion permission and sends a coherent pair; stale input interrupts', () => {
  const hardware = physicalFixture(); const sent = []; let stopped = 0;
  const productionInput = {
    ready: false, onDrive() { throw Error('physical must use combined snapshot'); }, onTurn() { },
    onSticks(drive, turn, sampledAt) { sent.push([drive, turn, sampledAt]); }, onInterrupt() { stopped++; }
  };
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
test('unverified observation cannot use stale calibration to send physical input', () => {
  const hardware = physicalFixture(), sent = [];
  hardware.controller.state.sample.configurationReady = false;
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller,
    inputSource: 'physical', productionInput: {
      ready: true, onDrive() { }, onTurn() { },
      onSticks(...values) { sent.push(values); }, onInterrupt() { }
    }
  });
  hardware.sample(); hardware.sample({ moving: true });
  assert.deepEqual(sent, []); screen.unmount();
});

test('physical source and motion grants reject neutral frames whose requests predate the Android fence', () => {
  for (const boundary of ['source', 'motion']) {
    const hardware = physicalFixture(); let sent = 0;
    const productionInput = { ready: boundary === 'source', onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { } };
    const screen = mount({
      dev: false, ...capableProps(), g20Controller: hardware.controller,
      inputSource: boundary === 'motion' ? 'physical' : undefined, productionInput
    });
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
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { stopped++; } }
  });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 0);
  const before = stopped; hardware.sample({ moving: true, pressed: ['stop'] });
  assert.ok(stopped > before); assert.equal(sent, 0); screen.unmount();
});

test('input settings interrupts control and never routes physical frames or keys', () => {
  const hardware = physicalFixture(); let sent = 0, stopped = 0;
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { stopped++; } }
  });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  openSettings(screen, 'control-open-input'); screen.render();
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
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller,
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { } }
  });
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
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller,
    productionInput: { ready: true, onDrive(value) { sent.push(['drive', value]); }, onTurn(value) { sent.push(['turn', value]); }, onInterrupt() { } }
  });
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
    const screen = mount({
      dev: false, ...capableProps(), g20Controller: hardware.controller,
      productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } }
    });
    const oldDrive = screen.pair.left.onSample, oldTurn = screen.pair.right.onSample;
    openSettings(screen, kind === 'input' ? 'control-open-input' : 'control-open-joystick-layout');
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
  const productionInput = { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } };
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
  const productionInput = { ready: true, onDrive() { sent.push('original'); }, onTurn() { }, onInterrupt() { } };
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
    const screen = mount({
      dev: false, ...capableProps(),
      productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } }
    });
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
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { }, onInterrupt() { interrupted++; } },
    operationReadiness: { enableMotor: { ready: true } }, operationCallbacks: { enableMotor() { enabled++; } }
  });
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
  const screen = mount({
    dev: false, robotName: 'IP 直连设备', robotType: '只读状态 · 设备归属未核验',
    directConnection: { endpointLabel: 'robot.example.test:13145', fresh: true, summary: '状态已读取 · 设备归属未核验' },
    runtimeState: { controlLink: 'unknown', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    onOpenConnection: () => opened++
  });
  assert.ok(screen.find('control-direct-connection'));
  assert.match(screen.copy, /状态已读取/); assert.match(screen.copy, /当前站立/); assert.match(screen.copy, /电机已使能/);
  assert.doesNotMatch(screen.copy, /设备在线|已取得控制权/);
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  screen.find('control-open-connection').props.onPress(); assert.equal(opened, 1);
  screen.render({
    directConnection: { endpointLabel: 'robot.example.test:13145', fresh: false, summary: '状态已过期 · 请重新检查' },
    runtimeState: { controlLink: 'unknown', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown' }
  });
  assert.match(screen.copy, /需重新检查/); assert.doesNotMatch(screen.copy, /当前站立|电机已使能/);
});

test('production control center exposes truthful status and offline preview sticks', () => {
  const screen = mount({ dev: false });
  for (const copy of ['THUNDER 01', '室外四足机器人', '设备离线', '电量未知', '本地试用', '地图未接入']) {
    assert.ok(screen.copy.includes(copy), copy);
  }
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  assert.equal(screen.pair.showLabels, true);
  assert.equal(screen.pair.showVisuals, true);
  assert.equal(screen.pair.left.testID, 'control-drive-stick');
  assert.equal(screen.pair.right.testID, 'control-turn-stick');
  assert.ok(screen.find('control-back'));
  for (const entry of ['map', 'tasks', 'routes', 'connection']) assert.ok(screen.find(`control-open-${entry}`));
  assert.equal(screen.find('control-recall').props.disabled, true);
  assert.ok(screen.find('control-terrain-mode'));
  for (const mode of ['flat', 'stairs', 'platform']) assert.equal(screen.find(`control-terrain-mode-${mode}`).props.disabled, true);
  assert.equal(typeof screen.find('control-terrain-mode-recovery').props.onPress, 'function');
  assert.equal(screen.find('control-preview-toggle'), undefined);
  assert.equal(screen.find('control-stop-disabled'), undefined);
  assert.equal(screen.find('control-developer-toggle'), undefined);
  screen.unmount();
});

test('complete action surface keeps stop visible, supports collapse, and reports per-action states', () => {
  const screen = mount({
    dev: false,
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
  assert.equal(screen.find('control-action-collapse').props.accessibilityLabel, '展开动作区');
  assert.doesNotMatch(screen.copy, /动作区已折叠/);
  screen.find('control-action-collapse').props.onPress(); screen.render();
  assert.ok(screen.find('control-action-stop'));
  screen.unmount();
});

test('portrait hides repeated readiness details but keeps them available on demand', () => {
  const screen = mount({ dev: false });
  assert.equal(screen.find('control-status-grid'), undefined);
  assert.equal(screen.find('control-action-status-stand'), undefined);
  assert.equal(screen.find('control-action-stand').props.disabled, true);
  assert.ok(screen.find('control-action-stand').props.accessibilityHint);
  screen.find('control-status-details').props.onPress(); screen.render();
  assert.ok(screen.find('control-status-grid'));
  screen.find('control-action-reasons').props.onPress(); screen.render();
  assert.ok(screen.find('control-action-status-stand'));
  screen.unmount();
});

test('ordinary G20 landscape keeps the status in one row and room for both discs', () => {
  for (const dimensions of [{ width: 753, height: 447, fontScale: 1 }, { width: 844, height: 390, fontScale: 1 }]) {
    const screen = mount({ dev: false, dimensions });
    assert.equal(screen.find('control-compact-telemetry'), undefined);
    for (const side of ['left', 'right']) assert.ok(screen.pair.layout[side].size >= 110 && screen.pair.layout[side].size <= 140);
    screen.unmount();
  }
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
  assert.equal(screen.find('control-telemetry-speed'), undefined);
  assert.ok(screen.find('control-telemetry-signal'));
  assert.ok(screen.find('control-telemetry-battery'));
  assert.ok(screen.pair);
  assert.equal(screen.pair.variant, 'glass');
  assert.equal(screen.pair.showLabels, false);
  assert.equal(screen.pair.showVisuals, true);
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  assert.match(screen.copy, /THUNDER-01/);
  assert.match(screen.find('control-telemetry-battery').props.accessibilityLabel, /电量/);
  assert.doesNotMatch(screen.copy, /手动控制|输入来源|任务|路线|Brainstem|更多/);
  screen.unmount();
});

test('G20 landscape hides joystick visuals while retaining the touch pair', () => {
  const hardware = physicalFixture();
  const screen = mount({ dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, g20Controller: hardware.controller });
  assert.equal(screen.pair.showVisuals, false);
  assert.equal(screen.pair.floating, true);
  assert.equal(screen.pair.disabled, false);
  screen.unmount();
});

test('landscape canvas remains measured and bounded across system bars and input-panel return', async () => {
  const hardware = physicalFixture();
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 400, fontScale: 1 },
    g20Controller: hardware.controller, navigationInset: async () => 48
  });
  const canvasHeight = () => Object.assign({}, ...screen.find('control-immersive-surface').props.style).height;
  await screen.settle();
  assert.equal(screen.scroll, undefined, 'the control surface cannot grow inside a percentage-height ScrollView');
  assert.equal(screen.navigationCalls.at(-1), true);
  assert.equal(canvasHeight(), 400, 'SafeAreaView has already excluded any visible system bar');
  screen.layout(753, 448);
  assert.equal(canvasHeight(), 448, 'use reclaimed space when the measured safe viewport expands');
  openSettings(screen, 'control-open-input'); screen.render(); await screen.settle();
  assert.ok(screen.inputPanel);
  assert.equal(screen.navigationCalls.at(-1), false);
  screen.inputPanel.onClose(); screen.render(); await screen.settle();
  assert.equal(screen.navigationCalls.at(-1), true);
  screen.layout(753, 400);
  assert.equal(canvasHeight(), 400);
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined, 'window changes must not acquire input authority');
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
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 400, fontScale: 1 },
    navigationInset: hidden => hidden ? new Promise(resolve => { resolveHidden = resolve; }) : 0
  });
  screen.unmount();
  resolveHidden(48);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(screen.lateUpdates, 0);
  assert.equal(screen.navigationCalls.at(-1), false);
});

test('landscape diagnostics retires held touch before navigation', () => {
  const order = []; let sent = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(), connected: true,
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { }, onInterrupt() { order.push('interrupt'); } },
    onOpenJointStatus() { order.push('diagnostics'); }
  });
  const oldInput = screen.pair.left.onSample;
  oldInput({ x: .2, y: .2 });
  const before = sent;
  openSettings(screen, 'control-open-diagnostics');
  assert.deepEqual(order.slice(-2), ['interrupt', 'diagnostics']);
  oldInput({ x: .3, y: .3 });
  assert.equal(sent, before);
  screen.unmount();
});

test('posture menu retires old touch and keeps recovery unavailable', () => {
  let sent = 0, interrupted = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(), connected: true,
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { }, onInterrupt() { interrupted++; } }
  });
  const oldInput = screen.pair.left.onSample;
  oldInput({ x: .2, y: .2 });
  const sentBefore = sent, interruptedBefore = interrupted;
  openSettings(screen, 'control-open-gestures'); screen.render();
  assert.ok(screen.find('control-posture-menu'));
  assert.equal(screen.find('control-posture-recovery'), undefined);
  assert.equal(screen.find('control-action-stand').props.disabled, true);
  assert.ok(screen.find('control-action-stop'));
  assert.ok(interrupted > interruptedBefore);
  oldInput({ x: .4, y: .4 }); assert.equal(sent, sentBefore);
  screen.find('control-posture-dismiss').props.onPress(); screen.render();
  assert.equal(screen.find('control-posture-menu'), undefined);
  assert.ok(screen.find('control-open-more'));
  oldInput({ x: .4, y: .4 }); assert.equal(sent, sentBefore);
  screen.unmount();
});

test('posture menu sends the chosen operation once and waits for observed state', async () => {
  let stands = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    runtimeState: { controlLink: 'connected', posture: 'sitting' },
    operationReadiness: { stand: { ready: true }, sit: { ready: true } },
    operationCallbacks: { stand: async () => { stands++; }, sit: async () => { } }
  });
  openSettings(screen, 'control-open-gestures'); screen.render();
  assert.equal(screen.find('control-posture-sit').props.accessibilityState.selected, true);
  assert.equal(screen.find('control-posture-sit').props.disabled, true);
  const stand = screen.find('control-posture-stand');
  assert.equal(stand.props.disabled, false);
  stand.props.onPress(); stand.props.onPress(); await screen.settle();
  assert.equal(stands, 1);
  openSettings(screen, 'control-open-gestures'); screen.render();
  assert.equal(screen.find('control-posture-stand').props.accessibilityState.selected, false);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'standing' } });
  assert.equal(screen.find('control-posture-stand').props.accessibilityState.selected, true);
  screen.render({ runtimeState: { controlLink: 'disconnected', posture: 'standing' } });
  assert.equal(screen.find('control-posture-stand').props.accessibilityState.selected, false);
  screen.unmount();
});

test('stop stays available while posture menu is open', async () => {
  let stops = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(),
    runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { stop: { ready: true } }, operationCallbacks: { stop: async () => { stops++; } }
  });
  openSettings(screen, 'control-open-gestures'); screen.render();
  assert.equal(screen.find('control-action-stop').props.disabled, false);
  screen.find('control-action-stop').props.onPress(); await screen.settle();
  assert.equal(stops, 1);
  assert.equal(screen.find('control-posture-menu'), undefined);
  screen.unmount();
});

test('landscape exposes actual robot policy IDs without guessing terrain names or dispatching on open', () => {
  let called = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(), connected: false,
    runtimeState: {
      controlLink: 'connected', motorState: 'disabled', posture: 'sitting', policyCatalogStatus: 'synced',
      currentPolicy: { id: 'w5_current', label: 'W5' }, policyOptions: [{ id: 'w5_current', label: 'W5' }, { id: 'robot_candidate', label: '候选策略' }]
    },
    operationReadiness: { switchPolicy: { ready: true } },
    operationCallbacks: { switchPolicy() { called++; } }
  });
  openSettings(screen, 'control-open-policy'); screen.render();
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

test('real control session feeds slot buttons and dispatches the advertised ID in portrait and landscape', async () => {
  for (const landscape of [false, true]) {
    const calls = [];
    const status = {
      fsmKind: 'standing', transition: 'none', motorOutputEnabled: true,
      owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false
    };
    let profile = {
      current: 'w5_89999', currentDescription: 'flat: W5',
      available: ['w5_89999', 'cts_v39_61128'], descriptions: ['flat: W5', 'stairs: CTS']
    };
    const reply = () => ({ status, profile, leaseActive: false, principalVerified: false });
    const session = new BrainstemControlSession({
      async open() { return { ...reply(), sessionId: 'screen-fixture', transport: 'grpc-mtls', mutualTlsVerified: true }; },
      async action(_sessionId, action, id) {
        assert.equal(action, 'switch-profile'); calls.push(id);
        profile = { ...profile, current: id, currentDescription: profile.descriptions[profile.available.indexOf(id)] };
        return reply();
      },
      async interrupt() { return reply(); }, async close() { },
    }, () => true, () => 1000);
    assert.equal(await session.connect({ host: 'robot.example', port: 13145, clientIdentityAlias: 'fixture' }, 'screen-fixture'), true);
    const screen = mount({
      dev: false, dimensions: { width: landscape ? 800 : 430, height: landscape ? 480 : 900, fontScale: 1 },
      runtimeState: session.runtimeState,
      operationReadiness: session.operationReadiness,
      operationCallbacks: { switchPolicy: id => session.action('switch-profile', id) }
    });
    if (landscape) { openSettings(screen, 'control-open-policy'); screen.render(); }
    const prefix = landscape ? 'control-mode-' : 'control-terrain-mode-';
    assert.equal(screen.find(`${prefix}flat`).props.disabled, true);
    assert.equal(screen.find(`${prefix}platform`).props.disabled, true);
    assert.equal(screen.find(`${prefix}stairs`).props.disabled, false);
    screen.find(`${prefix}stairs`).props.onPress(); screen.render();
    assert.equal(calls.length, 0);
    screen.find(landscape ? 'control-immersive-confirm' : 'control-confirm-action').props.onPress();
    await screen.settle();
    assert.deepEqual(calls, ['cts_v39_61128']);
    screen.unmount();
    session.dispose();
  }
});

test('landscape mode entry explains unavailable capability and never sends an action', () => {
  let called = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 },
    operationReadiness: { switchPolicy: { ready: false, blockedReason: '先连接机器人' } },
    operationCallbacks: { switchPolicy() { called++; } }
  });
  openSettings(screen, 'control-open-policy'); screen.render();
  assert.doesNotMatch(screen.copy, /先连接机器人|待同步|未配置/);
  assert.equal(screen.find('control-mode-flat').props.accessibilityHint, '先连接机器人');
  assert.equal(called, 0);
  assert.equal(screen.pair.disabled, true);
  screen.unmount();
});

test('landscape mode entry opens real policy selection without executing a policy', () => {
  let called = 0;
  const screen = mount({
    dev: false, dimensions: { width: 800, height: 480, fontScale: 1 }, ...capableProps(), connected: false,
    runtimeState: { policyCatalogStatus: 'synced', policyOptions: [{ id: 'flat', label: '标准行走' }] },
    operationReadiness: { switchPolicy: { ready: true } }, operationCallbacks: { switchPolicy() { called++; } }
  });
  openSettings(screen, 'control-open-policy'); screen.render();
  assert.match(screen.copy, /平地/);
  assert.doesNotMatch(screen.copy, /待同步|未配置/);
  assert.equal(screen.find('control-mode-flat').props.disabled, false);
  assert.equal(screen.find('control-mode-stairs').props.disabled, true);
  assert.equal(screen.find('control-mode-platform').props.disabled, true);
  assert.equal(screen.find('control-mode-recovery'), undefined);
  assert.equal(called, 0);
  assert.equal(screen.pair.disabled, true);
  assert.ok(screen.find('control-mode-menu'));
  screen.find('control-mode-dismiss').props.onPress(); screen.render();
  assert.equal(screen.find('control-mode-menu'), undefined);
  openSettings(screen, 'control-open-policy'); screen.render();
  assert.ok(screen.find('control-mode-menu'));
  openSettings(screen, 'control-open-policy'); screen.render();
  assert.equal(screen.find('control-mode-menu'), undefined);
  assert.equal(called, 0);
  screen.unmount();
});

test('landscape removes the crossed joint shortcut without changing the controller gate', () => {
  let opened = 0;
  const screen = mount({ dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, onOpenJointStatus: () => { opened += 1; } });
  assert.equal(screen.find('control-open-joints'), undefined);
  assert.equal(opened, 0);
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  screen.unmount();
});

test('speed and input-source surfaces stay truthful when no device telemetry or physical axis adapter exists', () => {
  const screen = mount({
    dev: false, runtimeState: {
      controlLink: 'unknown', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown',
      deviceIdentity: 'unbound', faultStatus: 'unknown',
      speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' },
      policyCatalogStatus: 'unknown', policyOptions: [],
    }
  });
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
    developmentInput: { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { interrupts++; } },
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
  assert.ok(screen.pair.size >= 48 && screen.pair.size <= 250);
  for (const side of ['left', 'right']) {
    const disc = screen.pair.layout[side];
    assert.ok(disc.size <= screen.pair.touchAreaHeight && disc.left >= 0);
    assert.ok(disc.left + disc.size <= screen.pair.touchAreaWidth);
  }
  screen.unmount();
});

test('development session must be ready before input reaches its callbacks', () => {
  const drive = [], turn = [];
  const input = { ready: false, onDrive: value => drive.push(value), onTurn: value => turn.push(value), onInterrupt() { } };
  const screen = mount({ developmentInput: input, allowInteractionPreview: true });
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  screen.pair.left.onChange({ x: 1, y: -1 });
  assert.equal(drive.length, 0);
  screen.render({ developmentInput: { ...input, ready: true } });
  assert.equal(screen.pair.disabled, false);
  screen.pair.left.onChange({ x: .5, y: -.5 });
  screen.pair.right.onChange({ x: .3, y: 0 });
  assert.equal(drive.length, 1); assert.equal(turn.length, 1);
  screen.unmount();
});

test('production never invokes an injected development control session', () => {
  let inputs = 0, interrupts = 0;
  const input = { ready: true, onDrive() { inputs++; }, onTurn() { inputs++; }, onInterrupt() { interrupts++; } };
  const screen = mount({ dev: false, developmentInput: input, allowInteractionPreview: true });
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined);
  screen.pair.left.onChange({ x: 1, y: 1 }); screen.pair.right.onChange({ x: 1, y: 0 });
  screen.background(); screen.rotate(); screen.back(); screen.unmount();
  assert.equal(inputs, 0); assert.equal(interrupts, 0);
});

test('production input uses the explicit real channel and cancels on lifecycle changes', () => {
  let samples = 0, interrupts = 0;
  const input = { ready: true, onDrive() { samples++; }, onTurn() { samples++; }, onInterrupt() { interrupts++; } };
  const screen = mount({ dev: false, connected: true, canUseManualControl: true, productionInput: input });
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
  const screen = mount({
    dev: false, canUseManualControl: true,
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { interrupts++; } },
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', motorState: 'enabled', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } }
  });
  screen.find('control-action-sit').props.onPress();
  await Promise.resolve(); screen.render();
  assert.equal(actions, 1); assert.equal(interrupts, 0);
  screen.unmount();
});

test('a rejected stop is displayed as unconfirmed instead of accepted or completed', async () => {
  const screen = mount({
    dev: false,
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
  const screen = mount({
    dev: false,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held' },
    operationReadiness: { stop: { ready: true } }, operationCallbacks: { stop: async () => { } },
  });
  screen.find('control-action-stop').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); screen.render();
  screen.render({ runtimeState: { controlLink: 'connected', controlAuthority: 'not-held' } });
  assert.match(screen.copy, /控制权撤销已确认/);
  assert.doesNotMatch(screen.copy, /机器人已停止|机身已静止/);
  screen.unmount();
});

test('posture dispatch ACK stays pending until observed posture, then does not permanently lock the action', async () => {
  const screen = mount({
    dev: false,
    runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { } }
  });
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
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } }
  });
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
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } },
    operationCallbacks: { sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); } }
  });
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
    const screen = mount({
      dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
      operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { } }
    });
    screen.find('control-action-sit').props.onPress(); await screen.settle();
    screen.render({ runtimeState: { controlLink, posture: 'sitting' } });
    assert.match(screen.copy, /结果未确认/); assert.doesNotMatch(screen.copy, /设备状态已确认/);
    assert.equal(screen.timerCount, 0); screen.unmount();
  }
});

test('independent read-only telemetry freshness does not invalidate an action control result', async () => {
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    directConnection: { endpointLabel: 'robot.test:13145', fresh: false, summary: '遥测待刷新' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { } }
  });
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  assert.match(screen.copy, /已接受/);
  screen.render({ runtimeState: { controlLink: 'connected', posture: 'sitting' } });
  assert.match(screen.copy, /设备状态已确认/); screen.unmount();
});

test('target and input-source changes retire old callbacks before another action can complete', async () => {
  for (const boundary of ['target', 'source-prop', 'source-press']) {
    let finish, actions = 0;
    const screen = mount({
      dev: false, operationTargetKey: 'robot-a', inputSource: 'touch', physicalInputAvailable: true,
      runtimeState: { controlLink: 'connected', posture: 'standing' },
      operationReadiness: { sit: { ready: true } }, operationCallbacks: {
        sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); },
      }
    });
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
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: () => new Promise(resolve => { finish = resolve; }) }
  });
  screen.find('control-action-sit').props.onPress(); screen.render();
  screen.unmount(); finish(); await Promise.resolve(); await Promise.resolve(); screen.advance(10_000);
  assert.equal(screen.timerCount, 0); assert.equal(screen.lateUpdates, 0);
});

test('a delayed ACK does not restart the original result deadline', async () => {
  let finish;
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: () => new Promise(resolve => { finish = resolve; }) }
  });
  screen.find('control-action-sit').props.onPress(); screen.render(); screen.advance(9_000);
  finish(); await screen.settle(); assert.match(screen.copy, /已接受/);
  screen.advance(1_000); assert.match(screen.copy, /结果未确认/); screen.unmount();
});

test('an explicit newer dispatch of the same action replaces the old result deadline', async () => {
  let actions = 0;
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } }, operationCallbacks: { sit: async () => { actions++; } }
  });
  screen.find('control-action-sit').props.onPress(); await screen.settle(); screen.advance(5_000);
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  assert.equal(actions, 2); assert.equal(screen.timerCount, 1);
  screen.advance(5_000); assert.match(screen.copy, /已接受/); assert.doesNotMatch(screen.copy, /结果未确认/);
  screen.advance(5_000); assert.match(screen.copy, /结果未确认/); screen.unmount();
});

test('disconnect before ACK releases the old request and recovery does not revive its callback', async () => {
  let finish, actions = 0;
  const screen = mount({
    dev: false, runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } },
    operationCallbacks: { sit: () => { actions++; return actions === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); } }
  });
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
    const screen = mount({
      dev: false, operationTargetKey: 'robot-a', inputSource: 'touch', physicalInputAvailable: true,
      runtimeState: { controlLink: 'connected', motorState: 'disabled', posture: 'standing' },
      operationReadiness: { sit: { ready: true }, enableMotor: { ready: true } },
      operationCallbacks: { sit() { actions++; }, enableMotor() { actions++; } }
    });
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
  let interrupted = 0;
  const input = { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { interrupted++; } };
  const screen = mount({ developmentInput: input });
  screen.background(); assert.equal(interrupted, 1); assert.equal(screen.pair.disabled, true);
  screen.render({ developmentInput: { ...input, ready: false } }); screen.background('active');
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined, 'foreground only offers local preview');
  screen.rotate(); assert.equal(interrupted, 2);
  screen.back(); assert.equal(interrupted, 3);
  screen.unmount(); assert.equal(interrupted, 4);
});

test('unknown initial AppState fails closed until an active lifecycle event', () => {
  const screen = mount({ initialAppState: null, developmentInput: { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { } } });
  assert.equal(screen.pair.disabled, true);
  screen.background('active'); assert.equal(screen.pair.disabled, false); screen.unmount();
});

test('pair cancellation interrupts the session before visual reset', () => {
  let interrupts = 0;
  const screen = mount({ developmentInput: { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { interrupts++; } } });
  const reset = screen.pair.resetKey;
  screen.pair.onCancel(); assert.equal(interrupts, 1); screen.render(); assert.ok(screen.pair.resetKey > reset); screen.unmount();
});

test('surface cancellation interrupts even when Android routes cancel to the scroll ancestor', () => {
  let interrupts = 0;
  const screen = mount({ developmentInput: { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { interrupts++; } } });
  screen.find('control-surface').props.onTouchCancel(); assert.equal(interrupts, 1); screen.unmount();
});

test('only the development wrapper owns vertical insets; standalone and production retain all safe-area edges', () => {
  const input = { ready: true, onDrive() { }, onTurn() { }, onInterrupt() { } };
  for (const options of [{}, { dev: false, developmentInput: input }, { developmentInput: input }]) {
    const screen = mount(options);
    assert.deepEqual([...screen.safeArea.edges], options.developmentInput && options.dev !== false ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']);
    screen.unmount();
  }
});

test('joystick layout is editable offline, persists per side and orientation, and resets only that orientation', async () => {
  const saved = [];
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); }
  });
  await screen.settle();
  const original = JSON.parse(JSON.stringify(screen.pair.layout));
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  assert.equal(screen.pair, undefined, 'editing surface must not mount motion responders');
  screen.joystickSettings.onChange('left', { sizeScale: 1.5, x: .3, y: .8 }); screen.render();
  assert.equal(screen.joystickSettings.layout.left.sizeScale, 1.5);
  screen.joystickSettings.onClose(); screen.render();
  assert.ok(screen.pair.layout.left.size > original.left.size);
  assert.equal(screen.pair.layout.right.size, original.right.size);
  await screen.settle();
  assert.equal(saved.at(-1).landscape.left.x, .3);
  assert.equal(saved.at(-1).portrait.left.sizeScale, 1);
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
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
  openSettings(screen, 'control-open-joystick-layout');
  assert.equal(interrupted, 1, 'transport is interrupted before the editor renders');
  oldSample({ x: 1, y: -1 }); assert.equal(sent, 1);
  screen.render(); assert.ok(screen.joystickSettings); assert.equal(screen.pair, undefined);
  screen.unmount();
});

test('slider previews update the layout without storage or motion, then commit once on release', async () => {
  const saved = []; let sent = 0;
  const screen = mount({
    dev: false, ...capableProps(), connected: true, dimensions: { width: 1100, height: 600, fontScale: 1 },
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); }
  });
  await screen.settle();
  const oldSample = screen.pair.left.onSample;
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
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

test('shared header closes the layout editor and flushes its preview without leaving control', async () => {
  const saved = [];
  const screen = mount({
    dev: false, dimensions: { width: 1000, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); }
  });
  await screen.settle(); openSettings(screen, 'control-open-joystick-layout'); screen.render();
  screen.joystickSettings.onPreview('left', { sizeScale: 1.2 }); screen.render();
  screen.find('control-back').props.onPress(); await screen.settle();
  assert.equal(screen.backCalls, 0); assert.equal(screen.joystickSettings, undefined);
  assert.equal(saved.length, 1); assert.equal(saved[0].landscape.left.sizeScale, 1.2);
  assert.ok(screen.find('control-immersive-surface')); screen.unmount();
});

test('workspace Back closes control settings without leaving and saves a pending layout edit', async () => {
  const dismissWorkspaceOverlayRef = { current: null };
  const saved = [];
  const screen = mount({
    dev: false, dimensions: { width: 1000, height: 600, fontScale: 1 }, dismissWorkspaceOverlayRef,
    layoutSave: async value => { saved.push(value.landscape.left.sizeScale); }
  });
  await screen.settle();
  assert.equal(dismissWorkspaceOverlayRef.current(), false);
  screen.find('control-open-more').props.onPress(); screen.render();
  assert.ok(screen.find('control-settings-background'));
  assert.equal(dismissWorkspaceOverlayRef.current(), true);
  screen.render();
  assert.equal(screen.find('control-settings-background'), undefined);
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  screen.joystickSettings.onPreview('left', { sizeScale: 1.2 }); screen.render();
  assert.equal(dismissWorkspaceOverlayRef.current(), true);
  await screen.settle();
  assert.deepEqual(saved, [1.2]);
  assert.equal(screen.joystickSettings, undefined);
  assert.equal(dismissWorkspaceOverlayRef.current(), false);
  assert.equal(screen.backCalls, 0);
  screen.unmount();
  assert.equal(dismissWorkspaceOverlayRef.current, null);
});

test('closing flushes the latest slider preview and rejects late editor callbacks', async () => {
  const saved = [];
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); }
  });
  await screen.settle();
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  const oldEditor = screen.joystickSettings;
  oldEditor.onPreview('right', { x: .4, y: .8 }); screen.render();
  assert.equal(saved.length, 0);
  screen.joystickSettings.onClose(); await screen.settle();
  assert.equal(saved.length, 1); assert.equal(saved[0].landscape.right.x, .4);
  oldEditor.onPreview('right', { x: .9 }); oldEditor.onChange('right', { y: .1 });
  oldEditor.onReset(); await screen.settle();
  assert.equal(saved.length, 1, 'a retired editor cannot overwrite persisted placement');
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  assert.equal(screen.joystickSettings.layout.right.x, .4);
  assert.equal(screen.joystickSettings.layout.right.y, .8);
  screen.unmount();
});

test('reset retires slider callbacks before they can overwrite the defaults', async () => {
  const saved = [];
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    layoutSave: async value => { saved.push(JSON.parse(JSON.stringify(value))); }
  });
  await screen.settle();
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
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
  const screen = mount({
    dev: false, ...capableProps(), g20Controller: hardware.controller, inputSource: 'physical',
    productionInput: { ready: true, onDrive() { }, onTurn() { }, onSticks() { sent++; }, onInterrupt() { interrupted++; } }
  });
  hardware.sample(); hardware.sample({ moving: true }); assert.equal(sent, 1);
  openSettings(screen, 'control-open-joystick-layout');
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
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
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
  openSettings(screen, 'control-open-joystick-layout'); screen.render();
  screen.joystickSettings.onChange('right', { y: .75 }); screen.render(); await screen.settle();
  assert.match(screen.joystickSettings.storageError, /暂未保存/);
  screen.find('joystick-layout-retry').props.onPress(); await screen.settle();
  assert.equal(screen.joystickSettings.storageError, null);
  assert.equal(screen.joystickSettings.layout.right.y, .75);
  screen.unmount();
});

test('landscape removes the crossed policy row and only shows actionable feedback', () => {
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    controlSession: { label: '未连接', canAcquire: false, leaseActive: false, busy: false, onAcquire() { }, onRelease() { } }
  });
  assert.equal(screen.find('control-policy-strip'), undefined);
  assert.equal(screen.find('control-action-switchPolicy'), undefined);
  assert.equal(screen.find('control-terrain-mode'), undefined);
  assert.equal(screen.find('control-operation-feedback'), undefined);
  assert.doesNotMatch(screen.copy, /策略未同步|控制链未连接/);
  screen.render({ controlSession: { label: '未连接', error: '停止请求未确认', canAcquire: false, leaseActive: false, busy: false, onAcquire() { }, onRelease() { } } });
  assert.ok(screen.find('control-operation-feedback'));
  assert.match(screen.copy, /停止请求未确认/);
  screen.unmount();
});

test('portrait bottom placement reserves the complete scaled label below the disc', () => {
  for (const fontScale of [1, 1.5, 2]) {
    const screen = mount({ dev: false, dimensions: { width: 430, height: 900, fontScale } });
    openSettings(screen, 'control-open-joystick-layout'); screen.render();
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
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor: async () => { enables++; }, disableMotor: async () => { disables++; } }
  });
  assert.equal(screen.find('control-action-enableMotor'), undefined);
  assert.equal(screen.find('control-action-disableMotor'), undefined);
  const original = motorToggle(screen);
  assert.equal(original.props.accessibilityState.checked, false);
  assert.equal(original.props.disabled, false, 'observed off does not mean the action is unavailable');
  const motorSurface = () => Object.assign({}, ...screen.find('control-motor-toggle-circle').props.style).backgroundColor;
  const disabledSurface = motorSurface();
  original.props.onPress(); original.props.onPress(); screen.render();
  assert.equal(enables, 0, 'opening a confirmation must not operate the device');
  assert.equal(motorToggle(screen).props.accessibilityState.checked, false);
  const enableConfirm = screen.find('control-immersive-confirm').props.onPress;
  enableConfirm(); enableConfirm(); await screen.settle();
  assert.equal(enables, 1); assert.equal(disables, 0);
  assert.equal(motorToggle(screen).props.accessibilityState.checked, false, 'ACK is not observed enabled state');
  assert.equal(motorToggle(screen).props.disabled, true);
  assert.ok(screen.find('control-operation-feedback'));
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'enabled' } });
  assert.equal(motorToggle(screen).props.accessibilityState.checked, true);
  assert.notEqual(motorSurface(), disabledSurface, 'observed enable changes the motor surface');
  assert.equal(screen.find('control-operation-feedback'), undefined, 'an observed terminal state ends pending feedback');
  original.props.onPress(); enableConfirm(); screen.render();
  assert.equal(enables, 1, 'old press and confirmation cannot cross the observed state change');
  motorToggle(screen).props.onPress(); screen.render();
  assert.match(screen.copy, /确认\s*失能电机/);
  screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
  assert.equal(disables, 1);
  assert.equal(motorToggle(screen).props.accessibilityState.checked, true, 'disable ACK alone cannot paint off');
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'disabled' } });
  assert.equal(motorToggle(screen).props.accessibilityState.checked, false);
  assert.equal(motorToggle(screen).props.disabled, false);
  screen.unmount();
});

test('motor feedback preserves the measured stick area while a real session waits for its status read', async () => {
  let enabled = false, finishRead, screen;
  const calls = [];
  const reply = () => ({
    transport: 'grpc-lan', leaseActive: false, principalVerified: false, leaseOwnerMatched: false,
    status: {
      fsmKind: 'grounded', transition: 'none', motorOutputEnabled: enabled, owner: 'none',
      criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false
    }
  });
  const session = new BrainstemControlSession({
    async open() {
      return {
        ...reply(), sessionId: 'motor-layout', mutualTlsVerified: false, clientIdentitySelected: false,
        profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' }
      };
    },
    async read() { return new Promise(resolve => { finishRead = () => resolve(reply()); }); },
    async action(_id, action) { calls.push(action); enabled = true; return reply(); },
    async interrupt() { calls.push('interrupt'); return reply(); }, async close() { },
  });
  const callbacks = { enableMotor: () => session.action('enable') };
  const props = () => ({
    runtimeState: session.runtimeState, operationReadiness: session.operationReadiness,
    operationCallbacks: callbacks, productionInput: {
      ready: false, onDrive() { }, onTurn() { },
      onInterrupt: () => { void session.interrupt().catch(() => undefined); }
    }
  });
  const unsubscribe = session.subscribe(() => queueMicrotask(() => { if (screen) screen.render(props()); }));
  const reportStickArea = () => {
    const node = screen.find('control-immersive-sticks');
    const style = Object.assign({}, ...node.props.style);
    const area = { width: 1100 - style.left - style.right, height: 600 - style.top - style.bottom };
    // Deliver the layout event Fabric emits when the actual absolute bounds change.
    node.props.onLayout({ nativeEvent: { layout: area } }); screen.render();
    return area;
  };
  try {
    assert.equal(await session.connect({ host: '127.0.0.1', port: 12345, transport: 'lan-dev' }, ''), true);
    screen = mount({ dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 }, ...props() });
    await screen.settle();
    const before = reportStickArea();
    const reading = session.refresh();
    motorToggle(screen).props.onPress(); screen.render();
    screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
    assert.ok(screen.find('control-operation-feedback'));
    const submitted = reportStickArea();
    finishRead(); await reading; await screen.settle();
    assert.deepEqual(submitted, before, 'operation feedback must not resize the active input surface');
    assert.deepEqual(calls, ['enable'], 'a feedback layout must not interrupt the queued protected action');
    assert.equal(motorToggle(screen).props.accessibilityState.checked, true);
    assert.equal(screen.find('control-operation-feedback'), undefined);
    assert.deepEqual(reportStickArea(), before, 'removing confirmed feedback must not resize the surface either');
    assert.doesNotMatch(screen.copy, /操作结果未确认/);
  } finally {
    finishRead?.(); unsubscribe(); screen?.unmount(); screen = null; await session.disconnect();
  }
});

test('motor switch remains unknown for missing/disconnected state and respects the target permission', () => {
  let actions = 0;
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor() { actions++; }, disableMotor() { actions++; } }
  });
  for (const runtimeState of [undefined, { controlLink: 'connected', motorState: 'unknown' }, { controlLink: 'disconnected', motorState: 'enabled' }]) {
    screen.render({ runtimeState });
    const toggle = motorToggle(screen);
    assert.equal(toggle.props.disabled, true); assert.equal(toggle.props.accessibilityState.checked, undefined);
    assert.equal(toggle.props.accessibilityValue.text, '状态未知'); toggle.props.onPress();
  }
  assert.equal(actions, 0);
  screen.render({
    runtimeState: { controlLink: 'connected', motorState: 'enabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: false, blockedReason: '执行器未就绪' } }
  });
  const toggle = motorToggle(screen);
  assert.equal(toggle.props.disabled, true); assert.equal(toggle.props.accessibilityState.checked, true);
  toggle.props.onPress(); assert.equal(actions, 0, 'enabled state cannot bypass disable readiness');
  screen.unmount();
});

test('observed motor change cancels an open confirmation without dispatching the opposite action', () => {
  let actions = 0;
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true }, disableMotor: { ready: true } },
    operationCallbacks: { enableMotor() { actions++; }, disableMotor() { actions++; } }
  });
  motorToggle(screen).props.onPress(); screen.render();
  const previousConfirm = screen.find('control-immersive-confirm').props.onPress;
  screen.render({ runtimeState: { controlLink: 'connected', motorState: 'enabled' } });
  assert.equal(screen.find('control-immersive-confirm'), undefined);
  previousConfirm(); screen.render(); assert.equal(actions, 0);
  assert.equal(motorToggle(screen).props.accessibilityState.checked, true);
  screen.unmount();
});

test('a rejected motor operation keeps observed off and exposes failure after removing the policy strip', async () => {
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true } },
    operationCallbacks: { enableMotor: async () => { throw Error('fixture denied'); } }
  });
  motorToggle(screen).props.onPress(); screen.render();
  screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
  assert.equal(screen.find('control-policy-strip'), undefined);
  assert.equal(motorToggle(screen).props.accessibilityState.checked, false);
  assert.ok(screen.find('control-operation-feedback'));
  assert.match(screen.copy, /未能确认操作结果/);
  assert.doesNotMatch(screen.copy, /fixture denied|已使能/);
  screen.unmount();
});

test('explicit motor refusals show fixed rejection copy without exposing server text', async () => {
  for (const [code, message] of [['precondition', '机器人当前状态不允许此操作。'], ['unimplemented', '机器人服务未开放此操作。']]) {
    const screen = mount({
      dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
      runtimeState: { controlLink: 'connected', motorState: 'disabled' },
      operationReadiness: { enableMotor: { ready: true } },
      operationCallbacks: { enableMotor: async () => { throw { code, message: 'private server details' }; } }
    });
    motorToggle(screen).props.onPress(); screen.render();
    screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
    assert.equal(motorToggle(screen).props.accessibilityState.checked, false);
    assert.ok(screen.copy.includes(message));
    assert.doesNotMatch(screen.copy, /private server details|执行器未确认本次请求|请求已接受|已使能/);
    screen.unmount();
  }
});

test('other motor errors keep generic failure copy even when their text claims a business refusal', async () => {
  const screen = mount({
    dev: false, dimensions: { width: 1100, height: 600, fontScale: 1 },
    runtimeState: { controlLink: 'connected', motorState: 'disabled' },
    operationReadiness: { enableMotor: { ready: true } },
    operationCallbacks: { enableMotor: async () => { throw { code: 'unavailable', message: '机器人当前状态不允许此操作。 private server details' }; } }
  });
  motorToggle(screen).props.onPress(); screen.render();
  screen.find('control-immersive-confirm').props.onPress(); await screen.settle();
  assert.match(screen.copy, /未能确认操作结果/);
  assert.doesNotMatch(screen.copy, /private server details|机器人当前状态不允许此操作/);
  screen.unmount();
});

test('a late business refusal cannot overwrite the result of a replacement target', async () => {
  let reject;
  let calls = 0;
  const screen = mount({
    dev: false, operationTargetKey: 'robot-a',
    runtimeState: { controlLink: 'connected', posture: 'standing' },
    operationReadiness: { sit: { ready: true } },
    operationCallbacks: { sit: () => ++calls === 1 ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve() }
  });
  screen.find('control-action-sit').props.onPress(); screen.render();
  screen.render({ operationTargetKey: 'robot-b' });
  screen.find('control-action-sit').props.onPress(); await screen.settle();
  reject({ code: 'precondition', message: 'private server details' }); await screen.settle();
  assert.match(screen.copy, /已接受/);
  assert.doesNotMatch(screen.copy, /机器人当前状态不允许此操作|private server details/);
  screen.unmount();
});

test('video HUD forwards the actual media surface without granting motion or inventing telemetry', () => {
  let sent = 0, acquired = 0, interrupted = 0;
  const video = { phase: 'connecting', id: 'fixture-camera' };
  const videoSurface = { type: 'FixtureVideo', props: {} };
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 471, fontScale: 1 }, video, videoSurface,
    productionInput: { ready: false, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { interrupted++; } },
    controlSession: {
      label: '未连接', canAcquire: false, leaseActive: false, busy: false,
      onAcquire() { acquired++; }, onRelease() { }
    }
  });
  assert.ok(screen.videoStage);
  assert.equal(screen.videoStage.presentation, video);
  assert.equal(screen.videoStage.surface, videoSurface);
  assert.equal(screen.videoStage.active, true);
  assert.equal(screen.pair.variant, 'glass');
  assert.equal(screen.pair.right.label, '转向');
  assert.equal(screen.pair.disabled, false);
  assert.equal(screen.pair.left.onSample, undefined); assert.equal(screen.pair.right.onSample, undefined);
  screen.pair.left.onChange({ x: 1, y: -1 }); screen.pair.right.onChange({ x: 1, y: 0 });
  assert.equal(sent, 0); assert.equal(acquired, 0);
  assert.doesNotMatch(screen.copy, /0\.8\s*m\/s|78%|信号强|图传已连接/);
  const before = interrupted;
  screen.videoStage.onInterrupted();
  assert.equal(interrupted, before + 1);
  screen.background();
  assert.equal(screen.videoStage.active, false);
  screen.background('active');
  assert.equal(screen.videoStage.active, true);
  assert.equal(screen.pair.disabled, false);
  assert.equal(sent, 0); assert.equal(acquired, 0);
  screen.unmount();
});

test('landscape keeps one full media surface without an unavailable point cloud panel', () => {
  const screen = mount({ dev: false, dimensions: { width: 753, height: 471, fontScale: 1 } });
  const background = node => Object.assign({}, ...node.props.style).backgroundColor;
  assert.equal(background(screen.find('control-video-pane')), '#F9F9FB');
  assert.equal(screen.find('control-pointcloud-unavailable'), undefined);
  assert.doesNotMatch(screen.copy, /点云未接入/);
  screen.render({ video: { phase: 'receiving', id: 'camera' } });
  assert.equal(screen.find('control-pointcloud-unavailable'), undefined);
  assert.equal(screen.videoStage.surface, undefined);
  screen.render({ videoSurface: { type: 'FixtureVideo', props: {} } });
  assert.equal(screen.find('control-pointcloud-unavailable'), undefined);
  screen.render({ video: { phase: 'stalled', id: 'camera' } });
  assert.equal(screen.find('control-pointcloud-unavailable'), undefined);
  screen.unmount();
});

test('compact landscape keeps the stop visible and moves lease management into settings', () => {
  for (const dimensions of [{ width: 660, height: 430, fontScale: 1 }, { width: 753, height: 471, fontScale: 1.25 }]) {
    const screen = mount({ dev: false, dimensions });
    assert.ok(screen.find('control-action-stop'));
    assert.ok(screen.find('control-telemetry-battery'));
    assert.equal(screen.find('control-compact-telemetry'), undefined);
    screen.unmount();
  }
  const hardware = physicalFixture();
  const screen = mount({
    dev: false, dimensions: { width: 753, height: 471, fontScale: 1 },
    inputSource: 'physical', g20Controller: hardware.controller,
    controlSession: { label: '未连接', canAcquire: false, leaseActive: false, busy: false, onAcquire() { }, onRelease() { } }
  });
  screen.find('control-open-more').props.onPress(); screen.render();
  screen.find('control-settings-tab-连接与设备').props.onPress(); screen.render();
  assert.ok(screen.find('control-lease'));
  assert.ok(screen.find('control-action-stop'));
  screen.unmount();
});

test('video HUD loss retires the old touch context and recovery does not replay it', () => {
  let sent = 0;
  const screen = mount({
    dev: false, dimensions: { width: 1250, height: 650, fontScale: 1 },
    ...capableProps(), connected: true, video: { phase: 'receiving', id: 'fixture-camera' },
    productionInput: { ready: true, onDrive() { sent++; }, onTurn() { sent++; }, onInterrupt() { } }
  });
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
    for (const id of ['battery', 'signal']) assert.ok(screen.find(`control-telemetry-${id}`));
    assert.match(screen.copy, /未连接/);
    assert.match(screen.copy, /—/);
    assert.ok(screen.find('control-action-stop'));
    assert.ok(screen.find('control-action-stand'));
    assert.ok(screen.find('control-action-sit'));
    assert.equal(screen.find('control-motor-toggle'), undefined);
    screen.find('control-open-connection').props.onPress(); assert.equal(opened, 1);
    assert.equal(screen.pair.disabled, false);
    assert.equal(screen.pair.left.onSample, undefined);
    screen.unmount();
  }
});

test('video HUD omits speed and keeps only identified signal and battery sources', () => {
  const screen = mount({
    dev: false, dimensions: { width: 1250, height: 650, fontScale: 1 },
    runtimeState: {
      speed: { linearMps: .8, lateralMps: 0, yawRps: 0, source: 'command' },
      signal: { qualityPercent: 78, source: 'unknown' }, battery: { percent: null, voltageV: 48.1, source: 'unknown' },
    }
  });
  assert.equal(screen.find('control-telemetry-speed'), undefined);
  assert.doesNotMatch(screen.copy, /78%|48\.1\s*V/);
  screen.render({
    runtimeState: {
      speed: { linearMps: .2, lateralMps: 0, yawRps: 0, source: 'device' },
      signal: { qualityPercent: 71, source: 'controller' }, battery: { percent: null, voltageV: 48.1, source: 'device' },
    }
  });
  assert.equal(screen.find('control-telemetry-speed'), undefined);
  assert.match(screen.find('control-telemetry-signal').props.accessibilityLabel, /71%/); assert.doesNotMatch(screen.copy, /48\.1\s*V/);
  assert.equal(screen.pair.left.onSample, undefined, 'receiving telemetry is not an actuator permission');
  screen.unmount();
});

test('touch starts permission from a new press and stops only after both discs release', () => {
  let begins = 0, stops = 0;
  const screen = mount({
    dev: false, connected: true, canUseManualControl: false,
    productionInput: { ready: false, touchReady: true, onTouchBegin() { begins++; }, onDrive() { }, onTurn() { }, onInterrupt() { stops++; } },
    controlSession: { canAcquire: true, leaseActive: false, busy: false, onAcquire() { }, onRelease() { } }
  });
  assert.equal(screen.pair.disabled, false);
  assert.doesNotMatch(screen.copy, /启用控制/);
  const before = stops;
  screen.pair.left.onActiveChange(true); screen.render();
  screen.pair.right.onActiveChange(true); screen.render();
  assert.equal(begins, 1);
  screen.pair.left.onActiveChange(false); screen.render();
  assert.equal(stops, before);
  screen.pair.right.onActiveChange(false); screen.render();
  assert.equal(stops, before + 1);
  screen.pair.left.onActiveChange(true);
  assert.equal(begins, 2);
  screen.unmount();
});

test('touch release uses the neutral callback and blocked posture has a visible reason', () => {
  let ends = 0;
  const input = { ready: false, touchReady: true, onTouchBegin() { }, onTouchEnd() { ends++; }, onDrive() { }, onTurn() { }, onInterrupt() { } };
  const screen = mount({ dev: false, connected: true, canUseManualControl: false, productionInput: input });
  screen.pair.left.onActiveChange(true); screen.render();
  screen.pair.left.onActiveChange(false); screen.render();
  assert.equal(ends, 1);
  screen.render({ productionInput: { ...input, touchReady: false }, manualControlBlockedReason: '请先站立' });
  assert.equal(screen.pair.disabled, true);
  assert.match(screen.copy, /请先站立/);
  screen.unmount();
});

function selectLeftCategory(screen, category) {
  if (category === 'policy') {
    if (screen.find('control-hud-action-dock')) {
      screen.find('control-hud-category-action').props.onPress();
      screen.render();
    }
    return;
  }
  const dockId = category === 'posture'
    ? 'control-hud-posture-dock'
    : 'control-hud-action-dock';
  if (!screen.find(dockId) && screen.find(`control-hud-category-${category}`)) {
    screen.find(`control-hud-category-${category}`).props.onPress();
    screen.render();
  }
}

test('receiving landscape video renders G20 HUD controls and confirms eligible terrain changes', async () => {
  const terrainRuntime = {
    controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled',
    deviceIdentity: 'bound-unverified', faultStatus: 'clear', inputSource: 'touch',
    speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' },
    signal: { qualityPercent: 72, latencyMs: 18, source: 'controller' },
    cellular: { connected: true, networkLabel: '5G', bars: 4, source: 'controller' },
    robotLinkLatencyMs: 24,
    currentPolicy: { id: 'flat', label: '平地模式', terrainModeId: 'flat' },
    policyCatalogStatus: 'synced',
    policyOptions: [
      { id: 'flat', label: '平地模式', terrainModeId: 'flat' },
      { id: 'stairs', label: '楼梯模式', terrainModeId: 'stairs' },
      { id: 'platform', label: '高台模式', terrainModeId: 'platform' },
    ],
    terrainMode: {
      current: 'flat', catalogStatus: 'synced', source: 'device',
      options: [
        { id: 'flat', label: '平地模式' },
        { id: 'stairs', label: '楼梯模式' },
        { id: 'platform', label: '高台模式' },
      ],
    },
  };
  const policies = [];
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: true, dimensions: { width: 844, height: 390, fontScale: 1 }, allowInteractionPreview: true,
    connected: true, batteryPercent: 80, safetyLock: false,
    runtimeState: terrainRuntime,
    operationReadiness: { stand: { ready: true }, sit: { ready: true }, stop: { ready: true }, switchPolicy: { ready: true } },
    operationCallbacks: { stand() { }, sit() { }, stop() { }, switchPolicy(id) { policies.push(id); } },
  });
  const flat = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
  const officialSize = Math.min(240, Math.floor(Math.min(844 * .18, 390 * .30) / 1.42));
  assert.ok(screen.find('control-landscape-hud'));
  assert.equal(screen.find('control-action-dock'), undefined);
  assert.equal(screen.videoStage, undefined);
  assert.ok(screen.find('control-hud-video-empty'));
  assert.match(screen.copy, /等待画面/);
  assert.ok(screen.find('control-hud-status-bar'));
  assert.ok(screen.find('control-hud-stop'));
  assert.ok(screen.find('control-hud-mode-header'));
  assert.ok(screen.find('control-hud-open-status'));
  assert.equal(screen.find('control-hud-fault-badge'), undefined);
  assert.ok(screen.find('control-hud-cellular'));
  assert.ok(screen.find('control-hud-robot-signal'));
  assert.ok(screen.find('control-hud-wifi-signal'));
  assert.match(screen.copy, /5G/);
  assert.match(screen.copy, /24ms/);
  assert.match(screen.copy, /72%/);
  assert.equal(flat(screen.find('control-video-backdrop').props.style).backgroundColor, 'transparent');
  assert.equal(screen.pair.variant, 'glass');
  assert.equal(screen.pair.floating, true);
  assert.equal(screen.pair.size, officialSize);
  assert.ok(screen.pair.layout);
  const stickFrame = flat(screen.find('control-immersive-sticks').props.style);
  assert.ok(stickFrame.top > 0 && stickFrame.bottom > 0 && stickFrame.top + stickFrame.bottom < 390);
  assert.equal(stickFrame.left, 16); assert.equal(stickFrame.right, 16);
  assert.equal(screen.pair.right.axis, 'x');
  assert.equal(screen.pair.left.axis, 'xy');
  assert.match(screen.copy, /THUNDER-01/); assert.match(screen.copy, /已连接/);
  assert.match(screen.copy, /本设备控制/);
  assert.match(screen.copy, /设备已解锁/);
  assert.match(screen.find('control-hud-battery-bar').props.children ? screen.copy : '', /80%/);
  assert.ok(screen.find('control-hud-terrain-capsule-flat'));
  assert.match(screen.copy, /平地/);
  assert.match(screen.copy, /楼梯/);
  assert.match(screen.copy, /高台/);
  assert.equal(screen.find('control-hud-terrain-capsule-stairs').props.disabled, false);

  assert.equal(screen.find('control-hud-quick-stand').props.accessibilityState.selected, true);
  assert.match(screen.copy, /坐下/);
  assert.equal(screen.find('control-hud-posture-recover'), undefined);

  selectLeftCategory(screen, 'action');
  assert.equal(screen.find('control-hud-hero-speed'), undefined, 'Action Studio hides top-left telemetry for clean focus');
  assert.ok(screen.find('control-hud-basic-action-walk'));
  assert.equal(screen.find('control-hud-basic-action-step'), undefined);
  assert.equal(screen.find('control-hud-basic-action-wave'), undefined);
  selectLeftCategory(screen, 'policy');
  assert.ok(screen.find('control-hud-hero-speed'));

  assert.equal(screen.find('control-hud-lidar'), undefined);
  assert.equal(screen.find('control-hud-map'), undefined);
  assert.doesNotMatch(screen.copy, /点云未接入/);
  assert.match(screen.find('control-hud-settings').props.accessibilityLabel, /设置/);
  assert.doesNotMatch(screen.copy, /躺下|跤下|蹬下|趾下|无画面|机身高度|抬腿高度|机身温度|电机温度|握手|伸懒腰/);

  screen.render({ video: { id: 'preview-camera', phase: 'receiving' }, videoSurface: 'plate' });
  assert.ok(screen.videoStage);
  assert.equal(screen.find('control-hud-video-empty'), undefined);
  assert.equal(screen.videoStage.presentation.phase, 'receiving');
  assert.equal(screen.pair.size, officialSize);
  assert.equal(flat(screen.find('control-immersive-sticks').props.style).bottom, stickFrame.bottom);
  const beforeFold = flat(screen.find('control-immersive-sticks').props.style);

  // Collapse dashboard (⑩) and verify collapsed tray then expand again.
  assert.ok(screen.find('control-hud-dashboard-expanded'));
  screen.find('control-hud-dashboard-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-dashboard-collapsed'));
  assert.doesNotMatch(screen.copy, /-- KM/);
  assert.ok(screen.find('control-hud-stop'));
  assert.ok(screen.find('control-hud-settings'));
  assert.ok(screen.videoStage);
  assert.equal(screen.pair.size, officialSize);
  assert.deepEqual(flat(screen.find('control-immersive-sticks').props.style), beforeFold);
  screen.find('control-hud-dashboard-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-dashboard-expanded'));

  screen.render({ video: undefined, videoSurface: undefined, runtimeState: { ...terrainRuntime, speed: { linearMps: 0.4, lateralMps: 0, yawRps: 0, source: 'device' } } });
  selectLeftCategory(screen, 'policy');
  assert.equal(screen.find('control-hud-terrain-capsule-stairs').props.disabled, true);
  assert.match(screen.find('control-hud-terrain-capsule-stairs').props.accessibilityHint, /行走中不可切换/);
  assert.deepEqual(policies, []);
  screen.render({ safetyLock: true, runtimeState: { ...terrainRuntime, controlAuthority: 'not-held' } });
  assert.equal(screen.find('control-hud-unlocked'), undefined);
  assert.equal(screen.find('control-hud-local-control'), undefined);
  screen.render({ safetyLock: false, runtimeState: terrainRuntime });
  selectLeftCategory(screen, 'policy');
  screen.find('control-hud-terrain-capsule-stairs').props.onPress();
  screen.render();
  assert.deepEqual(policies, [], 'changing terrain still requires confirmation');
  screen.find('control-immersive-confirm').props.onPress();
  await screen.settle();
  assert.deepEqual(policies, ['stairs']);
  screen.unmount();
});

test('landscape settings stay open when the hidden joystick frame reports a new size', () => {
  const screen = mount({ dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, landscapeDocksExpanded: true });
  const reportStickArea = (width, height) => {
    screen.find('control-immersive-sticks').props.onLayout({ nativeEvent: { layout: { width, height } } });
    screen.render();
  };
  reportStickArea(828, 180);
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-操控'));
  reportStickArea(844, 220);
  assert.ok(screen.find('control-settings-page-操控'));
  assert.equal(screen.pair.disabled, true);
  screen.find('control-close-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-landscape-hud'));
  screen.unmount();
});

test('connected landscape stand, sit, and stop call the live operation callbacks', async () => {
  const calls = [];
  const runtime = { controlLink: 'connected', controlAuthority: 'held', motorState: 'enabled', posture: 'sitting' };
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, connected: true,
    runtimeState: runtime,
    operationReadiness: {
      stand: { ready: true },
      sit: { ready: false, blockedReason: '电机须已使能，且机器狗当前已站立' },
      stop: { ready: true },
    },
    operationCallbacks: {
      stand: async () => { calls.push('stand'); },
      sit: async () => { calls.push('sit'); },
      stop: async () => { calls.push('stop'); },
    },
  });
  screen.find('control-hud-stop').props.onPress();
  await screen.settle();
  assert.deepEqual(calls, ['stop']);
  assert.match(screen.copy, /请求已接受/);
  screen.find('control-hud-quick-stand').props.onPress();
  await screen.settle();
  assert.deepEqual(calls, ['stop', 'stand']);
  screen.render({
    runtimeState: { ...runtime, posture: 'standing' },
    operationReadiness: {
      stand: { ready: false, blockedReason: '电机须已使能，行走后请先停止并释放控制；站立或切换中不可起立' },
      sit: { ready: true },
      stop: { ready: true },
    },
  });
  screen.find('control-hud-quick-sit').props.onPress();
  await screen.settle();
  assert.deepEqual(calls, ['stop', 'stand', 'sit']);
  assert.equal(screen.find('control-hud-posture-recover'), undefined);
  assert.equal([...screen.copy].some(ch => ch.codePointAt(0) === 0x8DBA), false);
  assert.doesNotMatch(screen.copy, /躺下|蹬下|趿下/);
  screen.render({ operationReadiness: { stand: { ready: false, blockedReason: '尚未取得控制权' }, sit: { ready: false, blockedReason: '尚未取得控制权' }, stop: { ready: false, blockedReason: '尚未取得控制权' } } });
  assert.equal(screen.find('control-hud-stop').props.disabled, true);
  assert.equal(calls.length, 3);
  screen.unmount();
});

test('landscape emergency stop still sends while a posture command is in flight', async () => {
  const calls = [];
  let finishSit;
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', motorState: 'enabled', posture: 'standing' },
    operationReadiness: { sit: { ready: true }, stop: { ready: true } },
    operationCallbacks: {
      sit: () => { calls.push('sit'); return new Promise(resolve => { finishSit = resolve; }); },
      stop: async () => { calls.push('stop'); },
    },
  });
  screen.find('control-hud-quick-sit').props.onPress();
  screen.render();
  assert.deepEqual(calls, ['sit']);
  assert.equal(screen.find('control-hud-stop').props.disabled, false);
  screen.find('control-hud-stop').props.onPress();
  await screen.settle();
  assert.deepEqual(calls, ['sit', 'stop']);
  finishSit();
  await screen.settle();
  assert.equal(calls.length, 2);
  screen.unmount();
});

const recoveryProfile = {
  current: 'flat', available: ['flat'], descriptions: [''], currentDescription: '',
  modeCapabilities: [{ id: 'recovery', kind: 'recovery-action', label: '摔倒恢复', available: true, unavailableReason: '' }],
};
function recoveryStatus(patch = {}) {
  return {
    service: 'ready', phase: 'absent', sessionSelected: false, modelConfigured: true, enableSequenceVerified: true,
    stableStand: false, locomotionAvailable: false, activeModeId: null, reason: 'none', detail: '',
    heartbeatFresh: null, heartbeatError: null, ...patch,
  };
}

test('one confirmed press enters recovery and a stable stand returns through Exit', async () => {
  const commands = [];
  const policies = [];
  const standing = { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };
  const onCommand = async command => {
    commands.push(command);
    if (command === 'enter') return recoveryStatus({ phase: 'selected', sessionSelected: true, heartbeatFresh: true });
    if (command === 'enable') return recoveryStatus({ phase: 'enabled', sessionSelected: true, heartbeatFresh: true });
    if (command === 'start') return recoveryStatus({ phase: 'getting-up', sessionSelected: true, heartbeatFresh: true });
    if (command === 'cancel') return recoveryStatus();
    if (command === 'exit') return recoveryStatus({ stableStand: true, locomotionAvailable: true });
    throw new Error(command);
  };
  const recovery = { status: recoveryStatus(), profile: recoveryProfile, onCommand };
  const screen = mount({
    dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, connected: true,
    runtimeState: standing,
    operationCallbacks: { stand() { }, sit() { }, stop() { }, switchPolicy(id) { policies.push(id); } },
    recovery,
  });
  assert.deepEqual(commands, [], 'opening the control screen must not enter recovery');
  const dock = () => screen.find('control-hud-posture-recover');
  assert.equal(dock().props.disabled, false);
  assert.equal(dock().props.accessibilityLabel, '摔倒恢复');
  assert.equal(screen.find('control-recovery-begin'), undefined);
  assert.doesNotMatch(screen.copy, /进入恢复|使能恢复|摔倒起立|退出并回到运动/);
  dock().props.onPress();
  screen.render();
  assert.deepEqual(commands, []);
  assert.match(screen.copy, /摔倒恢复会让机器狗从倒地姿态起身/);
  assert.ok(screen.find('control-recovery-confirm-submit'));
  assert.equal(screen.copy.includes('确认') && screen.copy.includes('返回'), true);
  screen.find('control-recovery-confirm-dismiss').props.onPress();
  screen.render();
  assert.deepEqual(commands, []);
  dock().props.onPress();
  screen.render();
  screen.find('control-recovery-confirm-submit').props.onPress();
  await screen.settle();
  assert.deepEqual(commands, ['enter', 'enable', 'start']);
  assert.deepEqual(policies, []);
  screen.render({ recovery: { ...recovery, status: recoveryStatus({ phase: 'getting-up', sessionSelected: true, heartbeatFresh: true }) } });
  assert.equal(dock().props.accessibilityLabel, '取消恢复');
  assert.equal(dock().props.disabled, false);
  dock().props.onPress();
  await screen.settle();
  assert.deepEqual(commands, ['enter', 'enable', 'start', 'cancel']);
  screen.render({ recovery: { ...recovery, status: recoveryStatus({ phase: 'stable-stand', sessionSelected: true, stableStand: true, locomotionAvailable: true, heartbeatFresh: true }) } });
  assert.equal(dock().props.accessibilityLabel, '运动模式');
  dock().props.onPress();
  await screen.settle();
  assert.deepEqual(commands.at(-1), 'exit');
  assert.deepEqual(policies, []);
  screen.render({ recovery: { ...recovery, status: recoveryStatus({ modelConfigured: false }) }, runtimeState: standing });
  assert.equal(dock().props.disabled, true);
  assert.match(dock().props.accessibilityHint, /模型尚未配置/);
  assert.doesNotMatch(screen.copy, /模型尚未配置/, 'blocked reasons stay in the hint, not as a floating card');
  screen.render({ recovery: { ...recovery, status: recoveryStatus() }, runtimeState: { ...standing, speed: { linearMps: 0.4, lateralMps: 0, yawRps: 0, source: 'device' } } });
  assert.equal(dock().props.disabled, true);
  assert.match(dock().props.accessibilityHint, /行走中不可切换/);
  screen.render({ recovery: { ...recovery, status: recoveryStatus({ enableSequenceVerified: false }) }, runtimeState: standing });
  assert.equal(dock().props.disabled, true);
  assert.match(dock().props.accessibilityHint, /使能顺序尚未核验/);
  assert.equal([...screen.copy].some(char => char.codePointAt(0) === 0x8DBA), false);
  screen.unmount();
});

test('portrait recovery offers one button and does not open when the channel is absent', () => {
  const standing = { controlLink: 'connected', controlAuthority: 'held', posture: 'sitting', motorState: 'disabled', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false, connected: true, runtimeState: standing,
    recovery: { status: recoveryStatus(), profile: recoveryProfile, onCommand: async () => { throw new Error('未确认，不应调用'); } },
  });
  assert.equal(screen.find('control-recovery-begin').props.accessibilityState.disabled, false);
  assert.match(screen.copy, /摔倒恢复/);
  assert.equal(screen.find('control-hud-posture-recover'), undefined);
  assert.doesNotMatch(screen.copy, /进入恢复|使能恢复|摔倒起立|退出并回到运动/);
  screen.unmount();
  const closed = mount({ landscapeDocksExpanded: true, dev: false, dimensions: { width: 844, height: 390, fontScale: 1 }, connected: true, runtimeState: standing });
  assert.equal(closed.find('control-hud-posture-recover'), undefined);
  closed.unmount();
});

test('HUD status badges stay conditional and truthful across fault, cellular, robot link, and WiFi', () => {
  const jointsWithFault = [
    { id: '3', label: '前左髋', online: true, positionDeg: 80, temperatureC: 84, fault: 'active', errors: [7], source: 'device' },
    { id: '4', label: '前左大腿', online: true, positionDeg: 120, temperatureC: 68, fault: 'clear', errors: [], source: 'device' },
  ];
  const screen = mount({ landscapeDocksExpanded: true, dev: false, dimensions: { width: 844, height: 390, fontScale: 1 } });
  // Disconnected: fault badge, cellular, robot link, and WiFi badges remain hidden.
  assert.equal(screen.find('control-hud-fault-badge'), undefined);
  assert.equal(screen.find('control-hud-cellular'), undefined);
  assert.equal(screen.find('control-hud-robot-signal'), undefined);
  assert.equal(screen.find('control-hud-wifi-signal'), undefined);
  assert.doesNotMatch(screen.copy, /67%|18\.08 KM|900ms/);

  screen.render({
    connected: true,
    runtimeState: {
      controlLink: 'connected',
      faultStatus: 'active',
      faultSummary: '前左髋电机过温',
      cellular: { connected: true, networkLabel: '5G', bars: 3, source: 'controller' },
      signal: { qualityPercent: 86, latencyMs: 14, source: 'controller' },
      robotLinkLatencyMs: 14,
      joints: jointsWithFault,
    },
  });
  assert.ok(screen.find('control-hud-fault-badge'));
  assert.ok(screen.find('control-hud-cellular'));
  assert.ok(screen.find('control-hud-robot-signal'));
  assert.ok(screen.find('control-hud-wifi-signal'));
  screen.find('control-hud-fault-badge').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-fault-panel'));
  assert.match(screen.copy, /异常列表/);
  assert.match(screen.copy, /前左髋电机过温/);
  screen.find('control-hud-fault-panel-close').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-fault-panel'), undefined);
  screen.unmount();
});

test('HUD speed limiter scales manual drive and turn proportionally and L1 toggles joint panels', () => {
  const sent = [];
  const hardware = physicalFixture();
  const joints = [
    { id: '3', label: '前左髋', online: true, positionDeg: 80, temperatureC: 38, fault: 'clear', errors: [], source: 'device' },
    { id: '4', label: '前左大腿', online: true, positionDeg: 120, temperatureC: 71, fault: 'clear', errors: [], source: 'device' },
    { id: '5', label: '前左小腿', online: true, positionDeg: 117, temperatureC: 88, fault: 'active', errors: [2], source: 'device' },
    { id: '13', label: '前左足轮', online: true, velocityRps: 3.01, temperatureC: 44, fault: 'clear', errors: [], source: 'device' },
    { id: '0', label: '前右髋', online: true, positionDeg: 45, temperatureC: 40, fault: 'clear', errors: [], source: 'device' },
  ];
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    ...capableProps(),
    g20Controller: hardware.controller,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled', joints },
    productionInput: {
      ready: true,
      onDrive(value) { sent.push(['drive', value]); },
      onTurn(value) { sent.push(['turn', value]); },
      onSticks(drive, turn) { sent.push(['sticks', drive, turn]); },
      onInterrupt() { },
    },
  });

  // Expand speed limit slider (⑱) and decrease from 100% to 80%.
  screen.find('control-hud-speed-limit-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-speed-limit-bar'));
  screen.find('control-hud-speed-limit-dec').props.onPress();
  screen.render();
  screen.find('control-hud-speed-limit-dec').props.onPress();
  screen.render();
  assert.match(screen.copy, /80%/);
  screen.pair.left.onSample({ x: 0.5, y: -1 });
  screen.pair.right.onSample({ x: 0.5, y: 0 });
  assert.ok(Math.abs(sent[0][1].y + 0.8) < 1e-6);
  assert.ok(Math.abs(sent[1][1].x - 0.4) < 1e-6);

  // Open joint parameters (㉜) & switch leg tabs (`左前腿` -> `右前腿`).
  screen.find('control-hud-joint-params-toggle').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-joint-params-toggle').props.accessibilityState.selected, true);
  assert.ok(screen.find('control-hud-joint-params-panel'));
  assert.match(screen.copy, /80°/);
  assert.match(screen.copy, /3\.01 rad\/s/);
  screen.find('control-hud-leg-tab-front-right').props.onPress();
  screen.render();
  assert.match(screen.copy, /45°/);

  // Open joint temperature (㉙) and verify motor -> driver toggle is truthful.
  screen.find('control-hud-joint-temp-toggle').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-joint-temp-toggle').props.accessibilityState.selected, true);
  assert.ok(screen.find('control-hud-joint-temp-panel'));
  assert.match(screen.copy, /71°/);
  assert.match(screen.copy, /88°/);
  screen.find('control-hud-temp-tab-driver').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-driver-temp-note'));

  // Toggle dual wide-angle camera + PiP swap (㉑, ㉒, ㉘).
  assert.equal(screen.find('control-hud-pip-window'), undefined);
  screen.find('control-hud-camera-count-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-pip-window'));
  screen.find('control-hud-pip-window').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-rear-video-empty'));
  screen.find('control-hud-camera-swap').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-video-empty'));

  // Physical G20 L1 shortcut (`toggleJointParams`) closes the joint params panel cleanly.
  screen.render({ inputSource: 'physical' });
  hardware.sample();
  hardware.sample({ pressed: ['toggleJointParams'] });
  screen.render();
  assert.equal(screen.find('control-hud-joint-params-panel'), undefined);
  screen.unmount();
});

test('landscape HUD motor power button displays explicit label and confirms enable/disable', async () => {
  const calls = [];
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: true,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', motorState: 'disabled', posture: 'sitting' },
    operationReadiness: {
      enableMotor: { ready: true },
      disableMotor: { ready: true },
      stand: { ready: false, blockedReason: '电机须已使能' },
      stop: { ready: true },
    },
    operationCallbacks: {
      enableMotor: async () => { calls.push('enable'); },
      disableMotor: async () => { calls.push('disable'); },
      stand: async () => { calls.push('stand'); },
      stop: async () => { calls.push('stop'); },
    },
  });
  const powerBtn = () => screen.find('control-hud-motor-power');
  assert.ok(powerBtn());
  assert.equal(powerBtn().props.disabled, false);
  assert.equal(powerBtn().props.accessibilityLabel, '使能电机');
  assert.equal(powerBtn().props.accessibilityState.checked, false);
  assert.match(screen.copy, /使能/);

  powerBtn().props.onPress();
  screen.render();
  assert.deepEqual(calls, [], 'motor power trigger still requires confirmation');
  assert.ok(screen.find('control-immersive-confirm'));
  screen.find('control-immersive-confirm').props.onPress();
  await screen.settle();
  assert.deepEqual(calls, ['enable']);

  screen.render({
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', motorState: 'enabled', posture: 'sitting' },
  });
  assert.equal(powerBtn().props.accessibilityLabel, '失能电机');
  assert.equal(powerBtn().props.accessibilityState.checked, true);
  assert.match(screen.copy, /失能/);
  screen.unmount();
});

test('G20 camera HUD settings overlay keeps live video HUD mounted, updates HUD preferences, and preserves emergency stop', async () => {
  let stops = 0;
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' },
    operationReadiness: { stop: { ready: true } },
    operationCallbacks: { stop: async () => { stops++; } },
  });

  assert.ok(screen.find('control-landscape-hud'));
  assert.equal(screen.videoStage.presentation.phase, 'receiving');

  screen.find('control-hud-settings').props.onPress();
  screen.render();

  // Live video HUD remains mounted underneath the frosted dark console while sticks stay locked.
  assert.ok(screen.find('control-landscape-hud'));
  assert.equal(screen.videoStage.presentation.phase, 'receiving');
  assert.ok(screen.find('control-settings-menu'));
  assert.ok(screen.find('control-settings-page-操控'));
  assert.equal(screen.pair.disabled, true);

  // Speed limit preset updates inside 操控 tab.
  screen.find('control-setting-speed-preset-60').props.onPress();
  screen.render();
  assert.equal(screen.find('control-setting-speed-value').props.children, '60%');

  // Switch to 图传与音频 tab and toggle dual camera + primary swap + standby scene picker.
  screen.find('control-settings-tab-图传与音频').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-图传与音频'));
  assert.ok(screen.find('control-settings-standby-scene-picker'));
  screen.find('control-setting-scene-gallery').props.onPress();
  screen.render();
  screen.find('control-setting-dual-camera').props.onPress();
  screen.render();
  screen.find('control-setting-camera-swap').props.onPress();
  screen.render();

  // Switch to 连接与设备 tab and toggle bottom dashboard expansion.
  screen.find('control-settings-tab-连接与设备').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-连接与设备'));
  assert.ok(screen.find('control-settings-hotspot-radar'));
  screen.find('control-setting-hud-dashboard').props.onPress();
  screen.render();

  // Emergency stop in the top HUD bar remains live while settings is open and closes the overlay immediately.
  screen.find('control-hud-stop').props.onPress();
  await screen.settle();
  assert.equal(stops, 1);
  assert.equal(screen.find('control-settings-menu'), undefined);
  assert.ok(screen.find('control-landscape-hud'));
  assert.ok(screen.find('control-hud-pip-window'));
  assert.ok(screen.find('control-hud-dashboard-collapsed'));
  assert.match(screen.find('control-hud-speed-limit-toggle').props.accessibilityLabel, /60%/);
  screen.unmount();
});

test('landscape HUD capture and recording fail closed without receiving stream and auto-save on backgrounding', async () => {
  const captured = [];
  let recordSeq = 0;
  const stopEvents = [];
  const fakeAdapter = {
    supported: true,
    storageTargetLabel: '系统相册 Pictures/Movies/DOSO',
    async capturePhoto(input) {
      captured.push(input);
      return {
        fileName: `DOSO_SNAP_test_${input.camera}.jpg`,
        width: 1920,
        height: 1080,
        bytes: 4096,
        locationLabel: '系统相册 Pictures/DOSO',
      };
    },
    async startRecording(input) {
      const id = ++recordSeq;
      const fileName = `DOSO_REC_test_${id}_${input.camera}.mp4`;
      return {
        fileName,
        mimeType: 'video/mp4',
        async stop() {
          stopEvents.push(fileName);
          return {
            fileName,
            durationMs: 1200,
            bytes: 8192,
            mimeType: 'video/mp4',
            locationLabel: '系统相册 Movies/DOSO',
          };
        },
        async cancel() {
          stopEvents.push(`cancel:${fileName}`);
        },
      };
    },
  };

  // 1. Disconnected / unconfigured stream fails closed on tap.
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    mediaCaptureAdapter: fakeAdapter,
  });
  screen.find('control-hud-photo-capture').props.onPress();
  await screen.settle();
  assert.match(screen.find('control-hud-notice').props.children.props.children, /暂无可抓拍/);
  screen.find('control-hud-record-toggle').props.onPress();
  await screen.settle();
  assert.match(screen.find('control-hud-notice').props.children.props.children, /暂无可录制/);
  assert.equal(captured.length, 0);

  // 2. Receiving front stream enables snapshot and recording.
  const frontStream = { id: 'front-live-stream' };
  const rearStream = { id: 'rear-live-stream' };
  screen.render({
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'front-plate',
    videoStream: frontStream,
    videoRotation: 90,
    rearVideo: { id: 'sim-rear', phase: 'receiving' },
    rearVideoSurface: 'rear-plate',
    rearVideoStream: rearStream,
    rearVideoRotation: 0,
  });

  screen.find('control-hud-photo-capture').props.onPress();
  await screen.settle();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].camera, 'front');
  assert.equal(captured[0].stream, frontStream);
  assert.equal(captured[0].rotation, 90);
  assert.match(screen.find('control-hud-notice').props.children.props.children, /DOSO_SNAP_test_front\.jpg/);

  screen.find('control-hud-record-toggle').props.onPress();
  await screen.settle();
  assert.ok(screen.find('control-hud-recording-badge'));
  assert.equal(screen.find('control-hud-record-toggle').props.accessibilityState.selected, true);

  screen.advance(1000);
  screen.advance(1000);
  assert.match(JSON.stringify(screen.find('control-hud-recording-badge')), /REC 00:02/);

  // Settings -> 图传与音频 tab shows live status, storage location, and quick controls with interactive auto-recording toggle.
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  screen.find('control-settings-tab-图传与音频').props.onPress();
  screen.render();
  assert.ok(screen.find('control-setting-recording'));
  assert.ok(screen.find('control-setting-record-toggle'));
  assert.match(screen.copy, /DOSO_SNAP_test_front\.jpg/);

  screen.find('control-setting-record-toggle').props.onPress();
  await screen.settle();
  assert.deepEqual(stopEvents, ['DOSO_REC_test_1_front.mp4']);
  assert.equal(screen.find('control-hud-recording-badge'), undefined);

  // Switching to rear camera captures rear stream, and app backgrounding auto-saves active recording.
  screen.find('control-close-settings').props.onPress();
  screen.render();
  screen.find('control-hud-camera-swap').props.onPress();
  screen.render();
  screen.find('control-hud-record-toggle').props.onPress();
  await screen.settle();
  assert.ok(screen.find('control-hud-recording-badge'));

  screen.background('background');
  await screen.settle();
  assert.deepEqual(stopEvents, ['DOSO_REC_test_1_front.mp4', 'DOSO_REC_test_2_rear.mp4']);
  assert.equal(screen.find('control-hud-recording-badge'), undefined);
  screen.unmount();
});

test('landscape and settings gesture decks group 35 gestures, toggle single-instance GIF preview, and guard standing-only execution', async () => {
  const gestureIndex = JSON.parse(readFileSync(new URL('../gesture/index.json', import.meta.url), 'utf8'));
  const catalog = gestureIndex.gestures.map(item => ({
    name: item.name,
    description: item.description,
    durationMs: item.duration_ms,
  }));
  assert.equal(catalog.length, 35);

  const played = [];
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'sitting', motorState: 'enabled' },
    onListGestures: async () => catalog,
    operationReadiness: {
      playGesture: { ready: false, blockedReason: '请先站立' },
      stop: { ready: true },
    },
    operationCallbacks: {
      playGesture: async name => { played.push(name); },
      stop: async () => { },
    },
  });
  await screen.settle();

  selectLeftCategory(screen, 'action');
  assert.ok(screen.find('control-hud-gesture-deck'));
  assert.ok(screen.find('control-hud-gesture-cat-all'));
  assert.ok(screen.find('control-hud-gesture-cat-social'));
  assert.ok(screen.find('control-hud-gesture-cat-observe'));
  assert.ok(screen.find('control-hud-gesture-cat-rhythm'));
  assert.ok(screen.find('control-hud-gesture-cat-stage'));

  // Only one preview Image is mounted in the inspector at any time.
  assert.ok(screen.find('control-hud-gesture-preview-image'));
  assert.equal(screen.find('control-hud-gesture-execute').props.disabled, true, 'grounded/non-standing blocks execution');
  assert.match(screen.copy, /请先站立/);

  // Filter to social category and select flip_play_bow (no duration seconds shown on Action Studio cards).
  screen.find('control-hud-gesture-cat-social').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-gesture-flip_play_bow'));
  assert.equal(screen.find('control-hud-gesture-stand_idle'), undefined);
  screen.find('control-hud-gesture-flip_play_bow').props.onPress();
  screen.render();
  assert.deepEqual(played, [], 'selecting a gesture previews it without accidental execution');
  assert.deepEqual(screen.find('control-hud-gesture-preview-image').props.source, { uri: 'asset://gestures/flip_play_bow.gif' });
  assert.doesNotMatch(screen.copy, /16\.0s/);
  assert.match(screen.copy, /执行「玩耍深鞠躬（长版）」/);

  // Toggle GIF preview off and back on.
  screen.find('control-hud-gesture-gif-toggle').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-gesture-preview-image'), undefined);
  screen.find('control-hud-gesture-gif-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-gesture-preview-image'));

  // Transition robot to Standing -> execute dispatches PlayGesture('flip_play_bow').
  screen.render({
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    operationReadiness: {
      playGesture: { ready: true },
      stop: { ready: true },
    },
  });
  assert.equal(screen.find('control-hud-gesture-execute').props.disabled, false);
  screen.find('control-hud-gesture-execute').props.onPress();
  await screen.settle();
  assert.deepEqual(played, ['flip_play_bow']);

  // Settings -> 机器狗维护 tab shares the same categorized deck and executes cleanly.
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  screen.find('control-settings-tab-机器狗维护').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-gesture-list'));
  assert.ok(screen.find('control-settings-gesture-preview-image'));
  screen.find('control-settings-gesture-cat-stage').props.onPress();
  screen.render();
  screen.find('control-settings-gesture-dance').props.onPress();
  screen.render();
  screen.find('control-settings-gesture-execute').props.onPress();
  await screen.settle();
  assert.deepEqual(played, ['flip_play_bow', 'dance']);
  screen.unmount();
});

test('1-click HUD voice dialogue connects to LingTu conversation API, enforces popover mutual exclusion, and handles replies and approvals', async () => {
  const apiCalls = [];
  let turnCompleted = false;
  let approvalState = 'pending';

  const voiceFetch = async (url, init = {}) => {
    const parsed = new URL(url);
    apiCalls.push({ method: init.method ?? 'GET', path: parsed.pathname + parsed.search, body: init.body ? JSON.parse(init.body) : null });

    if (parsed.pathname === '/api/v1/agent/options') {
      return { status: 200, json: async () => ({ available: true, default_model: 'kimi-k2.5' }) };
    }
    if (parsed.pathname === '/api/v1/agent/conversations' && init.method === 'POST') {
      return { status: 201, json: async () => ({ conversation_id: 'conv_dog_01' }) };
    }
    if (parsed.pathname === '/api/v1/agent/conversations/conv_dog_01' && (init.method ?? 'GET') === 'GET') {
      return {
        status: 200,
        json: async () => ({
          conversation_id: 'conv_dog_01',
          messages: turnCompleted
            ? [
              { id: 'm1', seq: 1, role: 'user', text: '查看状态', turn_id: 't1' },
              { id: 'm2', seq: 2, role: 'assistant', text: '当前电量充足，电机温度正常。', turn_id: 't1' },
            ]
            : [],
          turns: turnCompleted ? [{ turn_id: 't1', state: 'completed' }] : [],
          approvals: approvalState === 'pending' && turnCompleted
            ? [{ approval_id: 'ap_nav_1', turn_id: 't1', tool_name: 'start_navigation', arguments: { x: 2.5, y: 1.0 }, state: 'pending' }]
            : [],
        }),
      };
    }
    if (parsed.pathname === '/api/v1/agent/conversations/conv_dog_01/messages' && init.method === 'POST') {
      turnCompleted = true;
      return {
        status: 202,
        json: async () => ({ conversation_id: 'conv_dog_01', message_id: JSON.parse(init.body).message_id, turn_id: 't1', state: 'completed' }),
      };
    }
    if (parsed.pathname === '/api/v1/agent/conversations/conv_dog_01/approvals/ap_nav_1' && init.method === 'POST') {
      approvalState = JSON.parse(init.body).approved ? 'approved' : 'denied';
      return {
        status: 200,
        json: async () => ({ approval_id: 'ap_nav_1', turn_id: 't1', tool_name: 'start_navigation', arguments: { x: 2.5, y: 1.0 }, state: approvalState }),
      };
    }
    return { status: 404, json: async () => ({ error: 'not_found' }) };
  };

  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: true,
    canUseManualControl: true,
    allowLocalVoiceHttp: true,
    voiceFetch,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' },
    workspaceSettings: {
      themePreference: 'dark',
      onChangeTheme() { },
      alertsEnabled: true,
      onToggleAlerts() { },
      connection: {
        host: '192.168.66.64',
        port: 13145,
        connected: true,
        readonlyConnected: true,
        async onConnectControl() { return true; },
        async onDisconnect() { },
      },
    },
  });
  await screen.settle();

  // 1. 1-click HUD voice button exists and opens flush-left liquid-glass dialogue wing.
  assert.ok(screen.find('control-hud-voice-toggle'));
  assert.equal(screen.find('control-hud-voice-panel'), undefined);
  screen.find('control-hud-voice-toggle').props.onPress();
  await screen.settle();
  await screen.settle();
  await screen.settle();
  assert.ok(screen.find('control-hud-voice-wing'));
  assert.ok(screen.find('control-hud-voice-panel'));
  assert.equal(screen.find('control-voice-status').props.children, '就绪');

  // 2. Quick prompt in + popover sends message to LingTu :5050 conversation API and renders reply + pending action approval.
  screen.find('control-voice-quick-toggle').props.onPress();
  screen.render();
  screen.find('control-voice-quick-查看状态').props.onPress();
  await screen.settle();
  assert.ok(apiCalls.some(c => c.path === '/api/v1/agent/conversations/conv_dog_01/messages' && c.body?.text === '查看状态'));
  assert.ok(screen.find('control-voice-approval-ap_nav_1'));
  screen.find('control-voice-approve-ap_nav_1').props.onPress();
  await screen.settle();
  assert.equal(approvalState, 'approved');
  assert.equal(screen.find('control-voice-approval-ap_nav_1'), undefined);

  // 3. Popover mutual exclusion: opening 动作 ▾ closes voice panel; Settings -> 图传与音频 -> 打开对话 reopens voice panel.
  screen.find('control-hud-category-action').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-voice-panel'), undefined);
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  screen.find('control-settings-tab-图传与音频').props.onPress();
  screen.render();
  screen.find('control-setting-open-voice-chat').props.onPress();
  await screen.settle();
  assert.equal(screen.find('control-settings-menu'), undefined);
  assert.ok(screen.find('control-hud-voice-panel'));

  screen.unmount();
});

test('virtual disc toggle cancels active touch safely, hides discs, syncs with settings, and keeps E-stop + G20 physical sticks working', async () => {
  const defaultPrefs = controlPrefsModule.exports.createDefaultControlPreferences();
  assert.equal(defaultPrefs.showVirtualDiscControls, true);
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ showVirtualDiscControls: false }).showVirtualDiscControls, false);
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ showVirtualDiscControls: 'bad' }).showVirtualDiscControls, true);

  const sent = [];
  let interrupts = 0;
  let stops = 0;
  const hardware = physicalFixture();
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    ...capableProps(),
    g20Controller: hardware.controller,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' },
    operationReadiness: { stop: { ready: true } },
    operationCallbacks: { stop: async () => { stops += 1; } },
    productionInput: {
      ready: true,
      touchReady: true,
      onDrive(value) { sent.push(['drive', value]); },
      onTurn(value) { sent.push(['turn', value]); },
      onSticks(drive, turn) { sent.push(['sticks', drive, turn]); },
      onInterrupt() { interrupts += 1; },
    },
  });

  // Enabled by default on touch input: left velocity ('速度') & right yaw ('转向') discs visible; bottom-left dock stays clean (single Bot orb only).
  assert.ok(screen.pair);
  assert.equal(screen.pair.showVisuals, true);
  assert.equal(screen.pair.left.label, '速度');
  assert.equal(screen.pair.right.label, '转向');
  assert.equal(screen.find('control-hud-virtual-disc-toggle'), undefined);

  // Active touch emits velocity; toggling OFF via Settings -> 操控 -> 圆盘控制 immediately interrupts & blocks stale touch callbacks.
  const staleSample = screen.pair.left.onSample;
  screen.pair.left.onActiveChange(true);
  staleSample({ x: 0.4, y: -0.8 });
  assert.equal(sent.length, 1);
  const interruptsBeforeHide = interrupts;

  screen.find('control-hud-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-操控'));
  assert.equal(screen.find('control-setting-virtual-discs').props.accessibilityState.checked, true);
  screen.find('control-setting-virtual-discs').props.onPress();
  screen.render();
  assert.ok(interrupts > interruptsBeforeHide, 'hiding virtual discs must immediately interrupt active touch vector');
  assert.equal(screen.pair, undefined, 'control-joystick-pair must be hidden when showVirtualDiscControls is false');
  assert.equal(screen.find('control-setting-virtual-discs').props.accessibilityState.checked, false);
  screen.find('control-close-settings').props.onPress();
  screen.render();
  staleSample({ x: 0.9, y: -0.9 });
  assert.equal(sent.length, 1, 'stale touch callback cannot send motion after discs are hidden');

  // E-stop stays fully operational while virtual discs are hidden.
  assert.equal(screen.find('control-hud-stop').props.disabled, false);
  screen.find('control-hud-stop').props.onPress();
  await screen.settle();
  assert.equal(stops, 1);

  // G20 physical sticks remain 100% functional while virtual discs are hidden.
  screen.render({ inputSource: 'physical' });
  hardware.sample();
  hardware.sample({ moving: true });
  assert.ok(sent.some(([kind]) => kind === 'sticks'), 'G20 physical sticks must continue driving when virtual discs are hidden');

  // Settings -> 操控 tab shows 「圆盘控制」 toggle synced to false and re-enables the virtual discs cleanly.
  screen.render({ inputSource: 'touch' });
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-操控'));
  assert.equal(screen.find('control-setting-virtual-discs').props.accessibilityState.checked, false);
  assert.match(screen.copy, /圆盘控制/);
  assert.match(screen.copy, /速度与转向/);
  screen.find('control-setting-virtual-discs').props.onPress();
  screen.render();
  assert.equal(screen.find('control-setting-virtual-discs').props.accessibilityState.checked, true);
  screen.find('control-close-settings').props.onPress();
  screen.render();
  assert.ok(screen.pair);
  assert.equal(screen.pair.showVisuals, true);
  screen.unmount();
});

test('body height panel enforces safety guards, dynamic robot range, mutual exclusion, and height mode/slider/fine/preset controls', async () => {
  const modeCalls = [];
  const heightCalls = [];
  let refreshes = 0;

  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: false,
    runtimeState: { controlLink: 'disconnected', controlAuthority: 'not-held', posture: 'unknown', motorState: 'unknown' },
    onSetBodyHeightMode: async enabled => { modeCalls.push(enabled); },
    onSetBodyHeight: async heightM => { heightCalls.push(heightM); },
    onRefreshBodyHeight: async () => { refreshes += 1; },
  });

  // 1. Disconnected: open via center dock 姿态 -> 机身高度 (bottom-left dock stays clean) -> fallback 0.15–0.50 m range, all controls disabled with short truthful hint.
  assert.equal(screen.find('control-hud-height-toggle'), undefined);
  screen.find('control-hud-category-posture').props.onPress();
  screen.render();
  screen.find('control-hud-posture-height').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-height-panel'));
  assert.equal(screen.find('control-hud-height-range').props.children.props.children, '0.15–0.50 m');
  assert.equal(screen.find('control-hud-height-hint').props.children, '请先连接机器狗');
  assert.equal(screen.find('control-hud-height-mode-toggle').props.disabled, true);
  assert.equal(screen.find('control-hud-height-slider').props.disabled, true);
  assert.equal(screen.find('control-hud-height-dec').props.disabled, true);
  assert.equal(screen.find('control-hud-height-inc').props.disabled, true);
  assert.equal(screen.find('control-hud-height-preset-low').props.disabled, true);
  assert.doesNotMatch(screen.copy, /gRPC|SwitchProfile|SetBodyHeight|ONNX|暂未接入/);

  // 2. Mutual exclusion: opening 姿态 drawer closes height panel; clicking 姿态 -> 机身高度 reopens it and refreshes when connected.
  screen.render({
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    bodyHeight: {
      available: true,
      modeId: 'height',
      active: false,
      supported: false,
      currentHeightM: 0,
      targetHeightM: 0,
      defaultHeightM: 0.375,
      minHeightM: 0.25,
      maxHeightM: 0.50,
      rateMps: 0.05,
    },
  });
  screen.find('control-hud-category-posture').props.onPress();
  screen.render();
  screen.find('control-hud-posture-height').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-height-panel'));
  assert.equal(refreshes, 1);

  // 3. Connected with height_v2 bounds (0.25–0.50 m) while mode inactive: slider disabled, hint '请先开启高度模式', mode toggle enabled.
  assert.equal(screen.find('control-hud-height-range').props.children.props.children, '0.25–0.50 m');
  assert.equal(screen.find('control-hud-height-current').props.children, '--');
  assert.equal(screen.find('control-hud-height-hint').props.children, '请先开启高度模式');
  assert.equal(screen.find('control-hud-height-slider').props.disabled, true);
  assert.equal(screen.find('control-hud-height-mode-toggle').props.disabled, false);

  screen.find('control-hud-height-mode-toggle').props.onPress();
  await screen.settle();
  assert.deepEqual(modeCalls, [true]);

  // 4. Active height mode: live readouts, slider drag preview + clamped commit, ±0.02 m fine steps, and 3 quick presets.
  screen.render({
    bodyHeight: {
      available: true,
      modeId: 'height',
      active: true,
      supported: true,
      currentHeightM: 0.375,
      targetHeightM: 0.375,
      defaultHeightM: 0.375,
      minHeightM: 0.25,
      maxHeightM: 0.50,
      rateMps: 0.05,
    },
  });
  assert.equal(screen.find('control-hud-height-current').props.children, '0.38 m');
  assert.equal(screen.find('control-hud-height-target').props.children, '0.38 m');
  assert.equal(screen.find('control-hud-height-hint'), undefined);
  assert.equal(screen.find('control-hud-height-slider').props.minimumValue, 0.25);
  assert.equal(screen.find('control-hud-height-slider').props.maximumValue, 0.50);
  assert.equal(screen.find('control-hud-height-slider').props.disabled, false);

  // Fine -0.02m and +0.02m
  screen.find('control-hud-height-dec').props.onPress();
  await screen.settle();
  assert.deepEqual(heightCalls, [0.355]);
  screen.find('control-hud-height-inc').props.onPress();
  await screen.settle();
  assert.deepEqual(heightCalls, [0.355, 0.395]);

  // Slider drag preview does not commit; sliding complete clamps out-of-bounds input to [0.25, 0.50].
  screen.find('control-hud-height-slider').props.onValueChange(0.31);
  screen.render();
  assert.equal(screen.find('control-hud-height-target').props.children, '0.31 m');
  assert.equal(heightCalls.length, 2);
  screen.find('control-hud-height-slider').props.onSlidingComplete(0.15);
  await screen.settle();
  assert.equal(heightCalls.at(-1), 0.25, 'height command must clamp to live robot minHeightM');

  // Presets 低 / 标准 / 高
  screen.find('control-hud-height-preset-low').props.onPress();
  await screen.settle();
  screen.find('control-hud-height-preset-standard').props.onPress();
  await screen.settle();
  screen.find('control-hud-height-preset-high').props.onPress();
  await screen.settle();
  assert.deepEqual(heightCalls.slice(-3), [0.25, 0.375, 0.5]);

  // 5. Safety guards: leased & faulted disable adjustments cleanly.
  screen.render({ runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' } });
  assert.equal(screen.find('control-hud-height-slider').props.disabled, true);
  assert.equal(screen.find('control-hud-height-hint').props.children, '请先停止移动');

  screen.render({ runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled', faultStatus: 'active' } });
  assert.equal(screen.find('control-hud-height-slider').props.disabled, true);
  assert.equal(screen.find('control-hud-height-mode-toggle').props.disabled, true);
  assert.equal(screen.find('control-hud-height-hint').props.children, '存在本体故障');

  screen.unmount();
});

test('gesture deck retries onListGestures when initial fetch failed transiently and skips retry on unimplemented', async () => {
  let attempts = 0;
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    operationReadiness: { playGesture: { ready: true }, stop: { ready: true } },
    operationCallbacks: { playGesture: async () => {}, stop: async () => {} },
    onListGestures: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('busy'), { code: 'busy' });
      return [{ name: 'nod_yes', description: '点头同意', durationMs: 4020 }];
    },
  });
  await screen.settle();
  assert.equal(attempts, 1);

  // Opening the action deck triggers a retry and enables execution once synced.
  screen.find('control-hud-category-action').props.onPress();
  screen.render();
  await screen.settle();
  assert.equal(attempts, 2);
  screen.find('control-hud-gesture-nod_yes').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-gesture-execute').props.disabled, false);
  screen.unmount();

  // When backend reports unimplemented, opening the deck must NOT retry.
  let unimplAttempts = 0;
  const unimplScreen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    video: { id: 'sim-front', phase: 'receiving' },
    videoSurface: 'plate',
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled' },
    onListGestures: async () => {
      unimplAttempts += 1;
      throw Object.assign(new Error('unimplemented'), { code: 'unimplemented' });
    },
  });
  await unimplScreen.settle();
  assert.equal(unimplAttempts, 1);
  unimplScreen.find('control-hud-category-action').props.onPress();
  unimplScreen.render();
  await unimplScreen.settle();
  assert.equal(unimplAttempts, 1, 'unimplemented gesture catalog must not keep retrying on deck open');
  unimplScreen.unmount();
});

test('floating Status Bento B card stays on ControlScreen, toggles IMU callback, keeps E-Stop live, and standby yields only when live video receives frames', async () => {
  const statusCardEvents = [];
  let pageJumpCalls = 0;
  let stopCalls = 0;
  const dismissRef = { current: null };
  const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.filter(Boolean) : [style]));
  const screen = mount({
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    landscapeDocksExpanded: false,
    connected: true,
    dismissWorkspaceOverlayRef: dismissRef,
    onOpenJointStatus: () => { pageJumpCalls += 1; },
    onStatusCardOpenChange: open => { statusCardEvents.push(open); },
    operationReadiness: { stop: { ready: true } },
    operationCallbacks: { stop: () => { stopCalls += 1; } },
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      posture: 'standing',
      motorState: 'enabled',
      faultStatus: 'clear',
      battery: { voltageV: 53.4 },
      imu: { source: 'device', quaternion: { w: 1, x: 0, y: 0, z: 0 }, gyroscope: { x: 0.01, y: -0.02, z: 0 } },
      joints: [
        { id: '3', label: '前左髋', source: 'device', online: true, statusCode: 2, temperatureC: 35, positionDeg: 2.4 },
        { id: '4', label: '前左大腿', source: 'device', online: true, statusCode: 2, temperatureC: 38, positionDeg: 42.1 },
      ],
    },
  });
  await screen.settle();

  // Tapping top-right telemetry opens the centered floating Bento B overlay WITHOUT jumping away.
  assert.equal(screen.find('status-bento-card'), undefined);
  screen.find('control-hud-open-status').props.onPress();
  screen.render();
  assert.equal(pageJumpCalls, 0);
  assert.ok(screen.find('status-bento-card'));
  assert.ok(screen.find('control-status-overlay'));
  assert.ok(screen.find('joint-status-horizon'));
  assert.equal(statusCardEvents.at(-1), true);

  // E-Stop remains live and unobstructed while floating Status Bento card is open.
  assert.ok(screen.find('control-hud-stop'));
  assert.equal(screen.find('control-hud-stop').props.disabled, false);

  // Tapping a joint opens inline detail overlay inside the card (no fullscreen modal blocking E-Stop).
  screen.find('joint-status-overview-4').props.onPress();
  screen.render();
  assert.ok(screen.find('joint-status-detail-overlay'));
  assert.ok(screen.find('joint-status-detail'));
  screen.find('joint-status-detail-close').props.onPress();
  screen.render();
  assert.equal(screen.find('joint-status-detail'), undefined);

  // Opening Settings closes floating Status Bento card cleanly (mutually exclusive).
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  assert.equal(screen.find('status-bento-card'), undefined);
  assert.equal(statusCardEvents.at(-1), false);
  screen.find('control-close-settings').props.onPress();
  screen.render();

  // Reopen and verify hardware back dismisses it cleanly, then reopen and verify E-Stop fires & closes it.
  screen.find('control-hud-open-status').props.onPress();
  screen.render();
  assert.ok(screen.find('status-bento-card'));
  assert.equal(dismissRef.current(), true);
  screen.render();
  assert.equal(screen.find('status-bento-card'), undefined);

  screen.find('control-hud-open-status').props.onPress();
  screen.render();
  screen.find('control-hud-stop').props.onPress();
  screen.render();
  assert.equal(stopCalls, 1);
  assert.equal(screen.find('status-bento-card'), undefined);

  // Seamless standby-to-live-video handoff: connecting keeps 3D standby visible underneath with buffering media hidden (opacity 0).
  screen.render({ video: { id: 'cam-1', phase: 'connecting' }, videoSurface: 'plate' });
  assert.ok(screen.find('control-hud-standby-scene-forest'));
  assert.ok(screen.find('control-media-stage'));
  assert.equal(flat(screen.find('control-media-stage').props.style).opacity, 0);
  assert.ok(screen.find('control-hud-video-empty'));
  assert.match(screen.copy, /连接画面中/);

  // The moment first live frame arrives (phase === 'receiving'), standby yields cleanly and live video reveals.
  screen.render({ video: { id: 'cam-1', phase: 'receiving' }, videoSurface: 'plate' });
  assert.equal(screen.find('control-hud-standby-scene-forest'), undefined);
  assert.ok(screen.find('control-media-stage'));
  assert.notEqual(flat(screen.find('control-media-stage').props.style).opacity, 0);
  assert.equal(screen.find('control-hud-video-empty'), undefined);

  screen.unmount();
});

test('proactive alert banner, physical auto-hide discs, unified openSettingsSignal, keep-awake and tactile haptics work together safely', async () => {
  let cleared = 0;
  let stood = 0;
  let stopped = 0;
  const committedHeights = [];
  const screen = mount({
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    landscapeDocksExpanded: false,
    connected: true,
    physicalInputAvailable: true,
    inputSource: 'touch',
    video: { id: 'live-cam', phase: 'receiving' },
    videoSurface: 'plate',
    bodyHeight: { supported: true, active: true, minHeightM: 0.2, maxHeightM: 0.45, defaultHeightM: 0.32, currentHeightM: 0.32, targetHeightM: 0.32 },
    onSetBodyHeight: async h => { committedHeights.push(h); },
    operationReadiness: {
      stop: { ready: true },
      stand: { ready: true },
      clearMotorFault: { ready: true },
    },
    operationCallbacks: {
      stop: () => { stopped += 1; },
      stand: () => { stood += 1; },
      clearMotorFault: () => { cleared += 1; },
    },
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      posture: 'sitting',
      motorState: 'enabled',
      faultStatus: 'clear',
      battery: { voltageV: 53.0 },
      joints: [
        { id: '12', label: '前右足轮', source: 'device', online: true, statusCode: 2, temperatureC: 42 },
      ],
    },
  });
  await screen.settle();

  // 1. Keep screen awake active in foreground; no alert banner when healthy.
  assert.equal(screen.keepAwakeCalls.at(-1), true);
  assert.equal(screen.find('control-hud-alert-banner'), undefined);
  assert.equal(screen.hapticCalls.includes('alert'), false);

  // 2. Priority 3: Low voltage (<44V) displays proactive banner, triggers edge haptic once, and tapping opens floating Status card.
  screen.render({
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      posture: 'sitting',
      motorState: 'enabled',
      faultStatus: 'clear',
      battery: { voltageV: 43.2 },
      joints: [
        { id: '12', label: '前右足轮', source: 'device', online: true, statusCode: 2, temperatureC: 42 },
      ],
    },
  });
  assert.ok(screen.find('control-hud-alert-banner'));
  assert.match(screen.copy, /电量偏低 43\.2V/);
  assert.equal(screen.hapticCalls.filter(k => k === 'alert').length, 1);
  // Rerendering same alert key does not re-trigger alert haptic.
  screen.render();
  assert.equal(screen.hapticCalls.filter(k => k === 'alert').length, 1);
  // Tapping alert opens floating Status Bento card (and hides the banner while card is open).
  screen.find('control-hud-alert-open-status').props.onPress();
  screen.render();
  assert.ok(screen.find('status-bento-card'));
  assert.equal(screen.find('control-hud-alert-banner'), undefined);
  screen.find('status-bento-close').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-alert-banner'));

  // 3. Priority 2: Motor overheat (>=65°C) overrides low battery and names hottest joint cleanly.
  screen.render({
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      posture: 'sitting',
      motorState: 'enabled',
      faultStatus: 'clear',
      battery: { voltageV: 43.2 },
      joints: [
        { id: '12', label: '前右足轮', source: 'device', online: true, statusCode: 2, temperatureC: 68 },
      ],
    },
  });
  assert.match(screen.copy, /右前轮 68°C/);
  assert.equal(screen.hapticCalls.filter(k => k === 'alert').length, 2);

  // 4. Priority 1: Active fault overrides overheat and offers inline 清除 action.
  screen.render({
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      posture: 'sitting',
      motorState: 'enabled',
      faultStatus: 'active',
      battery: { voltageV: 43.2 },
      joints: [
        { id: '12', label: '前右足轮', source: 'device', online: true, statusCode: 2, temperatureC: 68 },
      ],
    },
  });
  assert.ok(screen.find('control-hud-alert-clear'));
  screen.find('control-hud-alert-clear').props.onPress();
  screen.render();
  assert.equal(cleared, 1);
  // Restore healthy runtime state after clearing fault so stand & height controls are ready.
  screen.render({
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'not-held',
      controlOwner: 'none',
      posture: 'sitting',
      motorState: 'enabled',
      faultStatus: 'clear',
      battery: { voltageV: 53.0 },
      joints: [
        { id: '12', label: '前右足轮', source: 'device', online: true, statusCode: 2, temperatureC: 42 },
      ],
    },
  });
  await screen.settle();

  // 5. Tactile haptics: confirm on stand, step on speed limit & body height, estop on 急停.
  screen.find('control-hud-quick-stand').props.onPress();
  screen.render();
  assert.equal(stood, 1);
  assert.ok(screen.hapticCalls.includes('confirm'));

  screen.find('control-hud-speed-limit-toggle').props.onPress();
  screen.render();
  screen.find('control-hud-speed-limit-dec').props.onPress();
  screen.render();
  assert.equal(screen.hapticCalls.filter(k => k === 'step').length, 1);

  screen.find('control-hud-category-posture').props.onPress();
  screen.render();
  screen.find('control-hud-posture-height').props.onPress();
  screen.render();
  screen.find('control-hud-height-inc').props.onPress();
  screen.render();
  assert.equal(committedHeights.length, 1);
  assert.equal(screen.hapticCalls.filter(k => k === 'step').length, 2);

  screen.find('control-hud-stop').props.onPress();
  screen.render();
  assert.equal(stopped, 1);
  assert.ok(screen.hapticCalls.includes('estop'));

  // 6. Physical input transition auto-hides virtual discs, shows 实体摇杆 micro-tag, and restores on touch.
  assert.ok(screen.pair);
  assert.equal(screen.find('control-hud-physical-mode'), undefined);
  screen.render({ inputSource: 'physical' });
  assert.equal(screen.pair, undefined);
  assert.ok(screen.find('control-hud-physical-mode'));
  assert.match(screen.copy, /实体摇杆/);
  screen.render({ inputSource: 'touch' });
  assert.ok(screen.pair);
  assert.equal(screen.find('control-hud-physical-mode'), undefined);

  // 7. Unified openSettingsSignal opens the 5-tab Settings Center and dismisses competing Status overlay.
  screen.find('control-hud-open-status').props.onPress();
  screen.render();
  assert.ok(screen.find('status-bento-card'));
  screen.render({ openSettingsSignal: 1 });
  assert.equal(screen.find('status-bento-card'), undefined);
  assert.ok(screen.find('control-settings-menu'));

  // 7b. Settings polish contracts (#187): unified 摇杆布局 title, embedded layout editor, clean 机器狗维护 copy (no L1 badge, no 未读取 · 未读取).
  screen.find('control-open-joystick-layout').props.onPress();
  screen.render();
  assert.ok(screen.find('joystick-layout-canvas'));
  assert.equal(screen.joystickSettings.embedded, true);
  assert.match(screen.copy, /摇杆布局/);
  assert.doesNotMatch(screen.copy, /圆盘布局/);
  screen.find('control-settings-subview-back').props.onPress();
  screen.render();
  screen.render({ connected: false, runtimeState: { controlLink: 'disconnected' } });
  screen.find('control-settings-tab-机器狗维护').props.onPress();
  screen.render();
  assert.match(screen.copy, /关节状态/);
  assert.doesNotMatch(screen.copy, /未读取 · 未读取/);
  assert.doesNotMatch(JSON.stringify(screen.find('control-settings-open-joint-params')), /"L1"/);

  // 8. Backgrounding turns off keep-screen-awake cleanly.
  screen.background('background');
  assert.equal(screen.keepAwakeCalls.at(-1), false);
  screen.unmount();
});

test('FSD matte charcoal 4-scene standby backdrop (forest default), 5-tab settings, hotspot radar, and 2-column Action Studio exclude fall recovery & jargon', async () => {
  const defaults = controlPrefsModule.exports.createDefaultControlPreferences();
  assert.equal(defaults.standbyScene, 'forest');
  assert.equal(defaults.accentTone, 'graphite');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ standbyScene: 'charcoal' }).standbyScene, 'charcoal');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ standbyScene: 'gallery' }).standbyScene, 'gallery');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ standbyScene: 'hangar' }).standbyScene, 'hangar');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ standbyScene: 'aurora' }).standbyScene, 'forest');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ accentTone: 'fsdBlue' }).accentTone, 'fsdBlue');
  assert.equal(controlPrefsModule.exports.normalizeControlPreferences({ accentTone: 'neon' }).accentTone, 'graphite');

  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    connected: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled', battery: { voltageV: 55.4, source: 'device' } },
    speedMode: 'unsupported',
    onChangeSpeedMode: async () => { },
    onListGestures: async () => [
      { name: 'hello', description: '你好问候', durationMs: 8420 },
      { name: 'fall_recovery', description: '摔倒恢复', durationMs: 5000 },
    ],
    recovery: { status: recoveryStatus(), profile: recoveryProfile, onCommand: async () => recoveryStatus() },
    workspaceSettings: {
      themePreference: 'dark',
      onChangeTheme() { },
      alertsEnabled: true,
      onToggleAlerts() { },
      connection: {
        host: '192.168.66.64',
        port: 13145,
        connected: true,
        readonlyConnected: false,
        onConnectControl: async () => true,
        onDisconnect: async () => { },
      },
    },
  });
  await screen.settle();

  // Default forest standby backdrop renders when live video is absent, and 摔倒恢复 is promoted directly onto center dock.
  assert.ok(screen.find('control-hud-standby-scene-forest'));
  assert.ok(screen.find('control-hud-posture-recover'));

  // Action Studio excludes 摔倒恢复 and hides duration seconds + left telemetry.
  screen.find('control-hud-category-action').props.onPress();
  screen.render();
  assert.equal(screen.find('control-hud-hero-speed'), undefined);
  assert.ok(screen.find('control-hud-gesture-hello'));
  assert.equal(screen.find('control-hud-gesture-fall_recovery'), undefined);
  assert.doesNotMatch(screen.copy, /8\.4s/);
  screen.find('control-hud-gesture-close').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-hero-speed'));

  // Top-right 机器狗 Wi-Fi opens Settings directly to 连接与设备 with flattened embedded WifiDiscoveryPanel.
  screen.find('control-open-connection').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-page-连接与设备'));
  assert.ok(screen.find('control-settings-hotspot-radar'));
  assert.ok(screen.find('control-settings-wifi-discovery'));
  assert.equal(screen.find('control-settings-wifi-discovery').props.embedded, true);

  // 图传与音频 -> 待机场景 switches live HUD backdrop to 星际舱室, and 操控 hides unsupported 高速 2.5.
  screen.find('control-settings-tab-操控').props.onPress();
  screen.render();
  assert.equal(screen.find('control-setting-speed-mode-high'), undefined);
  screen.find('control-setting-accent-blue').props.onPress();
  screen.render();

  screen.find('control-settings-tab-图传与音频').props.onPress();
  screen.render();
  assert.ok(screen.find('control-setting-scene-forest'));
  assert.ok(screen.find('control-setting-scene-charcoal'));
  assert.ok(screen.find('control-setting-scene-gallery'));
  assert.ok(screen.find('control-setting-scene-hangar'));
  assert.equal(screen.find('control-setting-scene-aurora'), undefined);
  screen.find('control-setting-scene-hangar').props.onPress();
  screen.render();

  // Check zero jargon / zero lecturing across all 5 tabs.
  for (const tab of ['操控', '图传与音频', '连接与设备', '机器狗维护', '关于与隐私']) {
    screen.find(`control-settings-tab-${tab}`).props.onPress();
    screen.render();
    assert.doesNotMatch(screen.copy, /gRPC|WebRTC|WHEP|mDNS|Avahi|NsdManager|RFC1918|暂未接入|仅作预览/);
  }
  screen.find('control-close-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-standby-scene-hangar'));
  screen.unmount();
});

test('Android scroll onTouchCancel and child backdrop events do not close Settings or Status overlays while preserving onInterrupt safety', async () => {
  let interrupts = 0;
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    connected: true,
    canUseManualControl: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' },
    productionInput: {
      ready: true,
      onDrive() { },
      onTurn() { },
      onInterrupt() { interrupts++; },
    },
  });
  await screen.settle();

  // Open Settings center.
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-menu'));

  // Settings card stops touch propagation so root onTouchCancel isn't triggered unnecessarily.
  let stopped = 0;
  screen.find('control-settings-menu').props.onTouchStart({ stopPropagation() { stopped++; } });
  screen.find('control-settings-menu').props.onTouchCancel({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 2);

  // Even when Android ScrollView intercepts a vertical swipe and fires ACTION_CANCEL on control-surface,
  // Settings stays mounted while productionInput.onInterrupt() STILL fires for motion safety.
  const beforeSettingsCancel = interrupts;
  screen.find('control-surface').props.onTouchCancel();
  screen.render();
  assert.ok(screen.find('control-settings-menu'), 'Settings must remain open on Android ScrollView ACTION_CANCEL');
  assert.equal(interrupts, beforeSettingsCancel + 1, 'onInterrupt must still fire on root touch cancel');

  // Backdrop ignores bubbled press events where target !== currentTarget, and closes on direct backdrop tap.
  screen.find('control-settings-background').props.onPress({ target: 'child-node', currentTarget: 'backdrop-node' });
  screen.render();
  assert.ok(screen.find('control-settings-menu'), 'child press event must not close Settings via backdrop');
  screen.find('control-settings-background').props.onPress({ target: 'backdrop-node', currentTarget: 'backdrop-node' });
  screen.render();
  assert.equal(screen.find('control-settings-menu'), undefined);

  // Floating Status card is equally protected against Android ScrollView ACTION_CANCEL and child backdrop events.
  screen.find('control-hud-open-status').props.onPress();
  screen.render();
  assert.ok(screen.find('status-bento-card'));
  const beforeStatusCancel = interrupts;
  screen.find('control-surface').props.onTouchCancel();
  screen.render();
  assert.ok(screen.find('status-bento-card'), 'Status card must remain open on Android ScrollView ACTION_CANCEL');
  assert.equal(interrupts, beforeStatusCancel + 1);
  screen.find('control-status-backdrop').props.onPress({ target: 'child-node', currentTarget: 'backdrop-node' });
  screen.render();
  assert.ok(screen.find('status-bento-card'));
  screen.find('control-status-backdrop').props.onPress({ target: 'backdrop-node', currentTarget: 'backdrop-node' });
  screen.render();
  assert.equal(screen.find('status-bento-card'), undefined);
  screen.unmount();
});

test('Android soft-keyboard height-only layout change keeps Settings open while width resize still revokes overlays', async () => {
  let interrupts = 0;
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    connected: true,
    canUseManualControl: true,
    runtimeState: { controlLink: 'connected', controlAuthority: 'held', posture: 'standing', motorState: 'enabled' },
    productionInput: {
      ready: true,
      onDrive() { },
      onTurn() { },
      onInterrupt() { interrupts++; },
    },
    workspaceSettings: {
      themePreference: 'dark',
      onChangeTheme() { },
      alertsEnabled: true,
      onToggleAlerts() { },
      connection: {
        host: '192.168.66.64',
        port: 13145,
        connected: true,
        readonlyConnected: false,
        onConnectControl: async () => true,
        onDisconnect: async () => { },
      },
    },
  });
  await screen.settle();

  // Open Settings -> 连接与设备 tab (where IP/Port TextInputs trigger Android soft keyboard).
  screen.find('control-open-connection').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-menu'));
  assert.ok(screen.find('control-settings-page-连接与设备'));

  // Height-only resize (960x540 -> 960x300 -> 960x540) keeps Settings open while safely interrupting stick input.
  const beforeIme = interrupts;
  screen.layout(960, 300);
  assert.ok(screen.find('control-settings-menu'), 'Android IME height shrink must not close Settings');
  assert.ok(screen.find('control-settings-page-连接与设备'));
  assert.equal(interrupts, beforeIme + 1);

  screen.layout(960, 540);
  assert.ok(screen.find('control-settings-menu'), 'Android IME height restore must not close Settings');
  assert.equal(interrupts, beforeIme + 2);

  // Substantial width change (split-screen / rotation geometry change) still revokes overlays cleanly.
  screen.layout(720, 540);
  assert.equal(screen.find('control-settings-menu'), undefined);
  assert.equal(interrupts, beforeIme + 3);
  screen.unmount();
});

test('real FsdDetentSlider yields vertical scroll swipes to Android ScrollView without mutating value, and handles taps and horizontal drags', () => {
  const fsdModule = { exports: {} };
  const slots = [];
  let cursor = 0;
  const sliderReact = {
    useState(initial) {
      const idx = cursor++;
      if (!(idx in slots)) slots[idx] = typeof initial === 'function' ? initial() : initial;
      return [slots[idx], v => { slots[idx] = typeof v === 'function' ? v(slots[idx]) : v; }];
    },
    useRef(initial) {
      const idx = cursor++;
      return slots[idx] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const idx = cursor++;
      const prev = slots[idx];
      if (!prev || prev.deps.length !== deps.length || deps.some((d, i) => !Object.is(d, prev.deps[i]))) {
        slots[idx] = { deps, value: factory() };
      }
      return slots[idx].value;
    },
    useEffect() { },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/FsdMotionPrimitives.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: fsdModule,
    exports: fsdModule.exports,
    require(name) {
      if (name === 'react') return sliderReact;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === './AppText') return { Text: 'Text' };
      if (name === 'react-native') {
        return {
          AccessibilityInfo: { isReduceMotionEnabled: async () => true },
          Animated: hudAnimatedStub,
          Easing: { cubic: v => v, out: v => v },
          LayoutAnimation: { configureNext() { }, Types: { easeInEaseOut: 'easeInEaseOut', spring: 'spring' }, Properties: { opacity: 'opacity' } },
          PanResponder: { create: cfg => ({ panHandlers: cfg }) },
          Platform: { OS: 'android' },
          Pressable: 'Pressable',
          StyleSheet: { create: v => v },
          UIManager: { setLayoutAnimationEnabledExperimental() { } },
          View: 'View',
        };
      }
      throw new Error(`Unexpected FsdMotionPrimitives dependency: ${name}`);
    },
  });

  const changes = [];
  const completes = [];
  cursor = 0;
  const tree = fsdModule.exports.FsdDetentSlider({
    value: 50,
    min: 0,
    max: 100,
    step: 10,
    onChange: v => changes.push(v),
    onComplete: v => completes.push(v),
    accessibilityLabel: '速度上限',
    testID: 'fsd-detent-slider-test',
  });
  const props = tree.props;
  props.onLayout({ nativeEvent: { layout: { width: 200 } } });

  // Must never block Android native ScrollView responder.
  assert.equal(props.onShouldBlockNativeResponder(), false);
  assert.equal(props.onStartShouldSetPanResponderCapture(), false);
  assert.equal(props.onMoveShouldSetPanResponderCapture(), false);

  // Directional thresholds: vertical swipe yields immediately, horizontal drag claims.
  assert.equal(props.onMoveShouldSetPanResponder({}, { dx: 2, dy: 20 }), false);
  assert.equal(props.onMoveShouldSetPanResponder({}, { dx: 20, dy: 2 }), true);
  assert.equal(props.onPanResponderTerminationRequest({}, { dx: 2, dy: 20 }), true);
  assert.equal(props.onPanResponderTerminationRequest({}, { dx: 20, dy: 2 }), false);

  // Vertical scroll gesture starting on top of the slider must NOT mutate or commit slider value.
  props.onPanResponderGrant({ nativeEvent: { locationX: 160 } }, { dx: 0, dy: 0 });
  props.onPanResponderMove({ nativeEvent: { locationX: 160 } }, { dx: 2, dy: 24 });
  props.onPanResponderTerminate({}, { dx: 2, dy: 24 });
  assert.deepEqual(changes, []);
  assert.deepEqual(completes, []);

  // Stationary tap commits quantized value cleanly.
  props.onPanResponderGrant({ nativeEvent: { locationX: 160 } }, { dx: 0, dy: 0 });
  props.onPanResponderRelease({ nativeEvent: { locationX: 160 } }, { dx: 1, dy: 1 });
  assert.deepEqual(changes, [80]);
  assert.deepEqual(completes, [80]);

  // Horizontal drag emits continuously and completes on release.
  props.onPanResponderGrant({ nativeEvent: { locationX: 100 } }, { dx: 0, dy: 0 });
  props.onPanResponderMove({ nativeEvent: { locationX: 40 } }, { dx: -60, dy: 2 });
  props.onPanResponderRelease({ nativeEvent: { locationX: 40 } }, { dx: -60, dy: 2 });
  assert.deepEqual(changes, [80, 20, 20]);
  assert.deepEqual(completes, [80, 20]);
});

test('Settings ScrollView exposes Android scroll props, non-flexGrow content, E-Stop elevation precedence, and 三号机 .13 IP preset', async () => {
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 960, height: 540, fontScale: 1 },
    connected: false,
    workspaceSettings: {
      themePreference: 'dark',
      onChangeTheme() { },
      alertsEnabled: true,
      onToggleAlerts() { },
      connection: {
        host: '192.168.66.64',
        port: 13145,
        connected: false,
        readonlyConnected: false,
        onConnectControl: async () => true,
        onDisconnect: async () => { },
      },
    },
  });
  await screen.settle();

  screen.find('control-open-connection').props.onPress();
  screen.render();

  const scroll = screen.find('control-settings-scroll');
  assert.ok(scroll);
  assert.equal(scroll.props.nestedScrollEnabled, true);
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(scroll.props.overScrollMode, 'never');
  assert.equal(scroll.props.style.minHeight, 0);
  assert.equal(scroll.props.contentContainerStyle.flexGrow, undefined);

  // 三号机 .13 preset chip fills 192.168.66.13:13145 cleanly.
  const dog3Chip = screen.find('control-settings-host-dog3');
  assert.ok(dog3Chip);
  dog3Chip.props.onPress();
  screen.render();
  assert.equal(screen.find('control-settings-host-input').props.value, '192.168.66.13');
  assert.equal(screen.find('control-settings-port-input').props.value, '13145');

  // TextInput styling prevents Android vertical clipping.
  const hostStyle = screen.find('control-settings-host-input').props.style;
  assert.equal(hostStyle.height, 38);
  assert.equal(hostStyle.paddingVertical, 0);
  assert.equal(hostStyle.textAlignVertical, 'center');
  assert.equal(hostStyle.includeFontPadding, false);

  // E-Stop remains mounted & unobstructed above Settings layer.
  assert.ok(screen.find('control-hud-stop'));
  screen.unmount();
});

test('Multi-size phone screens adapt cleanly without overflow and enforce monotonic Android elevation + zIndex layers', async () => {
  const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));
  const viewports = [
    { name: 'small-phone-600x340', width: 600, height: 340, insets: { top: 0, right: 16, bottom: 12, left: 28 } },
    { name: 'se-phone-667x375', width: 667, height: 375, insets: { top: 0, right: 0, bottom: 16, left: 0 } },
    { name: 'android-20-9-780x360', width: 780, height: 360, insets: { top: 24, right: 20, bottom: 16, left: 44 } },
    { name: 'iphone-844x390', width: 844, height: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
    { name: 'g20-960x540', width: 960, height: 540, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { name: 'tablet-1280x720', width: 1280, height: 720, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  ];

  for (const vp of viewports) {
    const effW = vp.width - vp.insets.left - vp.insets.right;
    const effH = vp.height - vp.insets.top - vp.insets.bottom;
    const screen = mount({
      landscapeDocksExpanded: false,
      dev: false,
      dimensions: { width: vp.width, height: vp.height, fontScale: 1 },
      previewSafeInsets: vp.insets,
      connected: true,
      speedMode: 'normal',
      onChangeSpeedMode: async () => {},
      runtimeState: {
        controlLink: 'connected',
        controlAuthority: 'held',
        controlOwner: 'this-device',
        motorState: 'enabled',
        posture: 'standing',
        faultStatus: 'clear',
        battery: { voltageV: 53.2 },
      },
      operationReadiness: {
        stand: { ready: true },
        sit: { ready: true },
        stop: { ready: true },
        enableMotor: { ready: true },
        disableMotor: { ready: true },
        playGesture: { ready: true },
      },
      operationCallbacks: {
        stand() {},
        sit() {},
        stop() {},
        enableMotor() {},
        disableMotor() {},
        playGesture() {},
      },
      onListGestures: async () => [{ name: 'wave', description: '挥手', durationMs: 2000 }],
      workspaceSettings: {
        themePreference: 'dark',
        onChangeTheme() {},
        alertsEnabled: true,
        onToggleAlerts() {},
        connection: {
          host: '192.168.66.13',
          port: 13145,
          connected: true,
          readonlyConnected: false,
          onConnectControl: async () => true,
          onDisconnect: async () => {},
        },
      },
    });
    await screen.settle();

    // 1. Top status bar band is height-bounded (not full-screen) and keeps E-Stop at zIndex 24 / elevation 24.
    const statusBarStyle = flat(screen.find('control-hud-status-bar').props.style);
    assert.equal(statusBarStyle.zIndex, 24, `${vp.name}: status bar zIndex`);
    assert.equal(statusBarStyle.elevation, 24, `${vp.name}: status bar elevation`);
    assert.equal(statusBarStyle.bottom, undefined, `${vp.name}: status bar must NOT span bottom: 0`);
    assert.ok(statusBarStyle.height > 0 && statusBarStyle.height < effH * 0.35, `${vp.name}: status bar height bounded`);

    // 2. Bottom docks stay mounted across every phone width and compact camera rail hides text only on ultra-narrow (<640dp).
    assert.ok(screen.find('control-hud-primary-card'), `${vp.name}: primary dock`);
    assert.ok(screen.find('control-hud-camera-rail'), `${vp.name}: camera rail`);
    assert.ok(screen.find('control-hud-photo-capture'), `${vp.name}: capture button`);
    assert.ok(screen.find('control-hud-voice-toggle'), `${vp.name}: voice bot orb`);

    // 3. Flush-left voice wing fits inside viewport, hides/disables sticks behind it, and never collides with Row 4 speed sign on short/compact phones.
    screen.find('control-hud-voice-toggle').props.onPress();
    screen.render();
    const wingStyle = flat(screen.find('control-hud-voice-wing').props.style);
    assert.equal(wingStyle.zIndex, 10, `${vp.name}: voice wing zIndex`);
    assert.equal(wingStyle.elevation, 10, `${vp.name}: voice wing elevation`);
    assert.ok(wingStyle.width <= effW, `${vp.name}: voice wing width ${wingStyle.width} <= ${effW}`);
    assert.ok(wingStyle.top + wingStyle.bottom < effH - 80, `${vp.name}: voice wing keeps >=80dp vertical room`);
    assert.equal(screen.find('control-immersive-sticks').props.pointerEvents, 'none', `${vp.name}: sticks yield pointerEvents behind voice wing`);
    assert.equal(flat(screen.find('control-immersive-sticks').props.style).opacity, 0, `${vp.name}: sticks hide visually behind translucent voice wing`);
    if (effW < 900 || effH < 460) {
      assert.equal(screen.find('control-hud-speed-limit-toggle'), undefined, `${vp.name}: speed sign folds cleanly while voice wing is open`);
    }
    screen.find('control-hud-voice-toggle').props.onPress();
    screen.render();

    // 4. Action Studio modal fits inside viewport width, hides dual-camera PiP, & elevates above voice wing.
    screen.find('control-hud-camera-count-toggle').props.onPress();
    screen.render();
    assert.ok(screen.find('control-hud-pip-window'), `${vp.name}: PiP mounts in normal driving mode`);
    screen.find('control-hud-category-action').props.onPress();
    screen.render();
    const actionDockStyle = flat(screen.find('control-hud-action-dock').props.style);
    assert.ok(actionDockStyle.width <= effW, `${vp.name}: action modal width ${actionDockStyle.width} <= ${effW}`);
    assert.equal(screen.find('control-hud-pip-window'), undefined, `${vp.name}: PiP yields cleanly while action studio is open`);
    screen.find('control-hud-category-action').props.onPress();
    screen.find('control-hud-camera-count-toggle').props.onPress();
    screen.render();

    // 5. Status Bento Card fits inside viewport and elevates cleanly above action modal (13 > 11).
    screen.find('control-hud-open-status').props.onPress();
    screen.render();
    const statusOverlayStyle = flat(screen.find('control-status-overlay').props.style);
    const bentoStyle = flat(screen.find('status-bento-card').props.style);
    assert.equal(statusOverlayStyle.zIndex, 13, `${vp.name}: status overlay zIndex`);
    assert.equal(statusOverlayStyle.elevation, 13, `${vp.name}: status overlay elevation`);
    assert.ok(bentoStyle.width <= effW, `${vp.name}: status bento width ${bentoStyle.width} <= ${effW}`);
    assert.ok(bentoStyle.maxHeight <= effH, `${vp.name}: status bento maxHeight ${bentoStyle.maxHeight} <= ${effH}`);
    screen.find('control-hud-open-status').props.onPress();
    screen.render();

    // 6. Settings modal never overflows narrow phone width and elevates above Status (15/16 > 13).
    screen.find('control-hud-settings').props.onPress();
    screen.render();
    const settingsStyle = flat(screen.find('control-settings-menu').props.style);
    assert.equal(settingsStyle.zIndex, 16, `${vp.name}: settings zIndex`);
    assert.equal(settingsStyle.elevation, 16, `${vp.name}: settings elevation`);
    assert.ok(settingsStyle.top >= 36, `${vp.name}: settings sits below top-right E-Stop band`);
    const settingsShell = screen.find('control-settings-menu').props.children;
    const shellStyle = flat(settingsShell.props.style);
    assert.ok(shellStyle.maxWidth <= effW, `${vp.name}: settings shell maxWidth ${shellStyle.maxWidth} <= ${effW}`);
    screen.find('control-close-settings').props.onPress();
    screen.render();

    // 7. Confirmation modal elevates above Settings & Toast (20 > 18 > 16) yet stays below E-Stop (24).
    screen.find('control-hud-motor-power').props.onPress();
    screen.render();
    const confirmOverlay = screen.find('control-immersive-confirm-overlay');
    assert.ok(confirmOverlay, `${vp.name}: confirmation overlay mounts`);
    const confirmOverlayStyle = flat(confirmOverlay.props.style);
    assert.equal(confirmOverlayStyle.zIndex, 20, `${vp.name}: confirm overlay zIndex`);
    assert.equal(confirmOverlayStyle.elevation, 20, `${vp.name}: confirm overlay elevation`);
    assert.ok(confirmOverlayStyle.zIndex < statusBarStyle.zIndex, `${vp.name}: E-Stop remains above confirmation`);

    // 8. JSX child order inside control-landscape-safe matches monotonic zIndex/elevation
    //    (sticks first, topStatusBarLayer with E-Stop very last so Android/Web touch hit-testing never drops E-Stop or HUD taps).
    const safeChildren = screen.find('control-landscape-safe').props.children.flat(Infinity).filter(n => n && typeof n === 'object');
    const safeIds = safeChildren.map(n => n.props?.testID).filter(Boolean);
    const sticksIdx = safeIds.indexOf('control-immersive-sticks');
    const docksIdx = safeIds.indexOf('control-hud-left-controls');
    const statusBarIdx = safeIds.indexOf('control-hud-status-bar');
    assert.ok(sticksIdx >= 0 && docksIdx > sticksIdx, `${vp.name}: sticks render before bottom docks`);
    assert.equal(statusBarIdx, safeIds.length - 1, `${vp.name}: top status bar / E-Stop renders LAST in JSX`);
    assert.equal(screen.find('control-immersive-sticks').props.pointerEvents, 'none', `${vp.name}: sticks yield pointerEvents during confirmation`);
    screen.unmount();
  }
});

test('E-Stop remains re-triggerable after accepted status and triggers immediate voice/local stop while voice walk is active', async () => {
  let stopCalls = 0;
  let resolveFirstStop;
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 780, height: 360, fontScale: 1 },
    connected: true,
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'not-held',
      motorState: 'enabled',
      posture: 'standing',
    },
    operationReadiness: {
      stop: { ready: true },
    },
    operationCallbacks: {
      stop: () => {
        stopCalls += 1;
        if (stopCalls === 1) return new Promise(resolve => { resolveFirstStop = resolve; });
        return Promise.resolve();
      },
    },
  });
  await screen.settle();

  // First tap dispatches E-Stop even when controlAuthority is not-held.
  assert.equal(screen.find('control-hud-stop').props.disabled, false);
  screen.find('control-hud-stop').props.onPress();
  screen.render();
  assert.equal(stopCalls, 1);

  // Once accepted (awaiting telemetry poll), E-Stop MUST remain enabled and re-triggerable.
  resolveFirstStop();
  await screen.settle();
  assert.equal(screen.find('control-hud-stop').props.disabled, false);
  screen.find('control-hud-stop').props.onPress();
  await screen.settle();
  assert.equal(stopCalls, 2);
  screen.unmount();
});

test('compact connected HUD folds secondary top-bar signal badges and hides expanded dashboard while voice wing is open', async () => {
  const flat = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
  const screen = mount({
    landscapeDocksExpanded: true,
    dev: false,
    dimensions: { width: 600, height: 340, fontScale: 1 },
    connected: true,
    runtimeState: {
      controlLink: 'connected',
      motorState: 'enabled',
      posture: 'standing',
      cellular: { connected: true, networkLabel: '5G', bars: 3, source: 'controller' },
      signal: { qualityPercent: 86, latencyMs: 14, source: 'controller' },
      robotLinkLatencyMs: 14,
    },
  });
  await screen.settle();

  // Ultra-narrow (<640dp) hides secondary signal badges so top-right never collides with top-left gear/battery row.
  assert.equal(screen.find('control-hud-cellular'), undefined);
  assert.equal(screen.find('control-hud-wifi-signal'), undefined);
  assert.equal(screen.find('control-hud-robot-signal'), undefined);
  assert.ok(screen.find('control-hud-open-status'));
  assert.ok(screen.find('control-hud-settings'));
  assert.ok(screen.find('control-hud-stop'));

  // Opening Voice Wing while expanded diagnostics bar is open hides dashboardOverlay cleanly.
  assert.ok(screen.find('control-hud-dashboard-expanded'));
  screen.find('control-hud-voice-toggle').props.onPress();
  screen.render();
  assert.ok(screen.find('control-hud-voice-wing'));
  assert.equal(screen.find('control-immersive-sticks').props.pointerEvents, 'none');
  const safeChildren = screen.find('control-landscape-safe').props.children.flat(Infinity).filter(n => n && typeof n === 'object');
  const dashWrapper = safeChildren.find(n => flat(n.props?.style).zIndex === 7 && n.props?.pointerEvents === 'none');
  assert.ok(dashWrapper, 'expanded diagnostics overlay yields pointerEvents and hides behind voice wing');
  assert.equal(flat(dashWrapper.props.style).opacity, 0);
  screen.unmount();
});

test('interactive 3D standby scene accepts open-stage drag while reserving joystick disc zones and yields to modals and live video', async () => {
  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 844, height: 390, fontScale: 1 },
    connected: false,
  });
  await screen.settle();

  const standbyWrapper = screen.find('control-hud-standby-scene-forest');
  assert.ok(standbyWrapper, 'renders standby scene layer when disconnected');
  assert.equal(standbyWrapper.props.pointerEvents, 'auto');
  const scene3d = standbyWrapper.props.children;
  assert.equal(scene3d.type, 'StandbyScene3D');
  assert.equal(scene3d.props.interactive, true);
  assert.equal(scene3d.props.scene, 'forest');

  // Trigger stick-frame layout so configuredJoystickLayout becomes usable, then verify center pass-through prop.
  screen.find('control-immersive-sticks').props.onLayout({ nativeEvent: { layout: { width: 812, height: 240 } } });
  screen.render();
  const pairNode = screen.find('control-immersive-sticks').props.children;
  assert.ok(pairNode, 'mounts ControlJoystickPair inside stickFrame');
  assert.equal(pairNode.props.reserveCenterForBackdrop, true);

  // Offline virtual joysticks drive the local 3D standby robot via the zero-re-render bus and brake to zero on release!
  pairNode.props.left.onActiveChange(true);
  pairNode.props.left.onChange({ x: 0.4, y: -0.8 });
  assert.deepEqual(screen.standbyDrive, { driveX: 0.4, driveY: -0.8, turnX: 0 });
  pairNode.props.right.onActiveChange(true);
  pairNode.props.right.onChange({ x: 0.55, y: 0 });
  assert.deepEqual(screen.standbyDrive, { driveX: 0.4, driveY: -0.8, turnX: 0.55 });
  pairNode.props.left.onActiveChange(false);
  assert.deepEqual(screen.standbyDrive, { driveX: 0, driveY: 0, turnX: 0.55 });
  pairNode.props.right.onActiveChange(false);
  assert.deepEqual(screen.standbyDrive, { driveX: 0, driveY: 0, turnX: 0 });

  // Opening Settings disables 3D drag capture behind the modal without unmounting theme preview.
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  const standbyUnderModal = screen.find('control-hud-standby-scene-forest');
  assert.ok(standbyUnderModal);
  assert.equal(standbyUnderModal.props.pointerEvents, 'none');
  assert.equal(standbyUnderModal.props.children.props.interactive, false);

  // Closing Settings restores 3D interactivity.
  screen.find('control-settings-background').props.onPress({ target: 'backdrop', currentTarget: 'backdrop' });
  screen.render();
  assert.equal(screen.find('control-hud-standby-scene-forest').props.pointerEvents, 'auto');
  assert.equal(screen.find('control-hud-standby-scene-forest').props.children.props.interactive, true);

  // Once live video receives frames, standby 3D unmounts completely and joystick claims full floating zones.
  screen.render({ connected: true, video: { id: 'cam-1', phase: 'receiving' }, videoSurface: 'plate' });
  assert.equal(screen.find('control-hud-standby-scene-forest'), undefined);
  assert.equal(screen.find('control-immersive-sticks').props.children.props.reserveCenterForBackdrop, false);
  screen.unmount();
});

test('G20 and landscape HUD keep notifications strictly below top bar, clear of side overlays, deduplicated, and modal-safe', async () => {
  const flat = style => {
    const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
    return Object.assign({}, ...(Array.isArray(resolved) ? resolved : [resolved]));
  };
  const hasDescendant = (node, targetTestId) => {
    if (!node || typeof node !== 'object') return false;
    if (node.props?.testID === targetTestId) return true;
    const children = Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children];
    return children.some(child => hasDescendant(child, targetTestId));
  };

  const viewports = [
    { name: 'G20-1920x1200@408dpi', width: 753, height: 447, navInset: 48 },
    { name: 'narrow-640x360', width: 640, height: 360, navInset: 0 },
    { name: 'wide-1024x576', width: 1024, height: 576, navInset: 0 },
  ];

  for (const vp of viewports) {
    const effW = vp.width;
    const clampedBottom = vp.navInset > 0 ? Math.min(4, vp.navInset) : 0;
    const effH = vp.height - clampedBottom;
    const fakeMediaAdapter = {
      supported: true,
      storageTargetLabel: '系统相册',
      async capturePhoto() { throw new Error('no stream'); },
      async startRecording() { throw new Error('no stream'); },
    };
    const screen = mount({
      landscapeDocksExpanded: false,
      dev: false,
      dimensions: { width: vp.width, height: vp.height, fontScale: 1 },
      navigationInset: async () => vp.navInset,
      connected: true,
      video: { id: 'front-live', phase: 'connecting' },
      videoSurface: 'front-surface',
      mediaCaptureAdapter: fakeMediaAdapter,
      manualControlBlockedReason: '请先使能电机',
      productionInput: {
        ready: false,
        touchReady: false,
        onDrive() {},
        onTurn() {},
        onInterrupt() {},
      },
      runtimeState: {
        controlLink: 'connected',
        controlAuthority: 'not-held',
        controlOwner: 'none',
        motorState: 'disabled',
        posture: 'sitting',
        faultStatus: 'clear',
        battery: { voltageV: 56.1 },
        signal: { qualityPercent: 100, latencyMs: 12, source: 'controller' },
        joints: [
          { id: '0', label: '右前髋', source: 'device', online: true, temperatureC: 29 },
        ],
      },
      operationReadiness: {
        enableMotor: { ready: true },
        disableMotor: { ready: false },
        stop: { ready: true },
        clearMotorFault: { ready: true },
      },
      operationCallbacks: {
        enableMotor() {},
        stop() {},
        clearMotorFault() {},
      },
      onListGestures: async () => [{ name: 'wave', description: '挥手', durationMs: 2000 }],
      workspaceSettings: {
        themePreference: 'dark',
        onChangeTheme() {},
        alertsEnabled: true,
        onToggleAlerts() {},
        connection: {
          host: '192.168.66.64',
          port: 13145,
          connected: true,
          readonlyConnected: false,
          onConnectControl: async () => true,
          onDisconnect: async () => {},
        },
      },
    });
    await screen.settle();

    // 1. Driving HUD: true fullscreen (SafeAreaView edges=[]), no 48dp bottom dead gap,
    //    notice stack sits strictly below topStatusBarLayer, passive "请先使能电机" does NOT linger,
    //    and redundant video empty text stays hidden over 3D standby.
    const statusBarStyle = flat(screen.find('control-hud-status-bar').props.style);
    const telemetryStyle = flat(screen.find('control-telemetry').props.style);
    const noticeStack = screen.find('control-hud-notice-stack');
    assert.ok(noticeStack, `${vp.name}: notice stack mounts in driving mode`);
    const noticeStyle = flat(noticeStack.props.style);
    assert.ok(noticeStyle.top >= statusBarStyle.height, `${vp.name}: notice stack top ${noticeStyle.top} >= statusBar height ${statusBarStyle.height}`);
    assert.ok(noticeStyle.gap > 0, `${vp.name}: notice stack vertically separates stacked pills`);
    assert.ok(noticeStyle.left >= Math.min(228, Math.round(effW * 0.30)) - 1, `${vp.name}: notice stack clears left telemetry column`);
    assert.ok(telemetryStyle.maxWidth <= effW - 140, `${vp.name}: top-right cluster reserves left Row 1 width`);
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive "请先使能电机" does not linger permanently on idle HUD`);
    assert.ok(hasDescendant(noticeStack, 'control-hud-video-empty'), `${vp.name}: video empty marker remains mounted in notice stack`);
    assert.equal(flat(screen.find('control-hud-video-empty').props.style).opacity, 0, `${vp.name}: redundant buffering pill stays hidden on 3D standby`);

    // Touching a disabled joystick disc triggers a brief toast instead of permanent text.
    assert.equal(typeof screen.pair.onBlockedPress, 'function', `${vp.name}: blocked joystick wires onBlockedPress`);
    screen.pair.onBlockedPress();
    screen.render();
    assert.match(screen.find('control-hud-notice').props.children.props.children, /请先使能电机/);
    screen.advance(3000);
    assert.equal(screen.find('control-hud-notice'), undefined, `${vp.name}: blocked joystick notice auto-dismisses`);

    // 2. Dual-camera PiP open: notice stack right corridor shifts clear of PiP window.
    screen.find('control-hud-camera-count-toggle').props.onPress();
    screen.render();
    const pipStyle = flat(screen.find('control-hud-pip-window').props.style);
    const noticeWithPipStyle = flat(screen.find('control-hud-notice-stack').props.style);
    assert.ok(noticeWithPipStyle.right >= pipStyle.width + pipStyle.right, `${vp.name}: notice stack right ${noticeWithPipStyle.right} clears PiP ${pipStyle.width + pipStyle.right}`);
    screen.find('control-hud-camera-count-toggle').props.onPress();
    screen.render();

    // 3. Speed limit popover clears Row 4 on G20/short stages.
    screen.find('control-hud-speed-limit-toggle').props.onPress();
    screen.render();
    const speedBarStyle = flat(screen.find('control-hud-speed-limit-bar').props.style);
    if (effH < 410) {
      assert.ok(speedBarStyle.top >= 126, `${vp.name}: speed limit bar top ${speedBarStyle.top} clears Row 4`);
    }
    screen.find('control-hud-speed-limit-toggle').props.onPress();
    screen.render();

    // 4. Fault active: alertBanner replaces duplicate generic fault feedback and keeps empty video hidden.
    screen.render({
      runtimeState: {
        controlLink: 'connected',
        controlAuthority: 'not-held',
        controlOwner: 'none',
        motorState: 'disabled',
        posture: 'sitting',
        faultStatus: 'active',
        faultSummary: '设备故障，请检查设备状态',
        battery: { voltageV: 56.1 },
      },
    });
    assert.ok(screen.find('control-hud-alert-banner'), `${vp.name}: fault alert banner mounts`);
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: duplicate generic fault feedback is deduplicated`);
    assert.equal(flat(screen.find('control-hud-video-empty').props.style).opacity, 0, `${vp.name}: buffering chip collapses under active alert`);
    screen.render({
      runtimeState: {
        controlLink: 'connected',
        controlAuthority: 'not-held',
        controlOwner: 'none',
        motorState: 'disabled',
        posture: 'sitting',
        faultStatus: 'clear',
        battery: { voltageV: 56.1 },
      },
    });

    // 5. Opening Settings, Status Bento, or Action Studio keeps HUD overlays cleanly separated.
    screen.find('control-hud-settings').props.onPress();
    screen.render();
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive prompt suppressed under Settings`);
    assert.ok(flat(screen.find('control-settings-menu').props.style).top >= 40, `${vp.name}: Settings clears top E-Stop`);
    assert.equal(flat(screen.find('control-hud-video-empty').props.style).opacity, 0, `${vp.name}: buffering chip hidden under Settings`);
    screen.find('control-close-settings').props.onPress();
    screen.render();

    screen.find('control-hud-open-status').props.onPress();
    screen.render();
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive prompt suppressed under Status Bento`);
    screen.find('status-bento-close').props.onPress();
    screen.render();

    screen.find('control-hud-category-action').props.onPress();
    screen.render();
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive prompt suppressed under Action Studio`);
    screen.find('control-hud-category-action').props.onPress();
    screen.render();

    // 6. Voice Wing: suppresses passive prompt, clears Row 3 on short stages, and shifts active hudNotice horizontally right.
    screen.find('control-hud-voice-toggle').props.onPress();
    screen.render();
    const wingStyle = flat(screen.find('control-hud-voice-wing').props.style);
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive prompt suppressed under Voice Wing`);
    if (effH < 410) {
      assert.ok(wingStyle.top >= 92, `${vp.name}: Voice Wing top ${wingStyle.top} clears Row 3`);
    }
    screen.find('control-hud-photo-capture').props.onPress();
    await screen.settle();
    const noticeDuringVoice = flat(screen.find('control-hud-notice-stack').props.style);
    assert.ok(noticeDuringVoice.left >= wingStyle.width, `${vp.name}: active notice left ${noticeDuringVoice.left} clears Voice Wing ${wingStyle.width}`);
    screen.advance(4500);
    screen.find('control-hud-voice-toggle').props.onPress();
    screen.render();

    // 7. Floating panel (Body Height): suppresses passive prompt, anchors active hudNotice at bottom-center, and never shifts panel top.
    screen.find('control-hud-category-posture').props.onPress();
    screen.render();
    screen.find('control-hud-posture-height').props.onPress();
    screen.render();
    const overlayStackBefore = flat(screen.find('control-hud-overlay-stack').props.style);
    assert.equal(screen.find('control-operation-feedback'), undefined, `${vp.name}: passive prompt suppressed under BodyHeightPanel`);
    screen.find('control-hud-photo-capture').props.onPress();
    await screen.settle();
    const noticeDuringPanel = flat(screen.find('control-hud-notice-stack').props.style);
    const overlayStackAfter = flat(screen.find('control-hud-overlay-stack').props.style);
    assert.equal(noticeDuringPanel.top, undefined, `${vp.name}: modal/panel notice does not anchor at top`);
    assert.ok(noticeDuringPanel.bottom > 0, `${vp.name}: modal/panel notice anchors cleanly at bottom-center`);
    assert.equal(overlayStackAfter.top, overlayStackBefore.top, `${vp.name}: floating panel top never jumps when hudNotice fires`);
    screen.unmount();
  }
});

test('G20 fullscreen, prominent status pill, zeroing tutorial, G20 switch, Android audio test, and quick-connect work end to end', async () => {
  let g20Starts = 0;
  const quickConnectCalls = [];
  const sitCalls = [];
  const setZeroCalls = [];
  const hardware = physicalFixture();
  hardware.controller.state = {
    ...hardware.controller.state,
    status: 'stopped',
    reading: false,
    calibrated: false,
    sample: null,
  };
  const originalStart = hardware.controller.start;
  hardware.controller.start = () => { g20Starts += 1; originalStart(); };

  const screen = mount({
    landscapeDocksExpanded: false,
    dev: false,
    dimensions: { width: 753, height: 471, fontScale: 1 },
    navigationInset: async () => 48,
    connected: true,
    video: { id: 'front-live', phase: 'connecting' },
    videoSurface: 'front-surface',
    g20Controller: hardware.controller,
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'not-held',
      controlOwner: 'none',
      motorState: 'disabled',
      posture: 'standing',
      faultStatus: 'clear',
      battery: { voltageV: 56.1 },
      joints: [{ id: '0', label: '右前髋', source: 'device', online: true, temperatureC: 29 }],
    },
    operationReadiness: {
      sit: { ready: true },
      setZero: { ready: true },
      stop: { ready: true },
    },
    operationCallbacks: {
      sit() { sitCalls.push('sit'); },
      setZero() { setZeroCalls.push('setZero'); },
      stop() {},
    },
    workspaceSettings: {
      themePreference: 'dark',
      onChangeTheme() {},
      alertsEnabled: true,
      onToggleAlerts() {},
      connection: {
        host: '192.168.66.64',
        port: 13145,
        connected: true,
        readonlyConnected: false,
        onConnectControl: async (host, port) => { quickConnectCalls.push([host, port]); return true; },
        onDisconnect: async () => {},
      },
    },
  });
  await screen.settle();

  // 1. True fullscreen SafeAreaView (no top/bottom inset bars on landscape cameraHud) & prominent Status pill.
  assert.deepEqual([...screen.safeArea.edges], []);
  const statusPill = screen.find('control-hud-open-status');
  assert.ok(statusPill, 'prominent status pill renders');
  assert.match(screen.copy, /状态/);

  // 2. Settings -> 操控: uncalibrated G20 button is tappable, opens 手柄校准, and auto-starts G20 reading via start().
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  const physicalBtn = screen.find('control-setting-source-physical');
  assert.equal(physicalBtn.props.disabled, false, 'G20 button must not silently dead-click when uncalibrated');
  physicalBtn.props.onPress();
  screen.render();
  assert.equal(g20Starts, 1, 'opening G20 calibration auto-starts real reading via start()');
  assert.ok(screen.inputPanel, 'embedded G20InputPanel renders inside settings');
  screen.inputPanel.onStart();
  assert.equal(g20Starts, 2, 'G20InputPanel start button calls start() instead of read-only observe()');
  screen.find('control-settings-subview-back').props.onPress();
  screen.render();

  // 3. Settings -> 图传与音频 -> 声音测试 invokes native TTS/tone + haptic + toast notice.
  screen.find('control-settings-tab-图传与音频').props.onPress();
  screen.render();
  screen.find('control-setting-test-audio').props.onPress();
  await screen.settle();
  assert.ok(screen.audioCalls.length > 0, 'sound test invokes native audio bridge');
  assert.ok(screen.hapticCalls.length > 0, 'sound test triggers haptic feedback');
  assert.ok(screen.find('control-hud-notice'), 'sound test shows toast confirmation');

  // 4. Settings -> 机器狗维护: elevated 电机标零 card + 3-step interactive 标零教程.
  screen.find('control-settings-tab-机器狗维护').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-zeroing-card'), 'elevated zeroing card renders in 机器狗维护');
  screen.find('control-settings-zeroing-guide').props.onPress();
  screen.render();
  assert.ok(screen.find('control-settings-subview-zeroing'), 'zeroing tutorial subview opens');
  assert.ok(screen.find('control-zeroing-quick-sit'), 'standing robot exposes quick-sit button inside zeroing guide');
  screen.find('control-zeroing-quick-sit').props.onPress();
  screen.render();
  assert.equal(sitCalls.length, 1, 'quick-sit inside zeroing tutorial closes settings and dispatches sit');

  // Once robot settles into sitting posture, re-open zeroing tutorial and submit -> safety confirmation dialog.
  screen.render({
    runtimeState: {
      controlLink: 'connected',
      controlAuthority: 'not-held',
      controlOwner: 'none',
      motorState: 'disabled',
      posture: 'sitting',
      faultStatus: 'clear',
      battery: { voltageV: 56.1 },
      joints: [{ id: '0', label: '右前髋', source: 'device', online: true, temperatureC: 29 }],
    },
  });
  await screen.settle();
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  screen.find('control-settings-tab-机器狗维护').props.onPress();
  screen.render();
  screen.find('control-settings-zeroing-guide').props.onPress();
  screen.render();
  screen.find('control-zeroing-guide-submit').props.onPress();
  screen.render();
  assert.ok(screen.find('control-immersive-confirm'), 'zeroing tutorial submit goes through safety confirmation');

  // 5. Settings -> 连接与设备: embedded WifiDiscoveryPanel receives onQuickConnect.
  screen.find('control-immersive-confirm-overlay').props.children[0].props.onPress();
  screen.render();
  screen.find('control-hud-settings').props.onPress();
  screen.render();
  screen.find('control-settings-tab-连接与设备').props.onPress();
  screen.render();
  const discovery = screen.find('control-settings-wifi-discovery');
  assert.equal(typeof discovery.props.onQuickConnect, 'function', 'embedded WifiDiscoveryPanel wires onQuickConnect');
  discovery.props.onQuickConnect('192.168.66.64', 13145);
  await screen.settle();
  assert.deepEqual(quickConnectCalls, [['192.168.66.64', 13145]]);

  screen.unmount();
});
