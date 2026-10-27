import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  heartbeatCurrentTerminal,
  isAccountSessionOutcomeError,
  listAccountTerminals,
  revokeAccountTerminal,
  revokeAllTerminals,
  revokeOtherTerminals,
} from '../services/sessionService';
import { listMyLoginMethods } from '../services/authService';
import { getMfaStatus } from '../services/mfaService';
import { radii, type ThemeColors, useAppTheme } from '../theme';
import type { AccountTerminalWithCurrent, ExternalIdentityKind, ExternalIdentitySummary } from '../types/api';
import { getSecurityPageLayout } from './securityPageLayout';

type Props = {
  busy?: boolean;
  canManageMfa: boolean;
  email: string;
  emailVerified: boolean;
  onBack?: () => void;
  onBackRequestChange?: (request: (() => void) | null) => void;
  onChangePassword: () => void;
  onManageMfa: () => void;
  onAllTerminalsRevoked?: () => void | Promise<void>;
};

const REVOCATION_UNCONFIRMED_COPY = '终端撤销结果无法确认，请刷新终端列表并核对登录状态，不要重复提交撤销。';

function errorMessage(error: unknown, fallback: string) {
  return isAccountSessionOutcomeError(error) ? error.message : fallback;
}

function formatLastSeen(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '时间未知';
  return timestamp.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LOGIN_METHOD_LABELS: Record<ExternalIdentityKind, string> = {
  email: '邮箱',
  apple: 'Apple',
  wechat: '微信',
  qq: 'QQ',
  other: '其他方式',
};

function LoginMethodIcon({ accentColor, inkColor, kind }: { accentColor: string; inkColor: string; kind: ExternalIdentityKind }) {
  if (kind === 'apple') return <Ionicons color={inkColor} name="logo-apple" size={20} />;
  if (kind === 'email') return <Ionicons color={accentColor} name="mail-outline" size={20} />;
  if (kind === 'wechat') return <Ionicons color={accentColor} name="chatbubbles-outline" size={20} />;
  if (kind === 'qq') return <Ionicons color={accentColor} name="chatbubble-ellipses-outline" size={20} />;
  return <Ionicons color={accentColor} name="key-outline" size={20} />;
}

type PendingConfirmation = {
  action: () => Promise<unknown>;
  after?: () => void | Promise<void>;
  description: string;
  key: string;
  success: string;
  title: string;
};

type MfaDisplayState = 'loading' | 'disabled' | 'aal1' | 'aal2' | 'error';

const MFA_STATUS_COPY: Record<MfaDisplayState, { detail: string; label: string }> = {
  loading: { detail: '正在读取服务端身份验证状态…', label: '读取中' },
  disabled: { detail: '尚未绑定 TOTP 身份验证器', label: '未启用' },
  aal1: { detail: '已绑定 TOTP，当前会话尚未提升到 AAL2', label: '已启用（AAL1）' },
  aal2: { detail: '已绑定 TOTP，当前会话已达到 AAL2', label: '已启用（AAL2）' },
  error: { detail: '无法读取服务端 MFA 状态，请稍后重试', label: '读取失败' },
};

export function AccountSecurityScreen({
  busy = false,
  canManageMfa,
  email,
  emailVerified,
  onBack,
  onBackRequestChange,
  onChangePassword,
  onManageMfa,
  onAllTerminalsRevoked,
}: Props) {
  const { colors, isDark } = useAppTheme();
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
  const accentColor = isDark ? colors.successText : colors.greenDark;
  const [terminals, setTerminals] = useState<AccountTerminalWithCurrent[]>([]);
  const [loginMethods, setLoginMethods] = useState<ExternalIdentitySummary[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(true);
  const [loginMethodsLoading, setLoginMethodsLoading] = useState(true);
  const [mfaDisplayState, setMfaDisplayState] = useState<MfaDisplayState>('loading');
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [loginMethodsError, setLoginMethodsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [unconfirmedAction, setUnconfirmedAction] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const mountedRef = useRef(true);
  const terminalRequestGenerationRef = useRef(0);
  const loginMethodsRequestGenerationRef = useRef(0);
  const mfaRequestGenerationRef = useRef(0);
  const actionRequestGenerationRef = useRef(0);
  const activeActionRef = useRef<string | null>(null);
  const unconfirmedActionRef = useRef(false);
  const interactionLocked = busy || Boolean(activeAction);
  const revocationLocked = interactionLocked || Boolean(unconfirmedAction);

  const loadTerminals = useCallback(async () => {
    const requestId = ++terminalRequestGenerationRef.current;
    setTerminalsLoading(true);
    setTerminalError(null);
    try {
      await heartbeatCurrentTerminal();
      if (!mountedRef.current || requestId !== terminalRequestGenerationRef.current) return;
      const nextTerminals = await listAccountTerminals();
      if (!mountedRef.current || requestId !== terminalRequestGenerationRef.current) return;
      setTerminals(nextTerminals);
    } catch (loadError) {
      if (!mountedRef.current || requestId !== terminalRequestGenerationRef.current) return;
      setTerminalError(errorMessage(loadError, '登录终端暂时无法读取，请检查网络后刷新。'));
    } finally {
      if (mountedRef.current && requestId === terminalRequestGenerationRef.current) setTerminalsLoading(false);
    }
  }, []);

  const loadLoginMethods = useCallback(async () => {
    const requestId = ++loginMethodsRequestGenerationRef.current;
    setLoginMethodsLoading(true);
    setLoginMethodsError(null);
    try {
      const nextLoginMethods = await listMyLoginMethods();
      if (!mountedRef.current || requestId !== loginMethodsRequestGenerationRef.current) return;
      setLoginMethods(nextLoginMethods);
    } catch (loadError) {
      if (!mountedRef.current || requestId !== loginMethodsRequestGenerationRef.current) return;
      setLoginMethodsError(errorMessage(loadError, '登录方式暂时无法读取，请检查网络后刷新。'));
    } finally {
      if (mountedRef.current && requestId === loginMethodsRequestGenerationRef.current) setLoginMethodsLoading(false);
    }
  }, []);

  const loadMfaStatus = useCallback(async () => {
    const requestId = ++mfaRequestGenerationRef.current;
    setMfaDisplayState('loading');
    try {
      const status = await getMfaStatus();
      if (!mountedRef.current || requestId !== mfaRequestGenerationRef.current) return;
      if (!status.enabled) setMfaDisplayState('disabled');
      else if (status.currentLevel === 'aal1') setMfaDisplayState('aal1');
      else if (status.currentLevel === 'aal2') setMfaDisplayState('aal2');
      else setMfaDisplayState('error');
    } catch {
      if (!mountedRef.current || requestId !== mfaRequestGenerationRef.current) return;
      setMfaDisplayState('error');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      terminalRequestGenerationRef.current += 1;
      loginMethodsRequestGenerationRef.current += 1;
      mfaRequestGenerationRef.current += 1;
      actionRequestGenerationRef.current += 1;
      activeActionRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadTerminals();
    void loadLoginMethods();
    if (canManageMfa) void loadMfaStatus();
  }, [canManageMfa, loadLoginMethods, loadMfaStatus, loadTerminals]);

  const requestBack = useCallback(() => {
    // The ref closes the same-tick gap before the disabled header rerenders.
    if (!mountedRef.current || busy || activeActionRef.current) return;
    onBack?.();
  }, [busy, onBack]);

  useEffect(() => {
    onBackRequestChange?.(requestBack);
    return () => onBackRequestChange?.(null);
  }, [onBackRequestChange, requestBack]);

  const current = useMemo(
    () => terminals.find((terminal) => terminal.is_current && !terminal.revoked_at) ?? null,
    [terminals],
  );
  const others = useMemo(
    () => terminals.filter((terminal) => !terminal.is_current && !terminal.revoked_at),
    [terminals],
  );
  const activeLoginMethods = useMemo(
    () => loginMethods.filter((method) => method.status === 'active' && !method.unlinked_at),
    [loginMethods],
  );
  const normalizedEmail = email.trim();
  const activeEmailMethod = activeLoginMethods.find((method) => method.kind === 'email') ?? null;
  const canChangePassword = Boolean(normalizedEmail && emailVerified && activeEmailMethod?.email_verified);
  const passwordCapabilityPending = Boolean(normalizedEmail && emailVerified && loginMethodsLoading);
  const emailCapabilityLabel = passwordCapabilityPending ? '读取中' : canChangePassword ? '已验证' : '不可用于找回';
  const emailCapabilityIcon = passwordCapabilityPending ? 'mail-outline' : canChangePassword ? 'checkmark-circle-outline' : 'mail-unread-outline';
  const mfaActionAvailable = mfaDisplayState === 'disabled' || mfaDisplayState === 'aal1' || mfaDisplayState === 'aal2';

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
    after?: () => void | Promise<void>,
  ) => {
    if (busy || activeActionRef.current || unconfirmedActionRef.current) return;
    const requestId = ++actionRequestGenerationRef.current;
    activeActionRef.current = key;
    setActiveAction(key);
    setTerminalError(null);
    setNotice(null);
    let actionCompleted = false;
    try {
      await action();
      actionCompleted = true;
      if (!mountedRef.current || requestId !== actionRequestGenerationRef.current) return;
      if (after) {
        await after();
      } else {
        const nextTerminals = await listAccountTerminals();
        if (!mountedRef.current || requestId !== actionRequestGenerationRef.current) return;
        setTerminals(nextTerminals);
      }
      if (!mountedRef.current || requestId !== actionRequestGenerationRef.current) return;
      setNotice(success);
    } catch (actionError) {
      if (!mountedRef.current || requestId !== actionRequestGenerationRef.current) return;
      const readOnlyTimeout = isAccountSessionOutcomeError(actionError) && actionError.outcome === 'read-timeout';
      if (actionCompleted || !readOnlyTimeout) {
        // Reading a list is not proof that a timed-out mutation has finished.
        // An untyped transport/server error also cannot prove it never committed.
        // Keep this mount's mutation guard even after refresh, but allow back.
        unconfirmedActionRef.current = true;
        setUnconfirmedAction(actionCompleted
          ? '终端撤销已确认，但页面状态更新未完成。请刷新终端列表并核对登录状态，不要重复提交撤销。'
          : errorMessage(actionError, REVOCATION_UNCONFIRMED_COPY));
        setPendingConfirmation(null);
      } else {
        setTerminalError(errorMessage(actionError, REVOCATION_UNCONFIRMED_COPY));
      }
    } finally {
      if (requestId === actionRequestGenerationRef.current) {
        activeActionRef.current = null;
        if (mountedRef.current) setActiveAction(null);
      }
    }
  }, [busy]);

  const requestConfirmation = useCallback((confirmation: PendingConfirmation) => {
    if (busy || activeActionRef.current || unconfirmedActionRef.current) return;
    setNotice(null);
    setPendingConfirmation(confirmation);
  }, [busy]);

  const confirmPendingAction = useCallback(async () => {
    const pending = pendingConfirmation;
    if (!pending || busy || activeActionRef.current || unconfirmedActionRef.current) return;
    setPendingConfirmation(null);
    await runAction(pending.key, pending.action, pending.success, pending.after);
  }, [busy, pendingConfirmation, runAction]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.primaryColumn}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityLabel="返回"
              accessibilityRole="button"
              disabled={interactionLocked}
              hitSlop={10}
              onPress={requestBack}
              style={[styles.backButton, interactionLocked && styles.disabled]}
            >
              <Ionicons color={colors.ink} name="arrow-back" size={22} />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <Text style={styles.title}>账号与安全</Text>
            <Text style={styles.subtitle}>管理密码、邮箱验证与登录终端</Text>
          </View>
        </View>

        {busy ? (
          <View accessibilityLiveRegion="polite" style={styles.busyNotice}>
            <ActivityIndicator color={colors.greenStrong} size="small" />
            <Text style={styles.loadingText}>正在处理账户安全操作…</Text>
          </View>
        ) : null}

        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>登录方式</Text>
          <Pressable accessibilityRole="button" disabled={loginMethodsLoading || interactionLocked} onPress={() => void loadLoginMethods()} style={styles.refreshButton}>
            <Text style={styles.refreshText}>刷新</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          {loginMethodsLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.greenStrong} size="small" />
              <Text style={styles.loadingText}>正在同步登录方式…</Text>
            </View>
          ) : loginMethodsError ? (
            <View accessibilityLiveRegion="polite" style={styles.inlineError}>
              <Ionicons color={colors.dangerText} name="alert-circle-outline" size={19} />
              <Text style={styles.errorText}>{loginMethodsError}</Text>
              <Pressable accessibilityRole="button" disabled={interactionLocked} onPress={() => void loadLoginMethods()} style={styles.retryButton}>
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            </View>
          ) : activeLoginMethods.length ? activeLoginMethods.map((method, index) => (
            <View key={method.registry_id} style={[styles.row, index > 0 && styles.rowDivider]}>
              <View style={styles.iconCircle}><LoginMethodIcon accentColor={accentColor} inkColor={colors.ink} kind={method.kind} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{LOGIN_METHOD_LABELS[method.kind]}</Text>
                <Text style={styles.rowDetail}>
                  {method.provider_last_sign_in_at
                    ? `最近登录：${formatLastSeen(method.provider_last_sign_in_at)}`
                    : `关联于：${formatLastSeen(method.linked_at)}`}
                </Text>
              </View>
              <Text style={[styles.status, styles.verified]}>已启用</Text>
            </View>
          )) : (
            <View style={styles.emptyLoginMethods}>
              <Text style={styles.emptyTitle}>暂未同步到登录方式</Text>
              <Text style={styles.emptyText}>请刷新页面；登录身份仅由服务端安全记录确认。</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>账户安全</Text>
        <View style={styles.card}>
          {normalizedEmail ? (
            <View style={styles.row}>
              <View style={[styles.iconCircle, canChangePassword && styles.successIcon]}>
                <Ionicons color={passwordCapabilityPending ? colors.muted : canChangePassword ? colors.successText : colors.dangerText} name={emailCapabilityIcon} size={20} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>安全邮箱</Text>
                <Text numberOfLines={1} style={styles.rowDetail}>{normalizedEmail}</Text>
              </View>
              <Text style={[styles.status, passwordCapabilityPending ? styles.statusNeutral : canChangePassword ? styles.verified : styles.unverified]}>{emailCapabilityLabel}</Text>
            </View>
          ) : (
            <View style={styles.securityNotice}>
              <Ionicons color={colors.muted} name="information-circle-outline" size={20} />
              <Text style={styles.securityNoticeText}>当前是三方登录账户。找回或修改密码前，需要先添加并验证安全邮箱。</Text>
            </View>
          )}
          {canChangePassword ? (
            <Pressable accessibilityRole="button" disabled={interactionLocked} onPress={onChangePassword} style={({ pressed }) => [styles.row, styles.rowDivider, interactionLocked && styles.disabled, pressed && styles.pressed]}>
              <View style={styles.iconCircle}><Ionicons color={accentColor} name="key-outline" size={20} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>修改密码</Text>
                <Text style={styles.rowDetail}>设置新的账户登录密码</Text>
              </View>
              <Ionicons color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
          ) : (
            <View style={[styles.row, normalizedEmail ? styles.rowDivider : null]}>
              <View style={styles.iconCircle}><Ionicons color={colors.muted} name="key-outline" size={20} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>修改密码</Text>
                <Text style={styles.rowDetail}>{passwordCapabilityPending ? '正在确认邮箱登录方式…' : '需要已启用且验证完成的邮箱登录方式'}</Text>
              </View>
            </View>
          )}
          {canManageMfa ? (
            <Pressable accessibilityRole="button" disabled={interactionLocked || !mfaActionAvailable} onPress={onManageMfa} style={({ pressed }) => [styles.row, styles.rowDivider, (interactionLocked || !mfaActionAvailable) && styles.disabled, pressed && styles.pressed]}>
              <View style={styles.iconCircle}><Ionicons color={accentColor} name="shield-checkmark-outline" size={20} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>管理端身份验证器</Text>
                <Text style={styles.rowDetail}>{MFA_STATUS_COPY[mfaDisplayState].detail}</Text>
              </View>
              <Text style={[
                styles.status,
                mfaDisplayState === 'error' ? styles.unverified : mfaActionAvailable ? styles.verified : styles.statusNeutral,
              ]}>{MFA_STATUS_COPY[mfaDisplayState].label}</Text>
              <Ionicons color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
          ) : null}
          {canManageMfa && mfaDisplayState === 'error' ? (
            <Pressable accessibilityRole="button" disabled={interactionLocked} onPress={() => void loadMfaStatus()} style={styles.mfaRetryButton}>
              <Text style={styles.retryText}>重新读取 MFA 状态</Text>
            </Pressable>
          ) : null}
        </View>

        </View>

        <View style={styles.secondaryColumn}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>登录终端</Text>
          <Pressable accessibilityRole="button" disabled={terminalsLoading || interactionLocked} onPress={() => void loadTerminals()} style={styles.refreshButton}>
            <Text style={styles.refreshText}>刷新</Text>
          </Pressable>
        </View>

        {terminalError ? (
          <View accessibilityLiveRegion="polite" style={styles.errorCard}>
            <Ionicons color={colors.dangerText} name="alert-circle-outline" size={19} />
            <Text style={styles.errorText}>{terminalError}</Text>
            <Pressable accessibilityRole="button" disabled={terminalsLoading || interactionLocked} onPress={() => void loadTerminals()} style={styles.retryButton}>
              <Text style={styles.retryText}>重试</Text>
            </Pressable>
          </View>
        ) : null}

        {unconfirmedAction ? (
          <View accessibilityLiveRegion="polite" style={styles.errorCard}>
            <Ionicons color={colors.dangerText} name="alert-circle-outline" size={19} />
            <Text style={styles.errorText}>{unconfirmedAction}</Text>
          </View>
        ) : null}

        {pendingConfirmation ? (
          <View accessibilityLiveRegion="polite" style={styles.confirmationCard}>
            <View style={styles.confirmationIcon}>
              <Ionicons color={colors.dangerText} name="warning-outline" size={20} />
            </View>
            <View style={styles.confirmationCopy}>
              <Text style={styles.confirmationTitle}>{pendingConfirmation.title}</Text>
              <Text style={styles.confirmationText}>{pendingConfirmation.description}</Text>
              <View style={styles.confirmationActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={interactionLocked}
                  onPress={() => setPendingConfirmation(null)}
                  style={({ pressed }) => [styles.confirmationCancel, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmationCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={interactionLocked}
                  onPress={() => void confirmPendingAction()}
                  style={({ pressed }) => [styles.confirmationConfirm, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmationConfirmText}>确认</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {terminalsLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.greenStrong} />
            <Text style={styles.loadingText}>正在同步登录终端…</Text>
          </View>
        ) : (
          <>
            {current ? <TerminalCard accentColor={accentColor} colors={colors} current styles={styles} terminal={current} /> : (
              <View style={styles.emptyCard}><Text style={styles.emptyTitle}>未能识别当前终端</Text><Text style={styles.emptyText}>请刷新页面；终端身份仅由服务端会话确认。</Text></View>
            )}

            {others.length ? (
              <View style={styles.otherList}>
                <Text style={styles.listLabel}>其他已登录终端</Text>
                {others.map((terminal) => (
                  <TerminalCard
                    accentColor={accentColor}
                    busy={interactionLocked || activeAction === terminal.id}
                    colors={colors}
                    disabled={Boolean(unconfirmedAction)}
                    key={terminal.id}
                    onRevoke={() => requestConfirmation({
                      action: () => revokeAccountTerminal(terminal.id, 'user_revoked_specific_terminal'),
                      description: `此操作会立即撤销“${terminal.device_label}”的账户访问，设备需要重新登录。`,
                      key: terminal.id,
                      success: `已禁用 ${terminal.device_label}`,
                      title: '确认禁用此终端？',
                    })}
                    styles={styles}
                    terminal={terminal}
                  />
                ))}
              </View>
            ) : <Text style={styles.noOthers}>没有其他已登录终端</Text>}

            <View style={styles.actionCard}>
              <Pressable
                accessibilityRole="button"
                disabled={!others.length || revocationLocked}
                onPress={() => requestConfirmation({
                  action: () => revokeOtherTerminals('user_revoked_other_terminals'),
                  description: `将撤销 ${others.length} 个其他终端的账户访问，当前终端保持登录。`,
                  key: 'others',
                  success: '已退出其他登录终端',
                  title: '确认退出其他终端？',
                })}
                style={({ pressed }) => [styles.secondaryAction, (!others.length || revocationLocked) && styles.disabled, pressed && styles.pressed]}
              >
                {activeAction === 'others' ? <ActivityIndicator color={colors.ink} size="small" /> : <Ionicons color={colors.ink} name="log-out-outline" size={18} />}
                <Text style={styles.secondaryActionText}>退出其他终端</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!terminals.some((terminal) => !terminal.revoked_at) || revocationLocked}
                onPress={() => requestConfirmation({
                  action: () => revokeAllTerminals('user_revoked_all_terminals'),
                  after: onAllTerminalsRevoked,
                  description: '将撤销包括当前设备在内的全部终端，并立即结束当前会话。',
                  key: 'all',
                  success: '已退出全部登录终端',
                  title: '确认退出全部终端？',
                })}
                style={({ pressed }) => [styles.dangerAction, revocationLocked && styles.disabled, pressed && styles.pressed]}
              >
                {activeAction === 'all' ? <ActivityIndicator color={colors.dangerText} size="small" /> : <Ionicons color={colors.dangerText} name="shield-outline" size={18} />}
                <Text style={styles.dangerActionText}>退出全部终端</Text>
              </Pressable>
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TerminalCard({
  accentColor,
  colors,
  terminal,
  current = false,
  busy = false,
  disabled = false,
  onRevoke,
  styles,
}: {
  accentColor: string;
  colors: ThemeColors;
  terminal: AccountTerminalWithCurrent;
  current?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onRevoke?: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.terminalCard, current && styles.currentTerminal]}>
      <View style={styles.terminalIcon}><Ionicons color={accentColor} name={terminal.platform === 'web' ? 'desktop-outline' : 'phone-portrait-outline'} size={21} /></View>
      <View style={styles.terminalCopy}>
        <View style={styles.terminalTitleRow}>
          <Text numberOfLines={1} style={styles.terminalTitle}>{terminal.device_label}</Text>
          {current ? <Text style={styles.currentBadge}>当前终端</Text> : null}
        </View>
        <Text style={styles.terminalMeta}>{terminal.platform.toUpperCase()}（DOSO {terminal.app_version ?? '未知版本'}）</Text>
        <Text style={styles.terminalMeta}>最后活动：{formatLastSeen(terminal.last_seen_at)}</Text>
      </View>
      {onRevoke ? (
        <Pressable accessibilityLabel={`禁用 ${terminal.device_label}`} accessibilityRole="button" disabled={busy || disabled} onPress={onRevoke} style={[styles.revokeButton, disabled && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.dangerText} size="small" /> : <Text style={styles.revokeText}>禁用</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(
  colors: ThemeColors,
  isDark: boolean,
  layout: ReturnType<typeof getSecurityPageLayout>,
) {
  const p = getProductAppearance(isDark);
  const positiveSurface = p.surface;
  const positiveSoft = 'transparent';
  const iconSurface = 'transparent';
  const successBadge = 'transparent';
  const dangerBorder = isDark ? '#6A3039' : '#FFC7CC';

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    content: { alignSelf: 'center', flexDirection: layout.usesColumns ? 'row' : 'column', gap: layout.usesColumns ? layout.gridGap : 0, paddingBottom: 38, paddingTop: 8, width: layout.contentWidth },
    primaryColumn: { width: layout.usesColumns ? layout.columnWidth : '100%' },
    secondaryColumn: { width: layout.usesColumns ? layout.columnWidth : '100%' },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginRight: 10 },
    headerCopy: { flex: 1 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    sectionTitle: { ...typography.label, color: colors.ink, marginTop: 20, marginBottom: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    refreshButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
    refreshText: { ...typography.supporting, color: p.blueInk },
    card: { borderRadius: cardLayout.radius, backgroundColor: colors.surface, paddingHorizontal: cardLayout.inset },
    row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    rowDivider: {},
    iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: iconSurface },
    successIcon: { backgroundColor: positiveSoft },
    rowCopy: { flex: 1, marginHorizontal: 11 },
    rowTitle: { ...typography.label, color: colors.ink },
    rowDetail: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    emptyLoginMethods: { minHeight: 84, justifyContent: 'center', paddingHorizontal: 3 },
    inlineLoading: { minHeight: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    inlineError: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
    securityNotice: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5 },
    securityNoticeText: { ...typography.supporting, flex: 1, color: colors.muted },
    status: { ...typography.supporting, overflow: 'hidden', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
    verified: { color: p.blueInk, backgroundColor: successBadge },
    unverified: { color: colors.dangerText, backgroundColor: colors.dangerSurface },
    statusNeutral: { color: colors.muted, backgroundColor: 'transparent' },
    errorCard: { marginTop: 14, minHeight: 54, padding: 12, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.dangerSurface },
    errorText: { ...typography.supporting, flex: 1, color: colors.dangerText },
    retryButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.dangerSurface },
    retryText: { ...typography.supporting, color: colors.dangerText },
    mfaRetryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
    notice: { ...typography.supporting, color: p.blueInk, marginTop: 12, paddingVertical: 12, backgroundColor: positiveSoft },
    busyNotice: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: 'row', gap: 9, marginTop: 12, minHeight: 44, paddingHorizontal: 12 },
    confirmationCard: { alignItems: 'flex-start', backgroundColor: colors.dangerSurface, borderColor: dangerBorder, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginTop: 12, padding: 13 },
    confirmationIcon: { alignItems: 'center', height: 40, justifyContent: 'center', width: 32 },
    confirmationCopy: { flex: 1 },
    confirmationTitle: { ...typography.label, color: colors.ink },
    confirmationText: { ...typography.supporting, color: colors.inkSoft, marginTop: 5 },
    confirmationActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
    confirmationCancel: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: 18 },
    confirmationCancelText: { ...typography.label, color: colors.ink },
    confirmationConfirm: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: 18 },
    confirmationConfirmText: { ...typography.label, color: isDark ? colors.background : '#FFFFFF' },
    loadingCard: { minHeight: 110, borderRadius: cardLayout.radius, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.surface },
    loadingText: { ...typography.supporting, color: colors.muted },
    terminalCard: { minHeight: 92, borderRadius: cardLayout.radius, padding: cardLayout.inset, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginBottom: 12 },
    currentTerminal: { backgroundColor: positiveSurface },
    terminalIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: positiveSoft },
    terminalCopy: { flex: 1, marginLeft: 11 },
    terminalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    terminalTitle: { ...typography.label, flexShrink: 1, color: colors.ink },
    currentBadge: { ...typography.supporting, color: p.blueInk, backgroundColor: successBadge, borderRadius: radii.pill, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
    terminalMeta: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    revokeButton: { minWidth: 48, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSurface, marginLeft: 8 },
    revokeText: { ...typography.supporting, color: colors.dangerText },
    otherList: { marginTop: 4 },
    listLabel: { ...typography.supporting, color: colors.muted, marginVertical: 8 },
    noOthers: { ...typography.supporting, color: colors.muted, textAlign: 'center', paddingVertical: 16 },
    emptyCard: { minHeight: 90, borderRadius: cardLayout.radius, padding: cardLayout.inset, justifyContent: 'center', backgroundColor: colors.surface },
    emptyTitle: { ...typography.label, color: colors.ink },
    emptyText: { ...typography.supporting, color: colors.muted, marginTop: 5 },
    actionCard: { marginTop: 10, gap: 10 },
    secondaryAction: { minHeight: 50, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.surfaceStrong },
    secondaryActionText: { ...typography.label, color: colors.ink },
    dangerAction: { minHeight: 50, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.dangerSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: dangerBorder },
    dangerActionText: { ...typography.label, color: colors.dangerText },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.68 },
  });
}
