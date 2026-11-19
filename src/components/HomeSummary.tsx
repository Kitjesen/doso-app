import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from './AppText';
import { useProductAppearance } from '../appearance';
import { homeFont } from '../fonts/home';

export type HomeEvent = { id: string; at: string; title: string };
export type HomeJourney = { distanceM: number | null; durationMs: number | null; locationLabel?: string; observedAt?: string };
export const homeClock = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export function HomeSummary({ journey, events = [], map }: { journey?: HomeJourney; events?: HomeEvent[]; map?: ReactNode }) {
  const appearance = useProductAppearance();
  const p = { ...appearance, ink: appearance.isDark ? '#F5F5F7' : '#11141A', secondary: appearance.isDark ? '#B8BDC7' : '#4A5261' };
  const [open, setOpen] = useState<'map' | 'events' | null>(null);
  const value = (n: number | null | undefined, divisor: number) => n != null && Number.isFinite(n) && n >= 0 ? n / divisor : null;
  const km = value(journey?.distanceM, 1000), minutes = value(journey?.durationMs, 60000);
  const eventRows = (items: HomeEvent[]) => items.map((event, index) => <View key={event.id} style={styles.event}>
    <View style={styles.lineColumn}>
      <View style={[styles.dot, index === 0 && styles.firstDot]} />
      {index < items.length - 1 ? <View style={styles.line} /> : null}
    </View>
    <Text style={[styles.eventTime, { color: p.ink }]}>{homeClock(event.at)}</Text>
    <Text style={[styles.eventTitle, { color: p.ink }]}>{event.title}</Text>
  </View>);
  const mapContent = map ?? <View style={[styles.emptyMap, { backgroundColor: p.isDark ? p.surface : '#EFF5F7' }]}>
    <Feather name="map-pin" size={24} color={p.secondary} />
    <Text style={[styles.copy, { color: p.secondary }]}>暂无定位记录</Text>
  </View>;
  const heading = (title: string, action: string, target: 'map' | 'events') => <View style={styles.heading}>
    <Text accessibilityRole="header" style={[styles.title, { color: p.ink }]}>{title}</Text>
    <Pressable testID={'home-open-' + target} accessibilityRole="button" accessibilityLabel={action} onPress={() => setOpen(target)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text style={[styles.copy, { color: p.secondary }]}>{action}</Text><Feather name="chevron-right" size={17} color={p.secondary} />
    </Pressable>
  </View>;
  return <View style={styles.root}>
    <View style={[styles.card, { backgroundColor: p.raised }]} testID="home-journey">
      {heading('今日足迹', '展开地图', 'map')}
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={[styles.number, { color: p.ink }]}>{km === null ? '—' : km.toFixed(1)}<Text style={styles.unit}> km</Text></Text><Text style={[styles.copy, { color: p.secondary }]}>GPS 估算里程</Text></View>
        <View style={[styles.metric, styles.secondMetric, { borderColor: p.border }]}><Text style={[styles.number, { color: p.ink }]}>{minutes === null ? '—' : Math.floor(minutes)}<Text style={styles.unit}> min</Text></Text><Text style={[styles.copy, { color: p.secondary }]}>已记录时长</Text></View>
      </View>
      <View style={styles.map}>{mapContent}</View>
      <View style={styles.location}><Feather name="map-pin" size={17} color={p.ink} /><Text style={[styles.copy, styles.locationText, { color: p.ink }]}>{journey?.locationLabel ?? '暂无定位'}{journey?.observedAt ? ' · 定位于 ' + homeClock(journey.observedAt) : ''}</Text></View>
    </View>
    <View style={[styles.card, { backgroundColor: p.raised }]} testID="home-activity">
      {heading('最近动态', '全部记录', 'events')}
      {events.length ? <View>{eventRows(events.slice(0, 3))}</View> : <Text style={[styles.empty, styles.copy, { color: p.secondary }]}>暂无动态</Text>}
    </View>
    <Modal visible={open !== null} animationType="slide" onRequestClose={() => setOpen(null)}>
      <SafeAreaView style={[styles.modal, { backgroundColor: p.canvas }]}>
        <View style={styles.modalHeading}><Text style={[styles.title, { color: p.ink }]}>{open === 'map' ? '今日足迹' : '全部记录'}</Text><Pressable testID="home-close-detail" accessibilityRole="button" accessibilityLabel="关闭详情" onPress={() => setOpen(null)} style={styles.close}><Feather name="x" size={24} color={p.ink} /></Pressable></View>
        {open === 'map' ? <View style={styles.fullMap}>{mapContent}</View> : <ScrollView contentContainerStyle={styles.history}>{events.length ? eventRows(events) : <Text style={[styles.copy, { color: p.secondary }]}>暂无动态</Text>}</ScrollView>}
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 10 }, card: { boxShadow: '0 3px 12px rgba(76,122,172,0.06)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  title: { ...homeFont, fontSize: 19, lineHeight: 27, fontWeight: '700' }, copy: { ...homeFont, fontSize: 14, lineHeight: 21 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 36 },
  metrics: { flexDirection: 'row', paddingBottom: 2 }, metric: { flex: 1, gap: 2 }, secondMetric: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 22 },
  number: { ...homeFont, fontSize: 26, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] }, unit: { fontSize: 17, fontWeight: '500' },
  map: { height: 160, borderRadius: 12, overflow: 'hidden' }, emptyMap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }, locationText: { flex: 1 },
  event: { flexDirection: 'row', alignItems: 'center', minHeight: 30, gap: 12 },
  lineColumn: { width: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#A0CF8F', zIndex: 1 },
  firstDot: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#7BBE60' },
  line: { position: 'absolute', width: 1, top: '50%', bottom: -15, backgroundColor: '#C5E0B8' },
  eventTime: { ...homeFont, fontSize: 14, lineHeight: 21, fontWeight: '600', fontVariant: ['tabular-nums'] }, eventTitle: { ...homeFont, flex: 1, fontSize: 15, lineHeight: 23, fontWeight: '500' },
  empty: { paddingVertical: 16 }, pressed: { opacity: 0.65 }, modal: { flex: 1 },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, fullMap: { flex: 1, margin: 16, borderRadius: 18, overflow: 'hidden' }, history: { padding: 24 },
});
