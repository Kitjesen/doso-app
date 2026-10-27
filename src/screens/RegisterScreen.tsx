import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';

import { AuthEntry, AuthEntryButton, AuthEntryError, AuthEntryField, entryStyles as styles, useAuthEntryPalette } from '../components/AuthEntry';
import { normalizeRegistrationUsername } from '../services/authService';
import { registrationPasswordChecks } from './registrationLayout';

export type RegisterValues = { username: string; email: string; password: string };
export type RegisterFieldErrors = Partial<Record<'username' | 'email' | 'password', string>>;

type RegisterScreenProps = {
  onRegister: (values: RegisterValues) => void | Promise<void>;
  onBackToLogin: () => void;
  // Route compatibility only: password recovery belongs on login.
  onForgotPassword?: () => void;
  onOpenDataPrivacy?: () => void;
  loading?: boolean;
  error?: string | null;
  fieldErrors?: RegisterFieldErrors;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function RegisterScreen({ onRegister, onBackToLogin, onOpenDataPrivacy, loading = false, error, fieldErrors }: RegisterScreenProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErrors, setLocalErrors] = useState<RegisterFieldErrors>({});
  const [dismissedErrors, setDismissedErrors] = useState<RegisterFieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState<'email' | null>(null);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const palette = useAuthEntryPalette();
  const busy = loading || pending !== null;
  const passwordChecks = registrationPasswordChecks(password);
  const errors: RegisterFieldErrors = {};
  for (const key of ['username', 'email', 'password'] as const) {
    errors[key] = localErrors[key] ?? (dismissedErrors[key] === fieldErrors?.[key] ? undefined : fieldErrors?.[key]);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clear = (key: keyof RegisterFieldErrors) => {
    setLocalErrors(current => ({ ...current, [key]: undefined }));
    setDismissedErrors(current => ({ ...current, [key]: fieldErrors?.[key] }));
    setRequestError(null);
  };
  const back = () => { if (!busy && !requestInFlightRef.current) onBackToLogin(); };
  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    let normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const next: RegisterFieldErrors = {};
    try { normalizedUsername = normalizeRegistrationUsername(username); }
    catch (caught) { next.username = caught instanceof Error ? caught.message : '请输入有效的用户名'; }
    if (!normalizedEmail) next.email = '请输入邮箱地址';
    else if (!EMAIL_PATTERN.test(normalizedEmail)) next.email = '请输入有效的邮箱地址';
    if (passwordChecks.some(check => !check.met)) next.password = '密码至少 10 位，需包含大写字母、小写字母和数字';
    setLocalErrors(next);
    setDismissedErrors({});
    setRequestError(null);
    if (Object.keys(next).length) {
      (next.username ? usernameRef : next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    requestInFlightRef.current = true;
    setPending('email');
    try { await onRegister({ username: normalizedUsername, email: normalizedEmail, password }); }
    catch (caught) {
      if (mountedRef.current) setRequestError(caught instanceof Error ? caught.message : '暂时无法创建账户，请稍后重试。');
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  };
  const formError = requestError || error;

  return (
    <AuthEntry mode="register" busy={busy} onSwitch={back}>
      {inlineIdentity => <>
        <AuthEntryError message={formError} />
        <View style={[styles.fields, inlineIdentity && styles.identityRow]}>
          <View style={styles.identityField}>
            <AuthEntryField autoCapitalize="none" autoComplete="username" autoCorrect={false} editable={!busy} error={errors.username} hint="3–24 位" icon="person-outline" inputRef={usernameRef} label="用户名" maxLength={24} onChangeText={value => { setUsername(value); clear('username'); }} onSubmitEditing={() => emailRef.current?.focus()} placeholder="字母、数字或下划线" returnKeyType="next" submitBehavior="submit" testID="register-username" textContentType="username" value={username} />
          </View>
          <View style={styles.identityField}>
            <AuthEntryField accessibilityLabel="电子邮箱" autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!busy} error={errors.email} icon="mail-outline" inputRef={emailRef} keyboardType="email-address" label="邮箱" onChangeText={value => { setEmail(value); clear('email'); }} onSubmitEditing={() => passwordRef.current?.focus()} placeholder="输入邮箱地址" returnKeyType="next" submitBehavior="submit" testID="register-email" textContentType="emailAddress" value={email} />
          </View>
        </View>
        <View style={styles.passwordGroup}>
          <AuthEntryField autoCapitalize="none" autoComplete="new-password" autoCorrect={false} editable={!busy} error={errors.password} icon="lock-closed-outline" inputRef={passwordRef} label="密码" onChangeText={value => { setPassword(value); clear('password'); }} onSubmitEditing={submit} placeholder="设置密码" returnKeyType="done" secure testID="register-password" textContentType="newPassword" value={password} visibilityTestID="register-password-visibility" />
          <Text accessibilityLabel={passwordChecks.map(check => check.label + (check.met ? '，已满足' : '，未满足')).join('；')} style={[styles.passwordHint, { color: passwordChecks.every(check => check.met) ? palette.accent : palette.secondary }]}>至少10位，含大小写字母和数字</Text>
        </View>
        <AuthEntryButton busy={busy} loading={busy} label={busy ? '正在创建账户…' : '创建账户'} onPress={submit} testID="register-submit" />
        {onOpenDataPrivacy ? <Pressable accessibilityHint="查看当前功能涉及的数据范围" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { if (!busy && !requestInFlightRef.current) onOpenDataPrivacy(); }} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 }} testID="register-data-privacy"><Text style={[styles.link, { color: palette.secondary }]}>数据与隐私</Text></Pressable> : null}
      </>}
    </AuthEntry>
  );
}
