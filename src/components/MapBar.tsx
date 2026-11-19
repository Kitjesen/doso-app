import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { Text } from './AppText';
import type { MapMode, MapView } from './locationMapHtml';

export function MapBar({ view, isDark = false, onMode }: { view: MapView; isDark?: boolean; onMode(mode: MapMode): void }) {
  const appearance = getProductAppearance(isDark);
  const button = (mode: MapMode, title: string, label: string, disabled: boolean) => <Pressable key={mode}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: view.mode === mode }}
    {...(Platform.OS === 'web' ? { 'aria-pressed': view.mode === mode } : {})}
    disabled={disabled} onPress={() => onMode(mode)} style={[styles.button,
      view.mode === mode && { backgroundColor: appearance.selectionSurface }, disabled && styles.disabled]}>
    <Text style={[typography.supporting, { color: view.mode === mode ? appearance.selectionInk : appearance.ink }]}>{title}</Text>
  </Pressable>;
  return <View style={[styles.bar, { backgroundColor: appearance.raised, borderColor: appearance.border }]} testID="location-map-tools">
    <View style={styles.row}>
      <View style={styles.status} accessible role="status" accessibilityLiveRegion="polite" accessibilityLabel={view.description}>
        <View style={[styles.dot, { backgroundColor: view.canFollow ? '#1672e8' : appearance.secondary }]} />
        <Text numberOfLines={1} style={[typography.caption, styles.copy, { color: appearance.secondary }]}>{view.status}</Text>
      </View>
      <View style={styles.modes}>
        {button('follow', '跟随', '跟随机器狗', !view.canFollow)}
        {button('overview', '全览', '轨迹全览', !view.canOverview)}
        {button('globe', '地球', '地球视角', !view.ready)}
      </View>
    </View>
    {view.error ? <Text accessibilityRole="alert" style={[typography.caption, styles.error, { color: appearance.secondary }]}>{view.error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 3 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 }, copy: { flexShrink: 1 },
  modes: { flexDirection: 'row', gap: 2 }, button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  disabled: { opacity: 0.45 }, error: { paddingBottom: 6 },
});
