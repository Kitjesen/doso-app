export type AccountTransitionState = {
  status: "active" | "suspended";
  applicationAccess: "active" | "blocked";
  authSync: "synchronized" | "failed" | "unbanned";
  reconciliationRequired: boolean;
  retryable?: boolean;
  revokedTerminals?: number;
};

export class AccountStateSyncError extends Error {
  readonly code: string;
  readonly state: AccountTransitionState;

  constructor(
    code: string,
    message: string,
    state: AccountTransitionState,
    cause: unknown,
  ) {
    super(message);
    this.name = "AccountStateSyncError";
    this.code = code;
    this.state = state;
    Object.defineProperty(this, "cause", { value: cause, enumerable: false });
  }
}

export async function suspendAccountFailSafe(dependencies: {
  blockDoso: () => Promise<number>;
  banAuth: () => Promise<void>;
}): Promise<AccountTransitionState> {
  const revokedTerminals = await dependencies.blockDoso();
  try {
    await dependencies.banAuth();
  } catch (cause) {
    throw new AccountStateSyncError(
      "auth_ban_sync_failed",
      "DOSO access is blocked, but the Auth ban could not be synchronized. Retry this action to reconcile Auth.",
      {
        status: "suspended",
        applicationAccess: "blocked",
        authSync: "failed",
        reconciliationRequired: true,
        retryable: true,
        revokedTerminals,
      },
      cause,
    );
  }
  return {
    status: "suspended",
    applicationAccess: "blocked",
    authSync: "synchronized",
    reconciliationRequired: false,
    revokedTerminals,
  };
}

export async function activateAccountFailSafe(dependencies: {
  currentStatus: "active" | "suspended";
  unbanAuth: () => Promise<void>;
  activateDoso: () => Promise<void>;
}): Promise<AccountTransitionState> {
  const applicationAccess = dependencies.currentStatus === "active"
    ? "active"
    : "blocked";
  try {
    await dependencies.unbanAuth();
  } catch (cause) {
    throw new AccountStateSyncError(
      "auth_unban_sync_failed",
      "The Auth ban could not be removed. DOSO access remains unchanged; retry this action.",
      {
        status: dependencies.currentStatus,
        applicationAccess,
        authSync: "failed",
        reconciliationRequired: true,
        retryable: true,
      },
      cause,
    );
  }
  try {
    await dependencies.activateDoso();
  } catch (cause) {
    throw new AccountStateSyncError(
      "doso_activation_failed",
      "Auth was unbanned, but DOSO access remains unchanged. Retry this action to finish activation.",
      {
        status: dependencies.currentStatus,
        applicationAccess,
        authSync: "unbanned",
        reconciliationRequired: true,
        retryable: true,
      },
      cause,
    );
  }
  return {
    status: "active",
    applicationAccess: "active",
    authSync: "synchronized",
    reconciliationRequired: false,
  };
}
