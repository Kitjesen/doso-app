import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../components/AppText';

import { GradientButton } from '../components/GradientButton';
import { normalizePresentationDisplayName } from '../services/appleAuthCore';
import { useAuthEntryPalette } from '../components/AuthEntry';
import { AuthError, AuthField, AuthPage } from './LoginScreen';

type DisplayNameConfirmationScreenProps = {
  initialDisplayName: string;
  error?: string | null;
  loading?: boolean;
  onCancel: () => void | Promise<void>;
  onSave: (displayName: string) => void | Promise<void>;
};

export function DisplayNameConfirmationScreen({
  initialDisplayName,
  error,
  loading = false,
  onCancel,
  onSave,
}: DisplayNameConfirmationScreenProps) {
  const palette = useAuthEntryPalette();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [activeAction, setActiveAction] = useState<'save' | 'cancel' | null>(null);
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
      normalized = normalizePresentationDisplayName(displayName);
    } catch (validationError) {
      setFieldError(validationError instanceof Error ? validationError.message : '请输入有效的显示名称。');
      return;
    }
    requestInFlightRef.current = true;
    setActiveAction('save');
    try {
      await onSave(normalized);
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setActiveAction(null);
    }
  };

  const cancel = async () => {
    if (busy || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setActiveAction('cancel');
    try {
      await onCancel();
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setActiveAction(null);
    }
  };

  return (
    <AuthPage
      backDisabled={busy}
      onBack={cancel}
      title="确认显示名称"
      subtitle="显示名称用于个人资料展示，可与不可修改的 DOSO 用户名不同"
    >
      <AuthError message={error} />
      <AuthField
        accessibilityLabel="显示名称"
        appearance="outlined"
        autoCapitalize="words"
        autoCorrect={false}
        editable={!busy}
        error={fieldError}
        label="显示名称"
        maxLength={80}
        onChangeText={(value) => {
          setDisplayName(value);
          setFieldError(undefined);
        }}
        onSubmitEditing={submit}
        placeholder="请输入用于展示的名称"
        returnKeyType="done"
        value={displayName}
      />
      <GradientButton
        disabled={busy}
        loading={activeAction === 'save' || (loading && activeAction !== 'cancel')}
        label={activeAction === 'save' || (loading && activeAction !== 'cancel') ? '正在保存…' : '保存显示名称'}
        onPress={submit}
        variant="auth"
      />
      <Pressable
        accessibilityLabel="跳过显示名称确认"
        accessibilityRole="button"
        accessibilityState={{ busy: activeAction === 'cancel', disabled: busy }}
        disabled={busy}
        onPress={cancel}
        style={styles.cancelButton}
      >
        <Text style={[styles.cancelText, { color: palette.secondary }]}>{activeAction === 'cancel' ? '正在跳过…' : '跳过显示名称确认'}</Text>
      </Pressable>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 12, paddingVertical: 10 },
  cancelText: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
});
