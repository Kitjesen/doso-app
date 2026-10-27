// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getSecurityPageLayout } from '../src/screens/securityPageLayout.ts';

const accountSecuritySource = readFileSync(new URL('../src/screens/AccountSecurityScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const displayNameSource = readFileSync(new URL('../src/screens/DisplayNameConfirmationScreen.tsx', import.meta.url), 'utf8');
const emailOtpSource = readFileSync(new URL('../src/screens/EmailOtpScreen.tsx', import.meta.url), 'utf8');
const forgotPasswordSource = readFileSync(new URL('../src/screens/ForgotPasswordScreen.tsx', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8');
const mfaSource = readFileSync(new URL('../src/screens/MfaSetupScreen.tsx', import.meta.url), 'utf8');
const resetPasswordSource = readFileSync(new URL('../src/screens/ResetPasswordScreen.tsx', import.meta.url), 'utf8');
const usernameSource = readFileSync(new URL('../src/screens/UsernameOnboardingScreen.tsx', import.meta.url), 'utf8');

test('844x390 security pages use two readable columns', () => {
  const layout = getSecurityPageLayout({ containerHeight: 390, containerWidth: 844 });

  assert.equal(layout.usesColumns, true);
  assert.equal(layout.contentWidth, 804);
  assert.equal(layout.columnWidth, 392);
  assert.equal(layout.gridGap, 20);
});

test('landscape cutouts shrink both columns without overflow', () => {
  const layout = getSecurityPageLayout({
    containerHeight: 390,
    containerWidth: 844,
    insetLeft: 24,
    insetRight: 24,
  });

  assert.equal(layout.usesColumns, true);
  assert.equal(layout.contentWidth, 756);
  assert.equal(layout.columnWidth * 2 + layout.gridGap, layout.contentWidth);
});

test('narrow landscape and portrait remain stacked and readable', () => {
  assert.equal(getSecurityPageLayout({ containerHeight: 360, containerWidth: 640 }).usesColumns, false);
  assert.equal(getSecurityPageLayout({ containerHeight: 844, containerWidth: 390 }).columnWidth, 342);
  assert.equal(getSecurityPageLayout({ containerHeight: 844, containerWidth: 320 }).columnWidth, 272);
});

test('portrait security pages use the Figma 24px gutter while landscape keeps the 20px grid', () => {
  assert.equal(getSecurityPageLayout({ containerHeight: 844, containerWidth: 390 }).contentWidth, 342);
  assert.equal(getSecurityPageLayout({ containerHeight: 390, containerWidth: 844 }).contentWidth, 804);
});

test('account and MFA screens consume dynamic theme and responsive layout', () => {
  assert.match(accountSecuritySource, /useAppTheme\(\)/);
  assert.match(mfaSource, /useAuthEntryPalette\(\)/);
  for (const source of [accountSecuritySource, mfaSource]) {
    assert.match(source, /useWindowDimensions\(\)/);
    assert.match(source, /SafeAreaView/);
    assert.match(source, /useSafeAreaInsets\(\)/);
    assert.match(source, /getSecurityPageLayout/);
  }
  assert.doesNotMatch(mfaSource, /enabledStatus:\s*\{[^}]*#D9F6E4/, 'the enabled badge must not retain its light-only surface in dark mode');
  assert.match(mfaSource, /enabledStatus:\s*\{[^}]*color:\s*colors.accent/, 'enabled assurance uses the dynamic readable accent, not a light-only tinted badge');
});

test('App-owned MFA completion returns to a freshly mounted account security screen', () => {
  assert.match(mfaSource, /await onCompleted\?\.\(\{ kind: completionKind, status: nextStatus \}\)/, 'MFA completion reports whether enrollment or step-up completed');
  assert.match(
    appSource,
    /<MfaSetupScreen[\s\S]*?onVerify=\{handleMfaVerify\}/,
    'the production App owns verification instead of relying on an unmounted child callback',
  );
  assert.match(appSource, /const completion = flow\.reconcile/);
  assert.match(appSource, /setStage\('account-security'\);\s*notify\(completion\.kind === 'enrollment'/);
});

test('Android hardware back cannot abandon a pending MFA verification', () => {
  assert.match(mfaSource, /onBusyChange\?: \(busy: boolean\) => void/);
  assert.match(mfaSource, /const busy = loading \|\| submitting \|\| canceling/);
  assert.match(mfaSource, /onBusyChange\?\.\(busy\)/);
  assert.match(appSource, /const \[mfaBusy, setMfaBusy\] = useState\(false\)/);
  assert.match(appSource, /if \(stage === 'mfa-setup'\) \{\s*if \(mfaBusy \|\| mfaVerificationFlow\.current\.isPending\(\)\) return true;/);
  assert.match(appSource, /onBusyChange=\{setMfaBusy\}/);
  assert.match(appSource, /mfaBackRequestRef\.current\(\)/, 'Android back delegates to the same cleanup contract as the visible back action');
  assert.match(mfaSource, /onBackRequestChange/, 'MFA exposes its cleanup-backed back request to the App shell');
});

test('terminal revocation is gated by an explicit confirmation state', () => {
  assert.match(accountSecuritySource, /pendingConfirmation/);
  assert.match(accountSecuritySource, /confirmPendingAction/);
  assert.match(accountSecuritySource, /取消/);
  assert.match(accountSecuritySource, /确认/);
});

test('account security reports the real server-backed MFA assurance state', () => {
  assert.match(accountSecuritySource, /getMfaStatus/);
  assert.match(accountSecuritySource, /未启用/);
  assert.match(accountSecuritySource, /已启用 · AAL1/);
  assert.match(accountSecuritySource, /已启用 · AAL2/);
  assert.match(accountSecuritySource, /读取失败/);
  assert.doesNotMatch(accountSecuritySource, /注册 TOTP，为管理后台启用 AAL2/);
  assert.match(accountSecuritySource, /const mfaActionAvailable = mfaDisplayState === 'disabled' \|\| mfaDisplayState === 'aal1' \|\| mfaDisplayState === 'aal2'/);
  assert.match(accountSecuritySource, /mfaDisplayState === 'error'[\s\S]*重新读取 MFA 状态/);
});

test('account security keeps password capability unknown while login methods are loading', () => {
  assert.match(accountSecuritySource, /const passwordCapabilityPending = Boolean\(normalizedEmail && emailVerified && loginMethodsLoading\)/);
  assert.match(accountSecuritySource, /passwordCapabilityPending \? '读取中' : canChangePassword \? '已验证' : '不可用于找回'/);
  assert.match(accountSecuritySource, /passwordCapabilityPending \? styles\.statusNeutral : canChangePassword \? styles\.verified : styles\.unverified/);
  assert.match(accountSecuritySource, /passwordCapabilityPending \? '正在确认邮箱登录方式…' : '需要已启用且验证完成的邮箱登录方式'/);
});

test('external account-security busy state locks visible navigation and actions', () => {
  assert.match(accountSecuritySource, /busy\?: boolean/);
  assert.match(accountSecuritySource, /busy = false/);
  assert.match(accountSecuritySource, /const interactionLocked = busy \|\| Boolean\(activeAction\)/);
  assert.match(accountSecuritySource, /正在处理账户安全操作…/);
  assert.match(accountSecuritySource, /accessibilityLabel="返回"[\s\S]*?disabled=\{interactionLocked\}/);
  assert.match(accountSecuritySource, /disabled=\{interactionLocked\}[\s\S]*?onPress=\{onChangePassword\}/);
  assert.match(accountSecuritySource, /disabled=\{interactionLocked\}[\s\S]*?onPress=\{onManageMfa\}/);
});

test('account-security async loads and actions ignore stale or unmounted completions', () => {
  for (const guard of [
    'mountedRef',
    'terminalRequestGenerationRef',
    'loginMethodsRequestGenerationRef',
    'mfaRequestGenerationRef',
    'actionRequestGenerationRef',
  ]) {
    assert.match(accountSecuritySource, new RegExp(guard));
  }
  assert.match(accountSecuritySource, /mountedRef\.current = false/);
  assert.match(accountSecuritySource, /requestId !== terminalRequestGenerationRef\.current/);
  assert.match(accountSecuritySource, /requestId !== loginMethodsRequestGenerationRef\.current/);
  assert.match(accountSecuritySource, /requestId !== mfaRequestGenerationRef\.current/);
  assert.match(accountSecuritySource, /requestId !== actionRequestGenerationRef\.current/);
});

test('remaining authentication steps use dynamic colors and touch-safe secondary actions', () => {
  for (const source of [displayNameSource, emailOtpSource, forgotPasswordSource, usernameSource]) {
    assert.match(source, /useAuthEntryPalette\(\)/);
    assert.match(source, /AuthPage/);
  }
  assert.match(resetPasswordSource, /AuthPage/);
  assert.match(resetPasswordSource, /AuthField/);
  assert.match(resetPasswordSource, /GradientButton[\s\S]*variant="auth"/);
  assert.match(loginSource, /useSafeAreaInsets\(\)/);
  assert.match(loginSource, /contentLandscape/);
  assert.match(emailOtpSource, /backToLogin:[\s\S]*minHeight:\s*44/);
});

test('email OTP keeps the numeric keyboard from covering the landscape composition', () => {
  assert.match(emailOtpSource, /useWindowDimensions\(\)/, 'OTP focus policy responds to orientation changes');
  assert.match(emailOtpSource, /const isLandscape = width > height/);
  assert.match(emailOtpSource, /autoFocus=\{!isLandscape\}/, 'portrait keeps convenient autofocus while landscape starts keyboard-free');
  assert.match(emailOtpSource, /if \(!isLandscape\) return;[\s\S]*codeInputRef\.current\?\.blur\(\);[\s\S]*Keyboard\.dismiss\(\)/, 'rotating an already focused OTP screen to landscape releases the keyboard');
  assert.match(emailOtpSource, /compact=\{isLandscape\}/, 'landscape OTP uses the compact primary action');
  assert.match(emailOtpSource, /secondaryActionsLandscape:[\s\S]*flexDirection:\s*'row'/, 'resend recovery and return stay visible together in the landscape viewport');
  assert.match(emailOtpSource, /resendButton:[\s\S]*minHeight:\s*44/, 'the visible resend recovery keeps a touch-safe target');
});
