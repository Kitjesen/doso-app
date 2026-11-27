import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';

import {
  getStandbySceneAsset,
  normalizeStandbyScene,
  type StandbySceneId,
} from './standbyScenes';
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
  bodyHeightM?: number | null,
): string {
  const parts = [
    `scene=${encodeURIComponent(scene)}`,
    `accent=${encodeURIComponent(accentTone)}`,
    `interactive=${interactive ? '1' : '0'}`,
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
    const query = buildQuery(normalized, accentTone, interactive, bodyHeightM);
    return `file:///android_asset/standby3d/index.html?${query}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!ready || !webViewRef.current?.injectJavaScript) return;
    const dx = Number.isFinite(driveInput?.driveX) ? Number(driveInput?.driveX) : 0;
    const dy = Number.isFinite(driveInput?.driveY) ? Number(driveInput?.driveY) : 0;
    const tx = Number.isFinite(driveInput?.turnX) ? Number(driveInput?.turnX) : 0;
    webViewRef.current.injectJavaScript(
      `window.__dosoStandby3d&&window.__dosoStandby3d.setDriveInput(${dx.toFixed(3)},${dy.toFixed(3)},${tx.toFixed(3)});true;`,
    );
  }, [driveInput?.driveX, driveInput?.driveY, driveInput?.turnX, ready]);

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
    backgroundColor: 'transparent',
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
