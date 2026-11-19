import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { officialDark } from '../officialPalette';
import { MainTab } from '../types';

const items = [
  { key: 'map', icon: 'map', label: '地图' },
  { key: 'tasks', icon: 'clipboard', label: '任务' },
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'analysis', icon: 'bar-chart-2', label: '分析' },
  { key: 'profile', icon: 'user', label: '我的' },
] satisfies { key: MainTab; icon: 'home' | 'map' | 'clipboard' | 'bar-chart-2' | 'user'; label: string }[];

export function BottomNav({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const navigation = (
    <View testID="main-navigation" style={[styles.nav, landscape && styles.navLandscape]}>
      {items.map(item => {
        const selected = active === item.key;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [styles.item, landscape && styles.itemLandscape, pressed && styles.pressed]}
            testID={`nav-${item.key}`}
          >
            <Feather accessible={false} color={selected ? officialDark.ink : officialDark.muted} name={item.icon} size={20} />
            {selected ? <View testID={`nav-indicator-${item.key}`} style={styles.activeLine} /> : <View testID={`nav-indicator-${item.key}`} style={styles.activeLineHidden} />}
          </Pressable>
        );
      })}
    </View>
  );
  return (
    <View style={[
      styles.outer,
      { backgroundColor: 'rgba(28,28,27,0.92)', borderTopColor: officialDark.line },
      width < 350 && styles.outerNarrow,
      !landscape && { paddingBottom: Math.max(insets.bottom, 8) },
      landscape && styles.outerLandscape,
      landscape && height < 360 && styles.outerLandscapeShort,
      landscape && {
        top: (height < 360 ? 12 : 54) + insets.top,
        bottom: (height < 360 ? 12 : 20) + insets.bottom,
        right: 14 + insets.right,
      },
    ]}>
      {landscape ? (
        <ScrollView contentContainerStyle={styles.railContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.railViewport}>
          {navigation}
        </ScrollView>
      ) : navigation}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, borderTopWidth: 1 },
  outerNarrow: { paddingHorizontal: 4 },
  outerLandscape: { position: 'absolute', right: 14, top: 54, bottom: 20, zIndex: 20, width: 56, paddingHorizontal: 0, paddingVertical: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: 'transparent', borderTopWidth: 0 },
  outerLandscapeShort: { top: 12, bottom: 12 },
  nav: { height: 56, minHeight: 56, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 8, width: '100%', alignSelf: 'center', maxWidth: 420 },
  navLandscape: { flex: 1, height: undefined, minHeight: 248, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' },
  railViewport: { flex: 1 },
  railContent: { flexGrow: 1 },
  item: { flex: 1, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemLandscape: { flex: 0, width: 48 },
  activeLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: officialDark.ink },
  activeLineHidden: { width: 16, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  pressed: { opacity: 0.65 },
});
