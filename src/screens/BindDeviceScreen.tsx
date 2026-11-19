import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { DeviceScanner } from '../components/DeviceScanner';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { type ThemeColors, useAppTheme } from '../theme';
import { getDevicePageLayout } from './devicePageLayout';
import { type RobotClaim } from '../features/robot-lifecycle/robotCode';

type Props = {
  busy?: boolean;
  error?: string | null;
  onBack: () => void;
  onFindNearby: () => void;
  onBind: (deviceId: string, code: string) => void | Promise<void>;
  expectedRobotId?: string | null;
};

export function BindDeviceScreen({ busy = false, error, onBack, onFindNearby, onBind, expectedRobotId }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState<number>();
  const layout = getDevicePageLayout({ width, height, insetLeft: insets.left, insetRight: insets.right, containerWidth });
  const isLandscape = layout.usesColumns;
  const isCompact = width < 360;
  const styles = createStyles(colors, isDark);
  const [claim, setClaim] = useState<RobotClaim | null>(null);
  const deviceId = claim?.deviceId;
  const mismatched = Boolean(deviceId && expectedRobotId && deviceId !== expectedRobotId);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scanActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const submitPendingRef = useRef(false);
  const locked = busy || submitting;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanActiveRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (!mountedRef.current || busy || scanActiveRef.current || submitPendingRef.current || !claim || mismatched) return;
    submitPendingRef.current = true;
    setSubmitting(true);
    try {
      await onBind(claim.deviceId, claim.code);
    } catch {
      // The parent owns the network error so it can be rendered through `error`.
    } finally {
      submitPendingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, isCompact && styles.compactContent]} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" onLayout={({ nativeEvent }) => setContainerWidth(nativeEvent.layout.width)}>
          <View style={[styles.layout, isLandscape && [styles.landscapeLayout, { width: layout.contentWidth, gap: layout.gap }]]}>
            <View style={[styles.introPane, isLandscape && [styles.landscapeIntroPane, { width: layout.introWidth }]]}>
              <Pressable accessibilityHint={locked ? '退出后本次绑定结果将不会改变当前页面' : undefined} accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={styles.back}>
                <Ionicons color={colors.ink} name="chevron-back" size={22} />
              </Pressable>
              <View style={[styles.icon, isLandscape && styles.landscapeIcon]}><Ionicons color={p.blueInk} name="link-outline" size={27} /></View>
              <Text style={[styles.eyebrow, isLandscape && styles.landscapeEyebrow]}>DOSO SECURE BINDING</Text>
              <Text style={[styles.title, isCompact && styles.compactTitle, isLandscape && styles.landscapeTitle]}>绑定机器人</Text>
              <Text style={[styles.subtitle, isLandscape && styles.landscapeSubtitle]}>将机器狗添加到当前账号，用于云端管理。借用或本地开发无需重新绑定。</Text>
              <View style={[styles.note, isLandscape && styles.landscapeNote]}>
                <Ionicons color={p.blueInk} name="shield-checkmark-outline" size={18} />
                <Text style={[styles.noteText, isLandscape && styles.landscapeNoteText]}>{expectedRobotId
                  ? `请扫描刚才连接的机器人专属二维码。设备尾号 ${expectedRobotId.slice(-6)}，身份仍待验证。`
                  : '扫描专属二维码后确认绑定，无需输入编号。设备身份仍待验证。'}</Text>
              </View>
            </View>

            <View style={[styles.card, isLandscape && [styles.landscapeCard, { width: layout.detailsWidth }]]}>
          {!deviceId ? <Pressable
            accessibilityLabel="查找附近机器人"
            accessibilityRole="button"
            accessibilityState={{ disabled: locked || scanning }}
            disabled={locked || scanning}
            onPress={() => { if (!locked && !scanning) onFindNearby(); }}
            style={[styles.scanButton, { backgroundColor: p.action }, (locked || scanning) && styles.locked]}
            testID="bind-nearby"
          >
            <Ionicons color={p.actionInk} name="bluetooth-outline" size={24} />
            <Text style={[styles.label, { color: p.actionInk }]}>查找附近机器人</Text>
          </Pressable> : null}
          {deviceId ? <View style={styles.identified}>
            <Ionicons color={p.blueInk} name="checkmark-circle-outline" size={24} />
            <Text style={[styles.label, { color: p.ink }]}>已识别绑定二维码</Text>
            <Text style={[styles.deviceSuffix, { color: p.secondary }]}>设备尾号 {deviceId.slice(-6)}</Text>
          </View> : null}
          <Pressable
            accessibilityLabel={deviceId ? '重新扫描' : '扫描专属绑定二维码'}
            accessibilityRole="button"
            accessibilityState={{ disabled: locked || scanning }}
            disabled={locked || scanning}
            onPress={() => {
              if (!mountedRef.current || locked || scanActiveRef.current) return;
              scanActiveRef.current = true;
              setScanning(true);
            }}
            style={[styles.scanButton, { backgroundColor: p.canvas }, locked && styles.locked]}
            testID="bind-scan"
          >
            <Ionicons color={p.blueInk} name="scan-outline" size={24} />
            <Text style={[styles.label, { color: p.blueInk }]}>{deviceId ? '重新扫描' : '扫描专属绑定二维码'}</Text>
          </Pressable>
          {deviceId ? <>
          {mismatched ? <Text accessibilityLiveRegion="polite" style={styles.serverError}>二维码与刚才读取的机器人编号不一致，请重新扫描这台机器人的专属二维码。</Text>
            : expectedRobotId ? <Text accessibilityLiveRegion="polite" style={styles.noteText}>二维码与刚才读取的机器人编号一致，设备身份仍待验证。</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" selectable style={styles.serverError}>{error}</Text> : null}
          <GradientButton disabled={locked || scanning || mismatched} loading={locked} label={locked ? '正在安全绑定…' : '确认绑定'} onPress={() => void submit()} variant="auth" />
          </> : null}
            </View>
          </View>
        </ScrollView>
      {scanning ? <DeviceScanner onClose={() => {
        scanActiveRef.current = false;
        if (mountedRef.current) setScanning(false);
      }} onScan={(nextClaim) => {
        if (!mountedRef.current || !scanActiveRef.current || locked || submitPendingRef.current) return;
        scanActiveRef.current = false;
        setClaim(nextClaim);
        setScanning(false);
      }} /> : null}
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
  scanButton: { minHeight: 80, borderRadius: 16, gap: 8, padding: 16, alignItems: 'center', justifyContent: 'center' },
  identified: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  deviceSuffix: { ...typography.caption },
  locked: { opacity: 0.5 },
  serverError: { color: colors.dangerText, backgroundColor: colors.dangerSurface, borderRadius: 12, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 },
  note: { flexDirection: 'row', gap: 10, paddingVertical: 12, backgroundColor: 'transparent', marginTop: 12 },
  landscapeNote: { marginTop: 8, paddingVertical: 8 },
  noteText: { ...typography.supporting, flex: 1, color: p.secondary },
  landscapeNoteText: { ...typography.supporting },
  });
};
