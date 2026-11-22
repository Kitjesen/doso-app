import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './AppText';

import { radii, useAppTheme } from '../theme';
import { useProductAppearance } from '../appearance';
import { typography } from '../typography';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: ViewStyle;
  variant?: 'bright' | 'dark';
};

export function GradientButton({ label, onPress, disabled = false, loading = false, compact = false, style }: Props) {
  const { colors } = useAppTheme();
  const appearance = useProductAppearance();
  const locked = disabled || loading;
  const labelColor = locked ? colors.muted : appearance.actionInk;
  const content = (
    <>
      {loading ? <ActivityIndicator accessible={false} color={labelColor} size="small" /> : null}
      <Text accessibilityLiveRegion={loading ? 'polite' : 'none'} style={[styles.label, { color: labelColor }]}>{label}</Text>
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked, busy: loading }}
      disabled={locked}
      onPress={() => { if (!locked) onPress(); }}
      style={({ pressed }) => [styles.pressable, style, pressed && !locked && styles.pressed]}
    >
      <View
        style={[styles.gradient, compact && styles.gradientCompact, { backgroundColor: locked ? appearance.surface : appearance.action }]}
      >
        {content}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  gradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  gradientCompact: { minHeight: 44 },
  label: {
    ...typography.label,
    flexShrink: 1,
    textAlign: 'center',
  },
});
