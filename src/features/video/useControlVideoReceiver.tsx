import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as whepPlatform from './whepPlatform';
import { videoOrigin, WhepReceiver, type VideoConfiguration, type VideoRuntime, type VideoSnapshot } from './whepReceiver';
import { CloudViewer } from './cloudViewer';

const { VideoPlayer, videoRuntime } = whepPlatform;
type ManagedReceiver = { start(): void; stop(): Promise<boolean | void> };
type SimFactory = (
  config: VideoConfiguration,
  runtime: VideoRuntime,
  publish: (snapshot: VideoSnapshot) => void,
  createWhep: (cfg: VideoConfiguration, pub: (snapshot: VideoSnapshot) => void) => WhepReceiver,
) => ManagedReceiver | null;

const empty: VideoSnapshot = { id: 'video-unconfigured', phase: 'unconfigured', stream: null, rotation: 0, error: null };

/** Video lifecycle follows the visible device and App foreground. */
export function useControlVideoReceiver(config: (VideoConfiguration & { expectedUserId?: string }) | null | undefined, active: boolean) {
  const [appState, setAppState] = useState(AppState.currentState);
  const [retry, setRetry] = useState(0);
  const key = config ? JSON.stringify([config.deviceId, config.gatewayUrl, config.allowLocalHttp === true, config.expectedUserId, config.cameraId ?? null]) : '';
  const enabled = active && appState === 'active';
  const selection = JSON.stringify([key, retry, enabled]);
  const owner = useRef({ selection, generation: 0 });
  const credential = useRef(config?.viewerToken);
  if (owner.current.selection !== selection || credential.current !== config?.viewerToken) {
    owner.current = { selection, generation: owner.current.generation + 1 };
    credential.current = config?.viewerToken;
  }
  const generation = owner.current.generation;
  const denied = useRef<{ key: string; retry: number; credential: string | undefined } | null>(null);
  if (!config || denied.current && (denied.current.key !== key || denied.current.credential !== config.viewerToken)) denied.current = null;
  const authorizationBlocked = denied.current?.key === key && denied.current.retry === retry && denied.current.credential === config?.viewerToken;
  const receiverRef = useRef<ManagedReceiver | null>(null);
  const [owned, setOwned] = useState<{ generation: number; snapshot: VideoSnapshot }>({ generation: -1, snapshot: empty });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') receiverRef.current?.stop();
      setAppState(state);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let retired = false;
    let receiver: ManagedReceiver | null = null;
    const update = (snapshot: VideoSnapshot) => {
      if (retired || owner.current.generation !== generation) return;
      if (snapshot.error === 'authorization') denied.current = { key, retry, credential: config?.viewerToken };
      setOwned({ generation, snapshot });
    };
    if (!config || !enabled) return;
    if (authorizationBlocked) { update({ ...empty, id: `video-authorization-${generation}`, phase: 'error', error: 'authorization' }); return; }
    try {
      videoOrigin(config);
      const runtime = videoRuntime();
      if (!runtime) update({ ...empty, id: `video-unsupported-${generation}`, phase: 'error', error: 'unsupported' });
      else {
        const createLoopbackSim = (whepPlatform as { createLoopbackSimVideoReceiver?: SimFactory }).createLoopbackSimVideoReceiver;
        const created: ManagedReceiver = config.expectedUserId
          ? new CloudViewer(config, config.expectedUserId, runtime, update)
          : createLoopbackSim?.(config, runtime, update, (cfg, pub) => new WhepReceiver(cfg, runtime, pub))
          ?? new WhepReceiver(config, runtime, update);
        receiver = created;
        receiverRef.current = created;
        created.start();
      }
    } catch { update({ ...empty, id: 'video-configuration', phase: 'error', error: 'configuration' }); }
    return () => { retired = true; receiver?.stop(); if (receiverRef.current === receiver) receiverRef.current = null; };
  }, [generation]);
  const snapshot = owned.generation === generation && enabled ? owned.snapshot
    : config ? { ...empty, id: 'video-suspended', phase: 'connecting' as const } : empty;
  const reconnect = useCallback(() => setRetry(value => value + 1), []);
  const presentation = useMemo(
    () => ({ id: snapshot.id, phase: snapshot.phase, error: snapshot.error }),
    [snapshot.id, snapshot.phase, snapshot.error],
  );
  const surface = useMemo(
    () => (snapshot.stream ? createElement(VideoPlayer, { stream: snapshot.stream, rotation: snapshot.rotation }) : null),
    [snapshot.stream, snapshot.rotation],
  );
  const pipSurface = useMemo(
    () => (snapshot.stream ? createElement(VideoPlayer, { stream: snapshot.stream, rotation: snapshot.rotation }) : null),
    [snapshot.stream, snapshot.rotation],
  );
  return {
    presentation,
    surface,
    pipSurface,
    stream: snapshot.phase === 'receiving' ? snapshot.stream : null,
    rotation: snapshot.rotation,
    streams: snapshot.streams,
    error: snapshot.error,
    reconnect,
  };
}
