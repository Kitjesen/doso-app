import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/screens/LingtuMapsScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const fixture = (patch = {}) => ({ endpoint: 'https://lingtu.example.test', observedAt: 1000, activeMapName: '厂区 A & B', motionAuthorized: false,
  maps: [{ name: '厂区 A & B', contentEpoch: 7, hasPointCloud: true, hasOccupancy: false, state: 'READY', frameId: null, pointCount: null },
    { name: '二层', contentEpoch: null, hasPointCloud: null, hasOccupancy: true, state: '__proto__', frameId: null, pointCount: null }],
  localization: { state: 'ready', ready: true, poseFresh: true, frameId: 'map', x: 0, y: 2.3, z: null, yaw: -0.5 }, ...patch });

// Execute the real TSX handlers; all IO, lifecycle and monotonic time stay in this VM.
function mount({ read, library = fixture(), fetchImpl, browserImpl, dimensions = { width: 1280, height: 720, fontScale: 1 }, onBack = true } = {}) {
  let at = 1000, cursor = 0, nodes = [], unmounted = false, lateUpdates = 0, timerId = 0, backCalls = 0;
  let props = { endpoint: library.endpoint, allowLocalHttp: false, ...(onBack ? { onBack: () => backCalls++ } : {}) };
  const slots = [], effects = [], listeners = new Set(), backListeners = new Set(), timers = new Map(), calls = [], fetchCalls = [], browserCalls = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {
      if (unmounted) lateUpdates++; else slots[i] = typeof value === 'function' ? value(slots[i]) : value;
    }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  const appState = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  class LingtuReadOnlyError extends Error { constructor() { super('导航服务拒绝读取，请检查访问授权。'); } }
  const response = (status = 200, type = 'text/html') => ({ status, ok: status >= 200 && status < 300, headers: { get: () => type }, redirected: false });
  const allowed = { react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: appState, BackHandler: { addEventListener(_event, listener) { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; } },
      Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => dimensions },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-web-browser': { openBrowserAsync: async (...args) => { browserCalls.push(args); return browserImpl ? browserImpl(...args) : { type: 'opened' }; } },
    '../appearance': { cardLayout: { radius: 24, inset: 16, gap: 12 }, getProductAppearance: () => ({ canvas: '#fff', surface: '#f4f7fa', ink: '#123', secondary: '#567', blue: '#98d1ff', blueInk: '#123', blueSoft: '#def' }) },
    '../components/AppText': { Text: 'Text' }, '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) }, '../typography': { typography: {} },
    '../components/PointCloudView': { PointCloudView: 'PointCloudView', pointCloudEndpoint(origin) { const value = new URL(origin); value.port = '5052'; return value.origin; } },
    '../services/lingtuReadOnly': { LingtuReadOnlyError,
      validateLingtuOrigin(value) { return new URL(value).origin; },
      isLingtuStatusFresh: snapshot => Number.isFinite(snapshot?.observedAt) && at >= snapshot.observedAt && at - snapshot.observedAt < 15000,
      readLingtuMaps: options => { calls.push(options); return read ? read(options) : Promise.resolve(library); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { assert.ok(name in allowed, `Unexpected dependency ${name}`); return allowed[name]; },
    AbortController, URL, performance: { now: () => at },
    fetch: async (...args) => { fetchCalls.push(args); return fetchImpl ? fetchImpl(...args) : response(); },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, due: at + delay }); return timerId; }, clearTimeout: id => timers.delete(id) });
  const render = () => {
    cursor = 0; nodes = [];
    const walk = node => { if (node == null || typeof node === 'boolean') return; if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; } nodes.push(node); walk(node.props.children); };
    walk(module.exports.LingtuMapsScreen(props));
    while (effects.length) effects.shift()();
  };
  render(); render();
  return { calls, fetchCalls, browserCalls, timers, response, render, LingtuReadOnlyError,
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get lateUpdates() { return lateUpdates; }, get backCalls() { return backCalls; },
    element: id => nodes.find(node => node.props?.testID === id),
    async ready() { await settle(); render(); },
    async press(id) { const result = this.element(id).props.onPress(); render(); await result; await settle(); render(); },
    setProps(patch) { props = { ...props, ...patch }; render(); render(); },
    advance(ms) { at += ms; for (const [id, timer] of [...timers]) if (timer.due <= at) { timers.delete(id); timer.callback(); } render(); },
    lifecycle(state) { appState.currentState = state; for (const listener of listeners) listener(state); render(); },
    hardwareBack() { for (const listener of [...backListeners].reverse()) if (listener()) { render(); return true; } return false; },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('explicit map entry reads a real library; selection does not activate or fetch maps', async () => {
  const host = mount(); await host.ready();
  assert.equal(host.calls.length, 1); assert.ok(host.calls[0].signal instanceof AbortSignal);
  assert.match(host.copy, /地图库\s*（2）/); assert.match(host.copy, /内容版本\s*7/); assert.match(host.copy, /当前地图/);
  assert.match(host.copy, /点云\s*已有\s*，栅格\s*未提供/); assert.doesNotMatch(host.copy, /private-detail/);
  assert.equal(host.element('lingtu-maps-x').props.children[1].props.children, '0.00 m');
  assert.equal(host.element('lingtu-maps-yaw').props.children[1].props.children, '-0.50 rad');
  assert.equal(host.element('lingtu-maps-z').props.children[1].props.children, '—');
  await host.press('lingtu-map-item-1'); assert.equal(host.calls.length, 1); assert.equal(host.fetchCalls.length, 0);
  assert.equal(host.element('lingtu-maps-selected').props.children[1].props.children, '二层'); host.unmount();
});

test('confirmed empty library is different from expired or unavailable library', async () => {
  const host = mount({ library: fixture({ maps: [], activeMapName: null, localization: null }) }); await host.ready();
  assert.ok(host.element('lingtu-maps-empty')); assert.equal(host.element('lingtu-maps-open').props.disabled, true);
  host.advance(15000); assert.equal(host.element('lingtu-maps-empty'), undefined); assert.match(host.copy, /地图库状态已过期/); host.unmount();
});

test('only a ready and fresh localization shows coordinates; unknown is never zero', async () => {
  for (const [ready, poseFresh, label] of [[true, false, '定位数据已过期'], [true, null, '定位待核验'], [false, true, '定位未就绪']]) {
    const host = mount({ library: fixture({ localization: { ready, poseFresh, x: 12, y: 4, z: 0, yaw: 1, frameId: 'map' } }) }); await host.ready();
    assert.match(host.copy, new RegExp(label));
    for (const axis of ['x', 'y', 'z', 'yaw']) assert.equal(host.element(`lingtu-maps-${axis}`).props.children[1].props.children, '—'); host.unmount();
  }
  const incomplete = mount({ library: fixture({ localization: { ready: true, poseFresh: true, x: null, y: null, z: null, yaw: null, frameId: null } }) });
  await incomplete.ready(); assert.match(incomplete.copy, /定位待核验/); assert.doesNotMatch(incomplete.copy, /定位已就绪/);
  assert.equal(incomplete.element('lingtu-maps-x').props.children[1].props.children, '—'); incomplete.unmount();
});

test('G20 gets measured split panes; large text and narrow/portrait use a scroll layout', async () => {
  for (const [dimensions, measured, columns] of [
    [{ width: 1280, height: 720, fontScale: 1 }, 1200, true],
    [{ width: 1280, height: 720, fontScale: 1.4 }, 1200, false],
    [{ width: 1280, height: 720, fontScale: 1 }, 600, false],
    [{ width: 720, height: 1280, fontScale: 1 }, 700, false],
  ]) {
    const host = mount({ dimensions }); await host.ready(); host.element('lingtu-maps-screen').props.onLayout({ nativeEvent: { layout: { width: measured } } }); host.render();
    assert.equal(!!host.element('lingtu-maps-columns'), columns); assert.equal(!!host.element('lingtu-maps-scroll'), !columns); host.unmount();
  }
});

test('workbench uses encoded same-origin observed map URL and an HTML GET preflight', async () => {
  const host = mount(); await host.ready(); await host.press('lingtu-maps-open');
  assert.equal(host.fetchCalls.length, 1); const [url, options] = host.fetchCalls[0], parsed = new URL(url);
  assert.equal(parsed.origin, 'https://lingtu.example.test'); assert.equal(parsed.searchParams.get('map'), '厂区 A & B');
  assert.equal(parsed.searchParams.get('observe'), '1'); assert.equal(parsed.searchParams.get('tab'), 'map');
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  assert.equal(host.browserCalls[0][0], url); assert.match(host.copy, /已打开地图工作台/); host.unmount();
});

test('live point cloud mounts the selected gateway native view without a saved map or browser', async () => {
  const host = mount({ library: fixture({ maps: [], activeMapName: null, localization: null }) }); await host.ready();
  assert.equal(host.element('lingtu-maps-open').props.disabled, true);
  assert.equal(host.element('lingtu-maps-live').props.disabled, false);
  await host.press('lingtu-maps-live');
  const native = host.element('lingtu-cloud-view');
  assert.equal(native.type, 'PointCloudView'); assert.equal(native.props.endpoint, 'https://lingtu.example.test:5052');
  assert.equal(native.props.kind, 2); assert.equal(native.props.active, true);
  assert.equal(host.browserCalls.length, 0); assert.equal(host.fetchCalls.length, 0); assert.equal(host.calls.length, 1);
  native.props.onStatus({ nativeEvent: { status: 'live', message: '', points: 123 } }); host.render();
  assert.match(host.copy, /正在接收点云\s*（123 点）/);
  await host.press('lingtu-cloud-kind-1'); assert.equal(host.element('lingtu-cloud-view').props.kind, 1);
  native.props.onStatus({ nativeEvent: { status: 'live', message: 'retired-frame', points: 999 } }); host.render();
  assert.doesNotMatch(host.copy, /retired-frame|999 点/);
  assert.equal(host.hardwareBack(), true); assert.equal(host.element('lingtu-cloud-view'), undefined); host.unmount();
});

test('live entry works after map reads fail and reports native receiving errors', async () => {
  const unavailable = mount({ read: () => Promise.reject(new Error('mapd unavailable')) }); await unavailable.ready();
  await unavailable.press('lingtu-maps-live'); assert.equal(unavailable.browserCalls.length, 0);
  const native = unavailable.element('lingtu-cloud-view'); assert.ok(native);
  native.props.onStatus({ nativeEvent: { status: 'error', message: 'Gateway unavailable', points: 0 } }); unavailable.render();
  assert.match(unavailable.copy, /点云接收失败/); assert.match(unavailable.copy, /Gateway unavailable/);
  await unavailable.press('lingtu-cloud-back'); assert.equal(unavailable.element('lingtu-cloud-view'), undefined); unavailable.unmount();
});

test('reselecting the active point-cloud kind preserves native status and its event owner', async () => {
  const host = mount(); await host.ready(); await host.press('lingtu-maps-live');
  for (const kind of [2, 1]) {
    if (kind === 1) await host.press('lingtu-cloud-kind-1');
    const native = host.element('lingtu-cloud-view');
    native.props.onStatus({ nativeEvent: { status: 'live', message: 'receiving', points: 123 } }); host.render();
    await host.press(`lingtu-cloud-kind-${kind}`);
    assert.match(host.copy, /正在接收点云\s*（123 点）/);
    assert.equal(host.element('lingtu-cloud-view').key, native.key);
    native.props.onStatus({ nativeEvent: { status: 'stale', message: 'source stopped', points: 0 } }); host.render();
    assert.match(host.copy, /点云已停更/); assert.match(host.copy, /source stopped/);
  }
  host.unmount();
});

test('background or target changes unmount native clouds and stale callbacks stay retired', async () => {
  for (const exit of ['background', 'target']) {
    const host = mount(); await host.ready(); const open = host.element('lingtu-maps-live').props.onPress;
    await host.press('lingtu-maps-live'); const update = host.element('lingtu-cloud-view').props.onStatus;
    if (exit === 'background') host.lifecycle('background');
    else host.setProps({ endpoint: 'https://new.example.test' });
    assert.equal(host.element('lingtu-cloud-view'), undefined);
    update({ nativeEvent: { status: 'live', message: 'retired-cloud', points: 7 } }); open(); await host.ready();
    assert.equal(host.element('lingtu-cloud-view'), undefined); assert.doesNotMatch(host.copy, /retired-cloud/);
    assert.equal(host.browserCalls.length, 0); assert.equal(host.fetchCalls.length, 0); host.unmount();
  }
});

test('missing, denied, non-HTML and redirected dashboards never open the browser', async () => {
  for (const [status, type, redirected, label] of [[404, 'text/html', false, '尚未部署'], [403, 'text/html', false, '拒绝访问'],
    [503, 'text/html', false, '暂不可用'], [200, 'application/json', false, '响应无法识别'], [200, 'text/html', true, '响应无法识别']]) {
    const host = mount({ fetchImpl: async () => ({ status, ok: status === 200, redirected, headers: { get: () => type } }) });
    await host.ready(); await host.press('lingtu-maps-open'); assert.equal(host.browserCalls.length, 0); assert.match(host.copy, new RegExp(label)); host.unmount();
  }
});

test('cancel, background, back and unmount abort reads and discard late data', async () => {
  for (const exit of ['cancel', 'background', 'back', 'unmount']) {
    const pending = deferred(), host = mount({ read: () => pending.promise });
    if (exit === 'cancel') await host.press('lingtu-maps-cancel');
    if (exit === 'background') host.lifecycle('background');
    if (exit === 'back') await host.press('lingtu-maps-back');
    if (exit === 'unmount') host.unmount();
    assert.equal(host.calls[0].signal.aborted, true); pending.resolve(fixture()); await host.ready();
    assert.equal(host.element('lingtu-map-item-0'), undefined); assert.equal(host.lateUpdates, 0);
    if (exit === 'background') { host.lifecycle('active'); assert.equal(host.calls.length, 1); }
    if (exit === 'back') assert.equal(host.backCalls, 1); if (exit !== 'unmount') host.unmount();
  }
});

test('endpoint changes retire old reads and old open/selection handlers cannot reuse a retired library', async () => {
  const old = deferred(), host = mount({ read: options => options.endpoint === 'https://lingtu.example.test' ? old.promise : Promise.resolve(fixture({ endpoint: options.endpoint, maps: [], activeMapName: null })) });
  host.setProps({ endpoint: 'https://new.example.test' }); assert.equal(host.calls[0].signal.aborted, true); await host.ready();
  old.resolve(fixture()); await host.ready(); assert.equal(host.element('lingtu-map-item-0'), undefined); assert.equal(host.calls.length, 2); host.unmount();
  let fail = false; const retired = mount({ read: () => fail ? Promise.reject(new Error('private-body')) : Promise.resolve(fixture()) });
  await retired.ready(); const open = retired.element('lingtu-maps-open').props.onPress, select = retired.element('lingtu-map-item-1').props.onPress;
  fail = true; await retired.press('lingtu-maps-refresh'); open(); select(); await retired.ready();
  assert.equal(retired.fetchCalls.length, 0); assert.equal(retired.element('lingtu-map-item-0'), undefined); assert.doesNotMatch(retired.copy, /private-body/); retired.unmount();
});

test('original batch time expires all map and pose markers, including while the browser is pending', async () => {
  const pending = deferred(), host = mount({ read: () => pending.promise }); host.advance(10000); pending.resolve(fixture()); await host.ready();
  assert.ok(host.element('lingtu-map-active')); host.advance(4999); assert.ok(host.element('lingtu-map-active'));
  host.advance(1); assert.equal(host.element('lingtu-map-active'), undefined); assert.equal(host.element('lingtu-map-item-0'), undefined);
  assert.equal(host.element('lingtu-maps-x').props.children[1].props.children, '—'); host.unmount();
  const browser = deferred(), opened = mount({ browserImpl: () => browser.promise }); await opened.ready();
  void opened.press('lingtu-maps-open'); await settle(); opened.advance(15000); browser.resolve({ type: 'opened' }); await opened.ready();
  assert.match(opened.copy, /已过期/); assert.doesNotMatch(opened.copy, /已打开/); opened.unmount();
});

test('one preflight at a time, aborted timeout and stale responses never open the workbench', async () => {
  const preflight = deferred(), host = mount({ fetchImpl: () => preflight.promise }); await host.ready();
  const open = host.element('lingtu-maps-open').props.onPress; open(); open(); host.render(); assert.equal(host.fetchCalls.length, 1);
  host.advance(8000); assert.equal(host.fetchCalls[0][1].signal.aborted, true); await host.ready();
  assert.match(host.copy, /打开超时/); assert.equal(host.element('lingtu-maps-open').props.disabled, false);
  preflight.resolve(host.response()); await host.ready();
  assert.equal(host.browserCalls.length, 0); assert.match(host.copy, /打开超时/); assert.equal(host.element('lingtu-maps-open').props.disabled, false); host.unmount();
  const delayed = deferred(), stale = mount({ read: () => delayed.promise }); stale.advance(15001); delayed.resolve(fixture()); await stale.ready();
  assert.equal(stale.element('lingtu-map-item-0'), undefined); assert.match(stale.copy, /已过期/); assert.equal(stale.timers.size, 0); stale.unmount();
});
