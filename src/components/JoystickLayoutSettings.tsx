import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useAppTheme } from '../theme';
import { getProductAppearance } from '../appearance';
import { ControlSlider } from './ControlSlider';
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
  storageError?: string | null;
}>;

export function JoystickLayoutSettings({ orientation, layout, onChange, onPreview, onReset, onClose, storageError }: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  return <View accessibilityViewIsModal style={[styles.panel, { backgroundColor: appearance.canvas }]} testID="joystick-layout-settings">
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, { color: appearance.ink }]}>摇杆布局</Text>
        <Text style={[styles.caption, { color: appearance.secondary }]}>{orientation === 'landscape' ? '横屏' : '竖屏'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="完成摇杆布局调整" onPress={onClose} style={styles.textButton} testID="joystick-layout-close">
        <Text style={[styles.body, { color: appearance.blueInk }]}>完成</Text>
      </Pressable>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} style={styles.scroll}>
      {(['left', 'right'] as const).map(side => {
        const value = layout[side], name = side === 'left' ? '移动摇杆' : '转向摇杆';
        return <View key={side} style={styles.section} testID={`joystick-layout-${side}`}>
          <Text style={[styles.body, styles.weight, { color: appearance.ink }]}>{name}</Text>
          {(['sizeScale', 'x', 'y'] as const).map(field => {
            const id = field === 'sizeScale' ? 'size' : field;
            const title = field === 'sizeScale' ? '大小' : field === 'x' ? '水平' : '垂直';
            return <ControlSlider key={`${orientation}-${side}-${field}`} value={value[field]} label={title}
              minimumValue={field === 'sizeScale' ? JOYSTICK_SIZE_MIN : 0}
              maximumValue={field === 'sizeScale' ? JOYSTICK_SIZE_MAX : 1} step={0.01}
              formatValue={current => `${Math.round(current * 100)}%`}
              accessibilityLabel={`${name}${title}`} testID={`joystick-layout-${side}-${id}-slider`}
              onValueChange={onPreview ? current => onPreview(side, { [field]: current }) : undefined}
              onSlidingComplete={current => onChange(side, { [field]: current })} />;
          })}
        </View>;
      })}
      {storageError ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.dangerText }]} testID="joystick-layout-storage-error">{storageError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="恢复当前方向的默认摇杆布局" onPress={onReset} style={styles.reset} testID="joystick-layout-reset">
        <Text style={[styles.body, { color: appearance.blueInk }]}>恢复默认</Text>
      </Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 16, maxHeight: '100%', maxWidth: 380, width: '100%', overflow: 'hidden' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 },
  weight: { fontWeight: '600' },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 48 },
  scroll: { flexShrink: 1 },
  content: { gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  section: { gap: 4 },
  reset: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
