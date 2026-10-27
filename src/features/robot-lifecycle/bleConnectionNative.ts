import type BleManager from 'react-native-ble-manager';
import { BleConnectionError, createBleConnectionSession, type BleConnectionAdapter } from './bleConnectionSession';

type NativeManager = Pick<typeof BleManager, 'isStarted' | 'checkState' | 'connect' | 'retrieveServices' | 'disconnect' | 'onDisconnectPeripheral'>;
type NativeDisconnectEvent = Parameters<Parameters<NativeManager['onDisconnectPeripheral']>[0]>[0];
// Android reports GATT_SUCCESS=0; iOS's no-error didDisconnect event has
// neither status nor NSError fields. Never discard failure evidence.
const confirmedDisconnect = (event: NativeDisconnectEvent) => (event.status === undefined || event.status === 0)
  && event.code === undefined && event.domain === undefined;

// The installed 12.5.1 API is deliberately restricted to connection and service
// discovery. No read/write/notification/bonding capability crosses this boundary.
export function createBleNativeConnectionAdapter(manager: NativeManager, permission: () => Promise<void> = async () => {},
  options: Parameters<typeof createBleConnectionSession>[1] = {}): BleConnectionAdapter {
  return createBleConnectionSession({
    async prepare() {
      await permission();
      // A selectable candidate comes from this screen's prior explicit scan.
      // Reuse its started manager; do not start a second central or scan here.
      if (!await manager.isStarted() || await manager.checkState() !== 'on') throw new BleConnectionError('preparation_failed');
    },
    connect: id => manager.connect(id, { autoconnect: false }),
    retrieveServices: id => manager.retrieveServices(id),
    disconnect: (id, signal) => new Promise<void>((resolve, reject) => {
      let finished = false;
      let subscription: ReturnType<NativeManager['onDisconnectPeripheral']> | undefined;
      const finish = (confirmed: boolean) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', onAbort);
        try { subscription?.remove(); } catch { confirmed = false; }
        if (confirmed) resolve(); else reject(new BleConnectionError('cleanup_unconfirmed'));
      };
      const onAbort = () => finish(false);
      if (signal.aborted) { finish(false); return; }
      subscription = manager.onDisconnectPeripheral(event => {
        if (event.peripheral === id) finish(confirmedDisconnect(event));
      });
      signal.addEventListener('abort', onAbort, { once: true });
      // Android force=true emits a synthetic success before the native state
      // callback; iOS resolves its request callback before didDisconnect. Neither
      // acknowledgement proves release. Wait for the matching native event.
      void Promise.resolve().then(() => manager.disconnect(id, false)).catch(() => finish(false));
    }),
    onDisconnect: listener => manager.onDisconnectPeripheral(event => listener({ id: event.peripheral, confirmed: confirmedDisconnect(event) })),
  }, options);
}
