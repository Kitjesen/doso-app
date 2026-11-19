import { type PropsWithChildren } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Props = PropsWithChildren<{ label?: string; testID?: string }>;

export function PrismaticLoadingScreen({ label = '正在准备界面…', testID, children }: Props) {
  const { width, height } = useWindowDimensions();
  const unit = Math.min(width, height * 0.85, 540) / 100;

  return (
    <View testID={testID} style={styles.screen}>
      <View accessibilityLabel="DOSO robotics" accessible style={styles.brand}>
        <View style={{ width: 48 * unit, height: 8.5 * unit, overflow: 'hidden' }}>
          <Image source={require('../../assets/brand/doso-robotics-wordmark-email-03526d27c6b4.png')}
            accessible={false} resizeMode="contain" tintColor="#141414"
            style={{ position: 'absolute', width: 104.9 * unit, height: 10.43 * unit, left: -2.46 * unit, top: -0.97 * unit }} />
        </View>
        {/* Startup branding must render before the bundled fonts are ready. */}
        <Text accessible={false} style={[styles.descriptor, { fontSize: 5 * unit, letterSpacing: 0.65 * unit }]}>robotics</Text>
      </View>
      <View style={styles.feedback}>
        <Text accessibilityLiveRegion="polite" role="status" style={styles.label}>{label}</Text>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  brand: { position: 'absolute', left: '9%', top: '29%' },
  descriptor: { marginTop: 12, color: '#59636C', fontWeight: '500', lineHeight: 30 },
  feedback: { position: 'absolute', left: '9%', right: '9%', bottom: '22%' },
  label: { fontSize: 14, lineHeight: 22, color: '#59636C' },
  actions: { position: 'absolute', left: '9%', right: '9%', bottom: '6%', flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16 },
});
