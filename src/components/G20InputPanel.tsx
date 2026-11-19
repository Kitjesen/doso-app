import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './AppText';
import { ControlSetupPage, controlSetupColors, type ControlSetupMedia } from './ControlSetupSurface';
import { useAppTheme } from '../theme';
import { controlTypography as typography } from '../typography';

export type G20InputAxis = 'leftX' | 'leftY' | 'rightX' | 'rightY';
export type G20InputButton = 'stand' | 'sit' | 'stop' | 'enableMotor' | 'disableMotor' | 'switchPolicy';
export type G20InputPanelState = Readonly<{
  status: string;
  reading: boolean;
  available: boolean;
  message: string | null;
  sample: Readonly<{ channels: readonly number[]; configurationReady?: boolean }> | null;
  axes: Readonly<Partial<Record<G20InputAxis, Readonly<{ channel: number; sign: 1 | -1 }>>>>;
  buttons: Readonly<Partial<Record<G20InputButton, Readonly<{ channel: number }>>>>;
  calibrating: boolean;
  calibrated: boolean;
  vector: Readonly<Record<G20InputAxis, number>> | null;
  pressed?: readonly G20InputButton[];
}>;

type Props = Readonly<{
  media?: ControlSetupMedia;
  header?: ReactNode;
  state: G20InputPanelState;
  onStart: () => void;
  onStop: () => void;
  onBeginCalibration: () => void;
  onFinishCalibration: () => void;
  onLearnAxis: (axis: G20InputAxis) => void;
  onLearnButton: (operation: G20InputButton) => void;
  onClearCalibration: () => void;
  onClose: () => void;
  source: 'touch' | 'physical';
  onSourceChange: (source: 'touch' | 'physical') => void;
}>;

const axes: readonly Readonly<{ id: G20InputAxis; label: string; instruction: string }>[] = [
  { id: 'leftX', label: '左杆水平', instruction: '左杆向右' },
  { id: 'leftY', label: '左杆纵向', instruction: '左杆向前' },
  { id: 'rightX', label: '右杆水平', instruction: '右杆向右' },
  { id: 'rightY', label: '右杆纵向', instruction: '右杆向前' },
];

const buttons: readonly Readonly<{ id: G20InputButton; label: string }>[] = [
  { id: 'stand', label: '站立' },
  { id: 'sit', label: '坐下' },
  { id: 'stop', label: '停止' },
  { id: 'enableMotor', label: '电机使能' },
  { id: 'disableMotor', label: '电机失能' },
  { id: 'switchPolicy', label: '策略选择' },
];

const statusLabels: Readonly<Record<string, string>> = {
  stopped: '未读取', starting: '正在连接', reading: '正在读取',
  unavailable: '不可用', error: '读取失败',
};

function channelLabel(channel: number | undefined) {
  return Number.isInteger(channel) && channel! >= 0 && channel! < 16 ? `CH${channel! + 1}` : '未记录';
}

function rawValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

function axisValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
}

/** Input setup is local: these callbacks never stand in for a robot action. */
export function G20InputPanel({
  state, onStart, onStop, onBeginCalibration, onFinishCalibration, onLearnAxis, onLearnButton,
  onClearCalibration, onClose, source, onSourceChange, media, header,
}: Props) {
  const theme = useAppTheme();
  const colors = { ...theme.colors, ...controlSetupColors };
  const hasSample = state.reading && state.sample !== null;
  const configurationReady = hasSample && state.sample?.configurationReady === true;
  const canLearn = configurationReady && state.calibrating;
  const canSelectPhysical = configurationReady && state.calibrated && !state.calibrating;
  const starting = state.status === 'starting';
  const status = statusLabels[state.status] ?? state.status;

  const action = (id: string, label: string, onPress: () => void, disabled = false, selected = false) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => { if (!disabled) onPress(); }}
      style={({ pressed }) => [styles.button, {
        backgroundColor: selected ? colors.authPrimary : colors.surface,
        borderColor: selected ? colors.authPrimary : colors.line,
        opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
      }]}
      testID={id}
    >
      <Text style={[styles.buttonText, { color: selected ? colors.authPrimaryInk : colors.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.background }]} testID="g20-input-panel">
      <ControlSetupPage title="遥控器输入" onBack={onClose} backTestID="g20-input-close" media={media} header={header}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={{ borderRadius: 22, borderWidth: .5, borderColor: colors.line, backgroundColor: colors.surface }}>
        {state.message ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]} testID="g20-input-message">{state.message}</Text> : null}

        <View style={styles.sourceRow} testID="g20-input-sources">
          <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]} testID="g20-input-status">{status}</Text>
          {action('g20-source-touch', '触屏摇杆', () => onSourceChange('touch'), false, source === 'touch')}
          {action('g20-source-physical', '实体摇杆', () => onSourceChange('physical'), !canSelectPhysical, source === 'physical' && canSelectPhysical)}
          <View style={{ flex: 1 }} />
          {state.reading || starting
            ? action('g20-input-stop', '停止读取', onStop)
            : action('g20-input-start', '读取输入', onStart, !state.available)}
        </View>

        <View style={styles.metrics} testID="g20-input-vectors">
          {axes.map(axis => <View key={axis.id} style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.caption, { color: colors.muted }]}>{axis.label}</Text>
            <Text style={[styles.value, { color: colors.ink }]} testID={`g20-value-${axis.id}`}>{axisValue(hasSample ? state.vector?.[axis.id] : undefined)}</Text>
          </View>)}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>原始通道</Text>
        <View style={styles.channels} testID="g20-input-channels">
          {Array.from({ length: 16 }, (_, channel) => <View key={channel} style={[styles.channel, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.caption, { color: colors.muted }]}>CH{channel + 1}</Text>
            <Text style={[styles.value, { color: colors.ink }]} testID={`g20-channel-${channel + 1}`}>{rawValue(hasSample ? state.sample?.channels[channel] : undefined)}</Text>
          </View>)}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>输入校验</Text>
          {action('g20-calibration-begin', state.calibrating ? '重新开始' : state.calibrated ? '重新校验' : '开始校验', onBeginCalibration, !hasSample)}
          {state.calibrating ? action('g20-calibration-finish', '完成校验', onFinishCalibration, !configurationReady || !state.calibrated) : null}
          {action('g20-calibration-clear', '清除', onClearCalibration, !state.calibrating && !state.calibrated)}
        </View>
        <Text style={[styles.caption, { color: colors.muted }]} testID="g20-calibration-instruction">
          {state.calibrating ? '按住当前项后记录，全部松开后完成。校验期间 App 不发送动作。' : state.reading && !configurationReady
            ? '校验会读取配置，遥控器可能发出提示音。' : '先断开机器人接收机，松开所有摇杆和按键后开始。'}
        </Text>
        <View style={styles.list}>
          {axes.map(axis => <View key={axis.id} style={[styles.row, { borderColor: colors.line }]} testID={`g20-axis-${axis.id}`}>
            <View style={styles.rowCopy}>
              <Text style={[styles.body, { color: colors.ink }]}>{axis.instruction}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{channelLabel(state.axes[axis.id]?.channel)}</Text>
            </View>
            {action(`g20-learn-${axis.id}`, `记录${axis.instruction}`, () => onLearnAxis(axis.id), !canLearn)}
          </View>)}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>动作按键</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>选配，按住对应按键后记录。</Text>
        <View style={styles.list}>
          {buttons.map(button => <View key={button.id} style={[styles.row, { borderColor: colors.line }]} testID={`g20-button-${button.id}`}>
            <View style={styles.rowCopy}>
              <Text style={[styles.body, { color: colors.ink }]}>{button.label}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{channelLabel(state.buttons[button.id]?.channel)}{state.buttons[button.id] && hasSample ? state.pressed ? state.pressed.includes(button.id) ? ' 按下' : ' 释放' : ' 未同步' : ''}</Text>
            </View>
            {action(`g20-learn-button-${button.id}`, `记录${button.label}键`, () => onLearnButton(button.id), !canLearn)}
          </View>)}
        </View>

      </ScrollView>
      </ControlSetupPage>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { alignSelf: 'center', gap: 12, maxWidth: 1100, padding: 16, paddingBottom: 24, width: '100%' },
  sectionTitle: { ...typography.cardTitle, flexGrow: 1 },
  caption: { ...typography.caption },
  body: { ...typography.body },
  button: { alignItems: 'center', borderRadius: 10, borderWidth: 0.5, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { ...typography.body, fontWeight: '500' },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { borderRadius: 12, borderWidth: 0.5, flexBasis: 130, flexGrow: 1, gap: 4, padding: 10 },
  value: { ...typography.body, fontSize: 17, lineHeight: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  list: { gap: 0 },
  row: { alignItems: 'center', borderBottomWidth: 0.5, flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 8 },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channel: { borderRadius: 10, borderWidth: 0.5, flexBasis: '11%', minWidth: 64, flexGrow: 1, gap: 4, padding: 8 },
});
