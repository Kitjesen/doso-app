import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type G20NativeState = Readonly<{
  requestId: string; generation: number; status: 'starting' | 'reading' | 'stopped' | 'unavailable' | 'error';
  reason: string | null; sequence: number; configurationReady: boolean;
}>;
type Subscription = { remove(): void };
type NativeInput = {
  start(requestId: string): Promise<G20NativeState>;
  stop(): Promise<G20NativeState>;
  getStatus(): G20NativeState;
  isSampleFresh(generation: number, sequence: number): boolean;
  captureInputFence(): number | null;
  addListener(event: string, listener: (event: unknown) => void): Subscription;
};
let native: NativeInput | null = null;
try { if (Platform.OS === 'android') native = requireOptionalNativeModule<NativeInput>('DosoG20Input'); } catch { /* Older APK. */ }
const methods = ['start', 'stop', 'getStatus', 'isSampleFresh', 'captureInputFence', 'addListener'] as const;
export const g20Input = {
  available: !!native && methods.every(method => typeof native?.[method] === 'function'),
  start(requestId: string) {
    if (!this.available) return Promise.reject(Error('此安装包不含 G20 输入模块'));
    return native!.start(requestId);
  },
  stop() { return native?.stop().catch(() => undefined); },
  isFresh(generation: number, sequence: number) {
    try { return this.available && native!.isSampleFresh(generation, sequence) === true; } catch { return false; }
  },
  captureFence(): number | null {
    try {
      const at = this.available ? native!.captureInputFence() : null;
      return typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 ? at : null;
    } catch { return null; }
  },
  subscribe(event: 'onSample' | 'onState', listener: (value: unknown) => void): Subscription {
    return native?.addListener(event, listener) ?? { remove() {} };
  },
};
