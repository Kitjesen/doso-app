// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESIGN_QA_STAGES,
  isDesignQaRequested,
  parseDesignQaRequest,
} from '../src/design-qa/request.ts';

test('design QA mode requires the exact opt-in value', () => {
  assert.equal(isDesignQaRequested('?design-qa=1'), true);
  assert.equal(isDesignQaRequested('?design-qa=true'), false);
  assert.equal(isDesignQaRequested('?design-qa=0'), false);
  assert.equal(isDesignQaRequested(''), false);
});

test('each supported stage resolves a safe default state', () => {
  for (const stage of DESIGN_QA_STAGES) {
    const request = parseDesignQaRequest(`?design-qa=1&qa-stage=${stage}`);
    assert.equal(request.stage, stage);
    const unavailableByDefault = ['auth-mfa', 'device-provisioning', 'device-firmware', 'account-security'].includes(stage);
    assert.equal(request.state, unavailableByDefault ? 'unavailable' : 'default');
    assert.equal(request.issue, null);
  }
});

test('supported explicit states are accepted', () => {
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=auth-forgot-password&qa-state=loading'),
    { stage: 'auth-forgot-password', state: 'loading', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=auth-reset-password&qa-state=nonce'),
    { stage: 'auth-reset-password', state: 'nonce', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=auth-mfa&qa-state=unavailable'),
    { stage: 'auth-mfa', state: 'unavailable', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=main-analysis&qa-state=trusted-empty'),
    { stage: 'main-analysis', state: 'trusted-empty', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=device-bind&qa-state=loading'),
    { stage: 'device-bind', state: 'loading', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=account-security&qa-state=unavailable'),
    { stage: 'account-security', state: 'unavailable', issue: null },
  );
  assert.deepEqual(
    parseDesignQaRequest('?design-qa=1&qa-stage=auth-email-otp&qa-state=expired'),
    { stage: 'auth-email-otp', state: 'expired', issue: null },
  );
  for (const state of ['permission-denied', 'bluetooth-off', 'scanning', 'empty']) {
    assert.deepEqual(
      parseDesignQaRequest(`?design-qa=1&qa-stage=device-ble-discovery&qa-state=${state}`),
      { stage: 'device-ble-discovery', state, issue: null },
    );
  }
});

test('unknown stages and unsupported states fail closed', () => {
  const unknown = parseDesignQaRequest('?design-qa=1&qa-stage=not-a-screen');
  assert.equal(unknown.stage, null);
  assert.equal(unknown.state, null);
  assert.match(unknown.issue ?? '', /qa-stage/);

  const impossible = parseDesignQaRequest('?design-qa=1&qa-stage=auth-forgot-password&qa-state=sent');
  assert.equal(impossible.stage, 'auth-forgot-password');
  assert.equal(impossible.state, null);
  assert.match(impossible.issue ?? '', /不支持/);

  const unsafeProvisioning = parseDesignQaRequest('?design-qa=1&qa-stage=device-provisioning&qa-state=success');
  assert.equal(unsafeProvisioning.stage, 'device-provisioning');
  assert.equal(unsafeProvisioning.state, null);
  assert.match(unsafeProvisioning.issue ?? '', /不支持/);
});
