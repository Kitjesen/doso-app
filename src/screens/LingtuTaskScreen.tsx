import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text, TextInput } from '../components/AppText';
import { isLingtuStatusFresh } from '../services/lingtuReadOnly';
import { cancelLingtuTask, LingtuTaskError, readLingtuTask, type LingtuTaskSnapshot } from '../services/lingtuTasks';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

const states: Readonly<Record<string, string>> = {
  IDLE: '空闲', PLANNING: '规划中', EXECUTING: '执行中', RECOVERING: '恢复中', PAUSED: '已暂停',
  SUCCESS: '已完成', FAILED: '失败', CANCELLED: '已取消', UNKNOWN: '未知',
};
const stops: Readonly<Record<string, string>> = {
  NOT_REQUESTED: '未请求', PENDING: '等待停稳确认', CONFIRMED: '已确认停稳', FAILED: '停稳确认失败', UNKNOWN: '未知',
};
const sources: Readonly<Record<string, string>> = {
  live_gateway_cache: '网关记录', durable_task_ledger: '持久任务记录', durable_native_goal_status: '持久导航记录',
};
const now = () => {
  try { return typeof performance?.now === 'function' ? performance.now() : NaN; } catch { return NaN; }
};

export function LingtuTaskScreen({ endpoint, allowLocalHttp = false, allowCancel = false, cancelAttempts, onBack }: {
  endpoint: string; allowLocalHttp?: boolean; allowCancel?: boolean; cancelAttempts?: Map<string, string>; onBack?: () => void;
}) {
  const { colors, isDark } = useAppTheme(), appearance = getProductAppearance(isDark);
  const [taskId, setTaskId] = useState('');
  const [snapshot, setSnapshot] = useState<LingtuTaskSnapshot | null>(null);
  const [busy, setBusy] = useState<'read' | 'cancel' | null>(null);
  const [message, setMessage] = useState('未读取');
  const [confirm, setConfirm] = useState<LingtuTaskSnapshot | null>(null);
  const [cancelledTask, setCancelledTask] = useState<string | null>(null);
  const mounted = useRef(true), active = useRef(AppState.currentState === 'active');
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAttempts = useRef(new Map<string, string>());
  const attempted = cancelAttempts ?? localAttempts.current;
  const cancelPending = useRef(false);
  const snapshotOwner = useRef<object | null>(null);
  const confirmation = useRef<LingtuTaskSnapshot | null>(null);
  const owner = useRef({ endpoint, allowLocalHttp, allowCancel, cancelAttempts });
  if (owner.current.endpoint !== endpoint || owner.current.allowLocalHttp !== allowLocalHttp || owner.current.allowCancel !== allowCancel
    || owner.current.cancelAttempts !== cancelAttempts) {
    owner.current = { endpoint, allowLocalHttp, allowCancel, cancelAttempts };
  }
  const context = owner.current;
  const renderedGeneration = generation.current;
  const current = (id: number) => mounted.current && active.current && owner.current === context && generation.current === id;
  const stop = () => {
    generation.current++; pending.current?.abort(); pending.current = null; cancelPending.current = false; confirmation.current = null;
    if (expiry.current !== null) clearTimeout(expiry.current);
    expiry.current = null;
  };
  const publish = (result: LingtuTaskSnapshot, id: number) => {
    if (!current(id)) return false;
    if (!isLingtuStatusFresh(result)) { setMessage('状态已过期，请重新查询'); return false; }
    snapshotOwner.current = context; setSnapshot(result);
    expiry.current = setTimeout(() => {
      if (!current(id)) return;
      expiry.current = null; confirmation.current = null; setSnapshot(null); setConfirm(null); setMessage('状态已过期，请重新查询');
    }, Math.ceil(Math.max(0, result.observedAt + 15000 - now())));
    return true;
  };
  const read = async (requestedId = taskId) => {
    if (!mounted.current || !active.current || pending.current || owner.current !== context) return;
    stop(); const id = generation.current, controller = new AbortController(); pending.current = controller;
    setBusy('read'); setSnapshot(null); setConfirm(null); setMessage('查询中');
    try {
      const result = await readLingtuTask({ endpoint, allowLocalHttp, taskId: requestedId || undefined, signal: controller.signal });
      if (!publish(result, id)) return;
      setMessage(result.taskId ? result.found ? '已读取' : '未找到任务' : '当前无任务');
    } catch {
      if (current(id)) setMessage('无法核验任务状态，请检查服务后重新查询');
    } finally {
      if (current(id)) { pending.current = null; setBusy(null); }
    }
  };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) return;
      const cancelling = cancelPending.current;
      stop(); setBusy(null); setSnapshot(null); setConfirm(null);
      setMessage(cancelling ? '取消结果需重新查询' : '查询已暂停');
    });
    return () => { mounted.current = false; stop(); subscription.remove(); };
  }, []);
  useEffect(() => {
    stop(); setCancelledTask(null); setSnapshot(null); setConfirm(null); setTaskId(''); setBusy(null);
    void read('');
    return stop;
  }, [endpoint, allowLocalHttp, allowCancel, cancelAttempts]);

  const cancellationKey = (value: LingtuTaskSnapshot) => `${value.endpoint}\0${value.taskId}`;
  const canCancel = (value: LingtuTaskSnapshot | null) => allowCancel && snapshotOwner.current === context && !!value && isLingtuStatusFresh(value)
    && value.found && !!value.taskId && value.taskId === value.currentTaskId && value.terminal === false
    && ['PLANNING', 'EXECUTING', 'RECOVERING', 'PAUSED'].includes(value.currentTaskState ?? '')
    && !['IDLE', 'SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(value.state ?? 'UNKNOWN')
    && !attempted.has(cancellationKey(value));
  const requestCancel = () => {
    if (!current(renderedGeneration) || pending.current || !canCancel(snapshot)) return;
    confirmation.current = snapshot; setConfirm(snapshot);
  };
  const cancelTask = async () => {
    if (!current(renderedGeneration) || pending.current || !confirm || confirmation.current !== confirm || !canCancel(confirm)) return;
    let requestId: string;
    try { requestId = randomUUID(); } catch { setConfirm(null); setMessage('无法创建取消请求，请稍后重试'); return; }
    const target = confirm, targetId = target.taskId!;
    stop(); const id = generation.current, controller = new AbortController(); pending.current = controller;
    cancelPending.current = true;
    attempted.set(cancellationKey(target), requestId); setCancelledTask(targetId); setBusy('cancel'); setConfirm(null); setSnapshot(null);
    setMessage('正在请求取消');
    let receipt = false, notSent = false;
    try {
      await cancelLingtuTask({ snapshot: target, allowLocalHttp, requestId, signal: controller.signal });
      if (!current(id)) return;
      receipt = true;
      setMessage('取消请求已接收，等待任务和停稳确认');
    } catch (error) {
      if (!current(id)) return;
      notSent = error instanceof LingtuTaskError && error.code === 'cancel_blocked';
      if (notSent) { attempted.delete(cancellationKey(target)); setCancelledTask(null); }
      setMessage(notSent ? '任务状态已变化，此次取消未发送' : '取消结果未知，请查询原任务；请勿重复提交');
    }
    try {
      if (!current(id)) return;
      const result = await readLingtuTask({ endpoint, allowLocalHttp, taskId: targetId, signal: controller.signal });
      if (publish(result, id)) setMessage(notSent ? '已重新查询任务，此次取消未发送'
        : receipt ? '取消请求已接收，请分别核对任务和停稳状态' : '已重新查询原任务，取消请求结果未确认');
    } catch {
      if (current(id)) setMessage(notSent ? '此次取消未发送，请重新查询任务'
        : receipt ? '取消请求已接收，任务和停稳状态尚未确认' : '取消结果未知，请查询原任务；请勿重复提交');
    } finally {
      if (current(id)) { pending.current = null; cancelPending.current = false; setBusy(null); }
    }
  };
  const back = () => { if (!current(renderedGeneration)) return; stop(); mounted.current = false; onBack?.(); };
  const changeId = (value: string) => {
    if (!current(renderedGeneration) || cancelPending.current) return;
    stop(); setBusy(null); setTaskId(value); setSnapshot(null); setConfirm(null); setMessage('未读取');
  };
  const button = (id: string, title: string, onPress: () => void, disabled = false) => <Pressable key={id}
    accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={title} testID={id}
    onPress={onPress} disabled={disabled} style={[styles.button, { backgroundColor: appearance.blue }, disabled && styles.disabled]}>
    <Text style={[typography.label, { color: appearance.blueInk }]}>{title}</Text>
  </Pressable>;
  const row = (id: string, title: string, value: string) => <View style={styles.row} key={id} testID={`lingtu-task-${id}`}>
    <Text style={[typography.supporting, { color: appearance.secondary }]}>{title}</Text>
    <Text style={[typography.label, styles.value, { color: appearance.ink }]}>{value}</Text>
  </View>;
  const cancellationTask = snapshotOwner.current === context
    ? cancelledTask ?? (snapshot && attempted.has(cancellationKey(snapshot)) ? snapshot.taskId : null) : null;
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} testID="lingtu-task-screen">
    <View style={styles.header}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="返回导航服务" onPress={back} style={styles.back} testID="lingtu-task-back">
        <Ionicons name="arrow-back" size={22} color={appearance.ink} />
      </Pressable> : null}
      <Text accessibilityRole="header" style={[typography.compactTitle, { color: appearance.ink }]}>导航任务</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={[styles.panel, { backgroundColor: appearance.surface }]}>
        <Text style={[typography.label, { color: appearance.ink }]}>任务编号</Text>
        <TextInput testID="lingtu-task-id" accessibilityLabel="任务编号，留空查询当前任务" value={taskId} onChangeText={changeId}
          editable={busy !== 'cancel'} autoCapitalize="none" autoCorrect={false} maxLength={128} placeholder="留空查询当前任务"
          placeholderTextColor={appearance.secondary} style={[styles.input, { backgroundColor: colors.background, color: appearance.ink }]} />
        {button('lingtu-task-read', busy ? '处理中' : '查询任务', () => { if (current(renderedGeneration)) void read(); }, busy !== null)}
        {busy === 'read' ? button('lingtu-task-stop-read', '取消查询', () => {
          if (!current(renderedGeneration) || cancelPending.current) return;
          stop(); setBusy(null); setMessage('查询已取消');
        }) : null}
        <Text accessibilityLiveRegion="polite" testID="lingtu-task-message" style={[typography.supporting, { color: appearance.secondary }]}>{message}</Text>
      </View>
      {snapshot && snapshotOwner.current === context ? <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-task-observation">
        {row('identity', '任务', snapshot.taskId ?? '无')}
        {row('state', '任务记录状态', snapshot.found ? states[snapshot.state ?? 'UNKNOWN'] ?? '未知' : '未找到')}
        {row('terminal', '记录终态', snapshot.terminal === true ? '已结束' : snapshot.terminal === false ? '未结束' : '未知')}
        {row('current', '导航当前状态', states[snapshot.currentTaskState ?? 'UNKNOWN'] ?? '未知')}
        {row('source', '记录来源', sources[snapshot.source ?? ''] ?? '未知')}
        {row('stop', '停稳确认', stops[snapshot.stopConfirmation ?? 'UNKNOWN'] ?? '未知')}
        {snapshot.taskId && snapshot.taskId !== snapshot.currentTaskId ? row('historical', '当前任务', '查询的是历史任务') : null}
        {allowCancel ? button('lingtu-task-cancel', '取消任务', requestCancel, busy !== null || !canCancel(snapshot)) : null}
      </View> : null}
      {confirm && snapshotOwner.current === context ? <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-task-confirmation">
        <Text style={[typography.label, { color: appearance.ink }]}>取消任务 {confirm.taskId}？</Text>
        {button('lingtu-task-confirm-cancel', '确认取消', () => void cancelTask())}
        {button('lingtu-task-keep', '保留任务', () => {
          if (!current(renderedGeneration) || confirmation.current !== confirm) return;
          confirmation.current = null; setConfirm(null);
        })}
      </View> : null}
      {cancellationTask ? <Text testID="lingtu-task-cancel-attempt" style={[typography.supporting, { color: appearance.secondary }]}>已为 {cancellationTask} 提交过取消请求，请查询结果</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, minHeight: 56 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 880, gap: cardLayout.gap, padding: 12, paddingBottom: 24 },
  panel: { borderRadius: cardLayout.radius, gap: 12, padding: cardLayout.inset },
  input: { ...typography.label, borderRadius: 12, minHeight: 48, paddingHorizontal: 12 },
  button: { alignItems: 'center', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  disabled: { opacity: 0.5 }, value: { flexShrink: 1, textAlign: 'right' },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', minHeight: 28 },
});
