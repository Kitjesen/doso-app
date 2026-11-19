import { localStore } from './localStore';
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function createSelectedDeviceStore(storage: Storage) {
  let writes: Promise<void> = Promise.resolve();
  const key = (ownerId: string) => `doso.selected-device.v1.${ownerId}`;
  return {
    async load(ownerId: string) {
      await writes.catch(() => undefined);
      try { return await storage.getItem(key(ownerId)); }
      catch { return null; }
    },
    save(ownerId: string, deviceId: string | null) {
      const result = writes.catch(() => undefined).then(() => storage.setItem(key(ownerId), deviceId ?? ''));
      writes = result;
      return result;
    },
  };
}

export const selectedDeviceStore = createSelectedDeviceStore(localStore);
