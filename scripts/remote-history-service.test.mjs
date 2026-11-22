import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const USER = '11111111-1111-4111-8111-111111111111', DEVICE = '22222222-2222-4222-8222-222222222222';
const HISTORY = '33333333-3333-4333-8333-333333333333';
const START = Date.parse('2026-11-09T00:00:00.000Z'), END = START + 86400000;
const point = offset => ({ reportTs: START + offset, breakBefore: false, location: null });
const page = (patch = {}) => ({ deviceId: DEVICE, simulated: false, historyId: HISTORY, startTs: START, endTs: END,
  points: [], nextTs: null, enabled: true, availability: 'ready', syncState: 'current', ...patch });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(fetchImpl = async () => response(page())) {
  const modules = new Map(), calls = [];
  let userId = USER;
  const load = name => {
    if (modules.has(name)) return modules.get(name).exports;
    const module = { exports: {} }; modules.set(name, module);
    const code = ts.transpileModule(readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Error, AbortController, setTimeout, clearTimeout,
      fetch: (...args) => { calls.push(args); return fetchImpl(...args); },
      require(name) {
        if (name === './supabaseClient') return { supabaseConfig: { url: 'https://state.example.test', publishableKey: 'synthetic-public-key' },
          getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: userId }, access_token: 'synthetic-token' } } }) } }) };
        return load(name.slice(2));
      },
    }); return module.exports;
  };
  const service = load('remoteHistory'), auth = load('authSessionOperation');
  return { calls, service, switch: async () => auth.runAuthSessionOperation(async () => { userId = DEVICE; }) };
}

test('reads canonical pages with user token and reportTs cursor in a fixed window', async () => {
  const first = Array.from({ length: 500 }, (_, i) => point(i));
  const f = fixture(async (_url, _init) => response(f.calls.length === 1 ? page({ points: first, nextTs: first[499].reportTs }) : page({ points: [point(501)] })));
  const result = await f.service.getRemoteHistory(USER, DEVICE, START, END);
  assert.equal(result.points.length, 501); assert.equal(result.partial, false);
  assert.match(f.calls[1][0], new RegExp(`startTs=${START}&endTs=${END}&after=${START + 499}$`));
  assert.equal(f.calls[0][1].headers.Authorization, 'Bearer synthetic-token'); assert.equal(f.calls[0][1].method, 'GET');
});
test('four full pages stop at 2000 and disclose partial records', async () => {
  const f = fixture(async () => {
    const points = Array.from({ length: 500 }, (_, i) => point((f.calls.length - 1) * 500 + i));
    return response(page({ points, nextTs: points.at(-1).reportTs }));
  });
  const result = await f.service.getRemoteHistory(USER, DEVICE, START, END);
  assert.equal(f.calls.length, 4); assert.equal(result.points.length, 2000); assert.equal(result.partial, true);
});

test('keeps cross-page break markers and projects only public history fields', async () => {
  const first = Array.from({length: 500}, (_, index) => point(index));
  const f = fixture(async () => response(f.calls.length === 1
    ? page({points: first, nextTs: first.at(-1).reportTs})
    : page({points: [{...point(500), breakBefore: true, consentVersion: 99}], authorizationEpoch: 99,
      tbDeviceId: 'internal', ownerId: 'internal', delivery: {pendingCount: 9}})));
  const result = await f.service.getRemoteHistory(USER, DEVICE, START, END);
  assert.equal(result.points[500].breakBefore, true);
  assert.equal(result.points[500].consentVersion, undefined);
  for (const key of ['authorizationEpoch', 'tbDeviceId', 'ownerId', 'delivery']) assert.equal(result[key], undefined);
});
test('history identity changes between pages reject the entire result', async () => {
  const points = Array.from({ length: 500 }, (_, i) => point(i));
  const f = fixture(async () => response(f.calls.length === 1 ? page({ points, nextTs: points[499].reportTs }) : page({ historyId: DEVICE })));
  await assert.rejects(f.service.getRemoteHistory(USER, DEVICE, START, END), error => error.code === 'unauthorized');
});
test('foreign devices, bad cursor, malformed locations and unsorted reports fail validation', async () => {
  for (const patch of [{ deviceId: USER }, { nextTs: START }, { points: [point(2), point(1)] },
    { points: [{ ...point(1), location: { lat: 0 } }] }, { historyId: 'invalid' }, { availability: 'mapped' },
    { points: [{ ...point(1), breakBefore: undefined }] }, { syncState: 'failed' }, { availability: ['ready'] }, { syncState: ['current'] }]) {
    const f = fixture(async () => response(page(patch)));
    await assert.rejects(f.service.getRemoteHistory(USER, DEVICE, START, END), error => error.code === 'invalid_response');
  }
});
test('unauthorized and server failures are distinct from empty history', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'unauthorized'], [503, 'unavailable']]) {
    const f = fixture(async () => response({}, status));
    await assert.rejects(f.service.getRemoteHistory(USER, DEVICE, START, END), error => error.code === code);
  }
  const f = fixture(); assert.equal((await f.service.getRemoteHistory(USER, DEVICE, START, END)).points.length, 0);
});
test('cancelled requests and session changes cannot return late history', async () => {
  for (const sessionChange of [false, true]) {
    const reply = deferred(), controller = new AbortController(), f = fixture(() => reply.promise);
    const pending = f.service.getRemoteHistory(USER, DEVICE, START, END, { signal: controller.signal }); await settle();
    if (sessionChange) await f.switch(); else controller.abort();
    reply.resolve(response(page()));
    await assert.rejects(pending, error => error.code === (sessionChange ? 'unauthorized' : 'cancelled'));
  }
});
