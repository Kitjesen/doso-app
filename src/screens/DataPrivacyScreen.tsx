import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { useAppTheme } from '../theme';
import { cardLayout } from '../appearance';
import { typography } from '../typography';

type Props = {
  onBack: () => void;
};

const SECTIONS = [
  {
    icon: 'person-outline' as const,
    title: '登录与个人资料',
    body: '邮箱、用户名、昵称和头像用于登录账户与展示个人资料。主动选择图片时，App 会打开系统图片选择器；只有你确认保存后，所选头像才会上传。',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: '终端与账户安全',
    body: '终端标识、系统类型、终端名称，以及最近活跃和撤销状态用于展示与管理账户安全。',
  },
  {
    icon: 'hardware-chip-outline' as const,
    title: '机器人与连接',
    body: '设备绑定、序列号、固件、电量和连接状态按真实同步结果展示。BLE 扫描只在你主动操作时触发，只扫描附近设备广播；发现广播不代表已经完成安全配网或设备连接。Android 11 及以下系统的 BLE 扫描需要位置权限并开启定位服务；此扫描流程仅检查定位服务是否开启，不读取、保存或上传手机经纬度。',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: '本机保存',
    body: '本机保存登录会话、安装标识和待核对的头像操作日志。退出登录不会清除全部本机记录：安装标识会保留，未完成核对或清理的头像操作日志也会保留。头像操作日志不包含密码或图片内容。',
  },
];

export function DataPrivacyScreen({ onBack }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  const horizontalInset = landscape ? 24 : 20;
  const contentPadding = {
    paddingLeft: horizontalInset + insets.left,
    paddingRight: horizontalInset + insets.right,
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="data-privacy-screen">
      <View style={[styles.header, contentPadding, { borderBottomColor: colors.line, paddingTop: insets.top + 4 }]}>
        <Pressable
          accessibilityHint="返回之前的页面"
          accessibilityLabel="返回"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          testID="data-privacy-back"
        >
          <Ionicons color={colors.ink} name="chevron-back" size={23} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>数据与隐私</Text>
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
          <Text selectable style={[styles.intro, { color: colors.inkSoft }]}>以下说明对应当前 App 已实现的账户、设备与本机功能。</Text>

          <View style={styles.sections}>
            {SECTIONS.map(section => (
              <View key={section.title} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.icon}>
                  <Ionicons color={colors.authPrimary} name={section.icon} size={20} />
                </View>
                <View style={styles.sectionCopy}>
                  <Text selectable style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
                  <Text selectable style={[styles.sectionBody, { color: colors.muted }]}>{section.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.notice}>
            <Ionicons color={colors.muted} name="information-circle-outline" size={21} />
            <Text selectable style={[styles.noticeText, { color: colors.inkSoft }]}>本页说明当前功能的数据范围，不替代正式隐私政策。账户删除服务尚未接通，本页不会提交注销或解绑；退出登录不等于删除账户。</Text>
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
    minHeight: 68,
    paddingBottom: 10,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: { opacity: 0.7 },
  title: { ...typography.compactTitle, flex: 1, textAlign: 'center' },
  headerBalance: { height: 44, width: 44 },
  scroll: { flex: 1 },
  content: { paddingTop: 24 },
  contentColumn: { alignSelf: 'center', gap: 16, maxWidth: 760, width: '100%' },
  intro: { ...typography.body },
  sections: { gap: 12 },
  section: {
    alignItems: 'flex-start',
    borderRadius: cardLayout.radius,
    flexDirection: 'row',
    gap: cardLayout.gap,
    padding: cardLayout.inset,
  },
  icon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  sectionCopy: { flex: 1, gap: 6, minWidth: 0 },
  sectionTitle: { ...typography.label },
  sectionBody: { ...typography.secondary },
  notice: {
    alignItems: 'flex-start',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 21 },
});
