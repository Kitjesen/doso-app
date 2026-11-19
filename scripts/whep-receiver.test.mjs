import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/video/whepReceiver.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, URL, AbortController, setTimeout, clearTimeout });
const { WhepReceiver, videoOrigin } = module.exports;
const config = { deviceId: 'robot-a', gatewayUrl: 'http://192.168.66.64:8080', allowLocalHttp: true };
const flush = async () => { for (let i = 0; i < 64; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(fetcher, preparePeer, configuration = config) {
  let now = 0, next = 0;
  const timers = new Map(), peers = [], calls = [], snapshots = [], streams = [];
  class Peer {
    connectionState = 'new'; iceGatheringState = 'complete'; localDescription = null; listeners = new Map(); decoded = 0; closed = false;
    addTransceiver(kind, options) { this.transceiver = { kind, options }; }
    addEventListener(event, listener) { this.listeners.set(event, listener); }
    removeEventListener(event, listener) { if (this.listeners.get(event) === listener) this.listeners.delete(event); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=local' }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) { this.answer = answer; }
    async getStats() { return new Map([['video', { type: 'inbound-rtp', kind: 'video', framesDecoded: this.decoded }]]); }
    getReceivers() { return this.stream ? [{ track: this.stream.track }] : []; }
    close() { this.closed = true; }
    connect() { this.connectionState = 'connected'; this.listeners.get('connectionstatechange')?.(); }
    track() {
      const track = { kind: 'video', stopped: false, stop() { this.stopped = true; } };
      this.stream = { track, getTracks: () => [track], released: false, release() { this.released = true; } };
      streams.push(this.stream);
      this.listeners.get('track')?.({ track, streams: [this.stream] });
    }
  }
  const runtime = {
    now: () => now,
    setTimeout(fn, ms) { timers.set(++next, { fn, at: now + ms }); return next; },
    clearTimeout(id) { timers.delete(id); },
    createPeer(configuration) { const pc = new Peer(); pc.configuration = configuration; peers.push(pc); preparePeer?.(pc); return pc; },
    makeStream: () => { throw new Error('unused'); },
    async fetch(url, init = {}) {
      calls.push({ url, init });
      if (fetcher) { const result = fetcher(url, init); if (result) return result; }
      if (init.method === 'DELETE') return new Response('', { status: 200 });
      if (init.method === 'POST') return new Response('v=0\r\no=remote', { status: 201, headers: { Location: '/api/v1/webrtc/sessions/whep/session-1', ETag: 'v1' } });
      return new Response(JSON.stringify({ available: true, source_ready: true, ice_servers: [], rotation_degrees: 90 }));
    },
  };
  const receiver = new WhepReceiver(configuration, runtime, snapshot => snapshots.push(snapshot));
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      await flush();
      const upcoming = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!upcoming) break;
      now = upcoming[1].at; timers.delete(upcoming[0]); upcoming[1].fn();
    }
    now = end; await flush();
  }
  return { receiver, runtime, peers, calls, snapshots, streams, advance, timers, get latest() { return snapshots.at(-1); } };
}

test('renewing a cloud viewing credential preserves the peer and uses the new credential for cleanup', async () => {
  const h = harness((url, init) => url.endsWith('/renew') ? new Response(null, { status: 204 }) : undefined,
    undefined, { deviceId: 'robot-a', gatewayUrl: 'https://video.example', viewerToken: 'old-token' });
  h.receiver.start(); await flush();
  const pc = h.peers[0]; pc.connect(); pc.track(); pc.decoded = 2; await h.advance(500);
  assert.equal(await h.receiver.renew('new-token'), true);
  assert.equal(h.peers.length, 1); assert.equal(pc.closed, false);
  const renewal = h.calls.find(call => call.url.endsWith('/renew'));
  assert.equal(renewal.init.method, 'POST'); assert.equal(renewal.init.headers.Authorization, 'Bearer new-token');
  assert.equal(await h.receiver.stop(), true);
  assert.equal(h.calls.find(call => call.init.method === 'DELETE').init.headers.Authorization, 'Bearer new-token');
});

test('stop reports failed resource release to the cloud credential owner', async () => {
  const h = harness((_url, init) => init.method === 'DELETE' ? new Response(null, { status: 503 }) : undefined);
  h.receiver.start(); await flush();
  assert.equal(await h.receiver.stop(), false);
  assert.equal(h.peers[0].closed, true);
});

test('a rejected renewal stops retries and preserves the failed cleanup result', async () => {
  const h = harness((url, init) => url.endsWith('/renew') ? new Response(null, { status: 403 })
    : init.method === 'DELETE' ? new Response(null, { status: 503 }) : undefined,
  undefined, { deviceId: 'robot-a', gatewayUrl: 'https://video.example', viewerToken: 'old-token' });
  h.receiver.start(); await flush();
  assert.equal(await h.receiver.renew('new-token'), false);
  assert.equal(h.latest.error, 'authorization');
  await h.advance(10_000); assert.equal(h.peers.length, 1);
  assert.equal(await h.receiver.stop(), false);
});

test('late authorization refusals from the old credential retry using the refreshed credential', async () => {
  for (const stage of ['status', 'offer']) {
    const pending = deferred();
    const h = harness((_url, init) => init.headers?.Authorization === 'Bearer old-token'
      && (stage === 'status' ? !init.method : init.method === 'POST') ? pending.promise : undefined,
    undefined, { deviceId: 'robot-a', gatewayUrl: 'https://video.example', viewerToken: 'old-token' });
    h.receiver.start(); await flush();
    assert.equal(await h.receiver.renew('new-token'), true);
    pending.resolve(new Response(null, { status: 403 })); await flush();
    assert.equal(h.snapshots.some(snapshot => snapshot.error === 'authorization'), false);
    await h.advance(1000);
    const pc = h.peers.at(-1); pc.connect(); pc.track(); pc.decoded = 1; await h.advance(500);
    assert.equal(h.latest.phase, 'receiving');
    assert.ok(h.calls.filter(call => call.init.method === 'POST').some(call => call.init.headers.Authorization === 'Bearer new-token'));
    await h.receiver.stop();
  }
});

test('a late resource created with the old credential is released before the refreshed negotiation', async () => {
  const pending = deferred();
  const h = harness((_url, init) => init.method === 'POST' && init.headers?.Authorization === 'Bearer old-token' ? pending.promise : undefined,
    undefined, { deviceId: 'robot-a', gatewayUrl: 'https://video.example', viewerToken: 'old-token' });
  h.receiver.start(); await flush(); await h.receiver.renew('new-token');
  pending.resolve(new Response('v=0\r\no=old', { status: 201, headers: { Location: '/api/v1/webrtc/sessions/old-session' } }));
  await flush();
  const cleanup = h.calls.find(call => call.init.method === 'DELETE');
  assert.ok(cleanup.url.endsWith('/old-session')); assert.equal(cleanup.init.headers.Authorization, 'Bearer new-token');
  assert.equal(h.peers[0].closed, true);
  await h.advance(1000); assert.equal(h.peers.length, 2);
  await h.receiver.stop();
});

test('video configuration requires a selected device and explicit private LAN HTTP or HTTPS', () => {
  assert.equal(videoOrigin(config), config.gatewayUrl);
  assert.equal(videoOrigin({ deviceId: 'a', gatewayUrl: 'https://robot.example' }), 'https://robot.example');
  for (const bad of [
    { ...config, allowLocalHttp: false }, { ...config, deviceId: '' },
    { ...config, gatewayUrl: 'http://8.8.8.8' }, { ...config, gatewayUrl: 'http://0xc0a84240' },
    { ...config, gatewayUrl: 'http://192.168.66.64/path' }, { ...config, gatewayUrl: 'https://user:secret@robot.example' },
    { ...config, gatewayUrl: 'https://robot.example?token=secret' },
  ]) assert.throws(() => videoOrigin(bad));
});

test('receive-only WHEP negotiates without credentials or redirects and requires actual decoded-frame progress', async () => {
  const h = harness(); h.receiver.start(); await flush();
  const pc = h.peers[0];
  assert.equal(pc.transceiver.kind, 'video'); assert.equal(pc.transceiver.options.direction, 'recvonly');
  pc.connect(); pc.track(); await h.advance(500);
  assert.equal(h.latest.phase, 'connecting'); assert.equal(h.latest.stream, pc.stream, 'hidden surface can attach before first decode');
  pc.decoded = 1; await h.advance(500);
  assert.equal(h.latest.phase, 'receiving'); assert.equal(h.latest.rotation, 90);
  assert.ok(h.calls.every(call => call.init.credentials === 'omit' && call.init.redirect === 'error'));
  assert.ok(h.calls.every(call => call.init.headers?.Authorization === undefined));
  assert.equal(h.calls.find(call => call.init.method === 'POST').init.headers['Content-Type'], 'application/sdp');
  h.receiver.stop();
});

test('viewer credentials require HTTPS and a valid Bearer value before any request', () => {
  const token = 'test-viewer-credential';
  for (const invalid of [
    { ...config, viewerToken: token },
    { ...config, gatewayUrl: 'https://robot.example', viewerToken: '' },
    { ...config, gatewayUrl: 'https://robot.example', viewerToken: 'bad value' },
    { ...config, gatewayUrl: 'https://robot.example', viewerToken: 'bad\r\nvalue' },
  ]) {
    let failed = false;
    try { harness(null, null, invalid); } catch (error) { failed = true; assert.ok(!String(error).includes(token)); }
    assert.ok(failed, 'invalid viewer credentials must be rejected before fetch');
  }
});

test('HTTPS viewer credentials accompany only same-origin status, offer and session cleanup', async () => {
  const token = 'test-viewer-credential';
  const h = harness(null, null, { ...config, gatewayUrl: 'https://robot.example', viewerToken: token });
  h.receiver.start(); await flush(); h.receiver.stop(); await flush();
  assert.ok(h.calls.some(call => call.init.method === 'DELETE'));
  assert.ok(h.calls.every(call => call.init.headers?.Authorization === `Bearer ${token}`));
  assert.ok(h.calls.every(call => new URL(call.url).origin === 'https://robot.example'
    && !call.url.includes(token) && call.init.credentials === 'omit' && call.init.redirect === 'error'));
  assert.ok(!JSON.stringify(h.snapshots).includes(token));
});

test('authorization failures stop retries until explicitly retried, with no raw credential in errors', async () => {
  const token = 'test-viewer-credential';
  for (const status of [401, 403]) for (const stage of ['status', 'offer']) {
    const h = harness((url, init) => (stage === 'status' ? !init.method : init.method === 'POST')
      ? Promise.resolve(new Response('', { status })) : null, null,
    { ...config, gatewayUrl: 'https://robot.example', viewerToken: token });
    h.receiver.start(); await flush();
    assert.equal(h.latest.error, 'authorization'); assert.equal(h.latest.stream, null);
    const requests = h.calls.length;
    await h.advance(120000); assert.equal(h.calls.length, requests); assert.equal(h.timers.size, 0);
    assert.ok(!JSON.stringify(h.snapshots).includes(token));
    h.receiver.reconnect(); await flush(); assert.ok(h.calls.length > requests); h.receiver.stop();
  }
});

test('retired device cleanup keeps its own viewer credential when a new device starts', async () => {
  const pending = deferred();
  const oldToken = 'old-viewer-credential', newToken = 'new-viewer-credential';
  const oldConfig = { ...config, gatewayUrl: 'https://old.example', viewerToken: oldToken };
  const old = harness((url, init) => init.method === 'POST' ? pending.promise : null, null,
    oldConfig);
  old.receiver.start(); await flush(); old.receiver.stop();
  oldConfig.viewerToken = newToken;
  const current = harness(null, null, { ...config, deviceId: 'robot-b', gatewayUrl: 'https://new.example', viewerToken: newToken });
  current.receiver.start(); await flush();
  pending.resolve(new Response('v=0\r\no=remote', { status: 201, headers: { Location: '/api/v1/webrtc/sessions/whep/old' } }));
  await flush();
  const cleanup = old.calls.find(call => call.init.method === 'DELETE');
  assert.ok(cleanup?.init.headers.Authorization === `Bearer ${oldToken}`);
  assert.ok(current.calls.every(call => call.init.headers.Authorization === `Bearer ${newToken}`));
  assert.ok(![...old.calls, ...current.calls].some(call => call.url.includes(oldToken) || call.url.includes(newToken)));
  current.receiver.stop();
});

test('a cross-origin session cannot receive viewer credentials or cleanup requests', async () => {
  const token = 'test-viewer-credential';
  const h = harness((url, init) => init.method === 'POST' ? Promise.resolve(new Response('v=0', {
    status: 201, headers: { Location: 'https://other.example/api/v1/webrtc/sessions/whep/other' },
  })) : null, null, { ...config, gatewayUrl: 'https://robot.example', viewerToken: token });
  h.receiver.start(); await flush(); assert.equal(h.latest.error, 'signalling');
  assert.ok(h.calls.every(call => new URL(call.url).origin === 'https://robot.example'));
  assert.ok(!h.calls.some(call => call.init.method === 'DELETE')); h.receiver.stop();
});

test('go2rtc 200 SDP without Location can play and releases its peer on stop', async () => {
  const h = harness((url, init) => init.method === 'POST' ? Promise.resolve(new Response('v=0\r\no=go2rtc', { status: 200 })) : null);
  h.receiver.start(); await flush(); const pc = h.peers[0];
  pc.connect(); pc.track(); pc.decoded = 1; await h.advance(500);
  assert.equal(pc.answer.type, 'answer'); assert.equal(h.latest.phase, 'receiving');
  h.receiver.stop(); assert.ok(pc.closed && pc.stream.track.stopped);
  assert.ok(!h.calls.some(call => call.init.method === 'DELETE'));
});

test('go2rtc 201 SDP without Location can play without a cleanup resource', async () => {
  const h = harness((url, init) => {
    if (!init.method) return new Response(JSON.stringify({ available: true, source_ready: true, backend: 'go2rtc', ice_servers: [], rotation_degrees: 0 }));
    if (init.method === 'POST') return new Response('v=0\r\no=go2rtc', { status: 201 });
    return null;
  });
  h.receiver.start(); await flush(); const pc = h.peers[0];
  pc.connect(); pc.track(); pc.decoded = 1; await h.advance(500);
  assert.equal(pc.answer.type, 'answer'); assert.equal(h.latest.phase, 'receiving');
  await h.receiver.stop(); assert.ok(pc.closed && pc.stream.track.stopped);
  assert.ok(!h.calls.some(call => call.init.method === 'DELETE'));
});

test('native WHEP 201 must provide a resource Location for explicit cleanup', async () => {
  const h = harness((url, init) => init.method === 'POST' ? Promise.resolve(new Response('v=0\r\no=native', { status: 201 })) : null);
  h.receiver.start(); await flush();
  assert.equal(h.latest.phase, 'error'); assert.ok(h.peers[0].closed); assert.equal(h.peers[0].answer, undefined); h.receiver.stop();
});

test('every native SDP operation has a deadline and late resolutions cannot revive its retired session', async () => {
  for (const method of ['createOffer', 'setLocalDescription', 'setRemoteDescription']) {
    const pending = deferred();
    let first = true;
    const h = harness(null, pc => { pc[method] = first ? () => pending.promise : () => new Promise(() => {}); first = false; });
    h.receiver.start(); await flush(); const old = h.peers[0];
    await h.advance(10000); assert.equal(h.latest.phase, 'error', method); assert.ok(old.closed, method);
    await h.advance(1000); assert.equal(h.peers.length, 2, method);
    const currentId = h.latest.id, calls = h.calls.length;
    pending.resolve(method === 'createOffer' ? { type: 'offer', sdp: 'v=0\r\no=late' } : undefined);
    await flush();
    assert.equal(h.latest.id, currentId, method); assert.equal(h.calls.length, calls, method);
    assert.ok(!h.snapshots.some(value => value.phase === 'receiving'), method); h.receiver.stop();
  }
});

test('stop cancels a pending native SDP stage and its timer', async () => {
  const pending = deferred();
  const h = harness(null, pc => { pc.createOffer = () => pending.promise; });
  h.receiver.start(); await flush(); h.receiver.stop(); await flush();
  assert.equal(h.timers.size, 0);
  pending.resolve({ type: 'offer', sdp: 'v=0\r\no=late' }); await h.advance(20000);
  assert.equal(h.peers.length, 1); assert.ok(!h.calls.some(call => call.init.method === 'POST'));
});

test('a frozen decoder withdraws its stream, closes tracks and retries with a new session id', async () => {
  const h = harness(); h.receiver.start(); await flush();
  const pc = h.peers[0]; pc.connect(); pc.track(); pc.decoded = 2; await h.advance(500);
  const id = h.latest.id;
  await h.advance(3000);
  assert.equal(h.latest.phase, 'stalled'); assert.equal(h.latest.error, 'frozen'); assert.equal(h.latest.stream, null);
  assert.ok(pc.closed && pc.stream.track.stopped && pc.stream.released);
  const deletion = h.calls.find(call => call.init.method === 'DELETE');
  assert.equal(deletion.init.headers['If-Match'], 'v1');
  await h.advance(1000);
  assert.equal(h.peers.length, 2); assert.notEqual(h.latest.id, id); assert.equal(h.latest.phase, 'connecting');
  h.receiver.stop();
});

test('transport connection without decoded video times out and cannot masquerade as a live feed', async () => {
  const h = harness(); h.receiver.start(); await flush(); h.peers[0].connect(); h.peers[0].track();
  await h.advance(3000);
  assert.equal(h.latest.phase, 'error'); assert.equal(h.latest.error, 'frozen');
  assert.ok(!h.snapshots.some(value => value.phase === 'receiving')); h.receiver.stop();
});

test('stopping during POST keeps bounded response cleanup but never publishes a late offer', async () => {
  const pending = deferred();
  const h = harness((url, init) => init.method === 'POST' ? pending.promise : null);
  h.receiver.start(); await flush(); const pc = h.peers[0];
  const post = h.calls.find(call => call.init.method === 'POST');
  h.receiver.stop(); assert.ok(pc.closed); assert.equal(post.init.signal.aborted, false);
  const length = h.snapshots.length;
  pending.resolve(new Response('v=0\r\no=remote', { status: 201, headers: { Location: '/api/v1/webrtc/sessions/whep/late' } }));
  await flush();
  assert.equal(h.snapshots.length, length); assert.equal(pc.answer, undefined);
  assert.ok(h.calls.some(call => call.init.method === 'DELETE' && call.url.endsWith('/late')));
  await h.advance(45000); assert.equal(h.peers.length, 1);
});

test('retired track and connection callbacks cannot update another device receiver', async () => {
  const h = harness(); h.receiver.start(); await flush();
  const pc = h.peers[0], lateTrack = pc.listeners.get('track'), lateConnection = pc.listeners.get('connectionstatechange');
  h.receiver.stop(); const length = h.snapshots.length;
  lateTrack({ track: { kind: 'video' }, streams: [] }); pc.connectionState = 'connected'; lateConnection();
  assert.equal(h.snapshots.length, length); assert.equal(pc.listeners.size, 0);
});

test('cross-origin or non-session Location is rejected without requesting that location', async () => {
  for (const location of ['https://evil.example/session', '/admin/delete', '/api/v1/webrtc/sessions/%2e%2e/admin']) {
    const h = harness((url, init) => init.method === 'POST' ? Promise.resolve(new Response('v=0', { status: 201, headers: { Location: location } })) : null);
    h.receiver.start(); await flush();
    assert.equal(h.latest.phase, 'error'); assert.ok(h.peers[0].closed);
    assert.ok(!h.calls.some(call => call.init.method === 'DELETE')); h.receiver.stop();
  }
});

test('source not ready retries at a bounded backoff without opening a peer', async () => {
  const h = harness((url, init) => !init.method ? Promise.resolve(new Response(JSON.stringify({ available: true, source_ready: false }))) : null);
  h.receiver.start(); await flush(); assert.equal(h.latest.error, 'unavailable'); assert.equal(h.peers.length, 0);
  await h.advance(1000); assert.equal(h.calls.length, 2);
  await h.advance(1999); assert.equal(h.calls.length, 2);
  h.receiver.stop(); await h.advance(20000); assert.equal(h.calls.length, 2);
});

test('a nonresponding POST is aborted at the WHEP budget and can retry', async () => {
  const h = harness((url, init) => init.method === 'POST' ? new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) : null);
  h.receiver.start(); await flush();
  await h.advance(39999); assert.equal(h.latest.phase, 'connecting');
  await h.advance(1); assert.equal(h.latest.phase, 'error'); assert.ok(h.peers[0].closed);
  await h.advance(1000); assert.equal(h.peers.length, 2); h.receiver.stop();
  await h.advance(40000); assert.equal(h.peers.length, 2);
});

test('hanging statistics cannot indefinitely preserve the last live image', async () => {
  const h = harness(); h.receiver.start(); await flush(); const pc = h.peers[0];
  pc.connect(); pc.track(); pc.decoded = 1; await h.advance(500); assert.equal(h.latest.phase, 'receiving');
  pc.getStats = () => new Promise(() => {});
  await h.advance(3000); assert.equal(h.latest.phase, 'stalled'); assert.equal(h.latest.stream, null); h.receiver.stop();
});

test('a negotiated peer that never connects has a bounded transport startup', async () => {
  const h = harness(); h.receiver.start(); await flush(); await h.advance(10000);
  assert.equal(h.latest.error, 'connection'); assert.ok(h.peers[0].closed); h.receiver.stop();
});

test('the browser adapter calls global timers without binding the runtime as their receiver', () => {
  const result = { exports: {} };
  const callback = () => {};
  const browser = {
    setTimeout(fn, milliseconds) { assert.equal(this, undefined); assert.equal(fn, callback); assert.equal(milliseconds, 5000); return 123; },
    clearTimeout(handle) { assert.equal(this, undefined); assert.equal(handle, 123); },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/video/whepPlatform.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: result, exports: result.exports, require: () => ({}), window: browser,
    setTimeout: browser.setTimeout, clearTimeout: browser.clearTimeout, RTCPeerConnection: class {}, performance: { now: () => 0 } });
  const runtime = result.exports.videoRuntime();
  const timer = runtime.setTimeout(callback, 5000);
  assert.equal(timer, 123);
  runtime.clearTimeout(timer);
});

test('the native adapter uses strict Expo fetch and safely handles an older binary', () => {
  const native = readFileSync(new URL('../src/features/video/whepPlatform.native.tsx', import.meta.url), 'utf8');
  assert.match(native, /fetch as expoFetch.*expo\/fetch/);
  assert.match(native, /if \(!NativeModules\.WebRTCModule\) return null/);
  assert.doesNotMatch(native, /getUserMedia|registerGlobals|mediaDevices/);
  const nativeModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(native, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: nativeModule, exports: nativeModule.exports,
    require: name => {
      if (name === 'react') return {};
      if (name === 'expo/fetch') return { fetch };
      if (name === 'react-native') return { NativeModules: {}, StyleSheet: {} };
      throw new Error('An older binary must not import the missing RTC module');
    },
  });
  assert.equal(nativeModule.exports.videoRuntime(), null);
});

function hookHarness() {
  const slots = [], managers = [], listeners = new Set();
  let cursor = 0, pending = [], result;
  const hookModule = { exports: {} };
  const react = {
    createElement: (type, props) => ({ type, props }),
    useState(value) { const slot = cursor++; slots[slot] ??= { value }; return [slots[slot].value, next => { slots[slot].value = typeof next === 'function' ? next(slots[slot].value) : next; }]; },
    useRef(value) { const slot = cursor++; return slots[slot] ??= { current: value }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((value, i) => !Object.is(value, slots[slot].deps[i]))) pending.push(() => {
        slots[slot]?.cleanup?.(); slots[slot] = { deps, cleanup: fn() };
      });
    },
  };
  class Manager {
    constructor(config, runtime, publish) { this.config = config; this.publish = publish; this.stops = 0; managers.push(this); }
    start() { this.publish({ id: 'session-' + managers.length, phase: 'connecting', stream: null, rotation: 0, error: null }); }
    stop() { this.stops++; }
    frame() { this.publish({ id: 'session-' + managers.indexOf(this), phase: 'receiving', stream: { fake: true }, rotation: 0, error: null }); }
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/video/useControlVideoReceiver.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: hookModule, exports: hookModule.exports, require: name => ({
    react,
    'react-native': { AppState: { currentState: 'active', addEventListener(event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } } },
    './whepPlatform': { videoRuntime: () => ({}), VideoPlayer: 'VideoPlayer' },
    './whepReceiver': { WhepReceiver: Manager, videoOrigin },
  })[name] });
  let currentConfig = config, active = true;
  function render(changes = {}, effects = true) {
    if ('config' in changes) currentConfig = changes.config;
    if ('active' in changes) active = changes.active;
    cursor = 0; pending = []; result = hookModule.exports.useControlVideoReceiver(currentConfig, active);
    if (effects) { const work = pending; pending = []; work.forEach(fn => fn()); }
    return result;
  }
  return { render, managers, appState: state => listeners.forEach(fn => fn(state)), unmount: () => slots.forEach(slot => slot?.cleanup?.()), get result() { return result; } };
}

test('switching devices hides the old surface before effects and ignores retired callbacks', () => {
  const h = hookHarness(); h.render(); h.managers[0].frame(); assert.ok(h.render().surface);
  const old = h.managers[0];
  assert.equal(h.render({ config: { ...config, deviceId: 'robot-b' } }, false).surface, null);
  old.frame();
  assert.equal(h.render().surface, null);
  assert.equal(old.stops, 1); assert.equal(h.managers.length, 2);
  h.managers[1].frame(); assert.ok(h.render().surface); h.unmount();
});

test('background immediately stops media and foreground never briefly remounts old frames', () => {
  const h = hookHarness(); h.render(); h.managers[0].frame(); assert.ok(h.render().surface);
  h.appState('background'); assert.equal(h.managers[0].stops, 1); assert.equal(h.render().surface, null);
  h.appState('active'); assert.equal(h.render({}, false).surface, null);
  h.render(); assert.equal(h.managers.length, 2); assert.equal(h.render().presentation.phase, 'connecting'); h.unmount();
});

test('leaving control and manual retry invalidate the prior presentation before cleanup', () => {
  const h = hookHarness(); h.render(); h.managers[0].frame(); assert.ok(h.render().surface);
  assert.equal(h.render({ active: false }).surface, null);
  assert.equal(h.render({ active: true }, false).surface, null); h.render();
  h.managers.at(-1).frame(); assert.ok(h.render().surface);
  h.result.reconnect(); assert.equal(h.render({}, false).surface, null); h.render(); h.unmount();
});

test('changing a viewer credential retires the old frame without putting it in the identity key', () => {
  const source = readFileSync(new URL('../src/features/video/useControlVideoReceiver.tsx', import.meta.url), 'utf8');
  const key = source.split('\n').find(line => line.includes('const key ='));
  const selection = source.split('\n').find(line => line.includes('const selection ='));
  assert.ok(!key.includes('viewerToken') && !selection.includes('viewerToken'));
  const first = { ...config, gatewayUrl: 'https://robot.example', viewerToken: 'first-credential' };
  const h = hookHarness(); h.render({ config: first }); h.managers[0].frame(); assert.ok(h.render().surface);
  assert.equal(h.render({ config: { ...first, viewerToken: 'second-credential' } }, false).surface, null);
  h.render(); assert.equal(h.managers.length, 2); assert.equal(h.managers[0].stops, 1);
  h.unmount();
});

test('the presentation exposes a bounded authorization error without including the viewer credential', () => {
  const token = 'test-viewer-credential';
  const h = hookHarness(); h.render({ config: { ...config, gatewayUrl: 'https://robot.example', viewerToken: token } });
  h.managers[0].publish({ id: 'auth-session', phase: 'error', stream: null, rotation: 0, error: 'authorization' });
  const result = h.render();
  assert.equal(result.presentation.error, 'authorization'); assert.equal(result.presentation.phase, 'error');
  assert.equal(result.surface, null); assert.ok(!JSON.stringify(result.presentation).includes(token)); h.unmount();
});

test('foregrounding cannot retry rejected viewer credentials without an explicit retry or credential change', () => {
  const token = 'test-viewer-credential';
  const selected = { ...config, gatewayUrl: 'https://robot.example', viewerToken: token };
  const h = hookHarness(); h.render({ config: selected });
  h.managers[0].publish({ id: 'auth-session', phase: 'error', stream: null, rotation: 0, error: 'authorization' });
  h.render(); h.appState('background'); h.render(); h.appState('active'); h.render();
  assert.equal(h.managers.length, 1); assert.equal(h.render().presentation.error, 'authorization');
  h.result.reconnect(); h.render(); assert.equal(h.managers.length, 2);
  h.managers[1].publish({ id: 'auth-session-2', phase: 'error', stream: null, rotation: 0, error: 'authorization' }); h.render();
  h.render({ config: { ...selected, viewerToken: 'replacement-credential' } });
  assert.equal(h.managers.length, 3); h.unmount();
});
