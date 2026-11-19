import { useProductAppearance } from '../appearance';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './HomeText';
import type { PreviewRoute } from '../features/routes/routePreview';

export function RoutePreviewMap({ route, onExpand, full = false, compact = false }: { route: PreviewRoute; onExpand?: () => void; full?: boolean; compact?: boolean }) {
  const { isDark } = useProductAppearance();
  const styles = makeStyles(isDark);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [wallsVisible, setWallsVisible] = useState(true);
  const [point, setPoint] = useState<number | null>(null);
  return <View style={[styles.map, full && styles.full, compact && { height: 190, minHeight: 190 }]} testID="route-map" onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
    <View pointerEvents="none" accessible={false} style={[styles.walls, !wallsVisible && { opacity: 0 }]}>
      {/* Static geometry belongs only to the isolated route preview, not a device map. */}
      <Image source={require('../../assets/qa/route-occupancy.png')} resizeMode="stretch" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} accessibilityLabel="预览地图轮廓" />
    </View>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {route.points.slice(1).map((to, index) => {
        const from = route.points[index];
        const dx = (to.x - from.x) * size.width, dy = (to.y - from.y) * size.height;
        const length = Math.hypot(dx, dy);
        return <View key={index} style={[styles.path, {
          left: (from.x + to.x) * size.width / 2 - length / 2,
          top: (from.y + to.y) * size.height / 2 - 1.5,
          width: length, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        }]} />;
      })}
    </View>
    {route.points.map((at, index) => <Pressable key={index} testID={`route-waypoint-${index}`} accessibilityRole="button" accessibilityLabel={`途经点 ${index + 1}`}
      accessibilityState={{ selected: point === index }} hitSlop={10} onPress={() => setPoint(index)}
      style={[styles.point, { left: at.x * size.width - 6, top: at.y * size.height - 6 }, point === index && styles.focused]}><Text style={styles.pointNumber}>{index + 1}</Text></Pressable>)}
    {route.positionIndex !== undefined && route.points[route.positionIndex] ? <View accessibilityLabel="预览设备位置" style={[styles.robot, { left: route.points[route.positionIndex].x * size.width - 12, top: route.points[route.positionIndex].y * size.height - 12 }]}><Feather name="navigation" size={14} color="#FFFFFF" /></View> : null}
    {!compact ? <Pressable accessibilityRole="button" accessibilityLabel="切换地图图层" accessibilityState={{ selected: wallsVisible }} onPress={() => setWallsVisible(value => !value)} style={[styles.layer, styles.tool]}><Feather name="layers" size={20} color={isDark ? '#E8E8E6' : '#365875'} /></Pressable> : null}{!compact ? <View style={styles.mapName}><Text style={styles.mapNameText}>{route.mapName}</Text></View> : null}
    {onExpand ? <Pressable testID="route-expand" accessibilityRole="button" accessibilityLabel="全屏地图" onPress={onExpand} style={({ pressed }) => [styles.expand, styles.tool, pressed && styles.pressed]}><Feather name="maximize" size={19} color={isDark ? '#E8E8E6' : '#365875'} /></Pressable> : null}
    {point !== null ? <View style={styles.pointLabel}><Text style={styles.mapNameText}>途经点 {point + 1}</Text></View> : null}
    {!compact ? <Pressable testID="route-recenter" accessibilityRole="button" accessibilityLabel="回到全览" onPress={() => setPoint(null)} style={({ pressed }) => [styles.recenter, styles.tool, pressed && styles.pressed]}><Feather name="crosshair" size={21} color={isDark ? '#E8E8E6' : '#365875'} /></Pressable> : null}
  </View>;
}

function makeStyles(dark: boolean) { return StyleSheet.create({
  map: { height: 410, borderRadius: 6, overflow: 'hidden', backgroundColor: dark ? '#232423' : '#ECEEED' }, full: { flex: 1, height: undefined, minHeight: 260 },
  walls: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, wall: { position: 'absolute', backgroundColor: dark ? '#717775' : '#ABB2AF' }, rack: { position: 'absolute', width: '5%', height: '5%', backgroundColor: dark ? '#4F5654' : '#BEC4C1', borderWidth: 1, borderColor: dark ? '#707774' : '#A7B0AB' },
  path: { position: 'absolute', height: 2, borderRadius: 2, backgroundColor: '#7795AA' },
  point: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: dark ? '#293131' : '#F1F4F5', borderWidth: 1.5, borderColor: '#96AFBD', alignItems: 'center', justifyContent: 'center' },
  robot: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#83AEC5', alignItems: 'center', justifyContent: 'center' }, pointNumber: { position: 'absolute', top: -22, minWidth: 22, textAlign: 'center', color: dark ? '#E8E8E6' : '#253C4A', fontSize: 12, lineHeight: 17 }, focused: { transform: [{ scale: 1.16 }], borderColor: '#D4E0E7', backgroundColor: dark ? '#506573' : '#D9E4EA' },
  mapName: { position: 'absolute', top: 12, left: 12, backgroundColor: dark ? '#30302EEE' : '#F5FAFFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  mapNameText: { fontSize: 13, lineHeight: 20, color: dark ? '#E8E8E6' : '#365875', fontWeight: '500' },
  tool: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#30302EEE' : '#FFFFFFEE', borderRadius: 8, boxShadow: '0 2px 8px rgba(60,85,120,.08)' },
  layer: { position: 'absolute', top: 8, right: 8 }, expand: { position: 'absolute', top: 104, right: 8 }, recenter: { position: 'absolute', top: 56, right: 8 },
  pointLabel: { position: 'absolute', left: 12, bottom: 12, backgroundColor: dark ? '#30302EEE' : '#FFFFFFEE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  pressed: { opacity: .7, transform: [{ scale: .96 }] },
}); }
