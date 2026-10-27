import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInputProps, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';

import { images } from '../assets';
import { AuthEntry, AuthEntryButton, AuthEntryError, AuthEntryField, entryStyles, useAuthEntryPalette } from '../components/AuthEntry';
import { useAppTheme } from '../theme';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type LoginFieldErrors = Partial<Record<'email' | 'password', string>>;

type LoginScreenProps = {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onCreateAccount?: () => void;
  onForgotPassword?: () => void;
  onOpenConnectionDiagnostics?: () => void;
  onOpenRobotConnection?: () => void;
  onEnterGuest?: () => void;
  onEnterDeviceTest?: () => void;
  onOpenDataPrivacy?: () => void;
  loading?: boolean;
  error?: string | null;
  fieldErrors?: LoginFieldErrors;
};

type AuthPageProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  onBack?: () => void;
  backDisabled?: boolean;
  compact?: boolean;
  variant?: 'default' | 'minimal';
  visualMode?: 'login' | 'register';
};

export function AuthPage({ title, subtitle, children, onBack, backDisabled = false, compact, visualMode }: AuthPageProps) {
  const insets = useSafeAreaInsets();
  const { colors: theme, isDark } = useAppTheme();
  const palette = useAuthEntryPalette();
  const { height, width, fontScale } = useWindowDimensions();
  const landscape = width > height && width - insets.left - insets.right >= 700 && fontScale <= 1.35;
  const safeWidth = landscape ? width : Math.max(0, width - insets.left - insets.right);

  useEffect(() => {
    if (!visualMode) return undefined;
    void SystemUI.setBackgroundColorAsync(palette.background);
    return () => {
      void SystemUI.setBackgroundColorAsync(theme.background);
    };
  }, [palette.background, theme.background, visualMode]);

  if (visualMode) {
    return (
      <SafeAreaView edges={landscape ? ['top', 'bottom'] : ['top', 'left', 'right', 'bottom']} style={[authStyles.safeArea, { backgroundColor: palette.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={authStyles.keyboardView}>
          <ScrollView bounces={false} contentContainerStyle={[authStyles.visualScroll, landscape && authStyles.visualScrollLandscape, { minHeight: Math.max(landscape ? 360 : 720, height - insets.top - insets.bottom) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <LinearGradient colors={[palette.background, palette.background]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[authStyles.visualShell, landscape && authStyles.visualShellLandscape, visualMode === 'register' && landscape && authStyles.visualShellRegisterLandscape, landscape && { width: safeWidth }]}>
              <View style={[
                authStyles.visualIntro,
                visualMode === 'login' && authStyles.visualIntroLogin,
                visualMode === 'register' && !landscape && authStyles.visualIntroRegister,
                landscape && authStyles.visualIntroLandscape,
                visualMode === 'login' && landscape && authStyles.visualIntroLoginLandscape,
                visualMode === 'register' && landscape && authStyles.visualIntroRegisterLandscape,
              ]}>
                {visualMode === 'login' ? (
                  <Image
                    accessibilityLabel="大算机器人 DOSO 登录"
                    resizeMode="stretch"
                    source={landscape ? images.loginHeroLandscape : isDark ? images.loginHeroDark : images.loginHeroLight}
                    style={landscape ? authStyles.loginHeroLandscape : authStyles.loginHeroPortrait}
                  />
                ) : (
                  <Image
                    accessibilityLabel="创建 DOSO 账户"
                    resizeMode="stretch"
                    source={landscape ? images.registerHeroLandscape : isDark ? images.registerHeroDark : images.registerHeroLight}
                    style={landscape ? authStyles.registerHeroLandscape : authStyles.registerHeroPortrait}
                  />
                )}
              </View>
              <View style={[authStyles.visualPanel, { backgroundColor: palette.background }, landscape && authStyles.visualPanelLandscape, visualMode === 'login' && landscape && authStyles.visualPanelLoginLandscape, visualMode === 'register' && landscape && authStyles.visualPanelRegisterLandscape]}>
                {!landscape ? <View style={[authStyles.sheetHandle, { backgroundColor: palette.surface }]} /> : null}
                <View style={[authStyles.visualFormContent, landscape && authStyles.visualFormContentLandscape]}>{children}</View>
              </View>
            </LinearGradient>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[authStyles.safeArea, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={authStyles.keyboardView}>
        <ScrollView bounces={false} contentContainerStyle={[authStyles.scrollContent, compact && authStyles.scrollContentCompact, landscape && authStyles.scrollContentLandscape]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[authStyles.content, landscape && authStyles.contentLandscape]}>
            <View style={[authStyles.defaultIntro, landscape && authStyles.defaultIntroLandscape]}>
              {onBack ? (
                <Pressable
                  accessibilityLabel="返回"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: backDisabled }}
                  disabled={backDisabled}
                  hitSlop={10}
                  onPress={onBack}
                  style={({ pressed }) => [authStyles.backButton, { backgroundColor: palette.input }, backDisabled && authStyles.backButtonDisabled, pressed && !backDisabled && entryStyles.pressed]}
                >
                  <Ionicons color={palette.ink} name="chevron-back" size={22} />
                </Pressable>
              ) : null}
              <View style={[authStyles.heading, onBack && authStyles.headingWithBack]}>
                <Text accessibilityRole="header" style={[authStyles.pageTitle, { color: palette.ink }]}>{title}</Text>
                <Text style={[authStyles.pageSubtitle, { color: palette.secondary }]}>{subtitle}</Text>
              </View>
            </View>
            <View style={[authStyles.defaultForm, landscape && authStyles.defaultFormLandscape]}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type AuthFieldProps = TextInputProps & { error?: string; secure?: boolean; label?: string; appearance?: 'filled' | 'outlined' };

export function AuthField({ appearance, error, secure, label, onBlur, onFocus, style, ...inputProps }: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const palette = useAuthEntryPalette();
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  return (
    <View style={[authStyles.fieldBlock, landscape && authStyles.fieldBlockLandscape]}>
      {label ? <Text style={[authStyles.fieldLabel, landscape && authStyles.fieldLabelLandscape, { color: palette.ink }]}>{label}</Text> : null}
      <View style={[authStyles.field, appearance === 'outlined' && authStyles.fieldOutlined, landscape && authStyles.fieldLandscape, { backgroundColor: palette.input, borderColor: error ? palette.dangerText : focused ? palette.accent : 'transparent' }, focused && !error && entryStyles.focused]}>
        <TextInput accessibilityLabel={label} accessibilityHint={error} placeholderTextColor={palette.placeholder} secureTextEntry={secure && !visible} style={[authStyles.input, landscape && authStyles.inputLandscape, { color: palette.ink }, secure && authStyles.inputSecure, style]} {...inputProps} onBlur={(event) => { setFocused(false); onBlur?.(event); }} onFocus={(event) => { setFocused(true); onFocus?.(event); }} />
        {secure ? <Pressable accessibilityLabel={visible ? '隐藏密码' : '显示密码'} accessibilityRole="button" accessibilityState={{ disabled: inputProps.editable === false, selected: visible }} disabled={inputProps.editable === false} onPress={() => { if (inputProps.editable !== false) setVisible((current) => !current); }} style={[authStyles.eyeButton, landscape && authStyles.eyeButtonLandscape]}><Ionicons color={palette.secondary} name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} /></Pressable> : null}
      </View>
      {error ? <Text selectable accessibilityLiveRegion="polite" style={[authStyles.fieldErrorText, { color: palette.dangerText }]}>{error}</Text> : null}
    </View>
  );
}

export function AuthError({ message }: { message?: string | null }) {
  const palette = useAuthEntryPalette();
  return message ? <Text selectable accessibilityLiveRegion="polite" style={[authStyles.formError, { color: palette.dangerText, backgroundColor: palette.dangerSurface }]}>{message}</Text> : null;
}

export function LoginScreen({ onLogin, onCreateAccount, onForgotPassword, onOpenConnectionDiagnostics, onOpenRobotConnection, onEnterGuest, onEnterDeviceTest, onOpenDataPrivacy, loading = false, error, fieldErrors }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErrors, setLocalErrors] = useState<LoginFieldErrors>({});
  const [dismissedErrors, setDismissedErrors] = useState<LoginFieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState<'email' | null>(null);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const palette = useAuthEntryPalette();
  const busy = loading || pending !== null;
  const errors: LoginFieldErrors = {};
  for (const key of ['email', 'password'] as const) {
    errors[key] = localErrors[key] ?? (dismissedErrors[key] === fieldErrors?.[key] ? undefined : fieldErrors?.[key]);
  }
  const clear = (key: keyof LoginFieldErrors) => {
    setLocalErrors(current => ({ ...current, [key]: undefined }));
    setDismissedErrors(current => ({ ...current, [key]: fieldErrors?.[key] }));
    setRequestError(null);
  };
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const navigate = (action?: () => void) => { if (!busy && !requestInFlightRef.current) action?.(); };
  const submit = async () => {
    if (busy || requestInFlightRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    const next: LoginFieldErrors = {};
    if (!normalizedEmail) next.email = '请输入邮箱地址';
    else if (!EMAIL_PATTERN.test(normalizedEmail)) next.email = '请输入有效的邮箱地址';
    if (!password) next.password = '请输入密码';
    setLocalErrors(next);
    setDismissedErrors({});
    setRequestError(null);
    if (Object.keys(next).length) {
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    requestInFlightRef.current = true;
    setPending('email');
    try { await onLogin(normalizedEmail, password); }
    catch (caught) {
      if (mountedRef.current) setRequestError(caught instanceof Error ? caught.message : '登录失败，请稍后重试。');
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  };
  return (
    <AuthEntry mode="login" busy={busy} onSwitch={onCreateAccount ? () => navigate(onCreateAccount) : undefined}>
      {(inlineIdentity) => <>
        <AuthEntryError message={requestError ?? error} />
        <View style={entryStyles.fields}>
          <AuthEntryField accessibilityLabel="邮箱地址" autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!busy} error={errors.email} icon="mail-outline" inputRef={emailRef} keyboardType="email-address" label="邮箱" onChangeText={value => { setEmail(value); clear('email'); }} onSubmitEditing={() => passwordRef.current?.focus()} placeholder="输入邮箱地址" returnKeyType="next" submitBehavior="submit" testID="login-email" textContentType="emailAddress" value={email} />
          <AuthEntryField autoCapitalize="none" autoComplete="password" autoCorrect={false} editable={!busy} error={errors.password} icon="lock-closed-outline" inputRef={passwordRef} label="密码" onChangeText={value => { setPassword(value); clear('password'); }} onSubmitEditing={submit} placeholder="输入密码" returnKeyType="done" secure testID="login-password" textContentType="password" value={password} visibilityTestID="login-password-visibility" />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !onForgotPassword }} disabled={busy || !onForgotPassword} onPress={() => navigate(onForgotPassword)} style={entryStyles.forgot} testID="login-forgot-password"><Text style={[entryStyles.link, { color: palette.accent }]}>忘记密码？</Text></Pressable>
        <AuthEntryButton busy={busy} loading={busy} label={busy ? '正在登录…' : '登录'} onPress={submit} testID="login-submit" />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 4 }}>
          {onEnterDeviceTest ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onEnterDeviceTest)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44 }} testID="login-device-test"><Text style={[entryStyles.link, { color: palette.accent }]}>进入设备测试</Text></Pressable> : onOpenRobotConnection ? <Pressable accessibilityHint="仅检查局域网机器人状态，不登录、绑定或获取控制权" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onOpenRobotConnection)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44 }} testID="login-robot-connection"><Text style={[entryStyles.link, { color: palette.accent }]}>连接机器狗</Text></Pressable> : null}
          {onEnterGuest ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onEnterGuest)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44 }} testID="login-guest"><Text style={[entryStyles.link, { color: palette.accent }]}>游客使用</Text></Pressable> : null}
        </View>
        {!inlineIdentity && onOpenDataPrivacy ? <Pressable accessibilityHint="查看当前功能涉及的数据范围" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => navigate(onOpenDataPrivacy)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 }} testID="login-data-privacy"><Text style={[entryStyles.link, { color: palette.secondary }]}>数据与隐私</Text></Pressable> : null}
        {!inlineIdentity && onOpenConnectionDiagnostics ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigate(onOpenConnectionDiagnostics)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 }} testID="login-connection-diagnostics"><Text style={[entryStyles.link, { color: palette.accent }]}>连接诊断</Text></Pressable> : null}
      </>}
    </AuthEntry>
  );
}

export const authStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FCFCFD' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 20, paddingBottom: 32, paddingTop: 24 },
  scrollContentCompact: { justifyContent: 'flex-start', paddingTop: 24 },
  scrollContentLandscape: { paddingTop: 24 },
  content: { alignSelf: 'center', maxWidth: 440, width: '100%' },
  contentLandscape: { alignItems: 'flex-start', flexDirection: 'row', gap: 32, maxWidth: 760 },
  defaultIntro: { width: '100%' }, defaultIntroLandscape: { flexShrink: 0, width: 240 },
  defaultForm: { width: '100%' }, defaultFormLandscape: { flex: 1, maxWidth: 440, minWidth: 0 },
  backButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center', borderRadius: 22, width: 44 },
  backButtonDisabled: { opacity: 0.42 },
  heading: { marginBottom: 24 },
  headingWithBack: { marginTop: 24 },
  pageTitle: { color: '#253441', fontSize: 24, fontWeight: '500', letterSpacing: -0.5, lineHeight: 32 },
  pageSubtitle: { color: '#586675', fontSize: 13, fontWeight: '400', lineHeight: 20, marginTop: 8 },
  visualScroll: { flexGrow: 1 }, visualScrollLandscape: { minWidth: '100%' }, visualShell: { flex: 1, minHeight: '100%' },
  visualShellLandscape: { flexDirection: 'row', minWidth: 0, paddingBottom: 14, paddingHorizontal: 20, paddingTop: 11 },
  visualShellRegisterLandscape: { paddingBottom: 0, paddingHorizontal: 0, paddingTop: 0, position: 'relative' },
  visualIntro: { height: 230, paddingHorizontal: 22, paddingTop: 48, position: 'relative', zIndex: 2 },
  visualIntroLogin: { height: 209, paddingHorizontal: 0, paddingTop: 0 },
  visualIntroRegister: { height: 152, paddingHorizontal: 0, paddingTop: 0 },
  visualIntroLandscape: { flex: 1, height: '100%', minHeight: 332, paddingHorizontal: 22, paddingTop: 56 },
  visualIntroLoginLandscape: { flexBasis: 433, flexGrow: 0, flexShrink: 0, height: 331, minHeight: 0, paddingHorizontal: 0, paddingTop: 0 },
  visualIntroRegisterLandscape: { flexBasis: 433, flexGrow: 0, flexShrink: 0, height: 327, left: 20, minHeight: 0, paddingHorizontal: 0, paddingTop: 0, position: 'absolute', top: 11, width: 433 },
  loginHeroPortrait: { height: 209, width: 390 },
  loginHeroLandscape: { height: 327, width: 433 },
  registerHeroPortrait: { height: 152, width: 390 },
  registerHeroLandscape: { height: 327, width: 433 },
  identityRow: { alignItems: 'center', flexDirection: 'row' }, identityLogo: { backgroundColor: '#FFFFFF', borderRadius: 12, height: 46, width: 118 },
  visualHeading: { marginTop: 34, maxWidth: 220 }, visualHeadingLandscape: { marginTop: 13, maxWidth: 205 }, visualHeadingRegisterLandscape: { maxWidth: 182 },
  visualTitle: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 }, visualTitleRegisterLandscape: { fontSize: 24, lineHeight: 30 }, visualSubtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  robotArtworkImage: { bottom: -19, height: 205, position: 'absolute', right: -18, width: 260 }, robotArtworkImageLandscape: { bottom: 17, height: 245, right: -31, width: 290 },
  visualPanel: { borderTopLeftRadius: 42, borderTopRightRadius: 42, flex: 1, minHeight: 555, paddingHorizontal: 23, paddingTop: 10, width: '100%' },
  visualPanelLandscape: { alignSelf: 'stretch', borderRadius: 30, flexBasis: 353, flexGrow: 0, flexShrink: 0, marginLeft: 18, minHeight: 0, paddingHorizontal: 24, paddingTop: 20, width: 353 },
  visualPanelLoginLandscape: { transform: [{ translateX: 18 }] },
  visualPanelRegisterLandscape: { height: 327, left: 471, marginLeft: 0, position: 'absolute', top: 11 },
  sheetHandle: { alignSelf: 'center', borderRadius: 999, height: 8, marginBottom: 18, width: 52 }, visualFormContent: { alignSelf: 'center', flex: 1, maxWidth: 440, width: '100%' }, visualFormContentLandscape: { justifyContent: 'flex-start', maxWidth: 400, paddingTop: 0 },
  formError: { borderRadius: 16, fontSize: 13, lineHeight: 20, marginBottom: 12, padding: 12 }, formErrorDark: { backgroundColor: '#381D23', color: '#FF9BA4' },
  fieldBlock: { marginBottom: 18 }, fieldBlockLandscape: { marginBottom: 14 }, fieldLabel: { color: '#171C24', fontSize: 15, fontWeight: '500', lineHeight: 21, marginBottom: 6 }, fieldLabelLandscape: { marginBottom: 6 }, fieldLabelInline: { color: '#171C24', fontSize: 15, fontWeight: '500', lineHeight: 21 },
  field: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 48 }, fieldOutlined: { borderRadius: 16 }, fieldLandscape: { minHeight: 48 }, fieldFocused: { borderColor: '#0066FF' }, fieldError: { borderColor: '#B52E42' }, fieldErrorText: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  input: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 17, lineHeight: 24, paddingHorizontal: 14, paddingVertical: 10 }, inputLandscape: { minHeight: 46 }, inputSecure: { paddingRight: 0 }, eyeButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center', width: 44 }, eyeButtonLandscape: { minHeight: 48, width: 44 },
  passwordLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }, forgotRow: { alignItems: 'flex-end', marginBottom: 33, marginTop: -10 }, forgotRowLandscape: { marginBottom: 6, marginTop: -12 }, linkText: { color: '#187454', fontSize: 14, fontWeight: '600', lineHeight: 20 }, dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 18, marginTop: 32 }, dividerRowLandscape: { gap: 10, marginBottom: 7, marginTop: 8 }, dividerLine: { backgroundColor: '#EAECF0', flex: 1, height: 1 }, dividerText: { color: '#667085', fontSize: 13, lineHeight: 18 }, dividerTextLandscape: { fontSize: 10, lineHeight: 12 },
  visualPrimaryButton: { borderRadius: 999, overflow: 'hidden' }, socialLandscape: { marginTop: 0 }, socialPlateLandscape: { borderRadius: 999, height: 42, justifyContent: 'center' }, registerSocialLandscape: { marginTop: 0 }, registerSocialPortrait: { borderRadius: 999, height: 46, justifyContent: 'center' }, registerSocialPortraitDark: { borderColor: '#343D49', borderWidth: 1 },
  footerRow: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 79 }, footerRowLandscape: { marginTop: 12 }, registerFooterLandscape: { marginTop: 16 }, registerFooterPortrait: { marginTop: 29 }, footerPrompt: { color: '#667085', fontSize: 14, lineHeight: 20 },
  registerFieldsRowLandscape: { flexDirection: 'row', gap: 12 }, registerFieldColumnLandscape: { flex: 1 }, registerFieldGapPortrait: { marginBottom: 16 }, registerPasswordLandscape: { marginTop: 9 }, registerForgotRowPortrait: { marginBottom: 23 }, registerForgotRowLandscape: { marginBottom: 10, marginTop: -12 },
  success: { backgroundColor: '#ECFDF3', borderRadius: 10, color: '#067647', fontSize: 14, lineHeight: 21, marginBottom: 16, padding: 14 }, helper: { color: '#616B79', fontSize: 13, lineHeight: 20, marginBottom: 18 },
});
