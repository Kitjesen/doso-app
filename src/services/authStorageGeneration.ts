type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Serialize storage commits and fence retired SDK clients after an explicit local exit. */
export function createAuthStorageGeneration(storage: Storage) {
  let generation = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const observedWrites = new Set<string>();
  // Matches the installed auth-js validatePKCEFlowId contract (generated IDs
  // are 32 hex chars, but URL/index validation supports this wider safe set).
  const validFlowId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };
  return {
    forCurrentClient(): Storage {
      const owner = generation;
      return {
        getItem: key => enqueue(() => owner === generation ? storage.getItem(key) : Promise.resolve(null)),
        setItem: (key, value) => {
          if (owner === generation) observedWrites.add(key);
          return enqueue(() => owner === generation ? storage.setItem(key, value) : Promise.resolve());
        },
        removeItem: key => enqueue(() => owner === generation ? storage.removeItem(key) : Promise.resolve()),
      };
    },
    clear(storageKey: string) {
      generation++;
      return enqueue(async () => {
        const indexKey = `${storageKey}-flows-code-verifier`;
        const storedIndex = await storage.getItem(indexKey);
        let index: unknown;
        try { index = storedIndex === null ? [] : JSON.parse(storedIndex); } catch { index = []; }
        const flowIds = new Set(Array.isArray(index) ? index.filter(validFlowId) : []);
        const slotPrefix = `${storageKey}-flow-`;
        const slotSuffix = '-code-verifier';
        // A retired SDK may have entered a slot write before it wrote the
        // index. Remember only key names so that this same-runtime orphan is
        // included without enumerating unrelated secure storage.
        for (const key of observedWrites) {
          if (!key.startsWith(slotPrefix) || !key.endsWith(slotSuffix)) continue;
          const id = key.slice(slotPrefix.length, -slotSuffix.length);
          if (validFlowId(id)) flowIds.add(id);
        }
        // Persist any entered-but-not-indexed slots before deleting them, so
        // an interrupted/failed cleanup can discover those slots on restart.
        if (flowIds.size > 0) await storage.setItem(indexKey, JSON.stringify([...flowIds]));
        const keys = [...flowIds].map(id => `${slotPrefix}${id}${slotSuffix}`);
        keys.push(storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`);
        for (const key of keys) await storage.removeItem(key);
        // Preserve the index until all deletions succeed so a failure remains
        // retryable across process restarts as well as within this runtime.
        await storage.removeItem(indexKey);
        for (const key of keys) observedWrites.delete(key);
      });
    },
  };
}
