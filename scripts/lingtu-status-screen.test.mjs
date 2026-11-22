import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/screens/LingtuStatusScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Real screen handlers with HTTP, native lifecycle and time controlled locally; no robot or gateway calls.
function mount({ read, allowLocalHttp = false, onUseNavigation, onViewVideo, allowViewerToken = false } = {}) {
  let at = 1000, cursor = 0, nodes = [], lateUpdates = 0, unmounted = false, timerId = 0, backCalls = 0;
  const slots = [], cleanups = [], listeners = new Set(), timers = new Map(), calls = [];
  const react = {
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {
        if (unmounted) lateUpdates++; else slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      }];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(effect()); } },
  };
  const appState = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  class LingtuReadOnlyError extends Error { constructor(code) { super(code === 'unauthorized' ? '导航服务拒绝读取，请检查访问授权。' : '导航状态无法核验，请检查服务版本或重新读取。'); this.code = code; } }
  const sample = (patch = {}) => ({
    endpoint: 'https://lingtu.example.test', observedAt: at, environment: 'real', product: 'nav',
    productSessionId: 'fixture-session', robotModel: 'fixture-model', robotOnline: null, motionAuthorized: false,
    localizationState: 'ready', localizationReady: true, localizationPoseFresh: true, controlAuthority: 'NONE', resumeRequired: false,
    motionPermission: 'HELD', mapName: 'fixture-map', features: { mapping: true, navigation: true, whep: true, exploration: true },
    readiness: { ready: true, dataReady: true, motionReady: true, nonMotionSafe: false, reasons: [] }, ...patch
  });
  const allowed = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: appState, Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../appearance': { cardLayout: { radius: 24, inset: 16, gap: 12 }, getProductAppearance: () => ({ surface: '#f4f7fa', ink: '#123', secondary: '#567', blue: '#98d1ff', blueInk: '#123' }) },
    '../components/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) }, '../typography': { typography: {} },
    '../services/lingtuReadOnly': {
      LingtuReadOnlyError,
      readCameraDiagnostics: async () => null,
      isLingtuStatusFresh: snapshot => Number.isFinite(snapshot?.observedAt) && at >= snapshot.observedAt && at - snapshot.observedAt < 15000,
      readLingtuStatus: options => { calls.push(options); return read ? read(options) : Promise.resolve(sample()); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require(name) { assert.ok(name in allowed, `Unexpected dependency ${name}`); return allowed[name]; },
    AbortController, Date, performance: { now: () => at },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, due: at + delay }); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  const render = () => {
    cursor = 0; nodes = [];
    const walk = node => {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); walk(node.props.children);
    };
    walk(module.exports.LingtuStatusScreen({ onBack: () => backCalls++, allowLocalHttp, onUseNavigation, onViewVideo, allowViewerToken }));
  };
  render();
  return {
    render, sample, calls, timers, LingtuReadOnlyError,
    get now() { return at; }, get lateUpdates() { return lateUpdates; }, get backCalls() { return backCalls; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    element: id => nodes.find(node => node.props?.testID === id),
    fill(value = 'https://lingtu.example.test') { this.element('lingtu-endpoint').props.onChangeText(value); render(); },
    async start() { const action = this.element('lingtu-read').props.onPress(); render(); await action; await settle(); render(); },
    advance(ms) { at += ms; for (const [id, timer] of [...timers]) if (timer.due <= at) { timers.delete(id); timer.callback(); } render(); },
    lifecycle(state) { appState.currentState = state; for (const listener of listeners) listener(state); render(); },
    unmount() { unmounted = true; cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test('the diagnostics screen focuses on video and readiness without unshipped planning pages', async () => {
  const host = mount({ onViewVideo: () => true });
  host.fill(); await host.start();
  assert.match(host.copy, /视频与诊断/);
  assert.ok(host.element('lingtu-view-video-only'));
  assert.equal(host.element('lingtu-open-maps'), undefined);
  assert.equal(host.element('lingtu-open-task'), undefined);
  host.unmount();
});

test('viewer credentials require HTTPS and are cleared when the address changes', async () => {
  const bindings = [];
  const host = mount({ allowViewerToken: true, onUseNavigation: (...args) => { bindings.push(args); return true; } });
  host.fill(); host.element('lingtu-viewer-token').props.onChangeText('fixture-token'); host.render();
  assert.equal(host.element('lingtu-viewer-token').props.secureTextEntry, true);
  host.fill('https://another.example.test');
  assert.equal(host.element('lingtu-viewer-token').props.value, '');
  host.element('lingtu-viewer-token').props.onChangeText('fixture-token'); host.render(); await host.start();
  host.element('lingtu-use-navigation').props.onPress();
  assert.deepEqual(bindings, [['https://lingtu.example.test', 'fixture-token']]);
  host.unmount();
  const local = mount({
    allowViewerToken: true, allowLocalHttp: true,
    read: () => Promise.resolve({
      endpoint: 'http://192.168.1.2:5050', observedAt: 1000, environment: 'real', product: 'nav',
      localizationState: null, localizationReady: null, localizationPoseFresh: null, controlAuthority: 'NONE',
      readiness: { ready: true, reasons: [] }, features: {}
    }), onUseNavigation: (...args) => { bindings.push(args); return true; }
  });
  local.fill('http://192.168.1.2:5050'); local.element('lingtu-viewer-token').props.onChangeText('fixture-token'); local.render();
  await local.start(); local.element('lingtu-use-navigation').props.onPress(); local.render();
  assert.equal(bindings.length, 1); assert.match(local.copy, /凭据需要 HTTPS/); local.unmount();
});

test('read-only video selection requires a fresh status and does not invoke control', async () => {
  const selections = [];
  const host = mount({ onViewVideo: (...args) => { selections.push(args); return true; } });
  host.fill(); assert.equal(host.element('lingtu-view-video-only'), undefined);
  await host.start(); host.element('lingtu-view-video-only').props.onPress();
  assert.deepEqual(selections, [['https://lingtu.example.test', undefined]]);
  host.unmount();
});

test('retired service handlers cannot bind an edited or expired target', async () => {
  let bindings = 0;
  const host = mount({ onUseNavigation: () => { bindings++; return true; } }); host.fill(); await host.start();
  const bind = host.element('lingtu-use-navigation').props.onPress;
  host.fill('https://new.example.test'); bind(); host.render();
  assert.equal(bindings, 0);
  await host.start(); const expired = host.element('lingtu-use-navigation').props.onPress;
  host.advance(15000); expired(); assert.equal(bindings, 0); host.unmount();
});

test('a retained read handler cannot query its former address after editing the target', async () => {
  const host = mount(); host.fill('https://old.example.test');
  const oldRead = host.element('lingtu-read').props.onPress;
  host.fill('https://new.example.test'); await oldRead(); await settle(); host.render();
  assert.equal(host.calls.length, 0); assert.equal(host.element('lingtu-observation'), undefined);
  await host.start(); assert.equal(host.calls[0].endpoint, 'https://new.example.test'); host.unmount();
});

test('unknown service labels cannot resolve Object prototype properties into React children', async () => {
  let host;
  host = mount({
    read: async () => host.sample({
      product: '__proto__', localizationState: 'constructor', controlAuthority: 'toString',
      readiness: { ready: false, dataReady: false, motionReady: false, nonMotionSafe: true, reasons: ['__proto__', 'constructor'] }
    })
  });
  host.fill(); await host.start();
  assert.equal(host.element('lingtu-product').props.children[1].props.children, '未知模式');
  assert.equal(host.element('lingtu-localization').props.children[1].props.children, '未知');
  assert.equal(host.element('lingtu-control-source').props.children[1].props.children, '未知');
  assert.match(host.copy, /服务报告未就绪/); assert.doesNotMatch(host.copy, /function|\[object Object\]/); host.unmount();
});

test('navigation status starts empty and only explicitly reads without granting control', async () => {
  const host = mount({ allowLocalHttp: true });
  assert.equal(host.calls.length, 0); assert.equal(host.element('lingtu-endpoint').props.value, '');
  assert.match(host.copy, /未读取/); assert.equal(host.element('lingtu-observation'), undefined);
  host.fill('http://192.168.1.3:5050'); await host.start();
  assert.equal(host.calls.length, 1); assert.equal(host.calls[0].endpoint, 'http://192.168.1.3:5050');
  assert.equal(host.calls[0].allowLocalHttp, true); assert.ok(host.calls[0].signal instanceof AbortSignal);
  assert.match(host.copy, /网关可达/); assert.match(host.copy, /实机/); assert.match(host.copy, /只读状态，不获取控制权/);
  assert.ok(host.element('lingtu-motion-ready')); assert.ok(host.element('lingtu-robot-online'));
  assert.equal(host.element('lingtu-robot-online').props.children[1].props.children, '未知');
  assert.equal(host.element('lingtu-feature-inspection').props.children[1].props.children, '未声明');
  assert.equal(host.element('lingtu-feature-cloud').props.children[1].props.children, '未声明');
  assert.doesNotMatch(host.copy, /已获取控制权|可以运动|fixture-session|fixture-model/);
  host.unmount();
});

test('degraded service remains reachable and unknown reasons never expose raw server text', async () => {
  let host;
  host = mount({
    read: async () => host.sample({
      environment: 'sim', product: 'inspection', localizationState: 'degraded',
      features: { mapping: true, navigation: false, whep: false }, resumeRequired: true,
      readiness: {
        ready: false, dataReady: false, motionReady: false, nonMotionSafe: true,
        reasons: ['localization:no_odometry', 'secret=server-body-token', 'another-raw-detail']
      }
    })
  });
  host.fill(); await host.start();
  assert.match(host.copy, /网关可达/); assert.match(host.copy, /仿真/); assert.match(host.copy, /无定位里程计/);
  assert.match(host.copy, /定位降级/); assert.equal(host.element('lingtu-product').props.children[1].props.children, '巡检');
  assert.match(host.copy, /服务报告未就绪/); assert.match(host.copy, /需显式恢复/);
  assert.equal(host.element('lingtu-feature-navigation').props.children[1].props.children, '不支持');
  assert.doesNotMatch(host.copy, /secret=|server-body-token|another-raw-detail/);
  host.unmount();
});

test('positive localization requires both readiness and fresh pose evidence', async () => {
  for (const state of ['ready', 'tracking']) {
    for (const [ready, poseFresh, expected] of [
      [true, false, '定位数据已过期'], [true, null, '定位待核验'],
      [false, true, '定位未就绪'], [null, true, '定位待核验'],
      [true, true, state === 'ready' ? '已定位' : '跟踪中'],
    ]) {
      let host;
      host = mount({ read: async () => host.sample({ localizationState: state, localizationReady: ready, localizationPoseFresh: poseFresh }) });
      host.fill(); await host.start();
      assert.equal(host.element('lingtu-localization').props.children[1].props.children, expected, `${state}/${ready}/${poseFresh}`);
      host.unmount();
    }
  }
});

test('editing an address aborts and clears the old request; late result cannot replace the new target', async () => {
  const old = deferred(); let host;
  host = mount({ read: options => options.endpoint.endsWith('/old') ? old.promise : Promise.resolve(host.sample({ mapName: 'new-map' })) });
  host.fill('https://lingtu.example.test/old'); void host.start();
  host.fill('https://lingtu.example.test/new'); assert.equal(host.calls[0].signal.aborted, true);
  assert.equal(host.element('lingtu-observation'), undefined); await host.start();
  old.resolve(host.sample({ mapName: 'old-map' })); await settle(); host.render();
  assert.match(host.copy, /new-map/); assert.doesNotMatch(host.copy, /old-map/); assert.equal(host.calls.length, 2);
  host.unmount();
});

test('cancel, background, return and unmount retire pending reads and reject late results', async () => {
  for (const exit of ['cancel', 'background', 'back', 'unmount']) {
    const pending = deferred(), host = mount({ read: () => pending.promise });
    host.fill(); void host.start();
    if (exit === 'cancel') host.element('lingtu-cancel').props.onPress();
    if (exit === 'background') host.lifecycle('background');
    if (exit === 'back') host.element('lingtu-back').props.onPress();
    if (exit === 'unmount') host.unmount();
    assert.equal(host.calls[0].signal.aborted, true, exit);
    pending.resolve(host.sample()); await settle(); host.render();
    assert.equal(host.element('lingtu-observation'), undefined, exit);
    assert.equal(host.lateUpdates, 0, exit);
    if (exit === 'background') { host.lifecycle('active'); assert.equal(host.calls.length, 1); }
    if (exit === 'back') assert.equal(host.backCalls, 1);
    if (exit !== 'unmount') host.unmount();
  }
});

test('one in-flight batch cannot be duplicated by a retained read handler', async () => {
  const pending = deferred(), host = mount({ read: () => pending.promise });
  host.fill(); const press = host.element('lingtu-read').props.onPress;
  press(); press(); host.render(); assert.equal(host.calls.length, 1);
  pending.resolve(host.sample()); await settle(); host.render(); assert.match(host.copy, /网关可达/);
  host.unmount();
});

test('display expires at the original batch deadline and a delayed result cannot renew it', async () => {
  const pending = deferred(); let host;
  host = mount({ read: () => pending.promise }); host.fill(); void host.start();
  const original = host.sample(); host.advance(10000); pending.resolve(original); await settle(); host.render();
  assert.ok(host.element('lingtu-observation')); host.advance(4999); assert.ok(host.element('lingtu-observation'));
  host.advance(1); assert.equal(host.element('lingtu-observation'), undefined); assert.match(host.copy, /已过期/);
  assert.equal(host.calls.length, 1); host.unmount();
  const late = deferred(), expired = mount({ read: () => late.promise }); expired.fill(); void expired.start();
  const stale = expired.sample(); expired.advance(15001); late.resolve(stale); await settle(); expired.render();
  assert.equal(expired.element('lingtu-observation'), undefined); assert.equal(expired.timers.size, 0);
  assert.match(expired.copy, /已过期/); expired.unmount();
});

test('only fixed service errors are displayed and failures never retain previous readiness', async () => {
  let fail = false, host;
  host = mount({ read: () => fail ? Promise.reject(new Error('private-body-token')) : Promise.resolve(host.sample()) });
  host.fill(); await host.start(); assert.ok(host.element('lingtu-observation'));
  fail = true; await host.start(); assert.equal(host.element('lingtu-observation'), undefined);
  assert.match(host.copy, /无法读取导航服务/); assert.doesNotMatch(host.copy, /private-body-token/); host.unmount();
  let authorized;
  authorized = mount({ read: async () => { throw new authorized.LingtuReadOnlyError('unauthorized'); } });
  authorized.fill(); await authorized.start(); assert.match(authorized.copy, /导航服务拒绝读取/); authorized.unmount();
});
