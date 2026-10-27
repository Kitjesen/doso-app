import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import {
  buildAppleOAuthArguments,
  createAppleCredentialMonitor,
  getAppleIdentitySubject,
  isAppleLoginCancelled,
  startWhenSocialLoginReady,
  type AppleCredentialCheck,
  type AppleMetadataStatus,
  type AppleIdentity,
} from './appleAuthCore';
import {
  buildAuthingOAuthArguments,
  getAuthingBrokerReadiness,
  interpretSocialBrowserResult,
  type AuthingBrokerBlocker,
  type AuthingBrokerEnvironment,
  type AuthingBrokerProvider,
} from './authingBrokerCore';
import { runAuthSessionOperation } from './authSessionOperation';
import { getAuthRedirectUrl } from './authService';
import { getSupabaseClient } from './supabaseClient';

WebBrowser.maybeCompleteAuthSession();

export type SocialLoginProvider = 'apple' | 'wechat' | 'qq';

export type SocialLoginResult =
  | {
      status: 'authenticated';
      session: Session;
      metadataStatus?: AppleMetadataStatus;
      suggestedDisplayName?: string;
    }
  | { status: 'callback'; callbackUrl: string }
  | { status: 'cancelled' };

export type SocialLoginReadinessBlocker =
  | 'feature-disabled'
  | 'platform-unsupported'
  | 'provider-id-missing-or-invalid'
  | AuthingBrokerBlocker
  | 'redirect-uri-missing';

export type SocialLoginReadiness = {
  provider: SocialLoginProvider;
  ready: boolean;
  enabled: boolean;
  platformSupported: boolean;
  providerIdPresent: boolean;
  serviceIdPresent: boolean | null;
  redirectUriPresent: boolean | null;
  blockerCodes: readonly SocialLoginReadinessBlocker[];
  blockerMessage: string | null;
};

const appleEnabled = process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED === 'true';
const wechatEnabled = process.env.EXPO_PUBLIC_WECHAT_AUTH_ENABLED === 'true';
const qqEnabled = process.env.EXPO_PUBLIC_QQ_AUTH_ENABLED === 'true';

const providerLabels: Record<SocialLoginProvider, string> = {
  apple: 'Apple',
  wechat: '微信',
  qq: 'QQ',
};

function getAuthingBrokerEnvironment(): AuthingBrokerEnvironment {
  return {
    wechatProviderId: process.env.EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER,
    qqProviderId: process.env.EXPO_PUBLIC_QQ_SUPABASE_PROVIDER,
  };
}

function getReadinessBlockerMessage(
  provider: SocialLoginProvider,
  blockerCodes: readonly SocialLoginReadinessBlocker[],
) {
  const label = providerLabels[provider];
  if (blockerCodes.includes('feature-disabled')) {
    return provider === 'apple'
      ? 'Apple 登录开关尚未启用。请先完成 Apple Developer 与 Supabase Apple Provider 配置。'
      : `${label}登录开关尚未启用。请先完成 Authing OIDC broker 与 Supabase Custom Provider 配置。`;
  }
  if (blockerCodes.includes('platform-unsupported')) return `当前平台不支持${label}登录。`;
  if (blockerCodes.includes('provider-id-missing-or-invalid')) {
    return `${label} OIDC Provider 标识无效。请配置以 custom: 开头的小写字母、数字、连字符或冒号。`;
  }
  if (blockerCodes.includes('provider-route-collision')) {
    return '微信与 QQ 不能共享同一个 Supabase Custom Provider；请分别配置 custom:wechat 和 custom:qq。';
  }
  if (blockerCodes.includes('provider-route-mismatch')) {
    return `${label} Provider 必须与数据库身份注册表一致。`;
  }
  if (blockerCodes.includes('redirect-uri-missing')) return `${label}登录缺少回调地址。`;
  return null;
}

export function getSocialLoginReadiness(provider: SocialLoginProvider): SocialLoginReadiness {
  const enabled = provider === 'apple'
    ? appleEnabled
    : provider === 'wechat'
      ? wechatEnabled
      : qqEnabled;
  const brokerReadiness = provider === 'apple'
    ? null
    : getAuthingBrokerReadiness(provider, getAuthingBrokerEnvironment());
  const providerIdPresent = provider === 'apple' || brokerReadiness?.providerIdPresent === true;
  const redirectUriPresent = Boolean(getAuthRedirectUrl('callback'));
  const blockerCodes: SocialLoginReadinessBlocker[] = [];

  if (!enabled) blockerCodes.push('feature-disabled');
  if (brokerReadiness) blockerCodes.push(...brokerReadiness.blockerCodes);
  if (!redirectUriPresent) blockerCodes.push('redirect-uri-missing');

  return {
    provider,
    ready: blockerCodes.length === 0,
    enabled,
    platformSupported: true,
    providerIdPresent,
    serviceIdPresent: null,
    redirectUriPresent,
    blockerCodes,
    blockerMessage: getReadinessBlockerMessage(provider, blockerCodes),
  };
}

export function isSocialLoginReady(provider: SocialLoginProvider) {
  return getSocialLoginReadiness(provider).ready;
}

async function signInWithOAuthProvider(
  provider: 'apple' | AuthingBrokerProvider,
  label: string,
): Promise<SocialLoginResult> {
  const redirectTo = getAuthRedirectUrl('callback');
  const credentials = provider === 'apple'
    ? buildAppleOAuthArguments(redirectTo)
    : buildAuthingOAuthArguments(provider, getAuthingBrokerEnvironment(), redirectTo);
  // PKCE preparation writes auth storage. Own only the SDK promise, not the
  // browser wait: its incoming callback needs to acquire its own operation.
  const { data, error } = await runAuthSessionOperation(
    () => getSupabaseClient().auth.signInWithOAuth(credentials),
  );
  if (error) {
    if (error.code === 'custom_provider_not_found') {
      throw new Error(`${label} OIDC Provider 尚未在 Supabase 中创建并启用。`);
    }
    throw new Error(`${label}登录启动失败，请检查网络与 Provider 配置后重试。`);
  }
  if (!data.url) throw new Error(`${label}登录服务没有返回授权地址，请检查 Supabase Provider 配置。`);

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    preferEphemeralSession: false,
    showInRecents: true,
  });
  try {
    return interpretSocialBrowserResult(result, redirectTo);
  } catch {
    throw new Error(`${label}登录回调无效，请关闭页面后重新尝试。`);
  }
}

export async function signIn(provider: SocialLoginProvider): Promise<SocialLoginResult> {
  const readiness = getSocialLoginReadiness(provider);
  return startWhenSocialLoginReady(readiness, `${providerLabels[provider]}登录尚未就绪。`, async () => {
    if (provider === 'apple') return signInWithOAuthProvider('apple', providerLabels.apple);
    return signInWithOAuthProvider(provider, providerLabels[provider]);
  });
}

export function isSocialLoginCancelled(error: unknown) {
  return isAppleLoginCancelled(error);
}

export function subscribeToAppleCredentialRevoked(_onRevoked: () => void) {
  return () => undefined;
}

export async function getAppleCredentialStatus(_subject: string | null): Promise<AppleCredentialCheck> {
  return { status: 'unknown', reason: 'unsupported' };
}

export function getSignedInAppleSubject(identities: readonly AppleIdentity[] | null | undefined) {
  return getAppleIdentitySubject(identities);
}

export async function getPendingAppleDisplayName(_subject: string | null) {
  return null;
}

export async function clearPendingAppleDisplayName(_subject: string | null) {
  return undefined;
}

export { createAppleCredentialMonitor };
