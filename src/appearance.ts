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
    raised: isDark ? '#2C2C2A' : '#FFFFFF',
    ink: colors.ink,
    secondary: colors.muted,
    // A semantic alias, not an additional grey layer.
    quiet: surface,
    border: isDark ? '#343432' : '#E4E7EC',
    blue: brandSky,
    blueSoft: isDark ? '#292F33' : '#EAF5FF',
    blueInk: isDark ? '#A3B7C5' : '#214F71',
    // One accent for selection and actions; radio/text retain the distinction.
    selectionSurface: isDark ? '#363634' : brandSky,
    selectionInk: isDark ? '#E8E8E6' : accentInk,
    action: isDark ? '#F0F4FE' : brandSky,
    // Official dark CTA is a light pill with dark ink.
    actionInk: isDark ? '#1C1C1B' : accentInk,
    nav: isDark ? '#1C1C1B' : '#F4F5F7',
  } as const;
}

export type ProductAppearance = ReturnType<typeof getProductAppearance>;

export function useProductAppearance() {
  const { isDark } = useAppTheme();
  return getProductAppearance(isDark);
}
