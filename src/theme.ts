import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';

// Scoped preview preference; production continues to follow the system.
export const ThemePreferenceContext = createContext<'light' | 'dark' | null>(null);

export const lightColors = {
  background: '#FFFFFF',
  surface: '#F4F7FA',
  surfaceStrong: '#F4F7FA',
  ink: '#253441',
  inkSoft: '#253441',
  muted: '#586675',
  line: '#E2E6F0',
  // The product direction is white / graphite / soft blue. These legacy
  // token names remain for screen compatibility, but their values are no
  // longer mint/green so shared UI cannot drift back to the rejected palette.
  navStart: '#0F172A',
  navEnd: '#284B6D',
  mint: '#B8D6F4',
  green: '#7EA9E8',
  greenStrong: '#4F8BD9',
  greenDark: '#1F4D7A',
  successText: '#2F6AA3',
  danger: '#FF6F78',
  dangerText: '#B52E42',
  dangerSurface: '#FFF2F3',
  authBackground: '#FFFFFF',
  authBorder: '#D0D5DD',
  authFocus: '#0066FF',
  authPrimary: '#0066FF',
  authPrimaryInk: '#FFFFFF',
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  background: '#17191D',
  surface: '#24272D',
  surfaceStrong: '#24272D',
  ink: '#EDF2F4',
  inkSoft: '#EDF2F4',
  muted: '#B9C2CC',
  line: 'rgba(101,112,124,0.55)',
  navStart: '#0B1120',
  navEnd: '#1B2C46',
  mint: '#8FB9E8',
  green: '#80A9DD',
  greenStrong: '#74A6E2',
  greenDark: '#B4D0F2',
  successText: '#A9C9F0',
  danger: '#FF7F89',
  dangerText: '#FF9BA4',
  dangerSurface: '#381D23',
  authBackground: '#17191D',
  authBorder: '#65707C',
  authFocus: '#88BBFF',
  authPrimary: '#88BBFF',
  authPrimaryInk: '#17191D',
};

// Compatibility export for screens that have not yet moved to the dynamic hook.
export const colors = lightColors;

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const preference = useContext(ThemePreferenceContext);
  const scheme = preference ?? (systemScheme === 'dark' ? 'dark' : 'light');

  return {
    colors: scheme === 'dark' ? darkColors : lightColors,
    isDark: scheme === 'dark',
    scheme,
  } as const;
}

export const radii = {
  sm: 14,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const;

export const screenPadding = 20;

export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#1F4D7A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 3 },
  default: {},
});
