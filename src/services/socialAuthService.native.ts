import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  buildAppleDisplayMetadata,
  buildAppleOAuthArguments,
  createAppleCredentialMonitor,
  getAppleIdentitySubject,
  isAppleLoginCancelled,
  mapAppleCredentialState,
  performNativeAppleSignIn,
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
const providerLabels: Record<SocialLoginProvider, string> = { apple: 'Apple', wechat: '微信', qq: 'QQ' };

function getAuthingBrokerEnvironment(): AuthingBrokerEnvironment {
  return {
    wechatProviderId: process.env.EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER,
    qqProviderId: process.env.EXPO_PUBLIC_QQ_SUPABASE_PROVIDER,
  };
}

function requireSession(session: Session | null) {
  if (!session) throw new Error('登录服务没有返回有效会话，请重新尝试。');
  return session;
}

function getReadinessBlockerMessage(provider: SocialLoginProvider, blockers: readonly SocialLoginReadinessBlocker[]) {
  const label = providerLabels[provider];
  if (blockers.includes('feature-disabled')) {
    return provider === 'apple'
      ? 'Apple 登录开关尚未启用。请先完成 Apple Developer 与 Supabase Apple Provider 配置。'
      : `${label}登录开关尚未启用。请先完成 Authing OIDC broker 与 Supabase Custom Provider 配置。`;
  }
  if (blockers.includes('platform-unsupported')) return `这台设备不支持${label}登录。`;
  if (blockers.includes('provider-id-missing-or-invalid')) {
    return `${label} OIDC Provider 标识无效。请配置以 custom: 开头的小写字母、数字、连字符或冒号。`;
  }
  if (blockers.includes('provider-route-collision')) {
    return '微信与 QQ 不能共享同一个 Supabase Custom Provider；请分别配置 custom:wechat 和 custom:qq。';
  }
  if (blockers.includes('provider-route-mismatch')) return `${label} Provider 必须与数据库身份注册表一致。`;
  if (blockers.includes('redirect-uri-missing')) return `${label}登录缺少回调地址。`;
  return null;
}

export function getSocialLoginReadiness(provider: SocialLoginProvider): SocialLoginReadiness {
  const enabled = provider === 'apple' ? appleEnabled : provider === 'wechat' ? wechatEnabled : qqEnabled;
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

async function randomSecret() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function appleDisplayNameStorageKey(subject: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, subject);
  return `doso.apple-display-name.${digest}`;
}

async function stageAppleDisplayName(subject: string, displayName: string) {
  await SecureStore.setItemAsync(
    await appleDisplayNameStorageKey(subject),
    JSON.stringify({ displayName }),
  );
}

export async function getPendingAppleDisplayName(subject: string | null) {
  if (Platform.OS !== 'ios' || !subject) return null;
  const key = await appleDisplayNameStorageKey(subject);
  const staged = await SecureStore.getItemAsync(key);
  if (!staged) return null;
  let displayName: string | null = null;
  try {
    const value = JSON.parse(staged) as { displayName?: unknown };
    displayName = typeof value.displayName === 'string' ? value.displayName.trim() : null;
  } catch {
    displayName = null;
  }
  const metadata = buildAppleDisplayMetadata(displayName);
  return metadata?.display_name ?? null;
}

export async function clearPendingAppleDisplayName(subject: string | null) {
  if (Platform.OS !== 'ios' || !subject) return;
  await SecureStore.deleteItemAsync(await appleDisplayNameStorageKey(subject));
}

async function signInWithNativeAppleIdToken() {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('这台设备不支持 Apple 登录。');
  }
  const client = getSupabaseClient();
  return performNativeAppleSignIn<Session, AppleAuthentication.AppleAuthenticationScope, AppleAuthentication.AppleAuthenticationCredentialState>({
    randomString: randomSecret,
    sha256: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    signIn: (options) => AppleAuthentication.signInAsync(options),
    getCredentialState: (user) => AppleAuthentication.getCredentialStateAsync(user),
    authorizedCredentialState: AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED,
    exchangeIdToken: (credentials) => runAuthSessionOperation(async () => {
      const { data, error } = await client.auth.signInWithIdToken(credentials);
      if (error) throw new Error('Apple 身份验证失败，请重新尝试。');
      return requireSession(data.session);
    }),
    formatFullName: (fullName) => AppleAuthentication.formatFullName(
      fullName as AppleAuthentication.AppleAuthenticationFullName,
    ),
    stageDisplayMetadata: stageAppleDisplayName,
    syncPendingDisplayMetadata: async (_session, subject) => (
      await getPendingAppleDisplayName(subject) ? 'durably-pending' : 'none'
    ),
    syncDisplayMetadata: async () => false,
  });
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
    if (provider === 'apple') {
      if (Platform.OS !== 'ios') return signInWithOAuthProvider('apple', providerLabels.apple);
      const outcome = await signInWithNativeAppleIdToken();
      return { status: 'authenticated', ...outcome };
    }
    return signInWithOAuthProvider(provider, providerLabels[provider]);
  });
}

export function isSocialLoginCancelled(error: unknown) {
  return isAppleLoginCancelled(error);
}

export function subscribeToAppleCredentialRevoked(onRevoked: () => void) {
  if (Platform.OS !== 'ios') return () => undefined;
  const subscription = AppleAuthentication.addRevokeListener(onRevoked);
  return () => subscription.remove();
}

export async function getAppleCredentialStatus(subject: string | null): Promise<AppleCredentialCheck> {
  if (Platform.OS !== 'ios' || !subject) return { status: 'unknown', reason: 'unsupported' };
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return { status: 'unknown', reason: 'unsupported' };
    }
    const state = await AppleAuthentication.getCredentialStateAsync(subject);
    return { status: mapAppleCredentialState(state, {
      authorized: AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED,
      revoked: AppleAuthentication.AppleAuthenticationCredentialState.REVOKED,
      notFound: AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND,
      transferred: AppleAuthentication.AppleAuthenticationCredentialState.TRANSFERRED,
    }), reason: null };
  } catch {
    return { status: 'unknown', reason: 'native-or-transient-failure' };
  }
}

export function getSignedInAppleSubject(identities: readonly AppleIdentity[] | null | undefined) {
  return getAppleIdentitySubject(identities);
}

export { createAppleCredentialMonitor };
