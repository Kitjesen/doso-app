import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadModules() {
  const whepMod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL('../src/features/video/whepReceiver.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { module: whepMod, exports: whepMod.exports, URL, AbortController, setTimeout, clearTimeout },
  );

  const simMod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL('../src/features/video/devLoopbackSimVideo.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module: simMod,
      exports: simMod.exports,
      __DEV__: true,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      require: (name) => {
        if (name === './whepReceiver') return whepMod.exports;
        throw new Error(`Unexpected dependency: ${name}`);
      },
    },
  );
  return { ...simMod.exports, ...whepMod.exports };
}

const { LoopbackSimVideoReceiver, isDevLoopbackSimVideoConfig } = loadModules();

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

function createFakeRuntime(fetchHandler) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  let closedCount = 0;

  const runtime = {
    now: () => now,
    setTimeout(callback, ms) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fetch: fetchHandler,
    async decodeFrame(blob) {
      const size = blob?.size ?? 10;
      return {
        source: { byteLength: size },
        width: 640,
        height: 360,
        close() {
          closedCount += 1;
        },
      };
    },
  };

  async function advance(ms) {
    const target = now + ms;
    while (true) {
      await flush();
      const next = [...timers.entries()]
        .filter(([, item]) => item.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = target;
    await flush();
  }

  return {
    runtime,
    timers,
    advance,
    get closedCount() {
      return closedCount;
    },
  };
}

test('eligibility gate strictly permits only __DEV__ loopback HTTP without viewerToken', () => {
  assert.equal(
    isDevLoopbackSimVideoConfig({ deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: true }, true),
    true,
  );
  assert.equal(
    isDevLoopbackSimVideoConfig({ deviceId: 'sim', gatewayUrl: 'http://localhost:5050', allowLocalHttp: true }, true),
    true,
  );
  for (const [cfg, dev] of [
    [{ deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: true }, false],
    [{ deviceId: 'sim', gatewayUrl: 'http://192.168.66.64:5050', allowLocalHttp: true }, true],
    [{ deviceId: 'sim', gatewayUrl: 'https://127.0.0.1:5050', allowLocalHttp: true }, true],
    [{ deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: false }, true],
    [{ deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', viewerToken: 'tok', allowLocalHttp: true }, true],
  ]) {
    assert.equal(isDevLoopbackSimVideoConfig(cfg, dev), false);
    assert.throws(() => new LoopbackSimVideoReceiver(cfg, {
      fetch: globalThis.fetch,
      now: () => 0,
      setTimeout,
      clearTimeout,
      decodeFrame: async () => ({ source: null, width: 1, height: 1 }),
    }, () => { }, { isDev: dev }));
  }
});

test('real local WHEP gateway takes precedence over simulation frame fallback', async () => {
  const snapshots = [];
  let whepStarted = 0;
  let whepStopped = 0;
  const h = createFakeRuntime(async (url) => {
    if (String(url).endsWith('/api/v1/webrtc/status')) {
      return new Response(JSON.stringify({ available: true, source_ready: true }), { status: 200 });
    }
    throw new Error(`Should not request sim video when WHEP is available: ${url}`);
  });
  h.runtime.createWhepReceiver = (_config, publish) => ({
    start() {
      whepStarted += 1;
      publish({ id: 'whep-1', phase: 'receiving', stream: { getTracks: () => [] }, rotation: 0, error: null });
    },
    async stop() {
      whepStopped += 1;
      return true;
    },
  });

  const receiver = new LoopbackSimVideoReceiver(
    { deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: true },
    h.runtime,
    (snap) => snapshots.push(snap),
    { isDev: true },
  );
  receiver.start();
  await flush();
  assert.equal(whepStarted, 1);
  assert.equal(snapshots.at(-1).id, 'whep-1');
  assert.equal(snapshots.at(-1).phase, 'receiving');
  assert.equal(await receiver.stop(), true);
  assert.equal(whepStopped, 1);
  assert.equal(h.timers.size, 0);
});

test('loopback sim receiver advances only on strictly increasing frame seq, detects 3000ms freeze, and stops cleanly', async () => {
  let seq = 0;
  const snapshots = [];
  const calls = [];
  const h = createFakeRuntime(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/v1/webrtc/status')) {
      return new Response(JSON.stringify({ available: false }), { status: 404 });
    }
    if (String(url).endsWith('/api/v1/sim/video/status')) {
      return new Response(JSON.stringify({ ok: true, simulation: true, available: true, source_ready: true }), { status: 200 });
    }
    if (String(url).includes('/api/v1/sim/video/frame.jpg')) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'X-Doso-Frame-Seq': String(seq) },
      });
    }
    return new Response(null, { status: 404 });
  });

  const receiver = new LoopbackSimVideoReceiver(
    { deviceId: 'sim', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: true },
    h.runtime,
    (snap) => snapshots.push(snap),
    { isDev: true, pollIntervalMs: 50, freezeTimeoutMs: 3000 },
  );

  // seq stays 0 (not positive) initially -> must remain connecting, never receiving
  receiver.start();
  await flush();
  assert.equal(snapshots[0].phase, 'connecting');
  assert.equal(snapshots.some((s) => s.phase === 'receiving'), false);

  // Advance seq -> receiving!
  seq = 1;
  await h.advance(50);
  assert.equal(snapshots.at(-1).phase, 'receiving');
  assert.equal(snapshots.at(-1).stream.kind, 'doso-dev-sim-canvas');
  assert.equal(snapshots.at(-1).stream.getLatestFrame().width, 640);

  // Frame seq 2 closes previous decoded frame
  seq = 2;
  await h.advance(50);
  assert.equal(h.closedCount, 1);

  // Freeze at seq = 2 for >= 3000ms -> emits stalled/frozen with stream: null
  await h.advance(3050);
  const frozenSnap = snapshots.find((s) => s.phase === 'stalled');
  assert.ok(frozenSnap, 'must emit stalled when frame_seq stops advancing');
  assert.equal(frozenSnap.error, 'frozen');
  assert.equal(frozenSnap.stream, null);

  assert.ok(calls.every((c) => c.init.credentials === 'omit' && c.init.redirect === 'error'));
  assert.equal(await receiver.stop(), true);
  assert.equal(h.timers.size, 0, 'all timers must be cleared on stop()');
});

test('loopback sim receiver appends cam query only when cameraId is provided', async () => {
  const urls = [];
  const h = createFakeRuntime(async (url) => {
    const text = String(url);
    urls.push(text);
    if (text.endsWith('/api/v1/webrtc/status')) {
      return new Response(JSON.stringify({ available: false }), { status: 404 });
    }
    if (text.endsWith('/api/v1/sim/video/status')) {
      return new Response(JSON.stringify({ ok: true, simulation: true, available: true, source_ready: true }), { status: 200 });
    }
    if (text.includes('/api/v1/sim/video/frame.jpg')) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'X-Doso-Frame-Seq': '1' },
      });
    }
    return new Response(null, { status: 404 });
  });

  const rearReceiver = new LoopbackSimVideoReceiver(
    { deviceId: 'sim:rear', gatewayUrl: 'http://127.0.0.1:5050', allowLocalHttp: true, cameraId: 'rear' },
    h.runtime,
    () => {},
    { isDev: true, pollIntervalMs: 50 },
  );
  rearReceiver.start();
  await h.advance(50);
  await rearReceiver.stop();

  const frameCalls = urls.filter((u) => u.includes('/api/v1/sim/video/frame.jpg'));
  assert.ok(frameCalls.length >= 1);
  assert.ok(frameCalls.every((u) => u.includes('&cam=rear')));
});

