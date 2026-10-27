export type OtpOperation = 'verification' | 'delivery';
export type OtpErrorCategory =
  | 'invalid_or_expired'
  | 'rate_limited'
  | 'network_unavailable'
  | 'service_unavailable'
  | 'verification_failed'
  | 'delivery_failed';

export class OtpOperationError extends Error {
  readonly authCode: string | undefined;
  readonly category: OtpErrorCategory;
  readonly cause: unknown;
  readonly operation: OtpOperation;
  readonly status: number | undefined;

  constructor(options: {
    authCode: string | undefined;
    category: OtpErrorCategory;
    cause: unknown;
    message: string;
    operation: OtpOperation;
    status: number | undefined;
  }) {
    super(options.message);
    this.name = 'OtpOperationError';
    this.authCode = options.authCode;
    this.category = options.category;
    this.cause = options.cause;
    this.operation = options.operation;
    this.status = options.status;
  }
}

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

const RATE_LIMIT_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
]);
const DELIVERY_UNCERTAIN_MESSAGE = '邮件发送结果暂时无法确认，请先检查收件箱和垃圾邮件，稍后再试。';

function readAuthError(error: unknown) {
  const value = error && typeof error === 'object' ? error as AuthErrorLike : undefined;
  const code = typeof value?.code === 'string' ? value.code.toLowerCase() : '';
  const message = typeof value?.message === 'string'
    ? value.message
    : error instanceof Error
      ? error.message
      : '';
  const status = typeof value?.status === 'number' ? value.status : undefined;

  return { code, message: message.toLowerCase(), status };
}

export function mapOtpOperationError(error: unknown, operation: OtpOperation) {
  if (error instanceof OtpOperationError && error.operation === operation) return error;
  const { code, message, status } = readAuthError(error);
  const mapped = (category: OtpErrorCategory, safeMessage: string) => new OtpOperationError({
    authCode: code || undefined,
    category,
    cause: error,
    message: safeMessage,
    operation,
    status,
  });

  if (
    status === 429 ||
    RATE_LIMIT_CODES.has(code) ||
    /rate.?limit|too many requests|request frequency/.test(message)
  ) {
    return mapped('rate_limited', '操作过于频繁，请稍后再试。');
  }

  if (operation === 'delivery' && code === 'request_timeout') {
    return mapped('network_unavailable', DELIVERY_UNCERTAIN_MESSAGE);
  }

  if (
    status === 0 ||
    /failed to fetch|fetch failed|network request failed|networkerror|offline|connection (?:refused|reset|timed out)/.test(message)
  ) {
    return mapped('network_unavailable', operation === 'delivery'
      ? DELIVERY_UNCERTAIN_MESSAGE : '无法连接认证服务，请检查网络后重试。');
  }

  if (
    operation === 'verification' &&
    (
      code === 'otp_expired' ||
      /(?:otp|token|code).*(?:expired|invalid)|(?:expired|invalid).*(?:otp|token|code)/.test(message)
    )
  ) {
    return mapped('invalid_or_expired', '验证码无效或已过期，请重新获取后再试。');
  }

  if (code === 'otp_disabled' || (status !== undefined && status >= 500)) {
    return mapped('service_unavailable', '验证码服务暂时不可用，请稍后重试。');
  }

  return operation === 'verification'
    ? mapped('verification_failed', '暂时无法验证验证码，请稍后重试。')
    : mapped('delivery_failed', '暂时无法发送验证码，请稍后再试。');
}
