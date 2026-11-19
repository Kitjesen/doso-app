import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler } from 'react-native';

import { images } from '../assets';
import { useBrainstemControl } from '../features/control/useBrainstemControl';
import { useBrainstemTelemetry } from '../features/control/useBrainstemTelemetry';
import { useG20Input } from '../features/control/useG20Input';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { isBrainstemControlAvailable } from '../services/brainstemControl';
import { isBrainstemGrpcAvailable, isBrainstemLanAvailable, validateBrainstemEndpoint, type BrainstemGrpcEndpoint } from '../services/brainstemGrpc';
import { getBrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { describeDirectRobotConnection } from '../services/directRobotConnection';
import { ControlScreen } from './ControlScreen';
import { RobotConnectionScreen } from './RobotConnectionScreen';

export function LocalRobotScreen({ onExit }: { onExit: () => void }) {
  const [ownerKey] = useState(() => `local-use:${randomUUID()}`);
  const [page, setPage] = useState<'connection' | 'control'>('connection');
  const [endpoint, setEndpoint] = useState<BrainstemGrpcEndpoint | null>(null);
  const live = useRef({ mounted: true, revision: 0, leaving: false });
  const available = isBrainstemControlAvailable();
  const control = useBrainstemControl({ ownerKey, ready: available, autoReconnectEnabled: false });
  const latestControl = useRef(control);
  latestControl.current = control;
  const telemetry = useBrainstemTelemetry({ ownerKey, endpoint,
    active: page === 'control' && control.state.connected });
  const input = useG20Input(page === 'control' && control.state.connected);
  const diagnostics = useMemo(() => createRobotDiagnosticsGateway({ nowMs: () => Date.now() }), []);
  const navigation = useRef({ page, endpoint });
  if (navigation.current.page !== page || navigation.current.endpoint !== endpoint) navigation.current = { page, endpoint };
  const capturedNavigation = navigation.current;
  const current = (revision: number) => live.current.mounted && !live.current.leaving
    && navigation.current === capturedNavigation && live.current.revision === revision && AppState.currentState === 'active';
  const exit = async () => {
    if (!live.current.mounted || live.current.leaving || navigation.current !== capturedNavigation) return;
    live.current.leaving = true;
    live.current.revision++;
    const closingControl = latestControl.current;
    try {
      if (closingControl.state.connected || closingControl.state.failureCode === 'stop_unconfirmed') await closingControl.operationCallbacks.stop();
      await closingControl.disconnect();
      if (latestControl.current.state.failureCode === 'stop_unconfirmed') throw new Error('stop_unconfirmed');
    } catch {
      live.current.leaving = false;
      if (live.current.mounted) Alert.alert('停止请求未确认', '请检查机器狗状态并使用硬件急停，确认安全后再退出。');
      return;
    }
    if (live.current.mounted) onExit();
  };
  const openConnection = async () => {
    const revision = live.current.revision;
    if (!current(revision)) return;
    const closingControl = latestControl.current;
    try {
      if (closingControl.state.connected || closingControl.state.failureCode === 'stop_unconfirmed') await closingControl.operationCallbacks.stop();
    } catch {
      if (current(revision)) Alert.alert('停止请求未确认', '请检查机器狗状态并使用硬件急停，确认安全后再更换连接。');
      return;
    }
    if (!current(revision)) return;
    live.current.revision++;
    await closingControl.disconnect();
    if (current(revision + 1)) {
      if (latestControl.current.state.failureCode === 'stop_unconfirmed') {
        Alert.alert('停止请求未确认', '请检查机器狗状态并使用硬件急停，确认安全后再更换连接。');
        return;
      }
      setPage('connection');
    }
  };

  useEffect(() => {
    live.current.mounted = true;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      live.current.revision++;
      void control.disconnect();
      setEndpoint(null);
      setPage('connection');
    });
    return () => {
      live.current.mounted = false;
      live.current.revision++;
      listener.remove();
      void control.disconnect();
    };
  }, [control.disconnect]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { void exit(); return true; });
    return () => listener.remove();
  }, [page, endpoint, control.disconnect, onExit]);

  if (page === 'connection') return <RobotConnectionScreen
    initialEndpoint={endpoint ?? undefined}
    onBack={() => { void exit(); }}
    onOpenControl={available ? async (candidate, principal, signal) => {
      if (signal.aborted || !current(live.current.revision)) return false;
      const transport = candidate.transport ?? 'tls';
      if (transport === 'lan-dev' && !isBrainstemLanAvailable()) return false;
      if (transport === 'tls' && (!candidate.clientIdentityAlias || !principal.trim())) return false;
      let target: BrainstemGrpcEndpoint;
      try {
        target = { ...validateBrainstemEndpoint(candidate.host, candidate.port, transport, candidate.clientIdentityAlias),
          transport, ...(candidate.clientIdentityAlias ? { clientIdentityAlias: candidate.clientIdentityAlias } : {}) };
      } catch { return false; }
      const revision = ++live.current.revision;
      const cancel = () => {
        if (live.current.revision === revision) { live.current.revision++; void control.disconnect(); }
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (!(await control.connect(target, transport === 'lan-dev' ? '' : principal.trim()))
          || signal.aborted || !current(revision)) return false;
        setEndpoint(target);
        setPage('control');
        return true;
      } finally { signal.removeEventListener('abort', cancel); }
    } : undefined}
  />;

  const label = endpoint ? `${endpoint.host}:${endpoint.port}` : '本地机器狗';
  const integration = getBrainstemIntegrationReadiness({ nativeModuleAvailable: isBrainstemGrpcAvailable(),
    endpointConfigured: Boolean(endpoint), readOnlyObservationFresh: control.state.connected,
    deviceIdentity: 'unbound', clientIdentitySelected: control.state.clientIdentitySelected,
    remoteListenerConfirmed: control.state.connected, remoteMtlsVerified: control.state.mutualTlsVerified,
    controlLeaseActive: control.state.leaseActive, productionExecutorConnected: available && control.state.connected,
    ackContractReady: control.state.sequence > 0, deadmanStopReady: available && control.state.connected,
    pairedClientAuthorized: control.state.principalVerified, transport: endpoint?.transport,
    lanDevConnectionConfirmed: control.state.connected && control.state.transport === 'grpc-lan' });
  return <ControlScreen landscapeDocksExpanded
    g20Controller={input}
    operationTargetKey={JSON.stringify([ownerKey, endpoint])}
    robotName={label} robotType="本地使用" robotImage={images.thunderHero}
    connected={control.state.connected} batteryPercent={null}
    canUseManualControl={control.canBeginManualControl} canUseRouteMode={false} canUseTaskMode={false} canRecall={false}
    diagnosticsDeviceClass="physical" diagnosticsGateway={diagnostics}
    onBack={() => { void exit(); }} onOpenConnection={() => { void openConnection(); }}
    productionInput={endpoint ? { ready: control.canBeginManualControl, touchReady: control.canBeginTouchControl,
      onTouchBegin: control.prepareManualControl, onTouchEnd: control.endTouchGesture,
      onDrive: control.drive, onTurn: control.turn, onSticks: control.sticks, onInterrupt: control.interrupt } : undefined}
    controlSession={{ label: control.state.connected ? '本地已连接' : '请重新连接机器狗',
      canAcquire: control.canAcquire, leaseActive: control.state.leaseActive || control.manualPrepared,
      busy: control.state.phase === 'operating' || control.state.phase === 'connecting',
      onAcquire: control.prepareManualControl, onRelease: () => { void control.interrupt(); }, error: control.state.error }}
    brainstemIntegration={integration}
    runtimeState={control.state.connected ? { ...control.runtimeState,
      battery: telemetry.presentation?.runtimeState.battery, joints: telemetry.presentation?.runtimeState.joints }
      : describeDirectRobotConnection(null).runtimeState}
    directConnection={telemetry.presentation ?? { ...describeDirectRobotConnection(null), endpointLabel: label }}
    operationCallbacks={control.operationCallbacks} operationReadiness={control.operationReadiness}
    manualControlBlockedReason={control.touchBlockedReason ?? undefined}
  />;
}
