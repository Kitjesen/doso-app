import { PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { createBleNativeConnectionAdapter } from './bleConnectionNative';
import { BleConnectionError } from './bleConnectionSession';

export const bleConnectionAdapter = createBleNativeConnectionAdapter(BleManager, async () => {
  if (Number(Platform.Version) < 31) return;
  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(permission)) return;
  if (await PermissionsAndroid.request(permission) !== PermissionsAndroid.RESULTS.GRANTED) throw new BleConnectionError('preparation_failed');
});
