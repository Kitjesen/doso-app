import assert from 'node:assert/strict';
import test from 'node:test';

import { presentRobotRecovery, projectRobotRecoveryStatus, ROBOT_RECOVERY_CONFIRMATION } from '../src/features/control/robotRecovery.ts';

const capability = { id: 'recovery', kind: 'recovery-action', label: '摔倒恢复', available: true, unavailableReason: '' };
const profile = { current: 'flat', available: ['flat'], descriptions: [''], currentDescription: '', modeCapabilities: [capability], activeModeId: 'locomotion' };
const standing = { posture: 'standing', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };

function status(patch) {
  return { service: 'ready', phase: 'absent', sessionSelected: false, modelConfigured: true, enableSequenceVerified: true,
    stableStand: false, locomotionAvailable: false, activeModeId: null, reason: 'none', detail: '', heartbeatFresh: null, heartbeatError: null, ...patch };
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

test('enter stays closed while walking or when the service and model are not ready', () => {
  const missing = presentRobotRecovery({ status: { ...status(), service: 'missing' }, profile, runtimeState: standing });
  assert.equal(missing.actions.enter.enabled, false);
  assert.match(missing.reason, /尚未提供摔倒恢复/);
  const unconfigured = presentRobotRecovery({ status: status({ modelConfigured: false }), profile, runtimeState: standing });
  assert.equal(unconfigured.actions.enter.enabled, false);
  assert.match(unconfigured.reason, /模型尚未配置/);
  const walking = presentRobotRecovery({ status: status(), profile, runtimeState: { posture: 'standing', speed: { linearMps: 0.4, lateralMps: 0, yawRps: 0, source: 'device' } } });
  assert.equal(walking.actions.enter.enabled, false);
  assert.match(walking.reason, /行走中不可切换/);
  const ready = presentRobotRecovery({ status: status(), profile, runtimeState: standing });
  assert.equal(ready.actions.enter.enabled, true);
  assert.equal(ready.actions.enable.enabled, false);
  assert.equal(ready.actions.start.enabled, false);
});

test('enable stays gated until the sequence flag is true, and start requires confirmation copy', () => {
  const gated = presentRobotRecovery({ status: status({ phase: 'selected', sessionSelected: true, enableSequenceVerified: false }), profile, runtimeState: standing });
  assert.equal(gated.actions.enable.enabled, false);
  assert.match(gated.actions.enable.reason, /使能顺序尚未核验/);
  const armed = presentRobotRecovery({ status: status({ phase: 'enabled', sessionSelected: true, heartbeatFresh: true }), profile, runtimeState: standing });
  assert.equal(armed.actions.enable.enabled, true);
  assert.equal(armed.actions.start.enabled, true);
  assert.match(ROBOT_RECOVERY_CONFIRMATION.start, /摔倒起立/);
  assert.doesNotMatch(ROBOT_RECOVERY_CONFIRMATION.enable + ROBOT_RECOVERY_CONFIRMATION.start, /趴下|躺下/);
});

test('a stable stand can hand back to locomotion and does not invent a new posture command', () => {
  const stable = presentRobotRecovery({ status: status({ phase: 'stable-stand', sessionSelected: true, stableStand: true, locomotionAvailable: true, heartbeatFresh: true }), profile, runtimeState: standing });
  assert.equal(stable.actions.exit.enabled, true);
  assert.equal(stable.actions.cancel.enabled, false);
  assert.match(stable.phaseLabel, /已稳定站立/);
  const labels = Object.values(stable.actions).map(item => item.reason ?? '').join('');
  assert.equal([...stable.title + labels].some(char => char.codePointAt(0) === 0x8DBA), false);
});
