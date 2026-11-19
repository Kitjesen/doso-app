import { validateBrainstemEndpoint, type BrainstemGrpcEndpoint } from '../../services/brainstemGrpc';

export type RememberedBrainstemConnection = Readonly<{ endpoint: BrainstemGrpcEndpoint; principal: string }>;
type Storage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Restored preferences select a target; they carry no device observation or motion authority. */
export function normalizeRememberedBrainstemConnection(value: unknown): RememberedBrainstemConnection | null {
  if (!record(value) || !exact(value, ['endpoint', 'principal']) || !record(value.endpoint)
    || typeof value.principal !== 'string') return null;
  const e = value.endpoint, lan = e.transport === 'lan-dev';
  if (e.transport !== 'tls' && !lan || !exact(e, lan ? ['host', 'port', 'transport']
    : ['host', 'port', 'transport', 'clientIdentityAlias']) || typeof e.host !== 'string'
    || typeof e.port !== 'number' || !Number.isSafeInteger(e.port)) return null;
  if (lan ? value.principal !== '' : typeof e.clientIdentityAlias !== 'string'
    || e.clientIdentityAlias.length < 1 || e.clientIdentityAlias.length > 512
    || e.clientIdentityAlias.trim() !== e.clientIdentityAlias || /[\x00-\x1f\x7f]/.test(e.clientIdentityAlias)
    || value.principal.length > 128 || !/^[a-z][a-z0-9-]*@[a-z][a-z0-9-]*$/.test(value.principal)) return null;
  try {
    const transport = lan ? 'lan-dev' as const : 'tls' as const;
    const alias = lan ? undefined : e.clientIdentityAlias as string;
    const checked = validateBrainstemEndpoint(e.host, e.port, transport, alias);
    return { endpoint: { ...checked, transport, ...(alias === undefined ? {} : { clientIdentityAlias: alias }) },
      principal: value.principal };
  } catch { return null; }
}

function storageKey(ownerKey: string) {
  if (!ownerKey || ownerKey.length > 160) throw new Error('Invalid connection owner');
  // SecureStore keys exclude separators used by account scopes; encode without collisions.
  return 'doso.control.connection.v1.' + Array.from(ownerKey, char => char.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
}

export function createRememberedBrainstemConnectionStore(storage: Storage) {
  let writes: Promise<void> = Promise.resolve();
  const write = (work: () => Promise<void>) => {
    const result = writes.catch(() => undefined).then(work);
    writes = result;
    return result;
  };
  return {
    async load(ownerKey: string): Promise<RememberedBrainstemConnection | null> {
      try {
        const key = storageKey(ownerKey);
        await writes.catch(() => undefined);
        const text = await storage.getItem(key);
        if (!text || text.length > 2048) return null;
        const parsed: unknown = JSON.parse(text);
        if (!record(parsed) || parsed.version !== 1 || !exact(parsed, ['version', 'endpoint', 'principal'])) return null;
        return normalizeRememberedBrainstemConnection({ endpoint: parsed.endpoint, principal: parsed.principal });
      } catch { return null; }
    },
    async save(ownerKey: string, connection: RememberedBrainstemConnection): Promise<void> {
      const checked = normalizeRememberedBrainstemConnection(connection);
      if (!checked) return Promise.reject(new Error('Invalid remembered connection'));
      const key = storageKey(ownerKey);
      return write(() => storage.setItem(key, JSON.stringify({ version: 1, ...checked })));
    },
    async forget(ownerKey: string): Promise<void> {
      const key = storageKey(ownerKey);
      return write(() => storage.removeItem(key));
    },
  };
}

export const rememberedBrainstemConnectionStore = createRememberedBrainstemConnectionStore({
  async getItem(key) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') return (await import('expo-secure-store')).getItemAsync(key);
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  async setItem(key, value) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') {
      const store = await import('expo-secure-store');
      return store.setItemAsync(key, value, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
    if (typeof localStorage === 'undefined') throw new Error('Storage unavailable');
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') return (await import('expo-secure-store')).deleteItemAsync(key);
    if (typeof localStorage === 'undefined') throw new Error('Storage unavailable');
    localStorage.removeItem(key);
  },
});
