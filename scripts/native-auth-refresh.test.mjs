import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

// Production client/coordinator and local modules are real. SDK/native hosts
// are isolated boundaries; no storage, credentials, native renderer or server.
function environment({ os = 'android', currentState = 'background', start, stop, initialize } = {}) {
  const modules = new Map(), listeners = new Set();
  const calls = [], diagnostics = [];
  let options;
  let initializations = 0;
  const sdk = { auth: {
    initialize() { initializations++; return initialize ? initialize() : Promise.resolve({ error: null }); },
    startAutoRefresh() { calls.push('start'); return start ? start() : Promise.resolve(); },
    stopAutoRefresh() { calls.push('stop'); return stop ? stop() : Promise.resolve(); },
  } };
  const appState = {
    currentState,
    addEventListener(_event, callback) { listeners.add(callback); return { remove() { listeners.delete(callback); } }; },
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const url = new URL(relative, ROOT);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, Error, Promise, URL, Response, AbortController,
      TextEncoder, TextDecoder, Uint8Array, performance, setTimeout, clearTimeout,
      console: { warn: message => diagnostics.push(message) },
      fetch: () => { throw new Error('Unexpected fixture network request'); },
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' } },
      require(name) {
        if (name === '@supabase/supabase-js') return { createClient(_url, _key, config) { options = config; return sdk; } };
        if (name === 'react-native-url-polyfill/auto') return {};
        if (name === 'react-native') return { Platform: { OS: os }, AppState: appState };
        if (name === 'expo-secure-store') return {
          getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {},
        };
        if (name.startsWith('.')) {
          const target = new URL(`${name}.ts`, url);
          return load(target.pathname.slice(ROOT.pathname.length));
        }
        throw new Error('Unexpected native refresh fixture dependency');
      },
    }, { filename: relative });
    return module.exports;
  }
  const clientModule = load('src/services/supabaseClient.ts');
  const coordinator = load('src/services/authSessionOperation.ts');
  return {
    clientModule, coordinator, calls, diagnostics,
    get options() { return options; },
    get listenerCount() { return listeners.size; },
    get initializations() { return initializations; },
    attachLifecycle: () => load('src/services/nativeAuthRefresh.ts').attachNativeAuthRefresh(sdk.auth, appState),
    emit(state) { appState.currentState = state; for (const callback of [...listeners]) callback(state); },
  };
}

test('native foreground events cannot start automatic refresh during a retained auth operation', { timeout: 10_000 }, async () => {
  const state = environment(), held = deferred();
  state.clientModule.getSupabaseClient();
  const operation = state.coordinator.runAuthSessionOperation(() => held.promise);
  try {
    state.emit('active');
    await flush();
    assert.equal(state.calls.includes('start'), false, 'busy foreground event started automatic refresh');
  } finally { held.resolve(); await operation; state.emit('background'); await flush(); }
});

for (const kind of ['session-read', 'factor-write']) {
test(`a ${kind} lease still pauses native refresh until actual idle`, { timeout: 10_000 }, async () => {
  const state = environment({ currentState: 'active' }), held = deferred();
  state.clientModule.getSupabaseClient(); await flush();
  const operation = state.coordinator.runAuthSessionOperation(() => held.promise, { kind });
  try {
    await flush();
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, kind);
    assert.deepEqual(state.calls, ['start', 'stop']);
    state.emit('active'); await flush();
    assert.deepEqual(state.calls, ['start', 'stop']);
    held.resolve(); await operation; await flush();
    assert.deepEqual(state.calls, ['start', 'stop', 'start']);
  } finally { held.resolve(); await operation; state.emit('background'); await flush(); }
});
}

test('first refresh start waits for core initialization and resumes without a second event', { timeout: 10_000 }, async () => {
  const initializing = deferred();
  const state = environment({ currentState: 'active', initialize: () => initializing.promise });
  state.clientModule.getSupabaseClient();
  try {
    await flush();
    assert.deepEqual([...state.calls], [], 'native timer start must not run before core initialize settles');
    assert.equal(state.initializations, 1);
    initializing.resolve({ error: null }); await flush();
    assert.deepEqual(state.calls, ['start'], 'initialization completion must reconcile without an unrelated event');
    assert.equal(state.initializations, 1);
  } finally { initializing.resolve({ error: null }); state.emit('background'); await flush(); }
});

test('a lease acquired during initialization blocks the late start until actual idle', async () => {
  const initializing = deferred(), held = deferred();
  const state = environment({ currentState: 'active', initialize: () => initializing.promise });
  state.clientModule.getSupabaseClient(); await flush();
  const operation = state.coordinator.runAuthSessionOperation(() => held.promise);
  try {
    initializing.resolve({ error: null }); await flush();
    assert.deepEqual(state.calls, []);
    assert.equal(state.initializations, 1);
    held.resolve(); await operation; await flush();
    assert.deepEqual(state.calls, ['start']);
    state.emit('background'); await flush();
    state.emit('active'); await flush();
    assert.deepEqual(state.calls, ['start', 'stop', 'start']);
    assert.equal(state.initializations, 1);
  } finally { held.resolve(); await operation; state.emit('background'); await flush(); }
});

test('background state during initialization suppresses the late start without another initialization', async () => {
  const initializing = deferred();
  const state = environment({ currentState: 'active', initialize: () => initializing.promise });
  state.clientModule.getSupabaseClient(); await flush();
  state.emit('background');
  initializing.resolve({ error: null }); await flush();
  assert.deepEqual(state.calls, []);
  state.emit('active'); await flush();
  assert.deepEqual(state.calls, ['start']);
  assert.equal(state.initializations, 1);
  state.emit('background'); await flush();
});

test('disposal while initialization is pending prevents any late start and removes subscriptions', async () => {
  const initializing = deferred();
  const state = environment({ currentState: 'active', initialize: () => initializing.promise });
  const dispose = state.attachLifecycle(); await flush();
  dispose();
  assert.equal(state.listenerCount, 0);
  initializing.resolve({ error: null }); await flush();
  state.emit('active');
  await state.coordinator.runAuthSessionOperation(async () => undefined); await flush();
  assert.deepEqual(state.calls, []);
  assert.equal(state.initializations, 1);
});

test('a stalled initialize wait does not acquire or strand the session operation lease', async () => {
  const initializing = deferred();
  const state = environment({ currentState: 'active', initialize: () => initializing.promise });
  state.clientModule.getSupabaseClient(); await flush();
  try {
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(await state.coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    assert.deepEqual(state.calls, []);
  } finally { state.emit('background'); initializing.resolve({ error: null }); await flush(); }
});

for (const mode of ['returned-error', 'rejected-promise']) {
test(`initialization ${mode} latches starts off without leaking error details or retrying`, async () => {
  const sentinel = 'PRIVATE_INITIALIZATION_DETAIL';
  const state = environment({ currentState: 'active', initialize: () => mode === 'returned-error'
    ? Promise.resolve({ error: new Error(sentinel) }) : Promise.reject(new Error(sentinel)) });
  state.clientModule.getSupabaseClient(); await flush();
  state.emit('background'); state.emit('active');
  await state.coordinator.runAuthSessionOperation(async () => undefined); await flush();
  assert.equal(state.calls.includes('start'), false);
  assert.equal(state.initializations, 1);
  assert.equal(state.diagnostics.length, 1);
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /PRIVATE_INITIALIZATION_DETAIL/);
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  state.emit('background'); await flush();
});
}

for (const os of ['android', 'ios']) {
test(`${os} owns refresh bootstrap and starts once from the current foreground state`, async () => {
  const state = environment({ os, currentState: 'active' });
  const client = state.clientModule.getSupabaseClient();
  assert.equal(state.options.auth.autoRefreshToken, false);
  assert.equal(state.clientModule.getSupabaseClient(), client);
  await flush();
  assert.deepEqual(state.calls, ['start']);
  assert.equal(state.listenerCount, 1);
  state.emit('active'); await flush();
  assert.deepEqual(state.calls, ['start']);
  state.emit('background'); await flush();
  assert.deepEqual(state.calls, ['start', 'stop']);
});
}

test('web keeps SDK-managed refresh and does not install native lifecycle listeners', async () => {
  const state = environment({ os: 'web', currentState: 'active' });
  state.clientModule.getSupabaseClient();
  assert.equal(state.options.auth.autoRefreshToken, true);
  assert.equal(state.listenerCount, 0);
  state.emit('active'); await flush();
  assert.deepEqual(state.calls, []);
});

test('a client created inside an operation cannot bootstrap refresh before idle', async () => {
  const state = environment({ currentState: 'active' }), held = deferred();
  const operation = state.coordinator.runAuthSessionOperation(() => held.promise);
  state.clientModule.getSupabaseClient();
  try {
    await flush();
    assert.equal(state.options.auth.autoRefreshToken, false);
    assert.deepEqual(state.calls, []);
    held.resolve(); await operation; await flush();
    assert.deepEqual(state.calls, ['start']);
  } finally { held.resolve(); await operation; state.emit('background'); await flush(); }
});

test('SDK control calls serialize and a late start is stopped using the latest busy/background state', async () => {
  const starting = deferred(), held = deferred();
  const state = environment({ currentState: 'active', start: () => starting.promise });
  state.clientModule.getSupabaseClient(); await flush();
  assert.deepEqual(state.calls, ['start']);
  const operation = state.coordinator.runAuthSessionOperation(() => held.promise);
  state.emit('background'); await flush();
  assert.deepEqual(state.calls, ['start'], 'cannot race stop ahead of a still-pending start');
  starting.resolve(); await flush();
  assert.deepEqual(state.calls, ['start', 'stop']);
  held.resolve(); await operation; await flush();
  assert.deepEqual(state.calls, ['start', 'stop'], 'idle must not restart while background');
  state.emit('active'); await flush();
  assert.deepEqual(state.calls, ['start', 'stop', 'start']);
  state.emit('background'); await flush();
});

test('retained SDK work keeps refresh paused after an outward failure until actual settlement', async () => {
  const state = environment({ currentState: 'active' }), sdkWork = deferred();
  state.clientModule.getSupabaseClient(); await flush();
  let retained;
  await assert.rejects(state.coordinator.runAuthSessionOperation(async lease => {
    retained = lease.retain(() => sdkWork.promise);
    throw new Error('fixture outward deadline');
  }), /fixture outward deadline/);
  await flush();
  state.emit('active'); await flush();
  assert.deepEqual(state.calls, ['start', 'stop']);
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
  sdkWork.resolve(); await retained; await flush();
  assert.deepEqual(state.calls, ['start', 'stop', 'start']);
  state.emit('background'); await flush();
});

test('disposing a pending lifecycle removes subscriptions and stops its late start', async () => {
  const starting = deferred();
  const state = environment({ currentState: 'active', start: () => starting.promise });
  const dispose = state.attachLifecycle();
  await flush();
  assert.deepEqual(state.calls, ['start']);
  dispose();
  assert.equal(state.listenerCount, 0);
  starting.resolve(); await flush();
  assert.deepEqual(state.calls, ['start', 'stop']);
  state.emit('active');
  await state.coordinator.runAuthSessionOperation(async () => undefined);
  await flush();
  assert.deepEqual(state.calls, ['start', 'stop']);
});

for (const failingControl of ['start', 'stop']) {
test(`a ${failingControl} rejection cannot leak details or create an automatic restart loop`, async () => {
  const sentinel = 'PRIVATE_REFRESH_CONTROL_DETAIL';
  const state = environment({ currentState: 'active',
    start: failingControl === 'start' ? () => Promise.reject(new Error(sentinel)) : undefined,
    stop: failingControl === 'stop' ? () => Promise.reject(new Error(sentinel)) : undefined,
  });
  state.clientModule.getSupabaseClient(); await flush();
  if (failingControl === 'stop') { state.emit('background'); await flush(); }
  const starts = state.calls.filter(call => call === 'start').length;
  state.emit('active'); await flush();
  assert.equal(state.calls.filter(call => call === 'start').length, starts);
  assert.equal(state.diagnostics.length, 1);
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /PRIVATE_REFRESH_CONTROL_DETAIL/);
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  state.emit('background'); await flush();
});
}
