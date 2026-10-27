import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProductAppearance } from '../appearance';
import { Text } from '../components/AppText';
import { BottomNav } from '../components/BottomNav';
import type { MainTab } from '../types';
import { AnalysisScreen } from './AnalysisScreen';
import { TasksScreen } from './TasksScreen';

type Props = {
  onExitGuest: () => void;
  onOpenConnection: () => void;
};

const titles: Record<MainTab, string> = { home: '首页', map: '地图', tasks: '任务', analysis: '分析', profile: '我的' };
// This local shell has no account, cloud repository or control transport. Task
// execution is disabled both by real template policy and by the absent executor.
const ignoreTaskStart = (_taskId: string) => {};

export function GuestScreen({ onExitGuest, onOpenConnection }: Props) {
  const p = useProductAppearance();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [activeTab, setActiveTab] = useState<MainTab>('home');

  const button = (label: string, onPress: () => void, testID: string) => <Pressable
    accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.button, { backgroundColor: p.action }, pressed && styles.pressed]}>
    <Text style={[styles.buttonText, { color: p.actionInk }]}>{label}</Text>
  </Pressable>;

  const empty = (icon: 'link-outline' | 'map-outline', title: string, detail?: string) => <View style={[styles.empty, { backgroundColor: p.surface }]}>
    <Ionicons accessible={false} name={icon} size={36} color={p.blueInk} />
    <Text accessibilityRole="header" style={[styles.cardTitle, { color: p.ink }]}>{title}</Text>
    {detail ? <Text style={[styles.secondary, { color: p.secondary }]}>{detail}</Text> : null}
    {button('连接机器狗', onOpenConnection, 'guest-open-connection')}
  </View>;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: p.canvas }, landscape && styles.safeLandscape]} testID="guest-screen">
    <View style={styles.header}>
      <Image accessibilityLabel="DOSO 大算机器人" resizeMode="contain" source={require('../../assets/brand/doso-auth-lockup-sky-v2.png')} style={[styles.logo, p.isDark && { tintColor: p.ink }]} />
      <Text accessibilityRole="header" style={[styles.title, { color: p.ink }]}>{titles[activeTab]}</Text>
      <Text style={[styles.secondary, { color: p.secondary }]} testID="guest-status">游客</Text>
    </View>
    <View style={styles.body}>
      {activeTab === 'home' ? <ScrollView contentContainerStyle={[styles.content, landscape && styles.homeColumns]} testID="guest-home">
        <View style={[styles.primary, landscape && styles.primaryLandscape]}>{empty('link-outline', '尚未连接机器狗', '连接后读取设备状态')}</View>
        <View style={[styles.shortcuts, landscape && styles.shortcutsLandscape, { backgroundColor: p.surface }]}>
          {([
            { tab: 'tasks' as const, title: '任务模板', icon: 'reader-outline' as const },
            { tab: 'map' as const, title: '地图与路线', icon: 'map-outline' as const },
          ]).map(item => <Pressable key={item.tab} accessibilityRole="button" accessibilityLabel={item.title}
            onPress={() => setActiveTab(item.tab)} testID={`guest-open-${item.tab}`}
            style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
            <Ionicons accessible={false} name={item.icon} size={22} color={p.blueInk} />
            <Text style={[styles.buttonText, { color: p.ink, flex: 1 }]}>{item.title}</Text>
            <Ionicons accessible={false} name="chevron-forward" size={18} color={p.secondary} />
          </Pressable>)}
        </View>
      </ScrollView> : null}
      {activeTab === 'map' ? <ScrollView contentContainerStyle={styles.content} testID="guest-map">
        {empty('map-outline', '尚未同步设备地图')}
      </ScrollView> : null}
      {activeTab === 'tasks' ? <TasksScreen controlAvailable={false} executorAvailable={false} onStartTask={ignoreTaskStart} robotName="未连接设备" blockedReason="连接并取得设备权限后才能执行任务。" /> : null}
      {activeTab === 'analysis' ? <AnalysisScreen previewMode={false} /> : null}
      {activeTab === 'profile' ? <ScrollView contentContainerStyle={styles.content} testID="guest-profile">
        <View style={[styles.empty, { backgroundColor: p.surface }]}>
          <Ionicons accessible={false} name="person-outline" size={36} color={p.blueInk} />
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: p.ink }]}>登录 DOSO</Text>
          <Text style={[styles.secondary, { color: p.secondary }]}>登录后管理账号与设备</Text>
          {button('返回登录', onExitGuest, 'guest-exit')}
        </View>
      </ScrollView> : null}
    </View>
    <BottomNav active={activeTab} onChange={setActiveTab} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  safeLandscape: { paddingRight: 78 },
  header: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', gap: 16 },
  logo: { width: 108, height: 30 },
  title: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { flex: 1, minHeight: 0 },
  content: { alignSelf: 'center', maxWidth: 960, width: '100%', padding: 16, gap: 12, paddingBottom: 24 },
  homeColumns: { flexDirection: 'row', alignItems: 'flex-start' },
  primary: { minWidth: 0, width: '100%' },
  primaryLandscape: { flex: 2, width: undefined },
  empty: { alignItems: 'center', borderRadius: 24, gap: 12, padding: 24 },
  cardTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  secondary: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 160, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  shortcuts: { minWidth: 0, width: '100%', borderRadius: 24, padding: 12 },
  shortcutsLandscape: { flex: 1, width: undefined },
  shortcut: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 12 },
  pressed: { opacity: 0.65 },
});
