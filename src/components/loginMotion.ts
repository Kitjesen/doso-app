import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform } from 'react-native';

export function useLoginMotion() {
  const entrance = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    let reduced: boolean | undefined;
    let foreground = AppState.currentState === 'active';
    let entered = false;
    let intro: Animated.CompositeAnimation | undefined;
    let loop: Animated.CompositeAnimation | undefined;
    const useNativeDriver = Platform.OS !== 'web';
    const stop = () => {
      intro?.stop();
      loop?.stop();
      intro = undefined;
      loop = undefined;
    };
    const update = () => {
      if (!active) return;
      stop();
      if (reduced !== false || !foreground) {
        entered = true;
        entrance.setValue(1);
        drift.setValue(0.5);
        return;
      }
      if (!entered) {
        entered = true;
        intro = Animated.timing(entrance, {
          toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver,
        });
        intro.start();
      } else entrance.setValue(1);
      drift.setValue(0);
      loop = Animated.loop(Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver, isInteraction: false }),
        Animated.timing(drift, { toValue: 0, duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver, isInteraction: false }),
      ]));
      loop.start();
    };
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      reduced = value;
      update();
    });
    const appSubscription = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      update();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (!active || preferenceChanged) return;
      reduced = value;
      update();
    }, () => {
      if (!active || preferenceChanged) return;
      reduced = true;
      update();
    });
    return () => {
      active = false;
      stop();
      motionSubscription.remove();
      appSubscription.remove();
    };
  }, [entrance, drift]);

  return {
    intro: { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
    glow: { transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-36, 36] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 24] }) },
    ] },
  };
}
