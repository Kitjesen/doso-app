import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useAppTheme } from '../theme';
import { getProductAppearance } from '../appearance';
import { ControlSlider } from './ControlSlider';
import { controlSetupAppearance } from './ControlSetupSurface';
import {
  JOYSTICK_SIZE_MAX, JOYSTICK_SIZE_MIN,
  type JoystickLayout, type JoystickOrientation, type JoystickPlacement, type JoystickSide,
} from '../features/control/joystickLayoutPreferences';

type Props = Readonly<{
  orientation: JoystickOrientation;
  layout: JoystickLayout;
  onChange: (side: JoystickSide, patch: Partial<JoystickPlacement>) => void;
  onPreview?: (side: JoystickSide, patch: Partial<JoystickPlacement>) => void;
  onReset: () => void;
  onClose: () => void;
  embedded?: boolean;
  storageError?: string | null;
}>;

export function JoystickLayoutSettings({ orientation, layout, onChange, onPreview, onReset, onClose, embedded = false, storageError }: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = { ...getProductAppearance(isDark), ...controlSetupAppearance };
  return <View accessibilityViewIsModal style={[styles.panel, embedded && styles.panelEmbedded, { backgroundColor: embedded ? '#222222' : appearance.surface, borderColor: appearance.border }]} testID="joystick-layout-settings">
    {!embedded ? (
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>摇杆布局</Text>
          <Text style={[styles.caption, { color: appearance.secondary }]}>{orientation === 'landscape' ? '横屏' : '竖屏'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="完成摇杆布局调整" onPress={onClose} style={styles.textButton} testID="joystick-layout-close">
          <Text style={[styles.body, { color: appearance.blueInk }]}>完成</Text>
        </Pressable>
      </View>
    ) : null}
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, embedded && styles.contentEmbedded]} style={styles.scroll}>
      <View style={[styles.sections, orientation === 'landscape' && styles.sectionsWide]}>
      {(['left', 'right'] as const).map(side => {
        const value = layout[side], name = side === 'left' ? '移动摇杆' : '转向摇杆';
        return <View key={side} style={styles.section} testID={`joystick-layout-${side}`}>
          <Text style={[styles.sectionTitle, { color: appearance.ink }]}>{name}</Text>
          {(['sizeScale', 'x', 'y'] as const).map(field => {
            const id = field === 'sizeScale' ? 'size' : field;
            const title = field === 'sizeScale' ? '大小' : field === 'x' ? '水平' : '垂直';
            return <ControlSlider glass key={`${orientation}-${side}-${field}`} value={value[field]} label={title}
              minimumValue={field === 'sizeScale' ? JOYSTICK_SIZE_MIN : 0}
              maximumValue={field === 'sizeScale' ? JOYSTICK_SIZE_MAX : 1} step={0.01}
              formatValue={current => `${Math.round(current * 100)}%`}
              accessibilityLabel={`${name}${title}`} testID={`joystick-layout-${side}-${id}-slider`}
              onValueChange={onPreview ? current => onPreview(side, { [field]: current }) : undefined}
              onSlidingComplete={current => onChange(side, { [field]: current })} />;
          })}
        </View>;
      })}
      </View>
      {storageError ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.dangerText }]} testID="joystick-layout-storage-error">{storageError}</Text> : null}
    </ScrollView>
    <View style={[styles.footer, embedded && styles.footerEmbedded]}>
      <Pressable accessibilityRole="button" accessibilityLabel="恢复当前方向的默认摇杆布局" onPress={onReset} style={({ pressed }) => [styles.reset, embedded && styles.resetEmbedded, pressed && styles.pressed]} testID="joystick-layout-reset">
        <Text style={[styles.resetText, { color: appearance.ink }]}>恢复默认</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderRadius: 20, borderWidth: .5, maxHeight: '100%', maxWidth: 380, width: '100%', overflow: 'hidden' },
  panelEmbedded: { borderRadius: 14, borderWidth: 1, maxWidth: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '500' },
  body: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', marginBottom: 4 },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 48 },
  scroll: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 16, paddingBottom: 8 },
  contentEmbedded: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  sections: { gap: 14 },
  sectionsWide: { flexDirection: 'row', gap: 14 },
  section: { flex: 1, minWidth: 0, gap: 6 },
  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  footerEmbedded: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255, 255, 255, 0.07)', paddingHorizontal: 14, paddingVertical: 10 },
  reset: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  resetEmbedded: { backgroundColor: '#181818', borderColor: 'rgba(255, 255, 255, 0.09)', borderRadius: 8, borderWidth: 1, minHeight: 34 },
  resetText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  pressed: { opacity: 0.72 },
});
