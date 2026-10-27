import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { type ThemeColors, useAppTheme } from '../theme';
import { getDevicePageLayout } from './devicePageLayout';

type Props = {
  capability: 'provisioning' | 'firmware';
  deviceName: string;
  onBack: () => void;
};

const CONTENT = {
  provisioning: {
    eyebrow: 'DOSO CONNECTIVITY',
    title: '网络与配网',
    icon: 'wifi-outline',
    status: '配网暂未开放',
    message: '此版本尚不支持设置机器人的 Wi-Fi，不会读取或发送你的网络密码。',
    detail: '网络连接功能开放后，你可以在这里完成配网。',
  },
  firmware: {
    eyebrow: 'DOSO FIRMWARE',
    title: '固件更新',
    icon: 'hardware-chip-outline',
    status: '固件更新暂未开放',
    message: '此版本尚不支持安装或回滚机器人固件，你的机器人不会因此发生更改。',
    detail: '当前无法检查更新，也不会将未知版本显示为“已是最新”。',
  },
} as const;

// Intentionally has no gateway, telemetry, or execute callback. Production and
// Design QA share this presentation without importing any simulator lifecycle.
export function DeviceUnavailableScreen({ capability, deviceName, onBack }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState<number>();
  const layout = getDevicePageLayout({ width, height, insetLeft: insets.left, insetRight: insets.right, containerWidth });
  const isLandscape = layout.usesColumns;
  const styles = createStyles(colors, isDark);
  const content = CONTENT[capability];

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, width < 360 && styles.compactContent]} onLayout={({ nativeEvent }) => setContainerWidth(nativeEvent.layout.width)}>
        <View style={[styles.layout, isLandscape && [styles.landscapeLayout, { width: layout.contentWidth, gap: layout.gap }]]}>
          <View style={[styles.introPane, isLandscape && [styles.landscapePane, { width: layout.introWidth }]]}>
            <Pressable accessibilityLabel="返回设备设置" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
              <Ionicons color={colors.ink} name="chevron-back" size={22} />
            </Pressable>
            <View style={[styles.identity, isLandscape && styles.landscapeIdentity]}>
              <View style={styles.icon}><Ionicons color={p.blueInk} name={content.icon} size={26} /></View>
              <Text style={styles.eyebrow}>{content.eyebrow}</Text>
              <Text accessibilityRole="header" style={styles.title}>{content.title}</Text>
              <Text style={styles.deviceName}>{deviceName}</Text>
            </View>
          </View>
          <View style={[styles.detailsPane, isLandscape && [styles.landscapePane, { width: layout.detailsWidth }]]}>
            <View style={styles.card}>
              <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusLabel}>暂不可用</Text></View>
              <Text accessibilityRole="header" style={styles.cardTitle}>{content.status}</Text>
              <Text style={styles.message}>{content.message}</Text>
              <View style={styles.divider} />
              <Text style={styles.detail}>{content.detail}</Text>
            </View>
            <GradientButton label="返回设备设置" onPress={onBack} variant="dark" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 28 },
  compactContent: { paddingHorizontal: 16 },
  layout: { gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' },
  landscapeLayout: { flexDirection: 'row' },
  introPane: { flex: 1, minWidth: 0 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  identity: { marginTop: 24, gap: 12 },
  landscapeIdentity: { marginTop: 16, gap: 8 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface },
  eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 4 },
  title: { ...typography.compactTitle, color: p.ink },
  deviceName: { ...typography.supporting, color: p.secondary },
  detailsPane: { flex: 1.15, minWidth: 0, gap: 16 },
  landscapePane: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  card: { padding: cardLayout.inset, borderRadius: cardLayout.radius, backgroundColor: p.surface, gap: cardLayout.gap },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  statusLabel: { ...typography.supporting, color: p.secondary },
  cardTitle: { ...typography.label, color: p.ink },
  message: { ...typography.supporting, color: p.secondary },
  divider: { height: 4, backgroundColor: 'transparent' },
  detail: { ...typography.supporting, color: p.secondary },
  });
};
