import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProductAppearance } from '../appearance';
import { MainTab } from '../types';

const items = [
  { key: 'home', icon: 'home-outline', label: '首页' },
  { key: 'map', icon: 'map-outline', label: '地图' },
  { key: 'tasks', icon: 'reader-outline', label: '任务' },
  { key: 'analysis', icon: 'stats-chart-outline', label: '分析' },
  { key: 'profile', icon: 'person-outline', label: '我的' },
] satisfies { key: MainTab; icon: 'home-outline' | 'map-outline' | 'reader-outline' | 'stats-chart-outline' | 'person-outline'; label: string }[];

export function BottomNav({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  const p = useProductAppearance();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const navigation = <View testID="main-navigation" style={[styles.nav, {
      backgroundColor: p.isDark ? p.surface : p.raised,
      boxShadow: p.isDark ? 'none' : '0 2px 8px rgba(15, 23, 42, 0.035)',
    }, landscape && styles.navLandscape]}>
      {items.map(item => {
        const selected = active === item.key;
        return <Pressable accessibilityLabel={item.label} accessibilityRole="tab" accessibilityState={{ selected }} aria-selected={selected} android_ripple={{ color: p.blueSoft, borderless: false }} key={item.key} onPress={() => onChange(item.key)} style={({ pressed }) => [styles.item, landscape && styles.itemLandscape, pressed && styles.pressed]} testID={`nav-${item.key}`}>
          <View testID={`nav-indicator-${item.key}`} style={[styles.indicator, { backgroundColor: selected ? p.blue : 'transparent' }]}>
            <Ionicons accessible={false} color={selected ? p.actionInk : p.secondary} name={item.icon} size={22} />
          </View>
        </Pressable>;
      })}
    </View>;
  return <View style={[
    styles.outer,
    { backgroundColor: p.canvas },
    width < 350 && styles.outerNarrow,
    landscape && styles.outerLandscape,
    landscape && height < 360 && styles.outerLandscapeShort,
    // This absolute rail positions against the frame, not SafeArea padding.
    // The portrait bar stays in normal flow and must not add these insets.
    landscape && {
      top: (height < 360 ? 12 : 54) + insets.top,
      bottom: (height < 360 ? 12 : 20) + insets.bottom,
      right: 14 + insets.right,
    },
  ]}>
    {landscape ? <ScrollView
      contentContainerStyle={styles.railContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.railViewport}
    >{navigation}</ScrollView> : navigation}
  </View>;
}

const styles = StyleSheet.create({
  // Portrait safe-area spacing belongs to the parent; the absolute rail adds
  // system edges above without changing the visual bar or touch-cell sizes.
  outer: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 },
  outerNarrow: { paddingHorizontal: 12 },
  outerLandscape: { position: 'absolute', right: 14, top: 54, bottom: 20, zIndex: 20, width: 56, paddingHorizontal: 0, paddingVertical: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: 'transparent' },
  outerLandscapeShort: { top: 12, bottom: 12 },
  nav: { height: 56, borderWidth: 0, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', padding: 3, maxWidth: 380, width: '100%', alignSelf: 'center' },
  navLandscape: { flex: 1, height: undefined, minHeight: 248, flexDirection: 'column', justifyContent: 'space-between' },
  // A short window must not shrink or clip the five 48dp destinations.
  railViewport: { flex: 1 },
  railContent: { flexGrow: 1 },
  item: { flex: 1, minWidth: 48, minHeight: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  itemLandscape: { flex: 0, width: 48 },
  indicator: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
