import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const url = required('SUPABASE_URL').replace(/\/$/, '');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');

const admin = client(serviceRoleKey);
const createdUserIds = [];
const runId = randomUUID();
const usernameSuffix = runId.replaceAll('-', '').slice(0, 12);
const password = `DosoIdentity-${randomUUID()}!`;
const userAEmail = `identity-a-${runId}@doso.test`;
const userBEmail = `identity-b-${runId}@doso.test`;
const userCEmail = `identity-c-${runId}@doso.test`;
const userDEmail = `identity-d-${runId}@doso.test`;
const registrationUsername = `registered_${usernameSuffix}`;
const contestedUsername = `race_${usernameSuffix}`;
const winnerOtherUsername = `other_${usernameSuffix}`;
const loserUsername = `loser_${usernameSuffix}`;
const blockedUsername = `blocked_${usernameSuffix}`;
const identityKeys = [
  'registry_id',
  'provider_key',
  'kind',
  'email_verified',
  'linked_at',
  'provider_last_sign_in_at',
  'last_observed_at',
  'unlinked_at',
  'status',
].sort();

let primaryError;
const cleanupErrors = [];

try {
  const userAId = await createConfirmedUser(userAEmail, 'Hosted Identity A', registrationUsername);
  await createConfirmedUser(userBEmail, 'Hosted Identity B');
  const userCId = await createConfirmedUser(userCEmail, 'Hosted Identity C');
  const userDId = await createConfirmedUser(userDEmail, 'Hosted Identity D');

  const userA = await login(userAEmail);
  const userB = await login(userBEmail);
  const userC = await login(userCEmail);
  const userD = await login(userDEmail);

  await assertUnregisteredSessionDenied(userB);
  await registerTerminal(userA, `identity-a-${runId}`, 'Hosted identity A');
  await registerTerminal(userB, `identity-b-${runId}`, 'Hosted identity B');
  await registerTerminal(userC, `identity-c-${runId}`, 'Hosted identity C');
  await registerTerminal(userD, `identity-d-${runId}`, 'Hosted identity D');

  const methodA = await loadOnlyLoginMethod(userA);
  const methodB = await loadOnlyLoginMethod(userB);
  const methodC = await loadOnlyLoginMethod(userC);
  const methodD = await loadOnlyLoginMethod(userD);
  assertCanonicalEmailMethod(methodA);
  assertCanonicalEmailMethod(methodB);
  assertCanonicalEmailMethod(methodC);
  assertCanonicalEmailMethod(methodD);
  assert.equal(
    new Set([methodA.registry_id, methodB.registry_id, methodC.registry_id, methodD.registry_id]).size,
    4,
    'each account must expose only its own identity registry row',
  );
  await assertOrdinaryUserCannotListAdminIdentities(userA, userDId);

  await assertExplicitRegistrationUsernameIsClaimed(userA);
  await assertInitialUsernameIsSafelyUnclaimed(userB);
  await assertInitialUsernameIsSafelyUnclaimed(userC);
  const userDInitialProfile = await assertInitialUsernameIsSafelyUnclaimed(userD);
  const { winner, loser } = await assertConcurrentUsernameClaim(userB, userC);
  await assertUsernameClaimIsIdempotent(winner);
  await assertClaimedUsernameCannotChange(winner);
  await assertLoserCanClaimDistinctUsername(loser);
  await assertAdminUsernameVerification(userAId, userDId, userD, userDInitialProfile.username);
  await assertRevokedTerminalLosesIdentityRpcAccess(userB);
  await assertSuspendedAccountLosesIdentityRpcAccess(userC, userCId);

  console.log('PASS unregistered sessions cannot call protected identity RPCs');
  console.log('PASS hosted identity RPC returns the canonical token-free email method contract');
  console.log('PASS hosted identity RPC isolates each account registry');
  console.log('PASS explicit registration usernames are claimed while inferred fallbacks remain unclaimed');
  console.log('PASS concurrent username claims have one winner and one stable username_taken result');
  console.log('PASS winning claims are idempotent and immutable; losing accounts can claim a distinct name');
  console.log('PASS admin username verification is authorized, correlated and audit-idempotent');
  console.log('PASS revoked terminals and suspended accounts lose identity RPC access');
} catch (error) {
  primaryError = error;
} finally {
  for (const userId of createdUserIds) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw safeBackendError('temporary identity-test user cleanup failed', error);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

if (primaryError) {
  if (cleanupErrors.length) {
    throw new AggregateError([primaryError, ...cleanupErrors], 'Hosted identity verification and cleanup failed');
  }
  throw primaryError;
}
if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Hosted identity verification cleanup failed');

function client(key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function createConfirmedUser(email, displayName, username) {
  const userMetadata = { display_name: displayName };
  if (username) userMetadata.username = username;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error) throw safeBackendError('temporary confirmed user creation failed', error);
  assert.ok(data.user?.id, 'temporary confirmed user must be created');
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function login(email) {
  const instance = client(publishableKey);
  const { data, error } = await instance.auth.signInWithPassword({ email, password });
  if (error) throw safeBackendError('temporary user login failed', error);
  assert.ok(data.session, 'temporary user login must return a session');
  return instance;
}

async function registerTerminal(instance, installationId, deviceLabel) {
  const { data, error } = await instance.rpc('register_account_terminal', {
    p_installation_id: installationId,
    p_platform: 'android',
    p_device_label: deviceLabel,
    p_app_version: 'identity-hosted-test',
    p_user_agent: 'DOSO hosted identity verification',
  });
  if (error) throw safeBackendError('terminal registration failed', error);
  const terminal = Array.isArray(data) ? data[0] : data;
  assert.ok(terminal?.id, 'terminal registration must return a terminal');
}

async function assertUnregisteredSessionDenied(instance) {
  const methods = await instance.rpc('list_my_login_methods');
  assertExpectedRpcError(
    methods.error,
    'P0001',
    /current session is not active|account_or_session_inactive/i,
    'list_my_login_methods must deny an unregistered authenticated session',
  );

  const claim = await instance.rpc('claim_username', { p_username: contestedUsername });
  assertExpectedRpcError(
    claim.error,
    'P0001',
    /account_or_session_inactive/i,
    'claim_username must deny an unregistered authenticated session',
  );
}

async function loadOnlyLoginMethod(instance) {
  const { data, error } = await instance.rpc('list_my_login_methods');
  if (error) throw safeBackendError('canonical identity RPC is unavailable or incompatible', error);
  assert.ok(Array.isArray(data), 'list_my_login_methods must return an array');
  assert.equal(data.length, 1, 'a password account must expose exactly one active email login method');
  return data[0];
}

function assertCanonicalEmailMethod(method) {
  assert.deepEqual(Object.keys(method).sort(), identityKeys, 'identity RPC keys must match the canonical client contract exactly');
  assert.match(method.registry_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(method.provider_key, 'email');
  assert.equal(method.kind, 'email');
  assert.equal(method.email_verified, true);
  assertIsoTimestamp(method.linked_at, 'linked_at');
  if (method.provider_last_sign_in_at !== null) {
    assertIsoTimestamp(method.provider_last_sign_in_at, 'provider_last_sign_in_at');
  }
  assertIsoTimestamp(method.last_observed_at, 'last_observed_at');
  assert.equal(method.unlinked_at, null, 'an active email login method must not be tombstoned');
  assert.equal(method.status, 'active');

  const serialized = JSON.stringify(method).toLowerCase();
  assert.doesNotMatch(
    serialized,
    /subject|token|secret|password|identity_data|provider_id/,
    'identity RPC output must not expose subjects, tokens, secrets or provider payloads',
  );
}

async function assertInitialUsernameIsSafelyUnclaimed(instance) {
  const profile = await loadUsernameState(instance);
  assert.equal(typeof profile.username, 'string', 'a provisional username must preserve uniqueness while onboarding is pending');
  assert.match(profile.username, /^[a-z0-9_]{3,24}$/);
  assert.equal(profile.username_provenance, 'legacy_inferred', 'an email fallback without explicit username evidence must be inferred, not claimed');
  assert.equal(profile.username_claimed_at, null, 'an inferred fallback username must remain unclaimed');
  return profile;
}

async function assertOrdinaryUserCannotListAdminIdentities(instance, targetUserId) {
  const { error } = await instance.rpc('admin_list_user_identities', { p_user_id: targetUserId });
  assertExpectedRpcError(
    error,
    '42501',
    /permission denied|service_role_required/i,
    'an ordinary authenticated user must not invoke the admin identity inventory RPC',
  );
}

async function assertExplicitRegistrationUsernameIsClaimed(instance) {
  const profile = await loadUsernameState(instance);
  assert.equal(profile.username, registrationUsername);
  assert.equal(profile.username_provenance, 'registration', 'an explicit email registration username must retain trusted provenance');
  assertIsoTimestamp(profile.username_claimed_at, 'username_claimed_at');
}

async function assertConcurrentUsernameClaim(userB, userC) {
  const results = await Promise.all([
    userB.rpc('claim_username', { p_username: ` ${contestedUsername.toUpperCase()} ` }),
    userC.rpc('claim_username', { p_username: ` ${contestedUsername.toUpperCase()} ` }),
  ]);
  const attempts = results.map((result, index) => ({ ...result, instance: index === 0 ? userB : userC }));
  const successes = attempts.filter(({ error }) => !error);
  const failures = attempts.filter(({ error }) => error);

  assert.equal(successes.length, 1, 'exactly one concurrent username claim must succeed');
  assert.equal(failures.length, 1, 'exactly one concurrent username claim must fail');
  assert.equal(successes[0].data, contestedUsername, 'the winning claim must normalize the requested username');
  assertExpectedRpcError(
    failures[0].error,
    'P0001',
    /^username_taken$/i,
    'the losing concurrent claim must return the stable username_taken error',
  );

  const winnerProfile = await loadUsernameState(successes[0].instance);
  assert.equal(winnerProfile.username, contestedUsername);
  assert.equal(winnerProfile.username_provenance, 'manual_claim', 'the winning claim must transition to manual provenance');
  assertIsoTimestamp(winnerProfile.username_claimed_at, 'username_claimed_at');

  const loserProfile = await loadUsernameState(failures[0].instance);
  assert.equal(loserProfile.username_provenance, 'legacy_inferred', 'the losing claim must preserve inferred provenance');
  assert.equal(loserProfile.username_claimed_at, null, 'the losing claim must preserve the unclaimed marker');

  return { winner: successes[0].instance, loser: failures[0].instance };
}

async function assertUsernameClaimIsIdempotent(instance) {
  const { data, error } = await instance.rpc('claim_username', {
    p_username: contestedUsername.toUpperCase(),
  });
  if (error) throw safeBackendError('same-value username claim was not idempotent', error);
  assert.equal(data, contestedUsername);
}

async function assertClaimedUsernameCannotChange(instance) {
  const { error } = await instance.rpc('claim_username', { p_username: winnerOtherUsername });
  assertExpectedRpcError(
    error,
    'P0001',
    /username_already_claimed/i,
    'a claimed account must not rename through the one-time claim RPC',
  );
}

async function assertLoserCanClaimDistinctUsername(instance) {
  const { data, error } = await instance.rpc('claim_username', {
    p_username: ` ${loserUsername.toUpperCase()} `,
  });
  if (error) throw safeBackendError('the losing account could not claim a distinct username', error);
  assert.equal(data, loserUsername, 'the losing account must be able to claim a normalized distinct username');
  const profile = await loadUsernameState(instance);
  assert.equal(profile.username, loserUsername);
  assert.equal(profile.username_provenance, 'manual_claim');
  assertIsoTimestamp(profile.username_claimed_at, 'username_claimed_at');
}

async function assertAdminUsernameVerification(actorUserId, targetUserId, targetClient, expectedUsername) {
  const requestId = `identity-hosted-${runId}`;
  const repeatedRequestId = `identity-hosted-repeat-${runId}`;
  const args = {
    p_actor_id: actorUserId,
    p_actor_role: 'admin',
    p_user_id: targetUserId,
    p_reason: 'hosted identity contract verification',
    p_request_id: requestId,
  };
  const first = await admin.rpc('admin_verify_username', args);
  if (first.error) throw safeBackendError('service-role username verification failed', first.error);
  assert.equal(first.data, expectedUsername, 'admin verification must preserve the inferred username');

  const verifiedProfile = await loadUsernameState(targetClient);
  assert.equal(verifiedProfile.username, expectedUsername, 'admin verification must not rename the username');
  assert.equal(verifiedProfile.username_provenance, 'admin_verified');
  assertIsoTimestamp(verifiedProfile.username_claimed_at, 'username_claimed_at');

  const initialAuditRows = await loadUsernameVerificationAudits(targetUserId);
  assert.equal(initialAuditRows.length, 1, 'admin verification must create exactly one audit row');
  assert.equal(initialAuditRows[0].action, 'username.admin_verified');
  assert.equal(initialAuditRows[0].actor_user_id, actorUserId, 'the audit row must retain the administrator actor id');
  assert.equal(initialAuditRows[0].target_user_id, targetUserId);
  assert.equal(initialAuditRows[0].metadata?.requestId, requestId, 'the audit row must retain the request correlation id');
  assert.equal(initialAuditRows[0].metadata?.provenanceFrom, 'legacy_inferred');
  assert.equal(initialAuditRows[0].metadata?.provenanceTo, 'admin_verified');

  const repeated = await admin.rpc('admin_verify_username', {
    ...args,
    p_reason: 'repeat hosted identity contract verification',
    p_request_id: repeatedRequestId,
  });
  if (repeated.error) throw safeBackendError('idempotent service-role username verification failed', repeated.error);
  assert.equal(repeated.data, expectedUsername);

  const repeatedAuditRows = await loadUsernameVerificationAudits(targetUserId);
  assert.equal(repeatedAuditRows.length, 1, 'idempotent admin verification must not duplicate its audit row');
  assert.equal(repeatedAuditRows[0].metadata?.requestId, requestId, 'idempotent verification must preserve the original correlation id');
}

async function loadUsernameVerificationAudits(targetUserId) {
  const { data, error } = await admin
    .from('audit_logs')
    .select('actor_user_id,action,target_user_id,metadata')
    .eq('action', 'username.admin_verified')
    .eq('target_user_id', targetUserId);
  if (error) throw safeBackendError('username verification audit lookup failed', error);
  return data;
}

async function assertRevokedTerminalLosesIdentityRpcAccess(instance) {
  const { data, error } = await instance.rpc('revoke_current_terminal', {
    p_reason: 'identity_hosted_test',
  });
  if (error) throw safeBackendError('current terminal revocation failed', error);
  assert.equal(Number(data), 1, 'revoke_current_terminal must revoke the current terminal exactly once');

  const methods = await instance.rpc('list_my_login_methods');
  assertExpectedRpcError(
    methods.error,
    'P0001',
    /current session is not active|account_or_session_inactive/i,
    'a revoked terminal must not list login methods',
  );
  const claim = await instance.rpc('claim_username', { p_username: blockedUsername });
  assertExpectedRpcError(
    claim.error,
    'P0001',
    /account_or_session_inactive/i,
    'a revoked terminal must not claim a username',
  );
}

async function assertSuspendedAccountLosesIdentityRpcAccess(instance, targetUserId) {
  const { data: updatedProfile, error: updateError } = await admin
    .from('profiles')
    .update({
      account_status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspension_reason: 'identity_hosted_test',
    })
    .eq('id', targetUserId)
    .select('id')
    .single();
  if (updateError) throw safeBackendError('temporary account suspension failed', updateError);
  assert.equal(updatedProfile.id, targetUserId, 'the intended temporary account must be suspended');

  const methods = await instance.rpc('list_my_login_methods');
  assertExpectedRpcError(
    methods.error,
    'P0001',
    /account is not active|account_or_session_inactive/i,
    'a suspended account must not list login methods',
  );
}

async function loadUsernameState(instance) {
  const { data, error } = await instance
    .from('profiles')
    .select('username,username_provenance,username_claimed_at')
    .single();
  if (error) throw safeBackendError('corrective username schema is unavailable or incompatible', error);
  return data;
}

function assertExpectedRpcError(error, code, messagePattern, assertionMessage) {
  if (!error) assert.fail(assertionMessage);
  if (error.code !== code || !messagePattern.test(error.message ?? '')) {
    throw safeBackendError(`${assertionMessage}; hosted schema returned an unexpected result`, error);
  }
}

function assertIsoTimestamp(value, fieldName) {
  assert.equal(typeof value, 'string', `${fieldName} must be an ISO timestamp string`);
  assert.ok(Number.isFinite(Date.parse(value)), `${fieldName} must be a valid ISO timestamp`);
}

function safeBackendError(context, error) {
  const code = typeof error?.code === 'string' ? error.code : 'unknown_code';
  const message = (typeof error?.message === 'string' ? error.message : 'unknown_error')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[redacted-id]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-token]')
    .replace(/(token|secret|password)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 300);
  return new Error(`${context} (${code}: ${message})`);
}
