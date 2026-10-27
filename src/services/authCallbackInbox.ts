import { getAuthSessionOperationSnapshot, subscribeAuthSessionOperations } from './authSessionOperation';

type CallbackTask = {
  key: string | null;
  run: (isCurrent: () => boolean) => Promise<void>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export class AuthCallbackCancelledError extends Error {
  constructor() {
    super('认证链接处理已取消。');
    this.name = 'AuthCallbackCancelledError';
  }
}

/** Bounded memory-only intent, not an SDK retry queue or persistent link store. */
export function createAuthCallbackInbox(canRun: () => boolean) {
  let pending: CallbackTask | null = null;
  let active: CallbackTask | null = null;
  let connected = false;
  let connection = 0;
  let generation = 0;
  let scheduled = false;
  let unsubscribe: (() => void) | null = null;
  let identityKnown = false;
  let identity: string | null = null;
  let expectedIdentity: { key: string; generation: number } | null = null;

  const discardPending = () => {
    const discarded = pending;
    pending = null;
    discarded?.reject(new AuthCallbackCancelledError());
  };
  const invalidate = () => {
    generation++;
    expectedIdentity = null;
    discardPending();
  };
  const resume = () => {
    if (!connected || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!connected || active || !pending || !canRun() || getAuthSessionOperationSnapshot().busy) return;
      const task = pending;
      pending = null;
      active = task;
      const currentGeneration = generation;
      const isCurrent = () => connected && generation === currentGeneration;
      // There is no await between the current gate check and invoking the task.
      // Its service acquires the existing operation lease synchronously.
      void (async () => {
        try {
          await task.run(isCurrent);
          if (!isCurrent()) throw new AuthCallbackCancelledError();
          task.resolve();
        }
        catch (error) { task.reject(error); }
        finally { if (active === task) active = null; resume(); }
      })();
    });
  };
  return {
    resume,
    invalidate,
    reconcileIdentity(key: string | null, restoring: boolean) {
      if (!identityKnown) {
        if (key === null && restoring) return;
        identityKnown = true;
        identity = key;
        expectedIdentity = null;
        return;
      }
      if (identity === key) return;
      identity = key;
      if (key !== null && expectedIdentity?.key === key && expectedIdentity.generation === generation) {
        expectedIdentity = null;
        discardPending();
      } else invalidate();
    },
    acceptExchangeIdentity(key: string | null) {
      if (!active || !connected || !key || key === identity) return;
      expectedIdentity = { key, generation };
      discardPending();
    },
    enqueue(key: string | null, run: CallbackTask['run']) {
      if (!connected) return Promise.reject(new AuthCallbackCancelledError());
      if (key !== null && active?.key === key) return active.promise;
      if (key !== null && pending?.key === key) return pending.promise;
      if (pending) return Promise.reject(new Error('已有认证链接等待处理，请稍后重新打开链接。'));
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      pending = { key, run, promise, resolve, reject };
      resume();
      return promise;
    },
    connect() {
      unsubscribe?.();
      connected = true;
      const currentConnection = ++connection;
      unsubscribe = subscribeAuthSessionOperations(resume);
      resume();
      return () => {
        if (currentConnection !== connection) return;
        connected = false;
        unsubscribe?.();
        unsubscribe = null;
        // React effect replay reconnects synchronously. A real unmount retires
        // the generation before the next turn, without cancelling an SDK call.
        queueMicrotask(() => {
          if (!connected && currentConnection === connection) invalidate();
        });
      };
    },
  };
}
