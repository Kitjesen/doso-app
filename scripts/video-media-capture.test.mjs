import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function transpileTs(path, mocks = {}, extraGlobals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected require in ${path}: ${name}`);
    },
    Blob,
    Date,
    Math,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraGlobals,
  }, { filename: path });
  return module.exports;
}

const model = transpileTs('../src/features/video/controlMediaModel.ts');
const captureMod = transpileTs('../src/features/video/controlMediaCapture.ts', {
  './controlMediaModel.ts': model,
});

function createWebHarness({ supportedMime = 'video/mp4;codecs=avc1.42E01E', emptyBlobOnStop = false } = {}) {
  const createdLinks = [];
  const createdCanvases = [];
  const recorders = [];
  const revokedUrls = [];
  const mockVideos = [];
  let urlSeq = 0;
  let clockMs = 1_000;

  function makeCanvas() {
    const drawCalls = [];
    const rotCalls = [];
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      setTransform() {},
      clearRect() {},
      save() {},
      restore() {},
      rotate(rad) { rotCalls.push(rad); },
      drawImage(src, x, y, w, h) { drawCalls.push({ src, x, y, w, h }); },
    };
    const capturedTracks = [{ stopped: false, stop() { this.stopped = true; } }];
    const canvas = {
      width: 0,
      height: 0,
      drawCalls,
      rotCalls,
      capturedTracks,
      getContext(kind) { return kind === '2d' ? ctx : null; },
      toBlob(cb, mime, quality) {
        cb(new Blob([`jpeg:${canvas.width}x${canvas.height}:q${quality}`], { type: mime }));
      },
      captureStream(fps) {
        canvas.capturedFps = fps;
        return { kind: 'canvas-stream', getTracks: () => capturedTracks };
      },
    };
    createdCanvases.push(canvas);
    return canvas;
  }

  class FakeMediaRecorder {
    static isTypeSupported(mime) {
      return mime === supportedMime;
    }
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || supportedMime || 'video/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      this.startedTimeslice = null;
      recorders.push(this);
    }
    start(timeslice) {
      this.state = 'recording';
      this.startedTimeslice = timeslice;
    }
    stop() {
      this.state = 'inactive';
      if (!emptyBlobOnStop) {
        this.ondataavailable?.({ data: new Blob(['chunk-1-mp4-data'], { type: this.mimeType }) });
      }
      this.onstop?.();
    }
  }

  class FakeMediaStream {
    constructor(tracks) {
      this.tracks = tracks;
    }
    getVideoTracks() {
      return this.tracks;
    }
  }

  const fakeDoc = {
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement(tag) {
      if (tag === 'canvas') return makeCanvas();
      if (tag === 'a') {
        const link = {
          download: '',
          href: '',
          style: {},
          clicked: false,
          click() { this.clicked = true; },
        };
        createdLinks.push(link);
        return link;
      }
      if (tag === 'video') {
        const video = {
          muted: false,
          playsInline: false,
          autoplay: false,
          srcObject: null,
          videoWidth: 1280,
          videoHeight: 720,
          play: async () => {},
          pause() {},
          addEventListener() {},
          removeEventListener() {},
        };
        mockVideos.push(video);
        return video;
      }
      throw new Error(`Unexpected tag: ${tag}`);
    },
    querySelectorAll(selector) {
      if (selector === 'video') return mockVideos;
      return [];
    },
  };

  const adapter = captureMod.createWebControlMediaCaptureAdapter({
    document: fakeDoc,
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeMediaStream,
    createObjectURL: () => `blob:doso/${++urlSeq}`,
    revokeObjectURL: (url) => revokedUrls.push(url),
    now: () => {
      clockMs += 1500;
      return clockMs;
    },
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  });

  return { adapter, createdLinks, createdCanvases, recorders, revokedUrls, mockVideos };
}

test('controlMediaModel formats timestamps, filenames, rotations, and durations consistently', () => {
  const at = new Date(2026, 10, 21, 3, 4, 5);
  assert.equal(model.buildSnapshotFileName('front', at), 'DOSO_SNAP_20261121_030405_front.jpg');
  assert.equal(model.buildRecordingFileName('rear', 'mp4', at), 'DOSO_REC_20261121_030405_rear.mp4');
  assert.equal(model.buildRecordingFileName('front', 'webm', at), 'DOSO_REC_20261121_030405_front.webm');
  assert.equal(model.normalizeMediaRotation(-90), 270);
  assert.equal(model.normalizeMediaRotation(180), 180);
  assert.equal(model.normalizeMediaRotation(45), 0);
  assert.equal(model.formatMediaDuration(0), '00:00');
  assert.equal(model.formatMediaDuration(65), '01:05');
});

test('web capture exports rotated 1080p MuJoCo simulation JPEG snapshots to downloads', async () => {
  const h = createWebHarness();
  const frameSource = { id: 'sim-bitmap-1' };
  const simStream = {
    kind: 'doso-dev-sim-canvas',
    getLatestFrame: () => ({ source: frameSource, width: 1920, height: 1080 }),
    subscribe: () => () => {},
  };

  const result = await h.adapter.capturePhoto({
    camera: 'front',
    stream: simStream,
    rotation: 90,
    now: new Date(2026, 10, 21, 9, 8, 7),
  });

  assert.equal(result.fileName, 'DOSO_SNAP_20261121_090807_front.jpg');
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.ok(result.bytes > 0);
  assert.equal(result.locationLabel, '浏览器下载目录');
  assert.equal(h.createdLinks[0].download, 'DOSO_SNAP_20261121_090807_front.jpg');
  assert.equal(h.createdLinks[0].clicked, true);
  assert.equal(h.revokedUrls.length, 1);
  assert.equal(h.createdCanvases[0].rotCalls.length, 1);
});

test('web capture records MuJoCo simulation stream to MP4/WebM and cleans up canvas tracks on stop or cancel', async () => {
  const h = createWebHarness({ supportedMime: 'video/mp4;codecs=avc1.42E01E' });
  const listeners = new Set();
  let frame = { source: { frame: 1 }, width: 1920, height: 1080 };
  const simStream = {
    kind: 'doso-dev-sim-canvas',
    getLatestFrame: () => frame,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  const session = await h.adapter.startRecording({
    camera: 'rear',
    stream: simStream,
    rotation: 0,
    now: new Date(2026, 10, 21, 10, 0, 0),
  });
  assert.equal(session.fileName, 'DOSO_REC_20261121_100000_rear.mp4');
  assert.equal(h.createdCanvases[0].capturedFps, 22);
  assert.equal(listeners.size, 1);

  frame = { source: { frame: 2 }, width: 1920, height: 1080 };
  for (const fn of listeners) fn();
  assert.equal(h.createdCanvases[0].drawCalls.length, 2);

  const saved = await session.stop();
  assert.equal(saved.fileName, 'DOSO_REC_20261121_100000_rear.mp4');
  assert.equal(saved.durationMs, 1500);
  assert.ok(saved.bytes > 0);
  assert.equal(listeners.size, 0);
  assert.equal(h.createdCanvases[0].capturedTracks[0].stopped, true);
  assert.equal(h.createdLinks.at(-1).download, 'DOSO_REC_20261121_100000_rear.mp4');

  // Cancel discards chunks and suppresses file download.
  const cancelledSession = await h.adapter.startRecording({ camera: 'front', stream: simStream });
  const linksBeforeCancel = h.createdLinks.length;
  await cancelledSession.cancel();
  assert.equal(h.createdLinks.length, linksBeforeCancel);
  assert.equal(listeners.size, 0);
});

test('web capture handles WebRTC MediaStream snapshots/recording and fails closed on empty streams', async () => {
  const h = createWebHarness({ supportedMime: 'video/webm;codecs=vp9' });
  const track = { kind: 'video', stopped: false, stop() { this.stopped = true; } };
  const webrtcStream = { getVideoTracks: () => [track], getTracks: () => [track] };
  h.mockVideos.push({ srcObject: webrtcStream, videoWidth: 1280, videoHeight: 720 });

  const photo = await h.adapter.capturePhoto({
    camera: 'front',
    stream: webrtcStream,
    now: new Date(2026, 10, 21, 12, 30, 0),
  });
  assert.equal(photo.width, 1280);
  assert.equal(photo.height, 720);
  assert.equal(photo.fileName, 'DOSO_SNAP_20261121_123000_front.jpg');

  // Recording a live MediaStream at rotation=0 preserves the original preview track alive on stop.
  const session = await h.adapter.startRecording({ camera: 'front', stream: webrtcStream, rotation: 0 });
  const saved = await session.stop();
  assert.equal(saved.mimeType, 'video/webm;codecs=vp9');
  assert.equal(track.stopped, false);

  await assert.rejects(() => h.adapter.capturePhoto({ camera: 'front', stream: null }), /暂无可抓拍/);
  await assert.rejects(() => h.adapter.startRecording({ camera: 'front', stream: null }), /暂无可录制/);

  const emptyH = createWebHarness({ emptyBlobOnStop: true });
  const emptySession = await emptyH.adapter.startRecording({ camera: 'front', stream: webrtcStream, rotation: 0 });
  await assert.rejects(() => emptySession.stop(), /录屏数据为空/);
});
