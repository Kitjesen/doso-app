import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { beginRobotRecovery, presentRobotRecovery, projectRobotRecoveryStatus, recoveryNeedsEnable, ROBOT_RECOVERY_CONFIRMATION } from '../src/features/control/robotRecovery.ts';

const capability = { id: 'recovery', kind: 'recovery-action', label: '摔倒恢复', available: true, unavailableReason: '' };
const profile = { current: 'flat', available: ['flat'], descriptions: [''], currentDescription: '', modeCapabilities: [capability], activeModeId: 'locomotion' };
const standing = { posture: 'standing', motorState: 'enabled', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };

function status(patch) {
  return {
    service: 'ready', phase: 'absent', sessionSelected: false, modelConfigured: true, enableSequenceVerified: true,
    stableStand: false, locomotionAvailable: false, activeModeId: null, reason: 'none', detail: '', heartbeatFresh: null, heartbeatError: null, ...patch
  };
}

test('recovery status keeps only the fields the proto returned', () => {
  const projected = projectRobotRecoveryStatus({
    phase: 'selected', sessionSelected: true, modelConfigured: false, enableSequenceVerified: false,
    stableStand: false, locomotionAvailable: false, activeModeId: '', reason: 'model-not-configured', detail: '',
  });
  assert.equal(projected.modelConfigured, false);
  assert.equal(projected.linearAcceleration, undefined);
  assert.equal(projectRobotRecoveryStatus({ phase: 'nope' }), null);
});

test('the one-tap action stays closed while walking or when the service and model are not ready', () => {
  const missing = presentRobotRecovery({ status: { ...status(), service: 'missing' }, profile, runtimeState: standing });
  assert.equal(missing.actions.begin.enabled, false);
  assert.match(missing.reason, /尚未提供摔倒恢复/);
  const unconfigured = presentRobotRecovery({ status: status({ modelConfigured: false }), profile, runtimeState: standing });
  assert.equal(unconfigured.actions.begin.enabled, false);
  assert.match(unconfigured.reason, /模型尚未配置/);
  const walking = presentRobotRecovery({ status: status(), profile, runtimeState: { posture: 'standing', speed: { linearMps: 0.4, lateralMps: 0, yawRps: 0, source: 'device' } } });
  assert.equal(walking.actions.enter, undefined);
  assert.equal(walking.actions.begin.enabled, false);
  assert.match(walking.reason, /行走中不可切换/);
  const ready = presentRobotRecovery({ status: status(), profile, runtimeState: standing });
  assert.equal(ready.actions.begin.enabled, true);
  assert.equal(ready.actions.begin.label, '摔倒恢复');
  assert.equal(ready.actions.cancel.enabled, false);
  assert.equal(ready.actions.exit.enabled, false);
  assert.deepEqual(Object.keys(ready.actions).sort(), ['begin', 'cancel', 'exit']);
});

test('fallen recovery does not require the operator to enable motors first', () => {
  for (const motorState of ['enabled', 'disabled', 'unknown']) {
    const view = presentRobotRecovery({
      status: status(), profile,
      runtimeState: { posture: 'sitting', motorState, speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } },
    });
    assert.equal(view.actions.begin.enabled, true, motorState);
    assert.equal(view.actions.begin.label, '摔倒恢复');
  }
});

test('an unverified enable sequence blocks the one tap and is not a separate operator action', () => {
  const gated = presentRobotRecovery({ status: status({ enableSequenceVerified: false }), profile, runtimeState: standing });
  assert.equal(gated.actions.begin.enabled, false);
  assert.equal(gated.actions.enable, undefined);
  assert.match(gated.reason, /使能顺序尚未核验/);
  assert.equal(ROBOT_RECOVERY_CONFIRMATION.includes('使能恢复'), false);
  assert.match(ROBOT_RECOVERY_CONFIRMATION, /摔倒恢复会让机器狗从倒地姿态起身/);
  assert.doesNotMatch(ROBOT_RECOVERY_CONFIRMATION, /趴下|躺下|退出并回到运动/);
});

test('cancel stays available during get-up and 运动模式 is only the stable-stand exit', () => {
  const rising = presentRobotRecovery({ status: status({ phase: 'getting-up', sessionSelected: true, heartbeatFresh: true }), profile, runtimeState: standing });
  assert.equal(rising.actions.cancel.enabled, true);
  assert.equal(rising.actions.cancel.label, '取消恢复');
  assert.equal(rising.actions.exit.enabled, false);
  assert.equal(rising.actions.begin.enabled, false);
  assert.match(rising.actions.exit.reason, /尚未稳定站立/);
  const stable = presentRobotRecovery({ status: status({ phase: 'stable-stand', sessionSelected: true, stableStand: true, locomotionAvailable: true, heartbeatFresh: true }), profile, runtimeState: standing });
  assert.equal(stable.actions.exit.enabled, true);
  assert.equal(stable.actions.exit.label, '运动模式');
  assert.equal(stable.actions.cancel.enabled, false);
  assert.match(stable.phaseLabel, /已稳定站立/);
  const labels = Object.values(stable.actions).map(item => `${item.label}${item.reason ?? ''}`).join('');
  assert.equal([...stable.title + labels].some(char => char.codePointAt(0) === 0x8DBA), false);
  assert.doesNotMatch(labels, /退出并回到运动|使能恢复|进入恢复|摔倒起立/);
});

test('one tap enters, enables only while the robot still requires it, then starts', async () => {
  const selected = status({ phase: 'selected', sessionSelected: true, heartbeatFresh: true });
  const enabled = status({ phase: 'enabled', sessionSelected: true, heartbeatFresh: true });
  const rising = status({ phase: 'getting-up', sessionSelected: true, heartbeatFresh: true });
  const calls = [];
  const started = await beginRobotRecovery(async command => {
    calls.push(command);
    if (command === 'enter') return selected;
    if (command === 'enable') return enabled;
    if (command === 'start') return rising;
    throw new Error(command);
  });
  assert.deepEqual(calls, ['enter', 'enable', 'start']);
  assert.equal(started.phase, 'getting-up');
  assert.equal(recoveryNeedsEnable(selected), true);
  assert.equal(recoveryNeedsEnable(enabled), false);

  const skipped = [];
  await beginRobotRecovery(async command => {
    skipped.push(command);
    if (command === 'enter') return enabled;
    if (command === 'start') return rising;
    throw new Error(command);
  });
  assert.deepEqual(skipped, ['enter', 'start']);

  const alreadyUp = [];
  await beginRobotRecovery(async command => {
    alreadyUp.push(command);
    return rising;
  });
  assert.deepEqual(alreadyUp, ['enter']);

  const refused = [];
  const held = await beginRobotRecovery(async command => {
    refused.push(command);
    return status({ phase: 'selected', sessionSelected: true, enableSequenceVerified: false, reason: 'enable-sequence-unverified' });
  });
  assert.deepEqual(refused, ['enter']);
  assert.equal(held.enableSequenceVerified, false);
});

test('app control wires recovery safely and the panel preserves fixed terminology', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/RobotRecoveryControls.tsx', import.meta.url), 'utf8');
  assert.match(app, /recovery=\{\{\s*status: brainstemControl\.recoveryStatus,\s*profile: brainstemControl\.state\.profile,\s*onCommand: brainstemControl\.recoveryCommand,\s*\}\}/);
  assert.doesNotMatch(panel, /进入恢复|使能恢复|摔倒起立|退出并回到运动|switchPolicy|SwitchProfile/);
  assert.equal([...panel].some(char => char.codePointAt(0) === 0x8DBA), false);
});
