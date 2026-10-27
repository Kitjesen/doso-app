import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import * as authService from '../services/authService';
import { getAuthSessionOperationSnapshot, runAuthSessionOperation, subscribeAuthSessionOperations } from '../services/authSessionOperation';
import { getSessionIngestionBlock } from '../services/sessionIngestionFence';
import { heartbeatCurrentTerminal, parseAuthSessionId, registerCurrentTerminal } from '../services/sessionService';
import { clearLocalAuthSession, getSupabaseClient, isSupabaseConfigured } from '../services/supabaseClient';
import type { AuthResult, LoginInput, Profile, RegisterInput } from '../types/api';
import {
  canHeartbeatPreparedSession,
  createSessionPreparationTracker,
  getPreparedSessionKey,
  type SessionPreparationTicket,
} from './sessionPreparationCore';

type AuthContextValue = {
  loading: boolean;
  initializationError: Error | null;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  preparedUserId: string | null;
  preparedSessionKey: string | null;
  recovery: boolean;
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  logout(scope?: 'local' | 'global'): Promise<void>;
  logoutLocalSession(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(password: string, nonce?: string): Promise<User>;
  exchangeSessionFromUrl(url: string): Promise<Session>;
  refreshProfile(): Promise<Profile | null>;
  clearRecovery(): void;
  retryInitialization(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRevokedSessionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('session_revoked') || message.includes('session is not active');
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preparedSession, setPreparedSession] = useState<{
    userId: string;
    key: string;
  } | null>(null);
  const [recovery, setRecovery] = useState(false);
  const preparationTracker = useRef(createSessionPreparationTracker());
  const liveSessionRef = useRef<Session | null>(null);
  const livePreparedSessionRef = useRef<{ userId: string; key: string } | null>(null);
  const recoveryIdentityRef = useRef<{ userId: string; sessionId: string | null } | null>(null);
  const retiredRecoveryRevisionRef = useRef<number | null>(null);
  const localExitRef = useRef(false);

  const logoutLocalSession = useCallback(async () => {
    localExitRef.current = true;
    preparationTracker.current.begin(null);
    liveSessionRef.current = null;
    livePreparedSessionRef.current = null;
    recoveryIdentityRef.current = null;
    setPreparedSession(null);
    setSession(null);
    setProfile(null);
    setRecovery(false);
    setLoading(true);
    try {
      await clearLocalAuthSession();
      setInitializationError(null);
      setInitializationAttempt(value => value + 1);
    } catch {
      setInitializationError(new Error('本机登录信息清理失败，请再次点击退出当前账户。'));
      throw new Error('本机登录信息清理失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearRecovery = useCallback(() => {
    const operation = getAuthSessionOperationSnapshot();
    // Retire UI intent for this entered operation, not its SDK/session write.
    // A late recovery notification must not recreate the hint just cleared.
    retiredRecoveryRevisionRef.current = operation.busy ? operation.revision : null;
    recoveryIdentityRef.current = null;
    setRecovery(false);
  }, []);

  const publishPreparedSession = useCallback((value: { userId: string; key: string } | null) => {
    livePreparedSessionRef.current = value;
    setPreparedSession(value);
  }, []);

  const loadProfile = useCallback(async (userId: string | null, expectedReadyKey?: string | null) => {
    if (!userId) {
      setProfile(null);
      return null;
    }
    const ticket = preparationTracker.current.getCurrentTicket();
    const snapshot = getAuthSessionOperationSnapshot();
    if (snapshot.busy || getSessionIngestionBlock(liveSessionRef.current)) return null;
    if (ticket.userId !== userId) return null;
    if (expectedReadyKey && getPreparedSessionKey(ticket) !== expectedReadyKey) return null;
    const nextProfile = await authService.getProfile(userId);
    if (getAuthSessionOperationSnapshot().busy || getAuthSessionOperationSnapshot().revision !== snapshot.revision) return null;
    if (getSessionIngestionBlock(liveSessionRef.current)) return null;
    if (!preparationTracker.current.isCurrent(ticket)) return null;
    if (expectedReadyKey && livePreparedSessionRef.current?.key !== expectedReadyKey) return null;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const prepareSession = useCallback(async (
    nextSession: Session | null,
    ticket: SessionPreparationTicket,
    expectedRevision: number,
    preparationOwner: object,
  ) => {
    const canPrepare = () => !localExitRef.current && preparationTracker.current.isCurrent(ticket)
      && !getAuthSessionOperationSnapshot().busy
      && getAuthSessionOperationSnapshot().revision === expectedRevision
      && !getSessionIngestionBlock(nextSession);
    if (!nextSession || !canPrepare()) return;
    await runAuthSessionOperation(async lease => {
      const operationRevision = getAuthSessionOperationSnapshot().revision;
      const isCurrentPreparation = () => !localExitRef.current && preparationTracker.current.isCurrent(ticket)
        && getAuthSessionOperationSnapshot().owner === preparationOwner
        && getAuthSessionOperationSnapshot().revision === operationRevision
        && !getSessionIngestionBlock(nextSession);
      await registerCurrentTerminal(lease, isCurrentPreparation);
      if (!isCurrentPreparation()) return;
      const nextProfile = await lease.retain(() => authService.getProfile(nextSession.user.id));
      if (!isCurrentPreparation()) return;
      setProfile(nextProfile);
      const key = getPreparedSessionKey(ticket);
      if (key) publishPreparedSession({ userId: nextSession.user.id, key });
    }, { observerOwner: preparationOwner });
  }, [publishPreparedSession]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      // A failed local storage cleanup deliberately keeps client creation
      // blocked. Surface that state without throwing from a React effect or
      // permitting a retry to re-ingest the retained session.
      setInitializationError(new Error('本机登录信息尚未清理完成，请再次点击退出当前账户。'));
      setLoading(false);
      return undefined;
    }
    localExitRef.current = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let needsRefresh = false;
    const preparationOwner = {};
    let lastOperationOwner: object | null = null;
    let lastOperationPreservesPreparation = false;
    setInitializationError(null);
    const invalidate = () => {
      const ticket = preparationTracker.current.begin(null);
      liveSessionRef.current = null;
      publishPreparedSession(null);
      setProfile(null);
      setLoading(true);
      return ticket;
    };

    const runPreparation = (
      nextSession: Session | null,
      ticket: SessionPreparationTicket,
      errorMessage: string,
      expectedRevision: number,
    ) => {
      void prepareSession(nextSession, ticket, expectedRevision, preparationOwner)
        .then(() => {
          if (active && preparationTracker.current.isCurrent(ticket)) {
            setInitializationError(null);
          }
        })
        .catch((error: unknown) => {
          if (active && preparationTracker.current.isCurrent(ticket)) {
            setInitializationError(error instanceof Error ? error : new Error(errorMessage));
          }
        })
        .finally(() => {
          if (active && preparationTracker.current.isCurrent(ticket)) setLoading(false);
        });
    };

    const scheduleFresh = () => {
      needsRefresh = true;
      if (!active || localExitRef.current || refreshTimer !== null || getAuthSessionOperationSnapshot().busy) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (!active || getAuthSessionOperationSnapshot().busy) return;
        needsRefresh = false;
        readFresh();
      }, 0);
    };

    const readFresh = () => {
      if (!active || localExitRef.current) return;
      if (getAuthSessionOperationSnapshot().busy) { scheduleFresh(); return; }
      const initialRequestTicket = invalidate();
      // Reads may refresh/write the SDK session. Own the read without treating
      // our own operation notifications as an external ticket invalidation.
      void runAuthSessionOperation(lease => authService.getSession(lease), { observerOwner: preparationOwner })
      .then((initialSession) => {
        if (!active || !preparationTracker.current.isCurrent(initialRequestTicket)) return;
        const current = getAuthSessionOperationSnapshot();
        // External operations synchronously invalidate this ticket. Use the
        // post-read revision: our own lease has already acquired and released.
        if (current.busy) { scheduleFresh(); return; }
        if (getSessionIngestionBlock(initialSession)) {
          liveSessionRef.current = null;
          setSession(null);
          setRecovery(false);
          setInitializationError(new Error('当前登录会话的安全状态仍待核对，请重新登录。'));
          setLoading(false);
          return;
        }
        const ticket = preparationTracker.current.begin(initialSession?.user.id ?? null);
        publishPreparedSession(null);
        setProfile(null);
        liveSessionRef.current = initialSession;
        setSession(initialSession);
        const hint = recoveryIdentityRef.current;
        setRecovery(Boolean(initialSession && hint?.userId === initialSession.user.id
          && hint.sessionId === parseAuthSessionId(initialSession.access_token)));
        runPreparation(initialSession, ticket, '无法恢复 DOSO 会话。', current.revision);
      })
      .catch((error: unknown) => {
        if (!active || !preparationTracker.current.isCurrent(initialRequestTicket)) return;
        setInitializationError(error instanceof Error ? error : new Error('无法恢复 DOSO 会话。'));
        setLoading(false);
      });
    };

    const unsubscribeOperations = subscribeAuthSessionOperations(() => {
      if (!active || localExitRef.current) return;
      const snapshot = getAuthSessionOperationSnapshot();
      if (snapshot.busy) {
        lastOperationOwner = snapshot.owner;
        lastOperationPreservesPreparation = snapshot.kind === 'session-read' || snapshot.kind === 'factor-write';
        // Reads and incomplete-factor changes still exclude competitors and
        // pause native refresh, but do not replace the requesting screen's
        // prepared session. Actual SDK auth events below always invalidate it.
        // Actual SDK auth events below still invalidate and request fresh data.
        if (snapshot.owner === preparationOwner || lastOperationPreservesPreparation) return;
        invalidate();
        needsRefresh = true;
      } else {
        const preservedPreparation = lastOperationOwner === preparationOwner || lastOperationPreservesPreparation;
        lastOperationOwner = null;
        lastOperationPreservesPreparation = false;
        if (preservedPreparation && !needsRefresh) return;
        if (needsRefresh) scheduleFresh();
      }
    });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active || localExitRef.current) return;
      // Keep only non-secret recovery identity, never replay a captured session.
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        const operation = getAuthSessionOperationSnapshot();
        if (!operation.busy || operation.revision !== retiredRecoveryRevisionRef.current) {
          recoveryIdentityRef.current = { userId: nextSession.user.id, sessionId: parseAuthSessionId(nextSession.access_token) };
        }
      } else if (event === 'SIGNED_OUT') recoveryIdentityRef.current = null;
      invalidate();
      scheduleFresh();
    });
    readFresh();

    return () => {
      active = false;
      preparationTracker.current.begin(null);
      liveSessionRef.current = null;
      livePreparedSessionRef.current = null;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      unsubscribeOperations();
      data.subscription.unsubscribe();
    };
  }, [initializationAttempt, prepareSession, publishPreparedSession]);

  useEffect(() => {
    if (!canHeartbeatPreparedSession(session?.user.id, preparedSession?.userId)) return undefined;
    let active = true;
    const expectedAccessToken = session?.access_token;
    const expectedUserId = session?.user.id;
    const expectedPreparedKey = preparedSession?.key;
    const heartbeatTicket = preparationTracker.current.getCurrentTicket();

    const heartbeat = async () => {
      if (
        !active
        || !preparationTracker.current.isCurrent(heartbeatTicket)
        || liveSessionRef.current?.access_token !== expectedAccessToken
        || liveSessionRef.current?.user.id !== expectedUserId
        || livePreparedSessionRef.current?.userId !== expectedUserId
        || livePreparedSessionRef.current?.key !== expectedPreparedKey
      ) return;
      try {
        await heartbeatCurrentTerminal();
      } catch (error) {
        const liveSession = liveSessionRef.current;
        const livePrepared = livePreparedSessionRef.current;
        if (
          active
          && preparationTracker.current.isCurrent(heartbeatTicket)
          && liveSession?.access_token === expectedAccessToken
          && liveSession?.user.id === expectedUserId
          && livePrepared?.key === expectedPreparedKey
          && livePrepared?.userId === expectedUserId
          && isRevokedSessionError(error)
        ) {
          await authService.logout('local').catch(() => undefined);
        }
      }
    };

    const timer = setInterval(() => void heartbeat(), 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [preparedSession?.key, preparedSession?.userId, session?.access_token, session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      initializationError,
      user: session?.user ?? null,
      session,
      profile,
      preparedUserId: preparedSession?.userId ?? null,
      preparedSessionKey: preparedSession?.key ?? null,
      recovery,
      register: authService.register,
      login: authService.login,
      logout: authService.logout,
      logoutLocalSession,
      forgotPassword: (email) => authService.forgotPassword(email),
      resetPassword: async (password, nonce) => {
        const user = await authService.resetPassword(password, nonce);
        recoveryIdentityRef.current = null;
        setRecovery(false);
        return user;
      },
      exchangeSessionFromUrl: authService.exchangeSessionFromUrl,
      refreshProfile: () => loadProfile(session?.user.id ?? null, preparedSession?.key ?? null),
      clearRecovery,
      retryInitialization: () => setInitializationAttempt((attempt) => attempt + 1),
    }),
    [clearRecovery, initializationError, loadProfile, loading, logoutLocalSession, preparedSession?.key, preparedSession?.userId, profile, recovery, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用。');
  return context;
}
