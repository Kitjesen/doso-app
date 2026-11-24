import { Platform, Vibration } from 'react-native';

export type ControlHapticKind = 'tap' | 'confirm' | 'step' | 'estop' | 'alert';

const HAPTIC_PATTERNS: Record<ControlHapticKind, number | number[]> = {
  step: 10,
  tap: 14,
  confirm: 20,
  alert: [0, 35, 55, 45],
  estop: [0, 50, 55, 85],
};

type WebVibrateNavigator = {
  vibrate?: (pattern: number | number[]) => boolean;
};

export function triggerControlHaptic(kind: ControlHapticKind): void {
  const pattern = HAPTIC_PATTERNS[kind];
  if (pattern === undefined) return;
  try {
    if (Platform.OS === 'web') {
      const nav = (globalThis as { navigator?: WebVibrateNavigator }).navigator;
      if (typeof nav?.vibrate === 'function') {
        const webPattern = Array.isArray(pattern) && pattern[0] === 0 ? pattern.slice(1) : pattern;
        nav.vibrate(webPattern);
      }
      return;
    }
    if (typeof Vibration?.vibrate === 'function') {
      Vibration.vibrate(pattern);
    }
  } catch {
    // Never throw from optional haptic feedback (e.g. Node unit tests or restricted devices).
  }
}
