import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text } from './AppText';
import { TrackPanel } from './TrackPanel';
import { AuthSessionOperationBusyError } from '../services/authSessionOperation';
import { getRemoteState, RemoteStateError, setRemoteState, type RemoteState, type RemoteStatus } from '../services/remoteState';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

type Reading = { owner: object; value: RemoteState | null; busy: 'read' | 'write' | 'reconcile' | null; uncertain: boolean; message: string };
const kinds: Record<string, string> = { CMS_STATE_KIND_ZERO: '初始状态', CMS_STATE_KIND_GROUNDED: '趴下', CMS_STATE_KIND_STANDING: '站立', CMS_STATE_KIND_WALKING: '行走', CMS_STATE_KIND_TRANSITIONING: '姿态切换中' };
const transitions: Record<string, string> = { CMS_TRANSITION_KIND_NONE: '无切换', CMS_TRANSITION_KIND_STAND_UP: '起立', CMS_TRANSITION_KIND_SIT_DOWN: '趴下', CMS_TRANSITION_KIND_GESTURE: '动作执行中' };
const owners: Record<string, string> = { CONTROL_OWNER_NONE: '无控制来源', CONTROL_OWNER_GRPC: '软件控制', CONTROL_OWNER_YUNZHUO: '遥控器' };
const fixLabels = ['单点定位', '差分定位', '精密定位', 'RTK 固定解', 'RTK 浮点解', '推算位置', '手动位置', '模拟位置'];
const label = (values: Record<string, string>, key: string) => Object.hasOwn(values, key) ? values[key] : '未知';
const activationLabel = (value: RemoteState) => ({
  off: '远程状态已关闭', enabling: '开启已保存，等待设备确认', on: '设备已确认开启',
  disabling: '云端已停止接收，等待设备确认', unavailable: value.enabled ? '开启已保存，设备暂不可达' : '关闭已保存，设备暂不可达',
})[value.activation];
const timeLabel = (timestamp: string, now: number) => {
  const age = now - Date.parse(timestamp);
  return `${new Date(timestamp).toLocaleString()} · ${age >= 0 ? `${Math.floor(age / 1000)} 秒前` : '时间待校验'}`;
};

export function RemoteStatePanel({ expectedUserId, deviceId, locationOnly = false }: { expectedUserId: string; deviceId: string; locationOnly?: boolean }) {
  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const owner = useRef({ expectedUserId, deviceId });
  if (owner.current.expectedUserId !== expectedUserId || owner.current.deviceId !== deviceId) owner.current = { expectedUserId, deviceId };
  const captured = owner.current;
  const mounted = useRef(true), active = useRef(AppState.currentState === 'active');
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [now, setNow] = useState(Date.now());
  const [mapOwner, setMapOwner] = useState<object | null>(null);
  const view = reading?.owner === captured ? reading : null;
  const pollMs = useRef(4000);
  pollMs.current = view?.value?.enabled ? 1000 : 4000;
  const renderedGeneration = generation.current;
  const current = (id: number) => mounted.current && active.current && owner.current === captured && generation.current === id;
  const stop = () => { generation.current++; pending.current?.abort(); pending.current = null; };
  const errorMessage = (error: unknown) => error instanceof RemoteStateError || error instanceof AuthSessionOperationBusyError
    ? error.message : '远程状态读取失败，请重试。';
  const refresh = async () => {
    if (!mounted.current || !active.current || owner.current !== captured || pending.current) return;
    const id = ++generation.current, controller = new AbortController();
    pending.current = controller;
    setReading(previous => ({ owner: captured, value: previous?.owner === captured ? previous.value : null,
      uncertain: previous?.owner === captured && previous.uncertain, busy: 'read', message: previous?.uncertain ? '正在确认保存结果…' : '正在读取远程状态…' }));
    try {
      const value = await getRemoteState(captured.expectedUserId, captured.deviceId, { signal: controller.signal });
      if (current(id)) { setNow(Date.now()); setReading({ owner: captured, value, busy: null, uncertain: false, message: '远程状态已更新。' }); }
    } catch (error) {
      if (current(id)) {
        const unauthorized = error instanceof RemoteStateError && error.code === 'unauthorized';
        setReading(previous => ({ owner: captured, value: unauthorized ? null : previous?.value ?? null,
          busy: null, uncertain: !unauthorized && (previous?.uncertain ?? false),
          message: !unauthorized && previous?.uncertain ? '保存结果尚未确认，正在自动核对。' : errorMessage(error) }));
      }
    } finally { if (current(id)) pending.current = null; }
  };
  const change = async () => {
    if (!mounted.current || !active.current || owner.current !== captured || generation.current !== renderedGeneration || !view?.value || view.uncertain || (pending.current && view.busy !== 'read')) return;
    if (pending.current) stop();
    const previous = view.value, id = ++generation.current, controller = new AbortController();
    pending.current = controller;
    setReading({ owner: captured, value: previous, busy: 'write', uncertain: false, message: '正在保存远程状态设置…' });
    try {
      const value = await setRemoteState(captured.expectedUserId, captured.deviceId, !previous.enabled, previous.revision, { signal: controller.signal });
      if (current(id)) { setNow(Date.now()); setReading({ owner: captured, value, busy: null, uncertain: false, message: '设置已保存。' }); }
    } catch (error) {
      if (!current(id)) return;
      const reconcile = error instanceof RemoteStateError && (error.code === 'revision_conflict' || error.outcomeMayBeUnknown)
        && error.code !== 'unauthorized';
      if (!reconcile) {
        setReading({ owner: captured, value: error instanceof RemoteStateError && error.code === 'unauthorized' ? null : previous,
          busy: null, uncertain: false, message: errorMessage(error) });
        return;
      }
      setReading({ owner: captured, value: previous, busy: 'reconcile', uncertain: true, message: '正在确认保存结果…' });
      try {
        const value = await getRemoteState(captured.expectedUserId, captured.deviceId, { signal: controller.signal });
        if (current(id)) { setNow(Date.now()); setReading({ owner: captured, value, busy: null, uncertain: false, message: '已重新读取当前设置。' }); }
      } catch (error) {
        if (current(id)) {
          const unauthorized = error instanceof RemoteStateError && error.code === 'unauthorized';
          setReading({ owner: captured, value: unauthorized ? null : previous, busy: null, uncertain: !unauthorized,
            message: unauthorized ? errorMessage(error) : '保存结果尚未确认，正在自动核对。' });
        }
      }
    } finally { if (current(id)) pending.current = null; }
  };
  useEffect(() => {
    mounted.current = true;
    active.current = AppState.currentState === 'active';
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRead = 0;
    const start = () => {
      if (timer !== null) return;
      lastRead = Date.now();
      void refresh();
      timer = setInterval(() => {
        if (!active.current) return;
        const at = Date.now(); setNow(at);
        if (at - lastRead >= pollMs.current) { lastRead = at; void refresh(); }
      }, 1000);
    };
    const pause = () => { stop(); if (timer !== null) clearInterval(timer); timer = null; };
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) start();
      else { pause(); setReading({ owner: captured, value: null, busy: null, uncertain: false, message: '页面已暂停读取。' }); }
    });
    if (active.current) start();
    return () => { mounted.current = false; pause(); subscription.remove(); };
  }, [captured]);

  const value = view?.value;
  const latest = value?.latest;
  const successful = latest?.status ? latest : value?.lastSuccess;
  const status: RemoteStatus | undefined = successful?.status;
  const observedAge = latest ? now - Date.parse(latest.observedAt) : Infinity;
  const receivedAge = latest ? now - Date.parse(latest.receivedAt) : Infinity;
  const fresh = !!value?.enabled && value.activation === 'on' && value.reachable === true && value.fresh
    && !!latest?.status && observedAge >= 0 && observedAge < 5000 && receivedAge >= 0 && receivedAge < 5000;
  const location = status?.location;
  const locationAge = location ? now - Date.parse(location.observedAt) : Infinity;
  const locationFresh = fresh && locationAge >= 0 && locationAge < 5000;
  const disabled = !value || view?.busy === 'write' || view?.busy === 'reconcile' || !!view?.uncertain;
  const row = (key: string, name: string, text: string) => <View style={styles.row} key={key} testID={`remote-state-${key}`}>
    <Text style={[typography.supporting, { color: appearance.secondary }]}>{name}</Text>
    <Text style={[typography.supporting, styles.value, { color: appearance.ink }]}>{text}</Text>
  </View>;
  if (locationOnly) return <TrackPanel expectedUserId={expectedUserId} deviceId={deviceId} authorized={!!value} enabled={value?.enabled ?? false} location={location} fresh={locationFresh} simulated={value?.simulated ?? false} />;
  return <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="remote-state-panel">
    <Text accessibilityRole="header" style={[typography.label, { color: appearance.ink }]}>远程状态</Text>
    {value?.simulated ? <Text testID="remote-state-simulated" style={[typography.supporting, { color: appearance.secondary }]}>模拟设备 · 以下为模拟状态，并非机器狗实际运行数据。</Text> : null}
    <Text style={[typography.supporting, { color: appearance.secondary }]}>开启后可上传运行状态、GNSS 位置与关键故障；视频另行选择。关闭远程状态后，设备仍可能保持云连接并发送设备标识和联系时间。</Text>
    <Text accessibilityLiveRegion="polite" style={[typography.label, { color: appearance.ink }]} testID="remote-state-activation">
      {view?.uncertain ? '设置保存结果待确认' : value ? activationLabel(value) : '远程状态设置待确认'}
    </Text>
    <Pressable accessibilityRole="button" accessibilityLabel={value?.enabled ? '关闭远程状态' : '开启远程状态'} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => void change()} style={[styles.action, { backgroundColor: appearance.blueSoft }, disabled && styles.disabled]} testID="remote-state-toggle">
      <Text style={[typography.label, { color: appearance.blueInk }]}>{view?.busy === 'write' ? '正在保存…' : view?.uncertain ? '正在确认保存结果' : value?.enabled ? '关闭远程状态' : '开启远程状态'}</Text>
    </Pressable>
    <Text selectable accessibilityLiveRegion="polite" style={[typography.supporting, { color: appearance.secondary }]} testID="remote-state-message">{view?.message ?? '正在读取远程状态…'}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: mapOwner === captured }} onPress={() => setMapOwner(mapOwner === captured ? null : captured)}
      style={[styles.action, { backgroundColor: appearance.blueSoft }]} testID="remote-location-toggle">
      <Text style={[typography.label, { color: appearance.blueInk }]}>{mapOwner === captured ? '收起位置' : '查看位置'}</Text>
    </Pressable>
    {mapOwner === captured ? <TrackPanel expectedUserId={expectedUserId} deviceId={deviceId} authorized={!!value} enabled={value?.enabled ?? false}
      location={location} fresh={locationFresh} simulated={value?.simulated ?? false} /> : null}
    {value?.enabled ? row('reachable', '设备连接', value.reachable === true ? '设备可达' : value.reachable === false ? '设备暂不可达' : '待确认') : null}
    {value?.enabled && value.lastSeenAt ? row('seen', '最近联系', timeLabel(value.lastSeenAt, now)) : null}
    {latest?.error ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="remote-state-read-error">本次设备状态读取失败</Text> : null}
    {status && successful ? <View style={styles.status} testID="remote-state-status">
      <Text style={[typography.label, { color: appearance.ink }]} testID="remote-state-fresh">{latest?.error || !latest ? '上次成功状态' : fresh ? '最新状态' : '状态已过期'}</Text>
      {row('observed', '采集时间', timeLabel(successful.observedAt, now))}
      {row('kind', '运行状态', label(kinds, status.state.kind))}
      {row('transition', '姿态切换', label(transitions, status.state.transition))}
      {row('control-owner', '控制来源', label(owners, status.control.owner))}
      {row('motor-output', '电机输出', status.control.motorOutputEnabled ? '已使能' : '未使能')}
      {row('critical-fault', '关键故障', status.control.criticalMotorFault ? '有严重电机故障' : '无严重电机故障')}
    </View> : value?.enabled ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="remote-state-no-data">等待设备上报状态</Text> : null}
    <Text style={[typography.label, { color: appearance.ink }]} testID="remote-location-fresh">{location ? locationFresh ? '最新定位' : '定位已过期' : '暂无 GPS 定位'}</Text>
    {location ? <>
      {row('location-observed', '定位时间', `${location.observedAt} · ${timeLabel(location.observedAt, now)}`)}
      {row('location-coordinates', '经纬度 · WGS84', `${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}`)}
      {row('location-quality', '定位质量', `${fixLabels[location.fixType - 1]} · 精度${location.accuracyM === null ? '未知' : ` ${location.accuracyM} 米`}`)}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: cardLayout.radius, padding: cardLayout.inset, gap: 10 },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, padding: 10 },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' },
  value: { flexShrink: 1, textAlign: 'right' },
  status: { gap: 10, marginTop: 6 },
});
