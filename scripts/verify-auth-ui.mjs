import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../src/components/AuthEntry.tsx', import.meta.url), 'utf8');
const [login, register, forgot, otp, reset, username, displayName, button, social, socialNative, socialWeb, app] = await Promise.all([
  readFile(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/RegisterScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/ForgotPasswordScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/EmailOtpScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/ResetPasswordScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/UsernameOnboardingScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/DisplayNameConfirmationScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/GradientButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.native.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.web.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
]);

assert.match(login, /<AuthEntry mode="login"/);
assert.match(register, /<AuthEntry mode="register"/);
assert.match(entry, /getRegistrationLayout\(containerWidth/);
assert.match(entry, /useAppTheme/);
assert.match(entry, /wideBody:[\s\S]*flexDirection: 'row'/);
assert.match(entry, /headline: \{ fontSize: 24, lineHeight: 32/);
assert.match(entry, /minHeight: 48/);
assert.match(entry, /borderRadius: 16/);
assert.match(entry, /focused \? palette.accent : 'transparent'/);
assert.match(entry, /eye: \{ minHeight: 48, width: 44/);
assert.doesNotMatch(login, /AuthEntrySocial|onSocialLogin|activeSocialProvider/);
assert.doesNotMatch(register, /AuthEntrySocial|onSocialLogin|activeSocialProvider/);
assert.match(entry, /const appearance = useProductAppearance\(\)/);
assert.match(entry, /buttonInk: appearance.actionInk/);
assert.match(entry, /button: appearance.action/);
assert.doesNotMatch(entry, /doso-soft-air|boxShadow|LinearGradient/, 'auth uses solid surfaces without background haze or focus glow');
for (const screen of [login, register]) {
  assert.match(screen, /requestInFlightRef.current/, 'email and visible navigation share a synchronous lock');
  assert.match(screen, /mountedRef.current/, 'late responses must respect unmount');
}
assert.match(forgot, /输入注册邮箱，我们会发送邮箱验证码/);
assert.match(otp, /title="输入验证码"/);
assert.match(username, /title="设置用户名"/);
assert.match(login, /backDisabled\?: boolean/, 'AuthPage exposes a busy-safe back-button contract');
assert.match(login, /accessibilityState=\{\{ disabled: backDisabled \}\}/, 'the visual back action announces its disabled state');
assert.match(login, /disabled=\{backDisabled\}/, 'the visual back action cannot leave during a pending request');
assert.match(forgot, /<AuthPage compact backDisabled=\{busy\} onBack=\{onBackToLogin\}/, 'forgot-password blocks visual back while its request is pending');
assert.match(forgot, /const requestInFlightRef = useRef\(false\)/, 'forgot-password rejects same-tick duplicate submissions');
assert.match(forgot, /const mountedRef = useRef\(true\)/, 'forgot-password does not update local state after the successful transition unmounts it');
assert.doesNotMatch(forgot, /sent\?: boolean|验证码邮件已发送|重新发送验证码/, 'forgot-password does not expose a sent state that the real product immediately navigates away from');
assert.match(otp, /backDisabled=\{busy\}[\s\S]*onBack=\{handleBack\}/, 'email verification blocks visual back while verify or resend is pending');
assert.match(otp, /const handleBack = \(\) => \{\s*if \(busy \|\| requestInFlightRef\.current\) return/, 'OTP back uses the same synchronous request lock as verify and resend');
assert.match(otp, /const mountedRef = useRef\(true\)/, 'email verification tracks whether async work may still update the screen');
assert.match(otp, /const requestGenerationRef = useRef\(0\)/, 'email verification invalidates stale async requests');
assert.match(otp, /catch \(caught\) \{[\s\S]*otpFailureMessage\(caught/, 'email verification shows the classified service error instead of replacing it with an invalid-code message');
assert.match(otp, /accessibilityLabel=\{resendAccessibilityLabel\}/, 'resend exposes its current action or countdown to assistive technology');
assert.match(otp, /accessibilityState=\{\{ busy: resending, disabled: busy \|\| secondsLeft > 0 \}\}/, 'resend announces busy and disabled states');
assert.match(otp, /accessibilityValue=\{\{ text: resendAccessibilityLabel \}\}/, 'resend announces countdown progress without relying on color');
assert.match(otp, /resendButton:[\s\S]*minHeight:\s*44/, 'resend keeps a 44px minimum touch target');
assert.match(reset, /<AuthPage compact backDisabled=\{busy\} onBack=\{handleBack\}/, 'password reset blocks visual back while its request is pending');
assert.match(reset, /if \(busy \|\| requestInFlightRef\.current\) return/, 'password reset rejects same-tick duplicate submissions');
assert.match(reset, /if \(requestInFlightRef\.current\) return;\s*onBackToLogin\(\)/, 'password reset shares its synchronous request lock with visible back navigation');
assert.match(displayName, /backDisabled=\{busy\}/, 'display-name recovery blocks visual back while persistence is pending');
assert.match(displayName, /onBack=\{cancel\}/, 'display-name recovery exposes the same guarded cancellation path to visible back navigation');
assert.match(app, /if \(stage === 'display-name-confirmation'\) \{[\s\S]*displayNameCancelRef\.current\(\)[\s\S]*return true/, 'Android hardware back shares the display-name cancellation contract');
assert.match(app, /if \(stage === 'reset-password'\) \{\s*if \(accountBusy \|\| accountFlowInFlightRef\.current\) return true;/, 'Android hardware back cannot leave a pending password reset, including the same tick that starts it');
assert.match(app, /const accountFlowInFlightRef = useRef\(false\)/, 'App owns a synchronous account-flow concurrency guard');
assert.match(app, /if \(stage === 'register' \|\| stage === 'forgot-password' \|\| stage === 'verify-email' \|\| stage === 'verify-recovery'\) \{\s*if \(accountBusy \|\| otpDeliveryInFlightRef\.current\) return true;/, 'Android hardware back cannot leave pending registration or email requests, including the same tick that starts delivery');
assert.match(app, /const otpDeliveryInFlightRef = useRef\(false\)/, 'App owns a synchronous OTP-delivery concurrency guard');
assert.match(app, /const handleForgotPassword = async \(email: string\) => \{\s*if \(accountBusy \|\| otpDeliveryInFlightRef\.current\) return;\s*otpDeliveryInFlightRef\.current = true;/, 'password recovery rejects same-tick duplicate delivery requests');
assert.match(app, /const handleResendVerification = async \(\) => \{[\s\S]*otpDeliveryInFlightRef\.current = true;[\s\S]*setAccountBusy\(true\);[\s\S]*finally \{\s*otpDeliveryInFlightRef\.current = false;\s*setAccountBusy\(false\);/, 'OTP resend locks App navigation and always releases the delivery guard');
assert.doesNotMatch(app, /邮件中的 6 位验证码|收到 6 位验证码|6 位数字验证码完成注册/, 'App copy does not promise a server-specific email OTP length');
assert.match(app, /const accountSecurityNonceAttemptRef = useRef\(0\)/, 'password-change nonce delivery has a stale-result generation guard');
assert.match(app, /if \(stage !== 'account-security'\) accountSecurityNonceAttemptRef\.current \+= 1/, 'leaving account security invalidates a late password-change nonce result');
assert.match(app, /const handleRequestPasswordChange = async \(\) => \{[\s\S]*otpDeliveryInFlightRef\.current = true;[\s\S]*sendReauthenticationNonce\(\)[\s\S]*accountSecurityNonceAttemptRef\.current !== attempt/, 'password-change nonce delivery is deduplicated and checks result freshness');
assert.match(app, /stage === 'account-security'[\s\S]*if \(accountBusy \|\| otpDeliveryInFlightRef\.current\) return true/, 'Android hardware back cannot leave account security while a password-change nonce is pending');
assert.match(app, /const mfaBackRequestRef = useRef<\(\) => void>/, 'App keeps the MFA cleanup-backed back request');
assert.match(app, /if \(stage === 'mfa-setup'\) \{\s*if \(mfaBusy \|\| mfaVerificationFlow\.current\.isPending\(\)\) return true;\s*mfaBackRequestRef\.current\(\);/, 'Android MFA back observes both the screen busy lock and pending verification ownership before delegating to cleanup');
assert.doesNotMatch(username, /例如 doso_user01/);
assert.match(button, /authSolid/);
assert.match(button, /backgroundColor: locked \? palette\.quiet : palette\.button/, 'auth button keeps disabled and loading states visually locked');
assert.match(button, /loading \? palette\.accent : locked \? palette\.secondary : palette\.buttonInk/, 'loading, disabled and enabled labels use distinct shared palette roles');
assert.match(button, /accessibilityState=\{\{ disabled: locked, busy: loading \}\}/, 'loading is exposed separately from ineligibility to assistive technologies');
assert.match(button, /authSolid:\s*\{[\s\S]*minHeight:\s*52[\s\S]*borderRadius:\s*16/, 'auth CTA keeps the shared 52px height and 16px radius');
assert.match(button, /authLabel:\s*\{[\s\S]*fontSize:\s*17[\s\S]*lineHeight:\s*25/, 'auth CTA keeps the shared readable label metrics');
assert.match(social, /brandMark:[\s\S]*height:\s*44[\s\S]*width:\s*44/, 'all social brands share one 44px optical canvas');
assert.match(social, /buttonRow:[\s\S]*gap:\s*20/, 'social actions use balanced spacing after adding visible state rings');
assert.match(social, /button:[\s\S]*height:\s*56[\s\S]*width:\s*56/, 'social actions use equal 56px touch and selection targets');
for (const platformSocial of [social, socialNative, socialWeb]) {
  assert.match(platformSocial, /compact\?: boolean/, 'every platform exposes the compact landscape social state');
  assert.match(platformSocial, /buttonCompact:[\s\S]*height:\s*44[\s\S]*width:\s*44/, 'every platform keeps compact landscape actions at the minimum touch target');
  assert.match(platformSocial, /provider\.icon && !disabledVisual && styles\.brandMarkPlate/, 'unavailable providers do not render inconsistent white icon plates');
}
assert.match(app, /const \[activeSocialProvider, setActiveSocialProvider\] = useState<SocialLoginProvider \| null>\(null\)/, 'App owns the active social provider state');
assert.match(app, /const socialLoginInFlightRef = useRef\(false\)/, 'App owns a synchronous social-login concurrency guard');
assert.match(app, /if \(accountBusy \|\| socialLoginInFlightRef\.current\) return;[\s\S]*socialLoginInFlightRef\.current = true/, 'social authorization rejects same-tick and cross-auth duplicate launches');
assert.match(app, /setActiveSocialProvider\(provider\)[\s\S]*setAccountBusy\(true\)/, 'social authorization selects its provider before entering the busy state');
assert.match(app, /finally \{[\s\S]*socialLoginInFlightRef\.current = false[\s\S]*setActiveSocialProvider\(null\)[\s\S]*setAccountBusy\(false\)/, 'social authorization always clears its concurrency guard, provider selection, and busy state together');
assert.doesNotMatch(`${forgot}\n${reset}`, /icon="/);

console.log('DOSO responsive Figma auth UI contract PASS');
