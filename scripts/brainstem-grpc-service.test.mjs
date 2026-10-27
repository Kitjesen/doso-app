import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/brainstemGrpc.ts', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const expo = moduleUrl('export const requireOptionalNativeModule = () => globalThis.__dosoGrpcNative;');
const rn = moduleUrl('export const Platform = globalThis.__dosoGrpcPlatform; export const AppState = globalThis.__dosoGrpcAppState;');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from 'expo'", `from '${expo}'`).replace("from 'react-native'", `from '${rn}'`);
let generation = 0;
async function load(native = {}, platform = 'android') {
  const listeners = new Set();
  const appState = { currentState: 'active', addEventListener(_, listener) { listeners.add(listener); return { remove() { listeners.delete(listener); } }; } };
  globalThis.__dosoGrpcNative = native;
  globalThis.__dosoGrpcPlatform = { OS: platform };
  globalThis.__dosoGrpcAppState = appState;
  // Distinct mocks and service instances: static ESM dependencies are otherwise cached.
  const code = compiled.replaceAll(expo, `${expo}#${generation}`).replaceAll(rn, `${rn}#${generation++}`);
  return { api: await import(moduleUrl(`${code}\n// ${generation}`)), listeners, appState };
}
const status = () => ({ fsmKind: 'standing', transition: 'none', owner: 'none', motorOutputEnabled: true, criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: true });
const endpoint = { host: 'robot.example', port: 13145 };
const requestId = 'fixture-request-1';
const good = overrides => ({
  chooseClientIdentity: async () => 'chosen-OS-alias', cancelStatus: async () => {},
  readStatus: async (...args) => ({ requestId: args[3], status: status() }), ...overrides,
});
const code = expected => error => error.code === expected;

test('LAN profile capability errors remain distinct from connectivity failures and redact server details', async () => {
  const { api } = await load(good({ lanDevAvailable: true, readLanStatus: async () => {}, readLanProfile: async () => {
    throw Object.assign(new Error('private server exception'), { code: 'unimplemented' });
  } }));
  await assert.rejects(api.readBrainstemGrpcProfile({ endpoint: { host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, requestId }), error => {
    assert.equal(error.code, 'unimplemented');
    assert.equal(error.message, '机器人服务尚未提供此项查询，请检查服务配置与版本。');
    return true;
  });
});

test('control navigation uses the platform bridge and bounds stable inset without breaking older APKs', async () => {
  const calls = [];
  const { api } = await load(good({ setControlNavigationHidden: async hidden => { calls.push(hidden); return 40; } }));
  assert.equal(await api.setControlNavigationHidden(true), 40);
  assert.equal(await api.setControlNavigationHidden(false), 40);
  assert.deepEqual(calls, [true, false]);
  for (const inset of [NaN, Infinity, -1, 129, '40', null]) {
    const { api: invalid } = await load(good({ setControlNavigationHidden: async () => inset }));
    assert.equal(await invalid.setControlNavigationHidden(true), 0);
  }
  const { api: unavailable } = await load(good());
  assert.equal(await unavailable.setControlNavigationHidden(true), 0);
  const { api: web } = await load(good({ setControlNavigationHidden: () => assert.fail('web must not call Android window') }), 'web');
  assert.equal(await web.setControlNavigationHidden(true), 0);
  const { api: failed } = await load(good({ setControlNavigationHidden: async () => { throw Error('window gone'); } }));
  assert.equal(await failed.setControlNavigationHidden(false), 0);
});
const localTarget = { ...endpoint, robotId: 'THUNDER-01' };
const localIdentity = overrides => ({
  version: 1, status: 'pending', ...localTarget, requestId, identityAlias: 'local:fixture-v1',
  csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nZml4dHVyZQ==\n-----END CERTIFICATE REQUEST-----\n',
  publicKeySha256: 'a'.repeat(64), securityLevel: 'unknown',
  requestFile: `no_backup/brainstem-pairing/requests/${requestId}.json`,
  approvalFile: `no_backup/brainstem-pairing/approved/${requestId}.json`, ...overrides,
});
const localNative = overrides => good({
  getLocalClientIdentity: async () => null,
  prepareLocalClientIdentity: async () => localIdentity(),
  completeLocalClientIdentity: async () => localIdentity({ status: 'ready', principal: 'doso-g20-fixture@robot', clientCertificateSha256: 'b'.repeat(64), caCertificateSha256: 'c'.repeat(64) }),
  cancelLocalClientIdentity: async () => {},
  ...overrides,
});

test('LAN is explicit, private IPv4 only, alias-free, and never masquerades as TLS evidence', async () => {
  const calls = [];
  const { api } = await load(good({ lanDevAvailable: true,
    readLanStatus: async (...args) => { calls.push(args); return { requestId: args[2], status: status(), transport: 'grpc-lan', mutualTlsVerified: false, clientIdentitySelected: false }; } }));
  for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.42.64']) {
    const result = await api.readBrainstemGrpcStatus({ endpoint: { host, port: 13145, transport: 'lan-dev' }, requestId });
    assert.equal(result.transport, 'grpc-lan'); assert.equal(result.mutualTlsVerified, false); assert.equal(result.clientIdentitySelected, false);
  }
  for (const host of ['8.8.8.8', '127.0.0.1', '172.15.0.1', '172.32.0.1', 'robot.test', '::1', '::ffff:192.168.42.64', '192.168.066.64']) {
    await assert.rejects(api.readBrainstemGrpcStatus({ endpoint: { host, port: 13145, transport: 'lan-dev' }, requestId }), code('config'));
  }
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint: { host: '192.168.42.64', port: 13145, transport: 'lan-dev', clientIdentityAlias: 'chosen' }, requestId }), code('config'));
  assert.equal(calls.length, 4);
  assert.ok(calls.every(args => args.length === 3));
});

test('LAN fails closed on unavailable QA capability or fabricated TLS/identity facts without fallback', async () => {
  for (const patch of [{ lanDevAvailable: false }, { readLanStatus: undefined },
    { readLanStatus: async () => ({ requestId, status: status(), transport: 'grpc-lan', mutualTlsVerified: true, clientIdentitySelected: true }) }]) {
    let tls = 0;
    const { api } = await load(good({ lanDevAvailable: true, readStatus: async () => { tls++; throw new Error('no fallback'); },
      readLanStatus: async () => ({ requestId, status: status(), transport: 'grpc-lan', mutualTlsVerified: false, clientIdentitySelected: false }), ...patch }));
    await assert.rejects(api.readBrainstemGrpcStatus({ endpoint: { host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, requestId }));
    assert.equal(tls, 0);
  }
});

test('default TLS failure never invokes an available LAN method', async () => {
  let lan = 0;
  const { api } = await load(good({ lanDevAvailable: true, readStatus: async () => { throw { code: 'unavailable' }; },
    readLanStatus: async () => { lan++; throw new Error('no downgrade'); } }));
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('unavailable'));
  assert.equal(lan, 0);
});

test('local identity capability is optional and does not change old APK read availability', async () => {
  for (const native of [good(), localNative({ completeLocalClientIdentity: undefined })]) {
    const { api } = await load(native);
    assert.equal(api.isBrainstemGrpcAvailable(), true);
    assert.equal(api.isBrainstemLocalIdentityAvailable(), false);
    await assert.rejects(api.getBrainstemLocalClientIdentity(localTarget), code('native_unavailable'));
  }
});

test('local request recovery and completion bind public records to the selected target', async () => {
  const calls = [], { api } = await load(localNative({
    getLocalClientIdentity: async (...args) => { calls.push(['get', ...args]); return null; },
    prepareLocalClientIdentity: async (...args) => { calls.push(['prepare', ...args]); return localIdentity({ privateKey: 'must-not-cross-projection' }); },
  }));
  assert.equal(await api.getBrainstemLocalClientIdentity(localTarget), null);
  const pending = await api.prepareBrainstemLocalClientIdentity({ ...localTarget, requestId: 'new-operation' });
  assert.equal(pending.requestId, requestId, 'idempotent prepare can return the persisted request');
  assert.ok(Object.isFrozen(pending)); assert.doesNotMatch(JSON.stringify(pending), /privateKey|must-not-cross/);
  const ready = await api.completeBrainstemLocalClientIdentity({ ...localTarget, requestId });
  assert.equal(ready.status, 'ready'); assert.equal(ready.principal, 'doso-g20-fixture@robot');
  assert.deepEqual(calls, [['get', endpoint.host, endpoint.port, localTarget.robotId], ['prepare', endpoint.host, endpoint.port, localTarget.robotId, 'new-operation']]);
});

test('local identity validation rejects mismatched target, request, paths and nonpublic payload', async () => {
  for (const bad of [
    { host: 'other.example' }, { port: 443 }, { robotId: 'OTHER' }, { version: 2 }, { status: 'approved' },
    { identityAlias: 'system-unapproved' }, { publicKeySha256: 'bad' }, { securityLevel: 'StrongBox' },
    { requestId: '../escape' }, { requestFile: `/data/private/${requestId}.json` },
    { approvalFile: `no_backup/brainstem-pairing/approved/different.json` },
    { csrPem: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----' },
  ]) {
    const { api } = await load(localNative({ prepareLocalClientIdentity: async () => localIdentity(bad) }));
    await assert.rejects(api.prepareBrainstemLocalClientIdentity({ ...localTarget, requestId }), code('invalid_response'));
  }
  for (const response of [localIdentity(), localIdentity({ status: 'ready', principal: 'invalid' }), null,
    localIdentity({ status: 'ready', principal: 'doso-g20@robot', clientCertificateSha256: 'b'.repeat(64), caCertificateSha256: 'c'.repeat(64), requestId: 'old', requestFile: 'no_backup/brainstem-pairing/requests/old.json', approvalFile: 'no_backup/brainstem-pairing/approved/old.json' })]) {
    const { api } = await load(localNative({ completeLocalClientIdentity: async () => response }));
    await assert.rejects(api.completeBrainstemLocalClientIdentity({ ...localTarget, requestId }), code('invalid_response'));
  }
});

test('invalid local target or request fails before native dispatch', async () => {
  let calls = 0;
  const { api } = await load(localNative({ prepareLocalClientIdentity: async () => { calls++; return localIdentity(); } }));
  for (const robotId of ['', '../robot', 'robot id', 'x'.repeat(65)]) {
    await assert.rejects(api.prepareBrainstemLocalClientIdentity({ ...localTarget, robotId, requestId }), code('config'));
  }
  for (const bad of ['', '../old', 'x'.repeat(81)]) await assert.rejects(api.prepareBrainstemLocalClientIdentity({ ...localTarget, requestId: bad }), code('config'));
  assert.equal(calls, 0);
});

test('cancelled local key work keeps the native slot until settled and drops late success', async () => {
  let resolve, calls = 0, cancellations = 0;
  const { api, listeners } = await load(localNative({ prepareLocalClientIdentity: () => { calls++; return new Promise(yes => { resolve = yes; }); },
    cancelLocalClientIdentity: async () => { cancellations++; } }));
  const controller = new AbortController();
  const pending = api.prepareBrainstemLocalClientIdentity({ ...localTarget, requestId, signal: controller.signal });
  await new Promise(yes => setImmediate(yes)); controller.abort();
  await assert.rejects(pending, code('cancelled')); assert.equal(listeners.size, 0);
  controller.abort(); assert.equal(cancellations, 1, 'an in-flight cancellation retires the native handoff exactly once');
  await assert.rejects(api.getBrainstemLocalClientIdentity(localTarget), code('busy'));
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('busy'));
  resolve(localIdentity()); await new Promise(yes => setImmediate(yes));
  assert.equal(await api.getBrainstemLocalClientIdentity(localTarget), null); assert.equal(calls, 1); assert.equal(cancellations, 1);
});

test('aborting local work before dispatch does not create a key or reopen the native handoff', async () => {
  let calls = 0, cancellations = 0;
  const { api } = await load(localNative({ prepareLocalClientIdentity: async () => { calls++; return localIdentity(); },
    cancelLocalClientIdentity: async () => { cancellations++; } }));
  const controller = new AbortController();
  const result = api.prepareBrainstemLocalClientIdentity({ ...localTarget, requestId, signal: controller.signal });
  controller.abort(); await assert.rejects(result, code('cancelled'));
  assert.equal(calls, 0); assert.equal(cancellations, 0);
  assert.equal(await api.getBrainstemLocalClientIdentity(localTarget), null);
});

test('background-foreground retires local identity delivery without erasing the persisted native request', async () => {
  let resolve;
  const { api, listeners, appState } = await load(localNative({ getLocalClientIdentity: () => new Promise(yes => { resolve = yes; }) }));
  const pending = api.getBrainstemLocalClientIdentity(localTarget);
  await new Promise(yes => setImmediate(yes)); appState.currentState = 'background';
  for (const listener of [...listeners]) listener('background');
  await assert.rejects(pending, code('background')); appState.currentState = 'active';
  resolve(localIdentity()); await new Promise(yes => setImmediate(yes)); assert.equal(listeners.size, 0);
});

test('a synchronous lifecycle retirement during subscription is safe and leaves no native dispatch or listener', async () => {
  let calls = 0;
  const { api, listeners, appState } = await load(localNative({ getLocalClientIdentity: async () => { calls++; return null; } }));
  const subscribe = appState.addEventListener;
  appState.addEventListener = (event, listener) => { const result = subscribe(event, listener); listener('background'); return result; };
  await assert.rejects(api.getBrainstemLocalClientIdentity(localTarget), code('background'));
  assert.equal(calls, 0); assert.equal(listeners.size, 0);
});

test('local native errors remain fixed and do not expose file paths or key details', async () => {
  const { api } = await load(localNative({ getLocalClientIdentity: async () => { throw { code: 'identity_unavailable', message: '/data/private/secret-key' }; } }));
  await assert.rejects(api.getBrainstemLocalClientIdentity(localTarget), error => error.code === 'identity_unavailable' && !/secret|\/data\//.test(error.message));
  let cancelled = 0;
  const timed = await load(localNative({ getLocalClientIdentity: async () => { throw { code: 'timeout' }; }, cancelLocalClientIdentity: async () => { cancelled++; } }));
  await assert.rejects(timed.api.getBrainstemLocalClientIdentity(localTarget), error => error.code === 'identity_timeout' && !/3 秒/.test(error.message));
  assert.equal(cancelled, 1, 'native identity timeout closes its remaining factory window');
});

test('native local cancellation is available during pending identity work and safe on old APKs', async () => {
  let settle, cancelled = 0;
  const { api } = await load(localNative({ getLocalClientIdentity: () => new Promise(resolve => { settle = resolve; }),
    cancelLocalClientIdentity: async () => { cancelled++; } }));
  const pending = api.getBrainstemLocalClientIdentity(localTarget);
  await new Promise(resolve => setImmediate(resolve));
  await api.cancelBrainstemLocalClientIdentity(); assert.equal(cancelled, 1);
  settle(null); assert.equal(await pending, null);
  const old = await load(good()); await old.api.cancelBrainstemLocalClientIdentity();
});

test('mTLS proof comes only from a valid native envelope on each selected-identity read', async () => {
  const proof = { mutualTlsVerified: true, clientCertificateSha256: 'B'.repeat(64) };
  const { api } = await load(good({
    readStatus: async (...args) => ({ requestId: args[3], status: status(), ...proof }),
    readProfile: async (...args) => ({ requestId: args[3], profile: { current: '', currentDescription: '', available: [], descriptions: [] }, ...proof }),
    readVoltage: async (...args) => ({ requestId: args[3], voltage: { values: [] }, ...proof }),
    readMotorStatus: async (...args) => ({ requestId: args[3], motors: [], ...proof }),
  }));
  for (const read of [api.readBrainstemGrpcStatus, api.readBrainstemGrpcProfile, api.readBrainstemGrpcVoltage, api.readBrainstemGrpcMotorStatus]) {
    const result = await read({ endpoint: { ...endpoint, clientIdentityAlias: 'local:fixture-v1' }, requestId });
    assert.equal(result.mutualTlsVerified, true); assert.equal(result.clientCertificateSha256, 'b'.repeat(64));
    assert.equal(result.motionAuthorized, false);
  }
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('invalid_response'));
  const old = await load(good());
  const result = await old.api.readBrainstemGrpcStatus({ endpoint: { ...endpoint, clientIdentityAlias: 'selected' }, requestId });
  assert.equal(result.mutualTlsVerified, undefined); assert.equal(result.clientCertificateSha256, undefined);
});

test('malformed mTLS proof fails closed rather than guessing from an alias', async () => {
  for (const proof of [{ mutualTlsVerified: 'true', clientCertificateSha256: 'b'.repeat(64) }, { mutualTlsVerified: true },
    { mutualTlsVerified: true, clientCertificateSha256: 'not-a-fingerprint' }, { clientCertificateSha256: 'b'.repeat(64) },
    { mutualTlsVerified: false, clientCertificateSha256: 'b'.repeat(64) }]) {
    const { api } = await load(good({ readStatus: async () => ({ requestId, status: status(), ...proof }) }));
    await assert.rejects(api.readBrainstemGrpcStatus({ endpoint: { ...endpoint, clientIdentityAlias: 'selected' }, requestId }), code('invalid_response'));
  }
});

test('strict host/port validation accepts DNS, IPv4 and IPv6 without URL credentials', async () => {
  const { api } = await load();
  for (const host of ['robot.example', 'localhost', '192.0.2.1', '::1', '[2001:db8::1]']) {
    const result = api.validateBrainstemEndpoint(host, '13145');
    assert.equal(result.port, 13145); assert.ok(result.host.length);
  }
  for (const host of ['', 'https://robot', 'robot/path', 'user@robot', 'robot:13145', 'robot?x', 'robot#x', 'robot%20', '192.0.2.999', '010.0.0.1', '-robot', 'a..b', '::xyz', '[::1]:123', '2130706433']) {
    assert.throws(() => api.validateBrainstemEndpoint(host, 13145), code('config'), host);
  }
  for (const port of ['', '0', '65536', '-1', '1.2', '1e3', '0x22', NaN, Infinity]) assert.throws(() => api.validateBrainstemEndpoint('robot', port), code('config'));
});

test('old APK, web, and iOS remain safely unavailable', async () => {
  for (const [native, platform] of [[null, 'android'], [good(), 'web'], [good(), 'ios'], [{}, 'android']]) {
    const { api } = await load(native, platform);
    assert.equal(api.isBrainstemGrpcAvailable(), false);
    await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('native_unavailable'));
    await assert.rejects(api.chooseBrainstemClientIdentity(endpoint.host, endpoint.port), code('native_unavailable'));
  }
});

test('one direct native read yields only projected status, never authority or owner identifiers', async () => {
  const calls = [];
  const { api, listeners } = await load(good({ readStatus: async (...args) => {
    calls.push(args); return { requestId, status: { ...status(), ownerId: 'sensitive', leaseToken: 'private' }, motionAuthorized: true };
  } }));
  const observation = await api.readBrainstemGrpcStatus({ endpoint: { ...endpoint, clientIdentityAlias: 'OS-selected' }, requestId });
  assert.deepEqual(calls, [[endpoint.host, endpoint.port, 'OS-selected', requestId]]);
  assert.deepEqual(observation.status, status());
  assert.equal(observation.source, 'brainstem.grpc.direct'); assert.equal(observation.transport, 'grpc-tls');
  assert.equal(observation.motionAuthorized, false); assert.equal(observation.cloudBindingVerified, false);
  assert.ok(Number.isFinite(Date.parse(observation.observedAt)));
  assert.ok(!JSON.stringify(observation).includes('sensitive')); assert.equal(listeners.size, 0);
});

test('optional GetProfile read projects policy metadata and never grants a mode switch', async () => {
  const calls = [];
  const { api } = await load(good({ readProfile: async (...args) => {
    calls.push(args);
    return {
      requestId: args[3],
      profile: {
        current: 'flat_v0_straight_wheel_smooth_19000',
        available: ['flat_v0_straight_wheel_smooth_19000', 'stairs_candidate'],
        descriptions: ['平地策略', '候选策略'],
        currentDescription: '平地策略',
      },
      switchProfile: true,
    };
  } }));
  const observation = await api.readBrainstemGrpcProfile({ endpoint, requestId });
  assert.deepEqual(calls, [[endpoint.host, endpoint.port, null, requestId]]);
  assert.equal(observation.profile.current, 'flat_v0_straight_wheel_smooth_19000');
  assert.equal(observation.profile.available.length, 2);
  assert.equal(observation.motionAuthorized, false);
  assert.equal(observation.cloudBindingVerified, false);
  assert.doesNotMatch(JSON.stringify(observation), /switchProfile/);
});

test('old native modules keep profile display unavailable without changing status availability', async () => {
  const { api } = await load(good());
  assert.equal(api.isBrainstemGrpcAvailable(), true);
  await assert.rejects(api.readBrainstemGrpcProfile({ endpoint, requestId }), code('native_unavailable'));
});

test('voltage and motor diagnostics stay read-only and reject malformed values', async () => {
  const { api } = await load(good({
    readVoltage: async (...args) => ({ requestId: args[3], voltage: { values: [24.4, 24.6] }, percent: 99 }),
    readMotorStatus: async (...args) => ({ requestId: args[3], motors: [{ id: 0, online: true, statusCode: 0, temperatureC: 42, voltageV: 24.5, positionRad: 0.1, velocityRps: 0.2, torqueNm: 1.1, errors: [] }], canControl: true }),
  }));
  const voltage = await api.readBrainstemGrpcVoltage({ endpoint, requestId });
  assert.deepEqual(voltage.voltage.values, [24.4, 24.6]);
  const motors = await api.readBrainstemGrpcMotorStatus({ endpoint, requestId: 'fixture-motor-1' });
  assert.equal(motors.motors[0].online, true);
  assert.equal(motors.motors[0].statusCode, 0);
  assert.doesNotMatch(JSON.stringify({ voltage, motors }), /canControl|percent/);
  const malformed = await load(good({ readVoltage: async (...args) => ({ requestId: args[3], voltage: { values: [NaN] } }) }));
  await assert.rejects(malformed.api.readBrainstemGrpcVoltage({ endpoint, requestId }), code('invalid_response'));
});

test('OS identity selection is explicit; cancellation is null, raw native errors remain redacted', async () => {
  let chosen = 0;
  const { api } = await load(good({ chooseClientIdentity: async (host, port) => { chosen++; assert.deepEqual({ host, port }, endpoint); return null; } }));
  await api.readBrainstemGrpcStatus({ endpoint, requestId }); assert.equal(chosen, 0);
  assert.equal(await api.chooseBrainstemClientIdentity(endpoint.host, endpoint.port), null); assert.equal(chosen, 1);
  const failed = await load(good({ readStatus: async () => { throw { code: 'UNAVAILABLE', message: 'secret-host/key' }; } }));
  await assert.rejects(failed.api.readBrainstemGrpcStatus({ endpoint, requestId }), error => !error.message.includes('secret') && error.code === 'unavailable');
});

test('malformed enums/booleans, wrong request ID, missing fields fail closed', async () => {
  for (const response of [null, {}, { requestId: 'wrong', status: status() },
    { requestId, status: { ...status(), fsmKind: 'future' } }, { requestId, status: { ...status(), owner: 'human' } },
    { requestId, status: { ...status(), transition: 'future' } }, { requestId, status: { ...status(), readyForWalk: 1 } },
    { requestId, status: { ...status(), motorOutputEnabled: undefined } },
  ]) {
    const { api } = await load(good({ readStatus: async () => response }));
    await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('invalid_response'));
  }
});

test('OS picker pause preserves the explicit result until app foreground, while RPC stays blocked', async () => {
  let returnAlias;
  const { api, appState, listeners } = await load(good({ chooseClientIdentity: () => new Promise(resolve => { returnAlias = resolve; }) }));
  const choosing = api.chooseBrainstemClientIdentity(endpoint.host, endpoint.port);
  appState.currentState = 'background';
  for (const listener of [...listeners]) listener('background');
  returnAlias('OS-selected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listeners.size, 1);
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('busy'));
  appState.currentState = 'active';
  for (const listener of [...listeners]) listener('active');
  assert.equal(await choosing, 'OS-selected');
  assert.equal(listeners.size, 0);
  await api.readBrainstemGrpcStatus({ endpoint, requestId });
});

test('abort before dispatch prevents native call; in-flight abort cancels once and drops late success', async () => {
  let reads = 0, cancels = 0, late;
  const { api, listeners } = await load(good({ readStatus: () => { reads++; return new Promise(resolve => { late = resolve; }); }, cancelStatus: async id => { assert.equal(id, requestId); cancels++; } }));
  const early = new AbortController(); early.abort();
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId, signal: early.signal }), code('cancelled'));
  assert.equal(reads, 0);
  const controller = new AbortController();
  const pending = api.readBrainstemGrpcStatus({ endpoint, requestId, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId: 'second' }), code('busy'));
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  late({ requestId, status: status() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancels, 1); assert.equal(listeners.size, 0);
});

test('background cancels pending status and blocks new reads', async () => {
  let cancels = 0;
  const { api, appState, listeners } = await load(good({ readStatus: () => new Promise(() => {}), cancelStatus: async () => { cancels++; } }));
  const pending = api.readBrainstemGrpcStatus({ endpoint, requestId });
  await new Promise(resolve => setImmediate(resolve));
  appState.currentState = 'background';
  for (const listener of [...listeners]) listener('background');
  await assert.rejects(pending, code('background'));
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('background'));
  assert.equal(cancels, 1); assert.equal(listeners.size, 0);
});

test('3-second JS deadline settles even when native never replies', async () => {
  let cancels = 0;
  const { api, listeners } = await load(good({ readStatus: () => new Promise(() => {}), cancelStatus: async () => { cancels++; } }));
  const started = Date.now();
  await assert.rejects(api.readBrainstemGrpcStatus({ endpoint, requestId }), code('timeout'));
  assert.ok(Date.now() - started < 4000); assert.equal(cancels, 1); assert.equal(listeners.size, 0);
});
