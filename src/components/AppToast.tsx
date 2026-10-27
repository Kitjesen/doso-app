import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme';
import { cardLayout, useProductAppearance } from '../appearance';
import { typography } from '../typography';

export type ToastNotice = {
  title: string;
  message: string;
  tone?: 'success' | 'error' | 'info';
};

type Props = {
  notice: ToastNotice | null;
  onDismiss: () => void;
  withinSafeArea?: boolean;
};

export function AppToast({ notice, onDismiss, withinSafeArea = false }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors } = useAppTheme();
  const p = useProductAppearance();

  if (!notice) {
    return null;
  }

  const tone = notice.tone ?? 'success';
  const iconName = tone === 'error' ? 'alert-circle' : tone === 'info' ? 'information-circle' : 'checkmark';
  const iconColor = tone === 'error' ? colors.dangerText : p.blueInk;
  const availableHeight = Math.max(0, height - insets.top - insets.bottom);
  const maximumCardHeight = Math.max(64, Math.min(160, Math.floor(availableHeight * 0.32)));

  return (
    <View accessibilityLiveRegion="polite" testID="app-feedback-region" style={[styles.layer, {
      paddingBottom: withinSafeArea ? 8 : Math.max(8, insets.bottom),
      paddingLeft: withinSafeArea ? 18 : Math.max(18, insets.left + 12),
      paddingRight: withinSafeArea ? 18 : Math.max(18, insets.right + 12),
    }]}>
        <View
          style={[styles.toast, { backgroundColor: p.surface, maxHeight: maximumCardHeight }]}
        >
          <View style={styles.icon}>
            <Ionicons color={iconColor} name={iconName} size={18} />
          </View>
          <ScrollView
            contentContainerStyle={styles.copyContent}
            style={[styles.copy, { maxHeight: maximumCardHeight - 16 }]}
            testID="app-feedback-content"
          >
            <Text selectable style={[styles.title, { color: p.ink }]}>{notice.title}</Text>
            <Text selectable style={[styles.message, { color: p.secondary }]}>{notice.message}</Text>
          </ScrollView>
          <Pressable
            accessibilityLabel="关闭提示"
            accessibilityRole="button"
            testID="app-feedback-dismiss"
            onPress={onDismiss}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons color={p.secondary} name="close" size={18} />
          </Pressable>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    flexShrink: 0,
    paddingTop: 8,
  },
  close: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  pressed: {
    opacity: 0.8,
  },
  toast: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: cardLayout.radius,
    flexDirection: 'row',
    maxWidth: 640,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    marginHorizontal: 8,
  },
  copyContent: {
    paddingVertical: 2,
  },
  title: {
    ...typography.label,
  },
  message: {
    ...typography.supporting,
    marginTop: 2,
  },
});
