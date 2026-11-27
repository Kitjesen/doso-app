import type { ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GestureDeckPanel } from './ControlHudPanels';
import {
  FsdDetentSlider,
  FsdRadarPulse,
  FsdSheetMotion,
  FsdSwitch,
  FsdTabReveal,
} from './FsdMotionPrimitives';
import { STANDBY_SCENES, normalizeStandbyScene } from './standbyScenes';
import type { HudForwardDirection, HudGestureCategoryId, HudGestureInput } from './controlHudModel';
import { Text, TextInput } from './AppText';
import type { ControlInputSource, ControlRuntimeState } from '../features/control/controlOperations';
import type { ControlAccentTone, StandbySceneId, VideoQualityPreset } from '../features/control/controlPreferences';
import { WifiDiscoveryPanel } from '../screens/WifiDiscoveryPanel';

export const controlHudColors = {
  ink: '#F2F2F2',
  muted: 'rgba(242, 242, 242, 0.72)',
  line: 'rgba(255, 255, 255, 0.09)',
  glass: 'rgba(24, 24, 24, 0.94)',
  blue: '#3E6AE1',
  green: '#34D399',
  red: '#EF4444',
};

export const controlSettingsColors = {
  ...controlHudColors,
  ink: '#F2F2F2',
  muted: '#9A9A9A',
  line: 'rgba(255, 255, 255, 0.08)',
  lineSoft: 'rgba(255, 255, 255, 0.06)',
  glass: 'rgba(24, 24, 24, 0.96)',
  sidebar: '#161616',
  surface: '#222222',
  surfaceElevated: '#2A2A2A',
  track: '#181818',
  pill: '#323232',
  graphiteAccent: '#EAEAEA',
  graphiteAccentInk: '#141414',
  blue: '#3E6AE1',
  blueBorder: 'rgba(147, 197, 253, 0.52)',
  blueSoft: 'rgba(62, 106, 225, 0.20)',
  green: '#34D399',
  canvas: 'rgba(12, 12, 12, 0.56)',
};

export type ControlSettingsSnapshot = Readonly<{
  sensitivity?: number;
  speedLimit?: number;
  mirrored?: boolean;
  lowLatency?: boolean;
  quality?: VideoQualityPreset;
  recording?: boolean;
  volume?: number;
  microphone?: boolean;
  wifiName?: string;
  firmware?: string;
  storageUsedGb?: number;
  storageTotalGb?: number;
  appVersion?: string;
}>;

export type ControlSettingsTab = '操控' | '图传与音频' | '连接与设备' | '机器狗维护' | '关于与隐私';
export type ControlSettingsCategory =
  | ControlSettingsTab
  | '通用'
  | '视频'
  | '音频'
  | '网络'
  | '机器人'
  | '安全'
  | '关于';
export type ControlSettingsSubview = 'tabs' | 'layout' | 'input' | 'privacy';

export function normalizeSettingsCategory(category: ControlSettingsCategory): ControlSettingsTab {
  switch (category) {
    case '操控':
    case '通用':
      return '操控';
    case '图传与音频':
    case '视频':
    case '音频':
      return '图传与音频';
    case '连接与设备':
    case '网络':
      return '连接与设备';
    case '机器狗维护':
    case '机器人':
    case '安全':
      return '机器狗维护';
    case '关于与隐私':
    case '关于':
      return '关于与隐私';
    default:
      return '操控';
  }
}

export type InlineConnectionSettingsProps = Readonly<{
  hostDraft: string;
  portDraft: string;
  onChangeHost: (value: string) => void;
  onChangePort: (value: string) => void;
  connected: boolean;
  readonlyConnected?: boolean;
  busy?: boolean;
  statusMessage?: string | null;
  lastSyncLabel?: string;
  firmwareVersion?: string;
  onConnectControl: () => void;
  onProbeReadOnly?: () => void;
  onDisconnect: () => void;
  onOpenAdvanced?: () => void;
  onOpenBle?: () => void;
}>;

export function DosoWordmark({ width = 92, color = controlHudColors.ink }: { width?: number; color?: string }) {
  return (
    <View accessible accessibilityLabel="DOSO" style={{ width, height: width / 4.4, overflow: 'hidden' }}>
      <Image
        source={require('../../assets/brand/doso-auth-lockup.png')}
        tintColor={color}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: width * 1.534,
          height: (width / 4.4) * 2.95,
          left: -width * 0.49,
          top: -(width / 4.4) * 1.02,
        }}
      />
    </View>
  );
}

export function PostureGlyph({ posture, size = 26, color = controlHudColors.ink }: { posture: 'stand' | 'sit' | 'prone'; size?: number; color?: string }) {
  const line = (left: number, top: number, width: number, angle = 0) => (
    <View
      style={{
        position: 'absolute',
        left: left * size,
        top: top * size,
        width: width * size,
        height: Math.max(1.2, size * 0.055),
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      {line(0.16, posture === 'prone' ? 0.64 : 0.36, 0.57)}
      {line(0.67, posture === 'prone' ? 0.53 : 0.24, 0.19, -35)}
      {line(0.78, posture === 'prone' ? 0.48 : 0.18, 0.12)}
      {line(0.08, posture === 'prone' ? 0.59 : 0.29, 0.16, 40)}
      {posture === 'stand' ? (
        <>
          {line(0.12, 0.52, 0.27, -58)}
          {line(0.19, 0.72, 0.2, 48)}
          {line(0.51, 0.53, 0.27, 60)}
          {line(0.64, 0.74, 0.18, -45)}
        </>
      ) : posture === 'sit' ? (
        <>
          {line(0.15, 0.5, 0.26, 55)}
          {line(0.14, 0.7, 0.3)}
          {line(0.53, 0.55, 0.36, 78)}
          {line(0.57, 0.75, 0.24)}
        </>
      ) : (
        <>
          {line(0.16, 0.75, 0.28)}
          {line(0.56, 0.75, 0.28)}
        </>
      )}
    </View>
  );
}

type SettingsProps = {
  width: number;
  height: number;
  category: ControlSettingsCategory;
  onCategory: (value: ControlSettingsTab) => void;
  snapshot?: ControlSettingsSnapshot;
  overlay: boolean;
  onOverlay: () => void;
  onClose: () => void;
  onLayout: () => void;
  onInput?: () => void;
  onConnection?: () => void;
  onDiagnostics?: () => void;
  onPostures: () => void;
  onActions?: () => void;
  onPolicy: () => void;
  ownerLabel: string;
  lease: ReactNode;
  robotName: string;
  connected: boolean;
  endpointLabel?: string;
  runtimeState?: ControlRuntimeState;
  inputSource: ControlInputSource;
  videoLabel: string;
  inHudOverlay?: boolean;
  subview?: ControlSettingsSubview;
  subviewTitle?: string;
  subviewContent?: ReactNode;
  onBackSubview?: () => void;
  onOpenPrivacySubview?: () => void;
  themePreference?: 'light' | 'dark' | null;
  onChangeTheme?: (next: 'light' | 'dark' | null) => void;
  alertsEnabled?: boolean;
  onToggleAlerts?: () => void;
  docksExpanded?: boolean;
  onToggleDocks?: () => void;
  sensitivityPercent?: number;
  onChangeSensitivity?: (next: number) => void;
  mirroredSticks?: boolean;
  onToggleMirroredSticks?: () => void;
  showVirtualDiscControls?: boolean;
  onToggleVirtualDiscControls?: () => void;
  lowLatencyMode?: boolean;
  onToggleLowLatency?: () => void;
  forwardDirection?: HudForwardDirection;
  onToggleForwardDirection?: () => void;
  speedLimitPercent?: number;
  onChangeSpeedLimit?: (next: number) => void;
  speedMode?: 'normal' | 'high' | 'unsupported' | null;
  onSelectSpeedMode?: (mode: 'normal' | 'high') => void;
  physicalInputReady?: boolean;
  onSelectInputSource?: (source: ControlInputSource) => void;
  primaryCamera?: 'front' | 'rear';
  onSwapCamera?: () => void;
  dualCameraEnabled?: boolean;
  onToggleDualCamera?: () => void;
  headlightMode?: 'off' | 'front' | 'both';
  onToggleHeadlight?: () => void;
  videoQuality?: VideoQualityPreset;
  onChangeVideoQuality?: (quality: VideoQualityPreset) => void;
  standbyScene?: StandbySceneId;
  onSelectStandbyScene?: (scene: StandbySceneId) => void;
  accentTone?: ControlAccentTone;
  onChangeAccentTone?: (tone: ControlAccentTone) => void;
  autoRecord?: boolean;
  onToggleAutoRecord?: () => void;
  recordingActive?: boolean;
  recordingDurationLabel?: string | null;
  mediaStatusLabel?: string;
  mediaStorageLabel?: string;
  mediaLastSavedLabel?: string | null;
  onToggleRecord?: () => void;
  onCapturePhoto?: () => void;
  soundVolumePercent?: number;
  onChangeSoundVolume?: (next: number) => void;
  dogVolumePercent?: number | null;
  onChangeDogVolume?: (next: number) => void;
  dogQuietMode?: boolean;
  onToggleDogQuietMode?: () => void;
  voiceBroadcastEnabled?: boolean;
  onToggleVoiceBroadcast?: () => void;
  onTestAudioCue?: () => void;
  microphoneActive?: boolean;
  microphoneError?: string | null;
  onToggleMicrophone?: () => void;
  voiceChatStatusLabel?: string;
  onOpenVoiceChat?: () => void;
  inlineConnection?: InlineConnectionSettingsProps;
  hotspotScanPulse?: number;
  onStopNow?: () => void;
  stopDisabled?: boolean;
  onOpenHudJointParams?: () => void;
  onOpenHudJointTemp?: () => void;
  onOpenWorkspaceSettings?: () => void;
  webStageMode?: 'g20-16-9' | 'fill';
  onToggleWebStageMode?: () => void;
  policies?: readonly Readonly<{ id: string; label: string; disabled: boolean; selected: boolean; hint?: string }>[];
  onSelectPolicy?: (id: string) => void;
  gestures?: readonly HudGestureInput[];
  gestureCategory?: HudGestureCategoryId;
  onGestureCategoryChange?: (category: HudGestureCategoryId) => void;
  selectedGestureName?: string | null;
  onSelectGesture?: (name: string) => void;
  gestureGifPreview?: boolean;
  onToggleGestureGifPreview?: () => void;
  gestureReady?: boolean;
  gestureHint?: string;
  onPlayGesture?: (name: string) => void;
  zeroReady?: boolean;
  zeroHint?: string;
  onSetZero?: () => void;
  clearFaultReady?: boolean;
  onClearMotorFault?: () => void;
  appVersionLabel?: string;
  appUpdateBusy?: boolean;
  appUpdateStatusLabel?: string | null;
  appUpdateActionLabel?: string | null;
  onCheckAppUpdate?: () => void;
  onDownloadAppUpdate?: () => void;
  connectionTipsOpen?: boolean;
  onToggleConnectionTips?: () => void;
};

const PRIVACY_ITEMS = [
  {
    icon: 'wifi-outline' as const,
    title: '设备直连与地址记录',
    body: '操控与状态数据仅在本机与机器狗间直接传输。本机仅保存最近连接地址，断开即清除。',
  },
  {
    icon: 'videocam-outline' as const,
    title: '图传画面与媒体存储',
    body: '画面仅在进入操控页时实时读取；抓拍与录屏保存至本机相册或下载目录，不向外部上传。',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: '设备发现与本机偏好',
    body: '热点扫描与近场发现仅在手动触发时运行；摇杆布局、场景与音量设置仅保存在本机。',
  },
] as const;

const CONNECTION_TIPS = [
  '1. 开启机器狗电源，手机或掌机连接机器狗热点或同一局域网。',
  '2. 在「连接与设备」点击热点扫描，自动填入可用地址并连接。',
  '3. 若手动输入地址，请确认设备已就绪且未被其他终端占用。',
] as const;

const FSD_CATEGORIES: readonly [ControlSettingsTab, keyof typeof Ionicons.glyphMap][] = [
  ['操控', 'game-controller-outline'],
  ['图传与音频', 'videocam-outline'],
  ['连接与设备', 'wifi-outline'],
  ['机器狗维护', 'construct-outline'],
  ['关于与隐私', 'information-circle-outline'],
];

export function renderControlSettings(p: SettingsProps) {
  const activeTab = normalizeSettingsCategory(p.category);
  const compact = p.height < 460 || p.width < 920;
  const narrow = p.width < 720;
  const ultraNarrow = p.width < 580;
  const short = p.height < 410;
  const s = ultraNarrow ? 0.84 : narrow ? 0.88 : compact ? 0.92 : Math.max(0.95, Math.min(1.08, p.width / 1280));
  const sp = (v: number) => Math.round(v * s);
  const c = controlSettingsColors;
  const isBlue = p.accentTone === 'fsdBlue';
  const accent = isBlue
    ? {
        solidBg: c.blue,
        solidInk: '#FFFFFF',
        pillBg: c.blue,
        pillBorder: c.blueBorder,
        pillInk: '#FFFFFF',
        switchTrack: c.blue,
        switchThumb: '#FFFFFF',
        ink: '#93C5FD',
        railBar: c.blue,
      }
    : {
        solidBg: c.graphiteAccent,
        solidInk: c.graphiteAccentInk,
        pillBg: c.pill,
        pillBorder: 'rgba(255, 255, 255, 0.28)',
        pillInk: c.ink,
        switchTrack: c.graphiteAccent,
        switchThumb: c.graphiteAccentInk,
        ink: c.ink,
        railBar: c.graphiteAccent,
      };

  const text = { color: c.ink, fontSize: sp(13.5), lineHeight: sp(18), fontWeight: '500' as const };
  const small = { color: c.muted, fontSize: sp(12), lineHeight: sp(16), fontWeight: '400' as const };
  const rawHudRatio = Math.min(p.width / 960, p.height / 540);
  const hudScale = p.inHudOverlay ? (rawHudRatio < 1 ? Math.max(0.76, 0.28 + rawHudRatio * 0.72) : Math.min(1.18, 1 + (rawHudRatio - 1) * 0.20)) : 1;
  const horizontalMargin = ultraNarrow ? 6 : narrow ? 8 : 12;
  // Sit cleanly below top-right bare HUD so red E-Stop at top-right stays 100% unobstructed.
  const topOffset = p.inHudOverlay ? Math.max(36, Math.round((short ? 42 : 48) * hudScale)) : Math.max(48, p.height * 0.11);
  const bottomOffset = p.inHudOverlay ? (short ? 6 : Math.round(10 * hudScale)) : Math.max(10, p.height * 0.03);
  const maxAvailableWidth = Math.max(280, p.width - horizontalMargin * 2);
  const shellMaxWidth = p.inHudOverlay
    ? Math.min(920, maxAvailableWidth, Math.max(280, Math.round(p.width * (narrow ? 0.96 : 0.88))))
    : Math.min(900, maxAvailableWidth);
  const sidebarWidth = ultraNarrow ? 104 : narrow ? 124 : compact ? 136 : 162;

  const snapshot = p.snapshot ?? {};
  const activeSubview = p.subview ?? 'tabs';
  const observed = p.connected && p.runtimeState?.controlLink === 'connected' ? p.runtimeState : undefined;
  const inputLabel = p.inputSource === 'physical' ? 'G20 实体摇杆' : '屏幕虚拟摇杆';
  const ownerLabel = observed ? p.ownerLabel : '未读取';
  const postureLabel = observed?.posture === 'standing' ? '站立' : observed?.posture === 'sitting' ? '坐下' : '未读取';
  const motorLabel = observed?.motorState === 'enabled' ? '已使能' : observed?.motorState === 'disabled' ? '已失能' : '未读取';
  const policyLabel = observed?.currentPolicy?.label ?? '未读取';
  const activeQuality = p.videoQuality ?? snapshot.quality ?? '高清';
  const activeScene = normalizeStandbyScene(p.standbyScene);
  const activeSensitivity = typeof p.sensitivityPercent === 'number' ? p.sensitivityPercent : snapshot.sensitivity;
  const activeVolume = typeof p.soundVolumePercent === 'number' ? p.soundVolumePercent : snapshot.volume;
  const batteryVoltage = observed?.battery?.voltageV;
  const deviceTemps = (observed?.joints ?? [])
    .map(j => j.temperatureC)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const maxTempC = deviceTemps.length > 0 ? Math.round(Math.max(...deviceTemps)) : null;

  const icon = (name: keyof typeof Ionicons.glyphMap, size = 16, tint = c.ink) => (
    <Ionicons name={name} size={Math.max(14, Math.round(size * s))} color={tint} />
  );

  const value = (label: string, highlighted = false) => (
    <Text
      numberOfLines={1}
      style={[
        small,
        {
          color: highlighted ? c.green : c.muted,
          textAlign: 'right',
          flexShrink: 1,
          maxWidth: '58%',
          fontWeight: highlighted ? '600' : '400',
          fontVariant: ['tabular-nums'],
        },
      ]}
    >
      {label}
    </Text>
  );

  const toggle = (id: string, val: boolean | undefined, change?: () => void, labelOverride?: string) => (
    <FsdSwitch
      testID={id}
      accessibilityLabel={
        labelOverride ??
        ({
          'control-setting-overlay': '画面叠加信息',
          'control-setting-hud-dashboard': '诊断栏常驻',
          'control-setting-dual-camera': '双摄画中画',
          'control-setting-virtual-discs': '圆盘控制',
          'control-setting-mirror': '镜像控制',
          'control-setting-latency': '低延迟模式',
          'control-setting-recording': '自动录像',
          'control-setting-quiet-mode': '轻声模式',
          'control-setting-voice': '语音播报',
          'control-setting-alerts': '状态告警',
        }[id] ?? '设备设置')
      }
      checked={val}
      disabled={!change}
      accessibilityState={{ checked: val, disabled: !change }}
      onPress={change}
      activeTrackColor={accent.switchTrack}
      activeThumbColor={accent.switchThumb}
    />
  );

  const row = (label: string, valNode: ReactNode, description?: string) => (
    <View style={st.row}>
      <View style={st.rowLabelCol}>
        <Text numberOfLines={1} style={text}>{label}</Text>
        {description ? <Text numberOfLines={1} style={small}>{description}</Text> : null}
      </View>
      {valNode}
    </View>
  );

  const link = (id: string, label: string, onPress?: () => void, detail?: string) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      accessibilityState={{ disabled: !onPress }}
      onPress={onPress}
      style={({ pressed }) => [st.row, { opacity: !onPress ? 0.5 : pressed ? 0.68 : 1 }]}
    >
      <Text numberOfLines={1} style={[text, { flex: 1 }]}>{label}</Text>
      {detail ? (
        <Text numberOfLines={1} style={[small, { maxWidth: '50%', textAlign: 'right', color: onPress ? accent.ink : c.muted }]}>
          {detail}
        </Text>
      ) : null}
      {onPress ? icon('chevron-forward', 15, c.muted) : null}
    </Pressable>
  );

  const group = (title: string, children: ReactNode) => (
    <View style={st.groupSection}>
      <Text accessibilityRole="header" style={st.groupHeading}>{title}</Text>
      <View style={st.well}>{children}</View>
    </View>
  );

  const inlineSeg = <T extends string>(
    options: readonly Readonly<{ value: T; label: string; disabled?: boolean; testID: string; accessibilityLabel?: string }>[],
    current: T,
    onSelect: (next: T) => void,
  ) => (
    <View style={st.segTrack}>
      {options.map(opt => {
        const selected = opt.value === current;
        const disabled = Boolean(opt.disabled);
        return (
          <Pressable
            key={opt.value}
            accessibilityLabel={opt.accessibilityLabel ?? opt.label}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            onPress={() => {
              if (!disabled && opt.value !== current) onSelect(opt.value);
            }}
            style={({ pressed }) => [
              st.segBtn,
              selected && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
              disabled && st.disabled,
              pressed && !disabled && st.pressed,
            ]}
            testID={opt.testID}
          >
            <Text numberOfLines={1} style={[st.segText, selected && { color: accent.pillInk, fontWeight: '600' }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const stepperControl = (opts: {
    id: string;
    title: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    presets?: readonly number[];
    presetLabels?: Readonly<Record<number, string>>;
    onChange: (next: number) => void;
  }) => (
    <View style={st.stepperWrap} testID={opts.id}>
      <View style={st.stepperHeader}>
        <Text numberOfLines={1} style={text}>{opts.title}</Text>
        <View style={st.stepperActions}>
          <Pressable
            accessibilityLabel={`降低${opts.title}`}
            accessibilityRole="button"
            disabled={opts.value <= opts.min}
            onPress={() => opts.onChange(Math.max(opts.min, opts.value - opts.step))}
            style={({ pressed }) => [st.stepBtn, opts.value <= opts.min && st.disabled, pressed && st.pressed]}
            testID={`${opts.id}-dec`}
          >
            <Ionicons color={c.ink} name="remove" size={14} />
          </Pressable>
          <Text style={st.speedReadout} testID={`${opts.id}-value`}>{`${opts.value}${opts.suffix ?? '%'}`}</Text>
          <Pressable
            accessibilityLabel={`提高${opts.title}`}
            accessibilityRole="button"
            disabled={opts.value >= opts.max}
            onPress={() => opts.onChange(Math.min(opts.max, opts.value + opts.step))}
            style={({ pressed }) => [st.stepBtn, opts.value >= opts.max && st.disabled, pressed && st.pressed]}
            testID={`${opts.id}-inc`}
          >
            <Ionicons color={c.ink} name="add" size={14} />
          </Pressable>
        </View>
      </View>
      <FsdDetentSlider
        accessibilityLabel={opts.title}
        fillColor={accent.switchTrack}
        max={opts.max}
        min={opts.min}
        onChange={opts.onChange}
        step={opts.step}
        value={opts.value}
      />
      {opts.presets ? (
        <View style={st.presetRow}>
          {opts.presets.map(preset => {
            const active = opts.value === preset;
            const labelText = opts.presetLabels?.[preset] ?? `${preset}${opts.suffix ?? '%'}`;
            return (
              <Pressable
                key={preset}
                accessibilityLabel={`${opts.title} ${labelText}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => opts.onChange(preset)}
                style={[st.presetChip, active && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder }]}
                testID={`${opts.id}-preset-${preset}`}
              >
                <Text numberOfLines={1} style={[st.presetChipText, active && { color: accent.pillInk, fontWeight: '600' }]}>
                  {labelText}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const layoutLink = () => link('control-open-joystick-layout', '摇杆布局', p.onLayout);
  const inputLink = () => link('control-open-input', '手柄校准', p.onInput, inputLabel);
  const connectionLink = () => link('control-settings-connection', '连接配置', p.onConnection, p.connected ? '已连接' : '未连接');
  const modeLink = () => link('control-open-policy', '地形模式', p.onPolicy, policyLabel);
  const postureLink = () => link('control-open-gestures', '姿态控制', p.onPostures, postureLabel);
  const overlayRow = () => row('画面叠加信息', toggle('control-setting-overlay', p.overlay, p.onOverlay));

  const hudSpeedVal = typeof p.speedLimitPercent === 'number' ? Math.min(100, Math.max(10, Math.round(p.speedLimitPercent))) : null;
  const speedLimitControl = hudSpeedVal !== null && p.onChangeSpeedLimit ? (
    <View style={st.stepperWrap} testID="control-setting-speed-limit">
      <View style={st.stepperHeader}>
        <Text numberOfLines={1} style={text}>最大速度限制</Text>
        <View style={st.stepperActions}>
          <Pressable
            accessibilityLabel="降低速度限制"
            accessibilityRole="button"
            disabled={hudSpeedVal <= 10}
            onPress={() => p.onChangeSpeedLimit?.(hudSpeedVal - 10)}
            style={({ pressed }) => [st.stepBtn, hudSpeedVal <= 10 && st.disabled, pressed && st.pressed]}
            testID="control-setting-speed-dec"
          >
            <Ionicons color={c.ink} name="remove" size={14} />
          </Pressable>
          <Text style={st.speedReadout} testID="control-setting-speed-value">{`${hudSpeedVal}%`}</Text>
          <Pressable
            accessibilityLabel="提高速度限制"
            accessibilityRole="button"
            disabled={hudSpeedVal >= 100}
            onPress={() => p.onChangeSpeedLimit?.(hudSpeedVal + 10)}
            style={({ pressed }) => [st.stepBtn, hudSpeedVal >= 100 && st.disabled, pressed && st.pressed]}
            testID="control-setting-speed-inc"
          >
            <Ionicons color={c.ink} name="add" size={14} />
          </Pressable>
        </View>
      </View>
      <FsdDetentSlider
        accessibilityLabel="最大速度限制"
        fillColor={accent.switchTrack}
        max={100}
        min={10}
        onChange={next => p.onChangeSpeedLimit?.(next)}
        step={10}
        value={hudSpeedVal}
      />
      <View style={st.presetRow}>
        {([30, 60, 80, 100] as const).map(preset => {
          const active = hudSpeedVal === preset;
          return (
            <Pressable
              key={preset}
              accessibilityLabel={`速度上限 ${preset}%`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => p.onChangeSpeedLimit?.(preset)}
              style={[st.presetChip, active && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder }]}
              testID={`control-setting-speed-preset-${preset}`}
            >
              <Text numberOfLines={1} style={[st.presetChipText, active && { color: accent.pillInk, fontWeight: '600' }]}>
                {`${preset}%`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : (
    row('最大速度限制', value(snapshot.speedLimit === undefined ? '未读取' : `${snapshot.speedLimit} m/s`))
  );

  let content: ReactNode;
  if (activeSubview === 'privacy') {
    content = (
      <View style={st.paneStack} testID="control-settings-subview-privacy">
        {PRIVACY_ITEMS.map(item => (
          <View key={item.title} style={st.well}>
            <View style={st.privacyHead}>
              {icon(item.icon, 16, accent.ink)}
              <Text style={text}>{item.title}</Text>
            </View>
            <Text style={small}>{item.body}</Text>
          </View>
        ))}
      </View>
    );
  } else if (activeSubview !== 'tabs' && p.subviewContent) {
    content = p.subviewContent;
  } else {
    switch (activeTab) {
      case '操控': {
        const showSpeedMode = Boolean(p.onSelectSpeedMode && (p.speedMode === 'normal' || p.speedMode === 'high'));
        content = (
          <View style={st.paneStack} testID="control-settings-page-操控">
            {group('摇杆设置', <>
              {p.onSelectInputSource
                ? row(
                    '输入源',
                    inlineSeg(
                      [
                        { value: 'touch', label: '触屏摇杆', testID: 'control-setting-source-touch', accessibilityLabel: '使用屏幕虚拟摇杆' },
                        { value: 'physical', label: 'G20 手柄', disabled: !p.physicalInputReady, testID: 'control-setting-source-physical', accessibilityLabel: '使用 G20 实体摇杆' },
                      ],
                      p.inputSource,
                      next => p.onSelectInputSource?.(next),
                    ),
                  )
                : null}
              {p.onToggleVirtualDiscControls
                ? row('圆盘控制', toggle('control-setting-virtual-discs', Boolean(p.showVirtualDiscControls), p.onToggleVirtualDiscControls), '速度与转向')
                : null}
              {typeof activeSensitivity === 'number' && p.onChangeSensitivity
                ? stepperControl({
                    id: 'control-setting-sensitivity',
                    title: '摇杆灵敏度',
                    value: activeSensitivity,
                    min: 50,
                    max: 150,
                    step: 10,
                    presets: [70, 100, 130],
                    onChange: p.onChangeSensitivity,
                  })
                : row('摇杆灵敏度', value(typeof activeSensitivity === 'number' ? `${activeSensitivity}%` : '未读取'))}
              {p.onToggleMirroredSticks
                ? row('镜像控制', toggle('control-setting-mirror', p.mirroredSticks ?? snapshot.mirrored, p.onToggleMirroredSticks), '左右摇杆互换')
                : null}
              {p.forwardDirection && p.onToggleForwardDirection
                ? row(
                    '操控正方向',
                    inlineSeg(
                      [
                        { value: 'front', label: '前向', testID: 'control-setting-direction-front', accessibilityLabel: '前向操控' },
                        { value: 'rear', label: '后向', testID: 'control-setting-direction-rear', accessibilityLabel: '后向操控' },
                      ],
                      p.forwardDirection,
                      () => p.onToggleForwardDirection?.(),
                    ),
                  )
                : null}
            </>)}

            {group('速度与响应', <>
              {showSpeedMode
                ? row(
                    '速度档位',
                    inlineSeg(
                      [
                        { value: 'normal', label: '标准 1.0', disabled: !observed, testID: 'control-setting-speed-mode-normal', accessibilityLabel: '标准档位 1.0 m/s' },
                        { value: 'high', label: '高速 2.5', disabled: !observed, testID: 'control-setting-speed-mode-high', accessibilityLabel: '高速档位 2.5 m/s' },
                      ],
                      p.speedMode === 'high' ? 'high' : 'normal',
                      next => p.onSelectSpeedMode?.(next),
                    ),
                  )
                : null}
              {speedLimitControl}
              {row('低延迟模式', toggle('control-setting-latency', p.lowLatencyMode ?? snapshot.lowLatency, p.onToggleLowLatency))}
            </>)}

            {group('布局与外观', <>
              {layoutLink()}
              {inputLink()}
              {p.onChangeAccentTone
                ? row(
                    '点缀色',
                    inlineSeg(
                      [
                        { value: 'graphite', label: '石墨白', testID: 'control-setting-accent-graphite' },
                        { value: 'fsdBlue', label: 'FSD 蓝', testID: 'control-setting-accent-blue' },
                      ],
                      p.accentTone ?? 'graphite',
                      next => p.onChangeAccentTone?.(next),
                    ),
                  )
                : null}
              {p.onChangeTheme
                ? row(
                    '外观风格',
                    inlineSeg(
                      [
                        { value: 'system', label: '跟随系统', testID: 'control-setting-theme-system' },
                        { value: 'dark', label: '深色', testID: 'control-setting-theme-dark' },
                        { value: 'light', label: '浅色', testID: 'control-setting-theme-light' },
                      ],
                      p.themePreference === 'dark' ? 'dark' : p.themePreference === 'light' ? 'light' : 'system',
                      next => p.onChangeTheme?.(next === 'system' ? null : next),
                    ),
                  )
                : null}
              {p.webStageMode && p.onToggleWebStageMode
                ? row(
                    '视口比例',
                    inlineSeg(
                      [
                        { value: 'g20-16-9', label: '16:9 掌机', testID: 'control-setting-viewport-g20' },
                        { value: 'fill', label: '铺满窗口', testID: 'control-setting-viewport-fill' },
                      ],
                      p.webStageMode,
                      () => p.onToggleWebStageMode?.(),
                    ),
                  )
                : null}
              {p.onToggleAlerts ? row('状态告警提示', toggle('control-setting-alerts', Boolean(p.alertsEnabled), p.onToggleAlerts)) : null}
              {postureLink()}
              {p.onActions ? link('control-open-action-deck', '动作库', p.onActions, p.gestures?.length ? `${p.gestures.length} 项` : undefined) : null}
              {modeLink()}
            </>)}
          </View>
        );
        break;
      }

      case '图传与音频': {
        content = (
          <View style={st.paneStack} testID="control-settings-page-图传与音频">
            {group('待机场景', (
              <View style={st.sceneGrid} testID="control-settings-standby-scene-picker">
                {STANDBY_SCENES.map(scene => {
                  const selected = activeScene === scene.id;
                  return (
                    <Pressable
                      key={scene.id}
                      accessibilityLabel={`待机场景 ${scene.label}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => p.onSelectStandbyScene?.(scene.id)}
                      style={({ pressed }) => [
                        st.sceneCard,
                        selected && { borderColor: accent.solidBg, backgroundColor: '#2C2C2C' },
                        pressed && st.pressed,
                      ]}
                      testID={`control-setting-scene-${scene.id}`}
                    >
                      <View style={st.sceneThumbWrap}>
                        <Image resizeMode="cover" source={scene.source} style={st.sceneThumb} />
                      </View>
                      <View style={st.sceneLabelRow}>
                        <Text numberOfLines={1} style={[st.sceneLabelText, selected && { color: c.ink, fontWeight: '600' }]}>
                          {scene.label}
                        </Text>
                        {selected ? <View style={[st.sceneActiveDot, { backgroundColor: accent.solidBg }]} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            {group('图传与录制', <>
              <View style={st.qualityBlock}>
                <Text numberOfLines={1} style={text}>视频清晰度</Text>
                <View style={st.segTrack}>
                  {(['流畅', '标清', '高清', '超清'] as const).map(quality => {
                    const selected = (p.onChangeVideoQuality ? activeQuality : snapshot.quality) === quality;
                    const interactive = Boolean(p.onChangeVideoQuality);
                    return (
                      <Pressable
                        key={quality}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`视频清晰度 ${quality}`}
                        accessibilityState={{ disabled: !interactive, selected }}
                        disabled={!interactive}
                        onPress={() => p.onChangeVideoQuality?.(quality)}
                        style={[
                          st.segBtn,
                          { flex: 1 },
                          selected && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
                          !interactive && st.disabled,
                        ]}
                        testID={`control-setting-quality-${quality}`}
                      >
                        <Text numberOfLines={1} style={[st.segText, selected && { color: accent.pillInk, fontWeight: '600' }]}>
                          {quality}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {p.primaryCamera && p.onSwapCamera
                ? row(
                    '主视角相机',
                    <Pressable
                      accessibilityLabel={`切换主画面视角，当前${p.primaryCamera === 'front' ? '前视角' : '后视角'}`}
                      accessibilityRole="button"
                      onPress={p.onSwapCamera}
                      style={({ pressed }) => [st.inlineActionBtn, pressed && st.pressed]}
                      testID="control-setting-camera-swap"
                    >
                      <Ionicons color={accent.ink} name="camera-reverse-outline" size={14} />
                      <Text numberOfLines={1} style={st.inlineActionText}>
                        {p.primaryCamera === 'front' ? '前广角' : '后广角'}
                      </Text>
                    </Pressable>,
                  )
                : null}
              {p.onToggleDualCamera ? row('双摄画中画', toggle('control-setting-dual-camera', Boolean(p.dualCameraEnabled), p.onToggleDualCamera)) : null}
              {overlayRow()}
              {p.onToggleAutoRecord
                ? row('自动录像', toggle('control-setting-recording', Boolean(p.autoRecord), p.onToggleAutoRecord), '连通自动录屏')
                : null}
              {row('当前图传', value(p.videoLabel))}
              {row('录制状态', value(p.mediaStatusLabel ?? '就绪', Boolean(p.recordingActive)))}
              {p.mediaStorageLabel ? row('保存位置', value(p.mediaStorageLabel)) : null}
              {p.mediaLastSavedLabel ? row('最近保存', value(p.mediaLastSavedLabel)) : null}
              {p.onCapturePhoto || p.onToggleRecord
                ? row(
                    '采集操作',
                    <View style={st.inlineBtnGroup}>
                      {p.onCapturePhoto ? (
                        <Pressable
                          accessibilityLabel="抓拍当前视角"
                          accessibilityRole="button"
                          onPress={p.onCapturePhoto}
                          style={({ pressed }) => [st.inlineActionBtn, pressed && st.pressed]}
                          testID="control-setting-capture-photo"
                        >
                          <Ionicons color={accent.ink} name="camera-outline" size={14} />
                          <Text numberOfLines={1} style={st.inlineActionText}>抓拍</Text>
                        </Pressable>
                      ) : null}
                      {p.onToggleRecord ? (
                        <Pressable
                          accessibilityLabel={p.recordingActive ? '结束当前录屏' : '开始录制当前视频'}
                          accessibilityRole="button"
                          accessibilityState={{ selected: Boolean(p.recordingActive) }}
                          onPress={p.onToggleRecord}
                          style={({ pressed }) => [
                            st.inlineActionBtn,
                            p.recordingActive && { backgroundColor: accent.solidBg, borderColor: accent.pillBorder },
                            pressed && st.pressed,
                          ]}
                          testID="control-setting-record-toggle"
                        >
                          <Ionicons color={p.recordingActive ? accent.solidInk : accent.ink} name={p.recordingActive ? 'stop-circle-outline' : 'videocam-outline'} size={14} />
                          <Text numberOfLines={1} style={[st.inlineActionText, p.recordingActive && { color: accent.solidInk, fontWeight: '600' }]}>
                            {p.recordingActive ? `停止 ${p.recordingDurationLabel ?? '00:00'}` : '开始录屏'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>,
                  )
                : null}
              {snapshot.storageUsedGb !== undefined && snapshot.storageTotalGb ? (
                <View style={st.storageRow}>
                  <View style={st.stepperHeader}>
                    <Text style={small}>本机存储</Text>
                    <Text style={[small, { fontVariant: ['tabular-nums'] }]}>{`${snapshot.storageUsedGb} / ${snapshot.storageTotalGb} GB`}</Text>
                  </View>
                  <View accessibilityLabel="存储使用比例" style={st.storageTrack}>
                    <View style={{ width: `${Math.max(2, Math.min(100, (snapshot.storageUsedGb / snapshot.storageTotalGb) * 100))}%`, height: '100%', backgroundColor: accent.switchTrack }} />
                  </View>
                </View>
              ) : null}
            </>)}

            {group('音频与对话', <>
              {typeof p.dogVolumePercent === 'number' && p.onChangeDogVolume
                ? stepperControl({
                    id: 'control-setting-dog-volume',
                    title: '机器狗音量',
                    value: p.dogVolumePercent,
                    min: 0,
                    max: 100,
                    step: 10,
                    presets: [0, 25, 65, 90],
                    presetLabels: { 0: '静音', 25: '轻声', 65: '标准', 90: '大声' },
                    onChange: p.onChangeDogVolume,
                  })
                : null}
              {p.onToggleDogQuietMode
                ? row('轻声模式', toggle('control-setting-quiet-mode', Boolean(p.dogQuietMode), p.onToggleDogQuietMode))
                : null}
              {typeof activeVolume === 'number' && p.onChangeSoundVolume
                ? stepperControl({
                    id: 'control-setting-volume',
                    title: '提示音音量',
                    value: activeVolume,
                    min: 0,
                    max: 100,
                    step: 10,
                    presets: [0, 50, 80, 100],
                    presetLabels: { 0: '静音', 50: '50%', 80: '80%', 100: '100%' },
                    onChange: p.onChangeSoundVolume,
                  })
                : row('提示音音量', value(typeof activeVolume === 'number' ? `${activeVolume}%` : '未读取'))}
              {p.onToggleVoiceBroadcast ? row('状态语音播报', toggle('control-setting-voice', Boolean(p.voiceBroadcastEnabled), p.onToggleVoiceBroadcast)) : null}
              {p.onTestAudioCue
                ? row(
                    '声音测试',
                    <Pressable
                      accessibilityLabel="播放提示音测试"
                      accessibilityRole="button"
                      onPress={p.onTestAudioCue}
                      style={({ pressed }) => [st.inlineActionBtn, pressed && st.pressed]}
                      testID="control-setting-test-audio"
                    >
                      <Ionicons color={accent.ink} name="musical-notes-outline" size={14} />
                      <Text numberOfLines={1} style={st.inlineActionText}>试听</Text>
                    </Pressable>,
                  )
                : null}
              {p.onOpenVoiceChat
                ? row(
                    '机器狗对话',
                    <Pressable
                      accessibilityLabel="打开机器狗语音对话"
                      accessibilityRole="button"
                      onPress={p.onOpenVoiceChat}
                      style={({ pressed }) => [st.inlineActionBtn, { backgroundColor: accent.solidBg, borderColor: accent.pillBorder }, pressed && st.pressed]}
                      testID="control-setting-open-voice-chat"
                    >
                      <Ionicons color={accent.solidInk} name="chatbubble-ellipses-outline" size={14} />
                      <Text numberOfLines={1} style={[st.inlineActionText, { color: accent.solidInk, fontWeight: '600' }]}>打开对话</Text>
                    </Pressable>,
                    p.voiceChatStatusLabel,
                  )
                : null}
            </>)}
          </View>
        );
        break;
      }

      case '连接与设备': {
        const ic = p.inlineConnection;
        const connStatusText = p.connected ? '已连接' : ic?.readonlyConnected ? '只读在线' : '未连接';
        const cleanEndpoint = p.endpointLabel?.trim();
        const showEndpointSuffix = Boolean(cleanEndpoint && cleanEndpoint !== connStatusText);
        content = (
          <View style={st.paneStack} testID="control-settings-page-连接与设备">
            {/* Dual-Channel Hotspot Radar Card wired to real WifiDiscoveryPanel */}
            {group('热点扫描', (
              <View style={ic ? st.radarSectionEmbedded : st.radarSection} testID="control-settings-hotspot-radar">
                {ic ? (
                  <WifiDiscoveryPanel
                    key={`settings-wifi-${p.hotspotScanPulse ?? 0}`}
                    currentHost={ic.hostDraft}
                    currentPort={ic.portDraft}
                    disabled={Boolean(ic.busy)}
                    embedded
                    onApplyAddress={(host, port) => {
                      ic.onChangeHost(host);
                      ic.onChangePort(String(port));
                    }}
                    surfaceTone="dark"
                    testID="control-settings-wifi-discovery"
                  />
                ) : (
                  <>
                    <View style={st.radarHeader}>
                      <FsdRadarPulse active color={isBlue ? c.blue : '#EAEAEA'} size={42}>
                        <Ionicons color={accent.ink} name="wifi" size={18} />
                      </FsdRadarPulse>
                      <View style={st.radarHeaderCopy}>
                        <Text numberOfLines={1} style={text}>局域网与机器狗热点</Text>
                        <Text numberOfLines={1} style={small}>
                          {p.connected ? `已连接 ${p.robotName}` : '扫描附近可用设备并自动填入'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ paddingTop: 2 }}>{connectionLink()}</View>
                  </>
                )}
              </View>
            ))}

            {group('机器狗连接', <>
              <View style={st.heroDeviceRow}>
                <View style={st.heroDeviceLeft}>
                  <View style={[st.statusDot, p.connected && st.statusDotLive]} />
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text numberOfLines={1} style={[text, { fontWeight: '600' }]}>{p.robotName}</Text>
                    <Text numberOfLines={1} style={small}>
                      {connStatusText}
                      {showEndpointSuffix ? ` · ${cleanEndpoint}` : ''}
                    </Text>
                  </View>
                </View>
                {ic ? (
                  <Pressable
                    accessibilityLabel={p.connected || ic.readonlyConnected ? '断开连接' : '连接机器狗控制'}
                    accessibilityRole="button"
                    disabled={Boolean(ic.busy)}
                    onPress={p.connected || ic.readonlyConnected ? ic.onDisconnect : ic.onConnectControl}
                    style={[
                      st.inlineActionBtn,
                      !(p.connected || ic.readonlyConnected) && { backgroundColor: accent.solidBg, borderColor: accent.pillBorder },
                      ic.busy && st.disabled,
                    ]}
                    testID={p.connected || ic.readonlyConnected ? 'control-settings-disconnect-submit' : 'control-settings-connect-submit'}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        st.inlineActionText,
                        p.connected || ic.readonlyConnected
                          ? { color: '#FCA5A5', fontWeight: '600' }
                          : { color: accent.solidInk, fontWeight: '600' },
                      ]}
                    >
                      {ic.busy ? '处理中…' : p.connected || ic.readonlyConnected ? '断开' : '连接控制'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {ic ? (
                <View style={st.manualConnWrap} testID="control-settings-inline-connection">
                  <View style={st.inputRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={[small, { marginBottom: 4 }]}>机器狗 IP</Text>
                      <TextInput
                        accessibilityLabel="机器狗 IP 地址"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!ic.busy}
                        onChangeText={ic.onChangeHost}
                        placeholder="192.168.66.64"
                        placeholderTextColor="#6B6B6B"
                        style={st.inputField}
                        testID="control-settings-host-input"
                        value={ic.hostDraft}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[small, { marginBottom: 4 }]}>端口</Text>
                      <TextInput
                        accessibilityLabel="机器狗端口"
                        editable={!ic.busy}
                        keyboardType="number-pad"
                        onChangeText={ic.onChangePort}
                        placeholder="13145"
                        placeholderTextColor="#6B6B6B"
                        style={st.inputField}
                        testID="control-settings-port-input"
                        value={ic.portDraft}
                      />
                    </View>
                  </View>
                  <View style={st.presetRow}>
                    <Pressable
                      accessibilityLabel="填入本机地址 127.0.0.1"
                      accessibilityRole="button"
                      disabled={ic.busy}
                      onPress={() => { ic.onChangeHost('127.0.0.1'); ic.onChangePort('13145'); }}
                      style={st.presetChip}
                      testID="control-settings-host-sim"
                    >
                      <Text numberOfLines={1} style={st.presetChipText}>127.0.0.1</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="填入机器狗默认地址 192.168.66.64"
                      accessibilityRole="button"
                      disabled={ic.busy}
                      onPress={() => { ic.onChangeHost('192.168.66.64'); ic.onChangePort('13145'); }}
                      style={st.presetChip}
                      testID="control-settings-host-robot"
                    >
                      <Text numberOfLines={1} style={st.presetChipText}>192.168.66.64</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="填入三号机地址 192.168.66.13"
                      accessibilityRole="button"
                      disabled={ic.busy}
                      onPress={() => { ic.onChangeHost('192.168.66.13'); ic.onChangePort('13145'); }}
                      style={st.presetChip}
                      testID="control-settings-host-dog3"
                    >
                      <Text numberOfLines={1} style={st.presetChipText}>三号机 .13</Text>
                    </Pressable>
                    {ic.onProbeReadOnly ? (
                      <Pressable
                        accessibilityLabel="只读状态检查"
                        accessibilityRole="button"
                        disabled={Boolean(ic.busy)}
                        onPress={ic.onProbeReadOnly}
                        style={[st.presetChip, ic.busy && st.disabled]}
                        testID="control-settings-probe-submit"
                      >
                        <Text numberOfLines={1} style={[st.presetChipText, { color: accent.ink }]}>只读检查</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {ic.statusMessage ? <Text style={small} testID="control-settings-connection-msg">{ic.statusMessage}</Text> : null}
                  {ic.onOpenAdvanced ? link('control-settings-connection-advanced', '高级连接配置', ic.onOpenAdvanced) : null}
                  {ic.onOpenBle ? link('control-settings-open-ble', '蓝牙扫描', ic.onOpenBle) : null}
                </View>
              ) : (
                <>
                  {row('设备地址', value(p.endpointLabel ?? '未读取'))}
                  {connectionLink()}
                </>
              )}
            </>)}

            {group('控制权与终端', <>
              {row('当前控制者', value(ownerLabel))}
              <View style={st.leaseSlot}>
                {p.lease ?? <Text style={small}>{!p.connected ? '未连接' : p.inputSource === 'touch' ? '推杆自动接管' : '无控制操作'}</Text>}
              </View>
              {row('当前输入', value(inputLabel))}
              {p.onToggleDocks ? row('诊断栏常驻', toggle('control-setting-hud-dashboard', Boolean(p.docksExpanded), p.onToggleDocks)) : null}
              {inputLink()}
            </>)}
          </View>
        );
        break;
      }

      case '机器狗维护': {
        const joints = observed?.joints ?? [];
        const onlineCount = joints.filter(item => item.online === true).length;
        const livePolicies = observed ? (p.policies ?? []) : [];
        const liveGestures = p.gestures ?? [];
        const chip = (id: string, label: string, onPress: (() => void) | undefined, opts: { active?: boolean; disabled?: boolean; hint?: string; danger?: boolean } = {}) => (
          <Pressable
            key={id}
            testID={id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={opts.disabled ? opts.hint : undefined}
            accessibilityState={{ disabled: Boolean(opts.disabled || !onPress), selected: Boolean(opts.active) }}
            disabled={Boolean(opts.disabled || !onPress)}
            onPress={onPress}
            style={({ pressed }) => [
              st.actionChip,
              opts.active && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
              opts.danger && st.actionChipDanger,
              (opts.disabled || !onPress) && st.disabled,
              pressed && st.pressed,
            ]}
          >
            <Text numberOfLines={1} style={[st.actionChipText, opts.active && { color: accent.pillInk, fontWeight: '600' }]}>
              {label}
            </Text>
          </Pressable>
        );
        const blockedNote = (ready: boolean | undefined, hint?: string) =>
          !ready && observed && hint ? <Text numberOfLines={1} style={[small, { paddingTop: 2 }]}>{hint}</Text> : null;
        const motorHealth = (joint: (typeof joints)[number]) =>
          joint.fault === 'active' || (joint.errors?.length ?? 0) > 0
            ? '故障'
            : joint.online !== true
              ? '离线'
              : joint.statusCode === 2
                ? '运行'
                : joint.statusCode === 1
                  ? '待机'
                  : joint.statusCode === 0
                    ? '复位'
                    : '在线';

        content = (
          <View style={st.paneStack} testID="control-settings-page-机器狗维护">
            {group('机器人状态', <>
              {row('姿态 · 电机', value(postureLabel === motorLabel ? postureLabel : `${postureLabel} · ${motorLabel}`, observed?.motorState === 'enabled'))}
              {row('当前模式', value(policyLabel))}
              {row(
                '电池与温度',
                value(
                  [
                    typeof batteryVoltage === 'number' && Number.isFinite(batteryVoltage) ? `${batteryVoltage.toFixed(1)}V` : null,
                    maxTempC !== null ? `${maxTempC}°C` : null,
                  ].filter(Boolean).join(' · ') || '未读取',
                ),
              )}
              {row('故障状态', value(observed?.faultStatus === 'clear' ? '正常' : observed?.faultStatus === 'active' ? observed.faultSummary ?? '存在故障' : '未读取', observed?.faultStatus === 'clear'))}
              {p.onStopNow
                ? row(
                    '紧急制动',
                    <Pressable
                      accessibilityLabel="立即执行软急停"
                      accessibilityRole="button"
                      disabled={Boolean(p.stopDisabled)}
                      onPress={p.onStopNow}
                      style={[st.inlineActionBtn, st.stopNowBtn, p.stopDisabled && st.disabled]}
                      testID="control-setting-stop-now"
                    >
                      <Ionicons color="#FFFFFF" name="hand-left-outline" size={14} />
                      <Text numberOfLines={1} style={[st.inlineActionText, { color: '#FFFFFF', fontWeight: '600' }]}>立即急停</Text>
                    </Pressable>,
                  )
                : null}
            </>)}

            {group(`四腿电机矩阵 ${joints.length ? `${onlineCount}/${joints.length}` : ''}`.trim(), <>
              {joints.length === 0 ? (
                row('关节状态', value('未读取'))
              ) : (
                <View style={st.motorGrid} testID="control-settings-motor-list">
                  {joints.map(joint => {
                    const health = motorHealth(joint);
                    const bad = health === '故障' || health === '离线';
                    return (
                      <View
                        key={joint.id}
                        style={[st.motorCell, bad && st.motorCellBad]}
                        testID={`control-settings-motor-${joint.id}`}
                        accessible
                        accessibilityLabel={`${joint.label} ${health}`}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[st.motorDot, { backgroundColor: bad ? '#EF4444' : joint.online ? '#34D399' : '#6B6B6B' }]} />
                          <Text numberOfLines={1} style={[text, { flex: 1, fontSize: sp(12) }]}>{joint.label}</Text>
                        </View>
                        <Text numberOfLines={1} style={[small, { fontSize: sp(11.5), fontVariant: ['tabular-nums'] }]}>
                          {[
                            health,
                            typeof joint.temperatureC === 'number' && Number.isFinite(joint.temperatureC) ? `${Math.round(joint.temperatureC)}°C` : null,
                            typeof joint.positionDeg === 'number' && Number.isFinite(joint.positionDeg) ? `${Math.round(joint.positionDeg)}°` : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {link('control-open-diagnostics', '电机诊断', p.onDiagnostics)}
              {p.onOpenHudJointParams ? link('control-settings-open-joint-params', '关节参数浮窗', p.onOpenHudJointParams) : null}
              {p.onOpenHudJointTemp ? link('control-settings-open-joint-temp', '关节温度浮窗', p.onOpenHudJointTemp) : null}
            </>)}

            {group('标定与运动模式', <>
              <View style={st.chipWrap}>
                {chip('control-settings-set-zero', '电机标零', p.onSetZero, { disabled: !observed || !p.zeroReady, hint: p.zeroHint, danger: true })}
                {chip('control-settings-clear-fault', '清除故障', p.onClearMotorFault, { disabled: !observed || !p.clearFaultReady })}
              </View>
              {blockedNote(p.zeroReady, p.zeroHint)}
              <View style={st.chipWrap} testID="control-settings-mode-list">
                {livePolicies.length > 0 ? (
                  livePolicies.map(option =>
                    chip(
                      `control-settings-mode-${option.id}`,
                      option.label,
                      p.onSelectPolicy ? () => p.onSelectPolicy?.(option.id) : undefined,
                      { active: option.selected, disabled: option.disabled || option.selected, hint: option.hint },
                    ),
                  )
                ) : (
                  <Text style={small}>未读取</Text>
                )}
              </View>
              {livePolicies.length > 0
                ? blockedNote(!livePolicies.every(option => option.disabled && !option.selected), livePolicies.find(option => option.hint)?.hint)
                : null}
            </>)}

            {liveGestures.length > 0
              ? group(`动作库 ${liveGestures.length}`, GestureDeckPanel({
                  gestures: liveGestures,
                  category: p.gestureCategory ?? 'all',
                  onSelectCategory: next => p.onGestureCategoryChange?.(next),
                  selectedGestureName: p.selectedGestureName ?? null,
                  onSelectGesture: name => p.onSelectGesture?.(name),
                  showGifPreview: p.gestureGifPreview ?? true,
                  onToggleGifPreview: () => p.onToggleGestureGifPreview?.(),
                  gestureDisabled: !observed || !p.gestureReady,
                  gestureHint: p.gestureHint ?? (!observed ? '未连接' : undefined),
                  onPlayGesture: p.onPlayGesture,
                  variant: 'settings',
                  accentTone: p.accentTone,
                }))
              : null}
          </View>
        );
        break;
      }

      case '关于与隐私': {
        content = (
          <View style={st.paneStack} testID="control-settings-page-关于与隐私">
            {group('应用与版本', <>
              <View style={st.brandHeader}>
                <DosoWordmark width={116} color={c.ink} />
                <Text style={small}>四足机器人操控终端</Text>
              </View>
              {row('应用版本', value(p.appVersionLabel ?? snapshot.appVersion ?? '0.0.1'))}
              {p.onCheckAppUpdate
                ? row(
                    '版本更新',
                    <View style={st.inlineBtnGroup}>
                      <Pressable
                        accessibilityLabel="检查应用更新"
                        accessibilityRole="button"
                        disabled={Boolean(p.appUpdateBusy)}
                        onPress={p.onCheckAppUpdate}
                        style={({ pressed }) => [st.inlineActionBtn, p.appUpdateBusy && st.disabled, pressed && st.pressed]}
                        testID="control-setting-check-update"
                      >
                        <Ionicons color={accent.ink} name="cloud-download-outline" size={14} />
                        <Text numberOfLines={1} style={st.inlineActionText}>
                          {p.appUpdateBusy ? '检查中…' : '检查更新'}
                        </Text>
                      </Pressable>
                      {p.onDownloadAppUpdate && p.appUpdateActionLabel ? (
                        <Pressable
                          accessibilityLabel="下载应用更新"
                          accessibilityRole="button"
                          onPress={p.onDownloadAppUpdate}
                          style={({ pressed }) => [
                            st.inlineActionBtn,
                            { backgroundColor: accent.solidBg, borderColor: accent.pillBorder },
                            pressed && st.pressed,
                          ]}
                          testID="control-setting-download-update"
                        >
                          <Ionicons color={accent.solidInk} name="download-outline" size={14} />
                          <Text numberOfLines={1} style={[st.inlineActionText, { color: accent.solidInk, fontWeight: '600' }]}>
                            {p.appUpdateActionLabel}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>,
                    p.appUpdateStatusLabel ?? undefined,
                  )
                : null}
              {row('机器人版本', value(p.inlineConnection?.firmwareVersion ?? snapshot.firmware ?? '未读取'))}
              {p.inlineConnection?.lastSyncLabel ? row('最近同步', value(p.inlineConnection.lastSyncLabel)) : null}
              {row('显示字库', value('MiSans'))}
            </>)}

            {group('隐私与指引', <>
              {p.onOpenPrivacySubview ? link('control-about-open-privacy', '数据与隐私说明', p.onOpenPrivacySubview) : null}
              {p.onToggleConnectionTips ? (
                <>
                  <Pressable
                    accessibilityLabel="展开或收起连接指引"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: Boolean(p.connectionTipsOpen) }}
                    onPress={p.onToggleConnectionTips}
                    style={({ pressed }) => [st.row, pressed && st.pressed]}
                    testID="control-about-tips-toggle"
                  >
                    <Text numberOfLines={1} style={[text, { flex: 1 }]}>快速连接指引</Text>
                    {icon(p.connectionTipsOpen ? 'chevron-up' : 'chevron-down', 15, c.muted)}
                  </Pressable>
                  {p.connectionTipsOpen ? (
                    <View style={st.tipsBox} testID="control-about-tips-body">
                      {CONNECTION_TIPS.map(tip => (
                        <Text key={tip} style={small}>{tip}</Text>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </>)}
          </View>
        );
        break;
      }
    }
  }

  const stopTouchBubble = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
  };

  return (
    <FsdSheetMotion
      onTouchStart={stopTouchBubble}
      onTouchMove={stopTouchBubble}
      onTouchEnd={stopTouchBubble}
      onTouchCancel={stopTouchBubble}
      pointerEvents="box-none"
      testID="control-settings-menu"
      style={[st.root, { left: horizontalMargin, right: horizontalMargin, top: topOffset, bottom: bottomOffset }]}
    >
      <View style={[st.consoleShell, { maxWidth: shellMaxWidth, borderRadius: short ? 16 : 20 }]}>
        {/* Left Charcoal Sidebar Rail */}
        <View style={[st.sidebar, { width: sidebarWidth }, short && st.sidebarShort, ultraNarrow && st.sidebarNarrow]}>
          <View style={st.sidebarBrand}>
            <Text accessibilityRole="header" numberOfLines={1} style={st.sidebarTitle}>设置</Text>
            <View style={st.sidebarStatusRow}>
              <View style={[st.statusDot, p.connected && st.statusDotLive]} />
              <Text numberOfLines={1} style={st.sidebarStatusText}>
                {p.connected ? '已连接' : '未连接'}
              </Text>
            </View>
          </View>

          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={st.sidebarScroll}
            contentContainerStyle={st.sidebarNav}
          >
            {FSD_CATEGORIES.map(([label, glyph]) => {
              const selected = activeTab === label && activeSubview === 'tabs';
              return (
                <Pressable
                  key={label}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  aria-selected={selected}
                  accessibilityState={{ selected }}
                  onPress={() => p.onCategory(label)}
                  testID={`control-settings-tab-${label}`}
                  style={({ pressed }) => [
                    st.railItem,
                    short && st.railItemShort,
                    narrow && st.railItemNarrow,
                    selected && st.railItemActive,
                    pressed && st.pressed,
                  ]}
                >
                  {selected ? <View style={[st.railIndicator, { backgroundColor: accent.railBar }]} /> : null}
                  <Ionicons name={glyph} size={narrow ? 13 : 15} color={selected ? c.ink : c.muted} />
                  <Text numberOfLines={1} style={[st.railLabel, narrow && st.railLabelNarrow, selected && st.railLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Right Content Area */}
        <View style={st.mainPane}>
          <View style={[st.paneHeader, short && st.paneHeaderShort]}>
            <View style={st.paneTitleGroup}>
              {activeSubview !== 'tabs' && p.onBackSubview ? (
                <Pressable
                  accessibilityLabel="返回设置"
                  accessibilityRole="button"
                  onPress={p.onBackSubview}
                  style={({ pressed }) => [st.backSubviewBtn, pressed && st.pressed]}
                  testID="control-settings-subview-back"
                >
                  <Ionicons name="chevron-back" size={15} color={accent.ink} />
                  <Text numberOfLines={1} style={[st.backSubviewText, { color: accent.ink }]}>返回</Text>
                </Pressable>
              ) : null}
              <Text accessibilityRole="header" numberOfLines={1} style={st.paneTitle}>
                {activeSubview !== 'tabs' ? (p.subviewTitle ?? activeTab) : activeTab}
              </Text>
            </View>

            <Pressable
              testID="control-close-settings"
              accessibilityLabel="关闭设置"
              accessibilityRole="button"
              onPress={p.onClose}
              style={({ pressed }) => [st.closeBtn, pressed && st.pressed]}
            >
              <Ionicons name="close" size={17} color={c.ink} />
            </Pressable>
          </View>

          {activeSubview === 'layout' || activeSubview === 'input' ? (
            <View style={st.subviewBody} testID="control-settings-subview-body">{content}</View>
          ) : (
            <ScrollView
              key={`${activeSubview}-${activeTab}`}
              testID="control-settings-scroll"
              style={st.bodyScroll}
              contentContainerStyle={st.content}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              overScrollMode="never"
              showsVerticalScrollIndicator={Platform?.OS !== 'web'}
            >
              <FsdTabReveal>{content}</FsdTabReveal>
            </ScrollView>
          )}
        </View>
      </View>
    </FsdSheetMotion>
  );
}

const st = StyleSheet.create({
  root: { position: 'absolute', left: 12, right: 12, alignItems: 'center', elevation: 16, zIndex: 16 },
  consoleShell: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    maxWidth: 920,
    backgroundColor: controlSettingsColors.glass,
    borderColor: controlSettingsColors.line,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },

  /* Left Sidebar Rail */
  sidebar: {
    backgroundColor: controlSettingsColors.sidebar,
    borderRightColor: controlSettingsColors.lineSoft,
    borderRightWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 12,
  },
  sidebarShort: {
    gap: 8,
    paddingVertical: 9,
  },
  sidebarNarrow: {
    paddingHorizontal: 6,
  },
  sidebarBrand: {
    gap: 4,
    paddingHorizontal: 6,
  },
  sidebarTitle: {
    color: controlSettingsColors.ink,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  sidebarStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#6B6B6B',
  },
  statusDotLive: {
    backgroundColor: controlSettingsColors.green,
  },
  sidebarStatusText: {
    color: controlSettingsColors.muted,
    fontSize: 11.5,
    lineHeight: 15,
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
  },
  sidebarNav: {
    gap: 4,
  },
  railItem: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 10,
    position: 'relative',
  },
  railItemShort: {
    minHeight: 32,
  },
  railItemNarrow: {
    gap: 5,
    paddingHorizontal: 6,
  },
  railItemActive: {
    backgroundColor: controlSettingsColors.surface,
  },
  railIndicator: {
    borderRadius: 2,
    height: 16,
    left: 2,
    position: 'absolute',
    width: 3,
  },
  railLabel: {
    color: controlSettingsColors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  railLabelNarrow: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  railLabelActive: {
    color: controlSettingsColors.ink,
    fontWeight: '600',
  },

  /* Right Main Pane */
  mainPane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  paneHeader: {
    alignItems: 'center',
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  paneHeaderShort: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  paneTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  backSubviewBtn: {
    alignItems: 'center',
    backgroundColor: controlSettingsColors.surface,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 2,
    height: 28,
    paddingHorizontal: 8,
  },
  backSubviewText: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  paneTitle: {
    color: controlSettingsColors.ink,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  closeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  subviewBody: {
    flex: 1,
    minHeight: 0,
    padding: 12,
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  paneStack: {
    gap: 10,
  },

  /* Grouped Charcoal Wells (compact 37-40px row rhythm) */
  groupSection: {
    gap: 5,
  },
  groupHeading: {
    color: controlSettingsColors.muted,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    lineHeight: 15,
    paddingHorizontal: 4,
  },
  well: {
    backgroundColor: controlSettingsColors.surface,
    borderColor: controlSettingsColors.lineSoft,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 37,
    paddingVertical: 3.5,
  },
  rowLabelCol: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },

  /* Recessed Segmented Track & Gliding Pills */
  segTrack: {
    alignItems: 'center',
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.lineSoft,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    padding: 2,
  },
  segBtn: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 9,
  },
  segText: {
    color: controlSettingsColors.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  /* Standby 1x3 Scene Picker */
  sceneGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  sceneCard: {
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.line,
    borderRadius: 10,
    borderWidth: 1.5,
    flex: 1,
    overflow: 'hidden',
  },
  sceneThumbWrap: {
    backgroundColor: '#161616',
    height: 78,
    overflow: 'hidden',
    width: '100%',
  },
  sceneThumb: {
    height: '100%',
    width: '100%',
  },
  sceneLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sceneLabelText: {
    color: controlSettingsColors.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  sceneActiveDot: {
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },

  /* Sliders & Steppers */
  stepperWrap: {
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingVertical: 5,
  },
  stepperHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  stepBtn: {
    alignItems: 'center',
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.line,
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  speedReadout: {
    color: controlSettingsColors.ink,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 17,
    minWidth: 42,
    textAlign: 'center',
  },
  presetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    alignItems: 'center',
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.lineSoft,
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  presetChipText: {
    color: controlSettingsColors.muted,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 15,
  },
  qualityBlock: {
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
    paddingVertical: 6,
  },
  storageRow: {
    gap: 5,
    paddingVertical: 7,
  },
  storageTrack: {
    backgroundColor: controlSettingsColors.track,
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
  },

  /* Inline Action Buttons */
  inlineBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  inlineActionBtn: {
    alignItems: 'center',
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
  },
  inlineActionText: {
    color: controlSettingsColors.ink,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  stopNowBtn: {
    backgroundColor: '#DC2626',
    borderColor: 'rgba(254, 202, 202, 0.55)',
  },

  /* Connection Radar & Hero Device */
  radarSection: {
    gap: 6,
    paddingVertical: 5,
  },
  radarSectionEmbedded: {
    paddingVertical: 1,
  },
  radarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  radarHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroDeviceRow: {
    alignItems: 'center',
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 42,
    paddingVertical: 4,
  },
  heroDeviceLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  manualConnWrap: {
    gap: 6,
    paddingVertical: 4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputField: {
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: controlSettingsColors.ink,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    height: 38,
    includeFontPadding: false,
    paddingHorizontal: 10,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  leaseSlot: {
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },

  /* Maintenance Chips & 4-Leg Motor Matrix */
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 6,
  },
  actionChip: {
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
  },
  actionChipDanger: {
    borderColor: 'rgba(248, 113, 113, 0.48)',
  },
  actionChipText: {
    color: controlSettingsColors.ink,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  motorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 6,
  },
  motorCell: {
    backgroundColor: controlSettingsColors.track,
    borderColor: controlSettingsColors.lineSoft,
    borderRadius: 9,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  motorCellBad: {
    backgroundColor: 'rgba(248, 113, 113, 0.10)',
    borderColor: 'rgba(248, 113, 113, 0.50)',
  },
  motorDot: {
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },

  /* About & Privacy */
  brandHeader: {
    alignItems: 'center',
    borderBottomColor: controlSettingsColors.lineSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 8,
  },
  privacyHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    paddingTop: 4,
  },
  tipsBox: {
    gap: 5,
    paddingBottom: 8,
    paddingTop: 4,
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.72,
  },
});
