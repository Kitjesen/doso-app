import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ControlPanelMotion } from './ControlPanelMotion';
import { Text } from './AppText';
import type { ControlInputSource, ControlRuntimeState } from '../features/control/controlOperations';

export const controlHudColors = {
  ink: '#FCFCFD', muted: 'rgba(252,252,253,0.72)', line: 'rgba(252,252,253,0.30)',
  glass: 'rgba(136,153,175,0.23)', blue: '#52A9FF', green: '#30D158', red: '#FF002B',
};

export const controlSettingsColors = {
  ...controlHudColors,
  ink: '#1D2A3A', muted: '#627184', line: '#DDE4EC',
  glass: '#F6F8FB', blue: '#1C72C8', green: '#188359', canvas: '#FFFFFF',
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
  onPostures: () => void; onPolicy: () => void; ownerLabel: string;
  lease: ReactNode;
  robotName: string; connected: boolean; endpointLabel?: string;
  runtimeState?: ControlRuntimeState; inputSource: ControlInputSource; videoLabel: string;
};

export function renderControlSettings(p: SettingsProps) {
  const s = Math.max(.58, Math.min(1.25, p.width / 1280));
  const c = controlSettingsColors;
  const text = { color: c.ink, fontSize: Math.max(13, 20 * s), lineHeight: Math.max(18, 28 * s), fontWeight: '400' as const };
  const small = { color: c.muted, fontSize: Math.max(11, 15 * s), lineHeight: Math.max(15, 22 * s), fontWeight: '400' as const };
  const bottomInset = Math.max(56, p.height * .089);
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
  const icon = (name: keyof typeof Ionicons.glyphMap, size = 25) => <Ionicons name={name} size={Math.max(18, size * s)} color={c.ink} />;
  const value = (label: string, highlighted = false) => <Text style={[text, { color: highlighted ? c.green : c.muted, textAlign: 'right', flexShrink: 1, maxWidth: '62%', fontVariant: ['tabular-nums'] }]}>{label}</Text>;
  const toggle = (id: string, value: boolean | undefined, change?: () => void) => <Pressable testID={id} accessibilityRole="switch"
    accessibilityLabel={{ 'control-setting-overlay': '画面叠加信息', 'control-setting-stop-confirm': '急停二次确认', 'control-setting-mirror': '镜像控制', 'control-setting-latency': '低延迟模式', 'control-setting-recording': '自动录像', 'control-setting-microphone': '麦克风' }[id] ?? '设备设置'}
    aria-checked={value === undefined ? undefined : value}
    accessibilityState={{ checked: value, disabled: !change }} accessibilityHint={!change ? '当前设备未提供此设置接口' : undefined}
    accessibilityValue={{ text: value === undefined ? '未接入' : value ? '开启' : '关闭' }}
    disabled={!change} onPress={change}
    hitSlop={8}
    style={{ width: Math.max(36, 50 * s), height: Math.max(22, 28 * s), borderRadius: 30, borderWidth: 1, borderColor: c.line,
      backgroundColor: value ? c.blue : '#DCE3EB', justifyContent: 'center', padding: 3 }}>
    <View style={{ width: Math.max(14, 20 * s), height: Math.max(14, 20 * s), borderRadius: 30, alignSelf: value ? 'flex-end' : 'flex-start', backgroundColor: '#FFFFFF', opacity: value === undefined ? .6 : 1 }} />
  </Pressable>;
  const slider = (id: string, value: number | undefined, label: string, suffix: string, displayed?: string) => <View style={st.sliderRow} accessible accessibilityLabel={`${label} ${value === undefined ? '未接入' : displayed ?? value + suffix}`} accessibilityState={{ disabled: true }} testID={id}>
    <View style={[st.sliderTrack, { height: Math.max(4, 8 * s) }]}><View style={[st.sliderFill, { width: `${Math.max(0, Math.min(100, value ?? 0))}%` }]} />
      {value !== undefined ? <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, value))}%`, top: -7 * s, width: 22 * s, height: 22 * s, borderRadius: 20, borderWidth: 1, borderColor: '#CCD9E6', backgroundColor: '#FFFFFF', transform: [{ translateX: -11 * s }] }} /> : null}</View>
    <Text style={[text, { fontSize: Math.max(12, 18 * s), minWidth: 66 * s, textAlign: 'right', fontWeight: '500', fontVariant: ['tabular-nums'] }]}>{value === undefined ? '未接入' : displayed ?? `${value}${suffix}`}</Text>
  </View>;
  const row = (label: string, value: ReactNode, description?: string) => <View style={[st.row, { borderColor: c.line, minHeight: Math.max(38, 48 * s), paddingVertical: 8 * s, gap: 12 * s }]}>
    <View style={{ flex: 1, minWidth: 0 }}><Text style={text}>{label}</Text>{description && (p.width >= 900 || label === '急停二次确认') ? <Text numberOfLines={label === '急停二次确认' ? undefined : 1} style={small}>{description}</Text> : null}</View>{value}
  </View>;
  const link = (id: string, label: string, onPress?: () => void, detail?: string) => <Pressable testID={id} accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} accessibilityState={{ disabled: !onPress }} onPress={onPress} style={({ pressed }) => [st.row, { minHeight: Math.max(40, 52 * s), paddingVertical: 8 * s, borderColor: c.line, opacity: pressed ? .65 : 1 }]}>
    <Text style={[text, { flex: 1 }]}>{label}</Text>{detail ? <Text style={[small, { maxWidth: '52%', textAlign: 'right' }]}>{detail}</Text> : null}{onPress ? icon('chevron-forward', 20) : null}
  </Pressable>;
  const panel = (title: string, glyph: keyof typeof Ionicons.glyphMap, children: ReactNode, flex = 1) => <View style={[st.card, { flexGrow: flex, flexBasis: 'auto', paddingHorizontal: 24 * s, paddingBottom: 12 * s, borderRadius: 18 * s }]}>
    <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
    <View style={[st.panelHeading, { minHeight: Math.max(34, 54 * s), gap: 12 * s, borderColor: c.line }]}>{icon(glyph)}<Text accessibilityRole="header" style={[text, { fontSize: Math.max(15, 22 * s), lineHeight: Math.max(21, 30 * s), fontWeight: '500' }]}>{title}</Text></View>
    <View style={{ flexGrow: 1, justifyContent: 'space-evenly' }}>{children}</View>
  </View>;
  const columns = (left: ReactNode, right: ReactNode) => <View testID={`control-settings-page-${p.category}`} style={[st.columns, { gap: 16 * s }]}>
    <View style={[st.column, { gap: 16 * s }]}>{left}</View><View style={[st.column, { gap: 16 * s }]}>{right}</View>
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
    <View accessibilityLabel="存储使用比例" style={[st.storageTrack, { marginVertical: 16 * s }]}>
      {snapshot.storageUsedGb !== undefined && snapshot.storageTotalGb ? <View style={{ width: `${Math.max(0, Math.min(100, snapshot.storageUsedGb / snapshot.storageTotalGb * 100))}%`, height: '100%', backgroundColor: '#7BD5F6' }} /> : null}
    </View>
  </>;
  let content: ReactNode;
  switch (p.category) {
    case '通用':
      content = columns(<>
        {panel('显示设置', 'options-outline', <>{overlayRow()}{row('语言', value('简体中文'))}{row('动效', value('跟随系统'))}</>, 1.1)}
        {panel('使用偏好', 'resize-outline', <>{layoutLink()}{inputLink()}</>)}
      </>, <>
        {panel('当前设备', 'hardware-chip-outline', <>{row('名称', value(p.robotName))}{row('连接状态', value(p.connected ? '已连接' : '未连接', p.connected))}{row('当前控制者', value(ownerLabel))}</>, 1.1)}
        {panel('快捷入口', 'grid-outline', <>{connectionLink()}{diagnosticsLink()}</>)}
      </>); break;
    case '操控':
      content = columns(<>
        {panel('摇杆设置', 'game-controller-outline', <>
          {row('摇杆灵敏度', slider('control-setting-sensitivity', snapshot.sensitivity, '摇杆灵敏度', '%'))}
          {row('镜像控制', toggle('control-setting-mirror', snapshot.mirrored))}
          {inputLink()}
        </>, 1.35)}
        {panel('圆盘布局', 'move-outline', <>{layoutLink()}{row('松手回零', value('自动'))}</>)}
      </>, <>
        {panel('运动设置', 'speedometer-outline', <>
          {row('最大速度限制', slider('control-setting-speed-limit', snapshot.speedLimit === undefined ? undefined : snapshot.speedLimit / 2.4 * 100, '最大速度限制', '%', `${snapshot.speedLimit} m/s`))}
          {row('低延迟模式', toggle('control-setting-latency', snapshot.lowLatency))}
          {row('当前控制者', value(ownerLabel))}
        </>, 1.35)}
        {panel('姿态与模式', 'walk-outline', <>{postureLink()}{modeLink()}</>)}
      </>); break;
    case '视频':
      content = columns(<>
        {panel('画面设置', 'videocam-outline', <>
          <View style={{ paddingVertical: 16 * s, gap: 18 * s }}><Text style={text}>视频清晰度</Text>
            <View style={st.segments}>{(['流畅', '标清', '高清', '超清'] as const).map(quality => <View key={quality} accessible accessibilityLabel={`${quality}，当前不可调整`} accessibilityState={{ disabled: true, selected: snapshot.quality === quality }} style={[st.segment, { minHeight: Math.max(34, 42 * s), backgroundColor: snapshot.quality === quality ? c.blue : 'transparent', borderColor: 'transparent' }]}><Text style={[text, snapshot.quality === quality && { color: '#FFFFFF' }]}>{quality}</Text></View>)}</View>
          </View>{overlayRow()}
        </>, 1.3)}
        {panel('视频连接', 'radio-outline', <>{row('画面状态', value(p.videoLabel))}{connectionLink()}</>)}
      </>, <>
        {panel('录像设置', 'recording-outline', <>{row('自动录像', toggle('control-setting-recording', snapshot.recording))}{row('录像管理', value('未接入'))}</>)}
        {panel('存储空间', 'server-outline', storage(), 1.3)}
      </>); break;
    case '音频':
      content = columns(<>
        {panel('扬声器', 'volume-high-outline', <>
          <View style={[st.featureIcon, { gap: 20 * s }]}>{icon('volume-high-outline', 64)}<Text style={small}>机器人扬声器</Text></View>
          {row('音量', slider('control-setting-volume', snapshot.volume, '扬声器音量', '%'))}
          {row('音频输出', value('未接入'))}
        </>)}
      </>, <>
        {panel('麦克风', 'mic-outline', <>
          <View style={[st.featureIcon, { gap: 20 * s }]}>{icon('mic-outline', 64)}<Text style={small}>双向语音对讲</Text></View>
          {row('麦克风', toggle('control-setting-microphone', snapshot.microphone))}
          {row('对讲服务', value('未接入'))}
        </>)}
      </>); break;
    case '网络':
      content = columns(<>
        {panel('机器狗连接', 'link-outline', <>{row('设备地址', value(p.endpointLabel ?? '未读取'))}{row('连接状态', value(p.connected ? '已连接' : '未连接', p.connected))}{connectionLink()}</>, 1.2)}
        {panel('终端网络', 'wifi-outline', <>{row('Wi-Fi', value(snapshot.wifiName ?? '未读取'))}{row('网络来源', value('当前遥控终端'))}</>)}
      </>, <>
        {panel('控制权', 'key-outline', <>{row('当前控制者', value(ownerLabel))}<View style={{ paddingVertical: 12 * s }}>{p.lease ?? <Text style={small}>{!p.connected ? '连接后查看控制权' : p.inputSource === 'touch' ? '触屏请求随摇杆操作发起' : '当前无可用的控制权操作'}</Text>}</View></>, 1.2)}
        {panel('App 输入', 'game-controller-outline', <>{row('当前来源', value(inputLabel))}{inputLink()}</>)}
      </>); break;
    case '机器人':
      content = columns(<>
        {panel('机器人状态', 'hardware-chip-outline', <>{row('设备名称', value(p.robotName))}{row('当前姿态', value(postureLabel))}{row('电机状态', value(motorLabel))}</>, 1.2)}
        {panel('动作与诊断', 'pulse-outline', <>{postureLink()}{modeLink()}{diagnosticsLink()}</>)}
      </>, <>
        {panel('系统信息', 'layers-outline', <>{row('固件版本', value(snapshot.firmware ?? '未读取'))}{row('当前模式', value(policyLabel))}</>)}
        {panel('存储空间', 'server-outline', storage(), 1.2)}
      </>); break;
    case '安全':
      content = columns(<>
        {panel('急停', 'stop-circle-outline', <>
          <View style={[st.featureIcon, { gap: 12 * s }]}><Ionicons name="stop-circle" size={Math.max(42, 66 * s)} color={c.red} /><Text style={[text, { fontWeight: '500' }]}>立即执行</Text></View>
          {row('急停二次确认', toggle('control-setting-stop-confirm', false), '急停立即执行，不增加确认步骤')}
        </>, 1.35)}
        {panel('输入保护', 'hand-left-outline', <>{row('松开摇杆', value('指令回零'))}{row('离开控制页', value('中断输入'))}</>)}
      </>, <>
        {panel('当前状态', 'shield-checkmark-outline', <>{row('电机', value(motorLabel))}{row('控制者', value(ownerLabel))}{row('故障', value(observed?.faultStatus === 'clear' ? '无已上报故障' : observed?.faultStatus === 'active' ? observed.faultSummary ?? '存在故障' : '未读取'))}</>, 1.35)}
        {panel('失联保护', 'radio-outline', <>{row('App 处理', value('停止运动发送'))}{row('服务端保护', value('未读取'))}</>)}
      </>); break;
    case '关于':
      content = columns(<>
        {panel('DOSO', 'information-circle-outline', <>
          <View style={[st.featureIcon, { gap: 24 * s }]}><DosoWordmark width={200 * s} color={c.ink} /><Text style={[text, { color: c.muted }]}>机器狗控制终端</Text></View>
          {row('应用版本', value(snapshot.appVersion ?? '未读取'))}
          {row('机器人固件', value(snapshot.firmware ?? '未读取'))}
        </>)}
      </>, <>
        {panel('界面素材', 'color-palette-outline', <>{row('字体', value('MiSans'))}{row('图标', value('Ionicons'))}{row('品牌', value('DOSO 原有素材'))}</>)}
        {panel('画面来源', 'image-outline', <>{row('当前画面', value(p.videoLabel))}<Text style={[small, { paddingVertical: 14 * s }]}>设计预览使用静态场景。实际控制画面由机器狗视频连接提供。</Text></>)}
      </>); break;
  }
  return <ControlPanelMotion testID="control-settings-menu" style={[st.root, { top: p.height * .133, bottom: bottomInset }]}>
    <View style={[st.sidebar, { borderRadius: 24 * s, padding: 6 * s }]}>
      {categories.map(([label, glyph]) => <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} aria-selected={p.category === label} accessibilityState={{ selected: p.category === label }} onPress={() => p.onCategory(label)} testID={`control-settings-tab-${label}`}
        style={[st.navItem, { minHeight: Math.max(32, 46 * s), borderRadius: 20 * s, gap: 12 * s, paddingHorizontal: 12 * s, backgroundColor: p.category === label ? '#E6F1FF' : 'transparent', borderColor: p.category === label ? '#A8CFF4' : 'transparent' }]}>
        {icon(glyph)}<Text numberOfLines={1} style={[text, { fontSize: Math.max(12, 20 * s), flexShrink: 1, fontWeight: p.category === label ? '500' : '400' }]}>{label}</Text>
      </Pressable>)}
    </View>
    <ScrollView key={p.category} testID="control-settings-scroll" style={{ flex: 1 }} contentContainerStyle={[st.content, { minHeight: Math.max(304, p.height * .867 - bottomInset) }]} showsVerticalScrollIndicator={false}>
      <ControlPanelMotion style={{ flexGrow: 1 }}>{content}</ControlPanelMotion>
    </ScrollView>
    <Pressable testID="control-close-settings" accessibilityLabel="关闭设置" accessibilityRole="button" onPress={p.onClose} style={st.close}><Ionicons name="close" size={Math.max(20, 25 * s)} color={c.ink} /></Pressable>
  </ControlPanelMotion>;
}

const st = StyleSheet.create({
  root: { position: 'absolute', left: '3.6%', right: '3.6%', flexDirection: 'row', gap: '2.6%', zIndex: 8 },
  sidebar: { width: '13.1%', backgroundColor: controlSettingsColors.glass, borderColor: controlSettingsColors.line, borderWidth: 1, overflow: 'hidden', justifyContent: 'space-evenly' },
  navItem: { flexDirection: 'row', alignItems: 'center', flex: 1, maxHeight: '10.5%', borderWidth: 1, overflow: 'hidden' },
  content: { flexGrow: 1, paddingBottom: 1 },
  columns: { flexGrow: 1, flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  card: { backgroundColor: controlSettingsColors.glass, borderWidth: 1, borderColor: controlSettingsColors.line, overflow: 'hidden' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: .5 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: .5, minWidth: 0, gap: 10 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', width: '58%', gap: 10 },
  sliderTrack: { flex: 1, borderRadius: 10, backgroundColor: '#DDE5EF' },
  sliderFill: { height: '100%', borderRadius: 10, backgroundColor: controlSettingsColors.blue },
  segments: { flexDirection: 'row', borderWidth: 1, borderColor: controlSettingsColors.line, borderRadius: 24, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 24 },
  storageTrack: { height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#DDE5EF' },
  featureIcon: { flexGrow: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  close: { position: 'absolute', right: -6, bottom: -48, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
