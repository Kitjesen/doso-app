export type BrainstemSimulationPhase = 'disconnected' | 'connecting' | 'ready' | 'stopping' | 'error';

export type BrainstemSimulationVector = Readonly<{ x: number; y: number; z: number }>;
export type BrainstemJoystickVector = Readonly<{ x: number; y: number }>;

export type BrainstemSimulationSnapshot = Readonly<{
  phase: BrainstemSimulationPhase;
  sessionId?: string;
  errorCode?: BrainstemSimulationErrorCode;
  errorMessage?: string;
  lastAcknowledgedVelocity: BrainstemSimulationVector;
  lastAcknowledgedInputSequence?: number;
}>;

export type BrainstemSimulationErrorCode =
  | 'config'
  | 'timeout'
  | 'unavailable'
  | 'invalid_response'
  | 'invalid_input';

export class BrainstemSimulationError extends Error {
  constructor(readonly code: BrainstemSimulationErrorCode) {
    const messages: Record<BrainstemSimulationErrorCode, string> = {
      config: '本地仿真配置无效，请检查开发模式和仿真地址。',
      timeout: '本地仿真响应超时，控制会话已停止。',
      unavailable: '无法连接 Brainstem 本地仿真，控制会话已停止。',
      invalid_response: 'Brainstem 本地仿真响应无效，控制会话已停止。',
      invalid_input: '摇杆输入无效，控制会话已停止。',
    };
    super(messages[code]);
    this.name = 'BrainstemSimulationError';
  }
}

type TimerHandle = unknown;
export type BrainstemSimulationTimers = {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

export type BrainstemSimulationController = {
  subscribe(listener: (snapshot: BrainstemSimulationSnapshot) => void): () => void;
  getSnapshot(): BrainstemSimulationSnapshot;
  connect(): Promise<void>;
  setDrive(input: BrainstemJoystickVector): void;
  setTurn(input: BrainstemJoystickVector): void;
  stop(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): Promise<void>;
};

export type BrainstemSimulationControllerOptions = {
  developmentMode: boolean;
  clientId: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timers?: BrainstemSimulationTimers;
  connectTimeoutMs?: number;
  inputTimeoutMs?: number;
  createInputChannel?: BrainstemSimulationInputChannelFactory;
};

export type BrainstemSimulationInputChannel = {
  sendInput(input: { inputSequence: number; velocity: BrainstemSimulationVector }): Promise<unknown>;
  release(): Promise<unknown>;
  close(): void;
};

export type BrainstemSimulationInputChannelFactory = (options: {
  origin: string;
  sessionId: string;
  signal: AbortSignal;
  connectTimeoutMs: number;
  inputTimeoutMs: number;
  timers: BrainstemSimulationTimers;
}) => Promise<BrainstemSimulationInputChannel>;

type Session = { sessionId: string; linearMps: number; yawRps: number };
type MutableIntent = { drive: BrainstemJoystickVector; turn: BrainstemJoystickVector };

const ZERO_VECTOR: BrainstemSimulationVector = Object.freeze({ x: 0, y: 0, z: 0 });
const ZERO_STICK: BrainstemJoystickVector = Object.freeze({ x: 0, y: 0 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;
const MAX_RESPONSE_BYTES = 16_384;
const HEARTBEAT_MS = 50;

function simulationOrigin(value: string, developmentMode: boolean) {
  if (!developmentMode) throw new BrainstemSimulationError('config');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new BrainstemSimulationError('config'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '8122'
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new BrainstemSimulationError('config');
  }
  return url.origin;
}

function clampAxis(value: number) {
  if (!Number.isFinite(value)) throw new BrainstemSimulationError('invalid_input');
  return Math.max(-1, Math.min(1, value));
}

function normalizedStick(input: BrainstemJoystickVector): BrainstemJoystickVector {
  if (!input || typeof input.x !== 'number' || typeof input.y !== 'number') {
    throw new BrainstemSimulationError('invalid_input');
  }
  return { x: clampAxis(input.x), y: clampAxis(input.y) };
}

function velocityFor(intent: MutableIntent, session: Session): BrainstemSimulationVector {
  const scale = (value: number, limit: number) => value === 0 ? 0 : -value * limit;
  return {
    x: scale(intent.drive.y, session.linearMps),
    y: scale(intent.drive.x, session.linearMps),
    z: scale(intent.turn.x, session.yawRps),
  };
}

function sameVelocity(left: BrainstemSimulationVector, right: BrainstemSimulationVector) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function monotonicNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function requestJson(options: {
  fetchImpl: typeof fetch;
  timers: BrainstemSimulationTimers;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const controller = new AbortController();
  const deadlineAt = monotonicNow() + options.timeoutMs;
  let timedOut = false;
  let rejectDeadline: ((reason: BrainstemSimulationError) => void) | undefined;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = options.timers.setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectDeadline?.(new BrainstemSimulationError('timeout'));
  }, options.timeoutMs);
  try {
    const result = await Promise.race([deadline, (async () => {
      const response = await options.fetchImpl(options.url, {
        method: options.method,
        headers: options.body === undefined ? { Accept: 'application/json' } : {
          Accept: 'application/json', 'Content-Type': 'application/json',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (response.redirected || (response.url && response.url !== options.url)) {
        throw new BrainstemSimulationError('invalid_response');
      }
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        throw new BrainstemSimulationError(response.ok ? 'invalid_response' : 'unavailable');
      }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new BrainstemSimulationError('invalid_response');
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new BrainstemSimulationError('invalid_response');
      try { return JSON.parse(text) as unknown; } catch { throw new BrainstemSimulationError('invalid_response'); }
    })()]);
    if (monotonicNow() >= deadlineAt) throw new BrainstemSimulationError('timeout');
    return result;
  } catch (error) {
    if (error instanceof BrainstemSimulationError) throw error;
    if (timedOut) throw new BrainstemSimulationError('timeout');
    throw new BrainstemSimulationError('unavailable');
  } finally {
    options.timers.clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}

function validateSession(value: unknown): Session {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.simulationOnly !== true || value.ready !== true
    || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)
    || value.leaseDurationMs !== 300 || !isRecord(value.limits)
    || value.limits.linearMps !== 0.25 || value.limits.yawRps !== 0.5) {
    throw new BrainstemSimulationError('invalid_response');
  }
  return { sessionId: value.sessionId, linearMps: value.limits.linearMps, yawRps: value.limits.yawRps };
}

function validateInputAck(value: unknown, sessionId: string, inputSequence: number, priorGrpcSequence: number) {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.simulationOnly !== true
    || value.accepted !== true || value.sessionId !== sessionId
    || value.inputSequence !== inputSequence || !Number.isSafeInteger(value.gRpcSequence)
    || (value.gRpcSequence as number) <= priorGrpcSequence
    || value.status !== 'accepted') throw new BrainstemSimulationError('invalid_response');
  return value.gRpcSequence as number;
}

function validateReleaseAck(value: unknown, sessionId: string) {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.simulationOnly !== true
    || value.sessionId !== sessionId || value.zeroAcknowledged !== true || value.released !== true) {
    throw new BrainstemSimulationError('invalid_response');
  }
}

export function createBrainstemSimulationController(
  options: BrainstemSimulationControllerOptions,
): BrainstemSimulationController {
  const origin = simulationOrigin(options.endpoint ?? 'http://127.0.0.1:8122', options.developmentMode);
  if (!CLIENT_ID.test(options.clientId)) throw new BrainstemSimulationError('config');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timers = options.timers ?? { setTimeout, clearTimeout };
  const connectTimeoutMs = options.connectTimeoutMs ?? 1500;
  const inputTimeoutMs = options.inputTimeoutMs ?? 180;
  if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0
    || !Number.isFinite(inputTimeoutMs) || inputTimeoutMs <= 0 || inputTimeoutMs >= 300) {
    throw new BrainstemSimulationError('config');
  }

  const listeners = new Set<(snapshot: BrainstemSimulationSnapshot) => void>();
  let snapshot: BrainstemSimulationSnapshot = { phase: 'disconnected', lastAcknowledgedVelocity: ZERO_VECTOR };
  let intent: MutableIntent = { drive: ZERO_STICK, turn: ZERO_STICK };
  let session: Session | undefined;
  let inputSequence = 0;
  let lastGrpcSequence = 0;
  let generation = 0;
  let disposed = false;
  let inputInFlight: Promise<void> | undefined;
  let sendQueued = false;
  let heartbeat: TimerHandle | undefined;
  let connectAbort: AbortController | undefined;
  let connectInFlight: Promise<void> | undefined;
  let disconnectInFlight: Promise<void> | undefined;
  let inputChannel: BrainstemSimulationInputChannel | undefined;

  const publish = (next: BrainstemSimulationSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };
  const clearHeartbeat = () => {
    if (heartbeat !== undefined) timers.clearTimeout(heartbeat);
    heartbeat = undefined;
  };
  const scheduleHeartbeat = () => {
    clearHeartbeat();
    if (!disposed && session && snapshot.phase === 'ready') {
      heartbeat = timers.setTimeout(() => {
        heartbeat = undefined;
        void sendLatest();
        scheduleHeartbeat();
      }, HEARTBEAT_MS);
    }
  };
  const withDeadline = async <T>(operation: Promise<T>, timeoutMs: number, onTimeout?: () => void) => {
    const deadlineAt = monotonicNow() + timeoutMs;
    let rejectDeadline: ((error: BrainstemSimulationError) => void) | undefined;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    const timer = timers.setTimeout(() => {
      onTimeout?.();
      rejectDeadline?.(new BrainstemSimulationError('timeout'));
    }, timeoutMs);
    try {
      const result = await Promise.race([operation, deadline]);
      if (monotonicNow() >= deadlineAt) {
        onTimeout?.();
        throw new BrainstemSimulationError('timeout');
      }
      return result;
    }
    finally { timers.clearTimeout(timer); }
  };
  const releaseSession = async (
    target: Session,
    timeoutMs = connectTimeoutMs,
    channel?: BrainstemSimulationInputChannel,
  ) => {
    if (channel) {
      try {
        const value = await withDeadline(channel.release(), inputTimeoutMs, () => channel.close());
        validateReleaseAck(value, target.sessionId);
        return;
      } finally {
        channel.close();
      }
    }
    const value = await requestJson({
      fetchImpl, timers, method: 'DELETE', timeoutMs,
      url: `${origin}/api/v1/simulation/sessions/${target.sessionId}`,
    });
    validateReleaseAck(value, target.sessionId);
  };
  const enterError = async (error: unknown, target = session, targetChannel = inputChannel) => {
    const errorGeneration = ++generation;
    const lastAcknowledgedVelocity = snapshot.lastAcknowledgedVelocity;
    const lastAcknowledgedInputSequence = snapshot.lastAcknowledgedInputSequence;
    connectAbort?.abort();
    connectAbort = undefined;
    clearHeartbeat();
    session = undefined;
    inputChannel = undefined;
    inputInFlight = undefined;
    sendQueued = false;
    intent = { drive: ZERO_STICK, turn: ZERO_STICK };
    const failure = error instanceof BrainstemSimulationError ? error : new BrainstemSimulationError('unavailable');
    publish({ phase: 'error', errorCode: failure.code, errorMessage: failure.message,
      lastAcknowledgedVelocity, lastAcknowledgedInputSequence });
    targetChannel?.close();
    if (target && !targetChannel) {
      let operation: Promise<void> | undefined;
      operation = (async () => {
        try {
          await releaseSession(target);
          if (generation === errorGeneration && snapshot.phase === 'error') {
            publish({ ...snapshot, lastAcknowledgedVelocity: ZERO_VECTOR });
          }
        } catch { /* The last acknowledged motion remains unknown until the gateway confirms zero. */ }
        finally {
          if (disconnectInFlight === operation) disconnectInFlight = undefined;
        }
      })();
      disconnectInFlight = operation;
      await operation;
    }
  };
  const sendLatest = async () => {
    const target = session;
    if (!target || snapshot.phase !== 'ready' || disposed) return;
    if (inputInFlight) {
      sendQueued = true;
      await inputInFlight;
      if (session === target && snapshot.phase === 'ready'
        && !sameVelocity(snapshot.lastAcknowledgedVelocity, velocityFor(intent, target))) await sendLatest();
      return;
    }
    sendQueued = false;
    const requestGeneration = generation;
    const velocity = velocityFor(intent, target);
    if (!Number.isSafeInteger(inputSequence + 1)) {
      await enterError(new BrainstemSimulationError('invalid_response'), target);
      return;
    }
    const sequence = ++inputSequence;
    const operation = (async () => {
      try {
        const targetChannel = inputChannel;
        const value = targetChannel
          ? await withDeadline(
            targetChannel.sendInput({ inputSequence: sequence, velocity }),
            inputTimeoutMs,
            () => targetChannel.close(),
          )
          : await requestJson({
            fetchImpl, timers, method: 'PUT', timeoutMs: inputTimeoutMs,
            url: `${origin}/api/v1/simulation/sessions/${target.sessionId}/input`,
            body: { inputSequence: sequence, velocity },
          });
        const acknowledgedGrpcSequence = validateInputAck(value, target.sessionId, sequence, lastGrpcSequence);
        if (generation !== requestGeneration || session !== target || snapshot.phase !== 'ready' || disposed) return;
        lastGrpcSequence = acknowledgedGrpcSequence;
        publish({ ...snapshot, lastAcknowledgedVelocity: velocity, lastAcknowledgedInputSequence: sequence });
      } catch (error) {
        if (generation === requestGeneration && session === target) await enterError(error, target, inputChannel);
      }
    })();
    inputInFlight = operation;
    await operation;
    if (inputInFlight === operation) inputInFlight = undefined;
    if (generation === requestGeneration && (sendQueued || !sameVelocity(velocity, velocityFor(intent, target)))) {
      await sendLatest();
    }
  };

  const setIntent = (side: 'drive' | 'turn', input: BrainstemJoystickVector) => {
    try { intent = { ...intent, [side]: normalizedStick(input) }; }
    catch (error) {
      intent = { drive: ZERO_STICK, turn: ZERO_STICK };
      void enterError(error);
      throw error;
    }
    if (session && snapshot.phase === 'ready') void sendLatest();
  };

  const disconnect = () => {
    if (disconnectInFlight) return disconnectInFlight;
    const target = session;
    const targetChannel = inputChannel;
    const pendingAcquire = connectInFlight;
    const releaseGeneration = ++generation;
    const lastAcknowledgedVelocity = snapshot.lastAcknowledgedVelocity;
    const lastAcknowledgedInputSequence = snapshot.lastAcknowledgedInputSequence;
    connectAbort?.abort();
    connectAbort = undefined;
    clearHeartbeat();
    intent = { drive: ZERO_STICK, turn: ZERO_STICK };
    session = undefined;
    inputChannel = undefined;
    inputInFlight = undefined;
    sendQueued = false;
    if (!target) {
      if (!pendingAcquire) {
        if (!disposed && snapshot.phase !== 'error') publish({ phase: 'disconnected', lastAcknowledgedVelocity });
        else if (disposed) snapshot = { phase: 'disconnected', lastAcknowledgedVelocity };
        return Promise.resolve();
      }
      if (!disposed) publish({ phase: 'stopping', lastAcknowledgedVelocity, lastAcknowledgedInputSequence });
      let operation: Promise<void> | undefined;
      operation = (async () => {
        try {
          await pendingAcquire;
          if (!disposed && generation === releaseGeneration) {
            publish({ phase: 'disconnected', lastAcknowledgedVelocity: ZERO_VECTOR });
          }
        } catch (error) {
          if (!disposed && generation === releaseGeneration) {
            const failure = error instanceof BrainstemSimulationError ? error : new BrainstemSimulationError('unavailable');
            publish({ phase: 'error', errorCode: failure.code, errorMessage: failure.message,
              lastAcknowledgedVelocity, lastAcknowledgedInputSequence });
          }
        } finally {
          if (disconnectInFlight === operation) disconnectInFlight = undefined;
        }
      })();
      disconnectInFlight = operation;
      return operation;
    }
    if (!disposed) publish({ phase: 'stopping', sessionId: target.sessionId,
      lastAcknowledgedVelocity, lastAcknowledgedInputSequence });
    let operation: Promise<void> | undefined;
    operation = (async () => {
      try {
        await releaseSession(target, connectTimeoutMs, targetChannel);
        if (!disposed && generation === releaseGeneration) {
          publish({ phase: 'disconnected', lastAcknowledgedVelocity: ZERO_VECTOR });
        }
      } catch (error) {
        if (!disposed && generation === releaseGeneration) {
          const failure = error instanceof BrainstemSimulationError ? error : new BrainstemSimulationError('unavailable');
          publish({ phase: 'error', errorCode: failure.code, errorMessage: failure.message,
            lastAcknowledgedVelocity, lastAcknowledgedInputSequence });
        }
      } finally {
        if (disconnectInFlight === operation) disconnectInFlight = undefined;
      }
    })();
    disconnectInFlight = operation;
    return operation;
  };

  const connect = () => {
    if (connectInFlight) return connectInFlight;
    let operation: Promise<void> | undefined;
    operation = (async () => {
      if (disposed) throw new BrainstemSimulationError('config');
      if (disconnectInFlight) await disconnectInFlight;
      if (disposed) throw new BrainstemSimulationError('config');
      if (snapshot.phase === 'stopping') return;
      if (snapshot.phase === 'ready') return;
      const requestGeneration = ++generation;
      intent = { drive: ZERO_STICK, turn: ZERO_STICK };
      inputSequence = 0;
      lastGrpcSequence = 0;
      connectAbort = new AbortController();
      publish({ phase: 'connecting', lastAcknowledgedVelocity: ZERO_VECTOR });
      let acquired: Session | undefined;
      let openedChannel: BrainstemSimulationInputChannel | undefined;
      try {
        acquired = validateSession(await requestJson({
          fetchImpl, timers, method: 'POST', timeoutMs: connectTimeoutMs,
          url: `${origin}/api/v1/simulation/sessions`, body: { clientId: options.clientId },
          signal: connectAbort.signal,
        }));
        if (disposed || generation !== requestGeneration) {
          await releaseSession(acquired);
          return;
        }
        if (options.createInputChannel) {
          openedChannel = await withDeadline(options.createInputChannel({
            origin,
            sessionId: acquired.sessionId,
            signal: connectAbort.signal,
            connectTimeoutMs,
            inputTimeoutMs,
            timers,
          }), connectTimeoutMs, () => {
            connectAbort?.abort();
            openedChannel?.close();
          });
          if (disposed || generation !== requestGeneration) {
            await releaseSession(acquired, connectTimeoutMs, openedChannel);
            return;
          }
        }
        session = acquired;
        inputChannel = openedChannel;
        connectAbort = undefined;
        publish({ phase: 'ready', sessionId: acquired.sessionId, lastAcknowledgedVelocity: ZERO_VECTOR });
        scheduleHeartbeat();
      } catch (error) {
        if (disposed || generation !== requestGeneration) {
          if (acquired) await releaseSession(acquired, connectTimeoutMs, openedChannel);
          return;
        }
        if (openedChannel) openedChannel.close();
        if (acquired) {
          try { await releaseSession(acquired); }
          catch (cleanupError) { error = cleanupError; }
        }
        await enterError(error, undefined, undefined);
      }
    })();
    connectInFlight = operation;
    void operation.finally(() => {
      if (connectInFlight === operation) connectInFlight = undefined;
    }).catch(() => undefined);
    return operation;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    connect,
    setDrive(input) { setIntent('drive', input); },
    setTurn(input) { setIntent('turn', input); },
    async stop() {
      intent = { drive: ZERO_STICK, turn: ZERO_STICK };
      if (!session || snapshot.phase !== 'ready') return;
      sendQueued = true;
      await sendLatest();
    },
    disconnect,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await disconnect();
      listeners.clear();
    },
  };
}
