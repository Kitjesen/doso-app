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
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => {
      if (unmounted) return;
      slots[i] = typeof value === 'function' ? value(slots[i]) : value;
    }]; },
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
    '../appearance': { getProductAppearance: () => ({ ink: '#123', secondary: '#567', blue: '#98d1ff', blueInk: '#123' }) },
    '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) },
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
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    element: id => nodes.find(node => node.props?.testID === id),
  };
}

const hotspot = { ssids: ['TopSpeed5GCPE-5525', 'DOSOrobotics'], throttled: false };

test('Android search fills an empty address from the hotspot and does not join or list the router', async () => {
  const calls = [];
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    async scan() { calls.push('scan'); return hotspot; },
    async currentSsid() { calls.push('current'); return 'TopSpeed5GCPE-5525'; },
    async joinKnownHotspot() { calls.push('join'); return 'joined'; },
    async releaseJoinedNetwork() { calls.push('release'); },
  } });
  assert.equal(view.element('wifi-discovery-scan').props.accessibilityRole, 'button');
  const buttonStyle = Object.assign({}, ...[].concat(view.element('wifi-discovery-scan').props.style({ pressed: false })).filter(Boolean));
  assert.ok(buttonStyle.minHeight >= 48);
  await view.element('wifi-discovery-scan').props.onPress();
  view.render();
  assert.deepEqual(calls, ['scan', 'current']);
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
  assert.match(view.copy, /已填入 192\.168\.50\.1:13145/);
  assert.doesNotMatch(view.copy, /TopSpeed5GCPE-5525|rssi|信号|电量/);
  assert.equal(view.element('wifi-discovery-join-DOSOrobotics').props.accessibilityRole, 'button');
});

test('an existing manual address is kept until the user confirms the hotspot', async () => {
  const view = mount({ host: '192.168.66.64', adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    async scan() { return hotspot; },
    async currentSsid() { return 'TopSpeed5GCPE-5525'; },
    async joinKnownHotspot() { throw new Error('join should wait'); },
    async releaseJoinedNetwork() {},
  } });
  await view.element('wifi-discovery-scan').props.onPress();
  view.render({ host: '192.168.66.64' });
  assert.deepEqual(view.applied, []);
  assert.match(view.copy, /当前地址保持不变/);
  assert.match(view.element('wifi-discovery-status').props.children, /DOSOrobotics/);
  view.element('wifi-discovery-fill-DOSOrobotics').props.onPress();
  view.render({ host: '192.168.50.1' });
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
});

test('permission denial explains the limit and leaves the address empty', async () => {
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    async scan() { throw Object.assign(new Error('denied'), { code: 'permission_denied' }); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { return 'joined'; },
    async releaseJoinedNetwork() {},
  } });
  await view.element('wifi-discovery-scan').props.onPress();
  view.render();
  assert.match(view.copy, /定位权限/);
  assert.match(view.copy, /手动输入地址/);
  assert.equal(view.element('wifi-discovery-settings'), undefined);
  assert.deepEqual(view.applied, []);
});

test('a blocked permission offers system settings', async () => {
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    async scan() { throw Object.assign(new Error('blocked'), { code: 'permission_blocked' }); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { return 'cancelled'; },
    async releaseJoinedNetwork() {},
  } });
  await view.element('wifi-discovery-scan').props.onPress();
  view.render();
  assert.match(view.copy, /系统设置/);
  await view.element('wifi-discovery-settings').props.onPress();
  assert.deepEqual(view.applied, ['settings']);
});

test('iOS checks the current network, explains that it cannot list nearby SSIDs, and joins only on request', async () => {
  const calls = [];
  const view = mount({ adapter: {
    platform: 'ios-current', canJoinKnownHotspot: true,
    async scan() { calls.push('scan'); throw new Error('scan'); },
    async currentSsid() { calls.push('current'); return null; },
    async joinKnownHotspot(ssid) { calls.push(['join', ssid]); return 'cancelled'; },
    async releaseJoinedNetwork() {},
  } });
  assert.equal(view.element('wifi-discovery-scan'), undefined);
  assert.match(view.copy, /不能列出附近的全部 Wi-Fi/);
  assert.match(view.copy, /蓝牙配网尚未接入/);
  assert.equal(view.element('wifi-discovery-title-DOSOrobotics').props.children, '已知热点');
  assert.equal(view.element('wifi-discovery-planned-DOSOrobotics').props.children, '这是预设的机器狗热点，不是本次检查结果。');
  assert.doesNotMatch(view.copy, /已填入此地址|已填入 192\.168\.50\.1/);
  await view.element('wifi-discovery-current').props.onPress();
  view.render();
  assert.deepEqual(calls, ['current']);
  assert.match(view.copy, /没有返回当前 Wi-Fi 名称/);
  assert.deepEqual(view.applied, []);
  await view.element('wifi-discovery-join-DOSOrobotics').props.onPress();
  view.render();
  assert.deepEqual(calls[1], ['join', 'DOSOrobotics']);
  assert.match(view.copy, /未加入热点/);
  assert.deepEqual(view.applied, []);
});

test('iOS fills the address when the phone is already on the robot hotspot and does not join again', async () => {
  const calls = [];
  const view = mount({ adapter: {
    platform: 'ios-current', canJoinKnownHotspot: true,
    async scan() { throw new Error('scan'); },
    async currentSsid() { calls.push('current'); return '"DOSOrobotics"'; },
    async joinKnownHotspot() { calls.push('join'); return 'joined'; },
    async releaseJoinedNetwork() {},
  } });
  await view.element('wifi-discovery-current').props.onPress();
  view.render({ host: '192.168.50.1' });
  assert.deepEqual(calls, ['current']);
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
  assert.equal(view.element('wifi-discovery-join-DOSOrobotics'), undefined);
  assert.equal(view.element('wifi-discovery-planned-DOSOrobotics'), undefined);
  assert.equal(view.element('wifi-discovery-title-DOSOrobotics').props.children, '机器狗热点');
  assert.match(view.copy, /手机已连上这个热点/);
});

test('a system confirmation sheet stays inactive and does not cancel the search or release a join', async () => {
  const scan = deferred();
  const join = deferred();
  const releases = [];
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    scan: () => scan.promise,
    async currentSsid() { return null; },
    joinKnownHotspot: () => join.promise,
    async releaseJoinedNetwork() { releases.push('release'); },
  } });
  const searching = view.element('wifi-discovery-scan').props.onPress();
  view.render();
  view.setAppState('inactive');
  view.render();
  assert.match(view.copy, /正在搜索机器狗热点/);
  assert.doesNotMatch(view.copy, /应用进入后台/);
  assert.deepEqual(releases, []);
  scan.resolve({ ssids: ['DOSOrobotics'], throttled: false });
  await searching;
  view.render();
  assert.deepEqual(view.applied, [['192.168.50.1', 13145]]);
  view.setAppState('active');
  const joining = view.element('wifi-discovery-join-DOSOrobotics').props.onPress();
  view.render();
  view.setAppState('inactive');
  view.render();
  assert.match(view.copy, /正在请求加入机器狗热点/);
  assert.deepEqual(releases, []);
  join.resolve('joined');
  await joining;
  view.render();
  assert.equal(releases.length, 0);
  assert.deepEqual(view.applied.at(-1), ['192.168.50.1', 13145]);
});

test('leaving the app in the background still stops a search', async () => {
  const scan = deferred();
  const scanReleases = [];
  const scanning = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    scan: () => scan.promise,
    async currentSsid() { return null; },
    async joinKnownHotspot() { return 'joined'; },
    async releaseJoinedNetwork() { scanReleases.push('release'); },
  } });
  const scanResult = scanning.element('wifi-discovery-scan').props.onPress();
  scanning.render();
  scanning.setAppState('background');
  scanning.render();
  assert.match(scanning.copy, /应用进入后台，这次搜索已停止/);
  scan.resolve({ ssids: ['DOSOrobotics'], throttled: false });
  await scanResult;
  scanning.render();
  assert.deepEqual(scanning.applied, []);
  assert.deepEqual(scanReleases, []);
});

test('Android background during the system join sheet does not release the network or drop the result', async () => {
  const join = deferred();
  const releases = [];
  const view = mount({ adapter: {
    platform: 'android-scan', canJoinKnownHotspot: true,
    async scan() { return { ssids: ['DOSOrobotics'], throttled: false }; },
    async currentSsid() { return null; },
    joinKnownHotspot: () => join.promise,
    async releaseJoinedNetwork() { releases.push('release'); },
  } });
  await view.element('wifi-discovery-scan').props.onPress();
  view.render();
  const joining = view.element('wifi-discovery-join-DOSOrobotics').props.onPress();
  view.render();
  view.setAppState('background');
  view.render();
  assert.match(view.copy, /正在请求加入机器狗热点/);
  assert.doesNotMatch(view.copy, /应用进入后台/);
  assert.deepEqual(releases, []);
  join.resolve('joined');
  await joining;
  view.render();
  assert.deepEqual(releases, []);
  assert.deepEqual(view.applied.at(-1), ['192.168.50.1', 13145]);
  assert.match(view.copy, /已加入 DOSOrobotics/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('web and other unsupported environments do not pretend to scan', () => {
  const view = mount({ adapter: {
    platform: 'unsupported', canJoinKnownHotspot: false,
    async scan() { throw new Error('scan'); },
    async currentSsid() { return null; },
    async joinKnownHotspot() { throw new Error('join'); },
    async releaseJoinedNetwork() {},
  } });
  assert.equal(view.element('wifi-discovery-scan'), undefined);
  assert.equal(view.element('wifi-discovery-current'), undefined);
  assert.match(view.copy, /当前环境不能搜索 Wi-Fi/);
});
