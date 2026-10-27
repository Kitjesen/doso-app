import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSupabaseUrl } from './api.js';
import {
  adminDevicesRequest,
  accountSessionsRequest,
  adminAuthFlow,
  adminUsersRequest,
  mfaAuthRequest,
  normalizeIdentity,
  normalizeTerminal,
  normalizeUser,
  pageFrom,
} from './contracts.js';

const fixture = JSON.parse(await readFile(new URL('./contract.fixture.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const adminUsersSource = await readFile(new URL('../supabase/functions/admin-users/index.ts', import.meta.url), 'utf8');

assert.equal(validateSupabaseUrl('https://project.supabase.co/'), 'https://project.supabase.co');
assert.equal(validateSupabaseUrl('http://localhost:54321'), 'http://localhost:54321');
assert.equal(validateSupabaseUrl('http://127.0.0.1:54321/'), 'http://127.0.0.1:54321');
assert.equal(validateSupabaseUrl('http://[::1]:54321'), 'http://[::1]:54321');
for (const invalidUrl of [
  'http://project.supabase.co',
  'http://127.0.0.2:54321',
  'ftp://localhost',
  'https://user:pass@project.supabase.co',
  'https://project.supabase.co/rest/v1',
  'https://project.supabase.co?key=value',
  'https://project.supabase.co/#fragment',
  'not-a-url',
]) {
  assert.throws(() => validateSupabaseUrl(invalidUrl), { name: 'ApiError' }, invalidUrl);
}

assert.deepEqual(adminUsersRequest.listUsers({ page: 2, perPage: 20, search: 'doso' }), {
  action: 'list_users', page: 2, perPage: 20, search: 'doso',
});
assert.deepEqual(adminUsersRequest.setStatus({ userId: 'user-1', status: 'suspended', reason: 'risk' }), {
  action: 'set_status', userId: 'user-1', status: 'suspended', reason: 'risk',
});
assert.deepEqual(adminUsersRequest.setRole({ userId: 'user-2', role: 'support', reason: '职责调整' }), {
  action: 'set_role', userId: 'user-2', role: 'support', reason: '职责调整',
});
assert.deepEqual(adminUsersRequest.listUserTerminals({ userId: 'user-2' }), {
  action: 'list_user_terminals', userId: 'user-2',
});
assert.deepEqual(adminUsersRequest.listUserIdentities({ userId: 'user-2' }), {
  action: 'list_user_identities', userId: 'user-2',
});
assert.deepEqual(adminUsersRequest.verifyUsername({ userId: 'user-2', reason: '人工复核通过' }), {
  action: 'verify_username', userId: 'user-2', reason: '人工复核通过',
});
assert.deepEqual(adminUsersRequest.revokeUserTerminal({ userId: 'user-2', terminalId: 'terminal-1', reason: '设备遗失' }), {
  action: 'revoke_user_terminal', userId: 'user-2', terminalId: 'terminal-1', reason: '设备遗失',
});
assert.deepEqual(adminDevicesRequest.createInventory({
  serialNumber: 'DOSO-001', modelCode: 'R1', displayName: '巡检一号', category: '四足', environment: '室外',
}), {
  action: 'create_inventory', serialNumber: 'DOSO-001', modelCode: 'R1', displayName: '巡检一号', category: '四足', environment: '室外',
});
assert.deepEqual(adminDevicesRequest.rotateBindingCode({ deviceId: 'device-1' }), {
  action: 'rotate_binding_code', deviceId: 'device-1', expiresInMinutes: 30,
});

const usersPage = pageFrom(fixture.usersResponse, 'users');
assert.equal(usersPage.total, 41);
assert.deepEqual(normalizeUser(usersPage.rows[0]), {
  id: 'user-1', email: 'admin@doso.test', username: 'doso_admin', role: 'admin', status: 'active',
  createdAt: '2026-08-22T00:00:00Z', lastSignInAt: '2026-08-22T01:00:00Z',
});
assert.equal(pageFrom(fixture.devicesResponse, 'devices').total, 1);
assert.equal(fixture.bindingResponse.bindingCode, 'DOSO-ABC123');
assert.deepEqual(fixture.terminalsResponse.terminals.map(normalizeTerminal), [
  {
    id: 'terminal-active', deviceLabel: 'Windows · DOSO App', platform: 'windows',
    lastSeenAt: '2026-08-22T01:30:00Z', createdAt: '2026-08-20T01:00:00Z', revokedAt: null, isCurrent: true,
  },
  {
    id: 'terminal-revoked', deviceLabel: 'Android · DOSO App', platform: 'android',
    lastSeenAt: '2026-08-21T01:30:00Z', createdAt: '2026-08-19T01:00:00Z', revokedAt: '2026-08-22T02:00:00Z', isCurrent: false,
  },
]);
assert.deepEqual(fixture.identitiesResponse.identities.map(normalizeIdentity), [
  {
    registryId: 'identity-safe-1',
    providerKey: 'apple', kind: 'apple', emailVerified: true,
    linkedAt: '2026-08-20T01:00:00Z', lastSignInAt: '2026-08-22T01:00:00Z',
    lastObservedAt: '2026-08-22T01:00:05Z', unlinkedAt: null, status: 'active',
  },
  {
    registryId: 'identity-safe-2',
    providerKey: 'wechat', kind: 'wechat', emailVerified: false,
    linkedAt: '2026-08-18T01:00:00Z', lastSignInAt: '2026-08-19T01:00:00Z',
    lastObservedAt: '2026-08-19T01:00:05Z', unlinkedAt: '2026-08-21T01:00:00Z', status: 'unlinked',
  },
]);
for (const identity of fixture.identitiesResponse.identities) {
  assert.deepEqual(Object.keys(identity).sort(), [
    'email_verified', 'kind', 'last_observed_at', 'linked_at',
    'provider_key', 'provider_last_sign_in_at', 'registry_id', 'status', 'unlinked_at',
  ]);
  for (const forbidden of ['subject', 'subject_hash', 'provider_token', 'identity_data']) {
    assert.equal(Object.hasOwn(identity, forbidden), false, `identity fixture must not expose ${forbidden}`);
  }
}
assert.deepEqual(mfaAuthRequest.challenge('factor/1'), {
  path: '/factors/factor%2F1/challenge', method: 'POST', body: { factorId: 'factor/1' },
});
assert.deepEqual(mfaAuthRequest.verify({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }), {
  path: '/factors/factor-1/verify', method: 'POST', body: { challenge_id: 'challenge-1', code: '123456' },
});
assert.deepEqual(accountSessionsRequest.register({ installationId: 'install-1', deviceLabel: 'Windows · DOSO 管理控制台', appVersion: 'admin-1.0.0' }), {
  action: 'register', installationId: 'install-1', platform: 'web', deviceLabel: 'Windows · DOSO 管理控制台', appVersion: 'admin-1.0.0',
});
assert.deepEqual(adminAuthFlow('aal1'), [
  'login', 'register_terminal', 'validate_session', 'mfa_challenge', 'mfa_verify', 'register_terminal', 'admin',
]);
assert.deepEqual(adminAuthFlow('aal2'), ['login', 'register_terminal', 'validate_session', 'admin']);

for (const id of ['terminalsDialog', 'terminalsUser', 'terminalsBody', 'terminalsEmpty', 'terminalsClose']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing terminal-management DOM node #${id}`);
}
for (const id of ['identitiesDialog', 'identitiesUser', 'identitiesBody', 'identitiesEmpty', 'identitiesClose']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing identity-summary DOM node #${id}`);
}
assert.match(appSource, /button\('查看终端'/, 'users table must expose terminal detail interaction');
assert.match(appSource, /button\('登录方式'/, 'users table must expose identity summary interaction');
assert.match(appSource, /adminUsersRequest\.listUserTerminals/, 'terminal dialog must call list_user_terminals');
assert.match(appSource, /adminUsersRequest\.listUserIdentities/, 'identity dialog must call list_user_identities');
assert.match(appSource, /identity\.kind \|\| identity\.providerKey/, 'broker-specific provider keys must render through their stable Apple, WeChat, or QQ kind');
assert.match(appSource, /\['apple', 'wechat', 'qq'\]\.includes/, 'Apple, WeChat, and QQ summaries must be described as third-party login methods');
assert.doesNotMatch(appSource, /identity\.id/, 'identity UI must not render raw identity ids');
assert.doesNotMatch(appSource, /identity\.(subject|subjectHash|providerToken|identityData)/, 'identity UI must not render sensitive identity fields');
assert.match(appSource, /adminUsersRequest\.revokeUserTerminal/, 'active terminal action must call revoke_user_terminal');
assert.match(appSource, /terminal\.isCurrent/, 'terminal UI must distinguish the current terminal when supplied');
assert.match(appSource, /terminal\.revokedAt/, 'terminal UI must distinguish revoked terminals');
assert.match(appSource, /detail\(user\.username \|\| '未设置用户名', user\.email\)/, 'users table must show username as primary and email as secondary');
assert.match(adminUsersSource, /action === "list_user_identities"/, 'Edge Function must implement list_user_identities');
assert.match(adminUsersSource, /db\.rpc\("admin_list_user_identities", \{\s*p_user_id: targetUserId,/s, 'identity action must call the service-role summary RPC');
assert.match(adminUsersSource, /action === "reconcile_user_identities"/, 'Edge Function must expose the admin-only reconciliation operation');
assert.match(adminUsersSource, /db\.rpc\(\s*"admin_reconcile_user_identities",\s*\{ p_user_id: targetUserId \}/s, 'reconciliation action must call the service-role repair RPC');
assert.match(adminUsersSource, /user\.identities_reconciled[\s\S]*user\.identities_reconciliation_failed/, 'reconciliation must audit both success and failure outcomes');
for (const safeField of ['registry_id', 'provider_key', 'kind', 'email_verified', 'linked_at', 'provider_last_sign_in_at', 'last_observed_at', 'unlinked_at', 'status']) {
  assert.match(adminUsersSource, new RegExp(`${safeField}: identity\\.${safeField}`), `identity response must explicitly project ${safeField}`);
}
assert.doesNotMatch(adminUsersSource, /(subject|subject_hash|provider_token|identity_data): identity\./, 'identity response must not project sensitive provider data');
const adminGateOffset = adminUsersSource.indexOf('requireAdmin(caller.role);');
const verifyUsernameOffset = adminUsersSource.indexOf('action === "verify_username"');
assert.ok(adminGateOffset >= 0 && verifyUsernameOffset > adminGateOffset, 'verify_username must remain behind the admin-only AAL2 boundary');
const verifyUsernameSource = adminUsersSource.slice(
  verifyUsernameOffset,
  adminUsersSource.indexOf('action === "reconcile_user_identities"', verifyUsernameOffset),
);
assert.match(verifyUsernameSource, /db\.rpc\("admin_verify_username", \{\s*p_actor_id: caller\.user\.id,\s*p_actor_role: caller\.role,\s*p_user_id: targetUserId,\s*p_reason: reason,\s*p_request_id: requestId\(request\),\s*\}\)/s, 'verify_username must call the service-role RPC with the exact actor, target, reason, and request contract');
assert.match(verifyUsernameSource, /error\.message\.includes\("profile_not_found"\)[\s\S]*?new HttpError\(404, "user_not_found"/s, 'verify_username must preserve a stable not-found contract across the profile-read/RPC race');
assert.match(verifyUsernameSource, /error\.message\.includes\("username_not_admin_verifiable"\)[\s\S]*?new HttpError\(\s*409,\s*"username_not_admin_verifiable"/s, 'verify_username must expose a stable conflict for non-legacy usernames');
assert.match(verifyUsernameSource, /return json\(\{\s*userId: targetUserId,\s*verified: true,\s*\}\);/s, 'verify_username must return only its minimal safe result');
assert.doesNotMatch(verifyUsernameSource, /from\("profiles"\)\.update/, 'verify_username must never update profiles directly');
assert.doesNotMatch(verifyUsernameSource, /(subject|subject_hash|provider_token|identity_data|access_token|refresh_token)/, 'verify_username must not expose provider subjects or tokens');
assert.match(adminUsersSource, /getUserById\(targetUserId\)/, 'password reset must load the authoritative Auth user');
assert.match(adminUsersSource, /!verifiedEmail \|\| !authUser\.email_confirmed_at/, 'password reset must require a confirmed nonempty Auth email');
assert.match(adminUsersSource, /"verified_email_required"/, 'unverified password reset must have a stable error code');
assert.match(adminUsersSource, /resetPasswordForEmail\(\s*verifiedEmail,/s, 'password reset must send only to the verified Auth email');

console.log('DOSO admin Edge Function contract fixtures PASS');
