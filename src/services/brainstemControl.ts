import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { validateBrainstemEndpoint, type BrainstemBodyHeightCapability, type BrainstemGrpcEndpoint, type BrainstemGrpcStatus, type BrainstemGrpcProfile } from './brainstemGrpc';
import { projectRobotRecoveryStatus, type RobotRecoveryCommand, type RobotRecoveryStatus } from '../features/control/robotRecovery';

export type BrainstemControlAction = 'enable' | 'disable' | 'stand-up' | 'sit-down' | 'switch-profile' | 'set-zero' | 'clear-motor-fault' | 'play-gesture';
export type BrainstemSpeedMode = 'normal' | 'high';
export type BrainstemGesture = Readonly<{ name: string; description: string; durationMs: number }>;
export type BrainstemBodyHeightStatus = Readonly<{
  supported: boolean;
  currentHeightM: number;
  targetHeightM: number;
  minHeightM: number;
  maxHeightM: number;
  rateMps: number;
}>;
export type BrainstemControlReply = Readonly<{
  transport?: 'grpc-mtls' | 'grpc-lan';
  status: BrainstemGrpcStatus;
  leaseActive: boolean;
  principalVerified: boolean;
  leaseOwnerMatched?: boolean;
  sequence?: number;
  profile?: BrainstemGrpcProfile;
  profileUnavailable?: boolean;
}>;
export type BrainstemControlOpenReply = BrainstemControlReply & Readonly<{ sessionId: string; transport: 'grpc-mtls' | 'grpc-lan'; mutualTlsVerified: boolean; clientIdentitySelected?: boolean; sessionPrincipal?: string }>;
export interface BrainstemControlTransport {
  open(endpoint: BrainstemGrpcEndpoint, principal: string): Promise<BrainstemControlOpenReply>;
  read(sessionId: string): Promise<BrainstemControlReply>;
  action(sessionId: string, action: BrainstemControlAction, profileName?: string): Promise<BrainstemControlReply>;
  acquire(sessionId: string): Promise<BrainstemControlReply>;
  input(sessionId: string, forward: number, lateral: number, yaw: number, sampledAtMonotonicMs?: number): Promise<BrainstemControlReply>;
  interrupt(sessionId: string): Promise<BrainstemControlReply | null>;
  close(sessionId: string): Promise<void>;
  /** Optional. Older runtimes keep control and simply never deliver IMU. */
  listenImu?(sessionId: string, onSample: (sample: unknown) => void): () => void;
  readRecovery?(sessionId: string): Promise<RobotRecoveryStatus>;
  recoveryCommand?(sessionId: string, command: RobotRecoveryCommand): Promise<RobotRecoveryStatus>;
  setRecoveryHeartbeat?(sessionId: string, enabled: boolean): void;
  listGestures?(sessionId: string): Promise<readonly BrainstemGesture[]>;
  getSpeedMode?(sessionId: string): Promise<BrainstemSpeedMode>;
  setSpeedMode?(sessionId: string, mode: BrainstemSpeedMode): Promise<BrainstemControlReply & Readonly<{ speedMode: BrainstemSpeedMode }>>;
  getBodyHeightStatus?(sessionId: string): Promise<BrainstemBodyHeightStatus>;
  setBodyHeight?(sessionId: string, heightM: number): Promise<BrainstemControlReply & Readonly<{ bodyHeight: BrainstemBodyHeightStatus }>>;
}

export class BrainstemControlError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'BrainstemControlError'; }
}
const errorMessages: Record<string, string> = {
  config: '请选择客户端身份并填写有效的机器狗地址和控制身份。',
  native_unavailable: '当前安装包尚不支持真实控制，请安装新版 Android 安装包。',
  invalid_response: '机器狗返回了无法核对的控制结果，请重新连接。',
  unauthorized: '机器狗未授权此控制身份，请检查配对证书。',
  precondition: '机器狗当前状态不允许此操作，请刷新状态后重试。',
  busy: '上一项操作正在处理，请等待机器狗响应。',
  background: '应用已离开前台，输入已暂停。',
  timeout: '机器狗响应超时，停止状态待确认，请重新连接。',
  stop_unconfirmed: '停止请求未确认，请检查机器狗状态并使用硬件急停。',
  cancelled: '控制已中断，请重新申请控制权。',
  stale_input: '输入已过期，控制已中断，请重新申请控制权。',
  not_armed: '控制权已失效，请重新申请控制权。',
  command_rejected: '机器狗未确认控制指令，请检查状态。',
  unimplemented: '机器狗服务尚不支持此操作。',
  unavailable: '无法连接机器狗，请检查局域网、服务地址及配对证书。',
};
export function safeBrainstemControlError(error: unknown): BrainstemControlError {
  if (error instanceof BrainstemControlError) return error;
  const raw = error && typeof error === 'object' && 'code' in error ? String(error.code).toLowerCase().replace(/^err_/, '') : '';
  const code = Object.prototype.hasOwnProperty.call(errorMessages, raw) ? raw : 'unavailable';
  return new BrainstemControlError(code, errorMessages[code]);
}
function invalid(): never { throw new BrainstemControlError('invalid_response', errorMessages.invalid_response); }
function copyBodyHeightCapability(value: unknown): BrainstemBodyHeightCapability | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const h = value as Record<string, unknown>;
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  if (!ok(h.defaultHeightM, 5) || !ok(h.minHeightM, 5) || !ok(h.maxHeightM, 5) || !ok(h.rateMps, 10)) return undefined;
  if (h.minHeightM > 0 && h.maxHeightM > 0 && h.minHeightM > h.maxHeightM) return undefined;
  return Object.freeze({
    defaultHeightM: h.defaultHeightM,
    minHeightM: h.minHeightM,
    maxHeightM: h.maxHeightM,
    rateMps: h.rateMps,
  });
}
function projectBodyHeightStatus(value: unknown): BrainstemBodyHeightStatus {
  if (!value || typeof value !== 'object') invalid();
  const h = value as Record<string, unknown>;
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  if (typeof h.supported !== 'boolean' || !ok(h.currentHeightM, 5) || !ok(h.targetHeightM, 5)
    || !ok(h.minHeightM, 5) || !ok(h.maxHeightM, 5) || !ok(h.rateMps, 10)) invalid();
  if (h.minHeightM > 0 && h.maxHeightM > 0 && h.minHeightM > h.maxHeightM) invalid();
  return Object.freeze({
    supported: h.supported,
    currentHeightM: h.currentHeightM,
    targetHeightM: h.targetHeightM,
    minHeightM: h.minHeightM,
    maxHeightM: h.maxHeightM,
    rateMps: h.rateMps,
  });
}
function copyModeCapabilities(value: unknown): BrainstemGrpcProfile['modeCapabilities'] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16) return undefined;
  const kinds = new Set(['unspecified', 'locomotion', 'recovery-action', 'body-height']);
  const availabilities = new Set(['unknown', 'unavailable', 'available']);
  const items: NonNullable<BrainstemGrpcProfile['modeCapabilities']>[number][] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const capability = item as Record<string, unknown>;
    if (typeof capability.id !== 'string' || capability.id.length > 64 || capability.id.includes('\0') || !kinds.has(String(capability.kind))) return undefined;
    if (typeof capability.unavailableReason !== 'string' || capability.unavailableReason.length > 200 || capability.unavailableReason.includes('\0')) return undefined;
    let availability: 'unknown' | 'unavailable' | 'available' | undefined;
    if (capability.availability !== undefined) {
      if (typeof capability.availability !== 'string' || !availabilities.has(capability.availability)) return undefined;
      availability = capability.availability as typeof availability;
    }
    let available: boolean;
    if (typeof capability.available === 'boolean') {
      if (availability !== undefined && (availability === 'available') !== capability.available) return undefined;
      available = capability.available;
    } else if (availability !== undefined) available = availability === 'available';
    else return undefined;
    let label = '';
    if (capability.label !== undefined) {
      if (typeof capability.label !== 'string' || capability.label.length > 64 || capability.label.includes('\0')) return undefined;
      label = capability.label;
    }
    let profileId: string | undefined;
    if (capability.profileId !== undefined) {
      if (typeof capability.profileId !== 'string' || capability.profileId.length > 128 || capability.profileId.includes('\0')) return undefined;
      profileId = capability.profileId;
    }
    let bodyHeight: BrainstemBodyHeightCapability | undefined;
    if (capability.bodyHeight !== undefined) {
      const copied = copyBodyHeightCapability(capability.bodyHeight);
      if (!copied) return undefined;
      bodyHeight = copied;
    }
    items.push({
      id: capability.id, kind: capability.kind as 'unspecified' | 'locomotion' | 'recovery-action' | 'body-height', label,
      available, unavailableReason: capability.unavailableReason,
      ...(availability ? { availability } : {}),
      ...(profileId !== undefined ? { profileId } : {}),
      ...(bodyHeight !== undefined ? { bodyHeight } : {}),
    });
  }
  return items;
}
function projectRecovery(value: unknown): RobotRecoveryStatus {
  const projected = projectRobotRecoveryStatus(value);
  if (!projected) throw new BrainstemControlError('invalid_response', errorMessages.invalid_response);
  return projected;
}
export function projectBrainstemControlReply(value: unknown): BrainstemControlReply {
  if (!value || typeof value !== 'object') invalid();
  const v = value as Record<string, unknown>;
  if (!v.status || typeof v.status !== 'object') invalid();
  const s = v.status as Record<string, unknown>;
  if (!['zero', 'grounded', 'standing', 'walking', 'transitioning'].includes(String(s.fsmKind))
    || !['none', 'stand_up', 'sit_down', 'gesture'].includes(String(s.transition))
    || !['none', 'grpc', 'yunzhuo'].includes(String(s.owner))
    || ['motorOutputEnabled', 'criticalMotorFault', 'grpcLeaseActive', 'readyForWalk'].some(key => typeof s[key] !== 'boolean')
    || typeof v.leaseActive !== 'boolean' || typeof v.principalVerified !== 'boolean') invalid();
  if (v.leaseOwnerMatched !== undefined && typeof v.leaseOwnerMatched !== 'boolean') invalid();
  if (v.transport !== undefined && v.transport !== 'grpc-mtls' && v.transport !== 'grpc-lan') invalid();
  if (v.transport === 'grpc-lan' && (v.principalVerified !== false || typeof v.leaseOwnerMatched !== 'boolean')) invalid();
  const leaseOwnerMatched = v.leaseOwnerMatched ?? (v.leaseActive && v.principalVerified);
  if (v.leaseActive && (!s.grpcLeaseActive || s.owner !== 'grpc' || !leaseOwnerMatched || v.transport !== 'grpc-lan' && !v.principalVerified)) invalid();
  if (v.sequence !== undefined && (!Number.isSafeInteger(v.sequence) || Number(v.sequence) <= 0)) invalid();
  let profile: BrainstemGrpcProfile | undefined;
  if (v.profileUnavailable !== undefined && typeof v.profileUnavailable !== 'boolean') invalid();
  if (v.profile !== undefined) {
    if (!v.profile || typeof v.profile !== 'object') invalid();
    const p = v.profile as Record<string, unknown>;
    const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && !x.includes('\0');
    if (!text(p.current, 128) || !text(p.currentDescription, 512)
      || !Array.isArray(p.available) || !Array.isArray(p.descriptions)
      || p.available.length > 64 || p.descriptions.length > 64
      || !p.available.every(x => text(x, 128)) || !p.descriptions.every(x => text(x, 512))) invalid();
    const modeCapabilities = copyModeCapabilities(p.modeCapabilities);
    profile = { current: p.current, currentDescription: p.currentDescription,
      available: [...p.available], descriptions: [...p.descriptions],
      ...(modeCapabilities ? { modeCapabilities } : {}),
      ...(typeof p.activeModeId === 'string' && p.activeModeId.length <= 64 ? { activeModeId: p.activeModeId } : {}) };
  }
  return {
    status: {
      fsmKind: s.fsmKind as BrainstemGrpcStatus['fsmKind'], transition: s.transition as BrainstemGrpcStatus['transition'],
      owner: s.owner as BrainstemGrpcStatus['owner'], motorOutputEnabled: s.motorOutputEnabled as boolean,
      criticalMotorFault: s.criticalMotorFault as boolean, grpcLeaseActive: s.grpcLeaseActive as boolean, readyForWalk: s.readyForWalk as boolean,
    },
    leaseActive: v.leaseActive, principalVerified: v.principalVerified,
    ...(v.transport !== undefined ? { transport: v.transport as 'grpc-mtls' | 'grpc-lan' } : {}),
    leaseOwnerMatched: leaseOwnerMatched as boolean,
    ...(v.sequence !== undefined ? { sequence: Number(v.sequence) } : {}), ...(profile ? { profile } : {}),
    ...(v.profileUnavailable === true ? { profileUnavailable: true } : {}),
  };
}

type NativeControl = {
  openControl(host: string, port: number, alias: string, principal: string, requestId: string): Promise<unknown>;
  openLanControl?: (host: string, port: number, requestId: string) => Promise<unknown>;
  readControlStatus(sessionId: string): Promise<unknown>;
  controlAction(sessionId: string, action: string, profileName: string | null): Promise<unknown>;
  acquireControl(sessionId: string): Promise<unknown>;
  sendControlInput(sessionId: string, forward: number, lateral: number, yaw: number): Promise<unknown>;
  sendControlInputAt?(sessionId: string, forward: number, lateral: number, yaw: number, sampledAtMonotonicMs: number): Promise<unknown>;
  interruptControl(sessionId: string): Promise<unknown>;
  closeControl(sessionId: string): Promise<void>;
  readRecoveryStatus?(sessionId: string): Promise<unknown>;
  recoveryCommand?(sessionId: string, command: string): Promise<unknown>;
  setRecoveryHeartbeat?(sessionId: string, enabled: boolean): Promise<void> | void;
  listGestures?(sessionId: string): Promise<unknown>;
  getSpeedMode?(sessionId: string): Promise<unknown>;
  setSpeedMode?(sessionId: string, mode: string): Promise<unknown>;
  getBodyHeightStatus?(sessionId: string): Promise<unknown>;
  setBodyHeight?(sessionId: string, heightM: number): Promise<unknown>;
  addListener?(event: string, listener: (payload: unknown) => void): { remove: () => void };
  startListenImu?(sessionId: string): Promise<unknown>;
  stopListenImu?(sessionId: string): Promise<void>;
};
let native: NativeControl | null = null;
try { if (Platform.OS === 'android') native = requireOptionalNativeModule<NativeControl>('DosoBrainstemGrpc'); } catch { /* Old APK. */ }
const nativeMethods = ['openControl', 'readControlStatus', 'controlAction', 'acquireControl', 'sendControlInput', 'interruptControl', 'closeControl'] as const;
const webDevMethods = ['openLanControl', 'readControlStatus', 'controlAction', 'acquireControl', 'sendControlInput', 'interruptControl', 'closeControl'] as const;

function webDevControl(): NativeControl | null {
  if (typeof __DEV__ === 'undefined' || __DEV__ !== true || Platform.OS !== 'web') return null;
  const candidate = (globalThis as { __dosoWebDevBrainstemBridge?: NativeControl | null }).__dosoWebDevBrainstemBridge;
  return candidate && typeof candidate === 'object' ? candidate : null;
}

function activeControl(): NativeControl | null {
  return Platform.OS === 'android' ? native : webDevControl();
}

export function isBrainstemControlAvailable() {
  if (Platform.OS === 'android') {
    return native !== null && nativeMethods.every(key => typeof native?.[key] === 'function');
  }
  const bridge = webDevControl();
  return bridge !== null && webDevMethods.every(key => typeof bridge[key] === 'function');
}

function client(): NativeControl {
  const bridge = activeControl();
  if (!isBrainstemControlAvailable() || !bridge) throw new BrainstemControlError('native_unavailable', errorMessages.native_unavailable);
  return bridge;
}
async function reply(operation: () => Promise<unknown>) {
  try { return projectBrainstemControlReply(await operation()); } catch (error) { throw safeBrainstemControlError(error); }
}
let requestSequence = 0;
export const brainstemControlTransport: BrainstemControlTransport = {
  async open(endpoint, principal) {
    const checked = validateBrainstemEndpoint(endpoint.host, endpoint.port, endpoint.transport, endpoint.clientIdentityAlias);
    const lanDev = endpoint.transport === 'lan-dev';
    const alias = endpoint.clientIdentityAlias;
    if (!lanDev && (!alias || alias.length > 512 || !/^[a-z][a-z0-9-]*@[a-z][a-z0-9-]*$/.test(principal) || principal.length > 128)) {
      throw new BrainstemControlError('config', errorMessages.config);
    }
    const n = client();
    if (lanDev && typeof n.openLanControl !== 'function') throw new BrainstemControlError('native_unavailable', errorMessages.native_unavailable);
    const requestId = `control-${Date.now()}-${++requestSequence}`;
    let sessionId: string | undefined;
    try {
      const raw = lanDev ? await n.openLanControl!(checked.host, checked.port, requestId)
        : await n.openControl(checked.host, checked.port, alias!, principal, requestId);
      if (!raw || typeof raw !== 'object') invalid();
      const v = raw as Record<string, unknown>;
      if (typeof v.sessionId !== 'string' || !v.sessionId || v.sessionId.length > 128) invalid();
      sessionId = v.sessionId;
      if (lanDev ? v.transport !== 'grpc-lan' || v.mutualTlsVerified !== false || v.clientIdentitySelected !== false || typeof v.sessionPrincipal !== 'string' || !/^lan-[0-9a-f]{32}@dev$/.test(v.sessionPrincipal)
        : v.transport !== 'grpc-mtls' || v.mutualTlsVerified !== true || v.clientIdentitySelected !== true) invalid();
      const projected = projectBrainstemControlReply(v);
      // Status/TLS alone never establishes a control lease or an authorized principal.
      if (projected.leaseActive || projected.principalVerified || projected.leaseOwnerMatched) invalid();
      return { ...projected, sessionId, transport: lanDev ? 'grpc-lan' : 'grpc-mtls', mutualTlsVerified: !lanDev,
        clientIdentitySelected: !lanDev, ...(lanDev ? { sessionPrincipal: v.sessionPrincipal as string } : {}) };
    } catch (error) {
      if (sessionId) await n.closeControl(sessionId).catch(() => undefined);
      throw safeBrainstemControlError(error);
    }
  },
  read: sessionId => reply(() => client().readControlStatus(sessionId)),
  action: (sessionId, action, profileName) => reply(() => client().controlAction(sessionId, action, profileName ?? null)),
  acquire: sessionId => reply(() => client().acquireControl(sessionId)),
  input: (sessionId, forward, lateral, yaw, sampledAtMonotonicMs) => reply(() => {
    const selected = client();
    if (sampledAtMonotonicMs === undefined) return selected.sendControlInput(sessionId, forward, lateral, yaw);
    if (!Number.isSafeInteger(sampledAtMonotonicMs) || sampledAtMonotonicMs < 0) throw new BrainstemControlError('config', errorMessages.config);
    if (typeof selected.sendControlInputAt !== 'function') throw new BrainstemControlError('native_unavailable', errorMessages.native_unavailable);
    return selected.sendControlInputAt(sessionId, forward, lateral, yaw, sampledAtMonotonicMs);
  }),
  async interrupt(sessionId) {
    try {
      const raw = await client().interruptControl(sessionId);
      return raw && typeof raw === 'object' && 'status' in raw ? projectBrainstemControlReply(raw) : null;
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async close(sessionId) { try { await client().closeControl(sessionId); } catch (error) { throw safeBrainstemControlError(error); } },
  async readRecovery(sessionId) {
    try {
      const bridge = client();
      if (typeof bridge.readRecoveryStatus !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      return projectRecovery(await bridge.readRecoveryStatus(sessionId));
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async recoveryCommand(sessionId, command) {
    try {
      const bridge = client();
      if (typeof bridge.recoveryCommand !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      return projectRecovery(await bridge.recoveryCommand(sessionId, command));
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  setRecoveryHeartbeat(sessionId, enabled) {
    const bridge = activeControl();
    if (!bridge || typeof bridge.setRecoveryHeartbeat !== 'function') return;
    void Promise.resolve(bridge.setRecoveryHeartbeat(sessionId, enabled)).catch(() => undefined);
  },
  async listGestures(sessionId) {
    try {
      const bridge = client();
      if (typeof bridge.listGestures !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      const raw = await bridge.listGestures(sessionId);
      const list = raw && typeof raw === 'object' && Array.isArray((raw as { gestures?: unknown }).gestures) ? (raw as { gestures: unknown[] }).gestures : null;
      if (!list || list.length > 64) invalid();
      return list.map(item => {
        const v = item as Record<string, unknown>;
        if (!v || typeof v.name !== 'string' || !v.name || v.name.length > 64) invalid();
        return Object.freeze({
          name: v.name as string,
          description: typeof v.description === 'string' ? v.description.slice(0, 128) : '',
          durationMs: typeof v.durationMs === 'number' && Number.isFinite(v.durationMs) && v.durationMs >= 0 ? Math.round(v.durationMs) : 0,
        });
      });
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async getSpeedMode(sessionId) {
    try {
      const bridge = client();
      if (typeof bridge.getSpeedMode !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      const raw = await bridge.getSpeedMode(sessionId);
      const mode = raw && typeof raw === 'object' ? (raw as { speedMode?: unknown }).speedMode : undefined;
      if (mode !== 'normal' && mode !== 'high') invalid();
      return mode;
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async setSpeedMode(sessionId, mode) {
    try {
      if (mode !== 'normal' && mode !== 'high') throw new BrainstemControlError('config', errorMessages.config);
      const bridge = client();
      if (typeof bridge.setSpeedMode !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      const raw = await bridge.setSpeedMode(sessionId, mode);
      const projected = projectBrainstemControlReply(raw);
      const confirmed = raw && typeof raw === 'object' ? (raw as { speedMode?: unknown }).speedMode : undefined;
      if (confirmed !== mode) invalid();
      return { ...projected, speedMode: mode };
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async getBodyHeightStatus(sessionId) {
    try {
      const bridge = client();
      if (typeof bridge.getBodyHeightStatus !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      const raw = await bridge.getBodyHeightStatus(sessionId);
      const nested = raw && typeof raw === 'object' ? (raw as { bodyHeight?: unknown }).bodyHeight : undefined;
      return projectBodyHeightStatus(nested);
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  async setBodyHeight(sessionId, heightM) {
    try {
      if (typeof heightM !== 'number' || !Number.isFinite(heightM) || heightM < 0.05 || heightM > 1.50) {
        throw new BrainstemControlError('config', errorMessages.config);
      }
      const bridge = client();
      if (typeof bridge.setBodyHeight !== 'function') throw new BrainstemControlError('unimplemented', errorMessages.unimplemented);
      const raw = await bridge.setBodyHeight(sessionId, heightM);
      const projected = projectBrainstemControlReply(raw);
      const nested = raw && typeof raw === 'object' ? (raw as { bodyHeight?: unknown }).bodyHeight : undefined;
      return { ...projected, bodyHeight: projectBodyHeightStatus(nested) };
    } catch (error) { throw safeBrainstemControlError(error); }
  },
  listenImu(sessionId, onSample) {
    const bridge = activeControl();
    if (!bridge || typeof bridge.startListenImu !== 'function' || typeof bridge.stopListenImu !== 'function' || typeof bridge.addListener !== 'function') {
      return () => {};
    }
    let stopped = false;
    const subscription = bridge.addListener('onBrainstemImu', payload => {
      if (stopped || !payload || typeof payload !== 'object') return;
      if ((payload as { sessionId?: unknown }).sessionId !== sessionId) return;
      onSample(payload);
    });
    void bridge.startListenImu(sessionId).catch(() => undefined);
    return () => {
      stopped = true;
      subscription.remove();
      void bridge.stopListenImu!(sessionId).catch(() => undefined);
    };
  },
};
