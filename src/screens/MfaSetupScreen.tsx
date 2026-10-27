import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { useAuthEntryPalette } from '../components/AuthEntry';
import { cardLayout } from '../appearance';
import {
  cancelUnverifiedTotpEnrollment,
  enrollTotp,
  getMfaStatus,
  MfaCleanupIdentityError,
  verifyTotpFactor,
  verifyTotpEnrollment,
  type MfaStatus,
  type TotpEnrollment,
} from '../services/mfaService';
import { radii } from '../theme';
import { getSecurityPageLayout } from './securityPageLayout';
import { isAuthSessionOperationBusyError } from '../services/authSessionOperation';
import type { AuthSessionIdentity } from '../services/authSessionIdentity';

export type MfaVerificationInput = { factorId: string; code: string; kind: 'enrollment' | 'step-up'; onAccepted?: () => void };

type Props = {
  expectedIdentity?: AuthSessionIdentity | null;
  onBack?: () => void;
  onBackRequestChange?: (request: (() => void) | null) => void;
  onBusyChange?: (busy: boolean) => void;
  onVerify?: (input: MfaVerificationInput) => Promise<MfaStatus>;
  onCompleted?: (completion: { kind: 'enrollment' | 'step-up'; status: MfaStatus }) => void | Promise<void>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '暂时无法配置双重验证，请稍后重试。';
}

function assuranceLabel(level: MfaStatus['currentLevel']) {
  if (level === 'aal2') return 'AAL2（已完成双重验证）';
  if (level === 'aal1') return 'AAL1（当前会话尚未完成第二重验证）';
  return '会话安全级别未知';
}

export function MfaSetupScreen({ expectedIdentity, onBack, onBackRequestChange, onBusyChange, onCompleted, onVerify }: Props) {
  const colors = useAuthEntryPalette();
  const { isDark } = colors;
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(
    () => getSecurityPageLayout({
      containerHeight: height,
      containerWidth: width,
      insetLeft: insets.left,
      insetRight: insets.right,
    }),
    [height, insets.left, insets.right, width],
  );
  const styles = useMemo(() => createStyles(colors, isDark, layout), [colors, isDark, layout]);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingFactorId = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const verificationInFlightRef = useRef(false);
  const cleanupInFlightRef = useRef(false);
  // The screen is identity-keyed by App. Copy only the non-secret identity;
  // late/unmount cleanup carries its original identity into the service checks.
  const cleanupIdentity = useMemo(() => expectedIdentity ? {
    userId: expectedIdentity.userId, sessionId: expectedIdentity.sessionId,
  } : null, [expectedIdentity?.userId, expectedIdentity?.sessionId]);
  const busy = loading || submitting || canceling;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const discardPendingEnrollment = useCallback(async () => {
    const factorId = pendingFactorId.current;
    if (!factorId) return;
    await cancelUnverifiedTotpEnrollment(factorId, cleanupIdentity);
    if (pendingFactorId.current === factorId) pendingFactorId.current = null;
  }, [cleanupIdentity]);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    const generation = ++loadGeneration.current;
    const isCurrent = () => mountedRef.current && generation === loadGeneration.current;
    setLoading(true);
    setError(null);
    setCode('');

    try {
      if (!cleanupIdentity) throw new MfaCleanupIdentityError();
      await discardPendingEnrollment();
      if (!isCurrent()) return;
      const nextStatus = await getMfaStatus();
      if (!isCurrent()) return;

      setStatus(nextStatus);
      if (nextStatus.enabled) {
        setEnrollment(null);
        return;
      }

      for (const staleFactorId of nextStatus.unverifiedTotpFactorIds) {
        if (!isCurrent()) return;
        await cancelUnverifiedTotpEnrollment(staleFactorId, cleanupIdentity);
        if (!isCurrent()) return;
      }

      if (!isCurrent()) return;
      const nextEnrollment = await enrollTotp(cleanupIdentity, isCurrent);
      if (!isCurrent()) {
        await cancelUnverifiedTotpEnrollment(nextEnrollment.factorId, cleanupIdentity);
        return;
      }

      pendingFactorId.current = nextEnrollment.factorId;
      setEnrollment(nextEnrollment);
    } catch (loadError) {
      if (isCurrent()) setError(errorMessage(loadError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [cleanupIdentity, discardPendingEnrollment]);

  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
      const factorId = pendingFactorId.current;
      pendingFactorId.current = null;
      if (factorId) void cancelUnverifiedTotpEnrollment(factorId, cleanupIdentity).catch(() => undefined);
    };
  }, [cleanupIdentity, load]);

  const goBack = useCallback(async () => {
    if (busy || cleanupInFlightRef.current) return;
    cleanupInFlightRef.current = true;
    const operationGeneration = ++operationGenerationRef.current;
    setCanceling(true);
    try {
      await discardPendingEnrollment();
      if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      onBack?.();
    } catch (cleanupError) {
      if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      setError(`无法安全取消未完成的验证器设置：${errorMessage(cleanupError)}`);
    } finally {
      cleanupInFlightRef.current = false;
      if (mountedRef.current && operationGenerationRef.current === operationGeneration) setCanceling(false);
    }
  }, [busy, discardPendingEnrollment, onBack]);

  useEffect(() => {
    const request = () => void goBack();
    onBackRequestChange?.(request);
    return () => onBackRequestChange?.(null);
  }, [goBack, onBackRequestChange]);

  const verify = async () => {
    const existingFactor = status?.verifiedTotpFactors[0];
    const factorId = enrollment?.factorId ?? existingFactor?.id;
    if (!mountedRef.current || verificationInFlightRef.current || !factorId || busy || !/^\d{6}$/.test(code)) return;
    const completionKind = enrollment ? 'enrollment' : 'step-up';
    const operationGeneration = ++operationGenerationRef.current;
    verificationInFlightRef.current = true;
    // Verification now owns this factor. Auth restoration may unmount us;
    // cleanup must not race its challenge with an unenroll request.
    if (enrollment && !onVerify) pendingFactorId.current = null;
    setSubmitting(true);
    setError(null);
    try {
      const nextStatus = onVerify
        ? await onVerify({ factorId, code, kind: completionKind, onAccepted: () => {
          if (mountedRef.current && operationGenerationRef.current === operationGeneration && enrollment) pendingFactorId.current = null;
        } })
        : enrollment ? await verifyTotpEnrollment(factorId, code) : await verifyTotpFactor(factorId, code);
      if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      if (enrollment) pendingFactorId.current = null;
      setEnrollment(null);
      setStatus(nextStatus);
      setCode('');
      await onCompleted?.({ kind: completionKind, status: nextStatus });
    } catch (verifyError) {
      if (mountedRef.current && operationGenerationRef.current === operationGeneration) {
        // A mounted standalone screen still owns failed setup. Managed App
        // attempts retain ownership; a fresh mount re-reads their real status.
        if (enrollment && (!onVerify || isAuthSessionOperationBusyError(verifyError))) pendingFactorId.current = factorId;
        setError(errorMessage(verifyError));
      }
    } finally {
      verificationInFlightRef.current = false;
      if (mountedRef.current && operationGenerationRef.current === operationGeneration) {
        setSubmitting(false);
      }
    }
  };

  const enabled = status?.enabled ?? false;
  const needsStepUp = status?.enabled === true && status.currentLevel === 'aal1' && Boolean(status.verifiedTotpFactors[0]);
  const completed = status?.enabled === true && status.currentLevel === 'aal2';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityLabel="返回" accessibilityRole="button" disabled={busy} hitSlop={10} onPress={() => void goBack()} style={styles.backButton}>
              <Ionicons color={colors.ink} name="arrow-back" size={22} />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <Text style={styles.title}>管理员双重验证</Text>
            <Text style={styles.subtitle}>为 DOSO 管理端准备 TOTP AAL2 验证</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>正在读取账户安全状态…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View accessibilityLiveRegion="polite" style={styles.errorCard}>
            <Ionicons color={colors.dangerText} name="alert-circle-outline" size={20} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !enrollment && !enabled ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        ) : null}

        {!loading && completed && status ? (
          <View style={styles.enabledCard}>
            <View style={styles.enabledIcon}>
              <Ionicons color={colors.successText} name="shield-checkmark" size={32} />
            </View>
            <Text style={styles.enabledTitle}>管理员 TOTP 已启用</Text>
            <Text style={styles.enabledStatus}>{assuranceLabel(status.currentLevel)}</Text>
            <Text style={styles.enabledText}>
              这个身份验证器用于进入 DOSO 管理端和执行管理员敏感操作。普通 App 登录目前仍使用邮箱、密码与登录终端访问控制。为防止账户被误锁定，此页面不提供快捷删除。
            </Text>
          </View>
        ) : null}

        {!loading && needsStepUp && status ? (
          <View style={styles.enabledCard}>
            <View style={styles.enabledIcon}>
              <Ionicons color={colors.successText} name="shield-checkmark-outline" size={32} />
            </View>
            <Text style={styles.enabledTitle}>管理员 TOTP 已启用</Text>
            <Text style={styles.enabledStatus}>{assuranceLabel(status.currentLevel)}</Text>
            <Text style={styles.enabledText}>输入身份验证器当前显示的动态码，将本次会话提升为 AAL2 后再执行管理员敏感操作。</Text>
          </View>
        ) : null}

        {!loading && (enrollment || needsStepUp) ? (
          <View style={styles.stepGrid}>
            {enrollment ? <View style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>1</Text>
                <Text style={styles.stepTitle}>添加到身份验证器</Text>
              </View>
              <Text style={styles.stepText}>在 Google Authenticator、Microsoft Authenticator 或其他 TOTP 应用中选择“输入设置密钥”。</Text>

              <Text style={styles.fieldLabel}>扫描二维码</Text>
              {Platform.OS === 'web' ? <View style={styles.qrFrame}>
                <Image
                  accessibilityLabel="TOTP 身份验证器二维码"
                  resizeMode="contain"
                  source={{ uri: enrollment.qrCode }}
                  style={styles.qrCode}
                />
              </View> : (
                <View accessibilityRole="text" style={styles.qrFallback}>
                  <Ionicons color={colors.muted} name="qr-code-outline" size={28} />
                  <Text style={styles.qrFallbackText}>当前原生版本暂不显示二维码，请使用下方设置密钥完成绑定。</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>设置密钥（长按可选择复制）</Text>
              <Text accessibilityLabel="TOTP 设置密钥" selectable style={styles.secret}>{enrollment.secret}</Text>

              <Text style={styles.fieldLabel}>otpauth URI（长按可选择复制）</Text>
              <Text accessibilityLabel="TOTP otpauth URI" selectable style={styles.uri}>{enrollment.uri}</Text>

              <View style={styles.warning}>
                <Ionicons color={isDark ? '#FFD79A' : '#9B5A00'} name="warning-outline" size={19} />
                <Text style={styles.warningText}>
                  设置密钥和 otpauth URI 都等同于第二重密码。不要截图、转发或粘贴到聊天工具；DOSO 不会保存或记录这里显示的内容。
                </Text>
              </View>
            </View> : null}

            <View style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>{enrollment ? '2' : '1'}</Text>
                <Text style={styles.stepTitle}>{enrollment ? '验证 6 位动态码' : '完成本次会话双重验证'}</Text>
              </View>
              <Text style={styles.stepText}>输入身份验证器当前显示的验证码，完成后本次会话将提升为 AAL2。</Text>
              <TextInput
                accessibilityLabel="身份验证器 6 位动态验证码"
                autoComplete="one-time-code"
                editable={!busy}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                onSubmitEditing={() => void verify()}
                placeholder="••••••"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                style={styles.codeInput}
                textContentType="oneTimeCode"
                value={code}
              />
              <GradientButton
                disabled={busy || code.length !== 6}
                loading={submitting}
                label={submitting ? '正在验证…' : enrollment ? '验证并启用' : '验证并提升会话'}
                onPress={() => void verify()}
                variant="auth"
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useAuthEntryPalette>,
  isDark: boolean,
  layout: ReturnType<typeof getSecurityPageLayout>,
) {
  const warningText = isDark ? '#FFD79A' : '#7B4C0B';

  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', paddingTop: 8, paddingBottom: 40, width: layout.contentWidth },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginRight: 12 },
  headerCopy: { flex: 1 },
  title: { color: colors.ink, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 20, marginTop: 4 },
  loadingCard: { minHeight: 132, borderRadius: cardLayout.radius, alignItems: 'center', justifyContent: 'center', gap: cardLayout.gap, backgroundColor: colors.surface },
  loadingText: { color: colors.secondary, fontSize: 13, lineHeight: 20 },
  errorCard: { marginBottom: cardLayout.gap, minHeight: 54, padding: cardLayout.inset, borderRadius: cardLayout.radius, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerSurface },
  errorText: { flex: 1, color: colors.dangerText, fontSize: 13, lineHeight: 20 },
  retryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: colors.button },
  retryText: { color: colors.buttonInk, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  enabledCard: { borderRadius: cardLayout.radius, padding: cardLayout.inset, alignItems: 'center', backgroundColor: colors.surface },
  enabledIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  enabledTitle: { color: colors.ink, fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: 8 },
  enabledStatus: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  enabledText: { color: colors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: cardLayout.gap },
  stepGrid: { alignItems: 'flex-start', flexDirection: layout.usesColumns ? 'row' : 'column', gap: layout.usesColumns ? layout.gridGap : 0 },
  stepCard: { borderRadius: cardLayout.radius, padding: cardLayout.inset, backgroundColor: colors.surface, marginBottom: cardLayout.gap, width: layout.usesColumns ? layout.columnWidth : '100%' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: { width: 28, height: 28, textAlign: 'center', textAlignVertical: 'center', color: colors.accent, fontSize: 15, fontWeight: '500', lineHeight: 28 },
  stepTitle: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  stepText: { color: colors.secondary, fontSize: 13, lineHeight: 20, marginTop: cardLayout.gap },
  fieldLabel: { color: colors.ink, fontSize: 13, lineHeight: 20, fontWeight: '500', marginTop: 16, marginBottom: 8 },
  qrFrame: { alignSelf: 'center', width: 216, height: 216, padding: 10, borderRadius: radii.md, backgroundColor: '#FFFFFF' },
  qrCode: { width: '100%', height: '100%' },
  qrFallback: { alignItems: 'center', gap: 8, minHeight: 112, justifyContent: 'center', paddingVertical: 16 },
  qrFallbackText: { color: colors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  secret: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '500', letterSpacing: 1.2, paddingVertical: 8 },
  uri: { color: colors.secondary, fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: cardLayout.gap, paddingVertical: 8 },
  warningText: { flex: 1, color: warningText, fontSize: 13, lineHeight: 20 },
  codeInput: { minHeight: 56, marginVertical: 16, borderRadius: 16, backgroundColor: colors.background, color: colors.ink, fontSize: 24, lineHeight: 32, fontWeight: '500', letterSpacing: 10, paddingHorizontal: 12, textAlign: 'center' },
  });
}
