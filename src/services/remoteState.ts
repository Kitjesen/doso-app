import { AuthSessionOperationBusyError, getAuthSessionOperationSnapshot, runAuthSessionOperation, subscribeAuthSessionOperations } from './authSessionOperation';
import { getSupabaseClient, supabaseConfig } from './supabaseClient';

export type RemoteLocation = { lat: number; lon: number; fixType: number; observedAt: string; accuracyM: number | null };
export type RemoteStatus = {
  state: { kind: string; transition: string };
  control: { owner: string; motorOutputEnabled: boolean; criticalMotorFault: boolean };
  location?: RemoteLocation;
};
export type RemoteReading = {
  observedAt: string;
  receivedAt: string;
} & ({ status: RemoteStatus; error?: never } | { error: 'upstream_unavailable'; status?: never });
export type RemoteState = {
  deviceId: string;
  simulated: boolean;
  enabled: boolean;
  revision: number;
  activation: 'off' | 'enabling' | 'on' | 'disabling' | 'unavailable';
  reachable: boolean | null;
  fresh: boolean;
  lastSeenAt: string | null;
  latest: RemoteReading | null;
  lastSuccess: (RemoteReading & { status: RemoteStatus }) | null;
};
type ErrorCode = 'configuration' | 'unauthorized' | 'unavailable' | 'invalid_response' | 'cancelled' | 'timeout' | 'revision_conflict' | 'revision_exhausted' | 'invalid_request';
export class RemoteStateError extends Error {
  constructor(public readonly code: ErrorCode, public readonly outcomeMayBeUnknown = false) {
    const messages: Record<ErrorCode, string> = {
      configuration: '远程状态服务尚未配置。', unauthorized: '登录或设备授权已失效，请重新登录。',
      unavailable: '远程状态服务暂不可用，正在自动重试。', invalid_response: '远程状态响应无法识别，正在自动重试。',
      cancelled: '远程状态读取已取消。', timeout: '远程状态请求超时。',
      revision_conflict: '设置已在其他终端变化，正在重新读取。', revision_exhausted: '设备设置暂时无法更改，请联系支持。',
      invalid_request: '远程状态请求无效，正在重新读取。',
    };
    super(messages[code]);
    this.name = 'RemoteStateError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const enumText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
function invalid(): never { throw new RemoteStateError('invalid_response'); }

function reading(value: unknown, successOnly = false): RemoteReading | null {
  if (value === null) return null;
  if (!record(value) || !timestamp(value.observedAt) || !timestamp(value.receivedAt)) return invalid();
  if (value.error === 'upstream_unavailable' && value.status === undefined && !successOnly) {
    return { observedAt: value.observedAt, receivedAt: value.receivedAt, error: value.error };
  }
  const status = value.status;
  if (value.error !== undefined || !record(status) || !record(status.state) || !record(status.control)
    || !enumText(status.state.kind) || !enumText(status.state.transition) || !enumText(status.control.owner)
    || typeof status.control.motorOutputEnabled !== 'boolean' || typeof status.control.criticalMotorFault !== 'boolean') return invalid();
  const location = status.location;
  if (location !== undefined && (!record(location)
    || typeof location.lat !== 'number' || !Number.isFinite(location.lat) || location.lat < -90 || location.lat > 90
    || typeof location.lon !== 'number' || !Number.isFinite(location.lon) || location.lon < -180 || location.lon > 180
    || typeof location.fixType !== 'number' || !Number.isInteger(location.fixType) || location.fixType < 1 || location.fixType > 8
    || !timestamp(location.observedAt)
    || (location.accuracyM !== null && (typeof location.accuracyM !== 'number' || !Number.isFinite(location.accuracyM) || location.accuracyM < 0 || location.accuracyM > 100000)))) return invalid();
  return {
    observedAt: value.observedAt, receivedAt: value.receivedAt,
    status: { state: { kind: status.state.kind, transition: status.state.transition },
      control: { owner: status.control.owner, motorOutputEnabled: status.control.motorOutputEnabled, criticalMotorFault: status.control.criticalMotorFault },
      ...(location === undefined ? {} : { location: { lat: location.lat, lon: location.lon, fixType: location.fixType,
        observedAt: location.observedAt, accuracyM: location.accuracyM } as RemoteLocation }) },
  };
}

function parseState(value: unknown, deviceId: string): RemoteState {
  if (!record(value) || value.deviceId !== deviceId || typeof value.simulated !== 'boolean' || typeof value.enabled !== 'boolean'
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.activation !== 'string' || !['off', 'enabling', 'on', 'disabling', 'unavailable'].includes(value.activation)
    || (value.reachable !== null && typeof value.reachable !== 'boolean') || typeof value.fresh !== 'boolean'
    || (value.lastSeenAt !== null && !timestamp(value.lastSeenAt))) return invalid();
  return {
    deviceId, simulated: value.simulated, enabled: value.enabled, revision: value.revision, activation: value.activation as RemoteState['activation'],
    reachable: value.reachable as boolean | null, fresh: value.fresh, lastSeenAt: value.lastSeenAt as string | null,
    latest: reading(value.latest), lastSuccess: reading(value.lastSuccess, true) as RemoteState['lastSuccess'],
  };
}

async function requestState<T>(expectedUserId: string, deviceId: string, signal: AbortSignal | undefined, parse: (value: unknown, deviceId: string) => T,
  change?: { enabled: boolean; revision: number }, historyQuery?: string): Promise<T> {
  const { url, publishableKey } = supabaseConfig;
  if (!url || !publishableKey) throw new RemoteStateError('configuration');
  if (!uuid.test(expectedUserId) || !uuid.test(deviceId)) throw new RemoteStateError('unauthorized');
  if (change && (typeof change.enabled !== 'boolean' || !Number.isSafeInteger(change.revision) || change.revision < 1)) throw new RemoteStateError('invalid_request');
  const controller = new AbortController();
  let reason: ErrorCode = 'cancelled', dispatched = false, definitiveFailure = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => { reason = 'timeout'; abort(); }, 12_000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new RemoteStateError(reason)); });
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  const wait = <T>(operation: PromiseLike<T>) => Promise.race([operation, aborted]);
  const unsubscribe = subscribeAuthSessionOperations(() => {
    const operation = getAuthSessionOperationSnapshot();
    if (operation.busy && operation.kind === 'session-write') { reason = 'unauthorized'; abort(); }
  });
  const currentToken = () => {
    if (controller.signal.aborted) throw new RemoteStateError(reason);
    return wait(runAuthSessionOperation(async lease => {
      const { data, error } = await wait(lease.retain(() => getSupabaseClient().auth.getSession()));
      if (error || !data.session?.access_token || data.session.user.id !== expectedUserId) throw new RemoteStateError('unauthorized');
      return data.session.access_token;
    }, { kind: 'session-read' }));
  };
  try {
    const token = await currentToken();
    if (controller.signal.aborted) throw new RemoteStateError(reason);
    const resource = historyQuery === undefined ? 'remote-state' : 'remote-history';
    const query = change ? '' : historyQuery ?? `deviceId=${encodeURIComponent(deviceId)}`;
    const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/${resource}${query ? `?${query}` : ''}`;
    dispatched = true;
    const response = await wait(fetch(endpoint, {
      method: change ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json', ...(change ? { 'Content-Type': 'application/json' } : {}) },
      ...(change ? { body: JSON.stringify({ deviceId, ...change }) } : {}),
    }));
    if ([400, 401, 403, 409].includes(response.status)) {
      definitiveFailure = true;
      if (response.status === 401 || response.status === 403) throw new RemoteStateError('unauthorized');
      if (response.status === 409) {
        const value: unknown = await wait(response.json());
        const code = record(value) && record(value.error) ? value.error.code : null;
        throw new RemoteStateError(code === 'remote_state_revision_exhausted' ? 'revision_exhausted' : 'revision_conflict');
      }
      throw new RemoteStateError('invalid_request');
    }
    if (!response.ok) throw new RemoteStateError('unavailable');
    if (response.redirected || (response.url && response.url !== endpoint)
      || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) return invalid();
    const body = await wait(response.text());
    if (body.length > (historyQuery === undefined ? 32 : 256) * 1024) return invalid();
    let value: unknown;
    try { value = JSON.parse(body); } catch { return invalid(); }
    const result = parse(value, deviceId);
    await currentToken();
    if (controller.signal.aborted) throw new RemoteStateError(reason);
    return result;
  } catch (error) {
    const unknown = !!change && dispatched && !definitiveFailure;
    if (controller.signal.aborted) throw new RemoteStateError(reason, unknown);
    if (error instanceof RemoteStateError) throw new RemoteStateError(error.code, unknown);
    if (error instanceof AuthSessionOperationBusyError && !dispatched) throw error;
    throw new RemoteStateError('unavailable', unknown);
  } finally {
    clearTimeout(timer); unsubscribe();
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}

export function getRemoteState(expectedUserId: string, deviceId: string, { signal }: { signal?: AbortSignal } = {}) {
  return requestState(expectedUserId, deviceId, signal, parseState);
}

export function setRemoteState(expectedUserId: string, deviceId: string, enabled: boolean, revision: number, { signal }: { signal?: AbortSignal } = {}) {
  return requestState(expectedUserId, deviceId, signal, parseState, { enabled, revision });
}

export function readRemoteHistoryPage<T>(expectedUserId: string, deviceId: string, query: string, parse: (value: unknown) => T, signal?: AbortSignal) {
  return requestState(expectedUserId, deviceId, signal, parse, undefined, query);
}
