import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import {
  getSocialLoginReadiness,
  type SocialLoginProvider,
} from '../services/socialAuthService';
import { useAppTheme } from '../theme';
import { APPLE_LOGO_ONLY_DATA_URI } from './appleSignInArtwork';
import { SocialLoginFeedback, useSocialLoginAction } from './SocialLoginFeedback';

type SocialLoginButtonsProps = {
  activeProvider?: SocialLoginProvider | null;
  busy?: boolean;
  compact?: boolean;
  onPress?: (provider: SocialLoginProvider) => void | Promise<void>;
};

const providers: Array<{
  id: SocialLoginProvider;
  accessibilityLabel: string;
  accessibilityHint: string;
  icon: keyof typeof FontAwesome.glyphMap | null;
  color: string;
  selectedBackground: string;
  selectedBackgroundDark: string;
  selectedBorderDark: string;
  size: number;
}> = [
  { id: 'apple', accessibilityLabel: '使用 Apple 登录', accessibilityHint: '使用 Apple 账户登录 DOSO', icon: null, color: '#111111', selectedBackground: '#F2F3F5', selectedBackgroundDark: 'rgba(255,255,255,0.12)', selectedBorderDark: '#F7F9FC', size: 25 },
  { id: 'wechat', accessibilityLabel: '使用微信登录', accessibilityHint: '使用微信账户登录 DOSO', icon: 'weixin', color: '#07C160', selectedBackground: 'rgba(7,193,96,0.10)', selectedBackgroundDark: 'rgba(7,193,96,0.18)', selectedBorderDark: '#07C160', size: 29 },
  { id: 'qq', accessibilityLabel: '使用 QQ 登录', accessibilityHint: '使用 QQ 账户登录 DOSO', icon: 'qq', color: '#12B7F5', selectedBackground: 'rgba(18,183,245,0.10)', selectedBackgroundDark: 'rgba(18,183,245,0.18)', selectedBorderDark: '#12B7F5', size: 28 },
];

export function SocialLoginButtons({ activeProvider: parentActiveProvider = null, busy: parentBusy = false, compact = false, onPress }: SocialLoginButtonsProps) {
  const { colors, isDark } = useAppTheme();
  const { busy, activeProvider, run } = useSocialLoginAction({ busy: parentBusy, activeProvider: parentActiveProvider, onPress });

  return (
    <View style={styles.group}>
    <View style={styles.buttonRow}>
      {providers.map((provider) => {
        const readiness = getSocialLoginReadiness(provider.id);
        const unavailable = !readiness.ready || !onPress;
        const selected = busy && readiness.ready && activeProvider === provider.id;
        const disabled = busy || unavailable;
        const disabledVisual = disabled && !selected;
        const selectedColor = isDark ? provider.selectedBorderDark : provider.color;
        const accessibilityStatus = unavailable
          ? '不可用'
          : selected
            ? '正在打开授权'
            : busy
              ? '暂不可用，正在处理其他登录方式'
              : '可用';
        return (
          <Pressable
            accessibilityHint={unavailable
              ? readiness.blockerMessage ?? `${provider.accessibilityHint}，当前不可用`
              : selected ? '正在打开授权' : busy ? '正在处理其他登录方式' : provider.accessibilityHint}
            accessibilityLabel={provider.accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: selected, selected }}
            accessibilityValue={{ text: accessibilityStatus }}
            disabled={disabled}
            hitSlop={10}
            key={provider.id}
            onPress={() => run(provider.id)}
            style={({ pressed }) => [
              styles.button,
              compact && styles.buttonCompact,
              {
                backgroundColor: selected
                  ? isDark ? provider.selectedBackgroundDark : provider.selectedBackground
                  : 'transparent',
                borderColor: selected ? selectedColor : 'transparent',
              },
              disabled && !selected && styles.buttonDisabled,
              selected && styles.buttonSelected,
              pressed && !disabled && styles.buttonPressed,
            ]}
          >
            <View style={[styles.brandMark, compact && styles.brandMarkCompact, provider.icon && !disabledVisual && styles.brandMarkPlate, provider.icon && disabledVisual && styles.brandMarkDisabled]}>
              {provider.icon ? (
                <FontAwesome color={disabledVisual ? '#111111' : provider.color} name={provider.icon} size={compact ? provider.size - 5 : provider.size} />
              ) : (
                <Image accessible={false} resizeMode="contain" source={{ uri: APPLE_LOGO_ONLY_DATA_URI }} style={[styles.appleButtonArtwork, compact && styles.appleButtonArtworkCompact, disabledVisual && styles.appleButtonArtworkDisabled]} />
              )}
            </View>
            {selected ? <ActivityIndicator color={selectedColor} size="small" style={styles.pendingIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
    <SocialLoginFeedback activeProvider={activeProvider} busy={busy} hasAction={Boolean(onPress)} palette={{ accent: colors.authPrimary, border: colors.line, ink: colors.ink, secondary: colors.muted, surface: colors.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { alignSelf: 'stretch' },
  appleButtonArtwork: { height: 44, width: 44 },
  appleButtonArtworkCompact: { height: 32, width: 32 },
  appleButtonArtworkDisabled: { opacity: 0.28 },
  brandMark: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  brandMarkCompact: { height: 32, width: 32 },
  brandMarkDisabled: { opacity: 0.28 },
  brandMarkPlate: { backgroundColor: '#FFFFFF', borderRadius: 12 },
  buttonRow: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 20, justifyContent: 'center' },
  button: { alignItems: 'center', borderRadius: 18, borderWidth: 2, height: 56, justifyContent: 'center', position: 'relative', width: 56 },
  buttonCompact: { borderRadius: 14, height: 44, width: 44 },
  buttonDisabled: { opacity: 1 },
  buttonPressed: { opacity: 0.62, transform: [{ scale: 0.94 }] },
  buttonSelected: { elevation: 3, transform: [{ scale: 1.03 }] },
  pendingIndicator: { bottom: 2, position: 'absolute', right: 2, transform: [{ scale: 0.62 }] },
});
