import type { AuthenticatorAssuranceLevels, Factor } from '@supabase/supabase-js';

import { type AuthSessionIdentity, readAuthSessionIdentity } from './authSessionIdentity';
import { type AuthSessionOperationLease, runAuthSessionOperation } from './authSessionOperation';
import { getSupabaseClient } from './supabaseClient';

const TOTP_CODE_PATTERN = /^\d{6}$/;
const VALID_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAuthSessionIdentity(value: AuthSessionIdentity | null | undefined): value is AuthSessionIdentity {
  if (!value) return false;
  return VALID_UUID_PATTERN.test(value.userId) && VALID_UUID_PATTERN.test(value.sessionId);
}

function readEnrollmentCurrent(isCurrent: (() => boolean) | null | undefined) {
  if (typeof isCurrent !== 'function') return false;
  try {
    return isCurrent();
  } catch {
    return false;
  }
}

export type MfaStatus = {
  enabled: boolean;
  currentLevel: AuthenticatorAssuranceLevels | null;
  nextLevel: AuthenticatorAssuranceLevels | null;
  verifiedTotpFactors: Factor<'totp', 'verified'>[];
  unverifiedTotpFactorIds: string[];
};

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export class MfaCleanupIdentityError extends Error {
  constructor() {
    super('无法确认当前登录会话，未清理未完成的验证器。');
    this.name = 'MfaCleanupIdentityError';
  }
}

export class MfaEnrollmentIdentityError extends Error {
  constructor() {
    super('无法确认当前登录会话，无法安全继续验证器设置。');
    this.name = 'MfaEnrollmentIdentityError';
  }
}

export class MfaEnrollmentInactiveError extends Error {
  constructor() {
    super('双重验证设置已失效，未创建新的验证器。');
    this.name = 'MfaEnrollmentInactiveError';
  }
}

export async function getMfaStatus(lease?: AuthSessionOperationLease): Promise<MfaStatus> {
  if (!lease) return runAuthSessionOperation(ownedLease => getMfaStatus(ownedLease), { kind: 'session-read' });
  const client = getSupabaseClient();
  // Promise.all may reject before its sibling settles. Retain each actual SDK
  // read independently so outward failure cannot release unfinished work.
  const [factorsResult, assuranceResult] = await Promise.all([
    lease.retain(() => client.auth.mfa.listFactors()),
    lease.retain(() => client.auth.mfa.getAuthenticatorAssuranceLevel()),
  ]);

  if (factorsResult.error) throw factorsResult.error;
  if (assuranceResult.error) throw assuranceResult.error;

  return {
    enabled: factorsResult.data.totp.length > 0,
    currentLevel: assuranceResult.data.currentLevel,
    nextLevel: assuranceResult.data.nextLevel,
    verifiedTotpFactors: factorsResult.data.totp,
    unverifiedTotpFactorIds: factorsResult.data.all
      .filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
      .map((factor) => factor.id),
  };
}

export async function enrollTotp(
  expectedIdentity: AuthSessionIdentity | null | undefined,
  isCurrent: (() => boolean) | null | undefined,
  friendlyName = 'DOSO Authenticator',
): Promise<TotpEnrollment> {
  if (!isValidAuthSessionIdentity(expectedIdentity)) throw new MfaEnrollmentIdentityError();
  if (!readEnrollmentCurrent(isCurrent)) throw new MfaEnrollmentInactiveError();
  const expected = { userId: expectedIdentity.userId, sessionId: expectedIdentity.sessionId } as const;

  return runAuthSessionOperation(async lease => {
    const client = getSupabaseClient();
    const requireExpectedSession = async () => {
      const { data, error } = await lease.retain(() => client.auth.getSession());
      if (error) throw error;
      const actual = readAuthSessionIdentity(data.session);
      if (!actual || actual.userId !== expected.userId || actual.sessionId !== expected.sessionId) {
        throw new MfaEnrollmentIdentityError();
      }
    };

    await requireExpectedSession();
    if (!readEnrollmentCurrent(isCurrent)) throw new MfaEnrollmentInactiveError();
    const { data, error } = await lease.retain(() => client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
      issuer: 'DOSO',
    }));
    if (error) throw error;

    // Once dispatched, a stale screen still needs the factor id to perform its
    // best-effort cleanup, but enrollment material must never cross identities.
    await requireExpectedSession();
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  }, { kind: 'factor-write' });
}

export async function verifyTotpFactor(factorId: string, code: string): Promise<MfaStatus> {
  const normalizedCode = code.replace(/\s/g, '');
  if (!TOTP_CODE_PATTERN.test(normalizedCode)) {
    throw new Error('请输入身份验证器中的 6 位动态验证码。');
  }

  return runAuthSessionOperation(async lease => {
    const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({
      factorId,
      code: normalizedCode,
    });
    if (error) throw error;

    return getMfaStatus(lease);
  });
}

export async function verifyTotpEnrollment(factorId: string, code: string): Promise<MfaStatus> {
  return verifyTotpFactor(factorId, code);
}

/**
 * Removes only an incomplete factor. Verified factors require an explicit,
 * higher-assurance removal flow and are intentionally left untouched here.
 * Identity checks exclude cooperative same-runtime switches, not raw SDK or
 * other-runtime writes after the final check. This is not atomic credential pinning.
 */
export async function cancelUnverifiedTotpEnrollment(
  factorId: string,
  expectedIdentity: AuthSessionIdentity | null | undefined,
): Promise<void> {
  if (!isValidAuthSessionIdentity(expectedIdentity)) {
    throw new MfaCleanupIdentityError();
  }
  const expected = { userId: expectedIdentity.userId, sessionId: expectedIdentity.sessionId } as const;

  return runAuthSessionOperation(async lease => {
    const client = getSupabaseClient();
    const requireExpectedSession = async () => {
      const { data, error } = await lease.retain(() => client.auth.getSession());
      if (error) throw error;
      const actual = readAuthSessionIdentity(data.session);
      if (!actual || actual.userId !== expected.userId || actual.sessionId !== expected.sessionId) {
        throw new MfaCleanupIdentityError();
      }
    };

    await requireExpectedSession();
    const { data, error } = await lease.retain(() => client.auth.mfa.listFactors());
    if (error) throw error;

    const factor = data.all.find((candidate) => candidate.id === factorId);
    if (!factor || factor.factor_type !== 'totp' || factor.status !== 'unverified') return;

    await requireExpectedSession();
    const { error: unenrollError } = await lease.retain(() => client.auth.mfa.unenroll({ factorId }));
    if (unenrollError) throw unenrollError;
  }, { kind: 'factor-write' });
}
