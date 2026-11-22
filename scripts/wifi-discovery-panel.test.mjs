import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function load(path, stubs = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in stubs)) throw new Error(`unexpected dependency ${name}`);
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

function mount({ adapter, host = '', port = '13145' } = {}) {
  const slots = [], cleanups = [];
  let cursor = 0, unmounted = false;
  const listeners = new Set();
  const appState = {
    currentState: 'active',
    addEventListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  };
  const applied = [];
  const releaseRef = { current() {} };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => {
        if (unmounted) return;
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      }];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(effect()); } },
  };
  const panel = load('src/screens/WifiDiscoveryPanel.tsx', {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      AppState: appState,
      Linking: { openSettings: async () => { applied.push('settings'); } },
      Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value },
    },
    '../components/AppText': { Text: 'Text' },
    '../appearance': {
      getProductAppearance: () => ({
        surface: '#242423', border: '#343432', ink: '#E8E8E6', secondary: '#A0A09B',
        blue: '#98D1FF', blueSoft: '#292F33', blueInk: '#A3B7C5',
        action: '#F0F4FE', actionInk: '#1C1C1B',
      }),
    },
    '../theme': { useAppTheme: () => ({ colors: { background: '#1C1C1B', surface: '#242423', line: '#343432' }, isDark: true }) },
    '../typography': { typography: { label: {}, supporting: {} } },
    '../features/robot-lifecycle/wifiDiscoveryCopy': copy,
    '../features/robot-lifecycle/robotHotspotRules': rules,
    '../features/robot-lifecycle/wifiDiscoveryAdapter': { wifiDiscoveryAdapter: adapter },
    '../features/robot-lifecycle/wifiDiscoverySession': session,
  });
  let nodes = [];
  function render(next = {}) {
    cursor = 0; nodes = [];
    const walk = node => {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); walk(node.props?.children);
    };
    walk(panel.WifiDiscoveryPanel({
      currentHost: next.host ?? host, currentPort: next.port ?? port, adapter,
      onApplyAddress: (nextHost, nextPort) => applied.push([nextHost, nextPort]),
      releaseRef,
    }));
  }
  render();
  return {
    applied, releaseRef, render, listeners,
    setAppState(next) { appState.currentState = next; for (const callback of listeners) callback(next); },
    unmount() { unmounted = true; for (const cleanup of cleanups) cleanup?.(); },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    element: id => nodes.find(node => node.props?.testID === id),
    elementsByPrefix: prefix => nodes.filter(node => typeof node.props?.testID === 'string' && node.props.testID.startsWith(prefix)),
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const singleHotspot = { ssids: ['TopSpeed5GCPE-5525', 'DOSOrobotics'], throttled: false };
const lanRobotA = {
  host: '192.168.66.64',
  port: 13145,
  serviceName: 'DOSO-THUNDER-001',
  robotId: 'THUNDER-DEV-001',
  displayName: 'DOSO-THUNDER-001',
  apSsid: 'DOSOrobotics',
  videoPort: 5050,
  transport: 'lan-dev',
};

test('Android unified search fills empty host from single hotspot and ignores lab router', async () => {
  const calls = [];
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: false,
    async scan() { calls.push('scan'); return singleHotspot; },
    async currentSsid() { calls.push('current'); return 'TopSpeed5GCPE-5525'; },
    async joinKnownHotspot() { calls.push('join'); return 'joined'; },
    async releaseJoinedNetwork() { calls.push('release'); },
  } });
  const searchButton = view.element('wifi-discovery-search');
  assert.equal(searchButton.props.accessibilityRole, 'button');
  const buttonStyle = Object.assign({}, ...[].concat(searchButton.props.style({ pressed: false })).filter(Boolean));
  assert.ok(buttonStyle.minHeight >= 48);
  assert.match(view.copy, /搜索机器狗/);
  assert.equal(view.element('wifi-discovery-hint'), undefined);

  await searchButton.props.onPress();
  view.render({ host: '192.168.50.1' });
  assert.deepEqual(calls, ['scan', 'current']);
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
  assert.match(view.copy, /已填入 192\.168\.50\.1:13145/);
  assert.doesNotMatch(view.copy, /TopSpeed5GCPE-5525|rssi|信号|电量|mDNS|Avahi|NsdManager|gRPC|RFC1918/);
  assert.equal(view.element('wifi-discovery-join-DOSOrobotics').props.accessibilityRole, 'button');
  assert.ok(view.element('wifi-discovery-selected-DOSOrobotics'));
});

test('Android unified search runs hotspot scan and LAN discovery in parallel and renders both sections cleanly', async () => {
  const calls = [];
  const view = mount({
    host: '192.168.66.99',
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: true,
      async scan() { calls.push('scan'); return singleHotspot; },
      async currentSsid() { calls.push('current'); return 'TopSpeed5GCPE-5525'; },
      async discoverLanRobots() { calls.push('lan'); return { robots: [lanRobotA], timedOut: false }; },
      async stopLanDiscovery() { calls.push('stopLan'); },
      async joinKnownHotspot() { return 'joined'; },
      async releaseJoinedNetwork() {},
    },
  });

  await view.element('wifi-discovery-search').props.onPress();
  view.render({ host: '192.168.66.99' });

  assert.ok(calls.includes('scan') && calls.includes('lan'));
  assert.deepEqual(view.applied, []);
  assert.ok(view.element('wifi-discovery-lan-section'));
  assert.ok(view.element('wifi-discovery-hotspot-section'));
  assert.equal(view.element('wifi-discovery-lan-title-192.168.66.64:13145').props.children, 'DOSO-THUNDER-001');
  assert.equal(view.element('wifi-discovery-lan-id-192.168.66.64:13145').props.children, 'THUNDER-DEV-001');
  assert.ok(view.element('wifi-discovery-lan-use-192.168.66.64:13145'));
  assert.equal(view.element('wifi-discovery-lan-selected-192.168.66.64:13145'), undefined);

  // Tapping "选用此设备" fills host & port and updates the badge to "已选".
  view.element('wifi-discovery-lan-use-192.168.66.64:13145').props.onPress();
  view.render({ host: '192.168.66.64', port: '13145' });
  assert.deepEqual(view.applied, [['192.168.66.64', 13145]]);
  assert.equal(view.element('wifi-discovery-lan-use-192.168.66.64:13145'), undefined);
  assert.ok(view.element('wifi-discovery-lan-selected-192.168.66.64:13145'));
  assert.match(view.copy, /已选/);
});

test('multiple DOSO-* hotspots sort deterministically without silently overwriting host and join exact SSID', async () => {
  const joined = [];
  const view = mount({
    host: '',
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: false,
      async scan() { return { ssids: ['DOSO-XY99', 'DOSO-AB12CD', 'DOSOrobotics'], throttled: false }; },
      async currentSsid() { return 'TopSpeed5GCPE-5525'; },
      async joinKnownHotspot(ssid) { joined.push(ssid); return 'joined'; },
      async releaseJoinedNetwork() {},
    },
  });

  await view.element('wifi-discovery-search').props.onPress();
  view.render();

  assert.deepEqual(view.applied, [], 'multiple hotspots must not auto-overwrite host');
  const cards = view.elementsByPrefix('wifi-discovery-match-');
  assert.deepEqual(cards.map(card => card.props.testID), [
    'wifi-discovery-match-DOSO-AB12CD',
    'wifi-discovery-match-DOSO-XY99',
    'wifi-discovery-match-DOSOrobotics',
  ]);
  assert.equal(view.element('wifi-discovery-title-DOSO-AB12CD').props.children, '机器狗 AB12CD');
  assert.equal(view.element('wifi-discovery-title-DOSOrobotics').props.children, '机器狗热点');

  // Explicit join targets the exact tapped SSID and marks only that hotspot connected.
  await view.element('wifi-discovery-join-DOSO-XY99').props.onPress();
  view.render({ host: '192.168.50.1' });
  assert.deepEqual(joined, ['DOSO-XY99']);
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
  assert.ok(view.element('wifi-discovery-connected-DOSO-XY99'));
  assert.equal(view.element('wifi-discovery-connected-DOSO-AB12CD'), undefined);
  assert.equal(view.element('wifi-discovery-selected-DOSO-AB12CD'), undefined);
});

test('phone connected to robot AP deduplicates LAN 192.168.50.1:13145 onto the hotspot card', async () => {
  const view = mount({
    host: '192.168.50.1',
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: true,
      async scan() { return { ssids: ['DOSOrobotics'], throttled: false }; },
      async currentSsid() { return '"DOSOrobotics"'; },
      async discoverLanRobots() {
        return {
          robots: [{
            ...lanRobotA,
            host: '192.168.50.1',
            port: 13145,
          }],
          timedOut: false,
        };
      },
      async stopLanDiscovery() {},
      async joinKnownHotspot() { return 'already'; },
      async releaseJoinedNetwork() {},
    },
  });

  await view.element('wifi-discovery-search').props.onPress();
  view.render({ host: '192.168.50.1' });

  assert.equal(view.element('wifi-discovery-lan-section'), undefined, 'no duplicate LAN card for 192.168.50.1');
  assert.ok(view.element('wifi-discovery-hotspot-section'));
  assert.equal(view.element('wifi-discovery-title-DOSOrobotics').props.children, 'DOSO-THUNDER-001');
  assert.match(view.element('wifi-discovery-ssid-DOSOrobotics').props.children, /DOSOrobotics.*THUNDER-DEV-001/);
  assert.ok(view.element('wifi-discovery-connected-DOSOrobotics'));
  assert.ok(view.element('wifi-discovery-selected-DOSOrobotics'));
});

test('an existing manual address is kept until the user taps 使用此地址', async () => {
  const view = mount({
    host: '192.168.66.64',
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true,
      async scan() { return singleHotspot; },
      async currentSsid() { return 'TopSpeed5GCPE-5525'; },
      async joinKnownHotspot() { throw new Error('join should wait'); },
      async releaseJoinedNetwork() {},
    },
  });

  await view.element('wifi-discovery-search').props.onPress();
  view.render({ host: '192.168.66.64' });
  assert.deepEqual(view.applied, []);
  view.element('wifi-discovery-fill-DOSOrobotics').props.onPress();
  view.render({ host: '192.168.50.1' });
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
});

test('LAN scan failure does not break hotspot scan, and hotspot permission failure still surfaces LAN robots', async () => {
  const hotspotStillWorks = mount({
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: true,
      async scan() { return singleHotspot; },
      async currentSsid() { return null; },
      async discoverLanRobots() { throw Object.assign(new Error('lan failed'), { code: 'discovery_failed' }); },
      async stopLanDiscovery() {},
      async joinKnownHotspot() { return 'joined'; },
      async releaseJoinedNetwork() {},
    },
  });
  await hotspotStillWorks.element('wifi-discovery-search').props.onPress();
  hotspotStillWorks.render();
  assert.ok(hotspotStillWorks.element('wifi-discovery-match-DOSOrobotics'));
  assert.deepEqual(hotspotStillWorks.applied, [['192.168.50.1', 13145]]);

  const lanStillWorks = mount({
    host: '192.168.66.99',
    adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: true,
      async scan() { throw Object.assign(new Error('denied'), { code: 'permission_denied' }); },
      async currentSsid() { return null; },
      async discoverLanRobots() { return { robots: [lanRobotA], timedOut: false }; },
      async stopLanDiscovery() {},
      async joinKnownHotspot() { return 'joined'; },
      async releaseJoinedNetwork() {},
    },
  });
  await lanStillWorks.element('wifi-discovery-search').props.onPress();
  lanStillWorks.render({ host: '192.168.66.99' });
  assert.ok(lanStillWorks.element('wifi-discovery-lan-192.168.66.64:13145'));
});

test('permission denial reports concise status and blocked permission exposes settings action', async () => {
  const denied = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: false,
    async scan() { throw Object.assign(new Error('denied'), { code: 'permission_denied' }); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { return 'joined'; },
    async releaseJoinedNetwork() {},
  } });
  await denied.element('wifi-discovery-search').props.onPress();
  denied.render();
  assert.equal(denied.element('wifi-discovery-status').props.children, '需要搜索权限');
  assert.equal(denied.element('wifi-discovery-settings'), undefined);
  assert.deepEqual(denied.applied, []);

  const blocked = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: false,
    async scan() { throw Object.assign(new Error('blocked'), { code: 'permission_blocked' }); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { return 'cancelled'; },
    async releaseJoinedNetwork() {},
  } });
  await blocked.element('wifi-discovery-search').props.onPress();
  blocked.render();
  assert.equal(blocked.element('wifi-discovery-status').props.children, '权限已关闭');
  await blocked.element('wifi-discovery-settings').props.onPress();
  assert.deepEqual(blocked.applied, ['settings']);
});

test('iOS unified search checks current network and optional LAN discovery without preachy disclaimers', async () => {
  const calls = [];
  const view = mount({ adapter: {
    platform: 'ios-current', canJoinKnownHotspot: true, canDiscoverLan: true,
    async scan() { calls.push('scan'); throw new Error('scan'); },
    async currentSsid() { calls.push('current'); return null; },
    async discoverLanRobots() { calls.push('lan'); return { robots: [lanRobotA], timedOut: false }; },
    async stopLanDiscovery() {},
    async joinKnownHotspot(ssid) { calls.push(['join', ssid]); return 'cancelled'; },
    async releaseJoinedNetwork() {},
  } });

  assert.ok(view.element('wifi-discovery-search'));
  assert.ok(view.element('wifi-discovery-preset-DOSOrobotics'));
  await view.element('wifi-discovery-search').props.onPress();
  view.render();
  assert.deepEqual(calls, ['current', 'lan']);
  assert.ok(view.element('wifi-discovery-lan-192.168.66.64:13145'));

  await view.element('wifi-discovery-join-DOSOrobotics').props.onPress();
  view.render();
  assert.deepEqual(calls[2], ['join', 'DOSOrobotics']);
  assert.equal(view.element('wifi-discovery-status').props.children, '已取消加入');
  assert.deepEqual(view.applied, []);
});

test('stopping, backgrounding, and unmounting cancel LAN discovery and ignore stale results', async () => {
  for (const mode of ['stop', 'background', 'unmount']) {
    const scan = deferred();
    const lan = deferred();
    let stopLanCalls = 0;
    const view = mount({ adapter: {
      platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: true,
      scan: () => scan.promise,
      async currentSsid() { return null; },
      discoverLanRobots: () => lan.promise,
      async stopLanDiscovery() { stopLanCalls += 1; },
      async joinKnownHotspot() { return 'joined'; },
      async releaseJoinedNetwork() {},
    } });

    const searching = view.element('wifi-discovery-search').props.onPress();
    view.render();
    assert.match(view.copy, /停止搜索/);

    if (mode === 'stop') {
      view.element('wifi-discovery-search').props.onPress();
      view.render();
      assert.equal(view.element('wifi-discovery-status').props.children, '已停止搜索');
    } else if (mode === 'background') {
      view.setAppState('background');
      view.render();
      assert.equal(view.element('wifi-discovery-status').props.children, '搜索已停止');
    } else {
      view.unmount();
    }

    assert.equal(stopLanCalls, 1, `stopLanDiscovery called on ${mode}`);
    scan.resolve({ ssids: ['DOSOrobotics'], throttled: false });
    lan.resolve({ robots: [lanRobotA], timedOut: false });
    await searching;
    if (mode !== 'unmount') view.render();
    assert.deepEqual(view.applied, [], `no stale apply after ${mode}`);
    if (mode !== 'unmount') {
      assert.equal(view.element('wifi-discovery-lan-192.168.66.64:13145'), undefined);
    }
  }
});

test('inactive sheets and Android join sheet background pause do not cancel or release active work', async () => {
  const scan = deferred();
  const join = deferred();
  const releases = [];
  let stopLanCalls = 0;
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true, canDiscoverLan: false,
    scan: () => scan.promise,
    async currentSsid() { return null; },
    async stopLanDiscovery() { stopLanCalls += 1; },
    joinKnownHotspot: () => join.promise,
    async releaseJoinedNetwork() { releases.push('release'); },
  } });

  const searching = view.element('wifi-discovery-search').props.onPress();
  view.render();
  view.setAppState('inactive');
  view.render();
  assert.equal(view.element('wifi-discovery-status').props.children, '正在搜索…');
  assert.equal(stopLanCalls, 0);
  scan.resolve({ ssids: ['DOSOrobotics'], throttled: false });
  await searching;
  view.render();
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);

  view.setAppState('active');
  const joining = view.element('wifi-discovery-join-DOSOrobotics').props.onPress();
  view.render();
  view.setAppState('background');
  view.render();
  assert.equal(view.element('wifi-discovery-status').props.children, '正在加入热点…');
  assert.deepEqual(releases, []);
  join.resolve('joined');
  await joining;
  view.render();
  assert.deepEqual(releases, []);
  assert.equal(view.element('wifi-discovery-status').props.children, '已加入 DOSOrobotics');
});

test('unsupported environments omit search controls cleanly', () => {
  const view = mount({ adapter: {
    platform: 'unsupported', canJoinKnownHotspot: false, canDiscoverLan: false,
    async scan() { throw new Error('scan'); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { throw new Error('join'); },
    async releaseJoinedNetwork() {},
  } });
  assert.equal(view.element('wifi-discovery-search'), undefined);
  assert.equal(view.element('wifi-discovery-hint').props.children, '请手动输入地址');
});
