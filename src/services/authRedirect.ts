export type AuthCallbackKind = 'callback' | 'reset-password';

export const AUTH_LINK_ORIGIN = 'https://links.dosorobotics.com';

const authCallbackPaths: Record<AuthCallbackKind, string> = {
  callback: '/auth/callback',
  'reset-password': '/auth/reset-password',
};

type AuthRedirectEnvironment = {
  configuredOrigin?: string | null;
  webOrigin?: string | null;
};

export function parseWebAuthOrigin(webOrigin?: string | null): string | null {
  const value = webOrigin?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Web 认证回调 origin 无效。');
  }
  const localDevelopment = parsed.protocol === 'http:'
    && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (
    (!localDevelopment && parsed.protocol !== 'https:')
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || value.replace(/\/$/, '') !== parsed.origin
  ) {
    throw new Error('Web 认证回调必须是当前部署站点的纯 HTTPS origin（本地仅允许 localhost/127.0.0.1 HTTP）。');
  }
  return parsed.origin;
}

export function parseConfiguredAuthLinkOrigin(configuredValue?: string | null): string | null {
  const configured = configuredValue?.trim();
  if (!configured) return null;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('EXPO_PUBLIC_AUTH_LINK_ORIGIN 必须是有效的 HTTPS origin。');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    configured.replace(/\/$/, '') !== parsed.origin ||
    parsed.origin !== AUTH_LINK_ORIGIN
  ) {
    throw new Error(`EXPO_PUBLIC_AUTH_LINK_ORIGIN 必须精确为 ${AUTH_LINK_ORIGIN}，且不能包含路径、端口、查询参数、片段或凭据。`);
  }

  return parsed.origin;
}

export function buildAuthRedirectUrl(kind: AuthCallbackKind, environment: AuthRedirectEnvironment = {}) {
  const webOrigin = parseWebAuthOrigin(environment.webOrigin);
  const path = authCallbackPaths[kind];
  if (webOrigin) return `${webOrigin}${path}`;
  const configuredOrigin = parseConfiguredAuthLinkOrigin(environment.configuredOrigin);
  if (configuredOrigin) return `${configuredOrigin}${path}`;
  return `doso://${path.replace(/^\/auth\//, 'auth/')}`;
}

export function parseAuthCallbackKind(
  url: string,
  environment: AuthRedirectEnvironment = {},
): AuthCallbackKind | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) return null;

  const configuredOrigin = parseConfiguredAuthLinkOrigin(environment.configuredOrigin);
  const webOrigin = parseWebAuthOrigin(environment.webOrigin);
  const entries = Object.entries(authCallbackPaths) as [AuthCallbackKind, string][];
  return entries.find(([, path]) => {
    const isNativeCallback =
      parsed.protocol === 'doso:' &&
      parsed.hostname === 'auth' &&
      !parsed.port &&
      parsed.pathname === path.replace('/auth', '');
    const isWebCallback =
      webOrigin !== null &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.origin === webOrigin &&
      parsed.pathname === path;
    const isAppLinkCallback =
      configuredOrigin !== null &&
      parsed.protocol === 'https:' &&
      parsed.origin === configuredOrigin &&
      parsed.pathname === path;
    return isNativeCallback || isWebCallback || isAppLinkCallback;
  })?.[0] ?? null;
}

export function getAuthCallbackDeduplicationKey(
  url: string,
  environment: AuthRedirectEnvironment = {},
) {
  const kind = parseAuthCallbackKind(url, environment);
  if (!kind) return null;
  try {
    const code = new URL(url).searchParams.get('code')?.trim();
    return code ? `${kind}:${code}` : null;
  } catch {
    return null;
  }
}

export function createAuthCallbackDeduper(maxCompleted = 20) {
  const limit = Math.max(1, Math.floor(maxCompleted));
  const completed = new Set<string>();
  const running = new Map<string, Promise<void>>();
  return {
    run(key: string | null, task: () => Promise<void>) {
      if (!key) return task();
      if (completed.has(key)) return Promise.resolve();
      const existing = running.get(key);
      if (existing) return existing;
      if (running.size >= limit) {
        return Promise.reject(new Error('认证回调处理队列已满，请稍后重试。'));
      }
      const promise = task().then(() => {
        completed.add(key);
        if (completed.size > limit) {
          const oldest = completed.values().next().value;
          if (oldest) completed.delete(oldest);
        }
      });
      running.set(key, promise);
      const cleanup = () => {
        if (running.get(key) === promise) running.delete(key);
      };
      void promise.then(cleanup, cleanup);
      return promise;
    },
  };
}
