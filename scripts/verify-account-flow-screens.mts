// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resetPassword = readFileSync(new URL('../src/screens/ResetPasswordScreen.tsx', import.meta.url), 'utf8');
const usernameOnboarding = readFileSync(new URL('../src/screens/UsernameOnboardingScreen.tsx', import.meta.url), 'utf8');
const displayNameConfirmation = readFileSync(new URL('../src/screens/DisplayNameConfirmationScreen.tsx', import.meta.url), 'utf8');
const designQaRoot = readFileSync(new URL('../src/design-qa/DesignQaRoot.tsx', import.meta.url), 'utf8');
const appShell = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const accountFlowScreens = [resetPassword, usernameOnboarding, displayNameConfirmation];

test('all account forms reject same-tick duplicate actions and ignore unmounted completions', () => {
  for (const source of accountFlowScreens) {
    assert.match(source, /requestInFlightRef/);
    assert.match(source, /mountedRef/);
    assert.match(source, /mountedRef\.current = false/);
    assert.match(source, /if \(busy \|\| requestInFlightRef\.current\) return/);
    assert.match(source, /requestInFlightRef\.current = true/);
    assert.match(source, /requestInFlightRef\.current = false/);
    assert.match(source, /if \(mountedRef\.current\)/);
  }
});

test('password reset shares its request lock with visible back navigation', () => {
  assert.match(resetPassword, /onBack=\{handleBack\}/);
  assert.match(resetPassword, /if \(requestInFlightRef\.current\) return/);
  assert.match(resetPassword, /backDisabled=\{busy\}/);
});

test('password reauthentication nonce uses the shared variable-length email OTP contract', () => {
  assert.match(resetPassword, /isValidEmailOtp\(nonce\)/);
  assert.match(resetPassword, /sanitizeEmailOtpInput\(value\)/);
  assert.match(resetPassword, /EMAIL_OTP_INVALID_MESSAGE/);
  assert.doesNotMatch(resetPassword, /\^\\d\{6,8\}\$|replace\(\/\\D\/g|slice\(0, 8\)/);
});

test('username claim and logout use one exclusive action state', () => {
  assert.match(usernameOnboarding, /'claim' \| 'logout' \| null/);
  assert.match(usernameOnboarding, /await onClaim\(normalized\)/);
  assert.match(usernameOnboarding, /await onLogout\(\)/);
  assert.match(usernameOnboarding, /accessibilityState=\{\{ busy: activeAction === 'logout', disabled: busy \}\}/);
  assert.match(usernameOnboarding, /minHeight:\s*44/);
});

test('display-name save, skip, and visible back use one exclusive action state', () => {
  assert.match(displayNameConfirmation, /'save' \| 'cancel' \| null/);
  assert.match(displayNameConfirmation, /onBack=\{cancel\}/);
  assert.match(displayNameConfirmation, /await onSave\(normalized\)/);
  assert.match(displayNameConfirmation, /await onCancel\(\)/);
  assert.match(displayNameConfirmation, /accessibilityState=\{\{ busy: activeAction === 'cancel', disabled: busy \}\}/);
  assert.match(displayNameConfirmation, /minHeight:\s*44/);
});

test('display-name QA starts empty instead of inventing Apple profile data', () => {
  assert.match(designQaRoot, /DisplayNameConfirmationScreen[\s\S]*initialDisplayName=""/);
  assert.doesNotMatch(designQaRoot, /DOSO 设计验收/);
});

test('the App shell closes the same-tick Android-back window for account actions', () => {
  assert.match(appShell, /const accountFlowInFlightRef = useRef\(false\)/);
  assert.match(appShell, /if \(accountBusy \|\| accountFlowInFlightRef\.current\) return/);
  assert.match(appShell, /stage === 'reset-password'[\s\S]*accountBusy \|\| accountFlowInFlightRef\.current/);
  assert.match(appShell, /stage === 'display-name-confirmation'[\s\S]*!accountFlowInFlightRef\.current/);
  assert.match(appShell, /stage === 'username-onboarding'[\s\S]*!accountFlowInFlightRef\.current/);
});
