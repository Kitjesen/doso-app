import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { MutableClock, runSimulatedG008Scenario } from '../iot/simulator/index.ts';
import { createRobotDiagnosticsGateway } from '../src/features/robot-lifecycle/robotDiagnosticsGateway.ts';

const STEPS = Object.freeze([
  { script: 'test:robot-protocol', marker: /SIMULATED SUMMARY (\d+)\/\1 PASS, 0 FAIL/ },
  { script: 'test:robot-provisioning', marker: /SIMULATED SUMMARY robot provisioning (\d+)\/\1 PASS/ },
  { script: 'test:g008-command-delivery', marker: /SIMULATED SUMMARY (\d+)\/\1 PASS, 0 FAIL/ },
  { script: 'test:g008-diagnostic-ui', marker: /G008 simulator-only diagnostic UI: (\d+)\/\1 passed\./ },
  { script: 'test:robot-lifecycle-ui', marker: /SIMULATED LIFECYCLE CONTRACTS \+ BLE DISCOVERY CODE PASS — PRODUCT ENTRY \/ GATT AUTH \/ WIFI PROVISIONING BLOCKED/, guard: true },
  { script: 'test:trusted-device-data-ui', marker: /DOSO trusted device-data UI guard PASS — unknown telemetry stays unknown/, guard: true },
]);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the robot simulator gate through npm so npm_execpath is available.');

let focusedAssertions = 0;
for (const { script, marker, guard = false } of STEPS) {
  console.log(`\nROBOT SIMULATOR GATE: npm run ${script}`);
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const match = (result.stdout ?? '').match(marker);
  assert.ok(match, `${script} did not print its required pass marker`);
  if (!guard) focusedAssertions += Number(match[1]);
}

verifyCrossLayerProjection();

console.log(`\nSIMULATED SUMMARY ${focusedAssertions}/${focusedAssertions} FOCUSED ASSERTIONS + 3 UI/CROSS-LAYER GUARDS PASS — NO MQTT / NO HARDWARE / NO PRODUCTION SUPABASE EVIDENCE`);

function verifyCrossLayerProjection() {
  const clock = new MutableClock();
  const scenario = runSimulatedG008Scenario(clock);
  const command = scenario.projections.commands[0];
  const device = scenario.projections.device;
  assert.ok(command, 'canonical G008 scenario must serialize a command projection');
  assert.ok(device, 'canonical G008 scenario must serialize a trusted device projection');

  let nowMs = device.received_at_ms;
  const gateway = createRobotDiagnosticsGateway({ nowMs: () => nowMs });
  let state = gateway.queue(gateway.create('demo'));
  state = {
    ...state,
    commandId: command.envelope.command_id,
    expiresAtMs: command.envelope.expires_at_ms,
  };
  state = gateway.publish(state);

  const verifiedAckKeys = new Set(scenario.projections.ack_events.map(ackEventKey));
  const tampered = structuredClone(scenario.projections.ack_events[0]);
  assert.ok(tampered, 'canonical G008 scenario must serialize verified ACK events');
  tampered.signed_ack.ack.status = 'failed';
  assert.throws(
    () => adaptVerifiedAckEvent(tampered, verifiedAckKeys, command.envelope, device),
    /verified append-only ACK log/,
    'tampered or unverified ACK events must not enter the diagnostics projection',
  );

  for (const event of scenario.projections.ack_events) {
    state = gateway.projectAck(state, adaptVerifiedAckEvent(event, verifiedAckKeys, command.envelope, device));
  }

  assert.equal(gateway.present(state).snapshot?.batteryPercent, device.battery_percent);
  nowMs += 30_001;
  assert.equal(gateway.present(state).snapshot, null, 'stale trusted telemetry must be hidden and cannot remain online');
  console.log('SIMULATED PASS canonical command/device projection maps to diagnostics DTO and stale trusted telemetry is hidden/offline');
}

function adaptVerifiedAckEvent(event, verifiedAckKeys, command, device) {
  assert.ok(verifiedAckKeys.has(ackEventKey(event)), 'event is not present in the verified append-only ACK log');
  const ack = event.signed_ack.ack;
  assert.equal(ack.command_id, command.command_id, 'ACK command binding must match');
  assert.equal(ack.device_id, command.device_id, 'ACK device binding must match');
  assert.equal(ack.idempotency_key, command.idempotency_key, 'ACK idempotency binding must match');
  assert.equal(ack.authorization_epoch, command.authorization_epoch, 'ACK epoch binding must match');
  assert.equal(ack.boot_id, command.expected_state.boot_id, 'ACK boot binding must match');
  assert.equal(device.device_id, command.device_id, 'trusted device projection must match the command device');
  assert.equal(device.authorization_epoch, command.authorization_epoch, 'trusted device projection must match the command epoch');
  assert.equal(device.boot_id, command.expected_state.boot_id, 'trusted device projection must match the command boot');
  assert.ok(['accepted', 'executing', 'succeeded', 'failed'].includes(ack.status), `unsupported diagnostics ACK status ${ack.status}`);

  return {
    authenticated: true,
    commandId: ack.command_id,
    ...(ack.status === 'succeeded'
      ? {
        snapshot: {
          batteryPercent: device.battery_percent,
          heartbeatAtMs: device.received_at_ms,
          receivedAtMs: device.received_at_ms,
          sensorSummary: device.sensor_status === 'ok' ? '正常' : '需检查',
        },
      }
      : {}),
    status: ack.status,
  };
}

function ackEventKey(event) {
  return JSON.stringify(event);
}
