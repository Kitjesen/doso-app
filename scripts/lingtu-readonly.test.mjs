import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
} }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sharedUrl = moduleUrl(compile(await readFile(new URL('../src/services/brainstemReadOnly.ts', import.meta.url), 'utf8')));
const source = await readFile(new URL('../src/services/lingtuReadOnly.ts', import.meta.url), 'utf8');
const { readLingtuStatus, readLingtuMaps, isLingtuStatusFresh, LingtuReadOnlyError } = await import(moduleUrl(compile(source).replace('./brainstemReadOnly.ts', sharedUrl)));
const paths = ['/api/v1/app/bootstrap', '/api/v1/app/capabilities', '/api/v1/state', '/api/v1/readiness'];
const response = (value, options = {}) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json' }, ...options,
});
const errorCode = code => error => error instanceof LingtuReadOnlyError && error.code === code;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function fixture() {
  const session = { env: 'real', product: 'nav', product_session_id: 'fixture-run-1', active_map: 'fixture-map' };
  return [
    { schema_version: 4, ts: 1000, robot: { online: true, model: 'doso/thunder_v4' }, session: { ...session } },
    { schema_version: 2, ts: 1000, features: { navigation: true, teleop: true, whep: true, exploration: false }, runtime_products: { ...session } },
    { schema_version: 4, ts: 1000, session: { ...session },
      localization: { schema_version: 1, state: 'no_odometry', ready: false, pose_fresh: null },
      navigation: { schema_version: 3, control: { authority: 'NONE', resume_required: false }, motion: { permission: 'HELD' } },
      map: { active: 'fixture-map' } },
    { schema_version: 1, ts: 1000, ready: false, data_ready: false, motion_ready: false, non_motion_safe: true,
      reasons: ['localization:no_odometry'], product_contract: { product: 'nav', product_session_id: 'fixture-run-1' },
      runtime: { boundary: { ...session, ok: true } } },
  ];
}
function options(values = fixture(), extra = {}) {
  let index = 0;
  const calls = [];
  return { calls, input: { endpoint: 'https://navigation.example', now: () => 1000,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return response(values[index++]); }, ...extra } };
}

test('four fixed anonymous GETs report degraded observations without granting motion or body connectivity', async () => {
  const values = fixture();
  values[0].motionAuthorized = true; values[0].lease = 'must-not-copy';
  values[2].navigation.canControl = true;
  const f = options(values);
  const snapshot = await readLingtuStatus(f.input);
  assert.deepEqual(f.calls.map(call => call.url), paths.map(path => `https://navigation.example${path}`));
  for (const { init } of f.calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store'); assert.deepEqual(init.headers, { Accept: 'application/json' });
  }
  assert.equal(snapshot.robotOnline, null); assert.equal(snapshot.motionAuthorized, false);
  assert.equal('lease' in snapshot, false); assert.equal('canControl' in snapshot, false);
  assert.equal(snapshot.environment, 'real'); assert.equal(snapshot.productSessionId, 'fixture-run-1');
  assert.equal(snapshot.robotModel, 'doso/thunder_v4'); assert.equal(snapshot.mapName, 'fixture-map');
  assert.equal(snapshot.localizationReady, false); assert.equal(snapshot.controlAuthority, 'NONE');
  assert.equal(snapshot.motionPermission, 'HELD'); assert.equal(snapshot.resumeRequired, false);
  assert.deepEqual(snapshot.readiness, { ready: false, dataReady: false, motionReady: false,
    nonMotionSafe: true, reasons: ['localization:no_odometry'] });
  assert.equal(snapshot.features.navigation, true, 'feature support does not change runtime readiness');
});

test('ready response and capability flags still cannot confer control', async () => {
  const values = fixture(); Object.assign(values[3], { ready: true, data_ready: true, motion_ready: true });
  values[2].navigation.control.authority = 'OPERATOR';
  const snapshot = await readLingtuStatus(options(values).input);
  assert.equal(snapshot.readiness.motionReady, true); assert.equal(snapshot.motionAuthorized, false);
  assert.equal(snapshot.robotOnline, null);
});

test('reported localization readiness preserves independent stale or missing pose freshness', async () => {
  for (const poseFresh of [false, undefined]) {
    const values = fixture();
    values[2].localization = { schema_version: 1, state: 'ready', ready: true,
      ...(poseFresh === undefined ? {} : { pose_fresh: poseFresh }) };
    const snapshot = await readLingtuStatus(options(values).input);
    assert.equal(snapshot.localizationState, 'ready');
    assert.equal(snapshot.localizationReady, true);
    assert.equal(snapshot.localizationPoseFresh, poseFresh ?? null);
  }
});

test('HTTPS and explicit strict private/loopback HTTP origins only; rejects credentials and proxy paths before requests', async () => {
  for (const endpoint of ['http://192.168.66.65:5050', 'http://10.0.0.1', 'http://172.16.0.1:80',
    'http://172.31.255.254', 'http://127.0.0.1:5050', 'http://localhost:5050', 'http://[::1]:5050']) {
    const f = options(fixture(), { endpoint, allowLocalHttp: true });
    const snapshot = await readLingtuStatus(f.input);
    assert.equal(snapshot.endpoint, new URL(endpoint).origin);
  }
  for (const [endpoint, allowLocalHttp] of [
    ['http://192.168.66.65:5050', false], ['http://127.0.0.1:5050', false],
    ['http://8.8.8.8', true], ['http://172.32.0.1', true], ['http://169.254.1.1', true],
    ['http://robot.local', true], ['http://0300.0250.1.1', true], ['http://0xc0a80101', true],
    ['http://192.168.1', true], ['http://127.1', true], ['http://2130706433', true],
    ['http://0x7f000001', true], ['http://0177.0.0.1', true], ['https://user:password@navigation.example', true],
    ['https://navigation.example/api', true], ['https://navigation.example/?token=secret', true],
    ['https://navigation.example/#secret', true], ['file:///data', true],
  ]) {
    const f = options(fixture(), { endpoint, allowLocalHttp });
    await assert.rejects(readLingtuStatus(f.input), errorCode('config')); assert.equal(f.calls.length, 0, endpoint);
  }
});

test('unknown schema and malformed projected values reject the batch', async () => {
  const mutations = [
    values => { values[0].schema_version = 3; }, values => { values[1].schema_version = 1; },
    values => { values[2].schema_version = 5; }, values => { values[3].schema_version = 2; },
    values => { values[2].localization.schema_version = 2; }, values => { values[2].navigation.schema_version = 4; },
    values => { values[0].ts = '1000'; }, values => { values[0].session = []; },
    values => { values[1].features.navigation = 'true'; }, values => { values[2].localization.ready = 'false'; },
    values => { values[3].motion_ready = 1; }, values => { values[3].reasons = ['ok', {}]; },
  ];
  for (const mutate of mutations) {
    const values = fixture(); mutate(values);
    await assert.rejects(readLingtuStatus(options(values).input), errorCode('invalid_response'));
  }
});

test('nonempty env, product and session identities must agree across the batch', async () => {
  for (const mutate of [
    values => { values[2].session.env = 'sim'; }, values => { values[1].runtime_products.product = 'map'; },
    values => { values[3].product_contract.product_session_id = 'replacement'; },
    values => { values[3].runtime.boundary.product_session_id = 'replacement'; },
    values => { values[0].runtime_products = { env: 'sim' }; },
  ]) {
    const values = fixture(); mutate(values);
    await assert.rejects(readLingtuStatus(options(values).input), errorCode('invalid_response'));
  }
});

test('absent identity and optional observations stay unknown without copying unrelated fields', async () => {
  const values = fixture();
  values[0].session = {}; values[0].robot = {};
  values[1].runtime_products = {}; values[2].session = {};
  values[2].localization = { schema_version: 1 }; values[2].navigation = { schema_version: 3 };
  values[2].map = {}; values[3].product_contract = {}; values[3].runtime = {};
  const snapshot = await readLingtuStatus(options(values).input);
  for (const key of ['environment', 'product', 'productSessionId', 'robotModel', 'localizationState', 'localizationReady', 'localizationPoseFresh',
    'controlAuthority', 'resumeRequired', 'motionPermission', 'mapName']) assert.equal(snapshot[key], null, key);
});

test('cancellation aborts the active request and never starts a later path, even if the old fetch returns', async () => {
  const controller = new AbortController(), late = deferred(), calls = [];
  const pending = readLingtuStatus({ endpoint: 'https://navigation.example', now: () => 1000, signal: controller.signal,
    fetchImpl: (url, init) => { calls.push({ url, init }); return late.promise; } });
  controller.abort(); await assert.rejects(pending, errorCode('cancelled'));
  assert.equal(calls.length, 1); assert.equal(calls[0].init.signal.aborted, true);
  late.resolve(response(fixture()[0])); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  const f = options(fixture(), { signal: controller.signal });
  await assert.rejects(readLingtuStatus(f.input), errorCode('cancelled')); assert.equal(f.calls.length, 0);
});

test('a fetch that ignores cancellation still has a bounded timeout without advancing the batch', async () => {
  let calls = 0;
  await assert.rejects(readLingtuStatus({ endpoint: 'https://navigation.example', now: () => 1000, timeoutMs: 5,
    fetchImpl: () => { calls++; return new Promise(() => {}); } }), errorCode('timeout'));
  assert.equal(calls, 1);
});

test('HTTP, redirect, content, and oversized responses retain fixed safe errors', async () => {
  for (const [result, code] of [
    [response({ secret: 'not-for-ui' }, { status: 401 }), 'unauthorized'],
    [response({}, { status: 503 }), 'unavailable'], [new Response('<html>not-for-ui</html>'), 'invalid_response'],
    [new Response('invalid', { headers: { 'content-type': 'application/json' } }), 'invalid_response'],
    [response({}, { headers: { 'content-type': 'application/json', 'content-length': '65537' } }), 'invalid_response'],
    [{ ...response({}), redirected: true }, 'invalid_response'],
  ]) await assert.rejects(readLingtuStatus({ endpoint: 'https://navigation.example', now: () => 1000,
    fetchImpl: async () => result }), error => errorCode(code)(error) && !error.message.includes('not-for-ui'));
});

test('display age starts before the whole batch, cannot be renewed by a late response, and uses monotonic time only', async t => {
  let at = 1000;
  const wall = t.mock.method(Date, 'now', () => { throw new Error('wall clock must not be used'); });
  const f = options(fixture(), { now: () => at }); const fetch = f.input.fetchImpl;
  f.input.fetchImpl = async (...args) => { at += 500; return fetch(...args); };
  const snapshot = await readLingtuStatus(f.input);
  assert.equal(snapshot.observedAt, 1000); assert.equal(at, 3000); assert.equal(wall.mock.callCount(), 0);
  assert.equal(isLingtuStatusFresh(snapshot, 15999), true);
  for (const now of [16000, 999, -1, NaN, Infinity]) assert.equal(isLingtuStatusFresh(snapshot, now), false);
  assert.equal(isLingtuStatusFresh({ ...snapshot, observedAt: -1 }, 1), false);
  at = 1000; const expired = options(fixture(), { now: () => at }); const expiredFetch = expired.input.fetchImpl;
  expired.input.fetchImpl = async (...args) => { at += 4000; return expiredFetch(...args); };
  await assert.rejects(readLingtuStatus(expired.input), errorCode('invalid_response'));
  for (const now of [NaN, -1, Infinity]) await assert.rejects(readLingtuStatus(options(fixture(), { now: () => now }).input), errorCode('invalid_response'));
});

function mapFixture() {
  return [
    { schema_version: 1, ts: 1000, active: 'fixture-map', count: 1, maps: [
      { name: 'fixture-map', content_epoch: 3, has_pcd: true, has_occupancy: false, has_octomap: true,
        can_activate: true, is_active: true, state: 'READY', links: { activate: '/do-not-follow' } },
    ] },
    { schema_version: 1, ts: 1000, active_map: 'fixture-map', state: 'ready', ready: true,
      has_odometry: true, pose_fresh: true, pose_freshness: 'fresh',
      odometry: { x: 1, y: 2, z: 3, yaw: 0.25, frame_id: 'map', child_frame_id: 'body', ts: 1000, vx: 0.2 } },
  ];
}

test('map library reads only the two fixed GETs and preserves real metadata and a fresh pose', async () => {
  const f = options(mapFixture());
  const snapshot = await readLingtuMaps(f.input);
  assert.deepEqual(f.calls.map(call => call.url), [
    'https://navigation.example/api/v1/slam/maps', 'https://navigation.example/api/v1/localization/status',
  ]);
  for (const { init } of f.calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.deepEqual(init.headers, { Accept: 'application/json' });
  }
  assert.equal(snapshot.endpoint, 'https://navigation.example');
  assert.equal(snapshot.activeMapName, 'fixture-map'); assert.equal(snapshot.motionAuthorized, false);
  assert.deepEqual(snapshot.maps, [{ name: 'fixture-map', contentEpoch: 3, frameId: null, pointCount: null,
    hasPointCloud: true, hasOccupancy: false, state: 'READY' }]);
  assert.deepEqual(snapshot.localization, { state: 'ready', ready: true, poseFresh: true, frameId: 'map',
    x: 1, y: 2, z: 3, yaw: 0.25 });
  assert.equal('canActivate' in snapshot.maps[0], false); assert.equal('vx' in snapshot.localization, false);
  assert.equal(isLingtuStatusFresh(snapshot, 15999), true);
});

test('empty catalogs and undeclared metadata remain empty or unknown rather than fabricated', async () => {
  const empty = mapFixture(); Object.assign(empty[0], { active: '', count: 0, maps: [] });
  Object.assign(empty[1], { active_map: null, state: 'no_odometry', ready: false, pose_fresh: null, odometry: null });
  const result = await readLingtuMaps(options(empty).input);
  assert.deepEqual(result.maps, []); assert.equal(result.activeMapName, null);
  assert.equal(result.localization.frameId, null); assert.equal(result.localization.x, null);
  const missing = mapFixture(); missing[0].maps = [{ name: 'fixture-map' }];
  const snapshot = await readLingtuMaps(options(missing).input);
  assert.deepEqual(snapshot.maps, [{ name: 'fixture-map', contentEpoch: null, frameId: null, pointCount: null,
    hasPointCloud: null, hasOccupancy: null, state: null }]);
});

test('stale, unknown, or not-ready localization never projects old coordinates as the current pose', async () => {
  for (const patch of [{ pose_fresh: false }, { pose_fresh: null }, { pose_fresh: undefined }, { ready: false }]) {
    const values = mapFixture(); Object.assign(values[1], patch);
    const snapshot = await readLingtuMaps(options(values).input);
    assert.equal(snapshot.localization.poseFresh, values[1].pose_fresh ?? null);
    for (const field of ['x', 'y', 'z', 'yaw']) assert.equal(snapshot.localization[field], null, field);
    assert.equal(snapshot.localization.frameId, 'map');
  }
});

test('map versions, repeated names, malformed consumed fields, and non-finite coordinates are rejected', async () => {
  for (const mutate of [
    values => { values[0].schema_version = 2; }, values => { values[1].schema_version = 2; },
    values => { values[0].maps = {}; }, values => { values[0].active = null; },
    values => { values[0].maps.push({ ...values[0].maps[0] }); },
    values => { values[0].maps[0].name = ''; }, values => { values[0].maps[0].content_epoch = -1; },
    values => { values[0].maps[0].content_epoch = 1.5; }, values => { values[0].maps[0].has_pcd = 'true'; },
    values => { values[1].odometry.x = '1'; }, values => { values[1].pose_fresh = 'true'; },
  ]) {
    const values = mapFixture(); mutate(values);
    await assert.rejects(readLingtuMaps(options(values).input), errorCode('invalid_response'));
  }
  let index = 0;
  await assert.rejects(readLingtuMaps({ endpoint: 'https://navigation.example', now: () => 1000,
    fetchImpl: async () => {
      const raw = JSON.stringify(mapFixture()[index++]).replace('"x":1,', '"x":1e400,');
      return new Response(raw, { headers: { 'content-type': 'application/json' } });
    } }), errorCode('invalid_response'));
});

test('a missing odometry flag or incomplete pose never presents partial current coordinates', async () => {
  for (const mutate of [
    values => { values[1].has_odometry = false; }, values => { delete values[1].has_odometry; },
    values => { delete values[1].odometry.x; }, values => { delete values[1].odometry.yaw; },
  ]) {
    const values = mapFixture(); mutate(values);
    const snapshot = await readLingtuMaps(options(values).input);
    for (const key of ['x', 'y', 'z', 'yaw']) assert.equal(snapshot.localization[key], null, key);
  }
});

test('map or declared runtime identity changes invalidate a mixed catalog/localization batch', async () => {
  for (const mutate of [
    values => { values[1].active_map = 'replacement-map'; },
    values => { values[0].session = { product_session_id: 'run-a' }; values[1].session = { product_session_id: 'run-b' }; },
    values => { values[0].session = { env: 'real' }; values[1].runtime = { env: 'sim' }; },
  ]) {
    const values = mapFixture(); mutate(values);
    await assert.rejects(readLingtuMaps(options(values).input), errorCode('invalid_response'));
  }
});

test('map cancellation and timeout never issue the second GET after an abandoned catalog read', async () => {
  for (const timedOut of [false, true]) {
    const controller = new AbortController(), late = deferred(); let calls = 0;
    const reading = readLingtuMaps({ endpoint: 'https://navigation.example', now: () => 1000,
      signal: controller.signal, timeoutMs: timedOut ? 5 : 1000,
      fetchImpl: () => { calls++; return late.promise; } });
    if (!timedOut) controller.abort();
    await assert.rejects(reading, errorCode(timedOut ? 'timeout' : 'cancelled'));
    late.resolve(response(mapFixture()[0])); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  }
});

test('map display age starts before both reads and expired batches cannot refresh old map or pose data', async () => {
  let at = 1000;
  const f = options(mapFixture(), { now: () => at }); const fetch = f.input.fetchImpl;
  f.input.fetchImpl = async (...args) => { at += 1000; return fetch(...args); };
  const snapshot = await readLingtuMaps(f.input);
  assert.equal(snapshot.observedAt, 1000); assert.equal(isLingtuStatusFresh(snapshot, 16000), false);
  at = 1000; const expired = options(mapFixture(), { now: () => at }); const expiredFetch = expired.input.fetchImpl;
  expired.input.fetchImpl = async (...args) => { at += 8000; return expiredFetch(...args); };
  await assert.rejects(readLingtuMaps(expired.input), errorCode('invalid_response'));
});
