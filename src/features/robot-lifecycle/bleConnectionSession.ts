export type BleConnectionPhase = 'idle' | 'preparing' | 'connecting' | 'discovering' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
export type BleConnectionErrorCode = 'unsupported' | 'busy' | 'invalid_target' | 'preparation_failed' | 'connect_failed' | 'discovery_failed' | 'timeout' | 'cancelled' | 'disconnected' | 'cleanup_unconfirmed';
export class BleConnectionError extends Error {
  constructor(readonly code: BleConnectionErrorCode) { super(code); this.name = 'BleConnectionError'; }
}
export type BleConnectionSnapshot = Readonly<{
  phase: BleConnectionPhase;
  peripheralId: string | null;
  serviceCount: number;
  characteristicCount: number;
  identityVerified: false;
  bound: false;
  wifiConfigured: false;
  cleanupConfirmed: boolean;
  errorCode?: BleConnectionErrorCode;
}>;
export type BleServiceInfo = { id: string; services?: readonly { uuid: string }[]; characteristics?: readonly { service: string; characteristic: string }[] };
export type BleConnectionRuntime = {
  prepare(): Promise<void>;
  connect(id: string): Promise<void>;
  retrieveServices(id: string): Promise<BleServiceInfo>;
  // Resolve only after native disconnect evidence, never merely a request ack.
  disconnect(id: string, signal: AbortSignal): Promise<void>;
  onDisconnect(listener: (event: { id: string; confirmed: boolean }) => void): { remove(): void };
};
export type BleConnectionAdapter = {
  readonly supported: boolean;
  getSnapshot(): BleConnectionSnapshot;
  subscribe(listener: (state: BleConnectionSnapshot) => void): () => void;
  connect(id: string, onState: (state: BleConnectionSnapshot) => void): Promise<BleConnectionSnapshot>;
  disconnect(): Promise<void>;
};
export const INITIAL_BLE_CONNECTION_STATE: BleConnectionSnapshot = Object.freeze({ phase: 'idle', peripheralId: null,
  serviceCount: 0, characteristicCount: 0, identityVerified: false, bound: false, wifiConfigured: false, cleanupConfirmed: true });
type ConnectionClock = { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
type Owner = {
  id: string; onState: (state: BleConnectionSnapshot) => void;
  ended: boolean; nativeStarted: boolean; nativePending: boolean; lateCleanup: boolean;
  cleanupOk: boolean; listenerCleanupOk: boolean; cleanup: Promise<boolean> | null; listener?: { remove(): void }; timer?: unknown;
  terminal: 'error' | 'disconnected'; errorCode?: BleConnectionErrorCode;
  resolve(value: BleConnectionSnapshot): void; reject(error: BleConnectionError): void;
};
export function createBleConnectionSession(runtime: BleConnectionRuntime, options: {
  clock?: ConnectionClock; timeoutMs?: number; cleanupTimeoutMs?: number;
} = {}): BleConnectionAdapter {
  const clock: ConnectionClock = options.clock ?? { setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) };
  const timeoutMs = options.timeoutMs ?? 12000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 3000;
  if (![timeoutMs, cleanupTimeoutMs].every(ms => Number.isFinite(ms) && ms > 0 && ms <= 30000)) throw new BleConnectionError('invalid_target');
  let active: Owner | null = null;
  let latest = INITIAL_BLE_CONNECTION_STATE;
  const subscribers = new Set<(state: BleConnectionSnapshot) => void>();
  const publish = (owner: Owner, phase: BleConnectionPhase, services = 0, characteristics = 0) => {
    const snapshot: BleConnectionSnapshot = { phase, peripheralId: owner.id, serviceCount: services,
      characteristicCount: characteristics, identityVerified: false, bound: false, wifiConfigured: false,
      cleanupConfirmed: owner.ended && owner.cleanupOk && !owner.nativePending && !owner.lateCleanup,
      ...(owner.errorCode ? { errorCode: owner.errorCode } : {}) };
    if (active && active !== owner) return snapshot;
    latest = snapshot;
    try { owner.onState(snapshot); } catch { /* UI observers do not own native cleanup. */ }
    for (const listener of subscribers) {
      try { listener(snapshot); } catch { /* Observers cannot interrupt native cleanup. */ }
    }
    return snapshot;
  };
  const detach = (owner: Owner) => {
    if (owner.timer !== undefined) clock.clearTimeout(owner.timer);
    owner.timer = undefined;
    try { owner.listener?.remove(); } catch { owner.listenerCleanupOk = false; }
    owner.listener = undefined;
  };
  const release = (owner: Owner) => {
    if (active === owner && owner.ended && owner.cleanupOk && !owner.nativePending && !owner.lateCleanup) active = null;
  };
  const cleanup = (owner: Owner): Promise<boolean> => {
    if (owner.cleanup) return owner.cleanup;
    owner.cleanup = (async () => {
      let timer: unknown;
      const abort = new AbortController();
      const ok = !owner.nativeStarted || await Promise.race([
        Promise.resolve().then(() => runtime.disconnect(owner.id, abort.signal)).then(() => true, () => false),
        new Promise<false>(resolve => { timer = clock.setTimeout(() => resolve(false), cleanupTimeoutMs); }),
      ]).finally(() => { abort.abort(); if (timer !== undefined) clock.clearTimeout(timer); });
      owner.cleanupOk = ok && owner.listenerCleanupOk;
      if (!owner.cleanupOk) owner.errorCode = 'cleanup_unconfirmed';
      release(owner);
      return ok;
    })();
    return owner.cleanup;
  };
  const stop = async (owner: Owner, code: BleConnectionErrorCode, terminal: Owner['terminal']) => {
    if (!owner.ended) {
      owner.ended = true; owner.errorCode = code; owner.terminal = terminal;
      detach(owner);
      owner.reject(new BleConnectionError(code));
      publish(owner, terminal === 'disconnected' ? 'disconnecting' : 'error');
    }
    await cleanup(owner);
    publish(owner, owner.cleanupOk ? owner.terminal : 'error');
  };
  const run = async (owner: Owner) => {
    let phase: BleConnectionErrorCode = 'preparation_failed';
    try {
      if (owner.ended) return;
      await runtime.prepare();
      if (owner.ended) return;
      owner.listener = runtime.onDisconnect(event => {
        if (event.id !== owner.id || owner.ended) return;
        owner.ended = true;
        detach(owner);
        owner.cleanupOk = event.confirmed === true && owner.listenerCleanupOk;
        owner.terminal = owner.cleanupOk ? 'disconnected' : 'error';
        owner.errorCode = owner.cleanupOk ? 'disconnected' : 'cleanup_unconfirmed';
        owner.cleanup = Promise.resolve(owner.cleanupOk);
        owner.reject(new BleConnectionError(owner.errorCode));
        release(owner);
        publish(owner, owner.terminal);
      });
      publish(owner, 'connecting');
      phase = 'connect_failed';
      owner.nativeStarted = true; owner.nativePending = true;
      try { await runtime.connect(owner.id); }
      catch (error) {
        owner.nativePending = false;
        if (owner.ended) { await owner.cleanup; release(owner); publish(owner, owner.terminal); return; }
        throw error;
      }
      owner.nativePending = false;
      if (owner.ended) {
        // A cancelled iOS connect can settle late. Keep this owner quarantined
        // until a second disconnect closes that late connection; no new lease
        // may start and then be disconnected by an old callback.
        owner.lateCleanup = true;
        await owner.cleanup;
        owner.cleanup = null;
        await cleanup(owner);
        owner.lateCleanup = false;
        release(owner);
        publish(owner, owner.cleanupOk ? owner.terminal : 'error');
        return;
      }
      publish(owner, 'discovering');
      phase = 'discovery_failed';
      const info = await runtime.retrieveServices(owner.id);
      if (owner.ended) return;
      if (info.id !== owner.id || (info.services !== undefined && !Array.isArray(info.services))
        || (info.characteristics !== undefined && !Array.isArray(info.characteristics))) throw new BleConnectionError('discovery_failed');
      if (owner.timer !== undefined) clock.clearTimeout(owner.timer);
      owner.timer = undefined;
      owner.resolve(publish(owner, 'connected', info.services?.length ?? 0, info.characteristics?.length ?? 0));
    } catch {
      if (!owner.ended) await stop(owner, phase, 'error');
    }
  };
  return {
    supported: true,
    getSnapshot: () => latest,
    subscribe(listener) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    connect(id, onState) {
      if (active) return Promise.reject(new BleConnectionError('busy'));
      if (typeof id !== 'string' || !id.length || id.length > 200 || /[\x00-\x20\x7f]/.test(id)) return Promise.reject(new BleConnectionError('invalid_target'));
      return new Promise((resolve, reject) => {
        const owner: Owner = { id, onState, ended: false, nativeStarted: false, nativePending: false, lateCleanup: false,
          cleanupOk: false, listenerCleanupOk: true, cleanup: null, terminal: 'error', resolve, reject };
        active = owner;
        owner.timer = clock.setTimeout(() => { void stop(owner, 'timeout', 'error'); }, timeoutMs);
        publish(owner, 'preparing');
        void run(owner);
      });
    },
    async disconnect() {
      const owner = active;
      if (!owner) return;
      await stop(owner, 'cancelled', 'disconnected');
    },
  };
}
