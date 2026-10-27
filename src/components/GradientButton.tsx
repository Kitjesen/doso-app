import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './AppText';

import { radii, useAppTheme } from '../theme';
import { useAuthEntryPalette } from './AuthEntry';
import { useProductAppearance } from '../appearance';
import { typography } from '../typography';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: ViewStyle;
  variant?: 'bright' | 'dark' | 'auth';
};

export function GradientButton({ label, onPress, disabled = false, loading = false, compact = false, style, variant = 'bright' }: Props) {
  const { colors } = useAppTheme();
  const palette = useAuthEntryPalette();
  const appearance = useProductAppearance();
  const dark = variant === 'dark';
  const auth = variant === 'auth';
  const locked = disabled || loading;
  const labelColor = auth
    ? loading ? palette.accent : locked ? palette.secondary : palette.buttonInk
    : locked ? colors.muted : appearance.actionInk;
  const content = (
    <>
      {loading ? <ActivityIndicator accessible={false} color={labelColor} size="small" /> : null}
      <Text accessibilityLiveRegion={loading ? 'polite' : 'none'} style={[styles.label, auth && styles.authLabel, { color: labelColor }]}>{label}</Text>
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
      {auth ? (
        <View style={[styles.gradient, compact && styles.gradientCompact, { backgroundColor: locked ? palette.quiet : palette.button }, styles.authSolid]}>
          {content}
        </View>
      ) : (
      <View
        style={[styles.gradient, compact && styles.gradientCompact, { backgroundColor: locked ? appearance.surface : appearance.action }]}
      >
        {content}
      </View>
      )}
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
  authSolid: { minHeight: 52, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  label: {
    ...typography.label,
    flexShrink: 1,
    textAlign: 'center',
  },
  authLabel: { fontSize: 17, fontWeight: '500', lineHeight: 25 },
});
