import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadFlow() {
  const filename = new URL('../src/auth/mfaVerificationFlow.ts', import.meta.url);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, Object, Symbol }, { filename: filename.pathname });
  return module.exports;
}

const identity = { userId: 'user-a', sessionId: 'session-a' };
const successStatus = {
  enabled: true,
  currentLevel: 'aal2',
  nextLevel: 'aal2',
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
};

function ready(overrides = {}) {
  return {
    identity,
    preparedKey: 'prepared-b',
    preparedUserId: identity.userId,
    loading: false,
    authorized: true,
    active: true,
    busy: false,
    ...overrides,
  };
}

test('one MFA verification owns the flow until it is aborted before dispatch', () => {
  const api = loadFlow();
  const flow = api.createMfaVerificationFlow();
  const first = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'enrollment' });

  assert.equal(flow.isPending(), true);
  assert.throws(
    () => flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up' }),
    api.isMfaVerificationFlowBusyError,
  );
  assert.equal(flow.abortBeforeDispatch(first), true);
  assert.equal(flow.isPending(), false);

  const second = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up' });
  assert.notEqual(second, first);
});

test('settled success waits for idle auth and a fresh prepared session before delivering once', () => {
  const api = loadFlow();
  const flow = api.createMfaVerificationFlow();
  const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'enrollment' });
  assert.equal(flow.settle(ticket, { status: successStatus }), true);
  assert.equal(flow.abortBeforeDispatch(ticket), false);

  assert.equal(flow.reconcile(ready({ busy: true })), null);
  assert.equal(flow.reconcile(ready({ loading: true })), null);
  assert.equal(flow.reconcile(ready({ preparedKey: 'prepared-a' })), null);
  assert.equal(flow.isPending(), true);

  const delivery = flow.reconcile(ready());
  assert.equal(delivery.kind, 'enrollment');
  assert.equal(delivery.status, successStatus);
  assert.equal(flow.reconcile(ready()), null);
  assert.equal(flow.isPending(), false);
});

test('identity loss or inactivity retires delivery but retains ownership until settlement', () => {
  const api = loadFlow();
  for (const staleState of [
    ready({ identity: null }),
    ready({ identity: { userId: 'user-b', sessionId: identity.sessionId } }),
    ready({ identity: { userId: identity.userId, sessionId: 'session-b' } }),
    ready({ active: false }),
  ]) {
    const flow = api.createMfaVerificationFlow();
    const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up' });
    assert.equal(flow.reconcile(staleState), null);
    assert.equal(flow.isPending(), true);
    assert.throws(
      () => flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up' }),
      api.isMfaVerificationFlowBusyError,
    );
    assert.equal(flow.settle(ticket, { status: successStatus }), true);
    assert.equal(flow.isPending(), true);
    assert.equal(flow.reconcile(staleState), null);
    assert.equal(flow.isPending(), false);
  }
});

test('settled failures wait for idle auth and deliver only a generic failure', () => {
  const api = loadFlow();
  const flow = api.createMfaVerificationFlow();
  const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up' });
  assert.equal(flow.settle(ticket, { failed: true }), true);

  assert.equal(flow.reconcile(ready({ busy: true })), null);
  assert.equal(flow.reconcile(ready({ loading: true })), null);
  assert.equal(flow.reconcile(ready({ preparedKey: 'prepared-a' })), null);
  assert.equal(flow.isPending(), true);
  const failure = flow.reconcile(ready());
  assert.equal(failure.failed, true);
  assert.deepEqual(Object.keys(failure), ['failed']);
  assert.equal(flow.reconcile(ready()), null);
});

test('settled invalid authorization, preparation, or assurance clears as generic failure', () => {
  const api = loadFlow();
  const invalidCases = [
    { state: ready({ authorized: false }), status: successStatus },
    { state: ready({ preparedKey: null }), status: successStatus },
    { state: ready({ preparedUserId: 'user-b' }), status: successStatus },
    { state: ready(), status: { ...successStatus, enabled: false } },
    { state: ready(), status: { ...successStatus, currentLevel: 'aal1' } },
  ];
  for (const invalid of invalidCases) {
    const flow = api.createMfaVerificationFlow();
    const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'enrollment' });
    flow.settle(ticket, { status: invalid.status });
    const delivery = flow.reconcile(invalid.state);
    assert.equal(delivery.failed, true);
    assert.deepEqual(Object.keys(delivery), ['failed']);
    assert.equal(flow.isPending(), false);
  }
});

test('foreign tickets cannot settle, abort, or release the current attempt', () => {
  const api = loadFlow();
  const flow = api.createMfaVerificationFlow();
  const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'step-up', code: 'not-retained' });
  const foreign = { sequence: ticket.sequence };

  assert.equal(flow.settle(foreign, { failed: true }), false);
  assert.equal(flow.abortBeforeDispatch(foreign), false);
  assert.equal(flow.isPending(), true);
  assert.deepEqual(Object.keys(ticket), ['sequence']);
  assert.equal(JSON.stringify(ticket).includes('not-retained'), false);
  assert.equal(flow.abortBeforeDispatch(ticket), true);
});

test('dispose drops delivery without pretending to cancel in-flight work', () => {
  const api = loadFlow();
  const flow = api.createMfaVerificationFlow();
  const ticket = flow.begin({ identity, preparedKey: 'prepared-a', kind: 'enrollment' });
  flow.dispose();

  assert.equal(flow.isPending(), true);
  assert.equal(flow.reconcile(ready()), null);
  assert.equal(flow.settle(ticket, { status: successStatus }), true);
  assert.equal(flow.reconcile(ready()), null);
  assert.equal(flow.isPending(), false);
});
