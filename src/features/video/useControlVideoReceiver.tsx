import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { VideoPlayer, videoRuntime } from './whepPlatform';
import { videoOrigin, WhepReceiver, type VideoConfiguration, type VideoSnapshot } from './whepReceiver';
import { CloudViewer } from './cloudViewer';

const empty: VideoSnapshot = { id: 'video-unconfigured', phase: 'unconfigured', stream: null, rotation: 0, error: null };

/** Video lifecycle follows the visible device and App foreground. */
export function useControlVideoReceiver(config: (VideoConfiguration & { expectedUserId?: string }) | null | undefined, active: boolean) {
  const [appState, setAppState] = useState(AppState.currentState);
  const [retry, setRetry] = useState(0);
  const key = config ? JSON.stringify([config.deviceId, config.gatewayUrl, config.allowLocalHttp === true, config.expectedUserId]) : '';
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
  const receiverRef = useRef<WhepReceiver | CloudViewer | null>(null);
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
    let receiver: WhepReceiver | CloudViewer | null = null;
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
        receiver = config.expectedUserId ? new CloudViewer(config, config.expectedUserId, runtime, update) : new WhepReceiver(config, runtime, update);
        receiverRef.current = receiver; receiver.start();
      }
    } catch { update({ ...empty, id: 'video-configuration', phase: 'error', error: 'configuration' }); }
    return () => { retired = true; receiver?.stop(); if (receiverRef.current === receiver) receiverRef.current = null; };
  }, [generation]);
  const snapshot = owned.generation === generation && enabled ? owned.snapshot
    : config ? { ...empty, id: 'video-suspended', phase: 'connecting' as const } : empty;
  const reconnect = useCallback(() => setRetry(value => value + 1), []);
  return {
    presentation: { id: snapshot.id, phase: snapshot.phase, error: snapshot.error },
    surface: snapshot.stream ? createElement(VideoPlayer, { stream: snapshot.stream, rotation: snapshot.rotation }) : null,
    error: snapshot.error,
    reconnect,
  };
}
