import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const fixture = () => ({ schemaVersion: 1, source: 'brainstem.grpc', access: 'read-only',
  requestId: '123e4567-e89b-42d3-a456-426614174000', observedAt: new Date().toISOString(),
  transport: 'local-insecure', state: { kind: 'CMS_STATE_KIND_STANDING', transition: 'CMS_TRANSITION_KIND_NONE' },
  control: { owner: 'CONTROL_OWNER_GRPC', motorOutputEnabled: true, criticalMotorFault: false } });

// Executes the actual handlers/effects. Native layout is verified separately on Android.
function mount({ read = async () => fixture() } = {}) {
  const slots = [], effects = [], pending = [], timers = new Map();
  let cursor = 0, nodes = [], appState, disposed = false, lateUpdates = 0, back = 0, timerId = 0;
  const calls = [];
  const react = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useState(initial) {
      const key = cursor++;
      if (!(key in slots)) slots[key] = initial;
      return [slots[key], value => { if (disposed) lateUpdates++; slots[key] = value; }];
    },
    useRef(initial) { const key = cursor++; return slots[key] ??= { current: initial }; },
    useEffect(fn, deps) {
      const key = cursor++;
      const previous = effects[key];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        pending.push(() => { previous?.cleanup?.(); effects[key] = { deps, cleanup: fn() }; });
      }
    },
  };
  const cache = new Map();
  class ConnectionCheckError extends Error {}
  const services = { ConnectionCheckError,
    checkBrainstemConnection: async options => { calls.push(options); return read(options); },
    checkCloudConnection: async options => { calls.push(options); },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const dependencies = {
      react, 'react/jsx-runtime': require('react/jsx-runtime'),
      'expo-crypto': { randomUUID: () => fixture().requestId },
      'react-native': { Platform: { OS: 'android', select: value => value.default }, useColorScheme: () => 'light', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
        AppState: { addEventListener: (_event, callback) => { appState = callback; return { remove() { appState = null; } }; } } },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      '../components/AppText': { Text: 'Text', TextInput: 'TextInput' },
      '../components/AuthEntry': { AuthEntryField: 'Field', AuthEntryButton: 'Button' },
      '../theme': { useAppTheme: () => ({ colors: {} }) },
      '../services/brainstemReadOnly': services,
    };
    vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === '../services/brainstemPresentation') return load('src/services/brainstemPresentation.ts');
      throw Error(`Unexpected dependency: ${name}`);
    }, __DEV__: true, process: { env: {} }, AbortController, Date,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id) }, { filename: path });
    cache.set(path, module.exports); return module.exports;
  }
  const Screen = load('src/screens/ConnectionDiagnosticsScreen.tsx').ConnectionDiagnosticsScreen;
  function render() {
    cursor = 0; nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ text: String(node) }); return; }
      nodes.push(node); walk(node.props.children);
    }
    walk(Screen({ onBack: () => back++ }));
    pending.splice(0).forEach(fn => fn());
  }
  render();
  const find = id => nodes.find(node => node.props?.testID === id);
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); render(); };
  return { calls, find, render, settle, timers,
    get copy() { return nodes.map(n => n.text ?? '').join(' '); },
    get lateUpdates() { return lateUpdates; }, get back() { return back; },
    fill() { find('connection-endpoint').props.onChangeText('http://127.0.0.1:8120'); find('connection-token').props.onChangeText('local-fixture-token-012345678901234'); render(); },
    background: () => appState('background'),
    unmount() { disposed = true; effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test('no automatic request; local status is translated but never grants motion authority', async () => {
  const screen = mount(); assert.equal(screen.calls.length, 0); screen.fill();
  screen.find('connection-brainstem').props.onPress(); await screen.settle();
  assert.equal(screen.calls.length, 1);
  assert.match(screen.copy, /本地联调，未验证真机/);
  assert.match(screen.copy, /状态： 站立/);
  assert.match(screen.copy, /gRPC 客户端（不代表本 App）/);
  assert.match(screen.copy, /本 App 未获取控制权，运动控制保持锁定/);
  assert.doesNotMatch(screen.copy, /CMS_STATE_KIND|CONTROL_OWNER_/);
  screen.unmount();
});

test('double submit locks in the same tick; cancel aborts and ignores late response', async () => {
  let finish;
  const screen = mount({ read: () => new Promise(resolve => { finish = resolve; }) }); screen.fill();
  const press = screen.find('connection-brainstem').props.onPress;
  press(); press(); screen.render(); assert.equal(screen.calls.length, 1);
  screen.find('connection-cancel').props.onPress(); screen.render();
  assert.equal(screen.calls[0].signal.aborted, true);
  finish(fixture()); await screen.settle();
  assert.equal(screen.find('connection-snapshot'), undefined);
  assert.match(screen.copy, /检查已取消/); screen.unmount();
});

test('background clears token, cancels pending request, and does not resurrect old state', async () => {
  let finish;
  const screen = mount({ read: () => new Promise(resolve => { finish = resolve; }) }); screen.fill();
  screen.find('connection-brainstem').props.onPress(); screen.background(); screen.render();
  assert.equal(screen.calls[0].signal.aborted, true);
  assert.equal(screen.find('connection-token').props.value, '');
  finish(fixture()); await screen.settle();
  assert.equal(screen.find('connection-snapshot'), undefined); screen.unmount();
});

test('status expires within 15 seconds and can be checked again', async () => {
  const screen = mount(); screen.fill(); screen.find('connection-brainstem').props.onPress(); await screen.settle();
  assert.equal(screen.timers.size, 1);
  const timer = [...screen.timers.values()][0]; assert.ok(timer.ms <= 15000 && timer.ms > 0);
  timer.fn(); screen.render(); assert.equal(screen.find('connection-snapshot'), undefined);
  assert.match(screen.copy, /状态已过期/);
  screen.find('connection-brainstem').props.onPress(); await screen.settle();
  assert.equal(screen.calls.length, 2); screen.unmount();
});

test('leaving diagnostics aborts pending work and no late update reaches an unmounted screen', async () => {
  let finish;
  const screen = mount({ read: () => new Promise(resolve => { finish = resolve; }) }); screen.fill();
  screen.find('connection-brainstem').props.onPress(); screen.find('connection-back').props.onPress();
  assert.equal(screen.back, 1); screen.unmount(); finish(fixture()); await screen.settle();
  assert.equal(screen.calls[0].signal.aborted, true); assert.equal(screen.lateUpdates, 0);
});
