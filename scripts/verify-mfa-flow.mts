// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serviceSource = readFileSync(new URL('../src/services/mfaService.ts', import.meta.url), 'utf8');
const screenSource = readFileSync(new URL('../src/screens/MfaSetupScreen.tsx', import.meta.url), 'utf8');

test('TOTP enrollment preserves the Supabase QR code alongside manual setup data', () => {
  assert.match(serviceSource, /qrCode:\s*data\.totp\.qr_code/);
  assert.match(screenSource, /source=\{\{\s*uri:\s*enrollment\.qrCode\s*\}\}/);
  assert.match(screenSource, /enrollment\.secret/);
  assert.match(screenSource, /enrollment\.uri/);
  assert.match(screenSource, /Platform\.OS === 'web'/, 'SVG QR data is only rendered where the built-in image stack supports it');
  assert.match(screenSource, /当前原生版本暂不显示二维码/, 'native users receive a truthful manual-secret fallback instead of a broken QR image');
});

test('an AAL1 session with a verified TOTP factor can perform a step-up challenge', () => {
  assert.match(serviceSource, /export async function verifyTotpFactor/);
  assert.match(serviceSource, /challengeAndVerify\(\{\s*factorId,\s*code:\s*normalizedCode/);
  assert.match(screenSource, /status\.currentLevel === 'aal1'/);
  assert.match(screenSource, /status\.verifiedTotpFactors\[0\]/);
  assert.match(screenSource, /verifyTotpFactor/);
});

test('the MFA code field has an unmistakable empty state instead of a fake OTP', () => {
  assert.match(screenSource, /placeholder="••••••"/);
  assert.doesNotMatch(screenSource, /placeholder="(?:000000|123456)"/);
  assert.match(screenSource, /letterSpacing: 10/);
  assert.match(screenSource, /disabled=\{busy \|\| code\.length !== 6\}/, 'verification remains unavailable until six real digits are entered');
});

test('AAL2 is rendered as completed and pending cleanup participates in busy state', () => {
  assert.match(screenSource, /status\.currentLevel === 'aal2'/);
  assert.match(screenSource, /const \[canceling, setCanceling\] = useState\(false\)/);
  assert.match(screenSource, /const busy = loading \|\| submitting \|\| canceling/);
  assert.match(screenSource, /onBusyChange\?\.\(busy\)/);
  assert.match(screenSource, /setCanceling\(true\)[\s\S]*?discardPendingEnrollment\(\)[\s\S]*?setCanceling\(false\)/);
  assert.match(screenSource, /无法安全取消未完成的验证器设置/);
});

test('MFA completion distinguishes enrollment from session step-up and ignores late async results', () => {
  assert.match(screenSource, /kind: 'enrollment' \| 'step-up'/);
  assert.match(screenSource, /const completionKind = enrollment \? 'enrollment' : 'step-up'/);
  assert.match(screenSource, /mountedRef/);
  assert.match(screenSource, /operationGenerationRef/);
  assert.match(screenSource, /onBackRequestChange/);
});
