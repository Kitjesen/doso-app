import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './AppText';
import type {
  ControlJointState,
  ControlRuntimeState,
} from '../features/control/controlOperations';
import type { ControlAccentTone, StandbySceneId } from '../features/control/controlPreferences';
import { ControlHudDashboard } from './ControlHudDashboard';
import { BodyHeightPanel, FaultListPanel, GestureDeckPanel, JointParametersPanel, JointTemperaturePanel } from './ControlHudPanels';
import { getStandbySceneAsset, normalizeStandbyScene } from './standbyScenes';
import {
  collectHudFaults,
  HUD_BASIC_ACTIONS,
  projectJointTemperatures,
  projectTopSignalBadges,
  type HudBodyHeightState,
  type HudCameraPosition,
  type HudFaultItem,
  type HudForwardDirection,
  type HudGestureCategoryId,
  type HudGestureInput,
  type HudHeadlightMode,
  type HudJointModuleKind,
  type HudLeftCategory,
  type HudLegId,
} from './controlHudModel';

const FSD_BLUE = '#3E6AE1';
const FSD_BLUE_BG = 'rgba(62, 106, 225, 0.28)';
const FSD_BLUE_BORDER = 'rgba(147, 197, 253, 0.56)';
const GRAPHITE_ACTIVE_BG = 'rgba(255, 255, 255, 0.14)';
const GRAPHITE_ACTIVE_BORDER = 'rgba(255, 255, 255, 0.30)';
const DOCK_BG = 'rgba(22, 22, 22, 0.90)';
const DOCK_BORDER = 'rgba(255, 255, 255, 0.08)';
const MODAL_BG = 'rgba(22, 22, 22, 0.95)';
const EMERALD_DOT = '#34D399';
const EMERALD_INK = '#34D399';
const RED_ESTOP = '#EF4444';
const RED_ESTOP_DISABLED = 'rgba(239, 68, 68, 0.62)';
const INK = '#F2F2F2';
const MUTED = '#9A9A9A';
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.82)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 5,
} as const;

/** Typical G20 landscape system-bar gutters used by the web preview (status + right nav + gesture). */
export const G20_LANDSCAPE_PREVIEW_INSETS = { top: 28, right: 48, bottom: 24, left: 24 } as const;

export type LandscapeSafeInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

export type LandscapePolicyOption = Readonly<{
  id: string;
  label: string;
  disabled: boolean;
  selected: boolean;
  hint?: string;
}>;

export type LandscapePostureOption = Readonly<{
  id: 'stand' | 'sit' | 'prone' | 'recover';
  label: string;
  disabled: boolean;
  selected: boolean;
  hint?: string;
  onPress: () => void;
}>;

export type ControlLandscapeHudProps = Readonly<{
  robotName: string;
  connectionLabel: string;
  connectionState?: 'connected' | 'readonly' | 'disconnected';
  onBack: () => void;
  onOpenConnection?: () => void;
  onOpenJointStatus?: () => void;
  statusCardOpen?: boolean;
  onToggleStatusCard?: () => void;
  statusCardOverlay?: ReactNode;
  onOpenWorkspaceSettings?: () => void;
  inputSource?: 'touch' | 'physical';
  onClearFault?: () => void;
  clearFaultReady?: boolean;
  showLocalControl: boolean;
  showUnlocked: boolean;
  runtimeState?: ControlRuntimeState;
  sessionError?: string | null;
  recoveryError?: string | null;
  policies: readonly LandscapePolicyOption[];
  onSelectPolicy: (id: string) => void;
  motorEnabled: boolean | null;
  motorBusy?: boolean;
  motorDisabled?: boolean;
  motorHint?: string;
  onToggleMotor: () => void;
  postures: readonly LandscapePostureOption[];
  leftCategory: HudLeftCategory;
  onLeftCategoryChange: (category: HudLeftCategory) => void;
  selectedBasicAction: string;
  onSelectBasicAction: (id: string, supported: boolean, label: string) => void;
  gestures?: readonly HudGestureInput[];
  gestureCategory?: HudGestureCategoryId;
  onGestureCategoryChange?: (category: HudGestureCategoryId) => void;
  selectedGestureName?: string | null;
  onSelectGesture?: (name: string) => void;
  gestureGifPreview?: boolean;
  onToggleGestureGifPreview?: () => void;
  gestureDisabled?: boolean;
  gestureHint?: string;
  onPlayGesture?: (name: string) => void;
  speedLimitPercent: number;
  speedLimitExpanded: boolean;
  onToggleSpeedLimitExpanded: () => void;
  onChangeSpeedLimit: (nextPercent: number) => void;
  speedMode?: 'normal' | 'high' | 'unsupported' | null;
  onSelectSpeedMode?: (mode: 'normal' | 'high') => void;
  onReconnect?: () => void;
  hasDedicatedRearCamera?: boolean;
  batteryPercent?: number | null;
  voltageV?: number | null;
  remainingRangeKm?: number | null;
  onStop: () => void;
  stopDisabled: boolean;
  stopHint?: string;
  docksExpanded: boolean;
  onToggleDocks: () => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  onCloseSettings?: () => void;
  settingsLabel?: string;
  settingsMenu?: ReactNode;
  headlightMode: HudHeadlightMode;
  onToggleHeadlight: () => void;
  dualCameraEnabled: boolean;
  onToggleDualCamera: () => void;
  primaryCamera: HudCameraPosition;
  onSwapCamera: () => void;
  recordingActive: boolean;
  recordingDurationLabel?: string | null;
  onToggleRecord: () => void;
  onCapturePhoto: () => void;
  depthActive?: boolean;
  onToggleDepth?: () => void;
  depthPreview?: ReactNode;
  forwardDirection: HudForwardDirection;
  onReverseDirection: () => void;
  onChargePress: () => void;
  jointTempOpen: boolean;
  onToggleJointTemp: () => void;
  tempModuleKind: HudJointModuleKind;
  onTempModuleKindChange: (kind: HudJointModuleKind) => void;
  jointParamsOpen: boolean;
  onToggleJointParams: () => void;
  selectedLegId: HudLegId;
  onSelectLegId: (legId: HudLegId) => void;
  faultPanelOpen: boolean;
  onToggleFaultPanel: () => void;
  voiceChatOpen?: boolean;
  voiceChatStatusLabel?: string;
  voiceChatActive?: boolean;
  voiceChatLiveState?: 'idle' | 'listening' | 'thinking' | 'speaking';
  voiceChatEmotionLabel?: string | null;
  voiceChatQuietMode?: boolean;
  voiceChatPendingReminders?: number;
  voiceChatConnected?: boolean;
  voiceChatWalkUnlocked?: boolean;
  voiceChatActiveMove?: Readonly<{ active: boolean; progress: number; directionLabel: string }> | null;
  onToggleVoiceChat?: () => void;
  onLockVoiceWalk?: () => void;
  onStartHoldVoice?: () => void;
  onFinishHoldVoice?: (cancelled?: boolean) => void;
  onStopVoice?: () => void;
  onBrakeMove?: () => void;
  voiceChatPanel?: ReactNode;
  showVirtualDiscControls?: boolean;
  onToggleVirtualDiscControls?: () => void;
  bodyHeightPanelOpen?: boolean;
  onToggleBodyHeightPanel?: () => void;
  bodyHeight?: HudBodyHeightState | null;
  bodyHeightDraftM?: number | null;
  bodyHeightBusy?: boolean;
  bodyHeightError?: string | null;
  bodyHeightMoving?: boolean;
  bodyHeightLeased?: boolean;
  onSetBodyHeightMode?: (enabled: boolean) => void;
  onPreviewBodyHeight?: (heightM: number) => void;
  onCommitBodyHeight?: (heightM: number) => void;
  joints?: readonly ControlJointState[];
  hudNotice?: string | null;
  joystick: ReactNode;
  /** Same frame as the official landscape sticks. The map window must not change it. */
  stickFrameStyle?: ViewStyle;
  onStickFrameLayout?: (event: LayoutChangeEvent) => void;
  joystickSize?: number;
  stageWidth?: number;
  stageHeight?: number;
  pointCloud?: ReactNode | null;
  video: ReactNode;
  videoReceiving?: boolean;
  rearVideo?: ReactNode;
  rearVideoReceiving?: boolean;
  feedback?: string | null;
  confirmation?: ReactNode;
  recovery?: ReactNode;
  safeInsets?: LandscapeSafeInsets;
  previewSafeAreaGuides?: boolean;
  standbyScene?: StandbySceneId;
  accentTone?: ControlAccentTone;
}>;

function StandbySceneBackdrop({ scene }: { scene: StandbySceneId }) {
  const normalized = normalizeStandbyScene(scene);
  const [prevScene, setPrevScene] = useState<StandbySceneId | null>(null);
  const activeRef = useRef<StandbySceneId>(normalized);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (normalized === activeRef.current) return;
    const outgoing = activeRef.current;
    activeRef.current = normalized;
    setPrevScene(outgoing);
    fade.setValue(0);
    if (typeof Animated.timing === 'function') {
      Animated.timing(fade, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setPrevScene(null);
      });
    } else {
      fade.setValue(1);
      setPrevScene(null);
    }
  }, [fade, normalized]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {prevScene ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={getStandbySceneAsset(prevScene)}
          style={[StyleSheet.absoluteFill, styles.standbySceneImg]}
        />
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, styles.standbySceneImg, { opacity: fade }]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={getStandbySceneAsset(normalized)}
          style={[StyleSheet.absoluteFill, styles.standbySceneImg]}
        />
      </Animated.View>
      <View pointerEvents="none" style={styles.standbySceneTint} />
    </View>
  );
}

function SafeAreaGuides({ insets }: { insets: LandscapeSafeInsets }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="control-hud-safe-guides">
      {insets.top > 0 ? <View style={[styles.guideBar, styles.guideTop, { height: insets.top }]} /> : null}
      {insets.right > 0 ? <View style={[styles.guideBar, styles.guideRight, { width: insets.right }]} /> : null}
      {insets.bottom > 0 ? <View style={[styles.guideBar, styles.guideBottom, { height: insets.bottom }]} /> : null}
      {insets.left > 0 ? <View style={[styles.guideBar, styles.guideLeft, { width: insets.left }]} /> : null}
    </View>
  );
}

const voiceOrbHoldGesture = {
  timer: null as ReturnType<typeof setTimeout> | null,
  suppressResetTimer: null as ReturnType<typeof setTimeout> | null,
  holding: false,
  cancelled: false,
  suppressNextTap: false,
  startY: null as number | null,
};

function LivingBotOrbFace({
  mode,
  offline,
  scale = 1,
}: {
  mode: 'idle' | 'listening' | 'thinking' | 'speaking' | 'moving';
  offline: boolean;
  scale?: number;
}) {
  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (offline || typeof Animated.loop !== 'function' || typeof Animated.sequence !== 'function' || typeof Animated.timing !== 'function') {
      return;
    }
    const breatheAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: -1.4, duration: 2400, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );
    breatheAnim.start();
    const blinkAnim = typeof Animated.delay === 'function'
      ? Animated.loop(
          Animated.sequence([
            Animated.delay(3800),
            Animated.timing(blink, { toValue: 0.12, duration: 90, useNativeDriver: true }),
            Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
          ]),
        )
      : null;
    blinkAnim?.start();
    return () => {
      breatheAnim.stop();
      blinkAnim?.stop();
    };
  }, [blink, breathe, offline]);

  useEffect(() => {
    if ((mode !== 'listening' && mode !== 'speaking' && mode !== 'moving') || typeof Animated.loop !== 'function' || typeof Animated.timing !== 'function') {
      ripple.setValue(0);
      return;
    }
    ripple.setValue(0);
    const wave = Animated.loop(
      Animated.timing(ripple, { toValue: 1, duration: 1350, useNativeDriver: true }),
    );
    wave.start();
    return () => wave.stop();
  }, [mode, ripple]);

  const rippleScale = typeof ripple.interpolate === 'function'
    ? ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.56] })
    : 1;
  const rippleOpacity = typeof ripple.interpolate === 'function'
    ? ripple.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.42, 0.24, 0] })
    : 0;

  const isListening = mode === 'listening';
  const isSpeaking = mode === 'speaking';
  const isThinking = mode === 'thinking';
  const isMoving = mode === 'moving';
  const ringTint = isMoving
    ? 'rgba(233, 185, 99, 0.56)'
    : isListening || isSpeaking
      ? 'rgba(99, 199, 149, 0.52)'
      : 'transparent';
  const headBg = offline ? 'rgba(232, 233, 238, 0.36)' : '#ECEDF2';
  const eyeColor = '#121318';
  const eyeW = offline ? 5 : isSpeaking ? 5 : 3.2;
  const eyeH = offline ? 2 : isListening ? 6.8 : isSpeaking ? 2.8 : 5.4;

  return (
    <View pointerEvents="none" style={[styles.botOrbVisualWrap, scale !== 1 && { transform: [{ scale }] }]}>
      {isListening || isSpeaking || isMoving ? (
        <Animated.View
          style={[
            styles.botOrbRipple,
            {
              borderColor: ringTint,
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.botHeadShape,
          { backgroundColor: headBg, transform: [{ translateY: breathe }] },
        ]}
      >
        <Animated.View style={[styles.botEyesRow, !offline && { transform: [{ scaleY: blink }] }]}>
          <View
            style={{
              width: eyeW,
              height: isThinking ? 3.8 : eyeH,
              borderRadius: 2.2,
              backgroundColor: eyeColor,
            }}
          />
          <View
            style={{
              width: eyeW,
              height: isThinking ? 5.6 : eyeH,
              borderRadius: 2.2,
              backgroundColor: eyeColor,
            }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const POSTURE_RAIL_ITEMS = [
  { id: 'P', label: '停' },
  { id: 'S', label: '坐' },
  { id: 'N', label: '站' },
  { id: 'D', label: '行' },
] as const;

const JOINT_SHORT_LABELS: Readonly<Record<string, string>> = {
  '0': '右前髋', '1': '右前大', '2': '右前小', '12': '右前轮',
  '3': '左前髋', '4': '左前大', '5': '左前小', '13': '左前轮',
  '6': '右后髋', '7': '右后大', '8': '右后小', '14': '右后轮',
  '9': '左后髋', '10': '左后大', '11': '左后小', '15': '左后轮',
};

export type HudAlertBanner = Readonly<{
  key: string;
  kind: 'fault' | 'overheat' | 'low-battery';
  severity: 'critical' | 'warning';
  text: string;
  canClearFault: boolean;
}>;

export function deriveHudAlertBanner({
  faults,
  joints,
  voltageV,
  batteryPercent,
}: {
  faults: readonly HudFaultItem[];
  joints?: readonly ControlJointState[];
  voltageV?: number | null;
  batteryPercent?: number | null;
}): HudAlertBanner | null {
  const nonTempFaults = faults.filter(item => !item.id.startsWith('joint-temp-'));
  if (nonTempFaults.length > 0) {
    const primary = nonTempFaults[0];
    const hasCritical = nonTempFaults.some(item => item.severity === 'critical');
    const shortText = nonTempFaults.length === 1 && primary.title.length <= 10 ? primary.title : '检测到故障';
    return {
      key: `fault:${primary.id}:${nonTempFaults.length}`,
      kind: 'fault',
      severity: hasCritical ? 'critical' : 'warning',
      text: shortText,
      canClearFault: true,
    };
  }

  let hottest: { id: string; label: string; tempC: number } | null = null;
  for (const joint of joints ?? []) {
    if (joint?.source !== 'device' || joint.online !== true) continue;
    const tempC = joint.temperatureC;
    if (typeof tempC !== 'number' || !Number.isFinite(tempC) || tempC < 65) continue;
    if (!hottest || tempC > hottest.tempC) {
      hottest = { id: joint.id, label: JOINT_SHORT_LABELS[joint.id] ?? joint.label, tempC };
    }
  }
  if (hottest) {
    const severity = hottest.tempC >= 75 ? 'critical' : 'warning';
    return {
      key: `overheat:${hottest.id}:${severity}`,
      kind: 'overheat',
      severity,
      text: `${hottest.label} ${Math.round(hottest.tempC)}°C`,
      canClearFault: false,
    };
  }

  const pctLive = typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100;
  if (pctLive && batteryPercent <= 20) {
    const severity = batteryPercent <= 10 ? 'critical' : 'warning';
    return {
      key: `low-battery:pct:${severity}`,
      kind: 'low-battery',
      severity,
      text: `电量偏低 ${Math.round(batteryPercent)}%`,
      canClearFault: false,
    };
  }

  const voltLive = typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0;
  if (voltLive && voltageV < 44) {
    const severity = voltageV < 42.5 ? 'critical' : 'warning';
    return {
      key: `low-battery:volt:${severity}`,
      kind: 'low-battery',
      severity,
      text: `电量偏低 ${voltageV.toFixed(1)}V`,
      canClearFault: false,
    };
  }

  return null;
}

function resolveBatterySummary(batteryPercent?: number | null, voltageV?: number | null) {
  if (typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100) {
    const pct = Math.round(batteryPercent);
    return {
      text: `${pct}%`,
      fillRatio: pct / 100,
      live: true,
      fillColor: pct <= 20 ? '#EF4444' : pct <= 40 ? '#F59E0B' : '#FFFFFF',
    };
  }
  if (typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0) {
    const ratio = Math.min(1, Math.max(0.14, (voltageV - 42) / 12.6));
    return {
      text: `${voltageV.toFixed(1)}V`,
      fillRatio: ratio,
      live: true,
      fillColor: voltageV < 44 ? '#F59E0B' : '#34D399',
    };
  }
  return {
    text: '--',
    fillRatio: 0,
    live: false,
    fillColor: 'rgba(255, 255, 255, 0.25)',
  };
}

export function controlLandscapeHud({
  robotName,
  connectionLabel,
  connectionState,
  onBack,
  onOpenConnection,
  onOpenJointStatus,
  statusCardOpen = false,
  onToggleStatusCard,
  statusCardOverlay,
  inputSource = 'touch',
  onClearFault,
  clearFaultReady = false,
  showLocalControl,
  showUnlocked,
  runtimeState,
  sessionError,
  recoveryError,
  policies,
  onSelectPolicy,
  motorEnabled,
  motorBusy = false,
  motorDisabled = true,
  motorHint,
  onToggleMotor,
  postures,
  leftCategory,
  onLeftCategoryChange,
  selectedBasicAction,
  onSelectBasicAction,
  gestures = [],
  gestureCategory = 'all',
  onGestureCategoryChange,
  selectedGestureName = null,
  onSelectGesture,
  gestureGifPreview = true,
  onToggleGestureGifPreview,
  gestureDisabled = true,
  gestureHint,
  onPlayGesture,
  speedLimitPercent,
  speedLimitExpanded,
  onToggleSpeedLimitExpanded,
  onChangeSpeedLimit,
  speedMode = null,
  onSelectSpeedMode,
  onReconnect,
  hasDedicatedRearCamera,
  batteryPercent,
  voltageV,
  remainingRangeKm,
  onStop,
  stopDisabled,
  stopHint,
  docksExpanded,
  onToggleDocks,
  onOpenSettings,
  settingsOpen = false,
  onCloseSettings,
  settingsLabel = '设置',
  settingsMenu,
  headlightMode,
  dualCameraEnabled,
  onToggleDualCamera,
  primaryCamera,
  onSwapCamera,
  recordingActive,
  recordingDurationLabel,
  onToggleRecord,
  onCapturePhoto,
  depthActive = false,
  onToggleDepth,
  depthPreview,
  forwardDirection,
  onReverseDirection,
  onChargePress,
  jointTempOpen,
  onToggleJointTemp,
  tempModuleKind,
  onTempModuleKindChange,
  jointParamsOpen,
  onToggleJointParams,
  selectedLegId,
  onSelectLegId,
  faultPanelOpen,
  onToggleFaultPanel,
  voiceChatOpen = false,
  voiceChatStatusLabel,
  voiceChatActive = false,
  voiceChatLiveState = 'idle',
  voiceChatQuietMode = false,
  voiceChatPendingReminders = 0,
  voiceChatConnected = false,
  voiceChatWalkUnlocked = false,
  voiceChatActiveMove = null,
  onToggleVoiceChat,
  onLockVoiceWalk,
  onStartHoldVoice,
  onFinishHoldVoice,
  onStopVoice,
  onBrakeMove,
  voiceChatPanel,
  bodyHeightPanelOpen = false,
  onToggleBodyHeightPanel,
  bodyHeight = null,
  bodyHeightDraftM = null,
  bodyHeightBusy = false,
  bodyHeightError = null,
  bodyHeightMoving = false,
  bodyHeightLeased = false,
  onSetBodyHeightMode,
  onPreviewBodyHeight,
  onCommitBodyHeight,
  joints,
  hudNotice,
  joystick,
  stickFrameStyle,
  onStickFrameLayout,
  joystickSize,
  stageWidth,
  stageHeight,
  pointCloud,
  video,
  videoReceiving = false,
  rearVideo,
  rearVideoReceiving = false,
  feedback,
  confirmation,
  recovery,
  safeInsets,
  previewSafeAreaGuides,
  standbyScene = 'charcoal',
  accentTone = 'graphite',
}: ControlLandscapeHudProps) {
  const connection = connectionState ?? (connectionLabel === '已连接' ? 'connected' : connectionLabel.includes('只读') ? 'readonly' : 'disconnected');
  const hasFrontVideo = video != null && video !== false;
  const hasRearVideo = rearVideo != null && rearVideo !== false;
  const showMainFront = primaryCamera === 'front';
  const activeMainFeed = showMainFront ? (hasFrontVideo ? video : null) : (hasRearVideo ? rearVideo : null);
  const activeMainFeedReceiving = showMainFront ? videoReceiving : rearVideoReceiving;
  const secondaryPipFeed = showMainFront ? (hasRearVideo ? rearVideo : null) : (hasFrontVideo ? video : null);
  const insets = {
    top: Math.max(0, safeInsets?.top ?? 0),
    right: Math.max(0, safeInsets?.right ?? 0),
    bottom: Math.max(0, safeInsets?.bottom ?? 0),
    left: Math.max(0, safeInsets?.left ?? 0),
  };
  const rawStageW = stageWidth && stageWidth > 0 ? stageWidth : 960;
  const rawStageH = stageHeight && stageHeight > 0 ? stageHeight : 540;
  const effectiveStageW = Math.max(320, rawStageW - insets.left - insets.right);
  const effectiveStageH = Math.max(240, rawStageH - insets.top - insets.bottom);
  const rawRatio = stageWidth && stageHeight && stageWidth > 0 && stageHeight > 0
    ? Math.min(effectiveStageW / 960, effectiveStageH / 540)
    : 1;
  const hudScale = rawRatio < 1
    ? Math.max(0.74, 0.28 + rawRatio * 0.72)
    : Math.min(1.20, 1 + (rawRatio - 1) * 0.20);
  const sp = (value: number) => Math.round(value * hudScale);
  const fBody = Math.max(10.5, sp(12.5));
  const fBodyLine = Math.max(14, sp(17));
  const fMeta = Math.max(9.5, sp(11));
  const fMetaLine = Math.max(13, sp(15));
  const compactStage = effectiveStageW < 900 || effectiveStageH < 460;
  const narrowStage = effectiveStageW < 760;
  const ultraNarrowStage = effectiveStageW < 640;
  const shortStage = effectiveStageH < 410;
  const edgeX = ultraNarrowStage ? 6 : narrowStage ? 8 : compactStage ? 10 : sp(16);
  const edgeTop = shortStage ? 6 : compactStage ? 8 : sp(12);
  const edgeBottom = shortStage ? 6 : compactStage ? 8 : sp(12);
  const topBarClearance = edgeTop + sp(36);
  const orbSize = ultraNarrowStage ? 36 : narrowStage ? 38 : compactStage ? 40 : sp(46);
  const bottomBarClearance = edgeBottom + Math.max(orbSize, sp(38)) + sp(8);

  const isBlueAccent = accentTone === 'fsdBlue';
  const activeItemBg = isBlueAccent ? FSD_BLUE_BG : GRAPHITE_ACTIVE_BG;
  const activeSolidBg = isBlueAccent ? FSD_BLUE : '#323232';
  const activeIconTint = isBlueAccent ? '#93C5FD' : '#F2F2F2';
  const activeBadgeBorder = isBlueAccent ? FSD_BLUE_BORDER : GRAPHITE_ACTIVE_BORDER;

  const pipW = ultraNarrowStage
    ? 112
    : narrowStage
      ? 128
      : compactStage
        ? sp(148)
        : stageWidth && stageWidth > 0
          ? Math.max(168, Math.min(210, Math.round(effectiveStageW * 0.18)))
          : sp(176);
  const pipH = Math.round((pipW * 9) / 16);
  const pipTop = topBarClearance + sp(4);
  const overlayW = Math.min(
    436,
    Math.max(260, Math.min(effectiveStageW - edgeX * 2, Math.round(effectiveStageW * (narrowStage ? 0.62 : 0.44)))),
  );
  const centerStackInset = Math.round((joystickSize || 220) + sp(24));
  const actionModalWidth = Math.min(sp(640), Math.max(280, effectiveStageW - edgeX * 2 - sp(12)));
  const actionModalTop = topBarClearance + sp(4);
  const actionModalBottom = bottomBarClearance;
  const availableActionH = Math.max(148, effectiveStageH - actionModalTop - actionModalBottom);
  const feedbackMaxW = Math.min(320, Math.max(180, Math.round(effectiveStageW * 0.38)));
  const topToastTop = topBarClearance + (speedLimitExpanded ? sp(40) : sp(4));
  // Keep gesture grid cleanly inside the available vertical band across 360dp..720dp+ viewports.
  const gestureMaxListHeight = Math.max(
    108,
    Math.min(effectiveStageH >= 620 ? 234 : effectiveStageH >= 500 ? 194 : 154, availableActionH - sp(92)),
  );
  const voiceWingCompactTelemetry = Boolean(voiceChatOpen && voiceChatPanel) && (shortStage || compactStage);
  const voiceWingTop = voiceWingCompactTelemetry ? edgeTop + sp(84) : edgeTop + sp(128);
  const voiceWingBottom = bottomBarClearance;
  const voiceWingWidth = Math.min(
    340,
    Math.max(220, Math.min(Math.round(effectiveStageW * 0.44), effectiveStageW - edgeX * 2)),
  );
  const dockFont = ultraNarrowStage ? 10.5 : narrowStage ? 11 : fBody;
  const dockLine = ultraNarrowStage ? 14 : narrowStage ? 15 : fBodyLine;
  const dockPadX = ultraNarrowStage ? 4 : narrowStage ? 5 : compactStage ? 6 : sp(10);
  const camPadX = ultraNarrowStage ? 5 : narrowStage ? 4 : compactStage ? 5 : sp(7);
  const showCameraLabels = !ultraNarrowStage;
  const topCenterGuardX = Math.max(edgeX, Math.round(effectiveStageW * 0.24));

  const faults = collectHudFaults({ runtimeState, sessionError, recoveryError });
  const alertBanner = deriveHudAlertBanner({ faults, joints, voltageV, batteryPercent });
  const signals = projectTopSignalBadges({ connection, runtimeState });
  const tempSummary = projectJointTemperatures('motor', joints);
  const standOption = postures.find(item => item.id === 'stand');
  const sitOption = postures.find(item => item.id === 'sit');
  const recoverOption = postures.find(item => item.id === 'recover');
  const drawerPostures = postures.filter(item => item.id === 'prone');
  const recoveryModeSelected = runtimeState?.recoveryMode?.selected === true;
  const speedLimitClamped = Math.min(100, Math.max(10, Math.round(speedLimitPercent)));
  const visiblePolicies = policies.length > 0
    ? policies
    : [
      { id: 'flat', label: '平地', disabled: true, selected: false, hint: '暂无可用模式' },
      { id: 'stairs', label: '楼梯', disabled: true, selected: false, hint: '暂无可用模式' },
      { id: 'platform', label: '高台', disabled: true, selected: false, hint: '暂无可用模式' },
    ];
  const hasVoiceOverlay = Boolean(voiceChatOpen && voiceChatPanel);
  const anyFloatingPanel = (faultPanelOpen && faults.length > 0) || jointParamsOpen || jointTempOpen || bodyHeightPanelOpen || Boolean(recovery);
  const suppressEmptyVideo = anyFloatingPanel || hasVoiceOverlay || leftCategory !== 'policy' || Boolean(settingsMenu) || statusCardOpen;

  const activeHeightBadgeText = bodyHeight?.active && bodyHeight.supported
    && typeof bodyHeight.currentHeightM === 'number' && Number.isFinite(bodyHeight.currentHeightM) && bodyHeight.currentHeightM > 0
    ? `${bodyHeight.currentHeightM.toFixed(2)}m`
    : null;
  const remoteControlled = runtimeState?.controlOwner === 'remote' || runtimeState?.controlOwner === 'robot-remote';
  const battery = resolveBatterySummary(batteryPercent, voltageV);
  const inlineTempText = tempSummary.maxTempC !== null ? `${Math.round(tempSummary.maxTempC)}°C` : null;
  const voltageDisplayText = typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0
    ? `${voltageV.toFixed(1)}V`
    : battery.live
      ? battery.text
      : null;
  const statusMetricText = voltageDisplayText && inlineTempText
    ? `${voltageDisplayText} · ${inlineTempText}`
    : voltageDisplayText ?? inlineTempText ?? '状态';

  const linearMps = typeof runtimeState?.speed?.linearMps === 'number' && Number.isFinite(runtimeState.speed.linearMps) ? runtimeState.speed.linearMps : 0;
  const lateralMps = typeof runtimeState?.speed?.lateralMps === 'number' && Number.isFinite(runtimeState.speed.lateralMps) ? runtimeState.speed.lateralMps : 0;
  const speedMag = Math.hypot(linearMps, lateralMps);
  const heroSpeedText = speedMag.toFixed(1);
  const activePostureSlot: 'P' | 'S' | 'N' | 'D' = connection !== 'connected' || motorEnabled === false
    ? 'P'
    : runtimeState?.posture === 'sitting'
      ? 'S'
      : runtimeState?.posture === 'standing'
        ? (speedMag > 0.04 ? 'D' : 'N')
        : 'P';

  const speedSignValue = speedMode === 'high'
    ? (speedLimitClamped < 100 ? `${speedLimitClamped}%` : '2.5')
    : (speedLimitClamped < 100 ? `${speedLimitClamped}%` : '1.0');
  const activeModeLabel = bodyHeight?.active
    ? `高度${activeHeightBadgeText ? ` ${activeHeightBadgeText}` : ''}`
    : recoveryModeSelected
      ? '恢复'
      : '常规';

  const cycleLeftCategory = () => {
    const order: readonly HudLeftCategory[] = ['policy', 'action'];
    const next = order[(order.indexOf(leftCategory) + 1) % order.length];
    onLeftCategoryChange(next);
  };

  const showHighSpeedOption = Boolean(onSelectSpeedMode && (speedMode === 'normal' || speedMode === 'high'));
  const wifiHeaderLabel = connection === 'connected' && robotName && robotName !== 'DOSO 机器狗'
    ? robotName
    : '机器狗 Wi-Fi';

  return (
    <View style={styles.root} testID="control-landscape-hud" pointerEvents="box-none">
      <View pointerEvents="none" style={styles.backdrop} testID="control-video-backdrop" />
      {!activeMainFeedReceiving ? (
        <View pointerEvents="none" style={styles.standbySceneLayer} testID={`control-hud-standby-scene-${normalizeStandbyScene(standbyScene)}`}>
          <StandbySceneBackdrop scene={standbyScene} />
        </View>
      ) : null}
      {activeMainFeed ? (
        <View pointerEvents="none" style={[styles.media, !activeMainFeedReceiving && styles.mediaBuffering]} testID="control-media-stage">
          {activeMainFeed}
        </View>
      ) : null}

      {/* Soft borderless edge scrims for crisp readability without heavy bars */}
      <View pointerEvents="none" style={[styles.topScrimSoft, { height: sp(74) }]} />
      <View pointerEvents="none" style={[styles.topScrimEdge, { height: sp(34) }]} />
      <View pointerEvents="none" style={[styles.bottomScrimSoft, { height: sp(72) }]} />
      {previewSafeAreaGuides ? <SafeAreaGuides insets={insets} /> : null}

      <View
        pointerEvents="box-none"
        style={[styles.safeChrome, { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }]}
        testID="control-landscape-safe"
      >
        {/* Joystick Touch Layer (rendered FIRST at zIndex 3 / elevation 3 so capture never steals HUD/modal taps) */}
        <View
          onLayout={onStickFrameLayout}
          pointerEvents={settingsMenu || statusCardOpen || leftCategory === 'action' || Boolean(confirmation) || !joystick ? 'none' : 'box-none'}
          style={[styles.stickFrame, stickFrameStyle, (settingsMenu || statusCardOpen || leftCategory === 'action' || !joystick) ? styles.hiddenStickFrame : null]}
          testID="control-immersive-sticks"
        >
          {joystick}
        </View>
        {/* Subtle non-blocking video status badge (never covers the 3D standby robot silhouette) */}
        {!activeMainFeedReceiving ? (
          <View
            pointerEvents="none"
            style={[
              styles.emptyVideo,
              { paddingHorizontal: topCenterGuardX, top: edgeTop + sp(4) },
              suppressEmptyVideo && styles.emptyVideoHidden,
            ]}
            testID={showMainFront ? 'control-hud-video-empty' : 'control-hud-rear-video-empty'}
            accessibilityLiveRegion="polite"
          >
            <View style={[styles.emptyChip, { borderRadius: sp(8), paddingHorizontal: sp(10), paddingVertical: sp(4) }]}>
              <Text numberOfLines={1} style={[styles.emptyTitle, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                {showMainFront
                  ? activeMainFeed
                    ? '连接画面中'
                    : (connection === 'disconnected' ? '未连接' : '等待画面')
                  : activeMainFeed
                    ? '连接画面中'
                    : '无后视画面'}
              </Text>
            </View>
          </View>
        ) : null}

        {pointCloud && !settingsMenu && !statusCardOpen ? (
          <View
            pointerEvents="box-none"
            style={[styles.centerStack, { left: centerStackInset, right: centerStackInset, bottom: stickFrameStyle?.bottom ?? 72 }]}
            testID="control-hud-center-stack"
          >
            {pointCloud}
          </View>
        ) : null}

        {/* Optional Upper-Right Dual Camera / Depth PiP Window */}
        {dualCameraEnabled && !settingsMenu && !statusCardOpen ? (
          <Pressable
            accessibilityLabel={`切换${depthActive ? '深度图' : showMainFront ? '后视角' : '前视角'}画面`}
            accessibilityRole="button"
            onPress={onSwapCamera}
            style={({ pressed }) => [styles.pipWindow, { borderRadius: sp(10), height: pipH, right: edgeX, top: pipTop, width: pipW }, pressed && styles.pressed]}
            testID="control-hud-pip-window"
          >
            {depthActive && depthPreview ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{depthPreview}</View>
            ) : secondaryPipFeed ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{secondaryPipFeed}</View>
            ) : (
              <View pointerEvents="none" style={[styles.pipPlaceholder, { gap: sp(4) }]} testID="control-hud-pip-placeholder">
                <Ionicons color={MUTED} name="videocam-off-outline" size={sp(18)} />
              </View>
            )}
            <View pointerEvents="none" style={[styles.pipHeaderRow, { left: sp(8), top: sp(8) }]}>
              <View style={[styles.pipBadge, { borderRadius: sp(6), paddingHorizontal: sp(7), paddingVertical: sp(2) }]}>
                <Text numberOfLines={1} style={[styles.pipBadgeText, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                  {depthActive ? '深度图 ⇄' : showMainFront ? (hasDedicatedRearCamera === false ? '副视窗 ⇄' : '后广角 ⇄') : '前视角 ⇄'}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* Bottom 3 Docks (borderRadius: 10, Matte Charcoal) */}
        {!settingsMenu ? (
          <View
            pointerEvents="box-none"
            style={[styles.bottomThreeCardRow, { bottom: edgeBottom, gap: ultraNarrowStage ? 4 : narrowStage ? 5 : sp(8), left: edgeX, right: edgeX }]}
            testID="control-hud-left-controls"
          >
            {/* Left Trigger: Single Unified Living Bot Orb (Tap = Dialogue/Stop, Hold = Speak) + Amber Walk-Lock Badge */}
            <View style={[styles.voiceOrbDock, { gap: narrowStage ? 5 : 8 }]} testID="control-hud-utility-card">
              {onToggleVoiceChat ? (() => {
                const moveActive = Boolean(voiceChatActiveMove?.active);
                const voiceBusyState = moveActive || voiceChatLiveState === 'listening' || voiceChatLiveState === 'thinking' || voiceChatLiveState === 'speaking' || voiceChatActive;
                const orbMode: 'idle' | 'listening' | 'thinking' | 'speaking' | 'moving' = moveActive
                  ? 'moving'
                  : voiceChatLiveState === 'listening'
                    ? 'listening'
                    : voiceChatLiveState === 'speaking'
                      ? 'speaking'
                      : voiceChatLiveState === 'thinking' || voiceChatActive
                        ? 'thinking'
                        : 'idle';
                const voiceDotColor = moveActive
                  ? '#E9B963'
                  : voiceChatLiveState === 'listening' || voiceChatLiveState === 'speaking'
                    ? '#63C795'
                    : voiceChatLiveState === 'thinking' || voiceChatQuietMode
                      ? '#E9B963'
                      : voiceChatConnected
                        ? '#63C795'
                        : '#7A7D85';
                const orbFaceScale = orbSize < 42 ? Number((orbSize / 44).toFixed(2)) : 1;
                return (
                  <Pressable
                    accessibilityLabel={
                      moveActive
                        ? '点击刹停'
                        : voiceChatOpen
                          ? '收起语音对话'
                          : voiceChatStatusLabel
                            ? `小算 ${voiceChatStatusLabel}`
                            : '打开语音对话'
                    }
                    accessibilityRole="button"
                    accessibilityState={{ expanded: voiceChatOpen, selected: voiceChatOpen || voiceBusyState }}
                    onPress={() => {
                      if (voiceOrbHoldGesture.suppressNextTap) {
                        voiceOrbHoldGesture.suppressNextTap = false;
                        return;
                      }
                      if (moveActive && onBrakeMove) {
                        onBrakeMove();
                        return;
                      }
                      if (voiceChatLiveState === 'speaking' && onStopVoice) {
                        onStopVoice();
                        return;
                      }
                      onToggleVoiceChat();
                    }}
                    onPressIn={event => {
                      if (voiceOrbHoldGesture.timer) {
                        clearTimeout(voiceOrbHoldGesture.timer);
                        voiceOrbHoldGesture.timer = null;
                      }
                      if (voiceOrbHoldGesture.suppressResetTimer) {
                        clearTimeout(voiceOrbHoldGesture.suppressResetTimer);
                        voiceOrbHoldGesture.suppressResetTimer = null;
                      }
                      voiceOrbHoldGesture.holding = false;
                      voiceOrbHoldGesture.cancelled = false;
                      voiceOrbHoldGesture.suppressNextTap = false;
                      const pageY = event?.nativeEvent?.pageY;
                      voiceOrbHoldGesture.startY = typeof pageY === 'number' && Number.isFinite(pageY) ? pageY : null;
                      if (onStartHoldVoice) {
                        voiceOrbHoldGesture.timer = setTimeout(() => {
                          voiceOrbHoldGesture.timer = null;
                          voiceOrbHoldGesture.holding = true;
                          voiceOrbHoldGesture.suppressNextTap = true;
                          onStartHoldVoice();
                        }, 260);
                      }
                    }}
                    onPressOut={event => {
                      if (voiceOrbHoldGesture.timer) {
                        clearTimeout(voiceOrbHoldGesture.timer);
                        voiceOrbHoldGesture.timer = null;
                      }
                      if (voiceOrbHoldGesture.holding) {
                        const endY = event?.nativeEvent?.pageY;
                        const slidUp =
                          voiceOrbHoldGesture.startY !== null
                          && typeof endY === 'number'
                          && Number.isFinite(endY)
                          && (voiceOrbHoldGesture.startY - endY) > 44;
                        const wasCancelled = voiceOrbHoldGesture.cancelled || slidUp;
                        voiceOrbHoldGesture.holding = false;
                        voiceOrbHoldGesture.cancelled = false;
                        voiceOrbHoldGesture.startY = null;
                        // Clear suppressNextTap shortly after release so a cancelled hold never swallows the next tap.
                        if (voiceOrbHoldGesture.suppressResetTimer) clearTimeout(voiceOrbHoldGesture.suppressResetTimer);
                        voiceOrbHoldGesture.suppressResetTimer = setTimeout(() => {
                          voiceOrbHoldGesture.suppressResetTimer = null;
                          voiceOrbHoldGesture.suppressNextTap = false;
                        }, 120);
                        onFinishHoldVoice?.(wasCancelled);
                      } else {
                        voiceOrbHoldGesture.startY = null;
                        voiceOrbHoldGesture.suppressNextTap = false;
                      }
                    }}
                    style={({ pressed }) => [
                      styles.botOrbBtn,
                      { width: orbSize, height: orbSize, borderRadius: orbSize / 2 },
                      voiceChatOpen && styles.botOrbBtnOpen,
                      moveActive && styles.botOrbBtnMoving,
                      voiceChatLiveState === 'listening' && styles.botOrbBtnListening,
                      pressed && styles.botOrbBtnPressed,
                    ]}
                    testID="control-hud-voice-toggle"
                  >
                    <LivingBotOrbFace mode={orbMode} offline={!voiceChatConnected && !voiceBusyState} scale={orbFaceScale} />
                    <View
                      style={[
                        styles.botPresenceDot,
                        { backgroundColor: voiceDotColor },
                      ]}
                      testID="control-hud-voice-presence-dot"
                    />
                    {voiceChatPendingReminders > 0 ? (
                      <View style={styles.botReminderBadge} testID="control-hud-voice-reminder-badge">
                        <Text style={styles.voiceReminderBadgeText}>{String(voiceChatPendingReminders)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })() : null}

              {voiceChatWalkUnlocked && onLockVoiceWalk ? (
                <Pressable
                  accessibilityLabel="立即锁定语音走动"
                  accessibilityRole="button"
                  onPress={onLockVoiceWalk}
                  style={({ pressed }) => [styles.walkUnlockBadge, pressed && styles.pressed]}
                  testID="control-hud-voice-walk-lock"
                >
                  <Ionicons color="#E9B963" name="lock-open-outline" size={12} />
                  <Text numberOfLines={1} style={styles.walkUnlockBadgeText}>走动中</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Center Dock: 使能 | 站立 坐下 摔倒恢复 | 姿态 动作 ▾ */}
            <View
              style={[
                styles.dockCard,
                styles.dockCardShrinkable,
                {
                  gap: ultraNarrowStage ? 2 : narrowStage ? 3 : compactStage ? 4 : sp(6),
                  minHeight: shortStage ? 34 : sp(38),
                  paddingHorizontal: ultraNarrowStage ? 4 : narrowStage ? 5 : compactStage ? 7 : sp(9),
                  paddingVertical: shortStage ? 2 : sp(3),
                },
              ]}
              testID="control-hud-primary-card"
            >
              <Pressable
                accessibilityHint={motorHint}
                accessibilityLabel={motorEnabled ? '失能电机' : '使能电机'}
                accessibilityRole="switch"
                accessibilityState={{ checked: motorEnabled === true, disabled: motorDisabled || motorBusy, busy: motorBusy }}
                disabled={motorDisabled || motorBusy}
                onPress={onToggleMotor}
                style={({ pressed }) => [
                  styles.dockMotorBtn,
                  { gap: narrowStage ? 3 : sp(5), minHeight: shortStage ? 26 : sp(30), paddingHorizontal: narrowStage ? 3 : sp(4) },
                  (motorDisabled || motorBusy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-motor-power"
              >
                <View style={[styles.motorDot, { borderRadius: sp(4), height: sp(7), width: sp(7) }, motorEnabled ? styles.motorDotArmed : styles.motorDotOff]} />
                <Text numberOfLines={1} style={[styles.dockMotorText, { fontSize: dockFont, lineHeight: dockLine }, motorEnabled && styles.dockMotorTextArmed]}>
                  {motorEnabled ? '失能' : '使能'}
                </Text>
              </Pressable>

              <View style={[styles.dockDivider, { height: sp(15) }]} />

              <View style={[styles.dockPostureGroup, { gap: narrowStage ? 1 : sp(2) }]} testID="control-hud-quick-posture">
                <Pressable
                  accessibilityHint={standOption?.hint}
                  accessibilityLabel="起立"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: standOption?.disabled ?? true, selected: standOption?.selected ?? false }}
                  disabled={standOption?.disabled ?? true}
                  onPress={() => standOption?.onPress()}
                  style={({ pressed }) => [
                    styles.cardItemBtn,
                    { minHeight: shortStage ? 26 : sp(30), paddingHorizontal: dockPadX },
                    standOption?.selected && styles.dockItemBtnActive,
                    (standOption?.disabled ?? true) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-quick-stand"
                >
                  <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, standOption?.selected && styles.cardItemTextActive]}>站立</Text>
                </Pressable>

                <Pressable
                  accessibilityHint={sitOption?.hint}
                  accessibilityLabel="坐下"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: sitOption?.disabled ?? true, selected: sitOption?.selected ?? false }}
                  disabled={sitOption?.disabled ?? true}
                  onPress={() => sitOption?.onPress()}
                  style={({ pressed }) => [
                    styles.cardItemBtn,
                    { minHeight: shortStage ? 26 : sp(30), paddingHorizontal: dockPadX },
                    sitOption?.selected && styles.dockItemBtnActive,
                    (sitOption?.disabled ?? true) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-quick-sit"
                >
                  <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, sitOption?.selected && styles.cardItemTextActive]}>坐下</Text>
                </Pressable>

                {recoverOption ? (
                  <Pressable
                    accessibilityHint={recoverOption.hint}
                    accessibilityLabel={recoverOption.label}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: recoverOption.disabled || recoverOption.selected, selected: recoverOption.selected }}
                    disabled={recoverOption.disabled || recoverOption.selected}
                    onPress={() => {
                      if (!recoverOption.disabled && !recoverOption.selected) recoverOption.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.cardItemBtn,
                      { minHeight: shortStage ? 26 : sp(30), paddingHorizontal: dockPadX },
                      (recoverOption.selected || recoveryModeSelected) && { backgroundColor: activeItemBg },
                      recoverOption.disabled && !recoverOption.selected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={(recoverOption.selected ? 'control-hud-posture-selected-' : 'control-hud-posture-') + 'recover'}
                  >
                    <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, (recoverOption.selected || recoveryModeSelected) && styles.cardItemTextActive]}>
                      {recoverOption.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={[styles.dockDivider, { height: sp(15) }]} />

              <View style={[styles.dockCategories, { gap: narrowStage ? 1 : sp(2) }]} testID="control-hud-left-category-tabs">
                <Pressable
                  accessibilityLabel="姿态"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: leftCategory === 'posture' }}
                  onPress={() => onLeftCategoryChange(leftCategory === 'posture' ? 'policy' : 'posture')}
                  style={({ pressed }) => [
                    styles.cardItemBtn,
                    { minHeight: shortStage ? 26 : sp(30), paddingHorizontal: dockPadX },
                    (leftCategory === 'posture' || bodyHeightPanelOpen || Boolean(bodyHeight?.active)) && { backgroundColor: activeItemBg },
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-category-posture"
                >
                  <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, (leftCategory === 'posture' || bodyHeightPanelOpen || Boolean(bodyHeight?.active)) && styles.cardItemTextActive]}>
                    {activeHeightBadgeText ?? '姿态'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="动作"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: leftCategory === 'action' }}
                  onPress={() => onLeftCategoryChange(leftCategory === 'action' ? 'policy' : 'action')}
                  style={({ pressed }) => [
                    styles.cardItemBtn,
                    { minHeight: shortStage ? 26 : sp(30), paddingHorizontal: dockPadX },
                    leftCategory === 'action' && { backgroundColor: activeSolidBg },
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-category-action"
                >
                  <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, leftCategory === 'action' && styles.cardItemTextActive]}>
                    动作 ▾
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Right Dock: 抓拍 | 录屏 | 深度 | 双摄 | 切镜 | ^ */}
            <View
              style={[
                styles.dockCard,
                styles.dockCardShrinkable,
                {
                  gap: narrowStage ? 1 : sp(2),
                  minHeight: shortStage ? 34 : sp(38),
                  paddingHorizontal: narrowStage ? 3 : sp(5),
                  paddingVertical: shortStage ? 2 : sp(3),
                },
              ]}
              testID="control-hud-camera-rail"
            >
              <Pressable
                accessibilityLabel="拍照保存画面"
                accessibilityRole="button"
                onPress={onCapturePhoto}
                style={({ pressed }) => [styles.cardItemBtn, { gap: sp(3), minHeight: shortStage ? 26 : sp(30), paddingHorizontal: camPadX }, pressed && styles.pressed]}
                testID="control-hud-photo-capture"
              >
                <Ionicons color={INK} name="camera-outline" size={narrowStage ? 13 : sp(14)} />
                {showCameraLabels ? <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }]}>抓拍</Text> : null}
              </Pressable>

              <Pressable
                accessibilityLabel={recordingActive ? '结束录屏' : '开始录屏'}
                accessibilityRole="button"
                accessibilityState={{ selected: recordingActive }}
                onPress={onToggleRecord}
                style={({ pressed }) => [
                  styles.cardItemBtn,
                  { gap: sp(3), minHeight: shortStage ? 26 : sp(30), paddingHorizontal: camPadX },
                  recordingActive && styles.cardItemBtnDanger,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-record-toggle"
              >
                <Ionicons color={recordingActive ? '#FCA5A5' : INK} name={recordingActive ? 'stop-circle-outline' : 'videocam-outline'} size={narrowStage ? 13 : sp(14)} />
                {showCameraLabels ? <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, recordingActive && styles.cardItemTextActive]}>录屏</Text> : null}
              </Pressable>

              <Pressable
                accessibilityLabel={depthActive ? '关闭深度图叠层' : '开启深度图预览'}
                accessibilityRole="button"
                accessibilityState={{ selected: depthActive }}
                onPress={onToggleDepth}
                style={({ pressed }) => [
                  styles.cardItemBtn,
                  { gap: sp(3), minHeight: shortStage ? 26 : sp(30), paddingHorizontal: camPadX },
                  depthActive && { backgroundColor: activeItemBg },
                  pressed && styles.pressed,
                ]}
                testID="control-hud-depth-toggle"
              >
                <Ionicons color={depthActive ? activeIconTint : INK} name="radio-button-on-outline" size={narrowStage ? 13 : sp(14)} />
                {showCameraLabels ? <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, depthActive && styles.cardItemTextActive]}>深度</Text> : null}
              </Pressable>

              <Pressable
                accessibilityLabel={dualCameraEnabled ? '关闭双广角，切为单广角' : '开启双广角'}
                accessibilityRole="button"
                accessibilityState={{ selected: dualCameraEnabled }}
                onPress={onToggleDualCamera}
                style={({ pressed }) => [
                  styles.cardItemBtn,
                  { gap: sp(3), minHeight: shortStage ? 26 : sp(30), paddingHorizontal: camPadX },
                  dualCameraEnabled && { backgroundColor: activeItemBg },
                  pressed && styles.pressed,
                ]}
                testID="control-hud-camera-count-toggle"
              >
                <Ionicons color={dualCameraEnabled ? activeIconTint : INK} name={dualCameraEnabled ? 'albums-outline' : 'square-outline'} size={narrowStage ? 13 : sp(14)} />
                {showCameraLabels ? <Text numberOfLines={1} style={[styles.cardItemText, { fontSize: dockFont, lineHeight: dockLine }, dualCameraEnabled && styles.cardItemTextActive]}>双摄</Text> : null}
              </Pressable>

              <Pressable
                accessibilityLabel={`切换相机视角，当前${showMainFront ? '前视角' : '后视角'}`}
                accessibilityRole="button"
                accessibilityState={{ selected: !showMainFront }}
                onPress={onSwapCamera}
                style={({ pressed }) => [
                  styles.cardIconOnlyBtn,
                  { height: shortStage ? 26 : sp(28), width: shortStage ? 26 : sp(28) },
                  !showMainFront && { backgroundColor: activeItemBg },
                  pressed && styles.pressed,
                ]}
                testID="control-hud-camera-swap"
              >
                <Ionicons color={!showMainFront ? activeIconTint : '#D4D4D4'} name="camera-reverse-outline" size={narrowStage ? 13 : sp(14)} />
              </Pressable>

              {!docksExpanded ? (
                <>
                  <View style={[styles.dockDivider, { height: sp(16), marginHorizontal: sp(2) }]} />
                  {ControlHudDashboard({
                    expanded: false,
                    inlineCollapsed: true,
                    compactInline: compactStage,
                    scale: hudScale,
                    onToggleExpanded: onToggleDocks,
                    headlightMode,
                    frontVideoReceiving: videoReceiving,
                    rearVideoReceiving,
                    remainingRangeKm,
                    batteryPercent,
                    voltageV,
                    minTempC: tempSummary.minTempC,
                    maxTempC: tempSummary.maxTempC,
                    minTempSeverity: tempSummary.minSeverity,
                    maxTempSeverity: tempSummary.maxSeverity,
                    forwardDirection,
                    jointTempOpen,
                    jointParamsOpen,
                    onToggleJointTemp,
                    onToggleJointParams,
                    onChargePress,
                    onReverseDirection,
                  })}
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Top-Left Vertical Spatial Telemetry Column (Own HUD layer at zIndex 7 / elevation 7 so modals & voice wing NEVER sit underneath it) */}
        {!settingsMenu && !statusCardOpen && leftCategory !== 'action' ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.leftTelemetryCol,
              { left: edgeX, top: edgeTop, gap: voiceWingCompactTelemetry ? sp(2) : sp(4), maxWidth: Math.round(effectiveStageW * 0.46) },
            ]}
          >
            {/* Row 1: Posture Gear Rail (停 坐 站 行) + Inline Compact Battery Bar */}
            <View style={[styles.gearBatteryRow, { gap: sp(10) }]}>
              <View style={[styles.gearRail, { gap: sp(7) }]} testID="control-hud-posture-rail">
                {POSTURE_RAIL_ITEMS.map(item => {
                  const active = item.id === activePostureSlot;
                  return (
                    <Text
                      key={item.id}
                      style={[
                        styles.gearChar,
                        { fontSize: sp(13), lineHeight: sp(17) },
                        active && styles.gearCharActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  );
                })}
              </View>

              <View style={[styles.batteryInline, { gap: sp(5) }]} testID="control-hud-battery-bar">
                <View style={styles.batteryShellWrap}>
                  <View style={[styles.batteryShell, { height: sp(11), width: sp(22) }]}>
                    <View
                      style={[
                        styles.batteryFill,
                        {
                          width: `${Math.round(battery.fillRatio * 100)}%`,
                          backgroundColor: battery.fillColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={[styles.batteryCap, { height: sp(5) }]} />
                </View>
                <Text numberOfLines={1} style={[styles.batteryInlineText, { fontSize: fMeta, lineHeight: fMetaLine }, !battery.live && styles.batteryMutedText]}>
                  {battery.text}
                </Text>
              </View>
            </View>

            {/* Row 2: Hero Tabular Speed Readout */}
            <View pointerEvents="none" style={styles.heroSpeedBlock} testID="control-hud-hero-speed">
              <Text
                style={[
                  styles.heroSpeedNum,
                  {
                    fontSize: voiceWingCompactTelemetry ? 22 : shortStage ? 28 : compactStage ? 32 : sp(38),
                    lineHeight: voiceWingCompactTelemetry ? 25 : shortStage ? 31 : compactStage ? 36 : sp(42),
                  },
                ]}
              >
                {heroSpeedText}
              </Text>
              <Text style={[styles.heroSpeedUnit, { fontSize: Math.max(10, sp(11.5)), lineHeight: sp(15) }]}>m/s</Text>
            </View>

            {/* Row 3: FSD-Style Active Mode Pill + Borderless Terrain Switcher */}
            <View style={[styles.modeTerrainRow, { gap: sp(6) }]}>
              <Pressable
                accessibilityLabel={recoveryModeSelected ? '恢复模式' : `当前模式 ${activeModeLabel}`}
                accessibilityRole="button"
                onPress={cycleLeftCategory}
                style={({ pressed }) => [
                  styles.fsdModeBadge,
                  { paddingHorizontal: sp(7), paddingVertical: sp(2) },
                  (connection === 'connected' || bodyHeight?.active || recoveryModeSelected) && {
                    backgroundColor: activeItemBg,
                    borderColor: activeBadgeBorder,
                  },
                  pressed && styles.pressed,
                ]}
                testID="control-hud-mode-header"
              >
                <Text numberOfLines={1} style={[styles.fsdModeText, { fontSize: Math.max(10, sp(11)), lineHeight: sp(15) }]}>
                  {activeModeLabel}
                </Text>
              </Pressable>

              <View style={[styles.terrainInlineRow, { gap: sp(2) }]}>
                {visiblePolicies.map(option => (
                  <Pressable
                    key={option.id}
                    accessibilityHint={option.hint}
                    accessibilityLabel={`运动模式${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: option.disabled || option.selected, selected: option.selected }}
                    disabled={option.disabled || option.selected}
                    onPress={() => {
                      if (!option.disabled && !option.selected) onSelectPolicy(option.id);
                    }}
                    style={({ pressed }) => [
                      styles.terrainGhostBtn,
                      { paddingHorizontal: sp(6), paddingVertical: sp(2) },
                      option.selected && styles.terrainGhostBtnSelected,
                      option.disabled && !option.selected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-hud-terrain-capsule-${option.id}`}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.terrainGhostText,
                        { fontSize: fMeta, lineHeight: fMetaLine },
                        option.selected && styles.terrainGhostTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Row 4: Iconic White-Framed Speed Limit Sign + Minimal Status Glyphs (auto-folds while flush-left voice wing is open on compact/short phones) */}
            {!voiceWingCompactTelemetry ? (
              <View style={[styles.speedSignRow, { gap: sp(8), marginTop: sp(2) }]}>
                <Pressable
                  accessibilityLabel={`调节速度限制，当前 ${speedMode === 'high' ? '高速 ' : ''}${speedLimitClamped}%`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: speedLimitExpanded }}
                  onPress={onToggleSpeedLimitExpanded}
                  style={({ pressed }) => [
                    styles.speedSignOuter,
                    { minWidth: sp(40), paddingHorizontal: sp(5), paddingVertical: sp(2.5) },
                    speedMode === 'high' && styles.speedSignHigh,
                    speedLimitExpanded && { borderColor: isBlueAccent ? FSD_BLUE : '#F2F2F2' },
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-speed-limit-toggle"
                >
                  <Text numberOfLines={1} style={[styles.speedSignTop, { fontSize: Math.max(8, sp(8.5)), lineHeight: sp(10) }]}>
                    {speedMode === 'high' ? '高速' : '限速'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.speedSignNum, { fontSize: sp(13), lineHeight: sp(15) }]}>
                    {speedSignValue}
                  </Text>
                </Pressable>

                <View style={[styles.microStatusCol, { gap: sp(2) }]}>
                  <View style={[styles.microStatusRow, { gap: sp(5) }]}>
                    <View style={[styles.microDot, motorEnabled ? styles.microDotArmed : styles.microDotOff]} />
                    <Text numberOfLines={1} style={[styles.microStatusText, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                      {motorEnabled === true ? '电机已使能' : motorEnabled === false ? '电机未使能' : '待连接'}
                    </Text>
                  </View>
                  {showLocalControl || showUnlocked || inputSource === 'physical' ? (
                    <View style={[styles.microStatusRow, { gap: sp(6) }]}>
                      {showLocalControl ? (
                        <View style={styles.microTag} testID="control-hud-local-control">
                          <Text numberOfLines={1} style={[styles.microTagText, { fontSize: Math.max(9.5, sp(10.5)), lineHeight: sp(13) }]}>本设备控制</Text>
                        </View>
                      ) : null}
                      {showUnlocked ? (
                        <View style={styles.microTag} testID="control-hud-unlocked">
                          <Ionicons color={EMERALD_INK} name="lock-open-outline" size={sp(10)} />
                          <Text numberOfLines={1} style={[styles.microTagText, { fontSize: Math.max(9.5, sp(10.5)), lineHeight: sp(13) }]}>设备已解锁</Text>
                        </View>
                      ) : null}
                      {inputSource === 'physical' ? (
                        <View style={styles.microTag} testID="control-hud-physical-mode">
                          <Ionicons color={INK} name="game-controller-outline" size={sp(10)} />
                          <Text numberOfLines={1} style={[styles.microTagText, { fontSize: Math.max(9.5, sp(10.5)), lineHeight: sp(13) }]}>实体摇杆</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Expanded 1-Row Diagnostics Bar Floating Cleanly Above Bottom 3-Card Dock */}
        {docksExpanded && !settingsMenu && !statusCardOpen ? (
          <View
            pointerEvents={leftCategory !== 'policy' || anyFloatingPanel ? 'none' : 'box-none'}
            style={[styles.dashboardOverlay, (leftCategory !== 'policy' || anyFloatingPanel) ? styles.hiddenBehindPopover : null]}
          >
            {ControlHudDashboard({
              expanded: true,
              scale: hudScale,
              maxWidth: Math.max(280, effectiveStageW - edgeX * 2),
              bottomOffset: bottomBarClearance,
              onToggleExpanded: onToggleDocks,
              headlightMode,
              frontVideoReceiving: videoReceiving,
              rearVideoReceiving,
              remainingRangeKm,
              batteryPercent,
              voltageV,
              minTempC: tempSummary.minTempC,
              maxTempC: tempSummary.maxTempC,
              minTempSeverity: tempSummary.minSeverity,
              maxTempSeverity: tempSummary.maxSeverity,
              forwardDirection,
              jointTempOpen,
              jointParamsOpen,
              onToggleJointTemp,
              onToggleJointParams,
              onChargePress,
              onReverseDirection,
            })}
          </View>
        ) : null}

        {/* Centered Borderless Frosted Charcoal 2-Column Action Studio Modal (and fallback posture popover) */}
        {!settingsMenu && !statusCardOpen && leftCategory === 'posture' ? (
          <View pointerEvents="box-none" style={[styles.popoverOverlay, { bottom: bottomBarClearance }]}>
            <View style={[styles.drawerPopover, { borderRadius: sp(12), maxWidth: Math.min(sp(420), effectiveStageW - edgeX * 2), paddingHorizontal: sp(10), paddingVertical: sp(8) }]}>
              <View style={[styles.drawerWrap, { gap: sp(6) }]} testID="control-hud-posture-dock">
                {drawerPostures.map(option => (
                  <Pressable
                    key={option.id}
                    accessibilityHint={option.hint}
                    accessibilityLabel={option.label}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: option.disabled || option.selected, selected: option.selected }}
                    disabled={option.disabled || option.selected}
                    onPress={() => {
                      if (!option.disabled && !option.selected) option.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.drawerPillBtn,
                      { gap: sp(4), minHeight: sp(32), paddingHorizontal: sp(13), paddingVertical: sp(4) },
                      option.selected && { backgroundColor: activeSolidBg, borderColor: activeBadgeBorder },
                      option.disabled && !option.selected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={(option.selected ? 'control-hud-posture-selected-' : 'control-hud-posture-') + option.id}
                  >
                    <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, option.selected && styles.drawerPillTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
                {onToggleBodyHeightPanel ? (
                  <Pressable
                    accessibilityLabel="机身高度"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: bodyHeightPanelOpen, selected: bodyHeightPanelOpen || Boolean(bodyHeight?.active) }}
                    onPress={onToggleBodyHeightPanel}
                    style={({ pressed }) => [
                      styles.drawerPillBtn,
                      { gap: sp(4), minHeight: sp(32), paddingHorizontal: sp(13), paddingVertical: sp(4) },
                      (bodyHeightPanelOpen || bodyHeight?.active) && { backgroundColor: activeSolidBg, borderColor: activeBadgeBorder },
                      pressed && styles.pressed,
                    ]}
                    testID="control-hud-posture-height"
                  >
                    <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, (bodyHeightPanelOpen || bodyHeight?.active) && styles.drawerPillTextActive]}>
                      机身高度
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Proactive Non-Blocking Top-Center Alert Pill (Fault > Overheat > Low Battery) */}
        {alertBanner && !settingsMenu && !statusCardOpen && leftCategory === 'policy' && !anyFloatingPanel ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.alertBannerLane,
              {
                paddingHorizontal: topCenterGuardX,
                top: !activeMainFeedReceiving && !suppressEmptyVideo ? edgeTop + sp(30) : edgeTop + sp(4),
              },
            ]}
          >
            <View
              style={[
                styles.alertBannerPill,
                alertBanner.severity === 'critical' ? styles.alertBannerCritical : styles.alertBannerWarning,
                { borderRadius: sp(10), gap: sp(6), maxWidth: Math.min(268, Math.round(effectiveStageW * 0.44)), paddingHorizontal: sp(10), paddingVertical: sp(4) },
              ]}
              testID="control-hud-alert-banner"
            >
              <Pressable
                accessibilityLabel={`${alertBanner.text}，查看设备状态`}
                accessibilityRole="button"
                onPress={onToggleStatusCard ?? onOpenJointStatus}
                style={({ pressed }) => [styles.alertBannerMain, { gap: sp(5) }, pressed && styles.pressed]}
                testID="control-hud-alert-open-status"
              >
                <View
                  style={[
                    styles.alertBannerDot,
                    { backgroundColor: alertBanner.severity === 'critical' ? RED_ESTOP : '#F59E0B' },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.alertBannerText,
                    {
                      color: alertBanner.severity === 'critical' ? '#FCA5A5' : '#F59E0B',
                      fontSize: fMeta,
                      lineHeight: fMetaLine,
                    },
                  ]}
                >
                  {alertBanner.text}
                </Text>
              </Pressable>
              {alertBanner.canClearFault && clearFaultReady && onClearFault ? (
                <Pressable
                  accessibilityLabel="清除故障"
                  accessibilityRole="button"
                  onPress={onClearFault}
                  style={({ pressed }) => [
                    styles.alertClearBtn,
                    { borderRadius: sp(6), paddingHorizontal: sp(7), paddingVertical: sp(1.5) },
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-alert-clear"
                >
                  <Text numberOfLines={1} style={[styles.alertClearText, { fontSize: Math.max(10, sp(10.5)), lineHeight: sp(14) }]}>
                    清除
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Floating Speed Limit Adjuster Popover (zIndex 9 / elevation 9, bounded inside viewport) */}
        {speedLimitExpanded && !settingsMenu && !statusCardOpen ? (
          <View
            style={[
              styles.speedBarFloating,
              {
                gap: sp(8),
                height: sp(36),
                left: edgeX,
                maxWidth: effectiveStageW - edgeX * 2,
                paddingHorizontal: sp(12),
                top: Math.min(effectiveStageH - bottomBarClearance - sp(40), edgeTop + sp(142)),
              },
            ]}
            testID="control-hud-speed-limit-bar"
          >
            {showHighSpeedOption ? (
              <View style={[styles.speedModeSegment, { borderRadius: sp(8), gap: sp(2), padding: 2 }]} testID="control-hud-speed-mode-group">
                <Pressable
                  accessibilityLabel="标准速度档位 1.0 m/s"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: connection !== 'connected', selected: speedMode !== 'high' }}
                  disabled={connection !== 'connected'}
                  onPress={() => { if (speedMode === 'high') onSelectSpeedMode?.('normal'); }}
                  style={({ pressed }) => [
                    styles.speedModeChip,
                    { borderRadius: sp(6), paddingHorizontal: sp(8), paddingVertical: sp(3) },
                    speedMode !== 'high' && styles.speedModeChipActive,
                    connection !== 'connected' && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-speed-mode-normal"
                >
                  <Text numberOfLines={1} style={[styles.speedModeChipText, { fontSize: fMeta, lineHeight: fMetaLine }, speedMode !== 'high' && styles.speedModeChipTextActive]}>标准 1.0</Text>
                </Pressable>
                <Pressable
                  accessibilityHint="最高 2.5 m/s"
                  accessibilityLabel="高速速度档位 2.5 m/s"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: connection !== 'connected', selected: speedMode === 'high' }}
                  disabled={connection !== 'connected'}
                  onPress={() => { if (speedMode !== 'high') onSelectSpeedMode?.('high'); }}
                  style={({ pressed }) => [
                    styles.speedModeChip,
                    { borderRadius: sp(6), paddingHorizontal: sp(8), paddingVertical: sp(3) },
                    speedMode === 'high' && styles.speedModeChipHighActive,
                    connection !== 'connected' && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-hud-speed-mode-high"
                >
                  <Text numberOfLines={1} style={[styles.speedModeChipText, { fontSize: fMeta, lineHeight: fMetaLine }, speedMode === 'high' && styles.speedModeChipTextHigh]}>高速 2.5</Text>
                </Pressable>
              </View>
            ) : null}
            <Text numberOfLines={1} style={[styles.speedBarLabel, { fontSize: fMeta, lineHeight: fMetaLine }]}>限速</Text>
            <Pressable
              accessibilityLabel="降低速度限制"
              accessibilityRole="button"
              disabled={speedLimitClamped <= 10}
              onPress={() => onChangeSpeedLimit(speedLimitClamped - 10)}
              style={({ pressed }) => [styles.speedStepBtn, { borderRadius: sp(11), height: sp(22), width: sp(22) }, speedLimitClamped <= 10 && styles.disabled, pressed && styles.pressed]}
              testID="control-hud-speed-limit-dec"
            >
              <Ionicons color={INK} name="remove" size={sp(14)} />
            </Pressable>
            <View style={[styles.speedTrack, { borderRadius: sp(3), height: sp(5), width: narrowStage ? sp(58) : sp(78) }]}>
              <View style={[styles.speedFill, { backgroundColor: isBlueAccent ? FSD_BLUE : '#EAEAEA', width: `${speedLimitClamped}%` }]} />
            </View>
            <Pressable
              accessibilityLabel="提高速度限制"
              accessibilityRole="button"
              disabled={speedLimitClamped >= 100}
              onPress={() => onChangeSpeedLimit(speedLimitClamped + 10)}
              style={({ pressed }) => [styles.speedStepBtn, { borderRadius: sp(11), height: sp(22), width: sp(22) }, speedLimitClamped >= 100 && styles.disabled, pressed && styles.pressed]}
              testID="control-hud-speed-limit-inc"
            >
              <Ionicons color={INK} name="add" size={sp(14)} />
            </Pressable>
            <Text numberOfLines={1} style={[styles.speedBarValue, { fontSize: fBody, lineHeight: fBodyLine, minWidth: sp(34) }]} testID="control-hud-speed-limit-value">{`${speedLimitClamped}%`}</Text>
          </View>
        ) : null}

        {/* Floating Joint Params / Joint Temp / Body Height / Faults / Recovery */}
        {anyFloatingPanel && !settingsMenu && !statusCardOpen ? (
          <View pointerEvents="box-none" style={[styles.floatingPanelsOverlay, { bottom: bottomBarClearance, top: topBarClearance + (feedback ? sp(34) : 0) + (hudNotice ? sp(34) : 0), transform: [{ translateX: -Math.round(overlayW / 2) }], width: overlayW }]} testID="control-hud-overlay-stack">
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.floatingPanelsContent}
              style={styles.floatingPanelsScroll}
            >
              {recovery}
              {faultPanelOpen && faults.length > 0 ? FaultListPanel({
                faults,
                onClose: onToggleFaultPanel,
                onOpenJointStatus,
                onStop,
                stopDisabled,
              }) : null}
              {jointParamsOpen ? JointParametersPanel({
                selectedLegId,
                onSelectLeg: onSelectLegId,
                joints,
                onClose: onToggleJointParams,
                accentTone,
              }) : null}
              {jointTempOpen ? JointTemperaturePanel({
                moduleKind: tempModuleKind,
                onSelectModule: onTempModuleKindChange,
                joints,
                onClose: onToggleJointTemp,
                accentTone,
              }) : null}
              {bodyHeightPanelOpen && onToggleBodyHeightPanel ? BodyHeightPanel({
                bodyHeight,
                draftHeightM: bodyHeightDraftM,
                connected: connection === 'connected',
                faulted: runtimeState?.faultStatus === 'active',
                leased: bodyHeightLeased,
                remoteControlled,
                moving: bodyHeightMoving,
                busy: bodyHeightBusy,
                error: bodyHeightError,
                onToggleMode: onSetBodyHeightMode,
                onPreviewHeight: onPreviewBodyHeight,
                onCommitHeight: onCommitBodyHeight,
                onClose: onToggleBodyHeightPanel,
                accentTone,
              }) : null}
            </ScrollView>
          </View>
        ) : null}

        {/* Flush-Left Airy Liquid-Glass Voice Wing (Stationary Background, Strictly Below Top Telemetry & Above Bottom Dock) */}
        {hasVoiceOverlay && !settingsMenu && !statusCardOpen ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.voiceLeftWingOverlay,
              {
                bottom: voiceWingBottom,
                top: voiceWingTop,
                width: voiceWingWidth,
              },
            ]}
            testID="control-hud-voice-wing"
          >
            {voiceChatPanel}
          </View>
        ) : null}

        {!settingsMenu && !statusCardOpen && leftCategory === 'action' ? (
          <>
            <Pressable
              accessibilityLabel="关闭动作库"
              accessibilityRole="button"
              onPress={event => {
                if (!event || event.target === event.currentTarget) onLeftCategoryChange('policy');
              }}
              style={styles.actionModalBackdrop}
              testID="control-hud-action-backdrop"
            />
            <View
              pointerEvents="box-none"
              style={[styles.actionModalCenter, { bottom: actionModalBottom, top: actionModalTop }]}
            >
              <View
                style={[
                  styles.actionStudioCard,
                  { width: gestures.length > 0 ? actionModalWidth : Math.min(sp(280), effectiveStageW - edgeX * 2), paddingHorizontal: narrowStage ? 10 : sp(14), paddingVertical: shortStage ? 9 : sp(12) },
                ]}
                testID="control-hud-action-dock"
              >
                {gestures.length > 0 ? GestureDeckPanel({
                  gestures,
                  category: gestureCategory,
                  onSelectCategory: next => onGestureCategoryChange?.(next),
                  selectedGestureName,
                  onSelectGesture: name => onSelectGesture?.(name),
                  showGifPreview: gestureGifPreview,
                  onToggleGifPreview: () => onToggleGestureGifPreview?.(),
                  gestureDisabled,
                  gestureHint,
                  onPlayGesture,
                  onClose: () => onLeftCategoryChange('policy'),
                  variant: 'hud',
                  accentTone,
                  deckWidth: actionModalWidth - (narrowStage ? 20 : sp(28)),
                  maxListHeight: gestureMaxListHeight,
                }) : (
                  <View style={[styles.drawerWrap, { gap: sp(6) }]}>
                    {HUD_BASIC_ACTIONS.filter(item => item.supported).map(item => {
                      const selected = selectedBasicAction === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityLabel={item.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => onSelectBasicAction(item.id, item.supported, item.label)}
                          style={({ pressed }) => [
                            styles.drawerPillBtn,
                            { gap: sp(5), minHeight: sp(32), paddingHorizontal: sp(13), paddingVertical: sp(4) },
                            selected && { backgroundColor: activeSolidBg, borderColor: activeBadgeBorder },
                            pressed && styles.pressed,
                          ]}
                          testID={`control-hud-basic-action-${item.id}`}
                        >
                          <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, selected && styles.drawerPillTextActive]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </>
        ) : null}

        {/* Centered Floating Ultra-Compact Status Bento B Card (E-Stop at zIndex 24 remains 100% live & unobstructed!) */}
        {statusCardOpen && statusCardOverlay && !settingsMenu ? (
          <>
            <Pressable
              accessibilityLabel="关闭设备状态背景"
              accessibilityRole="button"
              onPress={event => {
                if (!event || event.target === event.currentTarget) onToggleStatusCard?.();
              }}
              style={styles.statusBackdrop}
              testID="control-status-backdrop"
            />
            <View
              pointerEvents="box-none"
              style={[styles.statusCardOverlay, { bottom: bottomBarClearance, top: topBarClearance + sp(4) }]}
              testID="control-status-overlay"
            >
              {statusCardOverlay}
            </View>
          </>
        ) : null}

        {settingsMenu ? (
          <View pointerEvents="box-none" style={styles.settingsLayer}>
            <Pressable
              accessibilityLabel="关闭操控设置背景"
              accessibilityRole="button"
              onPress={event => {
                if (!event || event.target === event.currentTarget) onCloseSettings?.();
              }}
              style={styles.settingsBackdrop}
              testID="control-settings-background"
            />
            {settingsMenu}
          </View>
        ) : null}
        {feedback || hudNotice ? (
          <View pointerEvents="none" style={[styles.toastLane, { gap: sp(6), top: topToastTop }]}>
            {feedback ? (
              <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(10), maxWidth: feedbackMaxW, paddingHorizontal: sp(14), paddingVertical: sp(6) }]} testID="control-operation-feedback">
                <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{feedback}</Text>
              </View>
            ) : null}
            {hudNotice ? (
              <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(10), maxWidth: feedbackMaxW, paddingHorizontal: sp(14), paddingVertical: sp(6) }]} testID="control-hud-notice">
                <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{hudNotice}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {confirmation}
        {/* Top-Right Bare Floating HUD Band (rendered LAST at zIndex 24 / elevation 24, height-bounded to top strip so E-Stop is ALWAYS unobstructed & tappable) */}
        <View pointerEvents="box-none" style={[styles.topStatusBarLayer, { height: topBarClearance + sp(14) }]} testID="control-hud-status-bar">
          <View
            pointerEvents="box-none"
            style={[
              styles.topRightCluster,
              { gap: ultraNarrowStage ? 6 : narrowStage ? 7 : compactStage ? 9 : sp(12), right: edgeX, top: edgeTop },
            ]}
            testID="control-telemetry"
          >
            <Pressable
              accessibilityLabel={`机器狗 Wi-Fi ${connectionLabel}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !onOpenConnection }}
              disabled={!onOpenConnection}
              onPress={onOpenConnection}
              style={({ pressed }) => [styles.bareTopItem, { gap: sp(4) }, pressed && styles.pressed]}
              testID="control-open-connection"
            >
              <View
                style={[
                  styles.connectionDot,
                  { borderRadius: sp(4), height: sp(7), width: sp(7) },
                  connection === 'connected' ? styles.connectedDot : connection === 'readonly' ? styles.readonlyDot : null,
                ]}
                testID="control-hud-connection-dot"
              />
              <Ionicons color={connection === 'connected' ? EMERALD_INK : INK} name="wifi-outline" size={sp(13)} />
              <Text numberOfLines={1} style={[styles.bareTextStrong, { fontSize: fBody, lineHeight: fBodyLine, maxWidth: ultraNarrowStage ? 58 : narrowStage ? 74 : compactStage ? 92 : 124 }]}>
                {wifiHeaderLabel}
              </Text>
              {connection !== 'disconnected' && !ultraNarrowStage ? (
                <Text numberOfLines={1} style={[styles.bareTextMuted, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                  {connectionLabel}
                </Text>
              ) : null}
            </Pressable>

            {connection === 'disconnected' && onReconnect ? (
              <Pressable
                accessibilityLabel="立即重连"
                accessibilityRole="button"
                onPress={onReconnect}
                style={({ pressed }) => [styles.bareTopItem, { gap: sp(3) }, pressed && styles.pressed]}
                testID="control-hud-reconnect"
              >
                <Ionicons color={activeIconTint} name="refresh-outline" size={sp(13)} />
                <Text numberOfLines={1} style={[styles.bareTextStrong, { color: activeIconTint, fontSize: fMeta, lineHeight: fMetaLine }]}>重连</Text>
              </Pressable>
            ) : null}

            {faults.length > 0 ? (
              <Pressable
                accessibilityLabel={`异常列表，共 ${faults.length} 项`}
                accessibilityRole="button"
                accessibilityState={{ expanded: faultPanelOpen }}
                onPress={onToggleFaultPanel}
                style={({ pressed }) => [styles.bareTopItem, { gap: sp(3) }, pressed && styles.pressed]}
                testID="control-hud-fault-badge"
              >
                <Ionicons color={RED_ESTOP} name="alert-circle" size={sp(14)} />
                <Text numberOfLines={1} style={[styles.bareFaultText, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                  {faults.length > 1 ? `${faults.length}` : '!'}
                </Text>
              </Pressable>
            ) : null}

            {signals.cellularVisible && !(narrowStage && (settingsMenu || statusCardOpen)) ? (
              <View accessible accessibilityLabel={`移动数据 ${signals.cellularText}`} style={[styles.telemetryItem, { gap: sp(3) }]} testID="control-hud-cellular">
                <Ionicons color={INK} name="cellular" size={sp(13)} />
                <Text numberOfLines={1} style={[styles.bareText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{signals.cellularText}</Text>
              </View>
            ) : null}

            {signals.robotVisible && !(narrowStage && (settingsMenu || statusCardOpen)) ? (
              <View accessible accessibilityLabel={`机器人信号 ${signals.robotText}`} style={[styles.telemetryItem, { gap: sp(3) }]} testID="control-hud-robot-signal">
                <Ionicons color={INK} name="hardware-chip-outline" size={sp(13)} />
                <Text numberOfLines={1} style={[styles.bareText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{signals.robotText}</Text>
              </View>
            ) : null}

            {signals.wifiVisible && !(narrowStage && (settingsMenu || statusCardOpen)) ? (
              <View accessible accessibilityLabel={`WiFi ${signals.wifiText}`} style={[styles.telemetryItem, { gap: sp(3) }]} testID="control-hud-wifi-signal">
                <Ionicons color={EMERALD_INK} name="wifi" size={sp(13)} />
                <Text numberOfLines={1} style={[styles.bareText, { fontSize: fMeta, lineHeight: fMetaLine }]}>
                  {compactStage ? signals.wifiCompactText : signals.wifiText}
                </Text>
              </View>
            ) : null}

            {recordingActive ? (
              <View accessible accessibilityLabel={`正在录制视频 ${recordingDurationLabel ?? ''}`} style={[styles.bareTopItem, { gap: sp(4) }]} testID="control-hud-recording-badge">
                <View style={[styles.recordingDot, { borderRadius: sp(3), height: sp(6), width: sp(6) }]} />
                <Text numberOfLines={1} style={[styles.bareFaultText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{recordingDurationLabel ? `REC ${recordingDurationLabel}` : 'REC'}</Text>
              </View>
            ) : null}

            {/* Bare Floating Live Power & Thermal Telemetry (e.g. 55.4V · 36°C) — toggles floating Status Bento Card */}
            <Pressable
              accessibilityLabel={`机器人状态 ${statusMetricText}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: statusCardOpen }}
              onPress={onToggleStatusCard ?? onOpenJointStatus ?? onBack}
              style={({ pressed }) => [styles.bareTopItem, { gap: sp(4), minHeight: sp(28) }, pressed && styles.pressed]}
              testID="control-hud-open-status"
            >
              <Ionicons color={statusCardOpen ? activeIconTint : INK} name="pulse-outline" size={sp(13)} />
              <Text numberOfLines={1} style={[styles.bareText, { fontSize: fBody, lineHeight: fBodyLine }, statusCardOpen && { color: activeIconTint, fontWeight: '600' }]}>
                {ultraNarrowStage && voltageDisplayText ? voltageDisplayText : statusMetricText}
              </Text>
            </Pressable>

            {/* Bare Floating Settings Trigger */}
            <Pressable
              accessibilityLabel={settingsLabel}
              accessibilityRole="button"
              accessibilityState={{ expanded: settingsOpen }}
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.bareTopItem, { gap: sp(4), minHeight: sp(28) }, pressed && styles.pressed]}
              testID="control-hud-settings"
            >
              <Ionicons color={settingsOpen ? activeIconTint : INK} name="settings-outline" size={sp(14)} />
              <Text numberOfLines={1} style={[styles.bareText, { fontSize: fBody, lineHeight: fBodyLine }, settingsOpen && { color: activeIconTint, fontWeight: '600' }]}>
                设置
              </Text>
            </Pressable>

            {/* Bare Floating High-Contrast Unobstructed Red E-Stop (NEVER occluded!) */}
            <Pressable
              accessibilityHint={stopHint}
              accessibilityLabel="软件急停"
              accessibilityRole="button"
              accessibilityState={{ disabled: stopDisabled }}
              disabled={stopDisabled}
              hitSlop={{ top: 8, bottom: 10, left: 10, right: 10 }}
              onPress={onStop}
              style={({ pressed }) => [
                styles.bareEstopBtn,
                { gap: sp(5), minHeight: sp(34), paddingHorizontal: sp(6), paddingVertical: sp(3) },
                stopDisabled && styles.bareEstopDisabled,
                pressed && !stopDisabled && styles.pressed,
              ]}
              testID="control-hud-stop"
            >
              <View style={[styles.stopRing, { borderColor: stopDisabled ? RED_ESTOP_DISABLED : RED_ESTOP, borderRadius: sp(7), height: sp(14), width: sp(14) }]}>
                <View style={[styles.stopCore, { backgroundColor: stopDisabled ? RED_ESTOP_DISABLED : RED_ESTOP }]} />
              </View>
              <Text numberOfLines={1} style={[styles.bareEstopText, { color: stopDisabled ? RED_ESTOP_DISABLED : RED_ESTOP, fontSize: Math.max(12, sp(13.5)), lineHeight: sp(18) }]}>
                急停
              </Text>
            </Pressable>
          </View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'transparent', flex: 1, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  standbySceneLayer: { ...StyleSheet.absoluteFill, backgroundColor: '#121212', overflow: 'hidden' },
  standbySceneImg: { height: '100%', width: '100%' },
  standbySceneTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12, 12, 12, 0.14)' },
  media: { ...StyleSheet.absoluteFill },
  mediaBuffering: { opacity: 0 },
  topScrimSoft: { backgroundColor: 'rgba(12, 12, 12, 0.16)', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  topScrimEdge: { backgroundColor: 'rgba(12, 12, 12, 0.28)', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  bottomScrimSoft: { backgroundColor: 'rgba(12, 12, 12, 0.24)', bottom: 0, left: 0, position: 'absolute', right: 0, zIndex: 1 },
  safeChrome: { position: 'absolute', zIndex: 2 },
  guideBar: { backgroundColor: 'rgba(0, 0, 0, 0.58)', position: 'absolute', zIndex: 25 },
  guideTop: { left: 0, right: 0, top: 0, borderBottomWidth: 1, borderBottomColor: DOCK_BORDER },
  guideRight: { bottom: 0, right: 0, top: 0, borderLeftWidth: 1, borderLeftColor: DOCK_BORDER },
  guideBottom: { bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: DOCK_BORDER },
  guideLeft: { bottom: 0, left: 0, top: 0, borderRightWidth: 1, borderRightColor: DOCK_BORDER },

  /* Top-Right E-Stop Bar Band (height-bounded at zIndex 24 / elevation 24 so E-Stop is NEVER occluded while lower modals stay clear) */
  topStatusBarLayer: { elevation: 24, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 24 },

  /* Top-Left Vertical Spatial Telemetry Column (own layer below modals/voice wing so it NEVER paints on top of dialogs!) */
  leftTelemetryCol: { alignItems: 'flex-start', elevation: 7, left: 16, position: 'absolute', top: 12, zIndex: 7 },
  gearBatteryRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  gearRail: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  gearChar: { color: 'rgba(255, 255, 255, 0.34)', fontWeight: '500', ...TEXT_SHADOW },
  gearCharActive: { color: '#FFFFFF', fontWeight: '700' },
  batteryInline: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  batteryShellWrap: { alignItems: 'center', flexDirection: 'row' },
  batteryShell: {
    borderColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 3,
    borderWidth: 1,
    height: 11,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 1.5,
    width: 22,
  },
  batteryFill: { borderRadius: 1, height: '100%' },
  batteryCap: { backgroundColor: 'rgba(255, 255, 255, 0.58)', borderBottomRightRadius: 1.5, borderTopRightRadius: 1.5, height: 5, marginLeft: 1, width: 2 },
  batteryInlineText: { color: '#F2F2F2', fontVariant: ['tabular-nums'], fontWeight: '600', ...TEXT_SHADOW },
  batteryMutedText: { color: 'rgba(255, 255, 255, 0.58)' },

  heroSpeedBlock: { alignItems: 'baseline', flexDirection: 'row', gap: 4, marginTop: 1 },
  heroSpeedNum: { color: '#FFFFFF', fontVariant: ['tabular-nums'], fontWeight: '300', letterSpacing: -1, ...TEXT_SHADOW },
  heroSpeedUnit: { color: 'rgba(255, 255, 255, 0.66)', fontWeight: '600', letterSpacing: 0.5, ...TEXT_SHADOW },

  modeTerrainRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2 },
  fsdModeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
  },
  fsdModeText: { color: '#F2F2F2', fontWeight: '700', ...TEXT_SHADOW },
  terrainInlineRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  terrainGhostBtn: { alignItems: 'center', borderRadius: 6, justifyContent: 'center' },
  terrainGhostBtnSelected: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  terrainGhostText: { color: 'rgba(255, 255, 255, 0.64)', fontWeight: '500', ...TEXT_SHADOW },
  terrainGhostTextSelected: { color: '#FFFFFF', fontWeight: '700' },

  speedSignRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  speedSignOuter: {
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderColor: '#181818',
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  speedSignHigh: { backgroundColor: '#FEF3C7', borderColor: '#B45309' },
  speedSignTop: { color: '#404040', fontWeight: '700', letterSpacing: 0.4 },
  speedSignNum: { color: '#0D0D0D', fontVariant: ['tabular-nums'], fontWeight: '800' },

  microStatusCol: { alignItems: 'flex-start', gap: 2 },
  microStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  microDot: { borderRadius: 3.5, height: 7, width: 7 },
  microDotArmed: { backgroundColor: EMERALD_DOT },
  microDotOff: { backgroundColor: 'rgba(255, 255, 255, 0.36)' },
  microStatusText: { color: 'rgba(255, 255, 255, 0.86)', fontWeight: '500', ...TEXT_SHADOW },
  microTag: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 22, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  microTagText: { color: '#EAEAEA', fontWeight: '500' },

  /* Top-Right Bare Floating HUD (Zero dark/red pill boxes) */
  topRightCluster: { alignItems: 'center', elevation: 24, flexDirection: 'row', gap: 12, position: 'absolute', right: 16, top: 12, zIndex: 24 },
  bareTopItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  bareText: { color: '#F2F2F2', fontVariant: ['tabular-nums'], fontWeight: '500', ...TEXT_SHADOW },
  bareTextStrong: { color: '#FFFFFF', fontWeight: '600', ...TEXT_SHADOW },
  bareTextMuted: { color: 'rgba(242, 242, 242, 0.72)', fontWeight: '500', ...TEXT_SHADOW },
  bareFaultText: { color: '#FCA5A5', fontVariant: ['tabular-nums'], fontWeight: '700', ...TEXT_SHADOW },
  connectionDot: { backgroundColor: '#6B6B6B', borderRadius: 4, height: 7, width: 7 },
  connectedDot: { backgroundColor: EMERALD_DOT },
  readonlyDot: { backgroundColor: '#F59E0B' },
  telemetryItem: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 3 },
  recordingDot: { backgroundColor: RED_ESTOP, borderRadius: 3, height: 6, width: 6 },
  bareEstopBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
    justifyContent: 'center',
    minHeight: 28,
  },
  bareEstopDisabled: {
    opacity: 1,
  },
  stopRing: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1.8,
    height: 14,
    justifyContent: 'center',
    width: 14,
  },
  stopCore: { borderRadius: 2, height: 5, width: 5 },
  bareEstopText: { fontSize: 13.5, fontWeight: '800', letterSpacing: 0.4, lineHeight: 18, ...TEXT_SHADOW },

  /* Speed Limit Floating Adjuster */
  speedBarFloating: {
    alignItems: 'center',
    backgroundColor: DOCK_BG,
    borderColor: DOCK_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    elevation: 9,
    flexDirection: 'row',
    gap: 8,
    height: 36,
    paddingHorizontal: 12,
    position: 'absolute',
    zIndex: 9,
  },
  speedBarLabel: { color: INK, fontSize: 11, fontWeight: '600' },
  speedModeSegment: { alignItems: 'center', backgroundColor: '#181818', flexDirection: 'row' },
  speedModeChip: { alignItems: 'center', justifyContent: 'center' },
  speedModeChipActive: { backgroundColor: '#EAEAEA' },
  speedModeChipHighActive: { backgroundColor: '#F59E0B' },
  speedModeChipText: { color: '#9A9A9A', fontVariant: ['tabular-nums'], fontWeight: '600' },
  speedModeChipTextActive: { color: '#141414', fontWeight: '700' },
  speedModeChipTextHigh: { color: '#141414', fontWeight: '700' },
  speedStepBtn: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.10)', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
  speedTrack: { backgroundColor: '#181818', borderRadius: 3, height: 5, overflow: 'hidden', width: 78 },
  speedFill: { borderRadius: 3, height: '100%' },
  speedBarValue: { color: '#F2F2F2', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '600', minWidth: 36, textAlign: 'right' },

  /* Non-blocking Video Status Chip & Proactive Alert Pill */
  emptyVideo: { alignItems: 'center', elevation: 4, left: 0, position: 'absolute', right: 0, zIndex: 4 },
  emptyVideoHidden: { opacity: 0 },
  emptyChip: {
    backgroundColor: 'rgba(22, 22, 22, 0.56)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  emptyTitle: { color: 'rgba(242, 242, 242, 0.78)', fontWeight: '500', textAlign: 'center' },
  alertBannerLane: { alignItems: 'center', elevation: 8, left: 0, position: 'absolute', right: 0, zIndex: 8 },
  alertBannerPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 22, 0.92)',
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 268,
  },
  alertBannerCritical: { borderColor: 'rgba(239, 68, 68, 0.45)' },
  alertBannerWarning: { borderColor: 'rgba(245, 158, 11, 0.45)' },
  alertBannerMain: { alignItems: 'center', flexDirection: 'row', flexShrink: 1 },
  alertBannerDot: { borderRadius: 3, height: 6, width: 6 },
  alertBannerText: { flexShrink: 1, fontVariant: ['tabular-nums'], fontWeight: '600' },
  alertClearBtn: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1 },
  alertClearText: { color: '#F2F2F2', fontWeight: '600' },

  stickFrame: { elevation: 3, left: 16, position: 'absolute', right: 16, zIndex: 3 },
  hiddenStickFrame: { opacity: 0 },
  centerStack: { elevation: 4, position: 'absolute', top: 82, zIndex: 4 },
  dashboardOverlay: { ...StyleSheet.absoluteFill, elevation: 7, zIndex: 7 },
  hiddenBehindPopover: { opacity: 0 },
  statusBackdrop: { backgroundColor: 'rgba(12, 12, 12, 0.44)', bottom: 0, elevation: 12, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 12 },
  statusCardOverlay: { alignItems: 'center', elevation: 13, justifyContent: 'center', left: 0, paddingHorizontal: 12, position: 'absolute', right: 0, zIndex: 13 },
  settingsLayer: { ...StyleSheet.absoluteFill, elevation: 15, zIndex: 15 },
  settingsBackdrop: { backgroundColor: 'rgba(12, 12, 12, 0.44)', bottom: 0, elevation: 1, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },

  /* Optional PiP Window */
  pipWindow: {
    backgroundColor: '#161616',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 10,
    borderWidth: 1,
    elevation: 6,
    height: 100,
    overflow: 'hidden',
    position: 'absolute',
    right: 16,
    top: 50,
    width: 176,
    zIndex: 6,
  },
  pipPlaceholder: { alignItems: 'center', flex: 1, gap: 4, justifyContent: 'center' },
  pipHeaderRow: { left: 8, position: 'absolute', top: 8 },
  pipBadge: { backgroundColor: 'rgba(18, 18, 18, 0.78)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pipBadgeText: { color: '#F2F2F2', fontSize: 10.5, fontWeight: '600' },

  /* Action Studio Modal & Posture Popover */
  actionModalBackdrop: { backgroundColor: 'rgba(12, 12, 12, 0.36)', bottom: 0, elevation: 10, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 10 },
  actionModalCenter: { alignItems: 'center', elevation: 11, justifyContent: 'center', left: 0, position: 'absolute', right: 0, zIndex: 11 },
  actionStudioCard: {
    backgroundColor: MODAL_BG,
    borderColor: DOCK_BORDER,
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: '100%',
    overflow: 'hidden',
  },
  popoverOverlay: { alignItems: 'center', bottom: 62, elevation: 7, left: 0, position: 'absolute', right: 0, zIndex: 7 },
  drawerPopover: {
    backgroundColor: MODAL_BG,
    borderColor: DOCK_BORDER,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 420,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  drawerWrap: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  drawerPillBtn: {
    alignItems: 'center',
    backgroundColor: '#242424',
    borderColor: DOCK_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 13,
    paddingVertical: 4,
  },
  drawerPillText: { color: INK, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  drawerPillTextActive: { color: '#FFFFFF' },

  /* Bottom 3 Docks (borderRadius: 10, Matte Charcoal) */
  bottomThreeCardRow: {
    alignItems: 'flex-end',
    bottom: 12,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 6,
  },
  dockCard: {
    alignItems: 'center',
    backgroundColor: DOCK_BG,
    borderColor: DOCK_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dockCardShrinkable: {
    flexShrink: 1,
    minWidth: 0,
  },
  cardItemBtn: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
  },
  cardItemBtnDanger: { backgroundColor: 'rgba(220, 38, 38, 0.42)' },
  cardIconOnlyBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  cardItemText: { color: '#EAEAEA', fontSize: 12.5, fontWeight: '500', lineHeight: 17 },
  cardItemTextActive: { color: '#FFFFFF', fontWeight: '600' },
  voiceDotHalo: { alignItems: 'center', borderRadius: 6, height: 11, justifyContent: 'center', width: 11 },
  voiceDotCore: { borderRadius: 3.5, height: 6.5, width: 6.5 },
  voiceEmotionBadge: { color: '#EAEAEA', fontWeight: '600' },
  voiceReminderBadge: { alignItems: 'center', backgroundColor: '#343434', borderRadius: 7, height: 14, justifyContent: 'center', minWidth: 14, paddingHorizontal: 3 },
  voiceReminderBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700', lineHeight: 12 },

  /* Flush-Left Voice Wing & Single Living Bot Trigger */
  voiceLeftWingOverlay: {
    elevation: 10,
    left: 0,
    position: 'absolute',
    zIndex: 10,
  },
  voiceOrbDock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  botOrbBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 19, 24, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  botOrbBtnOpen: {
    backgroundColor: 'rgba(28, 30, 38, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  botOrbBtnListening: {
    borderColor: 'rgba(99, 199, 149, 0.78)',
  },
  botOrbBtnMoving: {
    borderColor: 'rgba(233, 185, 99, 0.84)',
  },
  botOrbBtnPressed: {
    transform: [{ scale: 0.94 }],
  },
  botOrbVisualWrap: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  botOrbRipple: {
    borderRadius: 23,
    borderWidth: 1.5,
    height: 44,
    position: 'absolute',
    width: 44,
  },
  botHeadShape: {
    alignItems: 'center',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    height: 23,
    justifyContent: 'center',
    width: 26,
  },
  botEyesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5.5,
  },
  botPresenceDot: {
    borderColor: 'rgba(14, 15, 18, 0.92)',
    borderRadius: 4.5,
    borderWidth: 1.5,
    bottom: 1,
    height: 9,
    position: 'absolute',
    right: 1,
    width: 9,
  },
  botReminderBadge: {
    alignItems: 'center',
    backgroundColor: '#E9B963',
    borderRadius: 7,
    height: 14,
    justifyContent: 'center',
    minWidth: 14,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  walkUnlockBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(233, 185, 99, 0.20)',
    borderColor: 'rgba(233, 185, 99, 0.45)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 28,
    paddingHorizontal: 9,
  },
  walkUnlockBadgeText: {
    color: '#FDE68A',
    fontSize: 11.5,
    fontWeight: '700',
  },

  dockMotorBtn: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 30, paddingHorizontal: 4 },
  motorDot: { borderRadius: 4, height: 7, width: 7 },
  motorDotArmed: { backgroundColor: EMERALD_DOT },
  motorDotOff: { backgroundColor: '#6B6B6B' },
  dockMotorText: { color: INK, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  dockMotorTextArmed: { color: EMERALD_INK },
  dockDivider: { backgroundColor: 'rgba(255, 255, 255, 0.10)', height: 16, width: 1 },
  dockPostureGroup: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  dockItemBtnActive: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  dockCategories: { alignItems: 'center', flexDirection: 'row', gap: 2 },

  /* Floating Overlay Stack & Center-Lane Toasts */
  floatingPanelsOverlay: {
    bottom: 74,
    elevation: 10,
    left: '50%',
    position: 'absolute',
    top: 50,
    transform: [{ translateX: -175 }],
    width: 350,
    zIndex: 10,
  },
  floatingPanelsScroll: { maxHeight: '100%' },
  floatingPanelsContent: { gap: 8, paddingBottom: 8 },
  disabled: { opacity: 0.48 },
  toastLane: { alignItems: 'center', elevation: 18, gap: 6, left: 0, position: 'absolute', right: 0, top: 52, zIndex: 18 },
  feedback: { alignItems: 'center', alignSelf: 'center', backgroundColor: DOCK_BG, borderColor: DOCK_BORDER, borderRadius: 10, borderWidth: 1, maxWidth: 320, paddingHorizontal: 14, paddingVertical: 6 },
  feedbackText: { color: INK, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
