import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRpcResponse,
  evaluateExpectedState,
  hostedTarget,
  probeRpc,
} from './verify-hosted-public-rpc.mjs';

test('PGRST202 is classified as an RPC missing from the hosted schema cache', () => {
  assert.deepEqual(
    classifyRpcResponse(404, { code: 'PGRST202', message: 'not found' }, 'claim_username'),
    { classification: 'missing', httpStatus: 404, code: 'PGRST202' },
  );
});

test('PGRST202 only means missing on its canonical 404 response', () => {
  assert.deepEqual(
    classifyRpcResponse(200, { code: 'PGRST202' }, 'claim_username'),
    { classification: 'unexpected_success', httpStatus: 200, code: 'PGRST202' },
  );
  assert.deepEqual(
    classifyRpcResponse(500, { code: 'PGRST202' }, 'claim_username'),
    { classification: 'indeterminate', httpStatus: 500, code: 'PGRST202' },
  );
});

test('an exact PostgreSQL function ACL denial proves the RPC is present without entering its body', () => {
  assert.deepEqual(
    classifyRpcResponse(
      401,
      { code: '42501', message: 'permission denied for function heartbeat_current_terminal' },
      'heartbeat_current_terminal',
    ),
    { classification: 'present_blocked', httpStatus: 401, code: '42501' },
  );
});

test('function-body P0001 and 42501 errors are rejected as unexpected execution', () => {
  assert.deepEqual(
    classifyRpcResponse(400, { code: 'P0001', message: 'account_or_session_inactive' }, 'claim_username'),
    { classification: 'unexpected_execution', httpStatus: 400, code: 'P0001' },
  );
  assert.deepEqual(
    classifyRpcResponse(403, { code: '42501', message: 'authentication_required' }, 'list_my_login_methods'),
    { classification: 'unexpected_execution', httpStatus: 403, code: '42501' },
  );
});

test('an anonymous success is rejected because a public readiness probe must never mutate data', () => {
  assert.deepEqual(
    classifyRpcResponse(200, {}, 'claim_username'),
    { classification: 'unexpected_success', httpStatus: 200, code: 'none' },
  );
});

test('gateway failures and unstructured auth failures remain indeterminate', () => {
  assert.deepEqual(
    classifyRpcResponse(502, { message: 'bad gateway' }, 'claim_username'),
    { classification: 'indeterminate', httpStatus: 502, code: 'none' },
  );
  assert.deepEqual(
    classifyRpcResponse(401, { message: 'invalid API key' }, 'claim_username'),
    { classification: 'indeterminate', httpStatus: 401, code: 'none' },
  );
});

test('the probe sends only the publishable apikey and no bearer session', async () => {
  let request;
  const result = await probeRpc({
    baseUrl: 'https://example.supabase.co',
    publishableKey: 'public-test-key',
    name: 'heartbeat_current_terminal',
    body: {},
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        code: '42501',
        message: 'permission denied for function heartbeat_current_terminal',
      }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(request.url, 'https://example.supabase.co/rest/v1/rpc/heartbeat_current_terminal');
  assert.equal(request.init.headers.apikey, 'public-test-key');
  assert.equal(request.init.headers.Authorization, undefined);
  assert.deepEqual(result, {
    name: 'heartbeat_current_terminal',
    classification: 'present_blocked',
    httpStatus: 401,
    code: '42501',
  });
});

test('the hosted target is bound to the expected production project ref', () => {
  assert.deepEqual(hostedTarget('https://vchvqfdlkomlrjenkdhj.supabase.co'), {
    baseUrl: 'https://vchvqfdlkomlrjenkdhj.supabase.co',
    hostname: 'vchvqfdlkomlrjenkdhj.supabase.co',
    projectRef: 'vchvqfdlkomlrjenkdhj',
  });
  assert.throws(
    () => hostedTarget('https://wrong-project.supabase.co'),
    /expected Supabase project vchvqfdlkomlrjenkdhj/,
  );
});

test('predeploy expects the baseline RPC present and both release RPCs missing', () => {
  const results = [
    result('heartbeat_current_terminal', 'present_blocked'),
    result('claim_username', 'missing'),
    result('list_my_login_methods', 'missing'),
  ];
  assert.deepEqual(evaluateExpectedState(results, 'predeploy'), []);
});

test('postdeploy fails when either release RPC is still missing', () => {
  const results = [
    result('heartbeat_current_terminal', 'present_blocked'),
    result('claim_username', 'present_blocked'),
    result('list_my_login_methods', 'missing'),
  ];
  assert.deepEqual(evaluateExpectedState(results, 'postdeploy'), [
    'list_my_login_methods expected present_blocked, found missing',
  ]);
});

test('any anonymously executable probe is a release blocker in every state', () => {
  const results = [
    result('heartbeat_current_terminal', 'unexpected_success'),
    result('claim_username', 'missing'),
    result('list_my_login_methods', 'missing'),
  ];
  assert.deepEqual(evaluateExpectedState(results, 'predeploy'), [
    'heartbeat_current_terminal expected present_blocked, found unexpected_success',
  ]);
});

function result(name, classification) {
  return { name, classification, httpStatus: classification === 'missing' ? 404 : 401, code: 'test' };
}
