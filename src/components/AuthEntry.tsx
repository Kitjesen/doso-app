import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type TextInputProps, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProductAppearance } from '../appearance';
import { getSocialLoginReadiness, type SocialLoginProvider } from '../services/socialAuthService';
import { useAppTheme } from '../theme';
import { officialDark } from '../officialPalette';
import { SocialLoginFeedback, useSocialLoginAction } from './SocialLoginFeedback';
import { LoginSurface } from './LoginSurface';

export function useAuthEntryPalette() {
  // Official auth 01-08 is always the black canvas and light pill CTA.
  useAppTheme();
  useProductAppearance();
  return {
    isDark: true,
    background: officialDark.canvas,
    surface: officialDark.surface,
    input: officialDark.field,
    ink: officialDark.ink,
    inkSoft: officialDark.muted,
    secondary: officialDark.muted,
    muted: officialDark.muted,
    placeholder: officialDark.placeholder,
    border: officialDark.line,
    accent: officialDark.ink,
    authFocus: officialDark.cta,
    button: officialDark.cta,
    buttonInk: officialDark.ctaInk,
    authPrimary: officialDark.cta,
    authPrimaryInk: officialDark.ctaInk,
    quiet: officialDark.surface,
    surfaceStrong: officialDark.surface,
    dangerText: '#FF9BA4',
    dangerSurface: '#381D23',
  };
}

type AuthEntryProps = {
  mode: 'login' | 'register';
  busy: boolean;
  onSwitch?: () => void;
  children: (inlineIdentity: boolean) => ReactNode;
};

function useCompactWideAuthLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return width - insets.left - insets.right >= 720 && height <= 500 && fontScale <= 1.35;
}

export function AuthEntry({ mode, busy, onSwitch, children }: AuthEntryProps) {
  const register = mode === 'register';
  return <LoginSurface mode={register ? 'register' : 'login'} busy={busy} onRegister={onSwitch}>{children(false)}</LoginSurface>;
}

type EntryFieldProps = TextInputProps & {
  label: string;
  icon: 'person-outline' | 'mail-outline' | 'lock-closed-outline';
  inputRef: RefObject<TextInput | null>;
  error?: string;
  secure?: boolean;
  hint?: string;
  visibilityTestID?: string;
  variant?: 'glass';
};

export function AuthEntryField({ label, icon, inputRef, error, hint, secure = false, editable = true, visibilityTestID, variant, ...inputProps }: EntryFieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const palette = useAuthEntryPalette();
  const glass = variant === 'glass';
  const ink = glass ? (officialDark.ink) : palette.ink;
  const secondary = glass ? (officialDark.muted) : palette.secondary;
  return (
    <View style={entryStyles.fieldGroup}>
      <View style={entryStyles.labelRow}>
        <Text nativeID={inputProps.testID + '-label'} style={[entryStyles.label, glass && entryStyles.glassLabel, { color: ink }]}>{label}</Text>
        {hint ? <Text style={[entryStyles.hint, { color: palette.secondary }]}>{hint}</Text> : null}
      </View>
      <View style={[entryStyles.inputFrame, glass && entryStyles.glassField, { backgroundColor: glass ? (officialDark.field) : palette.input, borderColor: error ? palette.dangerText : focused ? palette.accent : 'transparent' }, focused && !error && entryStyles.focused]}>
        <Ionicons color={secondary} name={icon} size={glass ? 18 : 21} style={entryStyles.fieldIcon} />
        <TextInput {...inputProps} accessibilityLabel={inputProps.accessibilityLabel ?? label} accessibilityLabelledBy={inputProps.testID + '-label'} accessibilityHint={error ?? hint} editable={editable} multiline={false} numberOfLines={1} onBlur={event => { setFocused(false); inputProps.onBlur?.(event); }} onFocus={event => { setFocused(true); inputProps.onFocus?.(event); }} placeholderTextColor={glass ? secondary : palette.placeholder} ref={inputRef} secureTextEntry={secure && !visible} style={[entryStyles.input, glass && entryStyles.glassInput, { color: ink }]} />
        {secure ? <Pressable accessibilityLabel={visible ? '隐藏密码' : '显示密码'} accessibilityRole="button" accessibilityState={{ disabled: !editable, selected: visible }} disabled={!editable} onPress={() => { if (editable) setVisible(value => !value); }} style={entryStyles.eye} testID={visibilityTestID}>
          <Ionicons color={secondary} name={visible ? 'eye-off-outline' : 'eye-outline'} size={glass ? 20 : 22} />
        </Pressable> : null}
      </View>
      {error ? <Text selectable accessibilityLiveRegion="polite" style={[entryStyles.hint, { color: palette.dangerText }]}>{error}</Text> : null}
    </View>
  );
}

export function AuthEntryError({ message }: { message?: string | null }) {
  const palette = useAuthEntryPalette();
  return message ? <Text accessibilityLiveRegion="polite" selectable style={[entryStyles.error, { color: palette.dangerText, backgroundColor: palette.dangerSurface }]}>{message}</Text> : null;
}

export function AuthEntryButton({ busy, loading = busy, label, onPress, testID, variant }: { busy: boolean; loading?: boolean; label: string; onPress: () => void; testID: string; variant?: 'glass' }) {
  const palette = useAuthEntryPalette();
  const compactWide = useCompactWideAuthLayout();
  const glass = variant === 'glass';
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled: busy, busy: loading }} disabled={busy} onPress={() => { if (!busy) return onPress(); }} style={({ pressed }) => [entryStyles.primary, compactWide && entryStyles.primaryWide, glass && entryStyles.glassButton, { backgroundColor: busy ? palette.quiet : glass ? ('#F0F4FE') : palette.button }, pressed && !busy && entryStyles.pressed]} testID={testID}>
    {loading ? <ActivityIndicator color={palette.accent} size="small" /> : null}
    <Text accessibilityLiveRegion={loading ? 'polite' : 'none'} style={[entryStyles.primaryLabel, glass && entryStyles.glassButtonLabel, { color: busy ? palette.accent : glass ? ('#1C1C1B') : palette.buttonInk }]}>{label}</Text>
  </Pressable>;
}

const providers = [
  { id: 'apple', label: 'Apple', icon: 'apple', size: 25 },
  { id: 'wechat', label: '微信', icon: 'weixin', size: 26 },
  { id: 'qq', label: 'QQ', icon: 'qq', size: 24 },
] as const;

export function AuthEntrySocial({ mode, busy: parentBusy, activeProvider: parentActiveProvider, onPress }: { mode: 'login' | 'register'; busy: boolean; activeProvider: SocialLoginProvider | null; onPress?: (provider: SocialLoginProvider) => void | Promise<void> }) {
  const palette = useAuthEntryPalette();
  const compactWide = useCompactWideAuthLayout();
  const { busy, activeProvider, run } = useSocialLoginAction({ busy: parentBusy, activeProvider: parentActiveProvider, onPress });
  const actions = providers.map(provider => {
    const readiness = getSocialLoginReadiness(provider.id);
    const unavailable = !readiness.ready || !onPress;
    const selected = busy && !unavailable && activeProvider === provider.id;
    const disabled = busy || unavailable;
    return <Pressable accessibilityLabel={`使用 ${provider.label} 登录`} accessibilityRole="button" accessibilityHint={unavailable ? `${readiness.blockerMessage ?? '请使用邮箱登录'} 可展开登录方式说明。` : selected ? '正在打开账户授权' : busy ? '正在处理其他登录方式' : '打开第三方账户授权'} accessibilityState={{ disabled, selected, busy: selected }} accessibilityValue={{ text: unavailable ? '暂未开放' : selected ? '正在打开授权' : busy ? '正在处理其他登录方式' : '可用' }} disabled={disabled} key={provider.id} onPress={() => run(provider.id)} style={({ pressed }) => [entryStyles.socialAction, compactWide && entryStyles.socialActionWide, pressed && !disabled && entryStyles.pressed]} testID={`${mode}-social-${provider.id}`}>
      <View style={[entryStyles.socialTile, compactWide && entryStyles.socialTileWide, { backgroundColor: selected ? palette.quiet : palette.input }]}>
        {selected ? <ActivityIndicator color={palette.accent} size="small" /> : <FontAwesome color={unavailable ? palette.placeholder : palette.ink} name={provider.icon} size={compactWide ? Math.min(provider.size, 23) : provider.size} />}
      </View>
      {!compactWide ? <Text style={[entryStyles.socialLabel, { color: palette.secondary }]}>{provider.label}</Text> : null}
    </Pressable>;
  });
  const feedback = <SocialLoginFeedback activeProvider={activeProvider} busy={busy} hasAction={Boolean(onPress)} palette={palette} testID={`${mode}-social-help`} />;
  if (compactWide) return <><View style={entryStyles.socialSectionWide} testID="auth-social-options">
    <View style={[entryStyles.dividerLine, { backgroundColor: palette.border }]} />
    <Text style={[entryStyles.dividerLabel, { color: palette.secondary }]}>其他方式</Text>
    <View style={entryStyles.socialRowWide} testID="auth-social-row">{actions}</View>
  </View>{feedback}</>;
  return <>
    <View style={entryStyles.divider} testID="auth-social-options"><View style={[entryStyles.dividerLine, { backgroundColor: palette.border }]} /><Text style={[entryStyles.dividerLabel, { color: palette.secondary }]}>其他方式</Text><View style={[entryStyles.dividerLine, { backgroundColor: palette.border }]} /></View>
    <View style={entryStyles.socialRow} testID="auth-social-row">{actions}</View>
    {feedback}
  </>;
}

export const entryStyles = StyleSheet.create({
  safe: { flex: 1 }, scroll: { flexGrow: 1 }, page: { alignSelf: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14, minHeight: 64 },
  headerWide: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 4, minHeight: 44 },
  logo: { width: 124, height: 42 }, logoDark: { tintColor: '#98D1FF' },
  switchAction: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'flex-end', flexDirection: 'row', gap: 4 },
  switchLabel: { fontSize: 17, lineHeight: 24 }, wideBody: { flexDirection: 'row', alignItems: 'flex-start' },
  hero: { height: 200, overflow: 'hidden', position: 'relative' }, heroWide: { height: 290 }, heroNarrow: { height: 312 },
  heroLargeText: { height: 'auto', paddingBottom: 18 }, headlineLargeText: { maxWidth: '100%', paddingRight: 20 },
  decorativeHidden: { display: 'none' },
  productPlate: { position: 'absolute', top: 10, right: 22, width: '48%', height: 150, borderRadius: 24 },
  productPlateWide: { top: 96, right: 0, width: '100%', height: 152 },
  productPlateNarrow: { top: 110, right: 22, width: 230, height: 144 },
  robot: { position: 'absolute', top: 12 }, robotWide: { top: 88, right: 0, width: '100%', height: 176 },
  robotNarrow: { top: 106, right: 16, width: 244, height: 160 },
  headline: { fontSize: 24, lineHeight: 32, fontWeight: '500', letterSpacing: -0.5, paddingLeft: 20, marginTop: 16, maxWidth: 195 },
  headlineWide: { paddingLeft: 0, marginTop: 8 },
  form: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }, formWide: { paddingHorizontal: 0, paddingTop: 0 },
  fieldGroup: { gap: 6 }, labelRow: { alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row', gap: 8 },
  glassLabel: { fontSize: 18, lineHeight: 28 },
  glassField: { minHeight: 52, borderRadius: 14 },
  glassInput: { fontSize: 16, lineHeight: 24 },
  glassButton: { borderRadius: 14, marginTop: 8 },
  glassButtonLabel: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '500' }, hint: { fontSize: 13, lineHeight: 20 },
  inputFrame: { minHeight: 48, borderWidth: 1, borderRadius: 16, alignItems: 'center', flexDirection: 'row' },
  focused: { borderWidth: 2 }, fieldIcon: { marginLeft: 12, marginRight: 10 },
  input: { minHeight: 44, flex: 1, minWidth: 0, fontSize: 17, lineHeight: 24, paddingVertical: 9, paddingRight: 10, paddingLeft: 0 },
  eye: { minHeight: 48, width: 44, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: 12 }, identityRow: { flexDirection: 'row' }, identityField: { flex: 1, minWidth: 0 },
  passwordGroup: { marginTop: 12, gap: 8 }, passwordHint: { fontSize: 13, lineHeight: 20 },
  primary: { minHeight: 52, marginTop: 20, padding: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryWide: { marginTop: 12 },
  primaryLabel: { fontSize: 17, fontWeight: '500', lineHeight: 25 },
  error: { fontSize: 13, lineHeight: 20, padding: 12, borderRadius: 16, marginBottom: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 20, marginTop: 24, marginBottom: 24 },
  dividerLine: { flex: 1, height: 1 }, dividerLabel: { fontSize: 14, lineHeight: 20 },
  socialRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 12 },
  socialSectionWide: { minHeight: 44, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  socialRowWide: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  socialAction: { alignItems: 'center', gap: 8, minWidth: 64, minHeight: 76 },
  socialActionWide: { justifyContent: 'center', minWidth: 44, minHeight: 44 },
  socialTile: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  socialTileWide: { width: 44, height: 44, borderRadius: 22 },
  socialLabel: { fontSize: 14, lineHeight: 20 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  forgot: { minHeight: 44, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  link: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
});
