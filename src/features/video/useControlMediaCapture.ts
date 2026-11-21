import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  formatMediaDuration,
  type ActiveRecordingSession,
  type ControlMediaCaptureAdapter,
  type MediaCameraId,
} from './controlMediaModel';
import { defaultControlMediaCaptureAdapter } from './controlMediaCapture';

const FALLBACK_MEDIA_ADAPTER: ControlMediaCaptureAdapter = {
  supported: false,
  storageTargetLabel: '当前运行环境不支持',
  async capturePhoto() {
    throw new Error('当前平台暂不支持端侧抓拍保存');
  },
  async startRecording() {
    throw new Error('当前平台暂不支持端侧录屏');
  },
};

export type UseControlMediaCaptureParams = Readonly<{
  camera: MediaCameraId;
  stream: unknown;
  rotation?: number;
  receiving: boolean;
  active: boolean;
  targetKey?: string;
  adapter?: ControlMediaCaptureAdapter;
  onNotice?: (message: string) => void;
}>;

export type ControlMediaCaptureState = Readonly<{
  supported: boolean;
  recordingActive: boolean;
  recordingDurationSec: number;
  recordingDurationLabel: string | null;
  capturing: boolean;
  stopping: boolean;
  snapshotCount: number;
  recordingCount: number;
  lastSavedLabel: string | null;
  storageTargetLabel: string;
  mediaStatusLabel: string;
  capturePhoto: () => Promise<void>;
  toggleRecording: () => Promise<void>;
}>;

export function useControlMediaCapture({
  camera,
  stream,
  rotation,
  receiving,
  active,
  targetKey,
  adapter = defaultControlMediaCaptureAdapter,
  onNotice,
}: UseControlMediaCaptureParams): ControlMediaCaptureState {
  const safeAdapter = adapter ?? defaultControlMediaCaptureAdapter ?? FALLBACK_MEDIA_ADAPTER;
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [recordingCount, setRecordingCount] = useState(0);
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const sessionRef = useRef<{
    session: ActiveRecordingSession;
    camera: MediaCameraId;
    targetKey?: string;
  } | null>(null);
  const startingRef = useRef(false);
  const stoppingPromiseRef = useRef<Promise<void> | null>(null);
  const captureBusyRef = useRef(false);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  const notify = useCallback((message: string) => {
    noticeRef.current?.(message);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!recordingActive) {
      setRecordingDurationSec(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setRecordingDurationSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingActive]);

  const stopActiveRecording = useCallback(async (reason: 'manual' | 'background' | 'disconnected' | 'camera-switched' | 'unmount') => {
    if (stoppingPromiseRef.current) return stoppingPromiseRef.current;
    const activeSession = sessionRef.current;
    if (!activeSession) {
      if (mountedRef.current) setRecordingActive(false);
      return undefined;
    }

    const work = (async () => {
      if (mountedRef.current) setStopping(true);
      try {
        const result = await activeSession.session.stop();
        if (sessionRef.current?.session === activeSession.session) {
          sessionRef.current = null;
        }
        if (mountedRef.current) {
          setRecordingActive(false);
          setRecordingDurationSec(0);
          setRecordingCount(prev => prev + 1);
          setLastSavedLabel(result.fileName);
        }
        const suffix = reason === 'background'
          ? '（切至后台自动保存）'
          : reason === 'disconnected'
            ? '（视频流中断已保存）'
            : reason === 'camera-switched'
              ? '（切换视角已保存）'
              : '';
        notify(`已保存录屏：${result.fileName}${suffix} · ${result.locationLabel}`);
      } catch (caught) {
        try {
          await activeSession.session.cancel();
        } catch {
          /* Ignore secondary cancel error. */
        }
        if (sessionRef.current?.session === activeSession.session) {
          sessionRef.current = null;
        }
        if (mountedRef.current) {
          setRecordingActive(false);
          setRecordingDurationSec(0);
        }
        if (reason === 'manual') {
          notify(caught instanceof Error && caught.message ? caught.message : '录屏保存失败');
        }
      } finally {
        stoppingPromiseRef.current = null;
        if (mountedRef.current) setStopping(false);
      }
    })();

    stoppingPromiseRef.current = work;
    return work;
  }, [notify]);

  useEffect(() => {
    const current = sessionRef.current;
    if (!current) return;
    if (!active) {
      void stopActiveRecording('background');
      return;
    }
    if (current.targetKey !== targetKey || !receiving || !stream) {
      void stopActiveRecording('disconnected');
      return;
    }
    if (current.camera !== camera) {
      void stopActiveRecording('camera-switched');
    }
  }, [active, camera, receiving, stopActiveRecording, stream, targetKey]);

  useEffect(() => () => {
    const activeSession = sessionRef.current;
    if (activeSession) {
      sessionRef.current = null;
      void activeSession.session.stop().catch(() => activeSession.session.cancel());
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (captureBusyRef.current) return;
    if (!safeAdapter.supported) {
      notify('当前平台暂不支持端侧抓拍保存');
      return;
    }
    if (!receiving || !stream) {
      notify('当前暂无可抓拍的实时视频画面');
      return;
    }
    captureBusyRef.current = true;
    if (mountedRef.current) setCapturing(true);
    try {
      const result = await safeAdapter.capturePhoto({ camera, stream, rotation });
      if (mountedRef.current) {
        setSnapshotCount(prev => prev + 1);
        setLastSavedLabel(result.fileName);
      }
      notify(`已保存抓拍：${result.fileName}（${result.locationLabel}）`);
    } catch (caught) {
      notify(caught instanceof Error && caught.message ? caught.message : '当前视频画面抓拍失败');
    } finally {
      captureBusyRef.current = false;
      if (mountedRef.current) setCapturing(false);
    }
  }, [safeAdapter, camera, notify, receiving, rotation, stream]);

  const toggleRecording = useCallback(async () => {
    if (stoppingPromiseRef.current || startingRef.current) return;
    if (sessionRef.current) {
      await stopActiveRecording('manual');
      return;
    }
    if (!safeAdapter.supported) {
      notify('当前平台暂不支持端侧录屏');
      return;
    }
    if (!active || !receiving || !stream) {
      notify('当前暂无可录制的实时视频画面');
      return;
    }
    startingRef.current = true;
    try {
      const session = await safeAdapter.startRecording({ camera, stream, rotation });
      if (!mountedRef.current) {
        await session.cancel();
        return;
      }
      sessionRef.current = { session, camera, targetKey };
      setRecordingDurationSec(0);
      setRecordingActive(true);
      notify(`开始录制当前画面（${session.fileName}）`);
    } catch (caught) {
      if (mountedRef.current) setRecordingActive(false);
      notify(caught instanceof Error && caught.message ? caught.message : '无法开启端侧录屏');
    } finally {
      startingRef.current = false;
    }
  }, [active, safeAdapter, camera, notify, receiving, rotation, stopActiveRecording, stream, targetKey]);

  const recordingDurationLabel = recordingActive ? formatMediaDuration(recordingDurationSec) : null;
  const mediaStatusLabel = useMemo(() => {
    if (recordingActive && recordingDurationLabel) {
      return `录制中 · ${recordingDurationLabel}`;
    }
    if (!safeAdapter.supported) return '当前运行环境不支持';
    if (snapshotCount > 0 || recordingCount > 0) {
      return `已就绪 · 已存 ${snapshotCount} 张 / ${recordingCount} 段`;
    }
    return receiving && stream ? '已就绪 · 可抓拍与录屏' : '已就绪 · 等待实时画面';
  }, [safeAdapter.supported, receiving, recordingActive, recordingCount, recordingDurationLabel, snapshotCount, stream]);

  return {
    supported: safeAdapter.supported,
    recordingActive,
    recordingDurationSec,
    recordingDurationLabel,
    capturing,
    stopping,
    snapshotCount,
    recordingCount,
    lastSavedLabel,
    storageTargetLabel: safeAdapter.storageTargetLabel,
    mediaStatusLabel,
    capturePhoto,
    toggleRecording,
  };
}
