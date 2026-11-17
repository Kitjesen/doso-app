import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Device-local viewer credential. Never an EXPO_PUBLIC value and never logged. */
export const VIDEO_PROBE_VIEWER_TOKEN_KEY = 'doso.video-probe.viewer-token';

export async function readVideoProbeViewerToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const value = await SecureStore.getItemAsync(VIDEO_PROBE_VIEWER_TOKEN_KEY);
    if (typeof value !== 'string') return null;
    const token = value.trim();
    if (!token || token.length > 4096 || /[\r\n]/.test(token)) return null;
    return token;
  } catch {
    return null;
  }
}
