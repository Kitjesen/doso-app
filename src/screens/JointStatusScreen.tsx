import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { AppState, Image, type ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import type { ControlImuReading, ControlJointState } from '../features/control/controlOperations';
import { setControlNavigationHidden } from '../services/brainstemGrpc';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

type BodyStatus = {
  posture?: 'unknown' | 'standing' | 'sitting';
  motorState?: 'unknown' | 'enabled' | 'disabled';
  controlAuthority?: 'unknown' | 'not-held' | 'held';
  faultStatus?: 'unknown' | 'clear' | 'active';
  controlOwner?: 'none' | 'grpc' | 'yunzhuo';
  voltageV?: number | null;
  leaseActive?: boolean | null;
};

type Props = {
  isWorkspace?: boolean;
  connectionLabel?: string;
  remoteStatus?: ReactNode;
  body?: BodyStatus; imu?: ControlImuReading | null; showImu?: boolean;
  deviceName: string;
  robotDiagram?: ImageSourcePropType;
  joints?: readonly ControlJointState[];
  observedAt?: string;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onBack: () => void;
};

// Brainstem numbers the twelve leg joints before the four wheel motors.
const legs = [
  { id: 'front-left', label: '左前腿', joints: [['3', '髋关节'], ['4', '大腿'], ['5', '小腿'], ['13', '足轮']] },
  { id: 'front-right', label: '右前腿', joints: [['0', '髋关节'], ['1', '大腿'], ['2', '小腿'], ['12', '足轮']] },
  { id: 'rear-left', label: '左后腿', joints: [['9', '髋关节'], ['10', '大腿'], ['11', '小腿'], ['15', '足轮']] },
  { id: 'rear-right', label: '右后腿', joints: [['6', '髋关节'], ['7', '大腿'], ['8', '小腿'], ['14', '足轮']] },
] as const;
const knownIds: readonly string[] = legs.flatMap(leg => leg.joints.map(([id]) => id));

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

function axisLabel(vector: { x: number; y: number; z: number } | null | undefined) {
  if (!vector) return '—';
  return `${vector.x.toFixed(2)}  ${vector.y.toFixed(2)}  ${vector.z.toFixed(2)}`;
}

function quaternionLabel(vector: ControlImuReading['quaternion'] | null | undefined) {
  if (!vector) return '—';
  return `${vector.w.toFixed(3)}  ${vector.x.toFixed(3)}  ${vector.y.toFixed(3)}  ${vector.z.toFixed(3)}`;
}

export function JointStatusScreen({ isWorkspace = false, connectionLabel, remoteStatus, deviceName, robotDiagram, body, imu = null, showImu = false, joints = [], observedAt, refreshing = false, error, onRefresh, onBack }: Props) {
  const [selectedMotor, setSelectedMotor] = useState<{ id: string; label: string } | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  useEffect(() => {
    const updateNavigation = (state: string) => { void setControlNavigationHidden(isLandscape && state === 'active'); };
    updateNavigation(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateNavigation);
    return () => { subscription.remove(); void setControlNavigationHidden(false); };
  }, [isLandscape]);
  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const validJoints = joints.filter(joint => typeof joint?.id === 'string' && joint.id.length > 0 && typeof joint.label === 'string' && joint.label.length > 0);
  const hasDeviceSnapshot = validJoints.some(joint => joint.source === 'device');
  const knownJoints = knownIds.map(id => validJoints.find(joint => joint.id === id)).filter((joint): joint is ControlJointState => joint !== undefined);
  const otherJoints = validJoints.filter(joint => !knownIds.includes(joint.id));
  const reportedJoints = knownJoints.filter(joint => joint.source === 'device');
  const faultCount = reportedJoints.filter(joint => joint.fault === 'active' || (joint.errors?.length ?? 0) > 0).length;
  const offlineCount = reportedJoints.filter(joint => joint.online === false).length;
  const onlineCount = reportedJoints.filter(joint => joint.online === true).length;
  const updatedTime = observedAt && Number.isFinite(Date.parse(observedAt))
    ? new Date(observedAt).toLocaleTimeString('zh-CN', { hour12: false }) : null;
  const faultColor = isDark ? '#FDA29B' : '#B42318';
  const offlineColor = isDark ? '#B8C7D5' : '#566878';
  const selectedJoint = selectedMotor ? validJoints.find(joint => joint.id === selectedMotor.id) : undefined;
  const renderJoint = (id: string, label: string, joint?: ControlJointState) => {
    const measurement = joint?.source === 'device' && joint.online === true ? joint : undefined;
    const health = joint ? motorHealthLabel(joint) : '未上报';
    const errors = joint?.source === 'device' ? joint.errors?.filter(code => Number.isInteger(code) && code >= 0) ?? [] : [];
    const hasFault = joint?.source === 'device' && (errors.length > 0 || joint.fault === 'active');
    return <View key={id} style={[styles.row, { borderColor: appearance.border }]} testID={`joint-status-${id}`}>
      <View style={styles.rowIdentity}>
        <View style={styles.rowName}><Text style={[styles.rowTitle, { color: appearance.ink }]}>{label}</Text><Text style={[styles.rowId, { color: appearance.secondary }]}>ID {id}</Text></View>
        <Text style={[styles.rowMeta, { color: hasFault ? faultColor : appearance.secondary }]} testID={!joint ? `joint-status-missing-${id}` : undefined}>{health}</Text>
      </View>
      <View style={styles.metrics}>
        {[
          ['位置', valueLabel(measurement?.positionDeg, '°')],
          ['温度', valueLabel(measurement?.temperatureC, '°C')],
          ['电压', valueLabel(measurement?.voltageV, 'V')],
          ['速度', valueLabel(measurement?.velocityRps, 'rad/s')],
          ['力矩', valueLabel(measurement?.torqueNm, 'N m')],
        ].map(([name, value]) => <View key={name} style={styles.metric}>
          <Text style={[styles.metricLabel, { color: appearance.secondary }]}>{name}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.metricValue, { color: appearance.ink }]}>{value}</Text>
        </View>)}
      </View>
      {errors.length ? <Text style={[styles.rowMeta, { color: faultColor }]} testID={`joint-status-errors-${id}`}>错误码 {errors.join('、')}</Text> : null}
    </View>;
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: appearance.canvas }]} testID="joint-status-screen">
      <View style={styles.header}>
        {!isWorkspace ? <Pressable accessibilityLabel="返回控制中心" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, { backgroundColor: appearance.surface }, pressed && styles.pressed]} testID="joint-status-back">
          <Ionicons color={appearance.ink} name="arrow-back" size={22} />
        </Pressable> : null}
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>{isWorkspace ? '机器人状态' : '关节状态'}</Text>
          <Text numberOfLines={1} style={[styles.deviceName, { color: appearance.secondary }]}>{deviceName}</Text>
        </View>
        {connectionLabel ? <Text style={[styles.sourceText, { color: appearance.ink }]} testID="robot-status-connection">{connectionLabel}</Text> : null}
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
        {remoteStatus}
        {body ? <View style={[styles.row, { backgroundColor: appearance.surface }]} testID="joint-status-body">
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>姿态</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.posture === 'standing' ? '站立' : body.posture === 'sitting' ? '坐下' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>电机</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.motorState === 'enabled' ? '已使能' : body.motorState === 'disabled' ? '已失能' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>控制权</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.controlAuthority === 'held' ? '已取得' : body.controlAuthority === 'not-held' ? '未取得' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>控制所有者</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.controlOwner === 'none' ? '无' : body.controlOwner === 'grpc' ? 'gRPC' : body.controlOwner === 'yunzhuo' ? '云卓' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>租约</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.leaseActive === true ? '有效' : body.leaseActive === false ? '未持有' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>故障</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{body.faultStatus === 'clear' ? '无故障' : body.faultStatus === 'active' ? '有故障' : '—'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>总线电压</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{typeof body.voltageV === 'number' && Number.isFinite(body.voltageV) ? `${body.voltageV.toFixed(1)} V` : '—'}</Text></View>
        </View> : null}
        {showImu ? <View style={[styles.row, { backgroundColor: appearance.surface }]} testID="joint-status-imu">
          <View style={styles.rowIdentity}><Text style={[styles.rowTitle, { color: appearance.ink }]}>惯性测量</Text><Text style={[styles.rowMeta, { color: appearance.secondary }]}>{imu?.source === 'device' ? '设备状态' : '未同步'}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>角速度</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{axisLabel(imu?.gyroscope)}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>姿态四元数</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{quaternionLabel(imu?.quaternion)}</Text></View>
          {imu?.linearAcceleration ? <View style={styles.metric}><Text style={[styles.metricLabel, { color: appearance.secondary }]}>线加速度</Text><Text style={[styles.metricValue, { color: appearance.ink }]}>{axisLabel(imu.linearAcceleration)}</Text></View> : null}
        </View> : null}
        {knownJoints.length ? <View accessibilityLabel={`已上报 ${reportedJoints.length}/16，在线 ${onlineCount}，故障 ${faultCount}，离线 ${offlineCount}`} style={styles.summary} testID="joint-status-summary">
          <View style={[styles.summaryPill, { backgroundColor: faultCount > 0 ? isDark ? '#462723' : '#FDECE9' : appearance.surface }]}>
            <Text style={[styles.summaryLabel, { color: faultCount > 0 ? faultColor : appearance.secondary }]} testID="joint-status-fault-count">故障 {faultCount}</Text>
          </View>
          <View style={[styles.summaryPill, { backgroundColor: offlineCount > 0 ? isDark ? '#283744' : '#E7EDF2' : appearance.surface }]}>
            <Text style={[styles.summaryLabel, { color: offlineCount > 0 ? offlineColor : appearance.secondary }]} testID="joint-status-offline-count">离线 {offlineCount}</Text>
          </View>
          <Text style={[styles.reportCount, { color: appearance.secondary }]} testID="joint-status-report-count">已上报 {reportedJoints.length}/16</Text>
          {updatedTime ? <Text style={[styles.updatedTime, { color: appearance.secondary }]} testID="joint-status-updated">{updatedTime}</Text> : null}
        </View> : updatedTime ? <Text style={[styles.updatedTime, { color: appearance.secondary }]} testID="joint-status-updated">{updatedTime}</Text> : null}
        <View style={[styles.overviewPanel, { backgroundColor: appearance.surface }]}>
          <View accessible accessibilityLabel="四腿位置示意：以机器人自身为准，前方朝上，左侧从上到下为左前腿、左后腿，右侧为右前腿、右后腿。不表示实时姿态或关节位置。" style={[styles.diagram, Boolean(robotDiagram) && styles.modelDiagram]} testID="joint-status-leg-diagram">
            <Text style={[styles.diagramHeading, { color: appearance.secondary }]}>前方 ↑</Text>
            <View style={[styles.diagramLayout, Boolean(robotDiagram) && styles.modelDiagramLayout]}>
              <View style={styles.diagramLabels} testID="joint-status-diagram-left">
                <Text style={[styles.diagramLabel, { color: appearance.ink }]}>左前腿</Text>
                <Text style={[styles.diagramLabel, { color: appearance.ink }]}>左后腿</Text>
              </View>
              {robotDiagram ? <Image accessible={false} source={robotDiagram} resizeMode="contain" style={[styles.modelLine, { tintColor: appearance.secondary }]} testID="joint-status-model-diagram" /> : <View style={[styles.diagramBody, { borderColor: appearance.secondary }]} testID="joint-status-generic-diagram">
                <View style={[styles.diagramNose, { borderColor: appearance.secondary }]} />
                {['front-left', 'front-right', 'rear-left', 'rear-right'].map((leg, index) => <View key={leg} style={[
                  styles.diagramBranch,
                  { borderColor: appearance.secondary, top: index < 2 ? 10 : undefined, bottom: index >= 2 ? 10 : undefined, left: index % 2 === 0 ? -17 : undefined, right: index % 2 === 1 ? -17 : undefined },
                ]}><View style={[styles.diagramFoot, { backgroundColor: appearance.canvas, borderColor: appearance.secondary, left: index % 2 === 0 ? -4 : undefined, right: index % 2 === 1 ? -4 : undefined }]} /></View>)}
              </View>}
              <View style={styles.diagramLabels} testID="joint-status-diagram-right">
                <Text style={[styles.diagramLabel, { color: appearance.ink }]}>右前腿</Text>
                <Text style={[styles.diagramLabel, { color: appearance.ink }]}>右后腿</Text>
              </View>
            </View>
          </View>
        {knownJoints.length ? <View style={styles.overview} testID="joint-status-overview">
          <View style={styles.overviewHead} testID="joint-status-overview-head">
            <View style={styles.overviewLegLabel} />
            {['髋', '大腿', '小腿', '足轮'].map(label => <Text key={label} style={[styles.overviewColumnLabel, { color: appearance.secondary }]}>{label}</Text>)}
          </View>
          {legs.map(leg => <View key={leg.id} style={styles.overviewLeg}>
            <Text style={[styles.overviewLegLabel, { color: appearance.ink }]}>{leg.label}</Text>
            {leg.joints.map(([id, label]) => {
              const joint = knownJoints.find(value => value.id === id);
              const health = joint ? motorHealthLabel(joint) : '未上报';
              const hasFault = joint?.source === 'device' && (joint.fault === 'active' || (joint.errors?.length ?? 0) > 0);
              const isOffline = joint?.source === 'device' && joint.online === false;
              const stateColor = hasFault ? faultColor : isOffline ? offlineColor : appearance.ink;
              return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${leg.label}${label}，${health}`} accessibilityHint="查看电机详情" onPress={() => setSelectedMotor({ id, label: `${leg.label} · ${label}` })} style={({ pressed }) => [styles.overviewJoint, isOffline && { backgroundColor: isDark ? '#283744' : '#E7EDF2' }, hasFault && { backgroundColor: isDark ? '#462723' : '#FDECE9' }, pressed && styles.pressed]} testID={`joint-status-overview-${id}`}>
                {health === '运行' ? <View accessible={false} style={[styles.motorDot, { backgroundColor: appearance.blueInk }]} testID={`joint-status-running-${id}`} /> : <Text style={[styles.overviewState, { color: stateColor }]}>{health}</Text>}
                {hasFault || isOffline ? <Ionicons accessible={false} color={stateColor} name="chevron-forward" size={14} /> : null}
              </Pressable>;
            })}
          </View>)}
        </View> : null}
        </View>
        {validJoints.length ? <View style={styles.detailsSection}>
          <Pressable accessibilityRole="button" accessibilityLabel="全部电机详情" accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded(!detailsExpanded)} style={({ pressed }) => [styles.detailsToggle, { borderColor: appearance.border, backgroundColor: appearance.surface }, pressed && styles.pressed]} testID="joint-status-details-toggle">
            <Text style={[styles.legTitle, { color: appearance.ink }]}>全部电机详情</Text>
            <Ionicons accessible={false} color={appearance.secondary} name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
          </Pressable>
          {detailsExpanded ? <View style={styles.list} testID="joint-status-list">
          {knownJoints.length ? legs.map(leg => <View key={leg.id} style={[styles.leg, { backgroundColor: appearance.surface, borderColor: appearance.border }]} testID={`joint-status-leg-${leg.id}`}>
            <Text accessibilityRole="header" style={[styles.legTitle, { color: appearance.ink }]}>{leg.label}</Text>
            {leg.joints.map(([id, label]) => renderJoint(id, label, knownJoints.find(joint => joint.id === id)))}
          </View>) : null}
          {otherJoints.length ? <View style={[styles.leg, { backgroundColor: appearance.surface, borderColor: appearance.border }]} testID="joint-status-other">
            <Text accessibilityRole="header" style={[styles.legTitle, { color: appearance.ink }]}>其他关节</Text>
            {otherJoints.map(joint => renderJoint(joint.id, joint.label, joint))}
          </View> : null}
          </View> : null}
        </View> : <View style={[styles.empty, { backgroundColor: appearance.surface }]} testID="joint-status-empty">
          <Ionicons color={appearance.secondary} name="hardware-chip-outline" size={28} />
          <Text style={[styles.emptyTitle, { color: appearance.ink }]}>关节状态未同步</Text>
          <Text style={[styles.emptyBody, { color: appearance.secondary }]}>连接设备并完成状态读取后显示</Text>
        </View>}
      </ScrollView>
      {selectedMotor ? <Modal animationType="fade" transparent onRequestClose={() => setSelectedMotor(null)} testID="joint-status-detail-modal">
        <View style={styles.detailBackdrop}>
          <View accessibilityViewIsModal style={[styles.detailCard, { backgroundColor: appearance.canvas }]} testID="joint-status-detail">
            <View style={styles.detailHeader}>
              <View style={styles.detailTitle}>
                <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>{selectedMotor.label} / ID {selectedMotor.id}</Text>
                <Text style={[styles.deviceName, { color: appearance.secondary }]}>{deviceName}</Text>
              </View>
              <Pressable accessibilityLabel="关闭电机详情" accessibilityRole="button" onPress={() => setSelectedMotor(null)} style={({ pressed }) => [styles.back, { backgroundColor: appearance.surface }, pressed && styles.pressed]} testID="joint-status-detail-close">
                <Ionicons color={appearance.ink} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              {renderJoint(selectedMotor.id, '电机', selectedJoint)}
              <Text selectable style={[styles.rowMeta, { color: appearance.secondary }]} testID="joint-status-detail-code">状态码 {selectedJoint?.source === 'device' && Number.isInteger(selectedJoint.statusCode) ? selectedJoint.statusCode : '—'}</Text>
              {selectedJoint?.source === 'device' && selectedJoint.fault === 'active' && !selectedJoint.errors?.some(code => Number.isInteger(code) && code >= 0) ? <Text style={[styles.rowMeta, { color: faultColor }]} testID="joint-status-detail-no-error-code">设备未提供错误码</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56, paddingHorizontal: 20 },
  back: { alignItems: 'center', borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  headerCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, minWidth: 0 },
  title: { ...typography.compactTitle },
  deviceName: { ...typography.secondary, flexShrink: 1 },
  subtitle: { ...typography.caption, marginTop: 2 },
  sourcePill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 32, paddingHorizontal: 10 },
  sourceDot: { borderRadius: 4, height: 8, width: 8 },
  sourceText: { ...typography.secondary },
  content: { gap: 10, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
  overviewPanel: { alignItems: 'center', borderRadius: 22, borderCurve: 'continuous', flexDirection: 'row', flexWrap: 'wrap', gap: 20, padding: 12 },
  diagram: { flexBasis: 166, flexGrow: 0, gap: 10, paddingVertical: 10 },
  modelDiagram: { flexBasis: 220 },
  modelDiagramLayout: { gap: 4 },
  modelLine: { height: 166, width: 110 },
  diagramHeading: { ...typography.secondary, textAlign: 'center' },
  diagramLayout: { alignItems: 'center', flexDirection: 'row', gap: 20, justifyContent: 'center' },
  diagramLabels: { height: 78, justifyContent: 'space-between' },
  diagramLabel: { ...typography.secondary },
  diagramBody: { borderRadius: 12, borderWidth: 1.5, height: 78, width: 36 },
  diagramNose: { alignSelf: 'center', borderLeftWidth: 1.5, borderRightWidth: 1.5, borderTopWidth: 1.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, height: 7, position: 'absolute', top: -8, width: 14 },
  diagramBranch: { borderTopWidth: 1.5, position: 'absolute', width: 16 },
  diagramFoot: { borderRadius: 4, borderWidth: 1.5, height: 8, position: 'absolute', top: -4.5, width: 8 },
  summary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 4, paddingHorizontal: 4 },
  summaryPill: { borderRadius: 999, minHeight: 32, justifyContent: 'center', paddingHorizontal: 12 },
  summaryLabel: { ...typography.secondary, fontVariant: ['tabular-nums'] },
  reportCount: { ...typography.secondary, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  updatedTime: { ...typography.secondary, fontVariant: ['tabular-nums'] },
  overview: { flexBasis: 360, flexGrow: 3, flexShrink: 1, minWidth: 0 },
  overviewHead: { alignItems: 'center', flexDirection: 'row', minHeight: 26 },
  overviewColumnLabel: { ...typography.secondary, flex: 1, textAlign: 'center' },
  overviewLeg: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  overviewLegLabel: { ...typography.label, width: 54 },
  overviewJoint: { alignItems: 'center', borderRadius: 10, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 44, minWidth: 0 },
  overviewState: { ...typography.body, fontWeight: '500' },
  motorDot: { borderRadius: 5, height: 10, width: 10 },
  detailsSection: { gap: 10 },
  detailsToggle: { alignItems: 'center', borderRadius: 18, borderWidth: 0.5, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, paddingTop: 6 },
  list: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  leg: { borderRadius: 22, borderWidth: 0.5, flexBasis: 320, flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', paddingHorizontal: 12, paddingTop: 14 },
  legTitle: { ...typography.label, paddingBottom: 6 },
  row: { borderTopWidth: 0.5, gap: 8, minHeight: 92, paddingVertical: 10 },
  rowIdentity: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  rowName: { alignItems: 'baseline', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowTitle: { ...typography.label },
  rowId: { ...typography.caption },
  rowMeta: { ...typography.caption, marginTop: 2 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { alignItems: 'flex-start', flexBasis: 48, flexGrow: 1, minWidth: 44 },
  metricLabel: { ...typography.caption },
  metricValue: { ...typography.supporting, fontWeight: '700', marginTop: 2 },
  empty: { alignItems: 'center', borderRadius: 20, gap: 8, justifyContent: 'center', minHeight: 180, padding: 20 },
  emptyTitle: { ...typography.label },
  emptyBody: { ...typography.supporting, textAlign: 'center' },
  detailBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.28)', flex: 1, justifyContent: 'center', padding: 20 },
  detailCard: { borderCurve: 'continuous', borderRadius: 24, maxHeight: '90%', maxWidth: 560, overflow: 'hidden', width: '100%' },
  detailHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
  detailTitle: { flex: 1, gap: 4 },
  detailContent: { gap: 8, paddingBottom: 20, paddingHorizontal: 20 },
  pressed: { opacity: 0.55 },
});
