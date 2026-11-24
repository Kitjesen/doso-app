import { setStatusBarStyle, StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, Modal, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { images } from './src/assets';
import { AppToast, ToastNotice } from './src/components/AppToast';
import { RobotMainNav, ROBOT_MAIN_NAV_LANDSCAPE_SPACE, type RobotMainTab } from './src/components/BottomNav';
import { useBrainstemControl } from './src/features/control/useBrainstemControl';
import { useBrainstemTelemetry } from './src/features/control/useBrainstemTelemetry';
import { useG20Input } from './src/features/control/useG20Input';
import { useRememberedBrainstemConnection } from './src/features/control/useRememberedBrainstemConnection';
import { createRobotDiagnosticsGateway } from './src/features/robot-lifecycle/robotDiagnosticsGateway';
import { useDirectRobotConnection } from './src/features/robot-lifecycle/useDirectRobotConnection';
import { wifiDiscoveryAdapter } from './src/features/robot-lifecycle/wifiDiscoveryAdapter';
import { useControlVideoReceiver } from './src/features/video/useControlVideoReceiver';
import { bindVideoOrigin, directVideoOrigin, videoTargetKey } from './src/features/video/videoBinding';
import { BleDiscoveryScreen } from './src/screens/BleDiscoveryScreen';
import { ControlScreen } from './src/screens/ControlScreen';
import { DataPrivacyScreen } from './src/screens/DataPrivacyScreen';
import { DeviceUnavailableScreen } from './src/screens/DeviceUnavailableScreen';
import { JointStatusScreen } from './src/screens/JointStatusScreen';
import { ProfileHub as ProfileScreen } from './src/screens/ProfileScreen';
import { RobotConnectionScreen } from './src/screens/RobotConnectionScreen';
import { VideoViewerScreen } from './src/screens/VideoViewerScreen';
import {
  isBrainstemGrpcAvailable,
  isBrainstemLanAvailable,
  readBrainstemGrpcMotorStatus,
  readBrainstemGrpcProfile,
  readBrainstemGrpcStatus,
  readBrainstemGrpcVoltage,
  validateBrainstemEndpoint,
  type BrainstemGrpcEndpoint,
} from './src/services/brainstemGrpc';
import { getBrainstemIntegrationReadiness } from './src/services/brainstemIntegrationReadiness';
import { createDirectRobotConnectionSnapshot, describeDirectRobotConnection } from './src/services/directRobotConnection';
import { validateLingtuOrigin } from './src/services/lingtuReadOnly';
import { AppearanceControlContext, ThemePreferenceContext, useAppTheme } from './src/theme';
import type { AppStage } from './src/types';

const WORKSPACE_OWNER_KEY = 'local-workspace';
const THUNDER_R44_TOP_STUDIO = require('./assets/scene/thunder-r44-top.png');
const FSD_CHARCOAL_BG = '#141414';

const FSM_LABELS = {
  zero: '初始化',
  grounded: '落地',
  standing: '站立',
  walking: '行走',
  transitioning: '姿态切换中',
} as const;

function lastSeenLabel(value?: string | null) {
  if (!value) return '尚未同步';
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '时间待确认';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小时前` : `${Math.floor(hours / 24)} 天前`;
}

export default function App() {
  const { colors: appColors, isDark } = useAppTheme();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const isLandscape = viewportWidth > viewportHeight;
  const [webStageMode, setWebStageMode] = useState<'g20-16-9' | 'fill'>('g20-16-9');
  const TARGET_STAGE_ASPECT = 16 / 9;
  const useWebTargetStage = Platform.OS === 'web' && webStageMode === 'g20-16-9' && viewportWidth >= 640 && viewportHeight >= 360;
  const webStageWidth = useWebTargetStage ? Math.min(viewportWidth, Math.round(viewportHeight * TARGET_STAGE_ASPECT)) : viewportWidth;
  const webStageHeight = useWebTargetStage ? Math.min(viewportHeight, Math.round(webStageWidth / TARGET_STAGE_ASPECT)) : viewportHeight;
  const webTargetStage = useWebTargetStage ? { width: webStageWidth, height: webStageHeight } : undefined;
  const webHasLetterbox = Boolean(useWebTargetStage && (Math.abs(viewportWidth - webStageWidth) > 8 || Math.abs(viewportHeight - webStageHeight) > 8));
  const effectiveIsLandscape = webTargetStage ? webTargetStage.width > webTargetStage.height : isLandscape;

  const [stage, setStage] = useState<AppStage>('control');
  const [openSettingsSignal, setOpenSettingsSignal] = useState(0);
  const [controlStatusCardOpen, setControlStatusCardOpen] = useState(false);
  const [robotConnectionVisible, setRobotConnectionVisible] = useState(false);
  const [dataPrivacyVisible, setDataPrivacyVisible] = useState(false);
  const [profileDeviceOpen, setProfileDeviceOpen] = useState(false);
  const [productTheme, setProductTheme] = useState<'light' | 'dark' | null>('dark');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [, setLowLatencyMode] = useState(true);
  const handleLowLatencyChange = useCallback((enabled: boolean) => {
    setLowLatencyMode(enabled);
  }, []);
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workspaceTab: RobotMainTab = stage === 'control' ? 'control' : stage === 'joint-status' ? 'status' : 'settings';
  const isRobotWorkspace = stage === 'control' || stage === 'joint-status' || stage === 'main';

  const prepareControlExit = useRef<(() => () => void) | null>(null);
  const dismissControlOverlay = useRef<(() => boolean) | null>(null);
  const controlExitPending = useRef(false);
  const controlExitRevision = useRef(0);
  const robotDiagnosticsGateway = useMemo(() => createRobotDiagnosticsGateway({ nowMs: () => Date.now() }), []);

  const notify = useCallback((title: string, message: string, tone: ToastNotice['tone'] = 'success', durationMs: number | null = 3200) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ title, message, tone });
    noticeTimer.current = durationMs === null ? null : setTimeout(() => setNotice(null), durationMs);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const openDataPrivacy = useCallback(() => {
    Keyboard.dismiss();
    setDataPrivacyVisible(true);
  }, []);
  const closeDataPrivacy = useCallback(() => {
    setDataPrivacyVisible(false);
  }, []);

  useEffect(() => {
    setStatusBarStyle(stage === 'main' ? (isDark ? 'light' : 'dark') : 'light', true);
    if (Platform.OS !== 'web') {
      void SystemUI.setBackgroundColorAsync(stage === 'main' && !isDark ? appColors.background : FSD_CHARCOAL_BG);
    }
  }, [appColors.background, isDark, stage]);

  const directConnection = useDirectRobotConnection(WORKSPACE_OWNER_KEY, true);
  const rememberedControl = useRememberedBrainstemConnection(WORKSPACE_OWNER_KEY, true);

  useEffect(() => {
    if (rememberedControl.error) Alert.alert('自动连接设置未保存', rememberedControl.error);
  }, [rememberedControl.error]);

  const [controlSelection, setControlSelection] = useState<{ ownerKey: string; endpoint: BrainstemGrpcEndpoint } | null>(null);
  const controlEndpoint = controlSelection?.ownerKey === WORKSPACE_OWNER_KEY ? controlSelection.endpoint : null;
  const setControlEndpoint = useCallback((endpoint: BrainstemGrpcEndpoint | null) => {
    setControlSelection(endpoint ? { ownerKey: WORKSPACE_OWNER_KEY, endpoint } : null);
  }, []);

  const brainstemControl = useBrainstemControl({
    ownerKey: WORKSPACE_OWNER_KEY,
    ready: robotConnectionVisible || isRobotWorkspace,
    autoConnectEndpoint: !robotConnectionVisible ? rememberedControl.connection?.endpoint : null,
    autoConnectPrincipal: rememberedControl.connection?.principal,
    autoReconnectEnabled: !robotConnectionVisible,
  });

  useEffect(() => {
    if (stage !== 'control') setControlStatusCardOpen(false);
    if (stage === 'joint-status' || robotConnectionVisible) setOpenSettingsSignal(0);
  }, [robotConnectionVisible, stage]);

  useEffect(() => {
    brainstemControl.setImuNotifyEnabled(stage === 'joint-status' || (stage === 'control' && controlStatusCardOpen));
  }, [brainstemControl.setImuNotifyEnabled, controlStatusCardOpen, stage]);

  useEffect(() => {
    if (rememberedControl.connection && !controlEndpoint && !robotConnectionVisible) {
      setControlEndpoint(rememberedControl.connection.endpoint);
    }
  }, [rememberedControl.connection, controlEndpoint, robotConnectionVisible, setControlEndpoint]);

  useEffect(() => {
    if (isRobotWorkspace) return;
    void brainstemControl.interrupt();
  }, [isRobotWorkspace, brainstemControl.interrupt]);

  const directTelemetry = useBrainstemTelemetry({
    ownerKey: WORKSPACE_OWNER_KEY,
    endpoint: controlEndpoint,
    active: !robotConnectionVisible && (stage === 'main' || stage === 'joint-status' || (stage === 'control' && brainstemControl.state.connected)),
  });

  const devLoopbackBootstrapped = useRef(false);
  useEffect(() => {
    if (
      Platform.OS !== 'web'
      || typeof __DEV__ === 'undefined'
      || !__DEV__
      || devLoopbackBootstrapped.current
      || !rememberedControl.loaded
      || rememberedControl.connection
      || controlEndpoint
      || directConnection.snapshot
      || robotConnectionVisible
    ) {
      return;
    }
    const hostname = typeof window !== 'undefined' ? window.location?.hostname : undefined;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
    devLoopbackBootstrapped.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    let disposed = false;
    void (async () => {
      try {
        const res = await fetch('http://127.0.0.1:8121/api/v1/dev-lan/health', {
          method: 'GET',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted || disposed) return;
        const endpoint: BrainstemGrpcEndpoint = { host: '127.0.0.1', port: 13145, transport: 'lan-dev' };
        if (await brainstemControl.connect(endpoint, '') && !disposed) {
          setControlEndpoint(endpoint);
        }
      } catch {
        /* Local dev bridge is optional; remain disconnected when unavailable. */
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    rememberedControl.loaded,
    rememberedControl.connection,
    controlEndpoint,
    directConnection.snapshot,
    robotConnectionVisible,
    brainstemControl.connect,
    setControlEndpoint,
  ]);

  const directEndpoint = controlEndpoint ?? directConnection.snapshot?.endpoint ?? null;
  const statusPresentation = controlEndpoint ? directTelemetry.presentation : directConnection.presentation;
  const statusObservation = statusPresentation?.fresh
    ? (controlEndpoint ? directTelemetry.snapshot : directConnection.snapshot)?.observation
    : undefined;
  const statusRuntime = statusObservation ? statusPresentation?.runtimeState : undefined;
  const liveControlState = controlEndpoint && brainstemControl.runtimeState.controlLink === 'connected'
    ? brainstemControl.runtimeState
    : undefined;

  const currentVideoTarget = videoTargetKey(WORKSPACE_OWNER_KEY, directEndpoint);
  const videoTargetGeneration = useRef({ target: currentVideoTarget, generation: 0 });
  if (videoTargetGeneration.current.target !== currentVideoTarget) {
    videoTargetGeneration.current = { target: currentVideoTarget, generation: videoTargetGeneration.current.generation + 1 };
  }

  const [navigationBinding, setNavigationBinding] = useState<{
    ownerKey: string;
    endpoint: string;
    videoTarget: string | null;
    videoGeneration: number;
    viewerToken?: string;
  } | null>(null);

  const [videoViewing, setVideoViewing] = useState<{
    ownerKey: string;
    origin: string;
    viewerToken?: string;
    depthHost?: string;
  } | null>(null);

  const connectionVideoDraft = useRef<{ ownerKey: string; endpoint: BrainstemGrpcEndpoint } | null>(null);
  if (!robotConnectionVisible || connectionVideoDraft.current?.ownerKey !== WORKSPACE_OWNER_KEY) {
    connectionVideoDraft.current = null;
  }

  const videoRouteActive = robotConnectionVisible;
  useEffect(() => {
    if (videoViewing && (!videoRouteActive || videoViewing.ownerKey !== WORKSPACE_OWNER_KEY)) {
      setVideoViewing(null);
    }
  }, [videoRouteActive, videoViewing]);

  useEffect(() => {
    const origin = directVideoOrigin(directEndpoint);
    if (!origin || !currentVideoTarget) return;
    if (navigationBinding?.ownerKey === WORKSPACE_OWNER_KEY && navigationBinding.videoTarget === currentVideoTarget) return;
    setNavigationBinding({
      ownerKey: WORKSPACE_OWNER_KEY,
      endpoint: origin,
      videoTarget: currentVideoTarget,
      videoGeneration: videoTargetGeneration.current.generation,
    });
  }, [directEndpoint, currentVideoTarget, navigationBinding]);

  const navigationEndpoint = navigationBinding?.ownerKey === WORKSPACE_OWNER_KEY ? navigationBinding.endpoint : null;
  const lanVideoOrigin = directVideoOrigin(directEndpoint);
  const videoConfig = navigationEndpoint && currentVideoTarget && navigationBinding?.videoTarget === currentVideoTarget
    && navigationBinding.videoGeneration === videoTargetGeneration.current.generation
    ? { deviceId: currentVideoTarget, gatewayUrl: navigationBinding.endpoint, viewerToken: navigationBinding.viewerToken, allowLocalHttp: isBrainstemLanAvailable() }
    : lanVideoOrigin && currentVideoTarget && isBrainstemLanAvailable()
      ? { deviceId: currentVideoTarget, gatewayUrl: lanVideoOrigin, viewerToken: undefined, allowLocalHttp: true }
      : null;

  const controlVideo = useControlVideoReceiver(videoConfig, stage === 'control' && !robotConnectionVisible);
  const [rearCameraActive, setRearCameraActive] = useState(false);
  const hasDedicatedRearStream = Boolean(controlVideo.streams?.some(name => name === 'rear' || name === 'cam_rear'));
  const rearVideoConfig = videoConfig && videoConfig.allowLocalHttp === true && !videoConfig.viewerToken
    ? { ...videoConfig, deviceId: `${videoConfig.deviceId}:rear`, cameraId: 'rear' as const }
    : null;
  const controlRearVideo = useControlVideoReceiver(
    rearVideoConfig,
    stage === 'control' && !robotConnectionVisible && rearCameraActive && hasDedicatedRearStream,
  );
  const shareSingleCameraPip = Boolean(videoConfig && rearCameraActive && !hasDedicatedRearStream);
  const g20Controller = useG20Input(stage === 'control' && !robotConnectionVisible);

  useEffect(() => {
    if (Platform.OS !== 'android' || !controlEndpoint || brainstemControl.state.connected || robotConnectionVisible) {
      return undefined;
    }
    let cancelled = false;
    let lastSsid: string | null | undefined;
    const checkSsid = async () => {
      if (cancelled || AppState.currentState !== 'active') return;
      const ssid = await wifiDiscoveryAdapter.currentSsid().catch(() => null);
      if (cancelled) return;
      if (lastSsid === undefined) {
        lastSsid = ssid;
        return;
      }
      if (ssid && ssid !== lastSsid) {
        lastSsid = ssid;
        brainstemControl.retryNow();
        controlVideo.reconnect();
      } else {
        lastSsid = ssid;
      }
    };
    void checkSsid();
    const timer = setInterval(() => { void checkSsid(); }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [controlEndpoint, brainstemControl.state.connected, brainstemControl.retryNow, controlVideo.reconnect, robotConnectionVisible]);

  const directEndpointLabel = directEndpoint
    ? `${directEndpoint.host.includes(':') ? `[${directEndpoint.host}]` : directEndpoint.host}:${directEndpoint.port}`
    : '机器狗 Wi-Fi';

  const diagnosticNavigation = useRef({
    ownerKey: WORKSPACE_OWNER_KEY,
    endpoint: directEndpoint,
    stage,
    robotConnectionVisible,
    callbacks: brainstemControl.operationCallbacks,
  });
  if (
    diagnosticNavigation.current.ownerKey !== WORKSPACE_OWNER_KEY
    || diagnosticNavigation.current.endpoint !== directEndpoint
    || diagnosticNavigation.current.stage !== stage
    || diagnosticNavigation.current.robotConnectionVisible !== robotConnectionVisible
    || diagnosticNavigation.current.callbacks !== brainstemControl.operationCallbacks
  ) {
    diagnosticNavigation.current = {
      ownerKey: WORKSPACE_OWNER_KEY,
      endpoint: directEndpoint,
      stage,
      robotConnectionVisible,
      callbacks: brainstemControl.operationCallbacks,
    };
  }
  const diagnosticNavigationOwner = diagnosticNavigation.current;

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') controlExitRevision.current++;
    });
    return () => listener.remove();
  }, []);

  const openRobotPage = useCallback(async (tab: RobotMainTab | null) => {
    if (tab !== 'settings' && tab === workspaceTab) return;
    const destination = tab === null ? null : tab === 'status' ? 'joint-status' : 'control';
    if (stage === 'control') {
      if (controlExitPending.current || diagnosticNavigation.current !== diagnosticNavigationOwner || AppState.currentState !== 'active') return;
      controlExitPending.current = true;
      const revision = controlExitRevision.current;
      const resume = prepareControlExit.current?.();
      try {
        if (brainstemControl.state.connected || brainstemControl.state.failureCode === 'stop_unconfirmed') {
          await brainstemControl.operationCallbacks.stop();
        }
        if (diagnosticNavigation.current !== diagnosticNavigationOwner || revision !== controlExitRevision.current || AppState.currentState !== 'active') {
          resume?.();
          return;
        }
        if (!destination) {
          BackHandler.exitApp();
          resume?.();
          return;
        }
        diagnosticNavigation.current = { ...diagnosticNavigationOwner };
        if (destination === 'control') resume?.();
      } catch {
        resume?.();
        return;
      } finally {
        controlExitPending.current = false;
      }
    }
    if (!destination) return;
    setProfileDeviceOpen(false);
    setStage(destination);
    if (tab === 'settings') setOpenSettingsSignal(n => n + 1);
  }, [workspaceTab, stage, diagnosticNavigationOwner, brainstemControl.state.connected, brainstemControl.state.failureCode, brainstemControl.operationCallbacks.stop]);

  const returnToDeviceSettings = useCallback(() => {
    setProfileDeviceOpen(true);
    setStage('control');
    setOpenSettingsSignal(n => n + 1);
  }, []);

  const handleDisconnectRobot = useCallback(async () => {
    try {
      if (brainstemControl.state.connected || brainstemControl.state.failureCode === 'stop_unconfirmed') {
        await brainstemControl.operationCallbacks.stop();
      }
      await brainstemControl.disconnect();
      rememberedControl.forget();
      directConnection.clear();
      setControlEndpoint(null);
      setNavigationBinding(null);
      notify('已断开连接', '连接与自动重连记录已清除', 'info');
    } catch {
      notify('停止未确认', '请确认设备安全后再断开', 'error');
    }
  }, [brainstemControl, directConnection, notify, rememberedControl, setControlEndpoint]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (videoViewing) { setVideoViewing(null); return true; }
      if (robotConnectionVisible) { setRobotConnectionVisible(false); return true; }
      if (stage === 'control') {
        if (!dismissControlOverlay.current?.()) void openRobotPage(null);
        return true;
      }
      if (stage === 'joint-status' || stage === 'main') {
        void openRobotPage('control');
        return true;
      }
      if (stage === 'ble-discovery' || stage === 'provisioning' || stage === 'firmware-update') {
        returnToDeviceSettings();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [openRobotPage, returnToDeviceSettings, robotConnectionVisible, stage, videoViewing]);

  const brainstemIntegration = getBrainstemIntegrationReadiness({
    nativeModuleAvailable: isBrainstemGrpcAvailable(),
    endpointConfigured: Boolean(controlEndpoint || directConnection.snapshot),
    readOnlyObservationFresh: brainstemControl.state.connected || directConnection.presentation?.fresh === true,
    deviceIdentity: 'unbound',
    clientIdentitySelected: brainstemControl.state.clientIdentitySelected,
    remoteListenerConfirmed: brainstemControl.state.connected,
    remoteMtlsVerified: brainstemControl.state.mutualTlsVerified,
    controlLeaseActive: brainstemControl.state.leaseActive,
    productionExecutorConnected: Boolean(brainstemControl.state.connected),
    ackContractReady: brainstemControl.state.sequence > 0,
    deadmanStopReady: Boolean(brainstemControl.state.connected),
    pairedClientAuthorized: brainstemControl.state.principalVerified,
    transport: controlEndpoint?.transport,
    lanDevConnectionConfirmed: brainstemControl.state.connected && brainstemControl.state.transport === 'grpc-lan',
  });

  const canViewReadOnlyVideo = robotConnectionVisible && !videoViewing;
  const navigationSelection = useRef({ ownerKey: WORKSPACE_OWNER_KEY, viewReady: false });
  navigationSelection.current = { ownerKey: WORKSPACE_OWNER_KEY, viewReady: canViewReadOnlyVideo };
  const navigationVideoGeneration = videoTargetGeneration.current.generation;

  const workspaceConnected = brainstemControl.state.connected || Boolean(statusObservation);
  const workspaceDeviceName = directEndpoint ? directEndpointLabel : '机器狗 Wi-Fi';
  const workspaceDeviceType = brainstemControl.state.connected
    ? '已连接'
    : statusObservation
      ? '只读连接'
      : '未连接';
  const workspaceRobotVersion = brainstemControl.state.profile?.current
    || statusObservation?.profile?.current
    || '待同步';
  const workspaceLastSync = statusObservation?.observedAt ? lastSeenLabel(statusObservation.observedAt) : '尚未同步';

  if (videoViewing && videoRouteActive && videoViewing.ownerKey === WORKSPACE_OWNER_KEY) {
    return (
      <SafeAreaProvider>
        <VideoViewerScreen
          origin={videoViewing.origin}
          viewerToken={videoViewing.viewerToken}
          depthHost={videoViewing.depthHost}
          allowLocalHttp={isBrainstemLanAvailable()}
          onBack={() => setVideoViewing(null)}
        />
      </SafeAreaProvider>
    );
  }

  if (robotConnectionVisible) {
    return (
      <SafeAreaProvider>
        <RobotConnectionScreen
          initialEndpoint={connectionVideoDraft.current?.endpoint ?? controlEndpoint ?? directConnection.snapshot?.endpoint}
          onBack={() => setRobotConnectionVisible(false)}
          navigationUseLabel="用于控制台视频"
          allowViewerToken={Boolean(canViewReadOnlyVideo || controlEndpoint)}
          onViewVideo={canViewReadOnlyVideo ? (endpoint, viewerToken, candidateEndpoint) => {
            if (!navigationSelection.current.viewReady || AppState.currentState !== 'active') return false;
            let origin: string;
            try { origin = validateLingtuOrigin(endpoint, isBrainstemLanAvailable()); } catch { return false; }
            if (viewerToken && !origin.startsWith('https://')) return false;
            if (candidateEndpoint) {
              if (viewerToken || !isBrainstemLanAvailable() || directVideoOrigin(candidateEndpoint) !== origin) return false;
              connectionVideoDraft.current = { ownerKey: WORKSPACE_OWNER_KEY, endpoint: candidateEndpoint };
            }
            navigationSelection.current.viewReady = false;
            setVideoViewing({ ownerKey: WORKSPACE_OWNER_KEY, origin, viewerToken, depthHost: candidateEndpoint?.host });
            return true;
          } : undefined}
          onUseNavigation={controlEndpoint ? (endpoint, viewerToken) => {
            if (videoTargetGeneration.current.generation !== navigationVideoGeneration || AppState.currentState !== 'active') return false;
            let origin: string;
            try { origin = validateLingtuOrigin(endpoint, isBrainstemLanAvailable()); } catch { return false; }
            if (viewerToken && !origin.startsWith('https://')) return false;
            const videoTarget = bindVideoOrigin(WORKSPACE_OWNER_KEY, controlEndpoint, origin);
            if (!videoTarget) return false;
            setNavigationBinding({
              ownerKey: WORKSPACE_OWNER_KEY,
              endpoint: origin,
              videoTarget,
              videoGeneration: videoTargetGeneration.current.generation,
              viewerToken,
            });
            setStage('control');
            setRobotConnectionVisible(false);
            return true;
          } : undefined}
          onUseConnection={snapshot => {
            if (!directConnection.select(snapshot)) return false;
            setControlEndpoint(snapshot.endpoint);
            setStage('control');
            setRobotConnectionVisible(false);
            return true;
          }}
          onOpenControl={async (endpoint, principal, signal) => {
            if (signal.aborted) return false;
            let committed = false;
            const cancelConnection = () => { if (!committed) void brainstemControl.disconnect(); };
            signal.addEventListener('abort', cancelConnection, { once: true });
            try {
              if (!(await brainstemControl.connect(endpoint, principal)) || signal.aborted) return false;
              committed = true;
              rememberedControl.remember(endpoint, principal);
              setControlEndpoint(endpoint);
              setStage('control');
              setRobotConnectionVisible(false);
              return true;
            } finally {
              signal.removeEventListener('abort', cancelConnection);
            }
          }}
          onOpenBleDiscovery={() => {
            setRobotConnectionVisible(false);
            setStage('ble-discovery');
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <ThemePreferenceContext.Provider value={stage === 'main' ? productTheme : 'dark'}>
      <SafeAreaProvider>
        <StatusBar style={stage === 'main' ? (isDark ? 'light' : 'dark') : 'light'} />

        {stage === 'ble-discovery' ? (
          <BleDiscoveryScreen
            deviceName={workspaceDeviceName}
            onBack={returnToDeviceSettings}
          />
        ) : null}

        {stage === 'provisioning' ? (
          <DeviceUnavailableScreen
            capability="provisioning"
            deviceName={workspaceDeviceName}
            onBack={returnToDeviceSettings}
          />
        ) : null}

        {stage === 'firmware-update' ? (
          <DeviceUnavailableScreen
            capability="firmware"
            deviceName={workspaceDeviceName}
            onBack={returnToDeviceSettings}
          />
        ) : null}

        {isRobotWorkspace ? (
          <AppearanceControlContext.Provider value={{ preference: productTheme, onChange: setProductTheme }}>
            <View style={[styles.screen, { backgroundColor: FSD_CHARCOAL_BG }, useWebTargetStage && styles.webConsoleBackdrop]}>
              <View
                style={[
                  useWebTargetStage ? { width: webStageWidth, height: webStageHeight } : styles.screen,
                  useWebTargetStage && webHasLetterbox ? styles.webConsoleStageFramed : styles.webConsoleStageFlush,
                ]}
              >
                <View style={[styles.screen, effectiveIsLandscape && stage !== 'control' && styles.safeAreaLandscape]}>
                  {stage === 'joint-status' ? (
                    <JointStatusScreen
                      isWorkspace
                      connectionLabel={liveControlState ? '已连接' : statusObservation ? '只读连接' : '未连接'}
                      deviceName={workspaceDeviceName}
                      robotDiagram={images.thunderJointDiagram}
                      studioDiagram={THUNDER_R44_TOP_STUDIO}
                      joints={statusRuntime?.joints}
                      observedAt={statusObservation?.observedAt}
                      refreshing={directTelemetry.refreshing}
                      error={directTelemetry.error}
                      onRefresh={controlEndpoint ? () => { void directTelemetry.refresh(); } : undefined}
                      showImu
                      imu={liveControlState?.imu ?? null}
                      body={{
                        posture: liveControlState?.posture ?? statusRuntime?.posture,
                        motorState: liveControlState?.motorState ?? statusRuntime?.motorState,
                        controlAuthority: liveControlState?.controlAuthority ?? statusRuntime?.controlAuthority,
                        faultStatus: liveControlState?.faultStatus ?? (statusObservation?.status ? (statusObservation.status.criticalMotorFault ? 'active' : 'clear') : undefined),
                        controlOwner: liveControlState ? brainstemControl.state.status?.owner : statusObservation?.status?.owner,
                        voltageV: statusRuntime?.battery?.voltageV ?? null,
                        leaseActive: liveControlState ? brainstemControl.state.leaseActive : statusObservation?.status?.grpcLeaseActive ?? null,
                      }}
                      onBack={() => { setStage('control'); }}
                    />
                  ) : null}

                {stage === 'control' ? (
                  <ControlScreen
                    landscapeDocksExpanded={false}
                    defaultDualCameraEnabled={false}
                    onRearCameraActiveChange={setRearCameraActive}
                    showPlanning={false}
                    prepareWorkspaceLeaveRef={prepareControlExit}
                    dismissWorkspaceOverlayRef={dismissControlOverlay}
                    g20Controller={g20Controller}
                    video={videoConfig ? controlVideo.presentation : undefined}
                    videoSurface={videoConfig ? controlVideo.surface : undefined}
                    videoStream={videoConfig ? controlVideo.stream : undefined}
                    videoRotation={videoConfig ? controlVideo.rotation : undefined}
                    rearVideo={shareSingleCameraPip
                      ? { ...controlVideo.presentation, id: `${controlVideo.presentation.id}:pip` }
                      : rearVideoConfig && hasDedicatedRearStream ? controlRearVideo.presentation : undefined}
                    rearVideoSurface={shareSingleCameraPip
                      ? controlVideo.pipSurface ?? undefined
                      : rearVideoConfig && hasDedicatedRearStream ? controlRearVideo.surface : undefined}
                    rearVideoStream={shareSingleCameraPip
                      ? controlVideo.stream
                      : rearVideoConfig && hasDedicatedRearStream ? controlRearVideo.stream : undefined}
                    rearVideoRotation={shareSingleCameraPip
                      ? controlVideo.rotation
                      : rearVideoConfig && hasDedicatedRearStream ? controlRearVideo.rotation : undefined}
                    operationTargetKey={JSON.stringify([WORKSPACE_OWNER_KEY, directEndpoint?.host, directEndpoint?.port, directEndpoint?.transport, controlEndpoint?.clientIdentityAlias])}
                    allowInteractionPreview={false}
                    batteryPercent={null}
                    recovery={{
                      status: brainstemControl.recoveryStatus,
                      profile: brainstemControl.state.profile,
                      onCommand: brainstemControl.recoveryCommand,
                    }}
                    canUseManualControl={brainstemControl.canBeginManualControl}
                    productionInput={controlEndpoint ? {
                      ready: brainstemControl.canBeginManualControl,
                      touchReady: brainstemControl.canBeginTouchControl,
                      onTouchBegin: brainstemControl.prepareManualControl,
                      onTouchEnd: brainstemControl.endTouchGesture,
                      onDrive: brainstemControl.drive,
                      onTurn: brainstemControl.turn,
                      onSticks: brainstemControl.sticks,
                      onInterrupt: brainstemControl.interrupt,
                    } : undefined}
                    controlSession={controlEndpoint ? {
                      label: brainstemControl.state.status
                        ? `电机${brainstemControl.state.status.motorOutputEnabled ? '已使能' : '未使能'} · ${FSM_LABELS[brainstemControl.state.status.fsmKind]}`
                        : brainstemControl.state.connected
                          ? '状态待更新'
                          : '未连接',
                      canAcquire: brainstemControl.canAcquire,
                      leaseActive: brainstemControl.state.leaseActive || brainstemControl.manualPrepared,
                      busy: brainstemControl.state.phase === 'operating' || brainstemControl.state.phase === 'connecting',
                      onAcquire: brainstemControl.prepareManualControl,
                      onRelease: () => { void brainstemControl.interrupt(); },
                      error: brainstemControl.state.error,
                    } : undefined}
                    canUseRouteMode={false}
                    canUseTaskMode={false}
                    brainstemIntegration={brainstemIntegration}
                    connected={brainstemControl.state.connected}
                    safetyLock={null}
                    diagnosticsDeviceClass="physical"
                    diagnosticsGateway={robotDiagnosticsGateway}
                    onBack={() => openRobotPage('status')}
                    onOpenConnection={() => { void brainstemControl.suspend(); setRobotConnectionVisible(true); }}
                    onOpenJointStatus={() => openRobotPage('status')}
                    onStatusCardOpenChange={setControlStatusCardOpen}
                    openSettingsSignal={openSettingsSignal}
                    onOpenWorkspaceSettings={() => openRobotPage('settings')}
                    canRecall={false}
                    recallBlockedReason="暂不支持召回"
                    directConnection={controlEndpoint
                      ? directTelemetry.presentation ?? { ...describeDirectRobotConnection(null), endpointLabel: directEndpointLabel }
                      : directConnection.presentation ?? describeDirectRobotConnection(null)}
                    runtimeState={controlEndpoint
                      ? (brainstemControl.state.connected
                        ? { ...brainstemControl.runtimeState, battery: directTelemetry.presentation?.runtimeState.battery, joints: directTelemetry.presentation?.runtimeState.joints, robotLinkLatencyMs: brainstemControl.latencyMs ?? directTelemetry.presentation?.runtimeState.robotLinkLatencyMs }
                        : describeDirectRobotConnection(null).runtimeState)
                      : (directConnection.presentation?.runtimeState ?? describeDirectRobotConnection(null).runtimeState)}
                    speedMode={brainstemControl.speedMode}
                    onChangeSpeedMode={brainstemControl.setSpeedMode}
                    bodyHeight={brainstemControl.bodyHeight}
                    onSetBodyHeightMode={brainstemControl.onSetBodyHeightMode}
                    onSetBodyHeight={brainstemControl.onSetBodyHeight}
                    onRefreshBodyHeight={brainstemControl.onRefreshBodyHeight}
                    hasDedicatedRearCamera={hasDedicatedRearStream}
                    onReconnect={!brainstemControl.state.connected && controlEndpoint && brainstemControl.state.failureCode !== 'stop_unconfirmed'
                      ? () => {
                        brainstemControl.retryNow();
                        controlVideo.reconnect();
                      }
                      : undefined}
                    workspaceSettings={{
                      themePreference: productTheme,
                      onChangeTheme: setProductTheme,
                      alertsEnabled,
                      onToggleAlerts: () => setAlertsEnabled(current => !current),
                      onLowLatencyChange: handleLowLatencyChange,
                      connection: {
                        host: directEndpoint?.host ?? (Platform.OS === 'web' && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location?.hostname ?? '') ? '127.0.0.1' : '192.168.66.64'),
                        port: directEndpoint?.port ?? 13145,
                        connected: brainstemControl.state.connected,
                        readonlyConnected: Boolean(statusObservation),
                        lastSyncLabel: workspaceLastSync,
                        firmwareVersion: workspaceRobotVersion,
                        onConnectControl: async (nextHost, nextPort) => {
                          const ep = validateBrainstemEndpoint(nextHost, String(nextPort), isBrainstemLanAvailable() ? 'lan-dev' : 'tls');
                          const endpoint: BrainstemGrpcEndpoint = isBrainstemLanAvailable() ? { ...ep, transport: 'lan-dev' } : ep;
                          const ok = await brainstemControl.connect(endpoint, '');
                          if (ok) {
                            rememberedControl.remember(endpoint, '');
                            setControlEndpoint(endpoint);
                          }
                          return ok;
                        },
                        onProbeReadOnly: async (nextHost, nextPort) => {
                          const ep = validateBrainstemEndpoint(nextHost, String(nextPort), isBrainstemLanAvailable() ? 'lan-dev' : 'tls');
                          const endpoint: BrainstemGrpcEndpoint = isBrainstemLanAvailable() ? { ...ep, transport: 'lan-dev' } : ep;
                          const stamp = Date.now().toString(36);
                          const statusObs = await readBrainstemGrpcStatus({ endpoint, requestId: `probe_s_${stamp}` });
                          const [profileRes, voltageRes, motorsRes] = await Promise.allSettled([
                            readBrainstemGrpcProfile({ endpoint, requestId: `probe_p_${stamp}` }),
                            readBrainstemGrpcVoltage({ endpoint, requestId: `probe_v_${stamp}` }),
                            readBrainstemGrpcMotorStatus({ endpoint, requestId: `probe_m_${stamp}` }),
                          ]);
                          const snapshot = createDirectRobotConnectionSnapshot(endpoint, {
                            ...statusObs,
                            ...(profileRes.status === 'fulfilled' ? { profile: profileRes.value.profile } : {}),
                            ...(voltageRes.status === 'fulfilled' ? { voltage: voltageRes.value.voltage } : {}),
                            ...(motorsRes.status === 'fulfilled' ? { motors: motorsRes.value.motors } : {}),
                          });
                          if (!directConnection.select(snapshot)) return false;
                          setControlEndpoint(snapshot.endpoint);
                          return true;
                        },
                        onDisconnect: handleDisconnectRobot,
                        onOpenAdvanced: () => { void brainstemControl.suspend(); setRobotConnectionVisible(true); },
                        onOpenBle: () => setStage('ble-discovery'),
                      },
                    }}
                    operationCallbacks={brainstemControl.operationCallbacks}
                    onListGestures={brainstemControl.listGestures}
                    operationReadiness={brainstemControl.operationReadiness}
                    manualControlBlockedReason={brainstemControl.touchBlockedReason ?? undefined}
                    onNotifications={() => notify('状态提醒', '设备异常将在界面实时提示', 'info')}
                    robotImage={images.thunderHero}
                    robotName={workspaceDeviceName}
                    robotType={brainstemControl.state.connected ? '已连接' : statusObservation ? '只读连接' : '未连接'}
                    videoProbeHost={lanVideoOrigin && isBrainstemLanAvailable() ? directEndpoint?.host ?? null : null}
                    voiceEndpoint={navigationBinding?.endpoint ?? null}
                    voiceViewerToken={navigationBinding?.viewerToken}
                    allowLocalVoiceHttp={isBrainstemLanAvailable()}
                    stageDimensions={webTargetStage}
                    webStageMode={Platform.OS === 'web' ? webStageMode : undefined}
                    onToggleWebStageMode={Platform.OS === 'web' ? () => setWebStageMode(current => current === 'g20-16-9' ? 'fill' : 'g20-16-9') : undefined}
                  />
                ) : null}

                  {stage === 'main' ? (
                    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: isDark ? FSD_CHARCOAL_BG : appColors.background }]}>
                      <AppToast notice={notice} onDismiss={() => setNotice(null)} withinSafeArea />
                      <View style={styles.screen}>
                        <ProfileScreen
                          initialDeviceOpen={profileDeviceOpen}
                          onOpenControl={() => openRobotPage('control')}
                          onOpenRobotConnection={() => setRobotConnectionVisible(true)}
                          onOpenDataPrivacy={openDataPrivacy}
                          alertsEnabled={alertsEnabled}
                          batteryPercent={null}
                          connected={workspaceConnected}
                          canDisconnect={Boolean(controlEndpoint || directEndpoint || workspaceConnected)}
                          deviceName={workspaceDeviceName}
                          deviceType={workspaceDeviceType}
                          firmwareVersion={workspaceRobotVersion}
                          lastSyncLabel={workspaceLastSync}
                          canOpenFirmwareUpdate={false}
                          canOpenProvisioning={false}
                          onConnect={() => setRobotConnectionVisible(true)}
                          onDisconnect={() => { void handleDisconnectRobot(); }}
                          onOpenBleDiscovery={() => setStage('ble-discovery')}
                          onOpenFirmwareUpdate={() => setStage('firmware-update')}
                          onOpenProvisioning={() => setStage('provisioning')}
                          onRetry={() => notify('状态同步', '连接设备后自动同步实时状态', 'info')}
                          onToggleAlerts={() => setAlertsEnabled(current => !current)}
                          runtimeHours={null}
                          safetyLock={null}
                          deviceId={directEndpoint ? directEndpointLabel : '未连接'}
                          robotVersion={workspaceRobotVersion}
                        />
                      </View>
                    </SafeAreaView>
                  ) : null}
                </View>
                {!(stage === 'control' && effectiveIsLandscape) ? <RobotMainNav active={workspaceTab} onChange={openRobotPage} /> : null}
              </View>
            </View>
          </AppearanceControlContext.Provider>
        ) : null}

        <Modal
          animationType="slide"
          onRequestClose={closeDataPrivacy}
          presentationStyle="fullScreen"
          supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
          visible={dataPrivacyVisible}
        >
          <DataPrivacyScreen onBack={closeDataPrivacy} />
        </Modal>

        {stage !== 'main' ? <AppToast notice={notice} onDismiss={() => setNotice(null)} /> : null}
      </SafeAreaProvider>
    </ThemePreferenceContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  safeAreaLandscape: { paddingRight: ROBOT_MAIN_NAV_LANDSCAPE_SPACE },
  screen: { flex: 1 },
  webConsoleBackdrop: { alignItems: 'center', justifyContent: 'center' },
  webConsoleStageFlush: { overflow: 'hidden', position: 'relative' },
  webConsoleStageFramed: { backgroundColor: FSD_CHARCOAL_BG, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 20, borderWidth: 1, overflow: 'hidden', position: 'relative' },
});
