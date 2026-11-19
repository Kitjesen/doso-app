import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, View } from 'react-native';

import { images } from '../assets';
import { Text } from '../components/AppText';
import { ControlVideoSurface } from '../components/ControlVideoSurface';
import { useBrainstemControl } from '../features/control/useBrainstemControl';
import type { useRememberedBrainstemConnection } from '../features/control/useRememberedBrainstemConnection';
import { useBrainstemTelemetry } from '../features/control/useBrainstemTelemetry';
import { useG20Input } from '../features/control/useG20Input';
import { bindVideoOrigin, videoTargetKey } from '../features/video/videoBinding';
import { useControlVideoReceiver } from '../features/video/useControlVideoReceiver';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { isBrainstemControlAvailable } from '../services/brainstemControl';
import { isBrainstemLanAvailable, validateBrainstemEndpoint, type BrainstemGrpcEndpoint } from '../services/brainstemGrpc';
import { getBrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { describeDirectRobotConnection } from '../services/directRobotConnection';
import { validateLingtuOrigin } from '../services/lingtuReadOnly';
import { ControlScreen } from './ControlScreen';
import { JointStatusScreen } from './JointStatusScreen';
import { RobotConnectionScreen } from './RobotConnectionScreen';

type Page = 'control' | 'connection' | 'joints' | 'video-only';

/** QA local sessions have no account, cloud ownership or automatic motion authority. */
export function DeviceTestScreen({ onExit, rememberedConnection }: {
  onExit: () => void;
  rememberedConnection?: ReturnType<typeof useRememberedBrainstemConnection>;
}) {
  const available = isBrainstemLanAvailable();
  const [page, setPage] = useState<Page>('control');
  const [selectedEndpoint, setEndpoint] = useState<BrainstemGrpcEndpoint | null>(null);
  const endpoint = selectedEndpoint ?? rememberedConnection?.connection?.endpoint ?? null;
  const videoTarget = videoTargetKey('qa-local-device-test', endpoint);
  const videoGeneration = useRef({ target: videoTarget, generation: 0 });
  if (videoGeneration.current.target !== videoTarget) videoGeneration.current = { target: videoTarget, generation: videoGeneration.current.generation + 1 };
  const [videoBinding, setVideoBinding] = useState<{ origin: string; target: string; generation: number; viewerToken?: string } | null>(null);
  const [videoOnly, setVideoOnly] = useState<{ origin: string; viewerToken?: string } | null>(null);
  const boundVideoConfig = videoBinding && videoTarget === videoBinding.target && videoBinding.generation === videoGeneration.current.generation
    ? { deviceId: videoTarget, gatewayUrl: videoBinding.origin, viewerToken: videoBinding.viewerToken, allowLocalHttp: available && endpoint?.transport === 'lan-dev' } : null;
  const videoConfig = page === 'video-only' && videoOnly
    ? { deviceId: `qa-video-only:${videoOnly.origin}`, gatewayUrl: videoOnly.origin, viewerToken: videoOnly.viewerToken, allowLocalHttp: available }
    : page === 'control' ? boundVideoConfig : null;
  const video = useControlVideoReceiver(videoConfig, available && (page === 'control' || page === 'video-only'));
  const live = useRef({ mounted: true, revision: 0 });
  const control = useBrainstemControl({ ownerKey: 'qa-local-device-test', ready: available && (page === 'control' || page === 'connection'),
    autoConnectEndpoint: page === 'control' ? endpoint : null,
    autoConnectPrincipal: '',
    autoReconnectEnabled: page === 'control',
  });
  const navigation = useRef({ page, endpoint, callbacks: control.operationCallbacks });
  if (navigation.current.page !== page || navigation.current.endpoint !== endpoint
    || navigation.current.callbacks !== control.operationCallbacks) navigation.current = { page, endpoint, callbacks: control.operationCallbacks };
  const captured = navigation.current;
  const capturedVideoGeneration = videoGeneration.current.generation;
  const input = useG20Input(available && page === 'control');
  const telemetry = useBrainstemTelemetry({ ownerKey: 'qa-local-device-test', endpoint,
    active: available && (page === 'joints' || page === 'control' && control.state.connected) });
  const diagnostics = useMemo(() => createRobotDiagnosticsGateway({ nowMs: () => Date.now() }), []);
  const current = (revision: number) => live.current.mounted && navigation.current === captured && revision === live.current.revision
    && isBrainstemLanAvailable() && AppState.currentState === 'active';
  const exit = () => {
    if (!live.current.mounted || navigation.current !== captured) return;
    live.current.revision++; rememberedConnection?.forget(); void control.disconnect(); onExit();
  };
  const openConnection = () => {
    if (!current(live.current.revision)) return;
    live.current.revision++; void control.suspend(); setPage('connection');
  };
  const returnToControl = () => {
    if (!current(live.current.revision)) return;
    live.current.revision++; void control.suspend(); setPage('control');
  };
  const closeVideoOnly = () => {
    if (!current(live.current.revision)) return;
    live.current.revision++; setVideoOnly(null); setPage('connection');
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
      else if (page === 'video-only') closeVideoOnly();
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
    navigationUseLabel="关联同主机视频"
    allowViewerToken
    onViewVideo={(origin, viewerToken) => {
      if (!current(live.current.revision)) return false;
      let safeOrigin: string;
      try { safeOrigin = validateLingtuOrigin(origin, available); } catch { return false; }
      if (viewerToken && !safeOrigin.startsWith('https://')) return false;
      live.current.revision++; setVideoOnly({ origin: safeOrigin, viewerToken }); setPage('video-only');
      return true;
    }}
    onUseNavigation={(origin, viewerToken) => {
      if (!current(live.current.revision) || capturedVideoGeneration !== videoGeneration.current.generation) return false;
      let safeOrigin: string;
      try { safeOrigin = validateLingtuOrigin(origin, available && endpoint?.transport === 'lan-dev'); } catch { return false; }
      if (viewerToken && !safeOrigin.startsWith('https://')) return false;
      const target = bindVideoOrigin('qa-local-device-test', endpoint, safeOrigin);
      if (!target) return false;
      setVideoBinding({ origin: safeOrigin, target, generation: capturedVideoGeneration, viewerToken });
      setPage('control');
      return true;
    }}
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
        rememberedConnection?.remember(target, '');
        setEndpoint(target); setPage('control');
        return true;
      } finally { signal.removeEventListener('abort', cancel); }
    }}
  />;

  if (page === 'video-only') return <View testID="device-video-only" style={{ flex: 1, backgroundColor: '#000' }}>
    <ControlVideoSurface presentation={video.presentation} surface={video.surface} active onInterrupted={() => {}} />
    <Pressable accessibilityRole="button" accessibilityLabel="关闭视频测试" onPress={closeVideoOnly}
      testID="device-video-only-back" style={{ position: 'absolute', top: 20, left: 20, padding: 12, backgroundColor: '#fff', borderRadius: 20 }}>
      <Text>返回</Text>
    </Pressable>
    <Text style={{ position: 'absolute', top: 24, right: 20, color: '#fff' }}>仅查看视频</Text>
  </View>;

  const label = endpoint ? `${endpoint.host}:${endpoint.port}` : 'THUNDER-01';
  if (page === 'joints') return <JointStatusScreen deviceName={label}
    robotDiagram={images.thunderJointDiagram}
    joints={telemetry.presentation?.runtimeState.joints}
    observedAt={telemetry.snapshot?.observation.observedAt}
    refreshing={telemetry.refreshing} error={telemetry.error}
    onRefresh={endpoint ? () => { void telemetry.refresh(); } : undefined}
    onBack={returnToControl}
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
  return <ControlScreen landscapeDocksExpanded g20Controller={input}
    video={videoConfig ? video.presentation : undefined}
    videoSurface={videoConfig ? video.surface : undefined}
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
      await control.suspend();
      if (current(revision)) setPage('joints');
    }}
    productionInput={endpoint ? { ready: control.canBeginManualControl,
      touchReady: control.canBeginTouchControl, onTouchBegin: control.prepareManualControl, onTouchEnd: control.endTouchGesture,
      onDrive: control.drive, onTurn: control.turn, onSticks: control.sticks, onInterrupt: control.interrupt } : undefined}
    controlSession={endpoint ? { label: control.state.connected ? '局域网已连接' : control.reconnecting ? '正在重连' : '未连接',
      canAcquire: control.canAcquire, leaseActive: control.state.leaseActive || control.manualPrepared,
      busy: control.state.phase === 'operating' || control.state.phase === 'connecting',
      onAcquire: control.prepareManualControl, onRelease: () => { void control.interrupt(); }, error: control.state.error } : undefined}
    brainstemIntegration={integration}
    runtimeState={control.state.connected ? { ...control.runtimeState,
      battery: telemetry.presentation?.runtimeState.battery, joints: telemetry.presentation?.runtimeState.joints }
      : describeDirectRobotConnection(null).runtimeState}
    directConnection={telemetry.presentation ?? { ...describeDirectRobotConnection(null), endpointLabel: label }}
    operationCallbacks={control.operationCallbacks} operationReadiness={control.operationReadiness}
    manualControlBlockedReason={control.touchBlockedReason ?? undefined}
  />;
}
