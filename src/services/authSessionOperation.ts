/** Same-JS-runtime exclusion only. Raw SDK calls and other runtimes bypass it. */
export class AuthSessionOperationBusyError extends Error {
  constructor() {
    super('正在处理登录会话，请等待当前操作完成后再试。');
    this.name = 'AuthSessionOperationBusyError';
  }
}

export function isAuthSessionOperationBusyError(error: unknown): error is AuthSessionOperationBusyError {
  return error instanceof AuthSessionOperationBusyError;
}

export type AuthSessionOperationLease = {
  /** Keep exclusion until the actual SDK operation settles, even if its caller times out. */
  retain<T>(operation: () => PromiseLike<T>): Promise<T>;
};

/** Observer intent only, not an authorization capability or SDK cancellation. */
export type AuthSessionOperationKind = 'session-write' | 'session-read' | 'factor-write';

let activeOperation: object | null = null;
let activeObserverOwner: object | null = null;
let activeOperationKind: AuthSessionOperationKind | null = null;
let revision = 0;
const observers = new Set<() => void>();

export function getAuthSessionOperationSnapshot() {
  return { busy: activeOperation !== null, revision, owner: activeObserverOwner, kind: activeOperationKind } as const;
}

export function subscribeAuthSessionOperations(observer: () => void) {
  observers.add(observer);
  return () => { observers.delete(observer); };
}

function publishOperationChange() {
  revision++;
  // Observers only invalidate/schedule work; never await SDK calls here.
  for (const observer of [...observers]) {
    try { observer(); } catch { /* A consumer cannot release or strand another owner's lease. */ }
  }
}

export async function runAuthSessionOperation<T>(
  operation: (lease: AuthSessionOperationLease) => PromiseLike<T>,
  options?: { observerOwner?: object; kind?: AuthSessionOperationKind },
): Promise<T> {
  // Acquire synchronously before any await. Do not queue credentials or auto-retry.
  if (activeOperation) throw new AuthSessionOperationBusyError();
  const owner = {};
  activeOperation = owner;
  activeObserverOwner = options?.observerOwner ?? null;
  activeOperationKind = options?.kind ?? 'session-write';
  publishOperationChange();
  let finished = false;
  let pending = 0;
  const releaseIfSettled = () => {
    if (finished && pending === 0 && activeOperation === owner) {
      activeOperation = null;
      activeObserverOwner = null;
      activeOperationKind = null;
      publishOperationChange();
    }
  };
  const lease: AuthSessionOperationLease = {
    async retain(start) {
      if (finished) throw new AuthSessionOperationBusyError();
      pending++;
      try {
        return await start();
      } finally {
        pending--;
        releaseIfSettled();
      }
    },
  };
  try {
    return await operation(lease);
  } finally {
    finished = true;
    releaseIfSettled();
  }
}
