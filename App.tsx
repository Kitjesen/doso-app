import { setStatusBarStyle, StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Keyboard, Linking, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './src/components/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { images } from './src/assets';
import { useAuth } from './src/auth';
import { AppHeader } from './src/components/AppHeader';
import { AppToast, ToastNotice } from './src/components/AppToast';
import { notificationUnavailableNotice } from './src/components/notification-notice';
import { createDeviceBootstrapIntent } from './src/services/deviceBootstrapIntent';
import { BottomNav } from './src/components/BottomNav';
import { GradientButton } from './src/components/GradientButton';
import { createRobotDiagnosticsGateway } from './src/features/robot-lifecycle/robotDiagnosticsGateway';
import {
  createRobotCapabilityReadiness,
  type RobotCapability,
} from './src/features/robot-lifecycle/robotCapabilityReadiness';
import {
  createRobotCommandCoordinator,
  inspectRobotCommandSupport,
  type RobotCommandAttemptState,
  type RobotCommandExecutor,
  type RobotCommandPermissionSnapshot,
} from './src/features/robot-lifecycle/robotCommandExecutor';
import { readTrustedSafetyLock } from './src/features/robot-lifecycle/trustedSafetyLock';
import { useDirectRobotConnection } from './src/features/robot-lifecycle/useDirectRobotConnection';
import { describeDirectRobotConnection } from './src/services/directRobotConnection';
import { isBrainstemGrpcAvailable, isBrainstemLanAvailable } from './src/services/brainstemGrpc';
import { getBrainstemIntegrationReadiness } from './src/services/brainstemIntegrationReadiness';
import { getRobotModel, robotModels } from './src/models';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { AccountSecurityScreen } from './src/screens/AccountSecurityScreen';
import { BindDeviceScreen } from './src/screens/BindDeviceScreen';
import { BleDiscoveryScreen } from './src/screens/BleDiscoveryScreen';
import { ControlScreen } from './src/screens/ControlScreen';
import { DeviceTestScreen } from './src/screens/DeviceTestScreen';
import { useBrainstemControl } from './src/features/control/useBrainstemControl';
import { useG20Input } from './src/features/control/useG20Input';
import { useBrainstemTelemetry } from './src/features/control/useBrainstemTelemetry';
import { isBrainstemControlAvailable } from './src/services/brainstemControl';
import type { BrainstemGrpcEndpoint } from './src/services/brainstemGrpc';
import { ConnectionDiagnosticsScreen } from './src/screens/ConnectionDiagnosticsScreen';
import { DeviceEnrollmentScreen } from './src/screens/DeviceEnrollmentScreen';
import { RobotConnectionScreen } from './src/screens/RobotConnectionScreen';
import { DataPrivacyScreen } from './src/screens/DataPrivacyScreen';
import { DeviceUnavailableScreen } from './src/screens/DeviceUnavailableScreen';
import { DisplayNameConfirmationScreen } from './src/screens/DisplayNameConfirmationScreen';
import { EmailOtpScreen } from './src/screens/EmailOtpScreen';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { GuestScreen } from './src/screens/GuestScreen';
import { MapScreen } from './src/screens/MapScreen';
import { MfaSetupScreen, type MfaVerificationInput } from './src/screens/MfaSetupScreen';
import { createMfaVerificationFlow, type MfaVerificationReconcileState } from './src/auth/mfaVerificationFlow';
import { readAuthSessionIdentity } from './src/services/authSessionIdentity';
import { beginDeviceEnrollment, type DeviceEnrollmentSession } from './src/services/deviceEnrollmentService';
import { AuthCallbackCancelledError, createAuthCallbackInbox } from './src/services/authCallbackInbox';
import { getAuthSessionOperationSnapshot, isAuthSessionOperationBusyError } from './src/services/authSessionOperation';
import { verifyTotpEnrollment, verifyTotpFactor } from './src/services/mfaService';
import { ModelSelectScreen } from './src/screens/ModelSelectScreen';
import { JointStatusScreen } from './src/screens/JointStatusScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RegisterScreen, RegisterValues } from './src/screens/RegisterScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { UsernameOnboardingScreen } from './src/screens/UsernameOnboardingScreen';
import {
  authService,
  deviceRepository,
  isSupabaseConfigured,
  socialAuthService,
  SupabaseConfigurationError,
} from './src/services';
import type { SocialLoginProvider } from './src/services/socialAuthService';
import { resolveProfileAvatarUrl, saveProfileEdits, type ProfileEditInput } from './src/services/profileEditing';
import {
  consumeAppleDisplayRecovery,
  createAppleDisplayRecoveryOperationTracker,
  probeAppleDisplayRecovery,
  runAppleDisplayRecoveryConfirmation,
} from './src/services/appleDisplayRecoveryCore';
import {
  isAccountSessionOutcomeError,
  revokeAllTerminals,
  revokeAllTerminalsWithoutAudit,
  revokeCurrentTerminal,
  revokeCurrentTerminalWithoutAudit,
} from './src/services/sessionService';
import { useAppTheme } from './src/theme';
import { AppStage, MainTab, RobotModel } from './src/types';
import type { Device, DeviceSettingsUpdate, Profile, UsernameProvenance } from './src/types/api';
import { AuthOperationError } from './src/services/authOperationError';

const CLAIMED_USERNAME_PROVENANCES = new Set<UsernameProvenance>([
  'registration',
  'manual_claim',
  'admin_verified',
]);

const ROBOT_COMMAND_DEADLINE_MS = 15_000;
const BIND_DEVICE_TIMEOUT_MS = 15_000;
const PRODUCTION_ROBOT_COMMAND_EXECUTOR: RobotCommandExecutor | null = null;

function hasClaimedUsername(profile: Profile) {
  return Boolean(profile.username_claimed_at) && CLAIMED_USERNAME_PROVENANCES.has(profile.username_provenance);
}

function humanizeAuthError(error: unknown) {
  if (error instanceof SupabaseConfigurationError) {
    return '认证服务尚未配置。请先启动本地 Supabase 或填写托管项目环境变量。';
  }
  if (!(error instanceof Error)) return '操作失败，请稍后重试。';

  const message = error.message.toLowerCase();
  if (message.includes('failed to send a request to the edge function')) return '暂时无法连接账户会话服务。请重新尝试，或退出本机账户后重新登录。';
  if (message.includes('invalid login credentials')) return '邮箱或密码错误。';
  if (message.includes('email not confirmed')) return '请先输入邮件中的完整验证码确认邮箱。';
  if (message.includes('user already registered')) return '无法完成注册。请检查邮箱验证码，或返回登录页面继续。';
  if (message.includes('username is reserved')) return '该用户名不可使用，请更换一个。';
  if (message.includes('username_invalid')) return '用户名需为 3-24 位，只能包含小写字母、数字和下划线。';
  if (message.includes('username_reserved')) return '该用户名不可使用，请更换一个。';
  if (message.includes('username_taken')) return '该用户名已被使用，请更换一个。';
  if (message.includes('username_already_claimed')) return '该账户已经完成用户名设置，用户名不能再次修改。';
  if (message.includes('profiles_username_key') || message.includes('duplicate key')) return '该用户名已被使用，请更换一个。';
  if (message.includes('database error saving new user')) return '无法创建该用户名，它可能已被使用，请更换后重试。';
  if (message.includes('account_suspended') || message.includes('account is not active')) return '该账户当前已被暂停，请联系 DOSO 支持。';
  if (message.includes('session_revoked') || message.includes('session is not active')) return '当前终端会话已被撤销，请重新登录。';
  if (message.includes('password')) return '密码不符合安全要求，请检查长度和字符组合。';
  if (message.includes('rate limit')) return '操作过于频繁，请稍后再试。';
  if (message.includes('network') || message.includes('fetch')) return '无法连接认证服务，请检查网络和服务地址。';
  return error.message || '操作失败，请稍后重试。';
}

function isUncertainRegistrationOutcome(error: unknown) {
  return error instanceof AuthOperationError
    && error.operation === 'register'
    && error.category === 'network_unavailable';
}

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

function isRecentDeviceStatus(value?: string | null) {
  if (!value) return false;
  const elapsed = Date.now() - new Date(value).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 2 * 60_000;
}

export default function App() {
  const { colors: appColors, isDark } = useAppTheme();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const isLandscape = viewportWidth > viewportHeight;
  const {
    clearRecovery,
    exchangeSessionFromUrl,
    initializationError,
    loading: authLoading,
    login,
    logout,
    logoutLocalSession,
    profile,
    preparedUserId,
    preparedSessionKey,
    refreshProfile,
    recovery,
    register,
    retryInitialization,
    resetPassword,
    session,
    user,
  } = useAuth();
  const [stage, setStage] = useState<AppStage>('login');
  const [guestMode, setGuestMode] = useState(false);
  const [deviceTestMode, setDeviceTestMode] = useState(false);
  const [dataPrivacyVisible, setDataPrivacyVisible] = useState(false);
  const [connectionDiagnosticsOpen, setConnectionDiagnosticsOpen] = useState(false);
  const [robotConnectionVisible, setRobotConnectionVisible] = useState(false);
  const [controlTarget, setControlTarget] = useState<'account' | 'direct'>('account');
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [selectedModel, setSelectedModel] = useState<RobotModel | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [deviceBootstrapBusy, setDeviceBootstrapBusy] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [resolvedAvatar, setResolvedAvatar] = useState<{ userId: string; value: string | null; url: string | null; error?: string } | null>(null);
  const [avatarLoadAttempt, setAvatarLoadAttempt] = useState(0);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaVerificationRevision, setMfaVerificationRevision] = useState(0);
  const mfaVerificationFlow = useRef(createMfaVerificationFlow());
  const mfaVerificationOwnerMounted = useRef(true);
  const mfaVerificationContext = useRef<MfaVerificationReconcileState>({
    identity: null, preparedKey: null, preparedUserId: null,
    loading: true, authorized: false, active: false, busy: false,
  });
  const [activeSocialProvider, setActiveSocialProvider] = useState<SocialLoginProvider | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceEnrollment, setDeviceEnrollment] = useState<DeviceEnrollmentSession | null>(null);
  const [deviceEnrollmentBusy, setDeviceEnrollmentBusy] = useState(false);
  const [deviceEnrollmentError, setDeviceEnrollmentError] = useState<string | null>(null);
  const [deviceLoadAttempt, setDeviceLoadAttempt] = useState(0);
  const [deviceLoadError, setDeviceLoadError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recoveryExitBusy, setRecoveryExitBusy] = useState(false);
  const [recoveryExitError, setRecoveryExitError] = useState<string | null>(null);
  const recoveryExitInFlight = useRef(false);
  const [recoveryLink, setRecoveryLink] = useState(false);
  const [passwordNonceRequired, setPasswordNonceRequired] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    purpose: 'signup' | 'password-recovery';
  } | null>(null);
  const [pendingAppleDisplayNames, setPendingAppleDisplayNames] = useState<Record<string, {
    displayName: string;
  }>>({});
  const openDataPrivacy = useCallback(() => {
    Keyboard.dismiss();
    setDataPrivacyVisible(true);
  }, []);
  const closeDataPrivacy = useCallback(() => {
    setDataPrivacyVisible(false);
  }, []);

  useEffect(() => {
    setStatusBarStyle(isDark ? 'light' : 'dark', true);
    if (Platform.OS !== 'web') {
      void SystemUI.setBackgroundColorAsync(appColors.background);
    }
  }, [appColors.background, isDark]);
  const [appleRecoveryProbe, setAppleRecoveryProbe] = useState<
    | { status: 'unchecked' }
    | { status: 'checking'; userId: string; readyKey: string }
    | {
      status: 'pending';
      userId: string;
      readyKey: string;
      subject: string | null;
      displayName: string;
      requiresDurableClear: boolean;
    }
    | { status: 'none'; userId: string; readyKey: string }
    | { status: 'error'; userId: string; readyKey: string }
  >({ status: 'unchecked' });
  const [appleRecoveryProbeAttempt, setAppleRecoveryProbeAttempt] = useState(0);
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [pendingCommands, setPendingCommands] = useState<Partial<Record<RobotCapability, boolean>>>({});
  const robotDiagnosticsGateway = useMemo(() => createRobotDiagnosticsGateway({ nowMs: () => Date.now() }), []);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authCallbackDeduper = useRef(authService.createAuthCallbackDeduper(20));
  const authCallbackGate = useRef({ loading: authLoading });
  authCallbackGate.current = { loading: authLoading };
  const completedDeviceBootstrapKey = useRef<string | null>(null);
  const deviceBootstrapIntent = useRef(createDeviceBootstrapIntent());
  const appleSubjectRef = useRef<string | null>(null);
  const appleLogoutPromise = useRef<Promise<void> | null>(null);
  const socialLoginInFlightRef = useRef(false);
  const otpDeliveryInFlightRef = useRef(false);
  const accountFlowInFlightRef = useRef(false);
  const authCallbackInbox = useRef(createAuthCallbackInbox(() => !authCallbackGate.current.loading && !accountFlowInFlightRef.current));
  const authCallbackUi = useRef<{ mounted: boolean; owner: symbol | null }>({ mounted: false, owner: null });
  const initialAuthUrl = useRef<{ promise: Promise<string | null> | null; delivered: boolean }>({ promise: null, delivered: false });
  const accountSecurityNonceAttemptRef = useRef(0);
  const mfaBackRequestRef = useRef<() => void>(() => undefined);
  const accountSecurityBackRequestRef = useRef<() => void>(() => undefined);
  const profileBackRequestRef = useRef<() => void>(() => undefined);
  const profileSaveAttemptRef = useRef<symbol | null>(null);
  const deviceSettingsAttemptRef = useRef<symbol | null>(null);
  const deviceSettingsMountedRef = useRef(true);
  const deviceSettingsContext = useRef<{ identity: string | null; deviceId: string | null; ownerId: string | null }>({
    identity: null, deviceId: null, ownerId: null,
  });
  const displayNameCancelRef = useRef<() => void>(() => undefined);
  const bindDeviceAttemptRef = useRef(0);
  const bindDeviceAbortControllerRef = useRef<AbortController | null>(null);
  const pendingBindSerialNumberRef = useRef<string | null>(null);
  const deviceEnrollmentAbortControllerRef = useRef<AbortController | null>(null);
  const deviceEnrollmentAttemptRef = useRef(0);
  const appleDiagnosticReason = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const preparedUserIdRef = useRef<string | null>(null);
  const preparedSessionKeyRef = useRef<string | null>(null);
  const displayRecoveryOperationTracker = useRef(createAppleDisplayRecoveryOperationTracker());
  const displayRecoveryIdentityRef = useRef<string | null>(null);
  const commandIdSequenceRef = useRef(0);
  const commandAttemptSequenceRef = useRef(0);
  const commandDeviceRef = useRef<Device | null>(null);
  const commandAuthorityRef = useRef('unavailable');
  const commandCapabilityAvailabilityRef = useRef<Partial<Record<RobotCapability, boolean>>>({});
  const commandPermissionRef = useRef<(capability: RobotCapability) => RobotCommandPermissionSnapshot>(() => ({
    authorityEpoch: 'unavailable',
    capabilityAvailable: false,
    connected: false,
    deviceId: null,
    hasDevice: false,
    safetyLock: true,
  }));
  useEffect(() => {
    deviceSettingsMountedRef.current = true;
    return () => {
      deviceSettingsMountedRef.current = false;
      deviceSettingsAttemptRef.current = null;
    };
  }, []);
  useEffect(() => {
    deviceEnrollmentAbortControllerRef.current?.abort();
    deviceEnrollmentAbortControllerRef.current = null;
    deviceEnrollmentAttemptRef.current += 1;
    setDeviceEnrollment(null);
    setDeviceEnrollmentBusy(false);
    setDeviceEnrollmentError(null);
    return () => {
      deviceEnrollmentAbortControllerRef.current?.abort();
      deviceEnrollmentAbortControllerRef.current = null;
      deviceEnrollmentAttemptRef.current += 1;
    };
  }, [device?.id, preparedSessionKey, user?.id]);
  useEffect(() => {
    if (stage !== 'account-security') accountSecurityNonceAttemptRef.current += 1;
  }, [stage]);
  currentUserIdRef.current = user?.id ?? null;
  preparedUserIdRef.current = preparedUserId;
  preparedSessionKeyRef.current = preparedSessionKey;
  const profileAvatarUrl = resolvedAvatar && resolvedAvatar.userId === user?.id && resolvedAvatar.value === profile?.avatar_url
    ? resolvedAvatar.url : null;
  const profileAvatarError = resolvedAvatar && resolvedAvatar.userId === user?.id && resolvedAvatar.value === profile?.avatar_url
    ? resolvedAvatar.error : undefined;

  useEffect(() => {
    if (!user || profile?.id !== user.id || preparedUserId !== user.id) return;
    let active = true;
    const ownerId = user.id;
    const value = profile.avatar_url;
    const refreshAvatar = async () => {
      try {
        const url = await resolveProfileAvatarUrl(value, ownerId);
        if (active) setResolvedAvatar({ userId: ownerId, value, url });
      } catch (error) {
        if (active) setResolvedAvatar({ userId: ownerId, value, url: null, error: humanizeAuthError(error) });
      }
    };
    void refreshAvatar();
    // Signed URLs stay in memory and renew before expiry, including after backgrounding.
    const timer = setInterval(() => void refreshAvatar(), 50 * 60_000);
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void refreshAvatar();
    });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [avatarLoadAttempt, preparedUserId, preparedSessionKey, profile?.avatar_url, profile?.id, user?.id]);

  useEffect(() => {
    profileSaveAttemptRef.current = null;
    setProfileEditBusy(false);
    setProfileEditError(null);
  }, [user?.id, preparedSessionKey]);
  const displayRecoveryIdentity = user && preparedSessionKey ? `${user.id}:${preparedSessionKey}` : null;
  if (displayRecoveryIdentityRef.current !== displayRecoveryIdentity) {
    displayRecoveryIdentityRef.current = displayRecoveryIdentity;
    displayRecoveryOperationTracker.current.invalidate();
  }
  const pendingAppleDisplayName = user && pendingAppleDisplayNames[user.id]
    ? { userId: user.id, ...pendingAppleDisplayNames[user.id] }
    : null;
  const appleRecoveryProbeResolved = Boolean(
    user
    && preparedSessionKey
    && (appleRecoveryProbe.status === 'pending' || appleRecoveryProbe.status === 'none')
    && appleRecoveryProbe.userId === user.id
    && appleRecoveryProbe.readyKey === preparedSessionKey,
  );
  const notify = useCallback((title: string, message: string, tone: ToastNotice['tone'] = 'success', durationMs: number | null = 3200) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ title, message, tone });
    noticeTimer.current = durationMs === null ? null : setTimeout(() => setNotice(null), durationMs);
  }, []);
  const registerMfaBackRequest = useCallback((request: (() => void) | null) => {
    mfaBackRequestRef.current = request ?? (() => undefined);
  }, []);
  const registerAccountSecurityBackRequest = useCallback((request: (() => void) | null) => {
    accountSecurityBackRequestRef.current = request ?? (() => undefined);
  }, []);
  const registerProfileBackRequest = useCallback((request: (() => void) | null) => {
    profileBackRequestRef.current = request ?? (() => undefined);
  }, []);

  const handleAuthUrl = useCallback((url: string | null) => {
    if (!url) return Promise.resolve();
    const callbackKind = authService.getAuthCallbackKind(url);
    if (!callbackKind) return Promise.resolve();
    const callbackKey = authService.getAuthCallbackKey(url);
    return authCallbackInbox.current.enqueue(callbackKey, isCurrent => authCallbackDeduper.current.run(callbackKey, async () => {
      const isRecoveryLink = callbackKind === 'reset-password';
      const owner = Symbol();
      authCallbackUi.current.owner = owner;
      setAccountBusy(true);
      setAuthError(null);
      try {
        const callbackSession = await exchangeSessionFromUrl(url);
        if (!isCurrent()) throw new AuthCallbackCancelledError();
        const callbackIdentity = readAuthSessionIdentity(callbackSession);
        authCallbackInbox.current.acceptExchangeIdentity(callbackIdentity ? `${callbackIdentity.userId}:${callbackIdentity.sessionId}` : null);
        if (isRecoveryLink) {
          setRecoveryLink(true);
          setPasswordNonceRequired(false);
          setStage('reset-password');
        }
      } catch (error) {
        if (!isCurrent()) throw new AuthCallbackCancelledError();
        if (isRecoveryLink) setRecoveryLink(false);
        const message = humanizeAuthError(error);
        setAuthError(message);
        notify('认证链接无效', message, 'error');
        throw error;
      } finally {
        if (authCallbackUi.current.owner === owner) {
          authCallbackUi.current.owner = null;
          if (authCallbackUi.current.mounted) setAccountBusy(false);
        }
      }
    }));
  }, [exchangeSessionFromUrl, notify]);

  const currentModel = selectedModel ?? getRobotModel(device?.model_code);
  const deviceName = device?.display_name ?? currentModel.name;
  const deviceImage = currentModel.id === 'thunder-mini'
    ? images.thunderMini
    : currentModel.id === 'thunder-pro'
      ? images.thunderPro
      : currentModel.id === 'scout'
        ? images.scout
        : images.thunderHero;
  const deviceCompactImage = currentModel.id === 'thunder-01' ? images.thunderCompact : deviceImage;
  const deviceType = `${currentModel.environment}${currentModel.category}机器人`;
  const connected = device?.connection_status === 'online' && isRecentDeviceStatus(device.last_seen_at);
  const trustedSafetyLock = readTrustedSafetyLock(device);
  const safetyLock = trustedSafetyLock ?? true;
  const alertsEnabled = device?.alerts_enabled ?? true;
  const displayBatteryPercent = device?.battery_percent ?? null;
  const lifecycleDemoEnabled = !device || device.is_demo;
  const firmwareVersion = device?.firmware_version?.trim().replace(/^v/i, '') || '待同步';
  const canManageMfa = profile?.app_role === 'admin' || profile?.app_role === 'support';
  const mfaIdentity = readAuthSessionIdentity(session);
  const deviceSettingsIdentity = user && mfaIdentity?.userId === user.id
    ? `${user.id}:${mfaIdentity.sessionId}` : null;
  if (deviceSettingsContext.current.identity !== deviceSettingsIdentity
    || deviceSettingsContext.current.deviceId !== (device?.id ?? null)
    || deviceSettingsContext.current.ownerId !== (device?.owner_id ?? null)) {
    // A new context object also retires A→B→A attempts. JWT rotation within
    // the same session does not invalidate a legitimate in-flight save.
    deviceSettingsContext.current = {
      identity: deviceSettingsIdentity, deviceId: device?.id ?? null, ownerId: device?.owner_id ?? null,
    };
    deviceSettingsAttemptRef.current = null;
  }
  const deviceSettingsRenderContext = deviceSettingsContext.current;
  useEffect(() => {
    authCallbackInbox.current.reconcileIdentity(mfaIdentity ? `${mfaIdentity.userId}:${mfaIdentity.sessionId}` : null, authLoading);
  }, [authLoading, mfaIdentity?.userId, mfaIdentity?.sessionId]);
  const mfaProbeFailed = appleRecoveryProbe.status === 'error'
    && appleRecoveryProbe.userId === user?.id && appleRecoveryProbe.readyKey === preparedSessionKey;
  mfaVerificationContext.current = {
    identity: mfaIdentity, preparedKey: preparedSessionKey, preparedUserId,
    loading: authLoading || Boolean(user && preparedSessionKey && !appleRecoveryProbeResolved && !mfaProbeFailed),
    authorized: canManageMfa && profile?.id === user?.id,
    active: stage === 'mfa-setup' && !mfaProbeFailed, busy: getAuthSessionOperationSnapshot().busy,
  };
  const mfaVerificationPending = mfaVerificationFlow.current.isPending();
  deviceBootstrapIntent.current.update({
    userId: user?.id ?? null,
    ready: Boolean(!guestMode && user && !authLoading && !initializationError && preparedUserId === user.id
      && profile?.id === user.id && hasClaimedUsername(profile) && appleRecoveryProbeResolved
      && !pendingAppleDisplayName && !mfaVerificationPending && !recovery && !recoveryLink),
    // A same-account preparation pause keeps the local choice, but explicit
    // security gates retire it. This ref updates before old async effects commit.
    reset: Boolean(initializationError || recovery || recoveryLink || mfaVerificationPending || mfaProbeFailed
      || pendingAppleDisplayName || (!authLoading && user && (!profile || !hasClaimedUsername(profile)))),
  });
  const directConnectionReady = Boolean(!guestMode && user && deviceBootstrapIntent.current.canCommit(user.id)
    && preparedSessionKey && preparedUserId === user.id && !authLoading && !initializationError
    && !mfaVerificationPending && !accountBusy && !deviceBootstrapBusy);
  const directConnection = useDirectRobotConnection(deviceSettingsIdentity, directConnectionReady);
  const [controlEndpoint, setControlEndpoint] = useState<BrainstemGrpcEndpoint | null>(null);
  const brainstemControl = useBrainstemControl({ ownerKey: deviceSettingsIdentity,
    ready: directConnectionReady && (stage === 'control' || robotConnectionVisible) });
  const directTelemetry = useBrainstemTelemetry({ ownerKey: deviceSettingsIdentity,
    endpoint: controlTarget === 'direct' ? controlEndpoint : null,
    active: directConnectionReady && controlTarget === 'direct' && !robotConnectionVisible
      && (stage === 'joint-status' || stage === 'control' && brainstemControl.state.connected) });
  const directEndpoint = controlEndpoint ?? directConnection.snapshot?.endpoint;
  const directEndpointLabel = directEndpoint
    ? `${directEndpoint.host.includes(':') ? `[${directEndpoint.host}]` : directEndpoint.host}:${directEndpoint.port}` : 'IP 直连设备';
  const diagnosticNavigation = useRef({ ownerKey: deviceSettingsIdentity, endpoint: directEndpoint,
    target: controlTarget, stage, robotConnectionVisible, connectionDiagnosticsOpen, callbacks: brainstemControl.operationCallbacks });
  if (diagnosticNavigation.current.ownerKey !== deviceSettingsIdentity || diagnosticNavigation.current.endpoint !== directEndpoint
    || diagnosticNavigation.current.target !== controlTarget || diagnosticNavigation.current.stage !== stage
    || diagnosticNavigation.current.robotConnectionVisible !== robotConnectionVisible
    || diagnosticNavigation.current.connectionDiagnosticsOpen !== connectionDiagnosticsOpen
    || diagnosticNavigation.current.callbacks !== brainstemControl.operationCallbacks) {
    diagnosticNavigation.current = { ownerKey: deviceSettingsIdentity, endpoint: directEndpoint,
      target: controlTarget, stage, robotConnectionVisible, connectionDiagnosticsOpen, callbacks: brainstemControl.operationCallbacks };
  }
  const diagnosticNavigationOwner = diagnosticNavigation.current;
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') diagnosticNavigation.current = { ...diagnosticNavigation.current };
    });
    return () => listener.remove();
  }, []);
  const g20Controller = useG20Input(!guestMode && stage === 'control' && !robotConnectionVisible);
  useEffect(() => { if (!directConnectionReady) setControlEndpoint(null); }, [directConnectionReady]);
  const brainstemIntegration = getBrainstemIntegrationReadiness({
    nativeModuleAvailable: isBrainstemGrpcAvailable(),
    endpointConfigured: Boolean(controlEndpoint || directConnection.snapshot),
    readOnlyObservationFresh: brainstemControl.state.connected || directConnection.presentation?.fresh === true,
    deviceIdentity: controlTarget === 'account' && device && !device.is_demo
      ? deviceEnrollment?.phase === 'completed' ? 'verified' : 'bound-unverified'
      : 'unbound',
    clientIdentitySelected: brainstemControl.state.clientIdentitySelected,
    remoteListenerConfirmed: brainstemControl.state.connected,
    remoteMtlsVerified: brainstemControl.state.mutualTlsVerified,
    controlLeaseActive: brainstemControl.state.leaseActive,
    productionExecutorConnected: isBrainstemControlAvailable() && brainstemControl.state.connected,
    ackContractReady: brainstemControl.state.sequence > 0,
    deadmanStopReady: isBrainstemControlAvailable() && brainstemControl.state.connected,
    pairedClientAuthorized: brainstemControl.state.principalVerified,
    transport: controlEndpoint?.transport,
    lanDevConnectionConfirmed: brainstemControl.state.connected && brainstemControl.state.transport === 'grpc-lan',
  });
  useEffect(() => {
    if (!mfaVerificationOwnerMounted.current) mfaVerificationFlow.current = createMfaVerificationFlow();
    mfaVerificationOwnerMounted.current = true;
    return () => {
      mfaVerificationOwnerMounted.current = false;
      mfaVerificationFlow.current.dispose();
    };
  }, []);
  useEffect(() => {
    const flow = mfaVerificationFlow.current;
    const pending = flow.isPending();
    const completion = flow.reconcile({ ...mfaVerificationContext.current, busy: getAuthSessionOperationSnapshot().busy });
    if (pending !== flow.isPending()) setMfaVerificationRevision(value => value + 1);
    if (!completion) return;
    if ('failed' in completion) {
      notify('双重验证未完成', '请核对当前安全状态后重试；系统不会自动重复提交验证码。', 'error');
      return;
    }
    setStage('account-security');
    notify(completion.kind === 'enrollment' ? '双重验证已启用' : '双重验证已完成', '当前会话已确认完成 AAL2 身份验证。');
  }, [appleRecoveryProbeResolved, authLoading, initializationError, mfaIdentity?.userId, mfaIdentity?.sessionId, mfaProbeFailed, mfaVerificationRevision, notify, preparedSessionKey, preparedUserId, profile?.id, canManageMfa, stage]);
  const handleMfaVerify = async (input: MfaVerificationInput) => {
    // Validation must precede ownership: the service rejects malformed codes
    // before acquiring a write lease, so no fresh preparation would follow.
    if (!/^\d{6}$/.test(input.code)) throw new Error('请输入身份验证器中的 6 位动态验证码。');
    const current = mfaVerificationContext.current;
    // A retained old screen callback must not dispatch its factor under a new
    // account/session. Prepared generation is only the starting epoch.
    if (!current.identity || current.loading || !current.authorized || !current.active
      || !current.preparedKey || current.preparedUserId !== current.identity.userId
      || current.identity.userId !== mfaIdentity?.userId || current.identity.sessionId !== mfaIdentity?.sessionId) {
      throw new Error('当前安全会话尚未准备完成，请核对账户后重试。');
    }
    const flow = mfaVerificationFlow.current;
    const ticket = flow.begin({ identity: current.identity, preparedKey: current.preparedKey, kind: input.kind });
    try { input.onAccepted?.(); }
    catch (error) { flow.abortBeforeDispatch(ticket); throw error; }
    setMfaVerificationRevision(value => value + 1);
    try {
      const status = await (input.kind === 'enrollment'
        ? verifyTotpEnrollment(input.factorId, input.code)
        : verifyTotpFactor(input.factorId, input.code));
      flow.settle(ticket, { status });
      return status;
    } catch (error) {
      if (isAuthSessionOperationBusyError(error)) flow.abortBeforeDispatch(ticket);
      else flow.settle(ticket, { failed: true });
      throw error;
    } finally {
      if (mfaVerificationOwnerMounted.current) setMfaVerificationRevision(value => value + 1);
    }
  };
  const robotCapabilityReadiness = createRobotCapabilityReadiness({
    connected,
    deviceClass: lifecycleDemoEnabled ? 'demo' : 'physical',
    hasDevice: Boolean(device),
    safetyLock,
  });
  commandDeviceRef.current = device;
  commandAuthorityRef.current = `${user?.id ?? 'signed-out'}:${preparedSessionKey ?? 'no-session'}:${device?.owner_id ?? 'unbound'}`;
  commandCapabilityAvailabilityRef.current = Object.fromEntries(
    Object.entries(robotCapabilityReadiness).map(([capability, gate]) => [capability, gate.available]),
  );
  commandPermissionRef.current = (capability) => {
    const currentDevice = commandDeviceRef.current;
    const hasDevice = Boolean(currentDevice && currentDevice.owner_id === currentUserIdRef.current);
    return {
      authorityEpoch: commandAuthorityRef.current,
      capabilityAvailable: commandCapabilityAvailabilityRef.current[capability] === true,
      connected: currentDevice?.connection_status === 'online' && isRecentDeviceStatus(currentDevice.last_seen_at),
      deviceId: hasDevice ? currentDevice?.id ?? null : null,
      hasDevice,
      safetyLock: currentDevice?.safety_lock ?? true,
    };
  };
  const robotCommandCoordinator = useMemo(() => createRobotCommandCoordinator({
    clock: {
      clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    },
    createAttemptId: () => `attempt-${Date.now().toString(36)}-${++commandAttemptSequenceRef.current}`,
    executor: PRODUCTION_ROBOT_COMMAND_EXECUTOR,
    readPermission: (capability) => commandPermissionRef.current(capability),
  }), []);
  useEffect(() => {
    robotCommandCoordinator.cancelAll('command authority changed');
    setPendingCommands((current) => (Object.keys(current).length === 0 ? current : {}));
    return () => robotCommandCoordinator.cancelAll('command context disposed');
  }, [
    connected,
    device?.id,
    device?.owner_id,
    preparedSessionKey,
    robotCapabilityReadiness.manualControl.available,
    robotCapabilityReadiness.recall.available,
    robotCapabilityReadiness.routeStart.available,
    robotCapabilityReadiness.taskStart.available,
    robotCommandCoordinator,
    safetyLock,
    user?.id,
  ]);
  const executorSupportForCapability = useCallback(
    (capability: RobotCapability) => inspectRobotCommandSupport(PRODUCTION_ROBOT_COMMAND_EXECUTOR, capability),
    [],
  );
  const executorSupportsCapability = useCallback(
    (capability: RobotCapability) => executorSupportForCapability(capability).supported,
    [executorSupportForCapability],
  );
  const routeControlAvailable = robotCapabilityReadiness.routeStart.available && !pendingCommands.routeStart;
  const routeExecutorAvailable = executorSupportsCapability('routeStart');
  const routeCommandAvailable = routeControlAvailable && routeExecutorAvailable;
  const taskControlAvailable = robotCapabilityReadiness.taskStart.available && !pendingCommands.taskStart;
  const taskExecutorAvailable = executorSupportsCapability('taskStart');
  const taskCommandAvailable = taskControlAvailable && taskExecutorAvailable;
  const recallCommandAvailable = robotCapabilityReadiness.recall.available && executorSupportsCapability('recall') && !pendingCommands.recall;
  const manualCommandAvailable = robotCapabilityReadiness.manualControl.available && executorSupportsCapability('manualControl') && !pendingCommands.manualControl;
  const commandBlockedReason = (capability: RobotCapability, pendingLabel: string) => {
    const gate = robotCapabilityReadiness[capability];
    if (!gate.available) return gate.reason;
    const executorSupport = executorSupportForCapability(capability);
    if (executorSupport.state === 'fault') return '命令执行器故障，未下发。';
    if (!executorSupport.supported) return '真实设备命令执行器尚未接入，当前不会下发控制指令。';
    if (pendingCommands[capability]) return `${pendingLabel}正在等待可信设备终态，请勿重复操作。`;
    return undefined;
  };

  useEffect(() => {
    if (guestMode) return undefined;
    if (authLoading) return undefined;
    if (initializationError) return undefined;
    // The owned MFA attempt must reconcile the same prepared identity before
    // ordinary device bootstrap can replace its return route.
    if (mfaVerificationPending) return undefined;
    if (!user) {
      completedDeviceBootstrapKey.current = null;
      setDevice(null);
      setSelectedModel(null);
      setAccountBusy(false);
      setStage((current) => (
        current === 'register' || current === 'forgot-password' ? current : 'login'
      ));
      return undefined;
    }
    if (recovery || recoveryLink) {
      setAccountBusy(false);
      setStage('reset-password');
      return undefined;
    }
    if (!profile) {
      setAccountBusy(false);
      setDeviceLoadError('账户资料尚未建立，请重试或退出后重新登录。');
      setStage('device-error');
      return undefined;
    }
    if (!appleRecoveryProbeResolved) {
      completedDeviceBootstrapKey.current = null;
      setAccountBusy(false);
      return undefined;
    }
    if (pendingAppleDisplayName?.userId === user.id && preparedUserId === user.id) {
      completedDeviceBootstrapKey.current = null;
      setAccountBusy(false);
      setStage('display-name-confirmation');
      return undefined;
    }
    if (!hasClaimedUsername(profile)) {
      completedDeviceBootstrapKey.current = null;
      setDevice(null);
      setSelectedModel(null);
      setAccountBusy(false);
      setStage('username-onboarding');
      return undefined;
    }

    // Username edits must not reset the selected tab or reload the device flow.
    // Unclaimed identities are gated above, before this bootstrap can run.
    const bootstrapKey = `${user.id}:${deviceLoadAttempt}`;
    if (completedDeviceBootstrapKey.current === bootstrapKey) return undefined;

    let active = true;
    setDeviceBootstrapBusy(true);
    setDeviceLoadError(null);
    void deviceRepository
      .list()
      .then((devices) => {
        if (!active || !deviceBootstrapIntent.current.canCommit(user.id)) return;
        completedDeviceBootstrapKey.current = bootstrapKey;
        const primaryDevice = devices[0] ?? null;
        setDevice(primaryDevice);
        // An empty list does not revoke this account's newer local model choice.
        if (!primaryDevice && deviceBootstrapIntent.current.preservesNavigation(user.id)) return;
        if (primaryDevice) deviceBootstrapIntent.current.clearLocalEntry();
        setSelectedModel(primaryDevice ? getRobotModel(primaryDevice.model_code) : null);
        setActiveTab('home');
        setStage(primaryDevice ? 'main' : 'models');
      })
      .catch((error: unknown) => {
        if (!active || !deviceBootstrapIntent.current.canCommit(user.id)) return;
        completedDeviceBootstrapKey.current = bootstrapKey;
        const message = humanizeAuthError(error);
        setDeviceLoadError(message);
        setStage('device-error');
      })
      .finally(() => {
        if (active) setDeviceBootstrapBusy(false);
      });

    return () => {
      active = false;
      setDeviceBootstrapBusy(false);
    };
  }, [guestMode, appleRecoveryProbeResolved, authLoading, deviceLoadAttempt, initializationError, mfaVerificationPending, pendingAppleDisplayName, preparedUserId, profile?.username_claimed_at, profile?.username_provenance, recovery, recoveryLink, user?.id]);

  useEffect(() => {
    if (!user) {
      setPendingAppleDisplayNames({});
      setAppleRecoveryProbe({ status: 'unchecked' });
    }
  }, [user?.id]);

  useEffect(() => {
    if (authCallbackUi.current.owner) return;
    setAccountBusy(false);
    setAuthError(null);
  }, [displayRecoveryIdentity]);

  useEffect(() => {
    // Busy is a wake signal when accountFlowInFlightRef clears, not a gate:
    // social login itself stays UI-busy while awaiting its callback.
    authCallbackInbox.current.resume();
  }, [authLoading, accountBusy]);

  useEffect(() => {
    let active = true;
    authCallbackUi.current.mounted = true;
    const disconnect = authCallbackInbox.current.connect();
    const initial = initialAuthUrl.current;
    if (!initial.delivered) {
      initial.promise ??= Linking.getInitialURL();
      void initial.promise.then(url => {
        if (!active || initial.delivered) return;
        initial.delivered = true;
        initial.promise = null;
        return handleAuthUrl(url);
      }).catch(() => {
        if (active) { initial.delivered = true; initial.promise = null; }
      });
    }
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (active) void handleAuthUrl(url).catch(() => undefined);
    });
    return () => { active = false; authCallbackUi.current.mounted = false; subscription.remove(); disconnect(); };
  }, [handleAuthUrl]);

  const handleRecoveryLogout = useCallback(async () => {
    if (recoveryExitInFlight.current) return;
    recoveryExitInFlight.current = true;
    setRecoveryExitBusy(true);
    setRecoveryExitError(null);
    setNotice(null);
    authCallbackInbox.current.invalidate();
    initialAuthUrl.current.delivered = true;
    initialAuthUrl.current.promise = null;
    authCallbackUi.current.owner = null;
    try {
      await logoutLocalSession();
      clearRecovery();
      setRecoveryLink(false);
      setPasswordNonceRequired(false);
      setPendingVerification(null);
      setPendingAppleDisplayNames({});
      setAppleRecoveryProbe({ status: 'unchecked' });
      setDevice(null);
      setSelectedModel(null);
      setRobotConnectionVisible(false);
      setActiveTab('home');
      setAuthError(null);
      setStage('login');
      notify('本机已退出', '可以重新登录。云端终端撤销尚未确认。', 'info');
    } catch (error) {
      setRecoveryExitError(humanizeAuthError(error));
    } finally {
      recoveryExitInFlight.current = false;
      setRecoveryExitBusy(false);
    }
  }, [clearRecovery, logoutLocalSession, notify]);

  const handleLogout = useCallback(async () => {
    authCallbackInbox.current.invalidate();
    initialAuthUrl.current.delivered = true;
    initialAuthUrl.current.promise = null;
    clearRecovery();
    setRecoveryLink(false);
    if (accountBusy || accountFlowInFlightRef.current) {
      notify('退出尚未执行', '当前操作尚未结束，本次退出未执行。请等待处理结束后再次退出。', 'info');
      return;
    }
    authCallbackUi.current.owner = null;
    accountFlowInFlightRef.current = true;
    setAccountBusy(true);
    setLogoutPending(true);
    setAuthError(null);
    setPendingAppleDisplayNames({});
    setAppleRecoveryProbe({ status: 'unchecked' });
    let revocationState: 'full' | 'without-audit' | 'local-only' = 'full';
    try {
      if (isSupabaseConfigured) {
        try {
          await revokeCurrentTerminal('user_logged_out_current_terminal');
        } catch (error) {
          if (isAccountSessionOutcomeError(error)) {
            notify('退出结果待核对', error.message, 'error', null);
            return;
          }
          try {
            await revokeCurrentTerminalWithoutAudit();
            revocationState = 'without-audit';
          } catch (error) {
            if (isAccountSessionOutcomeError(error)) {
              notify('退出结果待核对', error.message, 'error', null);
              return;
            }
            revocationState = 'local-only';
            await logout();
          }
        }
      }
      clearRecovery();
      setRecoveryLink(false);
      setPasswordNonceRequired(false);
      setPendingVerification(null);
      setPendingAppleDisplayNames({});
      setAppleRecoveryProbe({ status: 'unchecked' });
      setDevice(null);
      setSelectedModel(null);
      setActiveTab('home');
      setStage('login');
      notify(
        revocationState === 'full' ? '已退出登录' : '本机已退出',
        revocationState === 'full'
          ? '本机会话、DOSO 终端访问和安全审计均已完成。'
          : revocationState === 'without-audit'
            ? '终端访问已撤销，但 Edge Function 不可用，退出审计未写入。请联系支持检查后端。'
            : '本机会话已清除，但后端终端撤销未确认；联网后请执行“退出全部终端”。',
        revocationState === 'full' ? 'info' : 'error',
      );
    } catch (error) {
      setAuthError(humanizeAuthError(error));
    } finally {
      accountFlowInFlightRef.current = false;
      setAccountBusy(false);
      setLogoutPending(false);
    }
  }, [accountBusy, clearRecovery, logout, notify]);

  const returnToDeviceSettings = useCallback(() => {
    setActiveTab('profile');
    setStage('main');
  }, []);

  const openProfileEditor = useCallback(() => {
    if (!user || profile?.id !== user.id || preparedUserId !== user.id || !preparedSessionKey) return;
    setProfileEditError(null);
    setStage('edit-profile');
  }, [preparedSessionKey, preparedUserId, profile?.id, user]);

  const handleSaveProfile = useCallback(async (input: ProfileEditInput) => {
    const expectedUserId = currentUserIdRef.current;
    const expectedSessionKey = preparedSessionKeyRef.current;
    if (!expectedUserId || preparedUserIdRef.current !== expectedUserId || !expectedSessionKey) {
      throw new Error('当前会话尚未准备完成，请重新登录。');
    }
    if (profileSaveAttemptRef.current) throw new Error('个人资料正在保存，请稍候。');
    const attempt = Symbol('profile-save');
    profileSaveAttemptRef.current = attempt;
    const isCurrent = () => profileSaveAttemptRef.current === attempt
      && currentUserIdRef.current === expectedUserId
      && preparedSessionKeyRef.current === expectedSessionKey;
    setProfileEditBusy(true);
    setProfileEditError(null);
    let saved = false;
    try {
      const saveResult = await saveProfileEdits(expectedUserId, input);
      saved = true;
      if (!isCurrent()) return;
      const nextProfile = await refreshProfile();
      if (!isCurrent()) return;
      if (nextProfile?.id !== expectedUserId) throw new Error('无法刷新当前账户资料。');
      if (input.avatar !== undefined && nextProfile.avatar_url) {
        const url = await resolveProfileAvatarUrl(nextProfile.avatar_url, expectedUserId);
        if (!isCurrent()) return;
        if (!url) throw new Error('已保存的头像无法读取。');
        setResolvedAvatar({ userId: expectedUserId, value: nextProfile.avatar_url, url });
      }
      returnToDeviceSettings();
      notify(
        '个人资料已保存',
        saveResult.avatarCleanup === 'pending'
          ? '资料已更新，旧头像清理尚未确认。'
          : saveResult.avatarCleanup === 'protected-current'
            ? '资料已更新，已保留服务器当前头像。'
            : '用户名、昵称和头像已更新。',
        saveResult.avatarCleanup === 'pending' || saveResult.avatarCleanup === 'protected-current' ? 'info' : 'success',
      );
    } catch (error) {
      if (!isCurrent()) return;
      const message = saved
        ? `资料已保存，但资料或头像刷新失败：${humanizeAuthError(error)} 请返回“我的”确认后重试。`
        : humanizeAuthError(error);
      setProfileEditError(message);
      throw new Error(message);
    } finally {
      if (isCurrent()) {
        profileSaveAttemptRef.current = null;
        setProfileEditBusy(false);
      }
    }
  }, [notify, refreshProfile, returnToDeviceSettings]);

  const reconcileBoundDevice = useCallback(async (serialNumber: string) => {
    const normalizedSerial = serialNumber.trim().toUpperCase();
    const expectedUserId = currentUserIdRef.current;
    if (!expectedUserId) return null;

    for (const delayMs of [300, 900, 1_800]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (currentUserIdRef.current !== expectedUserId) return null;
      try {
        const devices = await deviceRepository.list();
        if (currentUserIdRef.current !== expectedUserId) return null;
        const matchedDevice = devices.find(
          (device) => device.serial_number?.trim().toUpperCase() === normalizedSerial,
        );
        if (matchedDevice) return matchedDevice;
      } catch {
        // A reconciliation retry is read-only and best-effort; the visible request error remains authoritative.
      }
    }
    return null;
  }, []);

  const cancelBindDeviceAttempt = useCallback(() => {
    const serialNumber = pendingBindSerialNumberRef.current;
    pendingBindSerialNumberRef.current = null;
    bindDeviceAbortControllerRef.current?.abort();
    bindDeviceAbortControllerRef.current = null;
    bindDeviceAttemptRef.current += 1;
    setDeviceBusy(false);
    setAuthError(null);
    returnToDeviceSettings();
    if (serialNumber) {
      void reconcileBoundDevice(serialNumber).then((boundDevice) => {
        if (!boundDevice) return;
        deviceBootstrapIntent.current.clearLocalEntry();
        setDevice(boundDevice);
        setSelectedModel(getRobotModel(boundDevice.model_code));
        notify('绑定状态已重新确认', `${boundDevice.display_name} 已由设备列表重新同步。`, 'info');
      });
    }
  }, [notify, reconcileBoundDevice, returnToDeviceSettings]);

  const appleIdentitySubject = socialAuthService.getSignedInAppleSubject(user?.identities);
  appleSubjectRef.current = appleIdentitySubject;

  useEffect(() => {
    if (!user || preparedUserId !== user.id || !preparedSessionKey) {
      setAppleRecoveryProbe({ status: 'unchecked' });
      return undefined;
    }
    let active = true;
    const expectedUserId = user.id;
    const expectedReadyKey = preparedSessionKey;
    const inMemoryCandidate = pendingAppleDisplayNames[expectedUserId] ?? null;
    setAppleRecoveryProbe({ status: 'checking', userId: expectedUserId, readyKey: expectedReadyKey });
    void probeAppleDisplayRecovery(
      inMemoryCandidate?.displayName ?? null,
      appleIdentitySubject,
      () => socialAuthService.getPendingAppleDisplayName(appleIdentitySubject),
    )
      .then((probe) => {
        if (
          active
          && currentUserIdRef.current === expectedUserId
          && preparedUserIdRef.current === expectedUserId
          && preparedSessionKeyRef.current === expectedReadyKey
        ) {
          if (probe.status === 'pending' && probe.candidate.requiresDurableClear) {
            setPendingAppleDisplayNames((current) => (
              current[expectedUserId]
                ? current
                : { ...current, [expectedUserId]: { displayName: probe.candidate.displayName } }
            ));
          }
          setAppleRecoveryProbe(probe.status === 'pending' ? {
            status: 'pending',
            userId: expectedUserId,
            readyKey: expectedReadyKey,
            ...probe.candidate,
          } : probe.status === 'none' ? {
            status: 'none',
            userId: expectedUserId,
            readyKey: expectedReadyKey,
          } : {
            status: 'error',
            userId: expectedUserId,
            readyKey: expectedReadyKey,
          });
        }
      })
      .catch(() => {
        if (
          active
          && currentUserIdRef.current === expectedUserId
          && preparedSessionKeyRef.current === expectedReadyKey
        ) {
          setAppleRecoveryProbe({ status: 'error', userId: expectedUserId, readyKey: expectedReadyKey });
        }
      });
    return () => { active = false; };
  }, [
    appleIdentitySubject,
    appleRecoveryProbeAttempt,
    pendingAppleDisplayNames,
    preparedSessionKey,
    preparedUserId,
    user?.id,
  ]);

  const logoutCurrentAppleSubject = useCallback((subject: string) => {
    if (appleSubjectRef.current !== subject) return Promise.resolve();
    if (appleLogoutPromise.current) return appleLogoutPromise.current;
    const task = (async () => {
      if (appleSubjectRef.current === subject) await handleLogout();
    })();
    appleLogoutPromise.current = task;
    const clear = () => {
      if (appleLogoutPromise.current === task) appleLogoutPromise.current = null;
    };
    void task.then(clear, clear);
    return task;
  }, [handleLogout]);

  useEffect(() => socialAuthService.subscribeToAppleCredentialRevoked(() => {
    if (appleIdentitySubject && appleSubjectRef.current === appleIdentitySubject) {
      void logoutCurrentAppleSubject(appleIdentitySubject);
    }
  }), [appleIdentitySubject, logoutCurrentAppleSubject]);

  useEffect(() => {
    if (!appleIdentitySubject) return undefined;
    const monitor = socialAuthService.createAppleCredentialMonitor({
      getCurrentSubject: () => appleSubjectRef.current,
      checkCredential: socialAuthService.getAppleCredentialStatus,
      logout: () => logoutCurrentAppleSubject(appleIdentitySubject),
      onDiagnostic: (check) => {
        if (!check.reason || appleDiagnosticReason.current === check.reason) return;
        appleDiagnosticReason.current = check.reason;
        notify(
          'Apple 凭据检查未完成',
          check.reason === 'unsupported'
            ? '当前环境不支持 Apple 凭据状态查询，账户会话保持不变。'
            : 'Apple 凭据状态暂时无法验证，请稍后回到 App 重试。',
          'info',
        );
      },
    });
    void monitor.check().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void monitor.check().catch(() => undefined);
    });
    return () => {
      monitor.deactivate();
      subscription.remove();
    };
  }, [appleIdentitySubject, logoutCurrentAppleSubject, notify]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (deviceTestMode) return false; // The local test screen owns its stop-before-leave flow.
      if (robotConnectionVisible) { setRobotConnectionVisible(false); return true; }
      if (guestMode) { setGuestMode(false); return true; }
      if (__DEV__ && connectionDiagnosticsOpen) { setConnectionDiagnosticsOpen(false); return true; }
      if (stage === 'edit-profile') {
        if (!profileSaveAttemptRef.current) profileBackRequestRef.current();
        return true;
      }
      if (stage === 'control') {
        setStage('main');
        return true;
      }
      if (stage === 'joint-status') {
        setStage('control');
        if (controlTarget === 'direct' && controlEndpoint) setRobotConnectionVisible(true);
        return true;
      }
      if (stage === 'reset-password') {
        if (accountBusy || accountFlowInFlightRef.current) return true;
        if (passwordNonceRequired) {
          setPasswordNonceRequired(false);
          setRecoveryLink(false);
          setStage('account-security');
        } else {
          void handleLogout();
        }
        return true;
      }
      if (stage === 'register' || stage === 'forgot-password' || stage === 'verify-email' || stage === 'verify-recovery') {
        if (accountBusy || otpDeliveryInFlightRef.current) return true;
        setAuthError(null);
        setPendingVerification(null);
        setStage('login');
        return true;
      }
      if (stage === 'display-name-confirmation') {
        if (!accountBusy && !accountFlowInFlightRef.current) displayNameCancelRef.current();
        return true;
      }
      if (stage === 'mfa-setup') {
        if (mfaBusy || mfaVerificationFlow.current.isPending()) return true;
        mfaBackRequestRef.current();
        return true;
      }
      if (stage === 'bind-device') {
        cancelBindDeviceAttempt();
        return true;
      }
      if (stage === 'device-enrollment') {
        deviceEnrollmentAbortControllerRef.current?.abort();
        deviceEnrollmentAbortControllerRef.current = null;
        deviceEnrollmentAttemptRef.current += 1;
        setDeviceEnrollmentBusy(false);
        setDeviceEnrollmentError(null);
        setStage('main');
        setActiveTab('profile');
        return true;
      }
      if (stage === 'account-security') {
        if (accountBusy || otpDeliveryInFlightRef.current) return true;
        accountSecurityBackRequestRef.current();
        return true;
      }
      if (stage === 'ble-discovery' || stage === 'provisioning' || stage === 'firmware-update') {
        returnToDeviceSettings();
        return true;
      }
      if (stage === 'models') {
        void handleLogout();
        return true;
      }
      if (stage === 'username-onboarding') {
        if (!accountBusy && !accountFlowInFlightRef.current) void handleLogout();
        return true;
      }
      if (stage === 'main' && activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [deviceTestMode, guestMode, accountBusy, activeTab, cancelBindDeviceAttempt, clearRecovery, connectionDiagnosticsOpen, robotConnectionVisible, handleLogout, mfaBusy, passwordNonceRequired, returnToDeviceSettings, stage, controlTarget, controlEndpoint]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const handleLogin = async (email: string, password: string) => {
    setAccountBusy(true);
    setAuthError(null);
    try {
      await login({ email, password });
    } catch (error) {
      setAuthError(humanizeAuthError(error));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSocialLogin = async (provider: SocialLoginProvider) => {
    if (accountBusy || socialLoginInFlightRef.current) return;
    socialLoginInFlightRef.current = true;
    setActiveSocialProvider(provider);
    setAccountBusy(true);
    setAuthError(null);
    try {
      const result = await socialAuthService.signIn(provider);
      if (result.status === 'cancelled') return;
      if (result.status === 'callback') {
        await handleAuthUrl(result.callbackUrl);
      } else {
        if (result.metadataStatus === 'needs-confirmation' && result.suggestedDisplayName) {
          setPendingAppleDisplayNames((current) => ({
            ...current,
            [result.session.user.id]: {
              displayName: result.suggestedDisplayName!,
            },
          }));
        }
        notify(
          '登录成功',
          result.metadataStatus === 'needs-confirmation'
            ? 'Apple 身份已验证，但显示名称尚未保存。请在当前确认页面保存或跳过。'
            : result.metadataStatus === 'durably-pending'
            ? 'Apple 身份已验证；首次姓名资料将在下次联网登录时继续同步。'
            : '第三方身份已通过 Supabase 验证，正在加载账户。',
          result.metadataStatus === 'needs-confirmation' || result.metadataStatus === 'durably-pending'
            ? 'info'
            : 'success',
        );
      }
    } catch (error) {
      if (error instanceof AuthCallbackCancelledError || socialAuthService.isSocialLoginCancelled(error)) return;
      setAuthError(humanizeAuthError(error));
    } finally {
      socialLoginInFlightRef.current = false;
      setActiveSocialProvider(null);
      setAccountBusy(false);
    }
  };

  const handleRegister = async ({ username, email, password }: RegisterValues) => {
    setAccountBusy(true);
    setAuthError(null);
    try {
      const result = await register({ username, email, password });
      if (result.session) {
        notify('账户创建成功', '登录会话已建立，正在加载设备。');
      } else {
        setPendingVerification({ email: email.trim().toLowerCase(), purpose: 'signup' });
        setStage('verify-email');
        notify('验证码已发送', '请输入邮件中的完整数字验证码完成注册。', 'info');
      }
    } catch (error) {
      if (isUncertainRegistrationOutcome(error)) {
        // The signup request may have reached Auth even though the response
        // was lost. Keep the email and expose the verification screen so the
        // user has a safe path to confirm without submitting signup again.
        setPendingVerification({ email: email.trim().toLowerCase(), purpose: 'signup' });
        setStage('verify-email');
        setAuthError(humanizeAuthError(error));
      } else {
        setAuthError(humanizeAuthError(error));
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleClaimUsername = async (username: string) => {
    if (accountBusy || accountFlowInFlightRef.current) return;
    accountFlowInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      await authService.claimUsername(username);
      const nextProfile = await refreshProfile();
      if (!nextProfile || !hasClaimedUsername(nextProfile)) {
        throw new Error('用户名设置未同步，请重试。');
      }
      notify('用户名设置成功', `你的 DOSO 用户名是 ${nextProfile.username}。`);
    } catch (error) {
      setAuthError(humanizeAuthError(error));
    } finally {
      accountFlowInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const resumeAfterDisplayNameRecovery = (userId: string, readyKey: string) => {
    setPendingAppleDisplayNames((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setAppleRecoveryProbe({ status: 'none', userId, readyKey });
    setAuthError(null);
    completedDeviceBootstrapKey.current = null;
    setDeviceLoadAttempt((attempt) => attempt + 1);
  };

  const handleCancelDisplayNameRecovery = async () => {
    if (accountBusy || accountFlowInFlightRef.current) return;
    const recovery = pendingAppleDisplayName;
    const probe = appleRecoveryProbe.status === 'pending' ? appleRecoveryProbe : null;
    if (
      !recovery
      || !probe
      || currentUserIdRef.current !== recovery.userId
      || preparedSessionKeyRef.current !== probe.readyKey
      || probe.userId !== recovery.userId
    ) return;
    accountFlowInFlightRef.current = true;
    const operation = displayRecoveryOperationTracker.current.begin(recovery.userId, probe.readyKey);
    const isCurrentOperation = () => (
      displayRecoveryOperationTracker.current.isCurrent(operation)
      && currentUserIdRef.current === operation.userId
      && preparedSessionKeyRef.current === operation.readyKey
    );
    setAccountBusy(true);
    setAuthError(null);
    try {
      await consumeAppleDisplayRecovery(probe, socialAuthService.clearPendingAppleDisplayName);
      if (isCurrentOperation()) resumeAfterDisplayNameRecovery(recovery.userId, probe.readyKey);
    } catch {
      if (isCurrentOperation()) setAuthError('暂时无法跳过显示名称确认，请重试。');
    } finally {
      accountFlowInFlightRef.current = false;
      if (isCurrentOperation()) setAccountBusy(false);
    }
  };

  displayNameCancelRef.current = () => {
    void handleCancelDisplayNameRecovery();
  };

  const handleConfirmDisplayName = async (displayName: string) => {
    if (accountBusy || accountFlowInFlightRef.current) return;
    const recovery = pendingAppleDisplayName;
    const probe = appleRecoveryProbe.status === 'pending' ? appleRecoveryProbe : null;
    if (
      !recovery
      || !probe
      || currentUserIdRef.current !== recovery.userId
      || preparedUserIdRef.current !== recovery.userId
      || preparedSessionKeyRef.current !== probe.readyKey
      || probe.userId !== recovery.userId
    ) return;
    accountFlowInFlightRef.current = true;
    const operation = displayRecoveryOperationTracker.current.begin(recovery.userId, probe.readyKey);
    const isCurrentOperation = () => (
      displayRecoveryOperationTracker.current.isCurrent(operation)
      && currentUserIdRef.current === operation.userId
      && preparedUserIdRef.current === operation.userId
      && preparedSessionKeyRef.current === operation.readyKey
    );
    setAccountBusy(true);
    setAuthError(null);
    try {
      await runAppleDisplayRecoveryConfirmation({
        update: () => authService.updatePresentationDisplayName(recovery.userId, displayName),
        consume: () => consumeAppleDisplayRecovery(probe, socialAuthService.clearPendingAppleDisplayName),
        refresh: refreshProfile,
        resume: () => resumeAfterDisplayNameRecovery(recovery.userId, probe.readyKey),
        notify: (savedDisplayName) => notify(
          '显示名称已保存',
          `${savedDisplayName} 只用于个人资料展示，不会修改 DOSO 用户名。`,
        ),
        isCurrent: isCurrentOperation,
      });
    } catch (error) {
      if (isCurrentOperation()) setAuthError(humanizeAuthError(error));
    } finally {
      accountFlowInFlightRef.current = false;
      if (isCurrentOperation()) setAccountBusy(false);
    }
  };

  const handleForgotPassword = async (email: string) => {
    if (accountBusy || otpDeliveryInFlightRef.current) return;
    otpDeliveryInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      await authService.sendPasswordRecoveryOtp(email);
      setPendingVerification({ email: email.trim().toLowerCase(), purpose: 'password-recovery' });
      setStage('verify-recovery');
      notify('验证码已发送', '如果该邮箱可用于恢复账户，你会收到邮箱验证码。', 'info');
    } catch (error) {
      setAuthError(humanizeAuthError(error));
    } finally {
      otpDeliveryInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const handleVerifySignupOtp = async (code: string) => {
    if (!pendingVerification || pendingVerification.purpose !== 'signup' || accountBusy || otpDeliveryInFlightRef.current) return;
    otpDeliveryInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      await authService.verifySignupOtp(pendingVerification.email, code);
      setPendingVerification(null);
      notify('邮箱验证成功', '账户已激活，正在建立安全终端会话。');
    } catch (error) {
      const message = humanizeAuthError(error);
      setAuthError(message);
      throw error;
    } finally {
      otpDeliveryInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const handleVerifyRecoveryOtp = async (code: string) => {
    if (!pendingVerification || pendingVerification.purpose !== 'password-recovery' || accountBusy || otpDeliveryInFlightRef.current) return;
    otpDeliveryInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      await authService.verifyPasswordRecoveryOtp(pendingVerification.email, code);
      setPendingVerification(null);
      setRecoveryLink(true);
      setPasswordNonceRequired(false);
      setStage('reset-password');
      notify('身份验证成功', '现在可以设置新的登录密码。');
    } catch (error) {
      const message = humanizeAuthError(error);
      setAuthError(message);
      throw error;
    } finally {
      otpDeliveryInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerification || accountBusy || otpDeliveryInFlightRef.current) return;
    const verification = pendingVerification;
    otpDeliveryInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      if (verification.purpose === 'signup') {
        await authService.resendSignupOtp(verification.email);
      } else {
        await authService.sendPasswordRecoveryOtp(verification.email);
      }
      notify('验证码已重新发送', '请检查收件箱和垃圾邮件。', 'info');
    } catch (error) {
      setAuthError(humanizeAuthError(error));
      throw error;
    } finally {
      otpDeliveryInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const handleRequestPasswordChange = async () => {
    if (accountBusy || otpDeliveryInFlightRef.current) return;
    const attempt = ++accountSecurityNonceAttemptRef.current;
    otpDeliveryInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    try {
      await authService.sendReauthenticationNonce();
      if (accountSecurityNonceAttemptRef.current !== attempt) return;
      setPasswordNonceRequired(true);
      setRecoveryLink(true);
      setStage('reset-password');
      notify('安全验证码已发送', '请输入邮件中的验证码后再设置新密码。', 'info');
    } catch (error) {
      if (accountSecurityNonceAttemptRef.current === attempt) {
        notify('无法发送安全验证码', humanizeAuthError(error), 'error');
      }
    } finally {
      otpDeliveryInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const handleResetPassword = async (password: string, nonce?: string) => {
    if (accountBusy || accountFlowInFlightRef.current) return;
    accountFlowInFlightRef.current = true;
    setAccountBusy(true);
    setAuthError(null);
    let revocationState: 'full' | 'without-audit' | 'auth-only' = 'full';
    try {
      await resetPassword(password, nonce);
      clearRecovery();
      setRecoveryLink(false);
      setPasswordNonceRequired(false);
      try {
        await revokeAllTerminals('password_changed');
      } catch (error) {
        if (isAccountSessionOutcomeError(error)) {
          setStage('account-security');
          notify('密码已更新，终端状态待核对', error.message, 'error');
          return;
        }
        try {
          await revokeAllTerminalsWithoutAudit();
          revocationState = 'without-audit';
        } catch (error) {
          if (isAccountSessionOutcomeError(error)) {
            setStage('account-security');
            notify('密码已更新，终端状态待核对', error.message, 'error');
            return;
          }
          revocationState = 'auth-only';
          await logout('global');
        }
      }
      setStage('login');
      notify(
        '密码已更新',
        revocationState === 'full'
          ? '全部登录终端已撤销，请使用新密码重新登录。'
          : revocationState === 'without-audit'
            ? '全部 DOSO 终端已撤销，但安全审计未写入；请通知支持检查 Edge Functions。'
            : 'Supabase 登录会话已全局退出，但 DOSO 终端撤销未确认；请联系支持。',
        revocationState === 'full' ? 'success' : 'error',
      );
    } catch (error) {
      setAuthError(humanizeAuthError(error));
    } finally {
      accountFlowInFlightRef.current = false;
      setAccountBusy(false);
    }
  };

  const enterApp = async (model: RobotModel) => {
    if (!deviceBootstrapIntent.current.enter()) return;
    setSelectedModel(model);
    setDevice(null);
    setActiveTab('home');
    setStage('main');
    notify('机型已选择', `${model.name} 尚未绑定机器人；请使用序列号和绑定码关联设备。`, 'info');
  };

  const handleBindDevice = async (serialNumber: string, code: string) => {
    bindDeviceAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bindDeviceAbortControllerRef.current = controller;
    pendingBindSerialNumberRef.current = serialNumber.trim().toUpperCase();
    const attempt = ++bindDeviceAttemptRef.current;
    setDeviceBusy(true);
    setAuthError(null);
    try {
      const boundDevice = await deviceRepository.claim(serialNumber, code, {
        signal: controller.signal,
        timeoutMs: BIND_DEVICE_TIMEOUT_MS,
      });
      if (attempt !== bindDeviceAttemptRef.current) return;
      pendingBindSerialNumberRef.current = null;
      deviceBootstrapIntent.current.clearLocalEntry();
      setDevice(boundDevice);
      setSelectedModel(getRobotModel(boundDevice.model_code));
      setActiveTab('profile');
      setStage('main');
      notify('账户归属已绑定', `${boundDevice.display_name} 已绑定到当前账户；请继续完成“设备身份验证”，暂不会因此开放控制。`, 'info', null);
    } catch (error) {
      if (attempt !== bindDeviceAttemptRef.current) return;
      const ambiguousOutcome = error instanceof Error
        && /edge function|fetch|network|abort|timeout|internal_error|server could not complete|non-2xx/i.test(error.message);
      if (ambiguousOutcome) {
        const reconciledDevice = await reconcileBoundDevice(serialNumber);
        if (attempt !== bindDeviceAttemptRef.current) return;
        if (reconciledDevice) {
          pendingBindSerialNumberRef.current = null;
          deviceBootstrapIntent.current.clearLocalEntry();
          setDevice(reconciledDevice);
          setSelectedModel(getRobotModel(reconciledDevice.model_code));
          setActiveTab('profile');
          setStage('main');
          notify(
            '账户归属已重新确认',
            `${reconciledDevice.display_name} 已绑定；设备身份仍待验证，请在设备设置中继续。`,
            'info',
          );
          return;
        }
      }
      const message = error instanceof Error && error.message.includes('Edge Function')
        ? '绑定请求未完成，结果尚未确认。请返回设备设置刷新状态后再试。'
        : humanizeAuthError(error);
      setAuthError(message);
      throw error;
    } finally {
      if (bindDeviceAbortControllerRef.current === controller) bindDeviceAbortControllerRef.current = null;
      if (attempt === bindDeviceAttemptRef.current) {
        pendingBindSerialNumberRef.current = null;
        setDeviceBusy(false);
      }
    }
  };

  const handleStartDeviceEnrollment = async () => {
    const currentDevice = device;
    const expectedUserId = currentUserIdRef.current;
    const expectedSessionKey = preparedSessionKeyRef.current;
    if (!currentDevice || currentDevice.is_demo || !expectedUserId || !expectedSessionKey
      || preparedUserIdRef.current !== expectedUserId) {
      setDeviceEnrollmentError('当前账户或设备上下文尚未准备完成，请返回设备页后重试。');
      return;
    }
    deviceEnrollmentAbortControllerRef.current?.abort();
    const controller = new AbortController();
    deviceEnrollmentAbortControllerRef.current = controller;
    const attempt = ++deviceEnrollmentAttemptRef.current;
    setDeviceEnrollmentBusy(true);
    setDeviceEnrollmentError(null);
    try {
      const next = await beginDeviceEnrollment(currentDevice.id, { signal: controller.signal, timeoutMs: BIND_DEVICE_TIMEOUT_MS });
      if (attempt !== deviceEnrollmentAttemptRef.current
        || currentUserIdRef.current !== expectedUserId
        || preparedSessionKeyRef.current !== expectedSessionKey
        || deviceSettingsContext.current.deviceId !== currentDevice.id) return;
      setDeviceEnrollment(next);
    } catch (error) {
      if (attempt !== deviceEnrollmentAttemptRef.current) return;
      setDeviceEnrollmentError(humanizeAuthError(error));
    } finally {
      if (deviceEnrollmentAbortControllerRef.current === controller) deviceEnrollmentAbortControllerRef.current = null;
      if (attempt === deviceEnrollmentAttemptRef.current) setDeviceEnrollmentBusy(false);
    }
  };

  const handleUnbindDevice = () => {
    if (!device || device.is_demo) {
      notify('没有可解绑的真实设备', '当前尚未绑定真实设备。', 'info');
      return;
    }
    const unbind = () => {
      setDeviceBusy(true);
      void deviceRepository.unbind(device.id, 'user_confirmed_unbind')
        .then(() => {
          setDevice(null);
          setSelectedModel(getRobotModel(device.model_code));
          notify('设备已解绑', '设备已返回待认领状态。', 'info');
        })
        .catch((error: unknown) => notify('解绑失败', humanizeAuthError(error), 'error'))
        .finally(() => setDeviceBusy(false));
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`解绑 ${device.display_name}？解绑后设备会立即从此账户移除。`)) unbind();
      return;
    }
    Alert.alert(
      '解绑当前设备？',
      `解绑 ${device.display_name} 后，控制和设备数据会立即从此账户移除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认解绑',
          style: 'destructive',
          onPress: unbind,
        },
      ],
    );
  };

  const persistDeviceSettings = async (settings: DeviceSettingsUpdate, successMessage?: string) => {
    if (!deviceSettingsMountedRef.current || deviceSettingsContext.current !== deviceSettingsRenderContext) return;
    if (!device) {
      notify('尚未绑定设备', '请先选择或绑定一台机器人。', 'error');
      return;
    }
    const expectedContext = deviceSettingsRenderContext;
    if (!expectedContext.identity || expectedContext.deviceId !== device.id
      || expectedContext.ownerId !== device.owner_id || device.owner_id !== currentUserIdRef.current) return;
    if (deviceSettingsAttemptRef.current) {
      notify('设备设置正在保存', '请等待当前保存完成后再试。', 'info');
      return;
    }
    const attempt = Symbol('device-settings');
    deviceSettingsAttemptRef.current = attempt;
    const isCurrent = () => deviceSettingsMountedRef.current
      && deviceSettingsAttemptRef.current === attempt && deviceSettingsContext.current === expectedContext;
    const previous = device;
    setDevice({ ...device, ...settings });
    try {
      const updated = await deviceRepository.updateSettings(device.id, settings);
      if (!isCurrent()) return;
      setDevice(updated);
      if (successMessage) notify('设备设置已保存', successMessage);
    } catch (error) {
      if (!isCurrent()) return;
      setDevice(previous);
      notify('保存失败', humanizeAuthError(error), 'error');
    } finally {
      if (isCurrent()) deviceSettingsAttemptRef.current = null;
    }
  };

  const createCommandId = (capability: RobotCapability) => (
    `${capability}-${Date.now().toString(36)}-${++commandIdSequenceRef.current}`
  );

  const runCommand = (capability: RobotCapability, label: string, payload: Readonly<Record<string, unknown>>) => {
    const permission = commandPermissionRef.current(capability);
    if (!permission.capabilityAvailable) {
      notify(`${label}未下发`, robotCapabilityReadiness[capability].reason ?? '能力授权不可用。', 'error');
      return;
    }
    const executorSupport = executorSupportForCapability(capability);
    if (!executorSupport.supported) {
      const executorReason = executorSupport.state === 'fault'
        ? '命令执行器故障，未下发。'
        : '真实设备命令执行器尚未接入，当前不会下发控制指令。';
      notify(`${label}未下发`, executorReason, 'error');
      return;
    }
    if (pendingCommands[capability]) {
      notify(`${label}未重复下发`, '同类指令正在等待可信设备终态。', 'info');
      return;
    }
    if (!permission.deviceId) {
      notify(`${label}未下发`, '当前没有可信的设备绑定。', 'error');
      return;
    }

    const attempt = robotCommandCoordinator.dispatch({
      capability,
      commandId: createCommandId(capability),
      deadlineMs: Date.now() + ROBOT_COMMAND_DEADLINE_MS,
      deviceId: permission.deviceId,
      payload,
    });
    let unsubscribe: () => void = () => undefined;
    unsubscribe = attempt.subscribe((state: RobotCommandAttemptState) => {
      const pending = state.status === 'submitting' || state.status === 'accepted' || state.status === 'executing';
      setPendingCommands((current) => ({ ...current, [capability]: pending }));
      if (state.status === 'submitting') {
        notify(`${label}提交中`, '已交给受保护发送链路；机器人尚未确认受理。', 'info');
      } else if (state.status === 'accepted') {
        notify(`${label}已受理`, '等待认证设备开始执行；尚未完成。', 'info');
      } else if (state.status === 'executing') {
        notify(`${label}执行中`, '等待认证设备返回最终结果；尚未完成。', 'info');
      } else if (state.status === 'succeeded') {
        notify(`${label}已完成`, '认证设备已返回成功终态，并通过最终权限复核。');
        unsubscribe();
      } else {
        const failureMessage = state.status === 'expired'
          ? '未在时限内收到可信设备终态；请先确认机器人状态再重试。'
          : state.status === 'cancelled'
            ? '指令已取消，未显示为完成。'
            : '设备或执行链路未返回可信成功终态。';
        notify(`${label}未完成`, failureMessage, 'error');
        unsubscribe();
      }
    });
  };

  const renderMainScreen = () => {
    switch (activeTab) {
      case 'map':
        return <MapScreen blockedReason={commandBlockedReason('routeStart', '路线指令')} controlAvailable={routeControlAvailable} executorAvailable={routeExecutorAvailable} robotName={deviceName} onStartRoute={(routeId) => runCommand('routeStart', '路线指令', { routeId })} />;
      case 'tasks':
        return <TasksScreen blockedReason={commandBlockedReason('taskStart', '任务指令')} controlAvailable={taskControlAvailable} executorAvailable={taskExecutorAvailable} robotName={deviceName} onStartTask={(taskId) => runCommand('taskStart', '任务指令', { taskId })} />;
      case 'analysis':
        return <AnalysisScreen previewMode={false} />;
      case 'profile':
        return (
          <ProfileScreen
            accountEmail={user?.email}
            displayName={profile?.display_name}
            username={profile?.username}
            avatarUrl={profileAvatarUrl}
            onEditProfile={openProfileEditor}
            onOpenControl={() => { setControlTarget('account'); setStage('control'); }}
            onOpenRobotConnection={() => setRobotConnectionVisible(true)}
            onOpenDeviceEnrollment={device && !device.is_demo ? () => {
              setDeviceEnrollmentError(null);
              setStage('device-enrollment');
            } : undefined}
            deviceEnrollmentStatus={deviceEnrollment?.phase ?? 'not_started'}
            onOpenConnectionDiagnostics={__DEV__ ? () => setConnectionDiagnosticsOpen(true) : undefined}
            onOpenDataPrivacy={openDataPrivacy}
            alertsEnabled={alertsEnabled}
            batteryPercent={displayBatteryPercent}
            connected={connected}
            deviceName={deviceName}
            deviceType={deviceType}
            firmwareVersion={firmwareVersion}
            lastSyncLabel={lastSeenLabel(device?.last_seen_at)}
            canOpenFirmwareUpdate={robotCapabilityReadiness.ota.available}
            canOpenProvisioning={robotCapabilityReadiness.provisioning.available}
            onConnect={() => setRobotConnectionVisible(true)}
            onDisconnect={() => notify('设备断开请求未发送', '待机器人控制协议接入后，此操作会经过受保护的设备 API。', 'info')}
            onLogout={() => void handleLogout()}
            onBindDevice={() => { setAuthError(null); setStage('bind-device'); }}
            firmwareUpdateBlockedReason={robotCapabilityReadiness.ota.reason}
            onOpenBleDiscovery={() => setStage('ble-discovery')}
            onOpenFirmwareUpdate={() => setStage('firmware-update')}
            onOpenProvisioning={() => setStage('provisioning')}
            provisioningBlockedReason={robotCapabilityReadiness.provisioning.reason}
            onOpenAccountSecurity={() => setStage('account-security')}
            onRetry={() => notify('设备状态说明', 'App 只显示机器人网关近期的可信上报；当前不会主动伪造或重试连接。', 'info')}
            onToggleAlerts={() => void persistDeviceSettings({ alerts_enabled: !alertsEnabled })}
            onUnbindDevice={handleUnbindDevice}
            runtimeHours={device?.runtime_hours ?? null}
            safetyLock={trustedSafetyLock}
            serialNumber={device?.serial_number ?? '待绑定'}
          />
        );
      case 'home':
      default:
        return (
          <HomeScreen
            batteryPercent={displayBatteryPercent}
            canRecall={recallCommandAvailable}
            connected={connected}
            onOpenControl={() => { setControlTarget('account'); setStage('control'); }}
            directConnection={directConnection.presentation ?? undefined}
            onOpenDirectControl={() => { setControlTarget('direct'); setStage('control'); }}
            onOpenRoutes={() => setActiveTab('map')}
            onOpenSafety={() => setActiveTab('profile')}
            onOpenTasks={() => setActiveTab('tasks')}
            recallBlockedReason={commandBlockedReason('recall', '召回指令')}
            onRecall={() => runCommand('recall', '召回指令', { mode: 'return-home' })}
            robotCompactImage={deviceCompactImage}
            robotImage={deviceImage}
            robotName={deviceName}
            safetyLock={safetyLock}
            taskControlAvailable={taskControlAvailable}
            taskExecutorAvailable={taskExecutorAvailable}
          />
        );
    }
  };

  const enterGuest = useCallback(() => {
    if (accountBusy || recoveryExitBusy || mfaBusy || mfaVerificationPending
      || accountFlowInFlightRef.current || otpDeliveryInFlightRef.current) return false;
    setRobotConnectionVisible(false);
    setConnectionDiagnosticsOpen(false);
    setGuestMode(true);
    return true;
  }, [accountBusy, recoveryExitBusy, mfaBusy, mfaVerificationPending]);
  const enterDeviceTest = useCallback(() => {
    if (isBrainstemLanAvailable() && enterGuest()) setDeviceTestMode(true);
  }, [enterGuest]);
  const exitDeviceTest = useCallback(() => { setDeviceTestMode(false); setGuestMode(false); }, []);
  const deviceTestEntry = isBrainstemLanAvailable() ? enterDeviceTest : undefined;
  const exitGuest = useCallback(() => { setGuestMode(false); }, []);
  const canOpenRobotAccountActions = Boolean(!guestMode && user && deviceBootstrapIntent.current.canCommit(user.id)
    && preparedSessionKey && preparedUserId === user.id
    && !authLoading && !initializationError && !mfaVerificationPending && !accountBusy && !deviceBootstrapBusy
    && (stage === 'main' || stage === 'control' || stage === 'bind-device' || stage === 'ble-discovery'));
  const canSelectDirectTarget = canOpenRobotAccountActions || Boolean(directConnectionReady && stage === 'models');
  // This route exposes an explicit read-only local check. Continuing into main
  // still requires account preparation; it never binds or grants motion authority.
  if (deviceTestMode && isBrainstemLanAvailable()) return <SafeAreaProvider><DeviceTestScreen onExit={exitDeviceTest} /></SafeAreaProvider>;

  if (robotConnectionVisible) return <SafeAreaProvider><RobotConnectionScreen
    key={guestMode ? 'guest-read-only' : deviceSettingsIdentity ?? 'anonymous-read-only'}
    initialEndpoint={guestMode ? undefined : controlEndpoint ?? directConnection.snapshot?.endpoint}
    onBack={() => setRobotConnectionVisible(false)}
    onUseConnection={canSelectDirectTarget ? snapshot => {
      if (!directConnection.select(snapshot)) return false;
      if (stage === 'models' && !deviceBootstrapIntent.current.enter()) { directConnection.clear(); return false; }
      void brainstemControl.disconnect(); setControlEndpoint(null);
      setControlTarget('direct'); setActiveTab('home'); setStage('main'); setRobotConnectionVisible(false);
      return true;
    } : undefined}
    onOpenControl={canSelectDirectTarget ? async (endpoint, principal, signal) => {
      if (signal.aborted) return false;
      const cancelConnection = () => { void brainstemControl.disconnect(); };
      signal.addEventListener('abort', cancelConnection, { once: true });
      try {
        if (!(await brainstemControl.connect(endpoint, principal)) || signal.aborted) return false;
        if (stage === 'models' && !deviceBootstrapIntent.current.enter()) { await brainstemControl.disconnect(); return false; }
        setControlEndpoint(endpoint); setControlTarget('direct'); setStage('control'); setRobotConnectionVisible(false);
        return true;
      } finally { signal.removeEventListener('abort', cancelConnection); }
    } : undefined}
    accountDeviceName={canOpenRobotAccountActions && device && !device.is_demo ? deviceName : undefined}
    accountDeviceConnected={canOpenRobotAccountActions && device && !device.is_demo ? connected : false}
    accountDeviceIdentityStatus={canOpenRobotAccountActions && device && !device.is_demo
      ? deviceEnrollment?.phase === 'completed' ? 'verified' : 'bound-unverified'
      : 'unbound'}
    accountDeviceConnectionSource={canOpenRobotAccountActions && device && !device.is_demo ? '云端设备记录' : '未建立'}
    accountDeviceLastSyncLabel={canOpenRobotAccountActions && device && !device.is_demo ? lastSeenLabel(device.last_seen_at) : '尚未同步'}
    accountControlAuthority="unknown"
    accountBlockedReason={canOpenRobotAccountActions && device && !device.is_demo
      ? commandBlockedReason('manualControl', '手动控制')
      : undefined}
    onOpenAccountDevice={canOpenRobotAccountActions && device && !device.is_demo ? () => {
      setControlTarget('account'); setRobotConnectionVisible(false); setStage('control');
    } : undefined}
    onOpenDeviceEnrollment={canOpenRobotAccountActions && device && !device.is_demo ? () => {
      setRobotConnectionVisible(false); setDeviceEnrollmentError(null); setStage('device-enrollment');
    } : undefined}
    onOpenBleDiscovery={canOpenRobotAccountActions ? () => { setRobotConnectionVisible(false); setStage('ble-discovery'); } : undefined}
    onBindDevice={canOpenRobotAccountActions ? () => { setRobotConnectionVisible(false); setAuthError(null); setStage('bind-device'); } : undefined}
  /></SafeAreaProvider>;

  if (guestMode) return <SafeAreaProvider><GuestScreen
    onExitGuest={exitGuest}
    onOpenConnection={() => setRobotConnectionVisible(true)}
  /></SafeAreaProvider>;

  if (__DEV__ && connectionDiagnosticsOpen) return <SafeAreaProvider><ConnectionDiagnosticsScreen onBack={() => setConnectionDiagnosticsOpen(false)} /></SafeAreaProvider>;

  if (initializationError || recoveryExitBusy) {
    return (
      <ServiceErrorScreen
        busy={authLoading || recoveryExitBusy}
        logoutBusy={recoveryExitBusy}
        feedback={recoveryExitError ?? notice?.message}
        message={initializationError ? humanizeAuthError(initializationError) : '正在退出本机账户…'}
        onLogout={() => void handleRecoveryLogout()}
        onRetry={() => { setRecoveryExitError(null); setNotice(null); retryInitialization(); }}
        title="无法恢复账户会话"
        onOpenRobotConnection={() => setRobotConnectionVisible(true)}
        onEnterDeviceTest={deviceTestEntry}
        onEnterGuest={!recoveryExitBusy && !accountBusy && !mfaBusy && !mfaVerificationPending ? enterGuest : undefined}
        onDiagnostics={__DEV__ ? () => setConnectionDiagnosticsOpen(true) : undefined}
      />
    );
  }

  if (authLoading || mfaVerificationPending || deviceBootstrapBusy) return <LoadingScreen label={logoutPending ? '正在退出当前账户…' : mfaVerificationPending ? '正在核对双重验证结果…' : deviceBootstrapBusy ? '正在读取设备列表…' : '正在恢复安全会话…'} onEnterGuest={!accountBusy && !logoutPending && !mfaBusy && !mfaVerificationPending && !recoveryExitBusy ? enterGuest : undefined} onEnterDeviceTest={!accountBusy && !logoutPending && !mfaBusy && !mfaVerificationPending && !recoveryExitBusy ? deviceTestEntry : undefined} />;

  if (
    user
    && preparedSessionKey
    && appleRecoveryProbe.status === 'error'
    && appleRecoveryProbe.userId === user.id
    && appleRecoveryProbe.readyKey === preparedSessionKey
  ) {
    return (
      <ServiceErrorScreen
        busy={false}
        feedback={notice?.message ?? authError ?? undefined}
        message="暂时无法检查 Apple 首次登录资料。当前不会加载设备或写入资料，请重试。"
        onLogout={() => void handleLogout()}
        onRetry={() => setAppleRecoveryProbeAttempt((attempt) => attempt + 1)}
        title="无法恢复 Apple 登录资料"
      />
    );
  }

  if (user && preparedSessionKey && !appleRecoveryProbeResolved) {
    return <LoadingScreen label="正在检查 Apple 登录资料…" />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {stage === 'login' ? (
        <LoginScreen
          error={authError ?? (!isSupabaseConfigured ? '认证服务尚未配置，请先按 README 启动 Supabase。' : null)}
          loading={accountBusy}
          onCreateAccount={() => { setAuthError(null); setStage('register'); }}
          onForgotPassword={() => { setAuthError(null); setStage('forgot-password'); }}
          onLogin={handleLogin}
          onEnterGuest={enterGuest}
          onEnterDeviceTest={deviceTestEntry}
          onOpenConnectionDiagnostics={__DEV__ ? () => setConnectionDiagnosticsOpen(true) : undefined}
          onOpenDataPrivacy={openDataPrivacy}
          onOpenRobotConnection={() => setRobotConnectionVisible(true)}
        />
      ) : null}

      {stage === 'register' ? (
        <RegisterScreen error={authError} loading={accountBusy} onBackToLogin={() => { setAuthError(null); setStage('login'); }} onForgotPassword={() => { setAuthError(null); setStage('forgot-password'); }} onOpenDataPrivacy={openDataPrivacy} onRegister={handleRegister} />
      ) : null}

      {stage === 'verify-email' && pendingVerification?.purpose === 'signup' ? (
        <EmailOtpScreen
          email={pendingVerification.email}
          error={authError}
          loading={accountBusy}
          onBackToLogin={() => { setAuthError(null); setPendingVerification(null); setStage('login'); }}
          onResend={handleResendVerification}
          onVerify={handleVerifySignupOtp}
        />
      ) : null}

      {stage === 'forgot-password' ? (
        <ForgotPasswordScreen error={authError} loading={accountBusy} onBackToLogin={() => { setAuthError(null); setStage('login'); }} onRequestReset={handleForgotPassword} />
      ) : null}

      {stage === 'verify-recovery' && pendingVerification?.purpose === 'password-recovery' ? (
        <EmailOtpScreen
          email={pendingVerification.email}
          error={authError}
          loading={accountBusy}
          onBackToLogin={() => { setAuthError(null); setPendingVerification(null); setStage('login'); }}
          onResend={handleResendVerification}
          onVerify={handleVerifyRecoveryOtp}
          purpose="password-recovery"
        />
      ) : null}

      {stage === 'reset-password' ? (
        <ResetPasswordScreen
          error={authError}
          loading={accountBusy}
          nonceRequired={passwordNonceRequired}
          onBackToLogin={() => {
            if (passwordNonceRequired) {
              setPasswordNonceRequired(false);
              setRecoveryLink(false);
              setStage('account-security');
            } else {
              void handleLogout();
            }
          }}
          onResetPassword={handleResetPassword}
        />
      ) : null}

      {stage === 'edit-profile' && user && profile?.id === user.id ? (
        <EditProfileScreen
          key={user.id}
          avatarUrl={profileAvatarUrl}
          busy={profileEditBusy}
          error={profileEditError}
          onBack={returnToDeviceSettings}
          onBackRequestChange={registerProfileBackRequest}
          onSave={handleSaveProfile}
          profile={profile}
        />
      ) : null}

      {stage === 'account-security' && user ? (
        <AccountSecurityScreen
          busy={accountBusy}
          canManageMfa={canManageMfa}
          email={user.email ?? ''}
          emailVerified={Boolean(user.email_confirmed_at)}
          onBackRequestChange={registerAccountSecurityBackRequest}
          onAllTerminalsRevoked={() => {
            clearRecovery();
            setDevice(null);
            setSelectedModel(null);
            setStage('login');
          }}
          onBack={() => {
            if (accountBusy || otpDeliveryInFlightRef.current) return;
            setActiveTab('profile');
            setStage('main');
          }}
          onChangePassword={() => void handleRequestPasswordChange()}
          onManageMfa={() => {
            if (!accountBusy && !otpDeliveryInFlightRef.current) setStage('mfa-setup');
          }}
        />
      ) : null}

      {stage === 'username-onboarding' && user ? (
        <UsernameOnboardingScreen
          error={authError}
          loading={accountBusy}
          onClaim={handleClaimUsername}
          onLogout={() => void handleLogout()}
        />
      ) : null}

      {stage === 'display-name-confirmation'
        && user
        && preparedUserId === user.id
        && preparedSessionKey
        && appleRecoveryProbe.status === 'pending'
        && appleRecoveryProbe.readyKey === preparedSessionKey
        && pendingAppleDisplayName?.userId === user.id ? (
        <DisplayNameConfirmationScreen
          error={authError}
          initialDisplayName={pendingAppleDisplayName.displayName}
          key={`${pendingAppleDisplayName.userId}:${preparedSessionKey}`}
          loading={accountBusy}
          onCancel={handleCancelDisplayNameRecovery}
          onSave={handleConfirmDisplayName}
        />
      ) : null}

      {stage === 'mfa-setup' && user && canManageMfa ? (
        <MfaSetupScreen
          expectedIdentity={mfaIdentity}
          key={`${mfaIdentity?.userId}:${mfaIdentity?.sessionId}`}
          onBack={() => setStage('account-security')}
          onBackRequestChange={registerMfaBackRequest}
          onBusyChange={setMfaBusy}
          onVerify={handleMfaVerify}
        />
      ) : null}

      {stage === 'bind-device' && user ? (
        <BindDeviceScreen
          busy={deviceBusy}
          error={authError}
          onBack={cancelBindDeviceAttempt}
          onBind={handleBindDevice}
        />
      ) : null}

      {stage === 'device-enrollment' && user && device && !device.is_demo ? (
        <DeviceEnrollmentScreen
          busy={deviceEnrollmentBusy}
          deviceName={device.display_name}
          serialNumber={device.serial_number}
          enrollment={deviceEnrollment}
          error={deviceEnrollmentError}
          onBack={() => {
            deviceEnrollmentAbortControllerRef.current?.abort();
            deviceEnrollmentAbortControllerRef.current = null;
            deviceEnrollmentAttemptRef.current += 1;
            setDeviceEnrollmentBusy(false);
            setDeviceEnrollmentError(null);
            setStage('main');
            setActiveTab('profile');
          }}
          onStart={() => void handleStartDeviceEnrollment()}
        />
      ) : null}

      {stage === 'ble-discovery' && user ? (
        <BleDiscoveryScreen
          deviceName={deviceName}
          onBack={returnToDeviceSettings}
        />
      ) : null}

      {stage === 'provisioning' && user ? (
        <DeviceUnavailableScreen
          capability="provisioning"
          deviceName={deviceName}
          onBack={returnToDeviceSettings}
        />
      ) : null}

      {stage === 'firmware-update' && user ? (
        <DeviceUnavailableScreen
          capability="firmware"
          deviceName={deviceName}
          onBack={returnToDeviceSettings}
        />
      ) : null}

      {stage === 'device-error' ? (
        <ServiceErrorScreen
          busy={accountBusy}
          message={deviceLoadError ?? '设备资料暂时无法加载。'}
          onLogout={() => void handleLogout()}
          onRetry={() => setDeviceLoadAttempt((attempt) => attempt + 1)}
          title="无法加载设备资料"
        />
      ) : null}

      {stage === 'models' ? (
        <ModelSelectScreen
          busy={deviceBusy || accountBusy || !deviceBootstrapIntent.current.canCommit(user?.id ?? '')}
          onBack={() => void handleLogout()}
          onContinue={(model) => void enterApp(model)}
          onOpenRobotConnection={() => setRobotConnectionVisible(true)}
          onSkip={() => {
            if (!deviceBootstrapIntent.current.enter()) return;
            setSelectedModel(robotModels[0]);
            setActiveTab('home');
            setStage('main');
            notify('尚未绑定设备', '你可以浏览 App；控制指令会保持锁定。', 'info');
          }}
        />
      ) : null}

      {stage === 'joint-status' ? (
        <JointStatusScreen
          deviceName={controlTarget === 'direct' ? directEndpointLabel : deviceName}
          joints={controlTarget === 'direct' ? controlEndpoint ? directTelemetry.presentation?.runtimeState?.joints : directConnection.presentation?.runtimeState?.joints : undefined}
          observedAt={controlTarget === 'direct' ? controlEndpoint ? directTelemetry.snapshot?.observation.observedAt : directConnection.presentation?.fresh ? directConnection.snapshot?.observation.observedAt : undefined : undefined}
          refreshing={controlTarget === 'direct' && directTelemetry.refreshing}
          error={controlTarget === 'direct' ? directTelemetry.error : undefined}
          onRefresh={controlTarget === 'direct' && controlEndpoint ? () => { void directTelemetry.refresh(); } : undefined}
          onBack={() => { setStage('control'); if (controlTarget === 'direct' && controlEndpoint) setRobotConnectionVisible(true); }}
        />
      ) : null}

      {stage === 'control' ? (
        <ControlScreen
          g20Controller={g20Controller}
          operationTargetKey={JSON.stringify([deviceSettingsIdentity, controlTarget,
            controlTarget === 'direct' ? [directEndpoint?.host, directEndpoint?.port, directEndpoint?.transport, controlEndpoint?.clientIdentityAlias] : device?.id])}
          allowInteractionPreview={controlTarget !== 'direct' && __DEV__}
          batteryPercent={controlTarget === 'direct' ? null : displayBatteryPercent}
          canUseManualControl={controlTarget === 'direct' ? brainstemControl.canBeginManualControl : manualCommandAvailable}
          productionInput={controlTarget === 'direct' && controlEndpoint ? {
            ready: brainstemControl.canBeginManualControl,
            onDrive: brainstemControl.drive,
            onTurn: brainstemControl.turn,
            onSticks: brainstemControl.sticks,
            onInterrupt: brainstemControl.interrupt,
          } : undefined}
          controlSession={controlTarget === 'direct' && controlEndpoint ? {
            label: brainstemControl.state.status ? `电机${brainstemControl.state.status.motorOutputEnabled ? '已使能' : '未使能'}，${({ zero: '初始化', grounded: '落地', standing: '站立', walking: '行走', transitioning: '姿态切换中' })[brainstemControl.state.status.fsmKind]}` : '尚未建立控制连接',
            canAcquire: brainstemControl.canAcquire,
            leaseActive: brainstemControl.state.leaseActive || brainstemControl.manualPrepared,
            busy: brainstemControl.state.phase === 'operating' || brainstemControl.state.phase === 'connecting',
            onAcquire: brainstemControl.prepareManualControl,
            onRelease: () => { void brainstemControl.interrupt(); },
            error: brainstemControl.state.error,
          } : undefined}
          canUseRouteMode={controlTarget !== 'direct' && routeCommandAvailable}
          canUseTaskMode={controlTarget !== 'direct' && taskCommandAvailable}
          brainstemIntegration={brainstemIntegration}
          connected={controlTarget === 'direct' ? brainstemControl.state.connected : connected}
          diagnosticsDeviceClass={controlTarget === 'direct' ? 'physical' : lifecycleDemoEnabled ? 'demo' : 'physical'}
          diagnosticsGateway={robotDiagnosticsGateway}
          onBack={() => setStage('main')}
          onOpenConnection={() => setRobotConnectionVisible(true)}
          onOpenJointStatus={async () => {
            if (diagnosticNavigation.current !== diagnosticNavigationOwner || AppState.currentState !== 'active') return;
            try { await brainstemControl.operationCallbacks.stop(); } catch { return; }
            if (diagnosticNavigation.current !== diagnosticNavigationOwner || AppState.currentState !== 'active') return;
            diagnosticNavigation.current = { ...diagnosticNavigationOwner };
            void brainstemControl.disconnect(); setStage('joint-status');
          }}
          onOpenMap={controlTarget === 'direct' ? undefined : () => { setActiveTab('map'); setStage('main'); }}
          onOpenRoutes={controlTarget === 'direct' ? undefined : () => { setActiveTab('map'); setStage('main'); }}
          onOpenTasks={controlTarget === 'direct' ? undefined : () => { setActiveTab('tasks'); setStage('main'); }}
          canRecall={controlTarget !== 'direct' && recallCommandAvailable}
          recallBlockedReason={commandBlockedReason('recall', '召回')}
          onRecall={controlTarget === 'direct' ? undefined : () => runCommand('recall', '召回', { mode: 'return-home' })}
          directConnection={controlTarget === 'direct' ? controlEndpoint ? directTelemetry.presentation ?? { ...describeDirectRobotConnection(null), endpointLabel: directEndpointLabel } : directConnection.presentation ?? describeDirectRobotConnection(null) : undefined}
          runtimeState={controlTarget === 'direct' ? controlEndpoint ? brainstemControl.state.connected ? { ...brainstemControl.runtimeState, battery: directTelemetry.presentation?.runtimeState.battery, joints: directTelemetry.presentation?.runtimeState.joints } : describeDirectRobotConnection(null).runtimeState : directConnection.presentation?.runtimeState ?? describeDirectRobotConnection(null).runtimeState : { controlLink: 'disconnected', controlAuthority: 'unknown', posture: 'unknown', motorState: 'unknown', deviceIdentity: device && !device.is_demo ? deviceEnrollment?.phase === 'completed' ? 'verified' : 'bound-unverified' : 'unbound', faultStatus: 'unknown', faultSummary: '真实故障状态尚未同步', speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' }, inputSource: 'touch', currentPolicy: null, policyCatalogStatus: 'unknown', policyOptions: [] }}
          operationCallbacks={controlTarget === 'direct' ? brainstemControl.operationCallbacks : undefined}
          operationReadiness={controlTarget === 'direct' ? brainstemControl.operationReadiness : {
            stop: { ready: false, blockedReason: '停止通道未接入；当前不会发送假停止指令。' },
            stand: { ready: false, blockedReason: '姿态通道未接入，请先连接并核验授权。' },
            sit: { ready: false, blockedReason: '坐下通道未接入，还需核实机器人已停止移动。' },
            enableMotor: { ready: false, blockedReason: '使能通道未接入，需硬件安全检查与授权。' },
            disableMotor: { ready: false, blockedReason: '失能通道未接入，普通停止不能代替失能。' },
            switchPolicy: { ready: false, blockedReason: '未同步策略列表，切换通道未接入。' },
          }}
          onOpenConnectionDiagnostics={__DEV__ ? () => setConnectionDiagnosticsOpen(true) : undefined}
          manualControlBlockedReason={controlTarget === 'direct' ? brainstemControl.state.error ?? '请先确认电机与姿态，再启用触控。' : commandBlockedReason('manualControl', '手动控制')}
          routeModeBlockedReason={commandBlockedReason('routeStart', '路线指令')}
          taskModeBlockedReason={commandBlockedReason('taskStart', '任务指令')}
          onNotifications={() => notify('通知服务尚未接入', '当前不能查询真实设备异常；待设备事件与通知服务上线后开放。', 'info')}
          robotImage={deviceImage}
          robotName={controlTarget === 'direct' ? 'IP 直连设备' : deviceName}
          robotType={controlTarget === 'direct' ? brainstemControl.state.connected ? '局域网配对控制' : '只读状态，设备归属未核验' : deviceType}
        />
      ) : null}

      {stage === 'main' ? (
        (() => {
          const safeAreaEdges: ('top' | 'left' | 'right' | 'bottom')[] =
            ['top', 'left', 'right', 'bottom'];
          return (
        <SafeAreaView
          edges={safeAreaEdges}
          style={[
            styles.safeArea,
            { backgroundColor: appColors.background },
            isLandscape && styles.safeAreaLandscape,
          ]}
        >
          <AppHeader
            flow
            title={activeTab === 'tasks' ? '任务' : undefined}
            subtitle={activeTab === 'tasks' ? `${deviceName}（${connected ? '已连接' : '离线'}）` : undefined}
            avatarUrl={profileAvatarUrl}
            onProfile={openProfileEditor}
            displayName={profile?.display_name ?? user?.user_metadata.display_name ?? user?.email?.split('@')[0] ?? '用户'}
            onNotifications={() => notify(notificationUnavailableNotice.title, notificationUnavailableNotice.message, notificationUnavailableNotice.tone, null)}
          />
          <AppToast notice={notice} onDismiss={() => setNotice(null)} withinSafeArea />
          {profileAvatarError && activeTab === 'profile' ? (
            <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: appColors.dangerSurface }}>
              <Text style={{ color: appColors.dangerText, fontSize: 13, lineHeight: 20 }}>头像读取失败：{profileAvatarError}</Text>
              <Pressable accessibilityRole="button" onPress={() => setAvatarLoadAttempt(attempt => attempt + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: appColors.authPrimary }}>重新读取头像</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.screen, { backgroundColor: appColors.background }]}>{renderMainScreen()}</View>
          <BottomNav active={activeTab} onChange={setActiveTab} />
        </SafeAreaView>
          );
        })()
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
  );
}

function LoadingScreen({ label, onEnterGuest, onEnterDeviceTest }: { label: string; onEnterGuest?: () => void; onEnterDeviceTest?: () => void }) {
  const { colors: appColors } = useAppTheme();
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.loading, { backgroundColor: appColors.background }]}>
        <ActivityIndicator color={appColors.greenStrong} size="large" />
        <Text style={[styles.loadingText, { color: appColors.muted }]}>{label}</Text>
        {onEnterDeviceTest ? <Pressable accessibilityRole="button" onPress={onEnterDeviceTest} style={styles.errorLogout} testID="loading-device-test"><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>进入设备测试</Text></Pressable> : null}
        {onEnterGuest ? <Pressable accessibilityRole="button" onPress={onEnterGuest} style={styles.errorLogout} testID="loading-guest"><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>游客使用</Text></Pressable> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ServiceErrorScreen({
  actionLabel = '重新尝试',
  busy,
  logoutBusy = false,
  feedback,
  message,
  onLogout,
  onRetry,
  onDiagnostics,
  onOpenRobotConnection,
  onEnterGuest,
  onEnterDeviceTest,
  title,
}: {
  actionLabel?: string;
  busy: boolean;
  logoutBusy?: boolean;
  feedback?: string | null;
  message: string;
  onLogout?: () => void;
  onRetry: () => void;
  onDiagnostics?: () => void;
  onOpenRobotConnection?: () => void;
  onEnterGuest?: () => void;
  onEnterDeviceTest?: () => void;
  title: string;
}) {
  const { colors: appColors } = useAppTheme();
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.errorSafeArea, { backgroundColor: appColors.background }]}>
        <View style={styles.errorCard}>
          <Text style={[styles.errorEyebrow, { color: appColors.successText }]}>DOSO SERVICE</Text>
          <Text style={[styles.errorTitle, { color: appColors.ink }]}>{title}</Text>
          <Text style={[styles.errorMessage, { color: appColors.muted }]}>{message}</Text>
          {feedback ? <Text accessibilityLiveRegion="polite" style={[styles.errorMessage, { color: appColors.dangerText }]} testID="service-error-feedback">{feedback}</Text> : null}
          <GradientButton disabled={busy} label={busy && !logoutBusy ? '正在处理…' : actionLabel} onPress={onRetry} />
          {onEnterDeviceTest ? <Pressable accessibilityRole="button" disabled={busy} onPress={onEnterDeviceTest} style={styles.errorLogout} testID="service-error-device-test"><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>进入设备测试</Text></Pressable> : onOpenRobotConnection ? <Pressable accessibilityRole="button" accessibilityHint="仅进行局域网只读连接检查，不替代账号登录" disabled={busy} onPress={onOpenRobotConnection} style={styles.errorLogout} testID="service-error-robot-connection"><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>连接机器狗（只读检查）</Text></Pressable> : null}
          {onEnterGuest ? <Pressable accessibilityRole="button" onPress={onEnterGuest} style={styles.errorLogout} testID="service-error-guest"><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>游客使用</Text></Pressable> : null}
          {onDiagnostics ? <Pressable accessibilityRole="button" onPress={onDiagnostics} style={styles.errorLogout}><Text style={[styles.errorLogoutText, { color: appColors.authPrimary }]}>连接诊断</Text></Pressable> : null}
          {onLogout ? (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy: logoutBusy }} disabled={busy} onPress={onLogout} style={styles.errorLogout} testID="service-error-logout">
              <Text style={[styles.errorLogoutText, { color: appColors.inkSoft }]}>{logoutBusy ? '正在退出…' : '退出当前账户'}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  safeAreaLandscape: { paddingRight: 78 },
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, marginTop: 14 },
  errorSafeArea: { flex: 1 },
  errorCard: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  errorEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  errorTitle: { fontSize: 28, fontWeight: '900', marginTop: 10 },
  errorMessage: { fontSize: 14, lineHeight: 22, marginBottom: 28, marginTop: 12 },
  errorLogout: { alignItems: 'center', paddingVertical: 18 },
  errorLogoutText: { fontSize: 14, fontWeight: '700' },
});
