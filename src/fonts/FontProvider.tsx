import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ProductFontContext } from './home';

export function FontProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    HomeRegular: require('../../assets/fonts/MiSans-Regular.otf'),
    HomeMedium: require('../../assets/fonts/MiSans-Medium.otf'),
    HomeSemibold: require('../../assets/fonts/MiSans-Demibold.otf'),
    HomeBold: require('../../assets/fonts/MiSans-Bold.otf'),
  });
  const [webReady, setWebReady] = useState<boolean | null>(Platform.OS === 'web' ? null : true);
  useEffect(() => {
    if (!loaded || Platform.OS !== 'web') return;
    let active = true;
    // Expo can report a registered CSS face before the browser has loaded its glyphs.
    void Promise.all(['HomeRegular', 'HomeMedium', 'HomeSemibold', 'HomeBold'].map(face => document.fonts.load(`16px ${face}`, '设备 DOSO 123')))
      .then(() => { if (active) setWebReady(true); }, () => { if (active) setWebReady(false); });
    return () => { active = false; };
  }, [loaded]);
  if (!error && (!loaded || webReady === null)) return <View style={styles.loading}><ActivityIndicator accessibilityLabel="正在准备界面" color="#9BB5C5" /></View>;
  return <ProductFontContext.Provider value={Platform.OS !== 'ios' && loaded && webReady === true}><View collapsable={false} testID="app-font-system" style={styles.root}>{children}</View></ProductFontContext.Provider>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, loading: { flex: 1, backgroundColor: '#1C1C1B', alignItems: 'center', justifyContent: 'center' } });
