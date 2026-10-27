import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';

export type BrainstemGrpcEndpoint = { host: string; port: number; clientIdentityAlias?: string; transport?: 'tls' | 'lan-dev' };
export type BrainstemGrpcTlsEvidence = Readonly<{
  mutualTlsVerified?: boolean;
  clientIdentitySelected?: boolean;
  clientCertificateSha256?: string;
}>;
type LocalClientIdentityFields = Readonly<{
  version: 1;
  requestId: string;
  host: string;
  port: number;
  robotId: string;
  identityAlias: string;
  csrPem: string;
  publicKeySha256: string;
  securityLevel: 'hardware' | 'software' | 'unknown';
  requestFile: string;
  approvalFile: string;
}>;
export type BrainstemLocalClientIdentity = LocalClientIdentityFields & (
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ready'; principal: string; clientCertificateSha256: string; caCertificateSha256: string }>
);
export type BrainstemGrpcStatus = {
  fsmKind: 'zero' | 'grounded' | 'standing' | 'walking' | 'transitioning';
  transition: 'none' | 'stand_up' | 'sit_down' | 'gesture';
  motorOutputEnabled: boolean;
  owner: 'none' | 'grpc' | 'yunzhuo';
  criticalMotorFault: boolean;
  grpcLeaseActive: boolean;
  readyForWalk: boolean;
};
export type BrainstemGrpcProfile = Readonly<{
  current: string;
  available: readonly string[];
  descriptions: readonly string[];
  currentDescription: string;
}>;
export type BrainstemGrpcVoltage = Readonly<{ values: readonly number[] }>;
export type BrainstemGrpcMotorState = Readonly<{
  id: number;
  online: boolean;
  statusCode: number;
  temperatureC: number;
  voltageV: number;
  positionRad: number;
  velocityRps: number;
  torqueNm: number;
  errors: readonly number[];
}>;
export type BrainstemGrpcObservation = BrainstemGrpcTlsEvidence & {
  source: 'brainstem.grpc.direct';
  observedAt: string;
  transport: 'grpc-tls' | 'grpc-lan';
  status: BrainstemGrpcStatus;
  profile?: BrainstemGrpcProfile;
  voltage?: BrainstemGrpcVoltage;
  motors?: readonly BrainstemGrpcMotorState[];
  motionAuthorized: false;
  cloudBindingVerified: false;
};
export type BrainstemGrpcProfileObservation = BrainstemGrpcTlsEvidence & {
  source: 'brainstem.grpc.profile';
  observedAt: string;
  transport: 'grpc-tls' | 'grpc-lan';
  profile: BrainstemGrpcProfile;
  motionAuthorized: false;
  cloudBindingVerified: false;
};
export type BrainstemGrpcVoltageObservation = BrainstemGrpcTlsEvidence & {
  source: 'brainstem.grpc.voltage';
  observedAt: string;
  transport: 'grpc-tls' | 'grpc-lan';
  voltage: BrainstemGrpcVoltage;
  motionAuthorized: false;
  cloudBindingVerified: false;
};
export type BrainstemGrpcMotorObservation = BrainstemGrpcTlsEvidence & {
  source: 'brainstem.grpc.motor-status';
  observedAt: string;
  transport: 'grpc-tls' | 'grpc-lan';
  motors: readonly BrainstemGrpcMotorState[];
  motionAuthorized: false;
  cloudBindingVerified: false;
};
export type BrainstemGrpcErrorCode =
  | 'config' | 'native_unavailable' | 'busy' | 'background' | 'cancelled' | 'timeout'
  | 'identity_unavailable' | 'identity_timeout' | 'unauthorized' | 'invalid_response' | 'unimplemented' | 'unavailable';

const messages: Record<BrainstemGrpcErrorCode, string> = {
  config: '请输入有效的机器人主机名或 IP 地址及 1–65535 端口。',
  native_unavailable: '此版本未包含 Android 原生 gRPC 模块，请安装支持该功能的 Android 安装包。',
  busy: '已有连接或身份操作正在进行。',
  background: '请在应用前台完成连接检查。',
  cancelled: '状态读取已取消。',
  timeout: '读取超时（3 秒），请检查机器人网络与服务端口。',
  identity_unavailable: '连接身份当前不可用，请检查本机授权或重新选择系统证书。',
  identity_timeout: '身份准备超时，请重试读取已有申请。',
  unauthorized: '服务端拒绝读取，请检查客户端证书授权。',
  invalid_response: '机器人返回了无法验证的状态数据。',
  unimplemented: '机器人服务尚未提供此项查询，请检查服务配置与版本。',
  unavailable: '无法建立安全的 gRPC 连接，请检查网络、服务端口、TLS 信任与证书主机名。',
};

/** Only fixed messages cross the UI boundary; native/server exception details are discarded. */
export class BrainstemGrpcError extends Error {
  readonly code: BrainstemGrpcErrorCode;
  constructor(code: BrainstemGrpcErrorCode) {
    super(messages[code]);
    this.name = 'BrainstemGrpcError';
    this.code = code;
  }
}

type NativeGrpc = {
  lanDevAvailable?: boolean;
  setControlNavigationHidden?: (hidden: boolean) => Promise<number>;
  chooseClientIdentity(host: string, port: number): Promise<string | null>;
  getLocalClientIdentity?: (host: string, port: number, robotId: string) => Promise<unknown>;
  prepareLocalClientIdentity?: (host: string, port: number, robotId: string, requestId: string) => Promise<unknown>;
  completeLocalClientIdentity?: (host: string, port: number, robotId: string, requestId: string) => Promise<unknown>;
  cancelLocalClientIdentity?: () => Promise<void>;
  readStatus(host: string, port: number, alias: string | null, requestId: string): Promise<unknown>;
  readProfile?: (host: string, port: number, alias: string | null, requestId: string) => Promise<unknown>;
  readVoltage?: (host: string, port: number, alias: string | null, requestId: string) => Promise<unknown>;
  readMotorStatus?: (host: string, port: number, alias: string | null, requestId: string) => Promise<unknown>;
  readLanStatus?: (host: string, port: number, requestId: string) => Promise<unknown>;
  readLanProfile?: (host: string, port: number, requestId: string) => Promise<unknown>;
  readLanVoltage?: (host: string, port: number, requestId: string) => Promise<unknown>;
  readLanMotorStatus?: (host: string, port: number, requestId: string) => Promise<unknown>;
  cancelStatus(requestId: string): Promise<void>;
};

let nativeGrpc: NativeGrpc | null = null;
try {
  if (Platform.OS === 'android') nativeGrpc = requireOptionalNativeModule<NativeGrpc>('DosoBrainstemGrpc');
} catch {
  // Old APKs and unsupported runtimes can load this screen without a native-module exception.
}

export function isBrainstemGrpcAvailable(): boolean {
  return Platform.OS === 'android' && nativeGrpc !== null &&
    typeof nativeGrpc.readStatus === 'function' && typeof nativeGrpc.cancelStatus === 'function' &&
    typeof nativeGrpc.chooseClientIdentity === 'function';
}

export function isBrainstemLocalIdentityAvailable(): boolean {
  return isBrainstemGrpcAvailable() && typeof nativeGrpc?.getLocalClientIdentity === 'function' &&
    typeof nativeGrpc.prepareLocalClientIdentity === 'function' && typeof nativeGrpc.completeLocalClientIdentity === 'function' &&
    typeof nativeGrpc.cancelLocalClientIdentity === 'function';
}

export function isBrainstemLanAvailable(): boolean {
  return isBrainstemGrpcAvailable() && nativeGrpc?.lanDevAvailable === true && typeof nativeGrpc.readLanStatus === 'function';
}

export async function setControlNavigationHidden(hidden: boolean): Promise<number> {
  if (Platform.OS !== 'android' || typeof nativeGrpc?.setControlNavigationHidden !== 'function') return 0;
  try {
    const inset = await nativeGrpc.setControlNavigationHidden(hidden);
    return Number.isFinite(inset) && inset >= 0 && inset <= 128 ? inset : 0;
  } catch { return 0; } // An older window API must not block control-page navigation.
}

export function validateBrainstemEndpoint(host: string, port: string | number, transport?: 'tls' | 'lan-dev', alias?: string): { host: string; port: number } {
  if (typeof host !== 'string' || (typeof port !== 'string' && typeof port !== 'number')) throw new BrainstemGrpcError('config');
  let normalized = host.trim().toLowerCase();
  const portText = String(port).trim();
  if (!/^[0-9]{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535 || !normalized || normalized.length > 253) {
    throw new BrainstemGrpcError('config');
  }
  if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1);
  if (normalized.includes(':')) {
    if (!/^[a-f0-9:.]+$/.test(normalized)) throw new BrainstemGrpcError('config');
    try {
      const parsed = new URL(`https://[${normalized}]/`);
      normalized = parsed.hostname.replace(/^\[|\]$/g, '');
    } catch { throw new BrainstemGrpcError('config'); }
    // Android's Inet6Address treats IPv4-mapped addresses as IPv4; use the unambiguous IPv4 form.
    if (/^::ffff:/.test(normalized)) throw new BrainstemGrpcError('config');
  } else if (/^[0-9.]+$/.test(normalized)) {
    const parts = normalized.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) {
      throw new BrainstemGrpcError('config');
    }
  } else if (normalized.split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new BrainstemGrpcError('config');
  }
  if (transport !== undefined && transport !== 'tls' && transport !== 'lan-dev') throw new BrainstemGrpcError('config');
  if (transport === 'lan-dev') {
    const parts = normalized.split('.').map(Number);
    if (alias !== undefined || !/^[0-9.]+$/.test(normalized) || parts.length !== 4 ||
      !(parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168)) throw new BrainstemGrpcError('config');
  }
  return { host: normalized, port: Number(portText) };
}

function nativeOrThrow(): NativeGrpc {
  if (!isBrainstemGrpcAvailable()) throw new BrainstemGrpcError('native_unavailable');
  return nativeGrpc!;
}

function safeError(value: unknown): BrainstemGrpcError {
  if (value instanceof BrainstemGrpcError) return value;
  const code = value && typeof value === 'object' && 'code' in value ? value.code : null;
  return new BrainstemGrpcError(typeof code === 'string' && Object.hasOwn(messages, code)
    ? code as BrainstemGrpcErrorCode : 'unavailable');
}

let readActive = false;
let identityActive = false;

function waitForPickerForeground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove(); reject(new BrainstemGrpcError('background'));
    }, 3000);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      clearTimeout(timer); subscription.remove(); resolve();
    });
    if (AppState.currentState === 'active') { clearTimeout(timer); subscription.remove(); resolve(); }
  });
}

/** Opens Android's user-controlled picker for an already installed KeyChain identity.
 * The alias is session-only; the private key remains an OS-backed native handle.
 */
export async function chooseBrainstemClientIdentity(host: string, port: number): Promise<string | null> {
  const endpoint = validateBrainstemEndpoint(host, port);
  const native = nativeOrThrow();
  if (readActive || identityActive) throw new BrainstemGrpcError('busy');
  if (AppState.currentState !== 'active') throw new BrainstemGrpcError('background');
  identityActive = true;
  try {
    const alias = await native.chooseClientIdentity(endpoint.host, endpoint.port);
    // Native resume and RN AppState delivery can arrive on adjacent JS turns.
    await waitForPickerForeground();
    if (alias === null) return null;
    if (typeof alias !== 'string' || alias.length < 1 || alias.length > 512) throw new BrainstemGrpcError('invalid_response');
    return alias;
  } catch (error) { throw safeError(error); }
  finally { identityActive = false; }
}

type LocalIdentityOptions = { host: string; port: number; robotId: string; signal?: AbortSignal };
const requestIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const fingerprintPattern = /^[a-fA-F0-9]{64}$/;

function projectedLocalIdentity(value: unknown, target: { host: string; port: number; robotId: string }, requestId?: string): BrainstemLocalClientIdentity {
  if (!value || typeof value !== 'object') throw new BrainstemGrpcError('invalid_response');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !['pending', 'ready'].includes(v.status as string) ||
    v.host !== target.host || v.port !== target.port || v.robotId !== target.robotId ||
    typeof v.requestId !== 'string' || !requestIdPattern.test(v.requestId) || (requestId !== undefined && v.requestId !== requestId) ||
    typeof v.identityAlias !== 'string' || !/^local:[A-Za-z0-9_-]{1,506}$/.test(v.identityAlias) ||
    typeof v.csrPem !== 'string' || v.csrPem.length > 65536 ||
    !/^-----BEGIN CERTIFICATE REQUEST-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE REQUEST-----\r?\n?$/.test(v.csrPem) ||
    typeof v.publicKeySha256 !== 'string' || !fingerprintPattern.test(v.publicKeySha256) ||
    !['hardware', 'software', 'unknown'].includes(v.securityLevel as string)) throw new BrainstemGrpcError('invalid_response');
  for (const [field, folder] of [['requestFile', 'requests'], ['approvalFile', 'approved']] as const) {
    if (typeof v[field] !== 'string' || !['files', 'no_backup'].some(prefix => v[field] === `${prefix}/brainstem-pairing/${folder}/${v.requestId}.json`)) {
      throw new BrainstemGrpcError('invalid_response');
    }
  }
  const fields: LocalClientIdentityFields = {
    version: 1, requestId: v.requestId, host: target.host, port: target.port, robotId: target.robotId,
    identityAlias: v.identityAlias, csrPem: v.csrPem, publicKeySha256: v.publicKeySha256.toLowerCase(),
    securityLevel: v.securityLevel as LocalClientIdentityFields['securityLevel'], requestFile: v.requestFile as string, approvalFile: v.approvalFile as string,
  };
  if (v.status === 'pending') return Object.freeze({ ...fields, status: 'pending' });
  if (typeof v.principal !== 'string' || !/^[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}$/.test(v.principal) ||
    typeof v.clientCertificateSha256 !== 'string' || !fingerprintPattern.test(v.clientCertificateSha256) ||
    typeof v.caCertificateSha256 !== 'string' || !fingerprintPattern.test(v.caCertificateSha256)) throw new BrainstemGrpcError('invalid_response');
  return Object.freeze({ ...fields, status: 'ready', principal: v.principal,
    clientCertificateSha256: v.clientCertificateSha256.toLowerCase(), caCertificateSha256: v.caCertificateSha256.toLowerCase() });
}

function localIdentityOperation(kind: 'get' | 'prepare' | 'complete', options: LocalIdentityOptions & { requestId?: string }): Promise<BrainstemLocalClientIdentity | null> {
  const endpoint = validateBrainstemEndpoint(options.host, options.port);
  if (typeof options.robotId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.robotId) ||
    (kind !== 'get' && (typeof options.requestId !== 'string' || !requestIdPattern.test(options.requestId)))) throw new BrainstemGrpcError('config');
  if (!isBrainstemLocalIdentityAvailable()) throw new BrainstemGrpcError('native_unavailable');
  const native = nativeOrThrow(), signal = options.signal;
  if (signal?.aborted) throw new BrainstemGrpcError('cancelled');
  if (readActive || identityActive) throw new BrainstemGrpcError('busy');
  if (AppState.currentState !== 'active') throw new BrainstemGrpcError('background');
  identityActive = true;
  return new Promise((resolve, reject) => {
    let done = false, dispatched = false, cancellationSent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: { remove(): void } | undefined;
    const cancelNative = () => {
      if (!dispatched || cancellationSent) return;
      cancellationSent = true;
      try { void Promise.resolve(native.cancelLocalClientIdentity!()).catch(() => {}); } catch { /* Fixed cancellation boundary. */ }
    };
    const finish = (error?: BrainstemGrpcError, value?: BrainstemLocalClientIdentity | null) => {
      if (done) return;
      done = true; clearTimeout(timer); subscription?.remove(); signal?.removeEventListener('abort', abort);
      if (error) { cancelNative(); reject(error); } else resolve(value ?? null);
    };
    const abort = () => finish(new BrainstemGrpcError('cancelled'));
    subscription = AppState.addEventListener('change', state => { if (state !== 'active') finish(new BrainstemGrpcError('background')); });
    if (done) subscription.remove();
    else timer = setTimeout(() => finish(new BrainstemGrpcError('identity_timeout')), 30000);
    if (!done) signal?.addEventListener('abort', abort, { once: true });
    void Promise.resolve().then(async () => {
      if (done || signal?.aborted) { identityActive = false; abort(); return; }
      if (AppState.currentState !== 'active') { identityActive = false; finish(new BrainstemGrpcError('background')); return; }
      dispatched = true;
      const value = kind === 'get' ? await native.getLocalClientIdentity!(endpoint.host, endpoint.port, options.robotId)
        : kind === 'prepare' ? await native.prepareLocalClientIdentity!(endpoint.host, endpoint.port, options.robotId, options.requestId!)
          : await native.completeLocalClientIdentity!(endpoint.host, endpoint.port, options.robotId, options.requestId!);
      if (done) { identityActive = false; return; }
      if (signal?.aborted) { identityActive = false; abort(); return; }
      if (AppState.currentState !== 'active') { identityActive = false; finish(new BrainstemGrpcError('background')); return; }
      const identity = value === null && kind === 'get' ? null : projectedLocalIdentity(value, { ...endpoint, robotId: options.robotId }, kind === 'complete' ? options.requestId : undefined);
      if (kind === 'complete' && identity?.status !== 'ready') throw new BrainstemGrpcError('invalid_response');
      identityActive = false; finish(undefined, identity);
    }).catch(error => {
      // Cancellation retires the result; the native key operation still owns its slot until settled.
      identityActive = false;
      const failure = safeError(error);
      finish(failure.code === 'timeout' ? new BrainstemGrpcError('identity_timeout') : failure);
    });
  });
}

export async function getBrainstemLocalClientIdentity(options: LocalIdentityOptions): Promise<BrainstemLocalClientIdentity | null> {
  return localIdentityOperation('get', options);
}
export async function prepareBrainstemLocalClientIdentity(options: LocalIdentityOptions & { requestId: string }): Promise<BrainstemLocalClientIdentity> {
  return (await localIdentityOperation('prepare', options))!;
}
export async function completeBrainstemLocalClientIdentity(options: LocalIdentityOptions & { requestId: string }): Promise<BrainstemLocalClientIdentity> {
  const identity = (await localIdentityOperation('complete', options))!;
  if (identity.status !== 'ready') throw new BrainstemGrpcError('invalid_response');
  return identity;
}

export async function cancelBrainstemLocalClientIdentity(): Promise<void> {
  if (Platform.OS !== 'android' || typeof nativeGrpc?.cancelLocalClientIdentity !== 'function') return;
  try { await nativeGrpc.cancelLocalClientIdentity(); } catch (error) { throw safeError(error); }
}

function projectedTlsEvidence(value: unknown, alias?: string, transport?: 'tls' | 'lan-dev'): BrainstemGrpcTlsEvidence {
  const v = value as Record<string, unknown>;
  if (transport === 'lan-dev') {
    if (v.transport !== 'grpc-lan' || v.mutualTlsVerified !== false || v.clientIdentitySelected !== false || v.clientCertificateSha256 !== undefined) throw new BrainstemGrpcError('invalid_response');
    return { mutualTlsVerified: false, clientIdentitySelected: false };
  }
  if (v.transport !== undefined && v.transport !== 'grpc-tls') throw new BrainstemGrpcError('invalid_response');
  if (!Object.hasOwn(v, 'mutualTlsVerified') && !Object.hasOwn(v, 'clientCertificateSha256')) return {};
  if (typeof v.mutualTlsVerified !== 'boolean' || (v.mutualTlsVerified && (!alias || typeof v.clientCertificateSha256 !== 'string' || !fingerprintPattern.test(v.clientCertificateSha256))) ||
    (!v.mutualTlsVerified && v.clientCertificateSha256 !== undefined)) throw new BrainstemGrpcError('invalid_response');
  return v.mutualTlsVerified ? { mutualTlsVerified: true, clientCertificateSha256: (v.clientCertificateSha256 as string).toLowerCase() } : { mutualTlsVerified: false };
}

function projectedStatus(value: unknown, requestId: string): BrainstemGrpcStatus {
  if (!value || typeof value !== 'object' || !('requestId' in value) || value.requestId !== requestId || !('status' in value)) {
    throw new BrainstemGrpcError('invalid_response');
  }
  const status = value.status;
  if (!status || typeof status !== 'object') throw new BrainstemGrpcError('invalid_response');
  const s = status as Record<string, unknown>;
  if (!['zero', 'grounded', 'standing', 'walking', 'transitioning'].includes(s.fsmKind as string) ||
    !['none', 'stand_up', 'sit_down', 'gesture'].includes(s.transition as string) ||
    !['none', 'grpc', 'yunzhuo'].includes(s.owner as string) ||
    ['motorOutputEnabled', 'criticalMotorFault', 'grpcLeaseActive', 'readyForWalk'].some(key => typeof s[key] !== 'boolean')) {
    throw new BrainstemGrpcError('invalid_response');
  }
  return {
    fsmKind: s.fsmKind as BrainstemGrpcStatus['fsmKind'], transition: s.transition as BrainstemGrpcStatus['transition'],
    motorOutputEnabled: s.motorOutputEnabled as boolean, owner: s.owner as BrainstemGrpcStatus['owner'],
    criticalMotorFault: s.criticalMotorFault as boolean, grpcLeaseActive: s.grpcLeaseActive as boolean,
    readyForWalk: s.readyForWalk as boolean,
  };
}

function safeProfileString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\u0000')) {
    throw new BrainstemGrpcError('invalid_response');
  }
  return value;
}

function projectedProfile(value: unknown, requestId: string): BrainstemGrpcProfile {
  if (!value || typeof value !== 'object' || !('requestId' in value) || value.requestId !== requestId || !('profile' in value)) {
    throw new BrainstemGrpcError('invalid_response');
  }
  const profile = value.profile;
  if (!profile || typeof profile !== 'object') throw new BrainstemGrpcError('invalid_response');
  const p = profile as Record<string, unknown>;
  if (!Array.isArray(p.available) || !Array.isArray(p.descriptions) || p.available.length > 64 || p.descriptions.length > 64) {
    throw new BrainstemGrpcError('invalid_response');
  }
  const available = p.available.map(item => safeProfileString(item, 128));
  const descriptions = p.descriptions.map(item => safeProfileString(item, 512));
  return Object.freeze({
    current: safeProfileString(p.current, 128),
    available: Object.freeze(available),
    descriptions: Object.freeze(descriptions),
    currentDescription: safeProfileString(p.currentDescription, 512),
  });
}

function finiteNumber(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BrainstemGrpcError('invalid_response');
  }
  return value;
}

function projectedVoltage(value: unknown, requestId: string): BrainstemGrpcVoltage {
  if (!value || typeof value !== 'object' || !('requestId' in value) || value.requestId !== requestId || !('voltage' in value)) {
    throw new BrainstemGrpcError('invalid_response');
  }
  const voltage = value.voltage;
  if (!voltage || typeof voltage !== 'object' || !Array.isArray((voltage as Record<string, unknown>).values)) throw new BrainstemGrpcError('invalid_response');
  const values = (voltage as Record<string, unknown>).values as unknown[];
  if (values.length > 32) throw new BrainstemGrpcError('invalid_response');
  return Object.freeze({ values: Object.freeze(values.map(item => finiteNumber(item, 0, 1000))) });
}

function projectedMotorStatus(value: unknown, requestId: string): readonly BrainstemGrpcMotorState[] {
  if (!value || typeof value !== 'object' || !('requestId' in value) || value.requestId !== requestId || !('motors' in value)) {
    throw new BrainstemGrpcError('invalid_response');
  }
  const motors = value.motors;
  if (!Array.isArray(motors) || motors.length > 32) throw new BrainstemGrpcError('invalid_response');
  const seen = new Set<number>();
  return Object.freeze(motors.map(item => {
    if (!item || typeof item !== 'object') throw new BrainstemGrpcError('invalid_response');
    const motor = item as Record<string, unknown>;
    const id = finiteNumber(motor.id, 0, 255);
    if (!Number.isInteger(id) || seen.has(id)) throw new BrainstemGrpcError('invalid_response');
    seen.add(id);
    if (typeof motor.online !== 'boolean' || !Array.isArray(motor.errors) || motor.errors.length > 64) throw new BrainstemGrpcError('invalid_response');
    return Object.freeze({
      id,
      online: motor.online,
      statusCode: finiteNumber(motor.statusCode, 0, 0xffffffff),
      temperatureC: finiteNumber(motor.temperatureC, -100, 300),
      voltageV: finiteNumber(motor.voltageV, 0, 1000),
      positionRad: finiteNumber(motor.positionRad, -1000, 1000),
      velocityRps: finiteNumber(motor.velocityRps, -10000, 10000),
      torqueNm: finiteNumber(motor.torqueNm, -10000, 10000),
      errors: Object.freeze(motor.errors.map(error => {
        const code = finiteNumber(error, 0, 0xffffffff);
        if (!Number.isInteger(code)) throw new BrainstemGrpcError('invalid_response');
        return code;
      })),
    });
  }));
}

function readNativeUnary<T>(options: {
  endpoint: BrainstemGrpcEndpoint;
  requestId: string;
  signal?: AbortSignal;
}, invoke: (native: NativeGrpc, host: string, port: number, alias: string | null, requestId: string) => Promise<unknown>, project: (value: unknown, requestId: string) => T, lanMethod: 'readLanStatus' | 'readLanProfile' | 'readLanVoltage' | 'readLanMotorStatus'): Promise<T> {
  const endpoint = validateBrainstemEndpoint(options.endpoint.host, options.endpoint.port, options.endpoint.transport, options.endpoint.clientIdentityAlias);
  const native = nativeOrThrow();
  if (options.endpoint.transport === 'lan-dev' && (!isBrainstemLanAvailable() || typeof native[lanMethod] !== 'function')) throw new BrainstemGrpcError('native_unavailable');
  const { requestId, signal } = options;
  const alias = options.endpoint.clientIdentityAlias;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId) ||
    (alias !== undefined && (typeof alias !== 'string' || alias.length < 1 || alias.length > 512))) throw new BrainstemGrpcError('config');
  if (signal?.aborted) throw new BrainstemGrpcError('cancelled');
  if (readActive || identityActive) throw new BrainstemGrpcError('busy');
  if (AppState.currentState !== 'active') throw new BrainstemGrpcError('background');
  readActive = true;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let dispatched = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: { remove(): void } | undefined;
    const finish = (error?: BrainstemGrpcError, value?: T) => {
      if (done) return;
      done = true;
      readActive = false;
      clearTimeout(timer);
      subscription?.remove();
      signal?.removeEventListener('abort', abort);
      if (error) {
        if (dispatched) {
          try { void Promise.resolve(native.cancelStatus(requestId)).catch(() => {}); } catch { /* no raw errors */ }
        }
        reject(error);
      } else resolve(value!);
    };
    const abort = () => finish(new BrainstemGrpcError('cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') finish(new BrainstemGrpcError('background'));
    });
    timer = setTimeout(() => finish(new BrainstemGrpcError('timeout')), 3000);
    if (signal?.aborted) { abort(); return; }
    if (AppState.currentState !== 'active') { finish(new BrainstemGrpcError('background')); return; }
    void Promise.resolve().then(async () => {
      if (done) return;
      dispatched = true;
      const value = options.endpoint.transport === 'lan-dev'
        ? await native[lanMethod]!(endpoint.host, endpoint.port, requestId)
        : await invoke(native, endpoint.host, endpoint.port, alias ?? null, requestId);
      if (done) return;
      if (signal?.aborted) { abort(); return; }
      if (AppState.currentState !== 'active') { finish(new BrainstemGrpcError('background')); return; }
      finish(undefined, project(value, requestId));
    }).catch(error => finish(safeError(error)));
  });
}

/** A one-shot, foreground-only direct gRPC status read. No control/lease API exists here. */
export async function readBrainstemGrpcStatus(options: {
  endpoint: BrainstemGrpcEndpoint;
  requestId: string;
  signal?: AbortSignal;
}): Promise<BrainstemGrpcObservation> {
  const { status, ...tls } = await readNativeUnary(options, (native, host, port, alias, requestId) => native.readStatus(host, port, alias, requestId),
    (value, requestId) => ({ status: projectedStatus(value, requestId), ...projectedTlsEvidence(value, options.endpoint.clientIdentityAlias, options.endpoint.transport) }), 'readLanStatus');
  return {
    source: 'brainstem.grpc.direct', observedAt: new Date().toISOString(), transport: options.endpoint.transport === 'lan-dev' ? 'grpc-lan' : 'grpc-tls', status, ...tls,
    motionAuthorized: false, cloudBindingVerified: false,
  };
}

/**
 * Read the Brainstem profile catalogue without opening SwitchProfile. The
 * profile is metadata only; it never grants control or changes the robot.
 */
export async function readBrainstemGrpcProfile(options: {
  endpoint: BrainstemGrpcEndpoint;
  requestId: string;
  signal?: AbortSignal;
}): Promise<BrainstemGrpcProfileObservation> {
  const native = nativeOrThrow();
  if (options.endpoint.transport === 'lan-dev' ? typeof native.readLanProfile !== 'function' : typeof native.readProfile !== 'function') throw new BrainstemGrpcError('native_unavailable');
  const { profile, ...tls } = await readNativeUnary(options, (bridge, host, port, alias, requestId) => bridge.readProfile!(host, port, alias, requestId),
    (value, requestId) => ({ profile: projectedProfile(value, requestId), ...projectedTlsEvidence(value, options.endpoint.clientIdentityAlias, options.endpoint.transport) }), 'readLanProfile');
  return {
    source: 'brainstem.grpc.profile', observedAt: new Date().toISOString(), transport: options.endpoint.transport === 'lan-dev' ? 'grpc-lan' : 'grpc-tls', profile, ...tls,
    motionAuthorized: false, cloudBindingVerified: false,
  };
}

export async function readBrainstemGrpcVoltage(options: {
  endpoint: BrainstemGrpcEndpoint;
  requestId: string;
  signal?: AbortSignal;
}): Promise<BrainstemGrpcVoltageObservation> {
  const native = nativeOrThrow();
  if (options.endpoint.transport === 'lan-dev' ? typeof native.readLanVoltage !== 'function' : typeof native.readVoltage !== 'function') throw new BrainstemGrpcError('native_unavailable');
  const { voltage, ...tls } = await readNativeUnary(options, (bridge, host, port, alias, requestId) => bridge.readVoltage!(host, port, alias, requestId),
    (value, requestId) => ({ voltage: projectedVoltage(value, requestId), ...projectedTlsEvidence(value, options.endpoint.clientIdentityAlias, options.endpoint.transport) }), 'readLanVoltage');
  return {
    source: 'brainstem.grpc.voltage', observedAt: new Date().toISOString(), transport: options.endpoint.transport === 'lan-dev' ? 'grpc-lan' : 'grpc-tls', voltage, ...tls,
    motionAuthorized: false, cloudBindingVerified: false,
  };
}

export async function readBrainstemGrpcMotorStatus(options: {
  endpoint: BrainstemGrpcEndpoint;
  requestId: string;
  signal?: AbortSignal;
}): Promise<BrainstemGrpcMotorObservation> {
  const native = nativeOrThrow();
  if (options.endpoint.transport === 'lan-dev' ? typeof native.readLanMotorStatus !== 'function' : typeof native.readMotorStatus !== 'function') throw new BrainstemGrpcError('native_unavailable');
  const { motors, ...tls } = await readNativeUnary(options, (bridge, host, port, alias, requestId) => bridge.readMotorStatus!(host, port, alias, requestId),
    (value, requestId) => ({ motors: projectedMotorStatus(value, requestId), ...projectedTlsEvidence(value, options.endpoint.clientIdentityAlias, options.endpoint.transport) }), 'readLanMotorStatus');
  return {
    source: 'brainstem.grpc.motor-status', observedAt: new Date().toISOString(), transport: options.endpoint.transport === 'lan-dev' ? 'grpc-lan' : 'grpc-tls', motors, ...tls,
    motionAuthorized: false, cloudBindingVerified: false,
  };
}
