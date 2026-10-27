// Real screen handlers and connection session; only React/native hosts and
// scanner/native BLE bridge are fixture boundaries. No actual hardware calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function fixture() {
  const slots = [], cleanups = [], appListeners = new Set(), calls = [], cache = new Map();
  let cursor = 0, tree, nodes, dead = false, updatesAfterUnmount = 0;
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], value => { if (dead) updatesAfterUnmount++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(fn()); } },
  };
  const AppState = { currentState: 'active', addEventListener(_, fn) { appListeners.add(fn); return { remove() { appListeners.delete(fn); } }; } };
  const host = { AppState, Linking: {}, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 753, height: 471 }) };
  const candidate = { id: 'fixture-peripheral', displayName: 'Fixture robot', rssi: -60, serviceUUIDs: [], matchBasis: 'unverified' };
  const scanner = { supported: true, async scan({ onCandidates }) { calls.push('scan'); onCandidates([candidate]); return [candidate]; }, async stop() { calls.push('stop-scan'); } };
  const native = { async prepare() {}, async connect(id) { calls.push(['connect', id]); },
    async retrieveServices(id) { return { id, services: [{ uuid: 'fixture-service' }], characteristics: [] }; },
    async disconnect(id) { calls.push(['disconnect', id]); }, onDisconnect() { return { remove() {} }; } };
  let adapter;
  const load = path => {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === '../components/AppText') return { Text: 'Text' };
      if (name === '../appearance') return { cardLayout: { radius: 16, gap: 12, inset: 16 }, getProductAppearance: () => new Proxy({}, { get: () => '#123456' }) };
      if (name === '../typography') return { typography: new Proxy({}, { get: () => ({}) }) };
      if (name === '../theme') return { radii: { pill: 24 }, useAppTheme: () => ({ colors: new Proxy({}, { get: () => '#123456' }), isDark: false }) };
      if (name.endsWith('/bleDiscoveryAdapter')) return { bleDiscoveryAdapter: scanner };
      if (name.endsWith('/bleConnectionAdapter')) return { bleConnectionAdapter: adapter };
      if (/\/(ble\w+)(?:\.ts)?$/.test(name)) return load('src/features/robot-lifecycle/' + name.split('/').at(-1).replace(/\.ts$/, '') + '.ts');
      throw new Error('unexpected_fixture_dependency');
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, Error, setTimeout, clearTimeout, AbortController }, { filename: path });
    cache.set(path, module.exports); return module.exports;
  };
  const session = load('src/features/robot-lifecycle/bleConnectionSession.ts');
  adapter = session.createBleConnectionSession(native);
  const Screen = load('src/screens/BleDiscoveryScreen.tsx').BleDiscoveryScreen;
  const render = () => {
    cursor = 0; tree = Screen({ deviceName: 'THUNDER 01', onBack() { calls.push('back'); } }); nodes = [];
    const visit = value => { if (!value || typeof value !== 'object') return; if (Array.isArray(value)) return value.forEach(visit); nodes.push(value); visit(value.props?.children); };
    visit(tree); return nodes;
  };
  render();
  return { calls, native, scanner, render, get nodes() { return nodes; }, get updatesAfterUnmount() { return updatesAfterUnmount; },
    action(id) { return nodes.find(node => node.type === 'Pressable' && node.props.testID === id); },
    async scan() { const scan = nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '开始查找附近设备'); assert.ok(scan); await scan.props.onPress(); await settle(); render(); },
    background() { AppState.currentState = 'background'; for (const fn of appListeners) fn('background'); },
    unmount() { dead = true; for (const cleanup of cleanups) cleanup?.(); },
  };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
test('only an explicit scanned-candidate action connects and shows service discovery with identity and Wi-Fi still blocked', async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []);
  await f.scan();
  assert.ok(!f.calls.some(row => Array.isArray(row) && row[0] === 'connect'));
  const connect = f.action('ble-connect-0'); assert.ok(connect);
  await connect.props.onPress(); await settle(); f.render();
  assert.ok(f.calls.some(row => Array.isArray(row) && row[0] === 'connect'));
  assert.ok(f.nodes.some(node => node.props?.testID === 'ble-connection-status'));
  assert.equal(f.action('ble-identity-blocked').props.disabled, true);
  assert.equal(f.action('ble-wifi-blocked').props.disabled, true);
  assert.ok(!f.nodes.some(node => node.type === 'TextInput'));
  f.unmount(); await settle();
});

test('backgrounding releases the owned connection and scanning remains locked while connected', async () => {
  const f = fixture(); await f.scan();
  f.action('ble-connect-0').props.onPress(); await settle(); f.render();
  const scan = f.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '开始查找附近设备');
  assert.equal(scan.props.disabled, true);
  assert.equal(f.action('ble-connect-0').props.disabled, true);
  scan.props.onPress(); await settle();
  assert.equal(f.calls.filter(row => row === 'scan').length, 1);
  f.background(); await settle(); f.render();
  assert.ok(f.calls.some(row => Array.isArray(row) && row[0] === 'disconnect'));
  assert.equal(f.action('ble-disconnect'), undefined);
  f.unmount(); await settle();
});

test('leaving during native connect releases a late completion without updating the unmounted screen', async () => {
  const f = fixture(); let finish;
  f.native.connect = id => { f.calls.push(['connect', id]); return new Promise(resolve => { finish = resolve; }); };
  await f.scan();
  f.action('ble-connect-0').props.onPress(); await settle(); f.render();
  assert.equal(typeof finish, 'function');
  f.action('ble-back').props.onPress(); f.unmount(); await settle();
  finish(); await settle();
  assert.equal(f.calls.filter(row => row === 'back').length, 1);
  assert.ok(f.calls.filter(row => Array.isArray(row) && row[0] === 'disconnect').length >= 2);
  assert.equal(f.updatesAfterUnmount, 0);
});
