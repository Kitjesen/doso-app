export type AuthingBrokerProvider = 'wechat' | 'qq';
export type CustomProviderId = `custom:${string}`;

export type AuthingBrokerBlocker =
  | 'provider-id-missing-or-invalid'
  | 'provider-route-collision'
  | 'provider-route-mismatch';

export type AuthingBrokerEnvironment = {
  wechatProviderId?: string | null;
  qqProviderId?: string | null;
};

export type AuthingBrokerReadiness = {
  provider: AuthingBrokerProvider;
  ready: boolean;
  providerId: CustomProviderId | null;
  providerIdPresent: boolean;
  blockerCodes: readonly AuthingBrokerBlocker[];
};

export const AUTHING_CANONICAL_PROVIDER_IDS = Object.freeze({
  wechat: 'custom:wechat',
  qq: 'custom:qq',
} satisfies Record<AuthingBrokerProvider, CustomProviderId>);

const CUSTOM_PROVIDER_PATTERN = /^custom:[a-z0-9][a-z0-9:-]{0,42}$/;

export function normalizeCustomProviderId(value?: string | null): CustomProviderId | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && CUSTOM_PROVIDER_PATTERN.test(normalized)
    ? normalized as CustomProviderId
    : null;
}

function getConfiguredProviderIds(environment: AuthingBrokerEnvironment) {
  return {
    wechat: normalizeCustomProviderId(environment.wechatProviderId),
    qq: normalizeCustomProviderId(environment.qqProviderId),
  } satisfies Record<AuthingBrokerProvider, CustomProviderId | null>;
}

export function getAuthingBrokerReadiness(
  provider: AuthingBrokerProvider,
  environment: AuthingBrokerEnvironment,
): AuthingBrokerReadiness {
  const configured = getConfiguredProviderIds(environment);
  const providerId = configured[provider];
  const blockerCodes: AuthingBrokerBlocker[] = [];

  if (!providerId) blockerCodes.push('provider-id-missing-or-invalid');
  if (providerId && configured.wechat === configured.qq) {
    blockerCodes.push('provider-route-collision');
  }
  if (providerId && providerId !== AUTHING_CANONICAL_PROVIDER_IDS[provider]) {
    blockerCodes.push('provider-route-mismatch');
  }

  return {
    provider,
    ready: blockerCodes.length === 0,
    providerId,
    providerIdPresent: providerId !== null,
    blockerCodes,
  };
}

export function buildAuthingOAuthArguments(
  provider: AuthingBrokerProvider,
  environment: AuthingBrokerEnvironment,
  redirectTo: string,
) {
  const readiness = getAuthingBrokerReadiness(provider, environment);
  if (!readiness.ready || !readiness.providerId) {
    throw new Error(`Authing broker route is not ready: ${readiness.blockerCodes.join(',')}`);
  }
  if (!redirectTo.trim()) throw new Error('Authing broker redirect URI is missing.');

  return {
    provider: readiness.providerId,
    options: {
      redirectTo,
      skipBrowserRedirect: true as const,
    },
  };
}

type SocialBrowserResult = {
  type: string;
  url?: string;
};

export type InterpretedSocialBrowserResult =
  | { status: 'callback'; callbackUrl: string }
  | { status: 'cancelled' };

function isExactSocialCallback(callbackUrl: string, expectedRedirectUrl: string) {
  let callback: URL;
  let expected: URL;
  try {
    callback = new URL(callbackUrl);
    expected = new URL(expectedRedirectUrl);
  } catch {
    return false;
  }
  if (callback.username || callback.password || expected.username || expected.password) return false;
  return callback.protocol === expected.protocol
    && callback.hostname === expected.hostname
    && callback.port === expected.port
    && callback.pathname === expected.pathname;
}

export function interpretSocialBrowserResult(
  result: SocialBrowserResult,
  expectedRedirectUrl: string,
): InterpretedSocialBrowserResult {
  if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
  if (
    result.type === 'success'
    && result.url
    && isExactSocialCallback(result.url, expectedRedirectUrl)
  ) {
    return { status: 'callback', callbackUrl: result.url };
  }
  throw new Error('Social login browser returned an invalid callback.');
}
