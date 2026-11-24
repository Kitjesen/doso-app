import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { setKeepScreenOn } from '../../services/brainstemControl';

type WebWakeLockSentinel = {
  released?: boolean;
  release?: () => Promise<void> | void;
};

type WebWakeLockNavigator = {
  wakeLock?: {
    request?: (type: 'screen') => Promise<WebWakeLockSentinel>;
  };
};

type WebDocumentLike = {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function isForegroundAppState(state: AppStateStatus | string | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

export function useKeepScreenAwake(active: boolean): void {
  useEffect(() => {
    let disposed = false;
    let webSentinel: WebWakeLockSentinel | null = null;
    let webRequestToken = 0;

    const releaseWebWakeLock = () => {
      webRequestToken += 1;
      const current = webSentinel;
      webSentinel = null;
      if (current && typeof current.release === 'function' && !current.released) {
        try {
          void Promise.resolve(current.release()).catch(() => undefined);
        } catch {
          // Ignore wake-lock release errors.
        }
      }
    };

    const acquireWebWakeLock = () => {
      if (disposed) return;
      if (webSentinel && !webSentinel.released) return;
      const nav = (globalThis as { navigator?: WebWakeLockNavigator }).navigator;
      const request = nav?.wakeLock?.request;
      if (typeof request !== 'function') return;
      const token = ++webRequestToken;
      try {
        void Promise.resolve(request.call(nav!.wakeLock, 'screen'))
          .then(sentinel => {
            if (!sentinel) return;
            if (disposed || token !== webRequestToken) {
              if (typeof sentinel.release === 'function' && !sentinel.released) {
                void Promise.resolve(sentinel.release()).catch(() => undefined);
              }
              return;
            }
            webSentinel = sentinel;
          })
          .catch(() => undefined);
      } catch {
        // Ignore unsupported or rejected wake-lock requests.
      }
    };

    const applyWakeLock = (shouldKeepAwake: boolean) => {
      if (Platform.OS === 'android') {
        void setKeepScreenOn(shouldKeepAwake).catch(() => undefined);
      }
      if (Platform.OS === 'web') {
        if (shouldKeepAwake) {
          acquireWebWakeLock();
        } else {
          releaseWebWakeLock();
        }
      }
    };

    if (!active) {
      applyWakeLock(false);
      return () => {
        disposed = true;
      };
    }

    const appState = AppState as Partial<typeof AppState> | undefined;
    const doc = Platform.OS === 'web'
      ? (globalThis as { document?: WebDocumentLike }).document
      : undefined;

    const isWebVisible = () => typeof doc?.visibilityState !== 'string' || doc.visibilityState === 'visible';
    applyWakeLock(isForegroundAppState(appState?.currentState) && isWebVisible());

    let appStateSubscription: { remove?: () => void } | undefined;
    try {
      if (typeof appState?.addEventListener === 'function') {
        appStateSubscription = appState.addEventListener('change', nextState => {
          if (disposed) return;
          applyWakeLock(nextState === 'active' && isWebVisible());
        });
      }
    } catch {
      // Ignore partial AppState implementations in tests.
    }

    const handleVisibilityChange = () => {
      if (disposed) return;
      applyWakeLock(isForegroundAppState(appState?.currentState) && isWebVisible());
    };
    if (doc && typeof doc.addEventListener === 'function') {
      try {
        doc.addEventListener('visibilitychange', handleVisibilityChange);
      } catch {
        // Ignore non-DOM test environments.
      }
    }

    return () => {
      disposed = true;
      try {
        appStateSubscription?.remove?.();
      } catch {
        // Ignore cleanup errors in partial test environments.
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        try {
          doc.removeEventListener('visibilitychange', handleVisibilityChange);
        } catch {
          // Ignore cleanup errors.
        }
      }
      applyWakeLock(false);
    };
  }, [active]);
}
