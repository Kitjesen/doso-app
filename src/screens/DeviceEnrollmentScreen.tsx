import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { Text } from '../components/AppText';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { type DeviceEnrollmentPhase, type DeviceEnrollmentSession } from '../services/deviceEnrollmentService';
import { type ThemeColors, useAppTheme } from '../theme';

type Props = {
  busy?: boolean;
  deviceName: string;
  serialNumber?: string | null;
  enrollment?: DeviceEnrollmentSession | null;
  error?: string | null;
  onBack: () => void;
  onStart: () => void;
};

const PHASE_COPY: Record<DeviceEnrollmentPhase, { title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = {
  challenge_issued: {
    title: '等待机器狗身份证明',
    detail: '云端挑战已创建。下一步需要通过真实 BLE/GATT 或 Brainstem 设备通道读取并验证制造身份。',
    icon: 'time-outline',
  },
  identity_verified: {
    title: '设备身份已验证',
    detail: '设备身份已通过验证，仍需设备在线确认后才算完成可信接入。',
    icon: 'shield-checkmark-outline',
  },
  completed: {
    title: '可信接入已完成',
    detail: '设备身份和在线状态均已由服务端确认。控制能力仍需独立通过相应安全门禁。',
    icon: 'checkmark-circle-outline',
  },
  invalidated: {
    title: '挑战已失效',
    detail: '设备权限、会话或恢复出厂状态发生变化，请重新发起身份验证。',
    icon: 'alert-circle-outline',
  },
  expired: {
    title: '挑战已过期',
    detail: '本次挑战已超过有效期，请重新发起身份验证。',
    icon: 'timer-outline',
  },
};

export function DeviceEnrollmentScreen({ busy = false, deviceName, serialNumber, enrollment, error, onBack, onStart }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const styles = createStyles(colors, isDark);
  const phase = enrollment?.phase ?? null;
  const copy = phase ? PHASE_COPY[phase] : null;
  const actionLabel = phase === 'challenge_issued' || phase === 'identity_verified'
    ? '重新读取设备状态'
    : '发起身份验证挑战';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Ionicons color={colors.ink} name="chevron-back" size={22} />
        </Pressable>

        <View style={styles.icon}><Ionicons color={p.blueInk} name="shield-checkmark-outline" size={27} /></View>
        <Text style={styles.eyebrow}>DOSO TRUSTED ENROLLMENT</Text>
        <Text style={styles.title}>设备身份验证</Text>
        <Text style={styles.subtitle}>这一步把“账户归属”与“真实机器狗身份”分开确认，避免仅凭序列号就开放控制。</Text>

        <View style={styles.deviceCard}>
          <View style={styles.deviceIcon}><Ionicons color={p.blueInk} name="hardware-chip-outline" size={22} /></View>
          <View style={styles.deviceCopy}>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <Text style={styles.deviceMeta}>序列号：{serialNumber?.trim() || '待同步'}</Text>
            <Text style={styles.deviceMeta}>账户绑定：已完成，设备身份：{phase === 'completed' ? '已验证' : '待验证'}</Text>
          </View>
        </View>

        <View style={[styles.statusCard, copy && styles.statusCardActive]}>
          <Ionicons color={copy ? p.blueInk : colors.muted} name={copy?.icon ?? 'lock-closed-outline'} size={22} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{copy?.title ?? '尚未发起设备身份验证'}</Text>
            <Text style={styles.statusDetail}>{copy?.detail ?? '发起一次性挑战后，DOSO 才会等待机器狗提供签名身份证明。挑战只保存在当前内存会话中。'}</Text>
          </View>
        </View>

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        <GradientButton disabled={busy} loading={busy} label={busy ? '正在建立安全挑战…' : actionLabel} onPress={onStart} variant="auth" />
        <View style={styles.boundaryCard}>
          <Ionicons color={p.blueInk} name="information-circle-outline" size={18} />
          <Text style={styles.boundaryText}>当前版本不会在此页面发送 Wi-Fi 密码、运动指令或电机命令；没有设备签名时不会显示“验证完成”。</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
    safe: { backgroundColor: colors.background, flex: 1 },
    content: { flexGrow: 1, gap: 16, paddingBottom: 36, paddingHorizontal: 24, paddingTop: 22 },
    back: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
    icon: { alignItems: 'center', backgroundColor: p.surface, borderRadius: 24, height: 48, justifyContent: 'center', marginTop: 2, width: 48 },
    eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 2 },
    title: { ...typography.compactTitle, color: p.ink, marginTop: -6 },
    subtitle: { ...typography.supporting, color: p.secondary, lineHeight: 21, marginBottom: 4 },
    deviceCard: { alignItems: 'center', backgroundColor: p.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: 12, padding: cardLayout.inset },
    deviceIcon: { alignItems: 'center', backgroundColor: p.canvas, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    deviceCopy: { flex: 1, minWidth: 0 },
    deviceName: { ...typography.label, color: p.ink },
    deviceMeta: { ...typography.supporting, color: p.secondary, marginTop: 3 },
    statusCard: { alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: cardLayout.radius, flexDirection: 'row', gap: 12, padding: cardLayout.inset },
    statusCardActive: { backgroundColor: p.surface },
    statusCopy: { flex: 1, minWidth: 0 },
    statusTitle: { ...typography.label, color: p.ink },
    statusDetail: { ...typography.supporting, color: p.secondary, lineHeight: 21, marginTop: 4 },
    error: { backgroundColor: colors.dangerSurface, borderRadius: 12, color: colors.dangerText, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 },
    boundaryCard: { alignItems: 'flex-start', backgroundColor: 'transparent', flexDirection: 'row', gap: 8, paddingTop: 2 },
    boundaryText: { ...typography.supporting, color: p.secondary, flex: 1 },
  });
}
