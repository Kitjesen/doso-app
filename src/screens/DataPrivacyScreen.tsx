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
    icon: 'wifi-outline' as const,
    title: '机器狗连接与地址保存',
    body: '局域网与证书连接直接在本机与你指定的机器狗地址之间通信。为方便下次打开重连，本机安全存储仅保存上次成功连接的目标地址、传输方式与配对证书标识；你可以随时在「设置 → 设备详情」中断开连接并清除该记录。',
  },
  {
    icon: 'videocam-outline' as const,
    title: '实时画面与只读诊断',
    body: '实时视频（WebRTC / WHEP）与导航网关只读诊断（含相机状态和深度彩色预览）仅在你打开控制页、连接页或视频诊断页时按需请求，不会在后台静默拉流；视频观看凭据（如有）仅保留在当次前台会话内存中。',
  },
  {
    icon: 'hardware-chip-outline' as const,
    title: '附近蓝牙设备与定位开关',
    body: 'BLE 扫描只在你主动点击开始查找时触发，仅扫描附近设备广播；发现广播不代表已经完成安全配网或设备授权。Android 11 及以下系统的 BLE / Wi-Fi 发现需要位置权限并开启定位服务；此流程仅用于系统扫描所需检查，不读取、保存或上传手机经纬度。',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: '本机偏好保存',
    body: '本机仅保存主题外观、虚拟摇杆布局与状态警报偏好等使用配置，不会采集、上传或同步个人账号信息。',
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
          <Text selectable style={[styles.intro, { color: colors.inkSoft }]}>以下说明对应当前 DOSO App 已收敛的本机与机器狗连接功能。</Text>

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
            <Text selectable style={[styles.noticeText, { color: colors.inkSoft }]}>本页说明当前单机工作台功能的数据范围，不替代正式隐私政策。账号登录与云端同步功能已在本版本暂时下线，本应用不会写入或上传账户数据。</Text>
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
