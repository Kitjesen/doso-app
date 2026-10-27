import { BleConnectionError, INITIAL_BLE_CONNECTION_STATE, type BleConnectionAdapter } from './bleConnectionSession';

export const bleConnectionAdapter: BleConnectionAdapter = {
  supported: false,
  getSnapshot: () => INITIAL_BLE_CONNECTION_STATE,
  subscribe: () => () => {},
  async connect() { throw new BleConnectionError('unsupported'); },
  async disconnect() {},
};
