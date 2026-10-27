export type AuthOperation = 'login' | 'register';
export type AuthOperationErrorCategory =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'account_may_exist'
  | 'signup_disabled'
  | 'weak_password'
  | 'network_unavailable'
  | 'service_unavailable'
  | 'operation_failed';

export class AuthOperationError extends Error {
  readonly authCode: string | undefined;
  readonly category: AuthOperationErrorCategory;
  readonly operation: AuthOperation;
  readonly status: number | undefined;

  constructor(options: {
    authCode: string | undefined;
    category: AuthOperationErrorCategory;
    message: string;
    operation: AuthOperation;
    status: number | undefined;
  }) {
    super(options.message);
    this.name = 'AuthOperationError';
    this.authCode = options.authCode;
    this.category = options.category;
    this.operation = options.operation;
    this.status = options.status;
  }
}

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

const RATE_LIMIT_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
]);
const SIGNUP_DISABLED_CODES = new Set([
  'signup_disabled',
  'email_provider_disabled',
]);
const ACCOUNT_MAY_EXIST_CODES = new Set([
  'email_exists',
  'user_already_exists',
]);
const SAFE_AUTH_CODES = new Set([
  'email_exists',
  'email_not_confirmed',
  'email_provider_disabled',
  'invalid_credentials',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
  'request_timeout',
  'signup_disabled',
  'unexpected_failure',
  'user_already_exists',
  'weak_password',
]);

function readAuthError(error: unknown) {
  const value = error && typeof error === 'object' ? error as AuthErrorLike : undefined;
  const rawCode = typeof value?.code === 'string' ? value.code.toLowerCase() : '';
  const code = /^[a-z0-9_]{1,64}$/.test(rawCode) ? rawCode : '';
  const name = typeof value?.name === 'string' ? value.name : '';
  const message = typeof value?.message === 'string'
    ? value.message.toLowerCase()
    : error instanceof Error
      ? error.message.toLowerCase()
      : '';
  const status = typeof value?.status === 'number' && Number.isFinite(value.status)
    ? value.status
    : undefined;

  return { code, message, name, status };
}

export function mapAuthOperationError(error: unknown, operation: AuthOperation) {
  if (error instanceof AuthOperationError && error.operation === operation) return error;

  const { code, message, name, status } = readAuthError(error);
  const mapped = (category: AuthOperationErrorCategory, safeMessage: string) => new AuthOperationError({
    authCode: SAFE_AUTH_CODES.has(code) ? code : undefined,
    category,
    message: safeMessage,
    operation,
    status,
  });

  if (RATE_LIMIT_CODES.has(code)) {
    return mapped('rate_limited', '操作过于频繁，请稍后再试。');
  }

  if (code === 'request_timeout') {
    return operation === 'register'
      ? mapped(
        'network_unavailable',
        '注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。',
      )
      : mapped('network_unavailable', '无法连接认证服务，请检查网络后重试。');
  }

  if (operation === 'login' && code === 'invalid_credentials') {
    return mapped('invalid_credentials', '邮箱或密码不正确，请检查后重试。');
  }

  if (operation === 'login' && code === 'email_not_confirmed') {
    return mapped('email_not_confirmed', '邮箱尚未确认，请先查看确认邮件。');
  }

  if (operation === 'register' && ACCOUNT_MAY_EXIST_CODES.has(code)) {
    return mapped(
      'account_may_exist',
      '无法完成注册。请检查邮箱中的确认邮件，或尝试登录。',
    );
  }

  if (operation === 'register' && SIGNUP_DISABLED_CODES.has(code)) {
    return mapped('signup_disabled', '当前暂未开放邮箱注册，请稍后再试。');
  }

  if (operation === 'register' && code === 'weak_password') {
    return mapped('weak_password', '密码强度不足，请使用更长且更难猜测的密码。');
  }

  if (code === 'unexpected_failure') {
    return mapped(
      'service_unavailable',
      operation === 'register'
        ? '注册服务暂时不可用，请稍后重试。'
        : '登录服务暂时不可用，请稍后重试。',
    );
  }

  if (status === 429) {
    return mapped('rate_limited', '操作过于频繁，请稍后再试。');
  }

  if (
    status === 0 ||
    (name === 'AuthRetryableFetchError' && (status === undefined || status === 0)) ||
    error instanceof TypeError ||
    /failed to fetch|fetch failed|network request failed|networkerror|offline|connection (?:refused|reset|timed out)|dns/.test(message)
  ) {
    return operation === 'register'
      ? mapped(
        'network_unavailable',
        '注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。',
      )
      : mapped('network_unavailable', '无法连接认证服务，请检查网络后重试。');
  }

  if (status !== undefined && status >= 500) {
    return mapped(
      'service_unavailable',
      operation === 'register'
        ? '注册服务暂时不可用，请稍后重试。'
        : '登录服务暂时不可用，请稍后重试。',
    );
  }

  return mapped(
    'operation_failed',
    operation === 'register'
      ? '暂时无法完成注册，请稍后重试。'
      : '暂时无法登录，请稍后重试。',
  );
}
