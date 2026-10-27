import { darkColors, lightColors, useAppTheme } from './theme';

// User-selected sky blue and compact, borderless dashboard geometry.
export const brandSky = '#98D1FF';
const accentInk = '#17354D';
export const cardLayout = {
  radius: 24,
  inset: 16,
  gap: 12,
} as const;

// The selected Overlay references inform materials, not product capabilities.
export function getProductAppearance(isDark: boolean) {
  const colors = isDark ? darkColors : lightColors;
  const surface = colors.surface;
  return {
    isDark,
    canvas: colors.background,
    surface,
    raised: isDark ? '#30343C' : '#FFFFFF',
    ink: colors.ink,
    secondary: colors.muted,
    // A semantic alias, not an additional grey layer.
    quiet: surface,
    border: isDark ? '#3B3F47' : '#E4E7EC',
    blue: brandSky,
    blueSoft: isDark ? '#263C4D' : '#EAF5FF',
    blueInk: isDark ? brandSky : '#214F71',
    // One accent for selection and actions; radio/text retain the distinction.
    selectionSurface: brandSky,
    selectionInk: accentInk,
    action: brandSky,
    // Pale blue needs dark labels in both modes, not low-contrast white.
    actionInk: accentInk,
    nav: isDark ? '#24272D' : '#F4F5F7',
  } as const;
}

export type ProductAppearance = ReturnType<typeof getProductAppearance>;

export function useProductAppearance() {
  const { isDark } = useAppTheme();
  return getProductAppearance(isDark);
}
