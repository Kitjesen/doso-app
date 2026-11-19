import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type ViewProps } from 'react-native';

// Presentation only: callers update permissions immediately and unmount without an exit delay.
export function ControlPanelMotion({ children, style, ...props }: ViewProps) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const finish = () => { animation?.stop(); progress.setValue(1); };
    // Headless web and a hanging preference check would otherwise leave the block invisible.
    const timeout = setTimeout(() => { if (active) finish(); }, 250);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', () => {
      preferenceChanged = true;
      if (active) finish();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active || preferenceChanged) return;
      if (reduced) { finish(); return; }
      animation = Animated.timing(progress, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
      });
      animation.start();
    }, () => { if (active && !preferenceChanged) finish(); });
    return () => { active = false; clearTimeout(timeout); animation?.stop(); subscription.remove(); };
  }, [progress]);
  return <Animated.View {...props} style={[style, {
    opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  }]}>{children}</Animated.View>;
}
