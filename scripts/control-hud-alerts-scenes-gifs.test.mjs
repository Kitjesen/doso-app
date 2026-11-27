import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hudSource = readFileSync(resolve(rootDir, 'src/components/controlLandscapeHud.tsx'), 'utf8');
const scenesSource = readFileSync(resolve(rootDir, 'src/components/standbyScenes.ts'), 'utf8');
const gestureAssetsSource = readFileSync(resolve(rootDir, 'src/components/gesturePreviewAssets.ts'), 'utf8');
const hudModelSource = readFileSync(resolve(rootDir, 'src/components/controlHudModel.ts'), 'utf8');

function compileCjs(source, isTsx = false) {
  return ts.transpileModule(source, {
    compilerOptions: {
      jsx: isTsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.None,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadDeriveHudAlertBanner() {
  const module = { exports: {} };
  const noop = () => null;
  vm.runInNewContext(compileCjs(hudSource, true), {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return { useEffect: noop, useRef: v => ({ current: v }), useState: v => [v, noop] };
      if (name === 'react/jsx-runtime') return { jsx: noop, jsxs: noop, Fragment: 'Fragment' };
      if (name === 'react-native') {
        return {
          Animated: { Value: function V() {}, View: 'AnimatedView', timing: () => ({ start: noop }), loop: () => ({ start: noop, stop: noop }), sequence: () => ({}) },
          Image: 'Image',
          Platform: { OS: 'android' },
          Pressable: 'Pressable',
          ScrollView: 'ScrollView',
          StyleSheet: { create: s => s, absoluteFillObject: {} },
          View: 'View',
        };
      }
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      return new Proxy({}, { get: () => noop });
    },
  });
  return module.exports.deriveHudAlertBanner;
}

function loadStandbyScenes() {
  const module = { exports: {} };
  const requiredPaths = [];
  vm.runInNewContext(compileCjs(scenesSource), {
    module,
    exports: module.exports,
    require(spec) {
      requiredPaths.push(spec);
      return { uri: spec };
    },
  });
  return { ...module.exports, requiredPaths };
}

function loadGestureAssets() {
  const module = { exports: {} };
  const requiredPaths = [];
  vm.runInNewContext(compileCjs(gestureAssetsSource), {
    module,
    exports: module.exports,
    require(spec) {
      requiredPaths.push(spec);
      return { uri: spec };
    },
  });
  return { ...module.exports, requiredPaths };
}

function loadHudModel() {
  const module = { exports: {} };
  vm.runInNewContext(compileCjs(hudModelSource), {
    module,
    exports: module.exports,
    require() { return {}; },
  });
  return module.exports;
}

test('deriveHudAlertBanner enforces priority: fault > motor overheat >=65C > low battery > null', () => {
  const deriveHudAlertBanner = loadDeriveHudAlertBanner();

  const fault = deriveHudAlertBanner({
    faults: [{ id: 'motor-1', title: '电机过流', detail: 'd', severity: 'critical' }],
    joints: [{ id: '12', label: '右前足轮', source: 'device', online: true, temperatureC: 82 }],
    voltageV: 41.2,
    batteryPercent: 8,
  });
  assert.equal(fault?.kind, 'fault');
  assert.equal(fault?.severity, 'critical');
  assert.equal(fault?.text, '电机过流');
  assert.equal(fault?.canClearFault, true);

  // Multiple faults or long title collapses to concise copy.
  const multiFault = deriveHudAlertBanner({
    faults: [
      { id: 'f1', title: '超长异常描述超过十个汉字字数', detail: '', severity: 'warning' },
      { id: 'f2', title: '第二项', detail: '', severity: 'warning' },
    ],
  });
  assert.equal(multiFault?.text, '检测到故障');
  assert.equal(multiFault?.severity, 'warning');

  // joint-temp-* faults yield to hottest online device joint overheat alert naming exact leg/wheel.
  const overheat = deriveHudAlertBanner({
    faults: [{ id: 'joint-temp-12', title: '温度高', detail: '', severity: 'warning' }],
    joints: [
      { id: '3', label: '左前髋', source: 'device', online: true, temperatureC: 68.4 },
      { id: '12', label: '右前足轮', source: 'device', online: true, temperatureC: 77.6 },
      { id: '15', label: '左后足轮', source: 'device', online: false, temperatureC: 99 },
      { id: '0', label: '右前髋', source: 'demo', online: true, temperatureC: 99 },
    ],
    voltageV: 42.0,
    batteryPercent: 12,
  });
  assert.equal(overheat?.kind, 'overheat');
  assert.equal(overheat?.severity, 'critical');
  assert.equal(overheat?.text, '右前轮 78°C');
  assert.equal(overheat?.canClearFault, false);

  const warmWarning = deriveHudAlertBanner({
    faults: [],
    joints: [{ id: '3', label: '左前髋', source: 'device', online: true, temperatureC: 65.2 }],
  });
  assert.equal(warmWarning?.kind, 'overheat');
  assert.equal(warmWarning?.severity, 'warning');
  assert.equal(warmWarning?.text, '左前髋 65°C');

  // Low battery percent thresholds (warning <=20%, critical <=10%).
  const lowPctWarn = deriveHudAlertBanner({ faults: [], batteryPercent: 20, voltageV: 48 });
  assert.equal(lowPctWarn?.kind, 'low-battery');
  assert.equal(lowPctWarn?.severity, 'warning');
  assert.equal(lowPctWarn?.text, '电量偏低 20%');

  const lowPctCrit = deriveHudAlertBanner({ faults: [], batteryPercent: 9.6, voltageV: 48 });
  assert.equal(lowPctCrit?.severity, 'critical');
  assert.equal(lowPctCrit?.text, '电量偏低 10%');

  // Voltage fallback when batteryPercent is absent (<44V warning, <42.5V critical).
  const lowVoltWarn = deriveHudAlertBanner({ faults: [], voltageV: 43.4 });
  assert.equal(lowVoltWarn?.kind, 'low-battery');
  assert.equal(lowVoltWarn?.severity, 'warning');
  assert.equal(lowVoltWarn?.text, '电量偏低 43.4V');

  const lowVoltCrit = deriveHudAlertBanner({ faults: [], voltageV: 42.1 });
  assert.equal(lowVoltCrit?.severity, 'critical');

  // Nominal telemetry produces no banner.
  assert.equal(deriveHudAlertBanner({
    faults: [],
    joints: [{ id: '0', label: '右前髋', source: 'device', online: true, temperatureC: 48 }],
    voltageV: 52.4,
    batteryPercent: 85,
  }), null);
});

test('standbyScenes locks 4 forest/charcoal/gallery/hangar scenes with real on-disk assets', () => {
  const scenes = loadStandbyScenes();
  assert.deepEqual(
    JSON.parse(JSON.stringify(scenes.STANDBY_SCENES.map(s => [s.id, s.label]))),
    [
      ['forest', '迷雾森林'],
      ['charcoal', '炭灰影棚'],
      ['gallery', '建筑展厅'],
      ['hangar', '星际舱室'],
    ],
  );
  assert.equal(scenes.normalizeStandbyScene('forest'), 'forest');
  assert.equal(scenes.normalizeStandbyScene('charcoal'), 'charcoal');
  assert.equal(scenes.normalizeStandbyScene('gallery'), 'gallery');
  assert.equal(scenes.normalizeStandbyScene('hangar'), 'hangar');
  assert.equal(scenes.normalizeStandbyScene('aurora'), 'forest');
  assert.equal(scenes.normalizeStandbyScene('dusk'), 'forest');
  assert.equal(scenes.normalizeStandbyScene('rain'), 'forest');
  assert.equal(scenes.normalizeStandbyScene(undefined), 'forest');
  assert.equal(scenes.getStandbySceneSpec('unknown').id, 'forest');

  assert.equal(scenes.requiredPaths.length, 4);
  for (const rel of scenes.requiredPaths) {
    const abs = resolve(rootDir, 'src/components', rel);
    assert.equal(existsSync(abs), true, `missing standby scene file: ${abs}`);
    assert.ok(statSync(abs).size > 10_000, `standby scene file looks empty/corrupt: ${abs}`);
  }
});

test('gesturePreviewAssets maps all 35 gestures to existing GIF files and Action Studio excludes recovery', () => {
  const { GESTURE_PREVIEW_ASSETS, getGesturePreviewAsset, requiredPaths } = loadGestureAssets();
  const keys = Object.keys(GESTURE_PREVIEW_ASSETS);
  assert.equal(keys.length, 35, 'all 35 MuJoCo-rendered gesture GIFs must be registered');
  assert.equal(requiredPaths.length, 35);

  for (const rel of requiredPaths) {
    assert.match(rel, /^\.\.\/\.\.\/assets\/gestures\/[a-z0-9_]+\.gif$/);
    const abs = resolve(rootDir, 'src/components', rel);
    assert.equal(existsSync(abs), true, `missing gesture GIF: ${abs}`);
    assert.ok(statSync(abs).size > 20_000, `gesture GIF too small: ${abs}`);
  }

  assert.ok(getGesturePreviewAsset('offer_paw'));
  assert.equal(getGesturePreviewAsset('nonexistent_gesture'), undefined);
  assert.equal(getGesturePreviewAsset(null), undefined);

  const { DEFAULT_THUNDER_GESTURES, projectHudGestures } = loadHudModel();
  assert.ok(DEFAULT_THUNDER_GESTURES.length >= 30);
  const projected = projectHudGestures([
    { name: 'offer_paw', label: '握手', durationMs: 2500 },
    { name: 'recovery', label: '摔倒恢复', durationMs: 4000 },
    { name: 'fall_recovery', label: '恢复站立', durationMs: 4000 },
    { name: 'recover', label: '摔倒恢复', durationMs: 4000 },
    { name: 'sit', label: '坐下', durationMs: 2000 },
  ], 'all');
  assert.equal(projected.allItems.some(item => /recover|摔倒恢复/i.test(`${item.name} ${item.label}`)), false, 'recovery must stay on center posture dock, excluded from gesture deck');
  assert.ok(projected.filteredItems.some(item => item.name === 'offer_paw'));
});
