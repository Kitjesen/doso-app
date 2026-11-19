import { createContext } from 'react';
import { Platform, StyleSheet, type TextStyle, type StyleProp } from 'react-native';

// The reference is raster artwork; use a reproducible UI stack rather than an inferred font name.
export const ProductFontContext = createContext(false);
export const homeFont: TextStyle = {};

export function productFont(style: StyleProp<TextStyle>): TextStyle | undefined {
  if (Platform.OS === 'ios') return undefined;
  const value = StyleSheet.flatten(style);
  if (value?.fontFamily && !value.fontFamily.startsWith('Home')) return;
  const weight = value?.fontWeight === 'bold' ? 700 : Number(value?.fontWeight ?? 400);
  return { fontFamily: weight >= 700 ? 'HomeBold' : weight >= 600 ? 'HomeSemibold' : weight >= 500 ? 'HomeMedium' : 'HomeRegular', fontWeight: '400' };
}


export const productType = {
  title: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  section: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
} as const;
