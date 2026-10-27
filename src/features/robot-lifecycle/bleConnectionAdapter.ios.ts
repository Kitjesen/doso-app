import BleManager from 'react-native-ble-manager';
import { createBleNativeConnectionAdapter } from './bleConnectionNative';

export const bleConnectionAdapter = createBleNativeConnectionAdapter(BleManager);
