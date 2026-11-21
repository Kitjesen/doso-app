interface Assertions {
  doesNotMatch(actual: string, pattern: RegExp, message?: string): void;
  equal(actual: unknown, expected: unknown, message?: string): void;
  match(actual: string, pattern: RegExp, message?: string): void;
  throws(run: () => unknown, pattern: RegExp, message?: string): void;
}

const assert: Assertions = {
  doesNotMatch(actual, pattern, message) {
    if (pattern.test(actual)) throw new Error(message ?? `expected ${JSON.stringify(actual)} not to match ${pattern}`);
  },
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) throw new Error(message ?? `expected ${String(expected)}, received ${String(actual)}`);
  },
  match(actual, pattern, message) {
    if (!pattern.test(actual)) throw new Error(message ?? `expected ${JSON.stringify(actual)} to match ${pattern}`);
  },
  throws(run, pattern, message) {
    try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
    throw new Error(message ?? `expected ${pattern}`);
  },
};

// @ts-expect-error Node type stripping requires the explicit TypeScript entrypoint.
import { createRobotDiagnosticsGateway, ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS, type RobotDiagnosticsStateDto } from '../src/features/robot-lifecycle/robotDiagnosticsGateway.ts';
import { readFileSync } from 'node:fs';

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void): void => { tests.push({ name, run }); };

let nowMs = 1_800_000_000_000;
const gateway = createRobotDiagnosticsGateway({ nowMs: () => nowMs });

function publishedState(): RobotDiagnosticsStateDto {
  return gateway.publish(gateway.queue(gateway.create('demo')));
}

function executingState(): RobotDiagnosticsStateDto {
  let state = publishedState();
  state = gateway.projectAck(state, { authenticated: true, commandId: state.commandId ?? '', status: 'accepted' });
  return gateway.projectAck(state, { authenticated: true, commandId: state.commandId ?? '', status: 'executing' });
}

function succeededState(receivedAtMs = nowMs): RobotDiagnosticsStateDto {
  const state = executingState();
  return gateway.projectAck(state, {
    authenticated: true,
    commandId: state.commandId ?? '',
    snapshot: { batteryPercent: 82, heartbeatAtMs: receivedAtMs, receivedAtMs, sensorSummary: '正常' },
    status: 'succeeded',
  });
}

test('demo and physical devices are split at the gateway boundary', () => {
  const demo = gateway.create('demo');
  assert.equal(gateway.present(demo).available, true);
  assert.equal(gateway.queue(demo).status, 'queued');
  const physical = gateway.create('physical');
  assert.equal(gateway.present(physical).available, false);
  assert.equal(physical.status, 'hardware_unavailable');
  assert.match(gateway.present(physical).message, /真实设备.*认证 ACK.*硬件健康协议.*生产控制保持锁定/);
  assert.throws(() => gateway.queue(physical), /真实设备诊断必须等待/);
});

test('queued, published, accepted, executing and succeeded remain distinct', () => {
  let state = gateway.queue(gateway.create('demo'));
  assert.equal(state.status, 'queued');
  state = gateway.publish(state);
  assert.equal(state.status, 'published');
  assert.doesNotMatch(gateway.present(state).statusLabel, /完成|成功/, 'publish alone must not present success');
  state = gateway.projectAck(state, { authenticated: true, commandId: state.commandId ?? '', status: 'accepted' });
  assert.equal(state.status, 'accepted');
  state = gateway.projectAck(state, { authenticated: true, commandId: state.commandId ?? '', status: 'executing' });
  assert.equal(state.status, 'executing');
  state = gateway.projectAck(state, {
    authenticated: true,
    commandId: state.commandId ?? '',
    snapshot: { batteryPercent: 82, heartbeatAtMs: nowMs, receivedAtMs: nowMs, sensorSummary: '正常' },
    status: 'succeeded',
  });
  assert.equal(state.status, 'succeeded');
});

test('publish and unauthenticated ACK can never produce completion', () => {
  const published = publishedState();
  const rejected = gateway.projectAck(published, {
    authenticated: false,
    commandId: published.commandId ?? '',
    snapshot: { batteryPercent: 82, heartbeatAtMs: nowMs, receivedAtMs: nowMs, sensorSummary: '正常' },
    status: 'succeeded',
  });
  assert.equal(rejected.status, 'published');
  assert.equal(gateway.present(rejected).snapshot, null);
  assert.equal(rejected.lastError?.code, 'ACK_REJECTED');
});

test('publish and every ACK transition expire at the exact command TTL boundary', () => {
  nowMs = 1_800_000_050_000;
  const queued = gateway.queue(gateway.create('demo'));
  nowMs = queued.expiresAtMs ?? nowMs;
  assert.equal(gateway.publish(queued).status, 'expired');

  nowMs += 1;
  const published = publishedState();
  nowMs = published.expiresAtMs ?? nowMs;
  assert.equal(gateway.projectAck(published, {
    authenticated: true,
    commandId: published.commandId ?? '',
    status: 'accepted',
  }).status, 'expired');

  nowMs += 1;
  let accepted = publishedState();
  accepted = gateway.projectAck(accepted, {
    authenticated: true,
    commandId: accepted.commandId ?? '',
    status: 'accepted',
  });
  nowMs = accepted.expiresAtMs ?? nowMs;
  assert.equal(gateway.projectAck(accepted, {
    authenticated: true,
    commandId: accepted.commandId ?? '',
    status: 'executing',
  }).status, 'expired');

  nowMs += 1;
  const executing = executingState();
  nowMs = executing.expiresAtMs ?? nowMs;
  const lateSuccess = gateway.projectAck(executing, {
    authenticated: true,
    commandId: executing.commandId ?? '',
    snapshot: { batteryPercent: 82, heartbeatAtMs: nowMs, receivedAtMs: nowMs, sensorSummary: '正常' },
    status: 'succeeded',
  });
  assert.equal(lateSuccess.status, 'expired');
  assert.equal(lateSuccess.trustedSnapshot, null);
  assert.equal(gateway.present(lateSuccess).snapshot, null);
});

test('failed, expired, and cancelled have independent terminal presentations', () => {
  let failed = executingState();
  failed = gateway.projectAck(failed, {
    authenticated: true,
    commandId: failed.commandId ?? '',
    failureCode: 'SENSOR_NOT_READY',
    status: 'failed',
  });
  assert.equal(failed.status, 'failed');
  assert.equal(gateway.present(failed).snapshot, null);

  let expiring = publishedState();
  nowMs = expiring.expiresAtMs ?? nowMs;
  expiring = gateway.expire(expiring);
  assert.equal(expiring.status, 'expired');

  nowMs += 1;
  const cancelled = gateway.cancel(gateway.queue(gateway.create('demo')));
  assert.equal(cancelled.status, 'cancelled');
});

test('trusted snapshot is visible through the received-at TTL boundary and cleared after it', () => {
  nowMs = 1_800_000_100_000;
  const receivedAtMs = nowMs;
  const succeeded = succeededState(receivedAtMs);
  let presentation = gateway.present(succeeded);
  assert.equal(presentation.snapshot?.label, '模拟可信遥测');
  assert.equal(presentation.snapshot?.online, true);
  assert.equal(presentation.snapshot?.batteryPercent, 82);

  nowMs = receivedAtMs + ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS;
  presentation = gateway.present(succeeded);
  assert.equal(presentation.snapshot?.online, true, 'snapshot remains fresh at the inclusive TTL boundary');

  nowMs += 1;
  presentation = gateway.present(succeeded);
  assert.equal(presentation.snapshot, null, 'stale battery/sensor/heartbeat/online values must be cleared together');
});

test('serializable state and errors contain no secret-bearing fields', () => {
  const rejected = gateway.projectAck(publishedState(), { authenticated: false, commandId: 'wrong', status: 'accepted' });
  const serialized = JSON.stringify(rejected);
  assert.match(serialized, /^\{.*\}$/);
  assert.doesNotMatch(serialized, /secret|service_role|access_token|refresh_token|password|private_key/i);
});

test('cancelled state cannot be revived by a delayed timer ACK', () => {
  nowMs += 1;
  const executing = executingState();
  const cancelled = gateway.cancel(executing);
  const delayed = gateway.projectAck(cancelled, {
    authenticated: true,
    commandId: cancelled.commandId ?? '',
    snapshot: { batteryPercent: 82, heartbeatAtMs: nowMs, receivedAtMs: nowMs, sensorSummary: '正常' },
    status: 'succeeded',
  });
  assert.equal(delayed.status, 'cancelled');
  assert.equal(delayed.trustedSnapshot, null);
});

test('UI wiring preserves fail-closed production controls and avoids Node simulator imports', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const control = readFileSync(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
  const gatewaySource = readFileSync(new URL('../src/features/robot-lifecycle/robotDiagnosticsGateway.ts', import.meta.url), 'utf8');
  const capabilitySource = readFileSync(new URL('../src/features/robot-lifecycle/robotCapabilityReadiness.ts', import.meta.url), 'utf8');
  const combined = [app, control, gatewaySource, capabilitySource].join('\n');

  assert.match(capabilitySource, /PHYSICAL_ROBOT_CAPABILITY_EVIDENCE = EMPTY_EVIDENCE/);
  assert.match(capabilitySource, /diagnosticsHealth: true/);
  assert.match(capabilitySource, /routeStart: false/);
  assert.match(capabilitySource, /manualControl: false/);
  assert.match(app, /diagnosticsDeviceClass="physical"/);
  assert.match(app, /diagnosticsGateway=\{robotDiagnosticsGateway\}/);
  assert.match(app, /canRecall=\{false\}/);
  assert.match(app, /allowInteractionPreview=\{false\}/);
  assert.doesNotMatch(control, /RobotDiagnosticsPanel|control-brainstem-connection|diagnosticsDeviceClass\}/, 'focused control surface must not render diagnostic chrome');
  assert.match(control, /diagnosticsDeviceClass: RobotDiagnosticsDeviceClass;/, 'legacy caller compatibility is type-only');
  assert.doesNotMatch(combined, /iot[\\/]simulator|node:|crypto|mqtt|service[_-]?role/i);
  assert.doesNotMatch(combined, /commandProtocolReady|canCommand/, 'diagnostics must not share a global production-motion switch');
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`PASS ${item.name}`); }
  catch (error) { console.error(`FAIL ${item.name}`); throw error; }
}
console.log(`\nG008 simulator-only diagnostic UI: ${passed}/${tests.length} passed.`);
