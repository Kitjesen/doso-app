// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';

// @ts-expect-error Node verifier uses the explicit TypeScript source entrypoint.
import { mapOtpOperationError, OtpOperationError } from '../src/services/otpError.ts';

const cases = [
  {
    name: 'expired verification tokens stay actionable',
    error: { code: 'otp_expired', message: 'Token has expired', status: 403 },
    operation: 'verification',
    message: '验证码无效或已过期，请重新获取后再试。',
  },
  {
    name: 'rate limits are not mislabeled as invalid codes',
    error: { code: 'over_email_send_rate_limit', message: 'rate limit exceeded', status: 429 },
    operation: 'delivery',
    message: '操作过于频繁，请稍后再试。',
  },
  {
    name: 'network failures tell the user to check connectivity',
    error: new TypeError('Failed to fetch'),
    operation: 'verification',
    message: '无法连接认证服务，请检查网络后重试。',
  },
  {
    name: 'server failures are not mislabeled as invalid codes',
    error: { message: 'upstream unavailable', status: 503 },
    operation: 'verification',
    message: '验证码服务暂时不可用，请稍后重试。',
  },
  {
    name: 'unknown verification failures fail safely without blaming the code',
    error: { message: 'unexpected auth response' },
    operation: 'verification',
    message: '暂时无法验证验证码，请稍后重试。',
  },
  {
    name: 'unknown delivery failures retain a delivery-specific fallback',
    error: null,
    operation: 'delivery',
    message: '暂时无法发送验证码，请稍后再试。',
  },
] as const;

for (const testCase of cases) {
  const mapped = mapOtpOperationError(testCase.error, testCase.operation);
  assert.ok(mapped instanceof Error, testCase.name);
  assert.equal(mapped.message, testCase.message, testCase.name);
}

const originalRateLimit = { code: 'over_request_rate_limit', message: 'rate limit exceeded', status: 429 };
const preserved = mapOtpOperationError(originalRateLimit, 'delivery');
assert.ok(preserved instanceof OtpOperationError);
assert.equal(preserved.category, 'rate_limited');
assert.equal(preserved.authCode, originalRateLimit.code);
assert.equal(preserved.status, originalRateLimit.status);
assert.equal(preserved.cause, originalRateLimit);

console.log(`DOSO OTP error contract PASS (${cases.length}/${cases.length})`);
