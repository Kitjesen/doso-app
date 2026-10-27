import {
  BrainstemSimulationError,
  type BrainstemSimulationInputChannel,
  type BrainstemSimulationInputChannelFactory,
  type BrainstemSimulationTimers,
  type BrainstemSimulationVector,
} from './brainstemSimulation';

type WebSocketMessageEvent = { data?: unknown };
type WebSocketCloseEvent = { wasClean?: boolean };
type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: WebSocketMessageEvent) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
  addEventListener(type: 'close', listener: (event: WebSocketCloseEvent) => void): void;
  removeEventListener(type: 'open', listener: () => void): void;
  removeEventListener(type: 'message', listener: (event: WebSocketMessageEvent) => void): void;
  removeEventListener(type: 'error', listener: () => void): void;
  removeEventListener(type: 'close', listener: (event: WebSocketCloseEvent) => void): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;
type Pending = {
  kind: 'input-ack' | 'release-ack';
  inputSequence?: number;
  resolve(value: unknown): void;
  reject(error: BrainstemSimulationError): void;
  timer: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES = 16_384;
const OPEN = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function utf8Bytes(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function parsedMessage(data: unknown) {
  if (typeof data !== 'string' || utf8Bytes(data) > MAX_RESPONSE_BYTES) {
    throw new BrainstemSimulationError('invalid_response');
  }
  try { return JSON.parse(data) as unknown; }
  catch { throw new BrainstemSimulationError('invalid_response'); }
}

function validReady(value: unknown, sessionId: string) {
  return isRecord(value) && value.kind === 'stream-ready' && value.schemaVersion === 1
    && value.simulationOnly === true && value.sessionId === sessionId;
}

function validVelocity(value: BrainstemSimulationVector) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

export function createBrainstemSimulationStreamChannelFactory(options: {
  WebSocketImpl?: WebSocketConstructor;
} = {}): BrainstemSimulationInputChannelFactory {
  const WebSocketImpl = options.WebSocketImpl ?? (globalThis.WebSocket as unknown as WebSocketConstructor | undefined);
  return async ({ origin, sessionId, signal, connectTimeoutMs, inputTimeoutMs, timers }) => {
    if (!WebSocketImpl || origin !== 'http://127.0.0.1:8122' || !UUID.test(sessionId)) {
      throw new BrainstemSimulationError('config');
    }
    let socket: WebSocketLike;
    try {
      socket = new WebSocketImpl(
        `ws://127.0.0.1:8122/api/v1/simulation/sessions/${sessionId}/stream`,
      );
    } catch {
      throw new BrainstemSimulationError('unavailable');
    }
    let closed = false;
    let ready = false;
    let pending: Pending | undefined;
    let cancelledInputSequence: number | undefined;
    let readyTimer: unknown;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: BrainstemSimulationError) => void) | undefined;

    const closeSocket = () => {
      if (closed) return;
      closed = true;
      if (readyTimer !== undefined) timers.clearTimeout(readyTimer);
      readyTimer = undefined;
      if (pending) {
        timers.clearTimeout(pending.timer);
        const current = pending;
        pending = undefined;
        current.reject(new BrainstemSimulationError('unavailable'));
      }
      try { socket.close(1000, 'client-stop'); } catch { /* already closed */ }
    };
    const fail = (error: BrainstemSimulationError) => {
      if (!ready && rejectReady) rejectReady(error);
      else if (pending) {
        timers.clearTimeout(pending.timer);
        const current = pending;
        pending = undefined;
        current.reject(error);
      }
      closeSocket();
    };
    const onOpen = () => undefined;
    const onMessage = (event: WebSocketMessageEvent) => {
      let value: unknown;
      try { value = parsedMessage(event.data); }
      catch (error) {
        fail(error instanceof BrainstemSimulationError ? error : new BrainstemSimulationError('invalid_response'));
        return;
      }
      if (!ready) {
        if (socket.readyState !== OPEN || !validReady(value, sessionId)) {
          fail(new BrainstemSimulationError('invalid_response'));
          return;
        }
        ready = true;
        if (readyTimer !== undefined) timers.clearTimeout(readyTimer);
        readyTimer = undefined;
        resolveReady?.();
        return;
      }
      if (pending?.kind === 'release-ack' && isRecord(value) && value.kind === 'input-ack'
        && value.inputSequence === cancelledInputSequence) {
        cancelledInputSequence = undefined;
        return;
      }
      if (!pending || !isRecord(value) || value.kind !== pending.kind) {
        fail(new BrainstemSimulationError('invalid_response'));
        return;
      }
      timers.clearTimeout(pending.timer);
      const current = pending;
      pending = undefined;
      current.resolve(value);
    };
    const onError = () => fail(new BrainstemSimulationError('unavailable'));
    const onClose = (_event: WebSocketCloseEvent) => {
      if (closed) return;
      closed = true;
      if (!ready && rejectReady) rejectReady(new BrainstemSimulationError('unavailable'));
      if (pending) {
        timers.clearTimeout(pending.timer);
        const current = pending;
        pending = undefined;
        current.reject(new BrainstemSimulationError('unavailable'));
      }
    };
    const onAbort = () => fail(new BrainstemSimulationError('unavailable'));

    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
        readyTimer = timers.setTimeout(() => {
          reject(new BrainstemSimulationError('timeout'));
          closeSocket();
        }, connectTimeoutMs);
        if (signal.aborted) onAbort();
      });
    } catch (error) {
      closeSocket();
      throw error instanceof BrainstemSimulationError ? error : new BrainstemSimulationError('unavailable');
    } finally {
      resolveReady = undefined;
      rejectReady = undefined;
      signal.removeEventListener('abort', onAbort);
    }

    const request = (kind: Pending['kind'], frame: unknown, inputSequence?: number) => {
      if (closed || !ready || socket.readyState !== OPEN) {
        return Promise.reject(new BrainstemSimulationError('unavailable'));
      }
      if (pending) {
        closeSocket();
        return Promise.reject(new BrainstemSimulationError('invalid_response'));
      }
      return new Promise<unknown>((resolve, reject) => {
        const timer = timers.setTimeout(() => {
          if (!pending) return;
          pending = undefined;
          reject(new BrainstemSimulationError('timeout'));
          closeSocket();
        }, inputTimeoutMs);
        pending = { kind, inputSequence, resolve, reject, timer };
        try { socket.send(JSON.stringify(frame)); }
        catch {
          timers.clearTimeout(timer);
          pending = undefined;
          reject(new BrainstemSimulationError('unavailable'));
          closeSocket();
        }
      });
    };

    const channel: BrainstemSimulationInputChannel = {
      sendInput({ inputSequence, velocity }) {
        if (!Number.isSafeInteger(inputSequence) || inputSequence <= 0 || !validVelocity(velocity)) {
          closeSocket();
          return Promise.reject(new BrainstemSimulationError('invalid_input'));
        }
        return request('input-ack', { kind: 'input', inputSequence, velocity }, inputSequence);
      },
      release() {
        if (pending?.kind === 'input-ack') {
          timers.clearTimeout(pending.timer);
          const current = pending;
          pending = undefined;
          cancelledInputSequence = current.inputSequence;
          current.reject(new BrainstemSimulationError('unavailable'));
        }
        return request('release-ack', { kind: 'release' });
      },
      close: closeSocket,
    };
    return channel;
  };
}
