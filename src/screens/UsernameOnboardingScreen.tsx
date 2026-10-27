import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../components/AppText';

import { GradientButton } from '../components/GradientButton';
import { normalizeRegistrationUsername } from '../services/authService';
import { useAuthEntryPalette } from '../components/AuthEntry';
import { AuthError, AuthField, AuthPage } from './LoginScreen';

type UsernameOnboardingScreenProps = {
  error?: string | null;
  loading?: boolean;
  onClaim: (username: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

export function UsernameOnboardingScreen({
  error,
  loading = false,
  onClaim,
  onLogout,
}: UsernameOnboardingScreenProps) {
  const palette = useAuthEntryPalette();
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [activeAction, setActiveAction] = useState<'claim' | 'logout' | null>(null);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const busy = loading || activeAction !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    let normalized: string;
    try {
      normalized = normalizeRegistrationUsername(username);
    } catch (validationError) {
      setFieldError(validationError instanceof Error ? validationError.message : '请输入有效的用户名。');
      return;
    }

    requestInFlightRef.current = true;
    setActiveAction('claim');
    try {
      await onClaim(normalized);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setActiveAction(null);
    }
  };

  const logout = async () => {
    if (busy || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setActiveAction('logout');
    try {
      await onLogout();
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setActiveAction(null);
    }
  };

  return (
    <AuthPage
      subtitle="用于 DOSO 设备与账户识别，设置后不可修改"
      title="设置用户名"
    >
      <AuthError message={error} />
      <AuthField
        accessibilityLabel="用户名"
        appearance="outlined"
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect={false}
        editable={!busy}
        error={fieldError}
        label="用户名"
        maxLength={24}
        onChangeText={(value) => {
          setUsername(value);
          setFieldError(undefined);
        }}
        onSubmitEditing={submit}
        placeholder="3-24 位小写字母、数字或下划线"
        returnKeyType="done"
        textContentType="username"
        value={username}
      />
      <GradientButton
        disabled={busy}
        loading={activeAction === 'claim' || (loading && activeAction !== 'logout')}
        label={activeAction === 'claim' || (loading && activeAction !== 'logout') ? '正在设置…' : '确认用户名'}
        onPress={submit}
        variant="auth"
      />
      <Pressable
        accessibilityLabel="退出当前账户"
        accessibilityRole="button"
        accessibilityState={{ busy: activeAction === 'logout', disabled: busy }}
        disabled={busy}
        onPress={logout}
        style={styles.logoutButton}
      >
        <Text style={[styles.logoutText, { color: palette.secondary }]}>{activeAction === 'logout' ? '正在退出…' : '退出当前账户'}</Text>
      </Pressable>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 12,
    paddingVertical: 10,
  },
  logoutText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
});
