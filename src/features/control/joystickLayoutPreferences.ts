export type JoystickOrientation = 'portrait' | 'landscape';
export type JoystickSide = 'left' | 'right';
export type JoystickPlacement = Readonly<{ sizeScale: number; x: number; y: number }>;
export type JoystickLayout = Readonly<Record<JoystickSide, JoystickPlacement>>;
export type JoystickLayoutPreferences = Readonly<{
  version: 1;
  portrait: JoystickLayout;
  landscape: JoystickLayout;
}>;
export type JoystickDiscRect = Readonly<{
  size: number; centerX: number; centerY: number; left: number; top: number;
}>;
export type ResolvedJoystickLayout = Readonly<{
  left: JoystickDiscRect; right: JoystickDiscRect; usable: boolean;
}>;

export const JOYSTICK_LAYOUT_STORAGE_KEY = 'doso.control.joystick-layout.v1';
export const JOYSTICK_SIZE_MIN = 0.75;
export const JOYSTICK_SIZE_MAX = 1.75;
export const JOYSTICK_SIZE_STEP = 0.125;
export const JOYSTICK_POSITION_STEP = 0.05;

const DEFAULTS_REVISION = 2;
const initialLayout = (orientation: JoystickOrientation = 'portrait'): JoystickLayout => orientation === 'landscape'
  ? { left: { sizeScale: 1.35, x: 0.08, y: 0.8 }, right: { sizeScale: 1.35, x: 0.92, y: 0.8 } }
  : { left: { sizeScale: 1, x: 0, y: 0.5 }, right: { sizeScale: 1, x: 1, y: 0.5 } };
export function createDefaultJoystickLayoutPreferences(): JoystickLayoutPreferences {
  return { version: 1, portrait: initialLayout('portrait'), landscape: initialLayout('landscape') };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function bounded(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000 : fallback;
}
function placement(value: unknown, fallback: JoystickPlacement): JoystickPlacement {
  const source = record(value);
  return {
    sizeScale: bounded(source?.sizeScale, JOYSTICK_SIZE_MIN, JOYSTICK_SIZE_MAX, fallback.sizeScale),
    x: bounded(source?.x, 0, 1, fallback.x),
    y: bounded(source?.y, 0, 1, fallback.y),
  };
}
function layout(value: unknown, orientation: JoystickOrientation = 'portrait'): JoystickLayout {
  const source = record(value), defaults = initialLayout(orientation);
  return { left: placement(source?.left, defaults.left), right: placement(source?.right, defaults.right) };
}

export function normalizeJoystickLayoutPreferences(value: unknown): JoystickLayoutPreferences {
  const source = record(value);
  if (source?.version !== 1) return createDefaultJoystickLayoutPreferences();
  return { version: 1, portrait: layout(source.portrait, 'portrait'), landscape: layout(source.landscape, 'landscape') };
}

export function updateJoystickPlacement(
  preferences: JoystickLayoutPreferences,
  orientation: JoystickOrientation,
  side: JoystickSide,
  patch: Partial<JoystickPlacement>,
): JoystickLayoutPreferences {
  const current = normalizeJoystickLayoutPreferences(preferences);
  const previous = current[orientation][side];
  return { ...current, [orientation]: {
    ...current[orientation], [side]: placement({ ...previous, ...patch }, previous),
  } };
}

export function resetJoystickLayout(
  preferences: JoystickLayoutPreferences,
  orientation: JoystickOrientation,
): JoystickLayoutPreferences {
  return { ...normalizeJoystickLayoutPreferences(preferences), [orientation]: initialLayout(orientation) };
}

/** Positions refer to the remaining travel area inside each half, not screen pixels. */
export function resolveJoystickLayout(
  requested: JoystickLayout,
  dimensions: Readonly<{ width: number; height: number; baseSize: number }>,
): ResolvedJoystickLayout {
  const width = bounded(dimensions.width, 0, 100_000, 0);
  const height = bounded(dimensions.height, 0, 100_000, 0);
  const baseSize = bounded(dimensions.baseSize, 0, 10_000, 0);
  const current = layout(requested);
  // Keep the two pads on opposite halves, with a small central separation.
  const gutter = Math.min(8, width);
  const halfWidth = Math.max(0, (width - gutter) / 2);
  const maxSize = Math.floor(Math.min(halfWidth, height));
  const disc = (side: JoystickSide): JoystickDiscRect => {
    const value = current[side];
    const size = baseSize > 0 ? Math.min(maxSize, Math.max(48, Math.round(baseSize * value.sizeScale))) : 0;
    const start = side === 'left' ? 0 : halfWidth + gutter;
    const left = start + Math.max(0, halfWidth - size) * value.x;
    const top = Math.max(0, height - size) * value.y;
    return { size, left, top, centerX: left + size / 2, centerY: top + size / 2 };
  };
  const left = disc('left'), right = disc('right');
  return { left, right, usable: left.size >= 48 && right.size >= 48 };
}

export type JoystickLayoutStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;
export class JoystickLayoutStorageError extends Error {
  constructor() { super('摇杆布局暂未保存'); this.name = 'JoystickLayoutStorageError'; }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function isLegacyLandscapeDefault(value: unknown) {
  const source = record(value), left = record(source?.left), right = record(source?.right);
  return !!source && !!left && !!right && hasExactKeys(source, ['left', 'right'])
    && hasExactKeys(left, ['sizeScale', 'x', 'y']) && hasExactKeys(right, ['sizeScale', 'x', 'y'])
    && left.sizeScale === 1 && left.x === 0 && left.y === 0.5
    && right.sizeScale === 1 && right.x === 1 && right.y === 0.5;
}

export function createJoystickLayoutPreferenceStore(storage: JoystickLayoutStorage) {
  let writes: Promise<void> = Promise.resolve();
  return {
    async load(): Promise<JoystickLayoutPreferences> {
      try {
        await writes.catch(() => undefined);
        const text = await storage.getItem(JOYSTICK_LAYOUT_STORAGE_KEY);
        if (text === null) return createDefaultJoystickLayoutPreferences();
        try {
          const parsed: unknown = JSON.parse(text);
          const source = record(parsed);
          const preferences = normalizeJoystickLayoutPreferences(parsed);
          // Migrate only the exact unmarked old factory pair. Any custom value
          // or newer save remains authoritative; loading never writes storage.
          return source?.version === 1 && source.defaultsRevision === undefined && isLegacyLandscapeDefault(source.landscape)
            ? { ...preferences, landscape: initialLayout('landscape') } : preferences;
        }
        catch { return createDefaultJoystickLayoutPreferences(); }
      } catch { throw new JoystickLayoutStorageError(); }
    },
    save(preferences: JoystickLayoutPreferences): Promise<void> {
      // Keep schema/key v1. The marker distinguishes future explicit user saves
      // at the former default coordinates from an untouched legacy factory pair.
      const text = JSON.stringify({ ...normalizeJoystickLayoutPreferences(preferences), defaultsRevision: DEFAULTS_REVISION });
      // Complete writes in order so a slow older save cannot overwrite a newer edit.
      const operation = writes.catch(() => undefined).then(async () => {
        try { await storage.setItem(JOYSTICK_LAYOUT_STORAGE_KEY, text); }
        catch { throw new JoystickLayoutStorageError(); }
      });
      writes = operation;
      return operation;
    },
  };
}

const localStore = createJoystickLayoutPreferenceStore({
  async getItem(key) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') return (await import('expo-secure-store')).getItemAsync(key);
    if (typeof localStorage === 'undefined') throw new JoystickLayoutStorageError();
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') return (await import('expo-secure-store')).setItemAsync(key, value);
    if (typeof localStorage === 'undefined') throw new JoystickLayoutStorageError();
    localStorage.setItem(key, value);
  },
});
export const loadJoystickLayoutPreferences = () => localStore.load();
export const saveJoystickLayoutPreferences = (preferences: JoystickLayoutPreferences) => localStore.save(preferences);
