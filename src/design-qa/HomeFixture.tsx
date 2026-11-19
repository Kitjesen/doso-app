import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import type { HomeEvent, HomeJourney } from '../components/HomeSummary';

// Isolated visual fixtures: never imported by the production HomeScreen.
export const homeJourney: HomeJourney = {
  distanceM: 2400, durationMs: 48 * 60000,
  locationLabel: '园区东侧步道', observedAt: '2026-11-11T14:32:00+08:00',
};
export const homeEvents: HomeEvent[] = [
  { id: 'location', at: '2026-11-11T14:32:00+08:00', title: '到达检查点 3' },
  { id: 'task', at: '2026-11-11T14:20:00+08:00', title: '巡检开始' },
  { id: 'connection', at: '2026-11-11T13:42:00+08:00', title: '设备已连接' },
];
export function HomeMapFixture() {
  return <View style={styles.root}>
    <Image source={require('./assets/home-map.png')} accessibilityLabel="示例地图，非真实设备轨迹" resizeMode="cover" style={styles.map} />
    <Text style={styles.badge}>示例</Text>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, map: { width: '100%', height: '100%' },
  badge: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FFFFFFE8', color: '#485A51', fontSize: 11, lineHeight: 16 },
});
