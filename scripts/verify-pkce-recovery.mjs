import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const url = required('SUPABASE_URL');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const mailpitUrl = required('MAILPIT_URL');
const redirectTo = 'doso://auth/reset-password';

const storageValues = new Map();
const storage = {
  getItem: async (key) => storageValues.get(key) ?? null,
  setItem: async (key, value) => storageValues.set(key, value),
  removeItem: async (key) => storageValues.delete(key),
};

const pkceClient = createClient(url, publishableKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storage,
  },
});
const loginClient = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `pkce-${Date.now()}@doso.test`;
const oldPassword = 'DosoBefore123';
const newPassword = 'DosoAfter456';
const finalPassword = 'DosoFinal789';
let userId;
let primaryError;
const cleanupErrors = [];

try {
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password: oldPassword,
    user_metadata: { display_name: 'DOSO PKCE' },
  });
  userId = created.user?.id;
  assert.ifError(createError);
  assert.ok(userId, 'the temporary recovery user must be created');

  const previousMailCount = await messageCount();
  const { error: resetError } = await pkceClient.auth.resetPasswordForEmail(email, { redirectTo });
  assert.ifError(resetError);
  const message = await waitForMail(previousMailCount, email);
  const verifyUrl = extractVerifyUrl(message);
  if (verifyUrl) {
    const verification = await fetch(verifyUrl, { redirect: 'manual' });
    assert.ok([302, 303].includes(verification.status), 'the recovery verification URL must redirect');
    const callbackValue = verification.headers.get('location');
    assert.ok(callbackValue, 'the recovery verification response must include a callback location');

    const callback = new URL(callbackValue);
    assert.equal(callback.protocol, 'doso:');
    assert.equal(callback.hostname, 'auth');
    assert.equal(callback.pathname, '/reset-password');
    assert.equal(callback.hash.includes('access_token'), false, 'the callback must not expose an access token');
    assert.equal(callback.hash.includes('refresh_token'), false, 'the callback must not expose a refresh token');
    const code = callback.searchParams.get('code');
    assert.ok(code, 'the callback must carry a one-time PKCE authorization code');

    const { data: recovery, error: exchangeError } = await pkceClient.auth.exchangeCodeForSession(code);
    assert.ifError(exchangeError);
    assert.equal(recovery.session?.user.email, email);
    console.log('PASS Mailpit recovery link redirects to the exact DOSO callback');
    console.log('PASS recovery callback carries a PKCE code and no bearer tokens');
    console.log('PASS PKCE code exchange creates the recovery session');
  } else {
    const token = extractOtp(message);
    const { data: recovery, error: verifyError } = await pkceClient.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });
    assert.ifError(verifyError);
    assert.equal(recovery.session?.user.email, email);
    console.log('PASS Mailpit recovery email carries an eight-digit one-time code');
    console.log('PASS recovery OTP verification creates the password recovery session');
  }

  const { error: updateError } = await pkceClient.auth.updateUser({ password: newPassword });
  assert.ifError(updateError);

  const { error: oldLoginError } = await loginClient.auth.signInWithPassword({ email, password: oldPassword });
  assert.ok(oldLoginError, 'the previous password must stop working');
  const { data: newLogin, error: newLoginError } = await loginClient.auth.signInWithPassword({
    email,
    password: newPassword,
  });
  assert.ifError(newLoginError);
  assert.equal(newLogin.user?.email, email);

  const reauthMailCount = await messageCount();
  const { error: reauthenticateError } = await loginClient.auth.reauthenticate();
  assert.ifError(reauthenticateError);
  const reauthMessage = await waitForMail(reauthMailCount, email);
  const nonce = extractOtp(reauthMessage);
  const { error: nonceUpdateError } = await loginClient.auth.updateUser({
    password: finalPassword,
    nonce,
  });
  assert.ifError(nonceUpdateError);
  await loginClient.auth.signOut({ scope: 'local' });
  const { error: intermediateLoginError } = await loginClient.auth.signInWithPassword({
    email,
    password: newPassword,
  });
  assert.ok(intermediateLoginError, 'the password used before reauthentication must stop working');
  const { data: finalLogin, error: finalLoginError } = await loginClient.auth.signInWithPassword({
    email,
    password: finalPassword,
  });
  assert.ifError(finalLoginError);
  assert.equal(finalLogin.user?.email, email);

  console.log('PASS password update invalidates the old password');
  console.log('PASS reauthentication nonce authorizes an in-session password change');
} catch (error) {
  primaryError = error;
} finally {
  for (const client of [pkceClient, loginClient]) {
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to clear a PKCE smoke-test session', { cause: error }));
    }
  }

  if (userId) {
    try {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
    } catch (error) {
      cleanupErrors.push(new Error('Failed to delete the temporary PKCE user', { cause: error }));
    }
  }
}

if (primaryError) {
  if (cleanupErrors.length) console.error(new AggregateError(cleanupErrors, 'PKCE cleanup also failed'));
  throw primaryError;
}
if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'PKCE cleanup failed');

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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    const payload = await response.json();
    const summary = (payload.messages ?? []).find((item) => JSON.stringify(item).includes(recipient));
    const count = payload.messages_count ?? payload.total ?? 0;
    if (count > previousCount && summary?.ID) {
      const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      assert.equal(messageResponse.ok, true, 'the Mailpit recovery message must be readable');
      return messageResponse.json();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for recovery mail to ${recipient}`);
}

function extractVerifyUrl(message) {
  const body = `${message.Text ?? ''}\n${message.HTML ?? ''}`
    .replaceAll('&amp;', '&')
    .replaceAll('&#x3D;', '=')
    .replaceAll('&#61;', '=');
  const match = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/i);
  return match?.[0] ?? null;
}

function extractOtp(message, minimumLength = 8, maximumLength = 8) {
  const body = `${message.Text ?? ''}\n${message.HTML ?? ''}`;
  const match = body.match(new RegExp(`\\b(\\d{${minimumLength},${maximumLength}})\\b`));
  assert.ok(match, 'the authentication email must contain the expected numeric OTP or a verification URL');
  return match[1];
}
