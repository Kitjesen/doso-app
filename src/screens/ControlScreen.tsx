import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, type ImageSourcePropType, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ControlJoystickPair, type JoystickVector } from '../components/ControlJoystick';
import { ControlVideoSurface, type ControlVideoPresentation } from '../components/ControlVideoSurface';
import { JoystickLayoutSettings } from '../components/JoystickLayoutSettings';
import { createDefaultJoystickLayoutPreferences, loadJoystickLayoutPreferences, resetJoystickLayout, resolveJoystickLayout, saveJoystickLayoutPreferences, updateJoystickPlacement, type JoystickPlacement, type JoystickSide } from '../features/control/joystickLayoutPreferences';
import { G20InputPanel } from '../components/G20InputPanel';
import { G20IntentGate } from '../features/control/g20InputModel';
import type { G20InputController } from '../features/control/useG20Input';
import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import type { RobotDiagnosticsDeviceClass, RobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { CONTROL_TERRAIN_MODE_OPTIONS, controlOperationLabels, controlOperationStatusLabels, getControlOperationReadiness, getControlPolicyOptions, getControlTerrainModeOptions, transitionControlOperationState, type ControlActionReadiness, type ControlInputSource, type ControlOperation, type ControlOperationCallbacks, type ControlOperationState, type ControlRuntimeState, type ControlTerrainModeId } from '../features/control/controlOperations';
import { getBrainstemIntegrationReadiness, type BrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { setControlNavigationHidden } from '../services/brainstemGrpc';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import { getControlLayoutMetrics } from './controlLayout';
import { getControlTerrainPolicies } from '../features/control/controlOperations';

export type DevelopmentControlInput = Readonly<{
  ready: boolean;
  onDrive: (value: JoystickVector) => void;
  onTurn: (value: JoystickVector) => void;
  onSticks?: (drive: JoystickVector, turn: JoystickVector, sampledAtMonotonicMs?: number) => void;
  onInterrupt: () => void;
}>;

// Capability and connection props describe state; they never grant joystick authority.
type Props = {
  allowInteractionPreview?: boolean;
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
  mapContent?: ReactNode;
  video?: ControlVideoPresentation;
  videoSurface?: ReactNode;
  canRecall?: boolean;
  recallBlockedReason?: string;
  onRecall?: () => void | Promise<void>;
  runtimeState?: ControlRuntimeState;
  operationReadiness?: Partial<Record<ControlOperation, ControlActionReadiness>>;
  operationCallbacks?: ControlOperationCallbacks;
  operationStates?: Partial<Record<ControlOperation, ControlOperationState>>;
  operationTargetKey?: string;
  onInputSourceChange?: (source: ControlInputSource) => void;
  onNotifications?: () => void;
  routeModeBlockedReason?: string;
  robotImage: ImageSourcePropType;
  robotName: string;
  robotType: string;
  taskModeBlockedReason?: string;
};

// Offline preview callers keep a no-op. Only the explicitly selected development
// simulation entry injects local input; production never invokes those callbacks.
const ignoreLocalInput = (_value: JoystickVector) => {};
type OperationConfirmation = Readonly<{ action: ControlOperation; policyId?: string; generation: number }>;

export function ControlScreen({
  allowInteractionPreview = false, developmentInput, productionInput, controlSession, onBack,
  batteryPercent, connected, directConnection, robotName, robotType, canUseManualControl,
  canUseRouteMode, canUseTaskMode, manualControlBlockedReason,
  routeModeBlockedReason, taskModeBlockedReason, mapContent, video, videoSurface,
  onOpenMap, onOpenTasks, onOpenRoutes, onOpenJointStatus, onOpenConnection, onOpenConnectionDiagnostics,
  canRecall, recallBlockedReason, onRecall,
  runtimeState, operationReadiness, operationCallbacks, operationStates, operationTargetKey, brainstemIntegration,
  inputSource, physicalInputAvailable = false, g20Controller, onInputSourceChange, onNotifications,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const { height, width, fontScale } = useWindowDimensions();
  const isLandscape = width > height;
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const viewportRef = useRef(viewport);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [navigationBottomInset, setNavigationBottomInset] = useState(0);
  const [leaving, setLeaving] = useState(false);
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
  const [gestureLibraryOpen, setGestureLibraryOpen] = useState(false);
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
  const [actionReasonsExpanded, setActionReasonsExpanded] = useState(!isLandscape);
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
  const policyOptions = getControlPolicyOptions(runtimeState).map(option => ({ ...option,
    label: CONTROL_TERRAIN_MODE_OPTIONS.find(mode => mode.id === option.id)?.label ?? option.label }));
  const customPolicyCatalog = policyOptions.some(option => !CONTROL_TERRAIN_MODE_OPTIONS.some(mode => mode.id === option.id));
  const terrainPolicies = customPolicyCatalog
    ? policyOptions.map(option => ({ ...option, profileId: option.id, selected: runtimeState?.currentPolicy?.id === option.id }))
    : getControlTerrainPolicies(runtimeState);
  const selectedInputSource = inputSource ?? localInputSource;
  const selectedSourceRef = useRef(selectedInputSource);
  selectedSourceRef.current = selectedInputSource;
  const resultContextRef = useRef({ target: operationTargetKey, source: selectedInputSource });
  const physicalAvailable = physicalInputAvailable || !!(g20Controller?.state.reading
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
  const modeMenuMotion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    modeMenuMotion.setValue(0);
    if (!selectingPolicy) return;
    let retired = false;
    const animation = Animated.timing(modeMenuMotion, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true,
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (retired) return;
      if (reduced) modeMenuMotion.setValue(1); else animation.start();
    }, () => { if (!retired) modeMenuMotion.setValue(1); });
    return () => { retired = true; animation.stop(); };
  }, [selectingPolicy, modeMenuMotion]);
  const anyJoystickActive = driveActive || turnActive;
  const immersiveCanvasHeight = Math.max(0, viewport.height - navigationBottomInset);
  const layout = useMemo(() => getControlLayoutMetrics({
    containerWidth: viewport.width,
    containerHeight: immersiveCanvasHeight,
    isLandscape,
    fontScale,
  }), [viewport.width, immersiveCanvasHeight, isLandscape, fontScale]);
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
  const revokeOperationIntent = useCallback(() => {
    operationGeneration.current++;
    confirmationRef.current = null;
    policySelectionRef.current = null;
    setConfirmation(null);
    setPolicySelection(null);
    setOperationMessage(null);
    retireOperationResults();
  }, [retireOperationResults]);
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
    setActionReasonsExpanded(!isLandscape);
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
      retireOperationResults();
      operationGeneration.current++;
      confirmationRef.current = null;
      policySelectionRef.current = null;
      interruptInput();
    };
  }, []);

  useEffect(() => {
    if (!(productionInput?.ready || developmentInput?.ready)) resetControls();
  }, [productionInput?.ready, developmentInput?.ready, resetControls]);

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

  const handleBack = useCallback(() => {
    recallRef.current.leaving = true;
    operationContextRef.current.leaving = true;
    setLeaving(true);
    revokeOperationIntent();
    interruptInput();
    resetControls();
    onBack();
  }, [onBack, resetControls, revokeOperationIntent]);

  const previewControlsEnabled = __DEV__ && allowInteractionPreview && appActive && !leaving;
  const controlsEnabled = !joystickSettingsOpen && !inputSettingsOpen && !gestureLibraryOpen && !operationInFlight && !visibleConfirmation && !selectingPolicy && (productionInput
    ? canUseManualControl && productionInput.ready && appActive && !leaving
    : developmentInput
    ? __DEV__ && developmentInput.ready && appActive && !leaving
    : previewControlsEnabled);
  const nextTouchSnapshot = [selectedInputSource, controlsEnabled, appActive, leaving, inputSettingsOpen, joystickSettingsOpen,
    isLandscape, width, height, fontScale, viewport.width, viewport.height, navigationBottomInset, renderGeneration,
    productionInput?.onDrive, productionInput?.onTurn, productionInput?.onInterrupt,
    developmentInput?.onDrive, developmentInput?.onTurn, developmentInput?.onInterrupt];
  if (touchSnapshot.current && nextTouchSnapshot.some((value, index) => !Object.is(value, touchSnapshot.current![index]))) touchGeneration.current++;
  touchSnapshot.current = nextTouchSnapshot;
  touchAllowed.current = controlsEnabled && selectedInputSource === 'touch';
  const renderedTouchGeneration = touchGeneration.current;
  const handleDrive = useCallback((value: JoystickVector) => {
    if (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current || !touchAllowed.current
      || selectedSourceRef.current !== 'touch' || layoutEditingRef.current) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || !operationContextRef.current.appActive || operationContextRef.current.leaving) return;
    if (productionInput?.ready && canUseManualControl && appActive && !leaving) { productionInput.onDrive(value); return; }
    if (__DEV__ && developmentInput?.ready && appActive && !leaving) developmentInput.onDrive(value);
  }, [productionInput, canUseManualControl, developmentInput, appActive, leaving, renderedTouchGeneration]);
  const handleTurn = useCallback((value: JoystickVector) => {
    if (!mountedRef.current || renderedTouchGeneration !== touchGeneration.current || !touchAllowed.current
      || selectedSourceRef.current !== 'touch' || layoutEditingRef.current) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || !operationContextRef.current.appActive || operationContextRef.current.leaving) return;
    if (productionInput?.ready && canUseManualControl && appActive && !leaving) { productionInput.onTurn(value); return; }
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
    if (layoutEditingRef.current) return;
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
    const settle = (ok: boolean) => {
      if (inFlightRef.current !== request || pendingResultsRef.current.get(action) !== pending) return;
      inFlightRef.current = null;
      if (!mountedRef.current) return;
      setOperationInFlight(null);
      if (!ok || action === 'recall') pending.cancel();
      if (action !== 'recall') {
        setLocalOperationState(action, ok ? 'accepted' : 'failed', ok ? '执行器已接受，等待设备终态。' : '执行器未确认本次请求。');
      }
      if (operationGeneration.current === requestGeneration) setOperationMessage(ok ? '请求已接受，状态待确认' : '未能确认操作结果，请先读取设备状态后再决定是否重试。');
    };
    try {
      // The production action owns zero/release and dispatch as one serialized
      // native transaction. An independent interrupt here would race that action.
      if (__DEV__) developmentInputRef.current?.onInterrupt();
      if (requestGeneration !== operationGeneration.current || !operationContextRef.current.appActive || operationContextRef.current.leaving) { settle(false); return; }
      Promise.resolve(callback()).then(() => settle(true), () => settle(false));
    } catch {
      settle(false);
    }
  }, [resetControls, setLocalOperationState]);
  const runOperation = useCallback((action: ControlOperation, expectedGeneration: number, policyId?: string, confirmedIntent?: OperationConfirmation) => {
    if (!mountedRef.current || expectedGeneration !== operationGeneration.current) return;
    if (confirmedIntent ? confirmationRef.current !== confirmedIntent : confirmationRef.current !== null) return;
    const current = operationContextRef.current;
    const readiness = getControlOperationReadiness({ action, readiness: current.operationReadiness, callbacks: current.operationCallbacks,
      runtimeState: current.runtimeState, foreground: current.appActive, leaving: current.leaving, inFlight: inFlightRef.current !== null, policyId });
    if (!readiness.ready) return;
    if (!confirmedIntent && (action === 'enableMotor' || action === 'disableMotor' || action === 'switchPolicy')) {
      if (__DEV__) developmentInputRef.current?.onInterrupt();
      resetControls();
      const latest = operationContextRef.current;
      const recheck = getControlOperationReadiness({ action, readiness: latest.operationReadiness, callbacks: latest.operationCallbacks,
        runtimeState: latest.runtimeState, foreground: latest.appActive, leaving: latest.leaving, inFlight: inFlightRef.current !== null, policyId });
      if (expectedGeneration !== operationGeneration.current || !recheck.ready) return;
    }
    if (policySelectionRef.current !== null && (action !== 'switchPolicy' || policyId === undefined)) return;
    if (action === 'switchPolicy' && !confirmedIntent) {
      if (policyId === undefined) {
        policySelectionRef.current = expectedGeneration;
        setPolicySelection(expectedGeneration);
        return;
      }
      if (policySelectionRef.current !== expectedGeneration) return;
      policySelectionRef.current = null;
      setPolicySelection(null);
    }
    if (action === 'enableMotor' || action === 'disableMotor' || action === 'switchPolicy') {
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
      const recheck = getControlOperationReadiness({ action, readiness: latest.operationReadiness, callbacks: latest.operationCallbacks,
        runtimeState: latest.runtimeState, foreground: latest.appActive, leaving: latest.leaving, inFlight: false, policyId });
      if (!recheck.ready || latest.operationCallbacks?.[action] !== expectedCallback) throw Error('Operation authorization changed');
      return action === 'switchPolicy' ? latest.operationCallbacks?.switchPolicy?.(policyId!) : latest.operationCallbacks?.[action]?.();
    });
  }, [startOperation, resetControls]);
  const physicalContext = useRef({ observing: false, allowed: false, motion: false, generation: renderGeneration, runOperation, productionInput });
  const observingPhysical = selectedInputSource === 'physical' && physicalAvailable && !inputSettingsOpen && !joystickSettingsOpen && !gestureLibraryOpen && appActive && !leaving;
  physicalContext.current = { observing: observingPhysical,
    allowed: observingPhysical && !operationInFlight && !visibleConfirmation && !selectingPolicy,
    motion: controlsEnabled, generation: renderGeneration, runOperation, productionInput };
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
      if (intent.action) { context.runOperation(intent.action, context.generation); return; }
      if (motion.send && intent.send && context.motion && context.productionInput?.ready && context.productionInput.onSticks) {
        context.productionInput.onSticks({ x: frame.vector.leftX, y: frame.vector.leftY }, { x: frame.vector.rightX, y: frame.vector.rightY }, sample.requestStartedAtMonotonicMs);
      }
    });
  }, [g20Controller?.subscribe, interruptInput, revokeOperationIntent, resetControls]);
  useEffect(() => {
    if (selectedInputSource === 'physical' && !physicalAvailable) setInputSource('touch');
  }, [selectedInputSource, physicalAvailable, setInputSource]);
  const openInputSettings = () => { handleCancel(); setInputSettingsOpen(true); };
  const recallEnabled = canRecall === true && typeof onRecall === 'function' && appActive && !leaving && !operationInFlight && !visibleConfirmation && !selectingPolicy;
  const handleRecall = useCallback(() => {
    const current = recallRef.current;
    if (current.canRecall !== true || typeof current.onRecall !== 'function' || !current.appActive || current.leaving) return;
    if (inFlightRef.current || confirmationRef.current || policySelectionRef.current !== null || renderGeneration !== operationGeneration.current) return;
    startOperation('recall', current.onRecall);
  }, [startOperation, renderGeneration]);
  const batteryLabel = typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100
    ? `${Math.round(batteryPercent)}%`
    : typeof runtimeState?.battery?.voltageV === 'number' && Number.isFinite(runtimeState.battery.voltageV)
      ? `总线 ${runtimeState.battery.voltageV.toFixed(1)} V` : '电量未知';
  const manualStatus = productionInput ? (controlsEnabled ? '触屏控制已就绪' : '触屏控制未就绪') : __DEV__ && developmentInput
    ? (controlsEnabled ? '本地模拟就绪' : '本地模拟未就绪')
    : previewControlsEnabled ? '本地操作演示' : '手动控制未开放';
  const manualReason = controlsEnabled
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
  const manualPanelWidth = layout.useColumns && !auxiliaryExpanded
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
  const operationFeedback = controlSession?.error || faultFeedback || (operationInFlight
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
  const immersiveSpeedLabel = speed?.source === 'device' && typeof speed.linearMps === 'number' && Number.isFinite(speed.linearMps)
    ? `${speed.linearMps.toFixed(1)} m/s` : '—';
  const signalKnown = runtimeState?.signal?.source === 'device' || runtimeState?.signal?.source === 'controller';
  const immersiveSignalLabel = signalKnown && typeof runtimeState?.signal?.qualityPercent === 'number' && Number.isFinite(runtimeState.signal.qualityPercent)
    && runtimeState.signal.qualityPercent >= 0 && runtimeState.signal.qualityPercent <= 100
    ? `${Math.round(runtimeState.signal.qualityPercent)}%`
    : signalKnown && typeof runtimeState?.signal?.rssiDbm === 'number' && Number.isFinite(runtimeState.signal.rssiDbm)
      ? `${Math.round(runtimeState.signal.rssiDbm)} dBm` : '—';
  const immersiveBatteryKnown = typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100;
  const immersiveBusVoltageKnown = !immersiveBatteryKnown && runtimeState?.battery?.source === 'device'
    && typeof runtimeState.battery.voltageV === 'number' && Number.isFinite(runtimeState.battery.voltageV);
  const immersiveBatteryMetricLabel = immersiveBatteryKnown ? '电量' : immersiveBusVoltageKnown ? '总线电压' : '电量';
  const immersiveBatteryLabel = immersiveBatteryKnown
    ? `${Math.round(batteryPercent as number)}%`
    : immersiveBusVoltageKnown ? `${(runtimeState?.battery?.voltageV as number).toFixed(1)} V` : '—';
  const speedSourceLabel = speed?.source === 'device' ? '设备状态' : speed?.source === 'command' ? '最近指令' : '未同步';
  const terrainMode = runtimeState?.terrainMode;
  const terrainModeOptions = getControlTerrainModeOptions(runtimeState);
  const terrainModeCurrent = terrainMode?.current;
  const terrainModeLabel = CONTROL_TERRAIN_MODE_OPTIONS.find(option => option.id === terrainModeCurrent)?.label ?? '未同步';
  const terrainModeCatalogReady = terrainMode?.catalogStatus === 'synced';
  const terrainModeBlockedReason = terrainModeCatalogReady
    ? '模式切换通道未接入，当前仅显示 Brainstem 策略映射。'
    : 'Brainstem 未同步可验证的运动模式策略。';
  const deviceIdentityLabel = runtimeState?.deviceIdentity === 'verified'
    ? '已验证' : runtimeState?.deviceIdentity === 'bound-unverified'
      ? '待验证' : runtimeState?.deviceIdentity === 'unbound' ? '未绑定' : '未知';
  const faultLabel = runtimeState?.faultStatus === 'clear' ? '无故障' : runtimeState?.faultStatus === 'active' ? '有故障' : '未同步';
  const statusItems = [
    { id: 'identity', label: '设备身份', value: deviceIdentityLabel },
    { id: 'connection', label: '连接状态', value: directConnection ? directConnection.fresh ? '只读已响应' : '需重新检查' : connected ? '已连接' : '未连接' },
    { id: 'authority', label: '控制权', value: runtimeState?.controlAuthority === 'held' ? '已取得' : runtimeState?.controlAuthority === 'not-held' ? '未取得' : '待核验' },
    { id: 'fault', label: '故障状态', value: faultLabel },
  ];
  const statusSummary = [
    runtimeState?.controlLink === 'connected' ? '控制链路已接通' : runtimeState?.controlLink === 'disconnected' ? '控制链路未接通' : '控制链路未核验',
    runtimeState?.controlAuthority === 'held' ? '已取得控制权' : runtimeState?.controlAuthority === 'not-held' ? '未取得控制权' : '控制权待核验',
    runtimeState?.posture === 'standing' ? '当前站立' : runtimeState?.posture === 'sitting' ? '当前坐下' : '姿态未知',
    runtimeState?.motorState === 'enabled' ? '电机已使能' : runtimeState?.motorState === 'disabled' ? '电机已失能' : '电机状态未知',
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
  const hudSurface = isDark ? 'rgba(17,17,19,0.84)' : 'rgba(255,255,255,0.84)';
  const hudHeaderSurface = isDark || (video?.phase === 'receiving' && videoSurface != null) ? hudSurface : 'transparent';
  const hudBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.56)';
  const immersiveJoystickSize = viewport.width > 0 && immersiveCanvasHeight > 0
    ? Math.min(170, Math.floor(Math.min(viewport.width * 0.15, immersiveCanvasHeight * 0.32)))
    : 0;
  // Keep both input discs inside the measured area, clear of HUD and actions.
  const immersiveJoystickGap = Math.max(20, viewport.width - immersiveJoystickSize * 2 - 48);
  const hudFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const baseActionDockInset = 64 + 6 + Math.ceil(22 * hudFontScale) + 24;
  const actionDockInset = baseActionDockInset + (operationFeedback ? Math.ceil(36 * hudFontScale) + 12 : 0);
  const immersiveRobotName = robotName.replace(/^THUNDER[\s-]+(\d+)$/i, 'THUNDER-$1');
  const compactHeaderActions = (viewport.width || width) < 960;
  const stackHudMetrics = (viewport.width || width) < 700 || hudFontScale > 1.15;
  const hudHeaderHeight = Math.max(48, Math.ceil(42 * hudFontScale) + 12);
  const hudMetricsTop = 14 + hudHeaderHeight + 10;
  const hudMetricsHeight = Math.ceil(50 * hudFontScale) + 12;
  const immersiveTopInset = stackHudMetrics ? Math.max(156, hudMetricsTop + hudMetricsHeight + 36) : Math.max(112, hudHeaderHeight + 56);
  const configuredWidth = layout.useColumns ? stickArea.width || Math.max(0, viewport.width - 40) : Math.max(0, layout.manualPanelWidth - 24);
  const configuredHeight = layout.useColumns ? stickArea.height || Math.max(0, immersiveCanvasHeight - immersiveTopInset - actionDockInset) : Math.min(240, Math.max(layout.joystickSize, viewport.height - 340));
  const configuredBaseSize = layout.useColumns ? immersiveJoystickSize : layout.joystickSize;
  // The label follows a 10 dp gap and a 24 dp line that scales with text size.
  const joystickLabelReserve = layout.useColumns ? 0 : Math.ceil(10 + 24 * (Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1));
  const configuredJoystickLayout = resolveJoystickLayout(joystickPreferences[orientation], { width: configuredWidth, height: Math.max(0, configuredHeight - joystickLabelReserve), baseSize: configuredBaseSize });
  const layoutCanvasDiscs = resolveJoystickLayout(joystickPreferences[orientation], { ...layoutCanvas, baseSize: Math.min(144, layoutCanvas.width * 0.22) });
  const renderControlLease = (unframed = false) => controlSession ? <Pressable
    accessibilityRole="button"
    accessibilityLabel={controlSession.leaseActive ? '释放控制' : '启用控制'}
    accessibilityState={{ disabled: controlSession.busy || (!controlSession.leaseActive && !controlSession.canAcquire) }}
    disabled={joystickSettingsOpen || controlSession.busy || (!controlSession.leaseActive && !controlSession.canAcquire)}
    onPress={() => { if (!layoutEditingRef.current) (controlSession.leaseActive ? controlSession.onRelease : controlSession.onAcquire)(); }}
    testID="control-lease"
    style={({ pressed }) => [unframed ? styles.immersiveToolbarControl : styles.immersiveConnectionPill,
      unframed && compactHeaderActions && styles.immersiveToolbarControlCompact,
      { backgroundColor: unframed ? controlSession.leaseActive ? appearance.action : hudHeaderSurface : controlSession.leaseActive ? appearance.action : appearance.surface,
        borderColor: unframed ? hudBorder : 'transparent' }, pressed && styles.pressed]}
  ><Ionicons name={controlSession.leaseActive ? 'lock-open-outline' : 'key-outline'} size={unframed ? 24 : 18} color={appearance.blueInk} />
    <Text style={[unframed ? styles.immersiveToolbarText : styles.caption, unframed && compactHeaderActions && styles.immersiveToolbarTextCompact, { color: unframed && controlSession.leaseActive ? appearance.blueInk : appearance.ink }]}>{controlSession.leaseActive ? '释放控制' : '启用控制'}</Text>
  </Pressable> : null;
  const modeReadiness = getControlOperationReadiness({ action: 'switchPolicy', readiness: operationReadiness,
    callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null });
  const renderImmersiveIntent = () => selectingPolicy ? <>
    <Pressable testID="control-mode-dismiss" accessibilityRole="button" accessibilityLabel="关闭模式菜单"
      onPress={revokeOperationIntent} style={styles.modeMenuDismiss} />
    <Animated.View testID="control-mode-menu" style={[styles.modeMenu, { backgroundColor: appearance.raised,
      opacity: modeMenuMotion, transform: [{ translateY: modeMenuMotion.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      <ScrollView horizontal={!customPolicyCatalog} style={customPolicyCatalog ? { maxHeight: Math.max(160, (immersiveCanvasHeight || height) - 180), maxWidth: 340 } : undefined}
        contentContainerStyle={{ flexDirection: customPolicyCatalog ? 'column' : 'row' }}>
      {terrainPolicies.map(option => <Pressable
        key={option.id} testID={`control-mode-${option.id}`} accessibilityRole="button"
        accessibilityHint={!modeReadiness.ready ? modeReadiness.blockedReason : !option.profileId ? '机器人未提供此模式' : undefined}
        disabled={!modeReadiness.ready || !option.profileId || option.selected}
        accessibilityState={{ disabled: !modeReadiness.ready || !option.profileId || option.selected, selected: option.selected }}
        onPress={() => { if (option.profileId) runOperation('switchPolicy', renderGeneration, option.profileId); }}
        style={[styles.modeMenuOption, { backgroundColor: option.selected ? appearance.action : 'transparent' }]}>
        <Text style={[styles.label, { color: option.selected ? appearance.actionInk : option.profileId ? appearance.ink : appearance.secondary }]}>{option.label.replace(/模式$/, '')}</Text>
      </Pressable>)}
      </ScrollView>
    </Animated.View>
  </> : !visibleConfirmation ? null : <View
    style={[styles.immersiveIntent, { backgroundColor: appearance.surface, maxHeight: Math.max(160, (immersiveCanvasHeight || height) - 96) }]}>
    {visibleConfirmation ? <>
      <Text style={[styles.label, { color: appearance.ink }]}>确认{controlOperationLabels[visibleConfirmation.action]}{visibleConfirmation.policyId ? `：${policyOptions.find(option => option.id === visibleConfirmation.policyId)?.label ?? ''}` : ''}</Text>
      <Text style={[styles.caption, { color: appearance.secondary }]}>{visibleConfirmation.action === 'disableMotor' ? '失能后设备可能失去支撑，请确认已固定。' : '请确认机器狗周围安全，急停可用。'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="确认操作" testID="control-immersive-confirm" style={[styles.operationButton, { backgroundColor: appearance.action }]}
        onPress={() => runOperation(visibleConfirmation.action, visibleConfirmation.generation, visibleConfirmation.policyId, visibleConfirmation)}><Text style={[styles.label, { color: appearance.actionInk }]}>确认操作</Text></Pressable>
    </> : null}
    <Pressable accessibilityRole="button" onPress={revokeOperationIntent} style={styles.operationButton}><Text style={[styles.label, { color: appearance.ink }]}>取消</Text></Pressable>
  </View>;
  const renderMinimalAction = (action: ControlOperation, label = controlOperationLabels[action]) => {
    const readiness = visibleConfirmation || selectingPolicy
      ? { ready: false, blockedReason: '请先确认或取消当前操作。' }
      : getControlOperationReadiness({ action, readiness: operationReadiness, callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null });
    const state = operationStateFor(action, readiness);
    const statusBusy = ['submitted', 'accepted', 'executing'].includes(state.status);
    const disabled = !readiness.ready || statusBusy;
    const detail = state.detail ?? readiness.blockedReason;
    const isStop = action === 'stop';
    const icon = action === 'stand' ? 'arrow-up-outline' : action === 'sit' ? 'arrow-down-outline' : action === 'stop' ? 'stop-circle-outline' : action === 'enableMotor' ? 'flash-outline' : action === 'disableMotor' ? 'flash-off-outline' : 'options-outline';
    const iconColor = isStop ? colors.dangerText : readiness.ready && !statusBusy ? appearance.blueInk : appearance.secondary;
    return <View key={action} style={styles.immersiveActionItem}>
      <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityHint={detail} accessibilityState={{ disabled, busy: statusBusy }} accessibilityValue={{ text: controlOperationStatusLabels[state.status] }} disabled={disabled} onPress={() => runOperation(action, renderGeneration)} testID={`control-action-${action}`} style={({ pressed }) => [styles.immersiveActionButton, { opacity: disabled ? 0.72 : 1 }, pressed && styles.pressed]}>
        <View pointerEvents="none" testID={`control-action-circle-${action}`} style={[styles.immersiveActionCircle, { backgroundColor: isStop ? colors.dangerSurface : hudSurface }]}>
          <Ionicons color={iconColor} name={isStop ? 'stop' : icon} size={28} />
        </View>
        <Text accessible={false} style={[styles.immersiveActionLabel, { color: iconColor }]}>{label}</Text>
      </Pressable>
    </View>;
  };

  const renderMotorToggle = () => {
    const readiness = motorTarget ? getControlOperationReadiness({ action: motorTarget, readiness: operationReadiness,
      callbacks: operationCallbacks, runtimeState, foreground: appActive, leaving, inFlight: operationInFlight !== null })
      : { ready: false, blockedReason: '电机状态未知，请先连接并读取设备状态。' };
    const statusBusy = (['enableMotor', 'disableMotor'] as const).some(action => {
      const status = operationStateFor(action, { ready: true }).status;
      return ['submitted', 'accepted', 'executing'].includes(status)
        && observedMotorState !== (action === 'enableMotor' ? 'enabled' : 'disabled');
    });
    const disabled = !motorTarget || !readiness.ready || statusBusy || Boolean(visibleConfirmation || selectingPolicy);
    const enabled = observedMotorState === 'enabled';
    const known = observedMotorState !== 'unknown';
    const stateLabel = enabled ? '已使能' : known ? '已失能' : '状态未知';
    const background = enabled ? appearance.action : known ? isDark ? appearance.raised : appearance.ink : appearance.surface;
    const foreground = enabled ? appearance.actionInk : known ? isDark ? appearance.ink : appearance.canvas : appearance.secondary;
    // The target belongs to this render/confirmation. ACKs never flip this state.
    return <View style={styles.immersiveActionItem}>
      <Pressable testID="control-motor-toggle" accessibilityRole="switch" aria-checked={known ? enabled : undefined} accessibilityLabel={motorTarget ? controlOperationLabels[motorTarget] : '电机状态未知'}
        accessibilityState={{ checked: known ? enabled : undefined, disabled, busy: statusBusy || operationInFlight === 'enableMotor' || operationInFlight === 'disableMotor' }}
        accessibilityValue={{ text: stateLabel }} accessibilityHint={readiness.blockedReason}
        disabled={disabled} onPress={() => { if (motorTarget) runOperation(motorTarget, renderGeneration); }}
        style={({ pressed }) => [styles.immersiveActionButton, { opacity: known ? 1 : 0.65 }, pressed && styles.pressed]}>
        <View pointerEvents="none" testID="control-motor-toggle-circle" style={[styles.immersiveActionCircle, { backgroundColor: background }]}>
          <Ionicons name="power" size={28} color={foreground} />
        </View>
        <Text accessible={false} style={[styles.immersiveActionLabel, { color: appearance.secondary }]}>
          {statusBusy || operationInFlight === 'enableMotor' || operationInFlight === 'disableMotor' ? '待确认' : known ? stateLabel : '电机'}
        </Text>
      </Pressable>
    </View>;
  };

  const renderImmersiveTelemetry = () => <View style={[styles.immersiveTelemetry, compactHeaderActions && styles.immersiveTelemetryCompact]} testID="control-telemetry">
    {[
      { id: 'speed', label: '速度', value: immersiveSpeedLabel, icon: 'speedometer-outline' as const },
      { id: 'battery', label: immersiveBatteryMetricLabel, value: immersiveBatteryLabel, icon: 'battery-half-outline' as const },
      { id: 'signal', label: '信号', value: immersiveSignalLabel, icon: 'wifi-outline' as const },
    ].map(item => <View key={item.id} style={[styles.immersiveTelemetryItem, compactHeaderActions && styles.immersiveTelemetryItemCompact, { backgroundColor: hudHeaderSurface }]} testID={`control-telemetry-${item.id}`}>
      {!compactHeaderActions ? <Ionicons name={item.icon} size={22} color={appearance.blueInk} /> : null}
      <View style={styles.immersiveTelemetryCopy}>
        <Text style={[styles.immersiveTelemetryLabel, { color: appearance.secondary }]}>{item.label}</Text>
        <Text style={[styles.immersiveTelemetryValue, { color: appearance.ink }]}>{item.value}</Text>
      </View>
    </View>)}
  </View>;

  const renderImmersiveSurface = () => <View style={[styles.immersiveSurface, { backgroundColor: appearance.canvas, height: immersiveCanvasHeight }]} testID="control-immersive-surface">
    <View pointerEvents="none" style={styles.immersiveMedia} testID="control-media-stage">
      <ControlVideoSurface presentation={video} surface={videoSurface} active={appActive && !leaving} onInterrupted={handleCancel} />
    </View>
    <View style={styles.immersiveTopBar}>
      <View style={styles.immersiveHeaderIdentity}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={handleBack} style={({ pressed }) => [styles.immersiveToolbarIcon, { backgroundColor: hudHeaderSurface }, pressed && styles.pressed]} testID="control-back">
          <Ionicons color={appearance.ink} name="arrow-back" size={24} />
        </Pressable>
        <Pressable accessibilityLabel={`设备连接${immersiveConnectionLabel}`} accessibilityRole="button" accessibilityState={{ disabled: !(onOpenConnection || onOpenConnectionDiagnostics) }} disabled={!(onOpenConnection || onOpenConnectionDiagnostics)} onPress={() => openView(onOpenConnection || onOpenConnectionDiagnostics)} style={({ pressed }) => [styles.immersiveDeviceTitle, { backgroundColor: hudHeaderSurface }, pressed && styles.pressed]} testID="control-open-connection">
          <Text accessibilityRole="header" numberOfLines={1} ellipsizeMode="tail" style={[styles.immersiveSectionTitle, { color: appearance.ink }]} testID="control-device-title-text">{immersiveRobotName}</Text>
          <View style={styles.immersiveConnectionStatus}>
            <View style={[styles.immersiveConnectionDot, { backgroundColor: immersiveConnectionReady ? appearance.blueInk : appearance.secondary }]} />
            <Text style={[styles.caption, { color: appearance.secondary }]}>{immersiveConnectionLabel}</Text>
          </View>
        </Pressable>
      </View>
      {!stackHudMetrics ? renderImmersiveTelemetry() : null}
      <View style={[styles.immersiveHeaderActions, compactHeaderActions && styles.immersiveHeaderActionsCompact]} testID="control-header-actions">
        {controlSession ? renderControlLease(true) : null}
        <Pressable accessibilityLabel="摇杆布局设置" accessibilityRole="button" onPress={openJoystickSettings} style={({ pressed }) => [styles.immersiveToolbarIcon, { backgroundColor: hudHeaderSurface }, pressed && styles.pressed]} testID="control-open-joystick-layout"><Ionicons color={appearance.ink} name="options-outline" size={24} /></Pressable>
        {g20Controller ? <Pressable accessibilityLabel="遥控器输入设置" accessibilityRole="button" onPress={openInputSettings} style={({ pressed }) => [styles.immersiveToolbarIcon, { backgroundColor: hudHeaderSurface }, pressed && styles.pressed]} testID="control-open-input">
          <Ionicons color={selectedInputSource === 'physical' ? appearance.blueInk : appearance.ink} name="game-controller-outline" size={24} />
        </Pressable> : null}
      </View>
    </View>
    {stackHudMetrics ? <View style={[styles.immersiveCompactTelemetry, { top: hudMetricsTop }]} testID="control-compact-telemetry">{renderImmersiveTelemetry()}</View> : null}

    <View onLayout={handleStickArea} style={[styles.immersiveSticks, { top: immersiveTopInset, bottom: actionDockInset }]} testID="control-immersive-sticks">
      {configuredJoystickLayout.usable ? <ControlJoystickPair
        disabled={!controlsEnabled || selectedInputSource !== 'touch'}
        floating
        variant="glass"
        onCancel={handleCancel}
        gap={immersiveJoystickGap}
        left={{ axis: 'xy', label: '移动', onActiveChange: setDriveActive, onChange: productionInput || developmentInput ? handleDrive : ignoreLocalInput, onSample: productionInput ? handleDrive : undefined, testID: 'control-drive-stick' }}
        resetKey={resetKey}
        right={{ axis: 'x', label: '转向', onActiveChange: setTurnActive, onChange: productionInput || developmentInput ? handleTurn : ignoreLocalInput, onSample: productionInput ? handleTurn : undefined, testID: 'control-turn-stick' }}
        showLabels={false}
        size={immersiveJoystickSize}
        layout={configuredJoystickLayout}
        touchAreaHeight={configuredHeight}
        touchAreaWidth={configuredWidth}
      /> : null}
    </View>
    <View style={styles.immersiveActionDock} testID="control-action-dock">
      {renderMinimalAction('stop', '软件急停')}
      {renderMinimalAction('stand')}
      {renderMinimalAction('sit')}
      {renderMotorToggle()}
    </View>
    <Pressable testID="control-open-policy" accessibilityRole="button" accessibilityLabel="切换控制策略模式"
      accessibilityState={{ expanded: selectingPolicy }}
      onPress={() => {
        if (selectingPolicy) { revokeOperationIntent(); return; }
        handleCancel();
        policySelectionRef.current = operationGeneration.current;
        setPolicySelection(operationGeneration.current);
      }} style={({ pressed }) => [styles.immersiveSideEntry, { left: 20, backgroundColor: hudHeaderSurface, zIndex: selectingPolicy ? 10 : 4 }, pressed && styles.pressed]}>
      <Ionicons name="options-outline" size={22} color={appearance.blueInk} />
      <Text style={[styles.immersiveActionLabel, { color: appearance.blueInk }]}>模式</Text>
    </Pressable>
    <Pressable testID="control-open-diagnostics" accessibilityRole="button" accessibilityLabel="查看电机诊断"
      disabled={!onOpenJointStatus && !onOpenConnectionDiagnostics}
      accessibilityState={{ disabled: !onOpenJointStatus && !onOpenConnectionDiagnostics }}
      onPress={() => openView(onOpenJointStatus || onOpenConnectionDiagnostics)}
      style={({ pressed }) => [styles.immersiveSideEntry, { right: 20, backgroundColor: hudHeaderSurface }, pressed && styles.pressed]}>
      <Ionicons name="pulse-outline" size={22} color={appearance.blueInk} />
      <Text style={[styles.immersiveActionLabel, { color: appearance.blueInk }]}>诊断</Text>
    </Pressable>
    <Pressable testID="control-open-gestures" accessibilityRole="button" accessibilityLabel="打开动作库"
      onPress={() => { physicalContext.current.allowed = false; handleCancel(); setGestureLibraryOpen(true); }}
      style={({ pressed }) => [styles.immersiveSideEntry, { left: 96, backgroundColor: hudHeaderSurface }, pressed && styles.pressed]}>
      <Ionicons name="body-outline" size={22} color={appearance.blueInk} />
      <Text style={[styles.immersiveActionLabel, { color: appearance.blueInk }]}>动作</Text>
    </Pressable>
    {operationFeedback ? <View pointerEvents="none" style={[styles.immersiveFeedback, { bottom: baseActionDockInset - 4, backgroundColor: hudSurface, borderColor: hudBorder }]} testID="control-operation-feedback">
      <Text accessibilityLiveRegion={operationFeedbackIsError ? 'assertive' : 'polite'} numberOfLines={2} style={[styles.caption, { color: operationFeedbackIsError ? colors.dangerText : appearance.secondary, textAlign: 'center' }]}>{operationFeedback}</Text>
    </View> : null}
    {renderImmersiveIntent()}
  </View>;

  if (gestureLibraryOpen) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: appearance.canvas }]} testID="control-gesture-library">
    <View style={styles.gestureHeader}>
      <Pressable testID="control-close-gestures" accessibilityRole="button" accessibilityLabel="返回控制页"
        onPress={() => { handleCancel(); setGestureLibraryOpen(false); }} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={appearance.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>动作库</Text>
    </View>
    <View style={styles.gestureEmpty}>
      <Ionicons name="body-outline" size={36} color={appearance.secondary} />
      <Text style={[styles.label, { color: appearance.ink }]}>动作库暂不可用</Text>
      <Text style={[styles.caption, { color: appearance.secondary }]}>机器人扩展动作尚未接入</Text>
    </View>
  </SafeAreaView>;
  if (joystickSettingsOpen) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: appearance.canvas }]}>
    <View style={[styles.layoutEditor, isLandscape && styles.layoutEditorWide]}>
      <View style={[styles.layoutCanvas, !isLandscape && styles.layoutCanvasPortrait]} testID="joystick-layout-canvas" onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (Number.isFinite(width) && Number.isFinite(height)) setLayoutCanvas({ width: Math.max(0, width), height: Math.max(0, height) });
      }}>
        {(['left', 'right'] as const).map(side => {
          const disc = layoutCanvasDiscs[side];
          return <View key={side} pointerEvents="none" testID={`joystick-layout-disc-${side}`} style={[styles.layoutDisc, { left: disc.left, top: disc.top, width: disc.size, height: disc.size, borderRadius: disc.size / 2, borderColor: appearance.blueInk }]}>
            <Text style={[styles.caption, { color: appearance.ink }]}>{side === 'left' ? '移动' : '转向'}</Text>
          </View>;
        })}
      </View>
      <View style={styles.layoutSettingsColumn}>
        {controlSession?.error ? <Text accessibilityLiveRegion="assertive" style={[styles.caption, { color: colors.dangerText }]}>{controlSession.error}</Text> : null}
        <JoystickLayoutSettings key={`${orientation}-${layoutEditorGeneration}`} orientation={orientation} layout={joystickPreferences[orientation]} onPreview={previewJoystickLayout} onChange={changeJoystickLayout} onReset={restoreJoystickLayout} onClose={closeJoystickSettings} storageError={layoutStorageError} />
        {layoutStorageError ? <Pressable accessibilityRole="button" onPress={() => persistJoystickLayout(joystickPreferencesRef.current)} style={styles.layoutRetry} testID="joystick-layout-retry"><Text style={[styles.caption, { color: appearance.blueInk }]}>重试保存</Text></Pressable> : null}
      </View>
    </View>
  </SafeAreaView>;
  if (inputSettingsOpen && g20Controller) return <G20InputPanel
    state={g20Controller.state} source={selectedInputSource}
    onStart={() => { handleCancel(); g20Controller.start(); }}
    onStop={() => { handleCancel(); g20Controller.stop(); }}
    onBeginCalibration={() => { handleCancel(); g20Controller.beginCalibration(); }}
    onLearnAxis={axis => { handleCancel(); g20Controller.learnAxis(axis); }}
    onLearnButton={action => { handleCancel(); g20Controller.learnButton(action); }}
    onFinishCalibration={() => { handleCancel(); g20Controller.finishCalibration(); }}
    onClearCalibration={() => { handleCancel(); g20Controller.clearCalibration(); }}
    onSourceChange={setInputSource} onClose={() => { handleCancel(); setInputSettingsOpen(false); }}
  />;
  return (
    <SafeAreaView edges={__DEV__ && developmentInput ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: layout.useColumns ? colors.surfaceStrong : colors.background }]}>
      <View onLayout={handleLayout} onTouchCancel={handleCancel} style={styles.viewport} testID="control-surface">
        {layout.useColumns ? renderImmersiveSurface() : <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
          contentInsetAdjustmentBehavior="automatic"
          scrollEnabled={!anyJoystickActive}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
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
          <View style={[styles.statusSummary, layout.useColumns && styles.statusSummaryCompact]} testID="control-runtime-summary">
            {layout.useColumns ? <>
              {statusItems.slice(0, 3).map(item => <Text key={item.id} style={[styles.compactStatus, { color: colors.muted }]}>{item.label}：{item.value}</Text>)}
              <Pressable accessibilityRole="button" accessibilityLabel={statusDetailsExpanded ? '收起状态详情' : '展开状态详情'} onPress={() => setStatusDetailsExpanded(value => !value)} style={styles.statusDetailsButton} testID="control-status-details">
                <Text style={[styles.caption, { color: appearance.blueInk }]}>{statusDetailsExpanded ? '收起' : '状态详情'}</Text>
                <Ionicons color={appearance.blueInk} name={statusDetailsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
              </Pressable>
            </> : statusSummary.map(status => <Text key={status} style={[styles.caption, { color: colors.muted }]}>{status}</Text>)}
          </View>
          {(!layout.useColumns || statusDetailsExpanded) ? <View style={[styles.statusGrid, layout.useColumns && styles.statusGridCompact]} testID="control-status-grid">
            {statusItems.map(item => <View key={item.id} style={[styles.statusCell, { backgroundColor: appearance.surface }]}>
              <Text style={[styles.statusCellLabel, { color: colors.muted }]}>{item.label}</Text>
              <Text style={[styles.statusCellValue, { color: colors.ink }]}>{item.value}</Text>
            </View>)}
          </View> : null}
          <View style={[styles.integrationCard, layout.useColumns && styles.integrationCardCompact, { backgroundColor: appearance.surface }]} testID="control-brainstem-readiness">
            <View style={styles.integrationHeading}>
              <View style={styles.integrationHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>{layout.useColumns ? '控制链路' : 'Brainstem 控制门禁'}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{layout.useColumns ? integration.controlLabel : `${integration.readOnlyLabel}，${integration.controlLabel}`}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={integrationExpanded ? '收起 Brainstem 门禁详情' : '展开 Brainstem 门禁详情'} onPress={() => setIntegrationExpanded(value => !value)} style={styles.integrationDetailsButton} testID="control-brainstem-details">
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
              {layout.useColumns ? <Pressable accessibilityRole="button" accessibilityLabel={actionReasonsExpanded ? '隐藏动作未接入原因' : '查看动作未接入原因'} onPress={() => setActionReasonsExpanded(value => !value)} style={styles.collapseButton} testID="control-action-reasons">
                <Text style={[styles.caption, { color: appearance.blueInk }]}>{actionReasonsExpanded ? '隐藏原因' : '原因'}</Text>
              </Pressable> : null}
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
                  <Text style={[styles.actionStatus, layout.useColumns && styles.actionStatusCompact, { color: state.status === 'failed' || state.status === 'timeout' ? colors.dangerText : colors.muted }]} testID={`control-action-status-${action}`}>{controlOperationStatusLabels[state.status]}{detail && (!layout.useColumns || actionReasonsExpanded) ? `，${detail}` : ''}</Text>
                </View>;
              })}
              </View>
            </View>)}
          </View>
          {layout.useColumns ? <Pressable accessibilityRole="button" accessibilityLabel={secondaryActionsExpanded ? '收起附加动作' : '展开附加动作'} onPress={() => setSecondaryActionsExpanded(value => !value)} style={[styles.secondaryActionsToggle, { backgroundColor: appearance.surface }]} testID="control-secondary-actions-toggle">
            <Text style={[styles.caption, { color: appearance.blueInk }]}>{secondaryActionsExpanded ? '收起附加动作' : '更多动作（电机与策略）'}</Text>
            <Ionicons color={appearance.blueInk} name={secondaryActionsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
          </Pressable> : null}
          </> : null}
          {!visibleConfirmation && !selectingPolicy && !actionsExpanded ? <Text style={[styles.caption, styles.collapsedHint, { color: colors.muted }]} testID="control-action-collapsed">动作区已折叠；点击“展开”查看每项状态和未接入原因。</Text> : null}
          {selectingPolicy ? <View style={[styles.confirmation, { backgroundColor: appearance.surface }]} testID="control-policy-selection">
            <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>选择控制策略模型</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>选择运行策略。</Text>
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
            {(!layout.useColumns || auxiliaryExpanded) ? renderWorkspacePane('map', layout.mapPanelWidth,
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
              {layout.useColumns && !auxiliaryExpanded ? <View style={[styles.secondaryNavigation, { backgroundColor: appearance.surface }]} testID="control-secondary-navigation">
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
                    const unavailable = !available || !terrainModeCatalogReady;
                    return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`运动模式${option.label}`} accessibilityHint={unavailable ? terrainModeBlockedReason : '模式切换通道未接入，当前仅可查看。'} accessibilityState={{ disabled: true, selected }} disabled style={[styles.terrainModeOption, { backgroundColor: selected ? appearance.action : colors.surfaceStrong, borderColor: selected ? appearance.blueInk : appearance.border, opacity: unavailable ? 0.55 : 1 }]} testID={`control-terrain-mode-${option.id}`}>
                      <Text style={[styles.caption, { color: selected ? appearance.actionInk : colors.ink }]}>{option.label}</Text>
                    </Pressable>;
                  })}
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
                {!layout.useColumns ? <Text style={[styles.caption, { color: colors.muted }]}>速度未同步</Text> : null}
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
                  disabled={!controlsEnabled || selectedInputSource !== 'touch'}
                  onCancel={handleCancel}
                  gap={layout.joystickGap}
                  left={{ axis: 'xy', label: '移动', onActiveChange: setDriveActive, onChange: productionInput || developmentInput ? handleDrive : ignoreLocalInput, onSample: productionInput ? handleDrive : undefined, testID: 'control-drive-stick' }}
                  resetKey={resetKey}
                  right={{ axis: 'x', label: '转向', onActiveChange: setTurnActive, onChange: productionInput || developmentInput ? handleTurn : ignoreLocalInput, onSample: productionInput ? handleTurn : undefined, testID: 'control-turn-stick' }}
                  showLabels={true}
                  size={layout.joystickSize}
                  layout={configuredJoystickLayout}
                  touchAreaWidth={configuredWidth}
                  touchAreaHeight={configuredHeight}
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
  layoutEditor: { flex: 1, padding: 12, gap: 12, alignItems: 'center' },
  layoutEditorWide: { flexDirection: 'row', alignItems: 'stretch' },
  layoutCanvas: { flex: 1, width: '100%', position: 'relative', overflow: 'hidden' },
  layoutCanvasPortrait: { flex: 0, height: 170 },
  layoutDisc: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  layoutSettingsColumn: { flex: 1, width: '100%', maxWidth: 380, minHeight: 0 },
  layoutRetry: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  immersiveIntent: { position: 'absolute', top: 80, left: '50%', width: 320, transform: [{ translateX: -160 }], padding: 12, gap: 8, borderRadius: 16, zIndex: 9 },
  modeMenuDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8 },
  modeMenu: { position: 'absolute', left: 20, bottom: 96, flexDirection: 'row', padding: 4, gap: 4, borderRadius: 16, zIndex: 9,
    shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  modeMenuOption: { minWidth: 88, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 4, paddingBottom: 16 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 12, minHeight: 56 },
  back: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48, borderRadius: 24 },
  identity: { flex: 1, minWidth: 0 },
  title: { ...typography.compactTitle },
  label: { ...typography.label },
  caption: { ...typography.caption },
  connection: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  statusSummary: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginBottom: 12 },
  statusSummaryCompact: { alignItems: 'center', columnGap: 10, marginBottom: 6 },
  compactStatus: { ...typography.caption, flexShrink: 1 },
  statusDetailsButton: { alignItems: 'center', flexDirection: 'row', gap: 2, minHeight: 30, paddingHorizontal: 4 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  statusGridCompact: { marginBottom: 7 },
  statusCell: { borderRadius: 14, flexBasis: 108, flexGrow: 1, gap: 2, minHeight: 48, paddingHorizontal: 9, paddingVertical: 7 },
  statusCellLabel: { ...typography.caption },
  statusCellValue: { ...typography.supporting, fontWeight: '700' },
  workspace: { alignItems: 'stretch' },
  workspacePane: { flexGrow: 0, flexShrink: 0 },
  operationGroups: { gap: 12, marginBottom: 12 },
  operationHeader: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10 },
  operationHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  operationHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  collapseButton: { alignItems: 'center', flexDirection: 'row', gap: 3, minHeight: 40, paddingHorizontal: 6 },
  collapsedHint: { marginBottom: 12, paddingHorizontal: 4 },
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
  immersiveMedia: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  immersiveTopBar: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', left: 16, position: 'absolute', right: 16, top: 16, zIndex: 3 },
  immersiveHeaderIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  immersiveDeviceTitle: { borderRadius: 24, flexShrink: 1, justifyContent: 'center', maxWidth: 240, minHeight: 48, minWidth: 112, paddingHorizontal: 12, paddingVertical: 4 },
  immersiveConnectionStatus: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  immersiveHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  immersiveHeaderActionsCompact: { gap: 4 },
  immersiveToolbarControl: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 6, minHeight: 48, minWidth: 48, paddingHorizontal: 12 },
  immersiveToolbarControlCompact: { paddingHorizontal: 6 },
  immersiveToolbarIcon: { alignItems: 'center', borderRadius: 24, justifyContent: 'center', height: 48, width: 48 },
  immersiveToolbarText: { fontSize: 14, fontWeight: '500', lineHeight: 22 },
  immersiveToolbarTextCompact: { fontSize: 14, lineHeight: 22 },
  immersiveRoundButton: { alignItems: 'center', borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  immersiveSectionTitle: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  immersiveConnectionPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 11 },
  immersiveConnectionDot: { borderRadius: 4, height: 8, width: 8 },
  immersiveTelemetry: { alignItems: 'center', flexDirection: 'row', gap: 8, flexShrink: 0 },
  immersiveTelemetryCompact: { gap: 4 },
  immersiveCompactTelemetry: { alignItems: 'center', left: 16, position: 'absolute', right: 16, zIndex: 3 },
  immersiveTelemetryItem: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 10, minHeight: 48, minWidth: 96, paddingHorizontal: 14, paddingVertical: 4 },
  immersiveTelemetryItemCompact: { minWidth: 66, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  immersiveTelemetryCopy: { minWidth: 30 },
  immersiveTelemetryLabel: { fontSize: 12, lineHeight: 18 },
  immersiveTelemetryValue: { fontSize: 18, fontWeight: '600', lineHeight: 24, minWidth: 25, fontVariant: ['tabular-nums'] },
  immersiveSticks: { alignItems: 'center', bottom: 116, left: 20, position: 'absolute', right: 20, top: 156, zIndex: 2 },
  immersiveActionDock: { alignItems: 'center', bottom: 16, flexDirection: 'row', gap: 16, justifyContent: 'center', left: '50%', minHeight: 92, position: 'absolute', transform: [{ translateX: -168 }], width: 336, zIndex: 4 },
  immersiveActionItem: { alignItems: 'center', minWidth: 72 },
  immersiveActionButton: { alignItems: 'center', gap: 6, justifyContent: 'center', minHeight: 92, minWidth: 72, paddingHorizontal: 4 },
  immersiveActionCircle: { alignItems: 'center', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  immersiveActionLabel: { fontSize: 14, fontWeight: '500', lineHeight: 22 },
  immersiveSideEntry: { position: 'absolute', bottom: 28, minWidth: 64, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, zIndex: 4 },
  immersiveFeedback: { alignItems: 'center', borderRadius: 14, borderWidth: 0.5, justifyContent: 'center', left: 24, right: 24, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, position: 'absolute', zIndex: 5 },
  pressed: { opacity: 0.55 },
});
