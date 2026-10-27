import { getSupabaseClient } from './supabaseClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]{16,1024}$/;
const PHASES = new Set(['challenge_issued', 'identity_verified', 'completed', 'invalidated', 'expired']);

export type DeviceEnrollmentPhase =
  | 'challenge_issued'
  | 'identity_verified'
  | 'completed'
  | 'invalidated'
  | 'expired';

/**
 * A short-lived, in-memory enrollment challenge. The nonce is deliberately
 * never persisted or logged; it is retained here only so a future native BLE
 * attestation adapter can bind its proof to this exact server challenge.
 */
export type DeviceEnrollmentSession = Readonly<{
  enrollmentId: string;
  challengeId: string;
  nonceB64url: string;
  deviceId: string;
  ownerAccountId: string;
  terminalId: string;
  authSessionId: string;
  authorityVersion: number;
  authorizationEpoch: number;
  factoryResetCounter: number;
  deviceEventSequence: number;
  phase: DeviceEnrollmentPhase;
  version: number;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export type DeviceEnrollmentErrorCode =
  | 'config'
  | 'unauthorized'
  | 'robot_not_ready'
  | 'enrollment_context_changed'
  | 'network'
  | 'unavailable'
  | 'invalid_response';

const ERROR_MESSAGES: Record<DeviceEnrollmentErrorCode, string> = {
  config: '设备身份验证请求参数无效。',
  unauthorized: '当前登录会话无权发起设备身份验证。',
  robot_not_ready: '机器人尚未完成制造身份登记，暂时不能进行可信绑定。',
  enrollment_context_changed: '设备身份验证挑战已过期或会话已变化，请重新发起。',
  network: '暂时无法连接设备身份验证服务，请检查网络后重试。',
  unavailable: '设备身份验证服务暂时不可用。',
  invalid_response: '设备身份验证服务返回了无法验证的结果。',
};

export class DeviceEnrollmentError extends Error {
  readonly code: DeviceEnrollmentErrorCode;

  constructor(code: DeviceEnrollmentErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'DeviceEnrollmentError';
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function readErrorCode(value: unknown): DeviceEnrollmentErrorCode | null {
  if (!record(value)) return null;
  const direct = typeof value.code === 'string' ? value.code : null;
  const nested = record(value.error) && typeof value.error.code === 'string' ? value.error.code : null;
  const code = direct ?? nested;
  return code && Object.hasOwn(ERROR_MESSAGES, code)
    ? code as DeviceEnrollmentErrorCode
    : null;
}

function parseSession(value: unknown): DeviceEnrollmentSession {
  if (!record(value)
    || typeof value.enrollment_id !== 'string' || !UUID.test(value.enrollment_id)
    || typeof value.challenge_id !== 'string' || !UUID.test(value.challenge_id)
    || typeof value.device_id !== 'string' || !UUID.test(value.device_id)
    || typeof value.owner_account_id !== 'string' || !UUID.test(value.owner_account_id)
    || typeof value.terminal_id !== 'string' || !UUID.test(value.terminal_id)
    || typeof value.auth_session_id !== 'string' || !UUID.test(value.auth_session_id)
    || typeof value.nonce_b64url !== 'string' || !B64URL.test(value.nonce_b64url)
    || !safeInteger(value.authority_version, 1)
    || !safeInteger(value.authorization_epoch)
    || !safeInteger(value.factory_reset_counter)
    || !safeInteger(value.device_event_sequence)
    || typeof value.phase !== 'string' || !PHASES.has(value.phase)
    || !safeInteger(value.version, 1)
    || !safeInteger(value.issued_at_ms, 1)
    || !safeInteger(value.expires_at_ms, 1)
    || value.expires_at_ms <= value.issued_at_ms) {
    throw new DeviceEnrollmentError('invalid_response');
  }

  return Object.freeze({
    enrollmentId: value.enrollment_id,
    challengeId: value.challenge_id,
    nonceB64url: value.nonce_b64url,
    deviceId: value.device_id,
    ownerAccountId: value.owner_account_id,
    terminalId: value.terminal_id,
    authSessionId: value.auth_session_id,
    authorityVersion: value.authority_version,
    authorizationEpoch: value.authorization_epoch,
    factoryResetCounter: value.factory_reset_counter,
    deviceEventSequence: value.device_event_sequence,
    phase: value.phase as DeviceEnrollmentPhase,
    version: value.version,
    issuedAtMs: value.issued_at_ms,
    expiresAtMs: value.expires_at_ms,
  });
}

export function parseDeviceEnrollmentResponse(value: unknown): DeviceEnrollmentSession {
  if (!record(value) || !Object.hasOwn(value, 'enrollment')) {
    throw new DeviceEnrollmentError('invalid_response');
  }
  return parseSession(value.enrollment);
}

export function enrollmentErrorCode(value: unknown): DeviceEnrollmentErrorCode {
  if (value instanceof DeviceEnrollmentError) return value.code;
  const code = readErrorCode(value);
  if (code) return code;
  if (value instanceof TypeError) return 'network';
  if (value instanceof Error && /network|fetch|edge function|socket|timeout/i.test(value.message)) return 'network';
  return 'unavailable';
}

function errorFromResponse(value: unknown): DeviceEnrollmentError {
  const code = readErrorCode(value);
  return new DeviceEnrollmentError(code ?? 'unavailable');
}

export async function beginDeviceEnrollment(
  deviceId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DeviceEnrollmentSession> {
  if (typeof deviceId !== 'string' || !UUID.test(deviceId)) {
    throw new DeviceEnrollmentError('config');
  }

  try {
    const { data, error } = await getSupabaseClient().functions.invoke<{ enrollment?: unknown }>('device-enrollment', {
      body: { action: 'begin', deviceId },
      signal: options.signal,
      timeout: options.timeoutMs,
    });
    if (error) {
      const context = 'context' in error ? error.context : null;
      if (context instanceof Response) {
        try {
          const body = await context.clone().json() as unknown;
          throw errorFromResponse(body);
        } catch (responseError) {
          if (responseError instanceof DeviceEnrollmentError) throw responseError;
        }
      }
      throw new DeviceEnrollmentError(enrollmentErrorCode(error));
    }
    return parseDeviceEnrollmentResponse(data);
  } catch (error) {
    if (error instanceof DeviceEnrollmentError) throw error;
    throw new DeviceEnrollmentError(enrollmentErrorCode(error));
  }
}
