import type { Session } from '@supabase/supabase-js';

import type {
  AuthResult,
  ExternalIdentityKind,
  ExternalIdentityStatus,
  ExternalIdentitySummary,
  LoginInput,
  Profile,
  RegisterInput,
} from '../types/api';
import type { AuthCallbackKind } from './authRedirect';
import { normalizePresentationDisplayName } from './appleAuthCore';
import {
  buildAuthRedirectUrl,
  createAuthCallbackDeduper,
  getAuthCallbackDeduplicationKey,
  parseAuthCallbackKind,
} from './authRedirect';
import { mapAuthOperationError } from './authOperationError';
import { type AuthSessionOperationLease, isAuthSessionOperationBusyError, runAuthSessionOperation } from './authSessionOperation';
import { normalizeEmailOtp } from './emailOtp';
import { getSupabaseClient } from './supabaseClient';
import { mapOtpOperationError } from './otpError';

export type { AuthCallbackKind } from './authRedirect';
export { createAuthCallbackDeduper };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTERNAL_IDENTITY_KINDS = new Set<ExternalIdentityKind>(['email', 'apple', 'wechat', 'qq', 'other']);
const EXTERNAL_IDENTITY_STATUSES = new Set<ExternalIdentityStatus>(['active', 'unlinked']);
const EXTERNAL_IDENTITY_FIELDS = [
  'registry_id',
  'provider_key',
  'kind',
  'email_verified',
  'linked_at',
  'provider_last_sign_in_at',
  'last_observed_at',
  'unlinked_at',
  'status',
] as const satisfies readonly (keyof ExternalIdentitySummary)[];
const RESERVED_USERNAMES = new Set([
  'account', 'accounts', 'admin', 'administrator', 'api', 'auth', 'doso', 'help',
  'login', 'me', 'moderator', 'null', 'official', 'register', 'robot', 'robotics',
  'root', 'security', 'signup', 'staff', 'support', 'system', 'undefined',
]);

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error('请输入有效的邮箱地址。');
  }
  return normalized;
}

export function normalizeRegistrationUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('用户名需为 3-24 位，只能包含小写字母、数字和下划线。');
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    throw new Error('该用户名不可使用，请更换一个');
  }
  return normalized;
}

function usernameClaimError(error: unknown) {
  const rawMessage = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : '';
  const message = rawMessage.toLowerCase();
  if (message.includes('username_invalid')) {
    return new Error('用户名需为 3-24 位，只能包含小写字母、数字和下划线。');
  }
  if (message.includes('username_reserved')) {
    return new Error('该用户名不可使用，请更换一个。');
  }
  if (message.includes('username_taken')) {
    return new Error('该用户名已被使用，请更换一个。');
  }
  if (message.includes('username_already_claimed')) {
    return new Error('该账户已经完成用户名设置，用户名不能再次修改。');
  }
  return error instanceof Error
    ? error
    : new Error(rawMessage || '暂时无法设置用户名，请稍后重试。');
}

function identityContractError(index: number, field?: string) {
  const location = field ? `第 ${index + 1} 项的 ${field} 字段` : `第 ${index + 1} 项`;
  return new Error(`登录方式服务返回的${location}不符合客户端契约。`);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function decodeExternalIdentitySummary(value: unknown, index: number): ExternalIdentitySummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw identityContractError(index);
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record);
  if (
    fields.length !== EXTERNAL_IDENTITY_FIELDS.length ||
    EXTERNAL_IDENTITY_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(record, field))
  ) {
    throw identityContractError(index);
  }

  if (typeof record.registry_id !== 'string' || !UUID_PATTERN.test(record.registry_id)) {
    throw identityContractError(index, 'registry_id');
  }
  if (typeof record.provider_key !== 'string' || record.provider_key.trim().length === 0) {
    throw identityContractError(index, 'provider_key');
  }
  if (typeof record.kind !== 'string' || !EXTERNAL_IDENTITY_KINDS.has(record.kind as ExternalIdentityKind)) {
    throw identityContractError(index, 'kind');
  }
  if (typeof record.email_verified !== 'boolean') {
    throw identityContractError(index, 'email_verified');
  }
  if (!isTimestamp(record.linked_at)) {
    throw identityContractError(index, 'linked_at');
  }
  if (!isNullableTimestamp(record.provider_last_sign_in_at)) {
    throw identityContractError(index, 'provider_last_sign_in_at');
  }
  if (!isTimestamp(record.last_observed_at)) {
    throw identityContractError(index, 'last_observed_at');
  }
  if (!isNullableTimestamp(record.unlinked_at)) {
    throw identityContractError(index, 'unlinked_at');
  }
  if (typeof record.status !== 'string' || !EXTERNAL_IDENTITY_STATUSES.has(record.status as ExternalIdentityStatus)) {
    throw identityContractError(index, 'status');
  }

  return {
    registry_id: record.registry_id,
    provider_key: record.provider_key,
    kind: record.kind as ExternalIdentityKind,
    email_verified: record.email_verified,
    linked_at: record.linked_at,
    provider_last_sign_in_at: record.provider_last_sign_in_at,
    last_observed_at: record.last_observed_at,
    unlinked_at: record.unlinked_at,
    status: record.status as ExternalIdentityStatus,
  };
}

export function decodeExternalIdentitySummaries(value: unknown): ExternalIdentitySummary[] {
  if (!Array.isArray(value)) {
    throw new Error('登录方式服务返回的数据不符合客户端契约。');
  }
  return value.map(decodeExternalIdentitySummary);
}

export function getAuthRedirectUrl(kind: AuthCallbackKind) {
  return buildAuthRedirectUrl(kind, {
    configuredOrigin: process.env.EXPO_PUBLIC_AUTH_LINK_ORIGIN,
    webOrigin: typeof window !== 'undefined' ? window.location?.origin : null,
  });
}

export function getAuthCallbackKey(url: string) {
  return getAuthCallbackDeduplicationKey(url, {
    configuredOrigin: process.env.EXPO_PUBLIC_AUTH_LINK_ORIGIN,
    webOrigin: typeof window !== 'undefined' ? window.location?.origin : null,
  });
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const username = normalizeRegistrationUsername(input.username ?? input.displayName ?? '');
  const email = normalizeEmail(input.email);
  const emailRedirectTo = input.emailRedirectTo ?? getAuthRedirectUrl('callback');
  return runAuthSessionOperation(async () => {
    const client = getSupabaseClient();
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password: input.password,
        options: {
          emailRedirectTo,
          data: { username, display_name: username },
        },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      if (isAuthSessionOperationBusyError(error)) throw error;
      throw mapAuthOperationError(error, 'register');
    }
  });
}

export async function verifySignupOtp(email: string, code: string): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const token = normalizeEmailOtp(code);
  const { data, error } = await runAuthSessionOperation(() => getSupabaseClient().auth.verifyOtp({
    email: normalizedEmail,
    token,
    type: 'email',
  }));
  if (error) throw mapOtpOperationError(error, 'verification');
  return data;
}

export async function resendSignupOtp(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await runAuthSessionOperation(() => getSupabaseClient().auth.resend({
    email: normalizedEmail,
    type: 'signup',
  }));
  if (error) throw mapOtpOperationError(error, 'delivery');
}

export async function login(input: LoginInput): Promise<AuthResult> {
  return runAuthSessionOperation(async () => {
    // The first getter can construct SDK auth and start storage work. Acquire
    // before entering it; getter/configuration errors still bypass SDK mapping.
    const client = getSupabaseClient();
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      if (isAuthSessionOperationBusyError(error)) throw error;
      throw mapAuthOperationError(error, 'login');
    }
  });
}

export async function logout(scope: 'local' | 'global' = 'local') {
  const { error } = await runAuthSessionOperation(() => getSupabaseClient().auth.signOut({ scope }));
  if (error) throw error;
}

export async function updatePresentationDisplayName(expectedUserId: string, displayName: string) {
  const normalized = normalizePresentationDisplayName(displayName);
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update({ display_name: normalized })
    .eq('id', expectedUserId)
    .select('id')
    .maybeSingle();
  if (error || data?.id !== expectedUserId) {
    throw new Error('当前会话无法保存该账户的显示名称，请确认账户后重试。');
  }
  return normalized;
}

export async function forgotPassword(email: string, redirectTo = getAuthRedirectUrl('reset-password')) {
  const { error } = await runAuthSessionOperation(() => getSupabaseClient().auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo },
  ));
  if (error) throw mapOtpOperationError(error, 'delivery');
}

/**
 * Sends the same recovery email as the existing PKCE-link flow. When the
 * configured Supabase template includes `{{ .Token }}`, the user can instead
 * enter that numeric token through `verifyPasswordRecoveryOtp`.
 */
export async function sendPasswordRecoveryOtp(
  email: string,
  redirectTo = getAuthRedirectUrl('reset-password'),
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await runAuthSessionOperation(() => getSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  }));
  if (error) throw mapOtpOperationError(error, 'delivery');
}

export async function verifyPasswordRecoveryOtp(email: string, code: string): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const token = normalizeEmailOtp(code);
  const { data, error } = await runAuthSessionOperation(() => getSupabaseClient().auth.verifyOtp({
    email: normalizedEmail,
    token,
    type: 'recovery',
  }));
  if (error) throw mapOtpOperationError(error, 'verification');
  return data;
}

export async function sendReauthenticationNonce() {
  const { error } = await runAuthSessionOperation(() => getSupabaseClient().auth.reauthenticate());
  if (error?.name === 'AuthRetryableFetchError' && error.status === 0) {
    // A lost response cannot establish whether the nonce was delivered. Be
    // conservative even when an implicit refresh failed before nonce dispatch.
    throw new Error('安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。');
  }
  if (error) throw error;
}

export async function resetPassword(password: string, nonce?: string) {
  const { data, error } = await runAuthSessionOperation(() => getSupabaseClient().auth.updateUser({
    password,
    ...(nonce ? { nonce: nonce.replace(/\s/g, '') } : {}),
  }));
  if (error) throw error;
  return data.user;
}

export async function getSession(lease?: AuthSessionOperationLease): Promise<Session | null> {
  // A nominal SDK read can refresh and write the stored session. Reuse an
  // existing owner's lease, or acquire before dispatch rather than just peek busy.
  if (!lease) return runAuthSessionOperation(ownedLease => getSession(ownedLease));
  const { data, error } = await lease.retain(() => getSupabaseClient().auth.getSession());
  if (error?.name === 'AuthRetryableFetchError' && error.status === 0) {
    throw new Error('认证服务暂时无法连接，请检查网络并稍后重试。');
  }
  if (error) throw error;
  return data.session;
}

export async function exchangeCodeForSession(code: string): Promise<Session> {
  const { data, error } = await runAuthSessionOperation(() => getSupabaseClient().auth.exchangeCodeForSession(code));
  if (error) throw error;
  return data.session;
}

export function getAuthCallbackKind(url: string): AuthCallbackKind | null {
  return parseAuthCallbackKind(url, {
    configuredOrigin: process.env.EXPO_PUBLIC_AUTH_LINK_ORIGIN,
    webOrigin: typeof window !== 'undefined' ? window.location?.origin : null,
  });
}

export async function exchangeSessionFromUrl(url: string): Promise<Session> {
  if (!getAuthCallbackKind(url)) {
    throw new Error('认证链接来源或回跳路径无效。');
  }

  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const errorDescription = fragment.get('error_description') ?? parsed.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  if (
    fragment.has('access_token') ||
    fragment.has('refresh_token') ||
    parsed.searchParams.has('access_token') ||
    parsed.searchParams.has('refresh_token')
  ) {
    throw new Error('为保护账户安全，此版本只接受一次性 PKCE 授权码。请重新发送认证邮件。');
  }

  const code = parsed.searchParams.get('code');
  if (!code || code.length > 2_048) throw new Error('认证链接无效或已经过期。');
  return exchangeCodeForSession(code);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select(
      'id,email,username,username_claimed_at,username_provenance,display_name,avatar_url,app_role,account_status,suspended_at,suspension_reason,created_at,updated_at',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error?.code === 'request_timeout') {
    throw new Error('账户资料读取超时，请检查网络后重试。');
  }
  if (error) throw error;
  return data;
}

export async function claimUsername(username: string): Promise<string> {
  const normalized = normalizeRegistrationUsername(username);
  const { data, error } = await getSupabaseClient().rpc('claim_username', {
    p_username: normalized,
  });
  if (error) throw usernameClaimError(error);
  if (!data) throw new Error('用户名设置未完成，请重试。');
  return data;
}

export async function listMyLoginMethods(): Promise<ExternalIdentitySummary[]> {
  const { data, error } = await getSupabaseClient().rpc('list_my_login_methods');
  if (error) throw error;
  return decodeExternalIdentitySummaries(data ?? []);
}
