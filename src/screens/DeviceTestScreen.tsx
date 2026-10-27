import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, View } from 'react-native';

import { images } from '../assets';
import { Text } from '../components/AppText';
import { useBrainstemControl } from '../features/control/useBrainstemControl';
import { useBrainstemTelemetry } from '../features/control/useBrainstemTelemetry';
import { useG20Input } from '../features/control/useG20Input';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { isBrainstemControlAvailable } from '../services/brainstemControl';
import { isBrainstemLanAvailable, validateBrainstemEndpoint, type BrainstemGrpcEndpoint } from '../services/brainstemGrpc';
import { getBrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { describeDirectRobotConnection } from '../services/directRobotConnection';
import { ControlScreen } from './ControlScreen';
import { JointStatusScreen } from './JointStatusScreen';
import { RobotConnectionScreen } from './RobotConnectionScreen';

type Page = 'control' | 'connection' | 'joints';

/** QA local sessions have no account, cloud ownership or automatic motion authority. */
export function DeviceTestScreen({ onExit }: { onExit: () => void }) {
  const available = isBrainstemLanAvailable();
  const [page, setPage] = useState<Page>('control');
  const [endpoint, setEndpoint] = useState<BrainstemGrpcEndpoint | null>(null);
  const live = useRef({ mounted: true, revision: 0 });
  const control = useBrainstemControl({ ownerKey: 'qa-local-device-test', ready: available && page !== 'joints' });
  const navigation = useRef({ page, endpoint, callbacks: control.operationCallbacks });
  if (navigation.current.page !== page || navigation.current.endpoint !== endpoint
    || navigation.current.callbacks !== control.operationCallbacks) navigation.current = { page, endpoint, callbacks: control.operationCallbacks };
  const captured = navigation.current;
  const input = useG20Input(available && page === 'control');
  const telemetry = useBrainstemTelemetry({ ownerKey: 'qa-local-device-test', endpoint,
    active: available && (page === 'joints' || page === 'control' && control.state.connected) });
  const diagnostics = useMemo(() => createRobotDiagnosticsGateway({ nowMs: () => Date.now() }), []);
  const current = (revision: number) => live.current.mounted && navigation.current === captured && revision === live.current.revision
    && isBrainstemLanAvailable() && AppState.currentState === 'active';
  const exit = () => {
    if (!live.current.mounted || navigation.current !== captured) return;
    live.current.revision++; void control.disconnect(); onExit();
  };
  const openConnection = () => {
    if (!current(live.current.revision)) return;
    live.current.revision++; void control.disconnect(); setPage('connection');
  };
  const returnToControl = () => {
    if (!current(live.current.revision)) return;
    live.current.revision++; void control.disconnect(); setPage('control');
  };

  useEffect(() => {
    live.current.mounted = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') live.current.revision++;
    });
    return () => { live.current.mounted = false; live.current.revision++; subscription.remove(); };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'control') exit();
      else returnToControl();
      return true;
    });
    return () => subscription.remove();
  }, [page, control.disconnect, onExit]);

  if (!available) return <View testID="device-test-unavailable">
    <Text>当前安装包不支持设备测试</Text>
    <Pressable accessibilityRole="button" onPress={exit} testID="device-test-exit"><Text>返回登录</Text></Pressable>
  </View>;

  if (page === 'connection') return <RobotConnectionScreen
    initialEndpoint={endpoint ?? undefined}
    onBack={returnToControl}
    onOpenControl={async (candidate, _principal, signal) => {
      if (signal.aborted || !current(live.current.revision) || candidate.transport !== 'lan-dev') return false;
      const revision = ++live.current.revision;
      let target: BrainstemGrpcEndpoint;
      try { target = { ...validateBrainstemEndpoint(candidate.host, candidate.port, 'lan-dev', candidate.clientIdentityAlias), transport: 'lan-dev' }; }
      catch { return false; }
      const cancel = () => { if (live.current.revision === revision) { live.current.revision++; void control.disconnect(); } };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (!(await control.connect(target, '')) || signal.aborted || !current(revision)) return false;
        setEndpoint(target); setPage('control');
        return true;
      } finally { signal.removeEventListener('abort', cancel); }
    }}
  />;

  const label = endpoint ? `${endpoint.host}:${endpoint.port}` : 'THUNDER-01';
  if (page === 'joints') return <JointStatusScreen deviceName={label}
    joints={telemetry.presentation?.runtimeState.joints}
    observedAt={telemetry.snapshot?.observation.observedAt}
    refreshing={telemetry.refreshing} error={telemetry.error}
    onRefresh={endpoint ? () => { void telemetry.refresh(); } : undefined}
    onBack={openConnection}
  />;

  const integration = getBrainstemIntegrationReadiness({ nativeModuleAvailable: available,
    endpointConfigured: Boolean(endpoint), readOnlyObservationFresh: control.state.connected,
    deviceIdentity: 'unbound', clientIdentitySelected: control.state.clientIdentitySelected,
    remoteListenerConfirmed: control.state.connected, remoteMtlsVerified: control.state.mutualTlsVerified,
    controlLeaseActive: control.state.leaseActive,
    productionExecutorConnected: isBrainstemControlAvailable() && control.state.connected,
    ackContractReady: control.state.sequence > 0, deadmanStopReady: isBrainstemControlAvailable() && control.state.connected,
    pairedClientAuthorized: control.state.principalVerified, transport: endpoint?.transport,
    lanDevConnectionConfirmed: control.state.connected && control.state.transport === 'grpc-lan' });
  return <ControlScreen g20Controller={input}
    operationTargetKey={JSON.stringify(['qa-local-device-test', endpoint])}
    robotName={label} robotType="局域网连接" robotImage={images.thunderHero}
    connected={control.state.connected} batteryPercent={null}
    canUseManualControl={control.canBeginManualControl} canUseRouteMode={false} canUseTaskMode={false} canRecall={false}
    diagnosticsDeviceClass="physical" diagnosticsGateway={diagnostics}
    onBack={exit} onOpenConnection={openConnection}
    onOpenJointStatus={async () => {
      if (!current(live.current.revision)) return;
      const revision = ++live.current.revision;
      try { await control.operationCallbacks.stop(); } catch { return; }
      if (!current(revision)) return;
      await control.disconnect();
      if (current(revision)) setPage('joints');
    }}
    productionInput={endpoint ? { ready: control.canBeginManualControl,
      onDrive: control.drive, onTurn: control.turn, onSticks: control.sticks, onInterrupt: control.interrupt } : undefined}
    controlSession={endpoint ? { label: control.state.connected ? '局域网已连接' : '未连接',
      canAcquire: control.canAcquire, leaseActive: control.state.leaseActive || control.manualPrepared,
      busy: control.state.phase === 'operating' || control.state.phase === 'connecting',
      onAcquire: control.prepareManualControl, onRelease: () => { void control.interrupt(); }, error: control.state.error } : undefined}
    brainstemIntegration={integration}
    runtimeState={control.state.connected ? { ...control.runtimeState,
      battery: telemetry.presentation?.runtimeState.battery, joints: telemetry.presentation?.runtimeState.joints }
      : describeDirectRobotConnection(null).runtimeState}
    directConnection={telemetry.presentation ?? { ...describeDirectRobotConnection(null), endpointLabel: label }}
    operationCallbacks={control.operationCallbacks} operationReadiness={control.operationReadiness}
    manualControlBlockedReason={control.state.error ?? '请先连接机器狗并确认电机与姿态。'}
  />;
}
