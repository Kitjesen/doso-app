import {
  mountStandby3dScene,
  type Standby3dAccentTone,
  type Standby3dController,
  type Standby3dSceneId,
} from './standby3dScene';

declare global {
  interface Window {
    __DOSO_STANDBY_GLB_B64__?: string;
    __DOSO_FOREST_KIT_B64__?: string;
    __DOSO_FOREST_SKY_URI__?: string;
    __DOSO_FOREST_HDR_B64__?: string;
    __dosoStandby3d?: Standby3dController;
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
  }
}

function postToNative(payload: Record<string, unknown>) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  } catch { /* Non-WebView host. */ }
}

function parseQueryParams(): {
  scene: Standby3dSceneId;
  accentTone: Standby3dAccentTone;
  interactive: boolean;
  bodyHeightM: number | null;
} {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const rawScene = params.get('scene');
    const scene: Standby3dSceneId =
      rawScene === 'charcoal' || rawScene === 'gallery' || rawScene === 'hangar' || rawScene === 'forest'
        ? rawScene
        : 'forest';
    const accentTone: Standby3dAccentTone = params.get('accent') === 'fsdBlue' ? 'fsdBlue' : 'graphite';
    const interactive = params.get('interactive') !== '0';
    const rawHeight = params.get('height');
    const parsedHeight = rawHeight !== null ? Number(rawHeight) : NaN;
    return {
      scene,
      accentTone,
      interactive,
      bodyHeightM: Number.isFinite(parsedHeight) ? parsedHeight : null,
    };
  } catch {
    return { scene: 'forest', accentTone: 'graphite', interactive: true, bodyHeightM: null };
  }
}

function bootstrap() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) {
    postToNative({ type: 'error', message: 'Missing canvas element' });
    return;
  }
  const initial = parseQueryParams();
  try {
    const controller = mountStandby3dScene(canvas, {
      glbBase64: window.__DOSO_STANDBY_GLB_B64__,
      glbUrl: window.__DOSO_STANDBY_GLB_B64__ ? undefined : './thunder-r50-standby.glb',
      forestKitBase64: window.__DOSO_FOREST_KIT_B64__,
      forestSkyUrl: window.__DOSO_FOREST_SKY_URI__,
      forestHdrBase64: window.__DOSO_FOREST_HDR_B64__,
      scene: initial.scene,
      accentTone: initial.accentTone,
      interactive: initial.interactive,
      bodyHeightM: initial.bodyHeightM,
      onReady: () => postToNative({ type: 'ready' }),
      onError: message => postToNative({ type: 'error', message }),
      onUserMovedChange: moved => postToNative({ type: 'userMoved', moved }),
    });
    window.__dosoStandby3d = controller;
    // Free raw base64 strings after GLTFLoader/RGBELoader have consumed ArrayBuffers.
    delete window.__DOSO_STANDBY_GLB_B64__;
    delete window.__DOSO_FOREST_KIT_B64__;
    delete window.__DOSO_FOREST_SKY_URI__;
    delete window.__DOSO_FOREST_HDR_B64__;
  } catch (err) {
    postToNative({
      type: 'error',
      message: err instanceof Error ? err.message : String(err ?? '3D init failed'),
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
