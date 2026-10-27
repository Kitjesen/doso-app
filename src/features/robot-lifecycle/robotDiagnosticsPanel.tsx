import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { cardLayout, getProductAppearance } from '../../appearance';
import { typography } from '../../typography';

import { useAppTheme } from '../../theme';
import type { ThemeColors } from '../../theme';
import {
  ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS,
  type RobotDiagnosticsDeviceClass,
  type RobotDiagnosticsGateway,
  type RobotDiagnosticsStateDto,
} from './robotDiagnosticsGateway';

type Props = {
  deviceClass: RobotDiagnosticsDeviceClass;
  gateway: RobotDiagnosticsGateway;
};

const ACTIVE_STATUSES = new Set(['queued', 'published', 'accepted', 'executing']);

export function RobotDiagnosticsPanel({ deviceClass, gateway }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [state, setState] = useState<RobotDiagnosticsStateDto>(() => gateway.create(deviceClass));
  const view = gateway.present(state);
  const primaryDisabled = !view.available || ACTIVE_STATUSES.has(state.status);

  useEffect(() => {
    setState(gateway.create(deviceClass));
  }, [deviceClass, gateway]);

  useEffect(() => {
    if (deviceClass !== 'demo') return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (state.status === 'queued') {
      timer = setTimeout(() => setState((current) => {
        if (current.deviceClass !== 'demo' || current.status !== 'queued') return current;
        const checked = gateway.expire(current);
        return checked.status === 'queued' ? gateway.publish(checked) : checked;
      }), 350);
    } else if (state.status === 'published' && state.commandId) {
      timer = setTimeout(() => setState((current) => {
        if (current.deviceClass !== 'demo' || current.status !== 'published') return current;
        const checked = gateway.expire(current);
        return checked.status === 'published'
          ? gateway.projectAck(checked, { authenticated: true, commandId: checked.commandId ?? '', status: 'accepted' })
          : checked;
      }), 550);
    } else if (state.status === 'accepted' && state.commandId) {
      timer = setTimeout(() => setState((current) => {
        if (current.deviceClass !== 'demo' || current.status !== 'accepted') return current;
        const checked = gateway.expire(current);
        return checked.status === 'accepted'
          ? gateway.projectAck(checked, { authenticated: true, commandId: checked.commandId ?? '', status: 'executing' })
          : checked;
      }), 650);
    } else if (state.status === 'executing' && state.commandId) {
      timer = setTimeout(() => {
        const receivedAtMs = gateway.nowMs();
        setState((current) => {
          if (current.deviceClass !== 'demo' || current.status !== 'executing') return current;
          const checked = gateway.expire(current);
          return checked.status === 'executing'
            ? gateway.projectAck(checked, {
              authenticated: true,
              commandId: checked.commandId ?? '',
              snapshot: {
                batteryPercent: 82,
                heartbeatAtMs: receivedAtMs,
                receivedAtMs,
                sensorSummary: '正常',
              },
              status: 'succeeded',
            })
            : checked;
        });
      }, 800);
    } else if (state.status === 'succeeded' && state.trustedSnapshot) {
      const staleInMs = Math.max(0, state.trustedSnapshot.receivedAtMs + ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS - gateway.nowMs() + 1);
      timer = setTimeout(() => setState((current) => ({ ...current })), staleInMs);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [deviceClass, gateway, state.commandId, state.status, state.trustedSnapshot]);

  const start = () => setState((current) => (
    current.deviceClass === 'demo' && !ACTIVE_STATUSES.has(current.status)
      ? gateway.queue(gateway.create('demo'))
      : current
  ));
  const cancel = () => setState((current) => (
    current.deviceClass === 'demo' && ACTIVE_STATUSES.has(current.status)
      ? gateway.cancel(current)
      : current
  ));

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>DIAGNOSTICS.HEALTH_CHECK</Text>
      <Text style={styles.title}>非运动健康诊断</Text>
      <Text style={styles.status}>{view.statusLabel}</Text>
      <Text style={styles.message}>{view.message}</Text>
      {view.error ? <Text style={styles.error}>{view.error.message}</Text> : null}

      {view.snapshot ? (
        <View style={styles.snapshot}>
          <Text style={styles.snapshotLabel}>{view.snapshot.label}</Text>
          <View style={styles.snapshotRow}>
            <Text style={styles.metric}>电量 {view.snapshot.batteryPercent}%</Text>
            <Text style={styles.metric}>传感器 {view.snapshot.sensorSummary}</Text>
          </View>
          <View style={styles.snapshotRow}>
            <Text style={styles.metric}>心跳 已接收</Text>
            <Text style={styles.metric}>在线 {view.snapshot.online ? '是' : '否'}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityHint={!view.available ? view.message : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: primaryDisabled }}
          disabled={primaryDisabled}
          onPress={start}
          style={[styles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
        >
          <Text style={[styles.primaryText, primaryDisabled && styles.primaryTextDisabled]}>{view.actionLabel}</Text>
        </Pressable>
        {ACTIVE_STATUSES.has(state.status) ? (
          <Pressable accessibilityRole="button" onPress={cancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>取消模拟</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const p = getProductAppearance(isDark);

  return StyleSheet.create({
    card: { backgroundColor: p.surface, borderRadius: cardLayout.radius, marginTop: cardLayout.gap, padding: cardLayout.inset },
    eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1 },
    title: { ...typography.label, color: p.ink, marginTop: 5 },
    status: { ...typography.supporting, color: p.ink, marginTop: 12 },
    message: { ...typography.supporting, color: p.secondary, marginTop: 5 },
    error: { ...typography.supporting, color: colors.dangerText, marginTop: 8 },
    snapshot: { backgroundColor: 'transparent', marginTop: 14, paddingVertical: 8 },
    snapshotLabel: { ...typography.label, color: p.ink },
    snapshotRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 9 },
    metric: { ...typography.supporting, color: p.secondary, flex: 1 },
    actions: { alignItems: 'center', marginTop: 14 },
    primaryButton: { alignItems: 'center', backgroundColor: p.action, borderRadius: 22, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16, width: '100%' },
    primaryButtonDisabled: { backgroundColor: 'transparent' },
    primaryText: { ...typography.label, color: p.actionInk },
    primaryTextDisabled: { color: p.secondary },
    cancelButton: { justifyContent: 'center', marginTop: 5, minHeight: 44, paddingHorizontal: 16 },
    cancelText: { ...typography.label, color: colors.dangerText },
  });
}
