import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useProductAppearance } from '../appearance';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';
import { typography } from '../typography';

type Props = {
  onOpenControl: () => void;
  directConnection?: { endpointLabel: string; fresh: boolean; summary: string };
  onOpenDirectControl?: () => void;
  onOpenRoutes: () => void;
  onOpenTasks: () => void;
  onOpenSafety: () => void;
  onRecall: () => void;
  connected: boolean;
  batteryPercent?: number | null;
  canRecall: boolean;
  recallBlockedReason?: string;
  robotCompactImage?: ImageSourcePropType;
  robotImage: ImageSourcePropType;
  robotName: string;
  safetyLock: boolean;
  taskControlAvailable?: boolean;
  taskExecutorAvailable?: boolean;
};

export function HomeScreen({ batteryPercent = null, canRecall, connected, directConnection, onOpenControl, onOpenDirectControl, onOpenRoutes, onOpenSafety, onOpenTasks, onRecall, recallBlockedReason, robotImage, robotName, safetyLock, taskControlAvailable, taskExecutorAvailable }: Props) {
  const p = useProductAppearance();
  const { width, height, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // The shell already reserves safe areas and side navigation. Start stacked
  // until onLayout reports the actual available container, not raw display px.
  const layout = getAdaptivePageLayout({
    containerWidth: Math.min(viewport.width || Math.min(width, 600), width),
    windowHeight: viewport.height, isLandscape: width > height, fontScale, variant: 'home',
  });
  const columns = layout.useColumns;
  const stackHero = fontScale > 1.3 || layout.primaryWidth < (layout.isCompactColumns ? 270 : 310);
  const stackQuick = fontScale > 1.2 || layout.primaryWidth < (layout.isCompactColumns ? 270 : 310);
  const hasTrustedBattery = batteryPercent != null && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100;
  const state = !connected ? '离线' : safetyLock ? '安全锁已启用' : '已连接';
  // These task policy inputs are independent of recall authorization. Missing
  // evidence stays unknown; the design's example states are never hard-coded.
  const taskControlState = taskControlAvailable == null ? '未验证' : taskControlAvailable ? '可用' : '不可用';
  const taskExecutorState = taskExecutorAvailable == null ? '待验证' : taskExecutorAvailable ? '可用' : '不可用';
  const quick = [
    { title: '巡航模板', icon: 'navigate-outline', onPress: onOpenRoutes },
    { title: '任务模板', icon: 'reader-outline', onPress: onOpenTasks },
    { title: '设备安全', icon: 'shield-checkmark-outline', onPress: onOpenSafety },
  ] as const;
  const executionConditions = <View style={styles.section} testID="home-execution-conditions">
    <Text accessibilityRole="header" style={[styles.sectionTitle, columns && styles.sectionTitleWide, { color: p.ink }]}>执行条件</Text>
    <View style={[styles.readinessCard, { backgroundColor: p.surface }]}>
      <View style={styles.readinessRow}><Ionicons accessible={false} name="person-outline" size={22} color={p.ink} /><Text style={[styles.readinessLabel, { color: p.ink }]}>控制权限</Text><Text style={[styles.readinessValue, { color: p.secondary }]}>{taskControlState}</Text></View>
      <View style={styles.readinessRow}><Ionicons accessible={false} name="hardware-chip-outline" size={22} color={p.ink} /><Text style={[styles.readinessLabel, { color: p.ink }]}>任务执行器</Text><Text style={[styles.readinessValue, { color: p.secondary }]}>{taskExecutorState}</Text></View>
    </View>
  </View>;
  const taskSummary = <View style={styles.section}>
    <Text accessibilityRole="header" style={[styles.sectionTitle, columns && styles.sectionTitleWide, { color: p.ink }]}>任务概览</Text>
    <Pressable accessibilityLabel="浏览任务模板" accessibilityHint="只读浏览通用模板，不会开始机器人任务" accessibilityRole="button" onPress={onOpenTasks} style={({ pressed }) => [styles.taskSummary, { backgroundColor: p.surface }, pressed && styles.pressed]} testID="home-task-summary">
      <Ionicons accessible={false} name="reader-outline" size={24} color={p.ink} />
      <View style={styles.summaryCopy}><Text style={[styles.readinessLabel, { color: p.ink }]}>任务状态待同步</Text><Text style={[styles.caption, { color: p.secondary }]}>仅可浏览通用模板</Text></View>
      <Ionicons accessible={false} name="chevron-forward-outline" size={20} color={p.secondary} />
    </Pressable>
  </View>;
  const primaryColumn = <View style={[styles.column, { width: layout.primaryWidth }, columns && styles.primaryWide, layout.isCompactColumns && styles.compactColumn]} testID="home-primary-column">
      {directConnection ? <View style={[styles.directConnection, { backgroundColor: p.surface }]} testID="home-direct-connection">
        <Text accessibilityRole="header" style={[typography.label, { color: p.ink }]}>IP 直连设备</Text>
        <Text style={[typography.body, { color: p.ink }]}>{directConnection.endpointLabel}</Text>
        {!directConnection.fresh ? <Text style={[styles.caption, { color: p.secondary }]}>状态已过期</Text> : null}
        <Text style={[styles.caption, { color: p.secondary }]}>{directConnection.summary}</Text>
        {onOpenDirectControl ? <Pressable accessibilityRole="button" accessibilityLabel="查看 IP 直连设备状态" accessibilityHint={directConnection.fresh ? '查看已读取的设备状态；不获取控制权' : '上次状态已过期，打开后重新检查连接'} onPress={onOpenDirectControl} style={({ pressed }) => [styles.connectionEntry, pressed && styles.pressed]} testID="home-direct-control">
          <Text style={[typography.label, { color: p.blueInk }]}>查看状态</Text><Ionicons accessible={false} name="arrow-forward-outline" size={20} color={p.blueInk} />
        </Pressable> : null}
      </View> : null}
      <View style={[styles.deviceCard, { backgroundColor: p.surface }, layout.isCompactColumns && styles.compactDeviceCard]} testID="home-device-card">
        <View style={styles.deviceHeading} testID="home-device-header">
          <View style={styles.identity}>
            <Text style={[styles.robotName, columns && styles.robotNameWide, { color: p.ink }]}>{robotName}</Text>
          </View>
          <View style={styles.connection} testID="home-connection-state">
            <View style={[styles.statusDot, { backgroundColor: connected ? p.blueInk : p.secondary }]} />
            <Text style={[styles.caption, { color: p.ink }]}>{state}</Text>
          </View>
        </View>
        <View style={[styles.deviceBody, layout.isCompactColumns && styles.compactDeviceBody, stackHero && styles.heroStack]} testID="home-device-hero">
          <View style={[styles.deviceInfo, stackHero && styles.infoStack]}>
          <View style={styles.battery}>
            <Text accessibilityLabel={hasTrustedBattery ? `电量 ${batteryPercent}%` : '电量尚未同步'} style={[styles.batteryNumber, { color: p.ink }]}>{hasTrustedBattery ? batteryPercent : '—'}<Text style={[styles.percent, { color: p.blueInk }]}>{hasTrustedBattery ? '%' : ''}</Text></Text>
            <View style={styles.batteryLabel}><Ionicons accessible={false} name="flash-outline" size={14} color={p.secondary} /><Text style={[styles.caption, { color: p.secondary }]}>{hasTrustedBattery ? '电量' : '电量待同步'}</Text></View>
            {hasTrustedBattery ? <View
              accessible accessibilityLabel="设备电量" accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: batteryPercent }}
              style={[styles.batteryTrack, { backgroundColor: p.border }]} testID="home-battery-meter"
            ><View style={[styles.batteryFill, { backgroundColor: p.action, width: `${batteryPercent}%` }]} testID="home-battery-fill" /></View> : null}
          </View>
          </View>
          <Image accessible={false} resizeMode="contain" source={robotImage} style={[styles.robot, columns && styles.robotWide, layout.isCompactColumns && styles.robotCompact, stackHero && styles.robotStack]} />
        </View>
        {layout.isCompactColumns ? <Text style={[styles.caption, { color: p.secondary }]} testID="home-compact-telemetry">传感器、温度、电机待同步</Text> : <View style={[styles.metrics, fontScale > 1.35 && styles.metricsStack]}>
          {([
            { label: '传感器', icon: 'pulse-outline' },
            { label: '温度', icon: 'thermometer-outline' },
            { label: '电机', icon: 'hardware-chip-outline' },
          ] as const).map(metric => <View key={metric.label} style={styles.metric}>
            <View style={styles.metricLabel}>
              <Ionicons accessible={false} name={metric.icon} size={16} color={p.secondary} />
              <Text style={[styles.metricCaption, { color: p.secondary }]}>{metric.label}</Text>
            </View>
            <Text style={[styles.metricValue, { color: p.secondary }]}>待同步</Text>
          </View>)}
        </View>}
        <View style={[styles.deviceActions, fontScale > 1.3 && styles.deviceActionsStack]}>
        <Pressable accessibilityLabel="控制中心" accessibilityHint="进入设备控制界面；实际操作需连接设备并获得控制权限" accessibilityRole="button" onPress={onOpenControl} style={({ pressed }) => [styles.control, { backgroundColor: p.action }, pressed && styles.pressed]} testID="home-control">
          <Text style={[styles.controlText, { color: p.actionInk }]}>控制中心</Text>
          <Ionicons accessible={false} name="arrow-forward-outline" size={18} color={p.actionInk} />
        </Pressable>
        <Pressable accessibilityLabel="召回" accessibilityRole="button" accessibilityHint={canRecall ? '返回基站' : recallBlockedReason ?? '需要设备连接和控制权限'} accessibilityState={{ disabled: !canRecall }} disabled={!canRecall} onPress={() => { if (canRecall) onRecall(); }} style={({ pressed }) => [styles.recall, pressed && canRecall && styles.pressed]} testID="home-recall">
          <Ionicons accessible={false} name={canRecall ? 'return-down-back-outline' : 'lock-closed-outline'} size={20} color={canRecall ? p.blueInk : p.secondary} />
          <Text style={[styles.recallTitle, { color: canRecall ? p.ink : p.secondary }]}>召回</Text>
        </Pressable>
        </View>
        {!canRecall ? <Text style={[styles.caption, { color: p.secondary }]}>{connected ? '当前召回不可用' : '连接设备后可检查权限'}</Text> : null}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, columns && styles.sectionTitleWide, { color: p.ink }]}>快捷操作</Text>
        <View style={[styles.quickRow, stackQuick && styles.quickStack]} testID="home-quick-list">
          {quick.map((item, index) => <Pressable accessibilityLabel={item.title} accessibilityRole="button" key={item.title} onPress={item.onPress} style={({ pressed }) => [styles.quickCard, { backgroundColor: p.surface }, pressed && styles.pressed]} testID={`home-quick-${index}`}>
            <Ionicons accessible={false} name={item.icon} size={26} color={p.blueInk} />
            <Text style={[styles.quickTitle, columns && styles.quickTitleWide, { color: p.ink }]}>{item.title}</Text>
          </Pressable>)}
        </View>
      </View>
      </View>;
  const secondaryColumn = <View style={[styles.column, { width: layout.secondaryWidth }, layout.isCompactColumns && styles.compactColumn]} testID="home-secondary-column">
        {columns ? taskSummary : executionConditions}
        {columns ? executionConditions : taskSummary}
      </View>;
  return <View onLayout={({ nativeEvent: { layout: measured } }) => {
    if (!Number.isFinite(measured.width) || measured.width <= 0 || !Number.isFinite(measured.height) || measured.height <= 0) return;
    const next = { width: Math.floor(measured.width), height: Math.floor(measured.height) };
    setViewport(current => current.width === next.width && current.height === next.height ? current : next);
  }} style={[styles.root, { backgroundColor: p.canvas }]}>
    {layout.isCompactColumns ? <View style={[styles.controllerColumns, { paddingHorizontal: layout.padding, gap: layout.gap }]} testID="home-controller-layout">
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.controllerContent} showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layout.primaryWidth }]} testID="home-controller-primary">{primaryColumn}</ScrollView>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.controllerContent} showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layout.secondaryWidth }]} testID="home-controller-secondary">{secondaryColumn}</ScrollView>
    </View> : <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingHorizontal: layout.padding, gap: layout.gap }, columns && styles.columns]} showsVerticalScrollIndicator={false}>
      {primaryColumn}{secondaryColumn}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingTop: 8, paddingBottom: 24, flexDirection: 'column' },
  columns: { flexDirection: 'row', alignItems: 'flex-start' }, column: { minWidth: 0, gap: 20 }, primaryWide: { gap: 24 },
  controllerColumns: { flex: 1, minHeight: 0, flexDirection: 'row', paddingTop: 8 },
  controllerPane: { flexGrow: 0, flexShrink: 1, minHeight: 0, minWidth: 0 }, controllerContent: { paddingBottom: 24 },
  compactColumn: { gap: 12 }, compactDeviceCard: { padding: 12, gap: 4 }, compactDeviceBody: { minHeight: 64 }, robotCompact: { height: 64 },
  deviceCard: { borderWidth: 0, borderRadius: 20, padding: 16, gap: 8 },
  directConnection: { borderRadius: 16, padding: 12, gap: 4 },
  deviceHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 120 }, robotName: { fontSize: 22, lineHeight: 30, fontWeight: '600' }, robotNameWide: { fontSize: 26, lineHeight: 34 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6 }, statusDot: { width: 6, height: 6, borderRadius: 3 },
  connectionEntry: { alignSelf: 'stretch', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  caption: { ...typography.supporting },
  deviceBody: { flexDirection: 'row', alignItems: 'center', minHeight: 96 },
  deviceInfo: { width: '42%', minWidth: 0 }, heroStack: { flexDirection: 'column', alignItems: 'stretch', gap: 8 }, infoStack: { width: '100%' },
  battery: { gap: 4 }, batteryLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  batteryNumber: { ...typography.metric, fontVariant: ['tabular-nums'] },
  percent: { fontSize: 18, letterSpacing: 0 }, robot: { width: '58%', height: 96 }, robotWide: { height: 114 }, robotStack: { width: '100%', height: 104 },
  batteryTrack: { width: '80%', height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' }, batteryFill: { height: '100%', borderRadius: 2 },
  metrics: { flexDirection: 'row', gap: 8 }, metricsStack: { flexDirection: 'column' },
  metric: { flex: 1, paddingHorizontal: 2, paddingVertical: 4, gap: 4 }, metricLabel: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metricCaption: { ...typography.supporting }, metricValue: { ...typography.secondary },
  deviceActions: { flexDirection: 'row', gap: 10 }, deviceActionsStack: { flexDirection: 'column' },
  control: { flex: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, alignSelf: 'stretch', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  section: { gap: 12 }, sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '500' }, sectionTitleWide: { fontSize: 20, lineHeight: 28 },
  recall: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 86, gap: 8, paddingHorizontal: 8, paddingVertical: 10 },
  summaryCopy: { flex: 1, gap: 4 }, recallTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  quickRow: { flexDirection: 'row', gap: 10 }, quickStack: { flexDirection: 'column' }, quickCard: { flex: 1, minHeight: 88, padding: 12, borderRadius: 16, gap: 10, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', textAlign: 'center' }, quickTitleWide: { fontSize: 18, lineHeight: 26 },
  readinessCard: { borderRadius: 16, padding: 16, gap: 16 },
  readinessRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 32 },
  readinessLabel: { ...typography.body, flexShrink: 1 }, readinessValue: { ...typography.secondary, marginLeft: 'auto' },
  taskSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 80, padding: 16, borderRadius: 16 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
