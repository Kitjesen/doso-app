import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { productType } from '../fonts/home';
import { Text } from './HomeText';
type Props = { connected: boolean; dark: boolean; stacked: boolean; onVideo: () => void; onMaps: () => void; onTasks: () => void; onSettings: () => void };
export function HomeFeatures({ dark, stacked, onVideo, onMaps, onTasks, onSettings }: Props) {
  const ink = dark ? '#E8E8E6' : '#181B20';
  const items = [
    { key: 'maps', title: '地图与路线', icon: 'map', onPress: onMaps },
    { key: 'video', title: '远程画面', icon: 'video', onPress: onVideo },
    { key: 'tasks', title: '任务日程', icon: 'calendar', onPress: onTasks },
    { key: 'settings', title: '设备详情', icon: 'settings', onPress: onSettings },
  ] as const;
  return <View style={styles.grid} testID="home-features">{items.map(item => <Pressable key={item.key} testID={'home-feature-' + item.key} accessibilityRole="button" accessibilityLabel={item.title} onPress={item.onPress}
    style={({ pressed }) => [styles.item, { width: stacked ? '100%' : '50%', borderColor: dark ? '#343432' : '#DADDE3' }, pressed && styles.pressed]}>
    <Feather name={item.icon} size={20} color={ink} /><Text style={[styles.label, { color: ink }]}>{item.title}</Text>
  </Pressable>)}</View>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderBottomWidth: 1 },
  label: { flexShrink: 1, ...productType.body }, pressed: { opacity: .7 },
});
