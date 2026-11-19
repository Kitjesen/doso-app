import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobotModeFields, recoveryModeFromProfile } from '../src/features/control/robotModeCapabilities.ts';

const capability = { id: 'recovery', kind: 2, availability: 2, profileId: '', unavailableReason: '' };
test('old servers and unknown future kinds do not advertise recovery', () => {
  assert.deepEqual(parseRobotModeFields({}), {});
  assert.equal(recoveryModeFromProfile({}).status, 'unknown');
  assert.equal(recoveryModeFromProfile(parseRobotModeFields({ modeCapabilities: [{ ...capability, kind: 99 }] })).status, 'unknown');
});
test('recovery availability and selection are independent of locomotion profiles', () => {
  const fields = parseRobotModeFields({ modeCapabilities: [capability], activeModeId: 'recovery' });
  assert.deepEqual(recoveryModeFromProfile(fields), { status: 'available', selected: true });
  assert.deepEqual(recoveryModeFromProfile(null), { status: 'unknown', selected: false });
  assert.equal(recoveryModeFromProfile({ modeCapabilities: [{ ...capability, availability: 99 }] }).status, 'unavailable');
});
test('duplicate, malformed and oversized mode fields fail closed', () => {
  for (const raw of [null, [capability, capability], [{ ...capability, availability: '2' }], [{ ...capability, id: '' }], Array(17).fill(capability)]) {
    assert.throws(() => parseRobotModeFields({ modeCapabilities: raw }));
  }
  assert.throws(() => parseRobotModeFields({ activeModeId: 'bad\0' }));
});
