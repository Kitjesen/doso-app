import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { Text } from './AppText';
import {
  didTouchEnd,
  NEUTRAL_JOYSTICK_VECTOR,
  projectJoystickInput,
  selectTouchByIdentifier,
  type JoystickAxis,
  type JoystickTouch,
  type JoystickVector,
} from '../features/robot-lifecycle/joystickInput';
import { useAppTheme } from '../theme';
import { getProductAppearance } from '../appearance';
import type { ResolvedJoystickLayout } from '../features/control/joystickLayoutPreferences';

export type { JoystickVector } from '../features/robot-lifecycle/joystickInput';

type ControlJoystickProps = {
  label: string;
  testID: string;
  size: number;
  axis: JoystickAxis;
  disabled: boolean;
  resetKey: number;
  onChange: (value: JoystickVector) => void;
  // Samples are emitted only while the actual pointer is held. A controller
  // must never renew a cached movement after touch ownership has ended.
  onSample?: (value: JoystickVector) => void;
  onActiveChange?: (active: boolean) => void;
  variant?: 'circle' | 'cross';
};

export type ControlJoystickPairSide = Pick<
  ControlJoystickProps,
  'label' | 'testID' | 'axis' | 'onChange' | 'onActiveChange' | 'onSample'
>;

export type ControlJoystickPairProps = {
  size: number;
  showLabels?: boolean;
  gap?: number;
  floating?: boolean;
  touchAreaWidth?: number;
  touchAreaHeight?: number;
  layout?: ResolvedJoystickLayout;
  variant?: 'circle' | 'cross' | 'glass';
  disabled: boolean;
  resetKey: number;
  onCancel?: () => void;
  left: ControlJoystickPairSide;
  right: ControlJoystickPairSide;
};

type TouchWithLocalPosition = JoystickTouch & Readonly<{
  locationX?: number;
  locationY?: number;
}>;

const DEADZONE = 0.1;
const HELD_SAMPLE_INTERVAL_MS = 20;
const ACCESSIBILITY_STEP = 0.5;
const ACCESSIBILITY_PULSE_MS = 220;

const XY_ACCESSIBILITY_ACTIONS = [
  { name: 'move-up', label: '向前移动' },
  { name: 'move-down', label: '向后移动' },
  { name: 'move-left', label: '向左移动' },
  { name: 'move-right', label: '向右移动' },
  { name: 'reset', label: '归零' },
] as const;

const X_ACCESSIBILITY_ACTIONS = [
  { name: 'move-left', label: '向左转向' },
  { name: 'move-right', label: '向右转向' },
  { name: 'reset', label: '归零' },
] as const;

function accessibilityActionsForAxis(axis: JoystickAxis) {
  return axis === 'xy' ? XY_ACCESSIBILITY_ACTIONS : X_ACCESSIBILITY_ACTIONS;
}

function accessibilityVectorForAction(axis: JoystickAxis, actionName: string): JoystickVector | undefined {
  if (actionName === 'reset') return NEUTRAL_JOYSTICK_VECTOR;
  if (actionName === 'move-left') return { x: -ACCESSIBILITY_STEP, y: 0 };
  if (actionName === 'move-right') return { x: ACCESSIBILITY_STEP, y: 0 };
  if (axis === 'xy' && actionName === 'move-up') return { x: 0, y: -ACCESSIBILITY_STEP };
  if (axis === 'xy' && actionName === 'move-down') return { x: 0, y: ACCESSIBILITY_STEP };
  return undefined;
}

function responderTouches(event: GestureResponderEvent) {
  return event.nativeEvent.touches as unknown as readonly TouchWithLocalPosition[];
}

function changedResponderTouches(event: GestureResponderEvent) {
  return event.nativeEvent.changedTouches as unknown as readonly TouchWithLocalPosition[];
}

function hasFiniteLocalPosition(touch: TouchWithLocalPosition) {
  return Number.isFinite(touch.locationX) && Number.isFinite(touch.locationY);
}

function usePairChannel(definition: ControlJoystickPairSide, sampleGuard?: () => boolean) {
  const [value, setValue] = useState<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const [active, setActiveState] = useState(false);
  const [anchor, setAnchorState] = useState<Readonly<{ x: number; y: number }> | null>(null);
  const valueRef = useRef<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const activeRef = useRef(false);
  const anchorRef = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const ownerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(definition.onChange);
  const onActiveChangeRef = useRef(definition.onActiveChange);
  const onSampleRef = useRef(definition.onSample);
  onChangeRef.current = definition.onChange;
  onActiveChangeRef.current = definition.onActiveChange;
  onSampleRef.current = definition.onSample;
  useEffect(() => {
    if (!active || !onSampleRef.current) return;
    const timer = setInterval(() => {
      if (activeRef.current && ownerRef.current !== null && (!sampleGuard || sampleGuard())) onSampleRef.current?.(valueRef.current);
    }, HELD_SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, Boolean(definition.onSample), sampleGuard]);

  const setActive = useCallback((nextActive: boolean) => {
    if (activeRef.current === nextActive) return;
    activeRef.current = nextActive;
    setActiveState(nextActive);
    onActiveChangeRef.current?.(nextActive);
  }, []);

  const setAnchor = useCallback((nextAnchor: Readonly<{ x: number; y: number }> | null) => {
    anchorRef.current = nextAnchor;
    setAnchorState(nextAnchor);
  }, []);

  const emit = useCallback((nextValue: JoystickVector) => {
    const previous = valueRef.current;
    if (previous.x === nextValue.x && previous.y === nextValue.y) return;
    valueRef.current = nextValue;
    setValue(nextValue);
    onChangeRef.current(nextValue);
  }, []);

  const cancelPulse = useCallback(() => {
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = null;
  }, []);

  const release = useCallback(() => {
    cancelPulse();
    ownerRef.current = null;
    setAnchor(null);
    setActive(false);
    emit(NEUTRAL_JOYSTICK_VECTOR);
  }, [cancelPulse, emit, setActive, setAnchor]);

  const pulse = useCallback((nextValue: JoystickVector) => {
    // Screen-reader input is a momentary nudge, never a latched command.
    if (ownerRef.current !== null) return;
    cancelPulse();
    setActive(true);
    emit(nextValue);
    pulseTimerRef.current = setTimeout(release, ACCESSIBILITY_PULSE_MS);
  }, [cancelPulse, emit, release, setActive]);

  return { active, anchor, anchorRef, cancelPulse, emit, ownerRef, pulse, release, setActive, setAnchor, value };
}

function JoystickVisual({
  active,
  axis,
  disabled,
  label,
  size,
  testID,
  variant = 'circle',
  value,
  onAccessibilityAction,
  showLabel = true,
  floating = false,
  robotControl = false,
  anchor,
}: Pick<ControlJoystickProps, 'axis' | 'disabled' | 'label' | 'size' | 'testID'> & {
  variant?: ControlJoystickPairProps['variant'];
  active: boolean;
  value: JoystickVector;
  onAccessibilityAction: (actionName: string) => void;
  showLabel?: boolean;
  floating?: boolean;
  robotControl?: boolean;
  anchor?: Readonly<{ x: number; y: number }> | null;
}) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const radius = Math.max(1, size / 2);
  const knobSize = Math.max(42, Math.round(size * 0.34));
  const knobTravel = Math.max(0, radius - knobSize / 2 - 6);
  const trackColor = isDark ? appearance.raised : appearance.canvas;
  const trackBorderColor = appearance.blueInk;
  const knobColor = active ? appearance.action : appearance.surface;
  const glass = variant === 'glass';
  const floatingStyle: StyleProp<ViewStyle> = floating && anchor
    ? { left: anchor.x - radius, position: 'absolute', top: anchor.y - radius }
    : undefined;

  return (
    <View pointerEvents="none" style={[styles.wrapper, floatingStyle]}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={robotControl ? '取得控制权后操作机器狗，松手归零' : axis === 'xy' ? '本地演示移动方向，不向设备发送指令' : '本地演示左右转向，不向设备发送指令'}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        accessibilityActions={[...accessibilityActionsForAxis(axis)]}
        accessibilityValue={{
          text: axis === 'xy'
            ? `水平 ${Math.round(value.x * 100)}%，垂直 ${Math.round(value.y * 100)}%`
            : `转向 ${Math.round(value.x * 100)}%`,
        }}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          if (!disabled) onAccessibilityAction(event.nativeEvent.actionName);
        }}
        style={[
          styles.pad,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: glass ? 'rgba(211,224,236,0.36)' : variant === 'cross' ? 'transparent' : trackColor,
            borderColor: glass ? 'rgba(255,255,255,0.9)' : variant === 'cross' ? 'transparent' : trackBorderColor,
            borderWidth: glass ? 0.5 : variant === 'cross' ? 0 : StyleSheet.hairlineWidth,
            opacity: disabled ? 0.8 : 1,
          },
        ]}
      >
        {variant === 'cross' ? <>
          <View style={[styles.crossArmVertical, { width: size * 0.38, height: size, backgroundColor: trackColor, borderColor: trackBorderColor }]} />
          <View style={[styles.crossArmHorizontal, { width: size, height: size * 0.38, backgroundColor: trackColor, borderColor: trackBorderColor }]} />
        </> : null}
        <View style={[styles.travelRing, { width: size * 0.79, height: size * 0.79, borderRadius: size, borderColor: glass ? 'rgba(255,255,255,0.42)' : appearance.border, borderWidth: glass ? 0.5 : StyleSheet.hairlineWidth }]} />
        {glass ? <>
          <View style={[styles.glassDirection, styles.directionLeft]} />
          <View style={[styles.glassDirection, styles.directionRight]} />
          {axis === 'xy' ? <>
            <View style={[styles.glassDirection, styles.directionUp]} />
            <View style={[styles.glassDirection, styles.directionDown]} />
          </> : null}
        </> : <>
          <View style={[styles.axisHorizontal, { backgroundColor: colors.line }]} />
          {axis === 'xy' ? <View style={[styles.axisVertical, { backgroundColor: colors.line }]} /> : null}
        </>}
        <View
          testID={`${testID}-thumb`}
          style={[
            styles.knob,
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              backgroundColor: glass ? active ? appearance.action : '#FCFCFC' : knobColor,
              borderColor: glass ? 'rgba(255,255,255,0.85)' : active ? appearance.blueInk : appearance.border,
              borderWidth: glass ? 0.5 : StyleSheet.hairlineWidth,
              transform: [
                { translateX: value.x * knobTravel },
                { translateY: value.y * knobTravel },
              ],
            },
          ]}
        >
          {!glass ? <View style={[styles.thumbRing, { borderColor: active ? 'rgba(255,255,255,0.42)' : colors.line }]} /> : null}
          <View style={[styles.thumbCenter, glass && styles.glassThumbCenter, { backgroundColor: glass ? appearance.blueInk : active ? '#FFFFFF' : appearance.blueInk }]} />
        </View>
      </View>
      {showLabel ? <Text style={[styles.label, { color: disabled ? colors.muted : colors.ink }]}>{label}</Text> : null}
    </View>
  );
}

export function ControlJoystickPair({
  size,
  showLabels = true,
  gap = 24,
  floating = false,
  touchAreaWidth,
  touchAreaHeight,
  layout,
  variant = 'circle',
  disabled,
  resetKey,
  onCancel,
  left: leftDefinition,
  right: rightDefinition,
}: ControlJoystickPairProps) {
  const radius = Math.max(1, size / 2);
  const safeGap = Math.max(0, gap);
  const rightStart = size + safeGap;
  const pairWidth = layout ? Math.max(0, Number.isFinite(touchAreaWidth) ? Number(touchAreaWidth) : 0)
    : Math.max(size * 2 + safeGap, Number.isFinite(touchAreaWidth) ? Number(touchAreaWidth) : 0);
  const pairHeight = layout ? Math.max(0, Number.isFinite(touchAreaHeight) ? Number(touchAreaHeight) : 0)
    : floating ? Math.max(size, Number.isFinite(touchAreaHeight) ? Number(touchAreaHeight) : size) : size;
  const floatingBoundary = pairWidth / 2;
  const inputDisabled = disabled || Boolean(layout && !layout.usable);
  const leftRadius = layout ? Math.max(1, layout.left.size / 2) : radius;
  const rightRadius = layout ? Math.max(1, layout.right.size / 2) : radius;
  const geometryKey = layout ? [pairWidth, pairHeight, layout.usable, resetKey,
    layout.left.size, layout.left.centerX, layout.left.centerY,
    layout.right.size, layout.right.centerX, layout.right.centerY].join(':') : null;
  const geometryRef = useRef({ key: geometryKey, generation: 0, ready: true });
  if (geometryRef.current.key !== geometryKey) {
    geometryRef.current = { key: geometryKey, generation: geometryRef.current.generation + 1, ready: false };
  }
  const geometryGeneration = geometryRef.current.generation;
  const geometryCurrent = useCallback(() => geometryRef.current.ready
    && geometryRef.current.generation === geometryGeneration, [geometryGeneration]);
  const left = usePairChannel(leftDefinition, geometryCurrent);
  const right = usePairChannel(rightDefinition, geometryCurrent);
  const retiredOwners = useRef(new Set<number>());

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const anchorForTouch = useCallback((touch: TouchWithLocalPosition, side: 'left' | 'right') => {
    if (layout) return { x: layout[side].centerX, y: layout[side].centerY };
    const localX = Number(touch.locationX);
    const localY = Number(touch.locationY);
    if (!floating) {
      return { x: side === 'left' ? radius : rightStart + radius, y: radius };
    }
    const minX = side === 'left' ? radius : floatingBoundary + radius;
    const maxX = side === 'left' ? Math.max(radius, floatingBoundary - radius) : Math.max(floatingBoundary + radius, pairWidth - radius);
    return {
      x: clamp(localX, Math.min(minX, maxX), Math.max(minX, maxX)),
      y: clamp(localY, radius, Math.max(radius, pairHeight - radius)),
    };
  }, [floating, floatingBoundary, layout, pairHeight, pairWidth, radius, rightStart]);

  const releaseBoth = useCallback(() => {
    left.release();
    right.release();
  }, [left.release, right.release]);

  const cancelBoth = useCallback(() => {
    // Cancel transport authority before either channel emits a visual reset.
    // Releasing one finger normally must still preserve the other channel.
    onCancel?.();
    releaseBoth();
  }, [onCancel, releaseBoth]);

  const appliedGeometry = useRef(geometryGeneration);
  useEffect(() => {
    if (appliedGeometry.current === geometryGeneration) return;
    appliedGeometry.current = geometryGeneration;
    // Retire held fingers before cleanup; they cannot reacquire after a layout change.
    for (const owner of [left.ownerRef.current, right.ownerRef.current]) {
      if (owner !== null) retiredOwners.current.add(owner);
    }
    if (left.active || right.active || left.ownerRef.current !== null || right.ownerRef.current !== null) cancelBoth();
    else releaseBoth();
    geometryRef.current.ready = true;
  }, [cancelBoth, geometryGeneration, left.active, left.ownerRef, releaseBoth, right.active, right.ownerRef]);

  useEffect(() => {
    if (inputDisabled) releaseBoth();
  }, [inputDisabled, releaseBoth]);

  useEffect(() => {
    releaseBoth();
  }, [resetKey, size, safeGap, releaseBoth]);

  useEffect(() => releaseBoth, [releaseBoth]);

  const updateChannel = useCallback((
    channel: ReturnType<typeof usePairChannel>,
    definition: ControlJoystickPairSide,
    touch: TouchWithLocalPosition,
    anchor: Readonly<{ x: number; y: number }>,
    sideRadius: number,
  ) => {
    if (!hasFiniteLocalPosition(touch)) return channel.release();
    channel.emit(projectJoystickInput(
      (touch.locationX as number) - anchor.x,
      (touch.locationY as number) - anchor.y,
      sideRadius,
      definition.axis,
      DEADZONE,
    ));
  }, []);

  const touchSide = useCallback((touch: TouchWithLocalPosition): 'left' | 'right' | undefined => {
    if (!hasFiniteLocalPosition(touch)) return;
    const x = Number(touch.locationX), y = Number(touch.locationY);
    if (y < 0 || y > pairHeight) return;
    if (layout) {
      const side = x < floatingBoundary ? 'left' : 'right';
      const disc = layout[side];
      if (x < 0 || x > pairWidth || Math.hypot(x - disc.centerX, y - disc.centerY) > disc.size / 2) return;
      return side;
    }
    if (floating ? x >= 0 && x < floatingBoundary : x >= 0 && x <= size) return 'left';
    if (floating ? x >= floatingBoundary && x <= pairWidth : x >= rightStart && x <= rightStart + size) return 'right';
  }, [floating, floatingBoundary, layout, pairHeight, pairWidth, rightStart, size]);

  const canStart = useCallback((event?: GestureResponderEvent) => {
    if (inputDisabled || !geometryCurrent()) return false;
    if (!layout) return true;
    if (!event) return false;
    return changedResponderTouches(event).some(touch => {
      if (retiredOwners.current.has(touch.identifier)) return false;
      const side = touchSide(touch);
      return side === 'left' ? left.ownerRef.current === null : side === 'right' && right.ownerRef.current === null;
    });
  }, [geometryCurrent, inputDisabled, layout, left.ownerRef, right.ownerRef, touchSide]);

  const claimNewTouches = useCallback((event: GestureResponderEvent) => {
    if (inputDisabled || !geometryCurrent()) return;
    const changed = changedResponderTouches(event);
    for (const touch of changed) {
      if (retiredOwners.current.has(touch.identifier)) continue;
      if (left.ownerRef.current === touch.identifier || right.ownerRef.current === touch.identifier) continue;
      const side = touchSide(touch);
      if (side === 'left' && left.ownerRef.current === null) {
        left.cancelPulse();
        left.ownerRef.current = touch.identifier;
        left.setAnchor(anchorForTouch(touch, 'left'));
        left.setActive(true);
        updateChannel(left, leftDefinition, touch, left.anchorRef.current ?? { x: radius, y: radius }, leftRadius);
      } else if (side === 'right' && right.ownerRef.current === null) {
        right.cancelPulse();
        right.ownerRef.current = touch.identifier;
        right.setAnchor(anchorForTouch(touch, 'right'));
        right.setActive(true);
        updateChannel(right, rightDefinition, touch, right.anchorRef.current ?? { x: rightStart + radius, y: radius }, rightRadius);
      }
    }
  }, [anchorForTouch, geometryCurrent, inputDisabled, left, leftDefinition, leftRadius, radius, right, rightDefinition, rightRadius, rightStart, touchSide, updateChannel]);

  const handleMove = useCallback((event: GestureResponderEvent) => {
    if (!geometryCurrent()) return;
    if (inputDisabled) return releaseBoth();
    const touches = responderTouches(event);
    const leftTouch = selectTouchByIdentifier(touches, left.ownerRef.current) as TouchWithLocalPosition | undefined;
    const rightTouch = selectTouchByIdentifier(touches, right.ownerRef.current) as TouchWithLocalPosition | undefined;
    if (leftTouch) updateChannel(left, leftDefinition, leftTouch, left.anchorRef.current ?? { x: radius, y: radius }, leftRadius);
    else if (left.ownerRef.current !== null) left.release();
    if (rightTouch) updateChannel(right, rightDefinition, rightTouch, right.anchorRef.current ?? { x: rightStart + radius, y: radius }, rightRadius);
    else if (right.ownerRef.current !== null) right.release();
  }, [geometryCurrent, inputDisabled, left, leftDefinition, leftRadius, radius, releaseBoth, right, rightDefinition, rightRadius, rightStart, updateChannel]);

  const handleEnd = useCallback((event: GestureResponderEvent) => {
    const changed = changedResponderTouches(event);
    const remaining = responderTouches(event);
    for (const owner of retiredOwners.current) {
      if (didTouchEnd(changed, remaining, owner)) retiredOwners.current.delete(owner);
    }
    if (!geometryCurrent()) return;
    if (didTouchEnd(changed, remaining, left.ownerRef.current)) left.release();
    if (didTouchEnd(changed, remaining, right.ownerRef.current)) right.release();
  }, [geometryCurrent, left, right]);

  return (
    <View
      testID="control-joystick-pair"
      onStartShouldSetResponderCapture={canStart}
      onStartShouldSetResponder={canStart}
      onMoveShouldSetResponderCapture={() => !inputDisabled && geometryCurrent() && (left.ownerRef.current !== null || right.ownerRef.current !== null)}
      onResponderGrant={claimNewTouches}
      onResponderStart={claimNewTouches}
      onResponderMove={handleMove}
      onResponderEnd={handleEnd}
      // Android Fabric may release the shared responder when the first pointer
      // lifts even though touches still contains the other owner. Only release
      // ended identifiers; bubbling touch events keep the held channel live.
      onResponderRelease={handleEnd}
      onResponderTerminate={cancelBoth}
      onTouchMove={Platform.OS === 'android' ? handleMove : undefined}
      onTouchEnd={Platform.OS === 'android' ? handleEnd : undefined}
      onTouchCancel={Platform.OS === 'android' ? cancelBoth : undefined}
      onResponderTerminationRequest={() => false}
       style={[floating || layout ? styles.floatingPair : styles.pair, { gap: safeGap, height: pairHeight, width: pairWidth }]}
    >
      <JoystickVisual
        {...leftDefinition}
        robotControl={Boolean(leftDefinition.onSample)}
        variant={variant}
        showLabel={showLabels}
        size={layout?.left.size ?? size}
        disabled={inputDisabled}
        active={left.active}
        anchor={layout ? { x: layout.left.centerX, y: layout.left.centerY } : floating ? (left.anchor ?? { x: radius, y: pairHeight / 2 }) : null}
        floating={floating || Boolean(layout)}
        value={left.value}
        onAccessibilityAction={actionName => {
          if (!geometryCurrent()) return;
          const nextValue = accessibilityVectorForAction(leftDefinition.axis, actionName);
          if (!nextValue) return;
          if (nextValue === NEUTRAL_JOYSTICK_VECTOR) left.release();
          else left.pulse(nextValue);
        }}
      />
      <JoystickVisual
        {...rightDefinition}
        robotControl={Boolean(rightDefinition.onSample)}
        variant={variant}
        showLabel={showLabels}
        size={layout?.right.size ?? size}
        disabled={inputDisabled}
        active={right.active}
        anchor={layout ? { x: layout.right.centerX, y: layout.right.centerY } : floating ? (right.anchor ?? { x: pairWidth - radius, y: pairHeight / 2 }) : null}
        floating={floating || Boolean(layout)}
        value={right.value}
        onAccessibilityAction={actionName => {
          if (!geometryCurrent()) return;
          const nextValue = accessibilityVectorForAction(rightDefinition.axis, actionName);
          if (!nextValue) return;
          if (nextValue === NEUTRAL_JOYSTICK_VECTOR) right.release();
          else right.pulse(nextValue);
        }}
      />
    </View>
  );
}

export function ControlJoystick({
  label,
  testID,
  size,
  axis,
  disabled,
  resetKey,
  onChange,
  onActiveChange,
}: ControlJoystickProps) {
  const { colors, isDark } = useAppTheme();
  const [value, setValue] = useState<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const [active, setActiveState] = useState(false);
  const valueRef = useRef<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const activeRef = useRef(false);
  const touchIdentifierRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerRef = useRef({ pageX: 0, pageY: 0 });
  const onChangeRef = useRef(onChange);
  const onActiveChangeRef = useRef(onActiveChange);
  const radius = Math.max(1, size / 2);
  const knobSize = Math.max(42, Math.round(size * 0.34));
  const knobTravel = Math.max(0, radius - knobSize / 2 - 6);

  onChangeRef.current = onChange;
  onActiveChangeRef.current = onActiveChange;

  const setActive = useCallback((active: boolean) => {
    if (activeRef.current === active) return;
    activeRef.current = active;
    setActiveState(active);
    onActiveChangeRef.current?.(active);
  }, []);

  const emit = useCallback((nextValue: JoystickVector) => {
    const previous = valueRef.current;
    if (previous.x === nextValue.x && previous.y === nextValue.y) return;
    valueRef.current = nextValue;
    setValue(nextValue);
    onChangeRef.current(nextValue);
  }, []);

  const cancelPulse = useCallback(() => {
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = null;
  }, []);

  const release = useCallback(() => {
    cancelPulse();
    touchIdentifierRef.current = null;
    setActive(false);
    emit(NEUTRAL_JOYSTICK_VECTOR);
  }, [cancelPulse, emit, setActive]);

  useEffect(() => {
    if (disabled) release();
  }, [disabled, release]);

  useEffect(() => {
    release();
  }, [resetKey, release]);

  useEffect(() => release, [release]);

  const updateFromTouch = useCallback((touch: JoystickTouch) => {
    emit(projectJoystickInput(
      touch.pageX - centerRef.current.pageX,
      touch.pageY - centerRef.current.pageY,
      radius,
      axis,
      DEADZONE,
    ));
  }, [axis, emit, radius]);

  const handleGrant = useCallback((event: GestureResponderEvent) => {
    if (disabled) return;
    cancelPulse();
    const nativeEvent = event.nativeEvent;
    const candidates = changedResponderTouches(event);
    const initiatingTouch = candidates[0] ?? responderTouches(event)[0];
    if (!initiatingTouch) return;

    touchIdentifierRef.current = initiatingTouch.identifier;
    const localX = Number.isFinite(initiatingTouch.locationX)
      ? initiatingTouch.locationX as number
      : nativeEvent.locationX;
    const localY = Number.isFinite(initiatingTouch.locationY)
      ? initiatingTouch.locationY as number
      : nativeEvent.locationY;
    centerRef.current = {
      pageX: initiatingTouch.pageX + radius - localX,
      pageY: initiatingTouch.pageY + radius - localY,
    };
    setActive(true);
    updateFromTouch(initiatingTouch);
  }, [cancelPulse, disabled, radius, setActive, updateFromTouch]);

  const handleMove = useCallback((event: GestureResponderEvent) => {
    if (disabled) return release();
    const touch = selectTouchByIdentifier(responderTouches(event), touchIdentifierRef.current);
    if (touch) updateFromTouch(touch);
    else if (touchIdentifierRef.current !== null) release();
  }, [disabled, release, updateFromTouch]);

  const handleRelease = useCallback((event: GestureResponderEvent) => {
    if (didTouchEnd(
      changedResponderTouches(event),
      responderTouches(event),
      touchIdentifierRef.current,
    )) {
      release();
    }
  }, [release]);

  const handleAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (disabled) return;
    const nextValue = accessibilityVectorForAction(axis, event.nativeEvent.actionName);
    if (!nextValue) return;
    if (nextValue === NEUTRAL_JOYSTICK_VECTOR) release();
    else if (touchIdentifierRef.current === null) {
      cancelPulse();
      setActive(true);
      emit(nextValue);
      pulseTimerRef.current = setTimeout(release, ACCESSIBILITY_PULSE_MS);
    }
  }, [axis, cancelPulse, disabled, emit, release, setActive]);

  const trackColor = isDark ? '#222222' : '#F9F9F9';
  const trackBorderColor = active ? (isDark ? '#70B8FF' : '#0D74CE') : (isDark ? '#3A3A3A' : '#D9D9D9');
  const knobColor = disabled ? (isDark ? '#313131' : '#F0F0F0') : active ? (isDark ? '#70B8FF' : '#0D74CE') : isDark ? '#191919' : '#FFFFFF';
  const thumbTranslateX = value.x * knobTravel;
  const thumbTranslateY = value.y * knobTravel;

  return (
    <View style={styles.wrapper}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={axis === 'xy' ? '拖动以控制移动方向' : '左右拖动以控制转向'}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        accessibilityActions={[...accessibilityActionsForAxis(axis)]}
        accessibilityValue={{
          text: axis === 'xy'
            ? `水平 ${Math.round(value.x * 100)}%，垂直 ${Math.round(value.y * 100)}%`
            : `转向 ${Math.round(value.x * 100)}%`,
        }}
        onAccessibilityAction={handleAccessibilityAction}
        onStartShouldSetResponder={() => !disabled}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderEnd={handleRelease}
        onResponderRelease={handleRelease}
        onResponderTerminate={release}
        onResponderTerminationRequest={() => false}
        style={[
          styles.pad,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: trackColor,
            borderColor: trackBorderColor,
            opacity: disabled ? 0.8 : 1,
          },
        ]}
      >
        <View pointerEvents="none" style={[styles.axisHorizontal, { backgroundColor: isDark ? '#3A3A3A' : '#D9D9D9' }]} />
        {axis === 'xy' ? <View pointerEvents="none" style={[styles.axisVertical, { backgroundColor: isDark ? '#3A3A3A' : '#D9D9D9' }]} /> : null}
        <View
          pointerEvents="none"
          testID={`${testID}-thumb`}
          style={[
            styles.knob,
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              backgroundColor: knobColor,
              borderColor: active ? (isDark ? '#70B8FF' : '#0D74CE') : (isDark ? '#3A3A3A' : '#D9D9D9'),
              transform: [
                { translateX: thumbTranslateX },
                { translateY: thumbTranslateY },
              ],
            },
          ]}
        />
      </View>
      <Text style={[styles.label, { color: disabled ? (isDark ? '#B4B4B4' : '#646464') : (isDark ? '#EEEEEE' : '#202020') }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: {
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  floatingPair: {
    alignSelf: 'stretch',
    position: 'relative',
  },
  wrapper: {
    alignItems: 'center',
    gap: 10,
  },
  pad: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  padCross: { overflow: 'visible' },
  crossArmVertical: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, position: 'absolute' },
  crossArmHorizontal: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, position: 'absolute' },
  travelRing: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, opacity: 0.7 },
  channelMark: { position: 'absolute', top: '21%', fontSize: 12, lineHeight: 16, fontWeight: '600', opacity: 0.85 },
  thumbRing: { position: 'absolute', width: '72%', height: '72%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 100, opacity: 0.7 },
  thumbCenter: { width: 4, height: 4, borderRadius: 2, opacity: 0.6 },
  directionMark: { position: 'absolute', width: 6, height: 6, borderTopWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, opacity: 0.6 },
  directionLeft: { left: 14, transform: [{ rotate: '-135deg' }] },
  directionRight: { right: 14, transform: [{ rotate: '45deg' }] },
  directionUp: { top: 14, transform: [{ rotate: '-45deg' }] },
  directionDown: { bottom: 14, transform: [{ rotate: '135deg' }] },
  glassDirection: { position: 'absolute', width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#8B9EB0' },
  glassThumbCenter: { width: 6, height: 6, borderRadius: 3, opacity: 1 },
  axisHorizontal: {
    height: StyleSheet.hairlineWidth,
    left: '18%',
    opacity: 0.74,
    position: 'absolute',
    right: '18%',
  },
  axisVertical: {
    bottom: '18%',
    opacity: 0.74,
    position: 'absolute',
    top: '18%',
    width: StyleSheet.hairlineWidth,
  },
  knob: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
});
