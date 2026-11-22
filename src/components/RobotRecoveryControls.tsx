import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import type { RobotRecoveryOperatorAction, RobotRecoveryPresentation } from '../features/control/robotRecovery';

type Props = {
  view: RobotRecoveryPresentation;
  displayReason: string | null;
  confirming: boolean;
  pending: boolean;
  error: string | null;
  showActions: boolean;
  variant: 'landscape' | 'portrait';
  ink: string;
  muted: string;
  surface: string;
  line: string;
  onRequestBegin: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onFollowUp: (action: Extract<RobotRecoveryOperatorAction, 'cancel' | 'exit'>) => void;
};

/** Operator surface for one-tap recovery. Wire commands stay with the caller. */
export function RobotRecoveryControls({
  view, displayReason, confirming, pending, error, showActions, variant, ink, muted, surface, line,
  onRequestBegin, onConfirm, onDismiss, onFollowUp,
}: Props) {
  const followUp = view.actions.exit.enabled ? 'exit' : view.actions.cancel.enabled ? 'cancel' : null;
  const beginDisabled = pending || !view.actions.begin.enabled;

  return (
    <View style={variant === 'landscape' ? styles.landscape : undefined} testID="control-recovery">
      <View style={[styles.panel, { backgroundColor: surface, borderColor: line }]} testID="control-recovery-panel">
        <Text style={[styles.title, { color: ink }]}>{view.title}</Text>
        <Text style={[styles.body, { color: muted }]} testID="control-recovery-phase">{view.phaseLabel}</Text>
        {view.heartbeatLabel ? <Text style={[styles.body, { color: muted }]}>{view.heartbeatLabel}</Text> : null}
        {displayReason ? <Text style={[styles.body, { color: muted }]} testID="control-recovery-reason">{displayReason}</Text> : null}
        {error ? <Text style={[styles.body, { color: muted }]} testID="control-recovery-error">{error}</Text> : null}
        {confirming ? <View testID="control-recovery-confirm">
          <Text style={[styles.body, { color: ink }]}>{view.confirmation}</Text>
          <View style={styles.row}>
            <Pressable accessibilityLabel="确认摔倒恢复" accessibilityRole="button" disabled={pending} onPress={onConfirm} style={[styles.action, pending && styles.disabled]} testID="control-recovery-confirm-submit">
              <Text style={styles.actionText}>确认</Text>
            </Pressable>
            <Pressable accessibilityLabel="返回" accessibilityRole="button" disabled={pending} onPress={onDismiss} style={styles.action} testID="control-recovery-confirm-dismiss">
              <Text style={styles.actionText}>返回</Text>
            </Pressable>
          </View>
        </View> : showActions ? <View style={styles.row}>
          {followUp ? <Pressable
            accessibilityLabel={view.actions[followUp].label}
            accessibilityRole="button"
            accessibilityState={{ disabled: pending }}
            disabled={pending}
            onPress={() => onFollowUp(followUp)}
            style={[styles.action, pending && styles.disabled]}
            testID={`control-recovery-${followUp}`}
          >
            <Text style={styles.actionText}>{view.actions[followUp].label}</Text>
          </Pressable> : <Pressable
            accessibilityHint={view.actions.begin.reason ?? undefined}
            accessibilityLabel={view.actions.begin.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: beginDisabled }}
            disabled={beginDisabled}
            onPress={onRequestBegin}
            style={[styles.action, beginDisabled && styles.disabled]}
            testID="control-recovery-begin"
          >
            <Text style={styles.actionText}>{view.actions.begin.label}</Text>
          </Pressable>}
        </View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  landscape: { alignItems: 'flex-start', gap: 6 },
  panel: { borderRadius: 16, borderWidth: 1, gap: 6, maxWidth: 280, padding: 10 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { backgroundColor: '#7EA9E8', borderRadius: 12, minHeight: 32, justifyContent: 'center', paddingHorizontal: 10 },
  actionText: { color: '#17354D', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
