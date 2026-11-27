import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';

import {
  getStandbySceneAsset,
  normalizeStandbyScene,
  type StandbySceneId,
} from './standbyScenes';
import {
  getStandbyDriveInput,
  subscribeStandbyDriveInput,
} from './standby3d/standbyDriveBus';
import type { ControlAccentTone } from '../features/control/controlPreferences';

export type StandbyDriveInput = Readonly<{
  driveX: number;
  driveY: number;
  turnX: number;
}>;

export type StandbyScene3DProps = Readonly<{
  scene: StandbySceneId;
  accentTone?: ControlAccentTone;
  interactive?: boolean;
  paused?: boolean;
  bodyHeightM?: number | null;
  driveInput?: StandbyDriveInput | null;
}>;

type WebViewHandle = {
  injectJavaScript?: (script: string) => void;
};

type WebViewComponent = React.ComponentType<Record<string, unknown>>;

let cachedWebView: WebViewComponent | null | undefined;
function getNativeWebView(): WebViewComponent | null {
  if (cachedWebView !== undefined) return cachedWebView;
  try {
    // Lazy require keeps Node VM unit tests independent of native WebView bindings.
    const mod = require('react-native-webview') as { WebView?: WebViewComponent; default?: WebViewComponent };
    cachedWebView = mod.WebView ?? mod.default ?? null;
  } catch {
    cachedWebView = null;
  }
  return cachedWebView;
}

function buildQuery(
  scene: StandbySceneId,
  accentTone: ControlAccentTone,
  interactive: boolean,
  paused: boolean,
  bodyHeightM?: number | null,
): string {
  const parts = [
    `scene=${encodeURIComponent(scene)}`,
    `accent=${encodeURIComponent(accentTone)}`,
    `interactive=${interactive ? '1' : '0'}`,
    `paused=${paused ? '1' : '0'}`,
    `perf=${Platform?.OS === 'android' ? 'low' : 'high'}`,
  ];
  if (typeof bodyHeightM === 'number' && Number.isFinite(bodyHeightM)) {
    parts.push(`height=${bodyHeightM.toFixed(3)}`);
  }
  return parts.join('&');
}

function StaticPosterLayer({
  scene,
  opacity,
}: {
  scene: StandbySceneId;
  opacity: Animated.Value;
}) {
  const normalized = normalizeStandbyScene(scene);
  const [prevScene, setPrevScene] = useState<StandbySceneId | null>(null);
  const activeRef = useRef<StandbySceneId>(normalized);
  const crossfade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (normalized === activeRef.current) return;
    const outgoing = activeRef.current;
    activeRef.current = normalized;
    setPrevScene(outgoing);
    crossfade.setValue(0);
    if (typeof Animated.timing === 'function') {
      Animated.timing(crossfade, {
        toValue: 1,
        duration: 280,
        useNativeDriver: Platform?.OS !== 'web',
      }).start(({ finished }) => {
        if (finished) setPrevScene(null);
      });
    } else {
      crossfade.setValue(1);
      setPrevScene(null);
    }
  }, [crossfade, normalized]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {prevScene ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={getStandbySceneAsset(prevScene)}
          style={[StyleSheet.absoluteFill, styles.posterImg]}
        />
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, styles.posterImg, { opacity: crossfade }]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={getStandbySceneAsset(normalized)}
          style={[StyleSheet.absoluteFill, styles.posterImg]}
        />
      </Animated.View>
      <View pointerEvents="none" style={styles.posterTint} />
    </Animated.View>
  );
}

export function StandbyScene3D({
  scene,
  accentTone = 'graphite',
  interactive = true,
  paused = false,
  bodyHeightM,
  driveInput,
}: StandbyScene3DProps) {
  const normalized = normalizeStandbyScene(scene);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterHidden, setPosterHidden] = useState(false);
  const posterOpacity = useRef(new Animated.Value(1)).current;
  const webViewRef = useRef<WebViewHandle | null>(null);

  const NativeWebView = Platform?.OS === 'android' ? getNativeWebView() : null;
  const canRender3d = Boolean(NativeWebView) && !failed;

  // Freeze initial URI so scene/accent/interactive changes update smoothly via JS bridge without reload.
  const initialUri = useMemo(() => {
    const query = buildQuery(normalized, accentTone, interactive, paused, bodyHeightM);
    return `file:///android_asset/standby3d/index.html?${query}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastDriveRef = useRef<string>('');
  const lastDriveSentAtRef = useRef<number>(0);
  const trailingDriveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDriveRef = useRef<{ dx: number; dy: number; tx: number } | null>(null);

  const sendDriveToWebView = (dx: number, dy: number, tx: number, forceImmediate = false) => {
    if (!webViewRef.current?.injectJavaScript) return;
    const safeDx = Number.isFinite(dx) ? dx : 0;
    const safeDy = Number.isFinite(dy) ? dy : 0;
    const safeTx = Number.isFinite(tx) ? tx : 0;
    const isZero = Math.abs(safeDx) < 0.001 && Math.abs(safeDy) < 0.001 && Math.abs(safeTx) < 0.001;
    const sig = isZero ? '0,0,0' : `${safeDx.toFixed(3)},${safeDy.toFixed(3)},${safeTx.toFixed(3)}`;
    if (sig === lastDriveRef.current) return;

    const now = Date.now();
    const minIntervalMs = Platform?.OS === 'android' ? 33 : 16;
    const elapsed = now - lastDriveSentAtRef.current;

    if (forceImmediate || isZero || elapsed >= minIntervalMs) {
      if (trailingDriveTimerRef.current) {
        clearTimeout(trailingDriveTimerRef.current);
        trailingDriveTimerRef.current = null;
      }
      pendingDriveRef.current = null;
      lastDriveRef.current = sig;
      lastDriveSentAtRef.current = now;
      webViewRef.current.injectJavaScript(
        `window.__dosoStandby3d&&window.__dosoStandby3d.setDriveInput(${sig});true;`,
      );
      return;
    }

    pendingDriveRef.current = { dx: safeDx, dy: safeDy, tx: safeTx };
    if (!trailingDriveTimerRef.current) {
      trailingDriveTimerRef.current = setTimeout(() => {
        trailingDriveTimerRef.current = null;
        const queued = pendingDriveRef.current;
        pendingDriveRef.current = null;
        if (queued) {
          sendDriveToWebView(queued.dx, queued.dy, queued.tx, true);
        }
      }, Math.max(8, minIntervalMs - elapsed));
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (typeof Animated.timing === 'function') {
      Animated.timing(posterOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setPosterHidden(true);
      });
    } else {
      posterOpacity.setValue(0);
      setPosterHidden(true);
    }
  }, [posterOpacity, ready]);

  useEffect(() => {
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setScene(${JSON.stringify(normalized)});true;`,
    );
  }, [normalized, ready]);

  useEffect(() => {
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setAccentTone(${JSON.stringify(accentTone)});true;`,
    );
  }, [accentTone, ready]);

  useEffect(() => {
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setInteractive(${interactive ? 'true' : 'false'});true;`,
    );
  }, [interactive, ready]);

  useEffect(() => {
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setPaused(${paused ? 'true' : 'false'});true;`,
    );
  }, [paused, ready]);

  useEffect(() => {
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    const val = typeof bodyHeightM === 'number' && Number.isFinite(bodyHeightM) ? bodyHeightM : null;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setBodyHeight(${JSON.stringify(val)});true;`,
    );
  }, [bodyHeightM, ready]);

  useEffect(() => {
    if (!ready) return;
    if (driveInput) {
      sendDriveToWebView(driveInput.driveX, driveInput.driveY, driveInput.turnX);
    }
  }, [driveInput?.driveX, driveInput?.driveY, driveInput?.turnX, ready]);

  useEffect(() => {
    if (!ready) return;
    const initial = getStandbyDriveInput();
    if (initial.driveX !== 0 || initial.driveY !== 0 || initial.turnX !== 0) {
      sendDriveToWebView(initial.driveX, initial.driveY, initial.turnX, true);
    }
    const unsubscribe = subscribeStandbyDriveInput(sample => {
      sendDriveToWebView(sample.driveX, sample.driveY, sample.turnX);
    });
    return () => {
      unsubscribe();
      if (trailingDriveTimerRef.current) {
        clearTimeout(trailingDriveTimerRef.current);
        trailingDriveTimerRef.current = null;
      }
      pendingDriveRef.current = null;
    };
  }, [ready]);

  const handleMessage = (event: { nativeEvent?: { data?: string } }) => {
    try {
      const payload = JSON.parse(String(event?.nativeEvent?.data ?? '{}')) as { type?: string };
      if (payload.type === 'ready') {
        setReady(true);
      } else if (payload.type === 'error') {
        setFailed(true);
      }
    } catch { /* Ignore non-JSON messages. */ }
  };

  return (
    <View
      pointerEvents={interactive && canRender3d ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
      testID="control-standby-3d-stage"
    >
      {canRender3d && NativeWebView ? (
        <NativeWebView
          ref={webViewRef}
          allowFileAccess
          allowFileAccessFromFileURLs
          androidLayerType="hardware"
          bounces={false}
          domStorageEnabled
          javaScriptEnabled
          onError={() => setFailed(true)}
          onMessage={handleMessage}
          originWhitelist={['*']}
          overScrollMode="never"
          scrollEnabled={false}
          setBuiltInZoomControls={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          source={{ uri: initialUri }}
          style={styles.webview}
          testID="control-standby-3d-webview"
        />
      ) : null}
      {!posterHidden || !canRender3d ? (
        <StaticPosterLayer opacity={posterOpacity} scene={normalized} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    backgroundColor: '#06090d',
    flex: 1,
  },
  posterImg: {
    height: '100%',
    width: '100%',
  },
  posterTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 12, 12, 0.14)',
  },
});
