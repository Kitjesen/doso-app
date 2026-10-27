export const adminUsersRequest = Object.freeze({
  listUsers: ({ page, perPage, search = '' }) => ({ action: 'list_users', page, perPage, search }),
  listAuditLogs: ({ page, perPage, targetUserId } = {}) => ({
    action: 'list_audit_logs', page, perPage, ...(targetUserId ? { targetUserId } : {}),
  }),
  setStatus: ({ userId, status, reason }) => ({ action: 'set_status', userId, status, reason }),
  sendPasswordReset: ({ userId, reason }) => ({ action: 'send_password_reset', userId, reason }),
  globalSignout: ({ userId, reason }) => ({ action: 'global_signout', userId, reason }),
  setRole: ({ userId, role, reason }) => ({ action: 'set_role', userId, role, reason }),
  listUserTerminals: ({ userId }) => ({ action: 'list_user_terminals', userId }),
  listUserIdentities: ({ userId }) => ({ action: 'list_user_identities', userId }),
  verifyUsername: ({ userId, reason }) => ({ action: 'verify_username', userId, ...(reason ? { reason } : {}) }),
  revokeUserTerminal: ({ userId, terminalId, reason }) => ({
    action: 'revoke_user_terminal', userId, terminalId, reason,
  }),
});

export const adminDevicesRequest = Object.freeze({
  listDevices: ({ page, perPage, search = '' }) => ({ action: 'list_devices', page, perPage, search }),
  createInventory: ({ serialNumber, modelCode, displayName, category, environment }) => ({
    action: 'create_inventory', serialNumber, modelCode, displayName, category, environment,
  }),
  rotateBindingCode: ({ deviceId, expiresInMinutes = 30, code }) => ({
    action: 'rotate_binding_code', deviceId, expiresInMinutes, ...(code ? { code } : {}),
  }),
  unbind: ({ deviceId, reason }) => ({ action: 'unbind', deviceId, reason }),
});

export const mfaAuthRequest = Object.freeze({
  user: () => ({ path: '/user', method: 'GET' }),
  challenge: (factorId) => ({
    path: `/factors/${encodeURIComponent(factorId)}/challenge`,
    method: 'POST',
    body: { factorId },
  }),
  verify: ({ factorId, challengeId, code }) => ({
    path: `/factors/${encodeURIComponent(factorId)}/verify`,
    method: 'POST',
    body: { challenge_id: challengeId, code },
  }),
});

export const accountSessionsRequest = Object.freeze({
  register: ({ installationId, deviceLabel, appVersion }) => ({
    action: 'register', installationId, platform: 'web', deviceLabel, appVersion,
  }),
});

export function adminAuthFlow(aal = 'aal1') {
  return aal === 'aal2'
    ? ['login', 'register_terminal', 'validate_session', 'admin']
    : ['login', 'register_terminal', 'validate_session', 'mfa_challenge', 'mfa_verify', 'register_terminal', 'admin'];
}

export function pageFrom(result, collectionName) {
  const rows = Array.isArray(result?.[collectionName]) ? result[collectionName] : [];
  return { rows, total: Number(result?.pagination?.total ?? rows.length) };
}

export function normalizeUser(user) {
  const profile = user?.profile || {};
  return {
    id: user?.id,
    email: user?.email,
    username: profile.username || '',
    role: profile.app_role || 'user',
    status: profile.account_status || (user?.bannedUntil ? 'suspended' : 'active'),
    createdAt: user?.createdAt,
    lastSignInAt: user?.lastSignInAt,
  };
}

export function normalizeAuditLog(log) {
  return {
    createdAt: log?.created_at,
    actorId: log?.actor_user_id,
    action: log?.action,
    targetId: log?.target_user_id || log?.resource_id,
    targetType: log?.resource_type,
    reason: log?.metadata?.reason,
    status: log?.metadata?.outcome || log?.metadata?.status || 'success',
  };
}

export function normalizeTerminal(terminal) {
  return {
    id: terminal?.id,
    deviceLabel: terminal?.device_label || terminal?.deviceLabel || terminal?.label || terminal?.device_name,
    platform: terminal?.platform,
    lastSeenAt: terminal?.last_seen_at || terminal?.lastSeenAt,
    createdAt: terminal?.created_at || terminal?.createdAt || terminal?.first_seen_at,
    revokedAt: terminal?.revoked_at || terminal?.revokedAt || null,
    isCurrent: terminal?.is_current === true || terminal?.current === true,
  };
}

export function normalizeIdentity(identity) {
  return {
    registryId: identity?.registry_id || '',
    providerKey: identity?.provider_key || '',
    kind: identity?.kind || '',
    emailVerified: identity?.email_verified === true,
    linkedAt: identity?.linked_at || null,
    lastSignInAt: identity?.provider_last_sign_in_at || null,
    lastObservedAt: identity?.last_observed_at || null,
    unlinkedAt: identity?.unlinked_at || null,
    status: identity?.status || 'active',
  };
}
