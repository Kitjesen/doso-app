import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/directRobotConnection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = Date.parse('2026-10-23T10:00:00.000Z');
const endpoint = () => ({ host: ' ROBOT.EXAMPLE ', port: 13145, clientIdentityAlias: 'not-for-storage' });
const observation = () => ({
  source: 'brainstem.grpc.direct', observedAt: new Date(now).toISOString(), transport: 'grpc-tls',
  motionAuthorized: false, cloudBindingVerified: false,
  status: { fsmKind: 'standing', transition: 'none', motorOutputEnabled: true, owner: 'grpc', criticalMotorFault: false, grpcLeaseActive: true, readyForWalk: true },
});
const motor = (id, overrides = {}) => ({
  id, online: true, statusCode: 2, temperatureC: 42, voltageV: 0,
  positionRad: 0.1, velocityRps: 0.2, torqueNm: 1.1, errors: [], ...overrides,
});
const runtime = (diagnostics) => api.describeDirectRobotConnection(
  api.createDirectRobotConnectionSnapshot(endpoint(), { ...observation(), ...diagnostics }, now), now,
).runtimeState;

test('LAN snapshots retain explicit transport and false TLS facts and reject mixed peers or identities', () => {
  const peer = { host: '192.168.42.64', port: 13145, transport: 'lan-dev' };
  const read = { ...observation(), transport: 'grpc-lan', mutualTlsVerified: false, clientIdentitySelected: false };
  const snapshot = api.createDirectRobotConnectionSnapshot(peer, read, now);
  assert.equal(snapshot.endpoint.transport, 'lan-dev'); assert.equal(snapshot.observation.transport, 'grpc-lan');
  assert.equal(snapshot.observation.mutualTlsVerified, false); assert.equal(snapshot.observation.clientIdentitySelected, false);
  assert.equal(api.describeDirectRobotConnection(snapshot, now).runtimeState.controlAuthority, 'not-held');
  for (const badPeer of [{ ...peer, transport: undefined }, { ...peer, clientIdentityAlias: 'chosen' }, { ...peer, host: '8.8.8.8' }, { ...peer, host: 'robot.test' }]) {
    assert.throws(() => api.createDirectRobotConnectionSnapshot(badPeer, read, now));
  }
  assert.throws(() => api.createDirectRobotConnectionSnapshot(peer, { ...read, mutualTlsVerified: true }, now));
});

test('a direct read yields normalized endpoint and safe runtime state without granting control', () => {
  const snapshot = api.createDirectRobotConnectionSnapshot(endpoint(), observation(), now);
  assert.deepEqual(snapshot.endpoint, { host: 'robot.example', port: 13145 });
  const view = api.describeDirectRobotConnection(snapshot, now);
  assert.equal(view.endpointLabel, 'robot.example:13145');
  assert.equal(view.fresh, true);
  assert.equal(view.summary, '状态已读取，设备归属未核验');
  assert.deepEqual(view.runtimeState, {
    controlLink: 'unknown', controlAuthority: 'not-held', posture: 'standing', motorState: 'enabled',
    currentPolicy: null, policyCatalogStatus: 'unknown', policyOptions: [],
  });
  assert.ok(!JSON.stringify(snapshot).includes('not-for-storage'));
});

test('a verified Brainstem profile populates policy and terrain-mode display only', () => {
  const snapshot = api.createDirectRobotConnectionSnapshot(endpoint(), {
    ...observation(),
    profile: {
      current: 'flat',
      available: ['flat', 'stairs'],
      descriptions: ['平地策略', '候选策略'],
      currentDescription: '平地策略',
    },
  }, now);
  const state = api.describeDirectRobotConnection(snapshot, now).runtimeState;
  assert.equal(state.currentPolicy?.label, '平地策略');
  assert.equal(state.policyCatalogStatus, 'synced');
  assert.deepEqual(state.terrainMode, {
    current: 'flat',
    options: [{ id: 'flat', label: '平地模式' }, { id: 'stairs', label: '楼梯模式' }],
    catalogStatus: 'synced', source: 'device', updatedAt: new Date(now).toISOString(),
  });
});

test('slot-prefixed descriptions bind real model IDs without guessing from filenames or list order', () => {
  const profile = { current: 'cts_v39_61128', available: ['cts_v39_61128', 'w5_89999', 'stairs_guess'],
    descriptions: ['stairs: CTS', 'flat: W5', '楼梯候选'], currentDescription: 'stairs: CTS' };
  const state = runtime({ profile });
  assert.equal(state.terrainMode.current, 'stairs');
  assert.deepEqual(state.terrainMode.options.map(x => x.id), ['flat', 'stairs']);
  assert.equal(state.policyOptions[0].terrainModeId, 'stairs');
  assert.equal(state.policyOptions[0].id, 'cts_v39_61128');
  assert.equal(state.policyOptions[2].terrainModeId, undefined);
  const ambiguous = runtime({ profile: { ...profile, descriptions: ['flat: CTS', 'flat: W5', '楼梯候选'] } });
  assert.equal(ambiguous.terrainMode.current, null);
  assert.deepEqual(ambiguous.terrainMode.options, []);
});

test('read-only voltage and motor diagnostics populate battery bus voltage and joint health', () => {
  const snapshot = api.createDirectRobotConnectionSnapshot(endpoint(), {
    ...observation(),
    voltage: { values: [24.4, 24.6] },
    motors: [{ id: 0, online: true, statusCode: 0, temperatureC: 42, voltageV: 24.5, positionRad: 0.1, velocityRps: 0.2, torqueNm: 1.1, errors: [] }],
  }, now);
  const state = api.describeDirectRobotConnection(snapshot, now).runtimeState;
  assert.equal(state.battery?.percent, null);
  assert.equal(state.battery?.voltageV, 24.4);
  assert.equal(state.joints?.[0].fault, 'clear');
  assert.equal(state.joints?.[0].online, true);
  assert.equal(state.joints?.[0].statusCode, 0);
  assert.equal(state.joints?.[0].voltageV, 24.4, 'Vbus is matched by motor id rather than the placeholder MotorState.voltage');
});

test('joint ids follow Brainstem leg-first JointsMatrix ordering, including all four foot motors', () => {
  const motors = Array.from({ length: 16 }, (_, id) => motor(id)).reverse();
  const joints = runtime({ motors }).joints;
  assert.deepEqual(joints.map(joint => joint.id), Array.from({ length: 16 }, (_, id) => String(id)));
  assert.deepEqual(joints.map(joint => joint.label), [
    '前右髋', '前右大腿', '前右小腿', '前左髋', '前左大腿', '前左小腿',
    '后右髋', '后右大腿', '后右小腿', '后左髋', '后左大腿', '后左小腿',
    '前右足轮', '前左足轮', '后右足轮', '后左足轮',
  ]);
});

test('RoboStride operating statuses remain raw data and are not mistaken for nonzero error codes', () => {
  const motors = [0, 1, 2, 3, 9].map((statusCode, id) => motor(id, { statusCode }));
  const joints = runtime({ motors }).joints;
  assert.deepEqual(joints.map(joint => joint.statusCode), [0, 1, 2, 3, 9]);
  assert.deepEqual(joints.map(joint => joint.fault), ['clear', 'clear', 'clear', 'unknown', 'unknown']);
  for (const statusCode of [0, 1, 2, 3]) {
    assert.equal(runtime({ motors: [motor(0, { statusCode, errors: [4] })] }).joints[0].fault, 'active');
  }
  assert.equal(runtime({ motors: [motor(0, { online: false })] }).joints[0].fault, 'unknown');
});

test('offline report placeholders project to unknown while legitimate online zero measurements remain zero', () => {
  const zeroReport = { temperatureC: 0, positionRad: 0, velocityRps: 0, torqueNm: 0 };
  const joints = runtime({ voltage: { values: [24.5, 24.6] }, motors: [motor(0, { ...zeroReport, online: false }), motor(1, zeroReport)] }).joints;
  for (const key of ['positionDeg', 'velocityRps', 'torqueNm', 'temperatureC', 'voltageV']) {
    assert.equal(joints[0][key], null, `${key}: offline placeholder is unknown`);
    assert.equal(joints[1][key], key === 'voltageV' ? 24.6 : 0, `${key}: real online measurements are preserved`);
  }
});

test('Vbus ignores nonresponding zero channels, matches ids and never trusts MotorState.voltage', () => {
  const joints = runtime({
    voltage: { values: [0, 24.6, 24.4] },
    motors: [motor(0, { voltageV: 99 }), motor(1), motor(2), motor(3)],
  });
  assert.equal(joints.battery.percent, null);
  assert.equal(joints.battery.voltageV, 24.4);
  assert.deepEqual(joints.joints.map(joint => joint.voltageV), [null, 24.6, 24.4, null]);
  assert.equal(runtime({ motors: [motor(0, { voltageV: 99 })] }).joints[0].voltageV, null);
  for (const values of [[], [0], [0, 0, 0]]) {
    assert.equal(runtime({ voltage: { values } }).battery.voltageV, null);
  }
  for (const values of [[-1], [NaN], [Infinity], [1001], ['24.5']]) {
    assert.throws(() => runtime({ voltage: { values } }), /无法验证/);
  }
  assert.throws(() => runtime({ motors: [motor(0, { voltageV: -1 })] }), /无法验证/);
});

test('snapshot creation rejects malformed or authority-bearing observations without exposing inputs', () => {
  const invalid = [null, {}, { ...observation(), source: 'cloud' }, { ...observation(), transport: 'plaintext' },
    { ...observation(), motionAuthorized: true }, { ...observation(), cloudBindingVerified: true },
    { ...observation(), status: null }];
  for (const [key, value] of Object.entries({ fsmKind: 'invalid', transition: 'invalid', owner: 'invalid', motorOutputEnabled: 1, criticalMotorFault: 'false', grpcLeaseActive: null, readyForWalk: undefined })) {
    invalid.push({ ...observation(), status: { ...observation().status, [key]: value } });
  }
  for (const item of invalid) {
    assert.throws(() => api.createDirectRobotConnectionSnapshot(endpoint(), item, now), /无法验证机器人直连状态/);
    assert.equal(api.isDirectRobotConnectionFresh({ endpoint: endpoint(), observation: item }, now), false);
  }
});

test('timestamps expire strictly at 15 seconds and future/invalid clocks never count as fresh', () => {
  const snapshot = api.createDirectRobotConnectionSnapshot(endpoint(), observation(), now);
  assert.equal(api.isDirectRobotConnectionFresh(snapshot, now + 14_999), true);
  for (const clock of [now + 15_000, now + 15_001, now - 1, NaN, Infinity]) {
    assert.equal(api.isDirectRobotConnectionFresh(snapshot, clock), false);
    assert.equal(api.describeDirectRobotConnection(snapshot, clock).runtimeState.motorState, 'unknown');
  }
  for (const timestamp of ['invalid', null, NaN, new Date(now + 1).toISOString(), new Date(now - 15_000).toISOString()]) {
    assert.throws(() => api.createDirectRobotConnectionSnapshot(endpoint(), { ...observation(), observedAt: timestamp }, now), /无法验证/);
  }
  assert.throws(() => api.createDirectRobotConnectionSnapshot(endpoint(), observation(), NaN), /无法验证/);
  assert.equal(api.describeDirectRobotConnection(snapshot, now + 15_000).summary, '状态已过期，请重新检查');
});

test('endpoint validation accepts canonical IP/DNS only and formats IPv6 without ambiguity', () => {
  for (const host of ['192.168.42.64', 'robot.example', 'localhost', '::1', '[2001:0db8::1]']) {
    const snapshot = api.createDirectRobotConnectionSnapshot({ host, port: 13145 }, observation(), now);
    assert.equal(api.isDirectRobotConnectionFresh(snapshot, now), true);
  }
  const ipv6 = api.createDirectRobotConnectionSnapshot({ host: '[2001:0db8::1]', port: 13145 }, observation(), now);
  assert.equal(ipv6.endpoint.host, '2001:db8::1');
  assert.equal(api.describeDirectRobotConnection(ipv6, now).endpointLabel, '[2001:db8::1]:13145');
  for (const host of ['', 'https://robot', 'robot/path', 'user:secret@robot', 'robot:13145', 'robot?x', 'robot#x', '192.168.42.999', '010.0.0.1', '2130706433', 'a..b', '-robot', '::xyz', '::ffff:192.0.2.1', null, 9]) {
    assert.throws(() => api.createDirectRobotConnectionSnapshot({ host, port: 13145 }, observation(), now), /无法验证/);
  }
  for (const port of [0, 65536, -1, 1.1, NaN, Infinity, '13145', null]) {
    assert.throws(() => api.createDirectRobotConnectionSnapshot({ host: 'robot', port }, observation(), now), /无法验证/);
  }
  for (const value of [null, {}, { host: 'https://invalid', port: 13145 }]) {
    assert.equal(api.isDirectRobotConnectionFresh({ endpoint: value, observation: observation() }, now), false);
    assert.doesNotThrow(() => api.describeDirectRobotConnection({ endpoint: value, observation: observation() }, now));
  }
});

test('snapshots are isolated and deeply frozen and never copy credentials or extra status fields', () => {
  const input = observation();
  input.status.ownerId = 'private-owner'; input.status.leaseToken = 'private-token'; input.accessToken = 'private-access';
  const ep = endpoint();
  const snapshot = api.createDirectRobotConnectionSnapshot(ep, input, now);
  ep.host = 'changed'; input.status.motorOutputEnabled = false; input.observedAt = 'invalid';
  assert.equal(snapshot.endpoint.host, 'robot.example');
  assert.equal(snapshot.observation.status.motorOutputEnabled, true);
  assert.equal(api.isDirectRobotConnectionFresh(snapshot, now), true);
  for (const value of [snapshot, snapshot.endpoint, snapshot.observation, snapshot.observation.status]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { snapshot.observation.status.owner = 'none'; }, TypeError);
  assert.ok(!JSON.stringify(snapshot).includes('private-'));
});

test('all legitimate FSM/owner values remain observations only, and grounded never means sitting', () => {
  for (const fsmKind of ['zero', 'grounded', 'standing', 'walking', 'transitioning']) {
    for (const owner of ['none', 'grpc', 'yunzhuo']) {
      const input = observation();
      Object.assign(input.status, { fsmKind, owner, motorOutputEnabled: false });
      const snapshot = api.createDirectRobotConnectionSnapshot(endpoint(), input, now);
      const current = api.describeDirectRobotConnection(snapshot, now).runtimeState;
      assert.equal(current.posture, fsmKind === 'standing' ? 'standing' : 'unknown');
      assert.equal(current.motorState, 'disabled');
      assert.equal(current.controlAuthority, 'not-held');
      assert.equal(current.controlLink, 'unknown');
      assert.deepEqual(current.policyOptions, []);
      const stale = api.describeDirectRobotConnection(snapshot, now + 15_000).runtimeState;
      assert.equal(stale.posture, 'unknown'); assert.equal(stale.motorState, 'unknown');
    }
  }
});

test('empty and tampered snapshots cannot project state or leak arbitrary endpoint text', () => {
  for (const snapshot of [null, undefined, {}, { endpoint: null }, { endpoint: { host: 'user:secret@robot', port: 13145 }, observation: observation() }]) {
    assert.equal(api.isDirectRobotConnectionFresh(snapshot, now), false);
    const view = api.describeDirectRobotConnection(snapshot, now);
    assert.equal(view.fresh, false); assert.equal(view.endpointLabel, '未连接');
    assert.equal(view.runtimeState.controlLink, 'unknown');
    assert.equal(view.runtimeState.controlAuthority, 'not-held');
    assert.equal(view.runtimeState.posture, 'unknown'); assert.equal(view.runtimeState.motorState, 'unknown');
    assert.ok(!JSON.stringify(view).includes('secret'));
  }
});
