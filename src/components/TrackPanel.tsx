import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { cardLayout, getProductAppearance } from '../appearance';
import { buildTrack } from '../features/location/track';
import { getRemoteHistory, type RemoteHistory } from '../services/remoteHistory';
import { RemoteStateError, type RemoteLocation } from '../services/remoteState';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import { Text } from './AppText';
import { LocationMap } from './LocationMap';
import { TrackSheet } from './TrackSheet';

type Props = { expectedUserId: string; deviceId: string; authorized: boolean; enabled: boolean;
  location?: RemoteLocation; fresh: boolean; simulated: boolean };
const midnight = (at: number) => { const date = new Date(at); date.setHours(0, 0, 0, 0); return date.getTime(); };
const shiftedDay = (at: number, offset: number) => { const date = new Date(at); date.setDate(date.getDate() + offset); return date.getTime(); };
const clock = (at: string | null) => at ? new Date(at).toLocaleTimeString() : '--';
const duration = (ms: number | null) => ms === null ? '--' : [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
  .map(value => String(value).padStart(2, '0')).join(':');

export function TrackPanel({ expectedUserId, deviceId, authorized, enabled, location, fresh, simulated }: Props) {
  const { isDark } = useAppTheme(), appearance = getProductAppearance(isDark);
  const [day, setDay] = useState(() => midnight(Date.now()));
  const calendarDay = useRef(midnight(Date.now()));
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const owner = useRef({ expectedUserId, deviceId, day, authorized });
  if (owner.current.expectedUserId !== expectedUserId || owner.current.deviceId !== deviceId || owner.current.day !== day
    || owner.current.authorized !== authorized) owner.current = { expectedUserId, deviceId, day, authorized };
  const captured = owner.current;
  const pending = useRef<AbortController | null>(null);
  const [reading, setReading] = useState<{ owner: object; history: RemoteHistory | null; message: string } | null>(null);
  const view = authorized && foreground && reading?.owner === captured ? reading : null;
  const history = view?.history;
  const track = useMemo(() => buildTrack(history?.points ?? []), [history]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { pending.current?.abort(); setReading(null); }
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!authorized || !foreground) return;
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      const today = midnight(Date.now()), previousToday = calendarDay.current;
      calendarDay.current = today;
      if (day === previousToday && day !== today) { setDay(today); return; }
      if (pending.current) return;
      const controller = new AbortController(); pending.current = controller;
      const endTs = Math.min(shiftedDay(day, 1), day + 86400000, Date.now() + 1);
      setReading(previous => {
        const history = previous?.owner === captured ? previous.history : null;
        return { owner: captured, history, message: history ? '' : '正在读取轨迹记录…' };
      });
      try {
        const history = await getRemoteHistory(expectedUserId, deviceId, day, endTs, { signal: controller.signal });
        if (!disposed && !controller.signal.aborted && owner.current === captured) setReading({ owner: captured, history, message: '' });
      } catch (error) {
        if (!disposed && !controller.signal.aborted && owner.current === captured) setReading({ owner: captured, history: null,
          message: error instanceof RemoteStateError && error.code === 'unauthorized'
            ? '登录或设备授权已失效，轨迹已清除。' : '轨迹记录读取失败，正在自动重试。' });
      } finally { if (pending.current === controller) pending.current = null; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => { disposed = true; clearInterval(timer); pending.current?.abort(); pending.current = null; };
  }, [captured, foreground]);

  const today = midnight(Date.now());
  const trackKey = `${expectedUserId}:${deviceId}:${day}:${history?.historyId ?? 'empty'}`;
  const distanceLabel = track.distanceM === null ? '--' : track.distanceM < 1000 ? String(Math.round(track.distanceM)) : (track.distanceM / 1000).toFixed(2);
  const distanceUnit = track.distanceM === null ? '' : track.distanceM < 1000 ? '米' : '公里';
  const simulatedTrack = history?.simulated ?? simulated;
  const message = !authorized ? '设备授权待确认，轨迹已清除。' : !foreground ? '页面已暂停读取。' : view?.message || (!history ? '正在读取轨迹记录…'
    : history.availability === 'preparing' ? '正在准备轨迹记录，稍后自动更新。' : !track.trail.length ? '本时段无有效 GPS 定位记录。' : 'GPS 估算 · 连续定位记录');
  const notes: string[] = [];
  if (!enabled || history?.enabled === false) notes.push('已停止上报');
  if (history?.syncState === 'incomplete') notes.push('轨迹不完整');
  if (day === today && location && !fresh) notes.push('定位已过期');
  const notice = history && track.trail.length
    ? [`记录时段 ${clock(track.firstFix)}–${clock(track.lastFix)}`, ...notes].join(' · ')
    : [message, ...notes].join(' · ');
  const row = (name: string, text: string) => <View style={styles.row} key={name}>
    <Text style={[typography.supporting, { color: appearance.secondary }]}>{name}</Text>
    <Text style={[typography.supporting, styles.value, { color: appearance.ink }]}>{text}</Text>
  </View>;
  return <View style={[styles.panel, { backgroundColor: appearance.raised, borderColor: appearance.border }]} testID="track-panel">
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[typography.cardTitle, { color: appearance.ink }]}>轨迹记录</Text>
        {simulatedTrack ? <View style={[styles.badge, { backgroundColor: appearance.blueSoft }]}>
          <Text style={[typography.caption, { color: appearance.blueInk }]}>模拟设备</Text>
        </View> : null}
      </View>
      <View style={[styles.days, { borderColor: appearance.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="前一天" onPress={() => setDay(shiftedDay(day, -1))} style={styles.dayArrow}>
          <Text style={[styles.arrow, { color: appearance.ink }]}>‹</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="今日" accessibilityHint="返回今日轨迹" accessibilityState={{ disabled: day === today }}
          disabled={day === today} onPress={() => setDay(midnight(Date.now()))} style={styles.date}>
          <Text style={[typography.supporting, { color: appearance.ink }]}>{day === today ? '今日 · ' : ''}{new Date(day).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="后一天" accessibilityState={{ disabled: day >= today }} disabled={day >= today}
          onPress={() => setDay(shiftedDay(day, 1))} style={[styles.dayArrow, day >= today && styles.disabled]}>
          <Text style={[styles.arrow, { color: appearance.ink }]}>›</Text>
        </Pressable>
      </View>
    </View>
    <TrackSheet key={`${expectedUserId}:${deviceId}:${day}`} map={<LocationMap
      location={day === today && authorized && foreground ? location : undefined} fresh={day === today && authorized && foreground && fresh}
      simulated={simulatedTrack} trail={track.trail} trackKey={trackKey} isDark={isDark} />}
      summary={<View style={styles.summary} testID="track-summary">
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={[typography.supporting, { color: appearance.secondary }]}>GPS 估算里程</Text>
            <View style={styles.numberRow}>
              <Text style={[styles.metricValue, { color: appearance.ink }]}>{distanceLabel}</Text>
              <Text style={[typography.caption, styles.unit, { color: appearance.secondary }]}>{distanceUnit}</Text>
            </View>
          </View>
          <View style={[styles.metric, styles.timeMetric, { borderColor: appearance.border }]}>
            <Text style={[typography.supporting, { color: appearance.secondary }]}>有效记录时长</Text>
            <Text style={[styles.metricValue, { color: appearance.ink }]}>{duration(track.durationMs)}</Text>
            <Text style={[typography.caption, { color: appearance.secondary }]}>时 : 分 : 秒</Text>
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[typography.supporting, { color: appearance.secondary }]} testID="track-message">{notice}</Text>
      </View>}>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>{message}</Text>
      {!enabled || history?.enabled === false ? <Text style={[typography.supporting, { color: appearance.secondary }]}>已停止上报 · 展示本时段记录</Text> : null}
      {track.gaps ? <Text style={[typography.supporting, { color: appearance.secondary }]}>存在 {track.gaps} 处记录缺口，轨迹已断开。</Text> : null}
      {history && history.syncState !== 'current'
        ? <Text style={[typography.supporting, { color: appearance.secondary }]}>{history.syncState === 'incomplete'
          ? '轨迹不完整，部分记录未能同步。' : '部分轨迹尚未同步，稍后自动更新。'}</Text> : null}
      {row('首次定位', clock(track.firstFix))}
      {row('末次定位', clock(track.lastFix))}
      <Text style={[typography.supporting, { color: appearance.secondary }]}>按上报时间查询，定位时间沿用原始采集时间。</Text>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>GPS 估算 · 有效记录时长仅表示连续定位覆盖。</Text>
      {simulatedTrack ? <Text style={[typography.supporting, { color: appearance.secondary }]}>模拟设备 · 模拟轨迹记录</Text> : null}
      {track.unknownAccuracy ? <Text style={[typography.supporting, { color: appearance.secondary }]}>部分定位精度未知，GPS 估算仍可能包含漂移。</Text> : null}
    </TrackSheet>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: cardLayout.radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  header: { padding: 18, paddingBottom: 12, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  days: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  dayArrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, arrow: { fontSize: 26, lineHeight: 30 },
  date: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.35 },
  summary: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 6 },
  metrics: { flexDirection: 'row' }, metric: { flex: 1, minWidth: 0, gap: 2 },
  timeMetric: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 14 }, numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  metricValue: { fontSize: 24, lineHeight: 32, fontWeight: '500', fontVariant: ['tabular-nums'] }, unit: { flexShrink: 1 },
  row: { flexDirection: 'row', gap: 16, justifyContent: 'space-between' }, value: { flexShrink: 1, textAlign: 'right' },
});
