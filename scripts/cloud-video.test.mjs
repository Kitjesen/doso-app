import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const USER = 'e9ed54ec-1376-4a11-8cd3-00d859b6e622', DEVICE = 'd5619c98-0882-472a-b59c-d0f280f2253d';
const code = path => ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
  fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function viewerFixture({ release, renew = true, accessError = null } = {}) {
  const calls = [], receivers = [], snapshots = [], timers = new Map(), module = { exports: {} };
  let now = 1_000_000, count = 0;
  class VideoAccessError extends Error { constructor(code) { super(code); this.code = code; } }
  class Receiver {
    constructor(config, _runtime, publish) { this.config = config; this.publish = publish; receivers.push(this); }
    start() { calls.push('start'); }
    async renew(token) { calls.push(`renew:${token}`); return typeof renew === 'function' ? renew() : renew; }
    async stop() { calls.push('stop'); return release ? release.promise : true; }
  }
  const runtime = { setTimeout(callback, ms) { const key = {}; timers.set(key, { callback, at: now + ms }); return key; }, clearTimeout(key) { timers.delete(key); } };
  vm.runInNewContext(code('src/features/video/cloudViewer.ts'), { module, exports: module.exports, AbortController,
    Date: { now: () => now }, Map, Promise,
    require(name) {
      if (name === './whepReceiver') return { WhepReceiver: Receiver, videoOrigin: config => config.gatewayUrl };
      if (name === './access') return { VideoAccessError, async videoAccess(_user, _device, action) {
        calls.push(action);
        if (action === 'open' && accessError) throw new VideoAccessError(accessError);
        return action === 'open' ? { viewerToken: `token-${++count}`, expiresAt: now + 60_000 } : null;
      } };
      throw Error(name);
    },
  });
  const create = () => new module.exports.CloudViewer({ deviceId: DEVICE, gatewayUrl: 'https://video.example' }, USER, runtime, snapshot => { snapshots.push(snapshot); calls.push(`error:${snapshot.error}`); });
  return { create, calls, receivers, snapshots, failAccess(error) { accessError = error; },
    get now() { return now; }, get timerCount() { return timers.size; },
    async advance() { const [key, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; timers.delete(key); now = timer.at; timer.callback(); await flush(); } };
}

test('cloud viewing refreshes the grant and extends the current media session', async () => {
  const f = viewerFixture(), viewer = f.create(); viewer.start(); await flush();
  assert.deepEqual(f.calls, ['open', 'start']);
  await f.advance(); assert.deepEqual(f.calls, ['open', 'start', 'open', 'renew:token-2']);
  assert.equal(f.receivers.length, 1);
  await viewer.stop(); assert.deepEqual(f.calls.slice(-2), ['stop', 'close']);
});

test('a warming cloud source stays connecting while the receiver automatically retries', async () => {
  const f = viewerFixture(), viewer = f.create(); viewer.start(); await flush();
  f.receivers[0].publish({ id: 'warming', phase: 'error', stream: null, rotation: 0, error: 'unavailable' });
  assert.equal(f.snapshots.at(-1).phase, 'connecting');
  assert.equal(f.snapshots.at(-1).error, 'warming');
  await f.advance();
  f.receivers[0].publish({ id: 'retrying', phase: 'error', stream: null, rotation: 0, error: 'unavailable' });
  assert.equal(f.snapshots.at(-1).error, 'unavailable');
  f.receivers[0].publish({ id: 'retry-attempt', phase: 'connecting', stream: null, rotation: 0, error: null });
  assert.equal(f.snapshots.at(-1).error, 'unavailable');
  f.receivers[0].publish({ id: 'playing', phase: 'receiving', stream: {}, rotation: 0, error: null });
  f.receivers[0].publish({ id: 'reconnecting', phase: 'connecting', stream: null, rotation: 0, error: null });
  assert.equal(f.snapshots.at(-1).phase, 'stalled');
  f.receivers[0].publish({ id: 'lost-feed', phase: 'stalled', stream: null, rotation: 0, error: 'unavailable' });
  assert.equal(f.snapshots.at(-1).phase, 'stalled');
  assert.equal(f.receivers.length, 1);
  await viewer.stop();
});

test('reopening the same device waits for old media release and credential revocation', async () => {
  const release = deferred(), f = viewerFixture({ release }), first = f.create();
  first.start(); await flush(); const stopping = first.stop(); await flush();
  const second = f.create(); second.start(); await flush();
  assert.deepEqual(f.calls, ['open', 'start', 'stop']);
  release.resolve(true); await stopping; await flush();
  assert.deepEqual(f.calls.slice(-3), ['close', 'open', 'start']);
  await second.stop();
});

test('temporary media renewal failure automatically retries the current session', async () => {
  let available = false;
  const f = viewerFixture({ renew: () => available }), viewer = f.create(); viewer.start(); await flush(); await f.advance();
  assert.deepEqual(f.calls.slice(-2), ['open', 'renew:token-2']);
  assert.equal(f.calls.includes('stop'), false);
  available = true; await f.advance();
  assert.equal(f.calls.at(-1), 'renew:token-3'); assert.equal(f.receivers.length, 1);
  await viewer.stop(); assert.deepEqual(f.calls.slice(-2), ['stop', 'close']);
});

test('a temporary credential outage recovers automatically while authorization refusal stops', async () => {
  const f = viewerFixture({ accessError: 'unavailable' }), viewer = f.create(); viewer.start(); await flush();
  assert.equal(f.calls.filter(call => call === 'open').length, 1); assert.equal(f.receivers.length, 0);
  await f.advance(); assert.equal(f.calls.filter(call => call === 'open').length, 2);
  f.failAccess(null); await f.advance(); assert.equal(f.receivers.length, 1);
  await viewer.stop();
  const denied = viewerFixture({ accessError: 'authorization' }), rejected = denied.create(); rejected.start(); await flush();
  assert.equal(denied.snapshots.at(-1).error, 'authorization'); assert.equal(denied.timerCount, 0);
  assert.equal(denied.calls.filter(call => call === 'open').length, 1); await rejected.stop();
});

test('credential expiry withdraws the old feed during an outage and reconnects after recovery', async () => {
  const f = viewerFixture(), viewer = f.create(); viewer.start(); await flush();
  f.receivers[0].publish({ id: 'live', phase: 'receiving', stream: {}, rotation: 0, error: null });
  const deadline = f.now + 60_000;
  f.failAccess('unavailable');
  while (f.now < deadline) await f.advance();
  assert.equal(f.now, deadline); assert.equal(f.calls.includes('stop'), true);
  assert.equal(f.snapshots.at(-1).stream, null); assert.equal(f.snapshots.at(-1).phase, 'stalled');
  f.failAccess(null); await f.advance();
  assert.equal(f.receivers.length, 2); await viewer.stop();
});

test('failed media release leaves grant expiry responsible for cleanup', async () => {
  const release = deferred(), f = viewerFixture({ release }), viewer = f.create(); viewer.start(); await flush();
  const stopping = viewer.stop(); release.resolve(false); await flush();
  assert.equal(f.calls.includes('close'), false);
  const replacement = f.create(); replacement.start(); await flush();
  assert.equal(f.receivers.length, 1);
  await f.advance(); await stopping; await flush();
  assert.equal(f.receivers.length, 2);
  const replacementStop = replacement.stop(); await flush(); await f.advance(); await replacementStop;
});

function accessFixture({ foreign = false, wrongDevice = false } = {}) {
  const calls = [], module = { exports: {} };
  const client = { auth: { async getSession() { return { data: { session: { user: { id: foreign ? DEVICE : USER }, access_token: 'account-jwt' } } }; } } };
  vm.runInNewContext(code('src/features/video/access.ts'), { module, exports: module.exports, AbortController, Date, setTimeout, clearTimeout, Promise,
    async fetch(url, init) {
      calls.push({ url, init });
      if (JSON.parse(init.body).action === 'close') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ viewerId: USER, deviceId: wrongDevice ? USER : DEVICE, viewerToken: 'a'.repeat(64), expiresAt: Date.now() + 60_000 }), { headers: { 'content-type': 'application/json' } });
    },
    require(name) {
      if (name.endsWith('/supabaseClient')) return { getSupabaseClient: () => client, supabaseConfig: { url: 'https://api.example', publishableKey: 'public-key' } };
      if (name.endsWith('/authSessionOperation')) return {
        runAuthSessionOperation: run => run({ retain: operation => operation() }),
        subscribeAuthSessionOperations: () => () => {}, getAuthSessionOperationSnapshot: () => ({ busy: false }),
      };
      throw Error(name);
    },
  });
  return { access: module.exports.videoAccess, calls };
}

test('business access uses the signed-in account and returns only a matching device grant', async () => {
  const f = accessFixture(), grant = await f.access(USER, DEVICE, 'open');
  assert.equal(grant.deviceId, DEVICE); assert.equal(grant.viewerToken, 'a'.repeat(64));
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer account-jwt');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { action: 'open', deviceId: DEVICE });
  assert.equal(await f.access(USER, DEVICE, 'close'), null);
  const wrong = accessFixture({ wrongDevice: true });
  await assert.rejects(wrong.access(USER, DEVICE, 'open'), error => error.code === 'unavailable');
  const foreign = accessFixture({ foreign: true });
  await assert.rejects(foreign.access(USER, DEVICE, 'open'), error => error.code === 'authorization');
  assert.equal(foreign.calls.length, 0);
});

test('the cloud viewing page caps selection at four and lets a stopped tile be replaced', () => {
  const slots = [], module = { exports: {} }; let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code('src/features/video/CloudVideoScreen.tsx'), { module, exports: module.exports, process: { env: {} },
    require(name) {
      if (name.endsWith('/fonts/home')) return { productType: { title: {}, section: {}, body: {}, caption: {}, button: {} } };
    if (name === 'react') return { useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial; return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; }, useEffect() {} };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return { useWindowDimensions: () => ({ width: 390, height: 844 }), BackHandler: {}, Modal: 'Modal', Pressable: 'Button', ScrollView: 'Scroll', View: 'View', StyleSheet: { create: value => value } };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'Safe' };
      if (name === '@expo/vector-icons') return { Feather: 'Icon' };
      if (name === 'expo-font') return { useFonts: () => [true, null] };
      if (name.endsWith('.otf')) return name;
      if (name.endsWith('/ProductHeader')) return { ProductHeader: 'ProductHeader' };
      if (name.endsWith('/HomeText')) return { Text: 'Text' };
      if (name.endsWith('/AppText')) return { Text: 'Text' };
      if (name.endsWith('/ControlVideoSurface')) return {};
      if (name === './useControlVideoReceiver') return {};
      throw Error(name);
    },
  });
  const devices = [1, 2, 3, 4, 5].map(id => ({ id: String(id), label: `Robot ${id}` }));
  let tree;
  const render = () => { cursor = 0; tree = module.exports.CloudVideoScreen({ expectedUserId: USER, devices, initialDeviceId: '1', onBack() {} }); };
  const find = (label, node = tree) => {
    if (!node || typeof node !== 'object') return;
    if (node.props?.accessibilityLabel === label) return node;
    for (const child of [node.props?.children].flat(Infinity).filter(child => child != null)) { const result = find(label, child); if (result) return result; }
  };
  render();
  for (const id of [2, 3, 4]) { find(`Robot ${id}`).props.onPress(); render(); }
  assert.equal(find('Robot 5').props.disabled, true);
  find('Robot 2').props.onPress(); render();
  assert.equal(find('Robot 5').props.disabled, false);
  find('Robot 5').props.onPress(); render();
  assert.equal(find('Robot 5').props.accessibilityState.checked, true);
  assert.equal(find('Robot 2').props.accessibilityState.checked, false);
  find('关闭全部画面').props.onPress(); render();
  for (const device of devices) assert.equal(find(device.label).props.accessibilityState.checked, false);
});

function galleryFixture(preview = false) {
  const slots = [], module = { exports: {} }, receiverCalls = [];
  let cursor = 0, nodes = [];
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code('src/features/video/CloudVideoScreen.tsx'), { module, exports: module.exports, process: { env: { EXPO_PUBLIC_VIDEO_GATEWAY_URL: 'https://video.example' } }, require(name) {
    if (name.endsWith('/fonts/home')) return { productType: { title: {}, section: {}, body: {}, caption: {}, button: {} } };
    if (name === 'react') return { useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial; return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; }, useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { useWindowDimensions: () => ({ width: 390, height: 844 }), BackHandler: {}, Modal: 'Modal', Pressable: 'Button', ScrollView: 'Scroll', View: 'View', StyleSheet: { create: value => value } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'Safe' };
    if (name === '@expo/vector-icons') return { Feather: 'Icon' };
    if (name === 'expo-font') return { useFonts: () => [true, null] };
    if (name.endsWith('.otf')) return name;
    if (name.endsWith('/ProductHeader')) return { ProductHeader: 'ProductHeader' };
      if (name.endsWith('/HomeText')) return { Text: 'Text' };
    if (name.endsWith('/ControlVideoSurface')) return { ControlVideoSurface: 'VideoSurface' };
    if (name === './useControlVideoReceiver') return { useControlVideoReceiver(config, active) { receiverCalls.push({ config, active }); return { presentation: { phase: 'receiving' }, surface: jsx('DecodedFrame', {}), error: null, reconnect() {} }; } };
    throw Error(name);
  } });
  const devices = [{ id: DEVICE, label: 'THUNDER 01' }];
  const render = () => {
    cursor = 0; nodes = []; receiverCalls.length = 0;
    const walk = node => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node.type === 'function') return walk(node.type(node.props));
      if (node.type === 'Modal' && !node.props.visible) return;
      nodes.push(node); walk(node.props?.children);
    };
    walk(preview ? module.exports.CloudVideoPreview({ frames: devices.map(device => ({ ...device, content: jsx('StaticFrame', {}) })), onBack() {} })
      : module.exports.CloudVideoScreen({ expectedUserId: USER, devices, initialDeviceId: DEVICE, onBack() {} }));
  };
  render();
  return { render, receiverCalls, get nodes() { return nodes; }, action(label) { return nodes.find(node => node.props?.accessibilityLabel === label); } };
}

test('fullscreen moves one visible video surface while retaining one receiver and close removes the tile', () => {
  const f = galleryFixture();
  assert.equal(f.receiverCalls.length, 1);
  assert.equal(f.receiverCalls[0].config.expectedUserId, USER);
  assert.equal(f.nodes.filter(node => node.type === 'VideoSurface').length, 1);
  f.action('全屏THUNDER 01画面').props.onPress(); f.render();
  assert.equal(f.receiverCalls.length, 1);
  assert.equal(f.nodes.filter(node => node.type === 'VideoSurface').length, 1);
  assert.equal(f.nodes.filter(node => node.type === 'Modal').length, 1);
  f.action('退出视频全屏').props.onPress(); f.render();
  assert.equal(f.nodes.filter(node => node.type === 'Modal').length, 0);
  f.action('关闭THUNDER 01画面').props.onPress(); f.render();
  assert.equal(f.receiverCalls.length, 0);
  assert.equal(f.nodes.filter(node => node.type === 'VideoSurface').length, 0);
});

test('static design gallery shares selection/fullscreen UI without invoking a media receiver', () => {
  const f = galleryFixture(true);
  assert.equal(f.receiverCalls.length, 0);
  assert.equal(f.nodes.filter(node => node.type === 'StaticFrame').length, 1);
  assert.ok(f.action('THUNDER 01静态设计画面'));
  f.action('全屏THUNDER 01画面').props.onPress(); f.render();
  assert.equal(f.receiverCalls.length, 0);
  assert.equal(f.nodes.filter(node => node.type === 'StaticFrame').length, 1);
  f.action('退出视频全屏').props.onPress(); f.render();
  f.action('关闭全部画面').props.onPress(); f.render();
  assert.equal(f.nodes.filter(node => node.type === 'StaticFrame').length, 0);
  f.action('添加视频设备').props.onPress(); f.render();
  assert.equal(f.nodes.filter(node => node.type === 'StaticFrame').length, 1);
});


