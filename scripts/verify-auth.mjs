import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const url = required('SUPABASE_URL');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const mailpitUrl = required('MAILPIT_URL');

const publicClient = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const smokeEmail = `smoke-${Date.now()}@doso.test`;
const smokePassword = 'DosoSmoke123';
const smokeUsername = `smoke_${Date.now().toString(36)}`;
let smokeUserId;
let demoDeviceState;
let primaryError;
const cleanupErrors = [];

try {
  const signupMailCount = await messageCount();
  const { data: signup, error: signupError } = await publicClient.auth.signUp({
    email: smokeEmail,
    password: smokePassword,
    options: { data: { username: smokeUsername, display_name: smokeUsername } },
  });
  smokeUserId = signup.user?.id;
  assert.ifError(signupError);
  assert.ok(signup.user, 'registration must create an auth user');
  assert.equal(signup.session, null, 'email confirmation must be required');

  const signupMessage = await waitForMail(signupMailCount, smokeEmail);
  const signupToken = extractOtp(signupMessage);
  const { data: confirmedSignup, error: confirmError } = await publicClient.auth.verifyOtp({
    email: smokeEmail,
    token: signupToken,
    type: 'email',
  });
  assert.ifError(confirmError);
  assert.equal(confirmedSignup.user?.email, smokeEmail);
  assert.ok(confirmedSignup.session, 'signup OTP verification must create a session');
  await publicClient.auth.signOut({ scope: 'local' });
  const { data: createdProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id,email,username,display_name')
    .eq('id', smokeUserId)
    .single();
  assert.ifError(profileError);
  assert.equal(createdProfile.email, smokeEmail);
  assert.equal(createdProfile.username, smokeUsername);
  assert.equal(createdProfile.display_name, smokeUsername);

  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({
    email: 'demo@doso.local',
    password: 'DosoDemo123!',
  });
  assert.ifError(loginError);
  assert.ok(login.session, 'seeded user must receive a session');

  const { error: terminalError } = await publicClient.rpc('register_account_terminal', {
    p_installation_id: 'auth-smoke-test',
    p_platform: 'unknown',
    p_device_label: 'Auth smoke test',
    p_app_version: 'test',
    p_user_agent: 'DOSO auth verification',
  });
  assert.ifError(terminalError);

  const { data: ownProfiles, error: ownProfileError } = await publicClient
    .from('profiles')
    .select('id,email,display_name');
  assert.ifError(ownProfileError);
  assert.deepEqual(ownProfiles.map((profile) => profile.email), ['demo@doso.local']);

  const { data: devices, error: devicesError } = await publicClient
    .from('devices')
    .select('*');
  assert.ifError(devicesError);
  assert.equal(devices.length, 1, 'seeded user must see exactly their seeded device');

  const deviceId = devices[0].id;
  demoDeviceState = {
    id: deviceId,
    display_name: devices[0].display_name,
    alerts_enabled: devices[0].alerts_enabled,
  };
  const { data: updatedDevice, error: updateError } = await publicClient
    .from('devices')
    .update({ display_name: 'DOSO auth smoke robot', alerts_enabled: false })
    .eq('id', deviceId)
    .select('display_name,alerts_enabled')
    .single();
  assert.ifError(updateError);
  assert.equal(updatedDevice.display_name, 'DOSO auth smoke robot');
  assert.equal(updatedDevice.alerts_enabled, false);

  const resetMailCount = await messageCount();
  const { error: resetError } = await publicClient.auth.resetPasswordForEmail(
    'demo@doso.local',
    { redirectTo: 'doso://auth/reset-password' },
  );
  assert.ifError(resetError);
  await waitForMail(resetMailCount, 'demo@doso.local');

  console.log('PASS register sends and verifies an eight-digit email OTP');
  console.log('PASS register creates auth user and profile with a normalized username');
  console.log('PASS confirmation and reset emails reach local Mailpit');
  console.log('PASS seeded login returns a persistent Supabase session');
  console.log('PASS RLS exposes only the signed-in user profile and device');
  console.log('PASS device settings persist in PostgreSQL');
} catch (error) {
  primaryError = error;
} finally {
  if (demoDeviceState) {
    try {
      const { error } = await adminClient
        .from('devices')
        .update({
          display_name: demoDeviceState.display_name,
          alerts_enabled: demoDeviceState.alerts_enabled,
        })
        .eq('id', demoDeviceState.id);
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to restore the demo device state', { cause: error }));
    }
  }

  try {
    const { error } = await publicClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    cleanupErrors.push(new Error('Failed to sign out the smoke-test session', { cause: error }));
  }

  if (smokeUserId) {
    try {
      const { error } = await adminClient.auth.admin.deleteUser(smokeUserId);
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to delete the temporary smoke-test user', { cause: error }));
    }
  }
}

if (primaryError) {
  if (cleanupErrors.length > 0) {
    console.error(new AggregateError(cleanupErrors, 'Auth smoke-test cleanup also failed'));
  }
  throw primaryError;
}

if (cleanupErrors.length > 0) {
  throw new AggregateError(cleanupErrors, 'Auth smoke-test cleanup failed');
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function messageCount() {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  assert.equal(response.ok, true, 'Mailpit API must be reachable');
  const payload = await response.json();
  return payload.messages_count ?? payload.total ?? 0;
}

async function waitForMail(previousCount, recipient) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    const payload = await response.json();
    const messages = payload.messages ?? [];
    const matchingMessage = messages.find((message) => JSON.stringify(message).includes(recipient));
    const count = payload.messages_count ?? payload.total ?? 0;
    if (count > previousCount && matchingMessage?.ID) {
      const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${matchingMessage.ID}`);
      assert.equal(messageResponse.ok, true, 'the Mailpit signup message must be readable');
      return messageResponse.json();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for mail to ${recipient}`);
}

function extractOtp(message) {
  const body = `${message.Text ?? ''}\n${message.HTML ?? ''}`;
  const match = body.match(/(?:^|\D)(\d{8})(?!\d)/);
  assert.ok(match, 'the signup email must contain an eight-digit OTP');
  return match[1];
}
