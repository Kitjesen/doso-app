// @ts-ignore Node's strip-types verifier requires the explicit TypeScript source path.
import { BleDiscoveryCancelledError, BleDiscoveryError } from './bleDiscoveryContract.ts';
// @ts-ignore Node's strip-types verifier requires the explicit TypeScript source path.
import { mergeCandidate, sortCandidates, type BleRobotCandidate } from './bleDiscoveryModel.ts';

type EventSubscription = {
  remove(): void;
};

type BleStopEvent = {
  status?: number;
};

export interface BleDiscoveryRuntime<TPeripheral> {
  onDiscover(listener: (peripheral: TPeripheral) => void): EventSubscription;
  onStop(listener: (event: BleStopEvent) => void): EventSubscription;
  scan(options: { serviceUUIDs: string[]; seconds: number }): Promise<void>;
  isScanning(): Promise<boolean>;
  stopScan(): Promise<void>;
}

type SessionOptions<TPeripheral> = {
  seconds: number;
  serviceUUIDs?: string[];
  signal?: AbortSignal;
  onCandidates(candidates: BleRobotCandidate[]): void;
  toCandidate(peripheral: TPeripheral): BleRobotCandidate | null;
};

type ScanEnd =
  | { kind: 'cancelled' }
  | { kind: 'stopped'; status?: number };

export function isSuccessfulBleStopStatus(status: number | undefined) {
  return status === 0 || status === 10;
}

export function requiresLegacyAndroidLocationServices(apiLevel: number) {
  return apiLevel >= 23 && apiLevel <= 30;
}

export function shouldStopBleScanForAppState(state: string) {
  return state !== 'active';
}

export async function runBleDiscoveryScanSession<TPeripheral>(
  runtime: BleDiscoveryRuntime<TPeripheral>,
  {
    seconds,
    serviceUUIDs = [],
    signal,
    onCandidates,
    toCandidate,
  }: SessionOptions<TPeripheral>,
): Promise<BleRobotCandidate[]> {
  const candidates = new Map<string, BleRobotCandidate>();
  let settleScan: (end: ScanEnd) => void = () => {};
  let settled = false;
  const stopped = new Promise<ScanEnd>((resolve) => {
    settleScan = (end) => {
      if (settled) return;
      settled = true;
      resolve(end);
    };
  });
  const onAbort = () => settleScan({ kind: 'cancelled' });
  const discoveredSubscription = runtime.onDiscover((peripheral) => {
    const candidate = toCandidate(peripheral);
    if (!candidate) return;
    const current = candidates.get(candidate.id);
    candidates.set(candidate.id, current ? mergeCandidate(current, candidate) : candidate);
    onCandidates(sortCandidates([...candidates.values()]));
  });
  const stoppedSubscription = runtime.onStop(({ status }) => settleScan({ kind: 'stopped', status }));
  const fallbackTimer = setTimeout(
    () => settleScan({ kind: 'stopped' }),
    (seconds + 2) * 1_000,
  );

  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await runtime.scan({ serviceUUIDs, seconds });
    const end = await stopped;
    if (end.kind === 'cancelled') throw new BleDiscoveryCancelledError();
    if (!isSuccessfulBleStopStatus(end.status)) {
      throw new BleDiscoveryError('scan_failed', end.status);
    }
    return sortCandidates([...candidates.values()]);
  } finally {
    clearTimeout(fallbackTimer);
    signal?.removeEventListener('abort', onAbort);
    discoveredSubscription.remove();
    stoppedSubscription.remove();
    if (await runtime.isScanning().catch(() => false)) {
      await runtime.stopScan().catch(() => undefined);
    }
  }
}
