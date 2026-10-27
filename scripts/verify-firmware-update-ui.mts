interface Assertions {
  deepEqual(actual: unknown, expected: unknown): void;
  equal(actual: unknown, expected: unknown): void;
  match(actual: string, pattern: RegExp): void;
  throws(run: () => unknown, pattern: RegExp): void;
}

const assert: Assertions = {
  deepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  },
  equal(actual, expected) {
    if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`);
  },
  match(actual, pattern) {
    if (!pattern.test(actual)) throw new Error(`expected ${JSON.stringify(actual)} to match ${pattern}`);
  },
  throws(run, pattern) {
    try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
    throw new Error(`expected ${pattern}`);
  },
};

// @ts-expect-error Node type stripping requires the explicit TypeScript entrypoint.
import { FIRMWARE_PHASE_LABELS, simulatedFirmwareUpdateGateway, unavailableFirmwareUpdateGateway, type FirmwareOutcome, type FirmwareUpdateGatewayState } from '../src/features/robot-lifecycle/firmwareUpdateGateway.ts';
import { readFileSync } from 'node:fs';

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void): void => { tests.push({ name, run }); };
const expectedPhases = ['scheduled', 'downloading', 'verifying', 'installing', 'rebooting', 'health_checking', 'succeeded'];

function advanceToTerminal(scenario: FirmwareOutcome): { phases: string[]; state: FirmwareUpdateGatewayState } {
  let state = simulatedFirmwareUpdateGateway.start(simulatedFirmwareUpdateGateway.create({ scenario }));
  const phases: string[] = [state.domain?.phase ?? 'missing'];
  for (let step = 0; step < 20 && simulatedFirmwareUpdateGateway.present(state).status === 'running'; step += 1) {
    state = simulatedFirmwareUpdateGateway.advance(state);
    phases.push(state.domain?.phase ?? 'missing');
  }
  return { phases: phases.filter((phase, index) => index === 0 || phase !== phases[index - 1]), state };
}

test('gateway eligibility requires online, battery >= 40%, and no running task', () => {
  const eligible = simulatedFirmwareUpdateGateway.present(simulatedFirmwareUpdateGateway.create({ batteryPercent: 40, online: true, taskRunning: false }));
  assert.equal(eligible.eligibility.eligible, true);
  assert.equal(eligible.currentVersion, '0.0.1');
  assert.equal(eligible.targetVersion, '0.0.2');
  const cases = [
    { options: { online: false }, key: 'online', action: /连接机器人/ },
    { options: { batteryPercent: 39 }, key: 'battery', action: /充电.*40%/ },
    { options: { taskRunning: true }, key: 'idle', action: /停止.*任务/ },
  ] as const;
  for (const item of cases) {
    const state = simulatedFirmwareUpdateGateway.create(item.options);
    const view = simulatedFirmwareUpdateGateway.present(state);
    assert.equal(view.eligibility.eligible, false);
    assert.match(view.eligibility.checks.find((check) => check.key === item.key)?.action ?? '', item.action);
    assert.throws(() => simulatedFirmwareUpdateGateway.start(state), /尚未满足更新资格/);
  }
});

test('gateway traverses the domain OTA phases in order with Chinese labels', () => {
  let state = simulatedFirmwareUpdateGateway.start(simulatedFirmwareUpdateGateway.create());
  const phases: string[] = [];
  for (let step = 0; step < 20; step += 1) {
    const view = simulatedFirmwareUpdateGateway.present(state);
    if (view.phase) phases.push(view.phase);
    if (view.status !== 'running') break;
    state = simulatedFirmwareUpdateGateway.advance(state);
  }
  const uniquePhases = phases.filter((phase, index) => index === 0 || phase !== phases[index - 1]);
  assert.deepEqual(uniquePhases, expectedPhases);
  for (const phase of expectedPhases) assert.match(FIRMWARE_PHASE_LABELS[phase as keyof typeof FIRMWARE_PHASE_LABELS], /[\u4e00-\u9fff]/);
});

test('gateway reports deterministic 25/50/75/100 download progress before verification', () => {
  let state = simulatedFirmwareUpdateGateway.start(simulatedFirmwareUpdateGateway.create());
  const percentages: Array<number | null> = [];
  while (simulatedFirmwareUpdateGateway.present(state).phase !== 'verifying') {
    state = simulatedFirmwareUpdateGateway.advance(state);
    const view = simulatedFirmwareUpdateGateway.present(state);
    if (view.phase === 'downloading') percentages.push(view.progress.percent);
  }
  assert.deepEqual(percentages, [25, 50, 75, 100]);
  assert.equal(simulatedFirmwareUpdateGateway.present(state).progress.percent, null);
});

test('gateway cancellation is allowed only while scheduled or downloading', () => {
  const scheduled = simulatedFirmwareUpdateGateway.start(simulatedFirmwareUpdateGateway.create());
  assert.equal(simulatedFirmwareUpdateGateway.present(simulatedFirmwareUpdateGateway.cancel(scheduled)).status, 'cancelled');
  const downloading = simulatedFirmwareUpdateGateway.advance(simulatedFirmwareUpdateGateway.start(simulatedFirmwareUpdateGateway.create()));
  assert.equal(simulatedFirmwareUpdateGateway.present(simulatedFirmwareUpdateGateway.cancel(downloading)).status, 'cancelled');
  let verifying = downloading;
  while (simulatedFirmwareUpdateGateway.present(verifying).phase !== 'verifying') verifying = simulatedFirmwareUpdateGateway.advance(verifying);
  assert.throws(() => simulatedFirmwareUpdateGateway.cancel(verifying), /only scheduled or downloading/);
});

test('gateway exposes success, automatic rollback, and manual recovery outcomes', () => {
  for (const outcome of ['succeeded', 'rolled_back', 'recovery_required'] as const) {
    const result = advanceToTerminal(outcome);
    const view = simulatedFirmwareUpdateGateway.present(result.state);
    assert.equal(view.status, outcome);
    assert.equal(view.phase, outcome);
    if (outcome === 'rolled_back') assert.match(view.message, /自动回滚.*0\.0\.1/);
    if (outcome !== 'succeeded') {
      assert.match(result.phases.join(' > '), /health_checking > rollback_pending > rolling_back > (rolled_back|recovery_required)/);
    }
    if (outcome === 'recovery_required') {
      assert.match(view.message, /停止使用机器人.*联系 DOSO 支持/);
      assert.match(view.diagnosticCode ?? '', /^DOSO-OTA-[•*]{4}-[A-Z0-9]{4}$/);
      assert.equal(view.currentVersion, '未知（恢复失败）');
    }
  }
});

test('unavailable gateway cannot enter the simulated success path', () => {
  const state = unavailableFirmwareUpdateGateway.create({ scenario: 'succeeded' });
  const view = unavailableFirmwareUpdateGateway.present(state);
  assert.equal(view.status, 'hardware_unavailable');
  assert.equal(view.phase, null);
  assert.match(view.message, /硬件连接尚未开放/);
  assert.throws(() => unavailableFirmwareUpdateGateway.start(state), /硬件连接尚未开放/);
  const simulatedState = simulatedFirmwareUpdateGateway.create({ scenario: 'succeeded' });
  assert.equal(unavailableFirmwareUpdateGateway.present(simulatedState).status, 'hardware_unavailable');
  assert.throws(() => unavailableFirmwareUpdateGateway.start(simulatedState), /硬件连接尚未开放/);
});

test('screen uses the gateway, cleans timers, and keeps power-loss and radio accessibility guards', () => {
  const source = readFileSync(new URL('../src/screens/FirmwareUpdateScreen.tsx', import.meta.url), 'utf8');
  for (const contract of [
    /type FirmwareUpdateGateway/,
    /gateway\.create\(/,
    /gateway\.present\(/,
    /gateway\.start\(/,
    /gateway\.advance\(/,
    /gateway\.cancel\(/,
    /const chooseOutcome =[\s\S]*?setState\(gateway\.create/,
    /setTimeout\(/,
    /clearTimeout\(/,
    /AppState\.addEventListener\('change'/,
    /if \(!appActive \|\| presentation\.status !== 'running'\) return undefined/,
    /if \(!gatewayChanged\) \{[\s\S]*currentView\.status === 'running'[\s\S]*return current/,
    /请勿关闭机器人电源/,
    /accessibilityRole="radio"/,
    /accessibilityState=\{\{ selected: outcome === item\.value \}\}/,
    /已选择/,
    /accessibilityRole="progressbar"/,
  ]) assert.match(source, contract);
  if (/firmwareUpdateDemo|node:crypto|iot\/simulator/.test(source)) {
    throw new Error('Firmware update screen must use the gateway and avoid deprecated or Node-only simulators');
  }
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`PASS ${item.name}`); }
  catch (error) { console.error(`FAIL ${item.name}`); throw error; }
}
console.log(`\nFirmware update gateway + UI contract: ${passed}/${tests.length} passed.`);
