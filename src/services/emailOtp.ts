export const EMAIL_OTP_MIN_LENGTH = 6;
export const EMAIL_OTP_MAX_LENGTH = 10;
export const EMAIL_OTP_INPUT_LIMIT = EMAIL_OTP_MAX_LENGTH + 1;
export const EMAIL_OTP_INVALID_MESSAGE = '请输入邮件中的 6–10 位数字验证码。';

export function sanitizeEmailOtpInput(value: string) {
  return value.replace(/\s/g, '').slice(0, EMAIL_OTP_INPUT_LIMIT);
}

export function isValidEmailOtp(value: string) {
  return /^\d{6,10}$/.test(value);
}

export function normalizeEmailOtp(value: string) {
  const normalized = value.replace(/\s/g, '');
  if (!isValidEmailOtp(normalized)) throw new Error(EMAIL_OTP_INVALID_MESSAGE);
  return normalized;
}
