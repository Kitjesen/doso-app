import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const version = (patch = {}) => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', device_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: '厂区一层', source_map_id: 'factory-first', source_content_epoch: '9', frame_id: 'odom', format: 'lingtu-map-package-v1',
  schema_version: 1, archive_format: 'tar.gz', size_bytes: 662000000, sha256: 'a'.repeat(64), crc64: '18446744073709551615',
  status: 'ready', created_at: '2026-11-03T03:00:00Z', ready_at: '2026-11-03T03:02:00Z', ...patch });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const response = (body = { versions: [version()] }, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fixture({ userId = USER, sessionRead, fetchImpl, configuration = true } = {}) {
  const modules = new Map(), calls = [], timers = new Map();
  let session = userId ? { user: { id: userId }, access_token: 'synthetic-map-session' } : null;
  let authReads = 0;
  const client = { auth: {
    getSession() { authReads++; return sessionRead ? sessionRead() : Promise.resolve({ data: { session }, error: null }); },
  } };
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    const code = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, AbortController, Promise, Set, BigInt,
      setTimeout(callback, ms) { const id = {}; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id),
      fetch: (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : Promise.resolve(response()); },
      require(name) {
        if (name === './authSessionOperation') return load('src/services/authSessionOperation.ts');
        if (name === './supabaseClient') return { getSupabaseClient: () => client, supabaseConfig: configuration ? { url: 'https://maps.example.test/', publishableKey: 'synthetic-publishable-key' } : {} };
        throw new Error(`Unexpected dependency ${name}`);
      },
    }, { filename: path });
    return module.exports;
  };
  const service = load('src/services/cloudMaps.ts'), coordinator = load('src/services/authSessionOperation.ts');
  return { service, coordinator, calls, timers, get authReads() { return authReads; },
    changeUser(id) { return coordinator.runAuthSessionOperation(async () => { session = id ? { user: { id }, access_token: 'synthetic-map-session' } : null; }); },
    rawChangeUser(id) { session = id ? { user: { id }, access_token: 'synthetic-map-session' } : null; },
    fireTimeout() { assert.equal(timers.size, 1); for (const [id, timer] of timers) { timers.delete(id); timer.callback(); } },
  };
}
const code = expected => error => error.code === expected && !error.message.includes('synthetic-map-session');

test('GET uses current authenticated account and returns only catalog fields', async () => {
  const f = fixture({ fetchImpl: async () => response({ versions: [version({ object_key: 'private/path', upload_id: 'secret' })] }) });
  const rows = await f.service.readCloudMaps(USER);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, '厂区一层'); assert.equal(rows[0].frame_id, 'odom');
  assert.equal('object_key' in rows[0], false); assert.equal('upload_id' in rows[0], false);
  assert.equal(f.calls.length, 1);
  const [url, init] = f.calls[0];
  assert.equal(url, 'https://maps.example.test/functions/v1/map-library');
  assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  assert.equal(init.headers.apikey, 'synthetic-publishable-key'); assert.equal(init.headers.Authorization, 'Bearer synthetic-map-session');
  assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); assert.equal(f.authReads, 2); assert.equal(f.timers.size, 0);
});

test('missing or foreign session and missing configuration cannot dispatch catalog reads', async () => {
  for (const userId of [null, OTHER]) {
    const f = fixture({ userId }); await assert.rejects(f.service.readCloudMaps(USER), code('unauthorized')); assert.equal(f.calls.length, 0);
    assert.equal(f.timers.size, 0);
  }
  const f = fixture({ configuration: false }); await assert.rejects(f.service.readCloudMaps(USER), code('configuration')); assert.equal(f.authReads, 0);
});

test('map names use the same Unicode character limit as PostgreSQL text', async () => {
  const name = '🐕'.repeat(200);
  const f = fixture({ fetchImpl: async () => response({ versions: [version({ name })] }) });
  assert.equal((await f.service.readCloudMaps(USER))[0].name, name);
  assert.equal(f.calls[0][1].signal.aborted, true, 'finished read releases its fetch resources');
  const oversized = fixture({ fetchImpl: async () => response({ versions: [version({ name: `${name}犬` })] }) });
  await assert.rejects(oversized.service.readCloudMaps(USER), code('invalid_response'));
});

test('existing Auth operation keeps ownership and blocks catalog session reads', async () => {
  const f = fixture(), hold = deferred();
  const foreign = f.coordinator.runAuthSessionOperation(() => hold.promise);
  await assert.rejects(f.service.readCloudMaps(USER), f.coordinator.AuthSessionOperationBusyError);
  assert.equal(f.authReads, 0); assert.equal(f.calls.length, 0);
  hold.resolve(); await foreign;
});

test('account changes invalidate a delayed result even when transport ignores abort', async () => {
  for (const next of [OTHER, null]) {
    const reply = deferred(), f = fixture({ fetchImpl: () => reply.promise });
    const pending = f.service.readCloudMaps(USER); await settle(); assert.equal(f.calls.length, 1);
    await f.changeUser(next); await assert.rejects(pending, code('unauthorized'));
    assert.equal(f.calls[0][1].signal.aborted, true);
    reply.resolve(response()); await settle(); assert.equal(f.calls.length, 1);
  }
});

test('timeout retains pending SDK lease and never dispatches late catalog requests', async () => {
  const read = deferred(), f = fixture({ sessionRead: () => read.promise });
  const pending = f.service.readCloudMaps(USER); await settle(); f.fireTimeout();
  await assert.rejects(pending, code('timeout')); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, true);
  read.resolve({ data: { session: { user: { id: USER }, access_token: 'synthetic-map-session' } }, error: null });
  await settle(); assert.equal(f.coordinator.getAuthSessionOperationSnapshot().busy, false); assert.equal(f.calls.length, 0);
});

test('caller cancellation covers initial session and stalled response body', async () => {
  const before = new AbortController(); before.abort(); const first = fixture();
  await assert.rejects(first.service.readCloudMaps(USER, { signal: before.signal }), code('cancelled')); assert.equal(first.authReads, 0);
  const body = new ReadableStream({ start() {} }), f = fixture({ fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json' } }) });
  const controller = new AbortController(), pending = f.service.readCloudMaps(USER, { signal: controller.signal });
  await settle(); controller.abort(); await assert.rejects(pending, code('cancelled')); assert.equal(f.timers.size, 0);
});

test('final account read rejects an out-of-band account change before returning data', async () => {
  const reply = deferred(), f = fixture({ fetchImpl: () => reply.promise });
  const pending = f.service.readCloudMaps(USER); await settle(); f.rawChangeUser(OTHER); reply.resolve(response());
  await assert.rejects(pending, code('unauthorized')); assert.equal(f.authReads, 2);
});

test('HTTP and malformed response errors stay distinct and never expose server bodies', async () => {
  for (const [result, expected] of [[response({}, 401), 'unauthorized'], [response({}, 403), 'unauthorized'], [response({}, 503), 'unavailable'],
    [new Response('<html>synthetic-map-session</html>'), 'invalid_response'],
    [new Response('{', { headers: { 'content-type': 'application/json' } }), 'invalid_response']]) {
    const f = fixture({ fetchImpl: async () => result }); await assert.rejects(f.service.readCloudMaps(USER), code(expected));
  }
  const f = fixture({ fetchImpl: async () => { throw new Error('synthetic-map-session'); } }); await assert.rejects(f.service.readCloudMaps(USER), code('unavailable'));
});

test('invalid map metadata, duplicate IDs and oversized catalogs are rejected', async () => {
  for (const patch of [{ size_bytes: -1 }, { schema_version: 0 }, { sha256: 'bad' }, { crc64: '18446744073709551616' }, { crc64: '-1' },
    { id: 'bad' }, { status: '__proto__' }, { name: 'x\n' }, { ready_at: null }, { created_at: 'yesterday' }, { format: 'pcd' }]) {
    const f = fixture({ fetchImpl: async () => response({ versions: [version(patch)] }) }); await assert.rejects(f.service.readCloudMaps(USER), code('invalid_response'));
  }
  for (const body of [[], {}, { versions: null }, { versions: [version(), version()] }, { versions: Array(101).fill(version()) }]) {
    const f = fixture({ fetchImpl: async () => response(body) }); await assert.rejects(f.service.readCloudMaps(USER), code('invalid_response'));
  }
  const empty = fixture({ fetchImpl: async () => response({ versions: [] }) }); assert.equal((await empty.service.readCloudMaps(USER)).length, 0);
});
