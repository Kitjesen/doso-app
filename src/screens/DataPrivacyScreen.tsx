import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

type Props = {
  onBack: () => void;
};

const FSD_MATTE = {
  canvas: '#141414',
  sheet: '#1D1D1D',
  well: '#242424',
  divider: 'rgba(255, 255, 255, 0.08)',
  ink: '#F2F2F2',
  muted: '#9A9A9A',
} as const;

const SECTIONS = [
  {
    icon: 'wifi-outline' as const,
    title: '连接与地址',
    body: '连接记录仅保存在本机安全存储中，断开连接即可随时清除。',
  },
  {
    icon: 'videocam-outline' as const,
    title: '实时画面',
    body: '仅在打开操控或查看画面时按需拉流，不在后台静默运行。',
  },
  {
    icon: 'bluetooth-outline' as const,
    title: '蓝牙与定位',
    body: '仅在主动扫描附近设备时使用系统蓝牙与定位权限，不采集或上传手机位置。',
  },
  {
    icon: 'options-outline' as const,
    title: '本机偏好',
    body: '外观主题、摇杆布局与提醒设置仅保存在本机，不上传个人数据。',
  },
];

export function DataPrivacyScreen({ onBack }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  const horizontalInset = landscape ? 24 : 20;
  const contentPadding = {
    paddingLeft: horizontalInset + insets.left,
    paddingRight: horizontalInset + insets.right,
  };

  const bg = isDark ? FSD_MATTE.canvas : colors.background;
  const sheetBg = isDark ? FSD_MATTE.sheet : colors.surface;
  const wellBg = isDark ? FSD_MATTE.well : '#EFEFEF';
  const dividerCol = isDark ? FSD_MATTE.divider : colors.line;
  const inkCol = isDark ? FSD_MATTE.ink : colors.ink;
  const mutedCol = isDark ? FSD_MATTE.muted : colors.muted;

  return (
    <View style={[styles.root, { backgroundColor: bg }]} testID="data-privacy-screen">
      <View style={[styles.header, contentPadding, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityHint="返回之前的页面"
          accessibilityLabel="返回"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: wellBg }, pressed && styles.pressed]}
          testID="data-privacy-back"
        >
          <Ionicons color={inkCol} name="chevron-back" size={21} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: inkCol }]}>数据与隐私</Text>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.headerBalance} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          contentPadding,
          { paddingBottom: Math.max(28, insets.bottom + 20) },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.contentColumn}>
          <View style={[styles.groupCard, { backgroundColor: sheetBg, borderColor: dividerCol }]}>
            {SECTIONS.map((section, index) => (
              <View
                key={section.title}
                style={[
                  styles.sectionRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: dividerCol },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: wellBg }]}>
                  <Ionicons color={inkCol} name={section.icon} size={17} />
                </View>
                <View style={styles.sectionCopy}>
                  <Text selectable style={[styles.sectionTitle, { color: inkCol }]}>{section.title}</Text>
                  <Text selectable style={[styles.sectionBody, { color: mutedCol }]}>{section.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingBottom: 10,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: { opacity: 0.68 },
  title: { ...typography.compactTitle, flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerBalance: { height: 44, width: 44 },
  scroll: { flex: 1 },
  content: { paddingTop: 12 },
  contentColumn: { alignSelf: 'center', gap: 12, maxWidth: 720, width: '100%' },
  groupCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  sectionRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconBox: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', marginTop: 1, width: 32 },
  sectionCopy: { flex: 1, gap: 4, minWidth: 0 },
  sectionTitle: { ...typography.label, fontSize: 14.5, fontWeight: '600', lineHeight: 20 },
  sectionBody: { ...typography.secondary, fontSize: 13, lineHeight: 19 },
});
