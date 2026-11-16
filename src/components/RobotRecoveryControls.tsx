import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import { getProductAppearance } from '../appearance';
import { presentRobotRecovery, type RobotRecoveryCommand, type RobotRecoveryStatus } from '../features/control/robotRecovery';
import type { BrainstemGrpcProfile } from '../services/brainstemGrpc';
import type { ControlRuntimeState } from '../features/control/controlOperations';
import { useAppTheme } from '../theme';

type Props = {
  status: RobotRecoveryStatus | null;
  profile?: BrainstemGrpcProfile | null;
  runtimeState?: ControlRuntimeState;
  onCommand: (command: RobotRecoveryCommand) => Promise<unknown>;
  variant?: 'landscape' | 'portrait';
};

const ACTIONS: readonly { id: RobotRecoveryCommand; label: string; confirms: boolean }[] = [
  { id: 'enter', label: '进入恢复', confirms: false },
  { id: 'enable', label: '使能恢复', confirms: true },
  { id: 'start', label: '摔倒起立', confirms: true },
  { id: 'cancel', label: '取消恢复', confirms: false },
  { id: 'exit', label: '退出并回到运动', confirms: false },
];

export function RobotRecoveryControls({ status, profile, runtimeState, onCommand, variant = 'portrait' }: Props) {
  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const [open, setOpen] = useState(variant === 'portrait');
  const [pending, setPending] = useState<RobotRecoveryCommand | null>(null);
  const [confirming, setConfirming] = useState<Extract<RobotRecoveryCommand, 'enable' | 'start'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = presentRobotRecovery({ status, profile, runtimeState });
  const ink = variant === 'landscape' ? '#FFFFFF' : appearance.ink;
  const muted = variant === 'landscape' ? 'rgba(255,255,255,0.78)' : appearance.secondary;
  const surface = variant === 'landscape' ? 'rgba(18, 22, 30, 0.88)' : appearance.surface;
  const line = variant === 'landscape' ? 'rgba(245,248,255,0.22)' : 'transparent';

  const run = async (command: RobotRecoveryCommand) => {
    if (pending) return;
    setPending(command);
    setError(null);
    try { await onCommand(command); setConfirming(null); }
    catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : '未能确认摔倒恢复操作'); }
    finally { setPending(null); }
  };

  return (
    <View style={variant === 'landscape' ? styles.landscape : undefined} testID="control-recovery">
      {variant === 'landscape' ? <Pressable accessibilityLabel="摔倒恢复" accessibilityRole="button" onPress={() => setOpen(value => !value)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]} testID="control-recovery-open">
        <Text style={styles.chipText}>{view.title}</Text>
      </Pressable> : null}
      {open ? <View style={[styles.panel, { backgroundColor: surface, borderColor: line }]} testID="control-recovery-panel">
        <Text style={[styles.title, { color: ink }]}>{view.title}</Text>
        <Text style={[styles.body, { color: muted }]} testID="control-recovery-phase">{view.phaseLabel}</Text>
        {view.heartbeatLabel ? <Text style={[styles.body, { color: muted }]}>{view.heartbeatLabel}</Text> : null}
        {view.reason ? <Text style={[styles.body, { color: muted }]} testID="control-recovery-reason">{view.reason}</Text> : null}
        {error ? <Text style={[styles.body, { color: muted }]} testID="control-recovery-error">{error}</Text> : null}
        {confirming ? <View testID="control-recovery-confirm">
          <Text style={[styles.body, { color: ink }]}>{view.confirms[confirming]}</Text>
          <View style={styles.row}>
            <Pressable accessibilityLabel="确认摔倒恢复操作" accessibilityRole="button" disabled={pending !== null} onPress={() => { void run(confirming); }} style={styles.action} testID="control-recovery-confirm-submit">
              <Text style={styles.actionText}>确认</Text>
            </Pressable>
            <Pressable accessibilityLabel="取消确认" accessibilityRole="button" onPress={() => setConfirming(null)} style={styles.action} testID="control-recovery-confirm-dismiss">
              <Text style={styles.actionText}>返回</Text>
            </Pressable>
          </View>
        </View> : <View style={styles.row}>
          {ACTIONS.map(action => {
            const state = view.actions[action.id];
            return <Pressable
              accessibilityHint={state.reason ?? undefined}
              accessibilityLabel={action.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: !state.enabled || pending !== null }}
              disabled={!state.enabled || pending !== null}
              key={action.id}
              onPress={() => { if (action.confirms) setConfirming(action.id as 'enable' | 'start'); else void run(action.id); }}
              style={[styles.action, (!state.enabled || pending !== null) && styles.disabled]}
              testID={`control-recovery-${action.id}`}
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>;
          })}
        </View>}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  landscape: { alignItems: 'flex-start', gap: 6 },
  chip: { backgroundColor: 'rgba(18, 22, 30, 0.48)', borderColor: 'rgba(245,248,255,0.22)', borderRadius: 12, borderWidth: 1, minHeight: 24, paddingHorizontal: 8, justifyContent: 'center' },
  chipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '500', lineHeight: 16 },
  panel: { borderRadius: 16, borderWidth: 1, gap: 6, maxWidth: 280, padding: 10 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { backgroundColor: '#7EA9E8', borderRadius: 12, minHeight: 32, justifyContent: 'center', paddingHorizontal: 10 },
  actionText: { color: '#17354D', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
