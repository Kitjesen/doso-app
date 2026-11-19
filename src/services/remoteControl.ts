import { AuthSessionOperationBusyError, getAuthSessionOperationSnapshot, runAuthSessionOperation, subscribeAuthSessionOperations } from './authSessionOperation';
import { getSupabaseClient, supabaseConfig } from './supabaseClient';

export type RemoteControlSession = {
  deviceId: string;
  sessionId: string;
  expiresAt: string;
  endpoint: string;
  grant: string;
};

type ErrorCode = 'configuration' | 'unauthorized' | 'unavailable' | 'invalid_response' | 'invalid_request' | 'busy' | 'cancelled' | 'timeout';
export class RemoteControlError extends Error {
  constructor(public readonly code: ErrorCode, public readonly outcomeMayBeUnknown = false) {
    const messages: Record<ErrorCode, string> = {
      configuration: '远程控制服务尚未配置。', unauthorized: '登录或设备授权已失效。',
      unavailable: '远程控制服务暂不可用。', invalid_response: '远程控制响应无法确认。',
      invalid_request: '远程控制请求无效。', busy: '机器狗已有控制会话。',
      cancelled: '远程控制请求已取消。', timeout: '远程控制请求超时。',
    };
    super(messages[code]);
    this.name = 'RemoteControlError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function parseSession(value: unknown, deviceId: string): RemoteControlSession {
  if (!record(value) || value.deviceId !== deviceId || typeof value.sessionId !== 'string' || !uuid.test(value.sessionId)
    || !timestamp(value.expiresAt) || typeof value.endpoint !== 'string' || typeof value.grant !== 'string'
    || !value.grant || value.grant.length > 8192) throw new RemoteControlError('invalid_response');
  try {
    const url = new URL(value.endpoint);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
  } catch { throw new RemoteControlError('invalid_response'); }
  return { deviceId, sessionId: value.sessionId, expiresAt: value.expiresAt, endpoint: value.endpoint, grant: value.grant };
}

async function request<T>(expectedUserId: string, deviceId: string, body: Record<string, string>,
  parse: (value: unknown, deviceId: string) => T, signal?: AbortSignal): Promise<T> {
  const { url, publishableKey } = supabaseConfig;
  if (!url || !publishableKey) throw new RemoteControlError('configuration');
  if (!uuid.test(expectedUserId) || !uuid.test(deviceId)) throw new RemoteControlError('invalid_request');
  const controller = new AbortController();
  let reason: ErrorCode = 'cancelled', dispatched = false, definitiveFailure = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => { reason = 'timeout'; abort(); }, 12_000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new RemoteControlError(reason)); });
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  const wait = <T>(operation: PromiseLike<T>) => Promise.race([operation, aborted]);
  const unsubscribe = subscribeAuthSessionOperations(() => {
    const operation = getAuthSessionOperationSnapshot();
    if (operation.busy && operation.kind === 'session-write') { reason = 'unauthorized'; abort(); }
  });
  const currentToken = () => {
    if (controller.signal.aborted) throw new RemoteControlError(reason);
    return wait(runAuthSessionOperation(async lease => {
      const { data, error } = await wait(lease.retain(() => getSupabaseClient().auth.getSession()));
      if (error || !data.session?.access_token || data.session.user.id !== expectedUserId) throw new RemoteControlError('unauthorized');
      return data.session.access_token;
    }, { kind: 'session-read' }));
  };
  try {
    const token = await currentToken();
    if (controller.signal.aborted) throw new RemoteControlError(reason);
    const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/remote-control`;
    dispatched = true;
    const response = await wait(fetch(endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...body }),
    }));
    if ([400, 401, 403, 409].includes(response.status)) {
      definitiveFailure = true;
      if (response.status === 401 || response.status === 403) throw new RemoteControlError('unauthorized');
      throw new RemoteControlError(response.status === 409 ? 'busy' : 'invalid_request');
    }
    if (!response.ok) throw new RemoteControlError('unavailable');
    if (response.redirected || (response.url && response.url !== endpoint)
      || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new RemoteControlError('invalid_response');
    const text = await wait(response.text());
    if (text.length > 12 * 1024) throw new RemoteControlError('invalid_response');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new RemoteControlError('invalid_response'); }
    const result = parse(value, deviceId);
    await currentToken();
    if (controller.signal.aborted) throw new RemoteControlError(reason);
    return result;
  } catch (error) {
    const unknown = dispatched && !definitiveFailure;
    if (controller.signal.aborted) throw new RemoteControlError(reason, unknown);
    if (error instanceof RemoteControlError) throw new RemoteControlError(error.code, unknown);
    if (error instanceof AuthSessionOperationBusyError && !dispatched) throw error;
    throw new RemoteControlError('unavailable', unknown);
  } finally {
    clearTimeout(timer); unsubscribe();
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}

export function createRemoteControlSession(expectedUserId: string, deviceId: string, { signal }: { signal?: AbortSignal } = {}) {
  return request(expectedUserId, deviceId, { action: 'create' }, parseSession, signal);
}

export function closeRemoteControlSession(expectedUserId: string, deviceId: string, sessionId: string, { signal }: { signal?: AbortSignal } = {}) {
  if (!uuid.test(sessionId)) return Promise.reject(new RemoteControlError('invalid_request'));
  return request(expectedUserId, deviceId, { action: 'close', sessionId }, value => {
    if (!record(value) || value.closed !== true) throw new RemoteControlError('invalid_response');
    return { closed: true } as const;
  }, signal);
}
