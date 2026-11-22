import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { officialDark } from '../officialPalette';
import { Text } from './AppText';

type NavItem<Tab extends string> = { key: Tab; label: string; icon: keyof typeof Feather.glyphMap };

export type RobotMainTab = 'control' | 'status' | 'settings';
/** Landscape navigation floats over the video, so it does not reserve a dark side gutter. */
export const ROBOT_MAIN_NAV_LANDSCAPE_SPACE = 0;
export const ROBOT_MAIN_TAB_LABELS: Record<RobotMainTab, string> = {
  control: '控制',
  status: '状态',
  settings: '设置',
};

const robotItems = [
  { key: 'control', icon: 'sliders', label: ROBOT_MAIN_TAB_LABELS.control },
  { key: 'status', icon: 'activity', label: ROBOT_MAIN_TAB_LABELS.status },
  { key: 'settings', icon: 'settings', label: ROBOT_MAIN_TAB_LABELS.settings },
] satisfies NavItem<RobotMainTab>[];

export function RobotMainNav({ active, onChange }: { active: RobotMainTab; onChange: (tab: RobotMainTab) => void }) {
  return <TabBar active={active} onChange={onChange} items={robotItems} showLabels />;
}

function TabBar<Tab extends string>({ active, onChange, items, showLabels = false }: {
  active: Tab;
  onChange: (tab: Tab) => void;
  items: readonly NavItem<Tab>[];
  showLabels?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const navigation = (
    <View testID="main-navigation" style={[styles.nav, landscape && styles.navLandscape, landscape && showLabels && styles.robotRail]}>
      {items.map(item => {
        const selected = active === item.key;
        const color = selected ? officialDark.ink : officialDark.muted;
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
            <Feather accessible={false} color={color} name={item.icon} size={20} />
            {showLabels ? <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.label, { color }]}>{item.label}</Text> : null}
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
  robotRail: { minHeight: 3 * 48 + 12, justifyContent: 'center', gap: 6 },
  railViewport: { flex: 1 },
  railContent: { flexGrow: 1 },
  item: { flex: 1, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemLandscape: { flex: 0, width: 48 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', alignSelf: 'stretch', textAlign: 'center' },
  activeLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: officialDark.ink },
  activeLineHidden: { width: 16, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  pressed: { opacity: 0.65 },
});
