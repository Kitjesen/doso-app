import { WifiDiscoveryError, type WifiDiscoveryAdapter } from './wifiDiscoverySession';

export const wifiDiscoveryAdapter: WifiDiscoveryAdapter = {
  platform: 'unsupported',
  canJoinKnownHotspot: false,
  async scan() {
    throw new WifiDiscoveryError('unsupported');
  },
  async currentSsid() {
    return null;
  },
  async joinKnownHotspot() {
    throw new WifiDiscoveryError('unsupported');
  },
  async releaseJoinedNetwork() {},
};
