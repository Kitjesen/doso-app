import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESSION_A = '22222222-2222-4222-8222-222222222222';
export const SESSION_A_NEW = '55555555-5555-4555-8555-555555555555';
export const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const STORAGE_KEY = 'doso-session-identity-fixture';
let fixtureSequence = 0;

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fixtureSession(userId, sessionId, label) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
    aud: 'authenticated', exp: expiresAt, role: 'authenticated', session_id: sessionId, sub: userId,
  })}.${base64url({ fixture: label })}`;
  return {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: `fixture-refresh-${label}`,
    token_type: 'bearer',
    user: {
      id: userId, aud: 'authenticated', role: 'authenticated', email: `${label.toLowerCase()}@fixture.invalid`,
      app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-16T00:00:00.000Z',
    },
  };
}

function memoryStorage(initialSession, storageKey) {
  const values = new Map([[storageKey, JSON.stringify(initialSession)]]);
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function loadProductionService(client) {
  const loadModule = (path, dependencies = {}) => {
    const loaded = { exports: {} };
    const loadedCode = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(loadedCode, {
      module: loaded, exports: loaded.exports, TextDecoder, Uint8Array, atob,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return loaded.exports;
  };
  const identityModule = loadModule('../../src/services/authSessionIdentity.ts');
  const fenceModule = loadModule('../../src/services/sessionIngestionFence.ts', {
    './authSessionIdentity': identityModule,
  });
  const coordinatorModule = loadModule('../../src/services/authSessionOperation.ts');
  const source = readFileSync(new URL('../../src/services/sessionService.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, TextDecoder, Uint8Array, atob,
    process: { env: {} }, performance, setTimeout, clearTimeout,
    require(name) {
      if (name === './supabaseClient') return { getSupabaseClient: () => client };
      if (name === './authSessionIdentity') return identityModule;
      if (name === './sessionIngestionFence') return fenceModule;
      if (name === './authSessionOperation') return coordinatorModule;
      if (name === 'react-native') return { Platform: { OS: 'android', Version: 35 } };
      if (name === 'expo-secure-store') return {
        getItemAsync: async () => null, setItemAsync: async () => {},
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

export function createIdentityFixture({ holdLogout = false } = {}) {
  const sessionA = fixtureSession(USER_A, SESSION_A, 'A');
  const sessionARefresh = fixtureSession(USER_A, SESSION_A, 'A-refresh');
  const sessionANew = fixtureSession(USER_A, SESSION_A_NEW, 'A-new-session');
  const sessionB = fixtureSession(USER_B, SESSION_B, 'B');
  const malformedSession = fixtureSession(USER_A, SESSION_A, 'malformed');
  malformedSession.access_token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
    aud: 'authenticated', exp: malformedSession.expires_at, role: 'authenticated', sub: USER_A,
  })}.${base64url({ fixture: 'malformed' })}`;
  const storageKey = `${STORAGE_KEY}-${++fixtureSequence}`;
  const storage = memoryStorage(sessionA, storageKey);
  const pendingFunctions = [];
  const pendingLogouts = [];
  const pendingRpcs = [];
  const requests = [];
  const requestIdentity = headers => {
    const authorization = new Headers(headers).get('authorization');
    if (authorization === `Bearer ${sessionA.access_token}`) return 'A';
    if (authorization === `Bearer ${sessionARefresh.access_token}`) return 'A-refresh';
    if (authorization === `Bearer ${sessionANew.access_token}`) return 'A-new-session';
    if (authorization === `Bearer ${sessionB.access_token}`) return 'B';
    if (authorization === `Bearer ${malformedSession.access_token}`) return 'malformed';
    return 'none';
  };
  const fetchStub = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = init.headers ?? (typeof input === 'string' ? undefined : input.headers);
    const identity = requestIdentity(headers);
    if (url.includes('/functions/v1/account-sessions')) {
      const body = JSON.parse(String(init.body));
      const pending = deferred();
      requests.push({ kind: 'function', action: body.action, identity, terminalId: body.terminalId ?? null });
      pendingFunctions.push({ action: body.action, pending });
      return pending.promise;
    }
    if (url.includes('/rest/v1/rpc/')) {
      const action = url.slice(url.lastIndexOf('/') + 1);
      const pending = deferred();
      requests.push({ kind: 'rpc', action, identity });
      pendingRpcs.push({ action, pending });
      return pending.promise;
    }
    if (url.includes('/auth/v1/logout')) {
      requests.push({ kind: 'logout', identity });
      if (holdLogout) {
        const pending = deferred();
        pendingLogouts.push(pending);
        return pending.promise;
      }
      return jsonResponse({});
    }
    if (url.includes('/auth/v1/user')) {
      requests.push({ kind: 'user', identity });
      return jsonResponse(identity === 'B' ? sessionB.user : sessionA.user);
    }
    throw new Error('Unexpected fixture URL');
  };
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
      storageKey,
    },
    global: { fetch: fetchStub },
  });
  return {
    client,
    pendingFunctions,
    pendingLogouts,
    pendingRpcs,
    requests,
    storage,
    clearSession: () => storage.removeItem(storageKey),
    switchToA: () => storage.setItem(storageKey, JSON.stringify(sessionA)),
    switchToRefreshedA: () => storage.setItem(storageKey, JSON.stringify(sessionARefresh)),
    switchToSameUserNewSession: () => storage.setItem(storageKey, JSON.stringify(sessionANew)),
    switchToB: () => storage.setItem(storageKey, JSON.stringify(sessionB)),
    switchToMalformedSession: () => storage.setItem(storageKey, JSON.stringify(malformedSession)),
    setSessionB: () => client.auth.setSession({
      access_token: sessionB.access_token,
      refresh_token: sessionB.refresh_token,
    }),
  };
}

export async function waitFor(predicate) {
  for (let count = 0; count < 50; count += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Fixture request did not reach the expected boundary');
}
