import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { readControllerWifiSignal } from '../../services/controllerWifi';
import type { ControlSignalState } from './controlOperations';

/** A controller RSSI sample never claims robot-side reception or an end-to-end link budget. */
export function useControllerWifiSignal(active: boolean) {
  const [sample, setSample] = useState<{ value: ControlSignalState; at: number } | null>(null);
  useEffect(() => {
    let live = true, generation = 0, busy = false;
    const read = async () => {
      if (!active || AppState.currentState !== 'active' || busy) return;
      busy = true;
      const captured = generation;
      const value = await readControllerWifiSignal();
      busy = false;
      if (live && generation === captured && AppState.currentState === 'active') setSample(value ? { value, at: performance.now() } : null);
    };
    setSample(null);
    if (!active) return () => { live = false; };
    void read();
    const timer = setInterval(() => { void read(); }, 2000);
    const listener = AppState.addEventListener('change', state => {
      generation++; setSample(null);
      if (state === 'active') void read();
    });
    return () => { live = false; generation++; clearInterval(timer); listener.remove(); };
  }, [active]);
  const age = sample ? performance.now() - sample.at : Infinity;
  return active && AppState.currentState === 'active' && age >= 0 && age < 5000 ? sample?.value : undefined;
}
