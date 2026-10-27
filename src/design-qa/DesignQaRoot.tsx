import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { images } from '../assets';
import { AppHeader } from '../components/AppHeader';
import { AppToast, type ToastNotice } from '../components/AppToast';
import { notificationUnavailableNotice } from '../components/notification-notice';
import { BottomNav } from '../components/BottomNav';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { BindDeviceScreen } from '../screens/BindDeviceScreen';
import { ControlScreen } from '../screens/ControlScreen';
import { DeviceUnavailableScreen } from '../screens/DeviceUnavailableScreen';
import { DisplayNameConfirmationScreen } from '../screens/DisplayNameConfirmationScreen';
import { EmailOtpScreen } from '../screens/EmailOtpScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { DataPrivacyScreen } from '../screens/DataPrivacyScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { JointStatusScreen } from '../screens/JointStatusScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MapScreen } from '../screens/MapScreen';
import { ModelSelectScreen } from '../screens/ModelSelectScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { UsernameOnboardingScreen } from '../screens/UsernameOnboardingScreen';
import { ThemePreferenceContext, useAppTheme } from '../theme';
import type { MainTab } from '../types';
import { DESIGN_QA_STAGES, parseDesignQaRequest, type DesignQaStage, type DesignQaState } from './request';

const noop = () => undefined;
const SAMPLE_ERROR = '设计验收示例错误：当前操作未连接真实服务。';
const DESIGN_QA_REFERENCE_DATE = new Date(2026, 7, 31, 12);
const physicalDiagnosticsGateway = createRobotDiagnosticsGateway({ nowMs: () => 0 });
const tabStages: Record<MainTab, DesignQaStage> = { home: 'main-home', map: 'main-routes', tasks: 'main-tasks', analysis: 'main-analysis', profile: 'main-profile' };
const stageLabels: Record<DesignQaStage, string> = {
  'main-home': '首页', 'main-routes': '地图', 'main-tasks': '任务', 'main-analysis': '分析', 'main-profile': '我的',
  'robot-control': '控制', 'model-select': '机型', 'device-bind': '绑定设备', 'device-ble-discovery': '蓝牙发现',
  'device-provisioning': '配网', 'device-firmware': '固件', 'account-security': '账户安全',
  'auth-login': '登录', 'auth-register': '注册', 'auth-email-otp': '验证码', 'auth-forgot-password': '找回密码',
  'auth-reset-password': '重设密码', 'auth-username': '用户名', 'auth-display-name': '昵称', 'auth-mfa': '双重验证',
};
type NavigatePreview = (stage: DesignQaStage) => void;

function AccountSecurityPreview({ state }: { state: DesignQaState }) {
  const { colors, isDark } = useAppTheme();
  const loading = state === 'loading';

  return (
    <SafeAreaView style={[styles.accountSecurityPage, { backgroundColor: colors.background }]}>
      <View style={[styles.accountSecurityCard, { backgroundColor: colors.surface }]}>
        <Ionicons color={colors.successText} name={loading ? 'hourglass-outline' : 'shield-checkmark-outline'} size={34} />
        <Text style={[styles.accountSecurityTitle, { color: colors.ink }]}>账号与安全</Text>
        <Text style={[styles.accountSecurityBody, { color: colors.muted }]}>
          {loading
            ? '设计验收加载壳：不会注册终端、发送心跳或读取真实登录方式。'
            : '此页面挂载后会读取真实终端、登录方式与 MFA 状态。开发期预览保持数据访问关闭；最终交互验收必须使用隔离测试账户。'}
        </Text>
        <View style={styles.accountSecurityStatus}>
          <Text style={[styles.accountSecurityStatusText, { color: colors.successText }]}>真实账户操作已禁用</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function BleDiscoveryPreview({ state }: { state: DesignQaState }) {
  const { colors, isDark } = useAppTheme();
  const copy = {
    default: ['BLE 扫描已禁用', '设计验收只读壳不会请求附近设备权限或启动扫描。'],
    'permission-denied': ['未获得附近设备权限', '允许蓝牙/附近设备权限后即可重新查找。'],
    'bluetooth-off': ['蓝牙未开启', '请开启手机蓝牙后重新查找。'],
    scanning: ['正在查找附近设备', '扫描状态仅用于界面验收，不会启动真实 BLE 扫描。'],
    empty: ['本次没有发现候选设备', '请让机器人进入配网广播模式、靠近手机后重新查找。'],
  } as const;
  const [status, detail] = copy[state as keyof typeof copy] ?? copy.default;

  return (
    <SafeAreaView style={[styles.devicePreviewPage, { backgroundColor: colors.background }]}>
      <View style={[styles.devicePreviewCard, { backgroundColor: colors.surface }]}>
        <Ionicons color={colors.successText} name="bluetooth-outline" size={34} />
        <Text style={[styles.devicePreviewEyebrow, { color: colors.successText }]}>DOSO BLE DISCOVERY</Text>
        <Text style={[styles.devicePreviewTitle, { color: colors.ink }]}>查找附近机器人</Text>
        <Text style={[styles.devicePreviewBody, { color: colors.muted }]}>
          {detail} 最终真机验收仍须覆盖真实权限、扫描、停止和后台中断。
        </Text>
        <View style={styles.devicePreviewStatus}>
          <Text style={[styles.devicePreviewStatusText, { color: colors.successText }]}>{status}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MfaPreview({ state }: { state: DesignQaState }) {
  const { colors } = useAppTheme();
  const loading = state === 'loading';

  return (
    <SafeAreaView style={[styles.mfaPage, { backgroundColor: colors.background }]}>
      <View style={[styles.mfaCard, { backgroundColor: colors.surface }]}>
        <Ionicons color={colors.successText} name={loading ? 'hourglass-outline' : 'shield-outline'} size={34} />
        <Text style={[styles.mfaTitle, { color: colors.ink }]}>管理员双重验证</Text>
        <Text style={[styles.mfaBody, { color: colors.muted }]}>
          {loading
            ? '设计验收加载壳：不会读取账户安全状态。'
            : '此组件挂载后会读取并维护真实 TOTP enrollment，因此开发期预览只提供不可用壳。请使用隔离测试账户完成真实流程验收。'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function MainPreviewShell({ active, children, onNavigate = noop, onEditProfile }: { active: MainTab; children: ReactNode; onNavigate?: NavigatePreview; onEditProfile?: () => void }) {
  const { colors } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const [notice, setNotice] = useState<ToastNotice | null>(null);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[
        styles.mainSafeArea,
        { backgroundColor: colors.background },
        isLandscape && styles.mainSafeAreaLandscape,
      ]}
    >
      <AppHeader flow title={active === 'tasks' ? '任务' : undefined} subtitle={active === 'tasks' ? 'THUNDER 01（离线）' : undefined} displayName="DOSO Demo" onProfile={onEditProfile} onNotifications={() => setNotice(notificationUnavailableNotice)} referenceDate={DESIGN_QA_REFERENCE_DATE} />
      <AppToast notice={notice} onDismiss={() => setNotice(null)} withinSafeArea />
      <View style={[styles.mainScreen, { backgroundColor: colors.background }]}>{children}</View>
      <BottomNav active={active} onChange={tab => onNavigate(tabStages[tab])} />
    </SafeAreaView>
  );
}

function PreviewScreen({ stage, state, onNavigate = noop, browsing = false, onEditProfile, onControlBack }: { stage: DesignQaStage; state: DesignQaState; onNavigate?: NavigatePreview; browsing?: boolean; onEditProfile?: () => void; onControlBack?: () => void }) {
  const loading = state === 'loading';
  const error = state === 'error' ? SAMPLE_ERROR : null;

  switch (stage) {
    case 'auth-login':
      return <LoginScreen error={error} loading={loading} onCreateAccount={() => onNavigate('auth-register')} onForgotPassword={() => onNavigate('auth-forgot-password')} onLogin={noop} />;
    case 'auth-register':
      return <RegisterScreen error={error} loading={loading} onBackToLogin={() => onNavigate('auth-login')} onForgotPassword={() => onNavigate('auth-forgot-password')} onRegister={noop} />;
    case 'auth-email-otp':
      return <EmailOtpScreen email="design.qa@example.invalid" error={state === 'expired' ? '验证码已过期，请重新发送后再试。' : error} loading={loading} onBackToLogin={() => onNavigate('auth-login')} onResend={noop} onVerify={noop} />;
    case 'auth-forgot-password':
      return <ForgotPasswordScreen error={error} loading={loading} onBackToLogin={() => onNavigate('auth-login')} onRequestReset={noop} />;
    case 'auth-reset-password':
      return <ResetPasswordScreen error={error} loading={loading} nonceRequired={state === 'nonce'} onBackToLogin={() => onNavigate('auth-login')} onResetPassword={noop} />;
    case 'auth-username':
      return <UsernameOnboardingScreen error={error} loading={loading} onClaim={noop} onLogout={noop} />;
    case 'auth-display-name':
      return <DisplayNameConfirmationScreen error={error} initialDisplayName="" loading={loading} onCancel={noop} onSave={noop} />;
    case 'auth-mfa':
      return <MfaPreview state={state} />;
    case 'model-select':
      return <ModelSelectScreen busy={loading} onBack={() => onNavigate('main-profile')} onContinue={() => onNavigate('device-bind')} onSkip={() => onNavigate('main-home')} />;
    case 'main-home':
      return (
        <MainPreviewShell active="home" onNavigate={onNavigate} onEditProfile={onEditProfile}>
          <HomeScreen
            batteryPercent={null}
            canRecall={false}
            connected={false}
            taskControlAvailable={false}
            taskExecutorAvailable={false}
            onOpenControl={() => onNavigate('robot-control')}
            onOpenRoutes={() => onNavigate('main-routes')}
            onOpenSafety={() => onNavigate('main-profile')}
            onOpenTasks={() => onNavigate('main-tasks')}
            onRecall={noop}
            recallBlockedReason="生产执行器未接入，召回保持禁用"
            robotCompactImage={images.thunderCompact}
            robotImage={images.thunderHero}
            robotName="THUNDER 01"
            safetyLock
          />
        </MainPreviewShell>
      );
    case 'main-routes':
      return (
        <MainPreviewShell active="map" onNavigate={onNavigate} onEditProfile={onEditProfile}>
          <MapScreen
            blockedReason="生产控制与路线执行器未接入"
            showExamples
            controlAvailable={false}
            executorAvailable={false}
            onStartRoute={noop}
            robotName="THUNDER 01"
          />
        </MainPreviewShell>
      );
    case 'main-tasks':
      return (
        <MainPreviewShell active="tasks" onNavigate={onNavigate} onEditProfile={onEditProfile}>
          <TasksScreen
            blockedReason="生产控制与任务执行器未接入"
            controlAvailable={false}
            executorAvailable={false}
            onStartTask={noop}
            referenceDate={DESIGN_QA_REFERENCE_DATE}
            robotName="THUNDER 01"
          />
        </MainPreviewShell>
      );
    case 'main-analysis':
      return (
        <MainPreviewShell active="analysis" onNavigate={onNavigate} onEditProfile={onEditProfile}>
          <AnalysisScreen previewMode={!browsing && state !== 'trusted-empty'} />
        </MainPreviewShell>
      );
    case 'main-profile':
      return (
        <MainPreviewShell active="profile" onNavigate={onNavigate} onEditProfile={onEditProfile}>
          <ProfileScreen
            accountEmail="design.qa@example.invalid"
            displayName="DOSO Demo"
            username="doso_demo"
            avatarUrl={null}
            onEditProfile={onEditProfile}
            onOpenControl={() => onNavigate('robot-control')}
            alertsEnabled
            batteryPercent={null}
            canOpenFirmwareUpdate={false}
            canOpenProvisioning={false}
            connected={false}
            deviceName="THUNDER 01"
            deviceType="室外四足机器人"
            firmwareUpdateBlockedReason="真实固件更新能力未接入"
            firmwareVersion="待同步"
            lastSyncLabel="尚未同步"
            onBindDevice={() => onNavigate('device-bind')}
            onConnect={noop}
            onDisconnect={noop}
            onLogout={() => onNavigate('auth-login')}
            onOpenAccountSecurity={() => onNavigate('account-security')}
            onOpenBleDiscovery={() => onNavigate('device-ble-discovery')}
            onOpenFirmwareUpdate={noop}
            onOpenProvisioning={noop}
            onRetry={noop}
            onToggleAlerts={noop}
            onUnbindDevice={noop}
            provisioningBlockedReason="真实安全配网能力未接入"
            runtimeHours={null}
            safetyLock={null}
            serialNumber="待绑定"
          />
        </MainPreviewShell>
      );
    case 'robot-control':
      return (
        <ControlScreen
          allowInteractionPreview
          batteryPercent={null}
          canUseManualControl={false}
          canUseRouteMode={false}
          canUseTaskMode={false}
          connected={false}
          diagnosticsDeviceClass="physical"
          diagnosticsGateway={physicalDiagnosticsGateway}
          manualControlBlockedReason="生产手动控制执行器未接入"
          onBack={onControlBack ?? (() => onNavigate('main-home'))}
          onOpenJointStatus={noop}
          onNotifications={noop}
          robotImage={images.thunderHero}
          robotName="THUNDER 01"
          robotType="室外四足机器人"
          routeModeBlockedReason="生产路线执行器未接入"
          taskModeBlockedReason="生产任务执行器未接入"
        />
      );
    case 'device-bind':
      return <BindDeviceScreen busy={loading} error={error} onBack={() => onNavigate('main-profile')} onBind={noop} />;
    case 'device-ble-discovery':
      return <BleDiscoveryPreview state={state} />;
    case 'device-provisioning':
      return <DeviceUnavailableScreen capability="provisioning" deviceName="THUNDER 01" onBack={() => onNavigate('main-profile')} />;
    case 'device-firmware':
      return <DeviceUnavailableScreen capability="firmware" deviceName="THUNDER 01" onBack={() => onNavigate('main-profile')} />;
    case 'account-security':
      return <AccountSecurityPreview state={state} />;
  }
}

function InvalidRequest({ issue }: { issue: string }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={[styles.invalidPage, { backgroundColor: colors.background }]}>
      <Text style={[styles.invalidTitle, { color: colors.ink }]}>设计验收参数无效</Text>
      <Text style={[styles.invalidIssue, { color: colors.dangerText }]}>{issue}</Text>
      <Text selectable style={[styles.invalidHelp, { color: colors.muted }]}>支持页面：{DESIGN_QA_STAGES.join('、')}</Text>
    </SafeAreaView>
  );
}

function DesignQaContent({ hideDisclosure, search, browsing, onToggleTheme }: { hideDisclosure: boolean; search: string; browsing: boolean; onToggleTheme: () => void }) {
  const [selectedStage, setSelectedStage] = useState<DesignQaStage | null>(null);
  const [showPages, setShowPages] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [controlOrigin, setControlOrigin] = useState<DesignQaStage>('main-home');
  const profileBackRef = useRef<() => void>(noop);
  const registerProfileBack = useCallback((handler: (() => void) | null) => { profileBackRef.current = handler ?? noop; }, []);
  const initialSearch = browsing && !new URLSearchParams(search).has('qa-stage') ? '?qa-stage=main-home' : search;
  // Static, local-only extras do not expand the formal 20-stage acceptance list.
  // Neither page mounts an account provider or calls a service automatically.
  const extra = new URLSearchParams(search).get('design-qa') === '1' ? new URLSearchParams(search).get('qa-extra') : null;
  const request = parseDesignQaRequest(selectedStage ? `?qa-stage=${selectedStage}` : initialSearch);
  const navigate: NavigatePreview = stage => {
    if (!browsing) return;
    if (editingProfile) { profileBackRef.current(); return; }
    if (stage === 'robot-control') setControlOrigin(request.stage === 'main-profile' ? 'main-profile' : 'main-home');
    setSelectedStage(stage);
    setShowPages(false);
  };
  const closeProfileEditor = () => { setEditingProfile(false); setSelectedStage('main-profile'); };
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    if (!browsing) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editingProfile) { profileBackRef.current(); return true; }
      if (showPages) { setShowPages(false); return true; }
      if (request.stage === 'robot-control') { setSelectedStage(controlOrigin); return true; }
      if (request.stage !== 'main-home') { setSelectedStage('main-home'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [browsing, controlOrigin, editingProfile, request.stage, showPages]);

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {browsing && !hideDisclosure ? <>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
          <View style={styles.browseBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="测试首页" onPress={() => navigate('main-home')} style={styles.browseButton}><Text style={{ color: colors.ink }}>首页</Text></Pressable>
            <Text style={[styles.browseTitle, { color: colors.muted }]}>{request.stage ? stageLabels[request.stage] : '界面测试'}（只读预览）</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="切换测试页面" accessibilityState={{ expanded: showPages }} onPress={() => setShowPages(value => !value)} style={styles.browseButton}><Text style={{ color: colors.authFocus }}>页面</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={isDark ? '切换浅色' : '切换深色'} onPress={onToggleTheme} style={styles.browseButton}><Text style={{ color: colors.ink }}>{isDark ? '浅色' : '深色'}</Text></Pressable>
          </View>
          <Text style={[styles.browseNotice, { color: colors.muted }]} testID="design-qa-browse-disclosure">不连接账号或设备，不发送邮件和控制指令</Text>
          {showPages ? <ScrollView style={styles.browsePages} contentContainerStyle={styles.browsePageList}>
            {DESIGN_QA_STAGES.map(stage => <Pressable key={stage} accessibilityRole="button" accessibilityLabel={`查看${stageLabels[stage]}`} accessibilityState={{ selected: request.stage === stage }} onPress={() => navigate(stage)} style={[styles.pageChip, { backgroundColor: request.stage === stage ? colors.authFocus : colors.surface }]}><Text style={{ color: request.stage === stage ? colors.authPrimaryInk : colors.ink }}>{stageLabels[stage]}</Text></Pressable>)}
          </ScrollView> : null}
        </SafeAreaView>
      </> : !hideDisclosure ? (
        <View accessibilityRole="alert" style={[styles.disclosure, { backgroundColor: isDark ? '#4A3516' : '#FFF3CD' }]} testID="design-qa-disclosure">
          <Text style={[styles.disclosureTitle, { color: isDark ? '#FFE3A3' : '#6F4B00' }]}>设计验收预览</Text>
          <Text style={[styles.disclosureBody, { color: isDark ? '#F4D48D' : '#765B1B' }]}>不连接真实后端，不发送邮件，不修改账号，不发送机器人命令</Text>
        </View>
      ) : null}
      <View
        accessible
        accessibilityLabel={`design-qa-preview:${request.stage ?? 'invalid'}:${request.state ?? 'invalid'}`}
        importantForAccessibility="yes"
        style={[styles.preview, { backgroundColor: colors.background }]}
        testID="design-qa-preview"
      >
        {extra === 'joint-status' ? <JointStatusScreen deviceName="THUNDER 01" onBack={noop} /> : extra === 'data-privacy' ? <DataPrivacyScreen onBack={noop} /> : (editingProfile && browsing) || extra === 'edit-profile' ? <EditProfileScreen
          avatarUrl={null}
          profile={{ id: 'design-preview', username: 'doso_demo', display_name: 'DOSO Demo', avatar_url: null }}
          onBack={closeProfileEditor}
          onBackRequestChange={registerProfileBack}
          onSave={async () => { throw new Error('这是界面预览，不会写入账户资料。请在正式登录后保存。'); }}
        /> : extra ? <InvalidRequest issue="qa-extra 不受支持" /> : request.stage && request.state
          ? <PreviewScreen key={request.stage} stage={request.stage} state={request.state} onNavigate={navigate} browsing={browsing} onEditProfile={browsing ? () => setEditingProfile(true) : undefined} onControlBack={() => navigate(controlOrigin)} />
          : <InvalidRequest issue={request.issue ?? '未知参数错误'} />}
      </View>
    </View>
  );
}

type DesignQaRootProps = {
  hideDisclosure?: boolean;
  search?: string;
};

export function DesignQaRoot({ hideDisclosure = false, search }: DesignQaRootProps) {
  const resolvedSearch = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const params = new URLSearchParams(resolvedSearch);
  const browsing = params.get('qa-browse') === '1';
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('qa-theme') === 'dark' ? 'dark' : 'light');
  return (
    <ThemePreferenceContext.Provider value={browsing && !hideDisclosure ? theme : null}>
      <SafeAreaProvider>
        <DesignQaContent hideDisclosure={hideDisclosure} search={resolvedSearch} browsing={browsing} onToggleTheme={() => setTheme(value => value === 'light' ? 'dark' : 'light')} />
      </SafeAreaProvider>
    </ThemePreferenceContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  browseBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  browseButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  browseTitle: { flex: 1, fontSize: 12 },
  browseNotice: { fontSize: 11, textAlign: 'center', paddingBottom: 6 },
  browsePages: { maxHeight: 200 },
  browsePageList: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  pageChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12 },
  disclosure: { alignItems: 'center', minHeight: 54, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, zIndex: 20 },
  disclosureTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  disclosureBody: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  preview: { flex: 1, minHeight: 0 },
  invalidPage: { flex: 1, justifyContent: 'center', padding: 28 },
  invalidTitle: { fontSize: 25, fontWeight: '900' },
  invalidIssue: { fontSize: 14, fontWeight: '700', marginTop: 12 },
  invalidHelp: { fontSize: 13, lineHeight: 20, marginTop: 18 },
  mfaPage: { flex: 1, justifyContent: 'center', padding: 24 },
  mfaCard: { alignItems: 'center', borderRadius: 24, padding: 16 },
  mfaTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: 12 },
  mfaBody: { fontSize: 13, lineHeight: 21, marginTop: 10, maxWidth: 520, textAlign: 'center' },
  accountSecurityPage: { flex: 1, justifyContent: 'center', padding: 24 },
  accountSecurityCard: { alignItems: 'center', borderRadius: 24, padding: 16 },
  accountSecurityTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: 12 },
  accountSecurityBody: { fontSize: 13, lineHeight: 21, marginTop: 10, maxWidth: 520, textAlign: 'center' },
  accountSecurityStatus: { borderRadius: 999, marginTop: 18, paddingHorizontal: 14, paddingVertical: 8 },
  accountSecurityStatusText: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
  devicePreviewPage: { flex: 1, justifyContent: 'center', padding: 24 },
  devicePreviewCard: { alignItems: 'center', borderRadius: 24, padding: 16 },
  devicePreviewEyebrow: { fontSize: 13, lineHeight: 20, fontWeight: '500', marginTop: 12 },
  devicePreviewTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: 8 },
  devicePreviewBody: { fontSize: 13, lineHeight: 21, marginTop: 10, maxWidth: 520, textAlign: 'center' },
  devicePreviewStatus: { borderRadius: 999, marginTop: 18, paddingHorizontal: 14, paddingVertical: 8 },
  devicePreviewStatusText: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
  mainSafeArea: { flex: 1 },
  mainSafeAreaLandscape: { paddingRight: 78 },
  mainScreen: { flex: 1 },
});
