export const localStore = {
  async getItem(key: string) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') return (await import('expo-secure-store')).getItemAsync(key);
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') {
      const store = await import('expo-secure-store');
      return store.setItemAsync(key, value, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
    if (typeof localStorage === 'undefined') throw new Error('Storage unavailable');
    localStorage.setItem(key, value);
  },
};
