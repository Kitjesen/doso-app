import type { BrainstemGrpcProfile } from '../services/brainstemGrpc';
import { useControlRobotVideo } from '../features/control/useControlRobotVideo';
import { type ControlMediaCaptureAdapter } from '../features/video/controlMediaModel';
import { useControlMediaCapture } from '../features/video/useControlMediaCapture';
import { beginRobotRecovery, presentRobotRecovery, type RobotRecoveryCommand, type RobotRecoveryOperatorAction, type RobotRecoveryStatus } from '../features/control/robotRecovery';
import { controlLandscapeHud } from '../components/controlLandscapeHud';
import { GestureDeckPanel } from '../components/ControlHudPanels';
import { clampSpeedLimitPercent, DEFAULT_THUNDER_GESTURES, projectHudGestures, scaleControlVector, type HudCameraPosition, type HudForwardDirection, type HudGestureCategoryId, type HudGestureInput, type HudHeadlightMode, type HudJointModuleKind, type HudLeftCategory, type HudLegId } from '../components/controlHudModel';
import { RobotRecoveryControls } from '../components/RobotRecoveryControls';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DosoWordmark, PostureGlyph, renderControlSettings, controlHudColors, controlSettingsColors, type ControlSettingsCategory, type ControlSettingsSnapshot } from '../components/ControlReferenceUi';
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type ImageSourcePropType, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ControlJoystickPair, type JoystickVector } from '../components/ControlJoystick';
import { ControlVideoSurface, type ControlVideoPresentation } from '../components/ControlVideoSurface';
import { DepthSnapshotView } from '../components/DepthSnapshotView';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { ControlGlassTarget, useControlGlass } from '../components/ControlGlass';
import { ControlSetupPage, controlSetupAppearance } from '../components/ControlSetupSurface';
import { JoystickLayoutSettings } from '../components/JoystickLayoutSettings';
import { createDefaultJoystickLayoutPreferences, loadJoystickLayoutPreferences, resetJoystickLayout, resolveJoystickLayout, saveJoystickLayoutPreferences, updateJoystickPlacement, type JoystickPlacement, type JoystickSide } from '../features/control/joystickLayoutPreferences';
import { G20InputPanel } from '../components/G20InputPanel';
import { G20IntentGate } from '../features/control/g20InputModel';
import type { G20InputController } from '../features/control/useG20Input';
import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import type { RobotDiagnosticsDeviceClass, RobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { controlTerrainMotionBlock, controlTerrainSwitchBlock, CONTROL_TERRAIN_MODE_OPTIONS, controlOperationLabels, controlOperationStatusLabels, getControlOperationReadiness, getControlPolicyOptions, getControlTerrainModeOptions, transitionControlOperationState, type ControlActionReadiness, type ControlInputSource, type ControlOperation, type ControlOperationCallbacks, type ControlOperationState, type ControlRuntimeState, type ControlTerrainModeId } from '../features/control/controlOperations';
import { getBrainstemIntegrationReadiness, type BrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { setControlNavigationHidden } from '../services/brainstemGrpc';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import { getControlLayoutMetrics } from './controlLayout';
import { getControlTerrainPolicies } from '../features/control/controlOperations';

export type DevelopmentControlInput = Readonly<{
  ready: boolean;
  touchReady?: boolean;
  onTouchBegin?: () => void;
  onTouchEnd?: () => void;
  onDrive: (value: JoystickVector) => void;
  onTurn: (value: JoystickVector) => void;
  onSticks?: (drive: JoystickVector, turn: JoystickVector, sampledAtMonotonicMs?: number) => void;
  onInterrupt: () => void;
}>;

// Capability and connection props describe state; they never grant joystick authority.
type Props = {
  allowInteractionPreview?: boolean;
  showPlanning?: boolean;
  prepareWorkspaceLeaveRef?: RefObject<(() => () => void) | null>;
  dismissWorkspaceOverlayRef?: RefObject<(() => boolean) | null>;
  developmentInput?: DevelopmentControlInput;
  productionInput?: DevelopmentControlInput;
  controlSession?: Readonly<{
    label: string;
    canAcquire: boolean;
    leaseActive: boolean;
    busy: boolean;
    onAcquire: () => void;
    onRelease: () => void;
    error?: string | null;
  }>;
  batteryPercent?: number | null;
  manualControlBlockedReason?: string;
  canUseManualControl: boolean;
  canUseRouteMode: boolean;
  canUseTaskMode: boolean;
  brainstemIntegration?: BrainstemIntegrationReadiness;
  inputSource?: ControlInputSource;
  physicalInputAvailable?: boolean;
  g20Controller?: G20InputController;
  connected: boolean;
  directConnection?: Readonly<{ endpointLabel: string; fresh: boolean; summary: string }>;
  diagnosticsDeviceClass: RobotDiagnosticsDeviceClass;
  diagnosticsGateway: RobotDiagnosticsGateway;
  onBack: () => void;
  onOpenConnectionDiagnostics?: () => void;
  onOpenConnection?: () => void;
  onOpenMap?: () => void;
  onOpenTasks?: () => void;
  onOpenRoutes?: () => void;
  onOpenJointStatus?: () => void;
  onOpenWorkspaceSettings?: () => void;
  mapContent?: ReactNode;
  video?: ControlVideoPresentation;
  videoSurface?: ReactNode;
  videoStream?: unknown;
  videoRotation?: number;
  rearVideo?: ControlVideoPresentation;
  rearVideoSurface?: ReactNode;
  rearVideoStream?: unknown;
  rearVideoRotation?: number;
  mediaCaptureAdapter?: ControlMediaCaptureAdapter;
  onRearCameraActiveChange?: (active: boolean) => void;
  defaultDualCameraEnabled?: boolean;
  /** Private LAN host already used for Brainstem. The probe port is derived from it. */
  videoProbeHost?: string | null;
  /** Connected landscape docks start expanded unless this is explicitly false. */
  landscapeDocksExpanded?: boolean;
  /** Optional G20 / web-preview system-bar insets. Combined with useSafeAreaInsets. */
  previewSafeInsets?: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  previewSafeAreaGuides?: boolean;
  recovery?: Readonly<{
    status: RobotRecoveryStatus | null;
    profile?: BrainstemGrpcProfile | null;
    onCommand: (command: RobotRecoveryCommand) => Promise<RobotRecoveryStatus>;
  }> | null;
  /** Cloud safety lock. False shows 设备已解锁. Null or true does not claim the device is unlocked. */
  safetyLock?: boolean | null;
  settingsSnapshot?: ControlSettingsSnapshot;
  canRecall?: boolean;
  recallBlockedReason?: string;
  onRecall?: () => void | Promise<void>;
  runtimeState?: ControlRuntimeState;
  operationReadiness?: Partial<Record<ControlOperation, ControlActionReadiness>>;
  operationCallbacks?: ControlOperationCallbacks;
  onListGestures?: () => Promise<readonly Readonly<{ name: string; description: string; durationMs: number }>[]>;
  operationStates?: Partial<Record<ControlOperation, ControlOperationState>>;
  operationTargetKey?: string;
  onInputSourceChange?: (source: ControlInputSource) => void;
  onNotifications?: () => void;
  routeModeBlockedReason?: string;
  robotImage: ImageSourcePropType;
  robotName: string;
  robotType: string;
  taskModeBlockedReason?: string;
  stageDimensions?: Readonly<{ width: number; height: number }>;
  webStageMode?: 'g20-16-9' | 'fill';
  onToggleWebStageMode?: () => void;
  speedMode?: 'normal' | 'high' | 'unsupported' | null;
  onChangeSpeedMode?: (mode: 'normal' | 'high') => Promise<void>;
  onReconnect?: () => void;
  hasDedicatedRearCamera?: boolean;
};

// Offline preview callers keep a no-op. Only the explicitly selected development
// simulation entry injects local input; production never invokes those callbacks.
const ignoreLocalInput = (_value: JoystickVector) => {};
type OperationConfirmation = Readonly<{ action: ControlOperation; policyId?: string; generation: number }>;

type RecoveryProp = NonNullable<Props['recovery']> | null | undefined;

function useRecoveryOperator(recovery: RecoveryProp, runtimeState: ControlRuntimeState | undefined, blockedReason: string | null) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = presentRobotRecovery({ status: recovery?.status ?? null, profile: recovery?.profile, runtimeState });
  const beginEnabled = Boolean(recovery) && view.actions.begin.enabled && !blockedReason && !pending && !confirming;
  const displayReason = !recovery ? null
    : view.sessionActive ? view.reason
      : blockedReason && view.actions.begin.enabled ? blockedReason
        : view.reason;
  const requestBegin = () => {
    if (!beginEnabled) return;
    setError(null);
    setConfirming(true);
  };
  const dismiss = () => { if (!pending) setConfirming(false); };
  const confirm = () => {
    if (!recovery || pending || !view.actions.begin.enabled || blockedReason) return;
    setPending(true);
    setError(null);
    void beginRobotRecovery(command => recovery.onCommand(command)).then(() => {
      setConfirming(false);
    }).catch(caught => {
      setError(caught instanceof Error && caught.message ? caught.message : '未能进入倒地恢复');
      setConfirming(false);
    }).finally(() => { setPending(false); });
  };
  const followUp = (action: Extract<RobotRecoveryOperatorAction, 'cancel' | 'exit'>) => {
    // Stable stand uses RobotRecovery.Exit. Terrain changes stay on SwitchProfile.
    if (!recovery || pending || !view.actions[action].enabled) return;
    setPending(true);
    setError(null);
    setConfirming(false);
    void Promise.resolve(recovery.onCommand(action)).catch(caught => {
      setError(caught instanceof Error && caught.message ? caught.message : '未能确认摔倒恢复操作');
    }).finally(() => { setPending(false); });
  };
  return { view, confirming: Boolean(recovery) && confirming, pending, error, beginEnabled, displayReason, requestBegin, dismiss, confirm, followUp };
}

export function ControlScreen({
  allowInteractionPreview = false, showPlanning = true, prepareWorkspaceLeaveRef, dismissWorkspaceOverlayRef,
  developmentInput, productionInput, controlSession, onBack,
  batteryPercent, connected, directConnection, robotName, robotType, canUseManualControl,
  canUseRouteMode, canUseTaskMode, manualControlBlockedReason,
  routeModeBlockedReason, taskModeBlockedReason, mapContent, video, videoSurface, videoStream, videoRotation, rearVideo, rearVideoSurface, rearVideoStream, rearVideoRotation, mediaCaptureAdapter, onRearCameraActiveChange, defaultDualCameraEnabled = false, settingsSnapshot, safetyLock, videoProbeHost, landscapeDocksExpanded, previewSafeInsets, previewSafeAreaGuides, recovery,
  onOpenMap, onOpenTasks, onOpenRoutes, onOpenJointStatus, onOpenWorkspaceSettings, onOpenConnection, onOpenConnectionDiagnostics,
  canRecall, recallBlockedReason, onRecall,
  runtimeState, operationReadiness, operationCallbacks, onListGestures, operationStates, operationTargetKey, brainstemIntegration,
  inputSource, physicalInputAvailable = false, g20Controller, onInputSourceChange, onNotifications,
  stageDimensions, webStageMode, onToggleWebStageMode, speedMode = null, onChangeSpeedMode, onReconnect, hasDedicatedRearCamera,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const { height: windowHeight, width: windowWidth, fontScale } = useWindowDimensions();
  const height = stageDimensions?.height ?? windowHeight;
  const width = stageDimensions?.width ?? windowWidth;
  const systemInsets = useSafeAreaInsets();
  const [navigationBottomInset, setNavigationBottomInset] = useState(0);
  const isLandscape = width > height;
  const showLandscapeJoystickVisuals = !isLandscape || g20Controller?.state.available !== true;
  const glass = useControlGlass(isDark, isLandscape);
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const viewportRef = useRef(viewport);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [leaving, setLeaving] = useState(false);
  const useProbeFallback = video == null || video.phase === 'unconfigured' || video.phase === 'error';
  const robotVideo = useControlRobotVideo({
    host: videoProbeHost ?? null,
    enabled: appActive && !leaving && useProbeFallback,
  });
  const videoPresentation = useProbeFallback ? robotVideo.presentation ?? video : video;
  const videoFrame = useProbeFallback ? robotVideo.surface ?? videoSurface : videoSurface;
  const [docksExpanded, setDocksExpanded] = useState(landscapeDocksExpanded !== false);
  const [leftCategory, setLeftCategory] = useState<HudLeftCategory>('policy');
  const [speedLimitPercent, setSpeedLimitPercent] = useState(100);
  const speedLimitRef = useRef(100);
  speedLimitRef.current = speedLimitPercent;
  const [speedLimitExpanded, setSpeedLimitExpanded] = useState(false);
  const [confirmingHighSpeed, setConfirmingHighSpeed] = useState(false);
  const [speedModePending, setSpeedModePending] = useState(false);
  const [jointParamsOpen, setJointParamsOpen] = useState(false);
  const [selectedLegId, setSelectedLegId] = useState<HudLegId>('front-left');
  const [jointTempOpen, setJointTempOpen] = useState(false);
  const [tempModuleKind, setTempModuleKind] = useState<HudJointModuleKind>('motor');
  const [faultPanelOpen, setFaultPanelOpen] = useState(false);
  const [headlightMode, setHeadlightMode] = useState<HudHeadlightMode>('off');
  const [dualCameraEnabled, setDualCameraEnabled] = useState(defaultDualCameraEnabled === true);
  const [depthModeActive, setDepthModeActive] = useState(false);
  const [primaryCamera, setPrimaryCamera] = useState<HudCameraPosition>('front');
  const wantsRearCamera = dualCameraEnabled || primaryCamera === 'rear';
  useEffect(() => {
    onRearCameraActiveChange?.(wantsRearCamera);
  }, [onRearCameraActiveChange, wantsRearCamera]);
  const effectiveRearVideo = rearVideo;
  const effectiveRearSurface = rearVideoSurface;
  const effectiveFrontStream = useProbeFallback ? robotVideo.stream ?? videoStream : videoStream;
  const effectiveFrontRotation = useProbeFallback ? robotVideo.rotation ?? videoRotation : videoRotation;
  const effectiveRearStream = rearVideoStream;
  const effectiveRearRotation = rearVideoRotation;
  const [forwardDirection] = useState<HudForwardDirection>('front');
  const [selectedBasicAction, setSelectedBasicAction] = useState('walk');
  const [robotGestures, setRobotGestures] = useState<readonly HudGestureInput[]>([]);
  const [gestureListUnimplemented, setGestureListUnimplemented] = useState(false);
  const [gestureCategory, setGestureCategory] = useState<HudGestureCategoryId>('all');
  const [selectedGestureName, setSelectedGestureName] = useState<string | null>(null);
  const [gestureGifPreview, setGestureGifPreview] = useState(true);
  const hasGestureCatalogSupport = typeof onListGestures === 'function';
  const gestureLinkReady = runtimeState?.controlLink === 'connected' && hasGestureCatalogSupport;
  useEffect(() => {
    if (!gestureLinkReady || !onListGestures) {
      setRobotGestures([]);
      setGestureListUnimplemented(false);
      return;
    }
    let cancelled = false;
    onListGestures().then(list => {
      if (!cancelled) {
        setGestureListUnimplemented(false);
        setRobotGestures(list
          .filter(item => item?.name && item.name !== 'stand_up' && item.name !== 'wake_stand')
          .map(item => ({
            name: item.name,
            label: item.description || item.name,
            durationMs: item.durationMs,
          })));
      }
    }).catch(caught => {
      if (!cancelled) {
        setRobotGestures([]);
        const unimpl = Boolean(caught && typeof caught === 'object' && (
          ('code' in caught && (caught as { code?: unknown }).code === 'unimplemented')
          || ('message' in caught && /unimplemented/i.test(String((caught as { message?: unknown }).message)))
        ));
        setGestureListUnimplemented(unimpl);
      }
    });
    return () => { cancelled = true; };
  }, [gestureLinkReady, onListGestures]);
  const syncedGestureNames = useMemo(() => new Set(robotGestures.map(item => item.name)), [robotGestures]);
  const displayedGestures = useMemo<readonly HudGestureInput[]>(() => {
    if (!hasGestureCatalogSupport) return [];
    const byName = new Map(robotGestures.map(item => [item.name, item]));
    const defaults = DEFAULT_THUNDER_GESTURES
      .filter(item => item.name !== 'stand_up' && item.name !== 'wake_stand')
      .map(item => byName.get(item.name) ?? item);
    const defaultSet = new Set(defaults.map(item => item.name));
    const extras = robotGestures.filter(item => !defaultSet.has(item.name));
    return [...defaults, ...extras];
  }, [hasGestureCatalogSupport, robotGestures]);
  const gestureCatalogSynced = robotGestures.length > 0 && !gestureListUnimplemented;
  const [hudNotice, setHudNotice] = useState<string | null>(null);
  const hudNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHudNotice = useCallback(() => {
    if (hudNoticeTimer.current) {
      clearTimeout(hudNoticeTimer.current);
      hudNoticeTimer.current = null;
    }
    setHudNotice(null);
  }, []);
  const showHudNotice = useCallback((message: string) => {
    if (hudNoticeTimer.current) clearTimeout(hudNoticeTimer.current);
    setHudNotice(message);
    hudNoticeTimer.current = setTimeout(() => {
      hudNoticeTimer.current = null;
      if (mountedRef.current) setHudNotice(null);
    }, 3000);
  }, []);
  const activeCaptureStream = primaryCamera === 'front' ? effectiveFrontStream : effectiveRearStream;
  const activeCaptureRotation = primaryCamera === 'front' ? effectiveFrontRotation : effectiveRearRotation;
  const activeCaptureReceiving = primaryCamera === 'front'
    ? videoPresentation?.phase === 'receiving'
    : effectiveRearVideo?.phase === 'receiving';
  const mediaCapture = useControlMediaCapture({
    camera: primaryCamera,
    stream: activeCaptureStream,
    rotation: activeCaptureRotation,
    receiving: activeCaptureReceiving,
    active: appActive && !leaving,
    targetKey: operationTargetKey,
    adapter: mediaCaptureAdapter,
    onNotice: showHudNotice,
  });
  useEffect(() => {
    setSpeedLimitExpanded(false);
    setFaultPanelOpen(false);
    if (!appActive) clearHudNotice();
  }, [operationTargetKey, connected, appActive, isLandscape, clearHudNotice]);
  const [joystickSettingsOpen, setJoystickSettingsOpen] = useState(false);
  const [layoutEditorGeneration, setLayoutEditorGeneration] = useState(0);
  const layoutEditorGenerationRef = useRef(0);
  const layoutEditingRef = useRef(false);
  const [joystickPreferences, setJoystickPreferences] = useState(createDefaultJoystickLayoutPreferences);
  const joystickPreferencesRef = useRef(joystickPreferences);
  const layoutRevision = useRef(0);
  const layoutPreviewDirty = useRef(false);
  const saveRevision = useRef(0);
  const [layoutStorageError, setLayoutStorageError] = useState<string | null>(null);
  const [stickArea, setStickArea] = useState({ width: 0, height: 0 });
  const [layoutCanvas, setLayoutCanvas] = useState({ width: 0, height: 0 });
  const [inputSettingsOpen, setInputSettingsOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef(false);
  const [settingsCategory, setSettingsCategory] = useState<ControlSettingsCategory>('操控');
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [gestureLibraryOpen, setGestureLibraryOpen] = useState(false);
  const [postureMenuOpen, setPostureMenuOpen] = useState(false);
  const g20Gate = useRef(new G20IntentGate());
  const g20MotionGate = useRef(new G20IntentGate());
  const [driveActive, setDriveActive] = useState(false);
  const [turnActive, setTurnActive] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const touchGeneration = useRef(0);
  const touchAllowed = useRef(false);
  const touchSnapshot = useRef<readonly unknown[] | null>(null);
  const [operationInFlight, setOperationInFlight] = useState<ControlOperation | 'recall' | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const lastOperationRef = useRef<ControlOperation | 'recall' | null>(null);
  const [localOperationStates, setLocalOperationStates] = useState<Partial<Record<ControlOperation, ControlOperationState>>>({});
  // Portrait retains the full capability and diagnostic surface; landscape is
  // intentionally reduced to the controller essentials below.
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const [secondaryActionsExpanded, setSecondaryActionsExpanded] = useState(!isLandscape);
  const [actionReasonsExpanded, setActionReasonsExpanded] = useState(false);
  const [statusDetailsExpanded, setStatusDetailsExpanded] = useState(false);
  const [auxiliaryExpanded, setAuxiliaryExpanded] = useState(!isLandscape);
  const [integrationExpanded, setIntegrationExpanded] = useState(false);
  const [localInputSource, setLocalInputSource] = useState<ControlInputSource>(inputSource ?? runtimeState?.inputSource ?? 'touch');
  const revokeOperationIntentRef = useRef<(() => void) | null>(null);
  const [confirmation, setConfirmation] = useState<OperationConfirmation | null>(null);
  const confirmationRef = useRef<OperationConfirmation | null>(null);
  const operationGeneration = useRef(0);
  const [policySelection, setPolicySelection] = useState<number | null>(null);
  const policySelectionRef = useRef<number | null>(null);
  const submittedPolicyRef = useRef<string | null>(null);
  const inFlightRef = useRef<object | null>(null);
  const pendingResultsRef = useRef(new Map<ControlOperation | 'recall', { cancel: () => void; expire: () => void }>());
  const retireOperationResults = useCallback(() => {
    for (const pending of pendingResultsRef.current.values()) pending.expire();
  }, []);
  const mountedRef = useRef(true);
  const orientationRef = useRef(isLandscape);
  const developmentInputRef = useRef(developmentInput);
  developmentInputRef.current = developmentInput;
  const productionInputRef = useRef(productionInput);
  productionInputRef.current = productionInput;
  const interruptInput = useCallback(() => {
    productionInputRef.current?.onInterrupt();
    if (__DEV__ && developmentInputRef.current) developmentInputRef.current.onInterrupt();
  }, []);
  const recallRef = useRef({ canRecall, onRecall, appActive, leaving });
  recallRef.current = { canRecall, onRecall, appActive, leaving };
  const operationContextRef = useRef({ operationReadiness, operationCallbacks, runtimeState, appActive, leaving });
  operationContextRef.current = { operationReadiness, operationCallbacks, runtimeState, appActive, leaving };
  const policyOptions = getControlPolicyOptions(runtimeState).map(option => ({
    ...option,
    label: CONTROL_TERRAIN_MODE_OPTIONS.find(mode => mode.id === (option.terrainModeId ?? option.id))?.label ?? option.label
  }));
  const customPolicyCatalog = policyOptions.some(option => !CONTROL_TERRAIN_MODE_OPTIONS.some(mode => mode.id === (option.terrainModeId ?? option.id)));
  const terrainPolicies = customPolicyCatalog
    ? policyOptions.map(option => ({ ...option, profileId: option.id, selected: runtimeState?.currentPolicy?.id === option.id }))
    : getControlTerrainPolicies(runtimeState);
  const selectedInputSource = inputSource ?? localInputSource;
  const selectedSourceRef = useRef(selectedInputSource);
  selectedSourceRef.current = selectedInputSource;
  const resultContextRef = useRef({ target: operationTargetKey, source: selectedInputSource });
  const physicalAvailable = physicalInputAvailable || !!(g20Controller?.state.reading
    && g20Controller.state.sample?.configurationReady === true
    && g20Controller.state.calibrated && !g20Controller.state.calibrating);
  const setInputSource = useCallback((next: ControlInputSource) => {
    if (next === 'physical' && !physicalAvailable) return;
    if (next === selectedSourceRef.current) return;
    selectedSourceRef.current = next;
    touchGeneration.current++;
    g20Gate.current.reset();
    g20MotionGate.current.reset();
    interruptInput();
    setDriveActive(false); setTurnActive(false); setResetKey(current => current + 1);
    setLocalInputSource(next);
    onInputSourceChange?.(next);
    revokeOperationIntentRef.current?.();
  }, [onInputSourceChange, physicalAvailable, interruptInput]);
  const integration = brainstemIntegration ?? getBrainstemIntegrationReadiness({
    nativeModuleAvailable: false,
    endpointConfigured: Boolean(directConnection?.endpointLabel && directConnection.endpointLabel !== '未连接'),
    readOnlyObservationFresh: directConnection?.fresh === true,
    deviceIdentity: 'unbound',
    clientIdentitySelected: false,
    remoteListenerConfirmed: false,
    remoteMtlsVerified: false,
    controlLeaseActive: false,
    productionExecutorConnected: false,
    ackContractReady: false,
    deadmanStopReady: false,
  });
  const permissionSnapshotRef = useRef<readonly unknown[] | null>(null);
  const permissionSnapshot = [
    operationTargetKey, selectedInputSource,
    ...Object.keys(controlOperationLabels).flatMap(key => {
      const action = key as ControlOperation;
      return [operationReadiness?.[action]?.ready === true, operationCallbacks?.[action]];
    }),
    canRecall === true, onRecall, runtimeState?.controlLink, runtimeState?.controlAuthority,
    runtimeState?.posture, runtimeState?.motorState, runtimeState?.currentPolicy?.id,
    runtimeState?.policyCatalogStatus, JSON.stringify(policyOptions),
  ];
  const previousPermission = permissionSnapshotRef.current;
  if (previousPermission && permissionSnapshot.some((value, index) => !Object.is(value, previousPermission[index]))) {
    // Revocation is synchronous: an old confirmation/press cannot be resurrected
    // by a later grant, callback replacement or changed device policy catalogue.
    operationGeneration.current++;
    confirmationRef.current = null;
    policySelectionRef.current = null;
  }
  permissionSnapshotRef.current = permissionSnapshot;
  const renderGeneration = operationGeneration.current;
  const visibleConfirmation = confirmation?.generation === renderGeneration ? confirmation : null;
  const selectingPolicy = policySelection === renderGeneration;
  const anyJoystickActive = driveActive || turnActive;
  // SafeAreaView already measures the usable area after system-bar visibility changes.
  const landscapeSafeInsets = {
    top: Math.max(systemInsets.top, previewSafeInsets?.top ?? 0),
    right: Math.max(systemInsets.right, previewSafeInsets?.right ?? 0),
    bottom: Math.max(systemInsets.bottom, navigationBottomInset, previewSafeInsets?.bottom ?? 0),
    left: Math.max(systemInsets.left, previewSafeInsets?.left ?? 0),
  };
  const immersiveCanvasHeight = stageDimensions?.height ?? viewport.height;
  const effectiveViewportWidth = stageDimensions?.width ?? viewport.width;
  const layout = useMemo(() => getControlLayoutMetrics({
    containerWidth: effectiveViewportWidth,
    containerHeight: immersiveCanvasHeight,
    isLandscape,
    fontScale,
  }), [effectiveViewportWidth, immersiveCanvasHeight, isLandscape, fontScale]);
  const hideNavigation = layout.useColumns && appActive && !leaving
    && !inputSettingsOpen && !joystickSettingsOpen && !gestureLibraryOpen;
  useEffect(() => {
    let current = true;
    void setControlNavigationHidden(hideNavigation).then(inset => {
      if (current) setNavigationBottomInset(hideNavigation ? inset : 0);
    });
    return () => { current = false; void setControlNavigationHidden(false); };
  }, [hideNavigation]);

  const resetControls = useCallback(() => {
    touchGeneration.current++;
    setDriveActive(false);
    setTurnActive(false);
    setResetKey(current => current + 1);
  }, []);
  const closeSettingsMenu = useCallback(() => {
    if (!settingsMenuRef.current) return;
    settingsMenuRef.current = false;
    setSettingsMenuOpen(false);
  }, []);
  const revokeOperationIntent = useCallback(() => {
    closeSettingsMenu();
    setPostureMenuOpen(false);
    setConfirmingHighSpeed(false);
    operationGeneration.current++;
    confirmationRef.current = null;
    policySelectionRef.current = null;
    setConfirmation(null);
    setPolicySelection(null);
    setOperationMessage(null);
    retireOperationResults();
  }, [closeSettingsMenu, retireOperationResults]);
  revokeOperationIntentRef.current = revokeOperationIntent;
  const setLocalOperationState = useCallback((action: ControlOperation, status: ControlOperationState['status'], detail?: string) => {
    setLocalOperationStates(current => ({
      ...current,
      [action]: transitionControlOperationState(current[action] ?? { status: 'idle' }, status, detail).state,
    }));
  }, []);
  useEffect(() => {
    const previous = resultContextRef.current;
    if (previous.target !== operationTargetKey || previous.source !== selectedInputSource
      || runtimeState?.controlLink !== 'connected') retireOperationResults();
    resultContextRef.current = { target: operationTargetKey, source: selectedInputSource };
  }, [operationTargetKey, selectedInputSource, runtimeState?.controlLink, retireOperationResults]);
  useEffect(() => {
    if (operationInFlight) return;
    if (runtimeState?.controlLink !== 'connected') { retireOperationResults(); return; }
    const observed: Partial<Record<ControlOperation, boolean>> = {
      stop: runtimeState.controlAuthority === 'not-held',
      stand: runtimeState.posture === 'standing', sit: runtimeState.posture === 'sitting',
      enableMotor: runtimeState.motorState === 'enabled', disableMotor: runtimeState.motorState === 'disabled',
      switchPolicy: Boolean(submittedPolicyRef.current && runtimeState.currentPolicy?.id === submittedPolicyRef.current
        && (runtimeState.posture === 'standing' || runtimeState.posture === 'sitting')),
    };
    const completed = (Object.keys(observed) as ControlOperation[]).filter(action => observed[action]
      && ['accepted', 'executing'].includes(localOperationStates[action]?.status ?? ''));
    if (!completed.length) return;
    for (const action of completed) pendingResultsRef.current.get(action)?.cancel();
    setLocalOperationStates(current => {
      const next = { ...current };
      for (const action of completed) {
        let state = next[action]!;
        if (state.status === 'accepted') state = transitionControlOperationState(state, 'executing').state;
        next[action] = transitionControlOperationState(state, 'completed', action === 'stop' ? '控制权撤销已确认。' : '设备状态已确认。').state;
      }
      return next;
    });
  }, [localOperationStates, operationInFlight, runtimeState, retireOperationResults]);
  useEffect(() => {
    if (inputSource) setLocalInputSource(inputSource);
  }, [inputSource]);
  useEffect(() => {
    setSecondaryActionsExpanded(!isLandscape);
    setActionReasonsExpanded(false);
    setStatusDetailsExpanded(false);
    setAuxiliaryExpanded(!isLandscape);
    if (isLandscape) setIntegrationExpanded(false);
  }, [isLandscape]);

  useEffect(() => {
    if (orientationRef.current === isLandscape) return;
    orientationRef.current = isLandscape;
    revokeOperationIntent();
    interruptInput();
    resetControls();
  }, [isLandscape, resetControls, revokeOperationIntent]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      recallRef.current.appActive = state === 'active';
      operationContextRef.current.appActive = state === 'active';
      if (state !== 'active') {
        revokeOperationIntent();
        interruptInput();
        resetControls();
      }
    });
    return () => subscription.remove();
  }, [resetControls, revokeOperationIntent]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hudNoticeTimer.current) {
        clearTimeout(hudNoticeTimer.current);
        hudNoticeTimer.current = null;
      }
      retireOperationResults();
      operationGeneration.current++;
      confirmationRef.current = null;
      policySelectionRef.current = null;
      interruptInput();
    };
  }, []);

  useEffect(() => {
    if (!((productionInput?.touchReady ?? productionInput?.ready) || developmentInput?.ready)) resetControls();
  }, [productionInput?.touchReady, productionInput?.ready, developmentInput?.ready, resetControls]);

  useEffect(() => {
    if (!allowInteractionPreview) resetControls();
  }, [allowInteractionPreview, resetControls]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    const next = {
      height: Number.isFinite(height) ? Math.max(0, height) : 0,
      width: Number.isFinite(width) ? Math.max(0, width) : 0,
    };
    if (viewportRef.current.height === next.height && viewportRef.current.width === next.width) return;
    // Even without rotation, Android system bars or multi-window can move the
    // touch baseline. Cancel the current local session before changing geometry.
    if (viewportRef.current.width > 0 && viewportRef.current.height > 0) {
      revokeOperationIntent();
      interruptInput();
      resetControls();
    }
    viewportRef.current = next;
    setViewport(next);
  }, [resetControls, revokeOperationIntent]);

  const prepareWorkspaceLeave = useCallback(() => {
    recallRef.current.leaving = true;
    operationContextRef.current.leaving = true;
    setLeaving(true);
    revokeOperationIntent();
    interruptInput();
    resetControls();
    return () => {
      if (!mountedRef.current) return;
      recallRef.current.leaving = false;
      operationContextRef.current.leaving = false;
      setLeaving(false);
    };
  }, [resetControls, revokeOperationIntent]);
  useEffect(() => {
    if (!prepareWorkspaceLeaveRef) return;
    prepareWorkspaceLeaveRef.current = prepareWorkspaceLeave;
    return () => { prepareWorkspaceLeaveRef.current = null; };
  }, [prepareWorkspaceLeave, prepareWorkspaceLeaveRef]);
  const handleBack = useCallback(() => {
    if (!prepareWorkspaceLeaveRef) prepareWorkspaceLeave();
    onBack();
  }, [onBack, prepareWorkspaceLeave, prepareWorkspaceLeaveRef]);

  const previewControlsEnabled = __DEV__ && allowInteractionPreview && appActive && !leaving;
  const offlinePreview = !connected && runtimeState?.controlLink !== 'connected' && !(__DEV__ && developmentInput?.ready && !productionInput);
  const controlsEnabled = !offlinePreview && !settingsMenuOpen && !postureMenuOpen && !joystickSettingsOpen && !inputSettingsOpen && !gestureLibraryOpen && !operationInFlight && !visibleConfirmation && !selectingPolicy && (productionInput
    ? connected && runtimeState?.controlLink !== 'disconnected' && (productionInput.touchReady ?? (canUseManualControl && productionInput.ready)) && appActive && !leaving
    : developmentInput
      ? __DEV__ && developmentInput.ready && appActive && !leaving
      : previewControlsEnabled);
  const previewAvailable = offlinePreview && appActive && !leaving && !settingsMenuOpen && !joystickSettingsOpen
    && !inputSettingsOpen && !gestureLibraryOpen && !postureMenuOpen && !operationInFlight && !visibleConfirmation && !selectingPolicy;
  const joystickDisabled = offlinePreview ? !previewAvailable : !controlsEnabled || selectedInputSource !== 'touch';
  const nextTouchSnapshot = [selectedInputSource, controlsEnabled, offlinePreview, appActive, leaving, inputSettingsOpen, joystickSettingsOpen,
    isLandscape, width, height, fontScale, viewport.width, viewport.height, renderGeneration,
    productionInput?.onDrive, productionInput?.onTurn, productionInput?.onInterrupt,
    developmentInput?.onDrive, developmentInput?.onTurn, developmentInput?.onInterrupt];
  if (touchSnapshot.current && nextTouchSnapshot.some((value, index) => !Object.is(value, touchSnapshot.current![index]))) touchGeneration.current++;
  touchSnapshot.current = nextTouchSnapshot;
  touchAllowed.current = controlsEnabled && selectedInputSource === 'touch';
  const renderedTouchGeneration = touchGeneration.current;
  const previewTouchActive = (side: 'drive' | 'turn', active: boolean) => {
    if (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current) return;
    (side === 'drive' ? setDriveActive : setTurnActive)(active);
  };
  const cancelPreview = () => {
    if (mountedRef.current && renderedTouchGeneration === touchGeneration.current) resetControls();
  };
  const heldTouchSides = useRef({ drive: false, turn: false });
  const touchActive = (side: 'drive' | 'turn', active: boolean) => {
    if (active && (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current
      || !touchAllowed.current || selectedSourceRef.current !== 'touch')) return;
    const held = heldTouchSides.current;
    const previouslyHeld = held.drive || held.turn;
    held[side] = active;
    (side === 'drive' ? setDriveActive : setTurnActive)(active);
    if (active && touchAllowed.current && !previouslyHeld) productionInputRef.current?.onTouchBegin?.();
    if (!active && previouslyHeld && !held.drive && !held.turn) {
      const input = productionInputRef.current;
      (input?.onTouchEnd ?? input?.onInterrupt)?.();
    }
  };
  const handleDrive = useCallback((value: JoystickVector) => {
    if (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current || !touchAllowed.current
      || selectedSourceRef.current !== 'touch' || layoutEditingRef.current) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || !operationContextRef.current.appActive || operationContextRef.current.leaving) return;
    value = scaleControlVector(value, speedLimitRef.current);
    if (productionInput && (productionInput.touchReady ?? (productionInput.ready && canUseManualControl)) && appActive && !leaving) { productionInput.onDrive(value); return; }
    if (__DEV__ && developmentInput?.ready && appActive && !leaving) developmentInput.onDrive(value);
  }, [productionInput, canUseManualControl, developmentInput, appActive, leaving, renderedTouchGeneration]);
  const handleTurn = useCallback((value: JoystickVector) => {
    if (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current || !touchAllowed.current
      || selectedSourceRef.current !== 'touch' || layoutEditingRef.current) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || !operationContextRef.current.appActive || operationContextRef.current.leaving) return;
    value = scaleControlVector(value, speedLimitRef.current);
    if (productionInput && (productionInput.touchReady ?? (productionInput.ready && canUseManualControl)) && appActive && !leaving) { productionInput.onTurn(value); return; }
    if (__DEV__ && developmentInput?.ready && appActive && !leaving) developmentInput.onTurn(value);
  }, [productionInput, canUseManualControl, developmentInput, appActive, leaving, renderedTouchGeneration]);
  const handleCancel = useCallback(() => {
    g20Gate.current.reset();
    g20MotionGate.current.reset();
    revokeOperationIntent();
    interruptInput();
    resetControls();
  }, [resetControls, revokeOperationIntent]);

  useEffect(() => {
    let active = true;
    const revision = layoutRevision.current;
    void loadJoystickLayoutPreferences().then(saved => {
      if (!active || revision !== layoutRevision.current) return;
      if (JSON.stringify(saved) !== JSON.stringify(joystickPreferencesRef.current)) {
        handleCancel();
        joystickPreferencesRef.current = saved;
        setJoystickPreferences(saved);
      }
    }).catch(() => {
      if (active && revision === layoutRevision.current) setLayoutStorageError('无法读取已保存布局');
    });
    return () => { active = false; };
  }, [handleCancel]);

  const persistJoystickLayout = (next: typeof joystickPreferences) => {
    layoutPreviewDirty.current = false;
    const revision = ++saveRevision.current;
    void saveJoystickLayoutPreferences(next).then(() => {
      if (mountedRef.current && revision === saveRevision.current) setLayoutStorageError(null);
    }).catch(() => {
      if (mountedRef.current && revision === saveRevision.current) setLayoutStorageError('摇杆布局暂未保存');
    });
  };
  const orientation = isLandscape ? 'landscape' : 'portrait';
  const previewJoystickLayout = (side: JoystickSide, patch: Partial<JoystickPlacement>) => {
    if (!layoutEditingRef.current || !mountedRef.current || layoutEditorGeneration !== layoutEditorGenerationRef.current) return;
    layoutRevision.current++;
    const next = updateJoystickPlacement(joystickPreferencesRef.current, orientation, side, patch);
    joystickPreferencesRef.current = next;
    layoutPreviewDirty.current = true;
    setJoystickPreferences(next);
  };
  const changeJoystickLayout = (side: JoystickSide, patch: Partial<JoystickPlacement>) => {
    if (!layoutEditingRef.current || !mountedRef.current || layoutEditorGeneration !== layoutEditorGenerationRef.current) return;
    handleCancel();
    previewJoystickLayout(side, patch);
    persistJoystickLayout(joystickPreferencesRef.current);
  };
  const restoreJoystickLayout = () => {
    if (!layoutEditingRef.current || !mountedRef.current || layoutEditorGeneration !== layoutEditorGenerationRef.current) return;
    handleCancel();
    // Retire held sliders synchronously; queued events cannot undo this reset.
    setLayoutEditorGeneration(++layoutEditorGenerationRef.current);
    layoutRevision.current++;
    const next = resetJoystickLayout(joystickPreferencesRef.current, orientation);
    joystickPreferencesRef.current = next;
    setJoystickPreferences(next);
    persistJoystickLayout(next);
  };
  const openJoystickSettings = () => {
    layoutEditingRef.current = true;
    setLayoutEditorGeneration(++layoutEditorGenerationRef.current);
    physicalContext.current.allowed = false;
    handleCancel();
    setJoystickSettingsOpen(true);
  };
  const closeJoystickSettings = () => {
    handleCancel();
    layoutEditingRef.current = false;
    if (layoutPreviewDirty.current) persistJoystickLayout(joystickPreferencesRef.current);
    setJoystickSettingsOpen(false);
  };
  const handleStickArea = (event: LayoutChangeEvent) => {
    if (settingsMenuRef.current) return;
    const { width, height } = event.nativeEvent.layout;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const next = { width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) };
    if (next.width === stickArea.width && next.height === stickArea.height) return;
    if (stickArea.width > 0 && stickArea.height > 0) handleCancel();
    setStickArea(next);
  };

  const openView = (callback?: () => void) => {
    if (!callback) return;
    handleCancel();
    callback();
  };
  const startOperation = useCallback((action: ControlOperation | 'recall', callback: () => void | Promise<void>) => {
    if (layoutEditingRef.current && action !== 'stop') return;
    if (inFlightRef.current || !mountedRef.current) return;
    pendingResultsRef.current.get(action)?.cancel();
    const request = {};
    const requestGeneration = ++operationGeneration.current;
    inFlightRef.current = request;
    lastOperationRef.current = action;
    setOperationInFlight(action);
    setOperationMessage(null);
    resetControls();
    if (action !== 'recall') setLocalOperationState(action, 'submitted', '正在提交到受保护执行器。');
    // The deadline bounds confirmation only; it cannot cancel device execution.
    const pending = {
      cancel: () => { clearTimeout(timer); pendingResultsRef.current.delete(action); },
      expire: () => {
        if (pendingResultsRef.current.get(action) !== pending) return;
        pending.cancel();
        if (!mountedRef.current) return;
        if (inFlightRef.current === request) { inFlightRef.current = null; setOperationInFlight(null); }
        if (action !== 'recall') setLocalOperationState(action, 'timeout', '操作结果未确认，请先读取设备状态后再决定是否重试。');
        if (lastOperationRef.current === action) setOperationMessage('操作结果未确认，请先读取设备状态后再决定是否重试。');
      },
    };
    const timer = setTimeout(pending.expire, 10_000);
    pendingResultsRef.current.set(action, pending);
    const settle = (ok: boolean, error?: unknown) => {
      if (inFlightRef.current !== request || pendingResultsRef.current.get(action) !== pending) return;
      inFlightRef.current = null;
      if (!mountedRef.current) return;
      setOperationInFlight(null);
      if (!ok || action === 'recall') pending.cancel();
      const rejection = !ok && error && typeof error === 'object' && 'code' in error
        ? error.code === 'precondition' ? '机器人当前状态不允许此操作。'
          : error.code === 'unimplemented' ? '机器人服务未开放此操作。' : null
        : null;
      if (action !== 'recall') {
        setLocalOperationState(action, ok ? 'accepted' : 'failed', ok ? '执行器已接受，等待设备终态。' : rejection ?? '执行器未确认本次请求。');
      }
      if (operationGeneration.current === requestGeneration) setOperationMessage(ok ? '请求已接受，状态待确认' : rejection ?? '未能确认操作结果，请先读取设备状态后再决定是否重试。');
    };
    try {
      // The production action owns zero/release and dispatch as one serialized
      // native transaction. An independent interrupt here would race that action.
      if (__DEV__) developmentInputRef.current?.onInterrupt();
      if (requestGeneration !== operationGeneration.current || !operationContextRef.current.appActive || operationContextRef.current.leaving) { settle(false); return; }
      Promise.resolve(callback()).then(() => settle(true), error => settle(false, error));
    } catch (error) {
      settle(false, error);
    }
  }, [resetControls, setLocalOperationState]);
  const runOperation = useCallback((action: ControlOperation, expectedGeneration: number, policyId?: string, confirmedIntent?: OperationConfirmation) => {
    if (!mountedRef.current || expectedGeneration !== operationGeneration.current) return;
    // Emergency stop preempts a pending confirmation or in-flight posture change.
    // The native interrupt is allowed while another RPC is busy.
    if (action === 'stop' && !confirmedIntent) {
      confirmationRef.current = null;
      policySelectionRef.current = null;
      setConfirmation(null);
      setPolicySelection(null);
      for (const pending of [...pendingResultsRef.current.values()]) pending.cancel();
      inFlightRef.current = null;
    }
    if (settingsMenuRef.current) {
      if (action !== 'stop') return;
      closeSettingsMenu();
    }
    if (confirmedIntent ? confirmationRef.current !== confirmedIntent : confirmationRef.current !== null) return;
    const current = operationContextRef.current;
    const readiness = getControlOperationReadiness({
      action, readiness: current.operationReadiness, callbacks: current.operationCallbacks,
      runtimeState: current.runtimeState, foreground: current.appActive, leaving: current.leaving, inFlight: inFlightRef.current !== null, policyId
    });
    if (!readiness.ready) return;
    if (!confirmedIntent && (action === 'enableMotor' || action === 'disableMotor' || action === 'switchPolicy')) {
      if (__DEV__) developmentInputRef.current?.onInterrupt();
      resetControls();
      const latest = operationContextRef.current;
      const recheck = getControlOperationReadiness({
        action, readiness: latest.operationReadiness, callbacks: latest.operationCallbacks,
        runtimeState: latest.runtimeState, foreground: latest.appActive, leaving: latest.leaving, inFlight: inFlightRef.current !== null, policyId
      });
      if (expectedGeneration !== operationGeneration.current || !recheck.ready) return;
    }
    if (policySelectionRef.current !== null && (action !== 'switchPolicy' || policyId === undefined)) return;
    if (action === 'switchPolicy' && !confirmedIntent) {
      if (policyId === undefined) {
        policySelectionRef.current = expectedGeneration;
        setPolicySelection(expectedGeneration);
        return;
      }
      if (policySelectionRef.current !== null && policySelectionRef.current !== expectedGeneration) return;
      policySelectionRef.current = null;
      setPolicySelection(null);
    }
    if (action === 'enableMotor' || action === 'disableMotor' || action === 'switchPolicy' || action === 'setZero') {
      if (!confirmedIntent) {
        const intent = { action, policyId, generation: expectedGeneration };
        confirmationRef.current = intent;
        setConfirmation(intent);
        return;
      }
      confirmationRef.current = null;
      setConfirmation(null);
    }
    const expectedCallback = current.operationCallbacks?.[action];
    if (action === 'switchPolicy') submittedPolicyRef.current = policyId ?? null;
    startOperation(action, () => {
      const latest = operationContextRef.current;
      const recheck = getControlOperationReadiness({
        action, readiness: latest.operationReadiness, callbacks: latest.operationCallbacks,
        runtimeState: latest.runtimeState, foreground: latest.appActive, leaving: latest.leaving, inFlight: false, policyId
      });
      if (!recheck.ready || latest.operationCallbacks?.[action] !== expectedCallback) throw Error('Operation authorization changed');
      return action === 'switchPolicy' ? latest.operationCallbacks?.switchPolicy?.(policyId!)
        : action === 'playGesture' ? latest.operationCallbacks?.playGesture?.(policyId!)
          : latest.operationCallbacks?.[action]?.();
    });
  }, [closeSettingsMenu, revokeOperationIntent, startOperation, resetControls]);
  const physicalContext = useRef({ observing: false, allowed: false, motion: false, generation: renderGeneration, runOperation, productionInput });
  const observingPhysical = selectedInputSource === 'physical' && physicalAvailable && !inputSettingsOpen && !joystickSettingsOpen && !gestureLibraryOpen && appActive && !leaving;
  physicalContext.current = {
    observing: observingPhysical,
    allowed: observingPhysical && !settingsMenuOpen && !postureMenuOpen && !operationInFlight && !visibleConfirmation && !selectingPolicy,
    motion: controlsEnabled, generation: renderGeneration, runOperation, productionInput
  };
  g20Gate.current.setEnabled(observingPhysical, g20Controller?.captureFence);
  g20MotionGate.current.setEnabled(physicalContext.current.allowed && controlsEnabled, g20Controller?.captureFence);
  useEffect(() => {
    if (!g20Controller) return;
    return g20Controller.subscribe(({ sample, frame }) => {
      const context = physicalContext.current;
      if (!sample || !frame) {
        g20Gate.current.reset();
        g20MotionGate.current.reset();
        if (selectedSourceRef.current === 'physical') interruptInput();
        return;
      }
      if (layoutEditingRef.current || !context.observing || selectedSourceRef.current !== 'physical' || !mountedRef.current
        || !operationContextRef.current.appActive || operationContextRef.current.leaving) return;
      const fresh = g20Controller.isFresh(sample.generation, sample.sequence);
      const intent = g20Gate.current.accept(sample, frame, fresh);
      const motion = g20MotionGate.current.accept(sample, frame, fresh);
      if (!fresh) { interruptInput(); return; }
      if (intent.action === 'stop') {
        // Software revocation remains available during another action or confirmation.
        g20MotionGate.current.reset(); revokeOperationIntent(); resetControls(); interruptInput(); return;
      }
      if (!context.allowed) return;
      if (intent.action === 'toggleJointParams') { setJointParamsOpen(current => !current); return; }
      if (intent.action) { context.runOperation(intent.action, context.generation); return; }
      if (motion.send && intent.send && context.motion && context.productionInput?.ready && context.productionInput.onSticks) {
        const limit = speedLimitRef.current;
        context.productionInput.onSticks(
          scaleControlVector({ x: frame.vector.leftX, y: frame.vector.leftY }, limit),
          scaleControlVector({ x: frame.vector.rightX, y: frame.vector.rightY }, limit),
          sample.requestStartedAtMonotonicMs,
        );
      }
    });
  }, [g20Controller?.subscribe, interruptInput, revokeOperationIntent, resetControls]);
  useEffect(() => {
    if (selectedInputSource === 'physical' && !physicalAvailable) setInputSource('touch');
  }, [selectedInputSource, physicalAvailable, setInputSource]);
  const openInputSettings = () => { handleCancel(); setInputSettingsOpen(true); };
  const closeInputSettings = () => { handleCancel(); setInputSettingsOpen(false); };
  const recallEnabled = canRecall === true && typeof onRecall === 'function' && appActive && !leaving && !operationInFlight && !visibleConfirmation && !selectingPolicy;
  const handleRecall = useCallback(() => {
    const current = recallRef.current;
    if (current.canRecall !== true || typeof current.onRecall !== 'function' || !current.appActive || current.leaving) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || renderGeneration !== operationGeneration.current) return;
    startOperation('recall', current.onRecall);
  }, [startOperation, renderGeneration]);
  const resolvedBatteryPercent = typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100
    ? batteryPercent
    : typeof runtimeState?.battery?.percent === 'number' && Number.isFinite(runtimeState.battery.percent) && runtimeState.battery.percent >= 0 && runtimeState.battery.percent <= 100
      ? runtimeState.battery.percent : null;
  const batteryLabel = resolvedBatteryPercent === null ? '电量未知' : `${Math.round(resolvedBatteryPercent)}%`;
  const manualStatus = offlinePreview ? '本地试用' : productionInput ? (controlsEnabled ? '触屏控制已就绪' : '触屏控制未就绪') : __DEV__ && developmentInput
    ? (controlsEnabled ? '本地模拟就绪' : '本地模拟未就绪')
    : previewControlsEnabled ? '本地操作演示' : '手动控制未开放';
  const manualReason = offlinePreview ? '仅用于试用圆盘，不会控制机器狗。' : controlsEnabled
    ? '松手归零；离开页面或切到后台会中断操作。'
    : manualControlBlockedReason || (canUseManualControl ? '实时运动控制尚未开放。' : '连接设备并通过控制权限检查后方可操作。');
  const browseEntries = [
    { id: 'map', label: '地图', icon: 'map-outline' as const, callback: onOpenMap },
    { id: 'tasks', label: '任务', icon: 'checkbox-outline' as const, callback: onOpenTasks },
    { id: 'routes', label: '路线', icon: 'navigate-outline' as const, callback: onOpenRoutes },
  ];
  const operationGroups: ReadonlyArray<{ title: string; actions: readonly ControlOperation[] }> = [
    { title: '快捷动作', actions: ['stand', 'sit', 'stop'] },
    { title: '动力', actions: ['enableMotor', 'disableMotor'] },
    { title: '控制策略模型', actions: ['switchPolicy'] },
  ];
  const visibleOperationGroups = layout.useColumns && !secondaryActionsExpanded
    ? operationGroups.slice(0, 1)
    : operationGroups;
  const manualPanelWidth = layout.useColumns && (!showPlanning || !auxiliaryExpanded)
    ? layout.mainPanelWidth
    : layout.manualPanelWidth;
  const operationStateFor = (action: ControlOperation, readiness: ControlActionReadiness): ControlOperationState =>
    operationStates?.[action] ?? localOperationStates[action] ?? (readiness.ready
      ? { status: 'idle' as const }
      : { status: 'blocked' as const, detail: readiness.blockedReason });
  const lastAction = lastOperationRef.current;
  const feedbackState = lastAction && lastAction !== 'recall'
    ? operationStates?.[lastAction] ?? localOperationStates[lastAction]
    : Object.values(operationStates ?? {}).find(state => state?.status === 'failed' || state?.status === 'timeout');
  const feedbackFailed = feedbackState?.status === 'failed' || feedbackState?.status === 'timeout';
  const feedbackPending = feedbackState?.status === 'submitted' || feedbackState?.status === 'accepted' || feedbackState?.status === 'executing';
  const faultFeedback = runtimeState?.faultStatus === 'active' ? runtimeState.faultSummary || '设备故障，请检查设备状态' : null;
  const touchBlockedFeedback = selectedInputSource === 'touch' && productionInput?.touchReady === false
    && !operationInFlight && !inputSettingsOpen && !joystickSettingsOpen ? manualControlBlockedReason : null;
  const operationFeedback = controlSession?.error || faultFeedback || touchBlockedFeedback || (operationInFlight
    ? `正在${operationInFlight === 'recall' ? '召回' : controlOperationLabels[operationInFlight]}`
    : feedbackFailed ? operationMessage || feedbackState?.detail || '操作结果未确认，请检查设备状态'
      : feedbackPending ? operationMessage || '等待设备状态确认' : null);
  const operationFeedbackIsError = Boolean(controlSession?.error || faultFeedback || feedbackFailed);
  const observedMotorState = runtimeState?.controlLink === 'connected' ? runtimeState.motorState ?? 'unknown' : 'unknown';
  const motorTarget: 'enableMotor' | 'disableMotor' | null = observedMotorState === 'enabled'
    ? 'disableMotor' : observedMotorState === 'disabled' ? 'enableMotor' : null;
  const speed = runtimeState?.speed;
  const formatSpeed = (value: number | null | undefined, unit: string) =>
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} ${unit}` : '未知';
  const signalKnown = runtimeState?.signal?.source === 'device' || runtimeState?.signal?.source === 'controller';
  const immersiveSignalLabel = signalKnown && typeof runtimeState?.signal?.qualityPercent === 'number' && Number.isFinite(runtimeState.signal.qualityPercent)
    && runtimeState.signal.qualityPercent >= 0 && runtimeState.signal.qualityPercent <= 100
    ? `${Math.round(runtimeState.signal.qualityPercent)}%`
    : signalKnown && typeof runtimeState?.signal?.rssiDbm === 'number' && Number.isFinite(runtimeState.signal.rssiDbm)
      ? `${Math.round(runtimeState.signal.rssiDbm)} dBm` : '—';
  const immersiveBatteryKnown = resolvedBatteryPercent !== null;
  const immersiveBatteryMetricLabel = '电量';
  const immersiveBatteryLabel = immersiveBatteryKnown ? `${Math.round(resolvedBatteryPercent)}%` : '—';
  const speedSourceLabel = speed?.source === 'device' ? '设备状态' : speed?.source === 'command' ? '最近指令' : '未同步';
  const terrainMode = runtimeState?.terrainMode;
  const terrainModeOptions = getControlTerrainModeOptions(runtimeState);
  const terrainModeCurrent = terrainMode?.current;
  const terrainModeLabel = runtimeState?.recoveryMode?.selected ? '摔倒恢复' : CONTROL_TERRAIN_MODE_OPTIONS.find(option => option.id === terrainModeCurrent)?.label ?? '未同步';
  const terrainModeCatalogReady = terrainMode?.catalogStatus === 'synced';
  const terrainModeBlockedReason = terrainModeCatalogReady
    ? '站立或趴地时可切换；行走中不可切换。'
    : '暂无可用模式';
  const deviceIdentityLabel = runtimeState?.deviceIdentity === 'verified'
    ? '已验证' : runtimeState?.deviceIdentity === 'bound-unverified'
      ? '待验证' : runtimeState?.deviceIdentity === 'unbound' ? '未绑定' : '未知';
  const faultLabel = runtimeState?.faultStatus === 'clear' ? '无故障' : runtimeState?.faultStatus === 'active' ? '有故障' : '未同步';
  const controlOwnerLabel = ({ 'none': '无人控制', 'this-device': '本设备控制', 'remote': '远程控制中', 'robot-remote': '机器人侧遥控中', 'unknown': '控制状态未知' } as const)[runtimeState?.controlOwner ?? 'unknown'];
  const postureLabel = runtimeState?.posture === 'standing' ? '当前站立' : runtimeState?.posture === 'sitting' ? '当前坐下' : null;
  const motorLabel = runtimeState?.motorState === 'enabled' ? '电机已使能' : runtimeState?.motorState === 'disabled' ? '电机已失能' : null;
  const statusItems = [
    { id: 'identity', label: '设备身份', value: deviceIdentityLabel },
    { id: 'connection', label: '连接状态', value: directConnection ? directConnection.fresh ? '只读已响应' : '需重新检查' : connected ? '已连接' : '未连接' },
    { id: 'authority', label: '控制权', value: controlOwnerLabel },
    { id: 'fault', label: '故障状态', value: faultLabel },
  ];
  const statusSummary = [
    runtimeState?.controlLink === 'connected' ? '控制链路已接通' : runtimeState?.controlLink === 'disconnected' ? '控制链路未接通' : '控制链路未核验',
    controlOwnerLabel,
    postureLabel ?? '姿态未知',
    motorLabel ?? '电机状态未知',
    runtimeState?.currentPolicy?.label ? `运行策略：${runtimeState.currentPolicy.label}` : '运行策略未同步',
  ];
  const renderWorkspacePane = (id: string, paneWidth: number, children: ReactNode) => layout.useColumns ? (
    <ScrollView key={id === 'operations' ? visibleConfirmation ? 'confirm' : selectingPolicy ? 'policy' : 'actions' : id}
      nestedScrollEnabled scrollEnabled={!anyJoystickActive} showsVerticalScrollIndicator={false}
      style={[styles.workspacePane, { width: paneWidth, height: layout.workspaceHeight }]} testID={`control-workspace-${id}`}>
      {children}
    </ScrollView>
  ) : children;

  const immersiveConnectionReady = connected && (!directConnection || runtimeState?.controlLink === 'connected');
  const immersiveConnectionLabel = immersiveConnectionReady ? '已连接' : directConnection?.fresh ? '只读已响应' : '未连接';
  // Media is a separate observation, never a grant of control authority.
  const hudSurface = glass.surface;
  const hudHeaderSurface = settingsMenuOpen ? controlSettingsColors.glass : glass.surface;
  const hudHeaderInk = settingsMenuOpen ? controlSettingsColors.ink : glass.ink;
  const hudHeaderMuted = settingsMenuOpen ? controlSettingsColors.muted : glass.muted;
  const hudBorder = glass.border;
  const maxImmersiveStick = (effectiveViewportWidth || width) <= 1200
    ? 240
    : Math.max(148, Math.round(immersiveCanvasHeight * 0.175));
  const immersiveJoystickSize = effectiveViewportWidth > 0 && immersiveCanvasHeight > 0
    ? Math.min(maxImmersiveStick, Math.floor(Math.min(effectiveViewportWidth * 0.18, immersiveCanvasHeight * 0.30) / 1.42))
    : 0;
  // Keep both input discs inside the measured area, clear of HUD and actions.
  const immersiveJoystickGap = Math.max(20, effectiveViewportWidth - immersiveJoystickSize * 2 - 48);
  const baseActionDockInset = 64 + 16;
  // Floating feedback must not resize the input surface and cancel its own action.
  const stickBottomInset = Math.max(48, immersiveCanvasHeight * .12);
  const feedbackWidth = Math.min(320, effectiveViewportWidth * 0.34);
  const immersiveRobotName = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(robotName.trim())
    ? 'DOSO 机器狗'
    : robotName.replace(/^THUNDER[\s-]+(\d+)$/i, 'THUNDER-$1');
  const compactHeaderActions = (effectiveViewportWidth || width) < 960;
  const hudHeaderHeight = Math.max(44, Math.min(76, immersiveCanvasHeight * .14));
  const mediaStatusTop = Math.max(70, immersiveCanvasHeight * .327);
  const mediaStatusColor = controlHudColors.muted;
  const immersiveTopInset = Math.max(70, immersiveCanvasHeight * .22);
  const hudStickTop = Math.max(70, Math.round(immersiveCanvasHeight * 0.56));
  const hudStickBottom = Math.max(8, Math.round(immersiveCanvasHeight * 0.015));
  const hudUseColumns = layout.useColumns && Boolean(videoProbeHost || videoPresentation && videoPresentation.phase !== 'unconfigured' || recovery || landscapeDocksExpanded !== undefined);
  const configuredWidth = layout.useColumns ? stickArea.width || Math.max(0, effectiveViewportWidth * .91) : Math.max(0, layout.manualPanelWidth - 24);
  const configuredHeight = layout.useColumns
    ? stickArea.height || Math.max(0, hudUseColumns ? immersiveCanvasHeight - hudStickTop - hudStickBottom : immersiveCanvasHeight - immersiveTopInset - stickBottomInset)
    : Math.min(240, Math.max(layout.joystickSize, viewport.height - 340));
  const configuredBaseSize = layout.useColumns ? immersiveJoystickSize : layout.joystickSize;
  // The label follows a 10 dp gap and a 24 dp line that scales with text size.
  const joystickLabelReserve = layout.useColumns ? 0 : Math.ceil(10 + 24 * (Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1));
  const configuredJoystickLayout = resolveJoystickLayout(joystickPreferences[orientation], { width: configuredWidth, height: Math.max(0, configuredHeight - joystickLabelReserve), baseSize: configuredBaseSize });
  const layoutCanvasDiscs = resolveJoystickLayout(joystickPreferences[orientation], { ...layoutCanvas, baseSize: Math.min(144, layoutCanvas.width * 0.22) });
  const renderControlLease = (unframed = false) => controlSession && selectedInputSource === 'physical' ? <Pressable
    accessibilityRole="button"
    accessibilityLabel={controlSession.leaseActive ? '释放控制' : '启用控制'}
    accessibilityState={{ disabled: controlSession.busy || (!controlSession.leaseActive && !controlSession.canAcquire) }}
    disabled={joystickSettingsOpen || controlSession.busy || (!controlSession.leaseActive && !controlSession.canAcquire)}
    onPress={() => { if (!layoutEditingRef.current) (controlSession.leaseActive ? controlSession.onRelease : controlSession.onAcquire)(); }}
    testID="control-lease"
    style={({ pressed }) => [unframed ? styles.immersiveToolbarControl : styles.immersiveConnectionPill,
    unframed && compactHeaderActions && styles.immersiveToolbarControlCompact,
    {
      backgroundColor: unframed ? controlSession.leaseActive ? appearance.action : hudHeaderSurface : controlSession.leaseActive ? appearance.action : appearance.surface,
      borderColor: unframed ? hudBorder : 'transparent'
    }, pressed && styles.pressed]}
  ><Ionicons name={controlSession.leaseActive ? 'lock-open-outline' : 'key-outline'} size={unframed ? 24 : 18} color={unframed && !controlSession.leaseActive ? hudHeaderInk : appearance.blueInk} />
    <Text style={[unframed ? styles.immersiveToolbarText : styles.caption, unframed && compactHeaderActions && styles.immersiveToolbarTextCompact, { color: unframed ? controlSession.leaseActive ? appearance.blueInk : hudHeaderInk : appearance.ink }]}>{controlSession.leaseActive ? '释放控制' : '启用控制'}</Text>
  </Pressable> : null;
  const modeReadiness = getControlOperationReadiness({
    action: 'switchPolicy', readiness: operationReadiness,
    callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null
  });
  const recoveryLabel = runtimeState?.recoveryMode?.selected ? '当前模式'
    : runtimeState?.recoveryMode?.status === 'available' ? '设备已配置'
      : runtimeState?.recoveryMode?.status === 'unavailable' ? '暂不可用' : '未同步';
  const openRecovery = () => {
    physicalContext.current.allowed = false;
    handleCancel(); revokeOperationIntent(); setGestureLibraryOpen(true);
  };
  const renderImmersiveIntent = () => selectingPolicy ? <>
    <Pressable testID="control-mode-dismiss" accessibilityRole="button" accessibilityLabel="关闭模式菜单"
      onPress={revokeOperationIntent} style={styles.modeMenuDismiss} />
    <ControlPanelMotion testID="control-mode-menu" style={[styles.modeMenu, {
      top: 24 + hudHeaderHeight,
      width: Math.min(customPolicyCatalog ? 348 : 280, Math.max(0, viewport.width - 32)), backgroundColor: hudSurface, borderColor: hudBorder
    }]}>
      {glass.backdrop()}
      <ScrollView horizontal={!customPolicyCatalog} style={customPolicyCatalog ? { maxHeight: Math.max(160, (immersiveCanvasHeight || height) - 180), maxWidth: 340 } : undefined}
        contentContainerStyle={{ flexDirection: customPolicyCatalog ? 'column' : 'row' }}>
        {terrainPolicies.map(option => <Pressable
          key={option.id} testID={`control-mode-${option.id}`} accessibilityRole="button"
          accessibilityHint={!modeReadiness.ready ? modeReadiness.blockedReason : !option.profileId ? '机器人未提供此模式' : undefined}
          disabled={!modeReadiness.ready || !option.profileId || option.selected}
          accessibilityState={{ disabled: !modeReadiness.ready || !option.profileId || option.selected, selected: option.selected }}
          onPress={() => { if (option.profileId) runOperation('switchPolicy', renderGeneration, option.profileId); }}
          style={[styles.modeMenuOption, { backgroundColor: option.selected ? appearance.action : 'transparent' }]}>
          <Text style={[styles.label, { color: option.selected ? appearance.actionInk : option.profileId ? hudHeaderInk : hudHeaderMuted }]}>{option.label.replace(/模式$/, '')}</Text>
        </Pressable>)}
      </ScrollView>
    </ControlPanelMotion>
  </> : confirmingHighSpeed ? <View
    style={[styles.immersiveIntent, { top: Math.max(76, Math.round((immersiveCanvasHeight || height) * 0.24)), maxHeight: Math.max(180, (immersiveCanvasHeight || height) - 96) }]}
    testID="control-high-speed-confirm-dialog"
  >
    <Text style={styles.immersiveIntentTitle}>确认切换高速档位（最高 2.5 m/s）</Text>
    <Text style={styles.immersiveIntentSubtitle}>高速档位将机身最大线速度上限提升至 2.5 m/s，请确认处于开阔平坦场地且急停可用。</Text>
    <View style={styles.immersiveIntentActions}>
      <Pressable accessibilityRole="button" onPress={() => setConfirmingHighSpeed(false)} style={({ pressed }) => [styles.immersiveIntentBtn, styles.immersiveIntentCancelBtn, pressed && styles.pressed]}>
        <Text style={styles.immersiveIntentCancelText}>取消</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="确认切换高速档位"
        disabled={speedModePending}
        testID="control-high-speed-confirm"
        style={({ pressed }) => [styles.immersiveIntentBtn, styles.immersiveIntentConfirmBtn, pressed && styles.pressed]}
        onPress={() => {
          if (!onChangeSpeedMode || speedModePending) return;
          setConfirmingHighSpeed(false);
          setSpeedModePending(true);
          void onChangeSpeedMode('high')
            .then(() => { showHudNotice('已切换至高速档位（最高 2.5 m/s）'); })
            .catch(caught => { showHudNotice(caught instanceof Error && caught.message ? caught.message : '高速档位切换失败'); })
            .finally(() => { if (mountedRef.current) setSpeedModePending(false); });
        }}
      >
        <Text style={styles.immersiveIntentConfirmText}>确认切换</Text>
      </Pressable>
    </View>
  </View> : !visibleConfirmation ? null : <View
    style={[styles.immersiveIntent, { top: Math.max(76, Math.round((immersiveCanvasHeight || height) * 0.24)), maxHeight: Math.max(180, (immersiveCanvasHeight || height) - 96) }]}>
    <Text style={styles.immersiveIntentTitle}>确认{controlOperationLabels[visibleConfirmation.action]}{visibleConfirmation.policyId ? `：${policyOptions.find(option => option.id === visibleConfirmation.policyId)?.label ?? ''}` : ''}</Text>
    <Text style={styles.immersiveIntentSubtitle}>{visibleConfirmation.action === 'disableMotor' ? '失能后设备可能失去支撑，请确认已固定。' : visibleConfirmation.action === 'setZero' ? '当前姿态将保存为零点。' : '请确认机器狗周围安全，急停可用。'}</Text>
    <View style={styles.immersiveIntentActions}>
      <Pressable accessibilityRole="button" onPress={revokeOperationIntent} style={({ pressed }) => [styles.immersiveIntentBtn, styles.immersiveIntentCancelBtn, pressed && styles.pressed]}>
        <Text style={styles.immersiveIntentCancelText}>取消</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="确认操作" testID="control-immersive-confirm" style={({ pressed }) => [styles.immersiveIntentBtn, styles.immersiveIntentConfirmBtn, pressed && styles.pressed]}
        onPress={() => runOperation(visibleConfirmation.action, visibleConfirmation.generation, visibleConfirmation.policyId, visibleConfirmation)}>
        <Text style={styles.immersiveIntentConfirmText}>确认操作</Text>
      </Pressable>
    </View>
  </View>;
  const renderMinimalAction = (action: ControlOperation, label = controlOperationLabels[action]) => {
    const readiness = action !== 'stop' && (visibleConfirmation || selectingPolicy || settingsMenuOpen || postureMenuOpen)
      ? { ready: false, blockedReason: '请先确认或取消当前操作。' }
      : getControlOperationReadiness({ action, readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null });
    const state = operationStateFor(action, readiness);
    const statusBusy = ['submitted', 'accepted', 'executing'].includes(state.status);
    const disabled = !readiness.ready || statusBusy;
    const detail = state.detail ?? readiness.blockedReason;
    const isStop = action === 'stop';
    const icon = action === 'stand' ? 'arrow-up-outline' : action === 'sit' ? 'arrow-down-outline' : action === 'stop' ? 'stop-circle-outline' : action === 'enableMotor' ? 'flash-outline' : action === 'disableMotor' ? 'flash-off-outline' : 'options-outline';
    const iconColor = isStop ? '#FFFFFF' : readiness.ready && !statusBusy ? hudHeaderInk : hudHeaderMuted;
    const selected = runtimeState?.controlLink === 'connected' && ((action === 'stand' && runtimeState.posture === 'standing') || (action === 'sit' && runtimeState.posture === 'sitting'));
    const stopSize = Math.max(32, Math.min(64, width * .045));
    const postureStyle = { width: Math.max(54, viewport.width * .095), minHeight: Math.max(44, immersiveCanvasHeight * .11) };
    return <View key={action} style={styles.immersiveActionItem}>
      <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityHint={detail} accessibilityState={{ disabled, busy: statusBusy, selected }} accessibilityValue={{ text: controlOperationStatusLabels[state.status] }} disabled={disabled} onPress={() => { if (isStop) setPostureMenuOpen(false); runOperation(action, renderGeneration); }} testID={`control-action-${action}`} style={({ pressed }) => [isStop ? styles.referenceStopTarget : styles.referencePostureButton, !isStop && postureStyle, !isStop && selected && styles.referencePostureSelected, pressed && styles.pressed]}>
        <View pointerEvents="none" testID={`control-action-circle-${action}`} style={isStop ? { backgroundColor: controlHudColors.red, width: stopSize, height: stopSize, borderRadius: stopSize / 2, alignItems: 'center', justifyContent: 'center' } : undefined}>
          {action === 'stand' || action === 'sit' ? <PostureGlyph posture={action} size={Math.max(20, Math.min(34, viewport.width * .026))} color={selected ? hudHeaderInk : iconColor} /> : <Ionicons color={iconColor} name={isStop ? 'stop' : icon} size={isStop ? stopSize * .44 : 23} />}
        </View>
        {!isStop ? <Text style={[styles.referencePostureLabel, { fontSize: Math.max(12, Math.min(22, viewport.width * .018)), lineHeight: Math.max(16, Math.min(28, viewport.width * .023)) }]}>{label}</Text> : null}
      </Pressable>
    </View>;
  };

  const renderMotorToggle = () => {
    const readiness = motorTarget ? getControlOperationReadiness({
      action: motorTarget, readiness: operationReadiness,
      callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null
    })
      : { ready: false, blockedReason: '电机状态未知，请先连接并读取设备状态。' };
    const statusBusy = (['enableMotor', 'disableMotor'] as const).some(action => {
      const status = operationStateFor(action, { ready: true }).status;
      return ['submitted', 'accepted', 'executing'].includes(status)
        && observedMotorState !== (action === 'enableMotor' ? 'enabled' : 'disabled');
    });
    const disabled = !motorTarget || !readiness.ready || statusBusy || Boolean(visibleConfirmation || selectingPolicy || settingsMenuOpen);
    const enabled = observedMotorState === 'enabled';
    const known = observedMotorState !== 'unknown';
    const stateLabel = enabled ? '已使能' : known ? '已失能' : '状态未知';
    const foreground = enabled ? appearance.actionInk : known ? hudHeaderInk : hudHeaderMuted;
    // The target belongs to this render/confirmation. ACKs never flip this state.
    return <View style={styles.immersiveActionItem}>
      <Pressable testID="control-motor-toggle" accessibilityRole="switch" aria-checked={known ? enabled : undefined} accessibilityLabel={motorTarget ? controlOperationLabels[motorTarget] : '电机状态未知'}
        accessibilityState={{ checked: known ? enabled : undefined, disabled, busy: statusBusy || operationInFlight === 'enableMotor' || operationInFlight === 'disableMotor' }}
        accessibilityValue={{ text: statusBusy ? '待确认' : stateLabel }} accessibilityHint={readiness.blockedReason}
        disabled={disabled} onPress={() => { if (motorTarget) runOperation(motorTarget, renderGeneration); }}
        style={({ pressed }) => [styles.immersiveActionButton, { opacity: known ? 1 : 0.65 }, pressed && styles.pressed]}>
        <View pointerEvents="none" testID="control-motor-toggle-circle" style={[styles.immersiveActionCircle, { backgroundColor: enabled ? appearance.action : 'transparent' }]}>
          <Ionicons name="power" size={26} color={foreground} />
        </View>
      </Pressable>
    </View>;
  };

  const renderImmersiveTelemetry = () => <View style={styles.referenceTelemetry} testID="control-telemetry">
    <View testID="control-telemetry-signal" accessible accessibilityLabel={(runtimeState?.signal?.source === 'controller' ? 'Wi-Fi ' : '信号 ') + immersiveSignalLabel} style={styles.referenceSignal}>
      <Ionicons name="wifi" size={Math.max(22, Math.min(36, viewport.width * .025))} color={signalKnown ? hudHeaderInk : hudHeaderMuted} />
      {!signalKnown ? <Text style={[styles.referenceUnknown, { color: hudHeaderMuted }]}>—</Text> : null}
      {signalKnown ? <Text style={[styles.referenceSignalText, { color: hudHeaderInk }]}>{immersiveSignalLabel}</Text> : null}
    </View>
    <View style={styles.referenceBattery} testID="control-telemetry-battery" accessible accessibilityLabel={immersiveBatteryMetricLabel + ' ' + immersiveBatteryLabel}>
      <Ionicons name={immersiveBatteryKnown ? 'battery-full-outline' : 'battery-dead-outline'} size={Math.max(24, Math.min(40, viewport.width * .027))} color={immersiveBatteryKnown ? controlHudColors.green : hudHeaderMuted} />
      <Text style={[styles.referenceBatteryText, { color: hudHeaderInk, fontSize: Math.max(14, Math.min(28, viewport.width * .018)) }]}>{immersiveBatteryLabel}</Text>
    </View>
  </View>;

  const renderImmersiveAuthority = () => {
    const hasAuthority = allowInteractionPreview || Boolean(controlSession) || runtimeState?.controlOwner !== undefined;
    if (!hasAuthority) return null;
    const local = controlSession?.leaseActive || runtimeState?.controlOwner === 'this-device';
    const unlocked = allowInteractionPreview || runtimeState?.deviceIdentity === 'verified';
    return <View style={styles.referenceAuthority} testID="control-authority">
      <View style={[styles.referenceAuthorityChip, local && styles.referenceAuthorityChipActive]}>
        {glass.backdrop()}
        <Ionicons name="person" size={17} color={local ? '#80C4FF' : hudHeaderMuted} />
        <Text style={[styles.referenceAuthorityText, { color: local ? '#80C4FF' : hudHeaderMuted }]}>控制权：{local ? '本机' : '未持有'}</Text>
      </View>
      <View style={styles.referenceAuthorityChip}>
        {glass.backdrop()}
        <Ionicons name={unlocked ? 'lock-open-outline' : 'lock-closed-outline'} size={17} color={hudHeaderMuted} />
        <Text style={[styles.referenceAuthorityText, { color: hudHeaderMuted }]}>{unlocked ? '设备已解锁' : '设备状态未知'}</Text>
      </View>
    </View>;
  };

  const renderControlHeader = (onClose = handleBack) => <View testID="control-top-bar" style={[styles.referenceTopBar, { top: Math.max(18, height * .02), height: Math.max(40, Math.min(60, height * .08)) }]}>
    <Pressable testID="control-back" accessibilityRole="button" accessibilityLabel="返回" onPress={onClose} style={styles.referenceBrand}>
      <DosoWordmark width={Math.max(64, Math.min(144, width * (settingsMenuOpen ? .085 : .11)))} color={hudHeaderInk} />
    </Pressable>
    <Pressable testID="control-open-connection" accessibilityRole="button" accessibilityLabel={'设备连接' + immersiveConnectionLabel + '，' + controlOwnerLabel}
      disabled={joystickSettingsOpen || inputSettingsOpen || !(onOpenConnection || onOpenConnectionDiagnostics)} onPress={() => openView(onOpenConnection || onOpenConnectionDiagnostics)}
      style={[styles.referenceIdentity, { minHeight: Math.max(28, Math.min(53, width * .04)), paddingHorizontal: Math.max(15, width * .018) }, settingsMenuOpen && { backgroundColor: controlSettingsColors.glass, borderColor: controlSettingsColors.line }]}>
      {glass.backdrop()}
      <Text numberOfLines={1} testID="control-device-title-text" style={[styles.referenceName, { color: hudHeaderInk, fontSize: Math.max(12, Math.min(27, width * .018)) }]}>{immersiveRobotName}</Text>
      <View style={[styles.immersiveConnectionDot, { width: Math.max(5, width * .007), height: Math.max(5, width * .007), backgroundColor: immersiveConnectionReady ? controlHudColors.green : hudHeaderMuted }]} />
      <Text numberOfLines={1} testID="control-owner" accessibilityLabel={controlOwnerLabel} style={[styles.referenceStatus, { fontSize: Math.max(11, Math.min(25, width * .016)), color: immersiveConnectionReady ? settingsMenuOpen ? controlSettingsColors.green : '#6BD8A4' : hudHeaderMuted }]}>{immersiveConnectionReady ? '已连接' : immersiveConnectionLabel}</Text>
      <Ionicons name="chevron-forward" size={Math.max(14, Math.min(24, width * .015))} color={hudHeaderMuted} />
    </Pressable>
    <View style={styles.referenceRightStatus} testID="control-header-actions">
      {showTelemetry ? renderImmersiveTelemetry() : null}
      <View testID="control-stop-dock">{renderMinimalAction('stop', '软件急停')}</View>
    </View>
  </View>;

  const cameraHud = layout.useColumns && Boolean(videoProbeHost || videoPresentation && videoPresentation.phase !== 'unconfigured' || recovery || landscapeDocksExpanded !== undefined);
  const recoveryOperator = useRecoveryOperator(recovery, runtimeState, visibleConfirmation || selectingPolicy ? '请先确认或取消当前操作。' : null);
  const closeRecovery = () => { handleCancel(); setGestureLibraryOpen(false); };
  useEffect(() => {
    if (!dismissWorkspaceOverlayRef) return;
    dismissWorkspaceOverlayRef.current = () => {
      if (faultPanelOpen) setFaultPanelOpen(false);
      else if (jointParamsOpen) setJointParamsOpen(false);
      else if (jointTempOpen) setJointTempOpen(false);
      else if (speedLimitExpanded) setSpeedLimitExpanded(false);
      else if (leftCategory !== 'policy') setLeftCategory('policy');
      else if (gestureLibraryOpen) closeRecovery();
      else if (joystickSettingsOpen) closeJoystickSettings();
      else if (inputSettingsOpen) closeInputSettings();
      else if (recoveryOperator.confirming) recoveryOperator.dismiss();
      else if (settingsMenuRef.current || postureMenuOpen || visibleConfirmation || selectingPolicy) handleCancel();
      else return false;
      return true;
    };
    return () => { dismissWorkspaceOverlayRef.current = null; };
  });
  const terrainSwitchBlock = controlTerrainSwitchBlock(runtimeState);
  const customMotionBlock = controlTerrainMotionBlock(runtimeState);
  const hudPolicies = customPolicyCatalog
    ? policyOptions.map(option => {
      const disabled = !modeReadiness.ready || customMotionBlock !== null;
      return {
        id: option.id,
        label: option.label.replace(/模式$/, ''),
        disabled,
        selected: runtimeState?.currentPolicy?.id === option.id,
        hint: disabled ? (!modeReadiness.ready ? modeReadiness.blockedReason : customMotionBlock ?? undefined) : undefined,
      };
    })
    : CONTROL_TERRAIN_MODE_OPTIONS.map(option => {
      const available = terrainModeOptions.some(candidate => candidate.id === option.id);
      const profileId = getControlTerrainPolicies(runtimeState).find(mode => mode.id === option.id)?.profileId;
      const blocked = terrainSwitchBlock !== null || !available || !terrainModeCatalogReady || !profileId || !modeReadiness.ready;
      const shortLabel = option.id === 'flat' ? '平地' : option.label.replace(/模式$/, '');
      return {
        id: option.id,
        label: shortLabel,
        disabled: blocked,
        selected: terrainModeCurrent === option.id,
        hint: blocked ? terrainSwitchBlock ?? modeReadiness.blockedReason ?? terrainModeBlockedReason : undefined,
      };
    });
  const handleSelectHudPolicy = (id: string) => {
    if (customPolicyCatalog) {
      if (customMotionBlock || !modeReadiness.ready || runtimeState?.currentPolicy?.id === id) return;
      runOperation('switchPolicy', renderGeneration, id);
      return;
    }
    if (id === terrainModeCurrent || terrainSwitchBlock) return;
    const profileId = getControlTerrainPolicies(runtimeState).find(mode => mode.id === id)?.profileId;
    if (profileId) runOperation('switchPolicy', renderGeneration, profileId);
  };
  const hudMotorReadiness = motorTarget
    ? getControlOperationReadiness({
      action: motorTarget,
      readiness: operationReadiness,
      callbacks: operationCallbacks,
      runtimeState,
      foreground: appActive,
      leaving,
      inFlight: operationInFlight !== null,
    })
    : { ready: false, blockedReason: '电机状态未知，请先连接并读取设备状态。' };
  const hudMotorBusy = (['enableMotor', 'disableMotor'] as const).some(action => {
    const status = operationStateFor(action, { ready: true }).status;
    return ['submitted', 'accepted', 'executing'].includes(status)
      && observedMotorState !== (action === 'enableMotor' ? 'enabled' : 'disabled');
  });
  const hudMotorDisabled = !motorTarget || !hudMotorReadiness.ready || hudMotorBusy || Boolean(visibleConfirmation || selectingPolicy || settingsMenuOpen);
  const maintenanceReadiness = (action: 'setZero' | 'clearMotorFault' | 'playGesture') => visibleConfirmation || selectingPolicy
    ? { ready: false, blockedReason: '请先确认或取消当前操作。' }
    : getControlOperationReadiness({ action, readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null });
  const gestureReadiness = maintenanceReadiness('playGesture');
  const projectedGestureSelection = useMemo(
    () => projectHudGestures(displayedGestures, gestureCategory, selectedGestureName),
    [displayedGestures, gestureCategory, selectedGestureName],
  );
  const resolvedSelectedGestureName = projectedGestureSelection.selectedItem?.name ?? null;
  const selectedGestureSynced = Boolean(
    gestureLinkReady
    && gestureCatalogSynced
    && resolvedSelectedGestureName
    && syncedGestureNames.has(resolvedSelectedGestureName),
  );
  const effectiveGestureReady = Boolean(
    gestureLinkReady
    && runtimeState?.controlLink === 'connected'
    && runtimeState.posture === 'standing'
    && runtimeState.motorState === 'enabled'
    && selectedGestureSynced
    && gestureReadiness.ready,
  );
  const effectiveGestureHint = runtimeState?.controlLink !== 'connected'
    ? '请先连接机器狗（当前可预览全部 35 个动作）'
    : !gestureCatalogSynced
      ? '当前固件动作服务尚未启用（仅可预览动作库）'
      : resolvedSelectedGestureName && !syncedGestureNames.has(resolvedSelectedGestureName)
        ? '当前固件未收录该动作（仅可预览动图）'
        : gestureReadiness.blockedReason;
  const handleLeftCategoryChange = (next: HudLeftCategory) => {
    setLeftCategory(next);
    if (next !== 'policy') {
      setSpeedLimitExpanded(false);
      setJointParamsOpen(false);
      setJointTempOpen(false);
      setFaultPanelOpen(false);
    }
  };
  const zeroReadiness = maintenanceReadiness('setZero');
  const clearFaultReadiness = maintenanceReadiness('clearMotorFault');
  const runFromSettings = (action: 'setZero' | 'clearMotorFault' | 'playGesture' | 'switchPolicy', argument?: string) => {
    closeSettingsMenu();
    runOperation(action, renderGeneration, argument);
  };
  const landscapePostures = (['stand', 'sit', 'prone', 'recover'] as const).map(id => {
    const label = id === 'stand' ? '站立' : id === 'sit' ? '坐下' : id === 'prone' ? '趴下' : '恢复';
    const action = id === 'stand' ? 'stand' as const : id === 'sit' ? 'sit' as const : null;
    if (id === 'recover') {
      if (!recovery) return { id, label, disabled: true, selected: false, hint: '恢复指令尚未接通。', onPress: () => { } };
      const followUp = recoveryOperator.view.actions.exit.enabled ? 'exit' as const : recoveryOperator.view.actions.cancel.enabled ? 'cancel' as const : null;
      if (followUp) return {
        id, label: recoveryOperator.view.actions[followUp].label, disabled: recoveryOperator.pending, selected: false,
        hint: recoveryOperator.view.phaseLabel, onPress: () => recoveryOperator.followUp(followUp),
      };
      return {
        id, label: recoveryOperator.view.actions.begin.label, disabled: !recoveryOperator.beginEnabled, selected: false,
        hint: recoveryOperator.displayReason ?? recoveryOperator.view.actions.begin.reason ?? undefined,
        onPress: recoveryOperator.requestBegin,
      };
    }
    if (!action) {
      return { id, label, disabled: true, selected: false, hint: '趴下指令尚未接通。', onPress: () => { } };
    }
    const readiness = visibleConfirmation || selectingPolicy
      ? { ready: false, blockedReason: '请先确认或取消当前操作。' }
      : getControlOperationReadiness({ action, readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null });
    const state = operationStateFor(action, readiness);
    const statusBusy = ['submitted', 'accepted', 'executing'].includes(state.status);
    return {
      id, label,
      disabled: !readiness.ready || statusBusy,
      selected: id === 'stand' ? runtimeState?.posture === 'standing' : runtimeState?.posture === 'sitting',
      hint: state.detail ?? readiness.blockedReason,
      onPress: () => runOperation(action, renderGeneration),
    };
  });
  const stopReadiness = getControlOperationReadiness({ action: 'stop', readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: false });
  const stopState = operationStateFor('stop', stopReadiness);
  const recoveryPanel = recovery ? RobotRecoveryControls({
    view: recoveryOperator.view,
    displayReason: recoveryOperator.displayReason,
    confirming: recoveryOperator.confirming,
    pending: recoveryOperator.pending,
    error: recoveryOperator.error,
    showActions: !cameraHud,
    variant: cameraHud ? 'landscape' : 'portrait',
    ink: cameraHud ? '#FFFFFF' : appearance.ink,
    muted: cameraHud ? 'rgba(255,255,255,0.78)' : appearance.secondary,
    surface: cameraHud ? 'rgba(18, 22, 30, 0.88)' : appearance.surface,
    line: cameraHud ? 'rgba(245,248,255,0.22)' : 'transparent',
    onRequestBegin: recoveryOperator.requestBegin,
    onConfirm: recoveryOperator.confirm,
    onDismiss: recoveryOperator.dismiss,
    onFollowUp: recoveryOperator.followUp,
  }) : null;
  const toggleDualCamera = () => {
    setDualCameraEnabled(prev => {
      const next = !prev;
      if (next && effectiveRearVideo?.phase !== 'receiving' && effectiveRearVideo?.phase !== 'connecting') {
        showHudNotice('已开启双广角视窗；后广角流待机器狗推流接入');
      }
      return next;
    });
  };
  const swapCamera = () => setPrimaryCamera(prev => prev === 'front' ? 'rear' : 'front');
  const toggleHeadlight = () => {
    const next: HudHeadlightMode = headlightMode === 'off' ? 'front' : headlightMode === 'front' ? 'both' : 'off';
    setHeadlightMode(next);
    showHudNotice(next === 'off' ? '已关闭本地照明状态预览' : '当前机器狗暂未接入照明控制协议（仅本地状态预览）');
  };
  const showLandscapeRecovery = Boolean(cameraHud && recovery && (recoveryOperator.confirming || recoveryOperator.error || recoveryOperator.view.sessionActive));
  const renderCameraHud = () => <View style={[styles.immersiveSurface, { backgroundColor: 'transparent', height: immersiveCanvasHeight }]} testID="control-immersive-surface">
    {controlLandscapeHud({
      robotName: immersiveRobotName,
      connectionLabel: immersiveConnectionLabel,
      connectionState: immersiveConnectionReady ? 'connected' : directConnection?.fresh ? 'readonly' : 'disconnected',
      onBack: handleBack,
      onOpenConnection: onOpenConnection || onOpenConnectionDiagnostics ? () => openView(onOpenConnection || onOpenConnectionDiagnostics) : undefined,
      onOpenJointStatus: onOpenJointStatus ? () => openView(onOpenJointStatus) : undefined,
      onOpenWorkspaceSettings: onOpenWorkspaceSettings ? () => openView(onOpenWorkspaceSettings) : undefined,
      showLocalControl: runtimeState?.controlAuthority === 'held',
      showUnlocked: safetyLock === false,
      runtimeState,
      sessionError: controlSession?.error,
      recoveryError: recoveryOperator.error,
      policies: hudPolicies,
      onSelectPolicy: handleSelectHudPolicy,
      motorEnabled: observedMotorState === 'enabled' ? true : observedMotorState === 'disabled' ? false : null,
      motorBusy: hudMotorBusy,
      motorDisabled: hudMotorDisabled,
      motorHint: hudMotorReadiness.blockedReason,
      onToggleMotor: () => { if (motorTarget && !hudMotorDisabled) runOperation(motorTarget, renderGeneration); },
      postures: landscapePostures,
      leftCategory,
      onLeftCategoryChange: handleLeftCategoryChange,
      selectedBasicAction,
      gestures: displayedGestures,
      gestureCategory,
      onGestureCategoryChange: setGestureCategory,
      selectedGestureName: resolvedSelectedGestureName,
      onSelectGesture: setSelectedGestureName,
      gestureGifPreview,
      onToggleGestureGifPreview: () => setGestureGifPreview(prev => !prev),
      gestureDisabled: !effectiveGestureReady,
      gestureHint: effectiveGestureHint,
      onPlayGesture: name => {
        if (effectiveGestureReady && syncedGestureNames.has(name)) {
          runOperation('playGesture', renderGeneration, name);
        }
      },
      onSelectBasicAction: (id, supported, label) => {
        if (supported) { setSelectedBasicAction(id); return; }
        showHudNotice(`${label} 动作暂未接入机器狗协议`);
      },
      speedLimitPercent,
      speedLimitExpanded,
      onToggleSpeedLimitExpanded: () => setSpeedLimitExpanded(value => !value),
      onChangeSpeedLimit: next => setSpeedLimitPercent(clampSpeedLimitPercent(next)),
      speedMode,
      onSelectSpeedMode: onChangeSpeedMode ? mode => {
        if (speedModePending || !appActive || leaving) return;
        if (mode === 'high') {
          handleCancel();
          setSpeedLimitExpanded(false);
          setConfirmingHighSpeed(true);
          return;
        }
        setSpeedModePending(true);
        void onChangeSpeedMode('normal')
          .then(() => { showHudNotice('已恢复标准速度档位（1.0 m/s）'); })
          .catch(caught => { showHudNotice(caught instanceof Error && caught.message ? caught.message : '速度档位切换失败'); })
          .finally(() => { if (mountedRef.current) setSpeedModePending(false); });
      } : undefined,
      onReconnect,
      hasDedicatedRearCamera,
      batteryPercent: resolvedBatteryPercent,
      voltageV: runtimeState?.battery?.voltageV ?? null,
      remainingRangeKm: runtimeState?.remainingRangeKm ?? null,
      onStop: () => { closeSettingsMenu(); setFaultPanelOpen(false); setSpeedLimitExpanded(false); runOperation('stop', renderGeneration); },
      stopDisabled: !stopReadiness.ready || ['submitted', 'accepted', 'executing'].includes(stopState.status),
      stopHint: stopState.detail ?? stopReadiness.blockedReason,
      docksExpanded,
      onToggleDocks: () => { setSpeedLimitExpanded(false); setDocksExpanded(value => !value); },
      onOpenSettings: () => {
        if (settingsMenuOpen) {
          handleCancel();
          return;
        }
        setFaultPanelOpen(false);
        setSpeedLimitExpanded(false);
        handleCancel();
        settingsMenuRef.current = true;
        setSettingsCategory('操控');
        setSettingsMenuOpen(true);
      },
      settingsOpen: settingsMenuOpen,
      onCloseSettings: handleCancel,
      settingsLabel: prepareWorkspaceLeaveRef ? '操控设置' : '设置',
      settingsMenu: settingsMenuOpen ? renderControlSettings({
        width: effectiveViewportWidth || width,
        height: immersiveCanvasHeight || height,
        category: settingsCategory,
        onCategory: setSettingsCategory,
        snapshot: settingsSnapshot,
        overlay: showTelemetry,
        onOverlay: () => setShowTelemetry(value => !value),
        onClose: handleCancel,
        onLayout: openJoystickSettings,
        onInput: g20Controller ? openInputSettings : undefined,
        onConnection: onOpenConnection || onOpenConnectionDiagnostics ? () => openView(onOpenConnection || onOpenConnectionDiagnostics) : undefined,
        onDiagnostics: onOpenJointStatus || onOpenConnectionDiagnostics ? () => openView(onOpenJointStatus || onOpenConnectionDiagnostics) : undefined,
        onPostures: () => { handleCancel(); handleLeftCategoryChange('posture'); },
        onActions: hasGestureCatalogSupport ? () => { handleCancel(); handleLeftCategoryChange('action'); } : undefined,
        onPolicy: () => { handleCancel(); handleLeftCategoryChange('policy'); },
        ownerLabel: controlOwnerLabel,
        lease: controlSession ? renderControlLease(true) : null,
        robotName,
        connected: immersiveConnectionReady,
        endpointLabel: directConnection?.endpointLabel,
        runtimeState,
        inputSource: selectedInputSource,
        videoLabel: allowInteractionPreview ? '静态设计画面' : ({ unconfigured: '未配置', connecting: '连接中', receiving: '接收中', stalled: '已中断', error: '连接失败' } as const)[videoPresentation?.phase ?? 'unconfigured'],
        inHudOverlay: true,
        docksExpanded,
        onToggleDocks: () => setDocksExpanded(value => !value),
        speedLimitPercent,
        onChangeSpeedLimit: next => setSpeedLimitPercent(clampSpeedLimitPercent(next)),
        speedMode,
        onSelectSpeedMode: onChangeSpeedMode ? mode => {
          closeSettingsMenu();
          if (speedModePending || !appActive || leaving) return;
          if (mode === 'high') {
            handleCancel();
            setConfirmingHighSpeed(true);
            return;
          }
          setSpeedModePending(true);
          void onChangeSpeedMode('normal')
            .then(() => { showHudNotice('已恢复标准速度档位（1.0 m/s）'); })
            .catch(caught => { showHudNotice(caught instanceof Error && caught.message ? caught.message : '速度档位切换失败'); })
            .finally(() => { if (mountedRef.current) setSpeedModePending(false); });
        } : undefined,
        physicalInputReady: physicalAvailable,
        onSelectInputSource: setInputSource,
        primaryCamera,
        onSwapCamera: swapCamera,
        dualCameraEnabled,
        onToggleDualCamera: toggleDualCamera,
        headlightMode,
        onToggleHeadlight: toggleHeadlight,
        recordingActive: mediaCapture.recordingActive,
        recordingDurationLabel: mediaCapture.recordingDurationLabel,
        mediaStatusLabel: mediaCapture.mediaStatusLabel,
        mediaStorageLabel: mediaCapture.storageTargetLabel,
        mediaLastSavedLabel: mediaCapture.lastSavedLabel,
        onToggleRecord: () => { void mediaCapture.toggleRecording(); },
        onCapturePhoto: () => { void mediaCapture.capturePhoto(); },
        onOpenWorkspaceSettings: onOpenWorkspaceSettings ? () => openView(onOpenWorkspaceSettings) : undefined,
        webStageMode,
        onToggleWebStageMode,
        policies: hudPolicies,
        onSelectPolicy: id => { closeSettingsMenu(); handleSelectHudPolicy(id); },
        gestures: displayedGestures,
        gestureCategory,
        onGestureCategoryChange: setGestureCategory,
        selectedGestureName: resolvedSelectedGestureName,
        onSelectGesture: setSelectedGestureName,
        gestureGifPreview,
        onToggleGestureGifPreview: () => setGestureGifPreview(prev => !prev),
        gestureReady: effectiveGestureReady,
        gestureHint: effectiveGestureHint,
        onPlayGesture: name => {
          if (effectiveGestureReady && syncedGestureNames.has(name)) {
            runFromSettings('playGesture', name);
          }
        },
        zeroReady: zeroReadiness.ready,
        zeroHint: zeroReadiness.blockedReason,
        onSetZero: () => runFromSettings('setZero'),
        clearFaultReady: clearFaultReadiness.ready,
        onClearMotorFault: () => runFromSettings('clearMotorFault'),
        onOpenHudJointParams: () => { closeSettingsMenu(); setLeftCategory('policy'); setJointParamsOpen(true); },
        onOpenHudJointTemp: () => { closeSettingsMenu(); setLeftCategory('policy'); setJointTempOpen(true); },
      }) : null,
      headlightMode,
      onToggleHeadlight: toggleHeadlight,
      dualCameraEnabled,
      onToggleDualCamera: toggleDualCamera,
      primaryCamera,
      onSwapCamera: swapCamera,
      recordingActive: mediaCapture.recordingActive,
      recordingDurationLabel: mediaCapture.recordingDurationLabel,
      onToggleRecord: () => { void mediaCapture.toggleRecording(); },
      onCapturePhoto: () => { void mediaCapture.capturePhoto(); },
      depthActive: depthModeActive,
      onToggleDepth: () => {
        setDepthModeActive(prev => {
          const next = !prev;
          if (next && !dualCameraEnabled) setDualCameraEnabled(true);
          return next;
        });
      },
      depthPreview: depthModeActive ? (
        <DepthSnapshotView
          host={videoProbeHost ?? (typeof __DEV__ !== 'undefined' && __DEV__ && typeof window !== 'undefined' && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1') ? '127.0.0.1' : null)}
          active={appActive && !leaving}
          fillContainer
        />
      ) : null,
      forwardDirection,
      onReverseDirection: () => showHudNotice('机器狗端运动换向协议暂未接入，当前运动正方向保持前方'),
      onChargePress: () => showHudNotice('自主充电需导航任务协议支持，当前暂未接入'),
      jointTempOpen,
      onToggleJointTemp: () => setJointTempOpen(prev => {
        const next = !prev;
        if (next) setLeftCategory('policy');
        return next;
      }),
      tempModuleKind,
      onTempModuleKindChange: setTempModuleKind,
      jointParamsOpen,
      onToggleJointParams: () => setJointParamsOpen(prev => {
        const next = !prev;
        if (next) setLeftCategory('policy');
        return next;
      }),
      selectedLegId,
      onSelectLegId: setSelectedLegId,
      faultPanelOpen,
      onToggleFaultPanel: () => setFaultPanelOpen(prev => {
        const next = !prev;
        if (next) setLeftCategory('policy');
        return next;
      }),
      joints: runtimeState?.joints,
      hudNotice,
      joystick: configuredJoystickLayout.usable ? <ControlJoystickPair
        key={offlinePreview ? 'offline-preview' : 'control'}
        disabled={joystickDisabled}
        floating
        showVisuals={showLandscapeJoystickVisuals}
        variant="glass"
        onCancel={offlinePreview ? cancelPreview : handleCancel}
        gap={immersiveJoystickGap}
        left={{ axis: 'xy', label: '移动', onActiveChange: offlinePreview ? active => previewTouchActive('drive', active) : active => touchActive('drive', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleDrive : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleDrive : undefined, testID: 'control-drive-stick' }}
        resetKey={resetKey}
        right={{ axis: 'x', label: '转向', onActiveChange: offlinePreview ? active => previewTouchActive('turn', active) : active => touchActive('turn', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleTurn : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleTurn : undefined, testID: 'control-turn-stick' }}
        showLabels={false}
        size={immersiveJoystickSize}
        layout={configuredJoystickLayout}
        touchAreaHeight={configuredHeight}
        touchAreaWidth={configuredWidth}
      /> : null,
      stickFrameStyle: { top: hudStickTop, bottom: hudStickBottom, left: 16, right: 16 },
      joystickSize: configuredJoystickLayout.usable ? configuredJoystickLayout.left.size : immersiveJoystickSize,
      stageWidth: effectiveViewportWidth || width,
      stageHeight: immersiveCanvasHeight || height,
      safeInsets: landscapeSafeInsets,
      previewSafeAreaGuides,
      onStickFrameLayout: handleStickArea,
      video: videoPresentation || videoFrame ? <ControlVideoSurface presentation={videoPresentation} surface={videoFrame} active={appActive && !leaving} onInterrupted={handleCancel}
        backgroundColor="transparent" statusColor="#CED3CF" /> : null,
      videoReceiving: videoPresentation?.phase === 'receiving',
      rearVideo: effectiveRearVideo || effectiveRearSurface ? <ControlVideoSurface presentation={effectiveRearVideo} surface={effectiveRearSurface} active={appActive && !leaving} onInterrupted={() => { }}
        backgroundColor="transparent" statusColor="#CED3CF" /> : null,
      rearVideoReceiving: effectiveRearVideo?.phase === 'receiving',
      feedback: operationFeedback,
      confirmation: renderImmersiveIntent(),
      recovery: showLandscapeRecovery ? recoveryPanel : undefined,
    })}
  </View>;

  const renderImmersiveSurface = () => <View style={[styles.immersiveSurface, { backgroundColor: glass.canvas, height: immersiveCanvasHeight }]} testID="control-immersive-surface">
    <ControlGlassTarget ref={glass.target} pointerEvents="none" style={styles.immersiveMedia} testID="control-media-stage">
      <View style={[styles.immersiveVideoPane, { backgroundColor: glass.canvas }]} testID="control-video-pane">
        <ControlVideoSurface presentation={video} surface={videoSurface} active={(allowInteractionPreview || appActive) && !leaving} onInterrupted={handleCancel} statusTop={mediaStatusTop} statusColor={mediaStatusColor} />
      </View>
    </ControlGlassTarget>
    <LinearGradient pointerEvents="none" colors={['rgba(5,12,20,0.38)', 'transparent', 'rgba(5,12,20,0.52)']} locations={[0, .4, 1]} style={StyleSheet.absoluteFill} />
    {settingsMenuOpen ? <View pointerEvents="none" testID="control-settings-background" style={[StyleSheet.absoluteFill, { backgroundColor: controlSettingsColors.canvas }]} /> : null}
    {renderControlHeader()}
    {postureMenuOpen ? <>
      <Pressable testID="control-posture-dismiss" accessibilityRole="button" accessibilityLabel="关闭姿态菜单" onPress={handleCancel} style={styles.modeMenuDismiss} />
      <ControlPanelMotion testID="control-posture-menu" style={[styles.modeMenu, { top: 24 + hudHeaderHeight, backgroundColor: hudSurface, borderColor: hudBorder }]}>
        {glass.backdrop()}
        {(['stand', 'sit'] as const).map(action => {
          const readiness = getControlOperationReadiness({
            action, readiness: operationReadiness, callbacks: operationCallbacks,
            runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null
          });
          const selected = runtimeState?.controlLink === 'connected' && runtimeState.posture === (action === 'stand' ? 'standing' : 'sitting');
          const disabled = !readiness.ready || selected;
          return <Pressable key={action} testID={`control-posture-${action}`} accessibilityRole="button"
            accessibilityLabel={controlOperationLabels[action]} accessibilityHint={readiness.blockedReason}
            accessibilityState={{ disabled, selected }} disabled={disabled}
            onPress={() => { setPostureMenuOpen(false); runOperation(action, renderGeneration); }}
            style={[styles.modeMenuOption, { backgroundColor: selected ? appearance.action : 'transparent' }]}>
            <Text style={[styles.label, { color: selected ? appearance.actionInk : disabled ? hudHeaderMuted : hudHeaderInk }]}>{controlOperationLabels[action]}</Text>
          </Pressable>;
        })}
        <Pressable testID="control-posture-recovery" accessibilityRole="button" accessibilityLabel="摔倒恢复"
          accessibilityHint="当前版本暂不支持恢复操作" accessibilityState={{ disabled: true }} disabled style={styles.modeMenuOption}>
          <Text style={[styles.label, { color: hudHeaderMuted }]}>摔倒恢复</Text>
        </Pressable>
        {renderMotorToggle()}
      </ControlPanelMotion>
    </> : null}
    {settingsMenuOpen ? renderControlSettings({
      width: viewport.width || width, height: immersiveCanvasHeight || height, category: settingsCategory,
      onCategory: setSettingsCategory, snapshot: settingsSnapshot, overlay: showTelemetry,
      onOverlay: () => setShowTelemetry(value => !value), onClose: handleCancel,
      onLayout: openJoystickSettings, onInput: g20Controller ? openInputSettings : undefined,
      onConnection: onOpenConnection || onOpenConnectionDiagnostics ? () => openView(onOpenConnection || onOpenConnectionDiagnostics) : undefined,
      onDiagnostics: onOpenJointStatus || onOpenConnectionDiagnostics ? () => openView(onOpenJointStatus || onOpenConnectionDiagnostics) : undefined,
      onPostures: () => { handleCancel(); if (observingPhysical) g20Gate.current.setEnabled(true, g20Controller?.captureFence); setPostureMenuOpen(true); },
      onPolicy: () => { handleCancel(); policySelectionRef.current = operationGeneration.current; setPolicySelection(operationGeneration.current); },
      ownerLabel: controlOwnerLabel,
      lease: controlSession ? renderControlLease(true) : null,
      robotName, connected: immersiveConnectionReady, endpointLabel: directConnection?.endpointLabel,
      runtimeState, inputSource: selectedInputSource,
      videoLabel: allowInteractionPreview ? '静态设计画面' : ({ unconfigured: '未配置', connecting: '连接中', receiving: '接收中', stalled: '已中断', error: '连接失败' } as const)[video?.phase ?? 'unconfigured'],
      recordingActive: mediaCapture.recordingActive,
      recordingDurationLabel: mediaCapture.recordingDurationLabel,
      mediaStatusLabel: mediaCapture.mediaStatusLabel,
      mediaStorageLabel: mediaCapture.storageTargetLabel,
      mediaLastSavedLabel: mediaCapture.lastSavedLabel,
      onToggleRecord: () => { void mediaCapture.toggleRecording(); },
      onCapturePhoto: () => { void mediaCapture.capturePhoto(); },
    }) : null}
    {renderImmersiveAuthority()}
    {showTelemetry && !settingsMenuOpen ? <View pointerEvents="none" testID="control-telemetry-center" style={styles.referenceCenterTelemetry}>{renderImmersiveTelemetry()}</View> : null}
    <View onLayout={handleStickArea} pointerEvents={settingsMenuOpen ? 'none' : 'auto'} style={[styles.immersiveSticks, { top: immersiveTopInset, bottom: stickBottomInset, opacity: settingsMenuOpen ? 0 : 1, transform: [{ translateY: immersiveCanvasHeight * .022 }] }]} testID="control-immersive-sticks">
      {configuredJoystickLayout.usable ? <ControlJoystickPair
        key={offlinePreview ? 'offline-preview' : 'control'}
        disabled={joystickDisabled}
        floating
        showVisuals={showLandscapeJoystickVisuals}
        variant="glass"
        backdrop={glass.backdrop()}
        onCancel={offlinePreview ? cancelPreview : handleCancel}
        gap={immersiveJoystickGap}
        left={{ axis: 'xy', label: '移动', onActiveChange: offlinePreview ? active => previewTouchActive('drive', active) : active => touchActive('drive', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleDrive : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleDrive : undefined, testID: 'control-drive-stick' }}
        resetKey={resetKey}
        right={{ axis: 'x', label: '转向', onActiveChange: offlinePreview ? active => previewTouchActive('turn', active) : active => touchActive('turn', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleTurn : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleTurn : undefined, testID: 'control-turn-stick' }}
        showLabels={false}
        size={immersiveJoystickSize}
        layout={configuredJoystickLayout}
        touchAreaHeight={configuredHeight}
        touchAreaWidth={configuredWidth}
      /> : null}
    </View>
    {!settingsMenuOpen ? <>
      <View style={styles.referenceActionDock} testID="control-action-dock">
        {glass.backdrop()}
        {renderMinimalAction('stand')}
        {renderMinimalAction('sit')}
        {(['prone', 'recovery'] as const).map(action => <Pressable key={action} disabled accessibilityRole="button" accessibilityLabel={action === 'prone' ? '趴下' : '恢复'} accessibilityState={{ disabled: true }} accessibilityHint="当前设备未提供此动作" testID={'control-action-' + action} style={[styles.referencePostureButton, { width: Math.max(54, viewport.width * .095), minHeight: Math.max(44, immersiveCanvasHeight * .11) }]}>
          {action === 'prone' ? <PostureGlyph posture="prone" color={hudHeaderMuted} /> : <Ionicons name="reload-outline" size={23} color={hudHeaderMuted} />}
          <Text style={[styles.referencePostureLabel, { fontSize: Math.max(12, Math.min(22, viewport.width * .018)), lineHeight: Math.max(16, Math.min(28, viewport.width * .023)) }]}>{action === 'prone' ? '趴下' : '恢复'}</Text>
        </Pressable>)}
      </View>
      {showPlanning ? <Pressable testID="control-open-map" accessibilityRole="button" accessibilityLabel="地图" disabled={!onOpenMap} onPress={() => openView(onOpenMap)} style={[styles.referenceMap, styles.referenceCornerAction]}><Ionicons name="map-outline" size={24} color={hudHeaderInk} /><Text style={[styles.referenceCornerLabel, { color: hudHeaderInk }]}>地图</Text></Pressable> : null}
      <Pressable testID="control-open-more" accessibilityLabel="更多设置" accessibilityRole="button" accessibilityState={{ expanded: settingsMenuOpen }} onPress={() => {
        physicalContext.current.allowed = false; handleCancel(); if (observingPhysical) g20Gate.current.setEnabled(true, g20Controller?.captureFence);
        settingsMenuRef.current = true; setSettingsCategory('操控'); setSettingsMenuOpen(true);
      }} style={[styles.referenceSettings, styles.referenceCornerAction]}><Ionicons name="settings-outline" size={25} color={hudHeaderInk} /><Text style={[styles.referenceCornerLabel, { color: hudHeaderInk }]}>设置</Text></Pressable>
    </> : null}
    {operationFeedback ? <View pointerEvents="none" style={[styles.immersiveFeedback, { width: feedbackWidth, transform: [{ translateX: -feedbackWidth / 2 }], bottom: baseActionDockInset + 8, backgroundColor: hudSurface, borderColor: hudBorder }]} testID="control-operation-feedback">
      <Text accessibilityLiveRegion={operationFeedbackIsError ? 'assertive' : 'polite'} style={[styles.immersiveToolbarText, { color: operationFeedbackIsError ? colors.dangerText : appearance.secondary, textAlign: 'center' }]}>{operationFeedback}</Text>
    </View> : null}
    {renderImmersiveIntent()}
  </View>;

  if (gestureLibraryOpen) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: appearance.canvas }]} testID="control-gesture-library">
    <View style={styles.gestureHeader}>
      <Pressable testID="control-close-gestures" accessibilityRole="button" accessibilityLabel="返回控制页"
        onPress={closeRecovery} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={appearance.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>摔倒恢复</Text>
    </View>
    <View style={styles.gestureEmpty}>
      <Pressable testID="control-recovery-action" accessibilityRole="button" accessibilityLabel="摔倒起立"
        accessibilityHint="当前版本暂不支持恢复操作" accessibilityState={{ disabled: true }} disabled
        style={[styles.operationButton, { backgroundColor: appearance.raised }]}>
        <Text style={[styles.label, { color: appearance.ink }]}>开始恢复</Text>
        <Text style={[styles.caption, { color: appearance.secondary }]}>{recoveryLabel}</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
  if (joystickSettingsOpen) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: controlSetupAppearance.canvas }]}>
    <ControlSetupPage title="摇杆布局" onBack={closeJoystickSettings} header={isLandscape ? renderControlHeader(closeJoystickSettings) : undefined} media={{ presentation: video, surface: videoSurface, active: appActive && !leaving, onInterrupted: handleCancel }}>
      <View style={[styles.layoutEditor, isLandscape && styles.layoutEditorWide]}>
        <View style={[styles.layoutCanvas, !isLandscape && styles.layoutCanvasPortrait]} testID="joystick-layout-canvas" onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          if (Number.isFinite(width) && Number.isFinite(height)) setLayoutCanvas({ width: Math.max(0, width), height: Math.max(0, height) });
        }}>
          {(['left', 'right'] as const).map(side => {
            const disc = layoutCanvasDiscs[side];
            return <View key={side} pointerEvents="none" testID={`joystick-layout-disc-${side}`} style={[styles.layoutDisc, { left: disc.left, top: disc.top, width: disc.size, height: disc.size, borderRadius: disc.size / 2, borderColor: controlSetupAppearance.border, backgroundColor: controlSetupAppearance.surface }]}>
              <Text style={[styles.caption, { color: controlSetupAppearance.ink }]}>{side === 'left' ? '移动' : '转向'}</Text>
            </View>;
          })}
        </View>
        <View style={styles.layoutSettingsColumn}>
          {controlSession?.error ? <Text accessibilityLiveRegion="assertive" style={[styles.caption, { color: colors.dangerText }]}>{controlSession.error}</Text> : null}
          <JoystickLayoutSettings key={`${orientation}-${layoutEditorGeneration}`} orientation={orientation} layout={joystickPreferences[orientation]} onPreview={previewJoystickLayout} onChange={changeJoystickLayout} onReset={restoreJoystickLayout} onClose={closeJoystickSettings} storageError={layoutStorageError} />
          {layoutStorageError ? <Pressable accessibilityRole="button" onPress={() => persistJoystickLayout(joystickPreferencesRef.current)} style={styles.layoutRetry} testID="joystick-layout-retry"><Text style={[styles.caption, { color: controlSetupAppearance.blueInk }]}>重试保存</Text></Pressable> : null}
        </View>
      </View>
    </ControlSetupPage>
  </SafeAreaView>;
  if (inputSettingsOpen && g20Controller) return <G20InputPanel
    header={isLandscape ? renderControlHeader(closeInputSettings) : undefined} media={{ presentation: video, surface: videoSurface, active: appActive && !leaving, onInterrupted: handleCancel }}
    state={g20Controller.state} source={selectedInputSource}
    onStart={() => { handleCancel(); g20Controller.observe(); }}
    onStop={() => { handleCancel(); g20Controller.stop(); }}
    onBeginCalibration={() => { handleCancel(); g20Controller.beginCalibration(); }}
    onLearnAxis={axis => { handleCancel(); g20Controller.learnAxis(axis); }}
    onLearnButton={action => { handleCancel(); g20Controller.learnButton(action); }}
    onFinishCalibration={() => { handleCancel(); g20Controller.finishCalibration(); }}
    onClearCalibration={() => { handleCancel(); g20Controller.clearCalibration(); }}
    onSourceChange={setInputSource} onClose={closeInputSettings}
  />;
  return (
    <SafeAreaView edges={__DEV__ && developmentInput ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: isLandscape ? 'transparent' : appearance.canvas }]}>
      <View onLayout={handleLayout} onTouchCancel={handleCancel} style={styles.viewport} testID="control-surface">
        {layout.useColumns ? cameraHud && !postureMenuOpen ? renderCameraHud() : renderImmersiveSurface() : <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
          contentInsetAdjustmentBehavior="automatic"
          scrollEnabled={!anyJoystickActive}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {recoveryPanel}
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="返回" accessibilityRole="button" onPress={handleBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]} testID="control-back"
            ><Ionicons color={colors.inkSoft} name="arrow-back" size={22} /></Pressable>
            <View style={styles.identity}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{robotName}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{robotType}</Text>
            </View>
            <Pressable accessibilityLabel="摇杆布局设置" accessibilityRole="button" onPress={openJoystickSettings} style={styles.back} testID="control-open-joystick-layout"><Ionicons color={colors.ink} name="resize-outline" size={22} /></Pressable>
            {g20Controller ? <Pressable accessibilityLabel="遥控器输入设置" accessibilityRole="button" onPress={openInputSettings} style={styles.back} testID="control-open-input">
              <Ionicons color={colors.ink} name="game-controller-outline" size={22} />
            </Pressable> : null}
            <Pressable
              accessibilityLabel="设备连接" accessibilityRole="button"
              accessibilityState={{ disabled: !(onOpenConnection || onOpenConnectionDiagnostics) }}
              disabled={!(onOpenConnection || onOpenConnectionDiagnostics)}
              onPress={() => openView(onOpenConnection || onOpenConnectionDiagnostics)}
              style={({ pressed }) => [styles.connection, pressed && styles.pressed]} testID="control-open-connection"
            >
              <Text style={[styles.label, { color: connected && !directConnection ? colors.successText : colors.muted }]}>{directConnection ? directConnection.fresh ? '状态已读取' : '需重新检查' : connected ? '设备在线' : '设备离线'}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{batteryLabel}</Text>
              <Text style={[styles.caption, { color: appearance.blueInk }]}>连接设置</Text>
            </Pressable>
          </View>

          {directConnection ? <View style={styles.statusSummary} testID="control-direct-connection">
            <Text style={[styles.label, { color: colors.ink }]}>{directConnection.endpointLabel}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]}>{directConnection.summary}</Text>
          </View> : null}
          <View style={styles.statusSummary} testID="control-runtime-summary">
            <Text style={[styles.caption, { color: colors.muted }]}>{controlOwnerLabel}</Text>
            {postureLabel ? <Text style={[styles.caption, { color: colors.muted }]}>{postureLabel}</Text> : null}
            {motorLabel ? <Text style={[styles.caption, { color: colors.muted }]}>{motorLabel}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={statusDetailsExpanded ? '收起状态详情' : '展开状态详情'} onPress={() => setStatusDetailsExpanded(value => !value)} style={styles.statusDetailsButton} testID="control-status-details">
              <Text style={[styles.caption, { color: appearance.blueInk }]}>{statusDetailsExpanded ? '收起' : '状态详情'}</Text>
              <Ionicons color={appearance.blueInk} name={statusDetailsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
            </Pressable>
          </View>
          {statusDetailsExpanded ? <View style={styles.statusSummary}>
            {statusSummary.map(status => <Text key={status} style={[styles.caption, { color: colors.muted }]}>{status}</Text>)}
          </View> : null}
          {statusDetailsExpanded ? <View style={styles.statusGrid} testID="control-status-grid">
            {statusItems.map(item => <View key={item.id} style={[styles.statusCell, { backgroundColor: appearance.surface }]}>
              <Text style={[styles.statusCellLabel, { color: colors.muted }]}>{item.label}</Text>
              <Text style={[styles.statusCellValue, { color: colors.ink }]}>{item.value}</Text>
            </View>)}
          </View> : null}
          {(videoPresentation && videoPresentation.phase !== 'unconfigured') || videoFrame ? (
            <View style={styles.portraitVideoStage} testID="control-portrait-video">
              <ControlVideoSurface
                presentation={videoPresentation}
                surface={videoFrame}
                active={appActive && !leaving}
                onInterrupted={handleCancel}
                backgroundColor="#090C0B"
                statusColor="#CED3CF"
              />
            </View>
          ) : null}
          <View style={[styles.integrationCard, layout.useColumns && styles.integrationCardCompact, { backgroundColor: appearance.surface }]} testID="control-brainstem-readiness">
            <View style={styles.integrationHeading}>
              <View style={styles.integrationHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>控制连接</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{integration.controlReady ? '已就绪' : '尚未就绪'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={integrationExpanded ? '收起连接详情' : '展开连接详情'} onPress={() => setIntegrationExpanded(value => !value)} style={styles.integrationDetailsButton} testID="control-brainstem-details">
                <Text style={[styles.caption, { color: appearance.blueInk }]}>{integrationExpanded ? '收起' : '详情'}</Text>
                <Ionicons color={integration.controlReady ? colors.successText : colors.muted} name={integration.controlReady ? 'checkmark-circle-outline' : integrationExpanded ? 'chevron-up' : 'lock-closed-outline'} size={18} />
              </Pressable>
            </View>
            {integrationExpanded ? <Text style={[styles.caption, { color: colors.muted }]}>{integration.controlBlockedReason}</Text> : null}
            {integrationExpanded ? <View style={styles.integrationPills}>
              {integration.gates.map(gate => {
                const color = gate.state === 'ready' ? colors.successText : gate.state === 'pending' ? '#A06E18' : colors.muted;
                return <View key={gate.id} style={[styles.integrationPill, { backgroundColor: colors.background }]}>
                  <View style={[styles.integrationDot, { backgroundColor: color }]} />
                  <Text style={[styles.caption, { color }]}>{gate.label}</Text>
                </View>;
              })}
            </View> : null}
          </View>
          <View style={[styles.workspace, layout.useColumns && styles.columns, { gap: layout.sectionGap }]} testID="control-workspace">
            {renderWorkspacePane('operations', layout.operationsPanelWidth, <>
              <View style={[styles.operationHeader, { width: layout.operationGroupWidth, backgroundColor: appearance.surface }]} testID="control-action-header">
                <View style={styles.operationHeaderCopy}>
                  <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>动作区</Text>
                </View>
                <View style={styles.operationHeaderActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={actionReasonsExpanded ? '隐藏动作不可用原因' : '查看动作不可用原因'} onPress={() => setActionReasonsExpanded(value => !value)} style={styles.collapseButton} testID="control-action-reasons">
                    <Text style={[styles.caption, { color: appearance.blueInk }]}>{actionReasonsExpanded ? '隐藏详情' : '详情'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={actionsExpanded ? '收起动作区' : '展开动作区'} onPress={() => setActionsExpanded(value => !value)} style={styles.collapseButton} testID="control-action-collapse">
                    <Text style={[styles.caption, { color: appearance.blueInk }]}>{actionsExpanded ? '收起' : '展开'}</Text>
                    <Ionicons color={appearance.blueInk} name={actionsExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
                  </Pressable>
                </View>
              </View>
              {controlSession ? renderControlLease() : null}
              {controlSession?.error ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.dangerText }]}>{controlSession.error}</Text> : null}
              {!visibleConfirmation && !selectingPolicy && actionsExpanded ? <>
                <View style={[styles.operationGroups, { gap: layout.sectionGap }]} testID="control-operation-groups">
                  {visibleOperationGroups.map(group => <View key={group.title} style={[styles.operationGroup, layout.useColumns && styles.operationGroupCompact, { width: layout.operationGroupWidth, backgroundColor: appearance.surface }]}>
                    <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>{group.title}</Text>
                    <View style={[styles.operationRows, layout.useColumns && styles.operationActionsRow]}>
                      {group.actions.map(action => {
                        const readiness = visibleConfirmation || selectingPolicy ? { ready: false, blockedReason: '请先确认或取消当前操作。' } : getControlOperationReadiness({ action, readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null, });
                        const state = operationStateFor(action, readiness);
                        const statusBusy = ['submitted', 'accepted', 'executing'].includes(state.status);
                        const disabled = !readiness.ready || statusBusy;
                        const detail = state.detail ?? readiness.blockedReason;
                        return <View key={action} style={[styles.operationRow, layout.useColumns && styles.operationCell]}>
                          <Pressable accessibilityLabel={controlOperationLabels[action]} accessibilityRole="button"
                            accessibilityHint={detail} accessibilityState={{ disabled, busy: statusBusy }} disabled={disabled}
                            onPress={() => runOperation(action, renderGeneration)} testID={`control-action-${action}`}
                            style={({ pressed }) => [styles.operationButton, layout.useColumns && styles.operationButtonCompact, { backgroundColor: readiness.ready && !statusBusy ? appearance.action : colors.background }, pressed && styles.pressed]}>
                            <Text style={[styles.label, { color: readiness.ready && !statusBusy ? appearance.actionInk : colors.muted }]}>{controlOperationLabels[action]}</Text>
                          </Pressable>
                          {actionReasonsExpanded || (state.status !== 'idle' && state.status !== 'blocked') ? <Text style={[styles.actionStatus, { color: state.status === 'failed' || state.status === 'timeout' ? colors.dangerText : colors.muted }]} testID={`control-action-status-${action}`}>{controlOperationStatusLabels[state.status]}{detail ? `，${detail}` : ''}</Text> : null}
                        </View>;
                      })}
                    </View>
                  </View>)}
                  {!layout.useColumns && displayedGestures.length > 0 ? (
                    <View style={[styles.operationGroup, { width: layout.operationGroupWidth, backgroundColor: appearance.surface }]} testID="control-portrait-gesture-group">
                      <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>{`预设动作 (${displayedGestures.length})`}</Text>
                      {GestureDeckPanel({
                        gestures: displayedGestures,
                        category: gestureCategory,
                        onSelectCategory: setGestureCategory,
                        selectedGestureName: resolvedSelectedGestureName,
                        onSelectGesture: setSelectedGestureName,
                        showGifPreview: gestureGifPreview,
                        onToggleGifPreview: () => setGestureGifPreview(prev => !prev),
                        gestureDisabled: !effectiveGestureReady,
                        gestureHint: effectiveGestureHint,
                        onPlayGesture: name => {
                          if (effectiveGestureReady && syncedGestureNames.has(name)) {
                            runOperation('playGesture', renderGeneration, name);
                          }
                        },
                        variant: 'settings',
                        surfaceTone: isDark ? 'dark' : 'light',
                      })}
                    </View>
                  ) : null}
                </View>
                {layout.useColumns ? <Pressable accessibilityRole="button" accessibilityLabel={secondaryActionsExpanded ? '收起附加动作' : '展开附加动作'} onPress={() => setSecondaryActionsExpanded(value => !value)} style={[styles.secondaryActionsToggle, { backgroundColor: appearance.surface }]} testID="control-secondary-actions-toggle">
                  <Text style={[styles.caption, { color: appearance.blueInk }]}>{secondaryActionsExpanded ? '收起附加动作' : '更多动作（电机与策略）'}</Text>
                  <Ionicons color={appearance.blueInk} name={secondaryActionsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
                </Pressable> : null}
              </> : null}
              {selectingPolicy ? <View style={[styles.confirmation, { backgroundColor: appearance.surface }]} testID="control-policy-selection">
                <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>选择控制策略模型</Text>
                {policyOptions.map(option => <Pressable key={option.id} accessibilityLabel={`选择运行策略 ${option.label}`} accessibilityRole="button"
                  accessibilityState={{ selected: option.id === runtimeState?.currentPolicy?.id }}
                  onPress={() => runOperation('switchPolicy', renderGeneration, option.id)} testID={`control-policy-option-${option.id}`}
                  style={[styles.operationButton, { backgroundColor: colors.background }]}>
                  <Text style={[styles.label, { color: colors.ink }]}>{option.label}{option.id === runtimeState?.currentPolicy?.id ? '（当前）' : ''}</Text>
                </Pressable>)}
                <Pressable accessibilityLabel="取消策略选择" accessibilityRole="button" onPress={handleCancel} testID="control-cancel-policy"
                  style={[styles.operationButton, { backgroundColor: colors.background }]}><Text style={[styles.label, { color: colors.ink }]}>取消</Text></Pressable>
              </View> : null}
              {visibleConfirmation ? <View accessibilityLiveRegion="polite" style={[styles.confirmation, { backgroundColor: appearance.surface }]} testID="control-confirmation">
                <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>确认{controlOperationLabels[visibleConfirmation.action]}</Text>
                {visibleConfirmation.action === 'switchPolicy' ? <Text style={[styles.label, { color: colors.ink }]}>{`确认切换至 ${policyOptions.find(option => option.id === visibleConfirmation.policyId)?.label ?? '策略已不可用'}`}</Text> : null}
                <Text style={[styles.caption, { color: colors.muted }]}>{visibleConfirmation.action === 'disableMotor'
                  ? '失能后机器人可能失去支撑，请先确认机器人稳定。'
                  : visibleConfirmation.action === 'enableMotor' ? '使能后机器人可能产生动力，请确认周围环境安全。' : '切换策略会改变运动行为，请确认设备状态。'}</Text>
                <View style={styles.confirmationActions}>
                  <Pressable accessibilityLabel="取消操作" accessibilityRole="button" onPress={handleCancel} testID="control-cancel-action"
                    style={[styles.operationButton, styles.confirmationButton, { backgroundColor: colors.background }]}>
                    <Text style={[styles.label, { color: colors.ink }]}>取消</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`确认${controlOperationLabels[visibleConfirmation.action]}`} accessibilityRole="button"
                    onPress={() => runOperation(visibleConfirmation.action, visibleConfirmation.generation, visibleConfirmation.policyId, visibleConfirmation)} testID="control-confirm-action"
                    style={[styles.operationButton, styles.confirmationButton, { backgroundColor: appearance.action }]}>
                    <Text style={[styles.label, { color: appearance.actionInk }]}>确认{controlOperationLabels[visibleConfirmation.action]}</Text>
                  </Pressable>
                </View>
              </View> : null}
              {operationInFlight ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]} testID="control-operation-pending">正在处理{operationInFlight === 'recall' ? '召回' : controlOperationLabels[operationInFlight]}请求…</Text> : null}
              {operationMessage ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]} testID="control-operation-message">{operationMessage}</Text> : null}
            </>)}

            <View style={[styles.panels, layout.useColumns && styles.columns, { gap: layout.sectionGap, width: layout.mainPanelWidth }]} testID="control-panels">
              {showPlanning && (!layout.useColumns || auxiliaryExpanded) ? renderWorkspacePane('map', layout.mapPanelWidth,
                <View style={[styles.mapPanel, { backgroundColor: appearance.surface, width: layout.mapPanelWidth }]}>
                  <View style={styles.panelHeading}>
                    <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>设备地图</Text>
                    <View style={styles.panelHeadingActions}>
                      <Ionicons color={appearance.blueInk} name="map-outline" size={20} />
                      {layout.useColumns ? <Pressable accessibilityRole="button" accessibilityLabel="收起地图任务路线" onPress={() => setAuxiliaryExpanded(false)} style={styles.panelCollapse} testID="control-secondary-navigation-collapse">
                        <Text style={[styles.caption, { color: appearance.blueInk }]}>收起</Text>
                        <Ionicons color={appearance.blueInk} name="chevron-up" size={16} />
                      </Pressable> : null}
                    </View>
                  </View>
                  <View style={styles.mapContent} testID="control-map-content">
                    {mapContent ?? <View style={styles.mapUnavailable} testID="control-map-unavailable">
                      <Ionicons color={colors.muted} name="map-outline" size={28} />
                      <Text style={[styles.label, { color: colors.ink }]}>地图未接入</Text>
                    </View>}
                  </View>
                  <View style={styles.entries}>
                    {browseEntries.map(entry => <Pressable
                      accessibilityLabel={`打开${entry.label}`} accessibilityRole="button"
                      accessibilityState={{ disabled: !entry.callback }} disabled={!entry.callback}
                      key={entry.id} onPress={() => openView(entry.callback)}
                      style={({ pressed }) => [styles.entry, { backgroundColor: entry.callback ? appearance.action : colors.background }, pressed && styles.pressed]}
                      testID={`control-open-${entry.id}`}
                    >
                      <Ionicons color={entry.callback ? appearance.actionInk : colors.muted} name={entry.icon} size={18} />
                      <Text style={[styles.label, { color: entry.callback ? appearance.actionInk : colors.muted }]}>{entry.label}</Text>
                    </Pressable>)}
                  </View>
                  <Text style={[styles.caption, { color: colors.muted }]} testID="control-task-status">{canUseTaskMode ? '任务执行可用' : taskModeBlockedReason || '任务执行尚未就绪'}</Text>
                  <Text style={[styles.caption, { color: colors.muted }]} testID="control-route-status">{canUseRouteMode ? '路线执行可用' : routeModeBlockedReason || '路线执行尚未就绪'}</Text>
                </View>) : null}

              {renderWorkspacePane('manual', manualPanelWidth,
                <View style={[styles.manualPanel, layout.useColumns && styles.manualPanelCompact, { width: manualPanelWidth }]}>
                  {showPlanning && layout.useColumns && !auxiliaryExpanded ? <View style={[styles.secondaryNavigation, { backgroundColor: appearance.surface }]} testID="control-secondary-navigation">
                    <View style={styles.secondaryNavigationCopy}>
                      <Text style={[styles.caption, { color: colors.ink }]}>更多</Text>
                      <Text style={[styles.caption, { color: colors.muted }]}>地图、任务和路线</Text>
                    </View>
                    <View style={styles.secondaryNavigationEntries}>
                      {browseEntries.map(entry => <Pressable
                        accessibilityLabel={`打开${entry.label}`} accessibilityRole="button"
                        accessibilityState={{ disabled: !entry.callback }} disabled={!entry.callback}
                        key={entry.id} onPress={() => openView(entry.callback)}
                        style={({ pressed }) => [styles.secondaryNavigationEntry, { backgroundColor: entry.callback ? appearance.action : colors.background }, pressed && styles.pressed]}
                        testID={`control-open-${entry.id}`}
                      >
                        <Ionicons color={entry.callback ? appearance.actionInk : colors.muted} name={entry.icon} size={14} />
                        <Text style={[styles.caption, { color: entry.callback ? appearance.actionInk : colors.muted }]}>{entry.label}</Text>
                      </Pressable>)}
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="展开地图任务路线" onPress={() => setAuxiliaryExpanded(true)} style={styles.secondaryNavigationExpand} testID="control-secondary-navigation-expand">
                      <Ionicons color={appearance.blueInk} name="chevron-down" size={16} />
                    </Pressable>
                  </View> : null}
                  <View style={styles.panelHeading}>
                    <Text style={[styles.caption, { color: colors.muted }]} testID="control-manual-status">{manualStatus}</Text>
                  </View>
                  <Text accessibilityLiveRegion="polite" style={[styles.caption, styles.manualReason, layout.useColumns && styles.manualReasonCompact, { color: colors.muted }]} testID="control-manual-reason">{layout.useColumns ? (controlsEnabled ? '松手归零；切后台会中断。' : '控制权限未满足；摇杆不会发送指令。') : manualReason}</Text>
                  <View style={[styles.terrainModeCard, { backgroundColor: colors.background }]} testID="control-terrain-mode">
                    <View style={styles.speedHeading}>
                      <Text style={[styles.label, { color: colors.ink }]}>运动模式</Text>
                      <Text style={[styles.caption, { color: colors.muted }]}>{terrainModeLabel}</Text>
                    </View>
                    <View style={styles.terrainModeOptions}>
                      {CONTROL_TERRAIN_MODE_OPTIONS.map(option => {
                        const available = terrainModeOptions.some(candidate => candidate.id === option.id);
                        const selected = terrainModeCurrent === option.id;
                        const profileId = getControlTerrainPolicies(runtimeState).find(mode => mode.id === option.id)?.profileId;
                        const unavailable = !available || !terrainModeCatalogReady || !profileId || !modeReadiness.ready;
                        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`运动模式${option.label}`} accessibilityHint={unavailable ? modeReadiness.blockedReason ?? terrainModeBlockedReason : undefined} accessibilityState={{ disabled: unavailable || selected, selected }} disabled={unavailable || selected} onPress={() => { if (profileId) runOperation('switchPolicy', renderGeneration, profileId); }} style={[styles.terrainModeOption, { backgroundColor: selected ? appearance.action : colors.surfaceStrong, borderColor: selected ? appearance.blueInk : appearance.border, opacity: unavailable ? 0.55 : 1 }]} testID={`control-terrain-mode-${option.id}`}>
                          <Text style={[styles.caption, { color: selected ? appearance.actionInk : colors.ink }]}>{option.label}</Text>
                        </Pressable>;
                      })}
                      <Pressable testID="control-terrain-mode-recovery" accessibilityRole="button" accessibilityLabel="查看摔倒恢复"
                        accessibilityHint={recoveryLabel} onPress={openRecovery}
                        accessibilityState={{ selected: runtimeState?.recoveryMode?.selected === true }}
                        style={[styles.terrainModeOption, { backgroundColor: colors.surfaceStrong, borderColor: appearance.border }]}>
                        <Text style={[styles.caption, { color: colors.ink }]}>摔倒恢复</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.caption, { color: colors.muted }]} testID="control-terrain-mode-reason">{terrainModeBlockedReason}</Text>
                  </View>
                  <View style={layout.useColumns ? styles.manualTopRow : undefined}>
                    <View style={[styles.speedCard, layout.useColumns && styles.speedCardCompact, { backgroundColor: colors.background }]} testID="control-speed-zone">
                      <View style={styles.speedHeading}>
                        <Text style={[styles.label, { color: colors.ink }]}>速度状态</Text>
                        <Text style={[styles.caption, { color: colors.muted }]}>{speedSourceLabel}</Text>
                      </View>
                      <View style={styles.speedGrid}>
                        <View style={styles.speedMetric} testID="control-speed-linear"><Text style={[styles.caption, { color: colors.muted }]}>线速度</Text><Text style={[styles.speedValue, { color: colors.ink }]}>{formatSpeed(speed?.linearMps, 'm/s')}</Text></View>
                        <View style={styles.speedMetric} testID="control-speed-lateral"><Text style={[styles.caption, { color: colors.muted }]}>横移速度</Text><Text style={[styles.speedValue, { color: colors.ink }]}>{formatSpeed(speed?.lateralMps, 'm/s')}</Text></View>
                        <View style={styles.speedMetric} testID="control-speed-yaw"><Text style={[styles.caption, { color: colors.muted }]}>旋转速度</Text><Text style={[styles.speedValue, { color: colors.ink }]}>{formatSpeed(speed?.yawRps, 'rad/s')}</Text></View>
                      </View>
                    </View>
                    <View style={[styles.inputSourceCard, layout.useColumns && styles.inputSourceCardCompact, { backgroundColor: colors.background }]} testID="control-input-source">
                      <View style={styles.speedHeading}>
                        <Text style={[styles.label, { color: colors.ink }]}>输入来源</Text>
                        <Text style={[styles.caption, { color: colors.muted }]}>{selectedInputSource === 'touch' ? '触屏摇杆' : '实体摇杆'}</Text>
                      </View>
                      <View style={styles.inputSourceOptions}>
                        {(['touch', 'physical'] as const).map(source => {
                          const selected = selectedInputSource === source;
                          const unavailable = source === 'physical' && !physicalAvailable;
                          return <Pressable key={source} accessibilityRole="button" accessibilityLabel={source === 'touch' ? '使用触屏摇杆' : '使用实体摇杆'} accessibilityState={{ selected, disabled: unavailable }} disabled={unavailable} onPress={() => setInputSource(source)} style={[styles.inputSourceOption, { backgroundColor: selected ? appearance.action : colors.surfaceStrong, opacity: unavailable ? 0.55 : 1 }]} testID={`control-input-source-${source}`}>
                            <Ionicons color={selected ? appearance.actionInk : colors.muted} name={source === 'touch' ? 'hand-left-outline' : 'game-controller-outline'} size={16} />
                            <Text style={[styles.caption, { color: selected ? appearance.actionInk : colors.ink }]}>{source === 'touch' ? '触屏摇杆' : '实体摇杆'}</Text>
                          </Pressable>;
                        })}
                      </View>
                      {selectedInputSource === 'physical' && !physicalAvailable ? <Text style={[styles.caption, { color: colors.muted }]} testID="control-physical-input-reason">请先校验遥控器输入</Text> : null}
                      {selectedInputSource === 'touch' && !controlsEnabled && !layout.useColumns ? <Text style={[styles.caption, { color: colors.muted }]} testID="control-touch-input-reason">控制未开放</Text> : null}
                    </View>
                  </View>
                  <View style={styles.sticks}>
                    {layout.joystickSize >= 48 ? <ControlJoystickPair
                      key={offlinePreview ? 'offline-preview' : 'control'}
                      disabled={joystickDisabled}
                      onCancel={offlinePreview ? cancelPreview : handleCancel}
                      gap={layout.joystickGap}
                      left={{ axis: 'xy', label: '移动', onActiveChange: offlinePreview ? active => previewTouchActive('drive', active) : active => touchActive('drive', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleDrive : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleDrive : undefined, testID: 'control-drive-stick' }}
                      resetKey={resetKey}
                      right={{ axis: 'x', label: '转向', onActiveChange: offlinePreview ? active => previewTouchActive('turn', active) : active => touchActive('turn', active), onChange: offlinePreview ? ignoreLocalInput : productionInput || developmentInput ? handleTurn : ignoreLocalInput, onSample: !offlinePreview && productionInput ? handleTurn : undefined, testID: 'control-turn-stick' }}
                      showLabels={true}
                      size={layout.joystickSize}
                      layout={configuredJoystickLayout}
                      touchAreaWidth={configuredWidth}
                      touchAreaHeight={configuredHeight}
                      showVisuals
                    /> : <Text style={[styles.caption, { color: colors.muted }]}>当前窗口过小，暂不可操作摇杆</Text>}
                  </View>
                  <Pressable
                    accessibilityLabel="召回机器人" accessibilityRole="button"
                    accessibilityHint={!recallEnabled ? recallBlockedReason || '召回暂不可用' : undefined}
                    accessibilityState={{ disabled: !recallEnabled }} disabled={!recallEnabled}
                    onPress={handleRecall}
                    style={({ pressed }) => [styles.recall, { backgroundColor: recallEnabled ? appearance.action : appearance.surface }, pressed && recallEnabled && styles.pressed]}
                    testID="control-recall"
                  >
                    <Ionicons color={recallEnabled ? appearance.actionInk : colors.muted} name="return-down-back-outline" size={18} />
                    <Text style={[styles.label, { color: recallEnabled ? appearance.actionInk : colors.muted }]}>召回</Text>
                  </Pressable>
                  {!recallEnabled ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.muted }]} testID="control-recall-reason">{recallBlockedReason || '召回能力尚未就绪'}</Text> : null}
                </View>)}
            </View>
          </View>
        </ScrollView>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  gestureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  gestureEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  viewport: { flex: 1 },
  layoutEditor: { flex: 1, gap: 12, alignItems: 'center' },
  layoutEditorWide: { flexDirection: 'row', alignItems: 'stretch' },
  layoutCanvas: { flex: 1, width: '100%', position: 'relative', overflow: 'hidden', backgroundColor: controlSetupAppearance.surface, borderColor: controlSetupAppearance.border, borderWidth: .5, borderRadius: 20 },
  layoutCanvasPortrait: { flex: 0, height: 170 },
  layoutDisc: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  layoutSettingsColumn: { flex: 1, width: '100%', maxWidth: 380, minHeight: 0 },
  layoutRetry: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  immersiveIntent: { position: 'absolute', top: 80, left: '50%', width: 356, transform: [{ translateX: -178 }], padding: 18, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', backgroundColor: 'rgba(18, 22, 26, 0.94)', zIndex: 9 },
  immersiveIntentTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#F4F7FA' },
  immersiveIntentSubtitle: { fontSize: 13, lineHeight: 19, fontWeight: '400', color: '#9CA6B2' },
  immersiveIntentActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  immersiveIntentBtn: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  immersiveIntentCancelBtn: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)' },
  immersiveIntentConfirmBtn: { backgroundColor: '#3B6EF6' },
  immersiveIntentCancelText: { fontSize: 14, lineHeight: 19, fontWeight: '500', color: '#E2E8F0' },
  immersiveIntentConfirmText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#FFFFFF' },
  modeMenuDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8 },
  modeMenu: { position: 'absolute', right: 16, flexDirection: 'row', padding: 4, gap: 4, borderRadius: 20, borderWidth: 0.5, overflow: 'hidden', zIndex: 9 },
  modeMenuOption: { minWidth: 88, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 4, paddingBottom: 16 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 12, minHeight: 56 },
  back: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48, borderRadius: 24 },
  identity: { flex: 1, minWidth: 0 },
  title: { ...typography.pageTitle },
  label: { ...typography.secondary, fontWeight: '500' },
  caption: { ...typography.secondary },
  connection: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  statusSummary: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginBottom: 12 },
  statusDetailsButton: { alignItems: 'center', flexDirection: 'row', gap: 2, minHeight: 30, paddingHorizontal: 4 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  statusCell: { borderRadius: 14, flexBasis: 108, flexGrow: 1, gap: 2, minHeight: 48, paddingHorizontal: 9, paddingVertical: 7 },
  statusCellLabel: { ...typography.secondary },
  statusCellValue: { ...typography.sectionTitle },
  workspace: { alignItems: 'stretch' },
  workspacePane: { flexGrow: 0, flexShrink: 0 },
  operationGroups: { gap: 12, marginBottom: 12 },
  operationHeader: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10 },
  operationHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  operationHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  collapseButton: { alignItems: 'center', flexDirection: 'row', gap: 3, minHeight: 40, paddingHorizontal: 6 },
  operationGroup: { borderRadius: 24, padding: 12, gap: 8, minWidth: 0 },
  operationGroupCompact: { borderRadius: 16, padding: 8, gap: 5 },
  operationRow: { gap: 4 },
  operationRows: { gap: 8 },
  operationActionsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  operationCell: { flex: 1, minWidth: 0 },
  operationButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  operationButtonCompact: { minHeight: 40, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 6 },
  actionStatus: { ...typography.caption, lineHeight: 16 },
  actionStatusCompact: { lineHeight: 14 },
  secondaryActionsToggle: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, marginBottom: 6, paddingHorizontal: 10 },
  confirmation: { borderRadius: 24, padding: 16, gap: 10, marginBottom: 12 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  confirmationButton: { flexGrow: 1, flexBasis: 140 },
  panels: { alignItems: 'stretch' },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  mapPanel: { borderRadius: 24, padding: 12, gap: 4, minWidth: 0 },
  panelHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  panelHeadingActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  panelCollapse: { alignItems: 'center', flexDirection: 'row', gap: 2, minHeight: 32, paddingHorizontal: 4 },
  mapContent: { minHeight: 112, overflow: 'hidden', borderRadius: 16, marginVertical: 4 },
  mapUnavailable: { alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 112 },
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  entry: { alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, minHeight: 48, minWidth: 48, borderRadius: 16, paddingHorizontal: 6, paddingVertical: 6 },
  manualPanel: { minWidth: 0, paddingHorizontal: 12, gap: 6 },
  manualPanelCompact: { paddingHorizontal: 0, gap: 5 },
  manualReason: { minHeight: 36 },
  manualReasonCompact: { minHeight: 0 },
  manualTopRow: { flexDirection: 'row', gap: 6 },
  speedCard: { borderRadius: 18, gap: 7, padding: 10 },
  speedCardCompact: { flex: 1, borderRadius: 14, gap: 4, padding: 8 },
  speedHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  speedGrid: { flexDirection: 'row', gap: 6 },
  speedMetric: { flex: 1, minWidth: 0, gap: 2 },
  speedValue: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  inputSourceCard: { borderRadius: 18, gap: 7, padding: 10 },
  inputSourceCardCompact: { flex: 1, borderRadius: 14, gap: 4, padding: 8 },
  inputSourceOptions: { flexDirection: 'row', gap: 6 },
  inputSourceOption: { alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 40, paddingHorizontal: 7 },
  terrainModeCard: { borderRadius: 18, gap: 7, padding: 10 },
  terrainModeOptions: { flexDirection: 'row', gap: 6 },
  terrainModeOption: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 6 },
  sticks: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  recall: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, minHeight: 48, borderRadius: 18, padding: 8 },
  portraitVideoStage: { aspectRatio: 16 / 9, borderRadius: 18, overflow: 'hidden', backgroundColor: '#090C0B', marginBottom: 12, width: '100%' },
  integrationCard: { borderRadius: 24, padding: 12, gap: 8, marginBottom: 12 },
  integrationCardCompact: { borderRadius: 18, gap: 5, marginBottom: 8, paddingVertical: 8 },
  integrationHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  integrationHeadingCopy: { flex: 1, minWidth: 0, gap: 3 },
  integrationDetailsButton: { alignItems: 'center', flexDirection: 'row', gap: 3, minHeight: 36, paddingHorizontal: 4 },
  integrationPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  integrationPill: { alignItems: 'center', flexDirection: 'row', gap: 5, borderRadius: 12, minHeight: 28, paddingHorizontal: 7, paddingVertical: 4 },
  integrationDot: { borderRadius: 4, height: 7, width: 7 },
  secondaryNavigation: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, paddingHorizontal: 9, paddingVertical: 7 },
  secondaryNavigationCopy: { minWidth: 74 },
  secondaryNavigationEntries: { flex: 1, flexDirection: 'row', gap: 5 },
  secondaryNavigationEntry: { alignItems: 'center', borderRadius: 10, flex: 1, flexDirection: 'row', gap: 3, justifyContent: 'center', minHeight: 32, paddingHorizontal: 5 },
  secondaryNavigationExpand: { alignItems: 'center', justifyContent: 'center', minHeight: 32, paddingHorizontal: 3 },
  immersiveSurface: { marginHorizontal: 0, marginVertical: 0, minHeight: 0, overflow: 'hidden', position: 'relative' },
  immersiveMedia: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0 },
  immersiveVideoPane: { flex: 1, position: 'relative' },
  immersiveToolbarControl: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 6, minHeight: 48, minWidth: 48, paddingHorizontal: 12 },
  immersiveToolbarControlCompact: { paddingHorizontal: 6 },
  immersiveToolbarText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  immersiveToolbarTextCompact: { fontSize: 14, lineHeight: 22 },
  immersiveConnectionPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 11 },
  immersiveConnectionDot: { borderRadius: 4, height: 8, width: 8 },
  immersiveSticks: { alignItems: 'center', left: '4.5%', position: 'absolute', right: '4.5%', zIndex: 2 },
  immersiveActionItem: { alignItems: 'center', minWidth: 56 },
  immersiveActionButton: { alignItems: 'center', justifyContent: 'center', minHeight: 56, minWidth: 56 },
  immersiveActionCircle: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  immersiveFeedback: { alignItems: 'center', borderRadius: 14, borderWidth: 0.5, justifyContent: 'center', left: '50%', minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, position: 'absolute', zIndex: 5 },
  pressed: { opacity: 0.55 },
  referenceAuthority: { position: 'absolute', top: '16.5%', left: '50%', transform: [{ translateX: -120 }], flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 10 },
  referenceAuthorityChip: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 36, borderRadius: 20, paddingHorizontal: 14, backgroundColor: 'rgba(11,24,40,0.40)', borderWidth: 1, borderColor: 'rgba(218,233,251,0.16)', overflow: 'hidden', position: 'relative' },
  referenceAuthorityChipActive: { backgroundColor: 'rgba(34,84,131,0.58)', borderColor: 'rgba(112,185,255,0.30)' },
  referenceAuthorityText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  referenceTopBar: { position: 'absolute', left: '4%', right: '2.5%', top: '1.8%', zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  referenceBrand: { position: 'absolute', left: 0, minHeight: 44, justifyContent: 'center' },
  referenceIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, backgroundColor: 'rgba(16,29,42,0.38)', borderWidth: .5, borderColor: 'rgba(255,255,255,0.23)', maxWidth: '45%', overflow: 'hidden', position: 'relative' },
  referenceName: { color: '#FCFCFD', fontWeight: '500', flexShrink: 1 },
  referenceStatus: { fontWeight: '400' },
  referenceRightStatus: { position: 'absolute', right: 0, alignItems: 'center', flexDirection: 'row', gap: 16 },
  referenceTelemetry: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  referenceSignal: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  referenceSignalText: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontVariant: ['tabular-nums'] },
  referenceUnknown: { position: 'absolute', right: -7, top: 14, fontSize: 10, color: '#FCFCFD' },
  referenceBattery: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  referenceBatteryText: { color: '#FCFCFD', fontWeight: '500', fontVariant: ['tabular-nums'] },
  referenceStopTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  referenceCenterTelemetry: { position: 'absolute', left: '50%', top: '28%', transform: [{ translateX: -112 }], zIndex: 4 },
  referenceActionDock: { position: 'absolute', left: '23%', right: '23%', bottom: '4.4%', minHeight: 68, borderRadius: 34, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(10,23,39,0.42)', borderWidth: 1, borderColor: 'rgba(197,220,247,0.24)', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, overflow: 'hidden', zIndex: 4 },
  referencePostureButton: { width: 70, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  referencePostureSelected: { backgroundColor: 'rgba(91,161,232,0.55)', borderColor: 'rgba(188,222,255,0.85)' },
  referencePostureLabel: { color: '#FCFCFD', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  referenceCornerAction: { minWidth: 74, height: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', gap: 7, backgroundColor: 'rgba(10,23,39,0.38)', borderWidth: 1, borderColor: 'rgba(197,220,247,0.28)', overflow: 'hidden' },
  referenceCornerLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  referenceMap: { position: 'absolute', left: '4.5%', bottom: '4.5%', justifyContent: 'center', alignItems: 'center', zIndex: 4 },
  referenceSettings: { position: 'absolute', right: '4.5%', bottom: '4.5%', justifyContent: 'center', alignItems: 'center', zIndex: 4 },
});
