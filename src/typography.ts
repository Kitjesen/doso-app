// System UI typography: restrained headings, readable mobile body text.
// Each role carries its line height; selection must not change its metrics.
export const typography = {
  pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  secondary: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  button: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  compactTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  metric: { fontSize: 32, lineHeight: 42, fontWeight: '500', fontVariant: ['tabular-nums'] },
  supporting: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
} as const;

// Glass controls use quieter labels; stable numeric metrics stay prominent.
export const controlTypography = {
  ...typography,
  compactTitle: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  metric: { fontSize: 30, lineHeight: 38, fontWeight: '500', fontVariant: ['tabular-nums'] },
} as const;
