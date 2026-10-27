import { randomUUID } from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { createBrainstemSimulationController } from '../services/brainstemSimulation';
import { createBrainstemSimulationStreamChannelFactory } from '../services/brainstemSimulationStream';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { useAppTheme } from '../theme';
import { ControlScreen } from './ControlScreen';

const unusedDiagnosticsGateway = createRobotDiagnosticsGateway({ nowMs: Date.now });
const SimulationControlSurface = memo(ControlScreen);
const unusedRobotImage = { uri: 'simulation://unused' };

/** Explicit development entry. Design QA and the production control gate are separate. */
export function BrainstemSimulationScreen({ onBack }: { onBack: () => void }) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  // Fast Refresh recreates memoized resources, but preserves useState values.
  // A disposed session must never be reused after the effect is restarted.
  const controller = useMemo(() => createBrainstemSimulationController({
    developmentMode: __DEV__,
    clientId: `doso-app-${randomUUID()}`,
    endpoint: 'http://127.0.0.1:8122',
    fetchImpl: expoFetch as typeof fetch,
    createInputChannel: createBrainstemSimulationStreamChannelFactory(),
  }), []);
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const interrupt = useCallback(() => { void controller.disconnect().catch(() => undefined); }, [controller]);

  useEffect(() => {
    const unsubscribe = controller.subscribe(next => setSnapshot(previous => {
      // Heartbeat ACKs do not change control state. Avoid redrawing both pads
      // twenty times per second solely to increment a diagnostic counter.
      if (previous.phase === next.phase && previous.sessionId === next.sessionId
        && previous.errorCode === next.errorCode && previous.errorMessage === next.errorMessage
        && (previous.lastAcknowledgedInputSequence === undefined) === (next.lastAcknowledgedInputSequence === undefined)
        && previous.lastAcknowledgedVelocity.x === next.lastAcknowledgedVelocity.x
        && previous.lastAcknowledgedVelocity.y === next.lastAcknowledgedVelocity.y
        && previous.lastAcknowledgedVelocity.z === next.lastAcknowledgedVelocity.z) return previous;
      return next;
    }));
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') interrupt();
    });
    return () => {
      unsubscribe();
      subscription.remove();
      void controller.dispose().catch(() => undefined);
    };
  }, [controller, interrupt]);

  const developmentInput = useMemo(() => ({
    ready: snapshot.phase === 'ready' && active,
    onDrive: controller.setDrive,
    onTurn: controller.setTurn,
    onInterrupt: interrupt,
  }), [controller, interrupt, snapshot.phase, active]);
  const busy = snapshot.phase === 'connecting' || snapshot.phase === 'stopping';
  const ready = snapshot.phase === 'ready';
  const velocity = snapshot.lastAcknowledgedVelocity;
  const hasReceipt = ready || snapshot.lastAcknowledgedInputSequence !== undefined;
  const handleBack = useCallback(() => { interrupt(); onBack(); }, [interrupt, onBack]);

  return <View style={[styles.root, { backgroundColor: colors.background }]} testID="brainstem-simulation-entry:lease-stream-v4">
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text accessibilityRole="header" style={{ ...typography.compactTitle, color: p.ink }}>Brainstem</Text>
          <Text style={{ ...typography.supporting, color: p.secondary }} testID="simulation-phase">本地仿真，{ready ? '控制已就绪' : busy ? '正在同步' : '未连接'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ready ? '断开仿真' : '连接仿真'}
          accessibilityState={{ disabled: busy || !active, busy }}
          disabled={busy || !active}
          onPress={() => { void (ready ? controller.disconnect() : controller.connect()).catch(() => undefined); }}
          testID="simulation-connect"
          style={({ pressed }) => [styles.connection, { backgroundColor: ready ? p.surface : p.action, opacity: busy || pressed ? 0.65 : 1 }]}
        >
          {busy ? <ActivityIndicator color={p.actionInk} size="small" /> : <Text style={{ ...typography.label, color: ready ? p.ink : p.actionInk }}>{ready ? '断开' : '连接仿真'}</Text>}
        </Pressable>
      </View>
      {snapshot.errorMessage ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.dangerText }]} testID="simulation-error">{snapshot.errorMessage}</Text> : null}
    </SafeAreaView>
    <SimulationControlSurface
      developmentInput={developmentInput}
      canUseManualControl={false}
      canUseRouteMode={false}
      canUseTaskMode={false}
      connected={false}
      diagnosticsDeviceClass="demo"
      diagnosticsGateway={unusedDiagnosticsGateway}
      onBack={handleBack}
      robotImage={unusedRobotImage}
      robotName="THUNDER 01"
      robotType="本地仿真"
    />
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ backgroundColor: colors.background }}>
      <View style={styles.receipt}>
        <Text selectable style={{ ...typography.supporting, color: p.secondary, fontVariant: ['tabular-nums'] }} testID="simulation-ack">
          {hasReceipt ? `服务确认：前后 ${velocity.x.toFixed(2)} m/s，横移 ${velocity.y.toFixed(2)} m/s，转向 ${velocity.z.toFixed(2)} rad/s` : '未取得控制会话'}
        </Text>
        <Text selectable style={{ ...typography.supporting, color: p.secondary }} testID="simulation-sequence">{`ACK ${snapshot.lastAcknowledgedInputSequence ?? '—'}`}</Text>
      </View>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  connection: { minWidth: 92, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22 },
  error: { ...typography.supporting, paddingHorizontal: 20, paddingBottom: 8 },
  receipt: { paddingHorizontal: 20, paddingVertical: 12, gap: 4 },
});
