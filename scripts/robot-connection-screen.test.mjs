import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/screens/RobotConnectionScreen.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const snapshotSource = readFileSync(new URL('../src/services/directRobotConnection.ts', import.meta.url), 'utf8');
const snapshotModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(snapshotSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { module: snapshotModule, exports: snapshotModule.exports, Date, URL });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const observation = observedAt => ({ source: 'brainstem.grpc.direct', transport: 'grpc-tls',
  observedAt: observedAt ?? new Date().toISOString(), motionAuthorized: false, cloudBindingVerified: false,
  status: { fsmKind: 'grounded', transition: 'none', owner: 'none', motorOutputEnabled: false,
    criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false } });

// Actual TSX handlers, with native transport/React scheduling/timers as explicit
// fixtures. This verifies UI ownership and late results, not Yoga, TLS or hardware.
function mount({ available = true, controlAvailable = false, lanAvailable = false, localIdentityAvailable = false, getLocalIdentity, prepareLocalIdentity, completeLocalIdentity, cancelLocalIdentity, read, choose, readProfile, readVoltage, readMotors, ...props } = {}) {
  const slots = [], cleanups = [], timers = new Map(), listeners = new Set(), reads = [];
  let cursor = 0, timerId = 0, unmounted = false, lateUpdates = 0, nodes = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {
      if (unmounted) lateUpdates++; slots[i] = typeof value === 'function' ? value(slots[i]) : value;
    }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(effect()); } },
  };
  class BrainstemGrpcError extends Error { constructor(code = 'config', message = 'invalid endpoint fixture') { super(message); this.code = code; } }
  const allowed = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, callback) => {
      listeners.add(callback); return { remove: () => listeners.delete(callback) };
    } }, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value },
    useWindowDimensions: () => ({ width: 753, height: 471, fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-crypto': { randomUUID: () => 'fixture-request' },
    '../components/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) },
    '../appearance': { cardLayout: { radius: 24 }, getProductAppearance: () => ({ surface: '#f4f7fa', ink: '#123', secondary: '#567', blue: '#98d1ff', blueInk: '#123' }) },
    '../typography': { typography: {} },
    '../services/directRobotConnection': snapshotModule.exports,
    '../services/brainstemControl': { isBrainstemControlAvailable: () => controlAvailable },
    '../services/brainstemGrpc': { BrainstemGrpcError, isBrainstemGrpcAvailable: () => available, isBrainstemLanAvailable: () => lanAvailable,
      isBrainstemLocalIdentityAvailable: () => localIdentityAvailable,
      getBrainstemLocalClientIdentity: getLocalIdentity ?? (async () => null),
      prepareBrainstemLocalClientIdentity: prepareLocalIdentity ?? (async () => { throw new Error('local fixture not configured'); }),
      completeBrainstemLocalClientIdentity: completeLocalIdentity ?? (async () => { throw new Error('local fixture not configured'); }),
      cancelBrainstemLocalClientIdentity: cancelLocalIdentity ?? (async () => {}),
      validateBrainstemEndpoint: (host, port) => { if (!host || !Number(port)) throw new BrainstemGrpcError(); return { host, port: Number(port) }; },
      chooseBrainstemClientIdentity: choose ?? (async () => null),
      readBrainstemGrpcStatus: options => { reads.push(options); return read ? read(options) : Promise.resolve(observation()); },
      ...(readProfile ? { readBrainstemGrpcProfile: readProfile } : {}),
      ...(readVoltage ? { readBrainstemGrpcVoltage: readVoltage } : {}),
      ...(readMotors ? { readBrainstemGrpcMotorStatus: readMotors } : {}),
    },
    '../services/brainstemIntegrationReadiness': { getBrainstemIntegrationReadiness: () => ({
      gates: [], readOnlyReady: false, controlReady: false,
      readOnlyLabel: '只读状态未就绪', controlLabel: '真实控制保持锁定',
      controlBlockedReason: '测试夹具：控制门禁保持锁定。',
    }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.ok(name in allowed, `unexpected dependency ${name}`); return allowed[name];
  }, AbortController, Date, Number,
  setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
  clearTimeout: id => timers.delete(id) });
  function render() {
    cursor = 0; nodes = [];
    const walk = node => {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      nodes.push(node); walk(node.props.children);
    };
    walk(module.exports.RobotConnectionScreen({ onBack() {}, ...props }));
  }
  render();
  return { render, reads, timers, BrainstemGrpcError, get lateUpdates() { return lateUpdates; },
    get copy() { return nodes.filter(n => n.type === 'copy').map(n => n.value).join(' '); },
    element: id => nodes.find(n => n.props?.testID === id),
    advanced() { if (!this.element('connection-advanced-settings')) { this.element('connection-details-toggle').props.onPress(); render(); } },
    fill(value = 'robot.example.test') { this.element('robot-grpc-host').props.onChangeText(value); render(); },
    background() { for (const callback of listeners) callback('background'); render(); },
    foreground() { for (const callback of listeners) callback('active'); render(); },
    unmount() { unmounted = true; for (const cleanup of cleanups) cleanup?.(); },
  };
}

function mountAdvanced(options) { const host = mount(options); host.advanced(); return host; }

test('LAN capability failures preserve the safe service message instead of blaming the network', async () => {
  const host = mountAdvanced({ lanAvailable: true, read: async () => {
    throw new host.BrainstemGrpcError('unimplemented', '机器人服务尚未提供此项查询，请检查服务配置与版本。');
  } });
  host.fill('192.168.42.64');
  await host.element('robot-grpc-read').props.onPress(); host.render();
  assert.match(host.copy, /机器人服务尚未提供此项查询/);
  assert.doesNotMatch(host.copy, /局域网连接检查失败/);
});

const localRecord = overrides => ({ version: 1, status: 'pending', requestId: 'fixture-request',
  host: 'robot.example.test', port: 13145, robotId: 'THUNDER-01', identityAlias: 'local:fixture-key',
  publicKeySha256: 'a'.repeat(64), securityLevel: 'unknown', ...overrides });
const readyLocalRecord = overrides => localRecord({ status: 'ready', principal: 'doso-g20-fixture@robot',
  clientCertificateSha256: 'b'.repeat(64), caCertificateSha256: 'c'.repeat(64), ...overrides });
function fillLocalTarget(host) { host.fill(); host.element('robot-local-identity-robot-id').props.onChangeText('THUNDER-01'); host.render(); }

test('old package retains the system identity path but disables unsupported local identity actions', () => {
  const host = mountAdvanced();
  assert.equal(host.element('robot-local-identity-prepare').props.disabled, true);
  assert.ok(host.element('robot-local-identity-unavailable'));
  assert.equal(host.element('robot-grpc-certificate').props.disabled, false);
  assert.equal(host.element('robot-local-identity-robot-id').props.value, '');
});

test('local request generation needs an explicit robot number and never opens control or reads the robot', async () => {
  const calls = [], opened = [];
  const host = mountAdvanced({ localIdentityAvailable: true, controlAvailable: true,
    getLocalIdentity: async target => { calls.push(['get', target]); return null; },
    prepareLocalIdentity: async target => { calls.push(['prepare', target]); return localRecord(); },
    onOpenControl: async (...args) => { opened.push(args); return true; } });
  host.fill(); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.match(host.copy, /请输入有效的机器人编号/); assert.equal(calls.length, 0);
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.deepEqual(calls.map(call => call[0]), ['get', 'prepare']);
  assert.equal(calls[1][1].host, 'robot.example.test'); assert.equal(calls[1][1].robotId, 'THUNDER-01');
  assert.match(host.copy, /本机身份： 等待授权/); assert.doesNotMatch(host.copy, /配对证书：已选择/);
  assert.ok(host.element('robot-local-identity-complete'));
  assert.equal(opened.length, 0); assert.equal(host.reads.length, 0);
});

test('G20 full-width ASCII is normalized only at submission to the same strict robot target', async () => {
  for (const input of ['THUNDER\uFF0D01', '\u3000ＴＨＵＮＤＥＲ－０１\u3000']) {
    const calls = [];
    const host = mountAdvanced({ localIdentityAvailable: true,
      getLocalIdentity: async target => { calls.push(['get', target.robotId]); return null; },
      prepareLocalIdentity: async target => { calls.push(['prepare', target.robotId]); return localRecord(); } });
    host.fill(); host.element('robot-local-identity-robot-id').props.onChangeText(input); host.render();
    assert.equal(host.element('robot-local-identity-robot-id').props.value, input, 'typing/composition is not rewritten');
    await host.element('robot-local-identity-prepare').props.onPress(); host.render();
    assert.deepEqual(calls, [['get', 'THUNDER-01'], ['prepare', 'THUNDER-01']]);
    assert.equal(host.element('robot-local-identity-robot-id').props.value, 'THUNDER-01');
    assert.match(host.copy, /本机身份： 等待授权/);
  }
});

test('non-normalizable robot identifiers stay rejected without identity dispatch', async () => {
  for (const input of ['THUND\u0415R-01', 'THUNDER\u201301', 'THUNDER\u200B-01', '机器狗-01']) {
    let calls = 0;
    const host = mountAdvanced({ localIdentityAvailable: true,
      getLocalIdentity: async () => { calls++; return null; },
      prepareLocalIdentity: async () => { calls++; return localRecord(); } });
    host.fill(); host.element('robot-local-identity-robot-id').props.onChangeText(input); host.render();
    await host.element('robot-local-identity-prepare').props.onPress(); host.render();
    assert.equal(calls, 0); assert.match(host.copy, /请输入有效的机器人编号/);
    assert.equal(host.element('robot-local-identity-robot-id').props.value, input);
  }
});

test('issued identity is explicitly recovered and fills only the matching alias and approved principal', async () => {
  let generated = 0, completed = 0, opened = 0;
  const host = mountAdvanced({ localIdentityAvailable: true, controlAvailable: true,
    getLocalIdentity: async () => localRecord(),
    prepareLocalIdentity: async () => { generated++; return localRecord(); },
    completeLocalIdentity: async target => { completed++; assert.equal(target.requestId, 'fixture-request'); return readyLocalRecord(); },
    onOpenControl: async () => { opened++; return true; } });
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.equal(generated, 1, 'idempotent prepare reopens the native handoff window for the persisted pending request'); assert.match(host.copy, /等待授权/);
  await host.element('robot-local-identity-complete').props.onPress(); host.render();
  assert.equal(completed, 1); assert.match(host.copy, /本机身份： 可用/); assert.match(host.copy, /配对证书：已选择/);
  assert.equal(host.element('robot-local-identity-complete'), undefined, 'ready identity cannot resubmit consumed factory approval');
  assert.equal(host.element('robot-control-principal').props.value, 'doso-g20-fixture@robot');
  assert.equal(host.element('robot-control-principal').props.editable, false);
  host.element('robot-control-principal').props.onChangeText('other@robot'); host.render();
  assert.equal(host.element('robot-control-principal').props.value, 'doso-g20-fixture@robot');
  assert.equal(opened, 0); assert.equal(host.reads.length, 0);
});

test('ready native identity is restored without generating another key or opening control', async () => {
  let generated = 0;
  const host = mountAdvanced({ localIdentityAvailable: true, getLocalIdentity: async () => readyLocalRecord(),
    prepareLocalIdentity: async () => { generated++; return localRecord(); } });
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.match(host.copy, /本机身份： 可用/); assert.equal(generated, 0); assert.equal(host.reads.length, 0);
});

test('resuming a pending request explicitly rearms factory handoff with the same persisted request', async () => {
  const requests = [];
  const host = mountAdvanced({ localIdentityAvailable: true, getLocalIdentity: async () => localRecord(),
    prepareLocalIdentity: async options => { requests.push(options); return localRecord(); } });
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.equal(requests.length, 1); host.background(); host.foreground();
  assert.match(host.copy, /本机身份： 未准备/);
  await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  assert.equal(requests.length, 2); assert.match(host.copy, /本机身份： 等待授权/);
  assert.equal(requests[1].host, requests[0].host); assert.equal(requests[1].robotId, requests[0].robotId);
});

test('failed completion preserves the pending request and hides raw native details', async () => {
  const host = mountAdvanced({ localIdentityAvailable: true, getLocalIdentity: async () => localRecord(), prepareLocalIdentity: async () => localRecord(),
    completeLocalIdentity: async () => { throw new Error('/private/key/secret'); } });
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  await host.element('robot-local-identity-complete').props.onPress(); host.render();
  assert.match(host.copy, /本机身份： 等待授权/); assert.ok(host.element('robot-local-identity-complete'));
  assert.doesNotMatch(host.copy, /secret|\/private\//); assert.match(host.copy, /连接检查失败/);
});

test('cancelled or backgrounded local work cannot resurrect identity after another target or foreground', async () => {
  for (const event of ['cancel', 'background', 'unmount']) {
    let cancelled = 0;
    const pending = deferred(), host = mountAdvanced({ localIdentityAvailable: true,
      getLocalIdentity: () => pending.promise, cancelLocalIdentity: async () => { cancelled++; } });
    fillLocalTarget(host); const result = host.element('robot-local-identity-prepare').props.onPress(); host.render();
    if (event === 'cancel') {
      host.element('robot-grpc-cancel').props.onPress(); host.render();
      host.element('robot-local-identity-robot-id').props.onChangeText('OTHER'); host.render();
    } else host[event]();
    pending.resolve(readyLocalRecord()); await result; await settle();
    if (event === 'unmount') assert.equal(host.lateUpdates, 0);
    else {
      if (event === 'background') host.foreground(); else host.render();
      assert.doesNotMatch(host.copy, /配对证书：已选择|本机身份： 可用/);
      assert.equal(host.element('robot-local-identity-prepare').props.disabled, false);
    }
    assert.ok(cancelled >= 3, 'target editing and cancellation/unmount retire the native factory window');
  }
});

test('changing the target clears local selection and native pairing window without reading automatically', async () => {
  let cancelled = 0;
  const host = mountAdvanced({ localIdentityAvailable: true, getLocalIdentity: async () => readyLocalRecord(),
    cancelLocalIdentity: async () => { cancelled++; } });
  fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
  const before = cancelled; host.fill('other.example.test');
  assert.equal(cancelled, before + 1); assert.match(host.copy, /本机身份： 未准备/);
  assert.doesNotMatch(host.copy, /配对证书：已选择/); assert.equal(host.reads.length, 0);
});

test('local mTLS acceptance requires all four reads to prove the same approved certificate', async () => {
  for (const fault of ['none', 'wrong-leaf', 'missing-proof']) {
    let opened = 0;
    const proof = { mutualTlsVerified: true, clientCertificateSha256: 'b'.repeat(64) };
    const host = mountAdvanced({ localIdentityAvailable: true, controlAvailable: true,
      getLocalIdentity: async () => readyLocalRecord(),
      read: async () => ({ ...observation(), ...proof }),
      readProfile: async () => ({ profile: { current: 'real-policy', currentDescription: '真实策略', available: ['real-policy'], descriptions: ['真实策略'] }, ...proof }),
      readVoltage: async () => ({ voltage: { values: [24.5] }, ...proof }),
      readMotors: async () => ({ motors: [], ...(fault === 'missing-proof' ? {} : { ...proof, clientCertificateSha256: (fault === 'wrong-leaf' ? 'd' : 'b').repeat(64) }) }),
      onOpenControl: async () => { opened++; return true; } });
    fillLocalTarget(host); await host.element('robot-local-identity-prepare').props.onPress(); host.render();
    await host.element('robot-grpc-read').props.onPress(); host.render();
    assert.match(host.copy, fault === 'none' ? /身份握手： 已验证/ : /身份握手： 未验证/);
    assert.equal(host.reads[0].endpoint.clientIdentityAlias, 'local:fixture-key'); assert.equal(opened, 0);
    assert.match(host.copy, /未获取控制权/);
    assert.equal(host.element('robot-grpc-observation') !== undefined, true);
  }
});

test('old package keeps connection unavailable and cannot expose account-only actions', () => {
  const host = mountAdvanced({ available: false });
  assert.equal(host.element('robot-connect').props.disabled, true);
  assert.ok(host.element('robot-grpc-unavailable'));
  assert.equal(host.element('robot-open-binding'), undefined);
  assert.equal(host.element('robot-open-ble'), undefined);
  assert.equal(host.reads.length, 0);
});
test('empty address fails without dispatch and with no hardcoded physical address', async () => {
  const host = mountAdvanced();
  assert.equal(host.element('robot-grpc-host').props.value, '');
  await host.element('robot-connect').props.onPress(); host.render();
  assert.equal(host.reads.length, 0); assert.match(host.copy, /invalid endpoint fixture/);
});

test('connection center exposes unified account summary and transport choices', () => {
  const opened = [];
  const host = mountAdvanced({
    accountDeviceName: 'THUNDER',
    accountDeviceConnected: false,
    accountDeviceIdentityStatus: 'bound-unverified',
    accountDeviceConnectionSource: '云端设备记录',
    accountDeviceLastSyncLabel: '刚刚同步',
    accountControlAuthority: 'not-held',
    accountBlockedReason: '设备身份尚未验证，手动控制保持锁定。',
    onOpenBleDiscovery: () => opened.push('ble'),
    onOpenDeviceEnrollment: () => opened.push('enrollment'),
    onBindDevice: () => opened.push('bind'),
  });
  assert.equal(host.element('device-connection-summary'), undefined);
  assert.doesNotMatch(host.copy, /设备身份尚未验证/);
  assert.ok(host.element('connection-transport-ip'));
  assert.ok(host.element('connection-transport-ble'));
  assert.ok(host.element('connection-transport-cloud'));
  host.element('connection-transport-cloud').props.onPress(); host.render();
  assert.ok(host.element('connection-cloud-panel'));
  assert.ok(host.element('device-connection-summary'));
  assert.match(host.copy, /THUNDER/);
  assert.match(host.copy, /设备身份尚未验证/);
  host.element('connection-open-enrollment').props.onPress();
  assert.deepEqual(opened, ['enrollment']);
});

test('default surface exposes only address, one connection action and status; advanced settings are explicit', () => {
  const host = mount();
  const contains = (node, id) => Array.isArray(node) ? node.some(child => contains(child, id))
    : !!node && typeof node === 'object' && (node.props?.testID === id || contains(node.props?.children, id));
  const scroll = host.element('robot-connection-scroll');
  assert.equal(scroll.type, 'ScrollView');
  for (const id of ['robot-grpc-host', 'robot-connect', 'robot-grpc-result', 'connection-details-toggle']) assert.ok(contains(scroll, id));
  for (const id of ['device-connection-summary', 'connection-transport-tabs', 'robot-grpc-port', 'robot-grpc-certificate', 'robot-grpc-read', 'brainstem-integration-readiness']) assert.equal(host.element(id), undefined, id);
  assert.doesNotMatch(host.copy, /设备身份|最后同步|控制权|配对身份|配对证书/);
  host.advanced();
  for (const id of ['connection-transport-tabs', 'robot-grpc-port', 'robot-grpc-certificate', 'robot-grpc-read', 'brainstem-integration-readiness']) assert.ok(host.element(id), id);
  assert.equal(host.element('connection-details-toggle').props.accessibilityState.expanded, true);
  host.element('connection-details-toggle').props.onPress(); host.render();
  assert.equal(host.element('brainstem-integration-readiness'), undefined);
  assert.equal(host.reads.length, 0, 'advanced disclosure never contacts a robot');
});

test('optional diagnostic failures keep the main status useful and details in advanced settings', async () => {
  const unavailable = async () => { throw new Error('fixture unsupported RPC'); };
  const host = mount({ readProfile: unavailable, readVoltage: unavailable, readMotors: unavailable });
  host.fill(); await host.element('robot-connect').props.onPress(); host.render();
  assert.match(host.copy, /状态已读取，未获取控制权/);
  assert.equal(host.element('robot-grpc-observation'), undefined);
  assert.equal(host.element('connection-diagnostic-issues'), undefined);
  host.advanced();
  assert.ok(host.element('robot-grpc-observation'));
  assert.match(host.copy, /当前策略： 未同步/);
  assert.match(host.copy, /电机总线电压： 未同步/);
  assert.match(host.copy, /电机在线： 未同步/);
  assert.doesNotMatch(host.copy, /诊断已读取|正常|0\.0 V/);
  assert.ok(host.element('connection-diagnostic-issues'));
  assert.match(host.copy, /策略.*连接检查失败/);
  assert.doesNotMatch(host.copy, /fixture unsupported RPC/);
});

test('partial voltage and offline motors do not masquerade as zero voltage or a passed health check', async () => {
  const host = mountAdvanced({
    readVoltage: async () => ({ voltage: { values: [0, 24.6, 24.4] } }),
    readMotors: async () => ({ motors: [
      { id: 0, online: true, statusCode: 2, errors: [], temperatureC: 42, voltageV: 0, positionRad: 0, velocityRps: 0, torqueNm: 0 },
      { id: 1, online: false, statusCode: 0, errors: [], temperatureC: 0, voltageV: 0, positionRad: 0, velocityRps: 0, torqueNm: 0 },
    ] }),
  });
  host.fill(); await host.element('robot-connect').props.onPress(); host.render();
  assert.match(host.copy, /24\.4–24\.6 V/);
  assert.match(host.copy, /电机在线： 1\/2/);
  assert.doesNotMatch(host.copy, /正常|0\.0 V|存在电机故障/);
});

test('only one read is dispatched; cancel aborts and late success cannot restore status', async () => {
  const pending = deferred(), host = mountAdvanced({ read: () => pending.promise }); host.fill();
  const read = host.element('robot-connect').props.onPress;
  const result = read(); await read(); host.render();
  assert.equal(host.reads.length, 1);
  host.element('robot-grpc-cancel').props.onPress(); host.render();
  assert.equal(host.reads[0].signal.aborted, true);
  pending.resolve(observation()); await result; host.render();
  assert.equal(host.element('robot-grpc-observation'), undefined);
  assert.equal(host.timers.size, 0);
});
test('background cancels read and ignores completion after foreground', async () => {
  const pending = deferred(), host = mountAdvanced({ read: () => pending.promise }); host.fill();
  const result = host.element('robot-connect').props.onPress(); host.background(); host.foreground();
  assert.equal(host.reads[0].signal.aborted, true);
  pending.resolve(observation()); await result; host.render();
  assert.equal(host.element('robot-grpc-observation'), undefined);
});
test('completed status expires with no automatic reconnect and does not grant control', async () => {
  const host = mountAdvanced(); host.fill(); await host.element('robot-connect').props.onPress(); host.render();
  assert.ok(host.element('robot-grpc-observation')); assert.match(host.copy, /未获取控制权/);
  assert.equal(host.timers.size, 1);
  const timer = [...host.timers.values()][0]; assert.ok(timer.delay > 0 && timer.delay <= 15000);
  timer.callback(); host.render(); assert.equal(host.element('robot-grpc-observation'), undefined);
  assert.equal(host.reads.length, 1);
});
test('system picker pause preserves its operation; explicit cancel still discards a late identity', async () => {
  const pending = deferred(), host = mountAdvanced({ choose: () => pending.promise }); host.fill();
  const result = host.element('robot-grpc-certificate').props.onPress(); host.background(); host.foreground();
  pending.resolve('fixture-alias'); await result; host.render(); assert.match(host.copy, /配对证书：已选择/);
  const cancelled = deferred(), cancelledHost = mountAdvanced({ choose: () => cancelled.promise }); cancelledHost.fill();
  const cancelledResult = cancelledHost.element('robot-grpc-certificate').props.onPress(); cancelledHost.render();
  cancelledHost.element('robot-grpc-cancel').props.onPress(); cancelledHost.background(); cancelledHost.foreground();
  cancelled.resolve('fixture-alias'); await cancelledResult; cancelledHost.render();
  assert.doesNotMatch(cancelledHost.copy, /配对证书：已选择/);
});
test('changing endpoint clears the selected transient certificate identity', async () => {
  const other = mountAdvanced({ choose: async () => 'fixture-alias' }); other.fill();
  await other.element('robot-grpc-certificate').props.onPress(); other.render();
  assert.match(other.copy, /配对证书：已选择/); other.fill('other.example.test');
  assert.doesNotMatch(other.copy, /配对证书：已选择/);
});
test('identity picker rejection while backgrounded cannot leave the form permanently busy', async () => {
  const pending = deferred(), host = mountAdvanced({ choose: () => pending.promise }); host.fill();
  const result = host.element('robot-grpc-certificate').props.onPress(); host.background();
  pending.reject(new Error('native refused picker during activity pause')); await result; host.foreground();
  assert.equal(host.element('robot-grpc-certificate').props.disabled, false);
  assert.equal(host.element('robot-connect').props.disabled, false);
  assert.equal(host.element('robot-grpc-cancel'), undefined);
});
test('unmount aborts in-flight reads and never updates an unmounted screen', async () => {
  const pending = deferred(), host = mountAdvanced({ read: () => pending.promise }); host.fill();
  const result = host.element('robot-connect').props.onPress(); host.unmount();
  pending.resolve(observation()); await result; await settle();
  assert.equal(host.reads[0].signal.aborted, true); assert.equal(host.lateUpdates, 0);
});
test('stale or implausibly future observation cannot become a displayed connection', async () => {
  for (const offset of [-16000, 30000]) {
    const host = mountAdvanced({ read: async () => observation(new Date(Date.now() + offset).toISOString()) }); host.fill();
    await host.element('robot-connect').props.onPress(); host.render();
    assert.equal(host.element('robot-grpc-observation'), undefined); assert.equal(host.timers.size, 0);
  }
});

test('a fresh read is used on the next screen only after explicit selection', async () => {
  const selected = [];
  const host = mountAdvanced({ onUseConnection: snapshot => { selected.push(snapshot); return true; } });
  host.fill(); await host.element('robot-connect').props.onPress(); host.render();
  assert.equal(selected.length, 0, 'reading does not silently replace the selected device');
  assert.ok(host.element('robot-use-connection'), 'fresh read has a clear continuation');
  host.element('robot-use-connection').props.onPress();
  assert.equal(selected.length, 1);
  assert.equal(selected[0].endpoint.host, 'robot.example.test');
  assert.equal(selected[0].observation.motionAuthorized, false);
});

test('a new page can refill a transient selected address without automatically reading it', () => {
  const host = mountAdvanced({ initialEndpoint: { host: 'remembered.example.test', port: 15443 } });
  assert.equal(host.element('robot-grpc-host').props.value, 'remembered.example.test');
  assert.equal(host.element('robot-grpc-port').props.value, '15443');
  assert.equal(host.reads.length, 0); assert.equal(host.element('robot-use-connection'), undefined);
});

test('editing, expiry and a declined continuation never publish a replacement device', async () => {
  let selected = 0;
  const host = mountAdvanced({ onUseConnection: () => { selected++; return false; } }); host.fill();
  await host.element('robot-connect').props.onPress(); host.render();
  host.element('robot-use-connection').props.onPress(); host.render();
  assert.equal(selected, 1); assert.equal(host.element('robot-use-connection'), undefined);
  assert.match(host.copy, /账户上下文已变化/);
  await host.element('robot-connect').props.onPress(); host.render();
  host.fill('different.example.test'); assert.equal(host.element('robot-use-connection'), undefined);
  await host.element('robot-connect').props.onPress(); host.render();
  [...host.timers.values()][0].callback(); host.render();
  assert.equal(host.element('robot-use-connection'), undefined); assert.equal(selected, 1);
});

test('control connection is explicit and requires the new native module and selected certificate', async () => {
  for (const controlAvailable of [false, true]) {
    const opened = [];
    const host = mountAdvanced({ controlAvailable, choose: async () => 'fixture-client',
      onOpenControl: async (...args) => { opened.push(args); return true; } });
    host.fill();
    assert.equal(host.element('robot-connect').props.disabled, !controlAvailable);
    assert.equal(opened.length, 0); assert.equal(host.reads.length, 0);
    await host.element('robot-grpc-certificate').props.onPress(); host.render();
    assert.equal(host.element('robot-connect').props.disabled, !controlAvailable);
    assert.equal(host.element('robot-control-principal').props.value, 'doso-g20@robot');
    if (controlAvailable) {
      await host.element('robot-connect').props.onPress(); host.render();
      assert.equal(opened.length, 1); assert.equal(opened[0][0].clientIdentityAlias, 'fixture-client');
      assert.equal(opened[0][1], 'doso-g20@robot'); assert.equal(opened[0][2].aborted, false);
      assert.equal(host.reads.length, 0, 'opening uses production session callback rather than turning a public read into control');
    }
  }
});

test('the primary control action guides missing pairing without dispatching or bypassing certificate checks', async () => {
  const opened = [];
  const host = mount({ controlAvailable: true, choose: async () => 'fixture-client',
    onOpenControl: async (...args) => { opened.push(args); return true; } });
  host.fill();
  assert.equal(host.element('robot-grpc-certificate'), undefined);
  await host.element('robot-connect').props.onPress(); host.render();
  assert.ok(host.element('connection-advanced-settings'));
  assert.match(host.copy, /首次连接.*选择配对证书/);
  assert.equal(opened.length, 0); assert.equal(host.reads.length, 0);
  await host.element('robot-grpc-certificate').props.onPress(); host.render();
  host.element('connection-details-toggle').props.onPress(); host.render();
  await host.element('robot-connect').props.onPress(); host.render();
  assert.equal(opened.length, 1); assert.equal(opened[0][0].clientIdentityAlias, 'fixture-client');
  assert.match(host.copy, /连接已建立/);
  assert.equal(host.reads.length, 0);
});

test('cancel aborts a pending control open and late failure cannot replace cancellation feedback', async () => {
  const pending = deferred(), opened = [];
  const host = mountAdvanced({ controlAvailable: true, choose: async () => 'fixture-client',
    onOpenControl: (...args) => { opened.push(args); return pending.promise; } });
  host.fill(); await host.element('robot-grpc-certificate').props.onPress(); host.render();
  const open = host.element('robot-connect').props.onPress;
  const result = open(); await open(); host.render();
  assert.equal(opened.length, 1); assert.equal(host.element('robot-connect'), undefined); assert.equal(host.element('robot-grpc-cancel').props.disabled, false);
  assert.match(host.copy, /取消连接/);
  host.element('robot-grpc-cancel').props.onPress(); host.render();
  assert.equal(opened[0][2].aborted, true);
  pending.resolve(false); await result; host.render();
  assert.match(host.copy, /本次连接检查已取消/);
  assert.doesNotMatch(host.copy, /控制连接未建立/);
  assert.equal(host.element('robot-grpc-cancel'), undefined);
  assert.equal(host.reads.length, 0);
});

test('background and unmount abort control opens; late success never mutates a retired screen', async () => {
  for (const event of ['background', 'unmount']) {
    const pending = deferred(), opened = [];
    const host = mountAdvanced({ controlAvailable: true, choose: async () => 'fixture-client',
      onOpenControl: (...args) => { opened.push(args); return pending.promise; } });
    host.fill(); await host.element('robot-grpc-certificate').props.onPress(); host.render();
    const result = host.element('robot-connect').props.onPress(); host[event]();
    assert.equal(opened[0][2].aborted, true);
    pending.resolve(true); await result; await settle();
    if (event === 'unmount') assert.equal(host.lateUpdates, 0);
    else { host.foreground(); assert.match(host.copy, /连接检查已暂停/); assert.equal(host.element('robot-grpc-cancel'), undefined); }
  }
});

test('invalid control principal cannot dispatch even with a selected certificate', async () => {
  let opened = 0;
  const host = mountAdvanced({ controlAvailable: true, choose: async () => 'fixture-client',
    onOpenControl: async () => { opened++; return true; } });
  host.fill(); await host.element('robot-grpc-certificate').props.onPress(); host.render();
  host.element('robot-control-principal').props.onChangeText('not a principal'); host.render();
  await host.element('robot-connect').props.onPress(); host.render();
  assert.equal(opened, 0); assert.match(host.copy, /控制连接未建立/);
});

test('QA LAN primary action needs only private IP and opens a channel without identity selection or motion', async () => {
  const opened = [];
  let identities = 0;
  const host = mount({ lanAvailable: true, controlAvailable: true,
    choose: async () => { identities++; throw new Error('LAN must not select a certificate'); },
    onOpenControl: async (...args) => { opened.push(args); return true; } });
  host.fill('192.168.42.64');
  assert.ok(host.element('robot-lan-mode'));
  assert.equal(host.element('robot-grpc-certificate'), undefined);
  assert.doesNotMatch(host.copy, /握手|待授权|CSR|生成连接申请/);
  await host.element('robot-connect').props.onPress(); host.render();
  assert.equal(opened.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(opened[0][0])), { host: '192.168.42.64', port: 13145, transport: 'lan-dev' });
  assert.equal(opened[0][1], '', 'native generates the temporary session identity');
  assert.equal(identities, 0); assert.equal(host.reads.length, 0);
  assert.match(host.copy, /连接已建立/);
  host.advanced();
  assert.equal(host.element('robot-control-principal'), undefined);
  host.element('robot-wire-transport').props.onPress(); host.render();
  assert.ok(host.element('robot-grpc-certificate'));
  assert.ok(host.element('robot-control-principal'));
});
