import test from 'node:test';
import assert from 'node:assert/strict';
import { beginG20Calibration, G20IntentGate, isG20Calibrated, learnG20Axis, learnG20Button,
  parseG20Sample, projectG20Input } from '../src/features/control/g20InputModel.ts';

function sample(changes = {}, extra = {}) {
  const channels = Array(16).fill(1500);
  for (const [channel, value] of Object.entries(changes)) channels[Number(channel)] = value;
  return { requestId: 'fixture', generation: 1, sequence: 1, receivedAtMonotonicMs: 1000, requestStartedAtMonotonicMs: 995,
    channels, channelSettings: channels.map((_, channelIndex) => ({ channelIndex, index: channelIndex + 1,
      mapping: channelIndex + 1, min: 1050, middle: 1500, max: 1950, reverse: false })),
    controlMode: 'USA', configurationReady: true, ...extra };
}
function calibrated() {
  let value = beginG20Calibration(sample());
  // Deliberately not the channel order assumed by a default G20 demo.
  value = learnG20Axis(value, 'leftX', sample({ 6: 1950 }));
  value = learnG20Axis(value, 'leftY', sample({ 2: 1050 }));
  value = learnG20Axis(value, 'rightX', sample({ 11: 1050 }));
  value = learnG20Axis(value, 'rightY', sample({ 4: 1950 }));
  return value;
}
test('bridge sample rejects malformed values, duplicate settings and missing configuration', () => {
  assert.ok(parseG20Sample(sample()));
  assert.equal(parseG20Sample(sample({ 0: NaN })), null);
  assert.equal(parseG20Sample(sample({}, { channels: Array(15).fill(1500) })), null);
  assert.equal(parseG20Sample(sample({}, { channelSettings: null })), null);
  const duplicate = sample(); duplicate.channelSettings[1].channelIndex = 0;
  assert.equal(parseG20Sample(duplicate), null);
  const reversed = sample(); reversed.channelSettings[0].min = 1951;
  assert.equal(parseG20Sample(reversed), null);
  assert.ok(parseG20Sample(sample({}, { channelSettings: null, controlMode: null, configurationReady: false })));
});
test('four axes are learned from actual changes and preserve measured direction', () => {
  const calibration = calibrated();
  assert.equal(isG20Calibrated(calibration), true);
  assert.equal(calibration.axes.leftX.channel, 6);
  assert.equal(calibration.axes.leftY.sign, 1);
  assert.equal(calibration.axes.rightX.sign, -1);
  assert.equal(calibration.axes.rightY.sign, -1);
  const frame = projectG20Input(calibration, sample({ 6: 1950, 11: 1050 }));
  assert.deepEqual(frame.vector, { leftX: 1, leftY: 0, rightX: 1, rightY: 0 });
  assert.equal(projectG20Input(calibration, sample()).neutral, true);
});
test('ambiguous movement, reused channels and off-center baselines cannot be learned', () => {
  let calibration = beginG20Calibration(sample());
  assert.throws(() => learnG20Axis(calibration, 'leftX', sample()), /只操作/);
  assert.throws(() => learnG20Axis(calibration, 'leftX', sample({ 0: 1950, 1: 1900 })), /只操作/);
  calibration = learnG20Axis(calibration, 'leftX', sample({ 0: 1950 }));
  assert.throws(() => learnG20Axis(calibration, 'rightX', sample({ 0: 1950 })), /其他操作/);
  const offCenter = beginG20Calibration(sample({ 0: 1050 }));
  assert.throws(() => learnG20Axis(offCenter, 'leftX', sample({ 0: 1950 })), /未回中/);
});
test('configuration, generation, range or mode changes invalidate previous mappings', () => {
  const calibration = calibrated();
  assert.throws(() => projectG20Input(calibration, sample({}, { generation: 2 })), /变化/);
  assert.throws(() => projectG20Input(calibration, sample({}, { controlMode: 'JAPAN' })), /变化/);
  assert.throws(() => projectG20Input(calibration, sample({ 0: 2000 })), /范围/);
  const changed = sample(); changed.channelSettings[0].reverse = true;
  assert.throws(() => projectG20Input(calibration, changed), /变化/);
});
test('axis deadzone and diagonal clamp limit actual generated intent', () => {
  const calibration = calibrated();
  assert.equal(projectG20Input(calibration, sample({ 6: 1540 })).vector.leftX, 0);
  const frame = projectG20Input(calibration, sample({ 6: 1950, 2: 1050 }));
  assert.ok(Math.abs(Math.hypot(frame.vector.leftX, frame.vector.leftY) - 1) < 1e-10);
});

test('the unused right vertical axis cannot reduce commanded turn speed', () => {
  const calibration = calibrated();
  const horizontal = projectG20Input(calibration, sample({ 11: 1050 }));
  const diagonal = projectG20Input(calibration, sample({ 11: 1050, 4: 1950 }));
  assert.equal(horizontal.vector.rightX, 1);
  assert.equal(diagonal.vector.rightX, horizontal.vector.rightX);
  assert.equal(diagonal.vector.rightY, -1);
});
test('learned button supports either polarity and rejects intermediate states', () => {
  const calibration = learnG20Button(calibrated(), 'stand', sample({ 5: 1050 }));
  assert.deepEqual(projectG20Input(calibration, sample({ 5: 1050 })).pressed, ['stand']);
  assert.deepEqual(projectG20Input(calibration, sample()).pressed, []);
  assert.throws(() => projectG20Input(calibration, sample({ 5: 1250 })), /按键状态/);
  assert.throws(() => learnG20Button(calibration, 'stop', sample({ 6: 1950 })), /其他操作/);
});
const frame = (pressed = [], moving = false) => ({ vector: { leftX: moving ? 1 : 0, leftY: 0, rightX: 0, rightY: 0 }, pressed, neutral: !moving && !pressed.length });
test('held-at-start motion, stale messages and replay cannot arm physical input', () => {
  const gate = new G20IntentGate(); gate.setEnabled(true, () => 0);
  assert.equal(gate.accept(sample(), frame([], true), true).send, false);
  assert.equal(gate.accept(sample({}, { sequence: 2 }), frame(), true).send, false);
  assert.equal(gate.accept(sample({}, { sequence: 3 }), frame([], true), true).send, true);
  assert.equal(gate.accept(sample({}, { sequence: 4 }), frame([], true), false).send, false);
  assert.equal(gate.accept(sample({}, { sequence: 5 }), frame([], true), true).send, false);
  assert.equal(gate.accept(sample({}, { sequence: 6 }), frame(), true).send, false);
  assert.equal(gate.accept(sample({}, { sequence: 6 }), frame([], true), true).send, false);
});
test('keys trigger once, require full release, and stop wins simultaneous keys', () => {
  const gate = new G20IntentGate(); gate.setEnabled(true, () => 0);
  gate.accept(sample(), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 2 }), frame(['stand']), true).action, 'stand');
  assert.equal(gate.accept(sample({}, { sequence: 3 }), frame(['stand']), true).action, null);
  gate.accept(sample({}, { sequence: 4 }), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 5 }), frame(['stand']), true).action, 'stand');
  gate.accept(sample({}, { sequence: 6 }), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 7 }), frame(['sit', 'stop']), true).action, 'stop');
});
test('permission loss and a new generation require neutral again', () => {
  const gate = new G20IntentGate(); gate.setEnabled(true, () => 0); gate.accept(sample(), frame(), true);
  gate.setEnabled(false);
  assert.equal(gate.accept(sample({}, { sequence: 2 }), frame(['stand']), true).action, null);
  gate.setEnabled(true, () => 0);
  assert.equal(gate.accept(sample({}, { sequence: 3 }), frame([], true), true).send, false);
  gate.accept(sample({}, { sequence: 4 }), frame(), true);
  assert.equal(gate.accept(sample({}, { generation: 2, sequence: 1 }), frame([], true), true).send, false);
});

test('stop stays reachable with another held control and does not repeat until released', () => {
  const gate = new G20IntentGate(); gate.setEnabled(true, () => 0); gate.accept(sample(), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 2 }), frame(['stand']), true).action, 'stand');
  assert.equal(gate.accept(sample({}, { sequence: 3 }), frame(['stand', 'stop'], true), true).action, 'stop');
  assert.equal(gate.accept(sample({}, { sequence: 4 }), frame(['stand', 'stop']), true).action, null);
  assert.equal(gate.accept(sample({}, { sequence: 5 }), frame(['stand']), true).action, null);
  assert.equal(gate.accept(sample({}, { sequence: 6 }), frame(['stand', 'stop']), true).action, 'stop');
});

test('ordinary actions require the current sticks to be neutral, while stop remains reachable', () => {
  for (const action of ['stand', 'sit', 'enableMotor', 'disableMotor', 'switchPolicy']) {
    const gate = new G20IntentGate(); gate.setEnabled(true, () => 0); gate.accept(sample(), frame(), true);
    assert.equal(gate.accept(sample({}, { sequence: 2 }), frame([action], true), true).action, null, action);
    assert.equal(gate.accept(sample({}, { sequence: 3 }), frame([action, 'stop'], true), true).action, 'stop');
  }
});

test('a neutral requested before or in the grant tick cannot arm a later movement', () => {
  for (const requestedAt of [1000, 1050]) {
    const gate = new G20IntentGate(); gate.setEnabled(true, () => 1050);
    gate.accept(sample({}, { sequence: 1, requestStartedAtMonotonicMs: requestedAt }), frame(), true);
    assert.equal(gate.accept(sample({}, { sequence: 2, requestStartedAtMonotonicMs: 1100 }), frame([], true), true).send, false,
      `pre-grant or same-tick neutral ${requestedAt} must not arm`);
    gate.accept(sample({}, { sequence: 3, requestStartedAtMonotonicMs: 1101 }), frame(), true);
    assert.equal(gate.accept(sample({}, { sequence: 4, requestStartedAtMonotonicMs: 1102 }), frame([], true), true).send, true);
  }
});

test('missing or invalid grant clock fails closed for motion but a fresh stop remains available', () => {
  for (const capture of [undefined, () => null, () => NaN, () => -1, () => 1.5, () => { throw Error('clock unavailable'); }]) {
    const gate = new G20IntentGate(); gate.setEnabled(true, capture);
    gate.accept(sample({}, { sequence: 1 }), frame(), true);
    assert.equal(gate.accept(sample({}, { sequence: 2 }), frame([], true), true).send, false);
    assert.equal(gate.accept(sample({}, { sequence: 3 }), frame(['stop'], true), true).action, 'stop');
  }
});

test('authority ABA captures a new fence and stale resets cannot discard it', () => {
  const gate = new G20IntentGate(); gate.setEnabled(true, () => 900);
  gate.accept(sample({}, { sequence: 1, requestStartedAtMonotonicMs: 950 }), frame(), true);
  gate.setEnabled(false); gate.setEnabled(true, () => 1050);
  gate.accept(sample({}, { sequence: 2, requestStartedAtMonotonicMs: 1000 }), frame(), true);
  gate.accept(sample({}, { sequence: 3, requestStartedAtMonotonicMs: 1100 }), frame([], true), false);
  gate.accept(sample({}, { sequence: 4, requestStartedAtMonotonicMs: 1001 }), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 5, requestStartedAtMonotonicMs: 1101 }), frame([], true), true).send, false);
  gate.accept(sample({}, { sequence: 6, requestStartedAtMonotonicMs: 1102 }), frame(), true);
  assert.equal(gate.accept(sample({}, { sequence: 7, requestStartedAtMonotonicMs: 1103 }), frame([], true), true).send, true);
});
