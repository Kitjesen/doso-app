import { BleDiscoveryError, type BleDiscoveryAdapter } from './bleDiscoveryContract';

export const bleDiscoveryAdapter: BleDiscoveryAdapter = {
  supported: false,
  async scan() {
    throw new BleDiscoveryError('unsupported');
  },
  async stop() {},
};
