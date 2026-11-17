import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, stubs = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency ${name}`);
    return stubs[name];
  } }, { filename: path });
  return module.exports;
}

const rules = load('src/features/robot-lifecycle/robotHotspotRules.ts');
const session = load('src/features/robot-lifecycle/wifiDiscoverySession.ts', { './robotHotspotRules': rules });
const copy = load('src/features/robot-lifecycle/wifiDiscoveryCopy.ts', {
  './robotHotspotRules': rules,
  './wifiDiscoverySession': session,
});

test('scan payloads keep SSID strings and drop signal fields', () => {
  const payload = session.sanitizeWifiScanPayload({ ssids: ['DOSOrobotics', 4, null, ''], throttled: 1, rssi: -40, level: 3 });
  assert.equal(payload.throttled, false);
  assert.equal([...payload.ssids].join('|'), 'DOSOrobotics|');
  const empty = session.sanitizeWifiScanPayload(null);
  assert.equal(empty.throttled, false);
  assert.equal([...empty.ssids].length, 0);
});

test('Android 13 uses nearby Wi-Fi permission and older releases use fine location', () => {
  assert.equal(session.androidWifiScanPermission(33), 'android.permission.NEARBY_WIFI_DEVICES');
  assert.equal(session.androidWifiScanPermission(32), 'android.permission.ACCESS_FINE_LOCATION');
  assert.equal(session.androidWifiScanPermission(30), 'android.permission.ACCESS_FINE_LOCATION');
});

test('Android scan results surface only hotspot rules and do not treat the lab router as a robot', () => {
  const found = session.interpretAndroidScan(['TopSpeed5GCPE-5525', '"DOSOrobotics"', 'DOSOrobotics'], 'TopSpeed5GCPE-5525');
  assert.equal(found.matches.map(rule => rule.ssid).join(','), 'DOSOrobotics');
  assert.equal(found.apply?.host, '192.168.50.1');
  assert.equal(found.apply?.port, 13145);
  assert.equal(found.unrelatedCurrent, true);
  assert.equal(found.otherCount, 1);
  const empty = session.interpretAndroidScan(['TopSpeed5GCPE-5525'], null);
  assert.equal(empty.apply, null);
  assert.equal(empty.matches.length, 0);
  assert.equal(empty.unrelatedCurrent, false);
});

test('inactive system sheets do not count as leaving the app', () => {
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('active'), false);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('inactive'), false);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('background'), true);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('unknown'), true);
});

test('iOS current-network interpretation never invents a nearby list', () => {
  assert.equal(session.interpretCurrentNetwork('DOSOrobotics').apply?.port, 13145);
  const router = session.interpretCurrentNetwork('TopSpeed5GCPE-5525');
  assert.equal(router.apply, null);
  assert.equal(router.unrelatedCurrent, true);
  assert.equal(router.matches.length, 0);
  assert.equal(session.interpretCurrentNetwork(null).currentSsid, null);
});

test('status copy explains permission, empty, and lab-manual cases without fake telemetry or cloud endpoints', () => {
  const source = readFileSync(new URL('../src/features/robot-lifecycle/wifiDiscoveryCopy.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /5050|5052|Gateway|Broker|云端状态已通|192\.168\.66\.64|rssi|信号格|电量/);
  const base = { ...copy.initialWifiPanelState };
  assert.match(copy.wifiStatusText({ ...base, phase: 'error', error: 'permission_denied' }, 'android-scan'), /定位权限/);
  assert.match(copy.wifiStatusText({ ...base, phase: 'error', error: 'permission_denied' }, 'ios-current'), /不能列出附近的全部网络/);
  assert.match(copy.wifiStatusText({ ...base, phase: 'error', error: 'location_off' }, 'android-scan'), /定位服务/);
  assert.match(copy.wifiStatusText({ ...base, phase: 'ready', sighting: session.interpretAndroidScan([], 'TopSpeed5GCPE-5525') }, 'android-scan'), /TopSpeed5GCPE-5525/);
  assert.match(copy.wifiStatusText({ ...base, phase: 'ready', sighting: session.interpretAndroidScan([], 'TopSpeed5GCPE-5525') }, 'android-scan'), /手动输入/);
  assert.match(copy.wifiDiscoveryHint('ios-current'), /不能列出附近的全部 Wi-Fi/);
  assert.match(copy.wifiDiscoveryHint('android-scan'), /DOSOrobotics（192\.168\.50\.1:13145）/);
  assert.match(copy.wifiDiscoveryHint('android-scan'), /蓝牙配网尚未接入/);
  assert.equal(copy.wifiSettingsAction('permission_blocked'), true);
  assert.equal(copy.wifiSettingsAction('permission_denied'), false);
});

test('a discovered hotspot does not count as joined until the user asks to join', () => {
  const sighting = session.interpretAndroidScan(['DOSOrobotics'], null);
  let state = copy.reduceWifiPanel(copy.initialWifiPanelState, { type: 'start', action: 'scan' });
  state = copy.reduceWifiPanel(state, { type: 'scan', sighting, throttled: false, applied: true, needsConfirm: false });
  assert.equal(state.holding, false);
  assert.equal(state.joinResult, null);
  assert.match(copy.wifiStatusText(state, 'android-scan'), /已填入 192\.168\.50\.1:13145/);
  state = copy.reduceWifiPanel(state, { type: 'join', result: 'cancelled', rule: sighting.apply });
  assert.equal(state.holding, false);
  assert.match(copy.wifiStatusText(state, 'android-scan'), /未加入热点/);
});
