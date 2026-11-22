export type VideoQualityPreset = '流畅' | '标清' | '高清' | '超清';

export type ControlUserPreferences = Readonly<{
  version: 1;
  sensitivityPercent: number;
  mirroredSticks: boolean;
  showVirtualDiscControls: boolean;
  lowLatencyMode: boolean;
  speedLimitPercent: number;
  docksExpanded: boolean | null;
  showOverlay: boolean;
  dualCameraEnabled: boolean | null;
  videoQuality: VideoQualityPreset;
  autoRecord: boolean;
  soundVolumePercent: number;
  voiceBroadcastEnabled: boolean;
}>;

export const CONTROL_USER_PREFERENCES_KEY = 'doso.control.preferences.v1';

const VALID_QUALITIES: readonly VideoQualityPreset[] = ['流畅', '标清', '高清', '超清'];

export function clampSensitivityPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.min(150, Math.max(50, Math.round(value / 10) * 10));
}

export function clampVolumePercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 80;
  return Math.min(100, Math.max(0, Math.round(value / 10) * 10));
}

export function clampSpeedPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(10, Math.round(value)));
}

export function createDefaultControlPreferences(): ControlUserPreferences {
  return {
    version: 1,
    sensitivityPercent: 100,
    mirroredSticks: false,
    showVirtualDiscControls: true,
    lowLatencyMode: true,
    speedLimitPercent: 100,
    docksExpanded: null,
    showOverlay: true,
    dualCameraEnabled: null,
    videoQuality: '高清',
    autoRecord: false,
    soundVolumePercent: 80,
    voiceBroadcastEnabled: true,
  };
}

export function normalizeControlPreferences(raw: unknown): ControlUserPreferences {
  const defaults = createDefaultControlPreferences();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const src = raw as Record<string, unknown>;
  const quality = VALID_QUALITIES.includes(src.videoQuality as VideoQualityPreset)
    ? (src.videoQuality as VideoQualityPreset)
    : defaults.videoQuality;
  return {
    version: 1,
    sensitivityPercent: clampSensitivityPercent(src.sensitivityPercent),
    mirroredSticks: typeof src.mirroredSticks === 'boolean' ? src.mirroredSticks : defaults.mirroredSticks,
    showVirtualDiscControls: typeof src.showVirtualDiscControls === 'boolean' ? src.showVirtualDiscControls : defaults.showVirtualDiscControls,
    lowLatencyMode: typeof src.lowLatencyMode === 'boolean' ? src.lowLatencyMode : defaults.lowLatencyMode,
    speedLimitPercent: clampSpeedPercent(src.speedLimitPercent),
    docksExpanded: typeof src.docksExpanded === 'boolean' ? src.docksExpanded : null,
    showOverlay: typeof src.showOverlay === 'boolean' ? src.showOverlay : defaults.showOverlay,
    dualCameraEnabled: typeof src.dualCameraEnabled === 'boolean' ? src.dualCameraEnabled : null,
    videoQuality: quality,
    autoRecord: typeof src.autoRecord === 'boolean' ? src.autoRecord : defaults.autoRecord,
    soundVolumePercent: clampVolumePercent(src.soundVolumePercent),
    voiceBroadcastEnabled: typeof src.voiceBroadcastEnabled === 'boolean' ? src.voiceBroadcastEnabled : defaults.voiceBroadcastEnabled,
  };
}

export function applyJoystickSensitivity<T extends { readonly x: number; readonly y: number }>(
  vector: T,
  sensitivityPercent: number,
): T {
  const clamped = clampSensitivityPercent(sensitivityPercent);
  if (clamped === 100 || (vector.x === 0 && vector.y === 0)) return vector;
  const mag = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(mag) || mag <= 0) return vector;
  const ratio = clamped / 100;
  // Below 100% softens mid-stick response for fine positioning; above 100% steepens response while clamping at 1.0.
  const exponent = ratio < 1 ? 1 + (1 - ratio) * 0.8 : Math.max(0.65, 1 - (ratio - 1) * 0.55);
  const targetMag = Math.min(1, Math.pow(Math.min(1, mag), exponent) * ratio);
  const factor = targetMag / mag;
  return {
    ...vector,
    x: vector.x === 0 ? 0 : vector.x * factor,
    y: vector.y === 0 ? 0 : vector.y * factor,
  };
}

export function applyForwardDirection<T extends { readonly x: number; readonly y: number }>(
  vector: T,
  direction: 'front' | 'rear',
): T {
  if (direction !== 'rear' || (vector.x === 0 && vector.y === 0)) return vector;
  return {
    ...vector,
    x: vector.x === 0 ? 0 : -vector.x,
    y: vector.y === 0 ? 0 : -vector.y,
  };
}

export function videoQualitySpec(quality: VideoQualityPreset): Readonly<{ height: number; bitrate: number; label: string }> {
  switch (quality) {
    case '流畅': return { height: 360, bitrate: 800_000, label: '360p' };
    case '标清': return { height: 540, bitrate: 1_600_000, label: '540p' };
    case '超清': return { height: 1080, bitrate: 6_000_000, label: '1080p' };
    case '高清':
    default: return { height: 720, bitrate: 3_000_000, label: '720p' };
  }
}

export function applyVideoStreamPreferences(
  stream: unknown,
  quality: VideoQualityPreset,
  lowLatency: boolean,
): void {
  if (!stream || typeof stream !== 'object') return;
  const getVideoTracks = (stream as { getVideoTracks?: () => unknown[] }).getVideoTracks;
  if (typeof getVideoTracks !== 'function') return;
  const spec = videoQualitySpec(quality);
  for (const track of getVideoTracks.call(stream) ?? []) {
    if (!track || typeof track !== 'object') continue;
    const applyConstraints = (track as { applyConstraints?: (c: unknown) => Promise<void> }).applyConstraints;
    if (typeof applyConstraints === 'function') {
      void applyConstraints.call(track, { height: { ideal: spec.height } }).catch(() => undefined);
    }
    if ('contentHint' in (track as Record<string, unknown>)) {
      try {
        (track as { contentHint?: string }).contentHint = lowLatency ? 'motion' : 'detail';
      } catch { /* Ignore read-only track property. */ }
    }
  }
}

export async function loadControlPreferences(): Promise<ControlUserPreferences> {
  try {
    const { Platform } = await import('react-native');
    let raw: string | null = null;
    if (Platform.OS !== 'web') {
      raw = await (await import('expo-secure-store')).getItemAsync(CONTROL_USER_PREFERENCES_KEY);
    } else if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(CONTROL_USER_PREFERENCES_KEY);
    }
    if (!raw) return createDefaultControlPreferences();
    return normalizeControlPreferences(JSON.parse(raw));
  } catch {
    return createDefaultControlPreferences();
  }
}

export async function saveControlPreferences(preferences: ControlUserPreferences): Promise<void> {
  try {
    const serialized = JSON.stringify(normalizeControlPreferences(preferences));
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') {
      await (await import('expo-secure-store')).setItemAsync(CONTROL_USER_PREFERENCES_KEY, serialized);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONTROL_USER_PREFERENCES_KEY, serialized);
    }
  } catch {
    /* Non-fatal preference persistence failure. */
  }
}

export async function estimateClientStorageGb(): Promise<Readonly<{ usedGb: number; totalGb: number }> | null> {
  try {
    const nav = typeof navigator !== 'undefined'
      ? (navigator as { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } })
      : undefined;
    if (nav?.storage && typeof nav.storage.estimate === 'function') {
      const est = await nav.storage.estimate();
      if (typeof est?.quota === 'number' && Number.isFinite(est.quota) && est.quota > 0) {
        const totalGb = Math.max(0.1, Math.round((est.quota / (1024 ** 3)) * 10) / 10);
        const usedGb = Math.max(0, Math.round(((est.usage ?? 0) / (1024 ** 3)) * 100) / 100);
        return { usedGb, totalGb };
      }
    }
  } catch {
    /* StorageManager unavailable. */
  }
  return null;
}

export function playControlFeedbackCue(
  text: string,
  volumePercent: number,
  voiceEnabled: boolean,
): void {
  const vol = clampVolumePercent(volumePercent) / 100;
  if (vol <= 0) return;
  try {
    const g = globalThis as {
      speechSynthesis?: { cancel?: () => void; speak?: (u: unknown) => void };
      SpeechSynthesisUtterance?: new (t: string) => { lang: string; rate: number; volume: number };
      AudioContext?: new () => {
        createOscillator: () => { type: string; frequency: { value: number }; connect: (n: unknown) => void; start: () => void; stop: (t: number) => void };
        createGain: () => { gain: { value: number }; connect: (n: unknown) => void };
        destination: unknown;
        currentTime: number;
        close?: () => Promise<void>;
      };
    };
    if (voiceEnabled && g.speechSynthesis && typeof g.speechSynthesis.speak === 'function' && typeof g.SpeechSynthesisUtterance === 'function') {
      const utter = new g.SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.15;
      utter.volume = vol;
      g.speechSynthesis.cancel?.();
      g.speechSynthesis.speak(utter);
      return;
    }
    if (typeof g.AudioContext === 'function') {
      const ctx = new g.AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.value = Math.min(0.25, vol * 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
      setTimeout(() => { void ctx.close?.().catch(() => undefined); }, 150);
    }
  } catch {
    /* Headless / unsupported audio runtime. */
  }
}

export type LocalMicrophoneSession = Readonly<{
  stop: () => void;
}>;

export async function startLocalMicrophoneCapture(): Promise<LocalMicrophoneSession> {
  const nav = typeof navigator !== 'undefined'
    ? (navigator as { mediaDevices?: { getUserMedia?: (c: { audio: boolean }) => Promise<{ getTracks?: () => Array<{ stop?: () => void }> }> } })
    : undefined;
  if (!nav?.mediaDevices || typeof nav.mediaDevices.getUserMedia !== 'function') {
    throw new Error('当前环境不支持麦克风采集');
  }
  const stream = await nav.mediaDevices.getUserMedia({ audio: true });
  return {
    stop() {
      for (const track of stream?.getTracks?.() ?? []) {
        try { track.stop?.(); } catch { /* Ignore track stop error. */ }
      }
    },
  };
}
