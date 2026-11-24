import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './AppText';
import type {
  ControlJointState,
  ControlOperation,
  ControlRuntimeState,
} from '../features/control/controlOperations';
import { ControlHudDashboard } from './ControlHudDashboard';
import { BodyHeightPanel, FaultListPanel, GestureDeckPanel, JointParametersPanel, JointTemperaturePanel } from './ControlHudPanels';
import {
  collectHudFaults,
  HUD_BASIC_ACTIONS,
  projectJointTemperatures,
  projectTopSignalBadges,
  type HudBodyHeightState,
  type HudCameraPosition,
  type HudForwardDirection,
  type HudGestureCategoryId,
  type HudGestureInput,
  type HudHeadlightMode,
  type HudJointModuleKind,
  type HudLeftCategory,
  type HudLegId,
} from './controlHudModel';
import { officialDark } from '../officialPalette';

const ACTIVE_BLUE = '#3B6EF6';
const ISLAND_BG = 'rgba(16, 20, 23, 0.78)';
const DOCK_BG = 'rgba(16, 20, 23, 0.86)';
const ISLAND_BORDER = 'rgba(255, 255, 255, 0.14)';
const PILL_WHITE = '#F4F6F8';
const PILL_DARK_INK = '#111416';
const EMERALD_DOT = '#22C55E';
const EMERALD_INK = '#4ADE80';
const CRIMSON_STOP = '#E53935';
const CRIMSON_DISABLED = 'rgba(138, 52, 48, 0.68)';
const INK = officialDark.ink;
const MUTED = officialDark.muted;

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
  onOpenWorkspaceSettings?: () => void;
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
  onToggleVoiceChat?: () => void;
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
}>;

function Chip({ children, testID, sp, compact = false }: { children: ReactNode; testID?: string; sp: (value: number) => number; compact?: boolean }) {
  return <View style={[styles.chip, { borderRadius: sp(6), gap: compact ? 2 : sp(3), paddingHorizontal: compact ? 4 : sp(6), paddingVertical: compact ? 1 : sp(2) }]} testID={testID}>{children}</View>;
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

const LEFT_CATEGORIES: readonly Readonly<{ id: HudLeftCategory; label: string }>[] = [
  { id: 'policy', label: '常规' },
  { id: 'posture', label: '姿态' },
  { id: 'action', label: '动作' },
];

export function controlLandscapeHud({
  robotName,
  connectionLabel,
  connectionState,
  onBack,
  onOpenConnection,
  onOpenJointStatus,
  onOpenWorkspaceSettings,
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
  settingsLabel = '操控设置',
  settingsMenu,
  headlightMode,
  onToggleHeadlight,
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
  voiceChatEmotionLabel = null,
  voiceChatQuietMode = false,
  voiceChatPendingReminders = 0,
  voiceChatConnected = false,
  onToggleVoiceChat,
  voiceChatPanel,
  showVirtualDiscControls = true,
  onToggleVirtualDiscControls,
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
}: ControlLandscapeHudProps) {
  const connection = connectionState ?? (connectionLabel === '已连接' ? 'connected' : connectionLabel.includes('只读') ? 'readonly' : 'disconnected');
  const hasFrontVideo = video != null && video !== false;
  const hasRearVideo = rearVideo != null && rearVideo !== false;
  const showMainFront = primaryCamera === 'front';
  const activeMainFeed = showMainFront ? (hasFrontVideo ? video : null) : (hasRearVideo ? rearVideo : null);
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
    ? Math.max(0.90, rawRatio)
    : Math.min(1.22, 1 + (rawRatio - 1) * 0.22);
  const sp = (value: number) => Math.round(value * hudScale);
  const fTitle = sp(14);
  const fTitleLine = sp(19);
  const fBody = sp(13);
  const fBodyLine = sp(18);
  const fMeta = Math.max(11, sp(11.5));
  const fMetaLine = sp(16);
  const ultraCompactTop = effectiveStageW < 900;
  const compactTopBar = effectiveStageW < 1080;
  const ultraShortStage = effectiveStageH < 460;
  const compactRightRail = effectiveStageH < 560;
  const topBarMinHeight = ultraShortStage ? 34 : compactTopBar ? 36 : sp(38);
  const topBtnHeight = ultraShortStage ? 26 : compactTopBar ? 28 : sp(30);
  const topFont = compactTopBar ? 11.5 : fBody;
  const topFontLine = compactTopBar ? 15 : fBodyLine;
  const pipW = ultraShortStage
    ? sp(148)
    : stageWidth && stageWidth > 0
      ? Math.max(168, Math.min(compactRightRail ? 172 : 236, Math.round(effectiveStageW * (compactRightRail ? 0.176 : 0.18))))
      : sp(168);
  const pipH = Math.round((pipW * 9) / 16);
  const pipTop = ultraShortStage ? 46 : compactRightRail ? 54 : sp(60);
  const pipRight = ultraShortStage ? 12 : compactTopBar ? 14 : sp(18);
  const rightRailBesidePip = ultraShortStage && dualCameraEnabled;
  const rightRailTop = rightRailBesidePip || !dualCameraEnabled
    ? pipTop
    : pipTop + pipH + sp(compactRightRail ? 6 : 10);
  const rightRailRight = rightRailBesidePip ? pipRight + pipW + 6 : pipRight;
  const rightRailWidth = ultraShortStage ? 144 : pipW;
  const circleSize = sp(ultraShortStage ? 30 : compactRightRail ? 32 : 38);
  const circleRadius = Math.round(circleSize / 2);
  const circleIconSize = sp(ultraShortStage ? 15 : compactRightRail ? 16 : 18);
  const railMetaLine = ultraShortStage ? 13 : compactRightRail ? 14 : fMetaLine;
  const overlayW = Math.min(440, Math.max(350, Math.round(effectiveStageW * 0.44)));
  const centerStackInset = Math.round((joystickSize || 220) + sp(24));
  const stickCorridorEachSide = Math.round((joystickSize || 156) + sp(36));
  const centerFreeWidth = Math.max(308, effectiveStageW - stickCorridorEachSide * 2);
  const gestureDeckWidth = Math.min(sp(476), centerFreeWidth - sp(24));
  const leftRailWidthEst = circleSize * 3 + sp(ultraShortStage ? 6 : 8) * 2;
  const leftRailRightEdge = pipRight + leftRailWidthEst + sp(12);
  const rightRailEdgeOffset = (rightRailBesidePip ? rightRailRight + rightRailWidth : pipRight + pipW) + sp(12);
  const centerToastSafeW = Math.max(168, effectiveStageW - Math.max(leftRailRightEdge, rightRailEdgeOffset) * 2);
  const feedbackMaxW = Math.min(320, Math.round(effectiveStageW * 0.34), centerToastSafeW);
  const topToastTop = (ultraShortStage ? 6 : compactTopBar ? 8 : sp(12)) + topBarMinHeight + sp(8) + (speedLimitExpanded ? sp(46) : 0);
  const gestureMaxListHeight = effectiveStageH >= 620 ? 248 : effectiveStageH >= 500 ? 198 : 156;
  const faults = collectHudFaults({ runtimeState, sessionError, recoveryError });
  const signals = projectTopSignalBadges({ connection, runtimeState });
  const tempSummary = projectJointTemperatures('motor', joints);
  const standOption = postures.find(item => item.id === 'stand');
  const sitOption = postures.find(item => item.id === 'sit');
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
  const anyFloatingPanel = (faultPanelOpen && faults.length > 0) || jointParamsOpen || jointTempOpen || bodyHeightPanelOpen || Boolean(recovery) || hasVoiceOverlay;
  const activeHeightBadgeText = bodyHeight?.active && bodyHeight.supported
    && typeof bodyHeight.currentHeightM === 'number' && Number.isFinite(bodyHeight.currentHeightM) && bodyHeight.currentHeightM > 0
    ? `${bodyHeight.currentHeightM.toFixed(2)}m`
    : null;
  const remoteControlled = runtimeState?.controlOwner === 'remote' || runtimeState?.controlOwner === 'robot-remote';
  const inlineVoltageText = typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0 ? `${voltageV.toFixed(1)}V` : null;
  const inlineBatteryText = typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) ? `${Math.round(batteryPercent)}%` : null;
  const inlineTempText = tempSummary.maxTempC !== null ? `${Math.round(tempSummary.maxTempC)}°C` : null;

  const cycleLeftCategory = () => {
    const order: readonly HudLeftCategory[] = ['policy', 'posture', 'action'];
    const next = order[(order.indexOf(leftCategory) + 1) % order.length];
    onLeftCategoryChange(next);
  };

  return (
    <View style={styles.root} testID="control-landscape-hud" pointerEvents="box-none">
      <View pointerEvents="none" style={styles.backdrop} testID="control-video-backdrop" />
      {activeMainFeed ? (
        <View pointerEvents="none" style={styles.media} testID="control-media-stage">{activeMainFeed}</View>
      ) : null}
      <View pointerEvents="none" style={[styles.topScrim, { height: sp(62) }]} />
      {previewSafeAreaGuides ? <SafeAreaGuides insets={insets} /> : null}
      <View
        pointerEvents="box-none"
        style={[styles.safeChrome, { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }]}
        testID="control-landscape-safe"
      >
        {!activeMainFeed ? (
          <View pointerEvents="none" style={styles.emptyVideo} testID={showMainFront ? 'control-hud-video-empty' : 'control-hud-rear-video-empty'} accessibilityLiveRegion="polite">
            <View style={[styles.emptyIcon, { borderRadius: sp(12), height: sp(44), width: sp(44) }]}><Ionicons name="videocam-off-outline" color={MUTED} size={sp(24)} /></View>
            <Text style={[styles.emptyTitle, { fontSize: fTitle, lineHeight: fTitleLine }]}>{showMainFront ? (connection === 'disconnected' ? '未连接' : '等待画面') : '后广角未接入'}</Text>
          </View>
        ) : null}

        {/* Concept A-1 Top Floating Three-Island Bar */}
        <View style={[styles.header, { left: compactTopBar ? 8 : sp(18), right: compactTopBar ? 8 : sp(18), top: ultraShortStage ? 6 : compactTopBar ? 8 : sp(12) }]} pointerEvents="box-none">
          <View style={[styles.topBarRow, { gap: ultraCompactTop ? 4 : compactTopBar ? 5 : sp(10), minHeight: topBarMinHeight }]} pointerEvents="box-none" testID="control-hud-status-bar">
            {/* Island 1 (Top-Left): Identity + Connection + Auth + Status + Control Settings + Workspace Settings */}
            <View style={[styles.islandLeft, { gap: ultraCompactTop ? 4 : compactTopBar ? 5 : sp(7), minHeight: topBarMinHeight, paddingHorizontal: ultraCompactTop ? 6 : compactTopBar ? 8 : sp(13), paddingVertical: compactTopBar ? 2 : sp(3) }]} pointerEvents="box-none">
              <Pressable
                accessibilityLabel={'设备连接' + connectionLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: !onOpenConnection }}
                disabled={!onOpenConnection}
                onPress={onOpenConnection}
                style={({ pressed }) => [styles.identityTrigger, { gap: compactTopBar ? 4 : sp(7) }, pressed && styles.pressed]}
                testID="control-open-connection"
              >
                <View style={[styles.connectionDot, { borderRadius: sp(4), height: compactTopBar ? 7 : sp(8), width: compactTopBar ? 7 : sp(8) }, connection === 'connected' ? styles.connectedDot : connection === 'readonly' ? styles.readonlyDot : null]} testID="control-hud-connection-dot" />
                <Text numberOfLines={1} style={[styles.identityText, { fontSize: compactTopBar ? 12 : fTitle, lineHeight: compactTopBar ? 16 : fTitleLine }, compactTopBar ? { maxWidth: ultraCompactTop ? 72 : 102 } : null]}>{robotName}</Text>
                <View style={[styles.connPillBadge, { borderRadius: sp(6), paddingHorizontal: compactTopBar ? 5 : sp(7), paddingVertical: compactTopBar ? 1 : sp(2) }]}>
                  <Text numberOfLines={1} style={[styles.connPillText, { fontSize: compactTopBar ? 11 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>{connectionLabel}</Text>
                </View>
              </Pressable>

              {connection === 'disconnected' && onReconnect ? (
                <Pressable
                  accessibilityLabel="立即重连机器狗与图传"
                  accessibilityRole="button"
                  onPress={onReconnect}
                  style={({ pressed }) => [styles.reconnectPillBtn, { borderRadius: sp(999), gap: 3, minHeight: compactTopBar ? 24 : sp(26), paddingHorizontal: compactTopBar ? 7 : sp(9), paddingVertical: compactTopBar ? 1 : sp(2) }, pressed && styles.pressed]}
                  testID="control-hud-reconnect"
                >
                  <Ionicons color="#FFFFFF" name="refresh-outline" size={sp(12)} />
                  <Text numberOfLines={1} style={[styles.reconnectPillText, { fontSize: compactTopBar ? 11 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>重连</Text>
                </Pressable>
              ) : null}

              {showLocalControl ? (
                <Chip compact={compactTopBar} sp={sp} testID="control-hud-local-control">
                  <Text numberOfLines={1} style={[styles.chipText, { fontSize: compactTopBar ? 10.5 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>本设备控制</Text>
                </Chip>
              ) : null}
              {showUnlocked ? (
                <Chip compact={compactTopBar} sp={sp} testID="control-hud-unlocked">
                  <Ionicons color={EMERALD_INK} name="lock-open-outline" size={compactTopBar ? 10 : sp(12)} />
                  <Text numberOfLines={1} style={[styles.chipText, { fontSize: compactTopBar ? 10.5 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>设备已解锁</Text>
                </Chip>
              ) : null}

              <View style={[styles.islandDivider, { height: sp(16) }]} />

              <Pressable
                accessibilityLabel="状态"
                accessibilityRole="button"
                onPress={onOpenJointStatus ?? onBack}
                style={({ pressed }) => [styles.islandNavBtn, { gap: compactTopBar ? 3 : sp(5), minHeight: topBtnHeight, paddingHorizontal: ultraCompactTop ? 5 : compactTopBar ? 6 : sp(9) }, pressed && styles.pressed]}
                testID="control-hud-open-status"
              >
                {!(ultraCompactTop && (showLocalControl || showUnlocked)) ? <Ionicons color={INK} name="pulse-outline" size={compactTopBar ? 12 : sp(14)} /> : null}
                <Text numberOfLines={1} style={[styles.islandNavText, { fontSize: topFont, lineHeight: topFontLine }]}>状态</Text>
              </Pressable>

              <Pressable
                accessibilityLabel={settingsLabel}
                accessibilityRole="button"
                accessibilityState={{ expanded: settingsOpen }}
                onPress={onOpenSettings}
                style={({ pressed }) => [styles.islandNavBtn, { gap: compactTopBar ? 3 : sp(5), minHeight: topBtnHeight, paddingHorizontal: ultraCompactTop ? 6 : compactTopBar ? 7 : sp(10) }, settingsOpen && styles.islandNavBtnActive, pressed && styles.pressed]}
                testID="control-hud-settings"
              >
                {!(ultraCompactTop && (showLocalControl || showUnlocked)) ? <Ionicons color={settingsOpen ? '#93C5FD' : INK} name="settings-outline" size={compactTopBar ? 12 : sp(14)} /> : null}
                <Text numberOfLines={1} style={[styles.islandNavText, { fontSize: topFont, lineHeight: topFontLine }, settingsOpen && styles.islandNavTextActive]}>设置</Text>
              </Pressable>
            </View>

            {/* Island 2 (Top-Center): Mode + Segmented Terrain Capsules + Speed Chip */}
            <View style={[styles.islandCenter, { gap: compactTopBar ? 3 : sp(6), minHeight: topBarMinHeight, paddingHorizontal: compactTopBar ? 4 : sp(7), paddingVertical: compactTopBar ? 2 : sp(3) }]} pointerEvents="box-none">
              <Pressable
                accessibilityLabel={recoveryModeSelected ? '恢复模式' : '常规模式，切换左侧控制组'}
                accessibilityRole="button"
                onPress={cycleLeftCategory}
                style={({ pressed }) => [styles.modeMiniBtn, { paddingHorizontal: compactTopBar ? 5 : sp(8), paddingVertical: compactTopBar ? 3 : sp(4) }, pressed && styles.pressed]}
                testID="control-hud-mode-header"
              >
                <Ionicons color="#C5CED4" name={recoveryModeSelected ? 'medkit-outline' : 'apps-outline'} size={compactTopBar ? 13 : sp(14)} />
              </Pressable>

              <View style={[styles.terrainTrack, { gap: 2, padding: ultraShortStage ? 1 : 2 }]}>
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
                      styles.terrainSegBtn,
                      { minHeight: topBtnHeight, paddingHorizontal: ultraCompactTop ? 7 : compactTopBar ? 8 : sp(14) },
                      option.selected && styles.terrainSegBtnSelected,
                      option.disabled && !option.selected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-hud-terrain-capsule-${option.id}`}
                  >
                    <Text numberOfLines={1} style={[styles.terrainSegText, { fontSize: compactTopBar ? 12 : fBody, lineHeight: topFontLine }, option.selected && styles.terrainSegTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.islandDivider, { height: sp(16) }]} />

              <Pressable
                accessibilityLabel={`调节速度限制，当前 ${speedMode === 'high' ? '高速 ' : ''}${speedLimitClamped}%`}
                accessibilityRole="button"
                accessibilityState={{ expanded: speedLimitExpanded }}
                onPress={onToggleSpeedLimitExpanded}
                style={({ pressed }) => [
                  styles.speedPillBtn,
                  { minHeight: topBtnHeight, paddingHorizontal: compactTopBar ? 7 : sp(12) },
                  (speedLimitExpanded || speedLimitClamped < 100 || speedMode === 'high') && styles.speedPillBtnActive,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-speed-limit-toggle"
              >
                <Text numberOfLines={1} style={[styles.speedPillText, { fontSize: topFont, lineHeight: topFontLine }]}>
                  {speedMode === 'high'
                    ? (speedLimitClamped < 100 ? `高速 ${speedLimitClamped}%` : '2.5 m/s')
                    : (speedLimitClamped < 100 ? `${speedLimitClamped}%` : '1.0 m/s')}
                </Text>
              </Pressable>
            </View>

            {/* Island 3 (Top-Right): Signal / Voltage / Thermal Telemetry + Guarded Crimson E-Stop */}
            <View style={[styles.islandRight, { flexShrink: 1, gap: ultraCompactTop ? 5 : compactTopBar ? 6 : sp(7), minHeight: topBarMinHeight, paddingLeft: compactTopBar ? 8 : sp(13), paddingRight: compactTopBar ? 4 : sp(5), paddingVertical: compactTopBar ? 2 : sp(3) }]} pointerEvents="box-none" testID="control-telemetry">
              <View style={[styles.telemetryCluster, { gap: ultraCompactTop ? 5 : compactTopBar ? 6 : sp(7) }]} pointerEvents="box-none">
                {faults.length > 0 ? (
                  <Pressable
                    accessibilityLabel={`异常列表，共 ${faults.length} 项`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: faultPanelOpen }}
                    onPress={onToggleFaultPanel}
                    style={({ pressed }) => [styles.faultBadgeBtn, { borderRadius: sp(12), height: compactTopBar ? 22 : sp(24), minWidth: compactTopBar ? 22 : sp(24), paddingHorizontal: compactTopBar ? 5 : sp(6) }, faultPanelOpen && styles.faultBadgeBtnActive, pressed && styles.pressed]}
                    testID="control-hud-fault-badge"
                  >
                    <Text numberOfLines={1} style={[styles.faultBadgeText, { fontSize: compactTopBar ? 11 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>{faults.length > 1 ? String(faults.length) : '!'}</Text>
                  </Pressable>
                ) : null}

                {signals.cellularVisible ? (
                  <View accessible accessibilityLabel={`移动数据 ${signals.cellularText}`} style={[styles.telemetryItem, { gap: compactTopBar ? 2 : sp(4) }]} testID="control-hud-cellular">
                    <Ionicons color={INK} name="cellular" size={compactTopBar ? 12 : sp(14)} />
                    <Text numberOfLines={1} style={[styles.telemetryText, { fontSize: topFont, lineHeight: topFontLine }]}>{signals.cellularText}</Text>
                  </View>
                ) : null}

                {signals.robotVisible ? (
                  <View accessible accessibilityLabel={`机器人信号 ${signals.robotText}`} style={[styles.telemetryItem, { gap: compactTopBar ? 2 : sp(4) }]} testID="control-hud-robot-signal">
                    <Ionicons color="#7DD3FC" name="hardware-chip-outline" size={compactTopBar ? 12 : sp(14)} />
                    <Text numberOfLines={1} style={[styles.telemetryText, { fontSize: topFont, lineHeight: topFontLine }]}>{signals.robotText}</Text>
                  </View>
                ) : null}

                {signals.wifiVisible ? (
                  <View accessible accessibilityLabel={`WiFi ${signals.wifiText}`} style={[styles.telemetryItem, { gap: compactTopBar ? 2 : sp(4) }]} testID="control-hud-wifi-signal">
                    <Ionicons color={EMERALD_INK} name="wifi" size={compactTopBar ? 12 : sp(14)} />
                    <Text numberOfLines={1} style={[styles.telemetryText, { fontSize: topFont, lineHeight: topFontLine }]}>{compactTopBar ? signals.wifiCompactText : signals.wifiText}</Text>
                  </View>
                ) : null}

                {inlineVoltageText || inlineBatteryText ? (
                  <Text numberOfLines={1} style={[styles.telemetryText, { fontSize: topFont, lineHeight: topFontLine }]}>
                    {[inlineVoltageText, inlineBatteryText].filter(Boolean).join(compactTopBar ? '·' : ' · ')}
                  </Text>
                ) : null}

                {inlineTempText ? (
                  <Text numberOfLines={1} style={[styles.telemetryText, { fontSize: topFont, lineHeight: topFontLine }]}>{inlineTempText}</Text>
                ) : null}

                {recordingActive ? (
                  <View accessible accessibilityLabel={`正在录制视频 ${recordingDurationLabel ?? ''}`} style={[styles.recordingBadge, { gap: compactTopBar ? 3 : sp(4), paddingHorizontal: compactTopBar ? 6 : sp(8), paddingVertical: compactTopBar ? 2 : sp(3) }]} testID="control-hud-recording-badge">
                    <View style={[styles.recordingDot, { borderRadius: sp(3.5), height: sp(7), width: sp(7) }]} />
                    <Text numberOfLines={1} style={[styles.recordingBadgeText, { fontSize: compactTopBar ? 11 : fMeta, lineHeight: compactTopBar ? 14 : fMetaLine }]}>{recordingDurationLabel ? `REC ${recordingDurationLabel}` : 'REC'}</Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                accessibilityHint={stopHint}
                accessibilityLabel="软件急停"
                accessibilityRole="button"
                accessibilityState={{ disabled: stopDisabled }}
                disabled={stopDisabled}
                onPress={onStop}
                style={({ pressed }) => [styles.stop, { gap: compactTopBar ? 4 : sp(6), minHeight: topBtnHeight, minWidth: compactTopBar ? 60 : sp(74), paddingHorizontal: compactTopBar ? 10 : sp(14) }, stopDisabled && styles.stopDisabled, pressed && !stopDisabled && styles.pressed]}
                testID="control-hud-stop"
              >
                <View style={[styles.stopRing, { borderRadius: compactTopBar ? 6 : sp(7), height: compactTopBar ? 12 : sp(14), width: compactTopBar ? 12 : sp(14) }]}>
                  <View style={[styles.stopCore, { borderRadius: 2, height: 4, width: 4 }]} />
                </View>
                <Text numberOfLines={1} style={[styles.stopText, { fontSize: compactTopBar ? 12.5 : fTitle, lineHeight: compactTopBar ? 16 : fTitleLine }]}>急停</Text>
              </Pressable>
            </View>
          </View>

          {speedLimitExpanded ? (
            <View style={[styles.speedBarFloating, { gap: sp(8), height: sp(38), marginTop: sp(8), paddingHorizontal: sp(15) }]} testID="control-hud-speed-limit-bar">
              {onSelectSpeedMode ? (
                <View style={[styles.speedModeSegment, { borderRadius: sp(999), gap: sp(2), padding: 2 }]} testID="control-hud-speed-mode-group">
                  <Pressable
                    accessibilityLabel="标准速度档位 1.0 m/s"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: connection !== 'connected' || speedMode === 'unsupported', selected: speedMode !== 'high' }}
                    disabled={connection !== 'connected' || speedMode === 'unsupported'}
                    onPress={() => { if (speedMode === 'high') onSelectSpeedMode('normal'); }}
                    style={({ pressed }) => [
                      styles.speedModeChip,
                      { borderRadius: sp(999), paddingHorizontal: sp(9), paddingVertical: sp(3) },
                      speedMode !== 'high' && styles.speedModeChipActive,
                      (connection !== 'connected' || speedMode === 'unsupported') && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-hud-speed-mode-normal"
                  >
                    <Text style={[styles.speedModeChipText, { fontSize: fMeta, lineHeight: fMetaLine }, speedMode !== 'high' && styles.speedModeChipTextActive]}>标准 1.0</Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint={speedMode === 'unsupported' ? '当前固件未开放高速模式' : '开阔平地最高 2.5 m/s'}
                    accessibilityLabel="高速速度档位 2.5 m/s"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: connection !== 'connected' || speedMode === 'unsupported', selected: speedMode === 'high' }}
                    disabled={connection !== 'connected' || speedMode === 'unsupported'}
                    onPress={() => { if (speedMode !== 'high') onSelectSpeedMode('high'); }}
                    style={({ pressed }) => [
                      styles.speedModeChip,
                      { borderRadius: sp(999), paddingHorizontal: sp(9), paddingVertical: sp(3) },
                      speedMode === 'high' && styles.speedModeChipHighActive,
                      (connection !== 'connected' || speedMode === 'unsupported') && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-hud-speed-mode-high"
                  >
                    <Text style={[styles.speedModeChipText, { fontSize: fMeta, lineHeight: fMetaLine }, speedMode === 'high' && styles.speedModeChipTextHigh]}>高速 2.5</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={[styles.speedBarLabel, { fontSize: fMeta, lineHeight: fMetaLine }]}>限速比例</Text>
              <Pressable
                accessibilityLabel="降低速度限制"
                accessibilityRole="button"
                disabled={speedLimitClamped <= 10}
                onPress={() => onChangeSpeedLimit(speedLimitClamped - 10)}
                style={({ pressed }) => [styles.speedStepBtn, { borderRadius: sp(12), height: sp(24), width: sp(24) }, speedLimitClamped <= 10 && styles.disabled, pressed && styles.pressed]}
                testID="control-hud-speed-limit-dec"
              >
                <Ionicons color={INK} name="remove" size={sp(15)} />
              </Pressable>
              <View style={[styles.speedTrack, { borderRadius: sp(3), height: sp(6), width: sp(88) }]}>
                <View style={[styles.speedFill, { width: `${speedLimitClamped}%` }]} />
              </View>
              <Pressable
                accessibilityLabel="提高速度限制"
                accessibilityRole="button"
                disabled={speedLimitClamped >= 100}
                onPress={() => onChangeSpeedLimit(speedLimitClamped + 10)}
                style={({ pressed }) => [styles.speedStepBtn, { borderRadius: sp(12), height: sp(24), width: sp(24) }, speedLimitClamped >= 100 && styles.disabled, pressed && styles.pressed]}
                testID="control-hud-speed-limit-inc"
              >
                <Ionicons color={INK} name="add" size={sp(15)} />
              </Pressable>
              <Text style={[styles.speedBarValue, { fontSize: fBody, lineHeight: fBodyLine, minWidth: sp(40) }]} testID="control-hud-speed-limit-value">{`${speedLimitClamped}%`}</Text>
            </View>
          ) : null}
        </View>

        {/* Joystick Touch Layer (sibling of control-hud-center-stack) */}
        <View
          onLayout={onStickFrameLayout}
          pointerEvents={settingsMenu || !joystick ? 'none' : 'box-none'}
          style={[styles.stickFrame, stickFrameStyle, (settingsMenu || !joystick) ? styles.hiddenStickFrame : null]}
          testID="control-immersive-sticks"
        >
          {joystick}
        </View>
        {pointCloud && !settingsMenu ? (
          <View
            pointerEvents="box-none"
            style={[styles.centerStack, { left: centerStackInset, right: centerStackInset, bottom: stickFrameStyle?.bottom ?? 72 }]}
            testID="control-hud-center-stack"
          >
            {pointCloud}
          </View>
        ) : null}

        {/* Upper-Left Quick Tool Rail: Voice / Virtual Discs / Body Height */}
        {!settingsMenu && (onToggleVoiceChat || onToggleVirtualDiscControls || onToggleBodyHeightPanel) ? (
          <View pointerEvents="box-none" style={[styles.leftVoiceRail, { gap: sp(ultraShortStage ? 6 : 8), left: pipRight, top: pipTop }]}>
            {onToggleVoiceChat ? (() => {
              const voiceBusyState = voiceChatLiveState === 'listening' || voiceChatLiveState === 'thinking' || voiceChatLiveState === 'speaking' || voiceChatActive;
              const voiceDotColor =
                voiceChatLiveState === 'listening'
                  ? '#22C55E'
                  : voiceChatLiveState === 'speaking'
                    ? '#38BDF8'
                    : voiceChatLiveState === 'thinking'
                      ? '#60A5FA'
                      : voiceChatQuietMode
                        ? '#F59E0B'
                        : voiceChatConnected
                          ? '#22C55E'
                          : '#94A3B8';
              const voiceHaloColor =
                voiceChatLiveState === 'listening'
                  ? 'rgba(34, 197, 94, 0.34)'
                  : voiceChatLiveState === 'speaking'
                    ? 'rgba(56, 189, 248, 0.34)'
                    : 'rgba(96, 165, 250, 0.32)';
              const dockVoiceLabel = voiceBusyState && voiceChatStatusLabel
                ? voiceChatStatusLabel
                : voiceChatQuietMode
                  ? '轻声'
                  : '对话';
              return (
                <Pressable
                  accessibilityLabel={voiceChatOpen ? '收起语音对话' : '打开语音对话'}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: voiceChatOpen, selected: voiceChatOpen || voiceBusyState }}
                  onPress={onToggleVoiceChat}
                  style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
                  testID="control-hud-voice-toggle"
                >
                  <View
                    style={[
                      styles.circleBtn,
                      styles.circleBtnRelative,
                      { borderRadius: circleRadius, height: circleSize, width: circleSize },
                      (voiceChatOpen || voiceBusyState) && styles.circleBtnActive,
                    ]}
                  >
                    <Ionicons
                      color={INK}
                      name={voiceBusyState ? 'mic' : voiceChatOpen ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                      size={circleIconSize}
                    />
                    {voiceChatConnected || voiceBusyState ? (
                      <View
                        style={[
                          styles.voiceDotHalo,
                          voiceBusyState && { backgroundColor: voiceHaloColor },
                        ]}
                        testID="control-hud-voice-presence-dot"
                      >
                        <View style={[styles.voiceDotCore, { backgroundColor: voiceDotColor }]} />
                      </View>
                    ) : null}
                    {voiceChatPendingReminders > 0 ? (
                      <View style={styles.voiceReminderBadge} testID="control-hud-voice-reminder-badge">
                        <Text style={styles.voiceReminderBadgeText}>{String(voiceChatPendingReminders)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>
                    {dockVoiceLabel}
                  </Text>
                  {voiceChatEmotionLabel ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.voiceEmotionBadge, { fontSize: Math.max(9, sp(9.5)), lineHeight: sp(12) }]}
                      testID="control-hud-voice-emotion"
                    >
                      {voiceChatEmotionLabel}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })() : null}
            {onToggleVirtualDiscControls ? (
              <Pressable
                accessibilityLabel={showVirtualDiscControls ? '隐藏圆盘控制' : '显示圆盘控制'}
                accessibilityRole="switch"
                accessibilityState={{ checked: showVirtualDiscControls }}
                onPress={onToggleVirtualDiscControls}
                style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
                testID="control-hud-virtual-disc-toggle"
              >
                <View
                  style={[
                    styles.circleBtn,
                    { borderRadius: circleRadius, height: circleSize, width: circleSize },
                    showVirtualDiscControls && styles.circleBtnActive,
                  ]}
                >
                  <Ionicons
                    color={INK}
                    name={showVirtualDiscControls ? 'disc' : 'disc-outline'}
                    size={circleIconSize}
                  />
                </View>
                <Text numberOfLines={1} style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>
                  圆盘
                </Text>
              </Pressable>
            ) : null}
            {onToggleBodyHeightPanel ? (
              <Pressable
                accessibilityLabel={bodyHeightPanelOpen ? '收起机身高度' : '调节机身高度'}
                accessibilityRole="button"
                accessibilityState={{ expanded: bodyHeightPanelOpen, selected: bodyHeightPanelOpen || Boolean(bodyHeight?.active) }}
                onPress={onToggleBodyHeightPanel}
                style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
                testID="control-hud-height-toggle"
              >
                <View
                  style={[
                    styles.circleBtn,
                    { borderRadius: circleRadius, height: circleSize, width: circleSize },
                    (bodyHeightPanelOpen || bodyHeight?.active) && styles.circleBtnActive,
                  ]}
                >
                  <Ionicons
                    color={INK}
                    name={bodyHeightPanelOpen || bodyHeight?.active ? 'swap-vertical' : 'swap-vertical-outline'}
                    size={circleIconSize}
                  />
                </View>
                <Text numberOfLines={1} style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>
                  {activeHeightBadgeText ?? '高度'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Upper-Right Dual Camera / Depth PiP Window */}
        {dualCameraEnabled && !settingsMenu ? (
          <Pressable
            accessibilityLabel={`第二相机视角（${depthActive ? '深度图' : showMainFront ? '后视角' : '前视角'}），点击互换主画面`}
            accessibilityRole="button"
            onPress={onSwapCamera}
            style={({ pressed }) => [styles.pipWindow, { borderRadius: sp(ultraShortStage ? 10 : 12), height: pipH, right: pipRight, top: pipTop, width: pipW }, pressed && styles.pressed]}
            testID="control-hud-pip-window"
          >
            {depthActive && depthPreview ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{depthPreview}</View>
            ) : secondaryPipFeed ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{secondaryPipFeed}</View>
            ) : (
              <View pointerEvents="none" style={[styles.pipPlaceholder, { gap: sp(4) }]} testID="control-hud-pip-placeholder">
                <Ionicons color={MUTED} name="videocam-off-outline" size={sp(ultraShortStage ? 17 : 20)} />
              </View>
            )}
            <View pointerEvents="none" style={[styles.pipHeaderRow, { left: sp(ultraShortStage ? 6 : 8), top: sp(ultraShortStage ? 6 : 8) }]}>
              <View style={[styles.pipBadge, { borderRadius: sp(6), paddingHorizontal: sp(ultraShortStage ? 6 : 8), paddingVertical: sp(ultraShortStage ? 2 : 3) }]}>
                <Text style={[styles.pipBadgeText, { fontSize: fMeta, lineHeight: railMetaLine }]}>
                  {depthActive ? '深度图 ⇄' : showMainFront ? (hasDedicatedRearCamera === false ? '副视窗 ⇄' : '后广角 ⇄') : '前视角 ⇄'}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* Concept A-1 Circular Glass Tool Buttons Directly Below (or Beside on ultra-short stage) PiP */}
        {!settingsMenu ? <View pointerEvents="box-none" style={[styles.rightRail, { alignItems: 'center' as const, gap: sp(ultraShortStage ? 4 : compactRightRail ? 5 : 9), right: rightRailRight, top: rightRailTop, width: rightRailWidth }]} testID="control-hud-camera-rail">
          <View style={[styles.circleToolRow, { justifyContent: 'space-around' as const, width: '100%' }]}>
            <Pressable
              accessibilityLabel={dualCameraEnabled ? '关闭双广角，切为单广角' : '开启双广角'}
              accessibilityRole="button"
              accessibilityState={{ selected: dualCameraEnabled }}
              onPress={onToggleDualCamera}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
              testID="control-hud-camera-count-toggle"
            >
              <View style={[styles.circleBtn, { borderRadius: circleRadius, height: circleSize, width: circleSize }, dualCameraEnabled && styles.circleBtnActive]}>
                <Ionicons color={INK} name={dualCameraEnabled ? 'albums-outline' : 'square-outline'} size={circleIconSize} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>双摄</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={depthActive ? '关闭深度图叠层' : '开启深度图预览'}
              accessibilityRole="button"
              accessibilityState={{ selected: depthActive }}
              onPress={onToggleDepth}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
              testID="control-hud-depth-toggle"
            >
              <View style={[styles.circleBtn, { borderRadius: circleRadius, height: circleSize, width: circleSize }, depthActive && styles.circleBtnActive]}>
                <Ionicons color={INK} name="radio-button-on-outline" size={circleIconSize} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>深度</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="拍照保存画面"
              accessibilityRole="button"
              onPress={onCapturePhoto}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(2) }, pressed && styles.pressed]}
              testID="control-hud-photo-capture"
            >
              <View style={[styles.circleBtn, { borderRadius: circleRadius, height: circleSize, width: circleSize }]}>
                <Ionicons color={INK} name="camera-outline" size={circleIconSize} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: railMetaLine }]}>抓拍</Text>
            </Pressable>
          </View>

          <View style={[styles.secondaryUtilityStrip, { gap: 2, justifyContent: 'space-between' as const, paddingHorizontal: ultraShortStage ? 3 : 4, paddingVertical: 2, width: '100%' }]}>
            <Pressable
              accessibilityLabel={`切换相机视角，当前${showMainFront ? '前视角' : '后视角'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: !showMainFront }}
              onPress={onSwapCamera}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: 2, justifyContent: 'center' as const, paddingHorizontal: ultraShortStage ? 3 : 4, paddingVertical: ultraShortStage ? 2 : compactRightRail ? 3 : 4 }, !showMainFront && styles.utilityMiniPillActive, pressed && styles.pressed]}
              testID="control-hud-camera-swap"
            >
              <Ionicons color={INK} name="camera-reverse-outline" size={ultraShortStage ? 10 : compactRightRail ? 11 : sp(13)} />
              <Text numberOfLines={1} style={[styles.utilityMiniText, { fontSize: compactRightRail ? 10.5 : fMeta, lineHeight: railMetaLine }]}>{showMainFront ? '前视' : '后视'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={headlightMode === 'off' ? '前照明灯：关闭' : headlightMode === 'front' ? '前照明灯：前灯开启' : '前照明灯：前后开启'}
              accessibilityRole="button"
              accessibilityState={{ selected: headlightMode !== 'off' }}
              onPress={onToggleHeadlight}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: 2, justifyContent: 'center' as const, paddingHorizontal: ultraShortStage ? 3 : 4, paddingVertical: ultraShortStage ? 2 : compactRightRail ? 3 : 4 }, headlightMode !== 'off' && styles.utilityMiniPillActive, pressed && styles.pressed]}
              testID="control-hud-light-toggle"
            >
              <Ionicons color={headlightMode !== 'off' ? EMERALD_INK : INK} name="flashlight-outline" size={ultraShortStage ? 10 : compactRightRail ? 11 : sp(13)} />
              <Text numberOfLines={1} style={[styles.utilityMiniText, { fontSize: compactRightRail ? 10.5 : fMeta, lineHeight: railMetaLine }]}>{headlightMode === 'off' ? '车灯' : headlightMode === 'front' ? '前灯' : '双灯'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={recordingActive ? '结束录屏' : '开始录屏'}
              accessibilityRole="button"
              accessibilityState={{ selected: recordingActive }}
              onPress={onToggleRecord}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: 2, justifyContent: 'center' as const, paddingHorizontal: ultraShortStage ? 3 : 4, paddingVertical: ultraShortStage ? 2 : compactRightRail ? 3 : 4 }, recordingActive && styles.utilityMiniPillDanger, pressed && styles.pressed]}
              testID="control-hud-record-toggle"
            >
              <Ionicons color={INK} name={recordingActive ? 'stop-circle-outline' : 'videocam-outline'} size={ultraShortStage ? 10 : compactRightRail ? 11 : sp(13)} />
              <Text numberOfLines={1} style={[styles.utilityMiniText, { fontSize: compactRightRail ? 10.5 : fMeta, lineHeight: railMetaLine }]}>录屏</Text>
            </Pressable>
          </View>
        </View> : null}

        {/* Floating Joint Params / Joint Temp / Faults / Recovery */}
        {anyFloatingPanel && !settingsMenu ? (
          <View pointerEvents="box-none" style={[styles.floatingPanelsOverlay, { bottom: sp(116), top: sp(64) + (speedLimitExpanded ? sp(46) : 0) + (feedback ? sp(46) : 0) + (hudNotice ? sp(46) : 0), transform: [{ translateX: -Math.round(overlayW / 2) }], width: overlayW }]} testID="control-hud-overlay-stack">
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.floatingPanelsContent}
              style={styles.floatingPanelsScroll}
            >
              {recovery}
              {hasVoiceOverlay ? voiceChatPanel : null}
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
              }) : null}
              {jointTempOpen ? JointTemperaturePanel({
                moduleKind: tempModuleKind,
                onSelectModule: onTempModuleKindChange,
                joints,
                onClose: onToggleJointTemp,
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
              }) : null}
            </ScrollView>
          </View>
        ) : null}

        {/* Expanded Dashboard Floats Above Concept A-1 Obsidian Bottom Dock (yields center stage when popovers/panels are open) */}
        {docksExpanded && !settingsMenu ? (
          <View
            pointerEvents={leftCategory !== 'policy' || anyFloatingPanel ? 'none' : 'box-none'}
            style={[styles.dashboardOverlay, (leftCategory !== 'policy' || anyFloatingPanel) ? styles.hiddenBehindPopover : null]}
          >
            {ControlHudDashboard({
              expanded: true,
              scale: hudScale,
              maxWidth: centerFreeWidth,
              bottomOffset: sp(64),
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

        {/* Concept A-1 Bottom-Center Floating Obsidian Pill Dock + Popover */}
        {!settingsMenu ? <View pointerEvents="box-none" style={[styles.bottomDockContainer, { bottom: sp(12) }]} testID="control-hud-left-controls">
          {leftCategory !== 'policy' ? (
            <View style={[styles.drawerPopover, { borderRadius: sp(16), marginBottom: sp(8), maxWidth: leftCategory === 'action' && gestures.length > 0 ? gestureDeckWidth + sp(24) : sp(440), paddingHorizontal: sp(11), paddingVertical: sp(8) }]}>
              {leftCategory === 'posture' ? (
                <View style={[styles.drawerWrap, { gap: sp(6) }]} testID="control-hud-posture-dock">
                  {postures.map(option => (
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
                        option.selected && styles.drawerPillBtnActive,
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
                        (bodyHeightPanelOpen || bodyHeight?.active) && styles.drawerPillBtnActive,
                        pressed && styles.pressed,
                      ]}
                      testID="control-hud-posture-height"
                    >
                      <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, (bodyHeightPanelOpen || bodyHeight?.active) && styles.drawerPillTextActive]}>
                        机身高度
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityHint={motorHint}
                    accessibilityLabel={motorEnabled ? '失能电机' : '使能电机'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: motorDisabled || motorBusy, selected: motorEnabled === true }}
                    disabled={motorDisabled || motorBusy}
                    onPress={onToggleMotor}
                    style={({ pressed }) => [
                      styles.drawerPillBtn,
                      { gap: sp(4), minHeight: sp(32), paddingHorizontal: sp(13), paddingVertical: sp(4) },
                      motorEnabled && styles.drawerPillBtnActive,
                      (motorDisabled || motorBusy) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-hud-posture-motor"
                  >
                    <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, motorEnabled && styles.drawerPillTextActive]}>
                      {motorEnabled ? '失能电机' : '使能电机'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {leftCategory === 'action' ? (
                <View style={[styles.drawerWrap, { gap: sp(6) }]} testID="control-hud-action-dock">
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
                    variant: 'hud',
                    deckWidth: gestureDeckWidth,
                    maxListHeight: gestureMaxListHeight,
                  }) : HUD_BASIC_ACTIONS.map(item => {
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
                          selected && styles.drawerPillBtnActive,
                          !item.supported && styles.drawerPillPending,
                          pressed && styles.pressed,
                        ]}
                        testID={`control-hud-basic-action-${item.id}`}
                      >
                        <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }, selected && styles.drawerPillTextActive]}>
                          {item.label}
                        </Text>
                        {!item.supported ? <Text style={[styles.pendingTag, { fontSize: fMeta, lineHeight: fMetaLine }]}>待接入</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <View
            style={[
              styles.bottomDockBar,
              {
                gap: !docksExpanded && compactTopBar ? (ultraCompactTop ? 4 : 5) : sp(8),
                maxWidth: !docksExpanded && compactTopBar ? centerFreeWidth : undefined,
                minHeight: !docksExpanded && compactTopBar ? (ultraShortStage ? 38 : 40) : sp(44),
                paddingHorizontal: !docksExpanded && compactTopBar ? (ultraCompactTop ? 8 : 10) : sp(14),
                paddingVertical: !docksExpanded && compactTopBar ? 3 : sp(5),
              },
            ]}
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
                { gap: !docksExpanded && compactTopBar ? 4 : sp(6), minHeight: !docksExpanded && compactTopBar ? 26 : sp(32), paddingHorizontal: !docksExpanded && compactTopBar ? 2 : sp(4) },
                (motorDisabled || motorBusy) && styles.disabled,
                pressed && styles.pressed,
              ]}
              testID="control-hud-motor-power"
            >
              <View style={[styles.motorDot, { borderRadius: sp(4), height: !docksExpanded && compactTopBar ? 7 : sp(8), width: !docksExpanded && compactTopBar ? 7 : sp(8) }, motorEnabled ? styles.motorDotArmed : styles.motorDotOff]} />
              <Text numberOfLines={1} style={[styles.dockMotorText, { fontSize: !docksExpanded && compactTopBar ? 12 : fBody, lineHeight: !docksExpanded && compactTopBar ? 16 : fBodyLine }, motorEnabled && styles.dockMotorTextArmed]}>
                {motorEnabled ? '失能电机' : '使能电机'}
              </Text>
            </Pressable>

            <View style={[styles.dockDivider, { height: sp(16) }]} />

            <View style={[styles.dockPostureGroup, { gap: !docksExpanded && compactTopBar ? 2 : sp(4) }]} testID="control-hud-quick-posture">
              <Pressable
                accessibilityHint={standOption?.hint}
                accessibilityLabel="起立"
                accessibilityRole="button"
                accessibilityState={{ disabled: standOption?.disabled ?? true, selected: standOption?.selected ?? false }}
                disabled={standOption?.disabled ?? true}
                onPress={() => standOption?.onPress()}
                style={({ pressed }) => [
                  styles.dockItemBtn,
                  { minHeight: !docksExpanded && compactTopBar ? 26 : sp(30), paddingHorizontal: !docksExpanded && compactTopBar ? (ultraCompactTop ? 7 : 8) : sp(10) },
                  standOption?.selected && styles.dockItemBtnActive,
                  (standOption?.disabled ?? true) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-quick-stand"
              >
                <Text numberOfLines={1} style={[styles.dockItemText, { fontSize: !docksExpanded && compactTopBar ? 12 : fBody, lineHeight: !docksExpanded && compactTopBar ? 16 : fBodyLine }, standOption?.selected && styles.dockItemTextActive]}>站立</Text>
              </Pressable>

              <Pressable
                accessibilityHint={sitOption?.hint}
                accessibilityLabel="趴下"
                accessibilityRole="button"
                accessibilityState={{ disabled: sitOption?.disabled ?? true, selected: sitOption?.selected ?? false }}
                disabled={sitOption?.disabled ?? true}
                onPress={() => sitOption?.onPress()}
                style={({ pressed }) => [
                  styles.dockItemBtn,
                  { minHeight: !docksExpanded && compactTopBar ? 26 : sp(30), paddingHorizontal: !docksExpanded && compactTopBar ? (ultraCompactTop ? 7 : 8) : sp(10) },
                  sitOption?.selected && styles.dockItemBtnActive,
                  (sitOption?.disabled ?? true) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-quick-sit"
              >
                <Text numberOfLines={1} style={[styles.dockItemText, { fontSize: !docksExpanded && compactTopBar ? 12 : fBody, lineHeight: !docksExpanded && compactTopBar ? 16 : fBodyLine }, sitOption?.selected && styles.dockItemTextActive]}>坐下</Text>
              </Pressable>
            </View>

            <View style={[styles.dockDivider, { height: sp(16) }]} />

            <View style={[styles.dockCategories, { gap: 2 }]} testID="control-hud-left-category-tabs">
              {LEFT_CATEGORIES.filter(tab => tab.id !== 'policy').map(tab => {
                const selected = leftCategory === tab.id;
                const toggleNext = tab.id === 'policy' ? 'policy' : selected ? 'policy' : tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityLabel={tab.label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => onLeftCategoryChange(toggleNext)}
                    style={({ pressed }) => [
                      styles.dockCatBtn,
                      { minHeight: !docksExpanded && compactTopBar ? 26 : sp(30), paddingHorizontal: !docksExpanded && compactTopBar ? (ultraCompactTop ? 7 : 8) : sp(10) },
                      selected && tab.id !== 'policy' && styles.dockCatBtnActive,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-hud-category-${tab.id}`}
                  >
                    <Text numberOfLines={1} style={[styles.dockItemText, { fontSize: !docksExpanded && compactTopBar ? 12 : fBody, lineHeight: !docksExpanded && compactTopBar ? 16 : fBodyLine }, selected && tab.id !== 'policy' && styles.dockItemTextActive]}>
                      {tab.id === 'action' ? '动作 ▾' : tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!docksExpanded ? (
              <>
                <View style={[styles.dockDivider, { height: sp(16) }]} />
                {ControlHudDashboard({
                  expanded: false,
                  inlineCollapsed: true,
                  compactInline: compactTopBar,
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
        </View> : null}

        {settingsMenu ? (
          <View style={styles.settingsLayer} pointerEvents="box-none">
            <Pressable
              accessibilityLabel="关闭操控设置背景"
              accessibilityRole="button"
              onPress={event => {
                if (event.target === event.currentTarget) {
                  onCloseSettings?.();
                }
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
              <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(12), maxWidth: feedbackMaxW, paddingHorizontal: sp(14), paddingVertical: sp(6) }]} testID="control-operation-feedback">
                <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{feedback}</Text>
              </View>
            ) : null}
            {hudNotice ? (
              <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(12), maxWidth: feedbackMaxW, paddingHorizontal: sp(14), paddingVertical: sp(6) }]} testID="control-hud-notice">
                <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{hudNotice}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {confirmation}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'transparent', flex: 1, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  media: { ...StyleSheet.absoluteFill },
  topScrim: { backgroundColor: 'rgba(8, 10, 11, 0.16)', height: 52, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  safeChrome: { position: 'absolute', zIndex: 2 },
  guideBar: { backgroundColor: 'rgba(0, 0, 0, 0.58)', position: 'absolute', zIndex: 12 },
  guideTop: { left: 0, right: 0, top: 0, borderBottomWidth: 1, borderBottomColor: ISLAND_BORDER },
  guideRight: { bottom: 0, right: 0, top: 0, borderLeftWidth: 1, borderLeftColor: ISLAND_BORDER },
  guideBottom: { bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: ISLAND_BORDER },
  guideLeft: { bottom: 0, left: 0, top: 0, borderRightWidth: 1, borderRightColor: ISLAND_BORDER },
  header: { left: 10, position: 'absolute', right: 10, top: 8, zIndex: 12 },
  topBarRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 38 },

  islandLeft: {
    alignItems: 'center',
    backgroundColor: ISLAND_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    minHeight: 34,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  identityTrigger: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 6, minWidth: 0 },
  connectionDot: { backgroundColor: '#737B80', borderRadius: 4, height: 7, width: 7 },
  connectedDot: { backgroundColor: EMERALD_DOT },
  readonlyDot: { backgroundColor: '#F59E0B' },
  identityText: { color: INK, flexShrink: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  connPillBadge: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  connPillText: { color: '#D4DBE0', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  reconnectPillBtn: { alignItems: 'center', backgroundColor: ACTIVE_BLUE, borderColor: 'rgba(147, 197, 253, 0.52)', borderWidth: 1, flexDirection: 'row' },
  reconnectPillText: { color: '#FFFFFF', fontWeight: '600' },
  chip: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.10)', borderRadius: 6, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { color: '#E2E8EE', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  islandDivider: { backgroundColor: 'rgba(255, 255, 255, 0.14)', height: 14, width: 1 },
  islandNavBtn: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 3, minHeight: 28, paddingHorizontal: 6 },
  islandNavBtnActive: { backgroundColor: 'rgba(59, 110, 246, 0.34)' },
  islandNavText: { color: INK, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  islandNavTextActive: { color: '#FFFFFF', fontWeight: '600' },
  settingsLayer: { bottom: 0, elevation: 30, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 30 },
  settingsBackdrop: { backgroundColor: 'rgba(6, 10, 9, 0.46)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 0 },
  hiddenStickFrame: { opacity: 0 },
  dashboardOverlay: { ...StyleSheet.absoluteFill, zIndex: 7 },
  hiddenBehindPopover: { opacity: 0 },

  islandCenter: {
    alignItems: 'center',
    backgroundColor: ISLAND_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  modeMiniBtn: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  modeMiniText: { color: '#C5CED4', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  terrainTrack: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 999, flexDirection: 'row', gap: 2 },
  terrainSegBtn: { alignItems: 'center', borderRadius: 999, justifyContent: 'center', minHeight: 28, paddingHorizontal: 11 },
  terrainSegBtnSelected: { backgroundColor: PILL_WHITE },
  terrainSegText: { color: '#B8C0C4', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  terrainSegTextSelected: { color: PILL_DARK_INK, fontWeight: '600' },
  speedPillBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  speedPillBtnActive: { backgroundColor: ACTIVE_BLUE },
  speedPillText: { color: INK, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 18 },

  islandRight: {
    alignItems: 'center',
    backgroundColor: ISLAND_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
    minHeight: 34,
    minWidth: 0,
    overflow: 'hidden',
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  telemetryCluster: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 6, minWidth: 0, overflow: 'hidden' },
  telemetryItem: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 4 },
  telemetryText: { color: '#DCE3E8', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '500', lineHeight: 18 },
  faultBadgeBtn: {
    alignItems: 'center',
    backgroundColor: '#EF4444',
    borderColor: '#FCA5A5',
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 5,
  },
  faultBadgeBtnActive: { borderColor: '#FFFFFF', borderWidth: 1.5 },
  faultBadgeText: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 16 },
  recordingBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.28)',
    borderColor: 'rgba(248, 113, 113, 0.72)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recordingDot: { backgroundColor: '#EF4444', borderRadius: 3.5, height: 7, width: 7 },
  recordingBadgeText: { color: '#FEE2E2', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 16 },
  stop: {
    alignItems: 'center',
    backgroundColor: CRIMSON_STOP,
    borderRadius: 999,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 66,
    paddingHorizontal: 12,
  },
  stopDisabled: { backgroundColor: CRIMSON_DISABLED, opacity: 0.72 },
  stopRing: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 12,
    justifyContent: 'center',
    width: 12,
  },
  stopCore: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 4, width: 4 },
  stopText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', lineHeight: 19 },

  speedBarFloating: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: DOCK_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 34,
    marginTop: 6,
    paddingHorizontal: 12,
  },
  speedBarLabel: { color: INK, fontSize: 11, fontWeight: '600' },
  speedModeSegment: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)', flexDirection: 'row' },
  speedModeChip: { alignItems: 'center', justifyContent: 'center' },
  speedModeChipActive: { backgroundColor: PILL_WHITE },
  speedModeChipHighActive: { backgroundColor: '#F59E0B' },
  speedModeChipText: { color: '#B8C0C4', fontVariant: ['tabular-nums'], fontWeight: '600' },
  speedModeChipTextActive: { color: PILL_DARK_INK, fontWeight: '700' },
  speedModeChipTextHigh: { color: '#111416', fontWeight: '700' },
  speedStepBtn: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
  speedTrack: { backgroundColor: 'rgba(255, 255, 255, 0.18)', borderRadius: 3, height: 6, overflow: 'hidden', width: 72 },
  speedFill: { backgroundColor: ACTIVE_BLUE, borderRadius: 3, height: '100%' },
  speedBarValue: { color: '#FFFFFF', fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '600', minWidth: 34, textAlign: 'right' },

  emptyVideo: { alignItems: 'center', backgroundColor: '#0A0C0B', bottom: 0, gap: 5, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  emptyIcon: { alignItems: 'center', backgroundColor: '#1C201E', borderRadius: 12, height: 42, justifyContent: 'center', marginBottom: 4, width: 42 },
  emptyTitle: { color: INK, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyDetail: { color: '#BDBFB8', fontSize: 12, textAlign: 'center' },
  stickFrame: { left: 16, position: 'absolute', right: 16, zIndex: 3 },
  centerStack: { position: 'absolute', top: 82, zIndex: 4 },

  pipWindow: {
    backgroundColor: '#0A0D0C',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 12,
    borderWidth: 1,
    height: 104,
    overflow: 'hidden',
    position: 'absolute',
    right: 10,
    top: 52,
    width: 184,
    zIndex: 6,
  },
  pipPlaceholder: { alignItems: 'center', flex: 1, gap: 4, justifyContent: 'center' },
  pipPlaceholderText: { color: MUTED, fontSize: 10, fontWeight: '600' },
  pipHeaderRow: { left: 6, position: 'absolute', top: 6 },
  pipBadge: { backgroundColor: 'rgba(14, 18, 20, 0.68)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pipBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },

  rightRail: { alignItems: 'flex-end', gap: 6, position: 'absolute', right: 10, top: 52, zIndex: 6 },
  leftVoiceRail: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, position: 'absolute', left: 10, top: 52, zIndex: 6 },
  rightRailWithPip: { top: 162 },
  circleToolRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  circleBtnGroup: { alignItems: 'center', gap: 3 },
  circleBtn: {
    alignItems: 'center',
    backgroundColor: ISLAND_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  circleBtnActive: { backgroundColor: 'rgba(59, 110, 246, 0.68)', borderColor: '#93C5FD' },
  circleBtnRelative: { position: 'relative' },
  voiceDotHalo: { alignItems: 'center', borderRadius: 6, height: 11, justifyContent: 'center', position: 'absolute', right: 2, top: 2, width: 11 },
  voiceDotCore: { borderRadius: 3.5, height: 6.5, width: 6.5 },
  voiceEmotionBadge: { color: '#93C5FD', fontWeight: '600' },
  voiceReminderBadge: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 7, height: 14, justifyContent: 'center', left: -2, minWidth: 14, paddingHorizontal: 3, position: 'absolute', top: -2 },
  voiceReminderBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700', lineHeight: 12 },
  circleCaption: { color: '#E2E8EE', fontSize: 10, fontWeight: '600', lineHeight: 13 },
  secondaryUtilityStrip: {
    alignItems: 'center',
    backgroundColor: ISLAND_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  utilityMiniPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 3, paddingHorizontal: 7, paddingVertical: 3 },
  utilityMiniPillActive: { backgroundColor: 'rgba(59, 110, 246, 0.45)' },
  utilityMiniPillDanger: { backgroundColor: 'rgba(220, 38, 38, 0.65)' },
  utilityMiniText: { color: '#DCE3E8', fontSize: 10, fontWeight: '600', lineHeight: 13 },

  bottomDockContainer: { alignItems: 'center', bottom: 8, left: 0, position: 'absolute', right: 0, zIndex: 6 },
  drawerPopover: {
    backgroundColor: DOCK_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    maxWidth: 440,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  drawerWrap: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  drawerPillBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  drawerPillBtnActive: { backgroundColor: ACTIVE_BLUE, borderColor: '#93C5FD' },
  drawerPillPending: { borderStyle: 'dashed' },
  drawerPillText: { color: INK, fontSize: 12, fontWeight: '600', lineHeight: 15 },
  drawerPillTextActive: { color: '#FFFFFF' },
  pendingTag: { color: MUTED, fontSize: 9, lineHeight: 12 },

  bottomDockBar: {
    alignItems: 'center',
    backgroundColor: DOCK_BG,
    borderColor: ISLAND_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dockMotorBtn: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 30, paddingHorizontal: 4 },
  motorDot: { borderRadius: 4, height: 8, width: 8 },
  motorDotArmed: { backgroundColor: EMERALD_DOT },
  motorDotOff: { backgroundColor: '#737B80' },
  dockMotorText: { color: INK, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  dockMotorTextArmed: { color: EMERALD_INK },
  motorDisablePill: { backgroundColor: 'rgba(255, 255, 255, 0.09)', borderColor: 'rgba(255, 255, 255, 0.14)', borderRadius: 999, borderWidth: 1 },
  motorDisableSub: { color: '#CBD5E1', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  dockDivider: { backgroundColor: 'rgba(255, 255, 255, 0.14)', height: 16, width: 1 },
  dockPostureGroup: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  dockItemBtn: { borderRadius: 999, minHeight: 28, justifyContent: 'center', paddingHorizontal: 9 },
  dockItemBtnActive: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  dockItemText: { color: '#DCE3E8', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  dockItemTextActive: { color: '#FFFFFF', fontWeight: '600' },
  dockCategories: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  dockCatBtn: { borderRadius: 999, justifyContent: 'center', minHeight: 28, paddingHorizontal: 8 },
  dockCatBtnActive: { backgroundColor: ACTIVE_BLUE },

  floatingPanelsOverlay: {
    bottom: 112,
    left: '50%',
    position: 'absolute',
    top: 48,
    transform: [{ translateX: -175 }],
    width: 350,
    zIndex: 8,
  },
  floatingPanelsScroll: { maxHeight: '100%' },
  floatingPanelsContent: { gap: 8, paddingBottom: 8 },
  disabled: { opacity: 0.42 },
  toastLane: { alignItems: 'center', gap: 6, left: 0, position: 'absolute', right: 0, top: 52, zIndex: 9 },
  feedback: { alignItems: 'center', alignSelf: 'center', backgroundColor: ISLAND_BG, borderColor: ISLAND_BORDER, borderRadius: 12, borderWidth: 1, maxWidth: 320, paddingHorizontal: 14, paddingVertical: 6 },
  noticeStacked: { top: 90 },
  feedbackText: { color: INK, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
