import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState } from 'react-native';

import { getAuthSessionOperationSnapshot, subscribeAuthSessionOperations } from './authSessionOperation';

type RefreshControls = Pick<SupabaseClient['auth'], 'initialize' | 'startAutoRefresh' | 'stopAutoRefresh'>;
type ForegroundSource = Pick<typeof AppState, 'currentState' | 'addEventListener'>;

/** Own native timer scheduling, not cancellation of entered SDK work or read-triggered refresh. */
export function attachNativeAuthRefresh(auth: RefreshControls, appState: ForegroundSource) {
  let foreground = appState.currentState === 'active';
  let disposed = false;
  let faulted = false;
  let initialized = false;
  // The native caller must construct the SDK with autoRefreshToken: false.
  let applied: boolean | undefined = false;
  let pending = false;
  let running = false;

  const reconcile = async () => {
    try {
      while (pending) {
        pending = false;
        const next = !disposed && !faulted && foreground && !getAuthSessionOperationSnapshot().busy;
        if (applied === next) continue;
        try {
          if (next && !initialized) {
            // Observe the SDK's existing core promise; this does not drain all
            // queued auth notifications or cancel constructor initialization.
            const result = await auth.initialize();
            if (result.error) throw result.error;
            initialized = true;
            pending = true;
            continue; // Re-read foreground/busy/disposed after this await.
          }
          if (next) await auth.startAutoRefresh();
          else await auth.stopAutoRefresh();
          applied = next;
        } catch {
          applied = undefined;
          if (!faulted) console.warn('[DOSO auth] Native refresh scheduling failed; automatic starts are disabled.');
          faulted = true;
          // A failed start may have partially installed timers. Stop once, but
          // never call it a successful cancellation of an entered refresh.
          if (next) {
            try { await auth.stopAutoRefresh(); applied = false; } catch { /* SDK state remains unknown. */ }
          }
          pending = false;
        }
      }
    } finally { running = false; }
  };

  const schedule = () => {
    pending = true;
    if (running) return;
    running = true;
    // Coordinator observers only schedule: no SDK callback is awaited inline.
    void Promise.resolve().then(reconcile);
  };
  const unsubscribe = subscribeAuthSessionOperations(schedule);
  const subscription = appState.addEventListener('change', (state) => {
    foreground = state === 'active';
    schedule();
  });
  schedule();

  return () => {
    disposed = true;
    subscription.remove();
    unsubscribe();
    schedule();
  };
}
