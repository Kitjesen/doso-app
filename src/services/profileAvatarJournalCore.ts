export type AvatarJournalEntry = {
  version: 1;
  ownerId: string;
  operationId: string;
  candidatePath: string | null;
  previousPath: string | null;
  phase: 'prepared' | 'uncertain' | 'committed' | 'rolled-back';
};

export type AvatarJournalStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Must serialize all clients of this store, not only one journal instance.
  runExclusive<T>(key: string, work: () => Promise<T>): Promise<T>;
};

export class AvatarJournalError extends Error {
  constructor(message = '无法可靠读取或保存上次头像操作记录，未开始新的头像操作。') {
    super(message);
    this.name = 'AvatarJournalError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FIELDS = 'candidatePath,operationId,ownerId,phase,previousPath,version';
export const AVATAR_JOURNAL_MAX_BYTES = 1024;

function journalKey(ownerId: string) {
  if (typeof ownerId !== 'string' || !UUID.test(ownerId)) throw new AvatarJournalError();
  return `doso.avatar-journal.v1.${ownerId}`;
}

function parseEntry(raw: string, ownerId: string): AvatarJournalEntry {
  if (raw.length > AVATAR_JOURNAL_MAX_BYTES) throw new AvatarJournalError();
  const entry = JSON.parse(raw) as AvatarJournalEntry;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)
    || Object.keys(entry).sort().join(',') !== FIELDS
    || entry.version !== 1 || entry.ownerId !== ownerId
    || typeof entry.operationId !== 'string' || !UUID.test(entry.operationId)
    || !['prepared', 'uncertain', 'committed', 'rolled-back'].includes(entry.phase)) throw new AvatarJournalError();
  for (const value of [entry.candidatePath, entry.previousPath]) {
    if (value === null) continue;
    if (typeof value !== 'string' || !value.startsWith(`${ownerId}/`)) throw new AvatarJournalError();
    const name = value.slice(ownerId.length + 1);
    if (!/\.(jpg|png)$/.test(name) || !UUID.test(name.slice(0, -4))) throw new AvatarJournalError();
  }
  if (entry.candidatePath === entry.previousPath) throw new AvatarJournalError();
  return entry;
}

export type AvatarJournalDecision =
  | { kind: 'wait' }
  | { kind: 'confirmed'; phase: 'committed' | 'rolled-back'; cleanupPath: string | null };

// Pure advice only: the caller must supply a fresh, authenticated profile read,
// durably mark any confirmed phase, and recheck ownership/currentness at DELETE.
// A non-current candidate is NOT proof that an uncertain RPC rolled back.
export function planAvatarJournalResume(input: AvatarJournalEntry, currentAvatarValue: unknown): AvatarJournalDecision {
  let entry: AvatarJournalEntry;
  try {
    const ownerId = input?.ownerId;
    journalKey(ownerId);
    entry = parseEntry(JSON.stringify(input), ownerId);
  } catch {
    throw new AvatarJournalError();
  }
  if (currentAvatarValue !== null && typeof currentAvatarValue !== 'string') return { kind: 'wait' };
  const value = (path: string | null) => path === null ? null : `profile-avatars/${path}`;
  // Prepared is cancelled atomically, never interpreted as a server outcome.
  if (entry.phase === 'prepared') return { kind: 'wait' };
  if (entry.phase === 'uncertain') {
    return entry.candidatePath !== null && currentAvatarValue === value(entry.candidatePath)
      ? { kind: 'confirmed', phase: 'committed', cleanupPath: entry.previousPath }
      : { kind: 'wait' };
  }
  if (entry.phase === 'rolled-back') {
    return { kind: 'confirmed', phase: 'rolled-back', cleanupPath: currentAvatarValue === value(entry.candidatePath) ? null : entry.candidatePath };
  }
  if (currentAvatarValue === value(entry.candidatePath)) {
    return { kind: 'confirmed', phase: 'committed', cleanupPath: entry.previousPath };
  }
  if (entry.previousPath !== null && currentAvatarValue === value(entry.previousPath)) {
    return { kind: 'confirmed', phase: 'committed', cleanupPath: entry.candidatePath };
  }
  return { kind: 'wait' };
}

export type AvatarJournalResolution = {
  phase: 'committed' | 'rolled-back';
  currentAvatarValue: string | null;
  cleanupPath: string | null;
  outcome: 'removed' | 'already-absent' | 'not-needed';
};

export function createProfileAvatarJournal(store: AvatarJournalStore) {
  async function run<T>(ownerId: string, work: (key: string) => Promise<T>): Promise<T> {
    try {
      const key = journalKey(ownerId);
      return await store.runExclusive(key, () => work(key));
    } catch (error) {
      // Never surface storage payloads, paths, platform errors or secrets.
      throw error instanceof AvatarJournalError ? error : new AvatarJournalError();
    }
  }

  async function read(key: string, ownerId: string) {
    const raw = await store.getItem(key);
    return raw === null ? null : parseEntry(raw, ownerId);
  }

  async function write(key: string, entry: AvatarJournalEntry) {
    const serialized = JSON.stringify(entry);
    await store.setItem(key, serialized);
    if (await store.getItem(key) !== serialized) throw new AvatarJournalError();
  }

  async function matching(key: string, ownerId: string, operationId: string) {
    const entry = await read(key, ownerId);
    if (!entry || entry.operationId !== operationId) throw new AvatarJournalError('头像操作记录已变化，未更新或清除该记录。');
    return entry;
  }

  function begin(ownerId: string, operationId: string, candidatePath: string | null, previousPath: string | null, phase: 'prepared' | 'uncertain') {
    return run(ownerId, async key => {
      const entry = parseEntry(JSON.stringify({ version: 1, ownerId, operationId, candidatePath, previousPath, phase }), ownerId);
      if (await read(key, ownerId)) throw new AvatarJournalError('上次头像操作仍待确认或清理，未开始新的头像操作。');
      await write(key, entry);
    });
  }

  async function removeAndConfirm(key: string) {
    await store.removeItem(key);
    if (await store.getItem(key) !== null) throw new AvatarJournalError();
  }

  return {
    read: (ownerId: string) => run(ownerId, key => read(key, ownerId)),
    // Existing v1 uncertain records remain supported. New saves use prepared.
    begin: (ownerId: string, operationId: string, candidatePath: string | null, previousPath: string | null) => begin(ownerId, operationId, candidatePath, previousPath, 'uncertain'),
    beginPrepared: (ownerId: string, operationId: string, candidatePath: string | null, previousPath: string | null) => begin(ownerId, operationId, candidatePath, previousPath, 'prepared'),
    // Network dispatch is allowed only after this transition's readback. All
    // clients must share runExclusive; SecureStore alone is not a CAS store.
    arm: (ownerId: string, operationId: string) => run(ownerId, async key => {
      const entry = await matching(key, ownerId, operationId);
      if (entry.phase !== 'prepared') throw new AvatarJournalError('头像操作已变化或已发出，未重复提交。');
      await write(key, { ...entry, phase: 'uncertain' });
    }),
    cancelPrepared: (ownerId: string, operationId: string) => run(ownerId, async key => {
      const entry = await matching(key, ownerId, operationId);
      if (entry.phase !== 'prepared') throw new AvatarJournalError('头像操作可能已经发出，不能撤销该记录。');
      await removeAndConfirm(key);
    }),
    mark: (ownerId: string, operationId: string, phase: 'committed' | 'rolled-back') => run(ownerId, async key => {
      if (!['committed', 'rolled-back'].includes(phase)) throw new AvatarJournalError();
      const entry = await matching(key, ownerId, operationId);
      if (entry.phase !== 'uncertain' && entry.phase !== phase) throw new AvatarJournalError();
      await write(key, { ...entry, phase });
    }),
    // No bare clear: the caller must supply deletion evidence and a fresh
    // POST-cleanup reference. A changed/stale target keeps the debt recorded.
    clearResolved: (ownerId: string, operationId: string, resolution: AvatarJournalResolution) => run(ownerId, async key => {
      const entry = await matching(key, ownerId, operationId);
      if (entry.phase === 'uncertain' || entry.phase === 'prepared') throw new AvatarJournalError('上次头像操作结果尚未确认，不能丢弃记录。');
      const proof = JSON.parse(JSON.stringify(resolution)) as AvatarJournalResolution;
      if (!proof || typeof proof !== 'object'
        || Object.keys(proof).sort().join(',') !== 'cleanupPath,currentAvatarValue,outcome,phase'
        || proof.phase !== entry.phase) throw new AvatarJournalError();
      const decision = planAvatarJournalResume(entry, proof.currentAvatarValue);
      const expectedOutcomes = decision.kind === 'confirmed' && decision.cleanupPath !== null
        ? ['removed', 'already-absent']
        : ['not-needed'];
      if (decision.kind !== 'confirmed' || decision.cleanupPath !== proof.cleanupPath
        || !expectedOutcomes.includes(proof.outcome)) throw new AvatarJournalError();
      await removeAndConfirm(key);
    }),
  };
}
