// This diagnostic path never supplies device ownership, telemetry trust or motion authority.
export type BrainstemSnapshot = {
  schemaVersion: 1;
  source: 'brainstem.grpc';
  access: 'read-only';
  requestId: string;
  observedAt: string;
  transport: 'mtls' | 'local-insecure';
  state: { kind: string; transition: string };
  control: { owner: string; motorOutputEnabled: boolean; criticalMotorFault: boolean };
};

export class ConnectionCheckError extends Error {
  constructor(readonly code: 'config' | 'unauthorized' | 'timeout' | 'cancelled' | 'unavailable' | 'invalid_response') {
    const copy = {
      config: '请核对服务地址和诊断令牌；远程地址必须使用 HTTPS。',
      unauthorized: '诊断令牌不正确或已失效，请向网关管理者确认。',
      timeout: '连接超时，请检查网关和机器人网络后重试。',
      cancelled: '检查已取消。',
      unavailable: '无法连接服务，请检查地址、网络和服务状态。',
      invalid_response: '服务响应不符合 Brainstem 只读协议，未采信本次状态。',
    };
    super(copy[code]);
    this.name = 'ConnectionCheckError';
  }
}

export function diagnosticOrigin(value: string, allowLocalHttp = false) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new ConnectionCheckError('config'); }
  // Emulator aliases are not loopback on a phone/browser. Use adb reverse for
  // Android local development; never send a diagnostic bearer to LAN HTTP.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || !(url.protocol === 'https:' || (allowLocalHttp && local && url.protocol === 'http:'))) {
    throw new ConnectionCheckError('config');
  }
  return url.origin;
}

async function readJson(url: string, headers: Record<string, string>, options: {
  fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number;
}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new ConnectionCheckError('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  let response: Response | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new ConnectionCheckError(timedOut ? 'timeout' : 'cancelled')), { once: true });
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 7000);
  });
  try {
    return await Promise.race([aborted, (async () => {
      response = await (options.fetchImpl ?? fetch)(url, {
        method: 'GET', headers, signal: controller.signal, redirect: 'error',
        credentials: 'omit', cache: 'no-store',
      });
      if (response.redirected || (response.url && response.url !== url)) throw new ConnectionCheckError('invalid_response');
      if (response.status === 401 || response.status === 403) throw new ConnectionCheckError('unauthorized');
      if (!response.ok) throw new ConnectionCheckError('unavailable');
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new ConnectionCheckError('invalid_response');
      if (Number(response.headers.get('content-length')) > 65536) throw new ConnectionCheckError('invalid_response');
      let text = '';
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            bytes += item.value.byteLength;
            if (bytes > 65536) throw new ConnectionCheckError('invalid_response');
            chunks.push(item.value);
          }
          const data = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
          text = new TextDecoder().decode(data);
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      } else {
        // React Native fetch implementations can lack a readable stream.
        text = await response.text();
        if (text.length > 65536) throw new ConnectionCheckError('invalid_response');
      }
      return JSON.parse(text) as unknown;
    })()]);
  } catch (error) {
    if (error instanceof ConnectionCheckError) throw error;
    throw new ConnectionCheckError(error instanceof SyntaxError ? 'invalid_response' : 'unavailable');
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    controller.abort();
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined);
  }
}

const kinds = ['CMS_STATE_KIND_ZERO', 'CMS_STATE_KIND_GROUNDED', 'CMS_STATE_KIND_STANDING', 'CMS_STATE_KIND_WALKING', 'CMS_STATE_KIND_TRANSITIONING'];
const transitions = ['CMS_TRANSITION_KIND_NONE', 'CMS_TRANSITION_KIND_STAND_UP', 'CMS_TRANSITION_KIND_SIT_DOWN', 'CMS_TRANSITION_KIND_GESTURE'];
const owners = ['CONTROL_OWNER_NONE', 'CONTROL_OWNER_GRPC', 'CONTROL_OWNER_YUNZHUO'];

export function validateBrainstemSnapshot(value: unknown, requestId: string, nowMs: number): BrainstemSnapshot {
  const v = value as Partial<BrainstemSnapshot> | null;
  const observed = typeof v?.observedAt === 'string' ? Date.parse(v.observedAt) : NaN;
  if (!v || v.schemaVersion !== 1 || v.source !== 'brainstem.grpc' || v.access !== 'read-only'
    || v.requestId !== requestId || !Number.isFinite(observed) || !Number.isFinite(nowMs)
    || nowMs - observed > 15000 || observed - nowMs > 5000
    || !['mtls', 'local-insecure'].includes(v.transport ?? '')
    || !kinds.includes(v.state?.kind ?? '') || !transitions.includes(v.state?.transition ?? '')
    || !owners.includes(v.control?.owner ?? '') || typeof v.control?.motorOutputEnabled !== 'boolean'
    || typeof v.control?.criticalMotorFault !== 'boolean') throw new ConnectionCheckError('invalid_response');
  // Copy only the diagnostic fields; never consume a remote canControl/online/lease field.
  return { schemaVersion: 1, source: 'brainstem.grpc', access: 'read-only', requestId,
    observedAt: v.observedAt!, transport: v.transport!,
    state: { kind: v.state!.kind, transition: v.state!.transition },
    control: { owner: v.control.owner, motorOutputEnabled: v.control.motorOutputEnabled, criticalMotorFault: v.control.criticalMotorFault } };
}

export async function checkBrainstemConnection(options: {
  endpoint: string; token: string; requestId: string; allowLocalHttp?: boolean;
  signal?: AbortSignal; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number;
}): Promise<BrainstemSnapshot> {
  const origin = diagnosticOrigin(options.endpoint, options.allowLocalHttp);
  if (!/^[\x21-\x7e]{32,256}$/.test(options.token)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.requestId)) {
    throw new ConnectionCheckError('config');
  }
  const data = await readJson(`${origin}/api/v1/brainstem/status`, {
    Authorization: `Bearer ${options.token}`, 'X-Request-Id': options.requestId, Accept: 'application/json',
  }, options);
  return validateBrainstemSnapshot(data, options.requestId, (options.now ?? Date.now)());
}

export async function checkCloudConnection(options: {
  endpoint: string; publishableKey: string; allowLocalHttp?: boolean; signal?: AbortSignal;
  fetchImpl?: typeof fetch; timeoutMs?: number;
}): Promise<void> {
  const origin = diagnosticOrigin(options.endpoint, options.allowLocalHttp);
  if (!options.publishableKey) throw new ConnectionCheckError('config');
  const data = await readJson(`${origin}/auth/v1/health`, { apikey: options.publishableKey, Accept: 'application/json' }, options) as { name?: string; version?: string } | null;
  if (data?.name !== 'GoTrue' || typeof data.version !== 'string') throw new ConnectionCheckError('invalid_response');
}
