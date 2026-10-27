// Manually invoked known-RED characterization, excluded from ordinary *.test discovery.
// Run: node --test scripts/session-service-identity.verification.mjs
// These assertions intentionally expose unsafe interleavings in the installed SDK/service.
// Cases 1/2 replace only in-memory fixture storage; they do not prove an App UI path
// or a server-side mutation. Case 3 calls the public SDK directly, not an App fence.
// A future App fix may reject before dispatch or serialize session replacement; it
// needs separate production-coordinator acceptance tests. Do not skip or reverse
// these assertions to claim safety, and do not require the raw SDK to become safe.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  USER_A,
  USER_B,
  createIdentityFixture,
  jsonResponse,
  loadProductionService,
  waitFor,
} from './helpers/session-identity-fixture.mjs';

test('a pending account A revoke must not sign out account B after the stored session switches', { timeout: 10_000 }, async () => {
  const fixture = createIdentityFixture();
  await fixture.client.auth.initialize();
  const service = loadProductionService(fixture.client);
  const result = service.revokeAllTerminals('identity_fixture');
  await waitFor(() => fixture.pendingFunctions.length === 1);
  assert.equal(fixture.requests[0].identity, 'A');
  await fixture.switchToB();
  fixture.pendingFunctions[0].pending.resolve(jsonResponse({ revoked: 1 }));
  await result;
  const logoutRequest = fixture.requests.find(request => request.kind === 'logout');
  const switchedIdentityWasSignedOut = logoutRequest?.identity === 'B';
  assert.equal(switchedIdentityWasSignedOut, false, 'pending A revocation signed out switched account B');
});

test('current-terminal list and revoke must not cross from account A to account B', { timeout: 10_000 }, async () => {
  const fixture = createIdentityFixture();
  await fixture.client.auth.initialize();
  const service = loadProductionService(fixture.client);
  const currentTerminalId = '33333333-3333-4333-8333-333333333333';
  const result = service.revokeCurrentTerminal('identity_fixture');
  await waitFor(() => fixture.pendingFunctions.length === 1);
  assert.deepEqual(
    { action: fixture.requests[0].action, identity: fixture.requests[0].identity },
    { action: 'list', identity: 'A' },
  );
  await fixture.switchToB();
  fixture.pendingFunctions[0].pending.resolve(jsonResponse({ terminals: [{
    id: currentTerminalId,
    installation_id: '44444444-4444-4444-8444-444444444444',
    platform: 'android',
    device_label: 'Fixture A',
    app_version: '0.0.1',
    first_seen_at: '2026-10-16T00:00:00.000Z',
    last_seen_at: '2026-10-16T00:00:00.000Z',
    revoked_at: null,
    revocation_reason: null,
    isCurrent: true,
  }] }));
  let operationSettled = false;
  const settled = result.then(
    value => ({ status: 'fulfilled', value }),
    error => ({ status: 'rejected', error }),
  ).finally(() => { operationSettled = true; });
  await waitFor(() => fixture.pendingFunctions.length === 2 || operationSettled);
  const revokeRequest = fixture.requests.find(request => request.action === 'revoke_one');
  const revokeUsedSwitchedIdentity = revokeRequest?.identity === 'B';
  if (fixture.pendingFunctions[1]) fixture.pendingFunctions[1].pending.resolve(jsonResponse({ revoked: 1 }));
  const outcome = await settled;
  const rejectedBeforeDispatch = outcome.status === 'rejected'
    && ['identity-changed', 'identity-unavailable'].includes(outcome.error?.outcome);
  assert.equal(rejectedBeforeDispatch || revokeRequest?.terminalId === currentTerminalId, true);
  assert.equal(revokeUsedSwitchedIdentity, false, 'account A terminal selection was submitted with account B identity');
});

test('a late public signOut for account A must not delete account B established by public setSession', { timeout: 10_000 }, async () => {
  const fixture = createIdentityFixture({ holdLogout: true });
  await fixture.client.auth.initialize();
  const before = await fixture.client.auth.getSession();
  assert.equal(before.data.session?.user.id === USER_A, true);
  const signOut = fixture.client.auth.signOut({ scope: 'local' });
  await waitFor(() => fixture.pendingLogouts.length === 1);
  assert.equal(fixture.requests.find(request => request.kind === 'logout')?.identity, 'A');
  const switched = await fixture.setSessionB();
  assert.equal(switched.error, null);
  const whilePending = await fixture.client.auth.getSession();
  assert.equal(whilePending.data.session?.user.id === USER_B, true);
  fixture.pendingLogouts[0].resolve(jsonResponse({}));
  await signOut;
  const after = await fixture.client.auth.getSession();
  const switchedSessionWasDeleted = after.data.session === null;
  assert.equal(switchedSessionWasDeleted, false, 'late account A signOut deleted the public account B session');
});
