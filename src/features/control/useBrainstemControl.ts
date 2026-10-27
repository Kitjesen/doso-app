import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { brainstemControlTransport } from '../../services/brainstemControl';
import { BrainstemControlSession, type ControlVector } from './brainstemControlSession';

/** Account/lifecycle ownership never restores or acquires a lease automatically. */
export function useBrainstemControl({ ownerKey, ready }: { ownerKey: string | null; ready: boolean }) {
  const mounted = useRef(true);
  const owner = useRef({ ownerKey, ready });
  if (owner.current.ownerKey !== ownerKey || owner.current.ready !== ready) owner.current = { ownerKey, ready };
  const captured = owner.current;
  const sessionRef = useRef<{ owner: typeof captured; value: BrainstemControlSession } | null>(null);
  if (!sessionRef.current || sessionRef.current.owner !== captured) {
    sessionRef.current?.value.dispose();
    sessionRef.current = { owner: captured, value: new BrainstemControlSession(brainstemControlTransport,
      () => mounted.current && owner.current === captured && !!captured.ownerKey && captured.ready && AppState.currentState === 'active') };
  }
  const session = sessionRef.current.value;
  const callbacks = useMemo(() => ({
    connect: session.connect.bind(session), action: session.action.bind(session), acquire: session.acquire.bind(session),
    prepareManualControl: session.prepareManualControl.bind(session),
    // Automatic touch/lifecycle cleanup publishes failures without creating unhandled rejections.
    // The explicit stop action below retains its rejecting promise for action feedback.
    drive: (vector: ControlVector) => session.drive(vector).catch(() => undefined),
    turn: (vector: ControlVector) => session.turn(vector).catch(() => undefined),
    sticks: (drive: ControlVector, turn: ControlVector, sampledAtMonotonicMs?: number) => session.sticks(drive, turn, sampledAtMonotonicMs).catch(() => undefined),
    interrupt: () => session.interrupt().catch(() => undefined),
    disconnect: session.disconnect.bind(session),
    operationCallbacks: {
      stop: () => session.interrupt(), stand: () => session.action('stand-up'), sit: () => session.action('sit-down'),
      enableMotor: () => session.action('enable'), disableMotor: () => session.action('disable'),
      switchPolicy: (id: string) => session.action('switch-profile', id),
    },
  }), [session]);
  const [, render] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = session.subscribe(() => render(value => value + 1));
    const lifecycle = AppState.addEventListener('change', state => { if (state !== 'active') void session.disconnect(); });
    const timer = setInterval(() => { void session.refresh(); }, 500);
    return () => { mounted.current = false; unsubscribe(); lifecycle.remove(); clearInterval(timer); void session.disconnect(); };
  }, [session]);
  return { state: session.state, runtimeState: session.runtimeState, operationReadiness: session.operationReadiness,
    canAcquire: session.canAcquire, canUseManualControl: session.canUseManualControl,
    canBeginManualControl: session.canBeginManualControl, manualPrepared: session.state.manualPrepared, ...callbacks };
}
