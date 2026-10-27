import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import type { Database } from '../types/api';
import { createAuthRequestFetch } from './authRequestFetch';
import { sanitizeAuthStorageValue } from './authStorageSanitizer';
import { createAuthStorageGeneration } from './authStorageGeneration';
import { attachNativeAuthRefresh } from './nativeAuthRefresh';

const CHUNK_BYTES = 1_500;
const MANIFEST_SUFFIX = '.__chunks';
const memoryStorage = new Map<string, string>();
const AUTH_STORAGE_SANITIZE_WRITEBACK_FAILED =
  '[DOSO auth storage] legacy provider credential cleanup could not be persisted';

type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function sanitizeStorage(storage: StorageAdapter): StorageAdapter {
  return {
    async getItem(key) {
      const storedValue = await storage.getItem(key);
      if (storedValue === null) return null;

      const sanitized = sanitizeAuthStorageValue(storedValue);
      if (sanitized.changed) {
        try {
          await storage.setItem(key, sanitized.value);
        } catch {
          // Reading the sanitized value is safer than failing session recovery
          // when a best-effort cleanup of legacy storage cannot be persisted.
          // Keep this diagnostic fixed and value-free: storage values and caught
          // errors may contain upstream provider credentials.
          console.warn(AUTH_STORAGE_SANITIZE_WRITEBACK_FAILED);
        }
      }
      return sanitized.value;
    },

    async setItem(key, value) {
      await storage.setItem(key, sanitizeAuthStorageValue(value).value);
    },

    async removeItem(key) {
      await storage.removeItem(key);
    },
  };
}

type LegacyChunkManifest = { version: 1; count: number };
type GenerationChunkManifest = { version: 2; generation: string; count: number };
type ChunkManifest = LegacyChunkManifest | GenerationChunkManifest;

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function splitForSecureStore(value: string) {
  const chunks: string[] = [];
  let chunk = '';

  for (const character of value) {
    if (chunk && byteLength(chunk + character) > CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }

  if (chunk || value.length === 0) {
    chunks.push(chunk);
  }
  return chunks;
}

function legacyChunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

function generationChunkKey(key: string, generation: string, index: number) {
  return `${key}.${generation}.${index}`;
}

function createGeneration() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseManifest(value: string | null): ChunkManifest | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { version?: unknown; generation?: unknown; count?: unknown };
    const count = parsed.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return null;
    if (parsed.version === 1) return { version: 1, count };
    return parsed.version === 2 && typeof parsed.generation === 'string' && parsed.generation.length > 0
      ? { version: 2, generation: parsed.generation, count }
      : null;
  } catch {
    return null;
  }
}

function chunkKeys(key: string, manifest: ChunkManifest) {
  return Array.from({ length: manifest.count }, (_, index) =>
    manifest.version === 1
      ? legacyChunkKey(key, index)
      : generationChunkKey(key, manifest.generation, index),
  );
}

async function deleteBestEffort(keys: string[]) {
  await Promise.allSettled(keys.map((key) => SecureStore.deleteItemAsync(key)));
}

const nativeStorage: StorageAdapter = {
  async getItem(key) {
    const manifest = parseManifest(await SecureStore.getItemAsync(`${key}${MANIFEST_SUFFIX}`));
    if (!manifest) {
      return SecureStore.getItemAsync(key);
    }

    const chunks = await Promise.all(chunkKeys(key, manifest).map((chunk) => SecureStore.getItemAsync(chunk)));
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  },

  async setItem(key, value) {
    const manifestKey = `${key}${MANIFEST_SUFFIX}`;
    const previous = parseManifest(await SecureStore.getItemAsync(manifestKey));
    const chunks = splitForSecureStore(value);
    const generation = createGeneration();
    const next: GenerationChunkManifest = { version: 2, generation, count: chunks.length };
    const nextChunkKeys = chunkKeys(key, next);

    try {
      const writes = await Promise.allSettled(
        chunks.map((chunk, index) => SecureStore.setItemAsync(nextChunkKeys[index], chunk)),
      );
      const failedWrite = writes.find((result) => result.status === 'rejected');
      if (failedWrite) throw failedWrite.reason;
      await SecureStore.setItemAsync(manifestKey, JSON.stringify(next));
    } catch (error) {
      await deleteBestEffort(nextChunkKeys);
      throw error;
    }

    await deleteBestEffort([
      key,
      ...(previous ? chunkKeys(key, previous) : []),
    ]);
  },

  async removeItem(key) {
    const manifestKey = `${key}${MANIFEST_SUFFIX}`;
    const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey));
    const deletions = await Promise.allSettled([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(manifestKey),
      ...(manifest ? chunkKeys(key, manifest).map((chunk) => SecureStore.deleteItemAsync(chunk)) : []),
    ]);
    const failedDeletion = deletions.find((result) => result.status === 'rejected');
    if (failedDeletion) throw failedDeletion.reason;
  },
};

const webStorage: StorageAdapter = {
  async getItem(key) {
    return typeof localStorage === 'undefined'
      ? (memoryStorage.get(key) ?? null)
      : localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage === 'undefined') memoryStorage.set(key, value);
    else localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (typeof localStorage === 'undefined') memoryStorage.delete(key);
    else localStorage.removeItem(key);
  },
};

const sanitizedNativeStorage = sanitizeStorage(nativeStorage);
const sanitizedWebStorage = sanitizeStorage(webStorage);
const authStorageGeneration = createAuthStorageGeneration(Platform.OS === 'web' ? sanitizedWebStorage : sanitizedNativeStorage);

const defaultUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const androidUrl = process.env.EXPO_PUBLIC_SUPABASE_URL_ANDROID?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfig = {
  url: Platform.OS === 'android' && androidUrl ? androidUrl : defaultUrl,
  publishableKey,
};

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.publishableKey);

let client: SupabaseClient<Database> | null = null;
let nativeRefreshCleanup: (() => void) | null = null;
let localClearPending: Promise<void> | null = null;
let localClearFailed = false;

function authStorageKey() {
  if (!supabaseConfig.url) throw new SupabaseConfigurationError();
  return `sb-${new URL(supabaseConfig.url).hostname.split('.')[0]}-auth-token`;
}

/** Explicit local exit; remote terminal revocation remains unconfirmed. */
export function clearLocalAuthSession(): Promise<void> {
  if (localClearPending) return localClearPending;
  const key = authStorageKey();
  nativeRefreshCleanup?.();
  nativeRefreshCleanup = null;
  void client?.auth.stopAutoRefresh().catch(() => undefined);
  client = null;
  localClearFailed = true;
  const pending = authStorageGeneration.clear(key);
  localClearPending = pending.then(() => { localClearFailed = false; }).finally(() => { localClearPending = null; });
  return localClearPending;
}

export class SupabaseConfigurationError extends Error {
  constructor() {
    super(
      'Supabase 未配置。请设置 EXPO_PUBLIC_SUPABASE_URL（Android 可覆盖 EXPO_PUBLIC_SUPABASE_URL_ANDROID）和 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY。',
    );
    this.name = 'SupabaseConfigurationError';
  }
}

export function getSupabaseClient() {
  if (localClearPending || localClearFailed) throw new Error('本机登录信息正在清理，请重试退出。');
  if (client) return client;
  if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    throw new SupabaseConfigurationError();
  }

  client = createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      storage: authStorageGeneration.forCurrentClient(),
      storageKey: authStorageKey(),
      autoRefreshToken: Platform.OS === 'web',
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      fetch: createAuthRequestFetch(),
    },
  });

  if (Platform.OS !== 'web' && !nativeRefreshCleanup) {
    nativeRefreshCleanup = attachNativeAuthRefresh(client.auth, AppState);
  }

  return client;
}
