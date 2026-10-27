import { useFonts } from 'expo-font';
import { createContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { fontFamilies } from './font-family';

export const FontReadyContext = createContext(false);
export const FONT_LOAD_TIMEOUT_MS = 5000;
export const appFontSources = {
  [fontFamilies.regular]: require('../../assets/fonts/MiSans-Regular.otf'),
  [fontFamilies.medium]: require('../../assets/fonts/MiSans-Medium.otf'),
  [fontFamilies.semibold]: require('../../assets/fonts/MiSans-Demibold.otf'),
  [fontFamilies.bold]: require('../../assets/fonts/MiSans-Bold.otf'),
};

export function FontProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts(appFontSources);
  const [timedOut, setTimedOut] = useState(false);
  const dark = useColorScheme() === 'dark';
  useEffect(() => {
    if (loaded || error) return;
    const timer = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, error]);

  if (!loaded && !error && !timedOut) {
    return (
      <View testID="font-loading" style={[styles.loading, { backgroundColor: dark ? '#17191D' : '#FFFFFF' }]}>
        <ActivityIndicator accessibilityLabel="正在准备界面" color={dark ? '#88BBFF' : '#0066FF'} />
        <Text accessibilityLiveRegion="polite" style={[styles.label, { color: dark ? '#D5D9E0' : '#536172' }]}>正在准备界面…</Text>
      </View>
    );
  }
  // Auth and QA mount only once after loading/fallback. No global Text patch,
  // font network request, or retry/remount of an in-progress account operation.
  return <FontReadyContext.Provider value={loaded}><View collapsable={false} testID={loaded ? 'app-font-misans' : 'app-font-system-fallback'} style={styles.root}>{children}</View></FontReadyContext.Provider>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  label: { fontSize: 14, lineHeight: 22 },
});
