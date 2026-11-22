import { AuthSessionOperationBusyError, getAuthSessionOperationSnapshot, runAuthSessionOperation, subscribeAuthSessionOperations } from './authSessionOperation';
import { getSupabaseClient, supabaseConfig } from './supabaseClient';

export type CloudMapVersion = {
  id: string;
  device_id: string;
  name: string;
  source_map_id: string;
  source_content_epoch: string;
  frame_id: string | null;
  format: 'lingtu-map-package-v1';
  schema_version: number;
  archive_format: 'tar.gz';
  size_bytes: number;
  sha256: string;
  crc64: string;
  status: 'uploading' | 'verifying' | 'ready' | 'failed' | 'cancelled';
  created_at: string;
  ready_at: string | null;
};

export class CloudMapsError extends Error {
  constructor(public readonly code: 'configuration' | 'unauthorized' | 'unavailable' | 'invalid_response' | 'cancelled' | 'timeout') {
    const messages = {
      configuration: '云端地图服务尚未配置。',
      unauthorized: '登录状态已变化或授权已失效，请重新登录。',
      unavailable: '云端地图服务暂不可用，请稍后重试。',
      invalid_response: '云端地图目录响应无法识别，请稍后重试。',
      cancelled: '地图目录读取已取消。',
      timeout: '地图目录读取超时，请重试。',
    };
    super(messages[code]);
    this.name = 'CloudMapsError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set(['uploading', 'verifying', 'ready', 'failed', 'cancelled']);
const text = (value: unknown, maximum: number): value is string => typeof value === 'string'
  && value.trim().length > 0 && [...value].length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parseCatalog(value: unknown): CloudMapVersion[] {
  if (!value || typeof value !== 'object' || !('versions' in value)
    || !Array.isArray(value.versions) || value.versions.length > 100) throw new CloudMapsError('invalid_response');
  const ids = new Set<string>();
  return value.versions.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new CloudMapsError('invalid_response');
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id)
      || typeof row.device_id !== 'string' || !uuid.test(row.device_id)
      || !text(row.name, 200) || !text(row.source_map_id, 200) || !text(row.source_content_epoch, 128)
      || (row.frame_id !== null && !text(row.frame_id, 200))
      || row.format !== 'lingtu-map-package-v1' || row.archive_format !== 'tar.gz'
      || typeof row.schema_version !== 'number' || !Number.isSafeInteger(row.schema_version) || row.schema_version < 1
      || typeof row.size_bytes !== 'number' || !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1 || row.size_bytes > 20 * 1024 ** 3
      || typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256)
      || typeof row.crc64 !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(row.crc64) || BigInt(row.crc64) > 18446744073709551615n
      || typeof row.status !== 'string' || !statuses.has(row.status)
      || !timestamp(row.created_at) || (row.ready_at !== null && !timestamp(row.ready_at))
      || (row.status === 'ready' && row.ready_at === null)) throw new CloudMapsError('invalid_response');
    ids.add(row.id);
    return {
      id: row.id, device_id: row.device_id, name: row.name, source_map_id: row.source_map_id,
      source_content_epoch: row.source_content_epoch, frame_id: row.frame_id as string | null,
      format: row.format, schema_version: row.schema_version, archive_format: row.archive_format,
      size_bytes: row.size_bytes, sha256: row.sha256, crc64: row.crc64,
      status: row.status as CloudMapVersion['status'], created_at: row.created_at, ready_at: row.ready_at as string | null,
    };
  });
}

export async function readCloudMaps(expectedUserId: string, { signal }: { signal?: AbortSignal } = {}): Promise<CloudMapVersion[]> {
  const { url, publishableKey } = supabaseConfig;
  if (!url || !publishableKey) throw new CloudMapsError('configuration');
  if (!uuid.test(expectedUserId)) throw new CloudMapsError('unauthorized');
  const controller = new AbortController();
  let reason: CloudMapsError['code'] = 'cancelled';
  const abort = () => controller.abort();
  const timer = setTimeout(() => { reason = 'timeout'; abort(); }, 15_000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new CloudMapsError(reason)); });
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  const wait = <T>(operation: PromiseLike<T>) => Promise.race([operation, aborted]);
  const unsubscribe = subscribeAuthSessionOperations(() => {
    const operation = getAuthSessionOperationSnapshot();
    if (operation.busy && operation.kind === 'session-write') { reason = 'unauthorized'; abort(); }
  });
  const currentToken = () => {
    if (controller.signal.aborted) throw new CloudMapsError(reason);
    return wait(runAuthSessionOperation(async lease => {
      const { data, error } = await wait(lease.retain(() => getSupabaseClient().auth.getSession()));
      if (error || !data.session?.access_token || data.session.user.id !== expectedUserId) throw new CloudMapsError('unauthorized');
      return data.session.access_token;
    }, { kind: 'session-read' }));
  };
  try {
    if (controller.signal.aborted) throw new CloudMapsError(reason);
    const token = await currentToken();
    if (controller.signal.aborted) throw new CloudMapsError(reason);
    const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/map-library`;
    const response = await wait(fetch(endpoint, {
      method: 'GET', headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    }));
    if (response.status === 401 || response.status === 403) throw new CloudMapsError('unauthorized');
    if (!response.ok) throw new CloudMapsError('unavailable');
    if (response.redirected || (response.url && response.url !== endpoint)
      || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new CloudMapsError('invalid_response');
    const body = await wait(response.text());
    if (body.length > 256 * 1024) throw new CloudMapsError('invalid_response');
    let value: unknown;
    try { value = JSON.parse(body); } catch { throw new CloudMapsError('invalid_response'); }
    const versions = parseCatalog(value);
    await currentToken();
    if (controller.signal.aborted) throw new CloudMapsError(reason);
    return versions;
  } catch (error) {
    if (controller.signal.aborted) throw new CloudMapsError(reason);
    if (error instanceof CloudMapsError || error instanceof AuthSessionOperationBusyError) throw error;
    throw new CloudMapsError('unavailable');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
    unsubscribe();
    controller.abort();
  }
}
