import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const module = { exports: {} };
const source = ts.transpileModule(
  readFileSync(new URL('../src/services/deviceEnrollmentService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  Error,
  Object,
  Number,
  RegExp,
  Set,
  Promise,
  TypeError,
  Response,
  require(name) {
    if (name === './supabaseClient') return { getSupabaseClient: () => ({}) };
    throw new Error(`unexpected dependency: ${name}`);
  },
}, { filename: 'src/services/deviceEnrollmentService.ts' });

const { DeviceEnrollmentError, parseDeviceEnrollmentResponse, enrollmentErrorCode } = module.exports;
const IDS = {
  enrollment_id: '11111111-1111-4111-8111-111111111111',
  challenge_id: '22222222-2222-4222-8222-222222222222',
  device_id: '33333333-3333-4333-8333-333333333333',
  owner_account_id: '44444444-4444-4444-8444-444444444444',
  terminal_id: '55555555-5555-4555-8555-555555555555',
  auth_session_id: '66666666-6666-4666-8666-666666666666',
};

function enrollment(overrides = {}) {
  return {
    ...IDS,
    nonce_b64url: 'nonce-for-device-enrollment-01',
    authority_version: 1,
    authorization_epoch: 2,
    factory_reset_counter: 0,
    device_event_sequence: 0,
    phase: 'challenge_issued',
    version: 1,
    issued_at_ms: 1_700_000_000_000,
    expires_at_ms: 1_700_000_030_000,
    ...overrides,
  };
}

test('device enrollment response is strictly validated and normalized', () => {
  const parsed = parseDeviceEnrollmentResponse({ enrollment: enrollment() });
  assert.equal(parsed.enrollmentId, IDS.enrollment_id);
  assert.equal(parsed.deviceId, IDS.device_id);
  assert.equal(parsed.phase, 'challenge_issued');
  assert.equal(parsed.expiresAtMs, 1_700_000_030_000);
  assert.equal(Object.isFrozen(parsed), true);
});

test('device enrollment rejects malformed or expired challenge shapes', () => {
  assert.throws(() => parseDeviceEnrollmentResponse({ enrollment: enrollment({ nonce_b64url: 'short' }) }), error => error instanceof DeviceEnrollmentError && error.code === 'invalid_response');
  assert.throws(() => parseDeviceEnrollmentResponse({ enrollment: enrollment({ expires_at_ms: 1_700_000_000_000 }) }), error => error instanceof DeviceEnrollmentError && error.code === 'invalid_response');
  assert.throws(() => parseDeviceEnrollmentResponse({}), error => error instanceof DeviceEnrollmentError && error.code === 'invalid_response');
});

test('device enrollment error mapping keeps safe server categories', () => {
  assert.equal(enrollmentErrorCode({ error: { code: 'robot_not_ready' } }), 'robot_not_ready');
  assert.equal(enrollmentErrorCode(new TypeError('fetch failed')), 'network');
  assert.equal(enrollmentErrorCode(new Error('unexpected implementation detail')), 'unavailable');
});
