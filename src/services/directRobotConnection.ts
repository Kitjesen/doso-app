import type { BrainstemGrpcMotorState, BrainstemGrpcObservation, BrainstemGrpcProfile } from './brainstemGrpc';
import type { ControlJointState, ControlPolicyOption, ControlRuntimeState, ControlTerrainModeId, ControlTerrainModeOption } from '../features/control/controlOperations';

const TERRAIN_MODE_OPTIONS: readonly ControlTerrainModeOption[] = [
  { id: 'flat', label: '平地模式' },
  { id: 'stairs', label: '楼梯模式' },
  { id: 'platform', label: '高台模式' },
];
// Brainstem JointsMatrix: 12 leg joints first, then the four foot motors.
const JOINT_LABELS = ['前右髋', '前右大腿', '前右小腿', '前左髋', '前左大腿', '前左小腿', '后右髋', '后右大腿', '后右小腿', '后左髋', '后左大腿', '后左小腿', '前右足轮', '前左足轮', '后右足轮', '后左足轮'];

export type DirectRobotConnectionSnapshot = Readonly<{
  endpoint: Readonly<{ host: string; port: number; transport?: 'tls' | 'lan-dev' }>;
  observation: Readonly<Omit<BrainstemGrpcObservation, 'status'> & { status: Readonly<BrainstemGrpcObservation['status']> }>;
}>;

function invalidSnapshot(): never {
  throw new Error('无法验证机器人直连状态，请重新检查。');
}

// Kept pure: importing the native service at runtime would require Expo/React Native.
function normalizedEndpoint(value: unknown): { host: string; port: number; transport?: 'tls' | 'lan-dev' } {
  if (!value || typeof value !== 'object') invalidSnapshot();
  const endpoint = value as Record<string, unknown>;
  if (typeof endpoint.host !== 'string' || typeof endpoint.port !== 'number' ||
    !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) invalidSnapshot();
  let host = endpoint.host.trim().toLowerCase();
  if (!host || host.length > 253) invalidSnapshot();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.includes(':')) {
    if (!/^[a-f0-9:.]+$/.test(host)) invalidSnapshot();
    try { host = new URL(`https://[${host}]/`).hostname.replace(/^\[|\]$/g, ''); }
    catch { invalidSnapshot(); }
    if (/^::ffff:/.test(host)) invalidSnapshot();
  } else if (/^[0-9.]+$/.test(host)) {
    const parts = host.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) invalidSnapshot();
  } else if (host.split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) invalidSnapshot();
  if (endpoint.transport !== undefined && endpoint.transport !== 'tls' && endpoint.transport !== 'lan-dev') invalidSnapshot();
  if (endpoint.transport === 'lan-dev') {
    const parts = host.split('.').map(Number);
    if (endpoint.clientIdentityAlias !== undefined || !/^[0-9.]+$/.test(host) || parts.length !== 4 ||
      !(parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168)) invalidSnapshot();
  }
  return { host, port: endpoint.port, ...(endpoint.transport ? { transport: endpoint.transport } : {}) };
}

function validObservation(value: unknown): value is BrainstemGrpcObservation {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (o.source !== 'brainstem.grpc.direct' || !['grpc-tls', 'grpc-lan'].includes(String(o.transport)) ||
    o.transport === 'grpc-lan' && (o.mutualTlsVerified !== false || o.clientIdentitySelected !== false || o.clientCertificateSha256 !== undefined) ||
    o.motionAuthorized !== false || o.cloudBindingVerified !== false ||
    typeof o.observedAt !== 'string' || !Number.isFinite(Date.parse(o.observedAt)) ||
    !o.status || typeof o.status !== 'object') return false;
  const s = o.status as Record<string, unknown>;
  if (!(typeof s.fsmKind === 'string' && ['zero', 'grounded', 'standing', 'walking', 'transitioning'].includes(s.fsmKind)) ||
    !(typeof s.transition === 'string' && ['none', 'stand_up', 'sit_down', 'gesture'].includes(s.transition)) ||
    !(typeof s.owner === 'string' && ['none', 'grpc', 'yunzhuo'].includes(s.owner)) ||
    !['motorOutputEnabled', 'criticalMotorFault', 'grpcLeaseActive', 'readyForWalk'].every(key => typeof s[key] === 'boolean')) return false;
  if (o.profile !== undefined && !validProfile(o.profile)) return false;
  if (o.voltage !== undefined) {
    const voltage = o.voltage as Record<string, unknown>;
    if (!voltage || typeof voltage !== 'object' || !Array.isArray(voltage.values)
      || !voltage.values.every((item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1000)) return false;
  }
  if (o.motors !== undefined && (!Array.isArray(o.motors) || !o.motors.every(validMotorState))) return false;
  return true;
}

function validProfile(value: unknown): value is BrainstemGrpcProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.current === 'string' && profile.current.length <= 128 &&
    typeof profile.currentDescription === 'string' && profile.currentDescription.length <= 512 &&
    Array.isArray(profile.available) && profile.available.length <= 64 && profile.available.every(item => typeof item === 'string' && item.length <= 128) &&
    Array.isArray(profile.descriptions) && profile.descriptions.length <= 64 && profile.descriptions.every(item => typeof item === 'string' && item.length <= 512);
}

function validMotorState(value: unknown): value is BrainstemGrpcMotorState {
  if (!value || typeof value !== 'object') return false;
  const motor = value as Record<string, unknown>;
  return Number.isInteger(motor.id) && Number(motor.id) >= 0 && Number(motor.id) < 32
    && typeof motor.online === 'boolean'
    && Number.isInteger(motor.statusCode) && Number(motor.statusCode) >= 0
    && ['temperatureC', 'voltageV', 'positionRad', 'velocityRps', 'torqueNm'].every(key => typeof motor[key] === 'number' && Number.isFinite(motor[key]))
    && Number(motor.voltageV) >= 0 && Number(motor.voltageV) <= 1000
    && Array.isArray(motor.errors) && motor.errors.every(error => Number.isInteger(error) && error >= 0);
}

function jointStatesFromMotors(motors: readonly BrainstemGrpcMotorState[] | undefined, voltages?: readonly number[]): readonly ControlJointState[] {
  if (!motors?.length || !motors.every(validMotorState)) return [];
  return motors.slice().sort((a, b) => a.id - b.id).map(motor => ({
    id: String(motor.id),
    label: JOINT_LABELS[motor.id] ?? `关节 ${motor.id + 1}`,
    online: motor.online,
    statusCode: motor.statusCode,
    // GetMotorStatus replaces missing/offline reports with zeros. Those are not measurements.
    positionDeg: motor.online ? motor.positionRad * 180 / Math.PI : null,
    velocityRps: motor.online ? motor.velocityRps : null,
    torqueNm: motor.online ? motor.torqueNm : null,
    // MotorState.voltage is currently a server placeholder; use the separate Vbus read by id.
    voltageV: motor.online && voltages?.[motor.id] && voltages[motor.id] > 0 ? voltages[motor.id] : null,
    temperatureC: motor.online ? motor.temperatureC : null,
    errors: motor.errors,
    fault: motor.errors.length > 0 ? 'active' : motor.online && motor.statusCode <= 2 ? 'clear' : 'unknown',
    source: 'device' as const,
  }));
}

export function profileOptions(profile: BrainstemGrpcProfile): readonly ControlPolicyOption[] {
  const descriptions = profile.descriptions;
  const seen = new Set<string>();
  return profile.available.map((id, index) => {
    // Slot-enabled Brainstem prefixes descriptions with the configured slot key.
    const key = /^(flat|stairs|platform):/.exec(descriptions[index] ?? '')?.[1] ?? id;
    const terrainModeId = TERRAIN_MODE_OPTIONS.find(option => option.id === key)?.id;
    return { id, label: descriptions[index] || id, ...(terrainModeId ? { terrainModeId } : {}) };
  }).filter(option => {
    if (!option.id || !option.label || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export function terrainModeFromProfile(profile: BrainstemGrpcProfile): { current: ControlTerrainModeId | null; options: readonly ControlTerrainModeOption[] } {
  const policies = profileOptions(profile);
  const options = TERRAIN_MODE_OPTIONS.filter(option => policies.filter(item => item.terrainModeId === option.id).length === 1);
  const current = policies.find(item => item.id === profile.current)?.terrainModeId ?? null;
  return { current: options.some(option => option.id === current) ? current : null, options };
}

function runtimeFromObservation(observation: BrainstemGrpcObservation, fresh: boolean): ControlRuntimeState {
  const profile = observation.profile;
  const policy = profile && validProfile(profile) ? profileOptions(profile) : [];
  const terrain = profile && validProfile(profile) ? terrainModeFromProfile(profile) : null;
  // readVoltage fills timed-out channels with zero, so zeros cannot establish a bus voltage.
  const busVoltages = observation.voltage?.values.filter(value => value > 0) ?? [];
  return {
    controlLink: 'unknown', controlAuthority: 'not-held',
    motorState: fresh ? observation.status.motorOutputEnabled ? 'enabled' : 'disabled' : 'unknown',
    posture: fresh && observation.status.fsmKind === 'standing' ? 'standing' : 'unknown',
    currentPolicy: profile && validProfile(profile) && profile.current ? { id: profile.current, label: profile.currentDescription || profile.current } : null,
    policyCatalogStatus: profile && validProfile(profile) ? 'synced' : 'unknown',
    policyOptions: policy,
    ...(observation.voltage ? { battery: { percent: null, voltageV: busVoltages.length ? Math.min(...busVoltages) : null, source: 'device' as const, updatedAt: observation.observedAt } } : {}),
    ...(observation.motors ? { joints: jointStatesFromMotors(observation.motors, observation.voltage?.values) } : {}),
    ...(terrain ? { terrainMode: { current: terrain.current, options: terrain.options, catalogStatus: 'synced' as const, source: 'device' as const, updatedAt: observation.observedAt } } : {}),
  };
}

function isRecent(observedAt: string, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  const age = now - Date.parse(observedAt);
  return Number.isFinite(age) && age >= 0 && age < 15_000;
}

export function createDirectRobotConnectionSnapshot(
  endpoint: { host: string; port: number; transport?: 'tls' | 'lan-dev' }, observation: BrainstemGrpcObservation, now = Date.now(),
): DirectRobotConnectionSnapshot {
  if (!validObservation(observation) || !isRecent(observation.observedAt, now)) invalidSnapshot();
  const checkedEndpoint = normalizedEndpoint(endpoint);
  if ((checkedEndpoint.transport === 'lan-dev') !== (observation.transport === 'grpc-lan')) invalidSnapshot();
  const s = observation.status;
  // Whitelist fields rather than cloning unknown credentials/identity metadata.
  const status = Object.freeze({
    fsmKind: s.fsmKind, transition: s.transition, motorOutputEnabled: s.motorOutputEnabled,
    owner: s.owner, criticalMotorFault: s.criticalMotorFault, grpcLeaseActive: s.grpcLeaseActive,
    readyForWalk: s.readyForWalk,
  });
  const profile = observation.profile && validProfile(observation.profile)
    ? Object.freeze({
      current: observation.profile.current,
      available: Object.freeze([...observation.profile.available]),
      descriptions: Object.freeze([...observation.profile.descriptions]),
      currentDescription: observation.profile.currentDescription,
    })
    : undefined;
  const voltage = observation.voltage && observation.voltage.values.every(value => typeof value === 'number' && Number.isFinite(value))
    ? Object.freeze({ values: Object.freeze([...observation.voltage.values]) })
    : undefined;
  const motors = observation.motors && observation.motors.every(validMotorState)
    ? Object.freeze(observation.motors.map(motor => Object.freeze({
      id: motor.id, online: motor.online, statusCode: motor.statusCode,
      temperatureC: motor.temperatureC, voltageV: motor.voltageV, positionRad: motor.positionRad,
      velocityRps: motor.velocityRps, torqueNm: motor.torqueNm, errors: Object.freeze([...motor.errors]),
    })))
    : undefined;
  return Object.freeze({
    endpoint: Object.freeze(checkedEndpoint),
    observation: Object.freeze({
      source: 'brainstem.grpc.direct', observedAt: observation.observedAt, transport: observation.transport, status,
      ...(observation.transport === 'grpc-lan' ? { mutualTlsVerified: false, clientIdentitySelected: false } : {}),
      motionAuthorized: false, cloudBindingVerified: false,
      ...(profile ? { profile } : {}),
      ...(voltage ? { voltage } : {}),
      ...(motors ? { motors } : {}),
    }),
  });
}

export function isDirectRobotConnectionFresh(snapshot: DirectRobotConnectionSnapshot | null | undefined, now = Date.now()): boolean {
  if (!snapshot || !validObservation(snapshot.observation)) return false;
  try { if ((normalizedEndpoint(snapshot.endpoint).transport === 'lan-dev') !== (snapshot.observation.transport === 'grpc-lan')) return false; } catch { return false; }
  return isRecent(snapshot.observation.observedAt, now);
}

export function describeDirectRobotConnection(snapshot: DirectRobotConnectionSnapshot | null | undefined, now = Date.now()): {
  endpointLabel: string; fresh: boolean; summary: string; runtimeState: ControlRuntimeState;
} {
  const fresh = isDirectRobotConnectionFresh(snapshot, now);
  let endpointLabel = '未连接';
  try {
    const endpoint = normalizedEndpoint(snapshot?.endpoint);
    endpointLabel = `${endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host}:${endpoint.port}`;
  } catch { /* Malformed inputs must not leak arbitrary endpoint text to the UI. */ }
  return {
    endpointLabel,
    fresh,
    summary: !snapshot ? '尚未读取设备状态' : fresh ? '状态已读取，设备归属未核验' : '状态已过期，请重新检查',
    runtimeState: snapshot && fresh ? runtimeFromObservation(snapshot.observation, true) : {
      controlLink: 'unknown', controlAuthority: 'not-held', motorState: 'unknown', posture: 'unknown',
      currentPolicy: null, policyCatalogStatus: 'unknown', policyOptions: [],
    },
  };
}
