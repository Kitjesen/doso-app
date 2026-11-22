import { getAuthSessionOperationSnapshot, runAuthSessionOperation, subscribeAuthSessionOperations } from '../../services/authSessionOperation';
import { getSupabaseClient, supabaseConfig } from '../../services/supabaseClient';

export type VideoGrant = Readonly<{ viewerToken: string; viewerId: string; deviceId: string; expiresAt: number }>;
export class VideoAccessError extends Error {
  constructor(public readonly code: 'configuration' | 'authorization' | 'unavailable') {
    super(code === 'configuration' ? '远程视频服务尚未配置。' : code === 'authorization' ? '视频授权已失效，请重新登录或确认设备权限。' : '视频服务暂不可用，请重新连接。');
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function videoAccess(userId: string, deviceId: string, action: 'open' | 'close', signal?: AbortSignal): Promise<VideoGrant | null> {
  const { url, publishableKey } = supabaseConfig;
  if (!url || !publishableKey) throw new VideoAccessError('configuration');
  if (!uuid.test(userId) || !uuid.test(deviceId)) throw new VideoAccessError('authorization');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 12_000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const unsubscribe = subscribeAuthSessionOperations(() => {
    const operation = getAuthSessionOperationSnapshot();
    if (operation.busy && operation.kind === 'session-write') abort();
  });
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new VideoAccessError('unavailable')); });
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  const wait = <T>(operation: PromiseLike<T>) => Promise.race([operation, aborted]);
  const token = () => runAuthSessionOperation(async lease => {
    const { data, error } = await wait(lease.retain(() => getSupabaseClient().auth.getSession()));
    if (error || data.session?.user.id !== userId || !data.session.access_token) throw new VideoAccessError('authorization');
    if (controller.signal.aborted) throw new VideoAccessError('unavailable');
    return data.session.access_token;
  }, { kind: 'session-read' });
  try {
    if (controller.signal.aborted) throw new VideoAccessError('unavailable');
    const authorization = await wait(token());
    const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/video-access`;
    const response = await wait(fetch(endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { apikey: publishableKey, Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action, deviceId }),
    }));
    if (response.status === 401 || response.status === 403) throw new VideoAccessError('authorization');
    if (action === 'close') {
      if (response.status !== 204) throw new VideoAccessError('unavailable');
      return null;
    }
    if (!response.ok || response.redirected || response.url && response.url !== endpoint
      || !response.headers.get('content-type')?.includes('application/json')) throw new VideoAccessError('unavailable');
    const body = await wait(response.text());
    if (body.length > 4096) throw new VideoAccessError('unavailable');
    const grant = JSON.parse(body) as VideoGrant;
    const now = Date.now();
    if (grant.viewerId !== userId || grant.deviceId !== deviceId || !/^[0-9a-f]{64}$/.test(grant.viewerToken)
      || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now || grant.expiresAt > now + 65_000) throw new VideoAccessError('unavailable');
    await wait(token());
    return grant;
  } catch (error) {
    if (error instanceof VideoAccessError) throw error;
    throw new VideoAccessError('unavailable');
  } finally {
    clearTimeout(timer); unsubscribe();
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}
