import { LinearGradient } from 'expo-linear-gradient';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useRef, type ReactNode } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme';
import { Text } from './AppText';
import { useLoginMotion } from './loginMotion';

const glow = 'radial-gradient(ellipse at 85% 9%, rgba(98,177,201,0.24) 0%, rgba(98,177,201,0) 54%), radial-gradient(ellipse at 0% 44%, rgba(166,239,239,0.30) 0%, rgba(166,239,239,0) 56%), radial-gradient(ellipse at 94% 85%, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0) 60%)';
const darkGlow = 'radial-gradient(ellipse at 85% 9%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 54%), radial-gradient(ellipse at 0% 44%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 56%), radial-gradient(ellipse at 94% 85%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 60%)';
const glowStyle: ViewStyle = Platform.OS === 'web'
  ? { backgroundImage: glow } as ViewStyle
  : { experimental_backgroundImage: glow };
const darkGlowStyle: ViewStyle = Platform.OS === 'web'
  ? { backgroundImage: darkGlow } as ViewStyle
  : { experimental_backgroundImage: darkGlow };
// Expo's web blur boosts saturation, which makes the transparent panel look tinted.
const webGlass = { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as ViewStyle;

export function LoginSurface({ mode = 'login', busy, onRegister, children }: { mode?: 'login' | 'register'; busy: boolean; onRegister?: () => void; children: ReactNode }) {
  useAppTheme();
  const isDark = true;
  const insets = useSafeAreaInsets();
  const canvas = '#1C1C1B';
  const target = useRef<View | null>(null);
  const motion = useLoginMotion();
  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: canvas }]}>
      <BlurTargetView ref={target} pointerEvents="none" style={styles.backdrop}>
        <LinearGradient colors={isDark ? ['#101110', '#171817', '#242423', canvas] : ['#153F5C', '#28728C', '#B8DEE6', canvas]} locations={[0, 0.24, 0.52, 1]} style={styles.backdrop} />
        <Animated.View style={[styles.glow, isDark ? darkGlowStyle : glowStyle, isDark && styles.dimGlow, motion.glow]} testID="login-glow" />
      </BlurTargetView>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.fill}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
          <ScrollView bounces={false} contentContainerStyle={[styles.scroll, { paddingBottom: 56 + Math.max(insets.bottom, 28) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View style={[styles.content, motion.intro]} testID="login-content">
              <View style={styles.brand} testID="auth-entry-header">
                <Image accessibilityLabel="DOSO ROBOTICS" resizeMode="contain" source={require('../../assets/brand/doso-robotics-wordmark-email-03526d27c6b4.png')} style={styles.wordmark} />
                <Text accessibilityRole="header" style={styles.slogan}>与你一起，向前探索。</Text>
              </View>
              <View style={[styles.card, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)', boxShadow: isDark ? '0 16px 48px rgba(0,0,0,0.32)' : '0 16px 48px rgba(17,56,66,0.035)' }]} testID="login-form">
                {Platform.OS === 'web'
                  ? <View pointerEvents="none" style={[styles.backdrop, webGlass]} />
                  : <BlurView pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={22} tint={isDark ? 'dark' : 'default'} style={styles.backdrop} />}
                <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.025)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.backdrop} />
                <View style={styles.form}>{children}</View>
              </View>
              <View style={styles.registerRow}>
                <Text style={[styles.prompt, { color: isDark ? '#CFD7ED' : '#303B50' }]}>{mode === 'register' ? '已有账户？' : '还没有账户？'}</Text>
                <Pressable accessibilityLabel={mode === 'register' ? '返回登录' : '创建账户'} accessibilityRole="button" accessibilityState={{ disabled: busy || !onRegister }} disabled={busy || !onRegister} onPress={onRegister} style={({ pressed }) => [styles.register, pressed && styles.pressed]} testID={mode === 'register' ? 'register-login' : 'login-register'}>
                  <Text style={[styles.registerLabel, { color: isDark ? '#FFFFFF' : '#101722' }]}>{mode === 'register' ? '登录' : '注册'}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  glow: { position: 'absolute', top: -64, right: -64, bottom: -64, left: -64 },
  dimGlow: { opacity: 0.5 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 48, paddingBottom: 144 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 384 },
  brand: { alignItems: 'center', marginBottom: 48 },
  wordmark: { width: '88%', maxWidth: 316, height: 36, tintColor: '#FFFFFF' },
  slogan: { color: '#FFFFFF', fontSize: 24, lineHeight: 34, fontWeight: '400', letterSpacing: 1, marginTop: 52, textAlign: 'center' },
  card: { borderRadius: 28, overflow: 'hidden', boxShadow: '0 16px 48px rgba(17,56,66,0.035)' },
  form: { paddingHorizontal: 24, paddingVertical: 28 },
  registerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 16 },
  prompt: { fontSize: 16, lineHeight: 24 },
  register: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  registerLabel: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  pressed: { opacity: 0.65 },
});
