import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
  /** When true, only the left/right disc zones claim touches so open center canvas passes through to interactive 3D backdrop. */
  reserveCenterForBackdrop?: boolean;
  /** Keep the touch target and accessibility surface while optionally suppressing the painted dial. */
  showVisuals?: boolean;
  touchAreaWidth?: number;
  touchAreaHeight?: number;
  layout?: ResolvedJoystickLayout;
  variant?: 'circle' | 'cross' | 'dial' | 'glass';
  backdrop?: ReactNode;
  disabled: boolean;
  resetKey: number;
  onCancel?: () => void;
  /** Optional hint callback when the user taps a disabled joystick disc (never claims motion). */
  onBlockedPress?: () => void;
  /** Pure local visual thumb mirror (e.g. offline 3D sandbox driving); never dispatches robot commands. */
  onVisualChange?: (left: JoystickVector, right: JoystickVector) => void;
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

function hasValidPagePosition(touch: TouchWithLocalPosition) {
  return Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY)
    && (touch.pageX !== 0 || touch.pageY !== 0);
}

function usePairChannel(definition: ControlJoystickPairSide, sampleGuard?: () => boolean) {
  const [value, setValue] = useState<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const [active, setActiveState] = useState(false);
  const [anchor, setAnchorState] = useState<Readonly<{ x: number; y: number }> | null>(null);
  const valueRef = useRef<JoystickVector>(NEUTRAL_JOYSTICK_VECTOR);
  const activeRef = useRef(false);
  const anchorRef = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const pageAnchorRef = useRef<Readonly<{ x: number; y: number }> | null>(null);
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
    pageAnchorRef.current = null;
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

  return { active, anchor, anchorRef, cancelPulse, emit, ownerRef, pageAnchorRef, pulse, release, setActive, setAnchor, value };
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
  showVisuals = true,
  robotControl = false,
  backdrop,
  anchor,
}: Pick<ControlJoystickProps, 'axis' | 'disabled' | 'label' | 'size' | 'testID'> & {
  variant?: ControlJoystickPairProps['variant'];
  active: boolean;
  value: JoystickVector;
  onAccessibilityAction: (actionName: string) => void;
  showLabel?: boolean;
  floating?: boolean;
  showVisuals?: boolean;
  robotControl?: boolean;
  backdrop?: ReactNode;
  anchor?: Readonly<{ x: number; y: number }> | null;
}) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const radius = Math.max(1, size / 2);
  const glass = variant === 'glass';
  const dial = variant === 'dial' || glass;
  const knobSize = Math.max(glass ? 28 : 42, Math.round(size * (glass ? .33 : dial ? 0.24 : 0.34)));
  const knobTravel = Math.max(0, radius - knobSize / 2 - 6);
  const trackColor = isDark ? appearance.raised : appearance.canvas;
  const trackBorderColor = appearance.blueInk;
  const knobColor = active ? appearance.action : appearance.surface;
  const dialDirectionColor = glass || isDark ? 'rgba(255,255,255,0.85)' : 'rgba(57,72,88,0.75)';
  const thumbX = value.x * knobTravel;
  const thumbY = value.y * knobTravel;
  const glassStroke = Math.max(1, Math.round(size * 0.008));
  const glassTickLen = Math.max(7, Math.round(size * 0.065));
  const glassTickInset = Math.max(5, Math.round(size * 0.038));
  const glassYawStemLen = Math.max(10, Math.round(size * 0.085));
  const glassYawChevron = Math.max(6, Math.round(size * 0.042));
  const glassMag = glass && active ? Math.min(1, Math.hypot(value.x, value.y)) : 0;
  const glassUp = glass && active && axis === 'xy' ? Math.max(0, -value.y) : 0;
  const glassDown = glass && active && axis === 'xy' ? Math.max(0, value.y) : 0;
  const glassLeft = glass && active ? Math.max(0, -value.x) : 0;
  const glassRight = glass && active ? Math.max(0, value.x) : 0;
  const glassTickMetrics = (weight: number) => {
    const lit = weight > 0.15;
    const alpha = lit ? Math.min(1, 0.36 + weight * 0.64) : active ? 0.24 : 0.36;
    const length = glassTickLen + (lit ? Math.round(weight * glassTickLen * 0.75) : 0);
    const thickness = weight > 0.4 ? Math.max(2, Math.round(glassStroke * 1.8)) : glassStroke;
    return { color: `rgba(255,255,255,${alpha.toFixed(2)})`, length, thickness };
  };
  const glassYawMetrics = (weight: number) => {
    const lit = weight > 0.15;
    const alpha = lit ? Math.min(1, 0.42 + weight * 0.58) : active ? 0.26 : 0.62;
    const thickness = weight > 0.3 ? Math.max(2, Math.round(glassStroke * 1.6)) : glassStroke;
    const stemLength = glassYawStemLen + (lit ? Math.round(weight * 4) : 0);
    const chevronSize = glassYawChevron + (lit ? Math.round(weight * 1.5) : 0);
    return { color: `rgba(255,255,255,${alpha.toFixed(2)})`, thickness, stemLength, chevronSize };
  };
  const tickL = glassTickMetrics(glassLeft);
  const tickR = glassTickMetrics(glassRight);
  const tickU = glassTickMetrics(glassUp);
  const tickD = glassTickMetrics(glassDown);
  const yawL = glassYawMetrics(glassLeft);
  const yawR = glassYawMetrics(glassRight);
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
            backgroundColor: !showVisuals ? 'transparent' : glass ? (active ? 'rgba(24,26,28,0.28)' : 'rgba(20,20,20,0.18)') : dial ? isDark ? 'rgba(220,220,220,0.16)' : 'rgba(230,230,230,0.52)' : variant === 'cross' ? 'transparent' : trackColor,
            borderColor: !showVisuals ? 'transparent' : glass ? (active ? `rgba(255,255,255,${(0.42 + glassMag * 0.16).toFixed(2)})` : 'rgba(255,255,255,0.36)') : dial || variant === 'cross' ? 'transparent' : trackBorderColor,
            borderWidth: !showVisuals ? 0 : glass ? glassStroke : dial || variant === 'cross' ? 0 : StyleSheet.hairlineWidth,
            opacity: disabled ? 0.8 : 1,
          },
        ]}
      >
        {showVisuals && glass ? backdrop : null}
        {showVisuals && glass ? (
          <View
            pointerEvents="none"
            style={[
              styles.glassInnerRing,
              {
                width: size * 0.64,
                height: size * 0.64,
                borderRadius: size * 0.32,
                borderWidth: glassStroke,
                borderColor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.18)',
              },
            ]}
          />
        ) : null}
        {showVisuals && variant === 'cross' ? <>
          <View style={[styles.crossArmVertical, { width: size * 0.38, height: size, backgroundColor: trackColor, borderColor: trackBorderColor }]} />
          <View style={[styles.crossArmHorizontal, { width: size, height: size * 0.38, backgroundColor: trackColor, borderColor: trackBorderColor }]} />
        </> : null}
        {showVisuals && dial ? <>
          {!glass ? <View pointerEvents="none" style={[styles.dialArc, {
            width: size * 0.8, height: size * 0.8, borderRadius: size / 2,
            borderWidth: Math.max(1.5, size * 0.007), borderTopColor: appearance.action
          }]} /> : null}
          {glass ? <>
            <View testID={`${testID}-tick-left`} pointerEvents="none" style={[styles.glassTickH, { left: glassTickInset, width: tickL.length, height: tickL.thickness, borderRadius: tickL.thickness / 2, backgroundColor: tickL.color }]} />
            <View testID={`${testID}-tick-right`} pointerEvents="none" style={[styles.glassTickH, { right: glassTickInset, width: tickR.length, height: tickR.thickness, borderRadius: tickR.thickness / 2, backgroundColor: tickR.color }]} />
            <View testID={`${testID}-tick-up`} pointerEvents="none" style={[styles.glassTickV, { top: glassTickInset, width: tickU.thickness, height: tickU.length, borderRadius: tickU.thickness / 2, backgroundColor: tickU.color }]} />
            <View testID={`${testID}-tick-down`} pointerEvents="none" style={[styles.glassTickV, { bottom: glassTickInset, width: tickD.thickness, height: tickD.length, borderRadius: tickD.thickness / 2, backgroundColor: tickD.color }]} />
          </> : null}
          {glass && axis === 'x' ? <>
            <View testID={`${testID}-yaw-left-stem`} pointerEvents="none" style={[styles.glassYawStem, styles.glassYawStemLeft, { width: yawL.stemLength, height: yawL.thickness, borderRadius: yawL.thickness / 2, backgroundColor: yawL.color }]} />
            <View testID={`${testID}-yaw-right-stem`} pointerEvents="none" style={[styles.glassYawStem, styles.glassYawStemRight, { width: yawR.stemLength, height: yawR.thickness, borderRadius: yawR.thickness / 2, backgroundColor: yawR.color }]} />
            <View testID={`${testID}-yaw-left-chevron`} pointerEvents="none" style={[styles.dialDirection, styles.dialDirectionLeft, { borderColor: yawL.color, width: yawL.chevronSize, height: yawL.chevronSize, borderTopWidth: yawL.thickness, borderRightWidth: yawL.thickness }]} />
            <View testID={`${testID}-yaw-right-chevron`} pointerEvents="none" style={[styles.dialDirection, styles.dialDirectionRight, { borderColor: yawR.color, width: yawR.chevronSize, height: yawR.chevronSize, borderTopWidth: yawR.thickness, borderRightWidth: yawR.thickness }]} />
          </> : null}
          {!glass ? <>
            <View style={[styles.dialDirection, styles.dialDirectionLeft, { borderColor: dialDirectionColor }]} />
            <View style={[styles.dialDirection, styles.dialDirectionRight, { borderColor: dialDirectionColor }]} />
            {axis === 'xy' ? <>
              <View style={[styles.dialDirection, styles.dialDirectionUp, { borderColor: dialDirectionColor }]} />
              <View style={[styles.dialDirection, styles.dialDirectionDown, { borderColor: dialDirectionColor }]} />
            </> : null}
          </> : null}
        </> : showVisuals ? <>
          <View style={[styles.travelRing, { width: size * 0.79, height: size * 0.79, borderRadius: size, borderColor: appearance.border }]} />
          <View style={[styles.axisHorizontal, { backgroundColor: colors.line }]} />
          {axis === 'xy' ? <View style={[styles.axisVertical, { backgroundColor: colors.line }]} /> : null}
        </> : null}
        {showVisuals ? <View
          testID={`${testID}-thumb`}
          style={[
            styles.knob,
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              backgroundColor: glass ? (active ? `rgba(255,255,255,${(0.32 + glassMag * 0.22).toFixed(2)})` : 'rgba(242,242,242,0.12)') : dial ? active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.76)' : knobColor,
              borderColor: glass ? (active ? `rgba(255,255,255,${(0.76 + glassMag * 0.20).toFixed(2)})` : 'rgba(255,255,255,0.54)') : dial ? 'rgba(255,255,255,0.7)' : active ? appearance.blueInk : appearance.border,
              borderWidth: glass ? (active ? Math.max(1.5, Math.round(glassStroke * 1.4 * 10) / 10) : glassStroke) : dial ? 0.5 : StyleSheet.hairlineWidth,
              transform: [
                { translateX: thumbX },
                { translateY: thumbY },
              ],
            },
          ]}
        >
          {!dial ? <View style={[styles.thumbRing, { borderColor: active ? 'rgba(255,255,255,0.42)' : colors.line }]} /> : null}
          {!glass && dial && active ? <Text testID={`${testID}-value`} style={[styles.dialValue, { color: '#214F71' }]}>{Math.round(Math.min(1, Math.hypot(value.x, value.y)) * 100)}%</Text>
            : !dial ? <View style={[styles.thumbCenter, { backgroundColor: active ? '#FFFFFF' : appearance.blueInk }]} /> : null}
        </View> : null}
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
  reserveCenterForBackdrop = false,
  showVisuals = true,
  touchAreaWidth,
  touchAreaHeight,
  layout,
  variant = 'circle',
  backdrop,
  disabled,
  resetKey,
  onCancel,
  onBlockedPress,
  onVisualChange,
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
  const onVisualChangeRef = useRef(onVisualChange);
  onVisualChangeRef.current = onVisualChange;
  useEffect(() => {
    onVisualChangeRef.current?.(left.value, right.value);
  }, [left.value, right.value]);
  const retiredOwners = useRef(new Set<number>());
  // Tracks the ControlJoystickPair container origin in screen (page) coordinates while a gesture is active.
  // Using pageX/pageY after touch-down prevents Android Fabric locationX/locationY re-targeting jumps
  // when a finger drags outside a nested hit zone (e.g. above the top edge of the left stick).
  const pairPageOriginRef = useRef<Readonly<{ x: number; y: number }> | null>(null);

  const anchorForTouch = useCallback((localX: number, localY: number, side: 'left' | 'right') => {
    if (layout && !floating) return { x: layout[side].centerX, y: layout[side].centerY };
    if (floating) return { x: localX, y: localY };
    return { x: side === 'left' ? radius : rightStart + radius, y: radius };
  }, [floating, layout, radius, rightStart]);

  const releaseBoth = useCallback(() => {
    pairPageOriginRef.current = null;
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

  const resolveTouchPairPosition = useCallback((touch: TouchWithLocalPosition): Readonly<{ x: number; y: number }> | null => {
    const origin = pairPageOriginRef.current;
    if (origin && Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY)
      && (touch.pageX !== 0 || touch.pageY !== 0)) {
      return { x: touch.pageX - origin.x, y: touch.pageY - origin.y };
    }
    if (!hasFiniteLocalPosition(touch)) return null;
    return { x: touch.locationX as number, y: touch.locationY as number };
  }, []);

  const updateChannel = useCallback((
    channel: ReturnType<typeof usePairChannel>,
    definition: ControlJoystickPairSide,
    touch: TouchWithLocalPosition,
    anchor: Readonly<{ x: number; y: number }>,
    sideRadius: number,
  ) => {
    const pageAnchor = channel.pageAnchorRef.current;
    if (pageAnchor) {
      if (!Number.isFinite(touch.pageX) || !Number.isFinite(touch.pageY)) return channel.release();
      channel.emit(projectJoystickInput(
        touch.pageX - pageAnchor.x,
        touch.pageY - pageAnchor.y,
        sideRadius,
        definition.axis,
        DEADZONE,
      ));
      return;
    }
    if (!hasFiniteLocalPosition(touch)) return channel.release();
    channel.emit(projectJoystickInput(
      (touch.locationX as number) - anchor.x,
      (touch.locationY as number) - anchor.y,
      sideRadius,
      definition.axis,
      DEADZONE,
    ));
  }, []);

  const touchSideAt = useCallback((x: number, y: number, allowHitRim = false): 'left' | 'right' | undefined => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const hitOverflow = allowHitRim ? Math.max(16, Math.round(Math.max(leftRadius, rightRadius) * 0.2)) : 0;
    if (y < -hitOverflow || y > pairHeight + hitOverflow) return;
    if (layout && !floating) {
      const side = x < floatingBoundary ? 'left' : 'right';
      const disc = layout[side];
      if (x < -hitOverflow || x > pairWidth + hitOverflow || Math.hypot(x - disc.centerX, y - disc.centerY) > disc.size / 2 + hitOverflow) return;
      return side;
    }
    if (floating ? x >= -hitOverflow && x < floatingBoundary : x >= 0 && x <= size) return 'left';
    if (floating ? x >= floatingBoundary && x <= pairWidth + hitOverflow : x >= rightStart && x <= rightStart + size) return 'right';
  }, [floating, floatingBoundary, layout, leftRadius, pairHeight, pairWidth, rightRadius, rightStart, size]);

  const touchSide = useCallback((touch: TouchWithLocalPosition, allowHitRim = false): 'left' | 'right' | undefined => {
    const pos = resolveTouchPairPosition(touch);
    if (!pos) return;
    return touchSideAt(pos.x, pos.y, allowHitRim);
  }, [resolveTouchPairPosition, touchSideAt]);

  const canStartForHit = useCallback((event: GestureResponderEvent | undefined, allowHitRim: boolean) => {
    if (inputDisabled || !geometryCurrent()) return false;
    if (!layout) return true;
    if (!event) return false;
    return changedResponderTouches(event).some(touch => {
      if (retiredOwners.current.has(touch.identifier)) return false;
      const side = touchSide(touch, allowHitRim);
      return side === 'left' ? left.ownerRef.current === null : side === 'right' && right.ownerRef.current === null;
    });
  }, [geometryCurrent, inputDisabled, layout, left.ownerRef, right.ownerRef, touchSide]);

  const canStart = useCallback((event?: GestureResponderEvent) => canStartForHit(event, false), [canStartForHit]);

  const claimTouches = useCallback((event: GestureResponderEvent, allowHitRim = false) => {
    if (inputDisabled || !geometryCurrent()) return;
    const changed = changedResponderTouches(event);
    for (const touch of changed) {
      if (retiredOwners.current.has(touch.identifier)) continue;
      if (left.ownerRef.current === touch.identifier || right.ownerRef.current === touch.identifier) continue;
      const useStoredOrigin = pairPageOriginRef.current !== null && (left.ownerRef.current !== null || right.ownerRef.current !== null);
      if (!useStoredOrigin) {
        pairPageOriginRef.current = null;
      }
      const pos = resolveTouchPairPosition(touch);
      if (!pos) continue;
      const side = touchSideAt(pos.x, pos.y, allowHitRim);
      if (side === 'left' && left.ownerRef.current === null) {
        const nextAnchor = anchorForTouch(pos.x, pos.y, 'left');
        if (!pairPageOriginRef.current && hasValidPagePosition(touch)) {
          pairPageOriginRef.current = { x: touch.pageX - pos.x, y: touch.pageY - pos.y };
        }
        left.cancelPulse();
        left.ownerRef.current = touch.identifier;
        left.pageAnchorRef.current = hasValidPagePosition(touch)
          ? { x: touch.pageX + (nextAnchor.x - pos.x), y: touch.pageY + (nextAnchor.y - pos.y) }
          : null;
        left.setAnchor(nextAnchor);
        left.setActive(true);
        updateChannel(left, leftDefinition, touch, nextAnchor, leftRadius);
      } else if (side === 'right' && right.ownerRef.current === null) {
        const nextAnchor = anchorForTouch(pos.x, pos.y, 'right');
        if (!pairPageOriginRef.current && hasValidPagePosition(touch)) {
          pairPageOriginRef.current = { x: touch.pageX - pos.x, y: touch.pageY - pos.y };
        }
        right.cancelPulse();
        right.ownerRef.current = touch.identifier;
        right.pageAnchorRef.current = hasValidPagePosition(touch)
          ? { x: touch.pageX + (nextAnchor.x - pos.x), y: touch.pageY + (nextAnchor.y - pos.y) }
          : null;
        right.setAnchor(nextAnchor);
        right.setActive(true);
        updateChannel(right, rightDefinition, touch, nextAnchor, rightRadius);
      }
    }
  }, [anchorForTouch, geometryCurrent, inputDisabled, left, leftDefinition, leftRadius, resolveTouchPairPosition, right, rightDefinition, rightRadius, touchSideAt, updateChannel]);

  const claimNewTouches = useCallback((event: GestureResponderEvent) => claimTouches(event, false), [claimTouches]);

  const handleSideMove = useCallback((scopedSide: 'left' | 'right' | null, event: GestureResponderEvent) => {
    if (!geometryCurrent()) return;
    if (inputDisabled) return releaseBoth();
    const touches = responderTouches(event);
    const leftTouch = selectTouchByIdentifier(touches, left.ownerRef.current) as TouchWithLocalPosition | undefined;
    const rightTouch = selectTouchByIdentifier(touches, right.ownerRef.current) as TouchWithLocalPosition | undefined;
    if (leftTouch) updateChannel(left, leftDefinition, leftTouch, left.anchorRef.current ?? { x: radius, y: radius }, leftRadius);
    else if (left.ownerRef.current !== null && (scopedSide === null || scopedSide === 'left')) left.release();
    if (rightTouch) updateChannel(right, rightDefinition, rightTouch, right.anchorRef.current ?? { x: rightStart + radius, y: radius }, rightRadius);
    else if (right.ownerRef.current !== null && (scopedSide === null || scopedSide === 'right')) right.release();
    if (left.ownerRef.current === null && right.ownerRef.current === null) {
      pairPageOriginRef.current = null;
    }
  }, [geometryCurrent, inputDisabled, left, leftDefinition, leftRadius, radius, releaseBoth, right, rightDefinition, rightRadius, rightStart, updateChannel]);

  const handleMove = useCallback((event: GestureResponderEvent) => handleSideMove(null, event), [handleSideMove]);

  const handleSideEnd = useCallback((scopedSide: 'left' | 'right' | null, event: GestureResponderEvent) => {
    const changed = changedResponderTouches(event);
    const remaining = responderTouches(event);
    for (const owner of retiredOwners.current) {
      if (didTouchEnd(changed, remaining, owner)) retiredOwners.current.delete(owner);
    }
    if (!geometryCurrent()) return;
    const leftEnded = scopedSide === 'right'
      ? Boolean(selectTouchByIdentifier(changed, left.ownerRef.current))
      : didTouchEnd(changed, remaining, left.ownerRef.current);
    const rightEnded = scopedSide === 'left'
      ? Boolean(selectTouchByIdentifier(changed, right.ownerRef.current))
      : didTouchEnd(changed, remaining, right.ownerRef.current);
    if (leftEnded) left.release();
    if (rightEnded) right.release();
    if (left.ownerRef.current === null && right.ownerRef.current === null) {
      pairPageOriginRef.current = null;
    }
  }, [geometryCurrent, left, right]);

  const handleEnd = useCallback((event: GestureResponderEvent) => handleSideEnd(null, event), [handleSideEnd]);

  const offsetTouchEvent = useCallback((event: GestureResponderEvent, dx: number, dy: number): GestureResponderEvent => {
    const shiftList = (list: readonly TouchWithLocalPosition[] | undefined) => (list ?? []).map(t => ({
      ...t,
      locationX: Number.isFinite(t.locationX) ? (t.locationX as number) + dx : t.locationX,
      locationY: Number.isFinite(t.locationY) ? (t.locationY as number) + dy : t.locationY,
    }));
    const ne = event.nativeEvent;
    return {
      ...event,
      nativeEvent: {
        ...ne,
        locationX: Number.isFinite(ne.locationX) ? ne.locationX + dx : ne.locationX,
        locationY: Number.isFinite(ne.locationY) ? ne.locationY + dy : ne.locationY,
        touches: shiftList(responderTouches(event)) as unknown as GestureResponderEvent['nativeEvent']['touches'],
        changedTouches: shiftList(changedResponderTouches(event)) as unknown as GestureResponderEvent['nativeEvent']['changedTouches'],
      },
    };
  }, []);

  const leftDiscCenter = layout ? { x: layout.left.centerX, y: layout.left.centerY } : { x: radius, y: pairHeight / 2 };
  const rightDiscCenter = layout ? { x: layout.right.centerX, y: layout.right.centerY } : { x: pairWidth - radius, y: pairHeight / 2 };
  const leftHitR = Math.round(leftRadius * 1.12);
  const rightHitR = Math.round(rightRadius * 1.12);
  const leftHitLeft = Math.max(0, leftDiscCenter.x - leftHitR);
  const leftHitTop = Math.max(0, leftDiscCenter.y - leftHitR);
  const rightHitLeft = Math.max(0, rightDiscCenter.x - rightHitR);
  const rightHitTop = Math.max(0, rightDiscCenter.y - rightHitR);

  return (
    <View
      testID="control-joystick-pair"
      pointerEvents={inputDisabled ? (onBlockedPress ? 'box-none' : 'none') : reserveCenterForBackdrop ? 'box-none' : 'auto'}
      onStartShouldSetResponderCapture={reserveCenterForBackdrop ? undefined : canStart}
      onStartShouldSetResponder={canStart}
      onMoveShouldSetResponderCapture={reserveCenterForBackdrop ? undefined : () => !inputDisabled && geometryCurrent() && (left.ownerRef.current !== null || right.ownerRef.current !== null)}
      onResponderGrant={claimNewTouches}
      onResponderStart={claimNewTouches}
      onResponderMove={handleMove}
      onResponderEnd={handleEnd}
      // Android Fabric may release the shared responder when the first pointer
      // lifts even though touches still contains the other owner. Only release
      // ended identifiers; bubbling touch events keep the held channel live.
      onResponderRelease={handleEnd}
      onResponderTerminate={cancelBoth}
      onTouchMove={Platform.OS === 'android' && !reserveCenterForBackdrop ? handleMove : undefined}
      onTouchEnd={Platform.OS === 'android' && !reserveCenterForBackdrop ? handleEnd : undefined}
      onTouchCancel={Platform.OS === 'android' && !reserveCenterForBackdrop ? cancelBoth : undefined}
      onResponderTerminationRequest={() => false}
      style={[floating || layout ? styles.floatingPair : styles.pair, { gap: safeGap, height: pairHeight, width: pairWidth }]}
    >
      {inputDisabled && onBlockedPress ? (
        <>
          <View
            testID={`${leftDefinition.testID}-blocked-hit`}
            pointerEvents="auto"
            onStartShouldSetResponder={() => { onBlockedPress(); return false; }}
            style={{
              borderRadius: leftHitR,
              height: leftHitR * 2,
              left: leftHitLeft,
              position: 'absolute',
              top: leftHitTop,
              width: leftHitR * 2,
            }}
          />
          <View
            testID={`${rightDefinition.testID}-blocked-hit`}
            pointerEvents="auto"
            onStartShouldSetResponder={() => { onBlockedPress(); return false; }}
            style={{
              borderRadius: rightHitR,
              height: rightHitR * 2,
              left: rightHitLeft,
              position: 'absolute',
              top: rightHitTop,
              width: rightHitR * 2,
            }}
          />
        </>
      ) : null}
      {reserveCenterForBackdrop && !inputDisabled ? (
        <>
          <View
            testID={`${leftDefinition.testID}-hit`}
            pointerEvents="auto"
            onStartShouldSetResponder={e => canStartForHit(offsetTouchEvent(e, leftHitLeft, leftHitTop), true)}
            onResponderGrant={e => claimTouches(offsetTouchEvent(e, leftHitLeft, leftHitTop), true)}
            onResponderStart={e => claimTouches(offsetTouchEvent(e, leftHitLeft, leftHitTop), true)}
            onResponderMove={e => handleSideMove('left', offsetTouchEvent(e, leftHitLeft, leftHitTop))}
            onResponderEnd={e => handleSideEnd('left', offsetTouchEvent(e, leftHitLeft, leftHitTop))}
            onResponderRelease={e => handleSideEnd('left', offsetTouchEvent(e, leftHitLeft, leftHitTop))}
            onResponderTerminate={cancelBoth}
            onTouchStart={Platform.OS === 'android' ? e => claimTouches(offsetTouchEvent(e, leftHitLeft, leftHitTop), true) : undefined}
            onTouchMove={Platform.OS === 'android' ? e => handleSideMove('left', offsetTouchEvent(e, leftHitLeft, leftHitTop)) : undefined}
            onTouchEnd={Platform.OS === 'android' ? e => handleSideEnd('left', offsetTouchEvent(e, leftHitLeft, leftHitTop)) : undefined}
            onTouchCancel={Platform.OS === 'android' ? cancelBoth : undefined}
            onResponderTerminationRequest={() => false}
            style={{
              borderRadius: leftHitR,
              height: leftHitR * 2,
              left: leftHitLeft,
              position: 'absolute',
              top: leftHitTop,
              width: leftHitR * 2,
            }}
          />
          <View
            testID={`${rightDefinition.testID}-hit`}
            pointerEvents="auto"
            onStartShouldSetResponder={e => canStartForHit(offsetTouchEvent(e, rightHitLeft, rightHitTop), true)}
            onResponderGrant={e => claimTouches(offsetTouchEvent(e, rightHitLeft, rightHitTop), true)}
            onResponderStart={e => claimTouches(offsetTouchEvent(e, rightHitLeft, rightHitTop), true)}
            onResponderMove={e => handleSideMove('right', offsetTouchEvent(e, rightHitLeft, rightHitTop))}
            onResponderEnd={e => handleSideEnd('right', offsetTouchEvent(e, rightHitLeft, rightHitTop))}
            onResponderRelease={e => handleSideEnd('right', offsetTouchEvent(e, rightHitLeft, rightHitTop))}
            onResponderTerminate={cancelBoth}
            onTouchStart={Platform.OS === 'android' ? e => claimTouches(offsetTouchEvent(e, rightHitLeft, rightHitTop), true) : undefined}
            onTouchMove={Platform.OS === 'android' ? e => handleSideMove('right', offsetTouchEvent(e, rightHitLeft, rightHitTop)) : undefined}
            onTouchEnd={Platform.OS === 'android' ? e => handleSideEnd('right', offsetTouchEvent(e, rightHitLeft, rightHitTop)) : undefined}
            onTouchCancel={Platform.OS === 'android' ? cancelBoth : undefined}
            onResponderTerminationRequest={() => false}
            style={{
              borderRadius: rightHitR,
              height: rightHitR * 2,
              left: rightHitLeft,
              position: 'absolute',
              top: rightHitTop,
              width: rightHitR * 2,
            }}
          />
        </>
      ) : null}
      <JoystickVisual
        {...leftDefinition}
        robotControl={Boolean(leftDefinition.onSample)}
        variant={variant}
        backdrop={backdrop}
        showLabel={showLabels}
        size={layout?.left.size ?? size}
        disabled={inputDisabled}
        active={left.active}
        anchor={left.anchor ?? (layout ? { x: layout.left.centerX, y: layout.left.centerY } : floating ? { x: radius, y: pairHeight / 2 } : null)}
        floating={floating || Boolean(layout)}
        showVisuals={showVisuals}
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
        backdrop={backdrop}
        showLabel={showLabels}
        size={layout?.right.size ?? size}
        disabled={inputDisabled}
        active={right.active}
        anchor={right.anchor ?? (layout ? { x: layout.right.centerX, y: layout.right.centerY } : floating ? { x: pairWidth - radius, y: pairHeight / 2 } : null)}
        floating={floating || Boolean(layout)}
        showVisuals={showVisuals}
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
  dialArc: { position: 'absolute', borderColor: 'transparent' },
  glassInnerRing: { position: 'absolute', borderColor: 'rgba(255, 255, 255, 0.18)', borderWidth: 1 },
  glassYawStem: { position: 'absolute', width: 10, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.55)' },
  glassYawStemLeft: { left: '19%' },
  glassYawStemRight: { right: '19%' },
  glassTickH: { position: 'absolute', width: 8, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.36)' },
  glassTickV: { position: 'absolute', width: 1, height: 8, backgroundColor: 'rgba(255, 255, 255, 0.36)' },
  glassTickLeft: { left: 6 },
  glassTickRight: { right: 6 },
  glassTickTop: { top: 6 },
  glassTickBottom: { bottom: 6 },
  dialDirection: { position: 'absolute', width: 6, height: 6, borderTopWidth: 1, borderRightWidth: 1 },
  dialDirectionLeft: { left: '18%', transform: [{ rotate: '-135deg' }] },
  dialDirectionRight: { right: '18%', transform: [{ rotate: '45deg' }] },
  dialDirectionUp: { top: '18%', transform: [{ rotate: '-45deg' }] },
  dialDirectionDown: { bottom: '18%', transform: [{ rotate: '135deg' }] },
  dialValue: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
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
