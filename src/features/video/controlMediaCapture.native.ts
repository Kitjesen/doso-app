import { requireOptionalNativeModule } from 'expo';

import {
  buildRecordingFileName,
  buildSnapshotFileName,
  normalizeMediaRotation,
  type ActiveRecordingSession,
  type CaptureMediaInput,
  type ControlMediaCaptureAdapter,
  type RecordingSaveResult,
  type SnapshotSaveResult,
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
} from './controlMediaModel.ts';

type NativeSnapshotResult = {
  fileName: string;
  width: number;
  height: number;
  bytes: number;
  uri?: string;
  locationLabel: string;
};

type NativeRecordingStartResult = {
  fileName: string;
  mimeType: string;
};

type NativeRecordingStopResult = {
  fileName: string;
  durationMs: number;
  bytes: number;
  mimeType: string;
  uri?: string;
  locationLabel: string;
};

type DosoMediaCaptureNative = {
  captureSnapshot(
    pcId: number,
    trackId: string,
    streamUrl: string,
    fileName: string,
    rotationDegrees: number,
  ): Promise<NativeSnapshotResult>;
  startRecording(
    pcId: number,
    trackId: string,
    streamUrl: string,
    fileName: string,
    rotationDegrees: number,
  ): Promise<NativeRecordingStartResult>;
  stopRecording(): Promise<NativeRecordingStopResult>;
  cancelRecording(): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<DosoMediaCaptureNative>('DosoMediaCapture');
const NATIVE_STORAGE_LABEL = '系统相册 Pictures/Movies/DOSO';

function resolveNativeTrackDescriptor(stream: unknown): {
  pcId: number;
  trackId: string;
  streamUrl: string;
} {
  if (!stream || typeof stream !== 'object') {
    throw new Error('当前暂无可处理的实时视频流');
  }
  const streamObj = stream as {
    toURL?: () => string;
    _reactTag?: string;
    getVideoTracks?: () => { id?: string; kind?: string; remote?: boolean; _peerConnectionId?: number }[];
    getTracks?: () => { id?: string; kind?: string; remote?: boolean; _peerConnectionId?: number }[];
  };
  const streamUrl = typeof streamObj.toURL === 'function'
    ? streamObj.toURL()
    : typeof streamObj._reactTag === 'string'
      ? streamObj._reactTag
      : '';
  const allTracks = typeof streamObj.getVideoTracks === 'function'
    ? streamObj.getVideoTracks()
    : typeof streamObj.getTracks === 'function'
      ? streamObj.getTracks().filter(track => track?.kind === 'video')
      : [];
  const videoTrack = allTracks[0];
  const pcId = videoTrack && videoTrack.remote && typeof videoTrack._peerConnectionId === 'number'
    ? videoTrack._peerConnectionId
    : -1;
  const trackId = typeof videoTrack?.id === 'string' ? videoTrack.id : '';
  if (!trackId && !streamUrl) {
    throw new Error('当前视频流未提供原生轨道标识');
  }
  return { pcId, trackId, streamUrl };
}

export const defaultControlMediaCaptureAdapter: ControlMediaCaptureAdapter = {
  supported: Boolean(nativeModule),
  storageTargetLabel: nativeModule ? NATIVE_STORAGE_LABEL : '当前安装包未集成原生相册写入模块',

  async capturePhoto(input: CaptureMediaInput): Promise<SnapshotSaveResult> {
    if (!nativeModule) {
      throw new Error('当前客户端未包含 DosoMediaCapture 原生模块，请重新构建原生包');
    }
    const descriptor = resolveNativeTrackDescriptor(input.stream);
    const fileName = buildSnapshotFileName(input.camera, input.now);
    const rotation = normalizeMediaRotation(input.rotation);
    const result = await nativeModule.captureSnapshot(
      descriptor.pcId,
      descriptor.trackId,
      descriptor.streamUrl,
      fileName,
      rotation,
    );
    return {
      fileName: result.fileName || fileName,
      width: result.width,
      height: result.height,
      bytes: Number.isFinite(result.bytes) ? result.bytes : null,
      uri: result.uri,
      locationLabel: result.locationLabel || '系统相册 Pictures/DOSO',
    };
  },

  async startRecording(input: CaptureMediaInput): Promise<ActiveRecordingSession> {
    if (!nativeModule) {
      throw new Error('当前客户端未包含 DosoMediaCapture 原生模块，请重新构建原生包');
    }
    const descriptor = resolveNativeTrackDescriptor(input.stream);
    const fileName = buildRecordingFileName(input.camera, 'mp4', input.now);
    const rotation = normalizeMediaRotation(input.rotation);
    const started = await nativeModule.startRecording(
      descriptor.pcId,
      descriptor.trackId,
      descriptor.streamUrl,
      fileName,
      rotation,
    );
    return {
      fileName: started.fileName || fileName,
      mimeType: started.mimeType || 'video/mp4',
      stop: async (): Promise<RecordingSaveResult> => {
        const saved = await nativeModule.stopRecording();
        return {
          fileName: saved.fileName || fileName,
          durationMs: Number.isFinite(saved.durationMs) ? saved.durationMs : 0,
          bytes: Number.isFinite(saved.bytes) ? saved.bytes : null,
          mimeType: saved.mimeType || 'video/mp4',
          uri: saved.uri,
          locationLabel: saved.locationLabel || '系统相册 Movies/DOSO',
        };
      },
      cancel: async () => {
        await nativeModule.cancelRecording();
      },
    };
  },
};
