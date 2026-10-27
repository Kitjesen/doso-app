import type { MfaStatus } from '../services/mfaService';

export type MfaVerificationIdentity = {
  userId: string;
  sessionId: string;
};

export type MfaVerificationKind = 'enrollment' | 'step-up';

declare const mfaVerificationTicketBrand: unique symbol;

export type MfaVerificationTicket = Readonly<{
  sequence: number;
  [mfaVerificationTicketBrand]: true;
}>;

export type MfaVerificationReconcileState = {
  identity: MfaVerificationIdentity | null;
  preparedKey: string | null;
  preparedUserId: string | null;
  loading: boolean;
  authorized: boolean;
  active: boolean;
  busy: boolean;
};

export type MfaVerificationDelivery =
  | { kind: MfaVerificationKind; status: MfaStatus }
  | { failed: true };

type MfaVerificationSettlement =
  | { status: MfaStatus }
  | { failed: true };

type Attempt = {
  ticket: MfaVerificationTicket;
  identity: MfaVerificationIdentity;
  preparedKey: string | null;
  kind: MfaVerificationKind;
  settlement: MfaVerificationSettlement | null;
  retired: boolean;
};

export class MfaVerificationFlowBusyError extends Error {
  constructor() {
    super('双重验证正在处理中，请等待当前验证完成。');
    this.name = 'MfaVerificationFlowBusyError';
  }
}

export function isMfaVerificationFlowBusyError(error: unknown): error is MfaVerificationFlowBusyError {
  return error instanceof MfaVerificationFlowBusyError;
}

export function createMfaVerificationFlow() {
  let sequence = 0;
  let attempt: Attempt | null = null;
  let disposed = false;

  const clear = () => {
    attempt = null;
  };

  const fail = (): MfaVerificationDelivery => {
    clear();
    return { failed: true };
  };

  return {
    begin(input: {
      identity: MfaVerificationIdentity;
      preparedKey: string | null;
      kind: MfaVerificationKind;
    }): MfaVerificationTicket {
      if (attempt || disposed) throw new MfaVerificationFlowBusyError();
      const ticket = Object.freeze({ sequence: ++sequence }) as MfaVerificationTicket;
      attempt = {
        ticket,
        identity: { userId: input.identity.userId, sessionId: input.identity.sessionId },
        preparedKey: input.preparedKey,
        kind: input.kind,
        settlement: null,
        retired: false,
      };
      return ticket;
    },
    settle(ticket: MfaVerificationTicket, settlement: MfaVerificationSettlement): boolean {
      if (!attempt || attempt.ticket !== ticket || attempt.settlement) return false;
      attempt.settlement = 'failed' in settlement
        ? { failed: true }
        : { status: settlement.status };
      return true;
    },
    abortBeforeDispatch(ticket: MfaVerificationTicket): boolean {
      if (!attempt || attempt.ticket !== ticket || attempt.settlement) return false;
      clear();
      return true;
    },
    reconcile(state: MfaVerificationReconcileState): MfaVerificationDelivery | null {
      if (!attempt) return null;
      const sameIdentity = state.identity?.userId === attempt.identity.userId
        && state.identity.sessionId === attempt.identity.sessionId;
      if (disposed || !sameIdentity || !state.active) attempt.retired = true;
      if (!attempt.settlement || state.busy || state.loading) return null;
      if (attempt.retired) {
        clear();
        return null;
      }
      if (state.preparedKey !== null && state.preparedKey === attempt.preparedKey) return null;
      if ('failed' in attempt.settlement) return fail();
      if (
        state.preparedKey === null
        || state.preparedUserId !== attempt.identity.userId
        || !state.authorized
        || !attempt.settlement.status.enabled
        || attempt.settlement.status.currentLevel !== 'aal2'
      ) return fail();
      const delivery = { kind: attempt.kind, status: attempt.settlement.status } as const;
      clear();
      return delivery;
    },
    dispose(): void {
      disposed = true;
      if (attempt) attempt.retired = true;
    },
    isPending(): boolean {
      return attempt !== null;
    },
  };
}
