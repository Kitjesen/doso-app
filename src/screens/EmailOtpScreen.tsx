import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';

import { GradientButton } from '../components/GradientButton';
import { useAuthEntryPalette } from '../components/AuthEntry';
import {
  EMAIL_OTP_INVALID_MESSAGE,
  isValidEmailOtp,
  sanitizeEmailOtpInput,
} from '../services/emailOtp';
import { AuthError, AuthPage, authStyles } from './LoginScreen';

type EmailOtpScreenProps = {
  email: string;
  onVerify: (code: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  onBackToLogin: () => void;
  loading?: boolean;
  error?: string | null;
  purpose?: 'signup' | 'password-recovery';
};

const RESEND_SECONDS = 60;

function maskEmail(email: string) {
  const [name, domain] = email.trim().split('@');
  if (!name || !domain) return '你的邮箱';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

function otpFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function EmailOtpScreen({
  email,
  onVerify,
  onResend,
  onBackToLogin,
  loading = false,
  error,
  purpose = 'signup',
}: EmailOtpScreenProps) {
  const colors = useAuthEntryPalette();
  const { height, width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [focused, setFocused] = useState(false);
  const codeInputRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const resendAvailableAtRef = useRef(Date.now() + RESEND_SECONDS * 1_000);
  const busy = loading || submitting || resending;
  const verifying = submitting || (loading && !resending);
  const isLandscape = width > height;
  const displayedError = localError ?? error;
  const codeExpired = Boolean(displayedError && /(?:已过期|expired)/i.test(displayedError));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    // Timers pause in the background while the user opens their mail app.
    const refreshCountdown = () => {
      setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAtRef.current - Date.now()) / 1_000)));
    };
    const timer = setInterval(refreshCountdown, 1_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshCountdown();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isLandscape) return;
    codeInputRef.current?.blur();
    Keyboard.dismiss();
  }, [isLandscape]);

  useEffect(() => {
    if (codeExpired) {
      resendAvailableAtRef.current = 0;
      setSecondsLeft(0);
    }
  }, [codeExpired]);

  const handleBack = () => {
    if (busy || requestInFlightRef.current) return;
    onBackToLogin();
  };

  const updateCode = (value: string) => {
    setCode(sanitizeEmailOtpInput(value));
    setLocalError(undefined);
  };

  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    if (!isValidEmailOtp(code)) {
      setLocalError(EMAIL_OTP_INVALID_MESSAGE);
      return;
    }
    requestInFlightRef.current = true;
    const requestGeneration = ++requestGenerationRef.current;
    setSubmitting(true);
    setLocalError(undefined);
    try {
      await onVerify(code);
    } catch (caught) {
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        setLocalError(otpFailureMessage(caught, '暂时无法验证验证码，请稍后重试。'));
      }
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        setSubmitting(false);
      }
    }
  };

  const resend = async () => {
    if (busy || requestInFlightRef.current || Date.now() < resendAvailableAtRef.current) return;
    requestInFlightRef.current = true;
    const requestGeneration = ++requestGenerationRef.current;
    setResending(true);
    setLocalError(undefined);
    try {
      await onResend();
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        setCode('');
        resendAvailableAtRef.current = Date.now() + RESEND_SECONDS * 1_000;
        setSecondsLeft(RESEND_SECONDS);
      }
    } catch (caught) {
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        setLocalError(otpFailureMessage(caught, '暂时无法发送验证码，请稍后再试。'));
      }
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        setResending(false);
      }
    }
  };

  const recovery = purpose === 'password-recovery';
  const resendAccessibilityLabel = resending
    ? '正在重新发送验证码'
    : secondsLeft > 0
      ? `${secondsLeft} 秒后可以重新发送验证码`
      : '重新发送验证码';

  return (
    <AuthPage
      backDisabled={busy}
      compact
      onBack={handleBack}
      subtitle={recovery ? '验证邮箱后即可设置新密码' : '验证邮箱，完成 DOSO 账户注册'}
      title="输入验证码"
    >
      <AuthError message={displayedError} />
      <Text selectable style={[authStyles.helper, { color: colors.secondary }]}>
        邮箱验证码已发送至 {maskEmail(email)}。验证码会在一段时间后失效，请按邮件中的完整内容输入。
      </Text>
      <Text style={[authStyles.fieldLabel, { color: colors.ink }]}>验证码</Text>
      <View style={[styles.codeField, isLandscape && styles.codeFieldLandscape, focused && styles.codeFieldFocused, displayedError ? styles.codeFieldError : undefined]}>
        <TextInput
          accessibilityLabel="邮箱验证码"
          autoComplete="one-time-code"
          autoFocus={!isLandscape}
          editable={!busy}
          keyboardType="number-pad"
          onChangeText={updateCode}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onSubmitEditing={submit}
          ref={codeInputRef}
          returnKeyType="done"
          style={[styles.codeInput, isLandscape && styles.codeInputLandscape]}
          textContentType="oneTimeCode"
          value={code}
        />
      </View>
      <GradientButton
        compact={isLandscape}
        disabled={busy || !isValidEmailOtp(code)}
        loading={verifying}
        label={verifying ? '正在验证…' : '验证并继续'}
        onPress={submit}
        variant="auth"
      />
      <View style={[styles.secondaryActions, isLandscape && styles.secondaryActionsLandscape]}>
        <View style={[styles.resendRow, isLandscape && styles.resendRowLandscape]}>
          <Text style={styles.resendPrompt}>没有收到邮件？</Text>
          <Pressable
            accessibilityLabel={resendAccessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: resending, disabled: busy || secondsLeft > 0 }}
            accessibilityValue={{ text: resendAccessibilityLabel }}
            disabled={busy || secondsLeft > 0}
            hitSlop={8}
            onPress={resend}
            style={styles.resendButton}
          >
            <Text style={[authStyles.linkText, { color: colors.authFocus }, (busy || secondsLeft > 0) && styles.disabledLink]}>
              {resending ? '正在发送…' : secondsLeft > 0 ? `${secondsLeft} 秒后重发` : '重新发送验证码'}
            </Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={handleBack} style={[styles.backToLogin, isLandscape && styles.backToLoginLandscape]}>
          <Text style={styles.backToLoginText}>返回登录</Text>
        </Pressable>
      </View>
    </AuthPage>
  );
}

function createStyles(colors: ReturnType<typeof useAuthEntryPalette>) {
  return StyleSheet.create({
  codeField: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  codeFieldFocused: { borderColor: colors.authFocus },
  codeFieldError: { borderColor: colors.dangerText },
  codeFieldLandscape: { marginBottom: 14, minHeight: 56 },
  codeInput: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: 'center',
    width: '100%',
  },
  codeInputLandscape: { paddingVertical: 8 },
  secondaryActions: {},
  secondaryActionsLandscape: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginTop: 12 },
  resendRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  resendRowLandscape: { marginTop: 0 },
  resendButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  resendPrompt: { color: colors.secondary, fontSize: 13, lineHeight: 20 },
  disabledLink: { color: colors.secondary },
  backToLogin: { alignItems: 'center', justifyContent: 'center', marginTop: 20, minHeight: 44, paddingVertical: 8 },
  backToLoginLandscape: { marginTop: 0, paddingHorizontal: 8 },
  backToLoginText: { color: colors.secondary, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  });
}
