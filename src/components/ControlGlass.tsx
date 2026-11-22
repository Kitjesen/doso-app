import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

// Older installed APKs can render the tint before the native blur module is rebuilt.
const blur: typeof import('expo-blur') | null = Platform.OS === 'web' || requireOptionalNativeModule('ExpoBlur')
  ? require('expo-blur') : null;
export const ControlGlassTarget = blur?.BlurTargetView ?? View;

export function useControlGlass(isDark: boolean, immersive = false) {
  const target = useRef<View | null>(null);
  const [opaque, setOpaque] = useState(Platform.OS === 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true;
      if (active) setOpaque(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active && !changed) setOpaque(value);
    }, () => {});
    return () => { active = false; listener.remove(); };
  }, []);
  return {
    target,
    canvas: immersive ? '#182432' : isDark ? '#17191D' : '#F9F9FB',
    surface: immersive ? opaque ? '#374554' : 'rgba(136,153,175,0.17)' : opaque ? isDark ? '#212225' : '#FFFFFF'
      : isDark ? 'rgba(33,34,37,0.88)' : 'rgba(255,255,255,0.86)',
    ink: immersive ? '#FCFCFD' : isDark ? '#F0F0F3' : '#1C2024',
    muted: immersive ? 'rgba(252,252,253,0.72)' : isDark ? '#B5B5BD' : '#60646C',
    border: immersive ? 'rgba(252,252,253,0.30)' : isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.04)',
    backdrop: () => !opaque && blur ? <blur.BlurView pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={immersive ? 38 : 32}
      tint={immersive ? 'dark' : isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null,
  };
}
