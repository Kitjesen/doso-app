import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import type { ControlJointState } from '../features/control/controlOperations';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

type Props = {
  deviceName: string;
  joints?: readonly ControlJointState[];
  observedAt?: string;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onBack: () => void;
};

function valueLabel(value: number | null | undefined, unit: string) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : '—';
}

function motorHealthLabel(joint: ControlJointState) {
  if (joint.source !== 'device') return '未同步';
  if (joint.online === false) return '离线';
  if ((joint.errors?.length ?? 0) > 0 || joint.fault === 'active') return '故障';
  if (joint.online !== true) return '未知';
  // RoboStride RSStatus is an operating state, not a fault code or a health test result.
  if (joint.statusCode === 0) return '复位';
  if (joint.statusCode === 1) return '标定';
  if (joint.statusCode === 2) return '运行';
  return '未知';
}

export function JointStatusScreen({ deviceName, joints = [], observedAt, refreshing = false, error, onRefresh, onBack }: Props) {
  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const validJoints = joints.filter(joint => typeof joint?.id === 'string' && joint.id.length > 0 && typeof joint.label === 'string' && joint.label.length > 0);
  const hasDeviceSnapshot = validJoints.some(joint => joint.source === 'device');
  const updatedTime = observedAt && Number.isFinite(Date.parse(observedAt))
    ? new Date(observedAt).toLocaleTimeString('zh-CN', { hour12: false }) : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: appearance.canvas }]} testID="joint-status-screen">
      <View style={styles.header}>
        <Pressable accessibilityLabel="返回控制中心" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, { backgroundColor: appearance.surface }, pressed && styles.pressed]} testID="joint-status-back">
          <Ionicons color={appearance.ink} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>关节状态</Text>
          <Text style={[styles.subtitle, { color: appearance.secondary }]}>{deviceName}</Text>
          {updatedTime ? <Text style={[styles.subtitle, { color: appearance.secondary }]} testID="joint-status-updated">更新于 {updatedTime}</Text> : null}
        </View>
        <View style={[styles.sourcePill, { backgroundColor: appearance.surface }]} testID="joint-status-source">
          <View style={[styles.sourceDot, { backgroundColor: hasDeviceSnapshot ? appearance.blueInk : appearance.secondary }]} />
          <Text style={[styles.sourceText, { color: appearance.ink }]}>{hasDeviceSnapshot ? '设备状态' : '未同步'}</Text>
        </View>
        {onRefresh ? <Pressable accessibilityLabel="刷新关节状态" accessibilityRole="button" accessibilityState={{ disabled: refreshing }} disabled={refreshing} onPress={onRefresh} style={({ pressed }) => [styles.back, { backgroundColor: appearance.surface }, pressed && styles.pressed]} testID="joint-status-refresh">
          <Ionicons color={appearance.ink} name="refresh" size={22} />
        </Pressable> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error ? <Text accessibilityLiveRegion="polite" style={[styles.subtitle, { color: appearance.secondary }]} testID="joint-status-error">{error}</Text> : null}
        {validJoints.length ? <View style={styles.list} testID="joint-status-list">
          {validJoints.map(joint => <View key={joint.id} style={[styles.row, { backgroundColor: appearance.surface }]} testID={`joint-status-${joint.id}`}>
            <View style={styles.rowIdentity}>
              <Text style={[styles.rowTitle, { color: appearance.ink }]}>{joint.label}</Text>
              <Text style={[styles.rowMeta, { color: appearance.secondary }]}>{motorHealthLabel(joint)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: appearance.secondary }]}>位置</Text>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{valueLabel(joint.positionDeg, '°')}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: appearance.secondary }]}>温度</Text>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{valueLabel(joint.temperatureC, '°C')}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: appearance.secondary }]}>电压</Text>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{valueLabel(joint.voltageV, 'V')}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: appearance.secondary }]}>速度</Text>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{valueLabel(joint.velocityRps, 'rad/s')}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: appearance.secondary }]}>力矩</Text>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{valueLabel(joint.torqueNm, 'N m')}</Text>
            </View>
          </View>)}
        </View> : <View style={[styles.empty, { backgroundColor: appearance.surface }]} testID="joint-status-empty">
          <Ionicons color={appearance.secondary} name="hardware-chip-outline" size={28} />
          <Text style={[styles.emptyTitle, { color: appearance.ink }]}>关节状态未同步</Text>
          <Text style={[styles.emptyBody, { color: appearance.secondary }]}>连接设备并完成状态读取后显示</Text>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 64, paddingHorizontal: 20 },
  back: { alignItems: 'center', borderRadius: 999, height: 48, justifyContent: 'center', width: 48 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { ...typography.compactTitle },
  subtitle: { ...typography.caption, marginTop: 2 },
  sourcePill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 10 },
  sourceDot: { borderRadius: 4, height: 8, width: 8 },
  sourceText: { ...typography.caption },
  content: { gap: 12, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 8 },
  list: { gap: 8 },
  row: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10 },
  rowIdentity: { flexBasis: 110, flexGrow: 1, minWidth: 0 },
  rowTitle: { ...typography.label },
  rowMeta: { ...typography.caption, marginTop: 2 },
  metric: { alignItems: 'flex-end', minWidth: 56 },
  metricLabel: { ...typography.caption },
  metricValue: { ...typography.supporting, fontWeight: '700', marginTop: 2 },
  empty: { alignItems: 'center', borderRadius: 20, gap: 8, justifyContent: 'center', minHeight: 180, padding: 20 },
  emptyTitle: { ...typography.label },
  emptyBody: { ...typography.supporting, textAlign: 'center' },
  pressed: { opacity: 0.55 },
});
