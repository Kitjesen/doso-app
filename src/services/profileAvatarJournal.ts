import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { AvatarJournalError, createProfileAvatarJournal, type AvatarJournalStore } from './profileAvatarJournalCore';

const nativeLocks = new Map<string, Promise<void>>();

const store: AvatarJournalStore = {
  async getItem(key) {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    if (typeof localStorage === 'undefined') throw new AvatarJournalError();
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return;
    }
    if (typeof localStorage === 'undefined') throw new AvatarJournalError();
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    if (typeof localStorage === 'undefined') throw new AvatarJournalError();
    localStorage.removeItem(key);
  },
  async runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (Platform.OS === 'web') {
      // localStorage alone cannot provide cross-tab compare-and-set safety.
      // Unsupported/private browser contexts must fail closed, not use memory.
      if (typeof navigator === 'undefined' || !navigator.locks) throw new AvatarJournalError();
      return navigator.locks.request(key, work);
    }
    // UI JS runtime ONLY: SecureStore has no CAS. Do not import this service
    // from headless/background tasks, extensions or a second native runtime.
    // All clients in this runtime share the lock for arm/cancel transitions.
    const prior = nativeLocks.get(key) ?? Promise.resolve();
    const result = prior.then(work, work);
    const settled = result.then(() => {}, () => {});
    nativeLocks.set(key, settled);
    try { return await result; }
    finally { if (nativeLocks.get(key) === settled) nativeLocks.delete(key); }
  },
};

// Shared by profile saves; persistence errors must stop new avatar writes.
export const profileAvatarJournal = createProfileAvatarJournal(store);
