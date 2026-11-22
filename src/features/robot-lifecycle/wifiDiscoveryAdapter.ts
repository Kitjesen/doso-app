import { WifiDiscoveryError, type WifiDiscoveryAdapter } from './wifiDiscoverySession';

export const wifiDiscoveryAdapter: WifiDiscoveryAdapter = {
  platform: 'unsupported',
  canJoinKnownHotspot: false,
  canDiscoverLan: false,
  async scan() {
    throw new WifiDiscoveryError('unsupported');
  },
  async currentSsid() {
    return null;
  },
  async discoverLanRobots() {
    return { robots: [], timedOut: false };
  },
  async stopLanDiscovery() {},
  async joinKnownHotspot() {
    throw new WifiDiscoveryError('unsupported');
  },
  async releaseJoinedNetwork() {},
};
