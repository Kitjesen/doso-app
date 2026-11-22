import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/screens/CloudMapsScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const USER = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const version = (patch = {}) => ({ id: 'map-version', name: '厂区一层', source_map_id: 'factory-first', source_content_epoch: '9', frame_id: 'odom',
  size_bytes: 662000000, status: 'ready', created_at: '2026-11-03T03:00:00Z', ...patch });

// Real screen handlers and lifecycle, with IO and React Native rendering controlled.
function mount({ read = async () => [version()] } = {}) {
  let cursor = 0, nodes = [], unmounted = false, lateUpdates = 0, backCalls = 0;
  let props = { expectedUserId: USER, onBack: () => backCalls++ };
  const slots = [], effects = [], listeners = new Set(), calls = [];
  const react = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = initial; return [slots[id], value => {
      if (unmounted) lateUpdates++; else slots[id] = typeof value === 'function' ? value(slots[id]) : value;
    }]; },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useEffect(effect, deps) { const id = cursor++, previous = slots[id];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) effects.push(() => { previous?.cleanup?.(); slots[id] = { deps, cleanup: effect() }; });
    },
  };
  const appState = { currentState: 'active', addEventListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
  class CloudMapsError extends Error {}
  class AuthSessionOperationBusyError extends Error {}
  const dependencies = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: appState, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../appearance': { cardLayout: { radius: 24, inset: 16, gap: 12 }, getProductAppearance: () => ({ surface: '#fff', ink: '#123', secondary: '#567', blueInk: '#123', blueSoft: '#def' }) },
    '../components/AppText': { Text: 'Text' }, '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) }, '../typography': { typography: {} },
    '../services/cloudMaps': { CloudMapsError, readCloudMaps(userId, options) { calls.push({ userId, ...options }); return read(userId, options); } },
    '../services/authSessionOperation': { AuthSessionOperationBusyError },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  function render() {
    cursor = 0; nodes = [];
    const walk = node => {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); walk(node.props.children);
    };
    walk(module.exports.CloudMapsScreen(props));
    while (effects.length) effects.shift()();
  }
  render(); render();
  return { calls, CloudMapsError, render,
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get lateUpdates() { return lateUpdates; }, get backCalls() { return backCalls; },
    element: id => nodes.find(node => node.props?.testID === id),
    async ready() { await settle(); render(); },
    async press(id) { const result = this.element(id).props.onPress(); render(); await result; await settle(); render(); },
    setProps(patch) { props = { ...props, ...patch }; render(); render(); },
    lifecycle(state) { appState.currentState = state; for (const listener of listeners) listener(state); render(); },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('catalog displays actual version status, size and source with a refresh action', async () => {
  const host = mount(); await host.ready();
  assert.equal(host.calls.length, 1); assert.equal(host.calls[0].userId, USER); assert.ok(host.calls[0].signal instanceof AbortSignal);
  assert.match(host.copy, /厂区一层/); assert.match(host.copy, /云端已保存/); assert.match(host.copy, /631\.3 MB/);
  assert.match(host.copy, /factory-first/); assert.match(host.copy, /内容版本\s*9/); assert.match(host.copy, /odom/);
  assert.equal(host.element('cloud-maps-refresh').props.disabled, false);
  await host.press('cloud-maps-refresh'); assert.equal(host.calls.length, 2); host.unmount();
});

test('empty, failed and in-progress reads have distinct presentation', async () => {
  const empty = mount({ read: async () => [] }); await empty.ready(); assert.ok(empty.element('cloud-maps-empty')); empty.unmount();
  const pending = deferred(), loading = mount({ read: () => pending.promise });
  assert.equal(loading.element('cloud-maps-refresh').props.disabled, true); assert.ok(loading.element('cloud-maps-cancel'));
  pending.reject(new Error('sensitive-internal-body')); await loading.ready();
  assert.equal(loading.element('cloud-maps-empty'), undefined); assert.match(loading.copy, /读取失败/); assert.doesNotMatch(loading.copy, /sensitive-internal-body/);
  loading.unmount();
});

test('background, cancel, back and unmount abort and discard late catalog responses', async () => {
  for (const exit of ['background', 'cancel', 'back', 'unmount']) {
    const reply = deferred(), host = mount({ read: () => reply.promise });
    if (exit === 'background') host.lifecycle('background');
    if (exit === 'cancel') await host.press('cloud-maps-cancel');
    if (exit === 'back') await host.press('cloud-maps-back');
    if (exit === 'unmount') host.unmount();
    assert.equal(host.calls[0].signal.aborted, true);
    reply.resolve([version()]); await host.ready(); assert.equal(host.element('cloud-map-0'), undefined); assert.equal(host.lateUpdates, 0);
    if (exit === 'background') { host.lifecycle('active'); assert.equal(host.calls.length, 1); }
    if (exit === 'back') assert.equal(host.backCalls, 1);
    if (exit !== 'unmount') host.unmount();
  }
});

test('account switch clears existing catalog and rejects late former-account responses', async () => {
  const reply = deferred(), host = mount({ read: userId => userId === USER ? reply.promise : Promise.resolve([]) });
  const retiredRefresh = host.element('cloud-maps-refresh').props.onPress;
  host.setProps({ expectedUserId: OTHER }); assert.equal(host.calls[0].signal.aborted, true); await host.ready();
  reply.resolve([version()]); await host.ready(); retiredRefresh(); await host.ready();
  assert.equal(host.calls.length, 2); assert.equal(host.calls[1].userId, OTHER); assert.equal(host.element('cloud-map-0'), undefined); assert.ok(host.element('cloud-maps-empty'));
  host.unmount();
  const loaded = mount(); await loaded.ready(); assert.ok(loaded.element('cloud-map-0'));
  loaded.setProps({ expectedUserId: OTHER }); assert.equal(loaded.element('cloud-map-0'), undefined); loaded.unmount();
});

test('all transfer states remain separate and a full page identifies its bounded catalog', async () => {
  const states = ['uploading', 'verifying', 'ready', 'failed', 'cancelled'];
  const host = mount({ read: async () => Array.from({ length: 100 }, (_, index) => version({ id: String(index), status: states[index % states.length] })) });
  await host.ready();
  for (const label of ['上传中', '校验中', '云端已保存', '上传失败', '已取消', '显示最近 100 个版本']) assert.ok(host.copy.includes(label));
  assert.equal(host.element('cloud-map-99') !== undefined, true); host.unmount();
});
