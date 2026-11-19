import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { officialDark } from '../officialPalette';

export function OfficialSheet({ title, onBack, backTestID, lede, children }: {
  title: string;
  onBack?: () => void;
  backTestID?: string;
  lede?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 122 : 20);
  return (
    <View style={styles.root}>
      <LinearGradient colors={[...officialDark.grad]} locations={[0, 0.24, 0.52, 1]} pointerEvents="none" style={[styles.backdrop, { opacity: 0.88 }]} />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill}>
        <View style={styles.nav}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={styles.back} testID={backTestID}>
              <Ionicons name="chevron-back" size={22} color={officialDark.ink} />
            </Pressable>
          ) : <View style={styles.back} />}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        {lede ? <Text style={styles.lede}>{lede}</Text> : null}
        <View style={[styles.body, { paddingBottom: bottomInset }]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: officialDark.canvas },
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, marginBottom: 16, marginLeft: -8, paddingHorizontal: 20 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#FFFFFF' },
  lede: { paddingHorizontal: 20, marginBottom: 16, fontSize: 14, lineHeight: 22, color: officialDark.muted },
  body: { flex: 1, paddingHorizontal: 20 },
});
