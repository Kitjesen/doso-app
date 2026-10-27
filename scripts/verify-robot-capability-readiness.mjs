import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createRobotCapabilityReadiness,
  PHYSICAL_ROBOT_CAPABILITY_EVIDENCE,
  ROBOT_CAPABILITIES,
  ROBOT_CAPABILITY_UNAVAILABLE_REASONS,
} from '../src/features/robot-lifecycle/robotCapabilityReadiness.ts';

let passed = 0;
const verify = (label, assertion) => {
  assertion();
  passed += 1;
  console.log(`PASS ${label}`);
};

const demo = createRobotCapabilityReadiness({
  connected: false,
  deviceClass: 'demo',
  hasDevice: false,
  safetyLock: true,
});

verify('capability registry is explicit and complete', () => {
  assert.deepEqual(ROBOT_CAPABILITIES, [
    'diagnosticsHealth', 'provisioning', 'ota', 'routeStart', 'taskStart', 'recall', 'manualControl',
  ]);
});
verify('demo diagnostics works independently', () => assert.equal(demo.diagnosticsHealth.available, true));
verify('demo diagnostics does not unlock provisioning or OTA', () => {
  assert.equal(demo.provisioning.available, false);
  assert.equal(demo.ota.available, false);
});
verify('demo diagnostics does not unlock any motion capability', () => {
  for (const capability of ['routeStart', 'taskStart', 'recall', 'manualControl']) {
    assert.equal(demo[capability].available, false, capability);
  }
});
verify('demo evidence injection cannot unlock any capability except diagnostics', () => {
  for (const injectedCapability of ROBOT_CAPABILITIES) {
    const readiness = createRobotCapabilityReadiness({
      connected: true,
      deviceClass: 'demo',
      evidence: Object.fromEntries(ROBOT_CAPABILITIES.map((capability) => [capability, true])),
      hasDevice: true,
      safetyLock: false,
    });
    assert.equal(readiness.diagnosticsHealth.available, true, injectedCapability);
    for (const capability of ROBOT_CAPABILITIES.filter((candidate) => candidate !== 'diagnosticsHealth')) {
      assert.equal(readiness[capability].available, false, `${injectedCapability} must not unlock ${capability}`);
    }
  }
});
verify('physical capability evidence defaults entirely false', () => {
  assert.deepEqual(Object.values(PHYSICAL_ROBOT_CAPABILITY_EVIDENCE), Array(ROBOT_CAPABILITIES.length).fill(false));
});
verify('missing capability evidence wins over connection and safety checks', () => {
  const physical = createRobotCapabilityReadiness({ connected: false, deviceClass: 'physical', hasDevice: true, safetyLock: true });
  assert.equal(physical.routeStart.reason, ROBOT_CAPABILITY_UNAVAILABLE_REASONS.routeStart);
  assert.equal(physical.manualControl.reason, ROBOT_CAPABILITY_UNAVAILABLE_REASONS.manualControl);
});
verify('trusted route evidence then applies device binding', () => {
  const gate = createRobotCapabilityReadiness({ connected: true, deviceClass: 'physical', evidence: { routeStart: true }, hasDevice: false, safetyLock: false });
  assert.match(gate.routeStart.reason ?? '', /尚未绑定设备/);
});
verify('trusted task evidence then applies connection state', () => {
  const gate = createRobotCapabilityReadiness({ connected: false, deviceClass: 'physical', evidence: { taskStart: true }, hasDevice: true, safetyLock: false });
  assert.match(gate.taskStart.reason ?? '', /未连接/);
});
verify('trusted recall evidence then applies safety lock', () => {
  const gate = createRobotCapabilityReadiness({ connected: true, deviceClass: 'physical', evidence: { recall: true }, hasDevice: true, safetyLock: true });
  assert.match(gate.recall.reason ?? '', /安全锁/);
});
verify('one trusted motion capability cannot unlock another', () => {
  const gate = createRobotCapabilityReadiness({ connected: true, deviceClass: 'physical', evidence: { routeStart: true }, hasDevice: true, safetyLock: false });
  assert.equal(gate.routeStart.available, true);
  assert.equal(gate.taskStart.available, false);
  assert.equal(gate.manualControl.available, false);
});
verify('physical evidence enables only the injected capability', () => {
  for (const injectedCapability of ROBOT_CAPABILITIES) {
    const readiness = createRobotCapabilityReadiness({
      connected: true,
      deviceClass: 'physical',
      evidence: { [injectedCapability]: true },
      hasDevice: true,
      safetyLock: false,
    });
    for (const capability of ROBOT_CAPABILITIES) {
      assert.equal(readiness[capability].available, capability === injectedCapability, `${injectedCapability} -> ${capability}`);
    }
  }
});
verify('capabilities retain distinct unavailable reasons', () => {
  assert.equal(new Set(Object.values(ROBOT_CAPABILITY_UNAVAILABLE_REASONS)).size, ROBOT_CAPABILITIES.length);
});

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../src/screens/HomeScreen.tsx', import.meta.url), 'utf8');
const mapSource = readFileSync(new URL('../src/screens/MapScreen.tsx', import.meta.url), 'utf8');
const tasksSource = readFileSync(new URL('../src/screens/TasksScreen.tsx', import.meta.url), 'utf8');
const controlSource = readFileSync(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
const modelSelectSource = readFileSync(new URL('../src/screens/ModelSelectScreen.tsx', import.meta.url), 'utf8');

verify('App and command screens contain no global command boolean', () => {
  for (const source of [appSource, homeSource, mapSource, tasksSource, controlSource]) {
    assert.doesNotMatch(source, /commandProtocolReady|canCommand/);
  }
});
verify('App wires route, task, recall and manual gates independently', () => {
  assert.match(appSource, /robotCapabilityReadiness\.routeStart\.available/);
  assert.match(appSource, /robotCapabilityReadiness\.taskStart\.available/);
  assert.match(appSource, /robotCapabilityReadiness\.recall\.available/);
  assert.match(appSource, /robotCapabilityReadiness\.manualControl\.available/);
  assert.match(appSource, /runCommand\('routeStart'/);
  assert.match(appSource, /runCommand\('taskStart'/);
  assert.match(appSource, /runCommand\('recall'/);
});
verify('production command executor seam stays null and never uses simulator or diagnostics transport', () => {
  assert.match(appSource, /PRODUCTION_ROBOT_COMMAND_EXECUTOR[^=]*= null/);
  assert.match(appSource, /createRobotCommandCoordinator/);
  assert.match(appSource, /executor:\s*PRODUCTION_ROBOT_COMMAND_EXECUTOR/);
  assert.doesNotMatch(appSource, /executor:\s*robotDiagnosticsGateway/);
  assert.doesNotMatch(appSource, /from ['"][^'"]*iot\/simulator/);
});
verify('motion UI combines independent capability, executor support, and pending gates', () => {
  assert.match(appSource, /routeControlAvailable\s*=\s*robotCapabilityReadiness\.routeStart\.available\s*&&\s*!pendingCommands\.routeStart/);
  assert.match(appSource, /routeExecutorAvailable\s*=\s*executorSupportsCapability\('routeStart'\)/);
  assert.match(appSource, /routeCommandAvailable\s*=\s*routeControlAvailable\s*&&\s*routeExecutorAvailable/);
  assert.match(appSource, /taskControlAvailable\s*=\s*robotCapabilityReadiness\.taskStart\.available\s*&&\s*!pendingCommands\.taskStart/);
  assert.match(appSource, /taskExecutorAvailable\s*=\s*executorSupportsCapability\('taskStart'\)/);
  assert.match(appSource, /taskCommandAvailable\s*=\s*taskControlAvailable\s*&&\s*taskExecutorAvailable/);
  assert.match(appSource, /recallCommandAvailable\s*=\s*robotCapabilityReadiness\.recall\.available\s*&&\s*executorSupportsCapability\('recall'\)\s*&&\s*!pendingCommands\.recall/);
  assert.match(appSource, /controlAvailable=\{routeControlAvailable\}/);
  assert.match(appSource, /executorAvailable=\{routeExecutorAvailable\}/);
  assert.match(appSource, /controlAvailable=\{taskControlAvailable\}/);
  assert.match(appSource, /executorAvailable=\{taskExecutorAvailable\}/);
  assert.match(appSource, /canRecall=\{recallCommandAvailable\}/);
});
verify('command dispatch reads current refs, carries payloads, and treats only succeeded as success', () => {
  assert.match(appSource, /readPermission:\s*\(capability\)\s*=>\s*commandPermissionRef\.current\(capability\)/);
  assert.match(appSource, /const currentDevice = commandDeviceRef\.current/);
  assert.match(appSource, /authorityEpoch:\s*commandAuthorityRef\.current/);
  assert.match(appSource, /isRecentDeviceStatus\(currentDevice\.last_seen_at\)/);
  assert.match(appSource, /safetyLock:\s*currentDevice\?\.safety_lock \?\? true/);
  assert.match(appSource, /deadlineMs:\s*Date\.now\(\)\s*\+\s*ROBOT_COMMAND_DEADLINE_MS/);
  assert.match(appSource, /commandId:\s*createCommandId\(capability\)/);
  assert.match(appSource, /status === 'submitting' \|\| state\.status === 'accepted' \|\| state\.status === 'executing'/);
  assert.match(appSource, /state\.status === 'succeeded'/);
  assert.match(appSource, /robotCommandCoordinator\.cancelAll\('command authority changed'\)/);
  assert.match(appSource, /return \(\) => robotCommandCoordinator\.cancelAll\('command context disposed'\)/);
  assert.match(appSource, /机器人尚未确认受理/);
  assert.doesNotMatch(appSource, /notify\(`\$\{label\}未完成`,\s*state\.reason/);
  assert.match(appSource, /runCommand\('routeStart',\s*'路线指令',\s*\{ routeId \}\)/);
  assert.match(appSource, /runCommand\('taskStart',\s*'任务指令',\s*\{ taskId \}\)/);
  assert.doesNotMatch(appSource, /runCommand\('taskStart',[\s\S]*?\{ taskName \}\)/);
  assert.match(appSource, /runCommand\('recall',\s*'召回指令',\s*\{ mode: 'return-home' \}\)/);
});
verify('Control keeps legacy capability props but cannot translate them into motion', () => {
  assert.match(appSource, /canUseManualControl=\{manualCommandAvailable\}/);
  assert.match(appSource, /canUseRouteMode=\{routeCommandAvailable\}/);
  assert.match(appSource, /canUseTaskMode=\{taskCommandAvailable\}/);
  assert.match(controlSource, /canUseManualControl: boolean;/);
  assert.match(controlSource, /canUseRouteMode: boolean;/);
  assert.match(controlSource, /canUseTaskMode: boolean;/);
  assert.match(controlSource, /export function ControlScreen\(\{ allowInteractionPreview = false, developmentInput, onBack \}: Props\)/);
  assert.match(controlSource, /previewControlsEnabled = __DEV__ && allowInteractionPreview && appActive && !leaving/);
  assert.doesNotMatch(controlSource, /modeGates|sendCommand|acquireControl|enableMotor|dispatchRobot|fetch\(|\.rpc\(/);
});
verify('Provisioning and OTA product details remain reachable while execution stays capability-gated', () => {
  assert.match(appSource, /canOpenProvisioning=\{robotCapabilityReadiness\.provisioning\.available\}/);
  assert.match(appSource, /canOpenFirmwareUpdate=\{robotCapabilityReadiness\.ota\.available\}/);
  assert.match(appSource, /onOpenProvisioning=\{\(\) => setStage\('provisioning'\)\}/);
  assert.match(appSource, /onOpenFirmwareUpdate=\{\(\) => setStage\('firmware-update'\)\}/);
  assert.doesNotMatch(appSource, /simulatedProvisioningGateway|simulatedFirmwareUpdateGateway|<ProvisioningScreen|<FirmwareUpdateScreen/);
  assert.doesNotMatch(profileSource, /disabled=\{!canOpenProvisioning\}/);
  assert.doesNotMatch(profileSource, /disabled=\{!canOpenFirmwareUpdate\}/);
  assert.match(profileSource, /provisioningBlockedReason \?\? '真实配网尚未接入'/);
  assert.match(profileSource, /firmwareUpdateBlockedReason \?\? '生产固件更新尚未接入'/);
  assert.match(profileSource, /accessibilityState=\{\{ disabled \}\}/);
});
verify('BLE discovery is a separate non-mutating diagnostic entry, not a release capability unlock', () => {
  assert.match(appSource, /onOpenBleDiscovery=\{\(\) => setStage\('ble-discovery'\)\}/);
  assert.doesNotMatch(appSource, /onOpenBleDiscovery=\{[^\n]*robotCapabilityReadiness/);
  assert.match(profileSource, /title="附近 BLE 设备"/);
  assert.match(profileSource, /只扫描广播 · 不连接、不绑定、不配网/);
  assert.doesNotMatch(profileSource, /disabled=\{!canOpenProvisioning\}/);
  assert.doesNotMatch(profileSource, /disabled=\{!canOpenFirmwareUpdate\}/);
});
verify('recall is truly disabled with an accessibility reason', () => {
  assert.match(homeSource, /accessibilityHint=\{canRecall \? '返回基站' : recallBlockedReason \?\? '需要设备连接和控制权限'\}/);
  assert.match(homeSource, /accessibilityState=\{\{ disabled: !canRecall \}\}/);
  assert.match(homeSource, /disabled=\{!canRecall\}/);
  assert.match(homeSource, /onPress=\{onOpenControl\}/, 'opening control never dispatches a command');
  assert.match(homeSource, /if \(canRecall\) onRecall\(\)/);
});
verify('preview-only product entry points are labelled before navigation', () => {
  assert.match(homeSource, />控制中心</);
  assert.match(homeSource, /实际操作需连接设备并获得控制权限/);
  assert.match(homeSource, /title: '巡航模板',[^\n]*onPress: onOpenRoutes/);
  assert.match(homeSource, /title: '任务模板',[^\n]*onPress: onOpenTasks/);
  assert.match(homeSource, /accessibilityLabel=\{item.title\}/);
});
verify('safety lock is read-only until a physical actuator is integrated', () => {
  assert.match(profileSource, /safetyLock: boolean \| null;/);
  assert.match(profileSource, /safetyLock == null[\s\S]*?connected \? '待同步' : '未连接'/);
  assert.match(profileSource, /statusLabel=\{safetyLockStatus\.label\}/);
  assert.doesNotMatch(profileSource, /onToggleSafety|value=\{safetyLock\}/);
  assert.match(appSource, /const trustedSafetyLock = readTrustedSafetyLock\(device\);[\s\S]*?const safetyLock = trustedSafetyLock \?\? true;/);
  assert.match(appSource, /createRobotCapabilityReadiness\(\{[\s\S]*?safetyLock,[\s\S]*?\}\)/);
});
verify('model selection promises preview rather than physical configuration or saving', () => {
  assert.match(modelSelectSource, /进入控制中心预览；不会配置或保存真实设备/);
  assert.match(modelSelectSource, /busy \? '正在进入预览…' : '进入预览'/);
});

console.log(`ROBOT CAPABILITY READINESS ${passed}/${passed} PASS — DIAGNOSTICS SIMULATOR DOES NOT UNLOCK PHYSICAL MOTION`);
