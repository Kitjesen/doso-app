import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
let sequence = 0;
function session(id) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: 'none' })}.${encode({ sub: id, session_id: id, exp: expires_at })}.fixture`,
    expires_at, expires_in: 3600, refresh_token: `synthetic-${id}`, token_type: 'bearer',
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-23T00:00:00Z' },
  };
}

async function fixture({ behavior = 'pending', scope = 'local' } = {}) {
  const a = session('11111111-1111-4111-8111-111111111111');
  const b = session('22222222-2222-4222-8222-222222222222');
  const key = `logout-offline-fixture-${++sequence}`;
  const storage = new Map([[key, JSON.stringify(a)]]);
  const calls = [];
  let finish, body, aborted = false;
  const pending = new Promise(resolve => { finish = resolve; });
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_offline_fixture', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storageKey: key,
      storage: { getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => { storage.set(key, value); },
        removeItem: async key => { storage.delete(key); } } },
    global: { fetch: createAuthRequestFetch(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/functions/v1/account-sessions') {
        const action = JSON.parse(init.body).action;
        calls.push(action);
        return json(action === 'list' ? { terminals: [{ id: 'terminal-fixture', is_current: true }] } : { revoked: 1 });
      }
      if (url.pathname === '/auth/v1/logout') {
        calls.push(`logout:${url.searchParams.get('scope')}`);
        init.signal?.addEventListener('abort', () => { aborted = true; }, { once: true });
        if (behavior === 'success') return new Response(null, { status: 204 });
        if (behavior === 'body') return new Response(new ReadableStream({ start(controller) { body = controller; } }));
        return pending; // Deliberately ignore AbortSignal to model a stalled native transport.
      }
      if (url.pathname === '/auth/v1/token') return json(b);
      throw new Error('Unexpected offline fixture route');
    }, { timeoutMs: 25 }) },
  });
  await client.auth.initialize();
  const modules = new Map();
  function load(url) {
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const module = { exports: {} }; modules.set(url.href, module);
    vm.runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module, exports: module.exports, Error, Promise, Response, TextDecoder, Uint8Array, performance,
      setTimeout, clearTimeout, process: { env: {} },
      require(name) {
        if (name === './supabaseClient') return { getSupabaseClient: () => client };
        if (name === 'react-native') return { Platform: { OS: 'android', Version: 35 } };
        if (name === 'expo-secure-store') return {};
        if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
        throw new Error(`Unexpected fixture dependency: ${name}`);
      },
    });
    return module.exports;
  }
  const coordinator = load(new URL('../src/services/authSessionOperation.ts', import.meta.url));
  const service = load(new URL('../src/services/sessionService.ts', import.meta.url));
  return { client, service, coordinator, a, b, calls, scope,
    stored: () => storage.has(key) ? JSON.parse(storage.get(key)) : null,
    wasAborted: () => aborted,
    finish: async () => {
      if (body) { body.enqueue(new TextEncoder().encode('{}')); body.close(); body = undefined; }
      finish(new Response(null, { status: 204 })); await flush();
    },
  };
}

for (const scope of ['local', 'global', 'others']) {
  test(`real SDK ${scope} logout settles on an ignored abort and a late 204 cannot clear a newer session`, { timeout: 3000 }, async () => {
    const state = await fixture({ scope });
    let timer;
    try {
      const operation = state.coordinator.runAuthSessionOperation(() => state.client.auth.signOut({ scope }));
      const outcome = await Promise.race([operation,
        new Promise(resolve => { timer = setTimeout(() => resolve('still-pending'), 200); })]);
      assert.notEqual(outcome, 'still-pending', 'logout must settle so the production coordinator can release its owner');
      assert.equal(outcome.error?.code, 'request_timeout');
      assert.equal(state.wasAborted(), true);
      assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(state.stored()?.user.id ?? null, scope === 'others' ? state.a.user.id : null);
      assert.deepEqual(state.calls, [`logout:${scope}`], 'logout does not retry');
      const login = await state.coordinator.runAuthSessionOperation(() => state.client.auth.signInWithPassword({
        email: 'offline@fixture.invalid', password: 'synthetic-fixture-only',
      }));
      assert.equal(login.error, null);
      await state.finish();
      assert.equal(state.stored()?.user.id, state.b.user.id, 'late logout response cannot delete the new login');
    } finally { clearTimeout(timer); await state.finish(); await state.client.auth.dispose(); }
  });
}

for (const [method, scope] of [['revokeCurrentTerminal', 'local'], ['revokeOtherTerminals', 'others'], ['revokeAllTerminals', 'local']]) {
  for (const behavior of ['pending', 'body', 'success']) {
    test(`production ${method} reports ${behavior} logout accurately and releases coordinator`, { timeout: 3000 }, async () => {
      const state = await fixture({ behavior });
      let timer;
      try {
        const operation = state.service[method]().then(value => ({ value }), error => ({ error }));
        const result = await Promise.race([operation,
          new Promise(resolve => { timer = setTimeout(() => resolve('still-pending'), 200); })]);
        assert.notEqual(result, 'still-pending');
        if (behavior === 'success') assert.equal(result.value, 1);
        else {
          assert.equal(result.error?.outcome, 'session-cleanup-unconfirmed');
          assert.match(result.error.message, /清理结果无法确认/);
          assert.equal(state.wasAborted(), true);
        }
        assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
        assert.equal(state.stored()?.user.id ?? null, scope === 'others' ? state.a.user.id : null);
        assert.equal(state.calls.filter(call => call === `logout:${scope}`).length, 1);
        await state.finish();
      } finally { clearTimeout(timer); await state.finish(); await state.client.auth.dispose(); }
    });
  }
}
