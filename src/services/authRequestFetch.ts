const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 15_000;
const AUTH_API_VERSION = '2024-01-01';

type FetchImplementation = typeof fetch;
type BoundedRequestKind = 'interactive' | 'refresh' | 'profile-read' | 'reauthentication' | 'account-session' | 'logout';

type AuthRequestFetchOptions = Readonly<{
  now?: () => number;
  timeoutMs?: number;
}>;

const monotonicNow = () => typeof performance !== 'undefined'
  ? performance.now()
  : Date.now();

function requestUrl(input: Parameters<FetchImplementation>[0]) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function boundedRequestKind(
  input: Parameters<FetchImplementation>[0],
  init: Parameters<FetchImplementation>[1],
): BoundedRequestKind | null {
  try {
    const url = new URL(requestUrl(input));
    const method = init?.method
      ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
    if (url.pathname === '/functions/v1/account-sessions') return 'account-session';
    // Bound the transport inside the SDK operation. Racing signOut itself
    // would leave its storage cleanup able to delete a later login.
    if (url.pathname === '/auth/v1/logout') {
      return method.toUpperCase() === 'POST' ? 'logout' : null;
    }
    // Preparation and avatar reconciliation both read this resource. Bound the
    // SDK query itself, never race a Provider lease or time out profile writes.
    if (url.pathname === '/rest/v1/profiles' && method.toUpperCase() === 'GET') return 'profile-read';
    if (url.pathname === '/auth/v1/reauthenticate') {
      return method.toUpperCase() === 'GET' ? 'reauthentication' : null;
    }
    if (url.pathname === '/auth/v1/token') {
      const grantType = url.searchParams.get('grant_type');
      if (grantType === 'refresh_token') return 'refresh';
      return ['id_token', 'password', 'pkce'].includes(grantType ?? '') ? 'interactive' : null;
    }
    return [
      '/auth/v1/otp',
      '/auth/v1/recover',
      '/auth/v1/resend',
      '/auth/v1/signup',
      '/auth/v1/verify',
    ].includes(url.pathname) ? 'interactive' : null;
  } catch {
    return null;
  }
}

function timeoutResponse(kind: BoundedRequestKind) {
  const profileRead = kind === 'profile-read';
  return new Response(JSON.stringify({
    code: 'request_timeout',
    message: kind === 'account-session' ? '账户会话服务请求超时，请检查网络后重试。'
      : profileRead ? '账户资料读取超时，请检查网络后重试。'
      : kind === 'reauthentication' ? '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。'
        : 'Authentication request timed out.',
  }), {
    status: 408,
    headers: {
      'Content-Type': 'application/json',
      ...(profileRead || kind === 'account-session' ? {} : { 'X-Supabase-Api-Version': AUTH_API_VERSION }),
    },
  });
}

function abortReason(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function bufferResponse(response: Response) {
  const body = await response.arrayBuffer();
  const bufferedBody = [204, 205, 304].includes(response.status) ? null : body;
  return new Response(bufferedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function createAuthRequestFetch(
  fetchImplementation: FetchImplementation = fetch,
  options: AuthRequestFetchOptions = {},
): FetchImplementation {
  const now = options.now ?? monotonicNow;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_REQUEST_TIMEOUT_MS;

  return async (input, init) => {
    const requestKind = boundedRequestKind(input, init);
    if (!requestKind) return fetchImplementation(input, init);

    const controller = new AbortController();
    const callerSignal = init?.signal
      ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const timeoutMarker = new Error('auth-request-timeout');
    const deadlineAt = now() + timeoutMs;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeCallerAbortListener: () => void = () => undefined;

    if (callerSignal?.aborted) {
      controller.abort();
      throw abortReason(callerSignal);
    }

    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(timeoutMarker);
      }, timeoutMs);
    });
    const callerAbort = callerSignal
      ? new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          controller.abort();
          reject(abortReason(callerSignal));
        };
        callerSignal.addEventListener('abort', onAbort, { once: true });
        removeCallerAbortListener = () => callerSignal.removeEventListener('abort', onAbort);
      })
      : new Promise<never>(() => undefined);
    const operation = (async () => {
      const response = await fetchImplementation(input, { ...init, signal: controller.signal });
      const buffered = await bufferResponse(response);
      if (now() >= deadlineAt) {
        timedOut = true;
        controller.abort();
        throw timeoutMarker;
      }
      return buffered;
    })();
    void operation.catch(() => undefined);

    try {
      return await Promise.race([operation, deadline, callerAbort]);
    } catch (error) {
      if (timedOut) {
        if (requestKind === 'refresh') throw new TypeError('Authentication request timed out.');
        return timeoutResponse(requestKind);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      removeCallerAbortListener();
    }
  };
}
