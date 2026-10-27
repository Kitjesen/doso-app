import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/brainstemControl.ts', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
let sequence = 0;
async function load(native = {}, platform = 'android') {
  globalThis.__controlNative = native; globalThis.__controlPlatform = { OS: platform };
  const expo = moduleUrl(`export const requireOptionalNativeModule = () => globalThis.__controlNative; //${++sequence}`);
  const rn = moduleUrl(`export const Platform = globalThis.__controlPlatform; //${sequence}`);
  const endpoint = moduleUrl(`export const validateBrainstemEndpoint = (host,port) => { if(!host || !Number.isInteger(port)) throw new Error('bad'); return {host,port}; }; //${sequence}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace("from 'expo'", `from '${expo}'`).replace("from 'react-native'", `from '${rn}'`).replace("from './brainstemGrpc'", `from '${endpoint}'`);
  return import(moduleUrl(`${compiled}\n//${sequence}`));
}
const status = () => ({ fsmKind: 'standing', transition: 'none', owner: 'none', motorOutputEnabled: true,
  criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: true });
const opened = () => ({ status: status(), sessionId: 'fixture', transport: 'grpc-mtls', mutualTlsVerified: true,
  clientIdentitySelected: true, leaseActive: false, principalVerified: false });
const good = overrides => ({ openControl: async () => opened(), readControlStatus: async () => opened(),
  controlAction: async () => opened(), acquireControl: async () => opened(), sendControlInput: async () => opened(),
  interruptControl: async () => opened(), closeControl: async () => {}, ...overrides });
const endpoint = { host: '192.0.2.1', port: 13145, clientIdentityAlias: 'chosen' };

test('physical input carries the original Android sample time across the native bridge', async () => {
  const calls = [];
  const api = await load(good({
    sendControlInput: async (...args) => { calls.push(['untimed', ...args]); return opened(); },
    sendControlInputAt: async (...args) => { calls.push(['timed', ...args]); return opened(); },
  }));
  await api.brainstemControlTransport.input('fixture', .1, -.1, .2, 1000);
  assert.deepEqual(calls, [['timed', 'fixture', .1, -.1, .2, 1000]]);
});

test('old native packages cannot silently refresh a physical sample by falling back to untimed input', async () => {
  let sent = 0;
  const api = await load(good({ sendControlInput: async () => { sent++; return opened(); } }));
  await assert.rejects(api.brainstemControlTransport.input('fixture', .1, 0, 0, 1000), error => error.code === 'native_unavailable');
  assert.equal(sent, 0);
});

test('invalid physical timestamps never enter either native input method', async () => {
  let sent = 0;
  const api = await load(good({ sendControlInput: async () => { sent++; return opened(); }, sendControlInputAt: async () => { sent++; return opened(); } }));
  for (const at of [-1, NaN, Infinity, 1000.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.brainstemControlTransport.input('fixture', .1, 0, 0, at), error => error.code === 'config');
  }
  assert.equal(sent, 0);
});

test('old native packages and non-Android cannot expose production controls', async () => {
  for (const [native, platform] of [[null, 'android'], [{}, 'android'], [good(), 'web'], [good(), 'ios']]) {
    const api = await load(native, platform); assert.equal(api.isBrainstemControlAvailable(), false);
    await assert.rejects(api.brainstemControlTransport.open(endpoint, 'doso-g20@robot'), error => error.code === 'native_unavailable');
  }
});

test('open requires selected identity and actual mutual TLS evidence, not just configured transport', async () => {
  for (const patch of [{ mutualTlsVerified: false }, { mutualTlsVerified: undefined }, { clientIdentitySelected: false }, { transport: 'grpc-tls' }, { principalVerified: true }]) {
    const closed = [];
    const api = await load(good({ openControl: async () => ({ ...opened(), ...patch }), closeControl: async id => closed.push(id) }));
    await assert.rejects(api.brainstemControlTransport.open(endpoint, 'doso-g20@robot'), error => error.code === 'invalid_response');
    assert.deepEqual(closed, ['fixture']);
  }
});

test('open projects only safe public status and same-channel profile, no control authority or secrets', async () => {
  const calls = [];
  const api = await load(good({ openControl: async (...args) => { calls.push(args); return { ...opened(),
    token: 'secret-token', status: { ...status(), ownerId: 'private-owner' },
    profile: { current: 'flat', available: ['flat'], descriptions: ['Floor'], currentDescription: 'Floor', internalPath: 'private-path' } }; } }));
  const result = await api.brainstemControlTransport.open(endpoint, 'doso-g20@robot');
  assert.equal(result.mutualTlsVerified, true); assert.equal(result.principalVerified, false); assert.equal(result.leaseActive, false);
  assert.equal(result.profile.current, 'flat'); assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(0, 4), [endpoint.host, endpoint.port, 'chosen', 'doso-g20@robot']);
  for (const secret of ['secret-token', 'private-owner', 'private-path']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('inconsistent lease ownership and unsafe ACK sequences fail closed', async () => {
  const api = await load();
  for (const sequence of [0, -1, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.projectBrainstemControlReply({ ...opened(), sequence }), error => error.code === 'invalid_response');
  }
  for (const patch of [{ leaseActive: true }, { leaseActive: true, principalVerified: true }]) {
    assert.throws(() => api.projectBrainstemControlReply({ ...opened(), ...patch }), error => error.code === 'invalid_response');
  }
  for (const transport of [undefined, 'grpc-mtls']) {
    assert.throws(() => api.projectBrainstemControlReply({ ...opened(), transport, status: { ...status(), owner: 'grpc', grpcLeaseActive: true },
      leaseActive: true, leaseOwnerMatched: true, principalVerified: false }), error => error.code === 'invalid_response');
  }
});

test('upstream exception text never becomes UI error text', async () => {
  const api = await load(good({ controlAction: async () => { throw { code: 'unauthorized', message: 'token=private' }; } }));
  await assert.rejects(api.brainstemControlTransport.action('fixture', 'enable'), error => error.code === 'unauthorized' && !error.message.includes('private'));
});

test('stop failures cross the bridge as a fixed failure, never as confirmed physical stopping', async () => {
  const api = await load(good({ interruptControl: async () => { throw { code: 'stop_unconfirmed', message: 'private native exception' }; } }));
  await assert.rejects(api.brainstemControlTransport.interrupt('fixture'), error =>
    error.code === 'stop_unconfirmed' && error.message.includes('停止请求未确认') && !error.message.includes('private'));
  assert.doesNotMatch(api.safeBrainstemControlError({ code: 'timeout' }).message, /控制已停止/);
});

test('LAN uses an independent native open with generated identity and preserves unauthenticated lease facts', async () => {
  const calls = [];
  const principal = `lan-${'a'.repeat(32)}@dev`;
  const api = await load(good({ openControl: async () => { throw new Error('LAN cannot use TLS open'); },
    openLanControl: async (...args) => { calls.push(args); return { ...opened(), transport: 'grpc-lan', mutualTlsVerified: false,
      clientIdentitySelected: false, leaseOwnerMatched: false, sessionPrincipal: principal }; } }));
  const result = await api.brainstemControlTransport.open({ host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, 'ignored-user-identity');
  assert.equal(result.transport, 'grpc-lan'); assert.equal(result.mutualTlsVerified, false); assert.equal(result.clientIdentitySelected, false);
  assert.equal(result.principalVerified, false); assert.equal(result.sessionPrincipal, principal);
  assert.equal(calls.length, 1); assert.equal(calls[0].length, 3); assert.equal(calls[0][0], '192.168.42.64');
  const reply = api.projectBrainstemControlReply({ status: { ...status(), owner: 'grpc', grpcLeaseActive: true },
    leaseActive: true, principalVerified: false, leaseOwnerMatched: true, transport: 'grpc-lan', sequence: 1 });
  assert.equal(reply.leaseOwnerMatched, true); assert.equal(reply.principalVerified, false);
  for (const patch of [{ principalVerified: true }, { leaseOwnerMatched: false }, { leaseOwnerMatched: undefined }]) {
    assert.throws(() => api.projectBrainstemControlReply({ ...reply, transport: 'grpc-lan', ...patch }), error => error.code === 'invalid_response');
  }
});

test('LAN open rejects missing native method and forged authenticated evidence with no TLS fallback', async () => {
  for (const patch of [{ mutualTlsVerified: true }, { clientIdentitySelected: true }, { transport: 'grpc-mtls' }, { sessionPrincipal: 'doso@robot' }]) {
    let tls = 0;
    const api = await load(good({ openControl: async () => { tls++; return opened(); }, openLanControl: async () => ({ ...opened(),
      transport: 'grpc-lan', mutualTlsVerified: false, clientIdentitySelected: false, leaseOwnerMatched: false,
      sessionPrincipal: `lan-${'a'.repeat(32)}@dev`, ...patch }) }));
    await assert.rejects(api.brainstemControlTransport.open({ host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, ''), error => error.code === 'invalid_response');
    assert.equal(tls, 0);
  }
});
