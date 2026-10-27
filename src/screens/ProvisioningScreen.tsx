import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import {
  type ProvisioningDemoScenario,
  type ProvisioningGateway,
  type ProvisioningGatewayEvent,
  type ProvisioningPresentationPhase,
} from '../features/robot-lifecycle/provisioningGateway';
import { radii, type ThemeColors, useAppTheme } from '../theme';

type Props = {
  deviceName: string;
  gateway: ProvisioningGateway;
  onBack: () => void;
};

const SCENARIOS: Array<{ value: ProvisioningDemoScenario; label: string }> = [
  { value: 'success', label: '成功' },
  { value: 'device_not_found', label: '未发现设备' },
  { value: 'identity_verification_failed', label: '身份失败' },
  { value: 'ownership_invalidated', label: '所有权失效' },
  { value: 'wifi_password_error', label: '密码错误' },
  { value: 'connection_interruption', label: '断连恢复' },
  { value: 'session_expired', label: '会话过期' },
];

const PHASE_LABELS: Record<string, string> = {
  ready: '准备',
  discovering: '发现机器人',
  wifi_form: '填写 Wi-Fi',
  authenticating: '身份验证',
  secure_channel_ready: '安全通道已建立',
  connecting: '连接 Wi-Fi',
  awaiting_confirmation: '云端在线确认',
  succeeded: '已完成',
  cancelled: '已取消',
  expired: '已过期',
  failed: '失败',
  invalidated: '所有权已失效',
};

const TERMINAL = new Set<ProvisioningPresentationPhase>(['succeeded', 'cancelled', 'expired', 'failed', 'invalidated']);

const PHASE_PROGRESS: Record<string, number> = {
  ready: 0,
  discovering: 12,
  wifi_form: 24,
  authenticating: 40,
  secure_channel_ready: 55,
  connecting: 70,
  awaiting_confirmation: 88,
  succeeded: 100,
  cancelled: 0,
  expired: 0,
  failed: 0,
  invalidated: 0,
};

export function ProvisioningScreen({ deviceName, gateway, onBack }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { height, width } = useWindowDimensions();
  const isLandscape = width >= 700 && width > height;
  const isCompact = width < 360;
  const styles = createStyles(colors, isDark);
  const [scenario, setScenario] = useState<ProvisioningDemoScenario>('success');
  const [flow, setFlow] = useState(() => gateway.create({ scenario }));
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presentation = gateway.present(flow);

  useEffect(() => {
    setSsid('');
    setPassword('');
    setPasswordVisible(false);
    setFormError(null);
    setCancelRequested(false);
    setFlow(gateway.create({ scenario }));
  }, [gateway]);

  const dispatch = (event: ProvisioningGatewayEvent, expectedPhase?: ProvisioningPresentationPhase) => setFlow((current) => {
    const currentPhase = gateway.present(current).phase;
    if (expectedPhase && currentPhase !== expectedPhase) return current;
    if (TERMINAL.has(currentPhase)) return current;
    return gateway.transition(current, event);
  });

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      setAppActive(active);
      if (active) return;
      setSsid('');
      setPassword('');
      setPasswordVisible(false);
      setCancelRequested(false);
      setFlow((current) => {
        const currentPhase = gateway.present(current).phase;
        if (currentPhase === 'ready' || TERMINAL.has(currentPhase)) return current;
        return gateway.transition(current, { type: 'expire' });
      });
    });
    return () => subscription.remove();
  }, [gateway]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!appActive) return;
    if (!presentation.available || TERMINAL.has(presentation.phase) || presentation.phase === 'ready' || presentation.phase === 'wifi_form') return;
    if (presentation.phase === 'connecting' && presentation.connectionInterrupted) return;

    const nextEvent: ProvisioningGatewayEvent | null = presentation.phase === 'discovering'
      ? { type: 'robot_discovered' }
      : presentation.phase === 'authenticating'
        ? { type: 'device_authenticated' }
        : presentation.phase === 'secure_channel_ready'
          ? { type: 'credentials_sent' }
          : presentation.phase === 'connecting'
            ? flow.scenario === 'success' || presentation.connectionRecovered ? { type: 'network_connected' } : { type: 'advance_scenario' }
            : presentation.phase === 'awaiting_confirmation'
              ? { type: 'cloud_confirmed' }
              : null;
    const expectedPhase = presentation.phase;
    if (nextEvent) timerRef.current = setTimeout(() => dispatch(nextEvent, expectedPhase), 850);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [appActive, flow, gateway, presentation]);

  const chooseScenario = (value: ProvisioningDemoScenario) => {
    if (presentation.phase !== 'ready') return;
    setScenario(value);
    setFlow(gateway.create({ scenario: value }));
  };

  const submitWifi = () => {
    if (!appActive) return;
    const networkName = ssid.trim();
    if (!networkName || !password) {
      setFormError('请输入 Wi-Fi 名称和密码。');
      return;
    }
    setFormError(null);
    dispatch({ type: 'wifi_submitted', ssid: networkName, hasPassword: true }, 'wifi_form');
    setSsid('');
    setPassword('');
    setPasswordVisible(false);
  };

  const reset = () => {
    setSsid('');
    setPassword('');
    setCancelRequested(false);
    setFormError(null);
    setFlow(gateway.create({ scenario }));
  };

  const cancelFlow = () => {
    setSsid('');
    setPassword('');
    setPasswordVisible(false);
    setCancelRequested(false);
    dispatch({ type: 'cancel' }, presentation.phase);
  };

  const leaveScreen = () => {
    setSsid('');
    setPassword('');
    setPasswordVisible(false);
    onBack();
  };

  const running = !TERMINAL.has(presentation.phase) && presentation.phase !== 'ready';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <ScrollView contentContainerStyle={[styles.content, isCompact && styles.compactContent]} keyboardShouldPersistTaps="handled">
          <View style={[styles.layout, isLandscape && styles.landscapeLayout]}>
            <View style={styles.introPane}>
              <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={leaveScreen} style={styles.back}>
                <Ionicons color={colors.ink} name="chevron-back" size={22} />
              </Pressable>

              <View style={styles.demoBanner}>
                <Ionicons color={colors.dangerText} name="flask-outline" size={20} />
                <View style={styles.bannerCopy}>
                  <Text style={styles.demoTitle}>开发演示</Text>
                  <Text style={styles.demoText}>此流程不会连接蓝牙，也不会发送真实 Wi-Fi 密码。</Text>
                </View>
              </View>

              <Text style={styles.eyebrow}>DOSO SECURE PROVISIONING</Text>
              <Text style={[styles.title, isCompact && styles.compactTitle]}>安全配网</Text>
              <Text style={styles.subtitle}>为 {deviceName} 验证身份，再通过临时安全通道演示凭据发送，最后等待云端在线确认。</Text>
            </View>

            <View style={styles.flowPane}>
              {!presentation.available ? (
          <View style={styles.blockedCard}>
            <Ionicons color={colors.muted} name="hardware-chip-outline" size={26} />
            <Text style={styles.blockedTitle}>硬件连接尚未开放</Text>
            <Text style={styles.blockedText}>当前版本不能连接真实机器人，也不会进入模拟成功路径。</Text>
          </View>
        ) : (
          <>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: PHASE_PROGRESS[presentation.phase] ?? 0, text: PHASE_LABELS[presentation.phase] ?? presentation.phase }}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>当前阶段</Text>
              <Text accessibilityLiveRegion="polite" style={styles.phase}>{PHASE_LABELS[presentation.phase] ?? presentation.phase}</Text>
              {presentation.maskedNetworkName ? <Text style={styles.network}>目标网络：{presentation.maskedNetworkName}</Text> : null}
              {presentation.resultMessage ? <Text accessibilityLiveRegion="polite" style={styles.result}>{presentation.resultMessage}</Text> : null}
            </View>

            {presentation.phase === 'ready' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>开始前准备</Text>
                <View style={styles.checklist}>
                  {['机器人已开机', '手机蓝牙已打开', 'Wi-Fi 可用'].map((item) => (
                    <View key={item} style={styles.checkItem}>
                      <Ionicons color={p.blueInk} name="checkmark-circle" size={20} />
                      <Text style={styles.checkText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.sectionTitle}>选择演示结果</Text>
                <View style={styles.scenarios}>
                  {SCENARIOS.map((item) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: scenario === item.value }}
                      key={item.value}
                      onPress={() => chooseScenario(item.value)}
                      style={[styles.scenario, scenario === item.value && styles.scenarioActive]}
                    >
                      {scenario === item.value ? <Ionicons color={p.actionInk} name="checkmark" size={14} /> : null}
                      <Text style={[styles.scenarioText, scenario === item.value && styles.scenarioTextActive]}>{item.label}{scenario === item.value ? '（已选择）' : ''}</Text>
                    </Pressable>
                  ))}
                </View>
                <GradientButton label="开始发现机器人" onPress={() => dispatch({ type: 'start' }, 'ready')} />
              </View>
            ) : null}

            {presentation.phase === 'discovering' ? (
              <View style={styles.scanningCard}>
                <Ionicons color={p.blueInk} name="search-outline" size={22} />
                <Text style={styles.scanningText}>正在查找附近的 DOSO 机器人…</Text>
              </View>
            ) : null}

            {presentation.phase === 'wifi_form' ? (
              <View style={styles.deviceCard}>
                <View style={styles.deviceIcon}><Ionicons color={p.blueInk} name="hardware-chip-outline" size={24} /></View>
                <View style={styles.deviceCopy}>
                  <Text style={styles.deviceFound}>模拟发现</Text>
                  <Text style={styles.deviceName}>{deviceName}</Text>
                  <Text style={styles.deviceMeta}>型号：DOSO Robot Demo，序列号尾号：0001</Text>
                  <Text style={styles.deviceSignal}>信号提示：良好（模拟 -52 dBm）</Text>
                </View>
              </View>
            ) : null}

            {presentation.phase === 'wifi_form' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Wi-Fi 信息</Text>
                <Text style={styles.inputLabel}>Wi-Fi 名称</Text>
                <TextInput
                  accessibilityLabel="Wi-Fi 名称"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => { setSsid(value); setFormError(null); }}
                  placeholder="Wi-Fi 名称"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={ssid}
                />
                <Text style={styles.inputLabel}>Wi-Fi 密码</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    accessibilityLabel="Wi-Fi 密码"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(value) => { setPassword(value); setFormError(null); }}
                    onSubmitEditing={submitWifi}
                    placeholder="Wi-Fi 密码（仅临时保存在本页）"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!passwordVisible}
                    style={styles.passwordInput}
                    value={password}
                  />
                  <Pressable accessibilityLabel={passwordVisible ? '隐藏 Wi-Fi 密码' : '显示 Wi-Fi 密码'} accessibilityRole="button" onPress={() => setPasswordVisible((visible) => !visible)} style={styles.eyeButton}>
                    <Ionicons color={colors.muted} name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={21} />
                  </Pressable>
                </View>
                {formError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text> : null}
                <GradientButton label="验证身份并安全发送" onPress={submitWifi} />
              </View>
            ) : null}

            {presentation.phase === 'connecting' && presentation.connectionInterrupted ? (
              <GradientButton label="恢复模拟连接" onPress={() => dispatch({ type: 'resume_connection' }, 'connecting')} />
            ) : null}

            {running ? (
              cancelRequested ? (
                <View style={styles.cancelConfirm}>
                  <Text style={styles.cancelText}>{presentation.credentialsSubmitted
                    ? '确认取消本次模拟配网？本演示未发送真实密码；真机阶段，机器人可能仍在尝试联网。'
                    : '确认取消本次模拟配网？未发送真实 Wi-Fi 密码，结果会保留在本页。'}</Text>
                  <View style={styles.cancelActions}>
                    <Pressable accessibilityRole="button" onPress={() => setCancelRequested(false)} style={styles.actionTarget}><Text style={styles.keepText}>继续配网</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={cancelFlow} style={styles.actionTarget}><Text style={styles.cancelTextButton}>确认取消</Text></Pressable>
                  </View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setCancelRequested(true)} style={styles.cancelButton}>
                  <Text style={styles.cancelTextButton}>取消配网</Text>
                </Pressable>
              )
            ) : null}

            {TERMINAL.has(presentation.phase) ? <GradientButton label="重新演示" onPress={reset} variant="dark" /> : null}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingBottom: 40, paddingHorizontal: 24, paddingTop: 22 },
  compactContent: { paddingHorizontal: 16 },
  layout: { flex: 1, gap: 16 },
  landscapeLayout: { flexDirection: 'row', gap: 20, marginHorizontal: 'auto', maxWidth: 1040, width: '100%' },
  introPane: { flex: 0.9, gap: 16, minWidth: 0 },
  flowPane: { flex: 1.1, gap: 16, minWidth: 0 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  demoBanner: { alignItems: 'flex-start', backgroundColor: colors.dangerSurface, borderRadius: radii.md, flexDirection: 'row', gap: 10, padding: 14 },
  bannerCopy: { flex: 1 },
  demoTitle: { ...typography.label, color: colors.dangerText },
  demoText: { ...typography.supporting, color: p.secondary, marginTop: 3 },
  eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 10 },
  title: { ...typography.compactTitle, color: p.ink },
  compactTitle: { ...typography.compactTitle },
  subtitle: { ...typography.supporting, color: p.secondary },
  card: { backgroundColor: p.surface, borderRadius: cardLayout.radius, padding: cardLayout.inset },
  cardLabel: { ...typography.supporting, color: p.secondary },
  phase: { ...typography.compactTitle, color: p.ink, marginTop: 6 },
  network: { ...typography.supporting, color: p.secondary, marginTop: 8 },
  result: { ...typography.supporting, color: p.blueInk, marginTop: 10 },
  section: { backgroundColor: p.surface, borderRadius: cardLayout.radius, gap: cardLayout.gap, padding: cardLayout.inset },
  sectionTitle: { ...typography.label, color: p.ink },
  checklist: { gap: 8 },
  checkItem: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 32 },
  checkText: { ...typography.supporting, color: p.secondary },
  scenarios: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenario: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: radii.pill, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  scenarioActive: { backgroundColor: p.action },
  scenarioText: { ...typography.supporting, color: p.secondary },
  scenarioTextActive: { color: p.actionInk },
  deviceCard: { alignItems: 'center', backgroundColor: p.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: cardLayout.gap, padding: cardLayout.inset },
  scanningCard: { alignItems: 'center', backgroundColor: p.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: cardLayout.inset },
  scanningText: { ...typography.supporting, color: p.secondary },
  deviceIcon: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  deviceCopy: { flex: 1 },
  deviceFound: { ...typography.supporting, color: p.secondary },
  deviceName: { ...typography.label, color: p.ink, marginTop: 2 },
  deviceMeta: { ...typography.supporting, color: p.secondary, marginTop: 3 },
  deviceSignal: { ...typography.supporting, color: p.secondary, marginTop: 2 },
  inputLabel: { ...typography.label, color: p.ink },
  input: { ...typography.label, backgroundColor: p.canvas, borderRadius: 16, color: p.ink, minHeight: 52, paddingHorizontal: 16 },
  passwordRow: { alignItems: 'center', backgroundColor: p.canvas, borderRadius: 16, flexDirection: 'row' },
  passwordInput: { ...typography.label, color: p.ink, flex: 1, minHeight: 52, paddingLeft: 16 },
  eyeButton: { alignItems: 'center', height: 52, justifyContent: 'center', width: 52 },
  error: { ...typography.supporting, color: colors.dangerText },
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  cancelConfirm: { backgroundColor: colors.dangerSurface, borderRadius: radii.md, gap: 12, padding: 16 },
  cancelText: { ...typography.supporting, color: p.secondary },
  cancelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  actionTarget: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  keepText: { ...typography.label, color: p.blueInk },
  cancelTextButton: { ...typography.label, color: colors.dangerText },
  blockedCard: { alignItems: 'center', backgroundColor: p.surface, borderRadius: cardLayout.radius, gap: cardLayout.gap, marginTop: 12, padding: cardLayout.inset },
  blockedTitle: { ...typography.label, color: p.ink },
  blockedText: { ...typography.supporting, color: p.secondary, textAlign: 'center' },
  });
};
