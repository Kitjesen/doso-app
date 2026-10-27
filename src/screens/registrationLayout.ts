/** Use the viewport measured inside SafeAreaView, not artwork dimensions. */
export function getRegistrationLayout(safeWidth: number, fontScale = 1) {
  const available = Number.isFinite(safeWidth) ? Math.max(0, safeWidth) : 0;
  const gutter = available < 360 ? 20 : 24;
  const wide = available >= 720 && fontScale <= 1.35;
  const contentWidth = Math.max(0, Math.min(wide ? 1040 : 440, available - gutter * 2));
  const gap = 32;
  const formWidth = wide ? Math.min(480, Math.round((contentWidth - gap) * 0.63)) : contentWidth;
  const introWidth = wide ? contentWidth - gap - formWidth : contentWidth;
  return { wide, gutter, gap, contentWidth, formWidth, introWidth, inlineIdentity: wide && formWidth >= 420 && fontScale <= 1.15 };
}

export function registrationPasswordChecks(password: string) {
  return [
    { label: '至少 10 位', met: password.length >= 10 },
    { label: '大小写字母', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: '包含数字', met: /\d/.test(password) },
  ];
}
