import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import { useAppTheme } from '../theme';

type Props = {
  displayName?: string | null;
  size?: number;
  uri?: string | null;
};

export function UserAvatar({ displayName, size = 44, uri }: Props) {
  const { colors, isDark } = useAppTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const initial = useMemo(() => Array.from(displayName?.trim() ?? '')[0]?.toUpperCase() ?? '', [displayName]);

  useEffect(() => {
    setImageFailed(false);
  }, [uri]);

  const sharedStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  } as const;

  if (uri && !imageFailed) {
    return (
      <Image
        accessibilityLabel={displayName ? `${displayName}的头像` : '用户头像'}
        accessibilityRole="image"
        onError={() => setImageFailed(true)}
        source={{ uri }}
        style={[styles.image, sharedStyle]}
      />
    );
  }

  return (
    <View
      accessibilityLabel={displayName ? `${displayName}的默认头像` : '默认用户头像'}
      accessibilityRole="image"
      style={[
        styles.fallback,
        sharedStyle,
        { backgroundColor: isDark ? '#263C4D' : '#98D1FF' },
      ]}
    >
      {initial ? (
        <Text style={[styles.initial, {
          color: colors.greenDark,
          fontSize: Math.max(15, Math.round(size * 0.38)),
          lineHeight: Math.max(19, Math.round(size * 0.46)),
        }]}>{initial}</Text>
      ) : (
        <Ionicons color={colors.greenDark} name="person-outline" size={Math.round(size * 0.48)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#EAF5FF' },
  fallback: { alignItems: 'center', borderWidth: 0, justifyContent: 'center', overflow: 'hidden' },
  initial: { fontWeight: '600' },
});
