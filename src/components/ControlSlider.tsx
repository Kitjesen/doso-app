import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Text } from './AppText';
import { useAppTheme } from '../theme';
import { getProductAppearance } from '../appearance';

type Props = Readonly<{
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  label?: string;
  accessibilityLabel: string;
  testID: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onValueChange?: (value: number) => void;
  onSlidingComplete: (value: number) => void;
}>;
type TouchIdentifier = string | number;
type Touch = Readonly<{ identifier: TouchIdentifier; pageX: number; locationX?: number }>;
type Gesture = Readonly<{
  identifier: TouchIdentifier; originX: number; width: number; startValue: number; startedAt: number | null;
}>;
type KeyboardInput = Readonly<{ key: string; preventDefault?: () => void }>;
const THUMB_SIZE = 28;
const RADIUS = THUMB_SIZE / 2;

function timestamp(event: GestureResponderEvent) {
  const value = event.nativeEvent.timestamp;
  return Number.isFinite(value) ? value : null;
}
function touches(event: GestureResponderEvent, changed = false): readonly Touch[] {
  const values = changed ? event.nativeEvent.changedTouches : event.nativeEvent.touches;
  return Array.isArray(values) ? values as readonly Touch[] : [];
}
function validIdentifier(value: unknown): value is TouchIdentifier {
  return typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/** Layout-only input. Preview moves are separate from the one release commit. */
export function ControlSlider({ value, minimumValue, maximumValue, step = 0.01, label, accessibilityLabel,
  testID, disabled = false, formatValue = String, onValueChange, onSlidingComplete }: Props) {
  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const validRange = Number.isFinite(minimumValue) && Number.isFinite(maximumValue) && maximumValue > minimumValue
    && Number.isFinite(step) && step > 0;
  const min = validRange ? minimumValue : 0, max = validRange ? maximumValue : 1;
  const quantum = validRange ? step : 0.01;
  const normalize = (next: number) => {
    const bounded = Math.min(max, Math.max(min, Number.isFinite(next) ? next : min));
    if (bounded === max || bounded === min) return bounded;
    return Math.round(Math.min(max, Math.max(min, min + Math.round((bounded - min) / quantum) * quantum)) * 1_000_000) / 1_000_000;
  };
  const unavailable = disabled || !validRange || !Number.isFinite(value);
  const [displayValue, setDisplayValue] = useState(normalize(value));
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const mounted = useRef(true);
  const gesture = useRef<Gesture | null>(null);
  const widthRef = useRef(0);
  const frame = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const displayed = useRef(displayValue);
  const current = useRef({ unavailable, min, max, step, value: normalize(value), normalize, onValueChange, onSlidingComplete });
  current.current = { unavailable, min, max, step, value: normalize(value), normalize, onValueChange, onSlidingComplete };

  const show = useCallback((next: number, notify: boolean) => {
    if (!mounted.current) return;
    const result = current.current.normalize(next);
    if (result === displayed.current) return;
    displayed.current = result;
    setDisplayValue(result);
    if (notify) current.current.onValueChange?.(result);
  }, []);
  const retire = useCallback((restorePreview: boolean) => {
    const previous = gesture.current;
    gesture.current = null;
    if (!mounted.current) return;
    setActive(false);
    if (previous && restorePreview) show(previous.startValue, true);
  }, [show]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; gesture.current = null; };
  }, []);
  useEffect(() => {
    if (!gesture.current) show(current.current.value, false);
  }, [value, show]);
  useEffect(() => {
    // Disabling or changing the input contract retires the old gesture silently.
    // Parent reset/close owns its value; no late preview or commit can overwrite it.
    retire(false);
    show(current.current.value, false);
  }, [unavailable, min, max, step, retire, show]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    if (!mounted.current) return;
    const measuredFrame = event.nativeEvent.layout;
    const measured = measuredFrame.width;
    const next = Number.isFinite(measured) && measured > THUMB_SIZE ? measured : 0;
    const finite = (number: number) => Number.isFinite(number) ? number : 0;
    const nextFrame = { width: next, height: finite(measuredFrame.height), x: finite(measuredFrame.x), y: finite(measuredFrame.y) };
    if (Object.keys(nextFrame).every(key => nextFrame[key as keyof typeof nextFrame] === frame.current[key as keyof typeof nextFrame])) return;
    // A resized track has a different page origin; do not retarget a held finger.
    retire(true);
    frame.current = nextFrame;
    widthRef.current = next;
    setWidth(next);
  }, [retire]);
  const isStale = (event: GestureResponderEvent, held: Gesture) => {
    const at = timestamp(event);
    return held.startedAt !== null && at !== null && at < held.startedAt;
  };
  const moveTo = useCallback((pageX: number, held: Gesture) => {
    if (!Number.isFinite(pageX) || held.width <= THUMB_SIZE) return;
    const ratio = Math.min(1, Math.max(0, (pageX - held.originX - RADIUS) / (held.width - THUMB_SIZE)));
    show(current.current.min + ratio * (current.current.max - current.current.min), true);
  }, [show]);
  const onGrant = useCallback((event: GestureResponderEvent) => {
    if (!mounted.current || current.current.unavailable || gesture.current || widthRef.current <= THUMB_SIZE) return;
    const owner = touches(event).find(item => validIdentifier(item.identifier) && Number.isFinite(item.pageX));
    if (!owner) return;
    const local = Number.isFinite(owner.locationX) ? owner.locationX : event.nativeEvent.locationX;
    if (!Number.isFinite(local)) return;
    const held: Gesture = { identifier: owner.identifier, originX: owner.pageX - Number(local), width: widthRef.current,
      startValue: displayed.current, startedAt: timestamp(event) };
    gesture.current = held;
    setActive(true);
    moveTo(owner.pageX, held);
  }, [moveTo]);
  const onMove = useCallback((event: GestureResponderEvent) => {
    const held = gesture.current;
    if (!mounted.current || current.current.unavailable || !held || isStale(event, held)) return;
    const owner = touches(event).find(item => item.identifier === held.identifier);
    if (owner) moveTo(owner.pageX, held);
  }, [moveTo]);
  const onEnd = useCallback((event: GestureResponderEvent) => {
    const held = gesture.current;
    if (!mounted.current || current.current.unavailable || !held || isStale(event, held)) return;
    const changed = touches(event, true).find(item => item.identifier === held.identifier);
    const remaining = touches(event).some(item => item.identifier === held.identifier);
    if (!changed && remaining) return;
    if (changed) moveTo(changed.pageX, held);
    if (!mounted.current || current.current.unavailable || gesture.current !== held) return;
    const completed = displayed.current;
    retire(false);
    current.current.onSlidingComplete(completed);
  }, [moveTo, retire]);
  const discrete = useCallback((next: number) => {
    if (!mounted.current || current.current.unavailable || gesture.current) return;
    const result = current.current.normalize(next);
    if (result === displayed.current) return;
    show(result, true);
    if (!mounted.current || current.current.unavailable || gesture.current) return;
    current.current.onSlidingComplete(result);
  }, [show]);
  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') discrete(displayed.current + current.current.step);
    if (event.nativeEvent.actionName === 'decrement') discrete(displayed.current - current.current.step);
  }, [discrete]);
  const onKeyDown = useCallback((event: KeyboardInput) => {
    if (!mounted.current || current.current.unavailable || gesture.current) return;
    const next = event.key === 'Home' ? current.current.min : event.key === 'End' ? current.current.max
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? displayed.current - current.current.step
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? displayed.current + current.current.step : null;
    if (next === null) return;
    event.preventDefault?.();
    discrete(next);
  }, [discrete]);
  const onCancel = useCallback((event?: GestureResponderEvent) => {
    const held = gesture.current;
    if (!mounted.current || !held || event && isStale(event, held)) return;
    if (event && touches(event, true).length > 0 && !touches(event, true).some(item => item.identifier === held.identifier)
      && touches(event).some(item => item.identifier === held.identifier)) return;
    retire(true);
  }, [retire]);
  const keyboardProps: { onKeyDown?: (event: KeyboardInput) => void; tabIndex?: -1 | 0 } = Platform.OS === 'web'
    ? { onKeyDown, tabIndex: unavailable ? -1 : 0 } : {};
  const fraction = (displayValue - min) / (max - min);
  const thumbLeft = Math.max(0, width - THUMB_SIZE) * fraction;

  return <View style={styles.container}>
    {label ? <View pointerEvents="none" style={styles.labelRow}>
      <Text style={[styles.label, { color: appearance.secondary }]}>{label}</Text>
      <Text style={[styles.value, { color: appearance.ink }]} testID={`${testID}-value`}>{formatValue(displayValue)}</Text>
    </View> : null}
    <View {...keyboardProps} accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: unavailable }}
      accessibilityValue={{ min, max, now: displayValue, text: formatValue(displayValue) }}
      accessibilityActions={[{ name: 'increment', label: '增大' }, { name: 'decrement', label: '减小' }]}
      onAccessibilityAction={onAccessibilityAction} onLayout={onLayout} testID={testID}
      onStartShouldSetResponder={() => mounted.current && !current.current.unavailable && widthRef.current > THUMB_SIZE}
      onMoveShouldSetResponder={() => mounted.current && !current.current.unavailable && widthRef.current > THUMB_SIZE}
      onResponderGrant={onGrant} onResponderMove={onMove} onResponderEnd={onEnd} onResponderRelease={onEnd}
      onResponderTerminate={onCancel} onTouchCancel={onCancel} onResponderTerminationRequest={() => false}
      style={[styles.touchArea, { opacity: unavailable ? 0.4 : 1 }]}>
      <View pointerEvents="none" style={[styles.track, { backgroundColor: appearance.border }]} />
      <View pointerEvents="none" style={[styles.fill, { width: Math.max(0, thumbLeft), backgroundColor: appearance.action }]} />
      <View pointerEvents="none" style={[styles.thumb, { left: thumbLeft, borderColor: active ? appearance.blueInk : appearance.border,
        backgroundColor: appearance.canvas }]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 14, lineHeight: 22 },
  value: { fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
  touchArea: { height: 44, minHeight: 44, justifyContent: 'center' },
  track: { position: 'absolute', top: 20, left: RADIUS, right: RADIUS, height: 4, borderRadius: 2 },
  fill: { position: 'absolute', top: 20, left: RADIUS, height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', top: 8, height: THUMB_SIZE, width: THUMB_SIZE, borderRadius: RADIUS, borderWidth: 0.5, elevation: 1 },
});
