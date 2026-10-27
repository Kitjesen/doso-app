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

const TERMINAL_ID = '33333333-3333-4333-8333-333333333333';

function listedTerminal(current) {
  return {
    id: TERMINAL_ID,
    installation_id: '44444444-4444-4444-8444-444444444444',
    platform: 'android',
    device_label: 'Fixture A',
    app_version: '0.0.1',
    first_seen_at: '2026-10-16T00:00:00.000Z',
    last_seen_at: '2026-10-16T00:00:00.000Z',
    revoked_at: null,
    revocation_reason: null,
    isCurrent: current,
  };
}

function observedUser(response) {
  return response.data.session?.user.id ?? null;
}

function asOutcome(promise, onSettled = () => {}) {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    error => ({ status: 'rejected', error }),
  ).finally(onSettled);
}

function assertTypedIdentityRejection(outcome) {
  assert.equal(outcome.status, 'rejected', 'identity uncertainty must reject the revocation operation');
  assert.equal(outcome.error?.outcome, 'identity-unavailable');
}

for (const scenario of [
  { name: 'current', method: 'revokeCurrentTerminal', isCurrent: true },
  { name: 'specific', method: 'revokeAccountTerminal', isCurrent: false },
]) {
  test(`${scenario.name} revoke pins both list and revoke when SDK token reads switch to B`, { timeout: 15_000 }, async () => {
    const fixture = createIdentityFixture();
    await fixture.client.auth.initialize();
    const originalGetSession = fixture.client.auth.getSession.bind(fixture.client.auth);
    const sessionReads = [];
    fixture.client.auth.getSession = async (...args) => {
      const response = await originalGetSession(...args);
      sessionReads.push(observedUser(response));
      if (sessionReads.length === 1 || sessionReads.length === 3) await fixture.switchToB();
      return response;
    };
    const service = loadProductionService(fixture.client);
    const operation = scenario.method === 'revokeAccountTerminal'
      ? service[scenario.method](TERMINAL_ID, 'identity_fixture')
      : service[scenario.method]('identity_fixture');

    await waitFor(() => fixture.pendingFunctions.length === 1);
    assert.deepEqual(sessionReads.slice(0, 2), [USER_A, USER_B], 'list SDK token getter must observe B');
    assert.deepEqual(
      { action: fixture.requests[0].action, identity: fixture.requests[0].identity },
      { action: 'list', identity: 'A' },
    );

    await fixture.switchToRefreshedA();
    fixture.pendingFunctions[0].pending.resolve(jsonResponse({ terminals: [listedTerminal(scenario.isCurrent)] }));
    await waitFor(() => fixture.pendingFunctions.length === 2);
    assert.deepEqual(sessionReads.slice(0, 4), [USER_A, USER_B, USER_A, USER_B],
      'recheck must read refreshed A before the SDK token getter observes B');
    assert.deepEqual(
      { action: fixture.requests[1].action, identity: fixture.requests[1].identity },
      { action: 'revoke_one', identity: 'A-refresh' },
      'revoke must pin the latest token for the unchanged identity',
    );
    fixture.pendingFunctions[1].pending.resolve(jsonResponse({ revoked: 1 }));
    assert.equal(await operation, 1);

    assert.deepEqual(fixture.requests.filter(request => request.kind === 'logout'), []);
    assert.equal((await originalGetSession()).data.session?.user.id, USER_B);
  });
}

for (const scenario of [
  { name: 'current', method: 'revokeCurrentTerminal', isCurrent: true },
  { name: 'specific', method: 'revokeAccountTerminal', isCurrent: false },
]) {
for (const invalid of [
  { name: 'a different user', mutate: fixture => fixture.switchToB() },
  { name: 'the same user with a new session id', mutate: fixture => fixture.switchToSameUserNewSession() },
  { name: 'a null session', mutate: fixture => fixture.clearSession() },
  { name: 'a malformed session', mutate: fixture => fixture.switchToMalformedSession() },
  { name: 'an SDK getSession error', injectError: true },
]) {
  test(`${scenario.name} revoke rejects ${invalid.name} at the post-list identity recheck`, { timeout: 15_000 }, async () => {
    const fixture = createIdentityFixture();
    await fixture.client.auth.initialize();
    const originalGetSession = fixture.client.auth.getSession.bind(fixture.client.auth);
    let reads = 0;
    if (invalid.injectError) {
      fixture.client.auth.getSession = async (...args) => {
        reads += 1;
        if (reads >= 3) return { data: { session: null }, error: new Error('fixture getSession failure') };
        return originalGetSession(...args);
      };
    }
    const service = loadProductionService(fixture.client);
    let operationSettled = false;
    const outcomePromise = asOutcome(
      scenario.method === 'revokeAccountTerminal'
        ? service[scenario.method](TERMINAL_ID, 'identity_fixture')
        : service[scenario.method]('identity_fixture'),
      () => { operationSettled = true; },
    );

    await waitFor(() => fixture.pendingFunctions.length === 1);
    if (invalid.mutate) await invalid.mutate(fixture);
    fixture.pendingFunctions[0].pending.resolve(jsonResponse({ terminals: [listedTerminal(scenario.isCurrent)] }));
    await waitFor(() => operationSettled || fixture.pendingFunctions.length > 1);
    const unsafeRevoke = fixture.pendingFunctions.find(request => request.action === 'revoke_one');
    if (unsafeRevoke) unsafeRevoke.pending.resolve(jsonResponse({ revoked: 1 }));
    const outcome = await outcomePromise;

    assertTypedIdentityRejection(outcome);
    assert.deepEqual(fixture.requests.filter(request => request.action === 'revoke_one'), []);
    assert.deepEqual(fixture.requests.filter(request => request.kind === 'logout'), []);
  });
}
}

for (const scenario of [
  { method: 'revokeOtherTerminals', action: 'revoke_others' },
  { method: 'revokeAllTerminals', action: 'revoke_all' },
]) {
  test(`${scenario.method} pins captured A when the SDK token getter observes B`, { timeout: 15_000 }, async () => {
    const fixture = createIdentityFixture();
    await fixture.client.auth.initialize();
    const originalGetSession = fixture.client.auth.getSession.bind(fixture.client.auth);
    const sessionReads = [];
    fixture.client.auth.getSession = async (...args) => {
      const response = await originalGetSession(...args);
      sessionReads.push(observedUser(response));
      if (sessionReads.length === 1) await fixture.switchToB();
      return response;
    };
    const service = loadProductionService(fixture.client);
    const operation = service[scenario.method]('identity_fixture');

    await waitFor(() => fixture.pendingFunctions.length === 1);
    assert.deepEqual(sessionReads.slice(0, 2), [USER_A, USER_B],
      'the installed SDK token getter must observe switched account B');
    assert.deepEqual(
      { action: fixture.requests[0].action, identity: fixture.requests[0].identity },
      { action: scenario.action, identity: 'A' },
    );
    fixture.pendingFunctions[0].pending.resolve(jsonResponse({ revoked: 1 }));
    assert.equal(await operation, 1);

    assert.deepEqual(fixture.requests.filter(request => request.kind === 'logout'), []);
    assert.equal((await originalGetSession()).data.session?.user.id, USER_B);
  });
}

for (const scenario of [
  { method: 'revokeCurrentTerminalWithoutAudit', action: 'revoke_current_terminal' },
  { method: 'revokeAllTerminalsWithoutAudit', action: 'revoke_all_terminals' },
]) {
  test(`${scenario.method} pins captured A when the SDK token getter observes B`, { timeout: 15_000 }, async () => {
    const fixture = createIdentityFixture();
    await fixture.client.auth.initialize();
    const originalGetSession = fixture.client.auth.getSession.bind(fixture.client.auth);
    const sessionReads = [];
    fixture.client.auth.getSession = async (...args) => {
      const response = await originalGetSession(...args);
      sessionReads.push(observedUser(response));
      if (sessionReads.length === 1) await fixture.switchToB();
      return response;
    };
    const service = loadProductionService(fixture.client);
    const operation = service[scenario.method]('identity_fixture');

    await waitFor(() => fixture.pendingRpcs.length === 1);
    assert.deepEqual(sessionReads.slice(0, 2), [USER_A, USER_B],
      'the installed SDK token getter must observe switched account B');
    assert.deepEqual(
      { action: fixture.requests[0].action, identity: fixture.requests[0].identity },
      { action: scenario.action, identity: 'A' },
    );
    fixture.pendingRpcs[0].pending.resolve(jsonResponse(1));
    assert.equal(await operation, 1);

    assert.deepEqual(fixture.requests.filter(request => request.kind === 'logout'), []);
    assert.equal((await originalGetSession()).data.session?.user.id, USER_B);
  });
}
