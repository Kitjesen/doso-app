import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { validateBrainstemEndpoint, type BrainstemGrpcEndpoint, type BrainstemGrpcStatus, type BrainstemGrpcProfile } from './brainstemGrpc';

export type BrainstemControlAction = 'enable' | 'disable' | 'stand-up' | 'sit-down' | 'switch-profile';
export type BrainstemControlReply = Readonly<{
  transport?: 'grpc-mtls' | 'grpc-lan';
  status: BrainstemGrpcStatus;
  leaseActive: boolean;
  principalVerified: boolean;
  leaseOwnerMatched?: boolean;
  sequence?: number;
  profile?: BrainstemGrpcProfile;
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
  unavailable: '无法连接机器狗，请检查局域网、服务地址及配对证书。',
};
export function safeBrainstemControlError(error: unknown): BrainstemControlError {
  if (error instanceof BrainstemControlError) return error;
  const raw = error && typeof error === 'object' && 'code' in error ? String(error.code).toLowerCase().replace(/^err_/, '') : '';
  const code = raw in errorMessages ? raw : 'unavailable';
  return new BrainstemControlError(code, errorMessages[code]);
}
function invalid(): never { throw new BrainstemControlError('invalid_response', errorMessages.invalid_response); }
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
  if (v.profile !== undefined) {
    if (!v.profile || typeof v.profile !== 'object') invalid();
    const p = v.profile as Record<string, unknown>;
    const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && !x.includes('\0');
    if (!text(p.current, 128) || !text(p.currentDescription, 512)
      || !Array.isArray(p.available) || !Array.isArray(p.descriptions)
      || p.available.length > 64 || p.descriptions.length > 64
      || !p.available.every(x => text(x, 128)) || !p.descriptions.every(x => text(x, 512))) invalid();
    profile = { current: p.current, currentDescription: p.currentDescription,
      available: [...p.available], descriptions: [...p.descriptions] };
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
};
let native: NativeControl | null = null;
try { if (Platform.OS === 'android') native = requireOptionalNativeModule<NativeControl>('DosoBrainstemGrpc'); } catch { /* Old APK. */ }
const nativeMethods = ['openControl', 'readControlStatus', 'controlAction', 'acquireControl', 'sendControlInput', 'interruptControl', 'closeControl'] as const;
export function isBrainstemControlAvailable() { return Platform.OS === 'android' && native !== null && nativeMethods.every(key => typeof native?.[key] === 'function'); }
function client(): NativeControl {
  if (!isBrainstemControlAvailable()) throw new BrainstemControlError('native_unavailable', errorMessages.native_unavailable);
  return native!;
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
};
