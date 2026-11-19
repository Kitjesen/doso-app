import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111', DEVICE = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333', SESSION = '44444444-4444-4444-8444-444444444444';
const dto = () => ({ deviceId: DEVICE, sessionId: SESSION, expiresAt: new Date(Date.now() + 20_000).toISOString(), endpoint: 'https://control.test', grant: 'synthetic-control-grant' });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function fixture({ fetchImpl, userId = USER, configured = true } = {}) {
  const modules = new Map(), calls = [], timers = new Map();
  let session = userId ? { user: { id: userId }, access_token: 'synthetic-control-user-token' } : null;
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, AbortController, Promise, Set, URL,
      setTimeout(callback, ms) { const id = {}; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id),
      fetch: (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : Promise.resolve(response(dto())); },
      require(name) {
        if (name === './authSessionOperation') return load('src/services/authSessionOperation.ts');
        if (name === './supabaseClient') return {
          getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session }, error: null }) } }),
          supabaseConfig: configured ? { url: 'https://api.test', publishableKey: 'synthetic-public-key' } : {},
        };
        throw new Error(`Unexpected dependency ${name}`);
      },
    }, { filename: path });
    return module.exports;
  };
  const service = load('src/services/remoteControl.ts'), auth = load('src/services/authSessionOperation.ts');
  return { service, calls, get timerCount() { return timers.size; },
    switch(id) { return auth.runAuthSessionOperation(async () => { session = { user: { id }, access_token: 'other-token' }; }); },
  };
}
const errorCode = (code, unknown = false) => error => error.code === code && error.outcomeMayBeUnknown === unknown && !error.message.includes('synthetic-');

test('create returns opaque grant using the current account without extra authority fields', async () => {
  const f = fixture(), value = await f.service.createRemoteControlSession(USER, DEVICE);
  assert.equal(value.deviceId, DEVICE); assert.equal(value.grant, 'synthetic-control-grant');
  assert.equal(f.calls[0][0], 'https://api.test/functions/v1/remote-control');
  assert.deepEqual(JSON.parse(f.calls[0][1].body), { deviceId: DEVICE, action: 'create' });
  assert.equal(f.calls[0][1].headers.Authorization, 'Bearer synthetic-control-user-token');
  assert.equal(f.calls[0][1].redirect, 'error'); assert.equal(f.timerCount, 0);
});

test('close sends the session identity and requires confirmation', async () => {
  const f = fixture({ fetchImpl: async () => response({ closed: true }) });
  assert.equal((await f.service.closeRemoteControlSession(USER, DEVICE, SESSION)).closed, true);
  assert.deepEqual(JSON.parse(f.calls[0][1].body), { deviceId: DEVICE, action: 'close', sessionId: SESSION });
});

test('missing account, configuration and invalid session stop before dispatch', async () => {
  for (const userId of [null, OTHER]) {
    const f = fixture({ userId });
    await assert.rejects(f.service.createRemoteControlSession(USER, DEVICE), errorCode('unauthorized'));
    assert.equal(f.calls.length, 0);
  }
  const unconfigured = fixture({ configured: false });
  await assert.rejects(unconfigured.service.createRemoteControlSession(USER, DEVICE), errorCode('configuration'));
  const invalid = fixture();
  await assert.rejects(invalid.service.closeRemoteControlSession(USER, DEVICE, 'bad'), errorCode('invalid_request'));
  assert.equal(invalid.calls.length, 0);
});

test('account switch invalidates a pending grant without retrying the operation', async () => {
  const pending = deferred(), f = fixture({ fetchImpl: () => pending.promise });
  const created = f.service.createRemoteControlSession(USER, DEVICE); await settle();
  await f.switch(OTHER); pending.resolve(response(dto()));
  await assert.rejects(created, errorCode('unauthorized', true));
  assert.equal(f.calls.length, 1); assert.equal(f.timerCount, 0);
});

test('cancellation before dispatch releases resources and sends no request', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.createRemoteControlSession(USER, DEVICE, { signal: controller.signal }), errorCode('cancelled'));
  assert.equal(f.calls.length, 0); assert.equal(f.timerCount, 0);
});

test('definite busy and authorization responses differ from unknown dispatch outcomes', async () => {
  for (const [status, code] of [[409, 'busy'], [403, 'unauthorized'], [400, 'invalid_request']]) {
    const f = fixture({ fetchImpl: async () => response({}, status) });
    await assert.rejects(f.service.createRemoteControlSession(USER, DEVICE), errorCode(code));
  }
  for (const value of [{ ...dto(), deviceId: OTHER }, { ...dto(), endpoint: 'http://public.test' }, { ...dto(), grant: '' }]) {
    const f = fixture({ fetchImpl: async () => response(value) });
    await assert.rejects(f.service.createRemoteControlSession(USER, DEVICE), errorCode('invalid_response', true));
    assert.equal(f.calls.length, 1);
  }
});
