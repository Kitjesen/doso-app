import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/AppText';
import { type ControlSetupMedia } from '../components/ControlSetupSurface';
import { OfficialSheet } from '../components/OfficialSheet';
import { officialLabHost } from '../officialPalette';
import { getProductAppearance } from '../appearance';
import { controlTypography as typography } from '../typography';
import { useAppTheme } from '../theme';
import { directVideoOrigin } from '../features/video/videoBinding';
import { createDirectRobotConnectionSnapshot, type DirectRobotConnectionSnapshot } from '../services/directRobotConnection';
import {
  BrainstemGrpcError, chooseBrainstemClientIdentity, isBrainstemGrpcAvailable,
  cancelBrainstemLocalClientIdentity, completeBrainstemLocalClientIdentity, getBrainstemLocalClientIdentity, isBrainstemLocalIdentityAvailable, prepareBrainstemLocalClientIdentity,
  readBrainstemGrpcMotorStatus, readBrainstemGrpcProfile, readBrainstemGrpcStatus, readBrainstemGrpcVoltage,
  validateBrainstemEndpoint, isBrainstemLanAvailable, type BrainstemGrpcObservation, type BrainstemLocalClientIdentity, type BrainstemGrpcTlsEvidence,
  type BrainstemGrpcEndpoint,
} from '../services/brainstemGrpc';
import { isBrainstemControlAvailable } from '../services/brainstemControl';
import { getBrainstemIntegrationReadiness } from '../services/brainstemIntegrationReadiness';
import { WifiDiscoveryPanel } from './WifiDiscoveryPanel';
import { LingtuStatusScreen } from './LingtuStatusScreen';

const FSD_MATTE = {
  canvas: '#141414',
  sheet: '#1C1C1C',
  card: '#222222',
  input: '#161616',
  activePill: '#303030',
  divider: 'rgba(255, 255, 255, 0.08)',
  ink: '#F2F2F2',
  muted: '#9A9A9A',
  emerald: '#34D399',
  emeraldInk: '#34D399',
  amber: '#F59E0B',
  danger: '#EF4444',
  ctaBg: '#F2F2F2',
  ctaInk: '#141414',
  ctaDisabledBg: '#222222',
  ctaDisabledInk: '#6B6B6B',
} as const;

const QUICK_HOST_PRESETS = [
  { id: 'hotspot', label: '机器狗热点', host: '192.168.50.1' },
  { id: 'lan', label: '局域网', host: officialLabHost },
] as const;

type Props = {
  readOnlyPreview?: boolean;
  media?: ControlSetupMedia;
  onBack: () => void;
  onOpenBleDiscovery?: () => void;
  initialEndpoint?: Readonly<BrainstemGrpcEndpoint>;
  onUseConnection?: (snapshot: DirectRobotConnectionSnapshot) => boolean;
  onUseNavigation?: (endpoint: string, viewerToken?: string) => boolean;
  onViewVideo?: (endpoint: string, viewerToken?: string, directEndpoint?: BrainstemGrpcEndpoint) => boolean;
  navigationUseLabel?: string;
  allowViewerToken?: boolean;
  onOpenControl?: (endpoint: BrainstemGrpcEndpoint, principal: string, signal: AbortSignal) => Promise<boolean>;
};

type Transport = 'ip' | 'ble' | 'navigation';

// A local observation does not grant cloud ownership or a control lease.
export function RobotConnectionScreen({ readOnlyPreview = false, media: _media, onBack, onOpenBleDiscovery, initialEndpoint, onUseConnection, onUseNavigation, onViewVideo, navigationUseLabel, allowViewerToken, onOpenControl }: Props) {
  void _media;
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const theme = useAppTheme();
  const colors = { ...theme.colors, background: FSD_MATTE.canvas, surface: FSD_MATTE.sheet, ink: FSD_MATTE.ink, muted: FSD_MATTE.muted, line: FSD_MATTE.divider, authPrimary: FSD_MATTE.ctaBg, authPrimaryInk: FSD_MATTE.ctaInk, dangerText: FSD_MATTE.danger };
  const p = { ...getProductAppearance(true), canvas: FSD_MATTE.canvas, surface: FSD_MATTE.sheet, ink: FSD_MATTE.ink, secondary: FSD_MATTE.muted, border: FSD_MATTE.divider, action: FSD_MATTE.ctaBg, actionInk: FSD_MATTE.ctaInk, blue: FSD_MATTE.ink };
  const defaultHost = initialEndpoint?.host
    ?? (typeof __DEV__ !== 'undefined' && __DEV__ && isBrainstemLanAvailable()
      && typeof globalThis !== 'undefined'
      && ['localhost', '127.0.0.1'].includes((globalThis as { location?: { hostname?: string } }).location?.hostname ?? '')
      ? '127.0.0.1'
      : officialLabHost);
  const [host, setHost] = useState(defaultHost);
  const [port, setPort] = useState(String(initialEndpoint?.port ?? 13145));
  const [wireTransport, setWireTransport] = useState<'tls' | 'lan-dev'>(initialEndpoint ? initialEndpoint.transport ?? 'tls' : isBrainstemLanAvailable() ? 'lan-dev' : 'tls');
  const [identityAlias, setIdentityAlias] = useState<string | null>(null);
  const [robotId, setRobotId] = useState('');
  const [localIdentity, setLocalIdentity] = useState<BrainstemLocalClientIdentity | null>(null);
  const [identityReadsVerified, setIdentityReadsVerified] = useState(false);
  const [principal, setPrincipal] = useState('doso-g20@robot');
  const [transport, setTransport] = useState<Transport>('ip');
  const [busy, setBusy] = useState<'read' | 'identity' | 'local-identity' | 'control' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [observation, setObservation] = useState<BrainstemGrpcObservation | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [diagnosticIssues, setDiagnosticIssues] = useState<Partial<Record<'profile' | 'voltage' | 'motors', string>>>({});
  const releaseWifi = useRef<() => void>(() => { });
  const request = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const busyRef = useRef(false);
  const identityPending = useRef(false);
  const mounted = useRef(true);
  const active = useRef(AppState.currentState === 'active');
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const available = !readOnlyPreview && isBrainstemGrpcAvailable();
  const localIdentityAvailable = !readOnlyPreview && isBrainstemLocalIdentityAvailable();
  const controlAvailable = !readOnlyPreview && isBrainstemControlAvailable();
  const integration = getBrainstemIntegrationReadiness({
    transport: wireTransport,
    nativeModuleAvailable: available,
    endpointConfigured: host.trim().length > 0 && port.trim().length > 0,
    readOnlyObservationFresh: Boolean(observation),
    deviceIdentity: 'unbound',
    clientIdentitySelected: Boolean(identityAlias),
    // A successful status read does not prove remote listener policy, mTLS
    // principal mapping, a control lease or a production executor.
    remoteListenerConfirmed: false,
    remoteMtlsVerified: false,
    controlLeaseActive: false,
    productionExecutorConnected: false,
    ackContractReady: false,
    deadmanStopReady: false,
  });
  const clearExpiry = () => { if (expiry.current) clearTimeout(expiry.current); expiry.current = null; };
  const cancelLocalIdentity = () => { if (readOnlyPreview) return; void cancelBrainstemLocalClientIdentity().catch(() => { }); };
  const interrupt = () => {
    operation.current++; request.current?.abort(); request.current = null;
    busyRef.current = false; identityPending.current = false; clearExpiry(); cancelLocalIdentity();
  };
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => {
      // inactive is used for rotation, the KeyChain picker, and brief pauses.
      // Do not treat it as a lost connection or abort an in-flight handoff.
      active.current = state !== 'background';
      if (state !== 'background') return;
      // Reads, observations and previously chosen aliases still do not survive
      // true backgrounding. Back/cancel/unmount invalidate them as well.
      if (identityPending.current) {
        clearExpiry(); setIdentityAlias(null); setObservation(null); setIdentityReadsVerified(false); return;
      }
      interrupt(); setIdentityAlias(null); setLocalIdentity(null); setObservation(null); setIdentityReadsVerified(false); setBusy(null);
      setMessage('连接检查已暂停');
    });
    return () => { mounted.current = false; interrupt(); sub.remove(); };
  }, []);
  const current = (id: number) => mounted.current && active.current && operation.current === id;
  const report = (error: unknown) => error instanceof BrainstemGrpcError && error.code !== 'unavailable'
    ? error.message
    : wireTransport === 'lan-dev'
      ? '局域网连接检查失败，请核对地址与端口'
      : error instanceof BrainstemGrpcError ? error.message : '连接检查失败，请核对地址与证书';
  const endpointForConnection = (): BrainstemGrpcEndpoint => ({
    ...validateBrainstemEndpoint(host, port, wireTransport, wireTransport === 'tls' ? identityAlias ?? undefined : undefined),
    ...(wireTransport === 'lan-dev' ? { transport: 'lan-dev' as const } : identityAlias ? { clientIdentityAlias: identityAlias } : {}),
  });
  const lanVideoAvailable = Boolean(onViewVideo && !readOnlyPreview && wireTransport === 'lan-dev' && isBrainstemLanAvailable());
  const renderedOperation = operation.current;
  const openLanVideo = () => {
    if (!onViewVideo || !lanVideoAvailable || !isBrainstemLanAvailable() || busyRef.current
      || AppState.currentState !== 'active' || !current(renderedOperation)) return;
    let endpoint: BrainstemGrpcEndpoint;
    try { endpoint = endpointForConnection(); }
    catch (error) { setMessage(report(error)); return; }
    const origin = directVideoOrigin(endpoint);
    if (!origin || !onViewVideo(origin, undefined, endpoint)) setMessage('暂时无法打开画面，请核对地址与连接');
  };
  const changeEndpoint = (kind: 'host' | 'port', value: string) => {
    if (busyRef.current) return;
    releaseWifi.current();
    operation.current++; clearExpiry(); cancelLocalIdentity(); setObservation(null); setMessage(null); setIdentityAlias(null); setLocalIdentity(null); setIdentityReadsVerified(false);
    if (kind === 'host') setHost(value); else setPort(value);
  };
  const changeRobotId = (value: string) => {
    if (busyRef.current) return;
    operation.current++; clearExpiry(); cancelLocalIdentity(); setRobotId(value); setLocalIdentity(null); setIdentityAlias(null); setObservation(null); setIdentityReadsVerified(false); setMessage(null);
  };
  const useLocalIdentity = async (complete: boolean) => {
    if (busyRef.current || !active.current || !mounted.current || !localIdentityAvailable) return;
    const canonicalRobotId = robotId.trim().normalize('NFKC');
    let endpoint;
    try {
      endpoint = validateBrainstemEndpoint(host, port);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(canonicalRobotId)) { setMessage('请输入有效的机器人编号'); return; }
      if (complete && localIdentity?.status !== 'pending') return;
    } catch (error) { setMessage(report(error)); return; }
    const id = ++operation.current, controller = new AbortController(); request.current = controller;
    busyRef.current = true; setBusy('local-identity'); setMessage(null); setObservation(null); setIdentityReadsVerified(false); clearExpiry();
    try {
      const target = { ...endpoint, robotId: canonicalRobotId, signal: controller.signal };
      let identity = complete
        ? await completeBrainstemLocalClientIdentity({ ...target, requestId: localIdentity!.requestId })
        : await getBrainstemLocalClientIdentity(target);
      if (!current(id)) return;
      if (!complete && (!identity || identity.status === 'pending')) identity = await prepareBrainstemLocalClientIdentity({ ...target, requestId: randomUUID() });
      if (!current(id)) return;
      if (!identity) return;
      setRobotId(identity.robotId);
      setLocalIdentity(identity);
      if (identity.status === 'ready') { setIdentityAlias(identity.identityAlias); setPrincipal(identity.principal); }
      else setIdentityAlias(null);
      setMessage(identity.status === 'ready' ? '本机身份已就绪' : '申请已生成，等待授权');
    } catch (error) { if (current(id)) setMessage(report(error)); }
    finally {
      if (current(id)) { request.current = null; busyRef.current = false; setBusy(null); }
    }
  };
  const selectIdentity = async () => {
    if (busyRef.current || !active.current) return;
    let endpoint;
    try { endpoint = endpointForConnection(); }
    catch (error) { setMessage(report(error)); return; }
    const id = ++operation.current;
    busyRef.current = true; identityPending.current = true; setBusy('identity'); setMessage(null); setObservation(null); setIdentityReadsVerified(false); clearExpiry();
    try {
      const alias = await chooseBrainstemClientIdentity(endpoint.host, endpoint.port);
      if (current(id)) { setIdentityAlias(alias); setMessage(alias ? '已选择配对证书' : '未选择配对证书'); }
    } catch (error) { if (current(id)) setMessage(report(error)); }
    finally {
      // A rejected native chooser may settle while paused. Releasing our own
      // operation is safe off-foreground; accepting an identity above is not.
      if (mounted.current && operation.current === id) {
        busyRef.current = false; identityPending.current = false; setBusy(null);
      }
    }
  };
  const readStatus = async () => {
    if (busyRef.current || !active.current) return;
    let endpoint;
    try { endpoint = endpointForConnection(); }
    catch (error) { setMessage(report(error)); return; }
    const id = ++operation.current;
    const controller = new AbortController(); request.current = controller;
    busyRef.current = true; setBusy('read'); setObservation(null); setIdentityReadsVerified(false); setMessage(null); clearExpiry();
    setDiagnosticIssues({});
    try {
      const requestId = randomUUID();
      const result = await readBrainstemGrpcStatus({ endpoint, requestId, signal: controller.signal });
      if (!current(id)) return;
      let enriched: BrainstemGrpcObservation = result;
      const certificateSha256 = localIdentity?.status === 'ready' && identityAlias === localIdentity.identityAlias
        ? localIdentity.clientCertificateSha256 : result.clientCertificateSha256;
      const identityVerified = (value: BrainstemGrpcTlsEvidence) => value.mutualTlsVerified === true && typeof certificateSha256 === 'string' && value.clientCertificateSha256 === certificateSha256;
      let verifiedReads = identityVerified(result) ? 1 : 0;
      const issues: Partial<Record<'profile' | 'voltage' | 'motors', string>> = {};
      if (typeof readBrainstemGrpcProfile === 'function') {
        try {
          const profile = await readBrainstemGrpcProfile({ endpoint: { ...endpoint, ...(identityAlias ? { clientIdentityAlias: identityAlias } : {}) }, requestId: randomUUID(), signal: controller.signal });
          enriched = { ...result, profile: profile.profile };
          if (identityVerified(profile)) verifiedReads++;
        } catch (profileError) {
          if (profileError instanceof BrainstemGrpcError && (profileError.code === 'cancelled' || profileError.code === 'background')) throw profileError;
          issues.profile = report(profileError);
        }
      }
      for (const [kind, readDiagnostic] of [
        ['voltage', async () => readBrainstemGrpcVoltage({ endpoint: { ...endpoint, ...(identityAlias ? { clientIdentityAlias: identityAlias } : {}) }, requestId: randomUUID(), signal: controller.signal })],
        ['motors', async () => readBrainstemGrpcMotorStatus({ endpoint: { ...endpoint, ...(identityAlias ? { clientIdentityAlias: identityAlias } : {}) }, requestId: randomUUID(), signal: controller.signal })],
      ] as const) {
        try {
          const diagnostic = await readDiagnostic();
          if (identityVerified(diagnostic)) verifiedReads++;
          if ('voltage' in diagnostic) enriched = { ...enriched, voltage: diagnostic.voltage };
          if ('motors' in diagnostic) enriched = { ...enriched, motors: diagnostic.motors };
        } catch (diagnosticError) {
          if (diagnosticError instanceof BrainstemGrpcError && (diagnosticError.code === 'cancelled' || diagnosticError.code === 'background')) throw diagnosticError;
          issues[kind] = report(diagnosticError);
        }
      }
      if (!current(id)) return;
      const checked = createDirectRobotConnectionSnapshot(endpoint, enriched);
      const remaining = Date.parse(checked.observation.observedAt) + 15_000 - Date.now();
      setDiagnosticIssues(issues);
      setIdentityReadsVerified(verifiedReads === 4);
      setObservation(checked.observation); setMessage('状态已读取，未获取控制权');
      expiry.current = setTimeout(() => {
        if (!current(id)) return;
        setObservation(null); setIdentityReadsVerified(false); setMessage('状态已过期，请重新检查'); expiry.current = null;
      }, remaining);
    } catch (error) { if (current(id)) setMessage(report(error)); }
    finally { if (current(id)) { request.current = null; busyRef.current = false; setBusy(null); } }
  };
  const useConnection = () => {
    if (!onUseConnection || !observation || busyRef.current || !active.current || !mounted.current) return;
    try {
      const checked = createDirectRobotConnectionSnapshot(endpointForConnection(), observation);
      if (onUseConnection(checked)) return;
    } catch { /* Display only a fixed reason; never expose native or account details. */ }
    clearExpiry(); setObservation(null);
    setMessage('状态或会话上下文已变化，请重新检查');
  };
  const openControl = async () => {
    if (!onOpenControl || wireTransport === 'tls' && !identityAlias || busyRef.current || !active.current) return;
    const id = ++operation.current;
    const controller = new AbortController(); request.current = controller;
    busyRef.current = true; setBusy('control'); setMessage(null);
    try {
      const endpoint = endpointForConnection();
      if (wireTransport === 'tls' && !/^[a-z][a-z0-9-]*@[a-z][a-z0-9-]*$/.test(principal.trim())) throw new Error('principal');
      const opened = await onOpenControl(endpoint, wireTransport === 'lan-dev' ? '' : principal.trim(), controller.signal);
      // The session now lives in App; do not abort it when this screen unmounts.
      if (opened) request.current = null;
      if (current(id)) setMessage(opened ? '连接已建立' : wireTransport === 'lan-dev' ? '局域网连接未建立，请核对地址与网络' : '控制连接未建立，请核对证书与配置');
    } catch { if (current(id)) setMessage(wireTransport === 'lan-dev' ? '局域网连接未建立，请核对地址与网络' : '控制连接未建立，请核对证书与配置'); }
    finally { if (current(id)) { request.current = null; busyRef.current = false; setBusy(null); } }
  };
  const connect = async () => {
    if (busyRef.current || !active.current || !mounted.current) return;
    if (!available || (onOpenControl && !controlAvailable)) return;
    try { endpointForConnection(); }
    catch (error) { setMessage(report(error)); return; }
    if (!onOpenControl) { await readStatus(); return; }
    if (wireTransport === 'tls' && !identityAlias) {
      setDetailsExpanded(true); setTransport('ip');
      setMessage('首次连接，请在高级设置中选择配对证书');
      return;
    }
    await openControl();
  };
  const leave = (navigate: () => void) => { interrupt(); releaseWifi.current(); setIdentityAlias(null); setObservation(null); setIdentityReadsVerified(false); navigate(); };
  const applyDiscoveredAddress = (nextHost: string, nextPort: number) => {
    if (busyRef.current) return;
    operation.current++; clearExpiry(); cancelLocalIdentity(); setObservation(null); setMessage(null); setIdentityAlias(null); setLocalIdentity(null); setIdentityReadsVerified(false);
    setHost(nextHost); setPort(String(nextPort));
  };
  const cancel = () => { interrupt(); setBusy(null); setObservation(null); setIdentityReadsVerified(false); setMessage('本次连接检查已取消'); };
  const button = (label: string, id: string, press: () => void | Promise<void>, disabled = false, primary = false, flexRow = false) => {
    const isDisabled = disabled || readOnlyPreview;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={() => { if (!readOnlyPreview) return press(); }}
        style={({ pressed }) => [
          styles.button,
          flexRow && styles.buttonFlex,
          primary
            ? { backgroundColor: isDisabled ? FSD_MATTE.ctaDisabledBg : FSD_MATTE.ctaBg }
            : { backgroundColor: FSD_MATTE.card },
          pressed && !isDisabled && styles.pressed,
          isDisabled && !primary && styles.disabled,
        ]}
        testID={id}
      >
        <Text numberOfLines={1} style={[typography.label, styles.buttonLabel, { color: primary ? (isDisabled ? FSD_MATTE.ctaDisabledInk : FSD_MATTE.ctaInk) : FSD_MATTE.ink }]}>
          {label}
        </Text>
      </Pressable>
    );
  };
  const fsm = { zero: '初始化', grounded: '落地', standing: '站立', walking: '行走', transitioning: '姿态切换中' };
  const owner = { none: '无', grpc: '控制端', yunzhuo: '遥控器' };
  const tab = (id: Transport, label: string) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: transport === id, disabled: readOnlyPreview }}
      disabled={readOnlyPreview}
      onPress={() => {
        if (readOnlyPreview || busyRef.current || !active.current || !mounted.current) return;
        if (id === 'navigation') leave(() => { setLocalIdentity(null); setTransport(id); });
        else setTransport(id);
        setMessage(null);
      }}
      style={[styles.transportTab, transport === id && styles.transportTabActive]}
      testID={`connection-transport-${id}`}
    >
      <Text numberOfLines={1} style={[styles.transportTabLabel, transport === id && styles.transportTabLabelActive]}>{label}</Text>
    </Pressable>
  );
  if (transport === 'navigation') return <LingtuStatusScreen allowLocalHttp={isBrainstemLanAvailable()}
    onUseNavigation={onUseNavigation}
    onViewVideo={onViewVideo}
    useNavigationLabel={navigationUseLabel}
    allowViewerToken={allowViewerToken}
    onBack={() => { if (mounted.current && active.current) { setTransport('ip'); setMessage(null); } }} />;

  const statusDotColor = busy
    ? FSD_MATTE.ink
    : observation
      ? FSD_MATTE.emerald
      : 'rgba(154, 154, 154, 0.55)';
  const statusCopy = readOnlyPreview
    ? '预览模式'
    : message ?? (!available || (onOpenControl && !controlAvailable) ? '请更新应用版本' : '未连接');

  return <SafeAreaView style={[styles.safe, { backgroundColor: FSD_MATTE.canvas }]}>
    <OfficialSheet title="连接机器狗" onBack={() => leave(onBack)} backTestID="robot-connection-back">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={[styles.pageContent, isWide && styles.pageContentWide]}
        testID="robot-connection-scroll"
      >
        <View style={[styles.cockpitGrid, isWide && styles.cockpitGridWide]}>
          {/* Left Column: Direct-Connect Matte Charcoal Card */}
          <View style={[styles.leftCol, isWide && styles.leftColWide]}>
            <View style={styles.primaryPanel} testID="connection-primary-panel">
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.statusOrb, { backgroundColor: statusDotColor }]} />
                  <Text numberOfLines={1} style={styles.cardTitle}>直连地址</Text>
                </View>
                <View style={[styles.modePill, wireTransport === 'lan-dev' && styles.modePillActive]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.modePillText, wireTransport === 'lan-dev' && styles.modePillTextActive]}
                    testID={wireTransport === 'lan-dev' ? 'robot-lan-mode' : 'robot-tls-mode'}
                  >
                    {wireTransport === 'lan-dev' ? '局域网直连' : '证书直连'}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>机器狗地址</Text>
                <TextInput
                  accessibilityLabel="机器狗地址"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  keyboardType="url"
                  onChangeText={value => changeEndpoint('host', value)}
                  placeholder="输入 IP 或主机名"
                  placeholderTextColor={FSD_MATTE.muted}
                  style={[styles.input, { color: FSD_MATTE.ink }]}
                  testID="robot-grpc-host"
                  value={host}
                />
                <View style={styles.presetRow}>
                  {QUICK_HOST_PRESETS.map(preset => {
                    const activePreset = host.trim() === preset.host;
                    return (
                      <Pressable
                        key={preset.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activePreset, disabled: Boolean(busy || readOnlyPreview) }}
                        disabled={Boolean(busy || readOnlyPreview)}
                        onPress={() => changeEndpoint('host', preset.host)}
                        style={({ pressed }) => [
                          styles.presetChip,
                          activePreset && styles.presetChipActive,
                          pressed && styles.pressed,
                        ]}
                        testID={`robot-preset-${preset.id}`}
                      >
                        <Text numberOfLines={1} style={[styles.presetLabel, activePreset && styles.presetLabelActive]}>{preset.label}</Text>
                        <Text numberOfLines={1} style={[styles.presetAddr, activePreset && styles.presetAddrActive]}>{preset.host}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.ctaRow}>
                {button(
                  busy ? '取消连接' : '连接机器狗',
                  busy ? 'robot-grpc-cancel' : 'robot-connect',
                  busy ? cancel : connect,
                  !busy && (!available || (!!onOpenControl && !controlAvailable)),
                  true,
                  true,
                )}
                {lanVideoAvailable ? button('仅看画面', 'robot-lan-view-video', openLanVideo, busy !== null, false, false) : null}
              </View>

              <View style={styles.resultStrip}>
                <View style={[styles.resultDot, { backgroundColor: statusDotColor }]} />
                <Text accessibilityLiveRegion="polite" style={styles.resultText} testID="robot-grpc-result">
                  {statusCopy}
                </Text>
              </View>
            </View>
          </View>

          {/* Right Column: Live Hotspot Radar + Collapsible Advanced Card */}
          <View style={[styles.rightCol, isWide && styles.rightColWide]}>
            <WifiDiscoveryPanel
              currentHost={host}
              currentPort={port}
              disabled={busy !== null}
              onApplyAddress={applyDiscoveredAddress}
              releaseRef={releaseWifi}
              surfaceTone="dark"
              testID="connection-wifi-discovery"
            />

            <View style={styles.advancedCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsExpanded }}
                accessibilityLabel={detailsExpanded ? '收起高级设置' : '展开高级设置'}
                onPress={() => setDetailsExpanded(value => !value)}
                style={styles.integrationHeader}
                testID="connection-details-toggle"
              >
                <View style={styles.advancedTitleRow}>
                  <Ionicons color={FSD_MATTE.muted} name="options-outline" size={16} />
                  <Text numberOfLines={1} style={styles.advancedTitle}>高级设置</Text>
                </View>
                <View style={styles.advancedRightMeta}>
                  <Text numberOfLines={1} style={styles.advancedHint}>端口 · 蓝牙 · 诊断</Text>
                  <Ionicons color={FSD_MATTE.muted} name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={17} />
                </View>
              </Pressable>

              {detailsExpanded ? <View style={styles.advancedContent} testID="connection-advanced-settings">
                <View accessibilityRole="tablist" style={styles.transportTabs} testID="connection-transport-tabs">
                  {tab('ip', '连接设置')}
                  {tab('ble', '蓝牙')}
                  {tab('navigation', '视频与诊断')}
                </View>
                {transport === 'ip' ? <View style={styles.advancedContent}>
                  {button(wireTransport === 'lan-dev' ? '切换到证书连接' : '切换到局域网连接', 'robot-wire-transport', () => {
                    if (busyRef.current) return;
                    interrupt(); setWireTransport(wireTransport === 'lan-dev' ? 'tls' : 'lan-dev'); setIdentityAlias(null); setLocalIdentity(null); setObservation(null); setIdentityReadsVerified(false); setMessage(null);
                  }, busy !== null || wireTransport === 'tls' && !isBrainstemLanAvailable())}
                  <Text style={styles.fieldLabel}>端口</Text>
                  <TextInput accessibilityLabel="服务端口" editable={!busy} keyboardType="number-pad" onChangeText={value => changeEndpoint('port', value)} style={[styles.input, { color: FSD_MATTE.ink }]} testID="robot-grpc-port" value={port} />
                  {wireTransport === 'tls' ? <><Text style={styles.fieldLabel}>机器人编号</Text>
                    <TextInput accessibilityLabel="机器人编号" autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={changeRobotId} placeholder="输入机器人编号" placeholderTextColor={FSD_MATTE.muted} style={[styles.input, { color: FSD_MATTE.ink }]} testID="robot-local-identity-robot-id" value={robotId} />
                    <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-local-identity-status">本机身份：{localIdentity?.status === 'ready' ? '可用' : localIdentity ? '等待授权' : '未准备'}</Text>
                    {button(busy === 'local-identity' ? '正在读取…' : localIdentity?.status === 'ready' ? '读取本机身份' : '生成连接申请', 'robot-local-identity-prepare', () => useLocalIdentity(false), busy !== null || !localIdentityAvailable)}
                    {localIdentity?.status === 'pending' ? button('读取授权结果', 'robot-local-identity-complete', () => useLocalIdentity(true), busy !== null || !localIdentityAvailable) : null}
                    {!localIdentityAvailable ? <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-local-identity-unavailable">请更新应用版本</Text> : null}
                    <Text style={[typography.supporting, { color: p.secondary }]}>{identityAlias ? '配对证书：已选择' : '配对证书：未选择'}</Text>
                    {button(busy === 'identity' ? '正在选择配对证书…' : '选择配对证书', 'robot-grpc-certificate', selectIdentity, busy !== null || !available)}
                    {onOpenControl ? <>
                      <Text style={styles.fieldLabel}>配对身份</Text>
                      <TextInput accessibilityLabel="配对控制身份" autoCapitalize="none" autoCorrect={false} editable={!busy && !(localIdentity?.status === 'ready' && identityAlias === localIdentity.identityAlias)} value={principal} onChangeText={value => { if (!(localIdentity?.status === 'ready' && identityAlias === localIdentity.identityAlias)) setPrincipal(value); }} style={[styles.input, { color: FSD_MATTE.ink }]} testID="robot-control-principal" />
                    </> : null}</> : null}
                  {button(busy === 'read' ? '正在检查…' : '检查连接状态', 'robot-grpc-read', readStatus, busy !== null || !available)}
                  {!available ? <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-grpc-unavailable">请更新应用版本</Text> : null}
                </View> : null}
                {transport === 'ble' ? <View style={styles.advancedContent} testID="connection-ble-panel">
                  <Text style={[typography.label, { color: p.ink }]}>附近蓝牙设备</Text>
                  <Text style={[typography.supporting, { color: p.secondary }]}>仅支持蓝牙发现</Text>
                  {onOpenBleDiscovery ? button('查找蓝牙设备', 'connection-open-ble', () => leave(onOpenBleDiscovery), busy !== null) : null}
                </View> : null}

                {observation ? <View style={styles.status} testID="robot-grpc-observation">
                  <Text style={[typography.label, { color: p.ink }]}>连接诊断</Text>
                  {wireTransport === 'tls' ? <Text style={[typography.supporting, { color: p.ink }]} testID="robot-grpc-mtls-proof">身份握手：{identityReadsVerified ? '已验证' : '未验证'}</Text> : null}
                  <Text style={[typography.supporting, { color: p.ink }]}>机器人状态：{fsm[observation.status.fsmKind]}</Text>
                  <Text style={[typography.supporting, { color: p.ink }]}>控制来源：{owner[observation.status.owner]}</Text>
                  <Text style={[typography.supporting, { color: p.ink }]}>电机输出：{observation.status.motorOutputEnabled ? '已使能' : '未使能'}</Text>
                  <Text style={[typography.supporting, { color: p.ink }]}>严重故障：{observation.status.criticalMotorFault ? '有' : '无'}</Text>
                  <Text style={[typography.supporting, { color: p.ink }]}>当前策略：{observation.profile?.currentDescription || observation.profile?.current || '未同步'}</Text>
                  {(() => {
                    const values = observation.voltage?.values.filter(value => value > 0) ?? [];
                    const live = values.length > 0;
                    const voltageText = live ? `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)} V` : '未同步';
                    return <Text style={[typography.supporting, { color: live ? FSD_MATTE.emeraldInk : p.ink }]}>电机总线电压：{voltageText}</Text>;
                  })()}
                  <Text style={[typography.supporting, { color: p.ink }]}>电机在线：{observation.motors?.length ? `${observation.motors.filter(motor => motor.online).length}/${observation.motors.length}` : '未同步'}</Text>
                  {observation.motors?.some(motor => motor.errors.length > 0) ? <Text style={[typography.supporting, { color: colors.dangerText }]}>存在电机故障</Text> : null}
                  {onUseConnection ? button('使用此设备', 'robot-use-connection', useConnection, busy !== null) : null}
                  <View testID="connection-diagnostic-issues">
                    {(['profile', 'voltage', 'motors'] as const).filter(kind => diagnosticIssues[kind]).map(kind => <Text key={kind} style={[typography.supporting, { color: p.secondary }]}>
                      {{ profile: '策略', voltage: '电压', motors: '电机状态' }[kind]}：{diagnosticIssues[kind]}
                    </Text>)}
                  </View>
                </View> : null}
                <View style={styles.integrationRows} testID="brainstem-integration-readiness">
                  <Text style={[typography.supporting, { color: p.secondary }]}>{integration.controlBlockedReason}</Text>
                  {integration.gates.map(currentGate => {
                    const color = currentGate.state === 'ready' ? FSD_MATTE.emerald : currentGate.state === 'pending' ? FSD_MATTE.amber : FSD_MATTE.muted;
                    const label = currentGate.state === 'ready' ? '已满足' : currentGate.state === 'pending' ? '待完成' : '未就绪';
                    return <View key={currentGate.id} style={styles.integrationRow}>
                      <View style={[styles.integrationDot, { backgroundColor: color }]} />
                      <View style={styles.integrationRowCopy}>
                        <View style={styles.integrationRowHeading}>
                          <Text style={[typography.supporting, { color: p.ink, flex: 1 }]}>{currentGate.label}</Text>
                          <Text style={[typography.supporting, { color }]}>{label}</Text>
                        </View>
                        <Text style={[typography.supporting, { color: p.secondary }]}>{currentGate.detail}</Text>
                      </View>
                    </View>;
                  })}
                </View>
              </View> : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </OfficialSheet>
  </SafeAreaView>;
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  pageContent: { paddingBottom: 24, paddingTop: 2 },
  pageContentWide: { paddingBottom: 16 },
  cockpitGrid: { alignSelf: 'center', gap: 14, maxWidth: 960, width: '100%' },
  cockpitGridWide: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 },
  leftCol: { width: '100%' },
  leftColWide: { flex: 0.92, minWidth: 0 },
  rightCol: { gap: 12, width: '100%' },
  rightColWide: { flex: 1.08, minWidth: 0 },

  primaryPanel: {
    backgroundColor: FSD_MATTE.sheet,
    borderColor: FSD_MATTE.divider,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  cardHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  cardTitleGroup: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  statusOrb: { borderRadius: 4.5, height: 9, width: 9 },
  cardTitle: { color: FSD_MATTE.ink, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  modePill: {
    backgroundColor: FSD_MATTE.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modePillActive: { backgroundColor: FSD_MATTE.activePill },
  modePillText: { color: FSD_MATTE.muted, fontSize: 11.5, fontWeight: '600', lineHeight: 15 },
  modePillTextActive: { color: FSD_MATTE.ink },

  fieldGroup: { gap: 8 },
  fieldLabel: { color: FSD_MATTE.muted, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  input: {
    backgroundColor: FSD_MATTE.input,
    borderColor: FSD_MATTE.divider,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: {
    backgroundColor: FSD_MATTE.card,
    borderRadius: 10,
    flex: 1,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  presetChipActive: { backgroundColor: FSD_MATTE.activePill },
  presetLabel: { color: FSD_MATTE.muted, fontSize: 11, fontWeight: '600', lineHeight: 14 },
  presetLabelActive: { color: FSD_MATTE.ink },
  presetAddr: { color: FSD_MATTE.ink, fontSize: 12.5, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 16 },
  presetAddrActive: { color: '#FFFFFF' },

  ctaRow: { flexDirection: 'row', gap: 10 },
  button: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonFlex: { flex: 1 },
  buttonLabel: { fontSize: 14, fontWeight: '700', lineHeight: 19 },

  resultStrip: {
    alignItems: 'center',
    backgroundColor: FSD_MATTE.input,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resultDot: { borderRadius: 3, height: 6, width: 6 },
  resultText: { color: FSD_MATTE.muted, flex: 1, fontSize: 12.5, lineHeight: 17 },

  advancedCard: {
    backgroundColor: FSD_MATTE.sheet,
    borderColor: FSD_MATTE.divider,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  integrationHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 36 },
  advancedTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  advancedTitle: { color: FSD_MATTE.ink, fontSize: 14.5, fontWeight: '600', lineHeight: 19 },
  advancedRightMeta: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  advancedHint: { color: FSD_MATTE.muted, fontSize: 11.5, lineHeight: 15 },
  advancedContent: { gap: 10 },
  transportTabs: { backgroundColor: FSD_MATTE.input, borderRadius: 10, flexDirection: 'row', gap: 4, padding: 3 },
  transportTab: { alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 8, paddingVertical: 6 },
  transportTabActive: { backgroundColor: FSD_MATTE.activePill },
  transportTabLabel: { color: FSD_MATTE.muted, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  transportTabLabelActive: { color: FSD_MATTE.ink },
  integrationRows: { gap: 8 },
  integrationRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  integrationDot: { borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  integrationRowCopy: { flex: 1, gap: 2, minWidth: 0 },
  integrationRowHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  status: { backgroundColor: FSD_MATTE.card, borderRadius: 12, gap: 6, padding: 12 },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.44 },
});

const styles = createStyles();
