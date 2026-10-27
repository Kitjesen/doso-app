import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const url = required('SUPABASE_URL').replace(/\/$/, '');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const verifyEdgeFunctions = /^(1|true|yes)$/i.test(process.env.VERIFY_EDGE_FUNCTIONS ?? '');
const functionsUrl = (process.env.SUPABASE_FUNCTIONS_URL?.trim() || `${url}/functions/v1`).replace(/\/$/, '');

const admin = client(serviceRoleKey);
const createdUserIds = [];
const createdDeviceIds = [];
const timestamp = Date.now();
const password = 'DosoNetwork123!';
const userAEmail = `network-a-${timestamp}@doso.test`;
const userBEmail = `network-b-${timestamp}@doso.test`;

let primaryError;
const cleanupErrors = [];

try {
  const userAId = await createConfirmedUser(userAEmail, 'Network User A');
  const userBId = await createConfirmedUser(userBEmail, 'Network User B');

  const a1 = await login(userAEmail);
  const a2 = await login(userAEmail);
  const b1 = await login(userBEmail);
  assert.notEqual(sessionId(a1), sessionId(a2), 'separate logins must have separate session_id claims');

  await assertSessionIsGatedBeforeRegistration(a1, userAId);
  const a1Terminal = await registerTerminal(a1, 'a-install-1', 'A phone');
  const a2Terminal = await registerTerminal(a2, 'a-install-2', 'A tablet');
  const b1Terminal = await registerTerminal(b1, 'b-install-1', 'B phone');

  await assertTerminalIsolation(a1, b1, a1Terminal.id, a2Terminal.id, b1Terminal.id);
  await assertProtectedAccountFieldsCannotBeChanged(a1, userAId);
  await assertRealDevicesCannotBeForged(a1, userAId);

  const physicalDeviceId = await createPhysicalDevice(userAId);
  await assertPhysicalDeviceCannotBeDeletedOrSpoofed(a1, physicalDeviceId);
  const { error: releaseFixtureError } = await admin.from('devices').update({ owner_id: null }).eq('id', physicalDeviceId);
  assert.ifError(releaseFixtureError);

  if (verifyEdgeFunctions) {
    await assertAccountSessionsEdgeFunction(a1, [a1Terminal.id, a2Terminal.id]);
    await assertDeviceBindingEdgeFunction(a1, userAId);
    await assertAdminEdgeFunctionAuthorization(a1, b1, userBId, userAId, userAEmail);
  }

  const { data: otherCount, error: otherError } = await a1.rpc('revoke_other_terminals', {
    p_reason: 'network_test_other',
  });
  assert.ifError(otherError);
  assert.equal(Number(otherCount), 1, 'revoke_other_terminals must revoke only the other active terminal');
  await assertSessionIsRevoked(a2, userAId, 'the other terminal must lose DOSO data access immediately');
  await assertSessionStillActive(a1, userAId, 'the current terminal must remain active after revoking others');

  const a3 = await login(userAEmail);
  const a3Terminal = await registerTerminal(a3, 'a-install-3', 'A browser');
  const { data: crossUserCount, error: crossUserError } = await a1.rpc('revoke_account_terminal', {
    p_terminal_id: b1Terminal.id,
    p_reason: 'network_test_cross_user',
  });
  assert.ifError(crossUserError);
  assert.equal(Number(crossUserCount), 0, 'a user must not revoke another user terminal');
  await assertSessionStillActive(b1, userBId, 'cross-user terminal revocation must have no effect');

  const { data: oneCount, error: oneError } = await a1.rpc('revoke_account_terminal', {
    p_terminal_id: a3Terminal.id,
    p_reason: 'network_test_one',
  });
  assert.ifError(oneError);
  assert.equal(Number(oneCount), 1, 'revoke_account_terminal must revoke the selected own terminal');
  await assertSessionIsRevoked(a3, userAId, 'the selected terminal must lose DOSO data access immediately');

  const a4 = await login(userAEmail);
  await registerTerminal(a4, 'a-install-4', 'A desktop');
  const { data: allCount, error: allError } = await a1.rpc('revoke_all_terminals', {
    p_reason: 'network_test_all',
  });
  assert.ifError(allError);
  assert.equal(Number(allCount), 2, 'revoke_all_terminals must revoke every remaining active terminal');
  await assertSessionIsRevoked(a1, userAId, 'the current terminal must be revoked by revoke_all_terminals');
  await assertSessionIsRevoked(a4, userAId, 'all other active terminals must be revoked by revoke_all_terminals');
  if (verifyEdgeFunctions) {
    await assertAdminAccountStateEdgeFunctions(b1, userAId, userAEmail);
  }

  console.log('PASS JWT session_id registration gates DOSO data access');
  console.log('PASS account terminal lists are isolated per user');
  console.log('PASS protected account fields reject user modification');
  console.log('PASS physical device creation, deletion and telemetry spoofing are blocked');
  console.log('PASS selected, other and all terminal revocation semantics are enforced immediately');
  if (verifyEdgeFunctions) {
    console.log('PASS administrators can list and revoke a target-owned terminal');
    console.log('PASS account suspension and reactivation synchronize DOSO and Auth fail-safely');
    console.log('PASS account, device binding and admin Edge Function authorization');
  }
} catch (error) {
  primaryError = error;
} finally {
  for (const deviceId of createdDeviceIds) {
    try {
      const { error } = await admin.from('devices').delete().eq('id', deviceId);
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to delete a temporary network-test device', { cause: error }));
    }
  }
  for (const userId of createdUserIds) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to delete a temporary network-test user', { cause: error }));
    }
  }
}

if (primaryError) {
  if (cleanupErrors.length) console.error(new AggregateError(cleanupErrors, 'Network backend cleanup also failed'));
  throw primaryError;
}
if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Network backend cleanup failed');

function client(key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function createConfirmedUser(email, displayName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  assert.ifError(error);
  assert.ok(data.user?.id, 'temporary confirmed user must be created');
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function login(email) {
  const instance = client(publishableKey);
  const { data, error } = await instance.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.session?.access_token, 'login must return an access token');
  instance.testAccessToken = data.session.access_token;
  return instance;
}

function sessionId(instance) {
  const claims = jwtClaims(instance);
  assert.equal(typeof claims.session_id, 'string', 'JWT must contain a session_id claim');
  return claims.session_id;
}

function jwtClaims(instance) {
  const token = instance.testAccessToken;
  assert.ok(token, 'test client must have an access token');
  const payload = token.split('.')[1];
  assert.ok(payload, 'access token must contain a JWT payload');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

async function registerTerminal(instance, installationId, deviceLabel) {
  const { data, error } = await instance.rpc('register_account_terminal', {
    p_installation_id: installationId,
    p_platform: 'android',
    p_device_label: deviceLabel,
    p_app_version: 'network-test',
    p_user_agent: 'DOSO network backend verification',
  });
  assert.ifError(error);
  const terminal = Array.isArray(data) ? data[0] : data;
  assert.ok(terminal?.id, 'terminal registration must return a terminal');
  assert.equal(terminal.auth_session_id, sessionId(instance));
  return terminal;
}

async function assertSessionIsGatedBeforeRegistration(instance, userId) {
  const { data, error } = await instance.from('profiles').select('id').eq('id', userId);
  assert.ifError(error);
  assert.deepEqual(data, [], 'an unregistered login terminal must not access DOSO profile data');
}

async function assertTerminalIsolation(a, b, a1Id, a2Id, b1Id) {
  const { data: aRows, error: aError } = await a.from('account_terminals').select('id');
  assert.ifError(aError);
  assert.deepEqual(new Set(aRows.map(({ id }) => id)), new Set([a1Id, a2Id]));

  const { data: bRows, error: bError } = await b.from('account_terminals').select('id');
  assert.ifError(bError);
  assert.deepEqual(bRows.map(({ id }) => id), [b1Id]);
}

async function assertProtectedAccountFieldsCannotBeChanged(instance, userId) {
  const { error } = await instance.from('profiles').update({
    app_role: 'admin',
    account_status: 'suspended',
  }).eq('id', userId);
  assert.ok(error, 'ordinary users must not modify app_role or account_status');
}

async function assertRealDevicesCannotBeForged(instance, userId) {
  const { error } = await instance.from('devices').insert({
    owner_id: userId,
    model_code: 'FORGED',
    display_name: 'Forged physical device',
    category: 'robot',
    environment: 'test',
    serial_number: `FORGED-${Date.now()}`,
    is_demo: false,
  });
  assert.ok(error, 'ordinary users must not directly create physical devices');
}

async function createPhysicalDevice(ownerId) {
  const { data, error } = await admin.from('devices').insert({
    owner_id: ownerId,
    model_code: 'DOSO-NET',
    display_name: 'Network test robot',
    category: 'robot',
    environment: 'test',
    serial_number: `DOSO-NET-${Date.now()}-${createdDeviceIds.length}`,
    is_demo: false,
  }).select('id').single();
  assert.ifError(error);
  createdDeviceIds.push(data.id);
  return data.id;
}

async function assertPhysicalDeviceCannotBeDeletedOrSpoofed(instance, deviceId) {
  const { data: deleted, error: deleteError } = await instance.from('devices').delete().eq('id', deviceId).select('id');
  assert.ifError(deleteError);
  assert.deepEqual(deleted, [], 'ordinary users must not directly delete physical devices');

  const { error: telemetryError } = await instance.from('devices').update({
    battery_percent: 99,
    connection_status: 'online',
    last_seen_at: new Date().toISOString(),
  }).eq('id', deviceId);
  assert.ok(telemetryError, 'ordinary users must not forge device telemetry');

  const { data: stillExists, error: verifyError } = await admin.from('devices').select('id').eq('id', deviceId).single();
  assert.ifError(verifyError);
  assert.equal(stillExists.id, deviceId);
}

async function assertSessionIsRevoked(instance, userId, message) {
  const { data, error } = await instance.from('profiles').select('id').eq('id', userId);
  assert.ifError(error);
  assert.deepEqual(data, [], message);
  const { error: heartbeatError } = await instance.rpc('heartbeat_current_terminal');
  assert.ok(heartbeatError, 'a revoked terminal heartbeat must be rejected');
  if (verifyEdgeFunctions) {
    const edgeHeartbeat = await invokeEdge(instance, 'account-sessions', { action: 'heartbeat' });
    assert.equal(edgeHeartbeat.response.status, 401, 'Edge Functions must reject a revoked DOSO terminal');
    assert.equal(edgeHeartbeat.body?.error?.code, 'session_revoked');
  }
}

async function assertSessionStillActive(instance, userId, message) {
  const { data, error } = await instance.from('profiles').select('id').eq('id', userId).single();
  assert.ifError(error);
  assert.equal(data.id, userId, message);
}

async function assertAccountSessionsEdgeFunction(instance, terminalIds) {
  const registration = await invokeEdge(instance, 'account-sessions', {
    action: 'register',
    installationId: 'a-install-1',
    platform: 'android',
    deviceLabel: 'A phone',
    appVersion: 'network-test',
  });
  assert.equal(registration.response.status, 200, edgeFailure('account-sessions register', registration));
  assert.ok(registration.body.terminal?.id, 'Edge Function registration must return the current terminal');
  assert.equal(registration.body.terminal?.isCurrent, true);

  const list = await invokeEdge(instance, 'account-sessions', { action: 'list' });
  assert.equal(list.response.status, 200, edgeFailure('account-sessions list', list));
  assert.deepEqual(new Set(list.body.terminals.map(({ id }) => id)), new Set(terminalIds));

  const heartbeat = await invokeEdge(instance, 'account-sessions', { action: 'heartbeat' });
  assert.equal(heartbeat.response.status, 200, edgeFailure('account-sessions heartbeat', heartbeat));
  assert.ok(heartbeat.body.terminal?.id, 'Edge Function heartbeat must return the current terminal');
}

async function assertDeviceBindingEdgeFunction(instance, userId) {
  const serialNumber = `DOSO-CLAIM-${Date.now()}`;
  const bindingCode = `CLAIM${String(Date.now()).slice(-6)}`;
  const { data: device, error: deviceError } = await admin.from('devices').insert({
    owner_id: null,
    model_code: 'DOSO-CLAIM',
    display_name: 'Claimable network test robot',
    category: 'robot',
    environment: 'test',
    serial_number: serialNumber,
    is_demo: false,
  }).select('id').single();
  assert.ifError(deviceError);
  createdDeviceIds.push(device.id);

  const digest = createHash('sha256').update(bindingCode).digest('hex');
  const { error: claimError } = await admin.rpc('rotate_device_claim', {
    p_device_id: device.id,
    p_code_digest: digest,
    p_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  assert.ifError(claimError);

  const claim = await invokeEdge(instance, 'device-binding', {
    action: 'claim',
    serialNumber,
    code: bindingCode,
  });
  assert.equal(claim.response.status, 200, edgeFailure('device-binding claim', claim));
  assert.equal(claim.body.device?.owner_id, userId);

  const repeatedClaim = await invokeEdge(instance, 'device-binding', {
    action: 'claim',
    serialNumber,
    code: bindingCode,
  });
  assert.equal(repeatedClaim.response.status, 200, edgeFailure('device-binding idempotent retry', repeatedClaim));
  assert.equal(repeatedClaim.body.device?.id, device.id);

  const unbind = await invokeEdge(instance, 'device-binding', {
    action: 'unbind',
    deviceId: device.id,
    reason: 'network_test',
  });
  assert.equal(unbind.response.status, 200, edgeFailure('device-binding unbind', unbind));
  const { data: unbound, error: unboundError } = await admin.from('devices').select('owner_id').eq('id', device.id).single();
  assert.ifError(unboundError);
  assert.equal(unbound.owner_id, null);
}

async function assertAdminEdgeFunctionAuthorization(ordinaryUser, adminUser, adminUserId, targetUserId, searchableEmail) {
  const deniedUsers = await invokeEdge(ordinaryUser, 'admin-users', { action: 'list_users' });
  assert.equal(deniedUsers.response.status, 403, 'ordinary users must not access account administration');

  const deniedDevices = await invokeEdge(ordinaryUser, 'admin-devices', { action: 'list_devices' });
  assert.equal(deniedDevices.response.status, 403, 'ordinary users must not access device administration');

  const { error: promoteError } = await admin.from('profiles').update({ app_role: 'admin' }).eq('id', adminUserId);
  assert.ifError(promoteError);

  const aal1Denied = await invokeEdge(adminUser, 'admin-users', {
    action: 'list_users',
    search: searchableEmail,
    perPage: 10,
  });
  assert.equal(aal1Denied.response.status, 403, 'an AAL1 admin session must not access sensitive administration');
  assert.equal(aal1Denied.body?.error?.code, 'mfa_required');

  await upgradeToAal2(adminUser);

  const users = await invokeEdge(adminUser, 'admin-users', {
    action: 'list_users',
    search: searchableEmail,
    perPage: 10,
  });
  assert.equal(users.response.status, 200, edgeFailure('admin-users list', users));
  assert.equal(users.body.users?.length, 1, 'admin user search must return the matching account');
  assert.equal(users.body.users[0]?.email, searchableEmail);

  const temporarySession = await login(searchableEmail);
  const temporaryTerminal = await registerTerminal(
    temporarySession,
    `admin-revoke-${Date.now()}`,
    'Admin terminal revoke fixture',
  );
  const terminals = await invokeEdge(adminUser, 'admin-users', {
    action: 'list_user_terminals',
    userId: targetUserId,
  });
  assert.equal(terminals.response.status, 200, edgeFailure('admin-users terminal list', terminals));
  assert.ok(
    terminals.body.terminals?.some((terminal) => terminal.id === temporaryTerminal.id),
    'admin terminal inventory must include the target-owned terminal',
  );
  const revokedTerminal = await invokeEdge(adminUser, 'admin-users', {
    action: 'revoke_user_terminal',
    userId: targetUserId,
    terminalId: temporaryTerminal.id,
    reason: 'network_test_admin_terminal_revoke',
  });
  assert.equal(revokedTerminal.response.status, 200, edgeFailure('admin-users terminal revoke', revokedTerminal));
  assert.equal(revokedTerminal.body.revoked, true);
  await assertSessionIsRevoked(
    temporarySession,
    targetUserId,
    'an administrator-revoked terminal must lose DOSO access immediately',
  );

  const inventory = await invokeEdge(adminUser, 'admin-devices', {
    action: 'create_inventory',
    serialNumber: `DOSO-ADMIN-${Date.now()}`,
    modelCode: 'DOSO-ADMIN-TEST',
  });
  assert.equal(inventory.response.status, 201, edgeFailure('admin-devices create_inventory', inventory));
  assert.ok(inventory.body.device?.id, 'admin device inventory creation must return a device');
  createdDeviceIds.push(inventory.body.device.id);

  const rotated = await invokeEdge(adminUser, 'admin-devices', {
    action: 'rotate_binding_code',
    deviceId: inventory.body.device.id,
    expiresInMinutes: 5,
  });
  assert.equal(rotated.response.status, 200, edgeFailure('admin-devices rotate_binding_code', rotated));
  assert.equal(rotated.body.oneTimeDisplay, true);
  assert.ok(typeof rotated.body.bindingCode === 'string' && rotated.body.bindingCode.length >= 6);
}

async function assertAdminAccountStateEdgeFunctions(adminUser, targetUserId, targetEmail) {
  const suspended = await invokeEdge(adminUser, 'admin-users', {
    action: 'set_status',
    userId: targetUserId,
    status: 'suspended',
    reason: 'network_test_account_suspension',
  });
  assert.equal(suspended.response.status, 200, edgeFailure('admin-users suspension', suspended));
  assert.equal(suspended.body.applicationAccess, 'blocked');
  assert.equal(suspended.body.authSync, 'synchronized');
  const loginProbe = client(publishableKey);
  const blockedLogin = await loginProbe.auth.signInWithPassword({ email: targetEmail, password });
  assert.ok(blockedLogin.error, 'a suspended account must not receive a new Auth session');

  const activated = await invokeEdge(adminUser, 'admin-users', {
    action: 'set_status',
    userId: targetUserId,
    status: 'active',
    reason: 'network_test_account_reactivation',
  });
  assert.equal(activated.response.status, 200, edgeFailure('admin-users activation', activated));
  assert.equal(activated.body.applicationAccess, 'active');
  assert.equal(activated.body.authSync, 'synchronized');
  const restored = await login(targetEmail);
  assert.ok(restored.testAccessToken, 'a reactivated account must be able to sign in again');
}

async function upgradeToAal2(instance) {
  const { data: enrolled, error: enrollError } = await instance.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `DOSO network test ${Date.now()}`,
  });
  assert.ifError(enrollError);
  assert.ok(enrolled?.id && enrolled?.totp?.secret, 'TOTP enrollment must return a factor and secret');

  const { data: challenged, error: challengeError } = await instance.auth.mfa.challenge({ factorId: enrolled.id });
  assert.ifError(challengeError);
  assert.ok(challenged?.id, 'TOTP enrollment must create an MFA challenge');

  const code = totp(enrolled.totp.secret);
  const { data: verified, error: verifyError } = await instance.auth.mfa.verify({
    factorId: enrolled.id,
    challengeId: challenged.id,
    code,
  });
  assert.ifError(verifyError);
  assert.ok(verified.access_token, 'MFA verification must return an upgraded access token');
  instance.testAccessToken = verified.access_token;
  assert.equal(jwtClaims(instance).aal, 'aal2', 'MFA verification must upgrade the session to AAL2');
}

function totp(base32Secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = base32Secret.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const character of normalized) {
    const value = alphabet.indexOf(character);
    assert.notEqual(value, -1, 'TOTP secret must be valid base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function invokeEdge(instance, functionName, body) {
  const response = await fetch(`${functionsUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${instance.testAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = {};
  }
  return { response, body: responseBody };
}

function edgeFailure(label, result) {
  const code = result.body?.error?.code ?? 'unknown_error';
  return `${label} failed with HTTP ${result.response.status} (${code})`;
}
