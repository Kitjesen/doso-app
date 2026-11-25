import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { brainstemControlTransport } from '../../services/brainstemControl';
import type { BrainstemGrpcEndpoint } from '../../services/brainstemGrpc';
import { BrainstemControlSession, type ControlBodyHeightState, type ControlVector } from './brainstemControlSession';
import { BrainstemConnectionRecovery } from './brainstemConnectionRecovery';
import { useControllerWifiSignal } from './useControllerWifiSignal';

export type { ControlBodyHeightState };

/** Account/lifecycle ownership never restores or acquires a lease automatically. */
export function useBrainstemControl({ ownerKey, ready, autoConnectEndpoint, autoConnectPrincipal = '', autoReconnectEnabled = true, imuNotifyEnabled = true, onConnected }: {
  ownerKey: string | null; ready: boolean; autoConnectEndpoint?: BrainstemGrpcEndpoint | null; autoConnectPrincipal?: string;
  autoReconnectEnabled?: boolean;
  imuNotifyEnabled?: boolean;
  onConnected?: (endpoint: BrainstemGrpcEndpoint, principal: string) => void;
}) {
  const mounted = useRef(true);
  const connectedCallback = useRef(onConnected); connectedCallback.current = onConnected;
  const owner = useRef({ ownerKey, ready });
  if (owner.current.ownerKey !== ownerKey) owner.current = { ownerKey, ready };
  else owner.current.ready = ready;
  const captured = owner.current;
  const sessionRef = useRef<{ owner: typeof captured; value: BrainstemControlSession } | null>(null);
  if (!sessionRef.current || sessionRef.current.owner !== captured) {
    sessionRef.current?.value.dispose();
    sessionRef.current = {
      owner: captured, value: new BrainstemControlSession(brainstemControlTransport,
        () => mounted.current && owner.current === captured && !!captured.ownerKey && captured.ready && AppState.currentState === 'active')
    };
  }
  const session = sessionRef.current.value;
  const recovery = useMemo(() => new BrainstemConnectionRecovery(session, () => performance.now(),
    (endpoint, principal) => connectedCallback.current?.(endpoint, principal)), [session]);
  const callbacks = useMemo(() => ({
    connect: recovery.connect.bind(recovery), action: session.action.bind(session), acquire: session.acquire.bind(session),
    retryNow: () => recovery.retryNow(),
    setImuNotifyEnabled: (enabled: boolean) => session.setImuNotifyEnabled(enabled),
    setSpeedMode: (mode: 'normal' | 'high') => session.setSpeedMode(mode),
    onSetBodyHeightMode: (enabled: boolean) => session.setBodyHeightMode(enabled),
    onSetBodyHeight: (heightM: number) => session.setBodyHeight(heightM),
    onRefreshBodyHeight: () => session.refreshBodyHeight({ retryOnBusy: true }),
    prepareManualControl: session.prepareManualControl.bind(session),
    endTouchGesture: () => session.endTouchGesture().catch(() => undefined),
    // Automatic touch/lifecycle cleanup publishes failures without creating unhandled rejections.
    // The explicit stop action below retains its rejecting promise for action feedback.
    drive: (vector: ControlVector) => session.drive(vector).catch(() => undefined),
    turn: (vector: ControlVector) => session.turn(vector).catch(() => undefined),
    sticks: (drive: ControlVector, turn: ControlVector, sampledAtMonotonicMs?: number) => session.sticks(drive, turn, sampledAtMonotonicMs).catch(() => undefined),
    interrupt: () => session.interrupt().catch(() => undefined),
    disconnect: recovery.disconnect.bind(recovery), suspend: recovery.suspend.bind(recovery),
    operationCallbacks: {
      stop: () => session.emergencyStop(), stand: () => session.action('stand-up'), sit: () => session.action('sit-down'),
      enableMotor: () => session.action('enable'), disableMotor: () => session.action('disable'),
      switchPolicy: (id: string) => session.action('switch-profile', id),
      setZero: () => session.action('set-zero'),
      clearMotorFault: () => session.action('clear-motor-fault'),
      playGesture: (name: string) => session.action('play-gesture', name),
    },
    listGestures: () => session.listGestures(),
    recoveryCommand: session.recoveryCommand.bind(session),
  }), [session, recovery]);
  useEffect(() => { session.setImuNotifyEnabled(imuNotifyEnabled); }, [session, imuNotifyEnabled]);
  useEffect(() => { recovery.setAvailable(ready); }, [recovery, ready]);
  useEffect(() => { recovery.setAutomaticEnabled(autoReconnectEnabled); }, [recovery, autoReconnectEnabled]);
  const autoTargetKey = JSON.stringify([autoConnectEndpoint, autoConnectPrincipal]);
  useEffect(() => {
    if (autoConnectEndpoint && ownerKey && ready) {
      recovery.restore(autoConnectEndpoint, autoConnectPrincipal);
      void recovery.tick();
    }
  }, [recovery, ownerKey, ready, autoTargetKey]);
  const [, render] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = session.subscribe(() => render(value => value + 1));
    recovery.setActive(AppState.currentState === 'active');
    const lifecycle = AppState.addEventListener('change', state => {
      recovery.setActive(state === 'active');
      if (state === 'active') void recovery.tick();
    });
    void session.refreshRecovery();
    let recoveryPollTick = 0;
    const timer = setInterval(() => {
      void recovery.tick();
      void session.refresh().then(async () => {
        if (session.speedMode === null && session.state.connected) {
          await session.refreshSpeedMode();
        }
        if (session.state.connected && (session.bodyHeight.active || (session.bodyHeight.available && !session.bodyHeightStatusSynced))) {
          await session.refreshBodyHeight();
        }
        const urgentRecovery = Boolean(
          session.recoveryStatus === null
          || session.recoveryStatus.sessionSelected
          || session.runtimeState.recoveryMode?.selected
          || session.runtimeState.faultStatus === 'active',
        );
        if (urgentRecovery || (++recoveryPollTick % 3 === 0)) {
          await session.refreshRecovery();
        }
      });
    }, 500);
    return () => { mounted.current = false; unsubscribe(); lifecycle.remove(); clearInterval(timer); void recovery.suspend(); };
  }, [session, recovery]);
  const signal = useControllerWifiSignal(ready && session.state.connected);
  return { state: session.state, runtimeState: { ...session.runtimeState, signal }, latencyMs: session.latencyMs, speedMode: session.speedMode, bodyHeight: session.bodyHeight, recoveryStatus: session.recoveryStatus, operationReadiness: session.operationReadiness,
    canAcquire: session.canAcquire, canUseManualControl: session.canUseManualControl,
    canBeginManualControl: session.canBeginManualControl, canBeginTouchControl: session.canBeginTouchControl,
    touchBlockedReason: session.touchBlockedReason, manualPrepared: session.state.manualPrepared,
    reconnecting: recovery.reconnecting, ...callbacks
  };
}
