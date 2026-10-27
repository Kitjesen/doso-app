import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '../components/AppText';
import { UserAvatar } from '../components/UserAvatar';
import { pickProfileAvatar } from '../services/avatarPicker';
import type { ProfileEditInput } from '../services/profileEditing';
import { useAppTheme } from '../theme';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import type { Profile } from '../types/api';

type EditableProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

type Props = {
  avatarUrl?: string | null;
  busy?: boolean;
  error?: string | null;
  onBack: () => void;
  onBackRequestChange?: (handler: (() => void) | null) => void;
  onSave: (input: ProfileEditInput) => Promise<void>;
  profile: EditableProfile;
};

type FieldErrors = { displayName?: string; username?: string };

export function EditProfileScreen({
  avatarUrl,
  busy = false,
  error,
  onBack,
  onBackRequestChange,
  onSave,
  profile,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const initialAvatarUrl = avatarUrl === undefined ? profile.avatar_url : avatarUrl;
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatar, setAvatar] = useState<ProfileEditInput['avatar']>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const savingRef = useRef(false);
  const usernameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const locked = busy || saving || picking;
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedDisplayName = displayName.trim();
  const dirty = normalizedUsername !== profile.username
    || normalizedDisplayName !== profile.display_name
    || avatar !== undefined;
  const previewUri = avatar === null ? null : avatar?.uri ?? initialAvatarUrl ?? null;

  const styles = useMemo(
    () => createStyles(colors, isDark, isLandscape, insets),
    [colors, insets, isDark, isLandscape],
  );

  const requestBack = useCallback(() => {
    if (locked) return;
    if (!dirty) {
      onBack();
      return;
    }
    setShowDiscardConfirm(true);
  }, [dirty, locked, onBack]);

  useEffect(() => {
    onBackRequestChange?.(requestBack);
    return () => onBackRequestChange?.(null);
  }, [onBackRequestChange, requestBack]);

  const chooseAvatar = useCallback(async () => {
    if (locked) return;
    setLocalError(null);
    setPicking(true);
    try {
      const selection = await pickProfileAvatar();
      if (selection) setAvatar(selection);
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : '选择头像失败，请重试。');
    } finally {
      setPicking(false);
    }
  }, [locked]);

  const submit = useCallback(async () => {
    if (locked || savingRef.current || !dirty) return;
    const nextErrors: FieldErrors = {};
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      nextErrors.username = '请输入 3–24 位小写字母、数字或下划线';
    }
    if (normalizedDisplayName.length < 1 || normalizedDisplayName.length > 50 || /[\u0000-\u001F\u007F]/.test(normalizedDisplayName)) {
      nextErrors.displayName = '昵称需为 1–50 个可见字符';
    }
    setFieldErrors(nextErrors);
    setLocalError(null);
    if (nextErrors.username) {
      usernameRef.current?.focus();
      return;
    }
    if (nextErrors.displayName) {
      displayNameRef.current?.focus();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({ avatar, displayName: normalizedDisplayName, username: normalizedUsername });
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : '保存失败，请检查网络后重试。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [avatar, dirty, locked, normalizedDisplayName, normalizedUsername, onSave]);

  const visibleError = localError ?? error;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="返回个人资料"
            accessibilityRole="button"
            disabled={locked}
            hitSlop={8}
            onPress={requestBack}
            style={({ pressed }) => [styles.iconButton, pressed && !locked && styles.pressed]}
            testID="profile-edit-back"
          >
            <Ionicons color={colors.ink} name="chevron-back" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>编辑资料</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.layout}>
          <View style={styles.avatarPanel}>
            <View>
              <UserAvatar displayName={normalizedDisplayName || normalizedUsername} size={isLandscape ? 88 : 104} uri={previewUri} />
              {avatar !== undefined ? (
                <View style={styles.pendingBadge}><Text style={styles.pendingText}>待保存</Text></View>
              ) : null}
            </View>
            <View style={styles.avatarCopy}>
              <Text style={styles.avatarTitle}>个人头像</Text>
              <Text style={styles.avatarHint}>选择照片并预览，点击保存后更新。</Text>
              <View style={styles.avatarActions}>
                <Pressable
                  accessibilityLabel="从相册选择头像"
                  accessibilityRole="button"
                  accessibilityState={{ busy: picking, disabled: locked }}
                  disabled={locked}
                  onPress={chooseAvatar}
                  style={({ pressed }) => [styles.avatarButton, pressed && !locked && styles.pressed]}
                  testID="profile-edit-avatar"
                >
                  <Ionicons color={colors.authPrimary} name="images-outline" size={18} />
                  <Text style={styles.avatarButtonText}>{picking ? '正在打开相册…' : '更换头像'}</Text>
                </Pressable>
                {previewUri ? (
                  <Pressable
                    accessibilityLabel="移除头像"
                    accessibilityRole="button"
                    disabled={locked}
                    onPress={() => { setAvatar(null); setLocalError(null); }}
                    style={({ pressed }) => [styles.removeAvatarButton, pressed && !locked && styles.pressed]}
                    testID="profile-edit-avatar-remove"
                  >
                    <Text style={styles.removeAvatarText}>移除</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <ProfileField
              autoCapitalize="none"
              autoComplete="username"
              editable={!locked}
              error={fieldErrors.username}
              inputRef={usernameRef}
              label="用户名"
              maxLength={24}
              onChangeText={(value) => { setUsername(value); setFieldErrors((current) => ({ ...current, username: undefined })); }}
              onSubmitEditing={() => displayNameRef.current?.focus()}
              placeholder="doso_user"
              returnKeyType="next"
              styles={styles}
              testID="profile-edit-username"
              value={username}
            />
            <ProfileField
              autoCapitalize="words"
              autoComplete="name"
              editable={!locked}
              error={fieldErrors.displayName}
              inputRef={displayNameRef}
              label="昵称"
              maxLength={50}
              onChangeText={(value) => { setDisplayName(value); setFieldErrors((current) => ({ ...current, displayName: undefined })); }}
              onSubmitEditing={submit}
              placeholder="你的昵称"
              returnKeyType="done"
              styles={styles}
              testID="profile-edit-display-name"
              value={displayName}
            />
            <Text style={styles.help}>用户名用于账户识别；昵称显示在问候语和个人资料中。</Text>
          </View>
        </View>

        {visibleError ? (
          <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
            <Ionicons color={colors.dangerText} name="alert-circle-outline" size={18} />
            <Text selectable style={styles.errorText}>{visibleError}</Text>
          </View>
        ) : null}

        {showDiscardConfirm ? (
          <View accessibilityLiveRegion="polite" style={styles.discardCard}>
            <View style={styles.discardCopy}>
              <Text style={styles.discardTitle}>放弃未保存的修改？</Text>
              <Text style={styles.discardHint}>用户名、昵称和头像更改都不会保存。</Text>
            </View>
            <View style={styles.discardActions}>
              <Pressable accessibilityLabel="继续编辑" accessibilityRole="button" onPress={() => setShowDiscardConfirm(false)} style={styles.keepEditingButton} testID="profile-edit-discard-cancel">
                <Text style={styles.keepEditingText}>继续编辑</Text>
              </Pressable>
              <Pressable accessibilityLabel="放弃修改" accessibilityRole="button" onPress={onBack} style={styles.discardButton} testID="profile-edit-discard-confirm">
                <Text style={styles.discardButtonText}>放弃修改</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="保存个人资料"
          accessibilityRole="button"
          accessibilityState={{ busy: busy || saving, disabled: locked || !dirty }}
          disabled={locked || !dirty}
          onPress={submit}
          style={({ pressed }) => [styles.saveButton, (locked || !dirty) && styles.saveButtonDisabled, pressed && !locked && dirty && styles.pressed]}
          testID="profile-edit-save"
        >
          <Text style={[styles.saveText, (locked || !dirty) && styles.saveTextDisabled]}>{busy || saving ? '正在保存…' : '保存修改'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ProfileFieldProps = {
  autoCapitalize: 'none' | 'words';
  autoComplete: 'name' | 'username';
  editable: boolean;
  error?: string;
  inputRef: React.RefObject<TextInput | null>;
  label: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  onSubmitEditing: () => void;
  placeholder: string;
  returnKeyType: 'done' | 'next';
  styles: ReturnType<typeof createStyles>;
  testID: string;
  value: string;
};

function ProfileField({ error, inputRef, label, styles, ...inputProps }: ProfileFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldCount}>{inputProps.value.length}/{inputProps.maxLength}</Text>
      </View>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        ref={inputRef}
        selectTextOnFocus={false}
        style={[styles.input, error && styles.inputError]}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  isDark: boolean,
  isLandscape: boolean,
  insets: { bottom: number; left: number; right: number; top: number },
) {
  const p = getProductAppearance(isDark);
  const card = p.surface;
  const input = 'transparent';
  return StyleSheet.create({
    screen: { backgroundColor: colors.background, flex: 1 },
    content: {
      flexGrow: 1,
      gap: 20,
      paddingBottom: Math.max(28, insets.bottom + 18),
      paddingLeft: Math.max(isLandscape ? 28 : 20, insets.left + 16),
      paddingRight: Math.max(isLandscape ? 28 : 20, insets.right + 16),
      paddingTop: Math.max(12, insets.top + 4),
    },
    header: { alignItems: 'center', flexDirection: 'row', minHeight: 48 },
    iconButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    headerTitle: { color: colors.ink, flex: 1, fontSize: 20, fontWeight: '600', textAlign: 'center' },
    headerSpacer: { width: 44 },
    layout: { alignSelf: 'center', flexDirection: isLandscape ? 'row' : 'column', gap: 18, maxWidth: 760, width: '100%' },
    avatarPanel: { alignItems: isLandscape ? 'flex-start' : 'center', backgroundColor: card, borderRadius: cardLayout.radius, flexDirection: isLandscape ? 'column' : 'row', gap: cardLayout.gap, padding: cardLayout.inset, width: isLandscape ? 250 : '100%' },
    avatarCopy: { alignItems: isLandscape ? 'flex-start' : undefined, flex: 1, minWidth: 0 },
    avatarTitle: { ...typography.label, color: colors.ink },
    avatarHint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
    avatarButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 18, flexDirection: 'row', gap: 7, marginTop: 12, minHeight: 44, paddingHorizontal: 8 },
    avatarButtonText: { color: colors.authPrimary, fontSize: 14, fontWeight: '600' },
    avatarActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    removeAvatarButton: { alignItems: 'center', borderRadius: 18, justifyContent: 'center', marginTop: 12, minHeight: 44, paddingHorizontal: 13 },
    removeAvatarText: { color: colors.dangerText, fontSize: 13, fontWeight: '600' },
    pendingBadge: { alignItems: 'center', backgroundColor: p.action, borderRadius: 12, bottom: -4, minHeight: 24, paddingHorizontal: 8, position: 'absolute', right: -8 },
    pendingText: { ...typography.supporting, color: p.actionInk },
    form: { backgroundColor: card, borderRadius: cardLayout.radius, flex: 1, gap: 16, padding: cardLayout.inset },
    fieldBlock: { gap: 7 },
    fieldLabelRow: { alignItems: 'center', flexDirection: 'row' },
    fieldLabel: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '600' },
    fieldCount: { ...typography.supporting, color: colors.muted, fontVariant: ['tabular-nums'] },
    input: { backgroundColor: input, borderColor: colors.line, borderRadius: 16, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 52, paddingHorizontal: 15, paddingVertical: 12 },
    inputError: { borderColor: colors.dangerText },
    fieldError: { ...typography.supporting, color: colors.dangerText },
    help: { ...typography.supporting, color: colors.muted },
    errorBanner: { alignItems: 'flex-start', alignSelf: 'center', backgroundColor: colors.dangerSurface, borderRadius: 18, flexDirection: 'row', gap: 9, maxWidth: 760, padding: 14, width: '100%' },
    errorText: { color: colors.dangerText, flex: 1, fontSize: 13, lineHeight: 20 },
    discardCard: { alignItems: isLandscape ? 'center' : 'stretch', alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: isLandscape ? 'row' : 'column', gap: 12, maxWidth: 760, padding: 14, width: '100%' },
    discardCopy: { flex: 1, minWidth: 0 },
    discardTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
    discardHint: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    discardActions: { flexDirection: 'row', gap: 8 },
    keepEditingButton: { alignItems: 'center', borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
    keepEditingText: { color: colors.authPrimary, fontSize: 13, fontWeight: '600' },
    discardButton: { alignItems: 'center', backgroundColor: colors.dangerSurface, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
    discardButtonText: { color: colors.dangerText, fontSize: 13, fontWeight: '600' },
    saveButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: p.action, borderRadius: 18, justifyContent: 'center', maxWidth: 760, minHeight: 52, width: '100%' },
    saveButtonDisabled: { backgroundColor: colors.surfaceStrong },
    saveText: { ...typography.label, color: p.actionInk },
    saveTextDisabled: { color: colors.muted },
    pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  });
}
