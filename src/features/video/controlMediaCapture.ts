import type { DecodedSimFrame, LoopbackSimVideoStream } from './devLoopbackSimVideo';
import {
  buildRecordingFileName,
  buildSnapshotFileName,
  normalizeMediaRotation,
  type ActiveRecordingSession,
  type CaptureMediaInput,
  type ControlMediaCaptureAdapter,
  type MediaRotationDegrees,
  type RecordingSaveResult,
  type SnapshotSaveResult,
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
} from './controlMediaModel.ts';

type WebRecorderLike = {
  state?: string;
  mimeType?: string;
  ondataavailable: ((event: { data?: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: (timeslice?: number) => void;
  stop: () => void;
};

type WebRecorderConstructor = {
  new (stream: unknown, options?: { mimeType?: string; videoBitsPerSecond?: number }): WebRecorderLike;
  isTypeSupported?: (mimeType: string) => boolean;
};

export type WebMediaCaptureRuntime = Readonly<{
  document?: {
    createElement: (tagName: string) => unknown;
    querySelectorAll?: (selector: string) => Iterable<unknown>;
    body?: { appendChild?: (node: unknown) => void; removeChild?: (node: unknown) => void } | null;
  } | null;
  MediaRecorder?: WebRecorderConstructor;
  MediaStream?: new (tracks: unknown[]) => unknown;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}>;

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

const WEB_STORAGE_LABEL = '浏览器下载目录';

function isLoopbackSimVideoStream(stream: unknown): stream is LoopbackSimVideoStream {
  return Boolean(
    stream
    && typeof stream === 'object'
    && (stream as Partial<LoopbackSimVideoStream>).kind === 'doso-dev-sim-canvas'
    && typeof (stream as Partial<LoopbackSimVideoStream>).getLatestFrame === 'function'
    && typeof (stream as Partial<LoopbackSimVideoStream>).subscribe === 'function',
  );
}

function isMediaStreamLike(stream: unknown): stream is { getVideoTracks: () => unknown[] } {
  return Boolean(stream && typeof stream === 'object' && typeof (stream as { getVideoTracks?: unknown }).getVideoTracks === 'function');
}

function rotatedDimensions(width: number, height: number, rotation: MediaRotationDegrees): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) return { width: height, height: width };
  return { width, height };
}

function drawRotatedFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  rotation: MediaRotationDegrees,
): void {
  if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, targetW, targetH);
  if (rotation === 0) {
    ctx.drawImage(source, 0, 0, targetW, targetH);
    return;
  }
  const drawW = rotation === 90 || rotation === 270 ? targetH : targetW;
  const drawH = rotation === 90 || rotation === 270 ? targetW : targetH;
  ctx.save?.();
  ctx.setTransform?.(1, 0, 0, 1, targetW / 2, targetH / 2);
  ctx.rotate?.((rotation * Math.PI) / 180);
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore?.();
  if (!ctx.save && srcW > 0 && srcH > 0) {
    ctx.drawImage(source, 0, 0, targetW, targetH);
  }
}

function dataUrlToBlob(dataUrl: string, fallbackMime = 'image/jpeg'): Blob {
  const parts = dataUrl.split(',');
  const header = parts[0] ?? '';
  const body = parts[1] ?? '';
  const mime = /^data:([^;]+);base64$/i.exec(header)?.[1] ?? fallbackMime;
  if (typeof atob !== 'function') {
    return new Blob([body], { type: mime });
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(result => resolve(result), 'image/jpeg', quality);
      } catch {
        resolve(null);
      }
    });
    if (blob && blob.size > 0) return blob;
  }
  if (typeof canvas.toDataURL === 'function') {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = dataUrlToBlob(dataUrl, 'image/jpeg');
    if (blob.size > 0) return blob;
  }
  throw new Error('无法将当前画面编码为 JPEG 图片');
}

function triggerWebDownload(
  runtime: WebMediaCaptureRuntime,
  blob: Blob,
  fileName: string,
): void {
  const doc = runtime.document;
  if (!doc || typeof doc.createElement !== 'function') {
    throw new Error('当前运行环境不支持导出媒体文件');
  }
  const link = doc.createElement('a') as {
    download?: string;
    href?: string;
    style?: { display?: string };
    click?: () => void;
  };
  const createUrl = runtime.createObjectURL ?? (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL.bind(URL) : undefined);
  const revokeUrl = runtime.revokeObjectURL ?? (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL.bind(URL) : undefined);
  if (!createUrl) {
    throw new Error('当前环境缺少文件下载能力');
  }
  const objectUrl = createUrl(blob);
  link.download = fileName;
  link.href = objectUrl;
  if (link.style) link.style.display = 'none';
  doc.body?.appendChild?.(link);
  try {
    link.click?.();
  } finally {
    doc.body?.removeChild?.(link);
    const scheduleTimeout = runtime.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    if (revokeUrl) {
      scheduleTimeout(() => {
        try { revokeUrl(objectUrl); } catch { /* Ignore cleanup failure. */ }
      }, 15_000);
    }
  }
}

async function resolveHtmlVideoForStream(
  runtime: WebMediaCaptureRuntime,
  stream: unknown,
): Promise<{ video: HTMLVideoElement; release: () => void }> {
  const doc = runtime.document;
  if (!doc) throw new Error('当前运行环境缺少视频播放容器');
  const existingVideos = doc.querySelectorAll ? Array.from(doc.querySelectorAll('video') as Iterable<HTMLVideoElement>) : [];
  const attached = existingVideos.find(
    video => video && video.srcObject === stream && video.videoWidth > 0 && video.videoHeight > 0,
  );
  if (attached) {
    return { video: attached, release: () => { } };
  }
  if (!isMediaStreamLike(stream)) {
    throw new Error('当前视频流尚未提供可读取的帧数据');
  }

  const video = doc.createElement('video') as HTMLVideoElement;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream as MediaStream;
  try {
    await video.play?.();
  } catch {
    /* Offscreen video might still emit metadata in headless tests. */
  }
  if (!(video.videoWidth > 0 && video.videoHeight > 0)) {
    const scheduleTimeout = runtime.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const cancelTimeout = runtime.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: unknown = null;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== null) cancelTimeout(timer);
        video.removeEventListener?.('loadeddata', onReady);
        video.removeEventListener?.('loadedmetadata', onReady);
        if (ok) resolve();
        else reject(new Error('视频首帧解码超时，请稍后再试'));
      };
      const onReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) done(true);
      };
      timer = scheduleTimeout(() => done(video.videoWidth > 0 && video.videoHeight > 0), 1500);
      video.addEventListener?.('loadeddata', onReady);
      video.addEventListener?.('loadedmetadata', onReady);
    });
  }
  return {
    video,
    release: () => {
      try {
        video.pause?.();
        video.srcObject = null;
      } catch {
        /* Ignore cleanup error. */
      }
    },
  };
}

function selectSupportedMimeType(RecorderCtor: WebRecorderConstructor): { mimeType: string; extension: 'mp4' | 'webm' } {
  const isSupported = typeof RecorderCtor.isTypeSupported === 'function'
    ? (candidate: string) => {
        try { return RecorderCtor.isTypeSupported!(candidate); } catch { return false; }
      }
    : () => false;
  for (const candidate of MIME_CANDIDATES) {
    if (isSupported(candidate)) {
      return {
        mimeType: candidate,
        extension: candidate.includes('mp4') ? 'mp4' : 'webm',
      };
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

function defaultRuntime(): WebMediaCaptureRuntime {
  return {
    document: typeof document !== 'undefined' ? (document as unknown as WebMediaCaptureRuntime['document']) : null,
    MediaRecorder: typeof MediaRecorder !== 'undefined' ? (MediaRecorder as unknown as WebRecorderConstructor) : undefined,
    MediaStream: typeof MediaStream !== 'undefined' ? (MediaStream as unknown as new (tracks: unknown[]) => unknown) : undefined,
    now: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id as ReturnType<typeof setInterval>),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
}

export function createWebControlMediaCaptureAdapter(customRuntime?: WebMediaCaptureRuntime): ControlMediaCaptureAdapter {
  const runtime = customRuntime ?? defaultRuntime();
  const hasDoc = Boolean(runtime.document && typeof runtime.document.createElement === 'function');

  return {
    supported: hasDoc,
    storageTargetLabel: WEB_STORAGE_LABEL,

    async capturePhoto(input: CaptureMediaInput): Promise<SnapshotSaveResult> {
      if (!runtime.document || typeof runtime.document.createElement !== 'function') {
        throw new Error('当前环境不支持端侧抓拍导出');
      }
      if (!input.stream) {
        throw new Error('当前暂无可抓拍的实时视频画面');
      }
      const rotation = normalizeMediaRotation(input.rotation);
      const canvas = runtime.document.createElement('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('浏览器未提供 2D 画布上下文，无法生成抓拍图片');
      }

      if (isLoopbackSimVideoStream(input.stream)) {
        const frame: DecodedSimFrame | null = input.stream.getLatestFrame();
        if (!frame || !frame.source || frame.width <= 0 || frame.height <= 0) {
          throw new Error('当前仿真视频帧尚未就绪，无法抓拍');
        }
        const dims = rotatedDimensions(frame.width, frame.height, rotation);
        canvas.width = dims.width;
        canvas.height = dims.height;
        drawRotatedFrame(ctx, frame.source as CanvasImageSource, frame.width, frame.height, dims.width, dims.height, rotation);
      } else {
        const resolved = await resolveHtmlVideoForStream(runtime, input.stream);
        try {
          const srcW = resolved.video.videoWidth;
          const srcH = resolved.video.videoHeight;
          if (!(srcW > 0 && srcH > 0)) {
            throw new Error('实时视频尚未渲染首帧，无法抓拍');
          }
          const dims = rotatedDimensions(srcW, srcH, rotation);
          canvas.width = dims.width;
          canvas.height = dims.height;
          drawRotatedFrame(ctx, resolved.video, srcW, srcH, dims.width, dims.height, rotation);
        } finally {
          resolved.release();
        }
      }

      const blob = await canvasToJpegBlob(canvas, 0.92);
      const fileName = buildSnapshotFileName(input.camera, input.now);
      triggerWebDownload(runtime, blob, fileName);
      return {
        fileName,
        width: canvas.width,
        height: canvas.height,
        bytes: blob.size || null,
        locationLabel: WEB_STORAGE_LABEL,
      };
    },

    async startRecording(input: CaptureMediaInput): Promise<ActiveRecordingSession> {
      if (!runtime.document || typeof runtime.document.createElement !== 'function') {
        throw new Error('当前环境不支持端侧录屏');
      }
      if (!input.stream) {
        throw new Error('当前暂无可录制的实时视频画面');
      }
      const RecorderCtor = runtime.MediaRecorder ?? (typeof MediaRecorder !== 'undefined' ? (MediaRecorder as unknown as WebRecorderConstructor) : undefined);
      if (!RecorderCtor) {
        throw new Error('当前浏览器不支持 MediaRecorder 端侧录屏');
      }

      const rotation = normalizeMediaRotation(input.rotation);
      const { mimeType, extension } = selectSupportedMimeType(RecorderCtor);
      const fileName = buildRecordingFileName(input.camera, extension, input.now);
      const nowFn = runtime.now ?? (() => Date.now());
      const setInt = runtime.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
      const clearInt = runtime.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));

      let cleanupFeed = () => { };
      let targetStream: unknown;
      let ownedTracks: { stop?: () => void }[] = [];

      if (isLoopbackSimVideoStream(input.stream)) {
        const simStream = input.stream;
        const first = simStream.getLatestFrame();
        if (!first || !first.source || first.width <= 0 || first.height <= 0) {
          throw new Error('仿真视频流尚未出帧，请稍候再试');
        }
        const dims = rotatedDimensions(first.width, first.height, rotation);
        const canvas = runtime.document.createElement('canvas') as HTMLCanvasElement & {
          captureStream?: (fps?: number) => { getTracks?: () => { stop?: () => void }[] };
        };
        canvas.width = dims.width;
        canvas.height = dims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法初始化仿真录屏画布');
        if (typeof canvas.captureStream !== 'function') {
          throw new Error('当前浏览器不支持 canvas.captureStream 录屏');
        }
        const renderSimFrame = () => {
          const latest = simStream.getLatestFrame();
          if (!latest || !latest.source || latest.width <= 0 || latest.height <= 0) return;
          drawRotatedFrame(ctx, latest.source as CanvasImageSource, latest.width, latest.height, canvas.width, canvas.height, rotation);
        };
        renderSimFrame();
        const unsubscribe = simStream.subscribe(renderSimFrame);
        const captured = canvas.captureStream(22);
        ownedTracks = captured.getTracks?.() ?? [];
        targetStream = captured;
        cleanupFeed = () => {
          unsubscribe();
        };
      } else if (rotation === 0 && isMediaStreamLike(input.stream)) {
        const videoTracks = input.stream.getVideoTracks();
        if (!videoTracks.length) {
          throw new Error('当前图传未包含可录制的视频轨道');
        }
        const StreamCtor = runtime.MediaStream ?? (typeof MediaStream !== 'undefined' ? (MediaStream as unknown as new (tracks: unknown[]) => unknown) : undefined);
        targetStream = StreamCtor ? new StreamCtor(videoTracks) : input.stream;
      } else {
        const resolved = await resolveHtmlVideoForStream(runtime, input.stream);
        const srcW = resolved.video.videoWidth;
        const srcH = resolved.video.videoHeight;
        if (!(srcW > 0 && srcH > 0)) {
          resolved.release();
          throw new Error('实时视频尚未渲染首帧，无法录屏');
        }
        const dims = rotatedDimensions(srcW, srcH, rotation);
        const canvas = runtime.document.createElement('canvas') as HTMLCanvasElement & {
          captureStream?: (fps?: number) => { getTracks?: () => { stop?: () => void }[] };
        };
        canvas.width = dims.width;
        canvas.height = dims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof canvas.captureStream !== 'function') {
          resolved.release();
          throw new Error('当前浏览器不支持旋转画面录屏');
        }
        const renderVideoFrame = () => {
          if (resolved.video.videoWidth > 0 && resolved.video.videoHeight > 0) {
            drawRotatedFrame(ctx, resolved.video, resolved.video.videoWidth, resolved.video.videoHeight, canvas.width, canvas.height, rotation);
          }
        };
        renderVideoFrame();
        const intervalId = setInt(renderVideoFrame, 42);
        const captured = canvas.captureStream(24);
        ownedTracks = captured.getTracks?.() ?? [];
        targetStream = captured;
        cleanupFeed = () => {
          clearInt(intervalId);
          resolved.release();
        };
      }

      const chunks: Blob[] = [];
      let recorder: WebRecorderLike;
      try {
        recorder = mimeType
          ? new RecorderCtor(targetStream, { mimeType, videoBitsPerSecond: 6_000_000 })
          : new RecorderCtor(targetStream);
      } catch (caught) {
        cleanupFeed();
        for (const track of ownedTracks) {
          try { track.stop?.(); } catch { /* Ignore. */ }
        }
        throw caught;
      }

      const startedAt = nowFn();
      let settled = false;
      let cancelled = false;
      let stopPromise: Promise<RecordingSaveResult> | null = null;
      let resolveStop!: (value: RecordingSaveResult) => void;
      let rejectStop!: (reason?: unknown) => void;
      const recorderDone = new Promise<RecordingSaveResult>((resolve, reject) => {
        resolveStop = resolve;
        rejectStop = reject;
      });

      const releaseResources = () => {
        cleanupFeed();
        for (const track of ownedTracks) {
          try { track.stop?.(); } catch { /* Ignore. */ }
        }
        ownedTracks = [];
      };

      recorder.ondataavailable = event => {
        if (event?.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (settled) return;
        settled = true;
        releaseResources();
        rejectStop(new Error('端侧录屏编码发生异常，请重试'));
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        releaseResources();
        const effectiveMime = recorder.mimeType || mimeType || 'video/webm';
        if (cancelled) {
          chunks.length = 0;
          resolveStop({
            fileName,
            durationMs: Math.max(0, nowFn() - startedAt),
            bytes: 0,
            mimeType: effectiveMime,
            locationLabel: WEB_STORAGE_LABEL,
          });
          return;
        }
        const outputBlob = new Blob(chunks, { type: effectiveMime });
        chunks.length = 0;
        if (!(outputBlob.size > 0)) {
          rejectStop(new Error('录屏数据为空，未能保存视频文件'));
          return;
        }
        try {
          triggerWebDownload(runtime, outputBlob, fileName);
          resolveStop({
            fileName,
            durationMs: Math.max(0, nowFn() - startedAt),
            bytes: outputBlob.size,
            mimeType: effectiveMime,
            locationLabel: WEB_STORAGE_LABEL,
          });
        } catch (error) {
          rejectStop(error);
        }
      };

      try {
        recorder.start(250);
      } catch (caught) {
        releaseResources();
        throw caught;
      }

      const finish = (shouldCancel: boolean): Promise<RecordingSaveResult> => {
        if (stopPromise) return stopPromise;
        cancelled = shouldCancel;
        stopPromise = recorderDone;
        if (!settled) {
          try {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            } else {
              recorder.onstop?.();
            }
          } catch (caught) {
            settled = true;
            releaseResources();
            if (shouldCancel) {
              return Promise.resolve({
                fileName,
                durationMs: 0,
                bytes: 0,
                mimeType,
                locationLabel: WEB_STORAGE_LABEL,
              });
            }
            return Promise.reject(caught);
          }
        }
        return stopPromise;
      };

      return {
        fileName,
        mimeType,
        stop: () => finish(false),
        cancel: async () => {
          try {
            await finish(true);
          } catch {
            /* Cancel suppresses save errors. */
          }
        },
      };
    },
  };
}

export const defaultControlMediaCaptureAdapter: ControlMediaCaptureAdapter = createWebControlMediaCaptureAdapter();
