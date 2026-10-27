export type BleAdvertisement = {
  id: string;
  name?: string | null;
  rssi: number;
  serviceUUIDs?: string[] | null;
};

export type BleDiscoveryCriteria = {
  namePrefix: string;
  serviceUuid: string | null;
};

export type BleRobotCandidate = {
  id: string;
  displayName: string;
  rssi: number;
  serviceUUIDs: string[];
  matchBasis: 'service_uuid' | 'name_hint' | 'unverified';
};

export const UNNAMED_BLE_DEVICE_LABEL = '附近未命名 BLE 设备';

export function candidateFromPeripheral(
  peripheral: BleAdvertisement,
  criteria: BleDiscoveryCriteria,
): BleRobotCandidate | null {
  const name = peripheral.name?.trim() || '';
  const serviceUUIDs = [...new Set(peripheral.serviceUUIDs ?? [])];
  const configuredService = criteria.serviceUuid?.trim().toLowerCase() || null;
  const matchesConfiguredService = configuredService
    ? serviceUUIDs.some((uuid) => uuid.toLowerCase() === configuredService)
    : false;
  if (configuredService && !matchesConfiguredService) return null;
  const matchesNameHint = name.toLowerCase().startsWith(criteria.namePrefix.trim().toLowerCase());

  return {
    id: peripheral.id,
    displayName: name || UNNAMED_BLE_DEVICE_LABEL,
    rssi: Number.isFinite(peripheral.rssi) ? peripheral.rssi : -127,
    serviceUUIDs,
    matchBasis: matchesConfiguredService ? 'service_uuid' : matchesNameHint ? 'name_hint' : 'unverified',
  };
}

export function mergeCandidate(current: BleRobotCandidate, incoming: BleRobotCandidate): BleRobotCandidate {
  if (current.id !== incoming.id) throw new Error('cannot merge different BLE peripherals');
  const displayName = incoming.displayName === UNNAMED_BLE_DEVICE_LABEL
    && current.displayName !== UNNAMED_BLE_DEVICE_LABEL
    ? current.displayName
    : incoming.displayName;
  return {
    id: current.id,
    displayName,
    rssi: Math.max(current.rssi, incoming.rssi),
    serviceUUIDs: [...new Set([...current.serviceUUIDs, ...incoming.serviceUUIDs])],
    matchBasis: strongerBasis(current.matchBasis, incoming.matchBasis),
  };
}

export function sortCandidates(candidates: BleRobotCandidate[]): BleRobotCandidate[] {
  return [...candidates].sort((left, right) => right.rssi - left.rssi || left.displayName.localeCompare(right.displayName));
}

export function maskPeripheralId(peripheralId: string): string {
  const suffix = peripheralId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
  return `••••${suffix || '----'}`;
}

function strongerBasis(
  current: BleRobotCandidate['matchBasis'],
  incoming: BleRobotCandidate['matchBasis'],
): BleRobotCandidate['matchBasis'] {
  const rank = { unverified: 0, name_hint: 1, service_uuid: 2 } as const;
  return rank[incoming] > rank[current] ? incoming : current;
}
