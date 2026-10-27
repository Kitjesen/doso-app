import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/AppText';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { useAppTheme } from '../theme';
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

type Props = {
  onBack: () => void;
  onOpenBleDiscovery?: () => void;
  onBindDevice?: () => void;
  onOpenDeviceEnrollment?: () => void;
  initialEndpoint?: Readonly<BrainstemGrpcEndpoint>;
  onUseConnection?: (snapshot: DirectRobotConnectionSnapshot) => boolean;
  onOpenControl?: (endpoint: BrainstemGrpcEndpoint, principal: string, signal: AbortSignal) => Promise<boolean>;
  accountDeviceName?: string;
  onOpenAccountDevice?: () => void;
  accountDeviceConnected?: boolean;
  accountDeviceIdentityStatus?: 'unbound' | 'bound-unverified' | 'verified';
  accountDeviceConnectionSource?: string;
  accountDeviceLastSyncLabel?: string;
  accountControlAuthority?: 'unknown' | 'not-held' | 'held';
  accountBlockedReason?: string;
};

type Transport = 'ip' | 'ble' | 'cloud';
type Styles = ReturnType<typeof createStyles>;

// Local, read-only transport checks are deliberately separate from account
// restoration. They do not publish a prepared session, device binding or motion authority.
export function RobotConnectionScreen({ onBack, onOpenBleDiscovery, onBindDevice, onOpenDeviceEnrollment, initialEndpoint, onUseConnection, onOpenControl, accountDeviceName, onOpenAccountDevice, accountDeviceConnected = false, accountDeviceIdentityStatus = 'unbound', accountDeviceConnectionSource = '云端设备记录', accountDeviceLastSyncLabel = '尚未同步', accountControlAuthority = 'unknown', accountBlockedReason }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const [host, setHost] = useState(initialEndpoint?.host ?? '');
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
  const request = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const busyRef = useRef(false);
  const identityPending = useRef(false);
  const mounted = useRef(true);
  const active = useRef(AppState.currentState === 'active');
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const available = isBrainstemGrpcAvailable();
  const localIdentityAvailable = isBrainstemLocalIdentityAvailable();
  const controlAvailable = isBrainstemControlAvailable();
  const integration = getBrainstemIntegrationReadiness({
    transport: wireTransport,
    nativeModuleAvailable: available,
    endpointConfigured: host.trim().length > 0 && port.trim().length > 0,
    readOnlyObservationFresh: Boolean(observation),
    deviceIdentity: accountDeviceIdentityStatus,
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
  const cancelLocalIdentity = () => { void cancelBrainstemLocalClientIdentity().catch(() => {}); };
  const interrupt = () => {
    operation.current++; request.current?.abort(); request.current = null;
    busyRef.current = false; identityPending.current = false; clearExpiry(); cancelLocalIdentity();
  };
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) return;
      // Android's user-controlled KeyChain picker temporarily pauses our
      // activity. Keep only that pending operation; native defers its result
      // until foreground. Reads, observations and previously chosen aliases
      // still do not survive backgrounding. Back/cancel/unmount invalidate it.
      if (identityPending.current) {
        clearExpiry(); setIdentityAlias(null); setObservation(null); setIdentityReadsVerified(false); return;
      }
      interrupt(); setIdentityAlias(null); setLocalIdentity(null); setObservation(null); setIdentityReadsVerified(false); setBusy(null);
      setMessage('连接检查已暂停。');
    });
    return () => { mounted.current = false; interrupt(); sub.remove(); };
  }, []);
  const current = (id: number) => mounted.current && active.current && operation.current === id;
  const report = (error: unknown) => error instanceof BrainstemGrpcError && error.code !== 'unavailable'
    ? error.message
    : wireTransport === 'lan-dev'
    ? '局域网连接检查失败，请核对私有 IPv4、服务端口与来源许可。'
    : error instanceof BrainstemGrpcError ? error.message : '连接检查失败，请核对机器狗服务地址和证书配置。';
  const endpointForConnection = (): BrainstemGrpcEndpoint => ({
    ...validateBrainstemEndpoint(host, port, wireTransport, wireTransport === 'tls' ? identityAlias ?? undefined : undefined),
    ...(wireTransport === 'lan-dev' ? { transport: 'lan-dev' as const } : identityAlias ? { clientIdentityAlias: identityAlias } : {}),
  });
  const changeEndpoint = (kind: 'host' | 'port', value: string) => {
    if (busyRef.current) return;
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
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(canonicalRobotId)) { setMessage('请输入有效的机器人编号。'); return; }
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
      setMessage(identity.status === 'ready' ? '本机身份已就绪。' : '连接申请已生成，等待授权。');
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
      if (current(id)) { setIdentityAlias(alias); setMessage(alias ? '已选择客户端证书。' : '未选择客户端证书。'); }
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
      // Profile metadata is an optional read-only extension. Older APKs and
      // Brainstem builds may not expose GetProfile; status remains usable and
      // the control page keeps terrain modes at “未同步” in that case.
      if (typeof readBrainstemGrpcProfile === 'function') {
        try {
          const profile = await readBrainstemGrpcProfile({ endpoint: { ...endpoint, ...(identityAlias ? { clientIdentityAlias: identityAlias } : {}) }, requestId: randomUUID(), signal: controller.signal });
          enriched = { ...result, profile: profile.profile };
          if (identityVerified(profile)) verifiedReads++;
        } catch (profileError) {
          // Profile is an optional metadata read. Keep a valid status result
          // when an older server, build or certificate policy does not expose
          // GetProfile; lifecycle cancellation still aborts the whole read.
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
          // Voltage and motor status are optional diagnostics. Preserve a valid
          // status/profile result when an older server does not implement them.
          if (diagnosticError instanceof BrainstemGrpcError && (diagnosticError.code === 'cancelled' || diagnosticError.code === 'background')) throw diagnosticError;
          issues[kind] = report(diagnosticError);
        }
      }
      if (!current(id)) return;
      const checked = createDirectRobotConnectionSnapshot(endpoint, enriched);
      const remaining = Date.parse(checked.observation.observedAt) + 15_000 - Date.now();
      setDiagnosticIssues(issues);
      setIdentityReadsVerified(verifiedReads === 4);
      setObservation(checked.observation); setMessage('状态已读取，未获取控制权。');
      expiry.current = setTimeout(() => {
        if (!current(id)) return;
        setObservation(null); setIdentityReadsVerified(false); setMessage('机器人状态已过期，请重新检查。'); expiry.current = null;
      }, remaining);
    } catch (error) { if (current(id)) setMessage(report(error)); }
    finally { if (current(id)) { request.current = null; busyRef.current = false; setBusy(null); } }
  };
  const useConnection = () => {
    if (!onUseConnection || !observation || busyRef.current || !active.current || !mounted.current) return;
    try {
      const checked = createDirectRobotConnectionSnapshot(endpointForConnection(), observation);
      if (onUseConnection(checked)) return;
    } catch { /* Display only a fixed reason; never native or account details. */ }
    clearExpiry(); setObservation(null);
    setMessage('本次状态或账户上下文已变化，请重新读取后继续。');
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
      if (current(id)) setMessage(opened ? '连接已建立。' : wireTransport === 'lan-dev' ? '局域网连接未建立，请核对私有 IP、来源许可和服务配置。' : '控制连接未建立，请核对机器狗的配对证书和服务配置。');
    } catch { if (current(id)) setMessage(wireTransport === 'lan-dev' ? '局域网连接未建立，请核对私有 IP、来源许可和服务配置。' : '控制连接未建立，请核对地址、控制身份和配对证书。'); }
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
      setMessage('首次连接，请在高级设置中选择配对证书。');
      return;
    }
    await openControl();
  };
  const leave = (navigate: () => void) => { interrupt(); setIdentityAlias(null); setObservation(null); setIdentityReadsVerified(false); navigate(); };
  const cancel = () => { interrupt(); setBusy(null); setObservation(null); setIdentityReadsVerified(false); setMessage('本次连接检查已取消。'); };
  const button = (label: string, id: string, press: () => void | Promise<void>, disabled = false, primary = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press}
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? p.blue : p.surface }, pressed && styles.pressed, disabled && styles.disabled]}
      testID={id}><Text style={[typography.label, { color: primary ? p.blueInk : p.ink }]}>{label}</Text></Pressable>
  );
  const fsm = { zero: '初始化', grounded: '落地', standing: '站立', walking: '行走', transitioning: '姿态切换中' };
  const owner = { none: '无控制者', grpc: 'gRPC 控制者', yunzhuo: '云卓遥控器' };
  const identityLabel = accountDeviceIdentityStatus === 'verified'
    ? '身份已验证'
    : accountDeviceIdentityStatus === 'bound-unverified'
      ? '身份待验证'
      : '未绑定账户设备';
  const identityTone = accountDeviceIdentityStatus === 'verified' ? 'positive' : accountDeviceName ? 'pending' : 'neutral';
  const connectionLabel = accountDeviceConnected
    ? '在线'
    : accountDeviceName
      ? '已绑定，未连接'
      : observation
        ? '已读取，归属未核验'
        : '未建立连接';
  const authorityLabel = accountControlAuthority === 'held'
    ? '控制权已取得'
    : accountControlAuthority === 'not-held'
      ? '未取得控制权'
      : observation
        ? `状态显示：${owner[observation.status.owner]}（只读）`
        : '控制权待核对';
  const authorityReason = accountBlockedReason
    ?? (accountDeviceName ? '设备身份待验证，控制未开放。' : '设备未绑定，控制未开放。');
  const observedAtLabel = observation ? '本次读取' : accountDeviceLastSyncLabel;
  const tab = (id: Transport, label: string) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: transport === id }}
      onPress={() => { if (!busyRef.current) { setTransport(id); setMessage(null); } }}
      style={[styles.transportTab, transport === id && styles.transportTabActive]}
      testID={`connection-transport-${id}`}
    >
      <Text style={[styles.transportTabLabel, transport === id && styles.transportTabLabelActive]}>{label}</Text>
    </Pressable>
  );
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => leave(onBack)} style={styles.back} testID="robot-connection-back"><Ionicons name="arrow-back" color={p.ink} size={22} /></Pressable>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={[typography.compactTitle, { color: p.ink }]}>连接机器狗</Text>
      </View>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" style={styles.scroll} contentContainerStyle={styles.pageContent} testID="robot-connection-scroll">
      <View style={styles.content}>
        <View style={[styles.panel, { backgroundColor: p.surface }]} testID="connection-primary-panel">
          <Text style={[typography.label, { color: p.ink }]}>机器狗地址</Text>
          {wireTransport === 'lan-dev' ? <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-lan-mode">局域网连接</Text> : null}
          <TextInput accessibilityLabel="机器狗地址" autoCapitalize="none" autoCorrect={false} editable={!busy} keyboardType="url" onChangeText={value => changeEndpoint('host', value)} placeholder="输入 IP 或主机名" placeholderTextColor={p.secondary} style={[styles.input, { backgroundColor: colors.background, color: p.ink }]} testID="robot-grpc-host" value={host} />
          {button(busy ? '取消连接' : '连接机器狗', busy ? 'robot-grpc-cancel' : 'robot-connect', busy ? cancel : connect, !busy && (!available || (!!onOpenControl && !controlAvailable)), true)}
          <Text accessibilityLiveRegion="polite" style={[typography.supporting, { color: p.secondary }]} testID="robot-grpc-result">{message ?? (!available || (onOpenControl && !controlAvailable) ? '请升级安装包以连接机器狗。' : '未连接')}</Text>
        </View>

        <View style={[styles.panel, { backgroundColor: p.surface }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsExpanded }} accessibilityLabel={detailsExpanded ? '收起高级设置' : '展开高级设置'} onPress={() => setDetailsExpanded(value => !value)} style={styles.integrationHeader} testID="connection-details-toggle">
            <Text style={[typography.label, { color: p.ink, flex: 1 }]}>高级设置</Text>
            <Ionicons color={p.secondary} name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>
          {detailsExpanded ? <View style={styles.advancedContent} testID="connection-advanced-settings">
            <View accessibilityRole="tablist" style={styles.transportTabs} testID="connection-transport-tabs">
              {tab('ip', '连接设置')}
              {tab('ble', '蓝牙')}
              {tab('cloud', '账号设备')}
            </View>
            {transport === 'ip' ? <View style={styles.advancedContent}>
              {button(wireTransport === 'lan-dev' ? '切换到证书连接' : '切换到局域网连接', 'robot-wire-transport', () => {
                if (busyRef.current) return;
                interrupt(); setWireTransport(wireTransport === 'lan-dev' ? 'tls' : 'lan-dev'); setIdentityAlias(null); setLocalIdentity(null); setObservation(null); setIdentityReadsVerified(false); setMessage(null);
              }, busy !== null || wireTransport === 'tls' && !isBrainstemLanAvailable())}
              <Text style={[typography.label, { color: p.ink }]}>端口</Text>
              <TextInput accessibilityLabel="gRPC端口" editable={!busy} keyboardType="number-pad" onChangeText={value => changeEndpoint('port', value)} style={[styles.input, { backgroundColor: colors.background, color: p.ink }]} testID="robot-grpc-port" value={port} />
              {wireTransport === 'tls' ? <><Text style={[typography.label, { color: p.ink }]}>机器人编号</Text>
              <TextInput accessibilityLabel="机器人编号" autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={changeRobotId} placeholder="输入机器人编号" placeholderTextColor={p.secondary} style={[styles.input, { backgroundColor: colors.background, color: p.ink }]} testID="robot-local-identity-robot-id" value={robotId} />
              <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-local-identity-status">本机身份：{localIdentity?.status === 'ready' ? '可用' : localIdentity ? '等待授权' : '未准备'}</Text>
              {button(busy === 'local-identity' ? '正在读取…' : localIdentity?.status === 'ready' ? '读取本机身份' : '生成连接申请', 'robot-local-identity-prepare', () => useLocalIdentity(false), busy !== null || !localIdentityAvailable)}
              {localIdentity?.status === 'pending' ? button('读取授权结果', 'robot-local-identity-complete', () => useLocalIdentity(true), busy !== null || !localIdentityAvailable) : null}
              {!localIdentityAvailable ? <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-local-identity-unavailable">此版本不支持本机身份，请升级安装包。</Text> : null}
              <Text style={[typography.supporting, { color: p.secondary }]}>{identityAlias ? '配对证书：已选择' : '配对证书：未选择'}</Text>
              {button(busy === 'identity' ? '正在选择配对证书…' : '选择配对证书', 'robot-grpc-certificate', selectIdentity, busy !== null || !available)}
              {onOpenControl ? <>
                <Text style={[typography.label, { color: p.ink }]}>配对身份</Text>
                <TextInput accessibilityLabel="配对控制身份" autoCapitalize="none" autoCorrect={false} editable={!busy && !(localIdentity?.status === 'ready' && identityAlias === localIdentity.identityAlias)} value={principal} onChangeText={value => { if (!(localIdentity?.status === 'ready' && identityAlias === localIdentity.identityAlias)) setPrincipal(value); }} style={[styles.input, { backgroundColor: colors.background, color: p.ink }]} testID="robot-control-principal" />
              </> : null}</> : null}
              {button(busy === 'read' ? '正在检查…' : '检查连接状态', 'robot-grpc-read', readStatus, busy !== null || !available)}
              {!available ? <Text style={[typography.supporting, { color: p.secondary }]} testID="robot-grpc-unavailable">此版本不支持直连，请升级 Android 安装包。</Text> : null}
            </View> : null}
            {transport === 'ble' ? <View style={styles.advancedContent} testID="connection-ble-panel">
              <Text style={[typography.label, { color: p.ink }]}>附近 BLE 设备</Text>
              <Text style={[typography.supporting, { color: p.secondary }]}>身份验证和配网尚未接入</Text>
              {onOpenBleDiscovery ? button('查找蓝牙设备', 'connection-open-ble', () => leave(onOpenBleDiscovery), busy !== null) : <Text style={[typography.supporting, { color: p.secondary }]}>登录后可查找设备。</Text>}
            </View> : null}
            {transport === 'cloud' ? <View style={styles.advancedContent} testID="connection-cloud-panel">
              <Text style={[typography.label, { color: p.ink }]}>{accountDeviceName ?? '尚未绑定机器狗'}</Text>
              {accountDeviceName ? <View style={styles.advancedContent} testID="device-connection-summary">
                <Text style={[typography.supporting, { color: p.secondary }]}>连接来源：{accountDeviceConnectionSource}</Text>
                <Text style={[typography.supporting, { color: p.secondary }]}>{connectionLabel}</Text>
                <View style={styles.summaryGrid}>
                  <SummaryItem label="设备身份" value={identityLabel} tone={identityTone} styles={styles} />
                  <SummaryItem label="最后同步" value={observedAtLabel} tone="neutral" styles={styles} />
                  <SummaryItem label="控制权" value={authorityLabel} tone={accountControlAuthority === 'held' ? 'positive' : 'neutral'} styles={styles} />
                </View>
                <Text style={[typography.supporting, { color: p.secondary }]}>{authorityReason}</Text>
              </View> : null}
              {accountDeviceName && onOpenDeviceEnrollment ? button('验证设备身份', 'connection-open-enrollment', () => leave(onOpenDeviceEnrollment), busy !== null) : null}
              {accountDeviceName && onOpenAccountDevice ? button('查看账号设备', 'connection-open-account-device', () => leave(onOpenAccountDevice), busy !== null) : null}
              {!accountDeviceName && onBindDevice ? button('添加账号设备', 'connection-open-binding', () => leave(onBindDevice), busy !== null) : null}
            </View> : null}

            {observation ? <View style={styles.status} testID="robot-grpc-observation">
              <Text style={[typography.label, { color: p.ink }]}>连接诊断</Text>
              {wireTransport === 'tls' ? <Text style={[typography.supporting, { color: p.ink }]} testID="robot-grpc-mtls-proof">身份握手：{identityReadsVerified ? '已验证' : '未验证'}</Text> : null}
              <Text style={[typography.supporting, { color: p.ink }]}>机器人状态：{fsm[observation.status.fsmKind]}</Text>
              <Text style={[typography.supporting, { color: p.ink }]}>控制来源：{owner[observation.status.owner]}</Text>
              <Text style={[typography.supporting, { color: p.ink }]}>电机输出：{observation.status.motorOutputEnabled ? '已使能' : '未使能'}</Text>
              <Text style={[typography.supporting, { color: p.ink }]}>严重故障：{observation.status.criticalMotorFault ? '有' : '无'}</Text>
              <Text style={[typography.supporting, { color: p.ink }]}>当前策略：{observation.profile?.currentDescription || observation.profile?.current || '未同步'}</Text>
              <Text style={[typography.supporting, { color: p.ink }]}>电机总线电压：{(() => {
                const values = observation.voltage?.values.filter(value => value > 0) ?? [];
                return values.length ? `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)} V` : '未同步';
              })()}</Text>
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
              {integration.gates.map(current => {
                const color = current.state === 'ready' ? '#2A8A64' : current.state === 'pending' ? '#A06E18' : '#77808B';
                const label = current.state === 'ready' ? '已满足' : current.state === 'pending' ? '待完成' : '未就绪';
                return <View key={current.id} style={styles.integrationRow}>
                  <View style={[styles.integrationDot, { backgroundColor: color }]} />
                  <View style={styles.integrationRowCopy}>
                    <View style={styles.integrationRowHeading}>
                      <Text style={[typography.supporting, { color: p.ink, flex: 1 }]}>{current.label}</Text>
                      <Text style={[typography.supporting, { color }]}>{label}</Text>
                    </View>
                    <Text style={[typography.supporting, { color: p.secondary }]}>{current.detail}</Text>
                  </View>
                </View>;
              })}
            </View>
          </View> : null}
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function SummaryItem({ label, value, tone, styles }: { label: string; value: string; tone: 'positive' | 'pending' | 'neutral'; styles: Styles }) {
  return <View style={styles.summaryItem}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, tone === 'positive' ? styles.summaryValuePositive : tone === 'pending' ? styles.summaryValuePending : styles.summaryValueNeutral]}>{value}</Text>
  </View>;
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1 }, heading: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  scroll: { flex: 1 }, pageContent: { paddingBottom: 24, gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  summaryCard: { borderRadius: cardLayout.radius, marginHorizontal: 12, marginTop: 4, padding: 16, gap: 12 },
  summaryHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  summaryTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  summaryStatus: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  statusDot: { backgroundColor: '#77808B', borderRadius: 4, height: 8, width: 8 },
  statusDotPositive: { backgroundColor: '#2A8A64' },
  statusDotPending: { backgroundColor: '#A06E18' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryItem: { flexBasis: 96, flexGrow: 1, minWidth: 92, gap: 3 },
  summaryLabel: { color: '#77808B', fontSize: 12, lineHeight: 17 },
  summaryValue: { fontSize: 13, lineHeight: 19 },
  summaryValuePositive: { color: '#2A8A64' },
  summaryValuePending: { color: '#A06E18' },
  summaryValueNeutral: { color: '#3F4A57' },
  blockedReason: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  transportTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  transportTab: { backgroundColor: '#F4F7FA', borderRadius: 14, flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  transportTabActive: { backgroundColor: '#DCEEFF' },
  transportTabLabel: { color: '#3F4A57', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  transportTabLabelActive: { color: '#14528A' },
  integrationCard: { marginHorizontal: 12, borderRadius: cardLayout.radius, padding: 16, gap: 10 },
  integrationHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 44 },
  integrationRows: { gap: 8 },
  integrationRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  integrationDot: { borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  integrationRowCopy: { flex: 1, minWidth: 0, gap: 2 },
  integrationRowHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  back: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  content: { alignSelf: 'center', width: '100%', maxWidth: 720, padding: 16, gap: 12, paddingBottom: 28 },
  panel: { flexGrow: 1, minWidth: 0, flexShrink: 1, width: '100%', borderRadius: cardLayout.radius, padding: 16, gap: 12 },
  input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, ...typography.body },
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  advancedContent: { gap: 12 },
  status: { gap: 8 }, pressed: { opacity: 0.65 }, disabled: { opacity: 0.5 },
});

const styles = createStyles();
