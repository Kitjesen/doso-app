import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { readControllerWifiSignal } from '../../services/controllerWifi';
import type { ControlSignalState } from './controlOperations';

function sameSignal(a: ControlSignalState | undefined, b: ControlSignalState | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.qualityPercent === b.qualityPercent && a.rssiDbm === b.rssiDbm && a.source === b.source;
}

/** A controller RSSI sample never claims robot-side reception or an end-to-end link budget. */
export function useControllerWifiSignal(active: boolean) {
  const [signal, setSignal] = useState<ControlSignalState | undefined>(undefined);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let live = true, generation = 0, busy = false;
    const clearExpiry = () => {
      if (expiryTimer.current !== null) {
        clearTimeout(expiryTimer.current);
        expiryTimer.current = null;
      }
    };
    const read = async () => {
      if (!active || AppState.currentState !== 'active' || busy) return;
      busy = true;
      const captured = generation;
      const value = await readControllerWifiSignal();
      busy = false;
      if (live && generation === captured && AppState.currentState === 'active') {
        clearExpiry();
        const next = value ?? undefined;
        if (next) {
          expiryTimer.current = setTimeout(() => {
            if (live && generation === captured) setSignal(undefined);
          }, 5000);
        }
        setSignal(prev => (sameSignal(prev, next) ? prev : next));
      }
    };
    clearExpiry();
    setSignal(undefined);
    if (!active) return () => { live = false; clearExpiry(); };
    void read();
    const timer = setInterval(() => { void read(); }, 2000);
    const listener = AppState.addEventListener('change', state => {
      generation++; clearExpiry(); setSignal(undefined);
      if (state === 'active') void read();
    });
    return () => { live = false; generation++; clearExpiry(); clearInterval(timer); listener.remove(); };
  }, [active]);
  return active && AppState.currentState === 'active' ? signal : undefined;
}
