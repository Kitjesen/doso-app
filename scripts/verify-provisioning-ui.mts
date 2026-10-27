// @ts-nocheck -- Executed directly by Node 24 with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  simulatedProvisioningGateway,
  unavailableProvisioningGateway,
  type ProvisioningGatewayEvent,
  type ProvisioningGatewayState,
} from '../src/features/robot-lifecycle/provisioningGateway.ts';

let passed = 0;
function test(name: string, run: () => void) { run(); passed += 1; console.log(`PASS ${name}`); }
function step(state: ProvisioningGatewayState, event: ProvisioningGatewayEvent) {
  return simulatedProvisioningGateway.transition(state, event);
}
function presentation(state: ProvisioningGatewayState) { return simulatedProvisioningGateway.present(state); }
function advanceToWifiForm(scenario = 'success') {
  let state = simulatedProvisioningGateway.create({ scenario });
  state = step(state, { type: 'start' });
  return step(state, { type: 'robot_discovered' });
}
function advanceToConnecting(scenario = 'success') {
  let state = advanceToWifiForm(scenario);
  state = step(state, { type: 'wifi_submitted', ssid: 'DOSO Lab', hasPassword: true });
  state = step(state, { type: 'device_authenticated' });
  return step(state, { type: 'credentials_sent' });
}

test('unavailable real-device gateway ignores the complete simulated event vocabulary', () => {
  const blocked = unavailableProvisioningGateway.create({ scenario: 'success' });
  const events: ProvisioningGatewayEvent[] = [
    { type: 'start' }, { type: 'robot_discovered' },
    { type: 'wifi_submitted', ssid: 'MustNotPersist', hasPassword: true },
    { type: 'device_authenticated' }, { type: 'credentials_sent' },
    { type: 'advance_scenario' }, { type: 'resume_connection' },
    { type: 'network_connected' }, { type: 'cloud_confirmed' },
    { type: 'cancel' }, { type: 'expire' },
  ];
  for (const event of events) assert.strictEqual(unavailableProvisioningGateway.transition(blocked, event), blocked);
  assert.equal(blocked.domain, null);
  assert.deepEqual(unavailableProvisioningGateway.present(blocked), {
    available: false,
    availabilityMessage: '硬件连接尚未开放',
    phase: 'ready',
    maskedNetworkName: null,
    connectionInterrupted: false,
    connectionRecovered: false,
    credentialsSubmitted: false,
    resultMessage: null,
  });

  const simulatedState = simulatedProvisioningGateway.create({ scenario: 'success' });
  assert.equal(unavailableProvisioningGateway.present(simulatedState).available, false);
  const fenced = unavailableProvisioningGateway.transition(simulatedState, { type: 'start' });
  assert.equal(unavailableProvisioningGateway.present(fenced).available, false);
  assert.equal(fenced.domain, null);
});

test('success preserves domain phase order and does not succeed while writing credentials', () => {
  let state = simulatedProvisioningGateway.create();
  const phases = [presentation(state).phase];
  for (const event of [
    { type: 'start' }, { type: 'robot_discovered' },
    { type: 'wifi_submitted', ssid: 'DOSO Lab', hasPassword: true },
    { type: 'device_authenticated' }, { type: 'credentials_sent' },
    { type: 'network_connected' }, { type: 'cloud_confirmed' },
  ] as ProvisioningGatewayEvent[]) {
    state = step(state, event);
    phases.push(presentation(state).phase);
  }
  assert.deepEqual(phases, [
    'ready', 'discovering', 'wifi_form', 'authenticating', 'secure_channel_ready',
    'connecting', 'awaiting_confirmation', 'succeeded',
  ]);
  assert.equal(presentation(state).resultMessage, '模拟配网完成');
});

test('credential write effect is consumed once and replay is rejected by the domain reducer', () => {
  let state = advanceToWifiForm();
  state = step(state, { type: 'wifi_submitted', ssid: 'Office', hasPassword: true });
  assert.equal(state.domain?.phase, 'authenticating');
  assert.equal(state.domain?.credentials_written, false);
  state = step(state, { type: 'device_authenticated' });
  assert.equal(state.domain?.phase, 'secure_channel_ready');
  assert.equal(state.domain?.credentials_written, false);
  state = step(state, { type: 'credentials_sent' });
  assert.equal(state.domain?.phase, 'connecting');
  assert.equal(state.domain?.credentials_written, true);
  assert.equal(presentation(state).credentialsSubmitted, true);
  assert.throws(() => step(state, { type: 'credentials_sent' }), /secure channel|replayed|out of order/i);
  const source = readFileSync(new URL('../src/features/robot-lifecycle/provisioningGateway.ts', import.meta.url), 'utf8');
  assert.match(source, /write_credentials_once/);
});

test('password and raw SSID never enter gateway, presentation, or domain state', () => {
  let state = advanceToWifiForm();
  const rawSsid = 'PrivateNetwork';
  const secretPassword = 'Correct-Horse-Battery-Staple';
  state = step(state, { type: 'wifi_submitted', ssid: rawSsid, hasPassword: secretPassword.length > 0 });
  const serialized = JSON.stringify({ state, presentation: presentation(state) });
  assert.equal(serialized.includes(rawSsid), false);
  assert.equal(serialized.includes(secretPassword), false);
  assert.equal(serialized.toLowerCase().includes('password'), false);
  assert.equal(state.maskedNetworkName, 'Pr••••••••••rk');
  assert.equal(presentation(state).maskedNetworkName, 'Pr••••••••••rk');
});

test('Wi-Fi authentication failure preserves safe domain failure and terminal behavior', () => {
  let state = advanceToConnecting('wifi_password_error');
  state = step(state, { type: 'advance_scenario' });
  assert.equal(state.domain?.phase, 'failed');
  assert.equal(state.domain?.failure?.code, 'wifi_authentication_failed');
  assert.match(state.domain?.failure?.safe_message ?? '', /Wi-Fi/i);
  assert.match(presentation(state).resultMessage ?? '', /Wi-Fi 密码/);
  assert.throws(() => step(state, { type: 'cloud_confirmed' }), /terminal/);
});

test('connection interruption remains connecting then recovers with monotonic report sequence', () => {
  let state = advanceToConnecting('connection_interruption');
  state = step(state, { type: 'advance_scenario' });
  assert.equal(state.domain?.phase, 'connecting');
  assert.equal(state.domain?.device_event_sequence, 1);
  assert.equal(presentation(state).connectionInterrupted, true);
  assert.throws(() => step(state, { type: 'network_connected' }), /resumed first/);
  state = step(state, { type: 'resume_connection' });
  assert.equal(presentation(state).connectionInterrupted, false);
  assert.equal(presentation(state).connectionRecovered, true);
  state = step(state, { type: 'network_connected' });
  assert.equal(state.domain?.phase, 'awaiting_confirmation');
  assert.equal(state.domain?.device_event_sequence, 2);
});

test('expiry works in preflight, domain, and session-expired scenario', () => {
  const preflightExpired = step(simulatedProvisioningGateway.create(), { type: 'expire' });
  assert.equal(presentation(preflightExpired).phase, 'expired');
  assert.equal(preflightExpired.domain, null);
  let domainExpired = advanceToWifiForm();
  domainExpired = step(domainExpired, { type: 'wifi_submitted', ssid: 'Office', hasPassword: true });
  domainExpired = step(domainExpired, { type: 'expire' });
  assert.equal(domainExpired.domain?.phase, 'expired');
  let scenarioExpired = advanceToConnecting('session_expired');
  scenarioExpired = step(scenarioExpired, { type: 'advance_scenario' });
  assert.equal(scenarioExpired.domain?.phase, 'expired');
  assert.match(presentation(scenarioExpired).resultMessage ?? '', /会话已过期/);
});

test('cancellation guidance differs before and after the one-time credential effect', () => {
  let discovering = step(simulatedProvisioningGateway.create(), { type: 'start' });
  discovering = step(discovering, { type: 'cancel' });
  assert.equal(presentation(discovering).phase, 'cancelled');
  assert.equal(discovering.domain, null);
  assert.equal(presentation(discovering).resultMessage, '模拟配网已取消，未发送真实 Wi-Fi 密码。');
  let authenticating = advanceToWifiForm();
  authenticating = step(authenticating, { type: 'wifi_submitted', ssid: 'Office', hasPassword: true });
  authenticating = step(authenticating, { type: 'cancel' });
  assert.equal(authenticating.domain?.phase, 'cancelled');
  assert.equal(authenticating.domain?.credentials_written, false);
  assert.equal(presentation(authenticating).resultMessage, '模拟配网已取消，未发送真实 Wi-Fi 密码。');
  let connecting = advanceToConnecting();
  connecting = step(connecting, { type: 'cancel' });
  assert.equal(connecting.domain?.phase, 'cancelled');
  assert.equal(connecting.domain?.credentials_written, true);
  assert.match(presentation(connecting).resultMessage ?? '', /真机流程在此阶段可能仍在尝试联网/);
});

test('not-found, identity failure, and ownership invalidation are distinct terminal results', () => {
  let notFound = step(simulatedProvisioningGateway.create({ scenario: 'device_not_found' }), { type: 'start' });
  notFound = step(notFound, { type: 'robot_discovered' });
  assert.equal(presentation(notFound).phase, 'failed');
  assert.equal(notFound.domain, null);
  assert.match(presentation(notFound).resultMessage ?? '', /没有找到/);
  let identityFailed = advanceToWifiForm('identity_verification_failed');
  identityFailed = step(identityFailed, { type: 'wifi_submitted', ssid: 'Office', hasPassword: true });
  identityFailed = step(identityFailed, { type: 'device_authenticated' });
  assert.equal(identityFailed.domain?.phase, 'failed');
  assert.match(presentation(identityFailed).resultMessage ?? '', /身份/);
  let invalidated = advanceToWifiForm('ownership_invalidated');
  invalidated = step(invalidated, { type: 'wifi_submitted', ssid: 'Office', hasPassword: true });
  invalidated = step(invalidated, { type: 'device_authenticated' });
  assert.equal(invalidated.domain?.phase, 'invalidated');
  assert.match(presentation(invalidated).resultMessage ?? '', /不属于当前账户/);
});

test('screen statically guards gateway injection, credentials, timers, and stale transitions', () => {
  const source = readFileSync(new URL('../src/screens/ProvisioningScreen.tsx', import.meta.url), 'utf8');
  for (const contract of [
    /gateway: ProvisioningGateway/, /gateway\.create/, /gateway\.transition/, /gateway\.present/,
    /secureTextEntry/, /setPassword\(''\)/, /clearTimeout/,
    /AppState\.addEventListener\('change'/,
    /if \(!appActive\) return/,
    /const leaveScreen = \(\) => \{[\s\S]*setSsid\(''\)[\s\S]*setPassword\(''\)[\s\S]*onBack\(\)/,
    /if \(active\) return;[\s\S]*setSsid\(''\)[\s\S]*setPassword\(''\)/,
    /expectedPhase && currentPhase !== expectedPhase/,
    /useEffect\(\(\) => \{[\s\S]*?setFlow\(gateway\.create\(\{ scenario \}\)\)[\s\S]*?\}, \[gateway\]\)/,
    /不会连接蓝牙/, /不会发送真实 Wi-Fi 密码/,
  ]) assert.match(source, contract);
  assert.doesNotMatch(source, /provisioningDemo|reduceProvisioning\(|node:crypto|iot\/simulator/);
});

test('screen exposes every scenario and non-color-only radio semantics', () => {
  const source = readFileSync(new URL('../src/screens/ProvisioningScreen.tsx', import.meta.url), 'utf8');
  for (const scenario of [
    'success', 'device_not_found', 'identity_verification_failed', 'ownership_invalidated',
    'wifi_password_error', 'connection_interruption', 'session_expired',
  ]) assert.match(source, new RegExp(`value: '${scenario}'`));
  for (const contract of [
    /accessibilityRole="radio"/, /accessibilityState=\{\{ selected:/, /已选择/,
    /accessibilityRole="progressbar"/, /accessibilityValue=/,
    /真机阶段，机器人可能仍在尝试联网/,
  ]) assert.match(source, contract);
});

console.log(`Provisioning gateway + UI verification passed: ${passed}/11`);
