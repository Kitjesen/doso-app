import { useEffect, useRef, useState } from 'react';
import { Text } from '../components/AppText';

import { GradientButton } from '../components/GradientButton';
import { useAuthEntryPalette } from '../components/AuthEntry';
import { AuthError, AuthField, AuthPage, EMAIL_PATTERN, authStyles } from './LoginScreen';

type ForgotPasswordScreenProps = {
  onRequestReset: (email: string) => void | Promise<void>;
  onBackToLogin: () => void;
  loading?: boolean;
  error?: string | null;
  emailError?: string;
};

export function ForgotPasswordScreen({ onRequestReset, onBackToLogin, loading = false, error, emailError }: ForgotPasswordScreenProps) {
  const palette = useAuthEntryPalette();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const busy = loading || submitting;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setLocalError('请输入邮箱地址');
    if (!EMAIL_PATTERN.test(normalizedEmail)) return setLocalError('请输入有效的邮箱地址');
    requestInFlightRef.current = true;
    setLocalError(undefined);
    setSubmitting(true);
    try {
      await onRequestReset(normalizedEmail);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <AuthPage compact backDisabled={busy} onBack={onBackToLogin} subtitle="输入注册邮箱，我们会发送邮箱验证码" title="找回密码">
      <AuthError message={error} />
      <AuthField accessibilityLabel="账户邮箱" autoCapitalize="none" autoComplete="email" editable={!busy} error={localError ?? emailError} keyboardType="email-address" label="邮箱" onChangeText={(value) => { setEmail(value); setLocalError(undefined); }} onSubmitEditing={submit} placeholder="请输入注册邮箱" returnKeyType="send" textContentType="emailAddress" value={email} />
      <Text style={[authStyles.helper, { color: palette.secondary }]}>为了保护账户安全，无论邮箱是否已注册，我们都会显示相同的发送结果。</Text>
      <GradientButton disabled={busy} loading={busy} label={busy ? '正在发送…' : '发送验证码'} onPress={submit} variant="auth" />
    </AuthPage>
  );
}
