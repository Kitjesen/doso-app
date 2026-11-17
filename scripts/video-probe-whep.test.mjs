import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module,
    exports: module.exports,
    URL,
    AbortController,
    require: name => {
      if (name === './videoProbeUrl') return urls;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return module.exports;
}

const urls = load('../src/features/control/videoProbeUrl.ts');
const session = load('../src/features/control/whepVideoSession.ts');

function response(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => typeof body === 'string' ? JSON.parse(body) : body,
  };
}

function harness(handler, options = {}) {
  let now = 0;
  const timers = [];
  const peers = [];
  const calls = [];
  const views = [];
  const runtime = {
    createPeerConnection(configuration) {
      const peer = {
        configuration,
        iceGatheringState: 'new',
        connectionState: 'new',
        iceConnectionState: 'new',
        localDescription: null,
        remoteDescription: null,
        transceivers: [],
        listeners: {},
        closed: false,
        addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
        removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] ?? []).filter(item => item !== listener); },
        emit(type, event) { for (const listener of [...(this.listeners[type] ?? [])]) listener(event); },
        addTransceiver(kind, init) { this.transceivers.push({ kind, init }); },
        addTrack() { throw new Error('senders are forbidden'); },
        async createOffer() { return { type: 'offer', sdp: 'v=0\r\noffer' }; },
        async setLocalDescription(description) {
          this.localDescription = description;
          if (options.holdIce && peers.length === 1) return;
          this.iceGatheringState = 'complete';
          this.emit('icegatheringstatechange');
        },
        async setRemoteDescription(description) { this.remoteDescription = description; },
        getReceivers() { return []; },
        close() { this.closed = true; this.connectionState = 'closed'; },
      };
      peers.push(peer);
      return peer;
    },
    async fetch(input, init) {
      calls.push({ url: String(input), init });
      return handler({ url: String(input), init, calls });
    },
    setTimeout(callback, delay) {
      const timer = { due: now + delay, callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
  };
  const probe = session.startVideoProbe({
    baseUrl: 'http://192.168.8.40:5050',
    runtime,
    onView: view => views.push(view),
    ...options.probe,
  });
  return {
    peers, calls, views, probe, runtime,
    advance(ms) {
      now += ms;
      for (const timer of [...timers]) {
        if (!timer.cleared && timer.due <= now && !timer.fired) {
          timer.fired = true;
          timer.callback();
        }
      }
    },
  };
}

async function settle(probe) {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await probe.settled();
}

test('probe URL uses the Brainstem host and the video port only for private IPv4', () => {
  assert.equal(urls.videoProbeBaseUrl('192.168.8.40'), 'http://192.168.8.40:5050');
  assert.equal(urls.videoProbeBaseUrl(' 10.1.2.3 '), 'http://10.1.2.3:5050');
  assert.equal(urls.videoProbeBaseUrl('172.16.5.5'), 'http://172.16.5.5:5050');
  for (const host of [null, '', '172.32.0.1', '8.8.8.8', 'robot.example', '192.168.8.40:13145', '::1', '[fe80::1]']) {
    assert.equal(urls.videoProbeBaseUrl(host), null, String(host));
  }
  assert.equal(urls.isVideoProbeBaseUrl('http://192.168.8.40:5050'), true);
  assert.equal(urls.isVideoProbeBaseUrl('http://192.168.8.40:13145'), false);
  assert.equal(urls.isVideoProbeBaseUrl('https://192.168.8.40:5050'), false);
  assert.equal(urls.VIDEO_PROBE_PORT, 5050);
});

test('a recvonly offer becomes live only after the answer, the peer, and a track', async () => {
  const env = harness(({ url, init }) => {
    if (url.endsWith('/api/v1/webrtc/status')) {
      return response(200, {
        available: true,
        ice_servers: [{ urls: 'stun:192.168.8.40:3478', username: 'viewer', credential: 'secret' }],
        rotation_degrees: 90,
      });
    }
    if (url.includes('/api/v1/webrtc/whep')) return response(201, 'v=answer\r\n', { location: 'sessions/7', etag: '"tag-1"' });
    if (init?.method === 'DELETE') return response(200, '');
    throw new Error(`unexpected ${url}`);
  });
  await settle(env.probe);
  assert.equal(env.peers.length, 1);
  assert.equal(env.peers[0].transceivers.length, 1);
  assert.equal(env.peers[0].transceivers[0].kind, 'video');
  assert.equal(env.peers[0].transceivers[0].init.direction, 'recvonly');
  assert.equal(JSON.stringify(env.peers[0].configuration.iceServers), JSON.stringify([{ urls: 'stun:192.168.8.40:3478', username: 'viewer', credential: 'secret' }]));
  const post = env.calls.find(call => call.init?.method === 'POST');
  assert.equal(post.url, 'http://192.168.8.40:5050/api/v1/webrtc/whep?src=cam');
  assert.equal(post.init.headers['Content-Type'], 'application/sdp');
  assert.equal(post.init.body, 'v=0\r\noffer');
  assert.equal(env.peers[0].remoteDescription.sdp, 'v=answer');
  assert.equal(env.views.at(-1).phase, 'connecting');
  env.peers[0].emit('track', { streams: [{ toURL: () => 'stream://camera' }] });
  assert.equal(env.views.at(-1).phase, 'connecting');
  env.peers[0].connectionState = 'connected';
  env.peers[0].emit('connectionstatechange');
  const live = env.views.at(-1);
  assert.equal(live.phase, 'receiving');
  assert.equal(live.stream.toURL(), 'stream://camera');
  assert.equal(live.rotationDegrees, 90);
  await env.probe.stop();
  const deleted = env.calls.find(call => call.init?.method === 'DELETE');
  assert.equal(deleted.url, 'http://192.168.8.40:5050/api/v1/webrtc/sessions/7');
  assert.equal(deleted.init.headers['If-Match'], '"tag-1"');
  assert.equal(env.peers[0].closed, true);
});

test('ICE can connect before the track and still stays dark until both arrive', async () => {
  const env = harness(({ url }) => url.endsWith('/status')
    ? response(200, { available: true, ice_servers: [] })
    : response(200, 'v=answer'));
  await settle(env.probe);
  env.peers[0].iceConnectionState = 'completed';
  env.peers[0].emit('iceconnectionstatechange');
  assert.equal(env.views.at(-1).phase, 'connecting');
  env.peers[0].emit('track', { streams: [{ toURL: () => 'stream://late' }] });
  assert.equal(env.views.at(-1).phase, 'receiving');
});

test('unavailable status and signalling failures back off without opening a sender', async () => {
  let available = false;
  const env = harness(({ url }) => url.endsWith('/status')
    ? response(available ? 200 : 503, available ? { available: true } : { available: false })
    : response(500, ''), { probe: { retryMinMs: 1000, retryMaxMs: 8000 } });
  await settle(env.probe);
  assert.equal(env.peers.length, 0);
  assert.equal(env.views.at(-1).phase, 'error');
  env.advance(999);
  await settle(env.probe);
  assert.equal(env.calls.filter(call => call.url.endsWith('/status')).length, 1);
  available = true;
  env.advance(1);
  await settle(env.probe);
  assert.equal(env.peers.length, 1);
  assert.equal(env.peers[0].transceivers.length, 1);
});

test('the offer waits out ICE gathering and a dropped live session reconnects as stalled', async () => {
  let posts = 0;
  const env = harness(({ url }) => {
    if (url.endsWith('/status')) return response(200, { available: true, rotation_degrees: Number.NaN });
    posts += 1;
    return response(posts === 1 ? 200 : 503, posts === 1 ? 'v=answer' : '');
  }, { holdIce: true, probe: { iceGatheringTimeoutMs: 35000, postTimeoutMs: 40000, retryMinMs: 1000, retryMaxMs: 1000 } });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.equal(env.calls.some(call => call.init?.method === 'POST'), false);
  env.advance(34999);
  await Promise.resolve();
  assert.equal(env.calls.some(call => call.init?.method === 'POST'), false);
  env.peers[0].iceGatheringState = 'complete';
  env.peers[0].localDescription = { type: 'offer', sdp: 'v=0\r\nheld' };
  env.peers[0].emit('icegatheringstatechange');
  await settle(env.probe);
  assert.equal(env.calls.find(call => call.init?.method === 'POST').init.body, 'v=0\r\nheld');
  env.peers[0].connectionState = 'connected';
  env.peers[0].emit('connectionstatechange');
  env.peers[0].emit('track', { streams: [{ toURL: () => 'stream://1' }] });
  assert.equal(env.views.at(-1).phase, 'receiving');
  assert.equal(env.views.at(-1).rotationDegrees, 0);
  env.peers[0].connectionState = 'failed';
  env.peers[0].emit('connectionstatechange');
  assert.equal(env.views.at(-1).phase, 'stalled');
  assert.equal(env.views.at(-1).stream, null);
  env.advance(1000);
  await settle(env.probe);
  assert.equal(env.peers.length, 2);
  assert.equal(env.views.at(-1).phase, 'error');
  assert.notEqual(env.views.at(-1).id, env.views.find(view => view.phase === 'receiving').id);
});

test('viewer token is sent on status, offer, and delete, and a foreign session URL is not followed', async () => {
  const env = harness(({ url, init }) => {
    if (url.endsWith('/status')) return response(200, { available: true });
    if (init?.method === 'POST') return response(201, 'v=answer', { location: 'http://192.168.9.9:5050/sessions/1', etag: 'W/"1"' });
    return response(200, '');
  }, { probe: { authorization: async () => ' viewer-token ' } });
  await settle(env.probe);
  assert.equal(env.calls[0].init.headers.Authorization, 'Bearer viewer-token');
  assert.equal(env.calls[1].init.headers.Authorization, 'Bearer viewer-token');
  await env.probe.stop();
  assert.equal(env.calls.some(call => call.init?.method === 'DELETE'), false);
});

test('a relative session Location on the probe host is deleted with If-Match', async () => {
  const env = harness(({ url, init }) => {
    if (url.endsWith('/status')) return response(200, { available: true });
    if (init?.method === 'POST') return response(201, 'v=answer', { location: '/api/v1/webrtc/sessions/9' });
    return response(200, '');
  });
  await settle(env.probe);
  await env.probe.stop();
  const deleted = env.calls.find(call => call.init?.method === 'DELETE');
  assert.equal(deleted.url, 'http://192.168.8.40:5050/api/v1/webrtc/sessions/9');
  assert.equal(deleted.init.headers?.['If-Match'], undefined);
});

test('an address outside the video probe is not requested', async () => {
  const calls = [];
  const probe = session.startVideoProbe({
    baseUrl: 'http://192.168.8.40:13145',
    runtime: { fetch: async () => { calls.push('fetch'); }, createPeerConnection() { throw new Error('no peer'); }, setTimeout() {}, clearTimeout() {} },
    onView: view => calls.push(view.phase),
  });
  await settle(probe);
  assert.deepEqual(calls, ['error']);
  await probe.stop();
});

test('client source stays receive-only and does not embed another service address', () => {
  const files = [
    '../src/features/control/videoProbeUrl.ts',
    '../src/features/control/whepVideoSession.ts',
    '../src/features/control/videoProbeAccess.ts',
    '../src/features/control/videoProbeRtc.ts',
    '../src/features/control/videoProbeRtc.native.ts',
    '../src/features/control/useControlRobotVideo.tsx',
    '../src/features/control/RobotVideoFrame.tsx',
    '../src/features/control/RobotVideoFrame.native.tsx',
    '../plugins/withReceiveOnlyWebRtc.js',
  ];
  const source = files.map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  assert.equal(session.VIDEO_PROBE_ICE_GATHERING_BUDGET_MS, 35000);
  assert.equal(session.VIDEO_PROBE_POST_BUDGET_MS, 40000);
  assert.doesNotMatch(source, /5052|getUserMedia|addTrack|createDataChannel|EXPO_PUBLIC_|192\.168\.66\.64|Broker|Gateway|rssi|RSSI/);
  assert.match(readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), /videoProbeHost=\{controlTarget === 'direct' \? directEndpoint\?\.host \?\? null : null\}/);
  assert.match(readFileSync(new URL('../src/screens/DeviceTestScreen.tsx', import.meta.url), 'utf8'), /videoProbeHost=\{endpoint\?\.host \?\? null\}/);
  assert.match(readFileSync(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8'), /useControlRobotVideo\(\{[\s\S]*host: videoProbeHost \?\? null/);
  assert.doesNotMatch(readFileSync(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8'), /fetch\(/);
  const plugin = readFileSync(new URL('../plugins/withReceiveOnlyWebRtc.js', import.meta.url), 'utf8');
  assert.match(plugin, /NSAllowsLocalNetworking = true/);
  assert.match(plugin, /CHANGE_NETWORK_STATE/);
  assert.doesNotMatch(plugin, /NSAllowsArbitraryLoads|android\.permission\.CAMERA|android\.permission\.RECORD_AUDIO/);
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(manifest, /android\.permission\.CHANGE_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.CAMERA" tools:node="remove"/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO" tools:node="remove"/);
  assert.match(readFileSync(new URL('../app.json', import.meta.url), 'utf8'), /plugins\/withReceiveOnlyWebRtc/);
  assert.match(readFileSync(new URL('../src/features/control/videoProbeAccess.ts', import.meta.url), 'utf8'), /doso\.video-probe\.viewer-token/);
});
