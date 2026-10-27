// Synthetic public AuthClient/HTTP/storage; production service, mapper and
// same-runtime coordinator. Never read live configuration or print PKCE values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthClient } from '@supabase/supabase-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';
import { mapOtpOperationError } from '../src/services/otpError.ts';

const ROOT = new URL('../', import.meta.url);
const UNCERTAIN = '邮件发送结果暂时无法确认，请先检查收件箱和垃圾邮件，稍后再试。';
const REDIRECT = 'https://fixture.example.invalid/auth/reset-password';
const EMAIL = ' MAIL@Example.invalid ';
const entries = ['sendPasswordRecoveryOtp', 'forgotPassword', 'resendSignupOtp'];
let sequence = 0;
const jsonResponse = (body = {}, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function loadProduction(getClient) {
  const modules = new Map();
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, TypeError, URL, URLSearchParams,
      Promise, Set, Map, RegExp, console, process: { env: {} }, require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: getClient };
        if (name.startsWith('.')) return load(`src/services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected mail fixture dependency ${name}`);
      } }, { filename: path });
    return module.exports;
  };
  return { service: load('src/services/authService.ts'), coordinator: load('src/services/authSessionOperation.ts') };
}
async function fixture({ timeoutMs = 5000 } = {}) {
  const storageKey = `mail-fixture-${++sequence}`;
  const values = new Map(), events = [];
  let auth, externalOwner = null, handler = null, storageHook = null, getterReads = 0;
  const api = loadProduction(() => { getterReads++; return { auth }; });
  const keyKind = key => key === `${storageKey}-flows-code-verifier` ? 'flow-index'
    : key === `${storageKey}-code-verifier` ? 'legacy-verifier'
      : key.startsWith(`${storageKey}-flow-`) ? 'flow-slot' : key === storageKey ? 'session' : 'other';
  const record = (action, kind) => {
    const state = api.coordinator.getAuthSessionOperationSnapshot();
    const event = { action, kind, busy: state.busy, operation: state.kind,
      externalOwner: externalOwner !== null && state.owner === externalOwner };
    events.push(event); return event;
  };
  auth = new AuthClient({ url: 'https://mail-fixture.supabase.co/auth/v1',
    headers: { apikey: 'sb_publishable_fixture', Authorization: 'Bearer sb_publishable_fixture' },
    autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, flowType: 'pkce', storageKey,
    storage: {
      getItem: async key => { const event = record('get', keyKind(key)); await storageHook?.(event); return values.get(key) ?? null; },
      setItem: async (key, value) => { const event = record('set', keyKind(key)); await storageHook?.(event); values.set(key, value); },
      removeItem: async key => { const event = record('remove', keyKind(key)); await storageHook?.(event); values.delete(key); },
    },
    fetch: createAuthRequestFetch(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.ok(['/auth/v1/recover', '/auth/v1/resend'].includes(url.pathname), 'no unexpected HTTP may escape the fixture');
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal(body.email, 'mail@example.invalid');
      assert.equal(typeof body.code_challenge, 'string');
      assert.ok(body.code_challenge.length > 0);
      if (url.pathname.endsWith('/recover')) assert.ok(url.searchParams.get('redirect_to').startsWith(REDIRECT));
      else assert.equal(body.type, 'signup');
      record('http', url.pathname.endsWith('/recover') ? 'recover' : 'resend');
      return handler ? handler({ input, init }) : jsonResponse();
    }, { timeoutMs }),
  });
  const initialized = await auth.initialize(); assert.equal(initialized.error, null);
  assert.equal(events.filter(event => event.action === 'http').length, 0);
  events.length = 0;
  return { ...api, auth, values, events, storageKey,
    get getterReads() { return getterReads; },
    call(method) { return api.service[method](EMAIL, REDIRECT); },
    setHandler(value) { handler = value; }, setStorageHook(value) { storageHook = value; },
    setExternalOwner(value) { externalOwner = value; },
    pkce() { return { slots: [...values.keys()].filter(key => keyKind(key) === 'flow-slot').length,
      indexCount: JSON.parse(values.get(`${storageKey}-flows-code-verifier`) ?? '[]').length,
      legacyPresent: values.has(`${storageKey}-code-verifier`) }; },
    seedOtherFlow() {
      const flow = 'a'.repeat(32);
      values.set(`${storageKey}-flow-${flow}-code-verifier`, JSON.stringify('synthetic-existing-verifier'));
      values.set(`${storageKey}-flows-code-verifier`, JSON.stringify([flow]));
    },
    dispose: () => auth.dispose(),
  };
}
async function assertBusyEntry(method, t) {
  const f = await fixture(), hold = deferred(), owner = {};
  f.setExternalOwner(owner);
  const existing = f.coordinator.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  try {
    const outcome = await f.call(method).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    t.diagnostic(JSON.stringify({ scenario: 'mail-busy', method, outcome: outcome.status,
      getterReads: f.getterReads, storageOperations: f.events.filter(event => event.action !== 'http').length,
      httpRequests: f.events.filter(event => event.action === 'http').length, pkce: f.pkce(),
      externalOwnerStillBusy: f.coordinator.getAuthSessionOperationSnapshot().owner === owner }));
    assert.equal(outcome.status, 'rejected');
    assert.equal(f.coordinator.isAuthSessionOperationBusyError(outcome.error), true);
    assert.equal(f.getterReads, 0); assert.deepEqual(f.events, []);
    assert.deepEqual(f.pkce(), { slots: 0, indexCount: 0, legacyPresent: false });
  } finally { hold.resolve(); await existing; await f.dispose(); }
}

test('delivery request_timeout reports uncertain mail outcome instead of a failed-send retry prompt', () => {
  const result = mapOtpOperationError({ code: 'request_timeout', status: 408, message: 'Authentication request timed out.' }, 'delivery');
  assert.equal(result.message, UNCERTAIN);
  assert.equal(result.category, 'network_unavailable');
});

test('recovery OTP busy rejection precedes PKCE preparation and HTTP', t => assertBusyEntry('sendPasswordRecoveryOtp', t));
test('legacy recovery busy rejection precedes PKCE preparation and HTTP', t => assertBusyEntry('forgotPassword', t));
test('signup resend busy rejection precedes PKCE preparation and HTTP', t => assertBusyEntry('resendSignupOtp', t));

test('legacy recovery timeout uses the same uncertain-delivery contract as OTP recovery', { timeout: 5000 }, async () => {
  const f = await fixture({ timeoutMs: 20 });
  f.setHandler(() => new Promise(() => undefined));
  try {
    await assert.rejects(f.call('forgotPassword'), error => {
      assert.equal(error.message, UNCERTAIN); return true;
    });
    assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally { await f.dispose(); }
});

test('delivery network uncertainty preserves verification, rate-limit and lookalike-code contracts', () => {
  for (const error of [{ status: 0, message: 'Failed to fetch' }, new TypeError('Network request failed')]) {
    const delivery = mapOtpOperationError(error, 'delivery');
    assert.equal(delivery.message, UNCERTAIN);
    assert.equal(delivery.category, 'network_unavailable');
    assert.equal(mapOtpOperationError(delivery, 'delivery'), delivery);
    assert.equal(mapOtpOperationError(error, 'verification').message, '无法连接认证服务，请检查网络后重试。');
  }
  const rate = mapOtpOperationError({ code: 'request_timeout', status: 429 }, 'delivery');
  assert.equal(rate.category, 'rate_limited');
  assert.equal(rate.message, '操作过于频繁，请稍后再试。');
  assert.equal(mapOtpOperationError({ code: 'request_timeout_extra', status: 408 }, 'delivery').category, 'delivery_failed');
  assert.equal(mapOtpOperationError({ code: 'request_timeout', status: 408 }, 'verification').category, 'verification_failed');
});

for (const method of entries) {
  test(`${method} owns PKCE preparation and one mail request until SDK success`, { timeout: 7000 }, async t => {
    const f = await fixture(), entered = deferred(), response = deferred();
    f.setHandler(() => { entered.resolve(); return response.promise; });
    const pending = f.call(method);
    try {
      await entered.promise;
      assert.ok(f.events.filter(event => event.action === 'set').length >= 3);
      assert.ok(f.events.every(event => event.busy && event.operation === 'session-write' && !event.externalOwner));
      const httpAt = f.events.findIndex(event => event.action === 'http');
      assert.ok(f.events.filter(event => event.action === 'set').every(event => f.events.indexOf(event) < httpAt));
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      response.resolve(jsonResponse());
      assert.equal(await pending, undefined);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.deepEqual(f.pkce(), { slots: 1, indexCount: 1, legacyPresent: true });
      assert.equal(f.events.filter(event => event.action === 'http').length, 1);
      t.diagnostic(JSON.stringify({ scenario: 'mail-owned-success', method,
        ownedPkceAndHttp: true, httpRequests: 1, pkce: f.pkce(), finalBusy: false }));
    } finally { response.resolve(jsonResponse()); await pending.catch(() => undefined); await f.dispose(); }
  });

  test(`${method} retains ownership through failed-delivery PKCE cleanup and preserves another flow`, { timeout: 7000 }, async () => {
    const f = await fixture(), cleanupEntered = deferred(), cleanupRelease = deferred();
    f.seedOtherFlow();
    f.setHandler(() => jsonResponse({ code: 'over_email_send_rate_limit', msg: 'Synthetic rate limit' }, 429));
    f.setStorageHook(event => {
      if (event.action === 'remove' && event.kind === 'flow-slot') {
        cleanupEntered.resolve(); return cleanupRelease.promise;
      }
    });
    const outcome = f.call(method).then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', error }));
    try {
      await cleanupEntered.promise;
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
      await assert.rejects(f.coordinator.runAuthSessionOperation(async () => 'competitor'), f.coordinator.isAuthSessionOperationBusyError);
      cleanupRelease.resolve();
      const result = await outcome;
      assert.equal(result.status, 'rejected'); assert.equal(result.error.category, 'rate_limited');
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.deepEqual(f.pkce(), { slots: 1, indexCount: 1, legacyPresent: false });
      assert.equal(f.events.filter(event => event.action === 'http').length, 1);
      assert.ok(f.events.every(event => event.busy && event.operation === 'session-write'));
    } finally { cleanupRelease.resolve(); await outcome; await f.dispose(); }
  });

  for (const mode of ['timeout', 'network']) {
    test(`${method} ${mode} reports uncertain delivery, cleans its flow and never automatically resends`, { timeout: 7000 }, async () => {
      const f = await fixture({ timeoutMs: 25 }), lateReply = deferred();
      let aborted = false;
      f.setHandler(({ init }) => {
        if (mode === 'network') throw new TypeError('Failed to fetch synthetic mail delivery');
        init.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
        return lateReply.promise;
      });
      try {
        await assert.rejects(f.call(method), error => error.message === UNCERTAIN && error.category === 'network_unavailable');
        assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
        assert.deepEqual(f.pkce(), { slots: 0, indexCount: 0, legacyPresent: false });
        assert.equal(f.events.filter(event => event.action === 'http').length, 1);
        assert.ok(f.events.every(event => event.busy && event.operation === 'session-write'));
        if (mode === 'timeout') assert.equal(aborted, true);
        lateReply.resolve(jsonResponse()); await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.events.filter(event => event.action === 'http').length, 1);
        assert.deepEqual(f.pkce(), { slots: 0, indexCount: 0, legacyPresent: false });
      } finally { lateReply.resolve(jsonResponse()); await f.dispose(); }
    });
  }

  test(`${method} preserves getter/configuration errors and releases without SDK dispatch`, async () => {
    for (const name of ['SupabaseConfigurationError', 'Error']) {
      let api, enteredBusy = false;
      const original = new Error('Synthetic configuration failure'); original.name = name;
      api = loadProduction(() => { enteredBusy = api.coordinator.getAuthSessionOperationSnapshot().busy; throw original; });
      await assert.rejects(api.service[method](EMAIL, REDIRECT), error => error === original);
      assert.equal(enteredBusy, true);
      assert.equal(api.coordinator.getAuthSessionOperationSnapshot().busy, false);
    }
  });

  test(`${method} storage failure before HTTP is owned but does not pretend partial PKCE cleanup`, { timeout: 7000 }, async t => {
    const f = await fixture(), original = new Error('Synthetic storage failure');
    f.setStorageHook(event => { if (event.action === 'set' && event.kind === 'flow-index') throw original; });
    try {
      await assert.rejects(f.call(method), error => error === original);
      assert.equal(f.events.filter(event => event.action === 'http').length, 0);
      assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.ok(f.events.every(event => event.busy && event.operation === 'session-write'));
      t.diagnostic(JSON.stringify({ scenario: 'mail-storage-failure', method, httpRequests: 0,
        partialPkceState: f.pkce(), noCustomRecoveryClaim: true }));
    } finally { await f.dispose(); }
  });
}

test('OTP delivery validation stays local and never acquires the client on malformed email', async () => {
  let getterReads = 0;
  const api = loadProduction(() => { getterReads++; throw new Error('unexpected client'); });
  for (const method of ['sendPasswordRecoveryOtp', 'resendSignupOtp']) {
    await assert.rejects(api.service[method]('invalid-email', REDIRECT), { message: '请输入有效的邮箱地址。' });
  }
  assert.equal(getterReads, 0);
  assert.equal(api.coordinator.getAuthSessionOperationSnapshot().busy, false);
});
