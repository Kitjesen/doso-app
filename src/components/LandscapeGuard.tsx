import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from './AppText';

export function LandscapeGuard() {
  return (
    <View
      accessible
      accessibilityLabel="请横屏使用"
      style={styles.root}
      testID="landscape-orientation-guard"
    >
      <View style={styles.badge}>
        <Ionicons color="#F2F2F2" name="phone-landscape-outline" size={28} />
      </View>
      <Text numberOfLines={1} style={styles.title}>请横屏使用</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#141414',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#1C1C1C',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 18,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
    lineHeight: 22,
  },
});
