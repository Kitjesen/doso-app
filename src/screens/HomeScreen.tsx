import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Image, type ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/HomeText';
import { HomeFeatures } from '../components/HomeFeatures';
import { ProductHeader } from '../components/ProductHeader';
import { homeClock, type HomeEvent, type HomeJourney } from '../components/HomeSummary';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';
import { homeFont, productType } from '../fonts/home';
import { useProductAppearance } from '../appearance';

type Props = {
  displayName?: string; remoteStatus?: ReactNode;
  connected: boolean; hasDevice?: boolean; batteryPercent?: number | null; busVoltageV?: number | null;
  robotImage: ImageSourcePropType; robotName: string; safetyLock: boolean;
  directConnection?: { endpointLabel: string; fresh: boolean; summary: string };
  onOpenDirectControl?: () => void; onOpenDirectVideo?: () => void; onConnect?: () => void; onOpenVideo?: () => void; onNotifications?: () => void;
  onOpenRoutes: () => void; onOpenTasks: () => void; onOpenSafety: () => void;
  currentTask?: { title: string; done: number; total: number; elapsed: string };
  journey?: HomeJourney; activities?: HomeEvent[]; transport?: string; updatedAt?: string | null;
  onOpenControl?: () => void; onRecall?: () => void; recallBlockedReason?: string | null;
  onRename?: () => void; onOpenAccountSecurity?: () => void; modelLabel?: string | null;
};

export function HomeScreen({ displayName, remoteStatus, connected, hasDevice = true, batteryPercent, busVoltageV, robotImage, robotName, safetyLock, directConnection, onOpenDirectControl, onOpenDirectVideo, onConnect, onOpenVideo, onNotifications, onOpenRoutes, onOpenTasks, onOpenSafety, onOpenControl, currentTask, journey, activities = [], transport, updatedAt }: Props) {
  const { isDark } = useProductAppearance();
  const styles = createStyles(isDark);
  const { width, height, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panel, setPanel] = useState<'guide' | 'activity' | 'video' | 'notifications' | 'remote' | null>(null);
  const layout = getAdaptivePageLayout({ containerWidth: Math.min(viewport.width || Math.min(width, 600), width), windowHeight: viewport.height, isLandscape: width > height, fontScale, variant: 'home' });
  const validVoltage = busVoltageV != null && Number.isFinite(busVoltageV) && busVoltageV > 0;
  const validBattery = connected && batteryPercent != null && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100;
  const openConnection = onConnect ?? onOpenSafety;
  const openVideo = onOpenDirectVideo ?? (() => { if (!connected) openConnection(); else if (onOpenVideo) onOpenVideo(); else if (onOpenControl) onOpenControl(); else setPanel('video'); });
  const liveLink = connected || directConnection?.fresh === true;
  const status = connected ? safetyLock && connected ? '安全锁已启用' : '已连接' : '未连接';
  const primary = <View style={[styles.column, { width: layout.primaryWidth }]} testID="home-primary-column">
    {directConnection && onOpenDirectControl ? <Pressable accessibilityRole="button" accessibilityLabel="搜索机器狗 Wi-Fi" onPress={onOpenDirectControl} style={styles.direct} testID="home-direct-control"><Text style={styles.secondary}>机器狗 Wi-Fi · {directConnection.endpointLabel}{directConnection.fresh ? '' : ' · 状态已过期'}</Text><Text style={styles.secondary}>{directConnection.summary}</Text></Pressable> : null}
    <View style={styles.hero} testID="home-device-card">
      <View style={[styles.heroFooter, fontScale > 1.3 && styles.stack]} testID="home-device-header">
        <View style={styles.identity}>
          <Text style={styles.greeting}>{displayName ? `你好，${displayName}` : '你好'}</Text>
          {hasDevice ? <Text style={styles.secondary} testID="home-connection-state">{status}{connected && updatedAt ? ` · ${homeClock(updatedAt)} 更新` : ''}</Text> : <Text style={styles.secondary}>未连接 · 连接你的第一台机器狗</Text>}
        </View>
        {!hasDevice || validBattery ? <View style={styles.heroAction}>
          {validBattery ? <View testID="home-battery" style={styles.batteryPill}><Feather name="battery" size={13} color={isDark ? '#D7D9DD' : '#5D6672'} /><Text style={styles.batteryText}>{Math.round(batteryPercent)}%</Text></View> : null}
          {!hasDevice ? <Pressable testID="home-primary" accessibilityRole="button" accessibilityLabel="连接设备" onPress={openConnection} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>连接设备</Text></Pressable> : null}
        </View> : null}
      </View>
      <View style={[styles.heroArt, layout.isCompactColumns && styles.heroCompact]} testID="home-device-hero">
        <Image accessible={false} testID="home-robot" source={require('../../assets/figma/thunder-cutout.png')} resizeMode="contain" style={styles.robot} />
      </View>
    </View>
    <View style={[styles.metrics, fontScale > 1.3 && styles.stack]} testID="home-status-strip">
      {[{ value: liveLink && validVoltage && busVoltageV != null ? busVoltageV.toFixed(1) + ' V' : '—', label: '总线电压' }, { value: liveLink ? transport ?? '—' : '—', label: '连接' }, { value: liveLink && updatedAt ? homeClock(updatedAt) : '—', label: '更新' }].map((item, index) => <View key={item.label} style={[styles.metric, index > 0 && fontScale <= 1.3 && styles.metricBorder]}><Text testID={index === 0 && liveLink && validVoltage ? 'home-bus-voltage' : undefined} numberOfLines={1} style={styles.metricValue}>{item.value}</Text><Text style={styles.secondary}>{item.label}</Text></View>)}
    </View>
    {remoteStatus ? <Pressable testID="home-remote-status" accessibilityRole="button" accessibilityLabel="查看云端状态" onPress={() => setPanel('remote')} style={({ pressed }) => [styles.remoteLink, pressed && styles.pressed]}><Feather name="cloud" size={18} color="#9BB5C5" /><Text style={[styles.secondary, { flex: 1 }]}>云端状态</Text><Feather name="chevron-right" size={17} color="#9BB5C5" /></Pressable> : null}
  </View>;
  const secondary = <View style={[styles.column, { width: layout.secondaryWidth }]} testID="home-secondary-column">
    <ControlPanelMotion style={styles.taskSection}><Text style={styles.sectionTitle}>当前任务</Text><Pressable accessibilityRole="button" onPress={onOpenTasks} style={styles.taskCard}><View style={styles.taskHeading}><Text style={styles.bottomTitle}>{currentTask?.title ?? '暂无进行中的任务'}</Text>{currentTask ? <Text style={styles.taskStatus}>进行中</Text> : null}</View>{currentTask ? <><Text style={styles.secondary}>{journey?.locationLabel ? journey.locationLabel + ' · ' : ''}{currentTask.done}/{currentTask.total} 检查点</Text><View style={styles.track}><View style={[styles.progress, { width: currentTask.total > 0 ? (`${Math.min(100, Math.max(0, currentTask.done / currentTask.total * 100))}%` as const) : '0%' }]} /></View><View style={styles.taskHeading}><Text style={styles.secondary}>{currentTask.elapsed}</Text><Text style={styles.secondary}>查看进度 ›</Text></View></> : <Text style={styles.secondary}>查看任务日程</Text>}</Pressable></ControlPanelMotion>
    <HomeFeatures dark={isDark} connected={connected} stacked={fontScale > 1.3 || layout.secondaryWidth < 280} onVideo={openVideo} onMaps={onOpenRoutes} onTasks={onOpenTasks} onSettings={onOpenSafety} />
    <ControlPanelMotion style={styles.activitySection}>
      <Pressable testID="home-bottom-card" accessibilityRole="button" accessibilityLabel={hasDevice ? '查看最近动态' : '打开使用指南'} onPress={() => setPanel(hasDevice ? 'activity' : 'guide')} style={styles.activityHeading}><Text style={styles.sectionTitle}>{hasDevice ? '最近动态' : '使用指南'}</Text><Feather name="chevron-right" size={17} color={isDark ? '#92928F' : '#6D727B'} /></Pressable>
      {hasDevice && activities.length ? activities.slice(0, 2).map(event => <View key={event.id} style={styles.activityRow}><Text style={styles.secondary}>{homeClock(event.at)}</Text><Text style={[styles.secondary, styles.grow]}>{event.title}</Text></View>) : <Text style={styles.secondary}>{hasDevice ? '暂无动态' : '连接 · 建图 · 查看状态'}</Text>}
    </ControlPanelMotion>
  </View>;
  return <View style={styles.root} onLayout={({ nativeEvent: { layout: next } }) => {
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return;
    setViewport(current => current.width === next.width && current.height === next.height ? current : { width: next.width, height: next.height });
  }}>
    <ProductHeader deviceTestID={hasDevice ? 'home-primary' : undefined} robotName={hasDevice ? robotName : undefined} onDevicePress={hasDevice ? onOpenSafety : openConnection} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: layout.padding }, layout.useColumns && { flexDirection: 'row', alignItems: 'flex-start', gap: layout.gap }]}>
      {primary}{secondary}
    </ScrollView>
    <Modal visible={panel !== null} transparent animationType="none" onRequestClose={() => setPanel(null)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={() => setPanel(null)} style={StyleSheet.absoluteFill} />
        <ControlPanelMotion style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.sheetHeading}><Text style={styles.sectionTitle}>{panel === 'guide' ? '使用指南' : panel === 'video' ? '远程画面' : panel === 'notifications' ? '通知' : panel === 'remote' ? '云端状态' : '最近动态'}</Text><Pressable testID="home-panel-close" accessibilityRole="button" accessibilityLabel="关闭" onPress={() => setPanel(null)} style={styles.close}><Feather name="x" size={23} color={isDark ? '#FFFFFF' : '#181C22'} /></Pressable></View>
            <ScrollView style={styles.sheetBody}>
              {panel === 'remote' ? remoteStatus : panel === 'guide' ? <View style={styles.guide}>{[{ title: '连接机器狗', copy: '开启设备，完成连接与绑定。' }, { title: '准备地图', copy: '在地图与路线中创建或导入地图。' }, { title: '查看设备', copy: '在设备详情中查看连接状态和更新记录。' }].map((step, index) => <View key={step.title} style={styles.guideRow}><Text style={styles.step}>{index + 1}</Text><View style={styles.grow}><Text style={styles.bottomTitle}>{step.title}</Text><Text style={styles.secondary}>{step.copy}</Text></View></View>)}</View> : panel === 'video' ? <View style={styles.videoEmpty}><Feather name="video" size={32} color="#77818F" /><Text style={styles.bottomTitle}>暂无画面</Text><Pressable accessibilityRole="button" onPress={() => { setPanel(null); onOpenSafety(); }} style={styles.close}><Text style={styles.secondary}>设备设置</Text></Pressable></View> : panel === 'notifications' ? <Text style={styles.secondary}>暂无通知</Text> : activities.length ? activities.map(event => <View key={event.id} style={styles.event}><Text style={styles.secondary}>{homeClock(event.at)}</Text><Text style={styles.bottomTitle}>{event.title}</Text></View>) : <Text style={styles.secondary}>暂无动态</Text>}
            </ScrollView>
          </SafeAreaView>
        </ControlPanelMotion>
      </View>
    </Modal>
  </View>;
}

function createStyles(dark: boolean) {
  const ink = dark ? '#E8E8E6' : '#181B20', secondary = dark ? '#A0A09B' : '#6D727B', surface = dark ? '#242423' : '#FFFFFF';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: dark ? '#1C1C1B' : '#F5F6F9' },
    header: { minHeight: 56, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
    brandClip: { width: 84, height: 26, justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }, brand: { width: 162, height: 18, tintColor: ink }, brandDivider: { width: 1, height: 18, backgroundColor: dark ? '#555B64' : '#B6BBC2' },
    model: { ...homeFont, fontSize: 17, lineHeight: 24, color: ink, fontWeight: '500' }, notification: { marginLeft: 'auto', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    content: { paddingBottom: 12, gap: 14 }, column: { minWidth: 0, gap: 7 },
    hero: { backgroundColor: 'transparent', overflow: 'hidden' },
    heroArt: { height: 164, position: 'relative', justifyContent: 'flex-end', alignItems: 'center', marginHorizontal: 4, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#30302E' : '#E2E5E8', backgroundColor: dark ? 'rgba(255,255,255,0.025)' : '#EFF1F3' }, heroCompact: { height: 150 },
    watermark: { ...homeFont, position: 'absolute', top: 0, color: dark ? '#343840' : '#E8E9ED', fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
    robot: { width: '100%', height: '100%' },
    greeting: { color: ink, fontSize: 23, lineHeight: 32, fontWeight: '600', marginBottom: 3 }, taskStatus: { color: '#9BB5C5', ...productType.caption }, activitySection: { paddingTop: 8 }, activityHeading: { minHeight: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, activityRow: { flexDirection: 'row', gap: 18, paddingVertical: 7, borderBottomWidth: 1, borderColor: dark ? '#343432' : '#DADDE3' },
    heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8, paddingTop: 6, gap: 10 },
    identity: { flex: 1, minWidth: 0 }, robotName: { ...homeFont, fontSize: 19, lineHeight: 27, fontWeight: '700', color: ink },
    status: { flexDirection: 'row', alignItems: 'center', gap: 5 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#738AAB' }, offlineDot: { backgroundColor: '#A2A8B0' },
    heroAction: { position: 'relative', paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#555B64' : '#D8DCE3' }, batteryPill: { position: 'absolute', top: -24, right: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#5C626D' : '#DBDEE5', backgroundColor: surface, flexDirection: 'row', alignItems: 'center', gap: 5 },
    batteryText: { ...homeFont, color: ink, fontSize: 11, lineHeight: 16, fontWeight: '600' },
    primaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: dark ? '#F1F2F4' : '#101113', justifyContent: 'center' }, primaryText: { ...homeFont, color: dark ? '#181B20' : '#FFFFFF', fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
    metrics: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: dark ? '#343432' : '#DADDE3' },
    metricHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
    metric: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 5 }, metricBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#454B55' : '#DADDE3' },
    metricValue: { ...homeFont, fontSize: 24, lineHeight: 32, fontWeight: '500', color: ink, fontVariant: ['tabular-nums'], textAlign: 'center' }, secondary: { ...homeFont, color: secondary, ...productType.caption },
    sectionTitle: { ...homeFont, color: ink, fontSize: 18, lineHeight: 26, fontWeight: '600' },
    bottomCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, backgroundColor: 'transparent', borderTopWidth: 1, borderColor: dark ? '#343432' : '#DADDE3' },
    bottomTitle: { ...homeFont, color: ink, ...productType.body, lineHeight: 22, fontWeight: '500' }, grow: { flex: 1 }, stack: { flexDirection: 'column', alignItems: 'stretch' },
    taskSection: { gap: 8 }, taskHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, remoteLink: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10 }, taskCard: { backgroundColor: surface, padding: 15, gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#3A3A38' : '#E4E7EC', boxShadow: dark ? '0 6px 18px rgba(0,0,0,.18)' : '0 4px 14px rgba(28,38,55,.06)' }, track: { height: 7, backgroundColor: dark ? '#494947' : '#DADDE3', borderRadius: 3 }, progress: { height: 7, backgroundColor: '#7795AA', borderRadius: 3 }, direct: { padding: 12, gap: 4, borderRadius: 12, backgroundColor: surface }, pressed: { opacity: .78, transform: [{ scale: .98 }] },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#151B2655' }, sheet: { maxHeight: '80%', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: surface },
    sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, sheetBody: { maxHeight: 400, marginTop: 16 },
    guide: { gap: 22, paddingBottom: 20 }, guideRow: { flexDirection: 'row', alignItems: 'center', gap: 16 }, step: { ...homeFont, fontSize: 22, color: '#9BA5B4' },
    event: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 16 }, videoEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  });
}
