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
import { FaultListPanel, JointParametersPanel, JointTemperaturePanel } from './ControlHudPanels';
import {
  collectHudFaults,
  HUD_BASIC_ACTIONS,
  projectJointTemperatures,
  projectTopSignalBadges,
  type HudCameraPosition,
  type HudForwardDirection,
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
  gestures?: readonly Readonly<{ name: string; label: string }>[];
  gestureDisabled?: boolean;
  gestureHint?: string;
  onPlayGesture?: (name: string) => void;
  speedLimitPercent: number;
  speedLimitExpanded: boolean;
  onToggleSpeedLimitExpanded: () => void;
  onChangeSpeedLimit: (nextPercent: number) => void;
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

function Chip({ children, testID, sp }: { children: ReactNode; testID?: string; sp: (value: number) => number }) {
  return <View style={[styles.chip, { borderRadius: sp(6), gap: sp(3), paddingHorizontal: sp(6), paddingVertical: sp(2) }]} testID={testID}>{children}</View>;
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
  gestureDisabled = true,
  gestureHint,
  onPlayGesture,
  speedLimitPercent,
  speedLimitExpanded,
  onToggleSpeedLimitExpanded,
  onChangeSpeedLimit,
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
  const rawRatio = stageWidth && stageHeight && stageWidth > 0 && stageHeight > 0
    ? Math.min(stageWidth / 960, stageHeight / 540)
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
  const pipW = stageWidth && stageWidth > 0
    ? Math.max(180, Math.min(288, Math.round(stageWidth * 0.19)))
    : sp(196);
  const pipH = Math.round((pipW * 9) / 16);
  const pipTop = sp(64);
  const overlayW = Math.min(440, Math.max(350, Math.round((stageWidth || 960) * 0.44)));
  const centerStackInset = Math.round((joystickSize || 220) + sp(24));
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
  const anyFloatingPanel = (faultPanelOpen && faults.length > 0) || jointParamsOpen || jointTempOpen || Boolean(recovery);
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
        <View style={[styles.header, { left: sp(18), right: sp(18), top: sp(14) }]} pointerEvents="box-none">
          <View style={[styles.topBarRow, { gap: sp(10), minHeight: sp(40) }]} pointerEvents="box-none" testID="control-hud-status-bar">
            {/* Island 1 (Top-Left): Identity + Connection + Auth + Status + Control Settings + Workspace Settings */}
            <View style={[styles.islandLeft, { gap: sp(7), minHeight: sp(40), paddingHorizontal: sp(13), paddingVertical: sp(4) }]} pointerEvents="box-none">
              <Pressable
                accessibilityLabel={'设备连接' + connectionLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: !onOpenConnection }}
                disabled={!onOpenConnection}
                onPress={onOpenConnection}
                style={({ pressed }) => [styles.identityTrigger, { gap: sp(7) }, pressed && styles.pressed]}
                testID="control-open-connection"
              >
                <View style={[styles.connectionDot, { borderRadius: sp(4), height: sp(8), width: sp(8) }, connection === 'connected' ? styles.connectedDot : connection === 'readonly' ? styles.readonlyDot : null]} testID="control-hud-connection-dot" />
                <Text numberOfLines={1} style={[styles.identityText, { fontSize: fTitle, lineHeight: fTitleLine }]}>{robotName}</Text>
                <View style={[styles.connPillBadge, { borderRadius: sp(6), paddingHorizontal: sp(7), paddingVertical: sp(2) }]}>
                  <Text numberOfLines={1} style={[styles.connPillText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{connectionLabel}</Text>
                </View>
              </Pressable>

              {showLocalControl ? (
                <Chip sp={sp} testID="control-hud-local-control">
                  <Text style={[styles.chipText, { fontSize: fMeta, lineHeight: fMetaLine }]}>本设备控制</Text>
                </Chip>
              ) : null}
              {showUnlocked ? (
                <Chip sp={sp} testID="control-hud-unlocked">
                  <Ionicons color={EMERALD_INK} name="lock-open-outline" size={sp(12)} />
                  <Text style={[styles.chipText, { fontSize: fMeta, lineHeight: fMetaLine }]}>设备已解锁</Text>
                </Chip>
              ) : null}

              <View style={[styles.islandDivider, { height: sp(16) }]} />

              <Pressable
                accessibilityLabel="状态"
                accessibilityRole="button"
                onPress={onOpenJointStatus ?? onBack}
                style={({ pressed }) => [styles.islandNavBtn, { gap: sp(5), minHeight: sp(32), paddingHorizontal: sp(9) }, pressed && styles.pressed]}
                testID="control-hud-open-status"
              >
                <Ionicons color={INK} name="pulse-outline" size={sp(14)} />
                <Text style={[styles.islandNavText, { fontSize: fBody, lineHeight: fBodyLine }]}>状态</Text>
              </Pressable>

              <Pressable
                accessibilityLabel={settingsLabel}
                accessibilityRole="button"
                accessibilityState={{ expanded: settingsOpen }}
                onPress={onOpenSettings}
                style={({ pressed }) => [styles.islandNavBtn, { gap: sp(5), minHeight: sp(32), paddingHorizontal: sp(9) }, settingsOpen && styles.islandNavBtnActive, pressed && styles.pressed]}
                testID="control-hud-settings"
              >
                <Ionicons color={settingsOpen ? '#93C5FD' : INK} name="options-outline" size={sp(14)} />
                <Text style={[styles.islandNavText, { fontSize: fBody, lineHeight: fBodyLine }, settingsOpen && styles.islandNavTextActive]}>操控</Text>
              </Pressable>

              {onOpenWorkspaceSettings ? (
                <Pressable
                  accessibilityLabel="设置"
                  accessibilityRole="button"
                  onPress={onOpenWorkspaceSettings}
                  style={({ pressed }) => [styles.islandNavBtn, { gap: sp(5), minHeight: sp(32), paddingHorizontal: sp(9) }, pressed && styles.pressed]}
                  testID="control-hud-open-workspace-settings"
                >
                  <Ionicons color={INK} name="settings-outline" size={sp(14)} />
                  <Text style={[styles.islandNavText, { fontSize: fBody, lineHeight: fBodyLine }]}>设置</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Island 2 (Top-Center): Mode + Segmented Terrain Capsules + Speed Chip */}
            <View style={[styles.islandCenter, { gap: sp(6), minHeight: sp(40), paddingHorizontal: sp(7), paddingVertical: sp(4) }]} pointerEvents="box-none">
              <Pressable
                accessibilityLabel={recoveryModeSelected ? '恢复模式' : '常规模式，切换左侧控制组'}
                accessibilityRole="button"
                onPress={cycleLeftCategory}
                style={({ pressed }) => [styles.modeMiniBtn, { paddingHorizontal: sp(8), paddingVertical: sp(4) }, pressed && styles.pressed]}
                testID="control-hud-mode-header"
              >
                <Ionicons color="#C5CED4" name={recoveryModeSelected ? 'medkit-outline' : 'apps-outline'} size={sp(14)} />
              </Pressable>

              <View style={[styles.terrainTrack, { gap: sp(2), padding: 2 }]}>
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
                      { minHeight: sp(30), paddingHorizontal: sp(14) },
                      option.selected && styles.terrainSegBtnSelected,
                      option.disabled && !option.selected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-hud-terrain-capsule-${option.id}`}
                  >
                    <Text numberOfLines={1} style={[styles.terrainSegText, { fontSize: fBody, lineHeight: fBodyLine }, option.selected && styles.terrainSegTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.islandDivider, { height: sp(16) }]} />

              <Pressable
                accessibilityLabel={`调节速度限制，当前 ${speedLimitClamped}%`}
                accessibilityRole="button"
                accessibilityState={{ expanded: speedLimitExpanded }}
                onPress={onToggleSpeedLimitExpanded}
                style={({ pressed }) => [
                  styles.speedPillBtn,
                  { minHeight: sp(30), paddingHorizontal: sp(12) },
                  (speedLimitExpanded || speedLimitClamped < 100) && styles.speedPillBtnActive,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-speed-limit-toggle"
              >
                <Text style={[styles.speedPillText, { fontSize: fBody, lineHeight: fBodyLine }]}>
                  {speedLimitClamped < 100 ? `${speedLimitClamped}%` : '1.0 m/s'}
                </Text>
              </Pressable>
            </View>

            {/* Island 3 (Top-Right): Signal / Voltage / Thermal Telemetry + Guarded Crimson E-Stop */}
            <View style={[styles.islandRight, { gap: sp(10), minHeight: sp(40), paddingLeft: sp(13), paddingRight: sp(5), paddingVertical: sp(4) }]} pointerEvents="box-none" testID="control-telemetry">
              {faults.length > 0 ? (
                <Pressable
                  accessibilityLabel={`异常列表，共 ${faults.length} 项`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: faultPanelOpen }}
                  onPress={onToggleFaultPanel}
                  style={({ pressed }) => [styles.faultBadgeBtn, { borderRadius: sp(12), height: sp(24), minWidth: sp(24), paddingHorizontal: sp(6) }, faultPanelOpen && styles.faultBadgeBtnActive, pressed && styles.pressed]}
                  testID="control-hud-fault-badge"
                >
                  <Text style={[styles.faultBadgeText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{faults.length > 1 ? String(faults.length) : '!'}</Text>
                </Pressable>
              ) : null}

              {signals.cellularVisible ? (
                <View accessible accessibilityLabel={`移动数据 ${signals.cellularText}`} style={[styles.telemetryItem, { gap: sp(4) }]} testID="control-hud-cellular">
                  <Ionicons color={INK} name="cellular" size={sp(14)} />
                  <Text style={[styles.telemetryText, { fontSize: fBody, lineHeight: fBodyLine }]}>{signals.cellularText}</Text>
                </View>
              ) : null}

              {signals.robotVisible ? (
                <View accessible accessibilityLabel={`机器人信号 ${signals.robotText}`} style={[styles.telemetryItem, { gap: sp(4) }]} testID="control-hud-robot-signal">
                  <Ionicons color="#7DD3FC" name="hardware-chip-outline" size={sp(14)} />
                  <Text style={[styles.telemetryText, { fontSize: fBody, lineHeight: fBodyLine }]}>{signals.robotText}</Text>
                </View>
              ) : null}

              {signals.wifiVisible ? (
                <View accessible accessibilityLabel={`WiFi ${signals.wifiText}`} style={[styles.telemetryItem, { gap: sp(4) }]} testID="control-hud-wifi-signal">
                  <Ionicons color={EMERALD_INK} name="wifi" size={sp(14)} />
                  <Text style={[styles.telemetryText, { fontSize: fBody, lineHeight: fBodyLine }]}>{signals.wifiText}</Text>
                </View>
              ) : null}

              {inlineVoltageText || inlineBatteryText ? (
                <Text style={[styles.telemetryText, { fontSize: fBody, lineHeight: fBodyLine }]}>
                  {[inlineVoltageText, inlineBatteryText].filter(Boolean).join(' · ')}
                </Text>
              ) : null}

              {inlineTempText ? (
                <Text style={[styles.telemetryText, { fontSize: fBody, lineHeight: fBodyLine }]}>{inlineTempText}</Text>
              ) : null}

              {recordingActive ? (
                <View accessible accessibilityLabel={`正在录制视频 ${recordingDurationLabel ?? ''}`} style={[styles.recordingBadge, { gap: sp(4), paddingHorizontal: sp(8), paddingVertical: sp(3) }]} testID="control-hud-recording-badge">
                  <View style={[styles.recordingDot, { borderRadius: sp(3.5), height: sp(7), width: sp(7) }]} />
                  <Text style={[styles.recordingBadgeText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{recordingDurationLabel ? `REC ${recordingDurationLabel}` : 'REC'}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityHint={stopHint}
                accessibilityLabel="软件急停"
                accessibilityRole="button"
                accessibilityState={{ disabled: stopDisabled }}
                disabled={stopDisabled}
                onPress={onStop}
                style={({ pressed }) => [styles.stop, { gap: sp(6), minHeight: sp(32), minWidth: sp(74), paddingHorizontal: sp(14) }, stopDisabled && styles.stopDisabled, pressed && !stopDisabled && styles.pressed]}
                testID="control-hud-stop"
              >
                <View style={[styles.stopRing, { borderRadius: sp(7), height: sp(14), width: sp(14) }]}>
                  <View style={[styles.stopCore, { borderRadius: sp(2.5), height: sp(5), width: sp(5) }]} />
                </View>
                <Text style={[styles.stopText, { fontSize: fTitle, lineHeight: fTitleLine }]}>急停</Text>
              </Pressable>
            </View>
          </View>

          {speedLimitExpanded ? (
            <View style={[styles.speedBarFloating, { gap: sp(8), height: sp(38), marginTop: sp(8), paddingHorizontal: sp(15) }]} testID="control-hud-speed-limit-bar">
              <Text style={[styles.speedBarLabel, { fontSize: fMeta, lineHeight: fMetaLine }]}>调节速度限制</Text>
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
          pointerEvents={settingsMenu ? 'none' : 'box-none'}
          style={[styles.stickFrame, stickFrameStyle, settingsMenu ? styles.hiddenStickFrame : null]}
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

        {/* Upper-Right Dual Camera / Depth PiP Window */}
        {dualCameraEnabled && !settingsMenu ? (
          <Pressable
            accessibilityLabel={`第二相机视角（${depthActive ? '深度图' : showMainFront ? '后视角' : '前视角'}），点击互换主画面`}
            accessibilityRole="button"
            onPress={onSwapCamera}
            style={({ pressed }) => [styles.pipWindow, { borderRadius: sp(12), height: pipH, right: sp(18), top: pipTop, width: pipW }, pressed && styles.pressed]}
            testID="control-hud-pip-window"
          >
            {depthActive && depthPreview ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{depthPreview}</View>
            ) : secondaryPipFeed ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>{secondaryPipFeed}</View>
            ) : (
              <View pointerEvents="none" style={[styles.pipPlaceholder, { gap: sp(4) }]} testID="control-hud-pip-placeholder">
                <Ionicons color={MUTED} name="videocam-off-outline" size={sp(20)} />
              </View>
            )}
            <View pointerEvents="none" style={[styles.pipHeaderRow, { left: sp(8), top: sp(8) }]}>
              <View style={[styles.pipBadge, { borderRadius: sp(6), paddingHorizontal: sp(8), paddingVertical: sp(3) }]}>
                <Text style={[styles.pipBadgeText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{depthActive ? '深度图 ⇄' : showMainFront ? '后广角 ⇄' : '前视角 ⇄'}</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* Concept A-1 Circular Glass Tool Buttons Directly Below PiP */}
        {!settingsMenu ? <View pointerEvents="box-none" style={[styles.rightRail, { alignItems: 'center' as const, gap: sp(12), right: sp(18), top: dualCameraEnabled ? pipTop + pipH + sp(12) : pipTop, width: pipW }]} testID="control-hud-camera-rail">
          <View style={[styles.circleToolRow, { justifyContent: 'space-around' as const, width: '100%' }]}>
            <Pressable
              accessibilityLabel={dualCameraEnabled ? '关闭双广角，切为单广角' : '开启双广角'}
              accessibilityRole="button"
              accessibilityState={{ selected: dualCameraEnabled }}
              onPress={onToggleDualCamera}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(4) }, pressed && styles.pressed]}
              testID="control-hud-camera-count-toggle"
            >
              <View style={[styles.circleBtn, { borderRadius: sp(20), height: sp(40), width: sp(40) }, dualCameraEnabled && styles.circleBtnActive]}>
                <Ionicons color={INK} name={dualCameraEnabled ? 'albums-outline' : 'square-outline'} size={sp(18)} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: fMetaLine }]}>双摄</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={depthActive ? '关闭深度图叠层' : '开启深度图预览'}
              accessibilityRole="button"
              accessibilityState={{ selected: depthActive }}
              onPress={onToggleDepth}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(4) }, pressed && styles.pressed]}
              testID="control-hud-depth-toggle"
            >
              <View style={[styles.circleBtn, { borderRadius: sp(20), height: sp(40), width: sp(40) }, depthActive && styles.circleBtnActive]}>
                <Ionicons color={INK} name="radio-button-on-outline" size={sp(18)} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: fMetaLine }]}>深度</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="拍照保存画面"
              accessibilityRole="button"
              onPress={onCapturePhoto}
              style={({ pressed }) => [styles.circleBtnGroup, { gap: sp(4) }, pressed && styles.pressed]}
              testID="control-hud-photo-capture"
            >
              <View style={[styles.circleBtn, { borderRadius: sp(20), height: sp(40), width: sp(40) }]}>
                <Ionicons color={INK} name="camera-outline" size={sp(18)} />
              </View>
              <Text style={[styles.circleCaption, { fontSize: fMeta, lineHeight: fMetaLine }]}>抓拍</Text>
            </Pressable>
          </View>

          <View style={[styles.secondaryUtilityStrip, { gap: sp(3), justifyContent: 'space-between' as const, paddingHorizontal: sp(6), paddingVertical: sp(3), width: '100%' }]}>
            <Pressable
              accessibilityLabel={`切换相机视角，当前${showMainFront ? '前视角' : '后视角'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: !showMainFront }}
              onPress={onSwapCamera}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: sp(4), justifyContent: 'center' as const, paddingHorizontal: sp(6), paddingVertical: sp(4) }, !showMainFront && styles.utilityMiniPillActive, pressed && styles.pressed]}
              testID="control-hud-camera-swap"
            >
              <Ionicons color={INK} name="camera-reverse-outline" size={sp(13)} />
              <Text style={[styles.utilityMiniText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{showMainFront ? '前视' : '后视'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={headlightMode === 'off' ? '前照明灯：关闭' : headlightMode === 'front' ? '前照明灯：前灯开启' : '前照明灯：前后开启'}
              accessibilityRole="button"
              accessibilityState={{ selected: headlightMode !== 'off' }}
              onPress={onToggleHeadlight}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: sp(4), justifyContent: 'center' as const, paddingHorizontal: sp(6), paddingVertical: sp(4) }, headlightMode !== 'off' && styles.utilityMiniPillActive, pressed && styles.pressed]}
              testID="control-hud-light-toggle"
            >
              <Ionicons color={headlightMode !== 'off' ? EMERALD_INK : INK} name="flashlight-outline" size={sp(13)} />
              <Text style={[styles.utilityMiniText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{headlightMode === 'off' ? '车灯' : headlightMode === 'front' ? '前灯' : '双灯'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={recordingActive ? '结束录屏' : '开始录屏'}
              accessibilityRole="button"
              accessibilityState={{ selected: recordingActive }}
              onPress={onToggleRecord}
              style={({ pressed }) => [styles.utilityMiniPill, { flex: 1, gap: sp(4), justifyContent: 'center' as const, paddingHorizontal: sp(6), paddingVertical: sp(4) }, recordingActive && styles.utilityMiniPillDanger, pressed && styles.pressed]}
              testID="control-hud-record-toggle"
            >
              <Ionicons color={INK} name={recordingActive ? 'stop-circle-outline' : 'videocam-outline'} size={sp(13)} />
              <Text style={[styles.utilityMiniText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{recordingActive && recordingDurationLabel ? `录屏 ${recordingDurationLabel}` : '录屏'}</Text>
            </Pressable>
          </View>
        </View> : null}

        {/* Floating Joint Params / Joint Temp / Faults / Recovery */}
        {anyFloatingPanel && !settingsMenu ? (
          <View pointerEvents="box-none" style={[styles.floatingPanelsOverlay, { bottom: sp(116), top: sp(64) + (feedback ? sp(46) : 0) + (hudNotice ? sp(46) : 0), transform: [{ translateX: -Math.round(overlayW / 2) }], width: overlayW }]} testID="control-hud-overlay-stack">
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
              }) : null}
              {jointTempOpen ? JointTemperaturePanel({
                moduleKind: tempModuleKind,
                onSelectModule: onTempModuleKindChange,
                joints,
                onClose: onToggleJointTemp,
              }) : null}
            </ScrollView>
          </View>
        ) : null}

        {/* Expanded Dashboard Floats Above Concept A-1 Obsidian Bottom Dock */}
        {docksExpanded && !settingsMenu ? ControlHudDashboard({
          expanded: true,
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
        }) : null}

        {/* Concept A-1 Bottom-Center Floating Obsidian Pill Dock + Popover */}
        {!settingsMenu ? <View pointerEvents="box-none" style={[styles.bottomDockContainer, { bottom: sp(14) }]} testID="control-hud-left-controls">
          {leftCategory !== 'policy' ? (
            <View style={[styles.drawerPopover, { borderRadius: sp(16), marginBottom: sp(8), maxWidth: sp(480), paddingHorizontal: sp(12), paddingVertical: sp(9) }]}>
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
                  {gestures.length > 0 ? gestures.map(item => (
                    <Pressable
                      key={item.name}
                      accessibilityHint={gestureDisabled ? gestureHint : undefined}
                      accessibilityLabel={item.label}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: gestureDisabled }}
                      disabled={gestureDisabled}
                      onPress={() => onPlayGesture?.(item.name)}
                      style={({ pressed }) => [
                        styles.drawerPillBtn,
                        { gap: sp(5), minHeight: sp(32), paddingHorizontal: sp(13), paddingVertical: sp(4) },
                        gestureDisabled && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID={`control-hud-gesture-${item.name}`}
                    >
                      <Text numberOfLines={1} style={[styles.drawerPillText, { fontSize: fBody, lineHeight: fBodyLine }]}>{item.label}</Text>
                    </Pressable>
                  )) : HUD_BASIC_ACTIONS.map(item => {
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

          <View style={[styles.bottomDockBar, { gap: sp(8), minHeight: sp(44), paddingHorizontal: sp(14), paddingVertical: sp(5) }]}>
            <Pressable
              accessibilityHint={motorHint}
              accessibilityLabel={motorEnabled ? '失能电机' : '使能电机'}
              accessibilityRole="switch"
              accessibilityState={{ checked: motorEnabled === true, disabled: motorDisabled || motorBusy, busy: motorBusy }}
              disabled={motorDisabled || motorBusy}
              onPress={onToggleMotor}
              style={({ pressed }) => [
                styles.dockMotorBtn,
                { gap: sp(6), minHeight: sp(32), paddingHorizontal: sp(4) },
                (motorDisabled || motorBusy) && styles.disabled,
                pressed && styles.pressed,
              ]}
              testID="control-hud-motor-power"
            >
              <View style={[styles.motorDot, { borderRadius: sp(4), height: sp(8), width: sp(8) }, motorEnabled ? styles.motorDotArmed : styles.motorDotOff]} />
              <Text style={[styles.dockMotorText, { fontSize: fBody, lineHeight: fBodyLine }, motorEnabled && styles.dockMotorTextArmed]}>
                {motorEnabled ? '电机已使能' : '使能电机'}
              </Text>
              {motorEnabled ? (
                <View style={[styles.motorDisablePill, { paddingHorizontal: sp(8), paddingVertical: sp(2) }]}>
                  <Text style={[styles.motorDisableSub, { fontSize: fMeta, lineHeight: fMetaLine }]}>失能电机</Text>
                </View>
              ) : null}
            </Pressable>

            <View style={[styles.dockDivider, { height: sp(16) }]} />

            <View style={[styles.dockPostureGroup, { gap: sp(4) }]} testID="control-hud-quick-posture">
              <Pressable
                accessibilityHint={standOption?.hint}
                accessibilityLabel="起立"
                accessibilityRole="button"
                accessibilityState={{ disabled: standOption?.disabled ?? true, selected: standOption?.selected ?? false }}
                disabled={standOption?.disabled ?? true}
                onPress={() => standOption?.onPress()}
                style={({ pressed }) => [
                  styles.dockItemBtn,
                  { minHeight: sp(30), paddingHorizontal: sp(10) },
                  standOption?.selected && styles.dockItemBtnActive,
                  (standOption?.disabled ?? true) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-quick-stand"
              >
                <Text style={[styles.dockItemText, { fontSize: fBody, lineHeight: fBodyLine }, standOption?.selected && styles.dockItemTextActive]}>站立</Text>
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
                  { minHeight: sp(30), paddingHorizontal: sp(10) },
                  sitOption?.selected && styles.dockItemBtnActive,
                  (sitOption?.disabled ?? true) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-hud-quick-sit"
              >
                <Text style={[styles.dockItemText, { fontSize: fBody, lineHeight: fBodyLine }, sitOption?.selected && styles.dockItemTextActive]}>坐下</Text>
              </Pressable>
            </View>

            <View style={[styles.dockDivider, { height: sp(16) }]} />

            <View style={[styles.dockCategories, { gap: sp(2) }]} testID="control-hud-left-category-tabs">
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
                      { minHeight: sp(30), paddingHorizontal: sp(10) },
                      selected && tab.id !== 'policy' && styles.dockCatBtnActive,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-hud-category-${tab.id}`}
                  >
                    <Text style={[styles.dockItemText, { fontSize: fBody, lineHeight: fBodyLine }, selected && tab.id !== 'policy' && styles.dockItemTextActive]}>
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
          <Pressable
            accessibilityLabel="关闭操控设置背景"
            accessibilityRole="button"
            onPress={onCloseSettings}
            style={styles.settingsBackdrop}
            testID="control-settings-background"
          />
        ) : null}
        {settingsMenu}
        {feedback ? (
          <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(12), paddingHorizontal: sp(16), paddingVertical: sp(8), top: sp(64) }]} testID="control-operation-feedback">
            <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{feedback}</Text>
          </View>
        ) : null}
        {hudNotice ? (
          <View pointerEvents="none" style={[styles.feedback, { borderRadius: sp(12), paddingHorizontal: sp(16), paddingVertical: sp(8), top: sp(64) }, feedback ? { top: sp(110) } : null]} testID="control-hud-notice">
            <Text numberOfLines={2} style={[styles.feedbackText, { fontSize: fBody, lineHeight: fBodyLine }]}>{hudNotice}</Text>
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
    minHeight: 36,
    minWidth: 0,
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
  chip: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.10)', borderRadius: 6, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { color: '#E2E8EE', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  islandDivider: { backgroundColor: 'rgba(255, 255, 255, 0.14)', height: 14, width: 1 },
  islandNavBtn: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 3, minHeight: 28, paddingHorizontal: 6 },
  islandNavBtnActive: { backgroundColor: 'rgba(59, 110, 246, 0.34)' },
  islandNavText: { color: INK, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  islandNavTextActive: { color: '#FFFFFF', fontWeight: '600' },
  settingsBackdrop: { backgroundColor: 'rgba(6, 10, 9, 0.46)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 10 },
  hiddenStickFrame: { opacity: 0 },

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
    flexShrink: 0,
    gap: 8,
    minHeight: 36,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  telemetryItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
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
  feedback: { alignItems: 'center', backgroundColor: ISLAND_BG, borderColor: ISLAND_BORDER, borderRadius: 12, borderWidth: 1, left: '28%', paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: '28%', top: 52, zIndex: 9 },
  noticeStacked: { top: 90 },
  feedbackText: { color: INK, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
