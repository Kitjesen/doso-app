import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const otp = await readFile(new URL('../src/screens/EmailOtpScreen.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(otp, /6 位数字验证码已发送|6 位邮箱验证码|maxLength=\{6\}/, 'email verification copy does not promise a server-specific OTP length');
assert.doesNotMatch(otp, /maxLength=/, 'native input must not truncate a formatted OTP before whitespace normalization');
assert.match(otp, /disabled=\{busy \|\| !isValidEmailOtp\(code\)\}/, 'email verification enables submit for the complete supported email OTP range');
assert.match(otp, /letterSpacing: 6/, 'up to ten OTP digits remain readable inside the shared auth form');
assert.match(otp, /codeExpired[\s\S]*\(\?:已过期\|expired\)[\s\S]*setSecondsLeft\(0\)/, 'an expired OTP immediately unlocks the real resend recovery action');
assert.match(otp, /await onResend\(\);[\s\S]*setCode\(''\);[\s\S]*setSecondsLeft\(RESEND_SECONDS\)/, 'successful resend clears the stale code and restarts the countdown');

console.log('DOSO email OTP visual-truth and expired-recovery contract PASS');
