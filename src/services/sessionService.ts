import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AccountTerminal, AccountTerminalWithCurrent } from '../types/api';
import { readAuthSessionIdentity, type AuthSessionIdentity } from './authSessionIdentity';
import {
  isAuthSessionOperationBusyError,
  runAuthSessionOperation,
  type AuthSessionOperationLease,
} from './authSessionOperation';
import {
  beginSessionRevocation,
  getSessionIngestionBlock,
  markSessionRevocationUnknown,
  markSessionRevoked,
  releaseSessionRevocation,
  type SessionRevocationTicket,
} from './sessionIngestionFence';
import { getSupabaseClient } from './supabaseClient';

export { parseAuthSessionId } from './authSessionIdentity';

const INSTALLATION_ID_KEY = 'doso.installation-id.v1';
const installationMemoryFallback = new Map<string, string>();
let installationIdPromise: Promise<string> | null = null;
const SESSION_REQUEST_TIMEOUT_MS = 15_000;

type SessionRequestOutcome = 'read-timeout' | 'registration-unconfirmed' | 'revocation-unconfirmed' | 'session-cleanup-unconfirmed' | 'identity-unavailable' | 'operation-busy';
const OUTCOME_MESSAGES: Record<SessionRequestOutcome, string> = {
  'identity-unavailable': '无法确认当前登录会话身份，撤销请求尚未发送。请刷新登录状态后重试。',
  'operation-busy': '正在处理登录会话，请等待当前操作完成后再试。',
  'read-timeout': '终端信息读取超时，请检查网络后刷新。',
  'registration-unconfirmed': '终端同步结果无法确认，请刷新后核对登录状态。',
  'revocation-unconfirmed': '终端撤销结果无法确认，请刷新终端列表并核对登录状态，不要重复提交撤销。',
  'session-cleanup-unconfirmed': '终端访问已撤销，但登录会话清理结果无法确认。请核对登录状态，不要重复提交撤销。',
};

export class AccountSessionOutcomeError extends Error {
  constructor(readonly outcome: SessionRequestOutcome) {
    super(OUTCOME_MESSAGES[outcome]);
    this.name = 'AccountSessionOutcomeError';
  }
}

export function isAccountSessionOutcomeError(error: unknown): error is AccountSessionOutcomeError {
  return error instanceof AccountSessionOutcomeError;
}

async function withinSessionDeadline<T>(operation: () => PromiseLike<T>, outcome: SessionRequestOutcome): Promise<T> {
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const deadlineAt = now() + SESSION_REQUEST_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AccountSessionOutcomeError(outcome)), SESSION_REQUEST_TIMEOUT_MS);
  });
  const pending = Promise.resolve().then(operation).then(value => {
    // A busy JS thread may delay the timer. A late response is still unknown.
    if (now() >= deadlineAt) throw new AccountSessionOutcomeError(outcome);
    return value;
  }, error => {
    if (now() >= deadlineAt) throw new AccountSessionOutcomeError(outcome);
    throw error;
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const accountTerminalRpc = {
  register: 'register_account_terminal',
  heartbeat: 'heartbeat_current_terminal',
  revokeSpecific: 'revoke_account_terminal',
  revokeCurrent: 'revoke_current_terminal',
  revokeOthers: 'revoke_other_terminals',
  revokeAll: 'revoke_all_terminals',
} as const;

type PublicTerminal = Omit<AccountTerminal, 'user_id' | 'auth_session_id' | 'user_agent'> & {
  isCurrent?: boolean;
  is_current?: boolean;
};

type AccountSessionsResponse = {
  terminal?: PublicTerminal | null;
  terminals?: PublicTerminal[];
  revoked?: number;
  error?: string | { code?: string; message?: string };
  message?: string;
};

function responseErrorMessage(payload: Pick<AccountSessionsResponse, 'error' | 'message'>) {
  if (typeof payload.error === 'string') return payload.message ? `${payload.error}: ${payload.message}` : payload.error;
  if (payload.error && typeof payload.error === 'object') {
    return [payload.error.code, payload.error.message].filter(Boolean).join(': ') || '终端管理请求失败。';
  }
  return payload.message ?? null;
}

async function invokeAccountSessions(
  body: Record<string, unknown>,
  lease?: AuthSessionOperationLease,
  onDispatch?: () => void,
  canDispatch?: () => boolean,
  accessToken?: string,
): Promise<AccountSessionsResponse> {
  const outcome = body.action === 'list' ? 'read-timeout'
    : String(body.action).startsWith('revoke_') ? 'revocation-unconfirmed' : 'registration-unconfirmed';
  try {
    return await withinSessionDeadline(
      () => {
        if (canDispatch && !canDispatch()) throw new AccountSessionOutcomeError('operation-busy');
        onDispatch?.();
        return lease ? lease.retain(() => invokeAccountSessionsUnbounded(body, accessToken)) : invokeAccountSessionsUnbounded(body, accessToken);
      },
      outcome,
    );
  } catch (error) {
    // Once a revocation request has been dispatched, even an SDK error that
    // resembles a read timeout cannot prove rollback and must never invite a
    // fallback revoke in the caller.
    if (outcome === 'revocation-unconfirmed') {
      if (error instanceof AccountSessionOutcomeError && error.outcome === outcome) throw error;
      throw new AccountSessionOutcomeError(outcome);
    }
    throw error;
  }
}

async function invokeAccountSessionsUnbounded(body: Record<string, unknown>, accessToken?: string): Promise<AccountSessionsResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<AccountSessionsResponse>(
    'account-sessions',
    { body, ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}) },
  );
  if (error) {
    let message = error.message;
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as AccountSessionsResponse;
        message = responseErrorMessage(payload) ?? message;
      } catch {
        // Preserve the SDK error if the response body is not JSON.
      }
    }
    throw new Error(message);
  }
  if (!data) throw new Error('终端管理服务没有返回结果。');
  const responseError = responseErrorMessage(data);
  if (responseError) throw new Error(responseError);
  return data;
}

function normalizeTerminal(terminal: PublicTerminal): AccountTerminalWithCurrent {
  const { isCurrent, is_current, ...rest } = terminal;
  return { ...rest, is_current: Boolean(is_current ?? isCurrent) };
}

function confirmedRevokedCount(response: Pick<AccountSessionsResponse, 'revoked'>): number {
  const count = response.revoked;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new AccountSessionOutcomeError('revocation-unconfirmed');
  }
  return count;
}

function createInstallationId() {
  const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUuid) return randomUuid();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function readInstallationId() {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (typeof localStorage !== 'undefined') return localStorage.getItem(INSTALLATION_ID_KEY);
  return installationMemoryFallback.get(INSTALLATION_ID_KEY) ?? null;
}

async function writeInstallationId(value: string) {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, value);
    return;
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(INSTALLATION_ID_KEY, value);
  else installationMemoryFallback.set(INSTALLATION_ID_KEY, value);
}

export async function getInstallationId() {
  if (!installationIdPromise) {
    installationIdPromise = (async () => {
      const existing = await readInstallationId();
      if (existing) return existing;

      const created = createInstallationId();
      await writeInstallationId(created);
      return created;
    })().catch((error) => {
      installationIdPromise = null;
      throw error;
    });
  }
  return installationIdPromise;
}

function getUserAgent() {
  return typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 512);
}

function getDeviceLabel() {
  if (Platform.OS === 'web') {
    const platform = typeof navigator === 'undefined' ? '' : navigator.platform;
    return (platform ? `Web（${platform}）` : 'Web 浏览器').slice(0, 120);
  }
  if (Platform.OS === 'ios') return `iPhone / iPad（iOS ${String(Platform.Version)}）`;
  if (Platform.OS === 'android') return `Android 终端（Android ${String(Platform.Version)}）`;
  return `${Platform.OS} 终端`;
}

function getAppVersion() {
  return process.env.EXPO_PUBLIC_APP_VERSION?.trim() || '0.0.1';
}

export async function registerCurrentTerminal(
  lease?: AuthSessionOperationLease,
  canDispatch?: () => boolean,
): Promise<AccountTerminalWithCurrent> {
  if (!lease) return runAuthSessionOperation(ownedLease => registerCurrentTerminal(ownedLease, canDispatch));
  const installationId = await getInstallationId();
  if (canDispatch && !canDispatch()) throw new AccountSessionOutcomeError('operation-busy');
  const data = await invokeAccountSessions({
    action: 'register',
    installationId,
    platform: Platform.OS,
    deviceLabel: getDeviceLabel(),
    appVersion: getAppVersion(),
  }, lease, undefined, canDispatch);
  if (!data.terminal) throw new Error('终端登记没有返回终端资料。');
  return normalizeTerminal(data.terminal);
}

export async function heartbeatCurrentTerminal() {
  const data = await invokeAccountSessions({ action: 'heartbeat' });
  if (!data.terminal) throw new Error('session_revoked: 当前终端会话不可用。');
  return normalizeTerminal(data.terminal);
}

export async function listAccountTerminals(): Promise<AccountTerminalWithCurrent[]> {
  return readAccountTerminals();
}

async function readAccountTerminals(lease?: AuthSessionOperationLease, accessToken?: string): Promise<AccountTerminalWithCurrent[]> {
  const data = await invokeAccountSessions({ action: 'list' }, lease, undefined, undefined, accessToken);
  if (!Array.isArray(data.terminals)) throw new Error('终端列表返回结果无法确认，请刷新后重试。');
  return data.terminals.map(normalizeTerminal);
}

async function revoke(
  rpc: 'revoke_current_terminal' | 'revoke_other_terminals' | 'revoke_all_terminals',
  reason: string,
  lease: AuthSessionOperationLease,
  markDispatched: () => void,
  accessToken: string,
) {
  try {
    return await withinSessionDeadline(async () => {
      const request = getSupabaseClient().rpc(rpc, { p_reason: reason })
        .setHeader('Authorization', `Bearer ${accessToken}`);
      markDispatched();
      const { data, error } = await lease.retain(() => request);
      if (error) throw error;
      return confirmedRevokedCount({ revoked: data });
    }, 'revocation-unconfirmed');
  } catch (error) {
    if (error instanceof AccountSessionOutcomeError && error.outcome === 'revocation-unconfirmed') throw error;
    throw new AccountSessionOutcomeError('revocation-unconfirmed');
  }
}

export async function revokeAccountTerminal(terminalId: string, reason = 'user_requested') {
  return runExclusiveRevocation(async (lease, markDispatched, identity, accessToken) => {
    const listed = await invokeAccountSessions({ action: 'list' }, lease, undefined, undefined, accessToken);
    if (!Array.isArray(listed.terminals)) throw new Error('终端列表返回结果无法确认，请刷新后重试。');
    const target = listed.terminals.find((terminal) => terminal.id === terminalId);
    const targetIsExplicitlyOther = target?.is_current === false || target?.isCurrent === false;
    const checkedToken = await readMatchingSessionToken(lease, identity);
    const data = await invokeAccountSessions({
      action: 'revoke_one',
      terminalId,
      reason,
    }, lease, markDispatched, undefined, checkedToken);
    return {
      value: confirmedRevokedCount(data),
      fence: targetIsExplicitlyOther ? 'released' : 'unknown',
    };
  });
}

type RevocationFenceCompletion = 'released' | 'unknown' | 'revoked';

async function captureSessionRevocation(lease: AuthSessionOperationLease) {
  try {
    const result = await lease.retain(() => getSupabaseClient().auth.getSession());
    if (result.error) throw result.error;
    const session = result.data.session;
    const identity = readAuthSessionIdentity(session);
    if (!session || !identity) throw new Error('invalid auth session identity');
    if (getSessionIngestionBlock(session)) {
      throw new AccountSessionOutcomeError('revocation-unconfirmed');
    }
    return { identity, accessToken: session.access_token, ticket: beginSessionRevocation(identity) };
  } catch (error) {
    if (error instanceof AccountSessionOutcomeError) throw error;
    throw new AccountSessionOutcomeError('identity-unavailable');
  }
}

async function readMatchingSessionToken(lease: AuthSessionOperationLease, expectedIdentity: AuthSessionIdentity) {
  try {
    const current = await withinSessionDeadline(
      () => lease.retain(() => getSupabaseClient().auth.getSession()),
      'identity-unavailable',
    );
    if (current.error) throw current.error;
    const session = current.data.session;
    const identity = readAuthSessionIdentity(session);
    if (!session || !identity || identity.userId !== expectedIdentity.userId || identity.sessionId !== expectedIdentity.sessionId) {
      throw new AccountSessionOutcomeError('identity-unavailable');
    }
    // Call-local only: never store credentials in the identity fence or change shared client headers.
    return session.access_token;
  } catch {
    throw new AccountSessionOutcomeError('identity-unavailable');
  }
}

function completeSessionRevocation(ticket: SessionRevocationTicket, completion: RevocationFenceCompletion) {
  if (completion === 'revoked') markSessionRevoked(ticket);
  else if (completion === 'unknown') markSessionRevocationUnknown(ticket);
  else releaseSessionRevocation(ticket);
}

async function runExclusiveRevocation<T>(
  operation: (
    lease: AuthSessionOperationLease,
    markDispatched: () => void,
    identity: AuthSessionIdentity,
    accessToken: string,
  ) => Promise<{ value: T; fence: RevocationFenceCompletion }>,
): Promise<T> {
  try {
    return await runAuthSessionOperation(async (lease) => {
      let ticket: SessionRevocationTicket | null = null;
      let dispatched = false;
      try {
        const captured = await captureSessionRevocation(lease);
        ticket = captured.ticket;
        const result = await operation(lease, () => { dispatched = true; }, captured.identity, captured.accessToken);
        completeSessionRevocation(ticket, result.fence);
        return result.value;
      } catch (error) {
        if (ticket) {
          if (dispatched) markSessionRevocationUnknown(ticket);
          else releaseSessionRevocation(ticket);
        }
        throw error;
      }
    });
  } catch (error) {
    // Busy means no dispatch; keep it typed so App must not try emergency fallback.
    if (isAuthSessionOperationBusyError(error)) throw new AccountSessionOutcomeError('operation-busy');
    throw error;
  }
}

export function revokeCurrentTerminal(reason = 'user_requested') {
  return revokeWithNativeSignOut(accountTerminalRpc.revokeCurrent, 'local', reason);
}

export function revokeOtherTerminals(reason = 'user_requested') {
  return revokeWithNativeSignOut(accountTerminalRpc.revokeOthers, 'others', reason);
}

export function revokeAllTerminals(reason = 'user_requested') {
  return revokeWithNativeSignOut(accountTerminalRpc.revokeAll, 'global', reason);
}

async function completeNativeSignOut(
  lease: AuthSessionOperationLease,
  expectedIdentity: AuthSessionIdentity,
  scope: 'local' | 'others' | 'global',
) {
  // Do not race this SDK call: a late SDK completion can mutate auth storage.
  // Report a confirmed DOSO revocation separately from failed session cleanup.
  try {
    const current = await lease.retain(() => getSupabaseClient().auth.getSession());
    if (current.error) throw current.error;
    if (current.data.session === null) return;
    const currentIdentity = readAuthSessionIdentity(current.data.session);
    if (!currentIdentity) throw new Error('invalid auth session identity');
    if (currentIdentity.userId !== expectedIdentity.userId || currentIdentity.sessionId !== expectedIdentity.sessionId) return;
    const { error } = await getSupabaseClient().auth.signOut({ scope });
    if (error) throw error;
  } catch {
    throw new AccountSessionOutcomeError('session-cleanup-unconfirmed');
  }
}

async function revokeWithNativeSignOut(
  rpc: 'revoke_current_terminal' | 'revoke_other_terminals' | 'revoke_all_terminals',
  scope: 'local' | 'others' | 'global',
  reason: string,
) {
  return runExclusiveRevocation(async (lease, markDispatched, identity, accessToken) => {
    const action = rpc === accountTerminalRpc.revokeCurrent
      ? 'revoke_one'
      : rpc === accountTerminalRpc.revokeOthers
        ? 'revoke_others'
        : 'revoke_all';
    let response: AccountSessionsResponse;
    if (rpc === accountTerminalRpc.revokeCurrent) {
      const terminals = await readAccountTerminals(lease, accessToken);
      const current = terminals.find((terminal) => terminal.is_current);
      if (!current) throw new Error('无法识别当前登录终端。');
      const checkedToken = await readMatchingSessionToken(lease, identity);
      response = await invokeAccountSessions({ action, terminalId: current.id, reason }, lease, markDispatched, undefined, checkedToken);
    } else {
      response = await invokeAccountSessions({ action, reason }, lease, markDispatched, undefined, accessToken);
    }
    // Never turn an absent/malformed DOSO revocation acknowledgement into a
    // successful native sign-out (or a success callback in the security screen).
    const revoked = confirmedRevokedCount(response);
    const localScope = scope === 'global' ? 'local' : scope;
    await completeNativeSignOut(lease, identity, localScope);
    return { value: revoked, fence: scope === 'others' ? 'released' : 'revoked' };
  });
}

/**
 * Emergency logout path for an unavailable Edge runtime. It preserves DOSO
 * access revocation but cannot write the normal Edge audit event, so callers
 * must surface a degraded-security warning to the user.
 */
export async function revokeCurrentTerminalWithoutAudit(reason = 'edge_unavailable_local_logout') {
  return runExclusiveRevocation(async (lease, markDispatched, identity, accessToken) => {
    const revoked = await revoke(accountTerminalRpc.revokeCurrent, reason, lease, markDispatched, accessToken);
    await completeNativeSignOut(lease, identity, 'local');
    return { value: revoked, fence: 'revoked' };
  });
}

export async function revokeAllTerminalsWithoutAudit(reason = 'edge_unavailable_password_change') {
  return runExclusiveRevocation(async (lease, markDispatched, identity, accessToken) => {
    const revoked = await revoke(accountTerminalRpc.revokeAll, reason, lease, markDispatched, accessToken);
    await completeNativeSignOut(lease, identity, 'global');
    return { value: revoked, fence: 'revoked' };
  });
}
