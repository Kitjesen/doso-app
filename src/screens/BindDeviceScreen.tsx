import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { type ThemeColors, useAppTheme } from '../theme';
import { getDevicePageLayout } from './devicePageLayout';

type Props = {
  busy?: boolean;
  error?: string | null;
  onBack: () => void;
  onBind: (serialNumber: string, code: string) => void | Promise<void>;
};

type BindField = 'serial' | 'code';
type BindFieldErrors = Partial<Record<BindField, string>>;

export function validateBindDeviceFields(serialNumber: string, code: string) {
  const serial = serialNumber.trim().toUpperCase();
  const bindingCode = code.trim();
  const fieldErrors: BindFieldErrors = {};
  if (serial.length < 4) fieldErrors.serial = '请输入机身或包装上的完整序列号。';
  if (!/^[A-Z0-9]{6,32}$/i.test(bindingCode)) fieldErrors.code = '绑定码应为 6–32 位字母或数字。';
  return { serial, bindingCode, fieldErrors };
}

export function BindDeviceScreen({ busy = false, error, onBack, onBind }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState<number>();
  const layout = getDevicePageLayout({ width, height, insetLeft: insets.left, insetRight: insets.right, containerWidth });
  const isLandscape = layout.usesColumns;
  const isCompact = width < 360;
  const styles = createStyles(colors, isDark);
  const [serialNumber, setSerialNumber] = useState('');
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<BindFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<'serial' | 'code' | null>(null);
  const serialInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);
  const submitPendingRef = useRef(false);
  const locked = busy || submitting;
  const clearFieldError = (field: BindField) => {
    setFieldErrors(current => current[field] ? { ...current, [field]: undefined } : current);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submitPendingRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (busy || submitPendingRef.current) return;
    const { serial, bindingCode, fieldErrors: nextFieldErrors } = validateBindDeviceFields(serialNumber, code);
    if (nextFieldErrors.serial || nextFieldErrors.code) {
      setFieldErrors(nextFieldErrors);
      (nextFieldErrors.serial ? serialInputRef : codeInputRef).current?.focus();
      return;
    }
    submitPendingRef.current = true;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await onBind(serial, bindingCode);
    } catch {
      // The parent owns the network error so it can be rendered through `error`.
    } finally {
      submitPendingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, isCompact && styles.compactContent]} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" onLayout={({ nativeEvent }) => setContainerWidth(nativeEvent.layout.width)}>
          <View style={[styles.layout, isLandscape && [styles.landscapeLayout, { width: layout.contentWidth, gap: layout.gap }]]}>
            <View style={[styles.introPane, isLandscape && [styles.landscapeIntroPane, { width: layout.introWidth }]]}>
              <Pressable accessibilityHint={locked ? '退出后本次绑定结果将不会改变当前页面' : undefined} accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={styles.back}>
                <Ionicons color={colors.ink} name="chevron-back" size={22} />
              </Pressable>
              <View style={[styles.icon, isLandscape && styles.landscapeIcon]}><Ionicons color={p.blueInk} name="link-outline" size={27} /></View>
              <Text style={[styles.eyebrow, isLandscape && styles.landscapeEyebrow]}>DOSO SECURE BINDING</Text>
              <Text style={[styles.title, isCompact && styles.compactTitle, isLandscape && styles.landscapeTitle]}>绑定机器人</Text>
              <Text style={[styles.subtitle, isLandscape && styles.landscapeSubtitle]}>在机身或包装上找到序列号，输入随设备提供的一次性绑定码。</Text>
              <View style={[styles.note, isLandscape && styles.landscapeNote]}>
                <Ionicons color={p.blueInk} name="shield-checkmark-outline" size={18} />
                <Text style={[styles.noteText, isLandscape && styles.landscapeNoteText]}>请勿分享绑定码。绑定后，机器人连接成功才会显示实时状态。</Text>
              </View>
            </View>

            <View style={[styles.card, isLandscape && [styles.landscapeCard, { width: layout.detailsWidth }]]}>
          <Text style={styles.label}>设备序列号</Text>
          <TextInput
            accessibilityLabel="设备序列号"
            accessibilityHint={fieldErrors.serial ?? '输入机身或包装上的设备序列号'}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!locked}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => { setSerialNumber(value); clearFieldError('serial'); }}
            onFocus={() => setFocusedField('serial')}
            onSubmitEditing={() => codeInputRef.current?.focus()}
            placeholder="例如 DOSO-TH-000001"
            placeholderTextColor={colors.muted}
            ref={serialInputRef}
            returnKeyType="next"
            submitBehavior="submit"
            style={[styles.input, focusedField === 'serial' && styles.focusedInput, fieldErrors.serial && styles.invalidInput]}
            testID="bind-serial"
            value={serialNumber}
          />
          {fieldErrors.serial ? <Text accessibilityLiveRegion="polite" nativeID="bind-serial-error" selectable style={styles.fieldError}>{fieldErrors.serial}</Text> : null}
          <Text style={styles.label}>一次性绑定码</Text>
          <TextInput
            accessibilityLabel="一次性绑定码"
            accessibilityHint={fieldErrors.code ?? '输入随设备提供的 6 至 32 位一次性绑定码'}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!locked}
            maxLength={32}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => { setCode(value.replace(/[^a-z0-9]/gi, '').toUpperCase()); clearFieldError('code'); }}
            onFocus={() => setFocusedField('code')}
            onSubmitEditing={() => void submit()}
            placeholder="6–32 位字母或数字"
            placeholderTextColor={colors.muted}
            ref={codeInputRef}
            returnKeyType="done"
            style={[styles.input, code.length > 0 && styles.codeInput, focusedField === 'code' && styles.focusedInput, fieldErrors.code && styles.invalidInput]}
            testID="bind-code"
            textContentType="oneTimeCode"
            value={code}
          />
          {fieldErrors.code ? <Text accessibilityLiveRegion="polite" nativeID="bind-code-error" selectable style={styles.fieldError}>{fieldErrors.code}</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" selectable style={styles.serverError}>{error}</Text> : null}
          <GradientButton disabled={locked} loading={locked} label={locked ? '正在安全绑定…' : '绑定设备'} onPress={() => void submit()} variant="auth" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 36, paddingTop: 22 },
  compactContent: { paddingHorizontal: 16 },
  layout: { gap: 24 },
  landscapeLayout: { flexDirection: 'row', alignSelf: 'center', maxWidth: 960 },
  introPane: { minWidth: 0 },
  landscapeIntroPane: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingBottom: 4 },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  icon: { width: 48, height: 48, borderRadius: 24, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface },
  landscapeIcon: { height: 44, marginTop: 10, width: 44 },
  eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 16 },
  landscapeEyebrow: { marginTop: 10 },
  title: { ...typography.compactTitle, color: p.ink, marginTop: 8 },
  landscapeTitle: { marginTop: 4 },
  compactTitle: { ...typography.compactTitle },
  subtitle: { ...typography.supporting, color: p.secondary, marginTop: 10 },
  landscapeSubtitle: { marginTop: 6 },
  card: { backgroundColor: p.surface, borderRadius: cardLayout.radius, padding: cardLayout.inset, gap: cardLayout.gap },
  landscapeCard: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0, marginTop: 0, alignSelf: 'flex-start' },
  label: { ...typography.label, color: p.ink, marginTop: 4 },
  input: { ...typography.label, minHeight: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: p.canvas, color: p.ink, borderWidth: 0, borderColor: 'transparent' },
  codeInput: { fontWeight: '500', letterSpacing: 1.5 },
  focusedInput: { borderColor: colors.authFocus, borderWidth: 1.5 },
  invalidInput: { borderColor: colors.dangerText, borderWidth: 1.5 },
  fieldError: { color: colors.dangerText, fontSize: 13, lineHeight: 19, marginBottom: 2 },
  serverError: { color: colors.dangerText, backgroundColor: colors.dangerSurface, borderRadius: 12, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 },
  note: { flexDirection: 'row', gap: 10, paddingVertical: 12, backgroundColor: 'transparent', marginTop: 12 },
  landscapeNote: { marginTop: 8, paddingVertical: 8 },
  noteText: { ...typography.supporting, flex: 1, color: p.secondary },
  landscapeNoteText: { ...typography.supporting },
  });
};
