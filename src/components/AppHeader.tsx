import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './AppText';

import { useProductAppearance } from '../appearance';
import { typography } from '../typography';
import { homeFont } from '../fonts/home';
import { UserAvatar } from './UserAvatar';

type Props = {
  avatarUrl?: string | null;
  displayName?: string;
  onNotifications?: () => void;
  onProfile?: () => void;
  referenceDate?: Date;
  flow?: boolean;
  title?: string;
  scenic?: boolean;
  subtitle?: string;
};

export function AppHeader({ avatarUrl, displayName = '用户', onNotifications, onProfile, referenceDate, flow = false, title, subtitle, scenic = false }: Props) {
  const p = useProductAppearance();
  const { height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const wideFlow = flow && isLandscape && width >= 900 && height >= 480;
  const today = referenceDate ?? new Date();
  const dateLabel = `${today.getMonth() + 1} 月 ${today.getDate()} 日`;
  return (
    <View
      style={[
        styles.header,
        { backgroundColor: scenic && !p.isDark ? '#EDF5FF' : p.canvas },
        isLandscape && styles.headerLandscape,
        isLandscape && flow && styles.headerFlow,
        wideFlow && styles.headerWide,
        scenic && styles.headerScenic,
      ]}
    >
      {onProfile ? (
        <Pressable
          accessibilityHint="打开个人资料并修改头像、用户名或昵称"
          accessibilityLabel="编辑个人资料"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onProfile}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          <UserAvatar displayName={displayName} size={isLandscape ? 39 : 40} uri={avatarUrl} />
        </Pressable>
      ) : <UserAvatar displayName={displayName} size={isLandscape ? 39 : 40} uri={avatarUrl} />}
      <View style={[styles.copy, isLandscape && styles.copyLandscape, flow && styles.copyFlow]}>
        <Text
          numberOfLines={1}
          style={[styles.greeting, { color: p.ink }, isLandscape && styles.greetingLandscape, wideFlow && styles.greetingWide, scenic && [styles.greetingScenic, { color: p.isDark ? p.ink : '#11141A' }]]}
        >
          {title ?? `你好，${displayName}`}
        </Text>
        <Text numberOfLines={1} style={[styles.date, { color: p.secondary }, wideFlow && styles.dateWide, scenic && [styles.dateScenic, { color: p.isDark ? p.secondary : '#4A5261' }]]}>{subtitle ?? `今天，${dateLabel}`}</Text>
      </View>
      <Pressable
        accessibilityLabel="通知"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onNotifications}
        style={({ pressed }) => [
          styles.notification,
          { backgroundColor: p.surface },
          isLandscape && styles.notificationLandscape,
          pressed && styles.pressed,
        ]}
      >
        <Feather color={p.ink} name="bell" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    top: 0,
    width: '100%',
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  headerLandscape: {
    minHeight: 70,
    paddingHorizontal: 22,
    paddingVertical: 6,
  },
  headerScenic: { minHeight: 64, paddingVertical: 4 },
  avatarButton: { borderRadius: 20 },
  headerFlow: { position: 'relative', top: 0, width: '100%', minHeight: 64 },
  headerWide: { minHeight: 88, paddingHorizontal: 24, paddingVertical: 12 },
  greetingScenic: { ...homeFont, fontWeight: '700', color: '#11141A' },
  dateScenic: { ...homeFont, fontSize: 14, lineHeight: 20, color: '#4A5261' },
  greetingWide: { ...typography.pageTitle },
  dateWide: { ...typography.secondary, marginTop: 2 },
  copyFlow: { marginLeft: 12 },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  copyLandscape: {
    marginLeft: 4,
  },
  greeting: {
    ...typography.sectionTitle,
  },
  greetingLandscape: {
    ...typography.cardTitle,
  },
  date: {
    ...typography.caption,
    marginTop: 1,
  },
  notification: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationLandscape: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.65,
  },
});
