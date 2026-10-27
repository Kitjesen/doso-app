export type AppleDisplayRecoveryCandidate = {
  displayName: string;
  subject: string | null;
  requiresDurableClear: boolean;
};

export type AppleDisplayRecoveryProbe =
  | { status: 'pending'; candidate: AppleDisplayRecoveryCandidate }
  | { status: 'none' }
  | { status: 'error' };

export async function probeAppleDisplayRecovery(
  memoryDisplayName: string | null,
  subject: string | null,
  readDurableDisplayName: () => Promise<string | null>,
): Promise<AppleDisplayRecoveryProbe> {
  try {
    const durableDisplayName = await readDurableDisplayName();
    const displayName = memoryDisplayName ?? durableDisplayName;
    return displayName ? {
      status: 'pending',
      candidate: {
        displayName,
        subject,
        requiresDurableClear: Boolean(durableDisplayName),
      },
    } : { status: 'none' };
  } catch {
    return memoryDisplayName ? {
      status: 'pending',
      candidate: {
        displayName: memoryDisplayName,
        subject,
        requiresDurableClear: false,
      },
    } : { status: 'error' };
  }
}

export async function consumeAppleDisplayRecovery(
  candidate: Pick<AppleDisplayRecoveryCandidate, 'subject' | 'requiresDurableClear'>,
  clearDurableDisplayName: (subject: string | null) => Promise<void>,
) {
  if (candidate.requiresDurableClear) {
    await clearDurableDisplayName(candidate.subject);
    return;
  }
  await clearDurableDisplayName(candidate.subject).catch(() => undefined);
}

export type AppleDisplayRecoveryOperation = {
  generation: number;
  userId: string;
  readyKey: string;
};

export function createAppleDisplayRecoveryOperationTracker() {
  let generation = 0;
  return {
    begin(userId: string, readyKey: string): AppleDisplayRecoveryOperation {
      generation += 1;
      return { generation, userId, readyKey };
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(operation: AppleDisplayRecoveryOperation) {
      return operation.generation === generation;
    },
  };
}

export async function runAppleDisplayRecoveryConfirmation<T>({
  update,
  consume,
  refresh,
  resume,
  notify,
  isCurrent,
}: {
  update: () => Promise<T>;
  consume: () => Promise<void>;
  refresh: () => Promise<unknown>;
  resume: () => void;
  notify: (result: T) => void;
  isCurrent: () => boolean;
}) {
  const result = await update();
  if (!isCurrent()) return false;
  await consume();
  if (!isCurrent()) return false;
  await refresh();
  if (!isCurrent()) return false;
  resume();
  if (!isCurrent()) return false;
  notify(result);
  return true;
}
