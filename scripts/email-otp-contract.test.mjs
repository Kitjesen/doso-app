import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMAIL_OTP_INVALID_MESSAGE,
  isValidEmailOtp,
  normalizeEmailOtp,
  sanitizeEmailOtpInput,
} from '../src/services/emailOtp.ts';

test('email OTP contract preserves complete 6 through 10 digit values and leading zeroes', () => {
  for (const code of ['012345', '01234567', '0123456789']) {
    assert.equal(isValidEmailOtp(code), true);
    assert.equal(normalizeEmailOtp(code), code);
  }
  assert.equal(sanitizeEmailOtpInput('0123 4567 89'), '0123456789');
});

test('email OTP contract keeps invalid input invalid instead of truncating it into a valid code', () => {
  assert.equal(sanitizeEmailOtpInput('01234567890'), '01234567890');
  assert.equal(sanitizeEmailOtpInput('01234a'), '01234a');
  for (const code of ['01234567890', '01234a']) {
    assert.equal(isValidEmailOtp(code), false);
    assert.throws(() => normalizeEmailOtp(code), { message: EMAIL_OTP_INVALID_MESSAGE });
  }
});
