import { Platform } from 'react-native';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const DEFAULT_BRIDGE_ORIGIN = 'http://127.0.0.1:8121';
const MAX_INPUT_AGE_MS = 150;

export function resolveWebDevBridgeOrigin(raw = process.env.EXPO_PUBLIC_BRAINSTEM_WEB_DEV_BRIDGE_URL): string {
  const candidate = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : DEFAULT_BRIDGE_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw Object.assign(new Error('Invalid web dev bridge URL'), { code: 'config' });
  }
  if (
    parsed.protocol !== 'http:'
    || (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
    || !parsed.port
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw Object.assign(new Error('Web dev bridge must be loopback HTTP'), { code: 'config' });
  }
  return parsed.origin;
}

type ImuListener = (payload: unknown) => void;

export function createBrainstemWebDevBridge({
  origin = resolveWebDevBridgeOrigin(),
  fetchImpl = globalThis.fetch.bind(globalThis),
  nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()),
  registerUnload = true,
} = {}) {
  const checkedOrigin = resolveWebDevBridgeOrigin(origin);
  const pendingReads = new Map<string, AbortController>();
  const imuListeners = new Set<ImuListener>();
  let imuStream: { sessionId: string; controller: AbortController } | null = null;
  let activeSessionId: string | null = null;

  async function postJson<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${checkedOrigin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'unavailable';
      throw Object.assign(new Error(code), { code });
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw Object.assign(new Error('invalid_response'), { code: 'invalid_response' });
    }
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('invalid_response'), { code: 'invalid_response' });
    }
    const envelope = payload as { ok?: unknown; code?: unknown; data?: unknown };
    if (envelope.ok !== true) {
      const code = typeof envelope.code === 'string' ? envelope.code : response.ok ? 'invalid_response' : 'unavailable';
      throw Object.assign(new Error(code), { code });
    }
    return envelope.data as T;
  }

  async function lanRead(host: string, port: number, requestId: string, kind: 'status' | 'profile' | 'voltage' | 'motors') {
    if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
      throw Object.assign(new Error('config'), { code: 'config' });
    }
    const controller = new AbortController();
    pendingReads.set(requestId, controller);
    try {
      return await postJson('/api/v1/dev-lan/read', { host, port, requestId, kind }, controller.signal);
    } finally {
      if (pendingReads.get(requestId) === controller) pendingReads.delete(requestId);
    }
  }

  function stopImuStreamInternal(sessionId?: string) {
    if (!imuStream) return;
    if (sessionId !== undefined && imuStream.sessionId !== sessionId) return;
    imuStream.controller.abort();
    imuStream = null;
  }

  async function pumpImuSse(sessionId: string, response: Response, controller: AbortController) {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith('data:')) {
          const jsonText = line.slice(5).trim();
          if (jsonText) {
            try {
              const parsed = JSON.parse(jsonText) as Record<string, unknown>;
              if (parsed && typeof parsed === 'object') {
                for (const listener of [...imuListeners]) {
                  try { listener({ sessionId, ...parsed }); } catch { /* Ignore UI listener error. */ }
                }
              }
            } catch { /* Ignore malformed SSE event line. */ }
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
  }

  const handlePageUnload = () => {
    const id = activeSessionId;
    if (!id) return;
    activeSessionId = null;
    stopImuStreamInternal(id);
    try {
      void fetchImpl(`${checkedOrigin}/api/v1/dev-lan/session/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
        credentials: 'omit',
        redirect: 'error',
        keepalive: true,
      }).catch(() => undefined);
    } catch { /* Best effort keepalive release on tab close. */ }
  };

  if (registerUnload && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('beforeunload', handlePageUnload);
  }

  const unavailableTls = async () => {
    throw Object.assign(new Error('native_unavailable'), { code: 'native_unavailable' });
  };

  return {
    lanDevAvailable: true,
    setControlNavigationHidden: async () => 0,
    chooseClientIdentity: unavailableTls,
    readStatus: unavailableTls,
    readProfile: unavailableTls,
    readVoltage: unavailableTls,
    readMotorStatus: unavailableTls,
    openControl: unavailableTls,

    readLanStatus: (host: string, port: number, requestId: string) => lanRead(host, port, requestId, 'status'),
    readLanProfile: (host: string, port: number, requestId: string) => lanRead(host, port, requestId, 'profile'),
    readLanVoltage: (host: string, port: number, requestId: string) => lanRead(host, port, requestId, 'voltage'),
    readLanMotorStatus: (host: string, port: number, requestId: string) => lanRead(host, port, requestId, 'motors'),
    async cancelStatus(requestId: string) {
      const controller = pendingReads.get(requestId);
      if (controller) {
        pendingReads.delete(requestId);
        controller.abort();
      }
    },

    async openLanControl(host: string, port: number, requestId: string) {
      const data = await postJson<{ sessionId: string }>('/api/v1/dev-lan/session/open', { host, port, requestId });
      activeSessionId = data.sessionId;
      return data;
    },
    readControlStatus: (sessionId: string) => postJson('/api/v1/dev-lan/session/read', { sessionId }),
    controlAction: (sessionId: string, action: string, profileName: string | null) =>
      postJson('/api/v1/dev-lan/session/action', action === 'play-gesture'
        ? { sessionId, action, profileName: null, gestureName: profileName }
        : { sessionId, action, profileName }),
    listGestures: (sessionId: string) => postJson('/api/v1/dev-lan/session/gestures', { sessionId }),
    getSpeedMode: (sessionId: string) => postJson('/api/v1/dev-lan/session/speed-mode', { sessionId, action: 'get' }),
    setSpeedMode: (sessionId: string, mode: string) => postJson('/api/v1/dev-lan/session/speed-mode', { sessionId, action: 'set', mode }),
    acquireControl: (sessionId: string) => postJson('/api/v1/dev-lan/session/acquire', { sessionId }),
    sendControlInput: (sessionId: string, forward: number, lateral: number, yaw: number) =>
      postJson('/api/v1/dev-lan/session/input', { sessionId, forward, lateral, yaw }),
    async sendControlInputAt(sessionId: string, forward: number, lateral: number, yaw: number, sampledAtMonotonicMs: number) {
      const age = nowMs() - sampledAtMonotonicMs;
      if (!Number.isFinite(age) || age < 0 || age > MAX_INPUT_AGE_MS) {
        throw Object.assign(new Error('stale_input'), { code: 'stale_input' });
      }
      return postJson('/api/v1/dev-lan/session/input', { sessionId, forward, lateral, yaw });
    },
    interruptControl: (sessionId: string) => postJson('/api/v1/dev-lan/session/interrupt', { sessionId }),
    async closeControl(sessionId: string) {
      stopImuStreamInternal(sessionId);
      if (activeSessionId === sessionId) activeSessionId = null;
      await postJson('/api/v1/dev-lan/session/close', { sessionId }).catch(() => undefined);
    },

    readRecoveryStatus: (sessionId: string) => postJson('/api/v1/dev-lan/session/recovery', { sessionId, command: 'status' }),
    recoveryCommand: (sessionId: string, command: string) =>
      postJson('/api/v1/dev-lan/session/recovery', { sessionId, command }),
    setRecoveryHeartbeat(sessionId: string, enabled: boolean) {
      return postJson('/api/v1/dev-lan/session/recovery-heartbeat', { sessionId, enabled }).then(() => undefined);
    },

    addListener(event: string, listener: ImuListener) {
      if (event !== 'onBrainstemImu') return { remove: () => {} };
      imuListeners.add(listener);
      return { remove: () => { imuListeners.delete(listener); } };
    },
    async startListenImu(sessionId: string) {
      stopImuStreamInternal();
      const controller = new AbortController();
      imuStream = { sessionId, controller };
      void (async () => {
        try {
          const response = await fetchImpl(`${checkedOrigin}/api/v1/dev-lan/session/${encodeURIComponent(sessionId)}/imu`, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          });
          if (response.ok) await pumpImuSse(sessionId, response, controller);
        } catch { /* Stream aborted or bridge offline. */ }
      })();
      return null;
    },
    async stopListenImu(sessionId: string) {
      stopImuStreamInternal(sessionId);
    },
    dispose() {
      stopImuStreamInternal();
      for (const controller of pendingReads.values()) controller.abort();
      pendingReads.clear();
      if (registerUnload && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('pagehide', handlePageUnload);
        window.removeEventListener('beforeunload', handlePageUnload);
      }
    },
  };
}

export function installBrainstemWebDevBridge(): boolean {
  if (typeof __DEV__ === 'undefined' || __DEV__ !== true || Platform.OS !== 'web') return false;
  const host = globalThis as { __dosoWebDevBrainstemBridge?: ReturnType<typeof createBrainstemWebDevBridge> };
  if (!host.__dosoWebDevBrainstemBridge) {
    host.__dosoWebDevBrainstemBridge = createBrainstemWebDevBridge();
  }
  return true;
}

installBrainstemWebDevBridge();
