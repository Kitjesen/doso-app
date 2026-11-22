import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './HomeText';
import { officialDark } from '../officialPalette';

export function ProductHeader({ robotName, onDevicePress, deviceTestID, connected }: {
  robotName?: string;
  onDevicePress?: () => void;
  deviceTestID?: string;
  connected?: boolean;
}) {
  return (
    <View style={styles.header}>
      <Text accessibilityLabel="DOSO robotics" style={styles.brand}>DOSO robotics</Text>
      {robotName ? (
        <Pressable
          accessibilityRole="button"
          testID={deviceTestID}
          accessibilityLabel="查看当前设备"
          disabled={!onDevicePress}
          onPress={onDevicePress}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <View style={[styles.dot, connected === false && styles.dotOff]} />
          <Text numberOfLines={1} style={styles.chipText}>{robotName}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 28,
    marginBottom: 22,
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: { fontSize: 13, lineHeight: 20, fontWeight: '600', letterSpacing: 0.78, color: '#FFFFFF', flexShrink: 0 },
  chip: {
    height: 26,
    maxWidth: '50%',
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: officialDark.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: officialDark.ink, opacity: 0.85 },
  dotOff: { backgroundColor: officialDark.muted, opacity: 0.7 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: officialDark.ink, flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
