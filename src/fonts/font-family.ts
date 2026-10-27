import type { TextStyle } from 'react-native';

// Each runtime alias identifies an actual static face, not a synthetic weight.
export const fontFamilies = {
  regular: 'MiSans-Regular',
  medium: 'MiSans-Medium',
  semibold: 'MiSans-Demibold',
  bold: 'MiSans-Bold',
} as const;

export function getFontWeight(style?: TextStyle, inheritedWeight?: TextStyle['fontWeight']) {
  return style?.fontWeight ?? inheritedWeight ?? '400';
}

export function resolveFontStyle(style: TextStyle | undefined, ready: boolean, inheritedWeight?: TextStyle['fontWeight']): TextStyle | undefined {
  // Explicit families (icons/diagnostic monospace) and italic text keep their
  // own rendering. A failed font load must leave the native fallback intact.
  if (!ready || style?.fontFamily || style?.fontStyle === 'italic') return undefined;
  const requested = getFontWeight(style, inheritedWeight);
  const weight = requested === 'bold' ? 700 : requested === 'normal' ? 400 : Number(requested);
  const fontFamily = weight >= 700 ? fontFamilies.bold
    : weight >= 600 ? fontFamilies.semibold
      : weight >= 500 ? fontFamilies.medium : fontFamilies.regular;
  return { fontFamily, fontWeight: 'normal' };
}
