import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ControlPanelMotion } from './ControlPanelMotion';
import { GestureDeckPanel } from './ControlHudPanels';
import type { HudGestureCategoryId, HudGestureInput } from './controlHudModel';
import { Text } from './AppText';
import type { ControlInputSource, ControlRuntimeState } from '../features/control/controlOperations';

export const controlHudColors = {
  ink: '#FCFCFD', muted: 'rgba(252,252,253,0.72)', line: 'rgba(252,252,253,0.30)',
  glass: 'rgba(136,153,175,0.23)', blue: '#52A9FF', green: '#30D158', red: '#FF002B',
};

export const controlSettingsColors = {
  ...controlHudColors,
  ink: '#EDF2EE',
  muted: '#9AA39E',
  line: 'rgba(232, 238, 233, 0.14)',
  glass: 'rgba(18, 23, 22, 0.92)',
  surface: 'rgba(28, 35, 33, 0.88)',
  surfaceElevated: 'rgba(38, 47, 45, 0.94)',
  blue: '#3B6EF6',
  blueBorder: 'rgba(147, 197, 253, 0.58)',
  blueSoft: 'rgba(59, 110, 246, 0.20)',
  green: '#22C55E',
  canvas: 'rgba(8, 12, 11, 0.78)',
};

// Optional observations never imply a writable robot capability.
export type ControlSettingsSnapshot = Readonly<{
  sensitivity?: number; speedLimit?: number; mirrored?: boolean; lowLatency?: boolean;
  quality?: '流畅' | '标清' | '高清' | '超清'; recording?: boolean;
  volume?: number; microphone?: boolean; wifiName?: string;
  firmware?: string; storageUsedGb?: number; storageTotalGb?: number; appVersion?: string;
}>;
export type ControlSettingsCategory = '通用' | '操控' | '视频' | '音频' | '网络' | '机器人' | '安全' | '关于';

export function DosoWordmark({ width = 92, color = controlHudColors.ink }: { width?: number; color?: string }) {
  return <View accessible accessibilityLabel="DOSO" style={{ width, height: width / 4.4, overflow: 'hidden' }}>
    <Image source={require('../../assets/brand/doso-auth-lockup.png')} tintColor={color}
      resizeMode="stretch" style={{ position: 'absolute', width: width * 1.534, height: width / 4.4 * 2.95, left: -width * .49, top: -width / 4.4 * 1.02 }} />
  </View>;
}

export function PostureGlyph({ posture, size = 26, color = controlHudColors.ink }: { posture: 'stand' | 'sit' | 'prone'; size?: number; color?: string }) {
  const line = (left: number, top: number, width: number, angle = 0) => <View style={{ position: 'absolute', left: left * size, top: top * size, width: width * size, height: Math.max(1.2, size * .055), borderRadius: 2, backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }} />;
  return <View accessible={false} style={{ width: size, height: size }}>
    {line(.16, posture === 'prone' ? .64 : .36, .57)}
    {line(.67, posture === 'prone' ? .53 : .24, .19, -35)}
    {line(.78, posture === 'prone' ? .48 : .18, .12)}
    {line(.08, posture === 'prone' ? .59 : .29, .16, 40)}
    {posture === 'stand' ? <>{line(.12, .52, .27, -58)}{line(.19, .72, .2, 48)}{line(.51, .53, .27, 60)}{line(.64, .74, .18, -45)}</>
      : posture === 'sit' ? <>{line(.15, .5, .26, 55)}{line(.14, .7, .3)}{line(.53, .55, .36, 78)}{line(.57, .75, .24)}</>
        : <>{line(.16, .75, .28)}{line(.56, .75, .28)}</>}
  </View>;
}

type SettingsProps = {
  width: number; height: number; category: ControlSettingsCategory; onCategory: (value: ControlSettingsCategory) => void;
  snapshot?: ControlSettingsSnapshot; overlay: boolean; onOverlay: () => void; onClose: () => void;
  onLayout: () => void; onInput?: () => void; onConnection?: () => void; onDiagnostics?: () => void;
  onPostures: () => void; onActions?: () => void; onPolicy: () => void; ownerLabel: string;
  lease: ReactNode;
  robotName: string; connected: boolean; endpointLabel?: string;
  runtimeState?: ControlRuntimeState; inputSource: ControlInputSource; videoLabel: string;
  inHudOverlay?: boolean;
  docksExpanded?: boolean;
  onToggleDocks?: () => void;
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
  recordingActive?: boolean;
  recordingDurationLabel?: string | null;
  mediaStatusLabel?: string;
  mediaStorageLabel?: string;
  mediaLastSavedLabel?: string | null;
  onToggleRecord?: () => void;
  onCapturePhoto?: () => void;
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
};

export function renderControlSettings(p: SettingsProps) {
  const compact = p.height < 460 || p.width < 920;
  const s = compact ? 0.90 : Math.max(0.95, Math.min(1.10, p.width / 1280));
  const sp = (v: number) => Math.round(v * s);
  const c = controlSettingsColors;
  const text = { color: c.ink, fontSize: sp(14), lineHeight: sp(20), fontWeight: '500' as const };
  const small = { color: c.muted, fontSize: sp(12.5), lineHeight: sp(18), fontWeight: '400' as const };
  const rawHudRatio = Math.min(p.width / 960, p.height / 540);
  const hudScale = p.inHudOverlay ? (rawHudRatio < 1 ? Math.max(0.90, rawHudRatio) : Math.min(1.22, 1 + (rawHudRatio - 1) * 0.22)) : 1;
  const topOffset = p.inHudOverlay ? Math.round(64 * hudScale) : Math.max(66, p.height * .133);
  const bottomOffset = p.inHudOverlay ? Math.round(16 * hudScale) : Math.max(14, p.height * .035);
  const shellMaxWidth = p.inHudOverlay ? Math.min(980, Math.max(760, Math.round(p.width * 0.74))) : 940;
  const categories: readonly [ControlSettingsCategory, keyof typeof Ionicons.glyphMap][] = [
    ['通用', 'settings-outline'], ['操控', 'game-controller-outline'], ['视频', 'videocam-outline'], ['音频', 'volume-high-outline'],
    ['网络', 'wifi-outline'], ['机器人', 'hardware-chip-outline'], ['安全', 'shield-checkmark-outline'], ['关于', 'information-circle-outline'],
  ];
  const snapshot = p.snapshot ?? {};
  const observed = p.connected && p.runtimeState?.controlLink === 'connected' ? p.runtimeState : undefined;
  const inputLabel = p.inputSource === 'physical' ? 'G20 实体摇杆' : '屏幕虚拟摇杆';
  const ownerLabel = observed ? p.ownerLabel : '未读取';
  const postureLabel = observed?.posture === 'standing' ? '站立' : observed?.posture === 'sitting' ? '坐下' : '未读取';
  const motorLabel = observed?.motorState === 'enabled' ? '已使能' : observed?.motorState === 'disabled' ? '已失能' : '未读取';
  const policyLabel = observed?.currentPolicy?.label ?? '未读取';
  const icon = (name: keyof typeof Ionicons.glyphMap, size = 18, tint = c.ink) => <Ionicons name={name} size={Math.max(15, Math.round(size * s))} color={tint} />;
  const value = (label: string, highlighted = false) => <Text style={[small, { color: highlighted ? c.green : c.muted, textAlign: 'right', flexShrink: 1, maxWidth: '60%', fontSize: sp(12.5), lineHeight: sp(18), fontWeight: highlighted ? '600' : '400', fontVariant: ['tabular-nums'] }]}>{label}</Text>;
  const toggle = (id: string, val: boolean | undefined, change?: () => void) => <Pressable testID={id} accessibilityRole="switch"
    accessibilityLabel={{
      'control-setting-overlay': '画面叠加信息',
      'control-setting-hud-dashboard': '底部仪表盘常驻展开',
      'control-setting-dual-camera': '双广角画中画',
      'control-setting-stop-confirm': '急停二次确认',
      'control-setting-mirror': '镜像控制',
      'control-setting-latency': '低延迟模式',
      'control-setting-recording': '自动录像',
      'control-setting-microphone': '麦克风',
    }[id] ?? '设备设置'}
    aria-checked={val === undefined ? undefined : val}
    accessibilityState={{ checked: val, disabled: !change }}
    accessibilityHint={!change ? '当前设备未提供此设置接口' : undefined}
    accessibilityValue={{ text: val === undefined ? '未接入' : val ? '开启' : '关闭' }}
    disabled={!change}
    onPress={change}
    hitSlop={8}
    style={{
      width: 44, height: 24, borderRadius: 12, borderWidth: 1,
      borderColor: val ? c.blueBorder : c.line,
      backgroundColor: val ? c.blue : 'rgba(255,255,255,0.12)',
      justifyContent: 'center', padding: 2, opacity: change ? 1 : 0.65,
    }}>
    <View style={{ width: 18, height: 18, borderRadius: 9, alignSelf: val ? 'flex-end' : 'flex-start', backgroundColor: '#FFFFFF', opacity: val === undefined ? .65 : 1 }} />
  </Pressable>;
  const slider = (id: string, val: number | undefined, label: string, suffix: string, displayed?: string) => <View style={st.sliderRow} accessible accessibilityLabel={`${label} ${val === undefined ? '未接入' : displayed ?? val + suffix}`} accessibilityState={{ disabled: true }} testID={id}>
    <View style={st.sliderTrack}><View style={[st.sliderFill, { width: `${Math.max(0, Math.min(100, val ?? 0))}%` }]} />
      {val !== undefined ? <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, val))}%`, top: -5, width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: c.blueBorder, backgroundColor: '#FFFFFF', transform: [{ translateX: -8 }] }} /> : null}</View>
    <Text style={[small, { minWidth: 54, textAlign: 'right', fontWeight: '600', color: val === undefined ? c.muted : c.ink, fontVariant: ['tabular-nums'] }]}>{val === undefined ? '未接入' : displayed ?? `${val}${suffix}`}</Text>
  </View>;
  const row = (label: string, valNode: ReactNode, description?: string) => <View style={[st.row, { borderColor: c.line }]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={text}>{label}</Text>
      {description ? <Text numberOfLines={label === '急停二次确认' ? undefined : 1} style={small}>{description}</Text> : null}
    </View>
    {valNode}
  </View>;
  const link = (id: string, label: string, onPress?: () => void, detail?: string) => <Pressable testID={id} accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} accessibilityState={{ disabled: !onPress }} onPress={onPress} style={({ pressed }) => [st.row, { borderColor: c.line, opacity: !onPress ? .55 : pressed ? .65 : 1 }]}>
    <Text style={[text, { flex: 1 }]}>{label}</Text>
    {detail ? <Text style={[small, { maxWidth: '52%', textAlign: 'right', color: onPress ? '#93C5FD' : c.muted }]}>{detail}</Text> : null}
    {onPress ? icon('chevron-forward', 16, c.muted) : null}
  </Pressable>;
  const panel = (title: string, glyph: keyof typeof Ionicons.glyphMap, children: ReactNode, flex = 1) => <View style={[st.card, { flexGrow: flex, flexBasis: 'auto' }]}>
    <View style={st.panelHeading}>
      <View style={st.panelTitleIcon}>{icon(glyph, 16, '#93C5FD')}</View>
      <Text accessibilityRole="header" style={[st.panelTitle, { fontSize: sp(15), lineHeight: sp(21) }]}>{title}</Text>
    </View>
    <View style={{ gap: 2 }}>{children}</View>
  </View>;
  const twoCol = p.width >= 640;
  const columns = (left: ReactNode, right: ReactNode) => <View testID={`control-settings-page-${p.category}`} style={[st.columns, !twoCol && st.columnsStacked]}>
    <View style={st.column}>{left}</View>
    <View style={st.column}>{right}</View>
  </View>;
  const layoutLink = () => link('control-open-joystick-layout', '圆盘布局', p.onLayout);
  const inputLink = () => link('control-open-input', '遥控器输入', p.onInput, inputLabel);
  const connectionLink = () => link('control-settings-connection', '连接机器狗', p.onConnection, p.connected ? '已连接' : '未连接');
  const modeLink = () => link('control-open-policy', '地形模式', p.onPolicy, policyLabel);
  const postureLink = () => link('control-open-gestures', '姿态动作', p.onPostures, postureLabel);
  const diagnosticsLink = () => link('control-open-diagnostics', '电机诊断', p.onDiagnostics);
  const overlayRow = () => row('画面叠加信息', toggle('control-setting-overlay', p.overlay, p.onOverlay));
  const storage = () => <>
    {row('已用空间', value(snapshot.storageUsedGb === undefined ? '未读取' : `${snapshot.storageUsedGb} GB`))}
    {row('总容量', value(snapshot.storageTotalGb === undefined ? '未读取' : `${snapshot.storageTotalGb} GB`))}
    <View accessibilityLabel="存储使用比例" style={st.storageTrack}>
      {snapshot.storageUsedGb !== undefined && snapshot.storageTotalGb ? <View style={{ width: `${Math.max(0, Math.min(100, snapshot.storageUsedGb / snapshot.storageTotalGb * 100))}%`, height: '100%', backgroundColor: c.blue }} /> : null}
    </View>
  </>;
  const hudSpeedVal = typeof p.speedLimitPercent === 'number' ? Math.min(100, Math.max(10, Math.round(p.speedLimitPercent))) : null;
  const speedLimitControl = hudSpeedVal !== null && p.onChangeSpeedLimit ? (
    <View style={{ paddingVertical: 8, gap: 8, borderBottomWidth: .5, borderColor: c.line }} testID="control-setting-speed-limit">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={text}>最大速度限制</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            accessibilityLabel="降低速度限制"
            accessibilityRole="button"
            disabled={hudSpeedVal <= 10}
            onPress={() => p.onChangeSpeedLimit?.(hudSpeedVal - 10)}
            style={({ pressed }) => [st.stepBtn, hudSpeedVal <= 10 && st.stepBtnDisabled, pressed && st.pressed]}
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
            style={({ pressed }) => [st.stepBtn, hudSpeedVal >= 100 && st.stepBtnDisabled, pressed && st.pressed]}
            testID="control-setting-speed-inc"
          >
            <Ionicons color={c.ink} name="add" size={14} />
          </Pressable>
        </View>
      </View>
      <View style={st.sliderTrack}><View style={[st.sliderFill, { width: `${hudSpeedVal}%` }]} /></View>
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
              style={[st.presetChip, active && st.presetChipActive]}
              testID={`control-setting-speed-preset-${preset}`}
            >
              <Text style={[st.presetChipText, active && st.presetChipTextActive]}>{`${preset}%`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : row('最大速度限制', slider('control-setting-speed-limit', snapshot.speedLimit === undefined ? undefined : snapshot.speedLimit / 2.4 * 100, '最大速度限制', '%', `${snapshot.speedLimit} m/s`));

  let content: ReactNode;
  switch (p.category) {
    case '通用':
      content = columns(<>
        {panel('显示设置', 'options-outline', <>
          {overlayRow()}
          {p.onToggleDocks ? row('底部仪表盘常驻展开', toggle('control-setting-hud-dashboard', Boolean(p.docksExpanded), p.onToggleDocks), '收起时仅保留照明/图传/续航指示条') : null}
          {p.webStageMode && p.onToggleWebStageMode ? row('视口比例', (
            <View style={st.inlineSegmentRow}>
              <Pressable
                accessibilityLabel="16:9 掌机目标比例"
                accessibilityRole="button"
                accessibilityState={{ selected: p.webStageMode === 'g20-16-9' }}
                onPress={() => { if (p.webStageMode !== 'g20-16-9') p.onToggleWebStageMode?.(); }}
                style={[st.inlineSegmentChip, p.webStageMode === 'g20-16-9' && st.inlineSegmentChipActive]}
                testID="control-setting-viewport-g20"
              >
                <Text style={[st.inlineSegmentText, p.webStageMode === 'g20-16-9' && st.inlineSegmentTextActive]}>16:9 掌机目标</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="铺满浏览器窗口"
                accessibilityRole="button"
                accessibilityState={{ selected: p.webStageMode === 'fill' }}
                onPress={() => { if (p.webStageMode !== 'fill') p.onToggleWebStageMode?.(); }}
                style={[st.inlineSegmentChip, p.webStageMode === 'fill' && st.inlineSegmentChipActive]}
                testID="control-setting-viewport-fill"
              >
                <Text style={[st.inlineSegmentText, p.webStageMode === 'fill' && st.inlineSegmentTextActive]}>铺满浏览器</Text>
              </Pressable>
            </View>
          ), '桌面浏览器锁定 16:9 目标画幅，避免拉伸变形') : null}
          {row('界面风格', value('G20 深色战术 HUD'))}
          {row('语言', value('简体中文'))}
        </>, 1.1)}
        {panel('使用偏好', 'resize-outline', <>{layoutLink()}{inputLink()}</>)}
      </>, <>
        {panel('当前设备', 'hardware-chip-outline', <>{row('名称', value(p.robotName))}{row('连接状态', value(p.connected ? '已连接' : '未连接', p.connected))}{row('当前控制者', value(ownerLabel))}</>, 1.1)}
        {panel('快捷入口', 'grid-outline', <>
          {connectionLink()}
          {diagnosticsLink()}
          {p.onOpenWorkspaceSettings ? link('control-settings-open-workspace', '全局设备与主题设置', p.onOpenWorkspaceSettings, '工作台') : null}
        </>)}
      </>); break;
    case '操控':
      content = columns(<>
        {panel('摇杆设置', 'game-controller-outline', <>
          {p.onSelectInputSource ? row('输入源切换', (
            <View style={st.inlineSegmentRow}>
              <Pressable
                accessibilityLabel="使用屏幕虚拟摇杆"
                accessibilityRole="button"
                accessibilityState={{ selected: p.inputSource === 'touch' }}
                onPress={() => p.onSelectInputSource?.('touch')}
                style={[st.inlineSegmentChip, p.inputSource === 'touch' && st.inlineSegmentChipActive]}
                testID="control-setting-source-touch"
              >
                <Text style={[st.inlineSegmentText, p.inputSource === 'touch' && st.inlineSegmentTextActive]}>触屏摇杆</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="使用 G20 实体摇杆"
                accessibilityRole="button"
                accessibilityState={{ disabled: !p.physicalInputReady, selected: p.inputSource === 'physical' }}
                disabled={!p.physicalInputReady}
                onPress={() => p.onSelectInputSource?.('physical')}
                style={[st.inlineSegmentChip, p.inputSource === 'physical' && st.inlineSegmentChipActive, !p.physicalInputReady && st.stepBtnDisabled]}
                testID="control-setting-source-physical"
              >
                <Text style={[st.inlineSegmentText, p.inputSource === 'physical' && st.inlineSegmentTextActive]}>G20 手柄</Text>
              </Pressable>
            </View>
          )) : null}
          {row('摇杆灵敏度', slider('control-setting-sensitivity', snapshot.sensitivity, '摇杆灵敏度', '%'))}
          {row('镜像控制', toggle('control-setting-mirror', snapshot.mirrored))}
          {inputLink()}
        </>, 1.35)}
        {panel('圆盘布局', 'move-outline', <>{layoutLink()}{row('松手回零', value('自动 · 50Hz 零速清零'))}</>)}
      </>, <>
        {panel('运动设置', 'speedometer-outline', <>
          {p.onSelectSpeedMode ? row('速度档位', (
            <View style={st.inlineSegmentRow}>
              <Pressable
                accessibilityLabel="标准档位 1.0 m/s"
                accessibilityRole="button"
                accessibilityState={{ disabled: !observed || p.speedMode === 'unsupported', selected: p.speedMode !== 'high' }}
                disabled={!observed || p.speedMode === 'unsupported'}
                onPress={() => { if (p.speedMode === 'high') p.onSelectSpeedMode?.('normal'); }}
                style={[st.inlineSegmentChip, p.speedMode !== 'high' && st.inlineSegmentChipActive, (!observed || p.speedMode === 'unsupported') && st.stepBtnDisabled]}
                testID="control-setting-speed-mode-normal"
              >
                <Text style={[st.inlineSegmentText, p.speedMode !== 'high' && st.inlineSegmentTextActive]}>标准 1.0</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="高速档位 2.5 m/s"
                accessibilityRole="button"
                accessibilityState={{ disabled: !observed || p.speedMode === 'unsupported', selected: p.speedMode === 'high' }}
                disabled={!observed || p.speedMode === 'unsupported'}
                onPress={() => { if (p.speedMode !== 'high') p.onSelectSpeedMode?.('high'); }}
                style={[st.inlineSegmentChip, p.speedMode === 'high' && st.inlineSegmentChipActive, (!observed || p.speedMode === 'unsupported') && st.stepBtnDisabled]}
                testID="control-setting-speed-mode-high"
              >
                <Text style={[st.inlineSegmentText, p.speedMode === 'high' && st.inlineSegmentTextActive]}>高速 2.5</Text>
              </Pressable>
            </View>
          ), p.speedMode === 'unsupported' ? '当前固件未开放底层速度档位切换' : '高速档位最高 2.5 m/s，需开阔平坦场地') : null}
          {speedLimitControl}
          {row('低延迟模式', toggle('control-setting-latency', snapshot.lowLatency))}
          {row('当前控制者', value(ownerLabel))}
        </>, 1.35)}
        {panel('姿态与模式', 'walk-outline', <>
          {postureLink()}
          {p.onActions ? link('control-open-action-deck', '预设动作抽屉', p.onActions, p.gestures?.length ? `${p.gestures.length} 个动作` : undefined) : null}
          {modeLink()}
        </>)}
      </>); break;
    case '视频':
      content = columns(<>
        {panel('画面设置', 'videocam-outline', <>
          {p.primaryCamera && p.onSwapCamera ? row('主视角相机', (
            <Pressable
              accessibilityLabel={`切换主画面视角，当前${p.primaryCamera === 'front' ? '前视角' : '后视角'}`}
              accessibilityRole="button"
              onPress={p.onSwapCamera}
              style={({ pressed }) => [st.inlineActionBtn, pressed && st.pressed]}
              testID="control-setting-camera-swap"
            >
              <Ionicons color="#93C5FD" name="camera-reverse-outline" size={14} />
              <Text style={st.inlineActionText}>{p.primaryCamera === 'front' ? '前广角视角' : '后广角视角'}</Text>
            </Pressable>
          )) : null}
          {p.onToggleDualCamera ? row('双广角画中画', toggle('control-setting-dual-camera', Boolean(p.dualCameraEnabled), p.onToggleDualCamera), '右上角浮窗可一键互换主/次视角') : null}
          {p.headlightMode && p.onToggleHeadlight ? row('照明灯本地预览', (
            <Pressable
              accessibilityLabel="切换补光灯预览状态"
              accessibilityRole="button"
              onPress={p.onToggleHeadlight}
              style={({ pressed }) => [st.inlineActionBtn, p.headlightMode !== 'off' && st.inlineSegmentChipActive, pressed && st.pressed]}
              testID="control-setting-headlight"
            >
              <Ionicons color={p.headlightMode !== 'off' ? '#FFFFFF' : '#93C5FD'} name="flashlight-outline" size={14} />
              <Text style={[st.inlineActionText, p.headlightMode !== 'off' && st.inlineSegmentTextActive]}>
                {p.headlightMode === 'off' ? '已关闭' : p.headlightMode === 'front' ? '前灯开启' : '前后全开'}
              </Text>
            </Pressable>
          )) : null}
          <View style={{ paddingVertical: 8, gap: 10 }}><Text style={text}>视频清晰度</Text>
            <View style={st.segments}>{(['流畅', '标清', '高清', '超清'] as const).map(quality => <View key={quality} accessible accessibilityLabel={`${quality}，当前不可调整`} accessibilityState={{ disabled: true, selected: snapshot.quality === quality }} style={[st.segment, { minHeight: 32, backgroundColor: snapshot.quality === quality ? c.blue : 'transparent', borderColor: 'transparent' }]}><Text style={[small, { color: snapshot.quality === quality ? '#FFFFFF' : c.muted }]}>{quality}</Text></View>)}</View>
          </View>
          {overlayRow()}
        </>, 1.3)}
        {panel('视频连接', 'radio-outline', <>{row('画面状态', value(p.videoLabel))}{row('图传链路', value('WebRTC WHEP / 本地仿真流'))}{connectionLink()}</>)}
      </>, <>
        {panel('录像设置', 'recording-outline', <>
          {row('自动录像', toggle('control-setting-recording', snapshot.recording))}
          {row('录像与抓拍管理', value(p.mediaStatusLabel ?? '待接入', Boolean(p.recordingActive)))}
          {p.mediaStorageLabel ? row('落盘位置', value(p.mediaStorageLabel)) : null}
          {p.mediaLastSavedLabel ? row('最近保存', value(p.mediaLastSavedLabel)) : null}
          {p.onCapturePhoto || p.onToggleRecord ? row('端侧采集操作', (
            <View style={st.inlineSegmentRow}>
              {p.onCapturePhoto ? (
                <Pressable
                  accessibilityLabel="抓拍当前视角"
                  accessibilityRole="button"
                  onPress={p.onCapturePhoto}
                  style={({ pressed }) => [st.inlineActionBtn, pressed && st.pressed]}
                  testID="control-setting-capture-photo"
                >
                  <Ionicons color="#93C5FD" name="camera-outline" size={14} />
                  <Text style={st.inlineActionText}>抓拍</Text>
                </Pressable>
              ) : null}
              {p.onToggleRecord ? (
                <Pressable
                  accessibilityLabel={p.recordingActive ? '结束当前录屏' : '开始录制当前视频'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: Boolean(p.recordingActive) }}
                  onPress={p.onToggleRecord}
                  style={({ pressed }) => [st.inlineActionBtn, p.recordingActive && st.inlineSegmentChipActive, pressed && st.pressed]}
                  testID="control-setting-record-toggle"
                >
                  <Ionicons color={p.recordingActive ? '#FFFFFF' : '#93C5FD'} name={p.recordingActive ? 'stop-circle-outline' : 'videocam-outline'} size={14} />
                  <Text style={[st.inlineActionText, p.recordingActive && st.inlineSegmentTextActive]}>
                    {p.recordingActive ? `停止 (${p.recordingDurationLabel ?? '00:00'})` : '开始录屏'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )) : null}
        </>)}
        {panel('存储空间', 'server-outline', storage(), 1.3)}
      </>); break;
    case '音频':
      content = columns(<>
        {panel('扬声器', 'volume-high-outline', <>
          <View style={st.featureIcon}>{icon('volume-high-outline', 44, c.muted)}<Text style={small}>机器人扬声器</Text></View>
          {row('音量', slider('control-setting-volume', snapshot.volume, '扬声器音量', '%'))}
          {row('音频输出', value('未接入'))}
        </>)}
      </>, <>
        {panel('麦克风', 'mic-outline', <>
          <View style={st.featureIcon}>{icon('mic-outline', 44, c.muted)}<Text style={small}>双向语音对讲</Text></View>
          {row('麦克风', toggle('control-setting-microphone', snapshot.microphone))}
          {row('对讲服务', value('未接入'))}
        </>)}
      </>); break;
    case '网络':
      content = columns(<>
        {panel('机器狗连接', 'link-outline', <>
          {row('设备名称', value(p.robotName))}
          {row('设备地址', value(p.endpointLabel ?? '未读取'))}
          {row('连接状态', value(p.connected ? '已连接' : '未连接', p.connected))}
          {connectionLink()}
        </>, 1.2)}
        {panel('终端网络', 'wifi-outline', <>{row('Wi-Fi', value(snapshot.wifiName ?? '未读取'))}{row('通信协议', value('Brainstem gRPC :13145'))}</>)}
      </>, <>
        {panel('控制权', 'key-outline', <>{row('当前控制者', value(ownerLabel))}<View style={{ paddingVertical: 8 }}>{p.lease ?? <Text style={small}>{!p.connected ? '连接后查看控制权' : p.inputSource === 'touch' ? '触屏请求随摇杆操作发起（50Hz WalkChecked）' : '当前无可用的控制权操作'}</Text>}</View></>, 1.2)}
        {panel('App 输入', 'game-controller-outline', <>{row('当前来源', value(inputLabel))}{inputLink()}</>)}
      </>); break;
    case '机器人': {
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
          style={({ pressed }) => [st.actionChip, opts.active && st.actionChipActive, opts.danger && st.actionChipDanger, (opts.disabled || !onPress) && st.actionChipDisabled, pressed && st.pressed]}
        >
          <Text numberOfLines={1} style={[st.actionChipText, { fontSize: sp(13), lineHeight: sp(18) }, opts.active && st.actionChipTextActive]}>{label}</Text>
        </Pressable>
      );
      const blockedNote = (ready: boolean | undefined, hint?: string) => !ready && observed && hint
        ? <Text numberOfLines={1} style={[small, { paddingTop: 4 }]}>{hint}</Text> : null;
      const motorHealth = (joint: (typeof joints)[number]) => joint.fault === 'active' || (joint.errors?.length ?? 0) > 0 ? '故障'
        : joint.online !== true ? '离线' : joint.statusCode === 2 ? '运行' : joint.statusCode === 1 ? '待机' : joint.statusCode === 0 ? '复位' : '在线';
      content = <View style={{ gap: 12 }} testID="control-settings-page-机器人">
        <View style={[st.columns, !twoCol && st.columnsStacked]}>
          <View style={st.column}>
            {panel('机器人状态', 'hardware-chip-outline', <>
              {row('姿态 · 电机', value(`${postureLabel} · ${motorLabel}`, observed?.motorState === 'enabled'))}
              {row('当前模式', value(policyLabel))}
            </>)}
            {panel('标定与维护', 'construct-outline', <>
              <View style={st.chipWrap}>
                {chip('control-settings-set-zero', '电机标零', p.onSetZero, { disabled: !observed || !p.zeroReady, hint: p.zeroHint, danger: true })}
                {chip('control-settings-clear-fault', '清除故障', p.onClearMotorFault, { disabled: !observed || !p.clearFaultReady })}
              </View>
              {blockedNote(p.zeroReady, p.zeroHint)}
            </>)}
            {panel('运动模式', 'git-branch-outline', <>
              <View style={st.chipWrap} testID="control-settings-mode-list">
                {livePolicies.length > 0
                  ? livePolicies.map(option => chip(`control-settings-mode-${option.id}`, option.label,
                    p.onSelectPolicy ? () => p.onSelectPolicy?.(option.id) : undefined,
                    { active: option.selected, disabled: option.disabled || option.selected, hint: option.hint }))
                  : <Text style={small}>未读取</Text>}
              </View>
              {livePolicies.length > 0 ? blockedNote(!livePolicies.every(option => option.disabled && !option.selected), livePolicies.find(option => option.hint)?.hint) : null}
            </>)}
          </View>
          <View style={st.column}>
            {panel(`电机状态 ${joints.length ? `${onlineCount}/${joints.length}` : ''}`.trim(), 'speedometer-outline', <>
              {joints.length === 0 ? <Text style={small}>未读取</Text> : (
                <View style={st.motorGrid} testID="control-settings-motor-list">
                  {joints.map(joint => {
                    const health = motorHealth(joint);
                    const bad = health === '故障' || health === '离线';
                    return (
                      <View key={joint.id} style={[st.motorCell, bad && st.motorCellBad]} testID={`control-settings-motor-${joint.id}`}
                        accessible accessibilityLabel={`${joint.label} ${health}`}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[st.motorDot, { backgroundColor: bad ? '#F87171' : joint.online ? '#34D399' : '#737B80' }]} />
                          <Text numberOfLines={1} style={[text, { flex: 1, fontSize: sp(12.5), lineHeight: sp(17) }]}>{joint.label}</Text>
                        </View>
                        <Text numberOfLines={1} style={[small, { fontSize: sp(12), lineHeight: sp(16), fontVariant: ['tabular-nums'] }]}>
                          {[health,
                            typeof joint.temperatureC === 'number' && Number.isFinite(joint.temperatureC) ? `${Math.round(joint.temperatureC)}°C` : null,
                            typeof joint.positionDeg === 'number' && Number.isFinite(joint.positionDeg) ? `${Math.round(joint.positionDeg)}°` : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {p.onOpenHudJointParams ? link('control-settings-open-joint-params', '关节参数浮窗', p.onOpenHudJointParams, 'L1') : null}
              {p.onOpenHudJointTemp ? link('control-settings-open-joint-temp', '关节温度浮窗', p.onOpenHudJointTemp) : null}
              {link('control-open-diagnostics', '电机诊断', p.onDiagnostics)}
            </>, 1.4)}
          </View>
        </View>
        {panel(`动作${liveGestures.length ? ` (${liveGestures.length})` : ''}`, 'body-outline', <>
          {liveGestures.length > 0
            ? GestureDeckPanel({
              gestures: liveGestures,
              category: p.gestureCategory ?? 'all',
              onSelectCategory: next => p.onGestureCategoryChange?.(next),
              selectedGestureName: p.selectedGestureName ?? null,
              onSelectGesture: name => p.onSelectGesture?.(name),
              showGifPreview: p.gestureGifPreview ?? true,
              onToggleGifPreview: () => p.onToggleGestureGifPreview?.(),
              gestureDisabled: !observed || !p.gestureReady,
              gestureHint: p.gestureHint ?? (!observed ? '请先连接机器狗（当前可预览全部 35 个动作）' : undefined),
              onPlayGesture: p.onPlayGesture,
              variant: 'settings',
            })
            : <View style={st.chipWrap} testID="control-settings-gesture-list"><Text style={small}>{observed ? '暂无动作' : '未读取'}</Text></View>}
        </>)}
      </View>; break;
    }
    case '安全':
      content = columns(<>
        {panel('急停', 'stop-circle-outline', <>
          <View style={st.featureIcon}><Ionicons name="stop-circle" size={44} color={c.red} /><Text style={[text, { fontWeight: '600' }]}>软急停始终置顶可用</Text></View>
          {row('急停二次确认', toggle('control-setting-stop-confirm', false), '急停立即执行，不增加确认步骤')}
        </>, 1.35)}
        {panel('输入保护', 'hand-left-outline', <>{row('松开摇杆', value('立即发送零速并释放租约'))}{row('输入看门狗', value('150ms 无新鲜样本自动停发'))}{row('离开 / 切后台', value('强制清零并中断操控输入'))}</>)}
      </>, <>
        {panel('当前状态', 'shield-checkmark-outline', <>{row('电机', value(motorLabel))}{row('控制者', value(ownerLabel))}{row('故障', value(observed?.faultStatus === 'clear' ? '无已上报故障' : observed?.faultStatus === 'active' ? observed.faultSummary ?? '存在故障' : '未读取'))}</>, 1.35)}
        {panel('失联保护', 'radio-outline', <>{row('App 处理', value('停止运动发送并归零'))}{row('服务端保护', value(observed ? '租约超时自动回停' : '未读取'))}</>)}
      </>); break;
    case '关于':
      content = columns(<>
        {panel('DOSO', 'information-circle-outline', <>
          <View style={st.featureIcon}><DosoWordmark width={140} color={c.ink} /><Text style={small}>机器狗控制终端</Text></View>
          {row('应用版本', value(snapshot.appVersion ?? '0.0.1'))}
          {row('控制协议', value('Brainstem gRPC v2.2 / Recovery v1'))}
          {row('机器人固件', value(snapshot.firmware ?? '未读取'))}
        </>)}
      </>, <>
        {panel('界面素材', 'color-palette-outline', <>{row('字体', value('MiSans'))}{row('图标', value('Ionicons'))}{row('品牌', value('DOSO 原有素材'))}</>)}
        {panel('画面来源', 'image-outline', <>{row('当前画面', value(p.videoLabel))}<Text style={[small, { paddingVertical: 8 }]}>真机连接使用 WebRTC WHEP 实时图传；本地开发支持 MuJoCo 4.0 仿真推流（1080p）。未接入硬件的能力保持只读标注。</Text></>)}
      </>); break;
  }

  return <ControlPanelMotion testID="control-settings-menu" style={[st.root, { top: topOffset, bottom: bottomOffset }]}>
    <View style={[st.consoleShell, { maxWidth: shellMaxWidth }]}>
      <View style={[st.topHeader, { minHeight: sp(36) }]}>
        <View style={st.titleGroup}>
          <View style={[st.titleIconBox, { width: sp(30), height: sp(30) }]}><Ionicons name="settings-outline" size={sp(16)} color="#93C5FD" /></View>
          <Text accessibilityRole="header" style={[st.consoleTitle, { fontSize: sp(17), lineHeight: sp(23) }]}>操控设置</Text>
          <View style={st.deviceBadge}>
            <View style={[st.statusDot, p.connected ? st.statusDotLive : null]} />
            <Text style={[st.deviceBadgeText, { fontSize: sp(12.5), lineHeight: sp(17) }]}>{`${p.robotName} · ${p.connected ? '已连接' : '未连接'}`}</Text>
          </View>
        </View>
        <View style={st.headerActions}>
          {p.onOpenWorkspaceSettings ? (
            <Pressable
              accessibilityLabel="打开全局设置页面"
              accessibilityRole="button"
              onPress={p.onOpenWorkspaceSettings}
              style={({ pressed }) => [st.workspaceBtn, { height: sp(34), paddingHorizontal: sp(12) }, pressed && st.pressed]}
            >
              <Ionicons name="options-outline" size={sp(14)} color={c.ink} />
              <Text style={[st.workspaceBtnText, { fontSize: sp(12.5), lineHeight: sp(17) }]}>全局设置</Text>
            </Pressable>
          ) : null}
          <Pressable testID="control-close-settings" accessibilityLabel="关闭设置" accessibilityRole="button" onPress={p.onClose} style={({ pressed }) => [st.close, { width: sp(34), height: sp(34), borderRadius: sp(17) }, pressed && st.pressed]}>
            <Ionicons name="close" size={sp(18)} color={c.ink} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[st.tabStrip, { maxHeight: sp(42) }]} contentContainerStyle={st.tabStripContent}>
        {categories.map(([label, glyph]) => {
          const selected = p.category === label;
          return <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={label}
            aria-selected={selected}
            accessibilityState={{ selected }}
            onPress={() => p.onCategory(label)}
            testID={`control-settings-tab-${label}`}
            style={({ pressed }) => [st.navItem, { height: sp(34), paddingHorizontal: sp(13) }, selected && st.navItemActive, pressed && st.pressed]}
          >
            <Ionicons name={glyph} size={sp(15)} color={selected ? '#FFFFFF' : c.muted} />
            <Text numberOfLines={1} style={[st.navLabel, { fontSize: sp(13.5), lineHeight: sp(19) }, selected && st.navLabelActive]}>{label}</Text>
          </Pressable>;
        })}
      </ScrollView>

      <ScrollView key={p.category} testID="control-settings-scroll" style={st.bodyScroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <ControlPanelMotion style={{ flexGrow: 1 }}>{content}</ControlPanelMotion>
      </ScrollView>
    </View>
  </ControlPanelMotion>;
}

const st = StyleSheet.create({
  root: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 11 },
  consoleShell: {
    flex: 1,
    width: '100%',
    maxWidth: 940,
    backgroundColor: controlSettingsColors.glass,
    borderColor: controlSettingsColors.line,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 34 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  titleIconBox: { width: 28, height: 28, borderRadius: 9, backgroundColor: controlSettingsColors.blueSoft, borderColor: controlSettingsColors.blueBorder, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  consoleTitle: { color: controlSettingsColors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  deviceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderColor: controlSettingsColors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#757B77' },
  statusDotLive: { backgroundColor: controlSettingsColors.green },
  deviceBadgeText: { color: controlSettingsColors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workspaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderColor: controlSettingsColors.line, borderWidth: 1, borderRadius: 14, height: 34, paddingHorizontal: 12 },
  workspaceBtnText: { color: controlSettingsColors.ink, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', borderColor: controlSettingsColors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabStrip: { flexGrow: 0, maxHeight: 42 },
  tabStripContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: controlSettingsColors.line, backgroundColor: 'rgba(255,255,255,0.04)' },
  navItemActive: { backgroundColor: controlSettingsColors.blue, borderColor: controlSettingsColors.blueBorder },
  navLabel: { color: controlSettingsColors.muted, fontSize: 13.5, lineHeight: 19, fontWeight: '500' },
  navLabelActive: { color: '#FFFFFF', fontWeight: '600' },
  bodyScroll: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 4 },
  columns: { flexGrow: 1, flexDirection: 'row', gap: 10 },
  columnsStacked: { flexDirection: 'column' },
  column: { flex: 1, minWidth: 0, gap: 10 },
  card: { backgroundColor: controlSettingsColors.surface, borderWidth: 1, borderColor: controlSettingsColors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: .5, borderColor: controlSettingsColors.line, paddingBottom: 7, marginBottom: 4 },
  panelTitleIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: controlSettingsColors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { color: controlSettingsColors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: .5, minHeight: 42, minWidth: 0, paddingVertical: 6, gap: 10 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', width: '54%', gap: 8 },
  sliderTrack: { flex: 1, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  sliderFill: { height: '100%', borderRadius: 4, backgroundColor: controlSettingsColors.blue },
  segments: { flexDirection: 'row', borderWidth: 1, borderColor: controlSettingsColors.line, borderRadius: 12, padding: 2, backgroundColor: 'rgba(0,0,0,0.22)' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
  storageTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 10 },
  featureIcon: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: controlSettingsColors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.42 },
  speedReadout: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  presetChip: { flex: 1, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderColor: controlSettingsColors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  presetChipActive: { backgroundColor: controlSettingsColors.blue, borderColor: controlSettingsColors.blueBorder },
  presetChipText: { color: controlSettingsColors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '500', fontVariant: ['tabular-nums'] },
  presetChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  inlineSegmentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineSegmentChip: { paddingHorizontal: 10, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', borderColor: controlSettingsColors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inlineSegmentChipActive: { backgroundColor: controlSettingsColors.blue, borderColor: controlSettingsColors.blueBorder },
  inlineSegmentText: { color: controlSettingsColors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  inlineSegmentTextActive: { color: '#FFFFFF', fontWeight: '600' },
  inlineActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderColor: controlSettingsColors.line, borderWidth: 1 },
  inlineActionText: { color: controlSettingsColors.ink, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  pressed: { opacity: 0.72 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 },
  actionChip: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  actionChipActive: { backgroundColor: '#3B6EF6', borderColor: '#93C5FD' },
  actionChipDanger: { borderColor: 'rgba(248,113,113,0.55)' },
  actionChipDisabled: { opacity: 0.42 },
  actionChipText: { color: '#E6EBF0', fontWeight: '500' },
  actionChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  motorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6 },
  motorCell: { width: '48.5%', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 2 },
  motorCellBad: { borderColor: 'rgba(248,113,113,0.6)', backgroundColor: 'rgba(248,113,113,0.08)' },
  motorDot: { width: 7, height: 7, borderRadius: 4 },
});
