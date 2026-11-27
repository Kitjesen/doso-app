import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import {
  getStandbySceneAsset,
  normalizeStandbyScene,
  type StandbySceneId,
} from './standbyScenes';
import {
  mountStandby3dScene,
  type Standby3dController,
} from './standby3d/standby3dScene';
import type { StandbyScene3DProps } from './StandbyScene3D';

const STANDBY_GLB_ASSET = require('../../assets/models/thunder-r50-standby.glb') as string | { uri?: string; default?: string };
const FOREST_KIT_GLB_ASSET = require('../../assets/models/forest-kit-photoreal.glb') as string | { uri?: string; default?: string };
const FOREST_SKY_JPG_ASSET = require('../../assets/models/forest-sky-misty-pines.jpg') as string | { uri?: string; default?: string };
const FOREST_HDR_ASSET = require('../../assets/models/forest-ibl-misty-pines.hdr') as string | { uri?: string; default?: string };

function resolveAssetUrl(asset: string | { uri?: string; default?: string }): string {
  if (typeof asset === 'string') return asset;
  if (typeof asset?.uri === 'string') return asset.uri;
  if (typeof asset?.default === 'string') return asset.default;
  return '';
}

function StaticPosterLayer({
  scene,
  opacity,
}: {
  scene: StandbySceneId;
  opacity: Animated.Value;
}) {
  const normalized = normalizeStandbyScene(scene);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={getStandbySceneAsset(normalized)}
        style={[StyleSheet.absoluteFill, styles.posterImg]}
      />
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
  const hostRef = useRef<View | null>(null);
  const controllerRef = useRef<Standby3dController | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterHidden, setPosterHidden] = useState(false);
  const posterOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const hostEl = hostRef.current as unknown as HTMLElement | null;
    if (!hostEl || typeof document === 'undefined' || typeof hostEl.appendChild !== 'function') {
      setFailed(true);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.dataset.testid = 'control-standby-3d-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    hostEl.appendChild(canvas);

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    try {
      const glbUrl = resolveAssetUrl(STANDBY_GLB_ASSET);
      const forestKitUrl = resolveAssetUrl(FOREST_KIT_GLB_ASSET);
      const forestSkyUrl = resolveAssetUrl(FOREST_SKY_JPG_ASSET);
      const forestHdrUrl = resolveAssetUrl(FOREST_HDR_ASSET);
      const controller = mountStandby3dScene(canvas, {
        glbUrl,
        forestKitUrl,
        forestSkyUrl,
        forestHdrUrl,
        scene: normalized,
        accentTone,
        interactive,
        bodyHeightM,
        onReady: () => {
          if (!disposed) setReady(true);
        },
        onError: () => {
          if (!disposed) setFailed(true);
        },
      });
      controllerRef.current = controller;
      (window as unknown as { __dosoStandby3d?: Standby3dController }).__dosoStandby3d = controller;
      if (paused) controller.setPaused(true);

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
          controller.resize(hostEl.clientWidth, hostEl.clientHeight);
        });
        resizeObserver.observe(hostEl);
      }
    } catch {
      setFailed(true);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const ctrl = controllerRef.current;
      controllerRef.current = null;
      if (ctrl) {
        const win = window as unknown as { __dosoStandby3d?: Standby3dController };
        if (win.__dosoStandby3d === ctrl) delete win.__dosoStandby3d;
        ctrl.dispose();
      }
      if (canvas.parentNode === hostEl) {
        hostEl.removeChild(canvas);
      }
    };
    // Mount WebGL context once per standby session; reactive props sync via lightweight setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (typeof Animated.timing === 'function') {
      Animated.timing(posterOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setPosterHidden(true);
      });
    } else {
      posterOpacity.setValue(0);
      setPosterHidden(true);
    }
  }, [posterOpacity, ready]);

  useEffect(() => {
    controllerRef.current?.setScene(normalized);
  }, [normalized]);

  useEffect(() => {
    controllerRef.current?.setAccentTone(accentTone);
  }, [accentTone]);

  useEffect(() => {
    controllerRef.current?.setInteractive(interactive);
  }, [interactive]);

  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    controllerRef.current?.setBodyHeight(bodyHeightM);
  }, [bodyHeightM]);

  useEffect(() => {
    controllerRef.current?.setDriveInput(
      driveInput?.driveX ?? 0,
      driveInput?.driveY ?? 0,
      driveInput?.turnX ?? 0,
    );
  }, [driveInput?.driveX, driveInput?.driveY, driveInput?.turnX]);

  return (
    <View
      pointerEvents={interactive && !failed ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
      testID="control-standby-3d-stage"
    >
      <View ref={hostRef} style={StyleSheet.absoluteFill} />
      {!posterHidden || failed ? (
        <StaticPosterLayer opacity={posterOpacity} scene={normalized} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  posterImg: {
    height: '100%',
    width: '100%',
  },
  posterTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 12, 12, 0.14)',
  },
});
