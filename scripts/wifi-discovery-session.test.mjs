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

const plain = value => JSON.parse(JSON.stringify(value));
const rules = load('src/features/robot-lifecycle/robotHotspotRules.ts');
const session = load('src/features/robot-lifecycle/wifiDiscoverySession.ts', { './robotHotspotRules': rules });
const copy = load('src/features/robot-lifecycle/wifiDiscoveryCopy.ts', {
  './robotHotspotRules': rules,
  './wifiDiscoverySession': session,
});

function loadAndroidAdapter(nativeModule = null, permissionsMock = {}) {
  return load('src/features/robot-lifecycle/wifiDiscoveryAdapter.android.ts', {
    expo: { requireOptionalNativeModule: () => nativeModule },
    'react-native': {
      Platform: { Version: permissionsMock.apiLevel ?? 33 },
      PermissionsAndroid: {
        RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
        check: permissionsMock.check ?? (async () => true),
        request: permissionsMock.request ?? (async () => 'granted'),
        requestMultiple: permissionsMock.requestMultiple ?? (async () => ({
          'android.permission.ACCESS_FINE_LOCATION': 'granted',
          'android.permission.ACCESS_COARSE_LOCATION': 'granted',
        })),
      },
    },
    './robotHotspotRules': rules,
    './wifiDiscoverySession': session,
  });
}

function loadIosAdapter(nativeModule = null) {
  return load('src/features/robot-lifecycle/wifiDiscoveryAdapter.ios.ts', {
    expo: { requireOptionalNativeModule: () => nativeModule },
    './robotHotspotRules': rules,
    './wifiDiscoverySession': session,
  });
}

test('scan payloads keep SSID strings and drop signal fields', () => {
  const payload = session.sanitizeWifiScanPayload({ ssids: ['DOSOrobotics', 4, null, ''], throttled: 1, rssi: -40, level: 3 });
  assert.equal(payload.throttled, false);
  assert.equal([...payload.ssids].join('|'), 'DOSOrobotics|');
  const empty = session.sanitizeWifiScanPayload(null);
  assert.equal(empty.throttled, false);
  assert.equal([...empty.ssids].length, 0);
});

test('Android requires fine location across API levels and pairs coarse location on API 31+ (including API 33)', async () => {
  assert.equal(session.androidWifiScanPermission(33), 'android.permission.ACCESS_FINE_LOCATION');
  assert.equal(session.androidWifiScanPermission(32), 'android.permission.ACCESS_FINE_LOCATION');
  assert.equal(session.androidWifiScanPermission(30), 'android.permission.ACCESS_FINE_LOCATION');
  assert.deepEqual(
    plain(session.androidWifiScanPermissions(33)),
    ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
  );
  assert.deepEqual(
    plain(session.androidWifiScanPermissions(31)),
    ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
  );
  assert.deepEqual(
    plain(session.androidWifiScanPermissions(30)),
    ['android.permission.ACCESS_FINE_LOCATION'],
  );

  // API 33 requests fine+coarse together via requestMultiple and rejects approximate-only grant.
  const multiCalls = [];
  const api33DeniedFine = loadAndroidAdapter(null, {
    apiLevel: 33,
    check: async () => false,
    requestMultiple: async perms => {
      multiCalls.push(perms);
      return {
        'android.permission.ACCESS_FINE_LOCATION': 'denied',
        'android.permission.ACCESS_COARSE_LOCATION': 'granted',
      };
    },
  });
  await assert.rejects(
    () => api33DeniedFine.requestAndroidWifiScanPermission(33),
    error => error.code === 'permission_denied',
  );
  assert.deepEqual(plain(multiCalls), [[
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
  ]]);

  const api33Blocked = loadAndroidAdapter(null, {
    apiLevel: 33,
    check: async () => false,
    requestMultiple: async () => ({
      'android.permission.ACCESS_FINE_LOCATION': 'never_ask_again',
      'android.permission.ACCESS_COARSE_LOCATION': 'never_ask_again',
    }),
  });
  await assert.rejects(
    () => api33Blocked.requestAndroidWifiScanPermission(33),
    error => error.code === 'permission_blocked',
  );

  const api33Granted = loadAndroidAdapter(null, {
    apiLevel: 33,
    check: async () => false,
    requestMultiple: async () => ({
      'android.permission.ACCESS_FINE_LOCATION': 'granted',
      'android.permission.ACCESS_COARSE_LOCATION': 'granted',
    }),
  });
  await api33Granted.requestAndroidWifiScanPermission(33);

  // LAN discovery stays completely location-permission-free on Android 13.
  let permissionChecks = 0;
  const lanNoLoc = loadAndroidAdapter({
    async scanSsids() { return { ssids: [], throttled: false }; },
    async currentSsid() { return null; },
    async discoverLanRobots() { return { robots: [{ host: '192.168.66.64', port: 13145, displayName: 'DOSO-THUNDER-001' }], timedOut: false }; },
    async stopLanDiscovery() {},
    async joinKnownSsid() { return 'already'; },
    async releaseJoinedNetwork() {},
  }, {
    apiLevel: 33,
    check: async () => { permissionChecks += 1; return false; },
    requestMultiple: async () => { throw new Error('LAN discovery must not request location'); },
  }).wifiDiscoveryAdapter;
  const lanResult = await lanNoLoc.discoverLanRobots();
  assert.equal(lanResult.robots.length, 1);
  assert.equal(permissionChecks, 0);
});

test('Android scan supports multiple DOSO-* hotspots with deterministic sort and safe auto-apply', () => {
  const single = session.interpretAndroidScan(['TopSpeed5GCPE-5525', '"DOSOrobotics"', 'DOSOrobotics'], 'TopSpeed5GCPE-5525');
  assert.equal(single.matches.map(rule => rule.ssid).join(','), 'DOSOrobotics');
  assert.equal(single.apply?.host, '192.168.50.1');
  assert.equal(single.apply?.port, 13145);
  assert.equal(single.unrelatedCurrent, true);
  assert.equal(single.otherCount, 1);

  const multiUnconnected = session.interpretAndroidScan(
    ['TopSpeed5GCPE-5525', 'DOSO-XY99', 'DOSOrobotics', 'DOSO-AB12'],
    'TopSpeed5GCPE-5525',
  );
  assert.deepEqual(
    plain(multiUnconnected.matches.map(rule => rule.ssid)),
    ['DOSO-AB12', 'DOSO-XY99', 'DOSOrobotics'],
  );
  assert.equal(multiUnconnected.apply, null, 'multiple hotspots must not auto-overwrite when unconnected');

  const multiConnected = session.interpretAndroidScan(
    ['DOSO-AB12', 'DOSO-XY99'],
    '"DOSO-XY99"',
  );
  assert.deepEqual(
    plain(multiConnected.matches.map(rule => rule.ssid)),
    ['DOSO-XY99', 'DOSO-AB12'],
  );
  assert.equal(multiConnected.apply?.ssid, 'DOSO-XY99');
  assert.equal(multiConnected.unrelatedCurrent, false);

  const empty = session.interpretAndroidScan(['TopSpeed5GCPE-5525'], null);
  assert.equal(empty.apply, null);
  assert.equal(empty.matches.length, 0);
  assert.equal(empty.unrelatedCurrent, false);
});

test('LAN robot validation enforces private RFC1918 IPv4, valid ports, sanitized strings, dedup, and deterministic sort', () => {
  assert.equal(session.isPrivateIpv4('10.0.0.1'), true);
  assert.equal(session.isPrivateIpv4('172.16.0.1'), true);
  assert.equal(session.isPrivateIpv4('172.31.255.254'), true);
  assert.equal(session.isPrivateIpv4('192.168.66.64'), true);
  for (const invalid of [
    '8.8.8.8', '127.0.0.1', '169.254.1.10', '172.15.0.1', '172.32.0.1',
    '192.167.1.1', '192.169.1.1', '192.168.66.064', '192.168.1.256',
    '0.0.0.0', '255.255.255.255', '::1', 'fe80::1', 'robot.local', ' 192.168.1.1', '',
  ]) {
    assert.equal(session.isPrivateIpv4(invalid), false, invalid);
  }

  const payload = session.sanitizeLanDiscoveryPayload({
    timedOut: true,
    robots: [
      { host: '8.8.8.8', port: 13145, displayName: 'Public' },
      { host: '127.0.0.1', port: 13145, displayName: 'Loopback' },
      { host: '192.168.66.64', port: 0, displayName: 'BadPort' },
      { host: '192.168.66.64', port: 65536, displayName: 'OverflowPort' },
      {
        host: '192.168.66.70',
        port: 13145,
        robotId: 'THUNDER-02\u0000\n',
        displayName: '  DOSO-BETA\u202E  ',
        apSsid: '"DOSO-BETA"',
        videoPort: '5050',
        transport: 'lan-dev',
      },
      {
        host: '10.0.0.8',
        port: 13145,
        displayName: 'DOSO-ALPHA',
        robotId: 'ALPHA-01',
        transport: 'tls',
      },
      // Duplicate host:port with missing metadata should merge without duplicating.
      {
        host: '192.168.66.70',
        port: 13145,
        serviceName: 'doso-beta-svc',
      },
      {
        host: '172.20.10.2',
        port: 13145,
        displayName: 'DOSO-GAMMA',
        videoPort: 99999,
        transport: 'invalid-transport',
      },
    ],
  }, '192.168.66.70', '13145');

  assert.equal(payload.timedOut, true);
  assert.deepEqual(plain(payload.robots.map(r => `${r.host}:${r.port}`)), [
    '192.168.66.70:13145',
    '10.0.0.8:13145',
    '172.20.10.2:13145',
  ]);
  assert.equal(payload.robots[0].displayName, 'DOSO-BETA');
  assert.equal(payload.robots[0].robotId, 'THUNDER-02');
  assert.equal(payload.robots[0].apSsid, 'DOSO-BETA');
  assert.equal(payload.robots[0].serviceName, 'doso-beta-svc');
  assert.equal(payload.robots[0].videoPort, 5050);
  assert.equal(payload.robots[0].transport, 'lan-dev');
  assert.equal(payload.robots[2].videoPort, null);
  assert.equal(payload.robots[2].transport, null);
});

test('reconcileDiscoveryResults merges 192.168.50.1 AP duplicate onto hotspot card while keeping distinct LAN robots', () => {
  const onHotspot = session.interpretAndroidScan(['DOSOrobotics', 'DOSO-XY99'], 'DOSOrobotics');
  const lanOnAp = session.sanitizeLanDiscoveryPayload({
    robots: [
      {
        host: '192.168.50.1',
        port: 13145,
        robotId: 'THUNDER-DEV-001',
        displayName: 'DOSO-THUNDER-001',
        apSsid: 'DOSOrobotics',
      },
    ],
  }).robots;
  const merged = session.reconcileDiscoveryResults(onHotspot, lanOnAp, '192.168.50.1', '13145');
  assert.equal(merged.lanRobots.length, 0);
  assert.equal(merged.hotspotMetadata.DOSOrobotics?.displayName, 'DOSO-THUNDER-001');
  assert.equal(merged.hotspotMetadata.DOSOrobotics?.robotId, 'THUNDER-DEV-001');

  // Distinct lab LAN IP (192.168.66.64) is NEVER merged with 192.168.50.1 hotspot.
  const onLab = session.interpretAndroidScan(['DOSOrobotics'], 'TopSpeed5GCPE-5525');
  const lanOnLab = session.sanitizeLanDiscoveryPayload({
    robots: [
      {
        host: '192.168.66.64',
        port: 13145,
        robotId: 'THUNDER-DEV-001',
        displayName: 'DOSO-THUNDER-001',
        apSsid: 'DOSOrobotics',
      },
    ],
  }).robots;
  const distinct = session.reconcileDiscoveryResults(onLab, lanOnLab, '192.168.66.64', '13145');
  assert.equal(distinct.lanRobots.length, 1);
  assert.equal(distinct.lanRobots[0].host, '192.168.66.64');
  assert.equal(distinct.sighting.matches.length, 1);
  assert.equal(Object.keys(distinct.hotspotMetadata).length, 0);
});

test('platform adapters gracefully skip missing native LAN methods and join DOSO-* hotspots', async () => {
  const joined = [];
  const legacyAndroid = loadAndroidAdapter({
    async scanSsids() { return { ssids: ['DOSO-AB12CD'], throttled: false }; },
    async currentSsid() { return null; },
    async joinKnownSsid(ssid) { joined.push(ssid); return 'joined'; },
    async releaseJoinedNetwork() {},
  }).wifiDiscoveryAdapter;

  assert.equal(legacyAndroid.canDiscoverLan, false);
  assert.deepEqual(plain(await legacyAndroid.discoverLanRobots()), { robots: [], timedOut: false });
  await legacyAndroid.stopLanDiscovery();
  assert.equal(await legacyAndroid.joinKnownHotspot('DOSO-AB12CD'), 'joined');
  assert.deepEqual(joined, ['DOSO-AB12CD']);
  await assert.rejects(() => legacyAndroid.joinKnownHotspot('TopSpeed5GCPE-5525'));

  const seenTimeouts = [];
  let stopped = 0;
  const modernAndroid = loadAndroidAdapter({
    async scanSsids() { return { ssids: [], throttled: false }; },
    async currentSsid() { return null; },
    async discoverLanRobots(timeoutMs) {
      seenTimeouts.push(timeoutMs);
      return {
        robots: [
          { host: '192.168.66.64', port: 13145, displayName: 'DOSO-THUNDER-001', robotId: 'THUNDER-DEV-001' },
          { host: '8.8.8.8', port: 13145, displayName: 'Invalid' },
        ],
        timedOut: false,
      };
    },
    async stopLanDiscovery() { stopped += 1; },
    async joinKnownSsid() { return 'already'; },
    async releaseJoinedNetwork() {},
  }).wifiDiscoveryAdapter;

  assert.equal(modernAndroid.canDiscoverLan, true);
  const discovered = await modernAndroid.discoverLanRobots(100);
  assert.deepEqual(seenTimeouts, [1500]);
  assert.equal(discovered.robots.length, 1);
  assert.equal(discovered.robots[0].host, '192.168.66.64');
  await modernAndroid.stopLanDiscovery();
  assert.equal(stopped, 1);

  const iosLegacy = loadIosAdapter({
    async readCurrentSsid() { return 'DOSO-AB12CD'; },
    async joinKnownSsid() { return 'joined'; },
    async releaseJoinedNetwork() {},
  }).wifiDiscoveryAdapter;
  assert.equal(iosLegacy.canDiscoverLan, false);
  assert.deepEqual(plain(await iosLegacy.discoverLanRobots()), { robots: [], timedOut: false });
  await iosLegacy.stopLanDiscovery();
});

test('inactive system sheets do not count as leaving the app', () => {
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('active'), false);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('inactive'), false);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('background'), true);
  assert.equal(session.shouldInterruptWifiDiscoveryForAppState('unknown'), true);
});

test('iOS current-network interpretation supports DOSO-* and ignores lab routers', () => {
  assert.equal(session.interpretCurrentNetwork('DOSOrobotics').apply?.port, 13145);
  assert.equal(session.interpretCurrentNetwork('DOSO-AB12CD').apply?.label, '机器狗 AB12CD');
  const router = session.interpretCurrentNetwork('TopSpeed5GCPE-5525');
  assert.equal(router.apply, null);
  assert.equal(router.unrelatedCurrent, true);
  assert.equal(router.matches.length, 0);
  assert.equal(session.interpretCurrentNetwork(null).currentSsid, null);
});

test('UI copy stays short, direct, zero-preaching, and free of internal protocol or library jargon', () => {
  const copySource = readFileSync(new URL('../src/features/robot-lifecycle/wifiDiscoveryCopy.ts', import.meta.url), 'utf8');
  const panelSource = readFileSync(new URL('../src/screens/WifiDiscoveryPanel.tsx', import.meta.url), 'utf8');
  const forbidden = /mDNS|Avahi|NsdManager|gRPC|RFC1918|MulticastLock|5050|5052|Gateway|Broker|云端状态已通|192\.168\.66\.64|rssi|信号格|电量|暂未接入|仅作预览|暂不可用|不可执行|蓝牙配网尚未接入/;
  assert.doesNotMatch(copySource, forbidden);
  assert.doesNotMatch(panelSource, forbidden);
  assert.doesNotMatch(copySource, /[（）]/, 'no parenthetical disclaimers in UI copy');

  const base = { ...copy.initialWifiPanelState };
  assert.equal(copy.wifiDiscoveryHint('android-scan'), null);
  assert.equal(copy.wifiDiscoveryHint('ios-current'), null);
  assert.equal(copy.wifiDiscoveryHint('unsupported'), '请手动输入地址');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'error', error: 'permission_denied' }), '需要搜索权限');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'error', error: 'permission_blocked' }), '权限已关闭');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'error', error: 'location_off' }), '请开启定位');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'error', error: 'wifi_off' }), '请开启 Wi-Fi');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'error', error: 'discovery_failed' }), '搜索失败');
  assert.equal(copy.wifiStatusText({ ...base, phase: 'ready', sighting: session.interpretAndroidScan([], 'TopSpeed5GCPE-5525') }), '未发现机器狗');
  assert.equal(copy.wifiSettingsAction('permission_blocked'), true);
  assert.equal(copy.wifiSettingsAction('location_off'), true);
  assert.equal(copy.wifiSettingsAction('permission_denied'), false);
});

test('reducer tracks joinedSsid cleanly across multi-hotspot lists without discarding discovered robots', () => {
  const sighting = session.interpretAndroidScan(['DOSO-AB12', 'DOSO-XY99'], null);
  const lan = session.sanitizeLanDiscoveryPayload({
    robots: [{ host: '192.168.66.64', port: 13145, displayName: 'DOSO-THUNDER-001' }],
  }).robots;

  let state = copy.reduceWifiPanel(copy.initialWifiPanelState, { type: 'start', action: 'search' });
  state = copy.reduceWifiPanel(state, {
    type: 'search',
    sighting,
    lanRobots: lan,
    hotspotMetadata: {},
    throttled: false,
    appliedEndpoint: null,
  });
  assert.equal(state.holding, false);
  assert.equal(copy.wifiStatusText(state), '发现 3 台设备');

  state = copy.reduceWifiPanel(state, { type: 'select-lan', robot: lan[0] });
  assert.equal(copy.wifiStatusText(state), '已填入 192.168.66.64:13145');
  assert.equal(state.lanRobots.length, 1);
  assert.equal(state.sighting.matches.length, 2);

  state = copy.reduceWifiPanel(state, { type: 'join', result: 'joined', rule: sighting.matches[1] });
  assert.equal(state.holding, true);
  assert.equal(state.joinedSsid, 'DOSO-XY99');
  assert.equal(state.sighting.matches[0].ssid, 'DOSO-XY99');
  assert.equal(state.sighting.matches.length, 2);
  assert.equal(copy.wifiStatusText(state), '已加入 DOSO-XY99');

  state = copy.reduceWifiPanel(state, { type: 'release' });
  assert.equal(state.holding, false);
  assert.equal(state.joinedSsid, null);
  assert.equal(copy.wifiStatusText(state), '已恢复原网络');
});
