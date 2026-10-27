import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import {
  FIRMWARE_PHASE_LABELS,
  type FirmwareUpdateGateway,
  type FirmwareUpdateGatewayState,
  type FirmwareOutcome,
} from '../features/robot-lifecycle/firmwareUpdateGateway';
import { radii, type ThemeColors, useAppTheme } from '../theme';

type Props = {
  batteryPercent?: number;
  currentVersion?: string;
  deviceName: string;
  gateway: FirmwareUpdateGateway;
  online?: boolean;
  onBack: () => void;
  taskRunning?: boolean;
};

const outcomes: { label: string; value: FirmwareOutcome }[] = [
  { label: '成功', value: 'succeeded' },
  { label: '自动回滚', value: 'rolled_back' },
  { label: '人工恢复', value: 'recovery_required' },
];

export function FirmwareUpdateScreen({ batteryPercent = 82, currentVersion = '0.0.1', deviceName, gateway, online = true, onBack, taskRunning = false }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { height, width } = useWindowDimensions();
  const isLandscape = width >= 700 && width > height;
  const isCompact = width < 360;
  const styles = createStyles(colors, isDark);
  const [state, setState] = useState<FirmwareUpdateGatewayState>(() => gateway.create({
    batteryPercent,
    currentVersion,
    online,
    scenario: 'succeeded',
    taskRunning,
  }));
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const gatewayRef = useRef(gateway);
  const outcome = state.scenario;

  useEffect(() => {
    const gatewayChanged = gatewayRef.current !== gateway;
    gatewayRef.current = gateway;
    setState((current) => {
      if (!gatewayChanged) {
        const currentView = gateway.present(current);
        if (currentView.status === 'running') return current;
      }
      return gateway.create({
        batteryPercent,
        currentVersion,
        online,
        scenario: current.scenario,
        taskRunning,
      });
    });
  }, [batteryPercent, currentVersion, gateway, online, taskRunning]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const presentation = gateway.present(state);

  useEffect(() => {
    if (!appActive || presentation.status !== 'running') return undefined;
    const expectedPhase = state.domain?.phase;
    const timer = setTimeout(() => {
      setState((current) => {
        const currentView = gateway.present(current);
        if (currentView.status !== 'running' || current.domain?.phase !== expectedPhase) return current;
        return gateway.advance(current);
      });
    }, 850);
    return () => clearTimeout(timer);
  }, [appActive, gateway, presentation.status, state]);

  const start = () => {
    setState((current) => {
      const currentView = gateway.present(current);
      if (currentView.status !== 'ready' || !currentView.eligibility.eligible) return current;
      return gateway.start(current);
    });
  };
  const cancel = () => {
    setState((current) => {
      const currentView = gateway.present(current);
      const currentPhase = current.domain?.phase;
      if (currentView.status !== 'running' || (currentPhase !== 'scheduled' && currentPhase !== 'downloading')) return current;
      return gateway.cancel(current);
    });
  };
  const chooseOutcome = (nextOutcome: FirmwareOutcome) => {
    setState(gateway.create({ batteryPercent, currentVersion, online, scenario: nextOutcome, taskRunning }));
  };
  const reset = () => setState(gateway.create({ batteryPercent, currentVersion, online, scenario: outcome, taskRunning }));
  const progress = presentation.progress;
  const phase = presentation.phase;
  const cancellable = presentation.status === 'running' && (phase === 'scheduled' || phase === 'downloading');
  const terminal = ['succeeded', 'rolled_back', 'recovery_required', 'cancelled', 'failed'].includes(presentation.status);
  const irreversibleMessage = phase === 'verifying'
    ? '正在校验更新包，已不能取消；固件安装尚未开始。'
    : '固件安装或恢复流程已经开始，不能取消；请勿关闭机器人电源，并等待运行检查结束。';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, isCompact && styles.compactContent]} showsVerticalScrollIndicator={false}>
        <View style={[styles.layout, isLandscape && styles.landscapeLayout]}>
          <View style={styles.introPane}>
            <View style={styles.topBar}>
          <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={styles.iconButton}>
            <Ionicons color={colors.ink} name="chevron-back" size={22} />
          </Pressable>
          <Text style={styles.topTitle}>固件更新</Text>
          <View style={styles.iconButton} />
            </View>

        <View style={styles.demoBanner}>
          <Ionicons color={colors.dangerText} name="flask-outline" size={19} />
          <View style={styles.flex}>
            <Text style={styles.demoTitle}>开发演示</Text>
            <Text style={styles.demoText}>此页面只演示 OTA 流程，不会更新真实机器人。</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>DOSO OTA PREVIEW</Text>
        <Text style={[styles.title, isCompact && styles.compactTitle]}>安全更新 {deviceName}</Text>
        <Text style={styles.subtitle}>更新包会先校验，再写入备用分区；安装、重启和恢复阶段请勿关闭机器人电源。</Text>
          </View>

          <View style={styles.flowPane}>
            {presentation.status === 'hardware_unavailable' ? (
          <View style={styles.blockedCard}>
            <Ionicons color={colors.muted} name="hardware-chip-outline" size={28} />
            <Text style={styles.cardTitle}>硬件连接尚未开放</Text>
            <Text style={styles.cardBody}>当前客户端没有连接真实机器人，因此不能启动真实 OTA，也不会显示模拟成功。</Text>
          </View>
        ) : (
          <>
            <View style={styles.versionCard}>
              <View><Text style={styles.metaLabel}>当前版本</Text><Text style={styles.version}>{presentation.currentVersion}</Text></View>
              <Ionicons color={p.blueInk} name="arrow-forward" size={24} />
              <View><Text style={styles.metaLabel}>目标版本</Text><Text style={styles.version}>{presentation.targetVersion}</Text></View>
            </View>

            <View style={styles.detailsCard}>
              <Text style={styles.cardTitle}>版本说明</Text>
              <Text style={styles.cardBody}>首个 OTA 演示版本：展示资格门槛、下载校验、安装重启、健康检查与回滚结果。</Text>
              <View style={styles.detailRow}><Text style={styles.metaLabel}>更新包大小</Text><Text style={styles.detailValue}>18.6 MB</Text></View>
              <View style={styles.detailRow}><Text style={styles.metaLabel}>预计时长</Text><Text style={styles.detailValue}>约 4–6 分钟</Text></View>
            </View>

            <View style={styles.detailsCard}>
              <Text style={styles.cardTitle}>更新资格</Text>
              {presentation.eligibility.checks.map((check) => (
                <View key={check.key} style={styles.checkRow}>
                  <Ionicons color={check.passed ? colors.successText : colors.dangerText} name={check.passed ? 'checkmark-circle' : 'close-circle'} size={20} />
                  <View style={styles.flex}>
                    <Text style={styles.checkLabel}>{check.label}</Text>
                    {!check.passed ? <Text style={styles.checkAction}>{check.action}</Text> : null}
                  </View>
                </View>
              ))}
            </View>

            {presentation.status === 'ready' ? (
              <View style={styles.detailsCard}>
                <Text style={styles.cardTitle}>选择演示结果</Text>
                <View style={styles.outcomes}>
                  {outcomes.map((item) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: outcome === item.value }}
                      key={item.value}
                      onPress={() => chooseOutcome(item.value)}
                      style={[styles.outcome, outcome === item.value && styles.outcomeActive]}
                    >
                      {outcome === item.value ? <Ionicons color={p.actionInk} name="checkmark" size={14} /> : null}
                      <Text style={[styles.outcomeText, outcome === item.value && styles.outcomeTextActive]}>{item.label}{outcome === item.value ? '（已选择）' : ''}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View accessibilityLiveRegion={presentation.status === 'recovery_required' ? 'assertive' : 'polite'} style={styles.statusCard}>
              <Text style={styles.metaLabel}>当前阶段</Text>
              <Text style={styles.phase}>{phase ? FIRMWARE_PHASE_LABELS[phase] : '硬件连接尚未开放'}</Text>
              <Text style={styles.cardBody}>{presentation.message}</Text>
              {progress.percent !== null ? (
                <View
                  accessibilityLabel="固件下载进度"
                  accessibilityRole="progressbar"
                  accessibilityValue={{ max: 100, min: 0, now: progress.percent }}
                  style={styles.progressTrack}
                >
                  <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
                </View>
              ) : null}
              <Text style={styles.progressText}>{progress.label}</Text>
              {presentation.status === 'recovery_required' && presentation.diagnosticCode ? (
                <Text style={styles.diagnostic}>诊断编号：{presentation.diagnosticCode}</Text>
              ) : null}
            </View>

            {presentation.status === 'ready' ? <GradientButton disabled={!presentation.eligibility.eligible} label="开始演示更新" onPress={start} /> : null}
            {cancellable ? <GradientButton label="取消更新" onPress={cancel} variant="dark" /> : null}
            {presentation.status === 'running' && !cancellable ? <Text style={styles.locked}>{irreversibleMessage}</Text> : null}
            {terminal ? <GradientButton label="重新演示" onPress={reset} /> : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 36 },
  compactContent: { paddingHorizontal: 16 },
  layout: { flex: 1, gap: 16 },
  landscapeLayout: { flexDirection: 'row', gap: 20, marginHorizontal: 'auto', maxWidth: 1040, width: '100%' },
  introPane: { flex: 0.9, minWidth: 0 },
  flowPane: { flex: 1.1, minWidth: 0 },
  flex: { flex: 1 },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { ...typography.label, color: p.ink },
  iconButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  demoBanner: { flexDirection: 'row', gap: 10, borderRadius: radii.md, backgroundColor: colors.dangerSurface, padding: 14, marginTop: 8 },
  demoTitle: { ...typography.label, color: colors.dangerText },
  demoText: { ...typography.supporting, color: colors.dangerText, marginTop: 2 },
  eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 20 },
  title: { ...typography.compactTitle, color: p.ink, marginTop: 7 },
  compactTitle: { ...typography.compactTitle },
  subtitle: { ...typography.supporting, color: p.secondary, marginTop: 9 },
  versionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: cardLayout.radius, backgroundColor: p.surface, padding: cardLayout.inset, marginTop: 20 },
  metaLabel: { ...typography.supporting, color: p.secondary },
  version: { ...typography.compactTitle, color: p.ink, marginTop: 5 },
  detailsCard: { borderRadius: cardLayout.radius, backgroundColor: p.surface, padding: cardLayout.inset, marginTop: cardLayout.gap, gap: cardLayout.gap },
  blockedCard: { alignItems: 'center', borderRadius: cardLayout.radius, backgroundColor: p.surface, padding: cardLayout.inset, marginTop: 24, gap: cardLayout.gap },
  cardTitle: { ...typography.label, color: p.ink },
  cardBody: { ...typography.supporting, color: p.secondary },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5 },
  detailValue: { ...typography.supporting, color: p.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkLabel: { ...typography.supporting, color: p.secondary },
  checkAction: { ...typography.supporting, color: colors.dangerText, marginTop: 2 },
  outcomes: { flexDirection: 'row', gap: 7 },
  outcome: { flex: 1, minWidth: 44, minHeight: 44, borderRadius: radii.pill, alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center', backgroundColor: 'transparent' },
  outcomeActive: { backgroundColor: p.action },
  outcomeText: { ...typography.supporting, color: p.secondary },
  outcomeTextActive: { color: p.actionInk },
  statusCard: { borderRadius: cardLayout.radius, backgroundColor: p.surface, padding: cardLayout.inset, marginVertical: cardLayout.gap },
  phase: { ...typography.compactTitle, color: p.ink, marginTop: 5 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: p.canvas, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: p.action },
  progressText: { ...typography.supporting, color: p.secondary, marginTop: 7 },
  diagnostic: { ...typography.supporting, color: colors.dangerText, marginTop: 10 },
  locked: { ...typography.supporting, color: p.secondary, textAlign: 'center', marginVertical: 10 },
  });
};
