import { useEffect, useRef, useState } from 'react';

import { GradientButton } from '../components/GradientButton';
import { EMAIL_OTP_INVALID_MESSAGE, isValidEmailOtp, sanitizeEmailOtpInput } from '../services/emailOtp';
import { AuthError, AuthField, AuthPage } from './LoginScreen';

export type ResetPasswordFieldErrors = Partial<Record<'nonce' | 'password' | 'confirmPassword', string>>;

type ResetPasswordScreenProps = {
  onResetPassword: (password: string, nonce?: string) => void | Promise<void>;
  onBackToLogin: () => void;
  loading?: boolean;
  error?: string | null;
  fieldErrors?: ResetPasswordFieldErrors;
  nonceRequired?: boolean;
};

export function ResetPasswordScreen({ onResetPassword, onBackToLogin, loading = false, error, fieldErrors, nonceRequired = false }: ResetPasswordScreenProps) {
  const [nonce, setNonce] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localErrors, setLocalErrors] = useState<ResetPasswordFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const busy = loading || submitting;
  const errors = { ...localErrors, ...fieldErrors };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    const next: ResetPasswordFieldErrors = {};
    if (nonceRequired && !isValidEmailOtp(nonce)) next.nonce = EMAIL_OTP_INVALID_MESSAGE;
    if (password.length < 10) next.password = '密码至少需要 10 个字符';
    else if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) next.password = '密码需包含大写字母、小写字母和数字';
    if (!confirmPassword) next.confirmPassword = '请再次输入密码';
    else if (password !== confirmPassword) next.confirmPassword = '两次输入的密码不一致';
    setLocalErrors(next);
    if (Object.keys(next).length) return;
    requestInFlightRef.current = true;
    setSubmitting(true);
    try {
      await onResetPassword(password, nonceRequired ? nonce : undefined);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (requestInFlightRef.current) return;
    onBackToLogin();
  };

  return (
    <AuthPage compact backDisabled={busy} onBack={handleBack} subtitle={nonceRequired ? '输入安全验证码并设置新密码' : '设置一个新的安全密码'} title={nonceRequired ? '修改密码' : '重置密码'}>
      <AuthError message={error} />
      {nonceRequired ? <AuthField accessibilityLabel="安全验证码" autoCapitalize="none" autoComplete="one-time-code" editable={!busy} error={errors.nonce} keyboardType="number-pad" label="验证码" onChangeText={(value) => { setNonce(sanitizeEmailOtpInput(value)); setLocalErrors((current) => ({ ...current, nonce: undefined })); }} placeholder="邮件中的安全验证码" returnKeyType="next" textContentType="oneTimeCode" value={nonce} /> : null}
      <AuthField accessibilityLabel="新密码" autoCapitalize="none" autoComplete="new-password" editable={!busy} error={errors.password} label="新密码" onChangeText={(value) => { setPassword(value); setLocalErrors((current) => ({ ...current, password: undefined })); }} placeholder="至少 10 位，含大小写字母和数字" returnKeyType="next" secure textContentType="newPassword" value={password} />
      <AuthField accessibilityLabel="确认新密码" autoCapitalize="none" autoComplete="new-password" editable={!busy} error={errors.confirmPassword} label="确认新密码" onChangeText={(value) => { setConfirmPassword(value); setLocalErrors((current) => ({ ...current, confirmPassword: undefined })); }} onSubmitEditing={submit} placeholder="再次输入新密码" returnKeyType="done" secure textContentType="newPassword" value={confirmPassword} />
      <GradientButton disabled={busy} loading={busy} label={busy ? '正在更新…' : '更新密码'} onPress={submit} variant="auth" />
    </AuthPage>
  );
}
