export type AppleBrowserResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' | 'dismiss' }
  | { type: string; url?: string };

export type AppleCredentialStatus =
  | 'authorized'
  | 'revoked'
  | 'not-found'
  | 'transferred'
  | 'unknown';

export type AppleCredentialCheck = {
  status: AppleCredentialStatus;
  reason: 'unsupported' | 'native-or-transient-failure' | null;
};

export type AppleMetadataStatus = 'none' | 'synced' | 'durably-pending' | 'needs-confirmation';

export type AppleIdentity = {
  provider?: string | null;
  identity_data?: { sub?: unknown } | null;
};

type AppleCredential = {
  user: string;
  state: string | null;
  fullName: unknown;
  email: string | null;
  identityToken: string | null;
  authorizationCode: string | null;
};

type AppleRequestSecrets = {
  state: string;
  rawNonce: string;
  hashedNonce: string;
};

type NativeAppleSignInDependencies<TSession, TScope, TCredentialState> = {
  randomString: () => Promise<string>;
  sha256: (value: string) => Promise<string>;
  requestedScopes: TScope[];
  signIn: (options: {
    requestedScopes: TScope[];
    state: string;
    nonce: string;
  }) => Promise<AppleCredential>;
  getCredentialState: (user: string) => Promise<TCredentialState>;
  authorizedCredentialState: TCredentialState;
  exchangeIdToken: (credentials: {
    provider: 'apple';
    token: string;
    nonce: string;
    access_token?: string;
  }) => Promise<TSession>;
  formatFullName: (fullName: unknown) => string;
  stageDisplayMetadata: (subject: string, displayName: string) => Promise<void>;
  syncPendingDisplayMetadata: (session: TSession, subject: string) => Promise<AppleMetadataStatus>;
  syncDisplayMetadata: (session: TSession, displayName: string) => Promise<boolean>;
};

const APPLE_CANCEL_CODES = new Set(['ERR_REQUEST_CANCELED']);

export async function createAppleRequestSecrets(
  randomString: () => Promise<string>,
  sha256: (value: string) => Promise<string>,
): Promise<AppleRequestSecrets> {
  const rawNonce = await randomString();
  let state = await randomString();
  for (let attempt = 0; state === rawNonce && attempt < 3; attempt += 1) {
    state = await randomString();
  }
  if (!rawNonce || !state || state === rawNonce) {
    throw new Error('无法生成安全的 Apple 登录请求，请重新尝试。');
  }
  return { rawNonce, state, hashedNonce: await sha256(rawNonce) };
}

export function normalizeAppleDisplayName(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function normalizePresentationDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('请输入显示名称。');
  if (normalized.length > 80) throw new Error('显示名称不能超过 80 个字符。');
  return normalized;
}

export function buildAppleDisplayMetadata(displayName: string | null) {
  return displayName ? { display_name: displayName } : null;
}

export function isDisplayNameRecoveryForUser(
  pending: { userId: string; displayName: string } | null,
  currentUserId: string | null | undefined,
) {
  return Boolean(pending && currentUserId && pending.userId === currentUserId);
}

export async function performNativeAppleSignIn<TSession, TScope, TCredentialState>(
  dependencies: NativeAppleSignInDependencies<TSession, TScope, TCredentialState>,
) {
  const secrets = await createAppleRequestSecrets(dependencies.randomString, dependencies.sha256);
  const credential = await dependencies.signIn({
    requestedScopes: dependencies.requestedScopes,
    state: secrets.state,
    nonce: secrets.hashedNonce,
  });
  if (credential.state !== secrets.state) {
    throw new Error('Apple 登录状态校验失败，请重新尝试。');
  }
  if (!credential.identityToken) {
    throw new Error('Apple 没有返回有效身份令牌，请重新尝试。');
  }
  const credentialState = await dependencies.getCredentialState(credential.user);
  if (credentialState !== dependencies.authorizedCredentialState) {
    throw new Error('Apple 登录凭据已失效，请重新授权。');
  }

  const displayName = normalizeAppleDisplayName(
    credential.fullName ? dependencies.formatFullName(credential.fullName) : null,
  );
  let staged = false;
  if (displayName) {
    try {
      await dependencies.stageDisplayMetadata(credential.user, displayName);
      staged = true;
    } catch {
      staged = false;
    }
  }

  const session = await dependencies.exchangeIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: secrets.rawNonce,
    ...(credential.authorizationCode ? { access_token: credential.authorizationCode } : {}),
  });
  let metadataStatus: AppleMetadataStatus = 'none';
  let suggestedDisplayName: string | undefined;
  if (displayName && !staged) {
    try {
      metadataStatus = await dependencies.syncDisplayMetadata(session, displayName)
        ? 'synced'
        : 'needs-confirmation';
    } catch {
      metadataStatus = 'needs-confirmation';
    }
    if (metadataStatus === 'needs-confirmation') suggestedDisplayName = displayName;
  } else {
    try {
      metadataStatus = await dependencies.syncPendingDisplayMetadata(session, credential.user);
    } catch {
      metadataStatus = 'durably-pending';
    }
  }
  return {
    session,
    metadataStatus,
    ...(suggestedDisplayName ? { suggestedDisplayName } : {}),
  };
}

export function buildAppleOAuthArguments(redirectTo: string) {
  return {
    provider: 'apple' as const,
    options: { redirectTo, skipBrowserRedirect: true as const },
  };
}

export function interpretAppleBrowserResult(result: AppleBrowserResult) {
  if (result.type === 'success' && result.url) {
    return { status: 'callback' as const, callbackUrl: result.url };
  }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { status: 'cancelled' as const };
  }
  throw new Error('Apple 登录浏览器未完成授权，请关闭页面后重新尝试。');
}

export function isAppleLoginCancelled(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return typeof error.code === 'string' && APPLE_CANCEL_CODES.has(error.code);
}

export function mapAppleCredentialState(
  state: unknown,
  values: { authorized: unknown; revoked: unknown; notFound: unknown; transferred: unknown },
): AppleCredentialStatus {
  if (state === values.authorized) return 'authorized';
  if (state === values.revoked) return 'revoked';
  if (state === values.notFound) return 'not-found';
  if (state === values.transferred) return 'transferred';
  return 'unknown';
}

export function shouldLogoutForAppleCredentialStatus(status: AppleCredentialStatus) {
  return status === 'revoked' || status === 'not-found' || status === 'transferred';
}

export function createAppleCredentialMonitor(dependencies: {
  getCurrentSubject: () => string | null;
  checkCredential: (subject: string) => Promise<AppleCredentialCheck>;
  logout: () => Promise<void>;
  onDiagnostic: (check: AppleCredentialCheck) => void;
}) {
  let active = true;
  let generation = 0;
  let logoutPromise: Promise<void> | null = null;
  return {
    async check() {
      const subject = dependencies.getCurrentSubject();
      if (!active || !subject) return { outcome: 'skipped' as const };
      const checkGeneration = ++generation;
      const result = await dependencies.checkCredential(subject);
      if (
        !active
        || checkGeneration !== generation
        || dependencies.getCurrentSubject() !== subject
      ) {
        return { outcome: 'stale' as const };
      }
      if (result.reason) dependencies.onDiagnostic(result);
      if (!shouldLogoutForAppleCredentialStatus(result.status)) {
        return { outcome: 'checked' as const, result };
      }
      if (!logoutPromise) {
        logoutPromise = (async () => {
          if (active && dependencies.getCurrentSubject() === subject) {
            await dependencies.logout();
          }
        })();
        const current = logoutPromise;
        void current.then(
          () => { if (logoutPromise === current) logoutPromise = null; },
          () => { if (logoutPromise === current) logoutPromise = null; },
        );
      }
      await logoutPromise;
      return { outcome: 'logout' as const, result };
    },
    invalidate() {
      generation += 1;
    },
    deactivate() {
      active = false;
      generation += 1;
    },
  };
}

export function getAppleIdentitySubject(identities: readonly AppleIdentity[] | null | undefined) {
  const subject = identities
    ?.find((identity) => identity.provider === 'apple')
    ?.identity_data?.sub;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : null;
}

export async function startWhenSocialLoginReady<T>(
  readiness: { ready: boolean; blockerMessage: string | null },
  fallbackMessage: string,
  start: () => Promise<T>,
) {
  if (!readiness.ready) throw new Error(readiness.blockerMessage ?? fallbackMessage);
  return start();
}
