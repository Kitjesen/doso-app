import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createDirectRobotConnectionSnapshot, describeDirectRobotConnection, isDirectRobotConnectionFresh,
  type DirectRobotConnectionSnapshot,
} from '../../services/directRobotConnection';

type Owner = Readonly<{ scopeKey: string | null; ready: boolean }>;
type Selection = Readonly<{ owner: Owner; snapshot: DirectRobotConnectionSnapshot; expired: boolean }>;

// This owner carries a short-lived observation, never a connection lease or
// motion authority. Nothing is persisted and no network work starts here.
export function useDirectRobotConnection(scopeKey: string | null, ready: boolean) {
  const owner = useRef<Owner>({ scopeKey, ready });
  const mounted = useRef(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [, setLifecycleRevision] = useState(0);
  if (owner.current.scopeKey !== scopeKey || owner.current.ready !== ready) {
    // Object identity also retires A -> B -> A callbacks.
    owner.current = { scopeKey, ready };
  }
  const capturedOwner = owner.current;
  const snapshot = selection?.owner === capturedOwner && ready && scopeKey
    && AppState.currentState === 'active' ? selection.snapshot : null;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      // Foreground does not restore a selection cleared on background.
      owner.current = { ...owner.current };
      if (state !== 'active') setSelection(null);
      // A null -> null selection update may bail out. System certificate pickers
      // still rotate the owner, so publish a fresh callback on foreground too.
      setLifecycleRevision(value => value + 1);
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!snapshot || !isDirectRobotConnectionFresh(snapshot)) return;
    const remaining = Date.parse(snapshot.observation.observedAt) + 15_000 - Date.now();
    const timer = setTimeout(() => {
      if (!mounted.current || owner.current !== capturedOwner) return;
      // Keep only the explicitly chosen endpoint available for re-checking;
      // projection removes expired status. No automatic read or reconnect.
      setSelection(current => current && current === selection ? { ...current, expired: true } : current);
    }, remaining);
    return () => clearTimeout(timer);
  }, [selection, capturedOwner]);

  const select = (candidate: DirectRobotConnectionSnapshot): boolean => {
    if (!mounted.current || owner.current !== capturedOwner || !scopeKey || !ready
      || AppState.currentState !== 'active') return false;
    try {
      const checked = createDirectRobotConnectionSnapshot(candidate.endpoint, candidate.observation);
      setSelection({ owner: capturedOwner, snapshot: checked, expired: false });
      return true;
    } catch { return false; }
  };
  const clear = () => {
    if (!mounted.current) return;
    owner.current = { ...owner.current };
    setSelection(null);
    setLifecycleRevision(value => value + 1);
  };
  return {
    snapshot,
    presentation: snapshot ? describeDirectRobotConnection(snapshot, selection?.expired ? Number.NaN : Date.now()) : null,
    select,
    clear,
  };
}
