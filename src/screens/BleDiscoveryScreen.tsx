import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';

import { bleDiscoveryAdapter } from '../features/robot-lifecycle/bleDiscoveryAdapter';
import { bleConnectionAdapter } from '../features/robot-lifecycle/bleConnectionAdapter';
import { INITIAL_BLE_CONNECTION_STATE, type BleConnectionSnapshot } from '../features/robot-lifecycle/bleConnectionSession';
import { BleDiscoveryError, type BleDiscoveryErrorCode } from '../features/robot-lifecycle/bleDiscoveryContract';
import { maskPeripheralId, type BleRobotCandidate } from '../features/robot-lifecycle/bleDiscoveryModel';
import { shouldStopBleScanForAppState } from '../features/robot-lifecycle/bleDiscoverySession';
import { radii, type ThemeColors, useAppTheme } from '../theme';

type Props = {
  deviceName: string;
  onBack: () => void;
};

type DiscoveryStatus = 'idle' | 'scanning' | 'complete' | 'error' | 'interrupted';

const ERROR_COPY: Record<BleDiscoveryErrorCode, {
  title: string;
  message: string;
  settings?: 'app' | 'location';
}> = {
  unsupported: {
    title: '当前平台不支持真机查找',
    message: '请使用包含原生蓝牙功能的 DOSO Android 或 iPhone 应用。网页不支持原生蓝牙扫描。',
  },
  permission_denied: {
    title: '未获得附近设备权限',
    message: '允许蓝牙/附近设备权限后即可重新查找。',
    settings: 'app',
  },
  permission_blocked: {
    title: '附近设备权限已被关闭',
    message: '请在系统设置中允许 DOSO 使用附近设备，再返回重试。',
    settings: 'app',
  },
  bluetooth_off: {
    title: '蓝牙未开启',
    message: '请开启手机蓝牙后重新查找。',
  },
  location_off: {
    title: '定位服务未开启',
    message: 'Android 11 及以下系统需要开启定位服务才能读取 BLE 扫描结果。',
    settings: 'location',
  },
  scan_failed: {
    title: '蓝牙查找失败',
    message: '请确认当前应用包含原生蓝牙功能，然后重新查找。',
  },
};

export function BleDiscoveryScreen({ deviceName, onBack }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { height, width } = useWindowDimensions();
  const isLandscape = width >= 700 && width > height;
  const isCompact = width < 360;
  const styles = createStyles(colors, isDark);
  const mountedRef = useRef(true);
  const scanPendingRef = useRef(false);
  const scanRequestRef = useRef(0);
  const connectionPendingRef = useRef(false);
  const connectionRequestRef = useRef(0);
  const connectionCancelledRef = useRef(false);
  const connectionRef = useRef(bleConnectionAdapter.getSnapshot());
  const candidatesRef = useRef<BleRobotCandidate[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus>('idle');
  const [candidates, setCandidates] = useState<BleRobotCandidate[]>([]);
  const [errorCode, setErrorCode] = useState<BleDiscoveryErrorCode | null>(null);
  const [errorNativeStatus, setErrorNativeStatus] = useState<number | null>(null);
  const [connection, setConnection] = useState<BleConnectionSnapshot>(bleConnectionAdapter.getSnapshot());
  const [connectionPending, setConnectionPending] = useState(false);
  candidatesRef.current = candidates;
  const release = () => {
    connectionCancelledRef.current = true;
    void bleDiscoveryAdapter.stop().catch(() => {});
    void bleConnectionAdapter.disconnect().catch(() => {});
  };

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = bleConnectionAdapter.subscribe(next => {
      if (!mountedRef.current) return;
      connectionRef.current = next;
      setConnection(next);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (!shouldStopBleScanForAppState(nextState)) return;
      scanPendingRef.current = false;
      scanRequestRef.current += 1;
      setStatus((current) => current === 'scanning' ? 'interrupted' : current);
      release();
    });
    return () => {
      appStateSubscription.remove();
      mountedRef.current = false;
      unsubscribe();
      scanPendingRef.current = false;
      scanRequestRef.current += 1;
      release();
    };
  }, []);

  const startScan = async () => {
    if (scanPendingRef.current || connectionPendingRef.current || !connectionRef.current.cleanupConfirmed) return;
    if (shouldStopBleScanForAppState(AppState.currentState)) {
      setStatus('interrupted');
      return;
    }
    scanPendingRef.current = true;
    const requestId = ++scanRequestRef.current;
    setCandidates([]);
    setErrorCode(null);
    setErrorNativeStatus(null);
    setStatus('scanning');
    try {
      const result = await bleDiscoveryAdapter.scan({
        seconds: 8,
        onCandidates: (next) => {
          if (mountedRef.current && requestId === scanRequestRef.current) setCandidates(next);
        },
      });
      if (!mountedRef.current || requestId !== scanRequestRef.current) return;
      setCandidates(result);
      setStatus('complete');
    } catch (error) {
      if (!mountedRef.current || requestId !== scanRequestRef.current) return;
      setErrorCode(error instanceof BleDiscoveryError ? error.code : 'scan_failed');
      setErrorNativeStatus(error instanceof BleDiscoveryError ? error.nativeStatus ?? null : null);
      setStatus('error');
    } finally {
      if (requestId === scanRequestRef.current) scanPendingRef.current = false;
    }
  };

  const stopScan = async () => {
    scanPendingRef.current = false;
    const requestId = ++scanRequestRef.current;
    await bleDiscoveryAdapter.stop();
    if (mountedRef.current && requestId === scanRequestRef.current) setStatus('complete');
  };

  const connectCandidate = async (candidate: BleRobotCandidate) => {
    if (scanPendingRef.current || connectionPendingRef.current || !connectionRef.current.cleanupConfirmed
      || !candidatesRef.current.some(current => current.id === candidate.id)
      || shouldStopBleScanForAppState(AppState.currentState)) return;
    connectionPendingRef.current = true;
    connectionCancelledRef.current = false;
    setConnectionPending(true);
    const request = ++connectionRequestRef.current;
    let enteredNativeSession = false;
    const update = (next: BleConnectionSnapshot) => {
      if (!mountedRef.current || request !== connectionRequestRef.current) return;
      connectionRef.current = next;
      setConnection(next);
    };
    try {
      await bleDiscoveryAdapter.stop();
      if (!mountedRef.current || connectionCancelledRef.current || request !== connectionRequestRef.current
        || shouldStopBleScanForAppState(AppState.currentState)) return;
      enteredNativeSession = true;
      await bleConnectionAdapter.connect(candidate.id, update);
    } catch {
      // The session publishes closed error codes, never raw native errors.
      if (!enteredNativeSession) update({ ...INITIAL_BLE_CONNECTION_STATE, phase: 'error',
        peripheralId: candidate.id, errorCode: 'preparation_failed' });
    } finally {
      if (request === connectionRequestRef.current) {
        connectionPendingRef.current = false;
        if (mountedRef.current) setConnectionPending(false);
      }
    }
  };
  const disconnect = async () => {
    connectionCancelledRef.current = true;
    try { await bleConnectionAdapter.disconnect(); }
    catch {
      const next: BleConnectionSnapshot = { ...connectionRef.current, phase: 'error', cleanupConfirmed: false, errorCode: 'cleanup_unconfirmed' };
      connectionRef.current = next;
      if (mountedRef.current) setConnection(next);
    }
  };
  const leaveScreen = () => { release(); onBack(); };
  const connectionLocked = connectionPending || !connection.cleanupConfirmed;

  const error = errorCode ? ERROR_COPY[errorCode] : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, isCompact && styles.compactContent]} showsVerticalScrollIndicator={false}>
        <View style={[styles.layout, isLandscape && styles.landscapeLayout]}>
          <View style={styles.introPane}>
            <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={leaveScreen} style={styles.back} testID="ble-back">
              <Ionicons color={colors.ink} name="chevron-back" size={22} />
            </Pressable>

            {bleDiscoveryAdapter.supported ? (
              <View style={styles.liveBanner}>
                <Ionicons color={p.blueInk} name="bluetooth-outline" size={21} />
                <View style={styles.bannerCopy}>
                  <Text style={styles.liveTitle}>蓝牙扫描与连接</Text>
                  <Text style={styles.liveText}>先查找，再由你选择设备连接并查看服务。系统连接不代表机器人身份已验证，也不会自动绑定或配网。</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.eyebrow}>DOSO BLE DISCOVERY</Text>
            <Text style={[styles.title, isCompact && styles.compactTitle]}>查找附近机器人</Text>
            <Text style={styles.subtitle}>
              为 {deviceName} 查找附近候选设备。连接后可发现服务；机器人身份握手、绑定和配网需要对应的固件协议。
            </Text>
          </View>

          <View style={styles.resultsPane}>
            {!bleDiscoveryAdapter.supported ? (
              <View style={styles.messageCard}>
                <Ionicons color={colors.muted} name="phone-portrait-outline" size={28} />
                <Text style={styles.messageTitle}>{ERROR_COPY.unsupported.title}</Text>
                <Text style={styles.messageText}>{ERROR_COPY.unsupported.message}</Text>
              </View>
            ) : (
              <>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>{status === 'scanning' ? '正在读取真实蓝牙广播…' : '附近设备扫描'}</Text>
            <Text style={styles.actionText}>扫描约 8 秒；列表不会自动连接，也不会把最强信号当作 DOSO 身份。</Text>
            <Pressable
              accessibilityLabel={status === 'scanning' ? '停止查找附近设备' : '开始查找附近设备'}
              accessibilityRole="button"
              accessibilityState={{ busy: status === 'scanning' }}
              disabled={connectionLocked}
              onPress={() => void (status === 'scanning' ? stopScan() : startScan())}
              style={[styles.primaryButton, status === 'scanning' && styles.stopButton]}
            >
              <Ionicons color={p.actionInk} name={status === 'scanning' ? 'stop-circle-outline' : 'search-outline'} size={19} />
              <Text style={styles.primaryButtonText}>{status === 'scanning' ? '停止查找' : status === 'idle' ? '开始查找附近设备' : '重新查找'}</Text>
            </Pressable>
          </View>

          {connection.phase !== 'idle' ? <View style={styles.messageCard} testID="ble-connection-status">
            <Text accessibilityLiveRegion="polite" style={styles.messageTitle}>{connectionTitle(connection)}</Text>
            <Text style={styles.messageText}>{connection.phase === 'connected'
              ? `发现 ${connection.serviceCount} 个服务、${connection.characteristicCount} 个特征。仅确认系统蓝牙连接，机器人身份尚未验证。`
              : connectionMessage(connection)}</Text>
            {!connection.cleanupConfirmed && ['error', 'disconnected'].includes(connection.phase)
              ? <Text style={styles.messageText}>系统连接的释放尚未确认，暂不能重新连接。请等待系统释放；仍未恢复时关闭并重启 App。</Text> : null}
            {['preparing', 'connecting', 'discovering', 'connected'].includes(connection.phase) ? <Pressable
              accessibilityRole="button" accessibilityLabel="断开蓝牙连接" onPress={() => void disconnect()}
              style={styles.primaryButton} testID="ble-disconnect"><Text style={styles.primaryButtonText}>断开连接</Text></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled testID="ble-identity-blocked">
              <Text style={styles.messageText}>验证机器人身份并绑定，待固件协议</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled testID="ble-wifi-blocked">
              <Text style={styles.messageText}>配置 Wi-Fi，待身份与配网协议</Text>
            </Pressable>
          </View> : null}

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons color={colors.dangerText} name="alert-circle-outline" size={25} />
              <Text accessibilityLiveRegion="polite" style={styles.messageTitle}>{error.title}</Text>
              <Text style={styles.messageText}>{error.message}</Text>
              {errorNativeStatus === null ? null : (
                <Text style={styles.diagnosticText}>Android 扫描错误码：{errorNativeStatus}</Text>
              )}
              {error.settings ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void (error.settings === 'location'
                    ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS')
                    : Linking.openSettings())}
                  style={styles.settingsButton}
                >
                  <Text style={styles.settingsButtonText}>{error.settings === 'location' ? '打开定位设置' : '打开应用设置'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {status === 'interrupted' ? (
            <View style={styles.messageCard}>
              <Ionicons color={colors.muted} name="pause-circle-outline" size={26} />
              <Text accessibilityLiveRegion="polite" style={styles.messageTitle}>扫描已中断</Text>
              <Text style={styles.messageText}>应用进入后台，蓝牙扫描已停止。返回前台后请重新查找附近设备。</Text>
            </View>
          ) : null}

          {candidates.length ? (
            <View style={styles.listSection}>
              <Text accessibilityLiveRegion="polite" style={styles.listTitle}>候选设备（{candidates.length}）</Text>
              {candidates.map((candidate, index) => (
                <View key={candidate.id} style={styles.candidateCard}>
                  <View style={styles.deviceIcon}>
                    <Ionicons color={p.blueInk} name="hardware-chip-outline" size={23} />
                  </View>
                  <View style={styles.candidateCopy}>
                    <Text style={styles.candidateName}>{candidate.displayName}</Text>
                    <Text style={styles.candidateMeta}>{maskPeripheralId(candidate.id)}，{signalLabel(candidate.rssi)}</Text>
                    <Text style={styles.identityLabel}>{basisLabel(candidate.matchBasis)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`连接${candidate.displayName}并查看服务`}
                      accessibilityState={{ disabled: status === 'scanning' || connectionLocked || !bleConnectionAdapter.supported }}
                      disabled={status === 'scanning' || connectionLocked || !bleConnectionAdapter.supported}
                      onPress={() => void connectCandidate(candidate)} style={styles.primaryButton} testID={`ble-connect-${index}`}>
                      <Text style={styles.primaryButtonText}>连接并查看服务</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <Text style={styles.nextStep}>广播名称、信号和服务 UUID 均不能证明机器人身份。当前仅开放系统连接与服务发现，不执行账户绑定或 Wi-Fi 凭据写入。</Text>
            </View>
          ) : status === 'complete' && !error ? (
            <View style={styles.messageCard}>
              <Ionicons color={colors.muted} name="search-outline" size={26} />
              <Text style={styles.messageTitle}>本次没有发现候选设备</Text>
              <Text style={styles.messageText}>请让机器人进入配网广播模式、靠近手机后重新查找。</Text>
            </View>
          ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function connectionTitle(state: BleConnectionSnapshot) {
  if (state.phase === 'disconnected' && !state.cleanupConfirmed) return '正在释放蓝牙连接…';
  return ({ idle: '尚未连接', preparing: '正在准备蓝牙连接…', connecting: '正在连接所选设备…',
    discovering: '正在发现设备服务…', connected: '系统蓝牙已连接，身份未验证', disconnecting: '正在断开连接…',
    disconnected: '蓝牙连接已结束', error: '蓝牙连接未完成' } as const)[state.phase];
}

function connectionMessage(state: BleConnectionSnapshot) {
  if (state.phase === 'disconnected' && !state.cleanupConfirmed) return '已请求断开，系统尚未确认本次连接已释放。';
  if (state.errorCode === 'timeout') return '连接或服务发现已超时，已请求释放本次连接。';
  if (state.errorCode === 'preparation_failed') return '请检查手机蓝牙和附近设备权限，并重新查找后再连接。';
  if (state.errorCode === 'discovery_failed') return '设备服务发现未完成，本次连接已请求释放。';
  if (state.phase === 'disconnected') return '本页不再保持蓝牙连接；重新连接需要你再次选择设备。';
  return '仅连接你明确选择的设备；不会读取特征值、写入 Wi-Fi 信息或发送机器人控制指令。';
}

function signalLabel(rssi: number) {
  if (rssi >= -55) return `信号强 ${rssi} dBm`;
  if (rssi >= -72) return `信号中等 ${rssi} dBm`;
  return `信号较弱 ${rssi} dBm`;
}

function basisLabel(basis: BleRobotCandidate['matchBasis']) {
  if (basis === 'service_uuid') return '服务标识匹配，身份仍待验证';
  if (basis === 'name_hint') return 'DOSO 名称线索，身份未验证';
  return '附近 BLE 广播，身份未验证';
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  content: { backgroundColor: colors.background, flexGrow: 1, paddingBottom: 42, paddingHorizontal: 24, paddingTop: 22 },
  compactContent: { paddingHorizontal: 16 },
  layout: { flex: 1, gap: 16 },
  landscapeLayout: { flexDirection: 'row', gap: 20, marginHorizontal: 'auto', maxWidth: 1040, width: '100%' },
  introPane: { flex: 0.9, gap: 16, minWidth: 0 },
  resultsPane: { flex: 1.1, gap: 16, minWidth: 0 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  liveBanner: { alignItems: 'flex-start', backgroundColor: p.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: 10, padding: cardLayout.inset },
  bannerCopy: { flex: 1 },
  liveTitle: { ...typography.label, color: p.ink },
  liveText: { ...typography.supporting, color: p.secondary, marginTop: 3 },
  eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 8 },
  title: { ...typography.compactTitle, color: p.ink },
  compactTitle: { ...typography.compactTitle },
  subtitle: { ...typography.supporting, color: p.secondary },
  actionCard: { backgroundColor: p.surface, borderRadius: cardLayout.radius, gap: cardLayout.gap, padding: cardLayout.inset },
  actionTitle: { ...typography.label, color: p.ink },
  actionText: { ...typography.supporting, color: p.secondary },
  primaryButton: { alignItems: 'center', backgroundColor: p.action, borderRadius: radii.pill, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4, minHeight: 48, paddingHorizontal: 16 },
  stopButton: { backgroundColor: p.action },
  primaryButtonText: { ...typography.label, color: p.actionInk },
  errorCard: { alignItems: 'flex-start', backgroundColor: colors.dangerSurface, borderRadius: cardLayout.radius, gap: 8, padding: cardLayout.inset },
  messageCard: { alignItems: 'flex-start', backgroundColor: p.surface, borderRadius: cardLayout.radius, gap: cardLayout.gap, padding: cardLayout.inset },
  messageTitle: { ...typography.label, color: p.ink },
  messageText: { ...typography.supporting, color: p.secondary },
  diagnosticText: { ...typography.supporting, color: colors.dangerText, fontFamily: 'monospace' },
  settingsButton: { alignItems: 'center', borderColor: colors.dangerText, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', marginTop: 4, minHeight: 44, paddingHorizontal: 16 },
  settingsButtonText: { ...typography.label, color: colors.dangerText },
  listSection: { gap: cardLayout.gap },
  listTitle: { ...typography.label, color: p.ink },
  candidateCard: { alignItems: 'center', backgroundColor: p.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: cardLayout.gap, padding: cardLayout.inset },
  deviceIcon: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  candidateCopy: { flex: 1 },
  candidateName: { ...typography.label, color: p.ink },
  candidateMeta: { ...typography.supporting, color: p.secondary, marginTop: 3 },
  identityLabel: { ...typography.supporting, color: colors.dangerText, marginTop: 4 },
  nextStep: { ...typography.supporting, color: p.secondary, marginTop: 2 },
  });
};
