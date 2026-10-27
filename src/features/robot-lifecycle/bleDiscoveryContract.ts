import type { BleRobotCandidate } from './bleDiscoveryModel';

export type BleDiscoveryErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'permission_blocked'
  | 'bluetooth_off'
  | 'location_off'
  | 'scan_failed';

export class BleDiscoveryError extends Error {
  readonly code: BleDiscoveryErrorCode;
  readonly nativeStatus: number | undefined;

  constructor(code: BleDiscoveryErrorCode, nativeStatus?: number) {
    super(nativeStatus === undefined ? code : `${code}:${nativeStatus}`);
    this.name = 'BleDiscoveryError';
    this.code = code;
    this.nativeStatus = nativeStatus;
  }
}

export class BleDiscoveryCancelledError extends Error {
  constructor() {
    super('ble_discovery_cancelled');
    this.name = 'BleDiscoveryCancelledError';
  }
}

export type BleDiscoveryScanOptions = {
  seconds?: number;
  onCandidates(candidates: BleRobotCandidate[]): void;
};

export interface BleDiscoveryAdapter {
  readonly supported: boolean;
  scan(options: BleDiscoveryScanOptions): Promise<BleRobotCandidate[]>;
  stop(): Promise<void>;
}
