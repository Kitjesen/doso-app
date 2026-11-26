import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { Text } from './AppText';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch {
    // New Architecture ignores this legacy flag safely.
  }
}

export function triggerFsdLayoutSpring() {
  try {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.86 },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
  } catch {
    // Safe fallback for environments without LayoutAnimation.
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo?.isReduceMotionEnabled?.().then(val => {
      if (active) setReduced(Boolean(val));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return reduced;
}

export type FsdSegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}>;

/**
 * Tesla FSD matte charcoal gliding segmented pill powered by Animated.spring.
 */
export function FsdSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accentBg = '#343434',
  accentTextColor = '#F2F2F2',
  trackBg = '#181818',
  compact = false,
  style,
  testID,
}: {
  options: readonly FsdSegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  accentBg?: string;
  accentTextColor?: string;
  trackBg?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const count = Math.max(1, options.length);
  const selectedIndex = Math.max(0, options.findIndex(opt => opt.value === value));
  const translateX = useRef(new Animated.Value(0)).current;
  const padding = 2;
  const pillWidth = trackWidth > padding * 2 ? (trackWidth - padding * 2) / count : 0;

  useEffect(() => {
    if (pillWidth <= 0) return;
    const target = selectedIndex * pillWidth;
    if (reduced || typeof Animated.spring !== 'function') {
      translateX.setValue(target);
      return;
    }
    Animated.spring(translateX, {
      toValue: target,
      damping: 22,
      stiffness: 340,
      mass: 0.72,
      useNativeDriver: Platform?.OS !== 'web',
    }).start();
  }, [pillWidth, reduced, selectedIndex, translateX]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextW = event.nativeEvent.layout.width;
    if (Number.isFinite(nextW) && nextW > 0 && Math.abs(nextW - trackWidth) > 0.5) {
      setTrackWidth(nextW);
      translateX.setValue(selectedIndex * ((nextW - padding * 2) / count));
    }
  };

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.segTrack,
        compact && styles.segTrackCompact,
        { backgroundColor: trackBg },
        style,
      ]}
      testID={testID}
    >
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segPill,
            compact && styles.segPillCompact,
            {
              backgroundColor: accentBg,
              width: pillWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}
      {options.map(option => {
        const selected = option.value === value;
        const disabled = Boolean(option.disabled);
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            onPress={() => {
              if (!disabled && option.value !== value) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segBtn,
              compact && styles.segBtnCompact,
              pillWidth <= 0 && selected && { backgroundColor: accentBg, borderRadius: compact ? 6 : 8 },
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
            testID={option.testID}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segLabel,
                compact && styles.segLabelCompact,
                selected && [styles.segLabelActive, { color: accentTextColor }],
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Spring elastic toggle switch with soft matte charcoal track & active accent.
 */
export function FsdSwitch({
  checked,
  disabled = false,
  onPress,
  activeTrackColor = '#EAEAEA',
  activeThumbColor = '#161616',
  accessibilityLabel,
  accessibilityState,
  testID,
}: {
  checked?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  activeTrackColor?: string;
  activeThumbColor?: string;
  accessibilityLabel: string;
  accessibilityState?: Readonly<{ checked?: boolean; disabled?: boolean }>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const isOn = Boolean(checked);
  const progress = useRef(new Animated.Value(isOn ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const target = isOn ? 1 : 0;
    if (reduced || typeof Animated.spring !== 'function') {
      progress.setValue(target);
      return;
    }
    Animated.spring(progress, {
      toValue: target,
      damping: 20,
      stiffness: 360,
      mass: 0.65,
      useNativeDriver: Platform?.OS !== 'web',
    }).start();
  }, [isOn, progress, reduced]);

  const thumbX = typeof progress.interpolate === 'function'
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] })
    : (isOn ? 18 : 0);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={accessibilityState ?? { checked, disabled: Boolean(disabled || !onPress) }}
      accessibilityValue={{ text: checked === undefined ? '未设置' : checked ? '开启' : '关闭' }}
      aria-checked={checked}
      disabled={Boolean(disabled || !onPress)}
      hitSlop={8}
      onPress={onPress}
      onPressIn={() => {
        if (!disabled && onPress && !reduced && typeof Animated.spring === 'function') {
          Animated.spring(pressScale, { toValue: 0.94, damping: 18, stiffness: 420, useNativeDriver: Platform?.OS !== 'web' }).start();
        }
      }}
      onPressOut={() => {
        if (!reduced && typeof Animated.spring === 'function') {
          Animated.spring(pressScale, { toValue: 1, damping: 16, stiffness: 320, useNativeDriver: Platform?.OS !== 'web' }).start();
        }
      }}
      style={[
        styles.switchTrack,
        {
          backgroundColor: isOn ? activeTrackColor : '#181818',
          borderColor: isOn ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
          opacity: disabled || !onPress ? 0.48 : 1,
        },
      ]}
      testID={testID}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.switchThumb,
          {
            backgroundColor: isOn ? activeThumbColor : '#D4D4D4',
            opacity: checked === undefined ? 0.65 : 1,
            transform: [{ translateX: thumbX }, { scale: pressScale }],
          },
        ]}
      />
    </Pressable>
  );
}

/**
 * Tactile detent horizontal slider using pure RN PanResponder + Animated.spring thumb.
 */
export function FsdDetentSlider({
  value,
  min,
  max,
  step = 1,
  disabled = false,
  fillColor = '#EAEAEA',
  onChange,
  onComplete,
  accessibilityLabel,
  testID,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  fillColor?: string;
  onChange: (next: number) => void;
  onComplete?: (next: number) => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const startValueRef = useRef(value);
  const lastValueRef = useRef(value);
  const isHorizontalDragRef = useRef(false);
  const thumbScale = useRef(new Animated.Value(1)).current;
  const span = Math.max(0.0001, max - min);
  const ratio = Math.max(0, Math.min(1, (value - min) / span));

  const quantize = (raw: number) => {
    const clamped = Math.min(max, Math.max(min, raw));
    if (!Number.isFinite(step) || step <= 0) return clamped;
    const snapped = min + Math.round((clamped - min) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(4));
  };

  const emitAtX = (locationX: number, done: boolean) => {
    const w = trackWidthRef.current;
    if (disabled || w <= 0) return;
    const next = quantize(min + (Math.max(0, Math.min(w, locationX)) / w) * span);
    lastValueRef.current = next;
    onChangeRef.current(next);
    if (done) onCompleteRef.current?.(next);
  };

  const panResponder = useMemo(() => {
    if (typeof PanResponder?.create !== 'function') return { panHandlers: {} };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, g) =>
        !disabled && Math.abs(g.dx) > Math.abs(g.dy) * 1.15 && Math.abs(g.dx) > 4,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: (_evt, g) =>
        !(Math.abs(g.dx) > Math.abs(g.dy) * 1.15 && Math.abs(g.dx) > 4)
        && (!isHorizontalDragRef.current || Math.abs(g.dy) > Math.abs(g.dx) * 1.1),
      onShouldBlockNativeResponder: () => false,
      onPanResponderGrant: () => {
        if (disabled) return;
        startValueRef.current = valueRef.current;
        lastValueRef.current = valueRef.current;
        isHorizontalDragRef.current = false;
      },
      onPanResponderMove: (evt, g) => {
        if (disabled) return;
        if (!isHorizontalDragRef.current) {
          if (Math.abs(g.dx) > Math.abs(g.dy) * 1.15 && Math.abs(g.dx) > 4) {
            isHorizontalDragRef.current = true;
            if (typeof Animated.spring === 'function') {
              Animated.spring(thumbScale, { toValue: 1.18, damping: 18, stiffness: 360, useNativeDriver: Platform?.OS !== 'web' }).start();
            }
          } else {
            return;
          }
        }
        emitAtX(evt.nativeEvent.locationX, false);
      },
      onPanResponderRelease: (evt, g) => {
        if (typeof Animated.spring === 'function') {
          Animated.spring(thumbScale, { toValue: 1, damping: 18, stiffness: 320, useNativeDriver: Platform?.OS !== 'web' }).start();
        }
        const isTap = Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8;
        if (isHorizontalDragRef.current || isTap) {
          emitAtX(evt.nativeEvent.locationX, true);
        }
        isHorizontalDragRef.current = false;
      },
      onPanResponderTerminate: () => {
        if (typeof Animated.spring === 'function') {
          Animated.spring(thumbScale, { toValue: 1, damping: 18, stiffness: 320, useNativeDriver: Platform?.OS !== 'web' }).start();
        }
        if (isHorizontalDragRef.current) {
          onCompleteRef.current?.(lastValueRef.current);
        }
        isHorizontalDragRef.current = false;
      },
    });
  }, [disabled, min, max, step, thumbScale]);

  const thumbLeft = trackWidth > 0 ? Math.max(0, Math.min(trackWidth - 16, ratio * (trackWidth - 16))) : 0;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
      onLayout={evt => {
        const w = evt.nativeEvent.layout.width;
        if (Number.isFinite(w) && w > 0) {
          trackWidthRef.current = w;
          setTrackWidth(w);
        }
      }}
      style={[styles.sliderTouchArea, disabled && styles.disabled]}
      testID={testID}
      {...panResponder.panHandlers}
    >
      <View style={styles.sliderTrackBase}>
        <View style={[styles.sliderTrackFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: fillColor }]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          {
            left: trackWidth > 0 ? thumbLeft : `${Math.round(ratio * 100)}%`,
            transform: [{ scale: thumbScale }],
          },
        ]}
      />
    </View>
  );
}

/**
 * Spring entrance container for matte charcoal modal sheets.
 */
export function FsdSheetMotion({
  children,
  pointerEvents,
  style,
  testID,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
}: {
  children: ReactNode;
  pointerEvents?: ViewProps['pointerEvents'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onTouchStart?: (event: GestureResponderEvent) => void;
  onTouchMove?: (event: GestureResponderEvent) => void;
  onTouchEnd?: (event: GestureResponderEvent) => void;
  onTouchCancel?: (event: GestureResponderEvent) => void;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const nativeDriver = Platform?.OS !== 'web';

  useEffect(() => {
    if (reduced || typeof Animated.spring !== 'function') {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      damping: 24,
      stiffness: 300,
      mass: 0.78,
      useNativeDriver: nativeDriver,
    }).start();
  }, [nativeDriver, progress, reduced]);

  const translateY = typeof progress.interpolate === 'function'
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })
    : 0;
  const scale = typeof progress.interpolate === 'function'
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] })
    : 1;

  return (
    <Animated.View
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      pointerEvents={pointerEvents}
      style={[style, { opacity: progress, transform: [{ translateY }, { scale }] }]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Subtle spring-eased reveal for switching left-rail Settings tabs.
 */
export function FsdTabReveal({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const nativeDriver = Platform?.OS !== 'web';

  useEffect(() => {
    if (reduced || typeof Animated.timing !== 'function') {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing?.out ? Easing.out(Easing.quad) : undefined,
      useNativeDriver: nativeDriver,
    }).start();
  }, [nativeDriver, progress, reduced]);

  const translateY = typeof progress.interpolate === 'function'
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] })
    : 0;

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/**
 * Concentric pulsing radar animation for the dual-channel hotspot scanner card.
 */
export function FsdRadarPulse({
  active = true,
  color = '#EAEAEA',
  size = 44,
  children,
}: {
  active?: boolean;
  color?: string;
  size?: number;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduced || typeof Animated.loop !== 'function' || typeof Animated.timing !== 'function') {
      ring1.setValue(0);
      ring2.setValue(0);
      return;
    }
    const anim1 = Animated.loop(
      Animated.timing(ring1, {
        toValue: 1,
        duration: 1800,
        easing: Easing?.out ? Easing.out(Easing.quad) : undefined,
        useNativeDriver: Platform?.OS !== 'web',
      }),
    );
    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(ring2, {
          toValue: 1,
          duration: 1800,
          easing: Easing?.out ? Easing.out(Easing.quad) : undefined,
          useNativeDriver: Platform?.OS !== 'web',
        }),
      ]),
    );
    anim1.start();
    anim2.start();
    return () => {
      anim1.stop();
      anim2.stop();
    };
  }, [active, reduced, ring1, ring2]);

  const ringStyle = (val: Animated.Value) => {
    const scale = typeof val.interpolate === 'function'
      ? val.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.38] })
      : 1;
    const opacity = typeof val.interpolate === 'function'
      ? val.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.45, 0] })
      : 0;
    return {
      borderColor: color,
      borderRadius: size / 2,
      height: size,
      width: size,
      opacity,
      transform: [{ scale }],
    };
  };

  return (
    <View style={[styles.radarWrap, { height: size, width: size }]}>
      {active ? <Animated.View pointerEvents="none" style={[styles.radarRing, ringStyle(ring1)]} /> : null}
      {active ? <Animated.View pointerEvents="none" style={[styles.radarRing, ringStyle(ring2)]} /> : null}
      <View style={[styles.radarCore, { borderRadius: (size * 0.64) / 2, height: size * 0.64, width: size * 0.64 }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segTrack: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 32,
    overflow: 'hidden',
    padding: 2,
    position: 'relative',
  },
  segTrackCompact: {
    borderRadius: 8,
    minHeight: 28,
  },
  segPill: {
    borderRadius: 8,
    bottom: 2,
    left: 2,
    position: 'absolute',
    top: 2,
  },
  segPillCompact: {
    borderRadius: 6,
  },
  segBtn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 8,
    zIndex: 1,
  },
  segBtnCompact: {
    minHeight: 24,
    paddingHorizontal: 6,
  },
  segLabel: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  segLabelCompact: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  segLabelActive: {
    color: '#F2F2F2',
    fontWeight: '600',
  },
  switchTrack: {
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 2,
    width: 42,
  },
  switchThumb: {
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  sliderTouchArea: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  sliderTrackBase: {
    backgroundColor: '#181818',
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  sliderTrackFill: {
    borderRadius: 3,
    height: '100%',
  },
  sliderThumb: {
    backgroundColor: '#F2F2F2',
    borderColor: 'rgba(18, 18, 18, 0.45)',
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    position: 'absolute',
    top: 6,
    width: 16,
  },
  radarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  radarRing: {
    borderWidth: 1.5,
    position: 'absolute',
  },
  radarCore: {
    alignItems: 'center',
    backgroundColor: '#242424',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.78,
  },
});
